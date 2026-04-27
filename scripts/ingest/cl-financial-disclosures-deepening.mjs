// Template: scripts/cl-bulk-loader.mjs + scripts/cl-criminal-opinions-stream-load.mjs
// Expert: lukas-fittl (COPY-over-INSERT, per-table tuning)
// Pattern: cl-bulk-data-defensive #18 + #19
// csv-bulk-checked: https://storage.courtlistener.com/bulk-data/financial-disclosure-investments-2026-03-31.csv.bz2
//
// A2 — CL Financial Disclosures deepening. The main disclosures table (cl_financial_disclosures)
// is already loaded (26 MB). We add investments (~1.9M rows) which is where the product moat
// actually lives: "Judge Smith held $500K in Pfizer during the Purdue case" shows on every
// Judge Report Card + X-Ray as recusal signals. Per 2026-04-20 ROI ranking this is Combo A
// #2 — highest-moat fast win.
//
// Runs from Windows (Git Bash has bzcat). 36 MB bz2 -> bzcat -> csv-parse -> COPY.
// Previously routed through Fly VM but Phase 1 taught us that was over-engineering —
// for sub-GB loads the residential uplink + bzcat is plenty fast.

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const BZ2_URL = 'https://storage.courtlistener.com/bulk-data/financial-disclosure-investments-2026-03-31.csv.bz2';

const STAGE = 'cl_disclosure_investments_stage';
const FINAL = 'cl_disclosure_investments';

// CL Financial Disclosures investments CSV columns (confirmed from bulk schema)
const COLS = [
  'id', 'date_created', 'date_modified', 'page_number', 'description',
  'redacted', 'income_during_reporting_period_code', 'income_during_reporting_period_type',
  'gross_value_code', 'gross_value_method', 'transaction_during_reporting_period',
  'transaction_date_raw', 'transaction_date', 'transaction_value_code',
  'transaction_gain_code', 'transaction_partner', 'has_inferred_values',
  'financial_disclosure_id',
];

async function createStage(c) {
  await c.query(`DROP TABLE IF EXISTS ${STAGE}`);
  // All-TEXT staging — CL CSV has rows with values like "15/15" in numeric columns.
  // Cast to typed columns at promote-time via safe NULLIF + regex-validated casts.
  await c.query(`
    CREATE UNLOGGED TABLE ${STAGE} (
      id TEXT,
      date_created TEXT,
      date_modified TEXT,
      page_number TEXT,
      description TEXT,
      redacted TEXT,
      income_during_reporting_period_code TEXT,
      income_during_reporting_period_type TEXT,
      gross_value_code TEXT,
      gross_value_method TEXT,
      transaction_during_reporting_period TEXT,
      transaction_date_raw TEXT,
      transaction_date TEXT,
      transaction_value_code TEXT,
      transaction_gain_code TEXT,
      transaction_partner TEXT,
      has_inferred_values TEXT,
      financial_disclosure_id TEXT
    )
  `);
  console.log(`  created ${STAGE} UNLOGGED`);
}

function toBool(v) {
  if (v == null || v === '') return null;
  if (v === 'True' || v === 't' || v === 'true' || v === '1') return true;
  if (v === 'False' || v === 'f' || v === 'false' || v === '0') return false;
  return null;
}
function toInt(v) { if (!v) return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function toBig(v) { return v ? String(v).trim() : null; }

async function streamLoad(client) {
  console.log(`  streaming curl -> lbzip2 -> parse -> COPY`);
  const curl = spawn('curl', ['-sSL', '--retry', '5', '--retry-delay', '10', BZ2_URL]);
  // Prefer lbzip2 if available (Fly VM), else fall back to bzcat (Windows Git Bash).
  const bzTool = process.platform === 'linux' ? 'lbzip2' : 'bzcat';
  const bzArgs = process.platform === 'linux' ? ['-dc', '-n', '4'] : [];
  const lbz = spawn(bzTool, bzArgs);
  curl.stdout.pipe(lbz.stdin);

  curl.stderr.on('data', d => process.stderr.write(`curl: ${d}`));
  lbz.stderr.on('data', d => process.stderr.write(`lbzip2: ${d}`));

  const rl = readline.createInterface({ input: lbz.stdout, crlfDelay: Infinity });
  let header = null;
  let colIdx = {};
  const t0 = Date.now();
  let n = 0;

  async function* rows() {
    for await (const line of rl) {
      if (header == null) {
        header = line;
        const cols = parse(line, { columns: false })[0];
        cols.forEach((c, i) => (colIdx[c] = i));
        // Verify all COLS present
        for (const c of COLS) {
          if (colIdx[c] == null) throw new Error(`CSV header missing col: ${c}. Got: ${cols.join(',')}`);
        }
        continue;
      }
      let r;
      try {
        r = parse(line, { columns: false, relax_quotes: true, relax_column_count: true, escape: '\\' })[0];
      } catch (e) {
        continue; // skip malformed row
      }
      if (!r) continue;
      n++;
      // All-TEXT staging — emit raw field values, cast at promote time.
      yield [
        r[colIdx.id] || '',
        r[colIdx.date_created] || '',
        r[colIdx.date_modified] || '',
        r[colIdx.page_number] || '',
        r[colIdx.description] || '',
        r[colIdx.redacted] || '',
        r[colIdx.income_during_reporting_period_code] || '',
        r[colIdx.income_during_reporting_period_type] || '',
        r[colIdx.gross_value_code] || '',
        r[colIdx.gross_value_method] || '',
        r[colIdx.transaction_during_reporting_period] || '',
        r[colIdx.transaction_date_raw] || '',
        r[colIdx.transaction_date] || '',
        r[colIdx.transaction_value_code] || '',
        r[colIdx.transaction_gain_code] || '',
        r[colIdx.transaction_partner] || '',
        r[colIdx.has_inferred_values] || '',
        r[colIdx.financial_disclosure_id] || '',
      ];
      if (n % 100_000 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        console.log(`    rows=${n.toLocaleString()} rate=${Math.round(n/elapsed)}/s elapsed=${(elapsed/60).toFixed(1)}min`);
      }
    }
  }

  const res = await bulkCopyRows(client, STAGE, COLS, rows());
  console.log(`  COPY ${res.rowCount.toLocaleString()} rows in ${(res.durationMs/1000/60).toFixed(1)}min`);
  return res.rowCount;
}

async function promote(c) {
  console.log(`  promote ${STAGE} -> ${FINAL} (with safe casts)`);
  await c.query(`DROP TABLE IF EXISTS ${FINAL} CASCADE`);
  // Create typed final + INSERT from staging with NULLIF-guarded casts.
  await c.query(`
    CREATE TABLE ${FINAL} (
      id BIGINT PRIMARY KEY,
      date_created TIMESTAMPTZ,
      date_modified TIMESTAMPTZ,
      page_number INTEGER,
      description TEXT,
      redacted BOOLEAN,
      income_during_reporting_period_code TEXT,
      income_during_reporting_period_type TEXT,
      gross_value_code TEXT,
      gross_value_method TEXT,
      transaction_during_reporting_period TEXT,
      transaction_date_raw TEXT,
      transaction_date DATE,
      transaction_value_code TEXT,
      transaction_gain_code TEXT,
      transaction_partner TEXT,
      has_inferred_values BOOLEAN,
      financial_disclosure_id BIGINT
    )
  `);
  const promoteSql = `
    INSERT INTO ${FINAL}
    SELECT
      NULLIF(id, '')::BIGINT,
      NULLIF(date_created, '')::TIMESTAMPTZ,
      NULLIF(date_modified, '')::TIMESTAMPTZ,
      CASE WHEN page_number ~ '^-?[0-9]+$' THEN page_number::INTEGER ELSE NULL END,
      description,
      CASE WHEN lower(redacted) IN ('true','t','1') THEN true
           WHEN lower(redacted) IN ('false','f','0') THEN false ELSE NULL END,
      income_during_reporting_period_code,
      income_during_reporting_period_type,
      gross_value_code,
      gross_value_method,
      transaction_during_reporting_period,
      transaction_date_raw,
      CASE WHEN transaction_date ~ '^\\d{4}-\\d{2}-\\d{2}' THEN transaction_date::DATE ELSE NULL END,
      transaction_value_code,
      transaction_gain_code,
      transaction_partner,
      CASE WHEN lower(has_inferred_values) IN ('true','t','1') THEN true
           WHEN lower(has_inferred_values) IN ('false','f','0') THEN false ELSE NULL END,
      CASE WHEN financial_disclosure_id ~ '^-?[0-9]+$' THEN financial_disclosure_id::BIGINT ELSE NULL END
    FROM ${STAGE}
    WHERE id ~ '^-?[0-9]+$'
    ON CONFLICT (id) DO NOTHING
  `;
  const r = await c.query(promoteSql);
  console.log(`  promoted ${r.rowCount.toLocaleString()} rows to ${FINAL}`);
  await c.query(`DROP TABLE ${STAGE}`);

  console.log(`  build indexes (maintenance_work_mem=256MB Medium-safe)`);
  await c.query(`SET maintenance_work_mem = '256MB'`);
  await c.query(`SET max_parallel_maintenance_workers = 3`);

  const indexes = [
    `CREATE INDEX idx_cl_inv_disclosure ON ${FINAL} (financial_disclosure_id)`,
    `CREATE INDEX idx_cl_inv_description ON ${FINAL} USING gin(to_tsvector('english', coalesce(description, '')))`,
    `CREATE INDEX idx_cl_inv_value_code ON ${FINAL} (gross_value_code) WHERE gross_value_code IS NOT NULL`,
    `CREATE INDEX idx_cl_inv_txn_date ON ${FINAL} (transaction_date) WHERE transaction_date IS NOT NULL`,
  ];
  for (const sql of indexes) {
    const t0 = Date.now();
    await c.query(sql);
    const name = sql.match(/idx_\w+/)[0];
    console.log(`    ${name} ${((Date.now()-t0)/1000).toFixed(1)}s`);
  }
  await c.query(`ANALYZE ${FINAL}`);
}

const { client, cleanup } = await createBulkClient({
  workMemMB: 256, maintWorkMemMB: 512, statementTimeout: '2h',
});

try {
  console.log(`=== A2 cl-financial-disclosures-deepening ${new Date().toISOString()} ===`);
  await createStage(client);
  const n = await streamLoad(client);
  if (n < 500_000) {
    console.error(`WARN: only ${n} rows streamed — expected ~1.9M. Aborting promote.`);
    process.exit(2);
  }
  await promote(client);

  const { rows } = await client.query(`SELECT count(*)::bigint AS c, pg_size_pretty(pg_total_relation_size('${FINAL}')) AS sz FROM ${FINAL}`);
  console.log(`\n  ${FINAL}: ${Number(rows[0].c).toLocaleString()} rows, ${rows[0].sz}`);
} finally { await cleanup(); }
