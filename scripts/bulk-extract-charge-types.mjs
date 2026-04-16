/**
 * Bulk Charge Type Extraction, Focused Pipeline
 *
 * Streams opinions-criminal.csv (45GB pre-filtered criminal opinions),
 * runs keyword-based charge classification on full opinion text, and
 * updates classified_opinions.charge_types via direct Postgres.
 *
 * This is a focused counterpart to bulk-classify-full-corpus.mjs,
 * it ONLY extracts charge_types (not motions, theories, outcomes).
 * Much faster: skips statute parsing, motion extraction, cross-validation.
 *
 * Three extraction methods (from mechanical-extractor.mjs):
 *   1. Direct charge name keywords (120+ phrases across 10 categories)
 *   2. Theory keyword aggregation (3+ keywords from charge_defense_theories)
 *   3. Existing statute matches are preserved (merge, not replace)
 *
 * Usage:
 *   node scripts/bulk-extract-charge-types.mjs                  # Dry-run stats
 *   node scripts/bulk-extract-charge-types.mjs --apply          # Write to DB
 *   node scripts/bulk-extract-charge-types.mjs --apply --limit 1000  # Test first 1000
 *   node scripts/bulk-extract-charge-types.mjs --apply --resume-from 500000
 *
 * Runtime: ~30-90 minutes depending on disk speed.
 * CRITICAL: Do NOT run while other bulk CSV scripts are running (OOM gotcha).
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

import {
  extractChargesFromKeywords,
  extractChargesFromTheoryKeywords,
} from "./lib/mechanical-extractor.mjs";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const OPINIONS_CSV = path.join(
  PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-criminal.csv"
);

const MIN_TEXT_LEN = 200;
const UPDATE_BATCH_SIZE = 500;

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");

const limitIdx = args.indexOf("--limit");
const processLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const resumeIdx = args.indexOf("--resume-from");
const resumeFrom = resumeIdx >= 0 ? parseInt(args[resumeIdx + 1], 10) : 0;

// ── HTML stripping (no regex, project rule) ─────────────────────────────────
function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const out = [];
  for (const part of parts) {
    const closeIdx = part.indexOf(">");
    out.push(closeIdx >= 0 ? part.slice(closeIdx + 1) : part);
  }
  return out.join("").trim();
}

// ── Memory logging ───────────────────────────────────────────────────────────
function logMem(label) {
  const m = process.memoryUsage();
  const mb = (b) => (b / 1024 / 1024).toFixed(0);
  process.stderr.write(
    "  [mem " + label + "] rss=" + mb(m.rss) + "MB heap=" +
    mb(m.heapUsed) + "/" + mb(m.heapTotal) + "MB\n"
  );
}

// ── Load theory map from DB ──────────────────────────────────────────────────
async function loadTheoryMap() {
  console.log("Loading theory map from charge_defense_theories...");
  const rows = await query(
    "SELECT charge_slug, theory_name, theory_keywords, motion_types " +
    "FROM charge_defense_theories ORDER BY charge_slug, theory_name"
  );

  const map = new Map();
  for (const r of rows) {
    if (!r.charge_slug || !r.theory_name) continue;
    const theories = map.get(r.charge_slug) || [];
    theories.push({
      theory_name: r.theory_name,
      theory_keywords: Array.isArray(r.theory_keywords) ? r.theory_keywords : [],
      motion_types: Array.isArray(r.motion_types) ? r.motion_types : [],
    });
    map.set(r.charge_slug, theories);
  }
  console.log("  Theory map: " + map.size + " charge slugs, " + rows.length + " theories");
  return map;
}

// ── Batch update charge_types ────────────────────────────────────────────────
// Merges new charge_types with existing ones using array_cat + DISTINCT.
// Only updates rows where the new charges aren't already present.
async function flushBatch(batch) {
  if (batch.length === 0) return { applied: 0, errors: 0 };

  // Build VALUES clause: ('cluster_id', ARRAY['slug1','slug2'])
  const valuesClauses = [];
  const params = [];
  let paramIdx = 1;

  for (const { cluster_id, charge_types } of batch) {
    valuesClauses.push("($" + paramIdx + ", $" + (paramIdx + 1) + "::text[])");
    params.push(cluster_id, charge_types);
    paramIdx += 2;
  }

  const sql =
    "UPDATE classified_opinions co " +
    "SET charge_types = (" +
    "  SELECT ARRAY(SELECT DISTINCT unnest(" +
    "    array_cat(COALESCE(co.charge_types, '{}'), v.new_charges)" +
    "  ))" +
    "), updated_at = now() " +
    "FROM (VALUES " + valuesClauses.join(", ") + ") AS v(cluster_id, new_charges) " +
    "WHERE co.cluster_id = v.cluster_id " +
    "AND NOT (COALESCE(co.charge_types, '{}') @> v.new_charges)";

  try {
    const result = await query(sql, params);
    return { applied: batch.length, errors: 0 };
  } catch (e) {
    console.error("  Batch UPDATE error: " + e.message.slice(0, 200));
    return { applied: 0, errors: batch.length };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== BULK CHARGE TYPE EXTRACTION ===\n");
  console.log("Source:     " + OPINIONS_CSV);
  console.log("Mode:       " + (applyMode ? "APPLY (writes to DB)" : "DRY RUN (stats only)"));
  console.log("Limit:      " + (isFinite(processLimit) ? processLimit : "unlimited"));
  console.log("Resume:     row " + resumeFrom);
  console.log("");

  if (!fs.existsSync(OPINIONS_CSV)) {
    console.error("ERROR: opinions-criminal.csv not found.");
    console.error("  Run: python3 scripts/filter-criminal-opinions.py");
    process.exit(1);
  }

  // Crash diagnostics
  process.on("uncaughtException", (e) => {
    console.error("UNCAUGHT: " + (e.stack || e.message));
    end().then(() => process.exit(2));
  });
  process.on("unhandledRejection", (e) => {
    console.error("UNHANDLED: " + (e && (e.stack || e)));
    end().then(() => process.exit(3));
  });

  const theoryMap = await loadTheoryMap();
  logMem("post-load");

  // ── Stream CSV ─────────────────────────────────────────────────────────────
  const csvStream = fs.createReadStream(OPINIONS_CSV);
  const parser = csvStream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      escape: "\\",
      relax_column_count: true,
      relax_quotes: true,
    })
  );
  parser.on("error", (e) =>
    console.error("csv-parse error at row ~" + rowCount + ": " + e.message.slice(0, 150))
  );

  // ── Counters ───────────────────────────────────────────────────────────────
  let rowCount = 0;
  let skippedResume = 0;
  let skippedNoText = 0;
  let skippedNoCluster = 0;
  let processed = 0;
  let withCharges = 0;
  let noCharges = 0;
  const chargeCounts = {};

  let pendingBatch = [];
  let totalApplied = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  // ── Stream + process ───────────────────────────────────────────────────────
  try {
    for await (const record of parser) {
      rowCount++;

      // Resume support
      if (rowCount <= resumeFrom) {
        skippedResume++;
        if (rowCount % 500000 === 0) {
          process.stdout.write("  Skipping (resume): " + (rowCount / 1000000).toFixed(1) + "M rows...\n");
        }
        continue;
      }

      // Progress every 100K rows
      if ((rowCount - resumeFrom) % 100000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = ((rowCount - resumeFrom) / ((Date.now() - startTime) * 0.001)).toFixed(0);
        process.stdout.write(
          "  " + (rowCount / 1000000).toFixed(2) + "M rows | " +
          withCharges + " classified | " +
          pendingBatch.length + " queued | " +
          elapsed + "s | " + rate + " rows/sec\n"
        );
        if ((rowCount - resumeFrom) % 500000 === 0) logMem((rowCount / 1000000).toFixed(1) + "M");
      }

      // Enforce --limit
      if (processed >= processLimit) {
        console.log("\n--limit " + processLimit + " reached. Stopping stream.");
        break;
      }

      // CL CSVs quote ALL values, strip surrounding quotes
      const cluster_id = (record.cluster_id || "").split('"').join("").trim();
      if (!cluster_id) { skippedNoCluster++; continue; }

      // Get text: prefer plain_text, fall back to HTML variants
      let text = record.plain_text || "";
      if (text.length < MIN_TEXT_LEN) {
        const htmlSources = [
          record.html_with_citations,
          record.html,
          record.html_columbia,
          record.html_lawbox,
          record.html_anon_2020,
        ];
        for (const src of htmlSources) {
          if (src && src.length > MIN_TEXT_LEN) {
            text = stripHtml(src);
            break;
          }
        }
      }

      if (text.length < MIN_TEXT_LEN) {
        skippedNoText++;
        continue;
      }

      processed++;

      // ── Charge extraction ────────────────────────────────────────────────
      const chargeSet = new Set();

      // Method 1: Direct charge name keywords
      const kwCharges = extractChargesFromKeywords(text);
      for (const slug of kwCharges) chargeSet.add(slug);

      // Method 2: Theory keyword aggregation (3+ keywords per charge)
      const theoryCharges = extractChargesFromTheoryKeywords(text, theoryMap);
      for (const slug of theoryCharges) chargeSet.add(slug);

      if (chargeSet.size === 0) {
        noCharges++;
        continue;
      }

      withCharges++;
      const charge_types = Array.from(chargeSet);

      // Track per-charge counts
      for (const slug of charge_types) {
        chargeCounts[slug] = (chargeCounts[slug] || 0) + 1;
      }

      // Queue for batch update
      pendingBatch.push({ cluster_id, charge_types });

      // Flush batch when full
      if (applyMode && pendingBatch.length >= UPDATE_BATCH_SIZE) {
        const { applied, errors } = await flushBatch(pendingBatch);
        totalApplied += applied;
        totalErrors += errors;
        pendingBatch = [];
      }
    }
  } catch (e) {
    console.error("\nStream error at row " + rowCount + ": " + e.message.slice(0, 300));
    console.error("Partial data collected. Flushing remaining batch...");
  }

  // Flush remaining
  if (applyMode && pendingBatch.length > 0) {
    const { applied, errors } = await flushBatch(pendingBatch);
    totalApplied += applied;
    totalErrors += errors;
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n=== RESULTS ===\n");
  console.log("Total CSV rows:     " + rowCount.toLocaleString());
  console.log("Skipped (resume):   " + skippedResume.toLocaleString());
  console.log("Skipped (no text):  " + skippedNoText.toLocaleString());
  console.log("Skipped (no ID):    " + skippedNoCluster.toLocaleString());
  console.log("Processed:          " + processed.toLocaleString());
  console.log("With charges:       " + withCharges.toLocaleString() + " (" + (processed > 0 ? ((withCharges / processed) * 100).toFixed(1) : 0) + "%)");
  console.log("No charges:         " + noCharges.toLocaleString());
  console.log("Elapsed:            " + elapsed + "s");
  console.log("");

  console.log("Charge distribution:");
  const sortedCharges = Object.entries(chargeCounts).sort((a, b) => b[1] - a[1]);
  for (const [slug, count] of sortedCharges) {
    console.log("  " + slug + ": " + count.toLocaleString());
  }

  if (applyMode) {
    console.log("\nDB updates:         " + totalApplied.toLocaleString() + " applied, " + totalErrors.toLocaleString() + " errors");
  } else {
    console.log("\nDry run, no DB writes. Use --apply to write.");
  }

  await end();
}

main().catch((e) => {
  console.error("Fatal: " + (e.stack || e.message));
  end().then(() => process.exit(1));
});
