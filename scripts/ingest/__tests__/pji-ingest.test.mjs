// Template: scripts/ingest/pji-ingest.mjs (target under test)
// Expert: shreya-shankar (data-pipeline validation)
// Pattern: cl-bulk-data-defensive #17 — golden-master + assertion rigor
// csv-bulk-checked: none-exists — self-contained test
// work-mem: Medium tier verified — read-only queries
//
// Ingest regression test (T47). Runs against the LIVE `pattern_jury_instructions`
// table. Asserts row-count baselines per circuit + structural invariants.
// Fails loudly if a regression shrinks any circuit below its current baseline.
//
// Usage: node scripts/ingest/__tests__/pji-ingest.test.mjs
// Exit 0 = all pass. Exit 1 = at least one assertion failed.
//
// Baselines snapshotted 2026-04-21 post-swarm-close. Update ONLY after verifying
// any delta is intentional (e.g., 11th Circuit ingest adds rows).
import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = line.slice(eq + 1);
}

const BASELINES = {
  total: { min: 990, max: 1200 },
  per_circuit: {
    1: { min: 70, max: 100 },
    6: { min: 150, max: 200 },
    7: { min: 65, max: 100 },
    8: { min: 148, max: 200 },
    9: { min: 400, max: 500 },
    10: { min: 150, max: 200 },
  },
  roundtrip_min_ratio: 0.96,   // 96.4% current
  sha_min_ratio: 0.998,         // 99.8% current
  anchor_min_ratio: 0.98,       // 98.4% current
  body_sha_min_ratio: 1.0,      // 100% after T47
  source_url_ratio: 1.0,        // NOT NULL enforced
};

let passCount = 0;
let failCount = 0;
function assert(label, ok, detail) {
  if (ok) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

const { Client } = pg;
const u = new URL(process.env.SUPABASE_DB_URL);
u.port = '5432';
const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
await c.connect();
try {
  await c.query(`SET statement_timeout = '2min'`);

  // Test 1: total row count within baseline
  console.log('Total row count:');
  const { rows: tot } = await c.query(`SELECT count(*)::int AS n FROM pattern_jury_instructions`);
  const total = tot[0].n;
  assert(
    `total rows in [${BASELINES.total.min}, ${BASELINES.total.max}]`,
    total >= BASELINES.total.min && total <= BASELINES.total.max,
    `got ${total}`
  );

  // Test 2: per-circuit baselines
  console.log('Per-circuit row counts:');
  const { rows: dist } = await c.query(`
    SELECT circuit, count(*)::int AS n FROM pattern_jury_instructions GROUP BY circuit
  `);
  for (const [cirStr, bl] of Object.entries(BASELINES.per_circuit)) {
    const cir = Number(cirStr);
    const row = dist.find(d => d.circuit === cir);
    const n = row ? row.n : 0;
    assert(
      `circuit ${cir} in [${bl.min}, ${bl.max}]`,
      n >= bl.min && n <= bl.max,
      `got ${n}`
    );
  }

  // Test 3: structural — every row has non-null body, source_url, circuit in 1..13
  console.log('Structural invariants:');
  const { rows: struct } = await c.query(`
    SELECT
      count(*) FILTER (WHERE body IS NULL OR length(body) < 80)::int AS bad_body,
      count(*) FILTER (WHERE source_url IS NULL OR source_url = '')::int AS bad_url,
      count(*) FILTER (WHERE circuit NOT BETWEEN 1 AND 13)::int AS bad_circuit,
      count(*) FILTER (WHERE instruction_number IS NULL OR instruction_number = '')::int AS bad_num
    FROM pattern_jury_instructions
  `);
  assert('all rows have body >= 80 chars', struct[0].bad_body === 0, `${struct[0].bad_body} bad`);
  assert('all rows have non-null source_url', struct[0].bad_url === 0, `${struct[0].bad_url} bad`);
  assert('all rows have circuit in 1..13', struct[0].bad_circuit === 0, `${struct[0].bad_circuit} bad`);
  assert('all rows have instruction_number', struct[0].bad_num === 0, `${struct[0].bad_num} bad`);

  // Test 4: coverage ratios
  console.log('Coverage ratios:');
  const { rows: cov } = await c.query(`
    SELECT
      count(*) FILTER (WHERE roundtrip_verified = true)::float / count(*)::float AS rtv,
      count(*) FILTER (WHERE source_pdf_sha256 IS NOT NULL)::float / count(*)::float AS sha,
      count(*) FILTER (WHERE source_url LIKE '%#page=%')::float / count(*)::float AS anchor,
      count(*) FILTER (WHERE body_sha256 IS NOT NULL)::float / count(*)::float AS body_sha,
      count(*) FILTER (WHERE source_url IS NOT NULL)::float / count(*)::float AS url_ratio
    FROM pattern_jury_instructions
  `);
  const r = cov[0];
  assert(`roundtrip_verified >= ${BASELINES.roundtrip_min_ratio}`, r.rtv >= BASELINES.roundtrip_min_ratio, `got ${r.rtv.toFixed(3)}`);
  assert(`source_pdf_sha256 >= ${BASELINES.sha_min_ratio}`, r.sha + 0.0005 >= BASELINES.sha_min_ratio, `got ${r.sha.toFixed(4)}`);
  assert(`page anchor >= ${BASELINES.anchor_min_ratio}`, r.anchor >= BASELINES.anchor_min_ratio, `got ${r.anchor.toFixed(3)}`);
  assert(`body_sha256 >= ${BASELINES.body_sha_min_ratio}`, r.body_sha >= BASELINES.body_sha_min_ratio, `got ${r.body_sha.toFixed(3)}`);
  assert(`source_url = ${BASELINES.source_url_ratio}`, r.url_ratio === BASELINES.source_url_ratio, `got ${r.url_ratio}`);

  // Test 5: instruction_number format per circuit
  console.log('Instruction number format:');
  const { rows: fmt } = await c.query(`
    SELECT count(*)::int AS bad
      FROM pattern_jury_instructions
     WHERE NOT (
       (circuit IN (1,5,6,7,8,9,10) AND instruction_number ~ '^[0-9]+\\.[0-9]+[A-Z]?(\\.[0-9]+)?$')
       OR (circuit = 11 AND instruction_number ~ '^[OBSTP][0-9]+(\\.[0-9]+[A-Z]?)?$')
     )
  `);
  assert('all instruction_numbers match expected format', fmt[0].bad === 0, `${fmt[0].bad} bad`);

  // Test 6: no duplicate (circuit, instruction_number, effective_date)
  console.log('Unique constraint sanity:');
  const { rows: dup } = await c.query(`
    SELECT count(*)::int AS n FROM (
      SELECT circuit, instruction_number, effective_date, count(*) AS c
        FROM pattern_jury_instructions
       GROUP BY 1, 2, 3 HAVING count(*) > 1
    ) d
  `);
  assert('no duplicate (circuit, instruction_number, effective_date)', dup[0].n === 0, `${dup[0].n} dupes`);

  // Test 7: v_pji_public matches expected safe-public row count
  console.log('v_pji_public safety:');
  const { rows: viewCount } = await c.query(`SELECT count(*)::int AS n FROM v_pji_public`);
  const { rows: expectedCount } = await c.query(`
    SELECT count(*)::int AS n FROM pattern_jury_instructions
     WHERE roundtrip_verified = true AND invalidated_by_opinion_id IS NULL
  `);
  assert(
    'v_pji_public row count matches safe-public predicate on base table',
    viewCount[0].n === expectedCount[0].n,
    `view=${viewCount[0].n} expected=${expectedCount[0].n}`
  );

  // Test 8: v_pji_public does NOT expose PII/internal columns
  console.log('v_pji_public column exposure:');
  const { rows: viewCols } = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'v_pji_public'
  `);
  const exposed = viewCols.map(r => r.column_name);
  const forbidden = ['reviewer_bar_id', 'review_notes', 'last_reviewed_by_attorney', 'invalidated_by_opinion_id', 'invalidation_summary'];
  for (const f of forbidden) {
    assert(`v_pji_public does NOT expose ${f}`, !exposed.includes(f), `leaked`);
  }

  console.log(`\n=== RESULT ===`);
  console.log(`passed: ${passCount} | failed: ${failCount}`);
  if (failCount > 0) process.exit(1);
} finally {
  try { await c.end(); } catch {}
}
