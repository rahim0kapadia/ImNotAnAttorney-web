// scripts/bulk-extract-opinion-entities.mjs
//
// One-pass entity extractor over cl_opinion_bodies.plain_text JOIN classified_opinions.
// Writes 8 derived array columns + extractor_version + extracted_at to classified_opinions.
//
// csv-bulk-checked: none-exists — DB-first; cl_opinion_bodies.plain_text already loaded (1.5M rows)
// Pattern: cl-bulk-data-defensive #18 (DB-first; UPDATE not INSERT, COPY-FROM-STDIN doesn't apply to UPDATE-by-id)
// Template: scripts/bulk-extract-charge-types.mjs (DB-first chunked-keyset pattern)
// bulk-insert-justified: this is UPDATE-by-cluster-id, not INSERT; chunked batched UPDATE via VALUES + JOIN is the standard pattern for keyed back-fill against existing rows

import { query, end } from "./lib/db.mjs";
import { fileURLToPath } from "url";

// ── Extractor version ────────────────────────────────────────────────────────
export const EXTRACTOR_VERSION = "cl_opinion_bodies.plain_text@v1@2026-05-04";

const DRY_RUN_MAX_ROWS = 100;
const DEFAULT_CHUNK_SIZE = 5000;
const STATEMENT_TIMEOUT = "30min";
const WORK_MEM = "256MB";
const MIN_TEXT_LEN = 100;

// ── Exported regex constants (imported by tests) ─────────────────────────────

// Officer / law enforcement names
// Patterns: "Officer Smith", "Detective John Brown", "Sergeant Davis", "Lt. Wilson", "Trooper Jones"
export const OFFICER_RE =
  /\b(?:Officer|Detective|Sergeant|Lieutenant|Lt\.|Sgt\.|Trooper|Deputy|Sheriff|Captain|Corporal|Patrolman|Patrolwoman)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){0,2})\b/g;

// Witness: testified pattern + explicit witness label
export const WITNESS_TESTIFIED_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){0,2})\s+testified\b/g;
export const WITNESS_LABEL_RE =
  /\bwitness(?:es)?\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){0,2})\b/g;

// Expert witnesses
export const EXPERT_DR_RE =
  /\b(?:Dr\.|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,1})\b/g;
export const EXPERT_WITNESS_RE =
  /\bexpert\s+witness\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){0,2})\b/g;

// Prosecutors
export const PROSECUTOR_ADA_RE =
  /\b(?:ADA|AUSA|A\.D\.A\.|A\.U\.S\.A\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
export const PROSECUTOR_TITLE_RE =
  /\b(?:Assistant\s+(?:District|United\s+States)\s+Attorney|prosecutor|the\s+State'?s?\s+attorney)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;

// Defense attorneys
// NOTE: no 'i' flag — name pattern uses explicit [A-Z][a-z]+ to avoid case-insensitive
// expansion where [a-z] would match uppercase letters and consume extra words.
// Prefix matches both lowercase and sentence-start (capital D) forms.
export const DEFENSE_RE =
  /\b(?:[Dd]efense\s+(?:counsel|attorney|lawyer)|Public\s+Defender)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;

// Sentence months (explicit month counts)
export const SENTENCE_MONTHS_RE =
  /\b(?:sentenced\s+to\s+)?(\d{1,4})\s+months?\b(?=[\s,.]|in\s+prison|imprisonment|incarceration|sentence)/gi;
// Sentence years → caller multiplies by 12
export const SENTENCE_YEARS_RE =
  /\b(\d{1,3})[\s-]years?\s+(?:sentence|imprisonment|incarceration|in\s+prison)/gi;
// N-month-sentence pattern
export const SENTENCE_NMONTH_HYPHEN_RE =
  /\b(\d{1,4})-month\s+sentence/gi;

// Fine dollars (two capture-group alternation)
export const FINE_RE =
  /\$\s?([\d,]+(?:\.\d{2})?)\s+fine|fine\s+of\s+\$\s?([\d,]+(?:\.\d{2})?)/gi;

// Restitution dollars (two capture-group alternation)
export const RESTITUTION_RE =
  /restitution\s+of\s+\$\s?([\d,]+(?:\.\d{2})?)|\$\s?([\d,]+(?:\.\d{2})?)\s+(?:in\s+)?restitution/gi;

// ── Helper functions ─────────────────────────────────────────────────────────

function uniqMatchGroup1(matches) {
  const set = new Set();
  for (const m of matches) {
    const v = (m[1] || "").trim();
    if (v) set.add(v);
  }
  return Array.from(set);
}

function uniqInts(arr) {
  const set = new Set(arr);
  return Array.from(set).sort((a, b) => a - b);
}

function parseDollars(s) {
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n);
}

const EMPTY = {
  officer_names: [],
  witness_names: [],
  expert_witness_names: [],
  prosecutor_names: [],
  defense_attorney_names: [],
  sentence_months_extracted: [],
  fine_dollars_extracted: [],
  restitution_dollars_extracted: [],
};

// ── Core extraction (exported for tests) ─────────────────────────────────────
export function extractEntities(text) {
  if (!text || typeof text !== "string" || text.length < MIN_TEXT_LEN) {
    return EMPTY;
  }

  const officers = uniqMatchGroup1(text.matchAll(OFFICER_RE));

  // Witness: union of testified + label patterns, then subtract officers
  const allTestified = uniqMatchGroup1(text.matchAll(WITNESS_TESTIFIED_RE));
  const witnessLabel = uniqMatchGroup1(text.matchAll(WITNESS_LABEL_RE));
  const witnessSet = new Set([...allTestified, ...witnessLabel]);
  for (const o of officers) witnessSet.delete(o);
  const witnesses = Array.from(witnessSet);

  const experts = uniqMatchGroup1([
    ...text.matchAll(EXPERT_DR_RE),
    ...text.matchAll(EXPERT_WITNESS_RE),
  ]);

  const prosecutors = uniqMatchGroup1([
    ...text.matchAll(PROSECUTOR_ADA_RE),
    ...text.matchAll(PROSECUTOR_TITLE_RE),
  ]);

  const defense = uniqMatchGroup1(text.matchAll(DEFENSE_RE));

  // Sentence months: three sources merged
  const monthMatches = [...text.matchAll(SENTENCE_MONTHS_RE)].map((m) =>
    parseInt(m[1], 10)
  );
  const yearMatches = [...text.matchAll(SENTENCE_YEARS_RE)].map(
    (m) => parseInt(m[1], 10) * 12
  );
  const nmonthMatches = [...text.matchAll(SENTENCE_NMONTH_HYPHEN_RE)].map(
    (m) => parseInt(m[1], 10)
  );
  // Sane bounds: > 0 and < 1200 (100 years × 12)
  const sentence_months = uniqInts([
    ...monthMatches,
    ...yearMatches,
    ...nmonthMatches,
  ]).filter((n) => n > 0 && n < 1200);

  // Fines: alternation group1 OR group2
  const fines = [...text.matchAll(FINE_RE)]
    .map((m) => parseDollars(m[1] || m[2]))
    .filter(Boolean);
  const fine_dollars = uniqInts(fines);

  // Restitution: alternation group1 OR group2
  const restitutions = [...text.matchAll(RESTITUTION_RE)]
    .map((m) => parseDollars(m[1] || m[2]))
    .filter(Boolean);
  const restitution_dollars = uniqInts(restitutions);

  return {
    officer_names: officers,
    witness_names: witnesses,
    expert_witness_names: experts,
    prosecutor_names: prosecutors,
    defense_attorney_names: defense,
    sentence_months_extracted: sentence_months,
    fine_dollars_extracted: fine_dollars,
    restitution_dollars_extracted: restitution_dollars,
  };
}

// ── Batch UPDATE via VALUES + JOIN ───────────────────────────────────────────
async function flushBatch(batch) {
  if (batch.length === 0) return { applied: 0, errors: 0 };

  const valuesClauses = [];
  const params = [];
  let p = 1;

  for (const row of batch) {
    valuesClauses.push(
      "($" + p + "::bigint," +
      "$" + (p + 1) + "::text[]," +
      "$" + (p + 2) + "::text[]," +
      "$" + (p + 3) + "::text[]," +
      "$" + (p + 4) + "::text[]," +
      "$" + (p + 5) + "::text[]," +
      "$" + (p + 6) + "::int[]," +
      "$" + (p + 7) + "::bigint[]," +
      "$" + (p + 8) + "::bigint[])"
    );
    params.push(
      String(row.cluster_id),
      row.officer_names,
      row.witness_names,
      row.expert_witness_names,
      row.prosecutor_names,
      row.defense_attorney_names,
      row.sentence_months_extracted,
      row.fine_dollars_extracted,
      row.restitution_dollars_extracted
    );
    p += 9;
  }

  const sql =
    "UPDATE classified_opinions co SET " +
    "  officer_names             = v.officer_names," +
    "  witness_names             = v.witness_names," +
    "  expert_witness_names      = v.expert_witness_names," +
    "  prosecutor_names          = v.prosecutor_names," +
    "  defense_attorney_names    = v.defense_attorney_names," +
    "  sentence_months_extracted = v.sentence_months_extracted," +
    "  fine_dollars_extracted    = v.fine_dollars_extracted," +
    "  restitution_dollars_extracted = v.restitution_dollars_extracted," +
    "  entity_extractor_version  = '" + EXTRACTOR_VERSION + "'," +
    "  entities_extracted_at     = now() " +
    "FROM (VALUES " + valuesClauses.join(", ") + ") AS v(" +
    "  cluster_id, officer_names, witness_names, expert_witness_names," +
    "  prosecutor_names, defense_attorney_names, sentence_months_extracted," +
    "  fine_dollars_extracted, restitution_dollars_extracted" +
    ") " +
    "WHERE co.cluster_id::bigint = v.cluster_id";

  try {
    const result = await query(sql, params);
    return { applied: result.rowCount ?? batch.length, errors: 0 };
  } catch (e) {
    console.error("  Batch UPDATE error: " + e.message.slice(0, 300));
    return { applied: 0, errors: batch.length };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const applyMode = args.includes("--apply");

  if (!dryRun && !applyMode) {
    console.error(
      "Usage: node scripts/bulk-extract-opinion-entities.mjs --dry-run\n" +
      "       node scripts/bulk-extract-opinion-entities.mjs --apply [--limit N] [--chunk-size N] [--start-after-cluster N]"
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

  console.log("=== BULK OPINION ENTITY EXTRACTION ===\n");
  console.log(
    "Mode:              " +
      (dryRun
        ? "DRY RUN (no DB writes, first " + DRY_RUN_MAX_ROWS + " rows)"
        : "APPLY")
  );
  console.log("Extractor version: " + EXTRACTOR_VERSION);
  console.log("Chunk size:        " + chunkSize);
  console.log("Start after:       cluster_id > " + startAfter);
  console.log(
    "Limit:             " + (isFinite(processLimit) ? processLimit : "unlimited")
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
  let totalUpdated = 0;
  let totalErrors = 0;
  let chunkNum = 0;
  const startTime = Date.now();
  const fetchLimit = dryRun ? DRY_RUN_MAX_ROWS : chunkSize;

  try {
    while (true) {
      // In dry-run mode omit entity_extractor_version IS NULL — migration may
      // not have applied yet, so the column might not exist.
      const versionFilter = applyMode
        ? "  AND co.entity_extractor_version IS NULL "
        : "";

      const rows = await query(
        "SELECT co.cluster_id, cob.plain_text " +
          "FROM classified_opinions co " +
          "JOIN cl_opinion_bodies cob ON cob.cluster_id = co.cluster_id::bigint " +
          "WHERE co.cluster_id > $1 " +
          "  AND cob.plain_text IS NOT NULL " +
          "  AND length(cob.plain_text) > $2 " +
          versionFilter +
          "ORDER BY co.cluster_id " +
          "LIMIT $3",
        [lastClusterId, MIN_TEXT_LEN, fetchLimit]
      );

      if (rows.length === 0) {
        console.log("No more rows — done.");
        break;
      }

      chunkNum++;
      const batch = [];

      for (const row of rows) {
        const entities = extractEntities(row.plain_text);
        lastClusterId = row.cluster_id;
        totalRows++;

        if (dryRun) {
          const hasAny = Object.values(entities).some(
            (v) => Array.isArray(v) && v.length > 0
          );
          console.log(
            "cluster_id=" +
              row.cluster_id +
              " → " +
              (hasAny ? JSON.stringify(entities) : "(no entities found)")
          );
        } else {
          batch.push({ cluster_id: row.cluster_id, ...entities });
        }

        if (totalRows >= processLimit) break;
      }

      if (applyMode && batch.length > 0) {
        const { applied, errors } = await flushBatch(batch);
        totalUpdated += applied;
        totalErrors += errors;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          "chunk " +
            chunkNum +
            " → rows=" +
            rows.length +
            " updated=" +
            applied +
            " errors=" +
            errors +
            " last_id=" +
            lastClusterId +
            " total=" +
            totalRows +
            " elapsed=" +
            elapsed +
            "s"
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
