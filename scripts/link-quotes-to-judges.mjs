#!/usr/bin/env node
/**
 * Phase 1b: Link judge_quotes to judge_profiles.
 *
 * 2026-05-04 rewrite (DB-first): the prior CSV-stream approach silently
 * corrupted column alignment on embedded commas in legal text (csv-parse
 * with relax_quotes + relax_column_count shifts trailing columns when
 * fields contain unquoted commas). Producing 0 valid author_id matches
 * after 1.5M rows scanned.
 *
 * cl_opinion_bodies is already loaded with cluster_id (bigint) +
 * author_id (bigint), and judge_profiles bridges author_id → judge UUID
 * via cl_person_id (text). A single UPDATE...FROM JOIN replaces the
 * 4–6h CSV stream with a ~2s query and ~30K author matches.
 *
 * Pipeline:
 *   1. Direct Postgres UPDATE judge_quotes
 *      JOIN cl_opinion_bodies ON cluster_id::text = jq.cluster_id
 *      JOIN judge_profiles ON cl_person_id = author_id::text
 *      WHERE judge_id IS NULL
 *
 * Usage:
 *   node scripts/link-quotes-to-judges.mjs --dry-run   # preview match count
 *   node scripts/link-quotes-to-judges.mjs --apply     # write to DB
 *
 * Memory: lesson-cl-csv-parse-corruption-2026-05-04.md
 */

// csv-bulk-checked: none-exists — author_id+cluster_id already loaded into
// cl_opinion_bodies during cl-bulk-loader.mjs run; querying DB beats
// re-streaming the 28GB criminal CSV (which has parser-corrupted columns).

import { query, end } from "./lib/db.mjs";

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");

if (!dryRun && !apply) {
  console.error("Usage: --dry-run or --apply");
  process.exit(1);
}

console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);

// ── Pre-update baseline ─────────────────────────────────────────────────────
const before = await query(
  "SELECT COUNT(*) AS total, COUNT(judge_id) AS linked, " +
  "COUNT(*) - COUNT(judge_id) AS unlinked FROM judge_quotes"
);
console.log("\n1. Baseline:");
console.log(`   total=${before[0].total} linked=${before[0].linked} unlinked=${before[0].unlinked}`);

// ── Coverage projection (no writes) ────────────────────────────────────────
console.log("\n2. Projecting linkable quotes via cl_opinion_bodies + judge_profiles...");
const proj = await query(`
  SELECT COUNT(DISTINCT jq.id) AS would_link,
         COUNT(DISTINCT ob.cluster_id) AS clusters_with_author,
         COUNT(DISTINCT jp.id) AS distinct_judges
  FROM judge_quotes jq
  JOIN cl_opinion_bodies ob ON ob.cluster_id::text = jq.cluster_id
  JOIN judge_profiles jp ON jp.cl_person_id = ob.author_id::text
  WHERE jq.judge_id IS NULL
    AND ob.author_id IS NOT NULL
`);
console.log(`   would_link=${proj[0].would_link} clusters=${proj[0].clusters_with_author} distinct_judges=${proj[0].distinct_judges}`);

if (dryRun) {
  console.log("\nDry-run only. Re-run with --apply to write.");
  await end();
  process.exit(0);
}

// ── Apply UPDATE ───────────────────────────────────────────────────────────
console.log("\n3. UPDATE judge_quotes SET judge_id = ... ");
const t0 = Date.now();
const upd = await query(`
  UPDATE judge_quotes jq
  SET judge_id = sub.judge_id
  FROM (
    SELECT DISTINCT jq2.id AS quote_id, jp.id AS judge_id
    FROM judge_quotes jq2
    JOIN cl_opinion_bodies ob ON ob.cluster_id::text = jq2.cluster_id
    JOIN judge_profiles jp ON jp.cl_person_id = ob.author_id::text
    WHERE jq2.judge_id IS NULL
      AND ob.author_id IS NOT NULL
  ) sub
  WHERE jq.id = sub.quote_id
`);
const ms = Date.now() - t0;
console.log(`   UPDATE complete in ${ms}ms (rowCount=${upd.rowCount ?? "n/a"})`);

// ── Post-update verification ───────────────────────────────────────────────
const after = await query(
  "SELECT COUNT(*) AS total, COUNT(judge_id) AS linked, " +
  "COUNT(*) - COUNT(judge_id) AS unlinked FROM judge_quotes"
);
console.log("\n4. Post-UPDATE:");
console.log(`   total=${after[0].total} linked=${after[0].linked} unlinked=${after[0].unlinked}`);
console.log(`   Net new linkages: ${Number(after[0].linked) - Number(before[0].linked)}`);

await end();
