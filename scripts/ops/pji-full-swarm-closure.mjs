// Template: scripts/ops/pji-quick-wins.mjs
// Expert: laurenz-albe + brandon-garrett + shreya-shankar
// Pattern: cl-bulk-data-defensive #17 + pristine-or-nothing
// csv-bulk-checked: none-exists — schema migration + enrichment closure
// work-mem: Medium tier verified — fast DDL + small UPDATEs
//
// FULL SWARM-CLOSURE PASS — addresses all remaining findings from 3 reviewers.
// Scope:
//   T21 — attorney-review columns
//   T22 — invalidation columns
//   T48 stub — per-field validation columns
//   T47 — row-level body_sha256 population
//   T50 — SHA algorithm lock column (CHECK sha256)
//   T53 — pji_cron_runs schema populated for HTTP metadata
//   T10 — revision columns (superseded_by_id, prior_version_ids, revision_summary)
//   T13 — elements_plain_english + unverified_reason columns
//   T14 plain-English — column added (population deferred to T43 session with LLM)
//   Plus body_sha256 backfill for all 999 rows (from cached txt via fingerprint)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = line.slice(eq + 1);
}

function collapseWs(s) { return s.split(/\s+/).filter(Boolean).join(' '); }

const { Client } = pg;
const u = new URL(process.env.SUPABASE_DB_URL);
u.port = '5432';
const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
await c.connect();
try {
  await c.query(`SET statement_timeout = '10min'`);
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);

  console.log('=== STEP 1 — Schema migration (attorney-review + invalidation + revision + plain-English + validation) ===');
  await c.query(`
    ALTER TABLE pattern_jury_instructions
      ADD COLUMN IF NOT EXISTS last_reviewed_by_attorney TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS reviewer_bar_id TEXT,
      ADD COLUMN IF NOT EXISTS invalidated_by_opinion_id BIGINT,
      ADD COLUMN IF NOT EXISTS invalidation_date DATE,
      ADD COLUMN IF NOT EXISTS invalidation_summary TEXT,
      ADD COLUMN IF NOT EXISTS superseded_by_id BIGINT REFERENCES pattern_jury_instructions(id),
      ADD COLUMN IF NOT EXISTS prior_version_ids BIGINT[],
      ADD COLUMN IF NOT EXISTS revision_summary TEXT,
      ADD COLUMN IF NOT EXISTS elements_plain_english JSONB,
      ADD COLUMN IF NOT EXISTS body_sha256 TEXT,
      ADD COLUMN IF NOT EXISTS unverified_reason TEXT,
      ADD COLUMN IF NOT EXISTS source_pdf_sha_algorithm TEXT DEFAULT 'sha256' NOT NULL,
      ADD COLUMN IF NOT EXISTS http_status_at_fetch SMALLINT,
      ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS challenge_history JSONB
  `);
  // Algorithm lock
  await c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'pji_sha_algo_check' AND table_name = 'pattern_jury_instructions'
      ) THEN
        ALTER TABLE pattern_jury_instructions
          ADD CONSTRAINT pji_sha_algo_check CHECK (source_pdf_sha_algorithm = 'sha256');
      END IF;
    END $$;
  `);
  console.log('  schema migration applied');

  // Index for invalidation-filter (public page query perf)
  await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_invalidated ON pattern_jury_instructions (invalidated_by_opinion_id) WHERE invalidated_by_opinion_id IS NOT NULL`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_verified_public ON pattern_jury_instructions (circuit, instruction_number) WHERE roundtrip_verified = true AND invalidated_by_opinion_id IS NULL`);

  console.log('\n=== STEP 2 — pji_cron_runs upgraded schema ===');
  // Verify existing shape or create
  const { rows: cronCols } = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'pji_cron_runs'
  `);
  if (cronCols.length === 0) {
    await c.query(`
      CREATE TABLE pji_cron_runs (
        id BIGSERIAL PRIMARY KEY,
        ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        circuit SMALLINT NOT NULL,
        url TEXT NOT NULL,
        http_status SMALLINT,
        content_length BIGINT,
        sha256 TEXT,
        drifted BOOLEAN,
        error_message TEXT
      )
    `);
    console.log('  created pji_cron_runs');
  } else {
    await c.query(`
      ALTER TABLE pji_cron_runs
        ADD COLUMN IF NOT EXISTS http_status SMALLINT,
        ADD COLUMN IF NOT EXISTS content_length BIGINT,
        ADD COLUMN IF NOT EXISTS sha256 TEXT,
        ADD COLUMN IF NOT EXISTS drifted BOOLEAN,
        ADD COLUMN IF NOT EXISTS error_message TEXT,
        ADD COLUMN IF NOT EXISTS url TEXT
    `);
    console.log('  pji_cron_runs already exists — columns aligned');
  }
  await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_cron_runs_ran_at ON pji_cron_runs (ran_at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_cron_runs_circuit ON pji_cron_runs (circuit, ran_at DESC)`);

  console.log('\n=== STEP 3 — Per-field validation tracking schema (T48 stub) ===');
  await c.query(`
    CREATE TABLE IF NOT EXISTS pji_field_validation (
      id BIGSERIAL PRIMARY KEY,
      pji_id BIGINT REFERENCES pattern_jury_instructions(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      sample_run_id TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'partial', 'unknown')),
      reasoning TEXT,
      judged_by TEXT NOT NULL,
      judged_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_field_val_pji_id ON pji_field_validation (pji_id)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_pji_field_val_field ON pji_field_validation (field_name, verdict)`);
  console.log('  pji_field_validation table created');

  console.log('\n=== STEP 4 — body_sha256 backfill (T47) ===');
  const { rows: rows } = await c.query(
    `SELECT id, body, commentary FROM pattern_jury_instructions WHERE body_sha256 IS NULL`
  );
  console.log(`  ${rows.length} rows need body_sha256`);
  for (const r of rows) {
    const full = (r.body || '') + (r.commentary || '');
    const sha = crypto.createHash('sha256').update(full).digest('hex');
    await c.query(`UPDATE pattern_jury_instructions SET body_sha256 = $1 WHERE id = $2`, [sha, r.id]);
  }
  console.log(`  backfilled body_sha256 on ${rows.length} rows`);

  console.log('\n=== STEP 5 — unverified_reason backfill for 36 unverified rows ===');
  // Mark all currently-unverified rows with a placeholder reason so public-page filter can audit.
  const { rowCount: unvMarked } = await c.query(`
    UPDATE pattern_jury_instructions
       SET unverified_reason = 'fingerprint match failed during initial round-trip; diagnostic pending (T28 backfill)'
     WHERE roundtrip_verified = false AND unverified_reason IS NULL
  `);
  console.log(`  marked ${unvMarked} unverified rows with placeholder reason`);

  console.log('\n=== STEP 6 — Create v_pji_public view (T49 defense-in-depth) ===');
  // Omits PII + internal analytics columns from any public read path.
  await c.query(`DROP VIEW IF EXISTS v_pji_public CASCADE`);
  await c.query(`
    CREATE VIEW v_pji_public AS
    SELECT
      id, circuit, instruction_number, title, body, commentary, elements,
      elements_plain_english, statute_citations, source_url, effective_date,
      roundtrip_verified, body_sha256, source_pdf_sha256,
      created_at, updated_at, enriched_at
    FROM pattern_jury_instructions
    WHERE roundtrip_verified = true
      AND invalidated_by_opinion_id IS NULL
  `);
  console.log('  v_pji_public view created (omits PII + invalidated rows)');

  console.log('\n=== STEP 7 — Verify coverage ===');
  const { rows: cov } = await c.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE body_sha256 IS NOT NULL)::int AS with_body_sha,
      count(*) FILTER (WHERE unverified_reason IS NOT NULL)::int AS with_unv_reason,
      count(*) FILTER (WHERE source_pdf_sha_algorithm = 'sha256')::int AS with_sha_algo,
      count(*) FILTER (WHERE roundtrip_verified = true AND invalidated_by_opinion_id IS NULL)::int AS public_safe
    FROM pattern_jury_instructions
  `);
  console.log(JSON.stringify(cov[0], null, 2));

  const { rows: viewCount } = await c.query(`SELECT count(*)::int AS n FROM v_pji_public`);
  console.log(`v_pji_public row count: ${viewCount[0].n}`);
} finally {
  try { await c.end(); } catch {}
}
