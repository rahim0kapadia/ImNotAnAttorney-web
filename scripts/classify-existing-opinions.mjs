/**
 * Classify existing 3,407 case_law opinions → classified_opinions table.
 *
 * Reads from case_law (promoted from statute_case_law via pipeline),
 * runs mechanical extraction, cross-validates, and inserts into
 * classified_opinions.
 *
 * Extraction uses fetched_holding + key_quote + holding text.
 * cluster_id is parsed from the CourtListener source_url path segments.
 * Jurisdiction is derived from the court name string.
 *
 * Usage:
 *   node scripts/classify-existing-opinions.mjs              # Dry-run (stats + SQL)
 *   node scripts/classify-existing-opinions.mjs --apply      # Write to DB
 *   node scripts/classify-existing-opinions.mjs --limit 100  # First N opinions
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { classifyOpinionType, getExtractionSteps } from "./lib/opinion-classifier.mjs";
import { extractAll } from "./lib/mechanical-extractor.mjs";
import { crossValidate } from "./lib/cross-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// Load SUPABASE_ACCESS_TOKEN
let supabaseToken = null;
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    const eqIdx = line.indexOf("=");
    supabaseToken = line.slice(eqIdx + 1).trim();
    break;
  }
}
if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

function supabaseQuery(sql) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: "/v1/projects/" + PROJECT_REF + "/database/query",
      method: "POST",
      headers: {
        Authorization: "Bearer " + supabaseToken,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, function (res) {
      let data = "";
      res.on("data", function (d) { data += d; });
      res.on("end", function () {
        if (res.statusCode >= 400) reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 300)));
        else { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "ARRAY[]::text[]";
  const escaped = arr.map(s => "'" + String(s).split("'").join("''") + "'");
  return "ARRAY[" + escaped.join(",") + "]::text[]";
}

function escJsonb(obj) {
  if (obj === null || obj === undefined) return "NULL";
  const json = JSON.stringify(obj);
  return "'" + json.split("'").join("''") + "'::jsonb";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Extract CourtListener cluster_id from a CL opinion URL without regex.
 * URL format: https://www.courtlistener.com/opinion/2789623/people-v-bosca/
 * Strategy: split on "/opinion/", take the segment after, split on "/", take first.
 */
function extractClusterIdFromUrl(url) {
  if (!url) return null;
  const MARKER = "/opinion/";
  const markerIdx = url.indexOf(MARKER);
  if (markerIdx < 0) return null;
  const afterMarker = url.slice(markerIdx + MARKER.length);
  const slashIdx = afterMarker.indexOf("/");
  const segment = slashIdx >= 0 ? afterMarker.slice(0, slashIdx) : afterMarker;
  if (!segment) return null;
  // Validate: must be all digits
  for (let i = 0; i < segment.length; i++) {
    const c = segment.charCodeAt(i);
    if (c < 48 || c > 57) return null;
  }
  return segment;
}

/**
 * Derive a 2-letter jurisdiction code from a court name string.
 * Uses substring search, no regex.
 */
const COURT_TO_JURISDICTION = [
  ["district of columbia", "dc"],
  ["west virginia", "wv"],
  ["new hampshire", "nh"],
  ["new jersey", "nj"],
  ["new mexico", "nm"],
  ["new york", "ny"],
  ["north carolina", "nc"],
  ["north dakota", "nd"],
  ["rhode island", "ri"],
  ["south carolina", "sc"],
  ["south dakota", "sd"],
  ["connecticut", "ct"],
  ["delaware", "de"],
  ["maryland", "md"],
  ["massachusetts", "ma"],
  ["minnesota", "mn"],
  ["mississippi", "ms"],
  ["missouri", "mo"],
  ["montana", "mt"],
  ["nebraska", "ne"],
  ["nevada", "nv"],
  ["alabama", "al"],
  ["alaska", "ak"],
  ["arizona", "az"],
  ["arkansas", "ar"],
  ["california", "ca"],
  ["colorado", "co"],
  ["florida", "fl"],
  ["georgia", "ga"],
  ["hawaii", "hi"],
  ["idaho", "id"],
  ["illinois", "il"],
  ["indiana", "in"],
  ["iowa", "ia"],
  ["kansas", "ks"],
  ["kentucky", "ky"],
  ["louisiana", "la"],
  ["maine", "me"],
  ["michigan", "mi"],
  ["ohio", "oh"],
  ["oklahoma", "ok"],
  ["oregon", "or"],
  ["pennsylvania", "pa"],
  ["tennessee", "tn"],
  ["texas", "tx"],
  ["utah", "ut"],
  ["vermont", "vt"],
  ["virginia", "va"],
  ["washington", "wa"],
  ["wisconsin", "wi"],
  ["wyoming", "wy"],
  ["united states", "federal"],
];

function deriveJurisdiction(courtName) {
  if (!courtName) return "federal";
  const lower = courtName.toLowerCase();
  for (let i = 0; i < COURT_TO_JURISDICTION.length; i++) {
    if (lower.indexOf(COURT_TO_JURISDICTION[i][0]) >= 0) return COURT_TO_JURISDICTION[i][1];
  }
  // Federal circuit courts and any other unmatched courts fall back to federal
  return "federal";
}

async function main() {
  console.log("=".repeat(60));
  console.log("CLASSIFY EXISTING CASE_LAW -> classified_opinions");
  console.log("Mode: " + (applyMode ? "APPLY" : "DRY-RUN"));
  console.log("=".repeat(60));

  // Load lookup tables
  const statuteRows = await supabaseQuery(
    "SELECT common_charge_slug, jurisdiction, statute_number FROM jurisdiction_statutes WHERE active = true AND statute_number IS NOT NULL"
  );
  const statuteMap = new Map();
  for (const row of statuteRows) {
    const key = (row.jurisdiction + ":" + row.statute_number).toLowerCase();
    statuteMap.set(key, { charge_slug: row.common_charge_slug, statute_number: row.statute_number });
  }
  console.log("Statute map: " + statuteMap.size + " entries");

  const theoryRows = await supabaseQuery(
    "SELECT charge_slug, theory_name, theory_keywords, motion_types FROM charge_defense_theories"
  );
  const theoryMap = new Map();
  for (const row of theoryRows) {
    if (!theoryMap.has(row.charge_slug)) theoryMap.set(row.charge_slug, []);
    theoryMap.get(row.charge_slug).push({
      theory_name: row.theory_name,
      theory_keywords: row.theory_keywords || [],
      motion_types: row.motion_types || [],
    });
  }
  console.log("Theory map: " + theoryMap.size + " charge types");

  // Load opinions with pagination (SQL LIMIT/OFFSET, PostgREST 1000-row cap workaround)
  let offset = 0;
  let totalProcessed = 0;
  let totalClassified = 0;
  let totalVerified = 0;
  let totalSkipped = 0;
  const allStatements = [];
  const PAGE_SIZE = 1000;

  while (true) {
    const opinions = await supabaseQuery(
      "SELECT id, case_name, court, holding, fetched_holding, key_quote, " +
      "source_url, verification_url, is_good_law, motion_types, attack_vectors " +
      "FROM case_law " +
      "WHERE source_url IS NOT NULL " +
      "ORDER BY id " +
      "LIMIT " + PAGE_SIZE + " OFFSET " + offset
    );

    if (!opinions || opinions.length === 0) break;

    for (const op of opinions) {
      if (totalProcessed >= limit) break;
      totalProcessed++;

      // Extract cluster_id from CourtListener URL (string split, no regex)
      const clusterId = extractClusterIdFromUrl(op.source_url) ||
                        extractClusterIdFromUrl(op.verification_url);
      if (!clusterId) {
        totalSkipped++;
        continue;
      }

      // Derive jurisdiction from court name (substring search, no regex)
      const jurisdiction = deriveJurisdiction(op.court);

      // Build available text from all text fields
      const textParts = [];
      if (op.fetched_holding && op.fetched_holding.trim()) textParts.push(op.fetched_holding);
      if (op.key_quote && op.key_quote.trim()) textParts.push(op.key_quote);
      if (op.holding && op.holding.trim()) textParts.push(op.holding);
      const availableText = textParts.join(" ");

      const classification = classifyOpinionType(availableText);
      const steps = getExtractionSteps(classification.type);

      const extracted = extractAll({
        text: availableText,
        jurisdiction: jurisdiction,
        opinionType: classification.type,
        extractionSteps: steps,
        statuteMap,
        theoryMap,
        isGoodLaw: op.is_good_law,
      });

      // Merge any existing motion_types from case_law into extracted
      if (op.motion_types && Array.isArray(op.motion_types)) {
        for (const mt of op.motion_types) {
          if (mt && extracted.motion_types.indexOf(mt) < 0) {
            extracted.motion_types.push(mt);
          }
        }
      }

      // Merge attack_vectors as defense_theories
      if (op.attack_vectors && Array.isArray(op.attack_vectors)) {
        for (const av of op.attack_vectors) {
          if (av && extracted.defense_theories.indexOf(av) < 0) {
            extracted.defense_theories.push(av);
          }
        }
      }

      const validation = crossValidate(extracted, {
        nature_of_suit: null,
        court: op.court,
        jurisdiction: jurisdiction,
        docketCharges: [],
      });

      if (validation.confidence === "verified") totalVerified++;

      // Build source_urls list
      const sourceUrls = [];
      if (op.source_url) sourceUrls.push(op.source_url);
      if (op.verification_url && op.verification_url !== op.source_url) {
        sourceUrls.push(op.verification_url);
      }

      // Prefer fetched_holding as canonical holding text
      const holdingText = op.fetched_holding || op.key_quote || op.holding || null;

      const sql = "INSERT INTO classified_opinions " +
        "(cluster_id, case_name, court, jurisdiction, opinion_type, " +
        "charge_types, motion_types, defense_theories, motion_outcomes, " +
        "motion_favorability, case_favorability, holding_text, " +
        "is_good_law, classification_confidence, cross_validation_signals, " +
        "classified_by, source_urls) VALUES (" +
        esc(clusterId) + ", " +
        esc(op.case_name) + ", " +
        esc(op.court || "unknown") + ", " +
        esc(jurisdiction) + ", " +
        esc(classification.type) + ", " +
        escArray(extracted.charge_types) + ", " +
        escArray(extracted.motion_types) + ", " +
        escArray(extracted.defense_theories) + ", " +
        escJsonb(extracted.motion_outcomes) + ", " +
        escJsonb(extracted.motion_favorability) + ", " +
        (extracted.case_favorability !== null ? extracted.case_favorability : "NULL") + ", " +
        esc(holdingText) + ", " +
        (op.is_good_law !== null ? op.is_good_law : "NULL") + ", " +
        esc(validation.confidence) + ", " +
        escJsonb(validation.signals) + ", " +
        "'mechanical_pipeline_phase1', " +
        escArray(sourceUrls) +
        ") ON CONFLICT (cluster_id) DO UPDATE SET " +
        "case_name = EXCLUDED.case_name, " +
        "court = EXCLUDED.court, " +
        "jurisdiction = EXCLUDED.jurisdiction, " +
        "charge_types = EXCLUDED.charge_types, " +
        "motion_types = EXCLUDED.motion_types, " +
        "defense_theories = EXCLUDED.defense_theories, " +
        "motion_outcomes = EXCLUDED.motion_outcomes, " +
        "motion_favorability = EXCLUDED.motion_favorability, " +
        "case_favorability = EXCLUDED.case_favorability, " +
        "holding_text = EXCLUDED.holding_text, " +
        "classification_confidence = EXCLUDED.classification_confidence, " +
        "cross_validation_signals = EXCLUDED.cross_validation_signals, " +
        "classified_at = now(), " +
        "updated_at = now();";

      allStatements.push(sql);
      totalClassified++;
    }

    offset += PAGE_SIZE;
    if (totalProcessed >= limit) break;
    console.log("  Processed " + totalProcessed + "...");
  }

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log("Total processed: " + totalProcessed);
  console.log("Skipped (no cluster_id): " + totalSkipped);
  console.log("Total classified: " + totalClassified);
  console.log("Verified: " + totalVerified + " (" + Math.round(totalVerified / Math.max(totalClassified, 1) * 100) + "%)");

  // Save SQL
  const sqlPath = path.join(PROJECT_ROOT, "data", "defense-intelligence", "classify-existing-opinions.sql");
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.writeFileSync(sqlPath, allStatements.join("\n"));
  console.log("SQL written to: " + sqlPath + " (" + allStatements.length + " statements)");

  if (applyMode) {
    console.log("\nApplying in batches of " + BATCH_SIZE + "...");
    for (let i = 0; i < allStatements.length; i += BATCH_SIZE) {
      const batch = allStatements.slice(i, i + BATCH_SIZE).join("\n");
      try {
        await supabaseQuery(batch);
        console.log("  Applied batch " + Math.floor(i / BATCH_SIZE + 1) + " (" + Math.min(i + BATCH_SIZE, allStatements.length) + "/" + allStatements.length + ")");
      } catch (err) {
        console.error("  Batch " + Math.floor(i / BATCH_SIZE + 1) + " failed:", err.message);
      }
      if (i + BATCH_SIZE < allStatements.length) await sleep(1000);
    }

    // Verify count
    const countResult = await supabaseQuery("SELECT count(*) as cnt FROM classified_opinions");
    console.log("\nclassified_opinions row count: " + (countResult[0]?.cnt || "unknown"));
  } else {
    console.log("\nRun with --apply to insert into classified_opinions.");
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
