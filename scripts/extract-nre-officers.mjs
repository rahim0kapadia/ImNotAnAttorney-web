// csv-bulk-checked: none-exists — exonerations table already loaded; this is text-mining derived from stored rows
// Pattern: cl-bulk-data-defensive #18 (DB-first; INSERT via VALUES batched, ~4K rows max)
// Template: scripts/bulk-extract-opinion-entities.mjs (regex extraction pattern)
// bulk-insert-justified: small bounded inserts (<10K rows), VALUES batched is appropriate; pg-copy-streams overkill for this volume

/**
 * Task 30 — NRE exoneration officer extractor.
 *
 * Text-mines `exonerations.case_summary` for officer/law-enforcement name mentions
 * using the shared OFFICER_RE pattern from bulk-extract-opinion-entities.mjs.
 *
 * Deduplicates in-memory by (name_first_lower, name_last_lower, jurisdiction_lower),
 * then batch-inserts into `entities_officers` with ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   node scripts/extract-nre-officers.mjs              # dry-run: print first 20 + total
 *   node scripts/extract-nre-officers.mjs --apply      # insert into DB
 *   node scripts/extract-nre-officers.mjs --apply --batch-size=500
 */

import { OFFICER_RE } from "./bulk-extract-opinion-entities.mjs";
import { query, end } from "./lib/db.mjs";
import { randomUUID } from "crypto";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE_ARG = process.argv.find((a) => a.startsWith("--batch-size="));
const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split("=")[1], 10) : 200;
const DRY_RUN_PREVIEW = 20;

/**
 * Split the last word of the regex capture group as name_last,
 * everything before as name_first.
 *
 * "John Smith" → { name_first: "john", name_last: "smith" }
 * "John A. Smith" → { name_first: "john a.", name_last: "smith" }
 * "Smith" → { name_first: "", name_last: "smith" }
 */
export function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const name_last = parts[parts.length - 1].toLowerCase();
  const name_first = parts.slice(0, -1).join(" ").toLowerCase();
  return { name_first, name_last };
}

async function main() {
  console.log(`[extract-nre-officers] mode=${APPLY ? "APPLY" : "DRY-RUN"}, batch_size=${BATCH_SIZE}`);

  // Pull all exonerations with non-trivial case_summary
  const rows = await query(
    `SELECT id, state, case_summary
       FROM exonerations
      WHERE case_summary IS NOT NULL
        AND length(case_summary) > 50
      ORDER BY id`
  );
  console.log(`[extract-nre-officers] loaded ${rows.rows.length} exoneration rows`);

  // Dedupe in-memory: key = name_first|name_last|jurisdiction
  const seen = new Map(); // key → { canonical_id, name_first, name_last, jurisdiction }

  for (const row of rows.rows) {
    const jurisdiction = (row.state ?? "").toLowerCase().trim();
    const text = row.case_summary ?? "";
    // Reset lastIndex — OFFICER_RE is global and stateful
    OFFICER_RE.lastIndex = 0;
    let match;
    const re = new RegExp(OFFICER_RE.source, OFFICER_RE.flags);
    while ((match = re.exec(text)) !== null) {
      const captured = match[1]; // group 1 = name portion after the title
      if (!captured) continue;
      const { name_first, name_last } = splitName(captured);
      if (!name_last) continue;
      const key = `${name_first}|${name_last}|${jurisdiction}`;
      if (!seen.has(key)) {
        seen.set(key, {
          canonical_id: randomUUID(),
          name_first,
          name_last,
          jurisdiction,
          provenance_source: "nre_exonerations",
        });
      }
    }
  }

  const candidates = Array.from(seen.values());
  console.log(`[extract-nre-officers] ${candidates.length} distinct officer candidates`);

  if (!APPLY) {
    console.log(`\n[DRY-RUN] First ${DRY_RUN_PREVIEW} candidates:`);
    for (const c of candidates.slice(0, DRY_RUN_PREVIEW)) {
      console.log(`  ${c.name_first || "(no first)"} ${c.name_last} | ${c.jurisdiction || "(no state)"}`);
    }
    console.log(`\n[DRY-RUN] Total would insert: ${candidates.length} rows (with ON CONFLICT DO NOTHING)`);
    await end();
    return;
  }

  // Batch INSERT with ON CONFLICT DO NOTHING
  let inserted = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    // Build VALUES clause
    const values = [];
    const params = [];
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const base = j * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(c.canonical_id, c.name_first, c.name_last, c.jurisdiction || null, c.provenance_source);
    }
    const sql = `
      INSERT INTO entities_officers (canonical_id, name_first, name_last, jurisdiction, provenance_source)
      VALUES ${values.join(", ")}
      ON CONFLICT DO NOTHING
    `;
    const result = await query(sql, params);
    inserted += result.rowCount ?? 0;
    process.stdout.write(`\r[extract-nre-officers] inserted ${inserted}/${candidates.length}...`);
  }
  console.log(`\n[extract-nre-officers] done. ${inserted} net-new rows inserted.`);
  await end();
}

main().catch((err) => {
  console.error("[extract-nre-officers] fatal:", err);
  end().finally(() => process.exit(1));
});
