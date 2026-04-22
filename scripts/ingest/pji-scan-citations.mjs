// Template: scripts/ingest/pji-ingest.mjs
// Expert: brandon-garrett (Forensic Expert Evidence Database — pillar #2: case-law cross-reference as core value)
// Pattern: cl-bulk-data-defensive #17 (Albe session defenses) + #18 (COPY FROM STDIN, not per-row INSERT)
// csv-bulk-checked: none-exists — internal Supabase-table text scan, no external bulk source. Input is cl_opinion_bodies.plain_text already loaded via cl_bulk_loader.mjs.
// work-mem: Medium tier verified (work-mem-log.js CHECKED medium=4GB ceiling=256MB), using 128MB for the scan.
//
// T7: pji_instruction_citations population (Phase 1).
// Scans cl_opinion_bodies.plain_text for references to rows in
// pattern_jury_instructions. Phase 1 extracts ONLY DIRECT matches:
//   explicit "<Circuit> Circuit Pattern (Criminal) Instruction <num>" form → confidence 0.90
// NUMERIC_REF (bare number) is intentionally OMITTED from Phase 1 — spot-checking
// showed ~85% noise (state civil pattern instructions using same number scheme).
// Phase 2 (future session) can use trigram title-matching + opinion-to-circuit
// resolution to rescue numeric_ref with far lower false-positive rate.
//
// Exclusion filter: match is SKIPPED if context window contains civil-pattern
// or state-pattern markers (Wyo., Tenn., Civil Pattern, etc). See EXCLUDE_CONTEXT.
//
// Idempotent: runs ON CONFLICT (pji_id, cl_opinion_id) DO NOTHING; re-runs safe.
//
// Unblocks T22 (invalidation detection) + T56 (public-render filter).
// See docs/plans/2026-04-21-worry-pji-gaps.md — "Round-1 Pristine Closure Log".
// Phase 1 yield note: ~58 matches with 35%-loaded cl_opinion_bodies corpus.
// Phase 2 expected yield multiplies when cl_opinion_bodies reaches ≥90% text coverage.

import fs from 'node:fs';
import pg from 'pg';
import copyStreams from 'pg-copy-streams';
import { finished } from 'node:stream/promises';

// ---------- env loader (line-by-line, read-only) ----------
const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

// ---------- pg connection (session-mode port 5432 for long DECLARE-cursor-like ops) ----------
const url = new URL(process.env.SUPABASE_DB_URL);
url.port = '5432';
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });

// ---------- circuit ordinal lookup ----------
const CIRCUIT_WORDS = {
  1: ['First', '1st'],
  2: ['Second', '2nd', '2d'],
  3: ['Third', '3rd', '3d'],
  4: ['Fourth', '4th'],
  5: ['Fifth', '5th'],
  6: ['Sixth', '6th'],
  7: ['Seventh', '7th'],
  8: ['Eighth', '8th'],
  9: ['Ninth', '9th'],
  10: ['Tenth', '10th'],
  11: ['Eleventh', '11th'],
};
const WORD_TO_CIRCUIT = new Map();
for (const [num, words] of Object.entries(CIRCUIT_WORDS)) {
  for (const w of words) WORD_TO_CIRCUIT.set(w.toLowerCase(), +num);
}

// ---------- regexes ----------
// Instruction number: digits.digits (optionally .digits and optional A-Z suffix, supports 3-level like 10.3.08).
const INST_NUM = String.raw`\d{1,3}\.\d{1,4}(?:\.\d{1,4})?[A-Z]?`;

// All circuit-ordinal words, pipe-joined.
const CIRCUIT_ALT = Object.values(CIRCUIT_WORDS).flat().map((w) =>
  w.replace('.', '\\.')
).join('|');

// DIRECT: "<Circuit> Circuit Pattern Instruction <num>" — up to 80 chars between phrases.
// Allows "Ninth Circuit Pattern Jury Instruction No. 9.1", "10th Cir. Criminal Pattern Instruction 2.70", etc.
const REGEX_DIRECT = new RegExp(
  `\\b(${CIRCUIT_ALT})\\s+Cir(?:cuit|\\.)?(?:[^.\\n]{0,80}?)?(?:Pattern|Model|Criminal)(?:[^.\\n]{0,40}?)?Instruction(?:s)?(?:,?\\s+(?:Criminal|Civil))?(?:[\\s,]+No\\.?)?\\s+(${INST_NUM})`,
  'gi'
);

// Context-exclusion patterns — drop match if any of these appears in ±100-char
// window. Covers civil federal patterns + common state pattern instructions.
const EXCLUDE_CONTEXT = [
  /\bcivil\s+(?:pattern|jury|instruction)/i,
  /\bpattern\s+(?:jury\s+)?instructions?,\s+civil/i,
  /\bcivil,\s+no\./i,
  /\buniform\s+(?:pattern|jury|instruction)/i,
  /\b(?:wyo|tenn|md|fla|tex|ariz|ill|ky|mo|la|mass|mich|minn|miss|wash|va|ga|pa|okla|ore|wis|conn|colo|ala|neb|nev|kan|ind)\.\s+(?:pattern|criminal|civil|jury|standard|uniform|model)/i,
  /\b(?:wyoming|tennessee|maryland|florida|texas|arizona|illinois|kentucky|missouri|louisiana|massachusetts|michigan|minnesota|mississippi|washington|virginia|georgia|pennsylvania|oklahoma|oregon|wisconsin|connecticut|colorado|alabama|nebraska|nevada|kansas|indiana|ohio|new york|new jersey|north carolina|south carolina|california)\s+(?:pattern|standard|uniform|model)\s+(?:jury|criminal|civil)/i,
];

function isExcludedContext(ctx) {
  for (const rx of EXCLUDE_CONTEXT) {
    if (rx.test(ctx)) return true;
  }
  return false;
}

// NUMERIC_REF: bare "Pattern Jury Instruction <num>" — no circuit prefix.
// Allows multiple forms: "Pattern Jury Instruction 3.14", "Model Jury Instruction 2.05".
const REGEX_NUMERIC = new RegExp(
  `\\b(?:Pattern|Model)\\s+(?:Criminal\\s+|Civil\\s+)?(?:Jury\\s+)?Instruction(?:s)?(?:,\\s+(?:Criminal|Civil))?(?:\\s+No\\.?)?\\s+(${INST_NUM})`,
  'gi'
);

// ---------- main ----------
async function main() {
  await client.connect();
  // Albe defenses — every bulk script must set these (cl-bulk-data-defensive #17)
  await client.query(`SET statement_timeout = '30min'`);
  await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await client.query(`SET tcp_keepalives_idle = 60`);
  await client.query(`SET tcp_keepalives_interval = 10`);
  await client.query(`SET tcp_keepalives_count = 6`);
  await client.query(`SET work_mem = '128MB'`); // within Medium tier 256MB ceiling

  // Ensure target table exists (idempotent; matches migration 20260421202033_pji_instruction_citations.sql)
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.pji_instruction_citations (
      pji_id bigint NOT NULL REFERENCES public.pattern_jury_instructions(id) ON DELETE CASCADE,
      cl_opinion_id bigint NOT NULL,
      citation_context text,
      match_type text NOT NULL CHECK (match_type IN ('direct', 'numeric_ref', 'phrase', 'overruled')),
      confidence real NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
      extracted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (pji_id, cl_opinion_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pji_citations_cl_opinion_id
      ON public.pji_instruction_citations (cl_opinion_id);
    CREATE INDEX IF NOT EXISTS idx_pji_citations_pji_id
      ON public.pji_instruction_citations (pji_id);
    CREATE INDEX IF NOT EXISTS idx_pji_citations_match_type
      ON public.pji_instruction_citations (match_type);
  `);

  // ---------- load PJI rows ----------
  console.log('[1/5] loading pattern_jury_instructions rows...');
  const pji = await client.query(`
    SELECT id, circuit, instruction_number, title
    FROM pattern_jury_instructions
    WHERE instruction_number IS NOT NULL
  `);
  console.log(`  loaded ${pji.rows.length} PJI rows`);

  // Index by (circuit, instruction_number) → pji_id (for DIRECT matches)
  const byCircuitNum = new Map();
  // Index by instruction_number → [pji_id array] (for NUMERIC_REF fuzzy matches)
  const byNum = new Map();
  for (const r of pji.rows) {
    const key = `${r.circuit}|${r.instruction_number}`;
    byCircuitNum.set(key, r.id);
    if (!byNum.has(r.instruction_number)) byNum.set(r.instruction_number, []);
    byNum.get(r.instruction_number).push({ id: r.id, circuit: r.circuit });
  }

  // ---------- query candidate opinions ----------
  console.log('[2/5] querying candidate opinions (ILIKE filter)...');
  const t0 = Date.now();
  const candidates = await client.query(`
    SELECT opinion_id, plain_text
    FROM cl_opinion_bodies
    WHERE plain_text IS NOT NULL
      AND length(plain_text) > 500
      AND (
        plain_text ILIKE '%pattern jury instruction%'
        OR plain_text ILIKE '%pattern criminal jury%'
        OR plain_text ILIKE '%model jury instruction%'
        OR plain_text ILIKE '%Cir. Pattern%'
        OR plain_text ILIKE '%Circuit Pattern%'
        OR plain_text ILIKE '%pattern instruction%'
      )
  `);
  console.log(`  ${candidates.rows.length} candidate opinions (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // ---------- Node-side regex scan ----------
  console.log('[3/5] scanning for citations...');
  // Map key `pji_id|opinion_id` → best match record
  const matches = new Map();
  let directN = 0;

  for (const row of candidates.rows) {
    const text = row.plain_text;
    const opId = row.opinion_id;

    // ---------- PHASE 1 ONLY: DIRECT (explicit circuit + number) ----------
    // NUMERIC_REF intentionally dropped — state/civil patterns share numbering.
    REGEX_DIRECT.lastIndex = 0;
    let m;
    while ((m = REGEX_DIRECT.exec(text)) !== null) {
      const circuit = WORD_TO_CIRCUIT.get(m[1].toLowerCase());
      const num = m[2];
      if (!circuit) continue;
      const pjiId = byCircuitNum.get(`${circuit}|${num}`);
      if (!pjiId) continue;
      const start = Math.max(0, m.index - 100);
      const end = Math.min(text.length, m.index + m[0].length + 100);
      const ctx = text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 500);
      // Exclusion filter: skip if context signals civil / state pattern instructions.
      if (isExcludedContext(ctx)) continue;
      const key = `${pjiId}|${opId}`;
      const existing = matches.get(key);
      // "Criminal" qualifier boost → 0.95; otherwise 0.85.
      const criminalBoost = /\bcriminal\b/i.test(ctx);
      const conf = criminalBoost ? 0.95 : 0.85;
      if (!existing || existing.confidence < conf) {
        matches.set(key, {
          pji_id: pjiId,
          cl_opinion_id: opId,
          citation_context: ctx,
          match_type: 'direct',
          confidence: conf,
        });
        if (!existing) directN++;
      }
    }

    // PHASE 2 (NUMERIC_REF on bare number) intentionally omitted — see header.
  }

  console.log(`  extracted ${matches.size} unique (pji, opinion) pairs`);
  console.log(`    direct=${directN}`);

  if (matches.size === 0) {
    console.log('  no matches — nothing to insert. Exiting.');
    await client.end();
    return;
  }

  // ---------- bulk insert via COPY FROM STDIN into TEMP staging, then upsert ----------
  // Using CREATE TEMP TABLE (not UNLOGGED + pg_temp schema — PG rejects that combo).
  // Temp tables auto-drop at session end.
  console.log('[4/5] bulk loading into pji_instruction_citations via COPY FROM STDIN...');
  await client.query(`DROP TABLE IF EXISTS _pji_cite_staging`);
  await client.query(`
    CREATE TEMP TABLE _pji_cite_staging (
      pji_id bigint,
      cl_opinion_id bigint,
      citation_context text,
      match_type text,
      confidence real
    ) ON COMMIT PRESERVE ROWS
  `);

  const copyStream = client.query(
    copyStreams.from(
      `COPY _pji_cite_staging (pji_id, cl_opinion_id, citation_context, match_type, confidence) FROM STDIN WITH (FORMAT csv)`
    )
  );

  const csvEscape = (s) => {
    if (s == null) return '';
    const str = String(s);
    if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };

  for (const m of matches.values()) {
    const line =
      [m.pji_id, m.cl_opinion_id, csvEscape(m.citation_context), m.match_type, m.confidence].join(',') + '\n';
    if (!copyStream.write(line)) {
      await new Promise((res) => copyStream.once('drain', res));
    }
  }
  copyStream.end();
  await finished(copyStream);

  const stagingCount = await client.query(`SELECT count(*) AS n FROM _pji_cite_staging`);
  console.log(`  staging rows: ${stagingCount.rows[0].n}`);

  console.log('[5/5] merging into pji_instruction_citations (ON CONFLICT DO NOTHING)...');
  const mergeResult = await client.query(`
    INSERT INTO public.pji_instruction_citations
      (pji_id, cl_opinion_id, citation_context, match_type, confidence)
    SELECT pji_id, cl_opinion_id, citation_context, match_type, confidence
    FROM _pji_cite_staging
    ON CONFLICT (pji_id, cl_opinion_id) DO NOTHING
    RETURNING 1
  `);
  console.log(`  inserted ${mergeResult.rowCount} new citation rows`);

  // Final stats
  const finalCount = await client.query(`
    SELECT
      count(*) AS total,
      count(DISTINCT pji_id) AS distinct_pjis,
      count(DISTINCT cl_opinion_id) AS distinct_opinions,
      count(*) FILTER (WHERE match_type='direct') AS direct,
      count(*) FILTER (WHERE match_type='numeric_ref') AS numeric_ref
    FROM public.pji_instruction_citations
  `);
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(finalCount.rows[0], null, 2));

  await client.end();
  try { /* drop staging if not auto-dropped via pg_temp */ } catch {}
}

try {
  await main();
} catch (e) {
  console.error('SCAN FAILED:', e);
  try { await client.end(); } catch {}
  process.exit(1);
}
