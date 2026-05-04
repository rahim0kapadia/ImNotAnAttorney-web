// ============================================================================
// DEPRECATED 2026-05-04 - DO NOT RUN. csv-parse over 50 GB opinions bz2 is
// broken: relax_quotes:true silently shifts trailing columns when legal text
// contains unquoted commas, corrupting cluster_id and other columns. Same bug
// class that broke T5, T6 smoke, and Phase 1 of bulk-master-extractor.
//
// REPLACEMENT (DB-first; uses cl_opinion_bodies, no parser):
//   node scripts/bulk-extract-charge-types.mjs --apply
//
// Predecessor PRs: #309 (T6), #312 (Phase 1), #313 (Phase 0).
// To run anyway (emergency rollback only): pass --allow-deprecated.
// ============================================================================

/**
 * Bulk Classify Opinions from Filtered CSV, Phase 2 Pipeline
 *
 * Streams data/bulk-verify/cl-bulk/opinions-filtered.csv (10,839 records,
 * 1,667 with substantial plain_text), runs mechanical extraction +
 * cross-validation, UPSERTs to classified_opinions.
 *
 * Enriches existing 1,009 rows (from Task 8 DB-holding classification) and
 * adds new rows for opinions with full text.
 *
 * Usage:
 *   node scripts/bulk-classify-from-csv.mjs --dry-run   # Stats only
 *   node scripts/bulk-classify-from-csv.mjs --apply     # Write to DB
 *
 * Dependencies:
 *   npm install csv-parse
 *   scripts/lib/opinion-classifier.mjs
 *   scripts/lib/mechanical-extractor.mjs
 *   scripts/lib/cross-validator.mjs
 */

// Deprecation guard - see banner above.
if (!process.argv.includes('--allow-deprecated')) {
  console.error('');
  console.error('[DEPRECATED] bulk-classify-from-csv.mjs - see header banner.');
  console.error('  Use: node scripts/bulk-extract-charge-types.mjs --apply');
  console.error('  To run anyway (emergency only): pass --allow-deprecated');
  console.error('');
  process.exit(1);
}

import fs from "fs";
import path from "path";
import https from "https";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

import { classifyOpinionType, getExtractionSteps } from "./lib/opinion-classifier.mjs";
import { extractAll } from "./lib/mechanical-extractor.mjs";
import { crossValidate } from "./lib/cross-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;
const MIN_TEXT_LEN = 500;

const CSV_PATH = path.join(
  PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-filtered.csv"
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");

// ── Token loading ────────────────────────────────────────────────────────────
// Use .split("=").slice(1).join("=") to handle JWT keys that contain "="
let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  const envPath = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.split("=").slice(1).join("=").trim();
      return;
    }
  }
  throw new Error("SUPABASE_ACCESS_TOKEN not found in ImNotAnAttorney/.env.local");
}

// ── Management API query ─────────────────────────────────────────────────────
function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: "/v1/projects/" + PROJECT_REF + "/database/query",
        method: "POST",
        headers: {
          Authorization: "Bearer " + supabaseToken,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 400)));
          } else {
            try { resolve(JSON.parse(data)); } catch { resolve(data); }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── SQL escaping ─────────────────────────────────────────────────────────────
function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escArr(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const inner = arr.map((v) => '"' + String(v).split('"').join('\\"') + '"').join(",");
  return "'{" + inner + "}'";
}

function escJsonb(obj) {
  if (!obj) return "NULL";
  return esc(JSON.stringify(obj));
}

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

// ── Jurisdiction heuristic from text ─────────────────────────────────────────
// State name → two-letter code. No regex, indexOf scanning.
const STATE_PATTERNS = [
  ["florida", "fl"], ["california", "ca"], ["texas", "tx"], ["new york", "ny"],
  ["illinois", "il"], ["pennsylvania", "pa"], ["ohio", "oh"], ["georgia", "ga"],
  ["north carolina", "nc"], ["michigan", "mi"], ["new jersey", "nj"],
  ["virginia", "va"], ["washington", "wa"], ["arizona", "az"], ["massachusetts", "ma"],
  ["tennessee", "tn"], ["indiana", "in"], ["missouri", "mo"], ["maryland", "md"],
  ["wisconsin", "wi"], ["colorado", "co"], ["minnesota", "mn"], ["south carolina", "sc"],
  ["alabama", "al"], ["louisiana", "la"], ["kentucky", "ky"], ["oregon", "or"],
  ["oklahoma", "ok"], ["connecticut", "ct"], ["utah", "ut"], ["iowa", "ia"],
  ["nevada", "nv"], ["arkansas", "ar"], ["mississippi", "ms"], ["kansas", "ks"],
  ["new mexico", "nm"], ["nebraska", "ne"], ["idaho", "id"], ["west virginia", "wv"],
  ["hawaii", "hi"], ["new hampshire", "nh"], ["maine", "me"], ["montana", "mt"],
  ["rhode island", "ri"], ["delaware", "de"], ["south dakota", "sd"],
  ["north dakota", "nd"], ["alaska", "ak"], ["vermont", "vt"], ["wyoming", "wy"],
];

function deriveJurisdictionFromText(text) {
  if (!text) return null;
  const lower = text.slice(0, 2000).toLowerCase(); // Only scan header
  for (const [name, code] of STATE_PATTERNS) {
    if (lower.indexOf(name) >= 0) return code;
  }
  return null;
}

// ── Load statute map from DB ──────────────────────────────────────────────────
// Returns Map<"jurisdiction:statute_number_lower", {charge_slug, statute_number}>
async function loadStatuteMap() {
  console.log("Loading statute map from jurisdiction_statutes...");
  const rows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const sql = "SELECT jurisdiction, statute_number, common_charge_slug AS charge_slug FROM jurisdiction_statutes " +
                "WHERE common_charge_slug IS NOT NULL AND statute_number IS NOT NULL " +
                "ORDER BY jurisdiction, statute_number " +
                "LIMIT " + PAGE + " OFFSET " + offset;
    const result = await supabaseQuery(sql);
    const page = Array.isArray(result) ? result : (result.rows || []);
    if (page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const map = new Map();
  for (const r of rows) {
    if (!r.jurisdiction || !r.statute_number || !r.charge_slug) continue;
    const key = (r.jurisdiction + ":" + r.statute_number).toLowerCase();
    map.set(key, { charge_slug: r.charge_slug, statute_number: r.statute_number });
  }
  console.log("  Statute map: " + map.size + " entries");
  return map;
}

// ── Load theory map from DB ───────────────────────────────────────────────────
// Returns Map<charge_slug, [{theory_name, theory_keywords[], motion_types[]}]>
async function loadTheoryMap() {
  console.log("Loading theory map from charge_defense_theories...");
  const rows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const sql = "SELECT charge_slug, theory_name, theory_keywords, motion_types " +
                "FROM charge_defense_theories " +
                "ORDER BY charge_slug, theory_name " +
                "LIMIT " + PAGE + " OFFSET " + offset;
    const result = await supabaseQuery(sql);
    const page = Array.isArray(result) ? result : (result.rows || []);
    if (page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

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
  console.log("  Theory map: " + map.size + " charge slugs");
  return map;
}

// ── Load existing cluster_id → jurisdiction from classified_opinions ──────────
async function loadExistingJurisdictions() {
  console.log("Loading existing jurisdictions from classified_opinions...");
  const rows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const sql = "SELECT cluster_id, jurisdiction FROM classified_opinions " +
                "ORDER BY cluster_id LIMIT " + PAGE + " OFFSET " + offset;
    const result = await supabaseQuery(sql);
    const page = Array.isArray(result) ? result : (result.rows || []);
    if (page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const map = new Map();
  for (const r of rows) {
    if (r.cluster_id && r.jurisdiction) map.set(String(r.cluster_id), r.jurisdiction);
  }
  console.log("  Existing jurisdictions: " + map.size + " clusters");
  return map;
}

// ── Build UPSERT SQL for one classified opinion ───────────────────────────────
function buildUpsert(params) {
  const {
    cluster_id, case_name, court, jurisdiction, decision_date,
    opinion_type, extracted, confidence, signals, source_url,
  } = params;

  const cols = [
    "cluster_id", "case_name", "court", "jurisdiction", "decision_date",
    "opinion_type", "charge_types", "motion_types", "defense_theories",
    "motion_outcomes", "motion_favorability", "case_favorability", "holding_text",
    "is_good_law", "classification_confidence", "cross_validation_signals",
    "classified_at", "classified_by", "source_urls", "updated_at",
  ];

  const vals = [
    esc(String(cluster_id)),
    esc((case_name || "").slice(0, 500)),
    esc((court || "").slice(0, 200)),
    esc(jurisdiction || "unknown"),
    decision_date ? esc(decision_date) : "NULL",
    esc(opinion_type),
    escArr(extracted.charge_types),
    escArr(extracted.motion_types),
    escArr(extracted.defense_theories),
    escJsonb(extracted.motion_outcomes),
    escJsonb(extracted.motion_favorability),
    extracted.case_favorability !== null && extracted.case_favorability !== undefined
      ? String(extracted.case_favorability)
      : "NULL",
    extracted.holding_text ? esc(extracted.holding_text.slice(0, 2000)) : "NULL",
    "true",
    esc(confidence),
    escJsonb(signals),
    "now()",
    "'bulk_csv_phase2'",
    "ARRAY[" + esc(source_url) + "]",
    "now()",
  ];

  // ON CONFLICT: update all extractable fields; preserve case_name/court/jurisdiction
  // from existing row if they have real values (COALESCE keeps existing non-empty)
  const updates = [
    "opinion_type = EXCLUDED.opinion_type",
    "charge_types = CASE WHEN array_length(EXCLUDED.charge_types, 1) > 0 THEN EXCLUDED.charge_types ELSE classified_opinions.charge_types END",
    "motion_types = CASE WHEN array_length(EXCLUDED.motion_types, 1) > 0 THEN EXCLUDED.motion_types ELSE classified_opinions.motion_types END",
    "defense_theories = CASE WHEN array_length(EXCLUDED.defense_theories, 1) > 0 THEN EXCLUDED.defense_theories ELSE classified_opinions.defense_theories END",
    "motion_outcomes = COALESCE(EXCLUDED.motion_outcomes, classified_opinions.motion_outcomes)",
    "motion_favorability = COALESCE(EXCLUDED.motion_favorability, classified_opinions.motion_favorability)",
    "case_favorability = COALESCE(EXCLUDED.case_favorability, classified_opinions.case_favorability)",
    "holding_text = COALESCE(EXCLUDED.holding_text, classified_opinions.holding_text)",
    "classification_confidence = EXCLUDED.classification_confidence",
    "cross_validation_signals = EXCLUDED.cross_validation_signals",
    "classified_by = EXCLUDED.classified_by",
    "source_urls = array_cat(classified_opinions.source_urls, EXCLUDED.source_urls)",
    "updated_at = now()",
  ];

  return (
    "INSERT INTO classified_opinions (" + cols.join(", ") + ") " +
    "VALUES (" + vals.join(", ") + ") " +
    "ON CONFLICT (cluster_id) DO UPDATE SET " +
    updates.join(", ") + ";"
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== BULK CLASSIFY FROM OPINIONS-FILTERED CSV (Phase 2) ===\n");

  if (!fs.existsSync(CSV_PATH)) {
    console.error("ERROR: CSV not found: " + CSV_PATH);
    process.exit(1);
  }

  loadToken();

  // Load reference maps from DB (one streamer at a time, OOM gotcha)
  const [statuteMap, theoryMap, existingJurisdictions] = await Promise.all([
    loadStatuteMap(),
    loadTheoryMap(),
    loadExistingJurisdictions(),
  ]);

  console.log("\nStreaming " + CSV_PATH + " ...\n");

  const fileStream = fs.createReadStream(CSV_PATH);

  // CL CSV: backslash-escaped quotes in legal text, relax_column_count for
  // rows with extra/missing delimiters, relax_quotes for unescaped inner quotes
  const parser = fileStream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      escape: "\\",
      relax_column_count: true,
      relax_quotes: true,
    })
  );

  const upserts = [];
  let rowCount = 0;
  let skippedNoText = 0;
  let processed = 0;
  let withCharges = 0;
  let withMotions = 0;
  let withTheories = 0;
  let verified = 0;
  let lowConfidence = 0;

  // Stats by opinion type
  const typeCounts = { full: 0, memorandum: 0, pca: 0, order: 0 };

  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;

      // CL CSVs quote ALL values, strip surrounding quotes before using
      const cluster_id = (record.cluster_id || "").split('"').join("").trim();
      if (!cluster_id) { skippedNoText++; continue; }

      // Prefer plain_text; fall back to HTML variants
      let text = record.plain_text || "";
      let usedHtml = false;

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
            usedHtml = true;
            break;
          }
        }
      }

      if (text.length < MIN_TEXT_LEN) {
        skippedNoText++;
        continue;
      }

      processed++;

      // Derive jurisdiction: existing DB rows first, then text heuristic
      let jurisdiction = existingJurisdictions.get(cluster_id) || null;
      if (!jurisdiction) {
        jurisdiction = deriveJurisdictionFromText(text) ||
                       deriveJurisdictionFromText(record.author_str || "") ||
                       "unknown";
      }

      // Classify opinion type
      const { type: opinion_type } = classifyOpinionType(text);
      typeCounts[opinion_type] = (typeCounts[opinion_type] || 0) + 1;
      const extractionSteps = getExtractionSteps(opinion_type);

      // Extract
      const extracted = extractAll({
        text,
        jurisdiction,
        opinionType: opinion_type,
        extractionSteps,
        statuteMap,
        theoryMap,
        isGoodLaw: true, // Default; bulk-is-good-law.mjs refines this separately
      });

      // Cross-validate
      const { confidence, signals } = crossValidate(extracted, {
        nature_of_suit: null,
        court: record.author_str || "",
        jurisdiction,
        docketCharges: [],
      });

      // Stats
      if (extracted.charge_types.length > 0) withCharges++;
      if (extracted.motion_types.length > 0) withMotions++;
      if (extracted.defense_theories.length > 0) withTheories++;
      if (confidence === "verified") verified++;
      else lowConfidence++;

      // Build case_name from author_str + type (CL opinions CSV doesn't carry
      // case_name, cluster CSV does. We use a placeholder that the existing row
      // from Task 8 will keep via COALESCE in the ON CONFLICT clause.)
      const case_name = "cluster:" + cluster_id;

      // court field from author_str (closest available in opinions CSV)
      const court = (record.author_str || "unknown").slice(0, 200);

      // decision_date from date_created (best available in opinions CSV)
      const decision_date = record.date_created
        ? record.date_created.slice(0, 10)
        : null;

      // Source URL built from cluster_id per CL URL convention
      const source_url = "https://www.courtlistener.com/opinion/" + cluster_id + "/";

      upserts.push(
        buildUpsert({
          cluster_id,
          case_name,
          court,
          jurisdiction,
          decision_date,
          opinion_type,
          extracted,
          confidence,
          signals,
          source_url,
        })
      );

      if (processed % 200 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        process.stdout.write(
          "  " + processed + " processed, " + upserts.length + " upserts queued (" + elapsed + "s)\n"
        );
      }
    }
  } catch (parseErr) {
    console.log(
      "\n  CSV parse error at row " + rowCount +
      " (continuing with collected data): " + parseErr.message.slice(0, 150)
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n--- Streaming complete (" + elapsed + "s) ---");
  console.log("Total rows:        " + rowCount);
  console.log("Skipped (no text): " + skippedNoText);
  console.log("Processed:         " + processed);
  console.log("Upserts queued:    " + upserts.length);
  console.log("\nOpinion types:");
  for (const [t, c] of Object.entries(typeCounts)) {
    console.log("  " + t + ": " + c);
  }
  console.log("\nExtraction stats:");
  console.log("  With charge types:   " + withCharges);
  console.log("  With motion types:   " + withMotions);
  console.log("  With defense theory: " + withTheories);
  console.log("  Confidence verified: " + verified);
  console.log("  Low confidence:      " + lowConfidence);

  if (dryRun || upserts.length === 0) {
    if (dryRun) console.log("\nDry run, no DB writes.");
    else console.log("\nNo upserts to apply.");
    return;
  }

  if (!applyMode) {
    console.log("\nPass --apply to write to DB, or --dry-run for stats only.");
    return;
  }

  // ── Apply in batches ─────────────────────────────────────────────────────
  console.log("\n--- Applying " + upserts.length + " upserts in batches of " + BATCH_SIZE + " ---\n");

  let applied = 0;
  let errors = 0;
  const applyStart = Date.now();
  const totalBatches = Math.ceil(upserts.length / BATCH_SIZE);

  for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
    const batch = upserts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(
        "  Batch " + batchNum + "/" + totalBatches +
        ": " + batch.length + " rows, " + rate + "/sec\n"
      );
    } catch (e) {
      errors++;
      console.error("  Batch " + batchNum + " ERROR: " + e.message.slice(0, 250));
      // Retry once on rate-limit
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          errors--;
          console.log("  Batch " + batchNum + " retry succeeded.");
        } catch (e2) {
          console.error("  Batch " + batchNum + " retry failed: " + e2.message.slice(0, 150));
        }
      }
    }
    if (i + BATCH_SIZE < upserts.length) await sleep(300);
  }

  const totalElapsed = ((Date.now() - applyStart) / 1000).toFixed(1);
  console.log("\n--- Results ---");
  console.log("Applied: " + applied + "  Errors: " + errors + "  Time: " + totalElapsed + "s");
  console.log(
    "\nNext step: node scripts/compute-pattern-tables.mjs --apply"
  );
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
