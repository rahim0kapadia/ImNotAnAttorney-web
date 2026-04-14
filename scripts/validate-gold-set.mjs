/**
 * Gold-Set Evaluation — Phase 0B
 *
 * Selects 200 opinions from the existing case_law table, runs the mechanical
 * extraction pipeline, and compares against human-labeled ground truth.
 *
 * Phase 0 is a GO/NO-GO gate. The pipeline must achieve 90%+ field-level
 * agreement before Phase 1 classification begins.
 *
 * Usage:
 *   node scripts/validate-gold-set.mjs                        # Run evaluation
 *   node scripts/validate-gold-set.mjs --sample 50            # Use smaller sample
 *   node scripts/validate-gold-set.mjs --load-labels FILE     # Load pre-labeled JSON
 *   node scripts/validate-gold-set.mjs --save-results FILE    # Save results to file
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

const args = process.argv.slice(2);
const sampleIdx = args.indexOf("--sample");
const sampleSize = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 200;
const labelsIdx = args.indexOf("--load-labels");
const labelsFile = labelsIdx >= 0 ? args[labelsIdx + 1] : null;
const saveIdx = args.indexOf("--save-results");
const savePath = saveIdx >= 0 ? args[saveIdx + 1] : null;

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

async function loadStatuteMap() {
  const rows = await supabaseQuery(
    "SELECT common_charge_slug, jurisdiction, statute_number FROM jurisdiction_statutes WHERE active = true AND statute_number IS NOT NULL"
  );
  const map = new Map();
  for (const row of rows) {
    const key = (row.jurisdiction + ":" + row.statute_number).toLowerCase();
    map.set(key, { charge_slug: row.common_charge_slug, statute_number: row.statute_number });
  }
  console.log("Statute map loaded: " + map.size + " entries");
  return map;
}

async function loadTheoryMap() {
  const rows = await supabaseQuery(
    "SELECT charge_slug, theory_name, theory_keywords, motion_types FROM charge_defense_theories"
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.charge_slug)) map.set(row.charge_slug, []);
    map.get(row.charge_slug).push({
      theory_name: row.theory_name,
      theory_keywords: row.theory_keywords || [],
      motion_types: row.motion_types || [],
    });
  }
  console.log("Theory map loaded: " + map.size + " charge types, " + rows.length + " theories");
  return map;
}

async function loadSampleOpinions(limit) {
  const rows = await supabaseQuery(
    "SELECT scl.courtlistener_cluster_id as cluster_id, scl.case_name, scl.court, " +
    "js.jurisdiction, scl.is_good_law, scl.source_urls " +
    "FROM statute_case_law scl " +
    "JOIN jurisdiction_statutes js ON js.id = scl.jurisdiction_statute_id " +
    "WHERE scl.courtlistener_cluster_id IS NOT NULL " +
    "ORDER BY random() LIMIT " + limit
  );
  console.log("Sample opinions loaded: " + rows.length);
  return rows;
}

function computeFieldAccuracy(predicted, actual, fieldName) {
  if (!actual || actual.length === 0) return { accuracy: null, field: fieldName, note: "no ground truth" };

  if (Array.isArray(predicted) && Array.isArray(actual)) {
    const predSet = new Set(predicted);
    const actualSet = new Set(actual);
    let intersection = 0;
    for (const item of actualSet) { if (predSet.has(item)) intersection++; }
    const union = new Set([...predSet, ...actualSet]).size;
    return {
      accuracy: union > 0 ? intersection / union : 1.0,
      field: fieldName,
      predicted: predicted.length,
      actual: actual.length,
      intersection,
    };
  }

  return {
    accuracy: predicted === actual ? 1.0 : 0.0,
    field: fieldName,
    predicted,
    actual,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("DEFENSE INTELLIGENCE — GOLD-SET EVALUATION (Phase 0B)");
  console.log("Sample size: " + sampleSize);
  console.log("=".repeat(60));

  const [statuteMap, theoryMap] = await Promise.all([
    loadStatuteMap(),
    loadTheoryMap(),
  ]);

  const opinions = await loadSampleOpinions(sampleSize);

  if (opinions.length === 0) {
    console.error("No opinions found in case_law table. Cannot proceed.");
    process.exit(1);
  }

  let goldLabels = null;
  if (labelsFile) {
    goldLabels = JSON.parse(fs.readFileSync(labelsFile, "utf8"));
    console.log("Gold-set labels loaded: " + goldLabels.length + " entries");
  }

  console.log("\nRunning mechanical extraction on " + opinions.length + " opinions...\n");
  const results = [];
  let verifiedCount = 0;
  let lowConfidenceCount = 0;
  const fieldAccuracies = { charge_types: [], motion_types: [], defense_theories: [], motion_outcomes: [] };

  for (const opinion of opinions) {
    const opinionClassification = classifyOpinionType("");
    const extractionSteps = getExtractionSteps(opinionClassification.type);

    const extracted = extractAll({
      text: "",
      jurisdiction: opinion.jurisdiction,
      opinionType: opinionClassification.type,
      extractionSteps,
      statuteMap,
      theoryMap,
      isGoodLaw: opinion.is_good_law,
    });

    const validation = crossValidate(extracted, {
      nature_of_suit: null,
      court: opinion.court,
      jurisdiction: opinion.jurisdiction,
      docketCharges: [],
    });

    if (validation.confidence === "verified") verifiedCount++;
    else lowConfidenceCount++;

    const result = {
      cluster_id: opinion.cluster_id,
      case_name: opinion.case_name,
      jurisdiction: opinion.jurisdiction,
      extracted,
      confidence: validation.confidence,
      signals: validation.signals,
    };

    if (goldLabels) {
      const gold = goldLabels.find(g => g.cluster_id === opinion.cluster_id);
      if (gold) {
        result.accuracy = {
          charge_types: computeFieldAccuracy(extracted.charge_types, gold.charge_types, "charge_types"),
          motion_types: computeFieldAccuracy(extracted.motion_types, gold.motion_types, "motion_types"),
          defense_theories: computeFieldAccuracy(extracted.defense_theories, gold.defense_theories, "defense_theories"),
        };
        for (const field of Object.keys(result.accuracy)) {
          if (result.accuracy[field].accuracy !== null) {
            fieldAccuracies[field].push(result.accuracy[field].accuracy);
          }
        }
      }
    }

    results.push(result);
  }

  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION RESULTS");
  console.log("=".repeat(60));
  console.log("Total opinions: " + results.length);
  console.log("Verified: " + verifiedCount + " (" + Math.round(verifiedCount / results.length * 100) + "%)");
  console.log("Low confidence: " + lowConfidenceCount + " (" + Math.round(lowConfidenceCount / results.length * 100) + "%)");

  if (goldLabels) {
    console.log("\nPer-field accuracy:");
    for (const [field, accuracies] of Object.entries(fieldAccuracies)) {
      if (accuracies.length === 0) { console.log("  " + field + ": no data"); continue; }
      const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
      console.log("  " + field + ": " + (avg * 100).toFixed(1) + "% (N=" + accuracies.length + ")");
    }

    const allAccuracies = Object.values(fieldAccuracies).flat();
    if (allAccuracies.length > 0) {
      const overall = allAccuracies.reduce((a, b) => a + b, 0) / allAccuracies.length;
      console.log("\nOverall accuracy: " + (overall * 100).toFixed(1) + "%");
      console.log(overall >= 0.9 ? "GO — Pipeline passes 90% threshold" : "NO-GO — Below 90% threshold. Debug extraction rules before Phase 1.");
    }
  } else {
    console.log("\nNo gold-set labels provided. Run with --load-labels <file> to compute accuracy.");
    console.log("Generate labels template: use cluster_ids above to manually label 200 opinions.");
  }

  // Log to pipeline_accuracy_log
  const logSql = "INSERT INTO pipeline_accuracy_log (evaluation_date, evaluation_type, sample_size, " +
    "per_field_accuracy, overall_accuracy, evaluated_by, notes) VALUES (" +
    "'" + new Date().toISOString().slice(0, 10) + "', " +
    "'phase0b_gold_set', " +
    results.length + ", " +
    "'" + JSON.stringify(fieldAccuracies).split("'").join("''") + "'::jsonb, " +
    "NULL, " +
    "'mechanical_pipeline', " +
    "'Phase 0B evaluation — " + (goldLabels ? "with labels" : "structure only") + "'" +
    ");";

  try {
    await supabaseQuery(logSql);
    console.log("\nResults logged to pipeline_accuracy_log.");
  } catch (err) {
    console.error("Failed to log results:", err.message);
  }

  if (savePath) {
    fs.writeFileSync(savePath, JSON.stringify(results, null, 2));
    console.log("Results saved to: " + savePath);
  }

  const idsPath = path.join(PROJECT_ROOT, "data", "defense-intelligence", "gold-set-cluster-ids.json");
  fs.mkdirSync(path.dirname(idsPath), { recursive: true });
  fs.writeFileSync(idsPath, JSON.stringify(
    results.map(r => ({ cluster_id: r.cluster_id, case_name: r.case_name, jurisdiction: r.jurisdiction })),
    null, 2
  ));
  console.log("Cluster IDs saved to: " + idsPath);
  console.log("Use these to create manual labels for gold-set evaluation.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
