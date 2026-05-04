/**
 * Bulk Charge Type Extraction — DB-first (Phase 1 of 2026-05-04 plan)
 *
 * Streams cl_opinion_bodies via keyset pagination (cluster_id),
 * runs keyword-based charge classification on plain_text, and
 * updates classified_opinions.charge_types via direct Postgres.
 *
 * REPLACES the prior CSV-stream design (opinions-criminal.csv +
 * csv-parse). The csv-parse config (relax_quotes:true, escape:'\\\\')
 * silently shifts trailing columns when legal text contains unquoted
 * commas, corrupting cluster_id (2026-05-04 incident: T6 smoke
 * processed 600K rows, script reported 2,278 classified, n_tup_upd
 * stayed at 264 — zero actual writes). cl_opinion_bodies is the
 * already-loaded DB version of the same source data; the JOIN is
 * 1.5M rows with cluster_id (bigint) + plain_text (text) + text_length
 * (integer), so no parser is involved.
 *
 * Three extraction methods (from mechanical-extractor.mjs):
 *   1. Direct charge name keywords (120+ phrases across 10 categories)
 *   2. Theory keyword aggregation (3+ keywords from charge_defense_theories)
 *   3. Existing statute matches are preserved (merge, not replace)
 *
 * Usage:
 *   node scripts/bulk-extract-charge-types.mjs                            # Dry-run stats
 *   node scripts/bulk-extract-charge-types.mjs --apply                    # Write to DB
 *   node scripts/bulk-extract-charge-types.mjs --apply --limit 1000       # Test first 1000 rows
 *   node scripts/bulk-extract-charge-types.mjs --apply --resume-from 5000000  # cluster_id > 5M
 *   node scripts/bulk-extract-charge-types.mjs --apply --chunk-size 2000  # smaller chunks
 *   node scripts/bulk-extract-charge-types.mjs --apply --no-delta-gate    # full re-scan
 *
 * Runtime: ~5-15 minutes for 1.39M with-text rows (vs broken CSV's 4-6h).
 * Verification: pg_stat_user_tables.n_tup_upd on classified_opinions is
 * the ground truth — script-reported counters were unreliable when the
 * old csv-parse path corrupted cluster_id.
 */

import {
  extractChargesFromKeywords,
  extractChargesFromTheoryKeywords,
} from "./lib/mechanical-extractor.mjs";
import { query, end } from "./lib/db.mjs";

const MIN_TEXT_LEN = 200;
const UPDATE_BATCH_SIZE = 500;
const DEFAULT_CHUNK_SIZE = 5000;
const STATEMENT_TIMEOUT = "300s";

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const noDeltaGate = args.includes("--no-delta-gate");

const limitIdx = args.indexOf("--limit");
const processLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const resumeIdx = args.indexOf("--resume-from");
const resumeFrom = resumeIdx >= 0 ? parseInt(args[resumeIdx + 1], 10) : 0;

const chunkIdx = args.indexOf("--chunk-size");
const chunkSize = chunkIdx >= 0 ? parseInt(args[chunkIdx + 1], 10) : DEFAULT_CHUNK_SIZE;

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

// ── Load already-classified cluster_ids (delta gate) ─────────────────────────
async function loadAlreadyClassifiedClusters() {
  console.log("Loading already-classified cluster_ids (delta gate)...");
  const t0 = Date.now();
  const rows = await query(
    "SELECT cluster_id FROM classified_opinions " +
    "WHERE charge_types IS NOT NULL AND array_length(charge_types, 1) > 0"
  );
  const set = new Set();
  for (const r of rows) {
    if (r.cluster_id) set.add(String(r.cluster_id));
  }
  const ms = Date.now() - t0;
  console.log("  Skip set: " + set.size.toLocaleString() + " clusters (" + ms + "ms)");
  return set;
}

// ── Batch update charge_types ────────────────────────────────────────────────
// Merges new charge_types with existing ones using array_cat + DISTINCT.
// Only updates rows where the new charges aren't already present.
async function flushBatch(batch) {
  if (batch.length === 0) return { applied: 0, errors: 0 };

  const valuesClauses = [];
  const params = [];
  let paramIdx = 1;

  for (const { cluster_id, charge_types } of batch) {
    valuesClauses.push("($" + paramIdx + "::text, $" + (paramIdx + 1) + "::text[])");
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
    await query(sql, params);
    return { applied: batch.length, errors: 0 };
  } catch (e) {
    console.error("  Batch UPDATE error: " + e.message.slice(0, 200));
    return { applied: 0, errors: batch.length };
  }
}

// ── Fetch one chunk via keyset pagination ────────────────────────────────────
async function fetchChunk(afterClusterId, size) {
  return query(
    "SELECT cluster_id, plain_text " +
    "FROM cl_opinion_bodies " +
    "WHERE cluster_id > $1 AND text_length >= $2 " +
    "ORDER BY cluster_id " +
    "LIMIT $3",
    [afterClusterId, MIN_TEXT_LEN, size]
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== BULK CHARGE TYPE EXTRACTION (DB-first) ===\n");
  console.log("Source:     cl_opinion_bodies (DB, keyset by cluster_id)");
  console.log("Mode:       " + (applyMode ? "APPLY (writes to DB)" : "DRY RUN (stats only)"));
  console.log("Limit:      " + (isFinite(processLimit) ? processLimit : "unlimited"));
  console.log("Resume:     cluster_id > " + resumeFrom);
  console.log("Chunk size: " + chunkSize);
  console.log("Delta gate: " + (noDeltaGate ? "DISABLED (--no-delta-gate, full re-scan)" : "ENABLED (skip already-classified clusters)"));
  console.log("");

  process.on("uncaughtException", (e) => {
    console.error("UNCAUGHT: " + (e.stack || e.message));
    end().then(() => process.exit(2));
  });
  process.on("unhandledRejection", (e) => {
    console.error("UNHANDLED: " + (e && (e.stack || e)));
    end().then(() => process.exit(3));
  });

  await query("SET statement_timeout = '" + STATEMENT_TIMEOUT + "'");

  const theoryMap = await loadTheoryMap();
  logMem("post-load");

  const skipSet = noDeltaGate ? new Set() : await loadAlreadyClassifiedClusters();
  if (!noDeltaGate) logMem("post-skipset");

  // ── Counters ───────────────────────────────────────────────────────────────
  let rowCount = 0;
  let skippedAlreadyDone = 0;
  let processed = 0;
  let withCharges = 0;
  let noCharges = 0;
  const chargeCounts = {};

  let pendingBatch = [];
  let totalApplied = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  let cursor = resumeFrom;
  let chunkIdx = 0;

  // ── Chunk loop ─────────────────────────────────────────────────────────────
  while (true) {
    if (processed >= processLimit) {
      console.log("\n--limit " + processLimit + " reached. Stopping.");
      break;
    }

    const chunkStart = Date.now();
    let rows;
    try {
      rows = await fetchChunk(cursor, chunkSize);
    } catch (e) {
      console.error("\nChunk fetch error at cursor=" + cursor + ": " + e.message.slice(0, 300));
      console.error("Flushing remaining batch and exiting.");
      break;
    }

    if (rows.length === 0) {
      console.log("\nReached end of cl_opinion_bodies at cluster_id=" + cursor + ".");
      break;
    }

    chunkIdx++;
    const chunkMs = Date.now() - chunkStart;

    for (const r of rows) {
      rowCount++;
      cursor = r.cluster_id; // advance keyset cursor

      if (processed >= processLimit) break;

      const cluster_id = String(r.cluster_id);

      if (skipSet.has(cluster_id)) {
        skippedAlreadyDone++;
        continue;
      }

      const text = r.plain_text || "";
      if (text.length < MIN_TEXT_LEN) continue;

      processed++;

      const chargeSet = new Set();
      const kwCharges = extractChargesFromKeywords(text);
      for (const slug of kwCharges) chargeSet.add(slug);
      const theoryCharges = extractChargesFromTheoryKeywords(text, theoryMap);
      for (const slug of theoryCharges) chargeSet.add(slug);

      if (chargeSet.size === 0) {
        noCharges++;
        continue;
      }

      withCharges++;
      const charge_types = Array.from(chargeSet);
      for (const slug of charge_types) {
        chargeCounts[slug] = (chargeCounts[slug] || 0) + 1;
      }

      pendingBatch.push({ cluster_id, charge_types });

      if (applyMode && pendingBatch.length >= UPDATE_BATCH_SIZE) {
        const { applied, errors } = await flushBatch(pendingBatch);
        totalApplied += applied;
        totalErrors += errors;
        pendingBatch = [];
      }
    }

    // Per-chunk progress
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (rowCount / ((Date.now() - startTime) * 0.001)).toFixed(0);
    process.stdout.write(
      "  chunk #" + chunkIdx + " | " +
      "scanned=" + rowCount.toLocaleString() + " | " +
      "classified=" + withCharges.toLocaleString() + " | " +
      "skipped(done)=" + skippedAlreadyDone.toLocaleString() + " | " +
      "queued=" + pendingBatch.length + " | " +
      "cursor=" + cursor + " | " +
      elapsed + "s | " + rate + " r/s (chunk " + chunkMs + "ms)\n"
    );
    if (chunkIdx % 20 === 0) logMem("chunk " + chunkIdx);
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
  console.log("Total scanned:      " + rowCount.toLocaleString());
  console.log("Skipped (delta):    " + skippedAlreadyDone.toLocaleString() + " (already in classified_opinions)");
  console.log("Processed:          " + processed.toLocaleString());
  console.log("With charges:       " + withCharges.toLocaleString() + " (" + (processed > 0 ? ((withCharges / processed) * 100).toFixed(1) : 0) + "%)");
  console.log("No charges:         " + noCharges.toLocaleString());
  console.log("Last cluster_id:    " + cursor);
  console.log("Elapsed:            " + elapsed + "s");
  console.log("");

  console.log("Charge distribution:");
  const sortedCharges = Object.entries(chargeCounts).sort((a, b) => b[1] - a[1]);
  for (const [slug, count] of sortedCharges) {
    console.log("  " + slug + ": " + count.toLocaleString());
  }

  if (applyMode) {
    console.log("\nDB updates:         " + totalApplied.toLocaleString() + " applied, " + totalErrors.toLocaleString() + " errors");
    console.log("\nGround-truth check: SELECT n_tup_upd FROM pg_stat_user_tables WHERE relname='classified_opinions';");
  } else {
    console.log("\nDry run, no DB writes. Use --apply to write.");
  }

  await end();
}

main().catch((e) => {
  console.error("Fatal: " + (e.stack || e.message));
  end().then(() => process.exit(1));
});
