// Investigation-only helper for NY bar r3. Queries cl_opinion_bodies for
// "Matter of" bodies that the round-2 extractor SKIPPED (no OCA Atty. Reg.
// No. and no event row). Dumps a sample for pattern analysis.
//
// NOT a loader. Read-only. Output goes to stderr + .tmp file.
//
// Usage:
//   node --env-file=../ImNotAnAttorney-web/.env.local \
//        scripts/ingest/lib/_investigate-ny-r3.mjs
//
// csv-bulk-checked: none-exists — read-only diag, queries existing DB only

import fs from 'node:fs';
import { createBulkClient } from '../../lib/pg-bulk-defaults.mjs';

const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE || '40', 10);

async function main() {
  const { client, cleanup } = await createBulkClient();
  try {
    // 1. Universe — NY AD "Matter of" clusters with plain_text on body, since 2014.
    const universe = await client.query(`
      SELECT count(*)::int AS n
      FROM cl_opinion_clusters cc
      JOIN cl_dockets d ON d.id = cc.docket_id
      JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
      WHERE d.court_id IN ('nyappdiv','nyappterm')
        AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
        AND cc.date_filed >= '2014-01-01'
        AND b.plain_text IS NOT NULL
        AND length(b.plain_text) > 200
    `);
    console.error(`[universe] NY AD Matter-of clusters with plain_text: ${universe.rows[0].n}`);

    // 2. Of those, how many have an OCA Atty. Reg. No. or "Attorney Registration No."?
    const withOcaReg = await client.query(`
      SELECT count(*)::int AS n
      FROM cl_opinion_clusters cc
      JOIN cl_dockets d ON d.id = cc.docket_id
      JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
      WHERE d.court_id IN ('nyappdiv','nyappterm')
        AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
        AND cc.date_filed >= '2014-01-01'
        AND b.plain_text IS NOT NULL
        AND b.plain_text ~* '(OCA[[:space:]]+Atty\\.?[[:space:]]+Reg|Attorney[[:space:]]+Registration[[:space:]]+No)'
    `);
    console.error(`[oca-reg-match] universe with OCA/AttyReg: ${withOcaReg.rows[0].n}`);

    // 3. The unmatched — clusters in the universe that DON'T have OCA/AttyReg.
    const unmatched = await client.query(`
      SELECT cc.id AS cluster_id, cc.case_name, cc.date_filed, cc.slug,
             length(b.plain_text) AS body_len
      FROM cl_opinion_clusters cc
      JOIN cl_dockets d ON d.id = cc.docket_id
      JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
      WHERE d.court_id IN ('nyappdiv','nyappterm')
        AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
        AND cc.date_filed >= '2014-01-01'
        AND b.plain_text IS NOT NULL
        AND length(b.plain_text) > 200
        AND b.plain_text !~* '(OCA[[:space:]]+Atty\\.?[[:space:]]+Reg|Attorney[[:space:]]+Registration[[:space:]]+No)'
      ORDER BY cc.date_filed DESC
    `);
    console.error(`[unmatched] count: ${unmatched.rows.length}`);

    // 4. Pattern frequency across UNMATCHED bodies — which alt patterns appear?
    const PATTERNS = [
      ['oca-no-period', /OCA[\s ]+Atty[\s ]+Reg[\s ]+No/i],
      ['oarno-compact', /OARNo\.?[\s ]*\d{5,10}/i],
      ['bar-no', /\bBar\s+No\.?\s*\d{5,10}/i],
      ['license-no', /\bLicense\s+No\.?\s*\d{5,10}/i],
      ['registration-no', /\bRegistration\s+No\.?\s*\d{5,10}/i],
      ['attorney-id', /Attorney\s+I\.?D\.?\s+No\.?\s*\d{5,10}/i],
      ['admitted-no', /admitted\s+as\s+an\s+attorney[\s\S]{0,80}?\b\d{7}\b/i],
      ['reg-no-paren', /\(\s*\d{7}\s*\)/],
      ['standalone-7d', /\b\d{7}\b/],
      ['standalone-8d', /\b\d{8}\b/],
      ['no-paren-num', /No\.\s*\d{6,10}/],
      ['admitted-bar', /admitted\s+to\s+the\s+(?:practice\s+of\s+law\s+|N\.?Y\.?\s+|New\s+York\s+|)Bar/i],
      ['was-admitted', /(?:respondent|she|he|petitioner)\s+was\s+admitted/i],
      ['matter-of-attorney', /[Mm]atter of [^,]{2,40},?\s+(?:an?\s+)?(?:suspended\s+|disbarred\s+|resigned\s+)?[Aa]ttorney/i],
      ['per-curiam', /Per\s+Curiam/i],
      ['disciplinary-committee', /(?:Departmental\s+Disciplinary\s+Committee|Attorney\s+Grievance\s+Committee|Committee\s+on\s+Professional\s+Standards)/i],
      ['admonition', /\badmonition\b/i],
      ['letter-caution', /\bletter\s+of\s+caution\b/i],
      ['ordered-disbarred', /ordered[\s\S]{0,50}?disbarred/i],
      ['ordered-suspended', /ordered[\s\S]{0,50}?suspended/i],
      ['ordered-censured', /ordered[\s\S]{0,50}?censured/i],
      ['accept-resignation', /accept\w*\s+(?:the\s+)?resignation/i],
      ['guardianship-keyword', /\b(?:guardian(?:ship)?|infant|child|custody|parental)\b/i],
    ];

    const counts = Object.fromEntries(PATTERNS.map(([n]) => [n, 0]));

    const RAW_BATCH = 100;
    const ids = unmatched.rows.map((r) => r.cluster_id);
    let scanned = 0;
    for (let i = 0; i < ids.length; i += RAW_BATCH) {
      const slice = ids.slice(i, i + RAW_BATCH);
      const r = await client.query(
        `SELECT cluster_id, plain_text FROM cl_opinion_bodies WHERE cluster_id = ANY($1::bigint[])`,
        [slice],
      );
      for (const row of r.rows) {
        const t = (row.plain_text || '').replace(/\s+/g, ' ');
        if (t.length < 200) continue;
        scanned++;
        for (const [name, re] of PATTERNS) if (re.test(t)) counts[name]++;
      }
    }
    console.error(`[scanned-bodies] ${scanned}`);
    console.error(`[pattern-frequency]`);
    for (const [n, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.error(`  ${n.padEnd(28)} ${c}  (${((c * 100) / Math.max(1, scanned)).toFixed(1)}%)`);
    }

    // 5. Sample SAMPLE_SIZE bodies — print snippet so we can refine regexes by hand.
    const sampleIds = ids.slice(0, SAMPLE_SIZE);
    const sample = await client.query(
      `SELECT cc.id, cc.case_name, cc.date_filed, cc.slug, b.plain_text
       FROM cl_opinion_clusters cc
       JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
       WHERE cc.id = ANY($1::bigint[])`,
      [sampleIds],
    );

    const dumpPath = '.tmp-ny-r3-unmatched-samples.txt';
    const lines = [];
    for (const row of sample.rows) {
      const t = (row.plain_text || '').replace(/\s+/g, ' ');
      if (t.length < 200) continue;
      const dateStr = row.date_filed instanceof Date
        ? row.date_filed.toISOString().slice(0, 10)
        : String(row.date_filed);
      lines.push(`===== cluster_id=${row.id} | ${row.case_name} | ${dateStr} =====`);
      lines.push('--- HEAD ---');
      lines.push(t.slice(0, 1200));
      lines.push('--- TAIL ---');
      lines.push(t.slice(Math.max(0, t.length - 800)));
      lines.push('');
    }
    fs.writeFileSync(dumpPath, lines.join('\n'));
    console.error(`[dump] wrote ${dumpPath} (${lines.length} lines)`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
