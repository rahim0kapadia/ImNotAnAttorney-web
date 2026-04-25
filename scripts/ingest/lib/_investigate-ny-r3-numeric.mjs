// Round-2 investigation. For the 33 unmatched bodies that DO have a
// standalone 7-digit number, dump the snippet around it to see whether
// the number is plausibly a bar number.

import fs from 'node:fs';
import { createBulkClient } from '../../lib/pg-bulk-defaults.mjs';

async function main() {
  const { client, cleanup } = await createBulkClient();
  try {
    const r = await client.query(`
      SELECT cc.id AS cluster_id, cc.case_name, cc.date_filed, cc.slug, b.plain_text
      FROM cl_opinion_clusters cc
      JOIN cl_dockets d ON d.id = cc.docket_id
      JOIN cl_opinion_bodies b ON b.cluster_id = cc.id
      WHERE d.court_id IN ('nyappdiv','nyappterm')
        AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.''-]+$'
        AND cc.date_filed >= '2014-01-01'
        AND b.plain_text IS NOT NULL
        AND length(b.plain_text) > 200
        AND b.plain_text !~* '(OCA[[:space:]]+Atty\\.?[[:space:]]+Reg|Attorney[[:space:]]+Registration[[:space:]]+No)'
        AND b.plain_text ~ '[^0-9][0-9]{7}[^0-9]'
      ORDER BY cc.date_filed DESC
      LIMIT 30
    `);
    console.error(`[numeric] ${r.rows.length} bodies with standalone 7-digit number`);

    const out = [];
    for (const row of r.rows) {
      const t = (row.plain_text || '').replace(/\s+/g, ' ');
      const dateStr = row.date_filed instanceof Date
        ? row.date_filed.toISOString().slice(0, 10)
        : String(row.date_filed);
      out.push(`===== ${row.id} | ${row.case_name} | ${dateStr} =====`);
      // For each 7-digit number, show 80 chars of context on each side.
      const re = /\b\d{7}\b/g;
      let m;
      const seen = new Set();
      while ((m = re.exec(t))) {
        if (seen.has(m.index)) continue;
        seen.add(m.index);
        const start = Math.max(0, m.index - 80);
        const end = Math.min(t.length, m.index + m[0].length + 80);
        out.push(`  [@${m.index}] ...${t.slice(start, end)}...`);
        if (seen.size >= 4) break;
      }
      out.push('');
    }
    fs.writeFileSync('.tmp-ny-r3-numeric-context.txt', out.join('\n'));
    console.error('[done] wrote .tmp-ny-r3-numeric-context.txt');
  } finally {
    await cleanup();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
