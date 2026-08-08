// Pre-flight probe for TICKET-3: motion-success-by-judge
// Confirms required tables + columns + signal exist before building.
// Read-only. Bounded queries. No DDL.
//
// Per cl-bulk-data-defensive: uses scripts/lib/db.mjs (direct Postgres),
// timeouts on long queries, no per-row INSERT, no LLM.

import { query, end } from "./lib/db.mjs";

async function main() {
  const out = [];

  // --- Step 1: confirm cl_dockets exists, find judge column
  console.log("=== Step 1: cl_dockets schema ===");
  try {
    await query(`SET statement_timeout = '60s'`);
    const cols = await query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cl_dockets'
        ORDER BY ordinal_position`
    );
    if (cols.length === 0) {
      console.log("  MISSING: cl_dockets table not found");
      out.push({ step: 1, status: "MISSING", detail: "cl_dockets" });
    } else {
      const judgeCols = cols.filter((c) =>
        /judge|assigned/i.test(c.column_name)
      );
      console.log(`  cl_dockets has ${cols.length} columns`);
      console.log(
        `  judge-related columns: ${
          judgeCols.map((c) => `${c.column_name}(${c.data_type})`).join(", ") ||
          "NONE"
        }`
      );
      out.push({
        step: 1,
        status: "OK",
        rowCount: cols.length,
        judgeCols: judgeCols.map((c) => c.column_name),
      });
    }
  } catch (e) {
    console.log("  ERROR:", e.message);
    out.push({ step: 1, status: "ERROR", error: e.message });
  }

  // --- Step 2: confirm cl_docket_entries exists, find description column
  console.log("\n=== Step 2: cl_docket_entries schema ===");
  let descCol = null;
  try {
    const cols = await query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cl_docket_entries'
        ORDER BY ordinal_position`
    );
    if (cols.length === 0) {
      console.log("  MISSING: cl_docket_entries table not found");
      out.push({ step: 2, status: "MISSING", detail: "cl_docket_entries" });
    } else {
      console.log(`  cl_docket_entries has ${cols.length} columns:`);
      for (const c of cols) console.log(`    - ${c.column_name} (${c.data_type})`);
      // Look for the text-bearing column
      const textCols = cols.filter(
        (c) =>
          /description|text|long_description|short_description|entry|body/i.test(
            c.column_name
          ) && /text|character|varchar/i.test(c.data_type)
      );
      descCol = textCols[0]?.column_name || null;
      out.push({
        step: 2,
        status: "OK",
        cols: cols.length,
        textColCandidates: textCols.map((c) => c.column_name),
      });
    }
  } catch (e) {
    console.log("  ERROR:", e.message);
    out.push({ step: 2, status: "ERROR", error: e.message });
  }

  // --- Step 3: rowcount on cl_docket_entries (bounded, fast)
  console.log("\n=== Step 3: cl_docket_entries rowcount estimate ===");
  try {
    // Use pg_class reltuples for fast estimate (no full scan)
    const est = await query(
      `SELECT reltuples::bigint AS estimated_rows,
              pg_size_pretty(pg_total_relation_size(oid)) AS total_size
         FROM pg_class
        WHERE relname = 'cl_docket_entries' AND relkind = 'r'`
    );
    console.log("  estimate:", JSON.stringify(est[0] || {}));
    out.push({ step: 3, status: "OK", estimate: est[0] || null });
  } catch (e) {
    console.log("  ERROR:", e.message);
    out.push({ step: 3, status: "ERROR", error: e.message });
  }

  // --- Step 4: signal probe — only if we found a description column
  console.log("\n=== Step 4: motion signal probe ===");
  if (!descCol) {
    console.log(
      "  SKIP: no text column in cl_docket_entries — bulk extractor needed (T6 substrate gap)"
    );
    out.push({
      step: 4,
      status: "SKIP_NO_TEXT_COL",
      detail:
        "cl_docket_entries lacks text-bearing column for motion classification",
    });
  } else {
    console.log(`  using column: ${descCol}`);
    try {
      // Bounded scan: use a TABLESAMPLE or LIMIT-friendly probe
      // Cap at 60s; if it spills, treat as SKIP
      await query(`SET statement_timeout = '60s'`);
      const probe = await query(
        `SELECT
           COUNT(*) FILTER (WHERE ${descCol} ILIKE '%motion to suppress%') AS suppress,
           COUNT(*) FILTER (WHERE ${descCol} ILIKE '%motion to dismiss%')  AS dismiss,
           COUNT(*) FILTER (WHERE ${descCol} ILIKE '%granted%')            AS granted,
           COUNT(*) FILTER (WHERE ${descCol} ILIKE '%denied%')             AS denied,
           COUNT(*) AS sampled
         FROM (
           SELECT ${descCol} FROM cl_docket_entries LIMIT 500000
         ) s`
      );
      console.log("  500K-sample signal:", JSON.stringify(probe[0]));
      out.push({ step: 4, status: "OK", signal: probe[0] });
    } catch (e) {
      console.log("  ERROR/TIMEOUT:", e.message);
      out.push({ step: 4, status: "ERROR", error: e.message });
    }
  }

  // --- Step 5: existing motion_success_* tables
  console.log("\n=== Step 5: existing motion_success_* schema ===");
  try {
    const tables = await query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (table_name LIKE 'motion_success%' OR table_name LIKE 'motion_outcomes%')
        ORDER BY table_name`
    );
    if (tables.length === 0) {
      console.log("  none — fresh build territory");
      out.push({ step: 5, status: "EMPTY" });
    } else {
      for (const t of tables) console.log(`  - ${t.table_name}`);
      out.push({
        step: 5,
        status: "OK",
        tables: tables.map((t) => t.table_name),
      });
    }
  } catch (e) {
    console.log("  ERROR:", e.message);
    out.push({ step: 5, status: "ERROR", error: e.message });
  }

  // --- Step 6: judge_disposition_stats precedent reference (T2 PR #290 pattern)
  console.log("\n=== Step 6: judge_disposition_stats precedent ===");
  try {
    const exists = await query(
      `SELECT relkind FROM pg_class WHERE relname = 'judge_disposition_stats'`
    );
    if (exists.length === 0) {
      console.log("  judge_disposition_stats not present");
      out.push({ step: 6, status: "ABSENT" });
    } else {
      console.log(`  exists, relkind=${exists[0].relkind}`);
      const cnt = await query(
        `SELECT COUNT(*)::bigint AS n FROM judge_disposition_stats`
      );
      console.log(`  rows: ${cnt[0].n}`);
      out.push({
        step: 6,
        status: "OK",
        relkind: exists[0].relkind,
        rows: cnt[0].n,
      });
    }
  } catch (e) {
    console.log("  ERROR:", e.message);
    out.push({ step: 6, status: "ERROR", error: e.message });
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(out, null, 2));

  await end();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  try {
    await end();
  } catch {}
  process.exit(1);
});
