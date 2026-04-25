// Round-3 broader investigation. Among the bodies still skipped after
// the new BAR_NUMBER_PATTERNS, look for additional candidate patterns.

import fs from 'node:fs';
import { createBulkClient } from '../../lib/pg-bulk-defaults.mjs';

const PATTERNS = [
  // Existing round-2/round-3
  ['oca-atty-reg-no',          /OCA\s+Atty\.?\s+Reg\.?\s+No\.?\s+(\d{5,10})/i],
  ['attorney-registration-no', /Attorney\s+Registration\s+No\.?\s+(\d{5,10})/i],
  ['attorney-reg-no',          /Attorney\s+Reg\.\s+No\.?\s*(\d{5,10})/i],
  ['oca-comma',                /OCA,\s+Atty\.?\s+Reg\.?\s+No\.?\s*(\d{5,10})/i],
  ['oca-att-reg',              /OCA\s+Att\.?\s+Reg\.?\s+(?:No\.?\s*)?(\d{5,10})/i],
  ['oca-reg-no',               /OCA\s+Reg\.?\s+No\.?\s*(\d{5,10})/i],
];

// Candidate alt patterns to test against the skipped set
const CANDIDATES = [
  // "an Attorney. No.NNNNNNN)" Pavliv 2018 — risky, captures every "No."
  ['attorney-no-prefix',  /[Aa]n\s+[Aa]ttorney\.?\s+No\.\s*(\d{6,10})/],
  // "Reg. No. NNNNNNN" inside attorney context
  ['reg-no-anywhere',     /\bReg\.?\s+No\.?\s+(\d{5,10})/i],
  // "Att. Reg. NNNNNNN" without OCA
  ['att-reg-anywhere',    /\bAtt\.?\s+Reg\.?\s+(?:No\.?\s*)?(\d{5,10})/i],
  // "Atty. Reg. NNNNNNN" without OCA
  ['atty-reg-anywhere',   /\bAtty\.?\s+Reg\.?\s+(?:No\.?\s*)?(\d{5,10})/i],
  // "Reg. # NNNNNNN"
  ['reg-hash',            /\bReg\.?\s*#\s*(\d{5,10})/i],
  // "(Reg. NNNNNNN)" — parenthesized
  ['paren-reg',           /\(\s*Reg\.?\s+(\d{5,10})\s*\)/i],
];

async function main() {
  const { client, cleanup } = await createBulkClient();
  try {
    const r = await client.query(`
      SELECT cc.id AS cluster_id, b.plain_text
      FROM cl_opinion_clusters cc
      JOIN cl_dockets d ON d.id = cc.docket_id
      JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
      WHERE d.court_id IN ('nyappdiv','nyappterm')
        AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
        AND cc.date_filed >= '2014-01-01'
        AND b.plain_text IS NOT NULL
        AND length(b.plain_text) > 200
      ORDER BY cc.date_filed DESC
    `);
    console.error(`[universe] ${r.rows.length}`);

    // For each body, try the existing patterns. Only consider bodies that
    // FAIL all existing patterns. Then count candidate hits.
    const candidateCounts = Object.fromEntries(CANDIDATES.map(([n]) => [n, 0]));
    const candidateExamples = Object.fromEntries(CANDIDATES.map(([n]) => [n, []]));
    let stillUnmatched = 0;
    for (const row of r.rows) {
      const t = (row.plain_text || '').replace(/\s+/g, ' ');
      let matched = false;
      for (const [, re] of PATTERNS) {
        if (re.test(t)) { matched = true; break; }
      }
      if (matched) continue;
      stillUnmatched++;
      for (const [name, re] of CANDIDATES) {
        const m = t.match(re);
        if (m) {
          candidateCounts[name]++;
          if (candidateExamples[name].length < 5) {
            const idx = m.index;
            const start = Math.max(0, idx - 80);
            const end = Math.min(t.length, idx + m[0].length + 80);
            candidateExamples[name].push({
              clusterId: row.cluster_id,
              context: t.slice(start, end),
              extracted: m[1],
            });
          }
        }
      }
    }
    console.error(`[still-unmatched-after-r3-patterns] ${stillUnmatched}`);

    const out = [];
    for (const [name] of CANDIDATES) {
      out.push(`===== ${name} (${candidateCounts[name]} hits) =====`);
      for (const ex of candidateExamples[name]) {
        out.push(`  cluster=${ex.clusterId} extracted=${ex.extracted}`);
        out.push(`    ...${ex.context}...`);
      }
      out.push('');
    }
    fs.writeFileSync('.tmp-ny-r3-broader-candidates.txt', out.join('\n'));
    console.error('[done] wrote .tmp-ny-r3-broader-candidates.txt');
  } finally {
    await cleanup();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
