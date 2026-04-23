// Template: scripts/ingest/pji-scan-citations.mjs
// Expert: brandon-garrett (Forensic Expert Evidence Database — pillar #4: invalidation tracking as core legal-safety feature)
// Pattern: cl-bulk-data-defensive #17 (Albe session defenses)
// csv-bulk-checked: none-exists — internal Supabase-table join, no external bulk source
// work-mem: Medium tier verified (work-mem-log.js CHECKED medium=4GB ceiling=256MB)
//
// T22 + T56: PJI invalidation scan.
// For each (pji_id, cl_opinion_id) in pji_instruction_citations, checks the
// citation_context + full opinion body for invalidation language (overruled,
// superseded, abrogated, no longer good law, disapproved). When found,
// populates pattern_jury_instructions.invalidated_by_opinion_id + date + summary.
// v_pji_public view + public pages already filter on invalidated_by_opinion_id IS NULL,
// so populating the column immediately retires the invalid row from public rendering.
//
// Output: logs per-invalidation update + a confirm query that counts rows
// still in v_pji_public (must drop exactly by the number invalidated here).
//
// Idempotent: updates existing rows via UPDATE; re-runs safe.

import fs from 'node:fs';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

const url = new URL(process.env.SUPABASE_DB_URL);
url.port = '5432';
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });

// Invalidation language — phrases that signal an instruction is overruled / superseded / abrogated.
// Require proximity (within 200 chars) to the instruction reference — already true of citation_context.
const INVALIDATION_RX = /\b(overruled|superseded|abrogated|no longer good law|disapproved|repudiated|overturned|withdrawn|rejected)\b/i;

async function main() {
  await client.connect();
  await client.query(`SET statement_timeout = '10min'`);
  await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await client.query(`SET tcp_keepalives_idle = 60`);
  await client.query(`SET tcp_keepalives_interval = 10`);
  await client.query(`SET tcp_keepalives_count = 6`);

  console.log('[1/4] pre-scan baseline — v_pji_public row count');
  const before = await client.query(`SELECT count(*) AS n FROM v_pji_public`);
  console.log(`  v_pji_public baseline: ${before.rows[0].n} rows`);

  console.log('\n[2/4] scanning pji_instruction_citations for invalidation language...');
  // Pull all citations + widen context by re-fetching a larger window from cl_opinion_bodies.
  // Join to cl_opinion_bodies for the full plain_text + cl_opinion_clusters for date_filed.
  const scanned = await client.query(`
    SELECT
      pic.pji_id,
      pic.cl_opinion_id,
      pic.citation_context,
      ob.plain_text,
      cc.date_filed,
      cc.case_name
    FROM pji_instruction_citations pic
    JOIN cl_opinion_bodies ob ON ob.opinion_id = pic.cl_opinion_id
    LEFT JOIN cl_opinion_clusters cc ON cc.id = ob.cluster_id
  `);
  console.log(`  scanning ${scanned.rows.length} (pji_id, opinion_id) pairs`);

  // Collect invalidation candidates per pji_id; keep the NEWEST opinion's signal.
  // Map: pji_id → { cl_opinion_id, date, summary, case_name }
  const invalidations = new Map();
  let hits = 0;
  for (const row of scanned.rows) {
    // Check citation_context first (cheap); if not there, widen to full opinion body
    // within ±500 chars of the first instruction-number mention.
    let matchedText = null;
    const ctxMatch = row.citation_context && row.citation_context.match(INVALIDATION_RX);
    if (ctxMatch) {
      matchedText = row.citation_context;
    } else if (row.plain_text) {
      // Only scan within ±500 chars of citation_context location in the body
      const needle = row.citation_context ? row.citation_context.slice(0, 60) : null;
      if (needle) {
        const idx = row.plain_text.indexOf(needle);
        if (idx >= 0) {
          const start = Math.max(0, idx - 400);
          const end = Math.min(row.plain_text.length, idx + needle.length + 400);
          const widened = row.plain_text.slice(start, end);
          const m = widened.match(INVALIDATION_RX);
          if (m) matchedText = widened;
        }
      }
    }
    if (!matchedText) continue;
    hits++;
    // Extract the sentence containing the invalidation phrase
    const m = matchedText.match(INVALIDATION_RX);
    const mIdx = matchedText.indexOf(m[0]);
    const sentenceStart = Math.max(0, matchedText.lastIndexOf('. ', mIdx) + 2);
    const sentenceEnd = (() => {
      const next = matchedText.indexOf('. ', mIdx + m[0].length);
      return next < 0 ? Math.min(matchedText.length, mIdx + 200) : next + 1;
    })();
    const summary = matchedText.slice(sentenceStart, sentenceEnd).replace(/\s+/g, ' ').trim().slice(0, 500);

    const existing = invalidations.get(row.pji_id);
    const candidateDate = row.date_filed ? new Date(row.date_filed) : null;
    const existingDate = existing?.date ? new Date(existing.date) : null;
    if (!existing || (candidateDate && (!existingDate || candidateDate > existingDate))) {
      invalidations.set(row.pji_id, {
        cl_opinion_id: row.cl_opinion_id,
        date: row.date_filed || null,
        summary,
        case_name: row.case_name || null,
      });
    }
  }
  console.log(`  matched ${hits} rows across ${invalidations.size} distinct PJIs`);

  if (invalidations.size === 0) {
    console.log('\n[3/4] no invalidations found. T22 column stays NULL.');
    console.log('\n[4/4] v_pji_public unchanged.');
    await client.end();
    return;
  }

  // Also upsert a match_type=overruled row into pji_instruction_citations
  // for each invalidation, so there's a durable record tagged invalidation.
  console.log('\n[3/4] updating pattern_jury_instructions + pji_instruction_citations...');
  let updatedPji = 0;
  for (const [pji_id, inv] of invalidations) {
    const r = await client.query(
      `
      UPDATE pattern_jury_instructions
         SET invalidated_by_opinion_id = $2,
             invalidation_date = $3,
             invalidation_summary = $4,
             updated_at = now()
       WHERE id = $1
         AND invalidated_by_opinion_id IS DISTINCT FROM $2
      `,
      [pji_id, inv.cl_opinion_id, inv.date, inv.summary]
    );
    updatedPji += r.rowCount;

    // Tag the citation row as match_type=overruled (best-effort — may already exist as direct)
    await client.query(
      `
      UPDATE pji_instruction_citations
         SET match_type = 'overruled',
             confidence = GREATEST(confidence, 0.75)
       WHERE pji_id = $1 AND cl_opinion_id = $2
      `,
      [pji_id, inv.cl_opinion_id]
    );

    console.log(
      `  pji_id=${pji_id} → invalidated by opinion ${inv.cl_opinion_id} (${inv.case_name || 'unknown'}) on ${inv.date || 'unknown-date'}`
    );
    console.log(`    summary: ${inv.summary.slice(0, 180)}`);
  }
  console.log(`  updated ${updatedPji} PJI rows`);

  console.log('\n[4/4] verifying v_pji_public filter...');
  const after = await client.query(`SELECT count(*) AS n FROM v_pji_public`);
  const delta = +before.rows[0].n - +after.rows[0].n;
  console.log(`  v_pji_public after: ${after.rows[0].n} rows (delta=-${delta})`);
  const baseInvalidated = await client.query(`
    SELECT count(*) AS n FROM pattern_jury_instructions WHERE invalidated_by_opinion_id IS NOT NULL
  `);
  console.log(`  base table invalidated_by_opinion_id NOT NULL: ${baseInvalidated.rows[0].n} rows`);

  const sample = await client.query(`
    SELECT id, circuit, instruction_number, invalidated_by_opinion_id, invalidation_date,
           substring(invalidation_summary FROM 1 FOR 120) AS summary_preview
    FROM pattern_jury_instructions
    WHERE invalidated_by_opinion_id IS NOT NULL
    LIMIT 10
  `);
  if (sample.rows.length) {
    console.log('\n  sample invalidated rows:');
    for (const r of sample.rows) {
      console.log(`    id=${r.id} c${r.circuit}.${r.instruction_number} → op ${r.invalidated_by_opinion_id} on ${r.invalidation_date}`);
    }
  }

  await client.end();
}

try {
  await main();
} catch (e) {
  console.error('INVALIDATION SCAN FAILED:', e);
  try { await client.end(); } catch {}
  process.exit(1);
}
