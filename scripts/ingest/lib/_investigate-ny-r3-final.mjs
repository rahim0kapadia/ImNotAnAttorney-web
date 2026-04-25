// Final round-3 investigation. Look for additional bar-number patterns
// in bodies that still don't match after the round-3 patterns.

import fs from 'node:fs';
import { createBulkClient } from '../../lib/pg-bulk-defaults.mjs';

const PATTERNS_R3 = [
  /OCA\s+Atty\.?\s+Reg\.?\s+No\.?\s+(\d{5,10})/i,
  /Attorney\s+Registration\s+No\.?\s+(\d{5,10})/i,
  /Attorney\s+Reg\.\s+No\.?\s*(\d{5,10})/i,
  /OCA,\s+Atty\.?\s+Reg\.?\s+No\.?\s*(\d{5,10})/i,
  /OCA\s+Att(?:y)?\.?\s+Reg\.?\s+(?:No\.?\s*)?(\d{5,10})/i,
  /OCA\s+Reg\.?\s+No\.?\s*(\d{5,10})/i,
];

async function main() {
  const { client, cleanup } = await createBulkClient();
  try {
    const r = await client.query(`
      SELECT cc.id AS cluster_id, cc.case_name, cc.date_filed, b.plain_text
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

    const samples = [];
    let stillUnmatched = 0;
    for (const row of r.rows) {
      const t = (row.plain_text || '').replace(/\s+/g, ' ');
      let matched = false;
      for (const re of PATTERNS_R3) if (re.test(t)) { matched = true; break; }
      if (matched) continue;
      stillUnmatched++;
      // Only sample bodies that have BOTH "attorney" AND a 7-digit number
      // (signal of attorney discipline + a possible bar number).
      if (/attorney/i.test(t) && /[^0-9][0-9]{7}[^0-9]/.test(t)) {
        samples.push({ id: row.cluster_id, name: row.case_name, t });
        if (samples.length >= 50) break;
      }
    }
    console.error(`[still-unmatched] ${stillUnmatched}`);
    console.error(`[samples-with-attorney+7d] ${samples.length}`);

    const out = [];
    for (const s of samples) {
      out.push(`===== ${s.id} | ${s.name} =====`);
      // Find each 7-digit number; show 100 chars context.
      const re = /[^0-9]([0-9]{7})[^0-9]/g;
      let m;
      let shown = 0;
      while ((m = re.exec(s.t))) {
        const idx = m.index + 1;
        const start = Math.max(0, idx - 100);
        const end = Math.min(s.t.length, idx + m[1].length + 100);
        out.push(`  [${m[1]}] ...${s.t.slice(start, end)}...`);
        shown++;
        if (shown >= 5) break;
      }
      out.push('');
    }
    fs.writeFileSync('.tmp-ny-r3-final-candidates.txt', out.join('\n'));
    console.error('[done]');
  } finally {
    await cleanup();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
