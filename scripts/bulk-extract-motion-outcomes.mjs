// scripts/bulk-extract-motion-outcomes.mjs
//
// Extracts motion outcome verbs (grant / deny / sustain / overrule) from
// cl_opinion_bodies.plain_text near each motion_type mention. Merges into
// classified_opinions.motion_outcomes jsonb (key = motion_type, value = outcome).
//
// csv-bulk-checked: none-exists — DB-first; cl_opinion_bodies already loaded
// Pattern: cl-bulk-data-defensive #18 (DB-first; UPDATE chunked keyset)
// Template: bulk-extract-opinion-entities.mjs (DB-first chunked-keyset extractor pattern)
// bulk-insert-justified: UPDATE not INSERT, jsonb merge per row

import { query, end } from "./lib/db.mjs";
import { fileURLToPath } from "url";

const DRY_RUN_MAX_ROWS = 100;
const DEFAULT_CHUNK_SIZE = 5000;
const STATEMENT_TIMEOUT = "30min";
const WORK_MEM = "256MB";

// ── Core heuristic (exported for tests) ──────────────────────────────────────

/**
 * Scan plain_text for motion outcome verbs near motion mentions.
 * Returns an object mapping each motion_type to 'granted' or 'denied',
 * or null if no signal found.
 *
 * @param {string|null} text
 * @param {string[]|null} motionTypes
 * @returns {Object.<string,string>|null}
 */
export function extractMotionOutcomes(text, motionTypes) {
  if (!text || !motionTypes || motionTypes.length === 0) return null;

  const lower = text.toLowerCase();

  // Find positions of "motion" mentions
  const motionPositions = [];
  let m;
  const motionWordRe = /\bmotion[s\s,.;]/g;
  while ((m = motionWordRe.exec(lower)) !== null) {
    motionPositions.push(m.index);
  }
  if (motionPositions.length === 0) return null;

  // For each motion mention, check ±300 chars for grant/deny verbs
  const grantRe = /\b(?:granted?|sustained?)\b/i;
  const denyRe = /\b(?:denied?|overruled?)\b/i;

  let grantCount = 0, denyCount = 0;
  for (const pos of motionPositions) {
    const window = lower.slice(Math.max(0, pos - 300), pos + 300);
    if (grantRe.test(window)) grantCount++;
    if (denyRe.test(window)) denyCount++;
  }

  if (grantCount === 0 && denyCount === 0) return null;

  const dominant = grantCount > denyCount ? "granted" : (denyCount > grantCount ? "denied" : null);
  if (!dominant) return null; // tied — skip

  // Every motion_type gets the dominant verdict (v1 simplification)
  const outcomes = {};
  for (const mt of motionTypes) outcomes[mt] = dominant;
  return outcomes;
}

// ── Batch UPDATE via jsonb merge per cluster_id ───────────────────────────────
async function flushBatch(batch) {
  if (batch.length === 0) return { applied: 0, errors: 0 };

  let totalApplied = 0;
  let totalErrors = 0;

  for (const row of batch) {
    try {
      const result = await query(
        "UPDATE classified_opinions " +
        "SET motion_outcomes = COALESCE(motion_outcomes, '{}'::jsonb) || $1::jsonb " +
        "WHERE cluster_id = $2",
        [JSON.stringify(row.outcomes), String(row.cluster_id)]
      );
      totalApplied += result.rowCount ?? 1;
    } catch (e) {
      console.error("  UPDATE error cluster_id=" + row.cluster_id + ": " + e.message.slice(0, 200));
      totalErrors++;
    }
  }

  return { applied: totalApplied, errors: totalErrors };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const applyMode = args.includes("--apply");

  if (!dryRun && !applyMode) {
    console.error(
      "Usage: node scripts/bulk-extract-motion-outcomes.mjs --dry-run\n" +
      "       node scripts/bulk-extract-motion-outcomes.mjs --apply [--limit N] [--chunk-size 5000] [--start-after-cluster N]"
    );
    process.exit(1);
  }

  const limitIdx = args.indexOf("--limit");
  const processLimit =
    limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

  const chunkIdx = args.indexOf("--chunk-size");
  const chunkSize =
    chunkIdx >= 0 ? parseInt(args[chunkIdx + 1], 10) : DEFAULT_CHUNK_SIZE;

  const startIdx = args.indexOf("--start-after-cluster");
  const startAfter = startIdx >= 0 ? parseInt(args[startIdx + 1], 10) : 0;

  console.log("=== BULK MOTION OUTCOME EXTRACTION ===\n");
  console.log(
    "Mode:           " +
      (dryRun
        ? "DRY RUN (no DB writes, first " + DRY_RUN_MAX_ROWS + " rows)"
        : "APPLY")
  );
  console.log("Chunk size:     " + chunkSize);
  console.log("Start after:    cluster_id > " + startAfter);
  console.log(
    "Limit:          " + (isFinite(processLimit) ? processLimit : "unlimited")
  );
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
  await query("SET work_mem = '" + WORK_MEM + "'");

  let lastClusterId = startAfter;
  let totalRows = 0;
  let totalWithSignal = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let chunkNum = 0;
  const startTime = Date.now();
  const fetchLimit = dryRun ? DRY_RUN_MAX_ROWS : chunkSize;

  try {
    while (true) {
      // Stream classified_opinions rows that have motion_types but no motion_outcomes yet
      const rows = await query(
        "SELECT co.cluster_id, co.motion_types, cob.plain_text " +
        "FROM classified_opinions co " +
        "JOIN cl_opinion_bodies cob ON cob.cluster_id = co.cluster_id::bigint " +
        "WHERE co.cluster_id > $1 " +
        "  AND co.motion_types IS NOT NULL " +
        "  AND array_length(co.motion_types, 1) > 0 " +
        "  AND (co.motion_outcomes IS NULL OR co.motion_outcomes = '{}'::jsonb) " +
        "  AND cob.plain_text IS NOT NULL " +
        "ORDER BY co.cluster_id " +
        "LIMIT $2",
        [lastClusterId, fetchLimit]
      );

      if (rows.length === 0) {
        console.log("No more rows — done.");
        break;
      }

      chunkNum++;
      const batch = [];

      for (const row of rows) {
        const outcomes = extractMotionOutcomes(row.plain_text, row.motion_types);
        lastClusterId = row.cluster_id;
        totalRows++;

        if (dryRun) {
          console.log(
            "cluster_id=" + row.cluster_id +
            " motion_types=" + JSON.stringify(row.motion_types) +
            " → " + (outcomes ? JSON.stringify(outcomes) : "(no signal)")
          );
        } else if (outcomes) {
          batch.push({ cluster_id: row.cluster_id, outcomes });
          totalWithSignal++;
        }

        if (totalRows >= processLimit) break;
      }

      if (applyMode && batch.length > 0) {
        const { applied, errors } = await flushBatch(batch);
        totalUpdated += applied;
        totalErrors += errors;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          "chunk " + chunkNum +
          " → rows=" + rows.length +
          " with_signal=" + batch.length +
          " updated=" + applied +
          " errors=" + errors +
          " last_id=" + lastClusterId +
          " total=" + totalRows +
          " elapsed=" + elapsed + "s"
        );
      }

      // Exit conditions
      if (
        dryRun ||
        totalRows >= processLimit ||
        rows.length < fetchLimit
      ) {
        break;
      }
    }
  } finally {
    await end();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=== COMPLETE ===");
  console.log("Total rows processed: " + totalRows.toLocaleString());
  if (applyMode) {
    console.log("Rows with signal:     " + totalWithSignal.toLocaleString());
    console.log("Total updated:        " + totalUpdated.toLocaleString());
    console.log("Total errors:         " + totalErrors.toLocaleString());
  }
  console.log("Elapsed:              " + elapsed + "s");
}

// Guard: only run main() when executed directly (not when imported by vitest/tests)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((e) => {
    console.error("FATAL: " + (e.stack || e.message));
    process.exit(1);
  });
}
