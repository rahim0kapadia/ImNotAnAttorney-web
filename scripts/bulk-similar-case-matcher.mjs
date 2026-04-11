/**
 * Bulk k-NN Similar Case Matcher
 *
 * Builds feature vectors from existing DB case law data and computes k-NN
 * similar cases for storage in the case_feature_vectors table.
 *
 * Features extracted:
 *   - jurisdiction (state code)
 *   - court_level (supreme, appellate, federal, trial)
 *   - year_bucket (2020s, 2010s, 2000s, 1990s, older)
 *   - party_side (DEFENSE, PROSECUTION, null)
 *   - outcome (FAVORABLE, UNFAVORABLE, null)
 *   - motion_types[] (overlap scored via Jaccard similarity)
 *   - legal_issues[] (overlap scored via Jaccard similarity)
 *   - benefit_type (procedural, substantive, null)
 *   - neighbors[] (top 10 similar cases with similarity scores)
 *
 * O(n^2) k-NN: ~3,407 good-law cases → ~11.6M comparisons, <30sec
 *
 * Prerequisites:
 *   - verified_case_law rows with is_good_law=true
 *   - case_feature_vectors table exists (migration applied)
 *   - SUPABASE_SERVICE_ROLE_KEY from .env.local
 *   - SUPABASE_ACCESS_TOKEN from parent ImNotAnAttorney/.env.local
 *
 * Usage:
 *   node scripts/bulk-similar-case-matcher.mjs              # Generate SQL only
 *   node scripts/bulk-similar-case-matcher.mjs --apply      # Generate + apply
 *   node scripts/bulk-similar-case-matcher.mjs --dry-run    # Stats only
 *   node scripts/bulk-similar-case-matcher.mjs --limit 100  # First N cases
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const SUPABASE_URL = "https://jxjbjmgdukwkoclydqdr.supabase.co";
const BATCH_SIZE = 100;
const K_NEIGHBORS = 10;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Helper functions ────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escJsonb(obj) {
  if (!obj) return "NULL";
  const json = JSON.stringify(obj);
  const escaped = json.split("\\").join("\\\\").split("'").join("''");
  return `'${escaped}'::jsonb`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let supabaseToken = null;
let serviceRoleKey = null;

function loadTokens() {
  if (supabaseToken && serviceRoleKey) return;

  // Parent token from ImNotAnAttorney/.env.local
  const parentEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"),
    "utf8"
  );
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
    }
  }

  // Service role key from ImNotAnAttorney-web/.env.local
  const webEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, ".env.local"),
    "utf8"
  );
  for (const line of webEnv.split("\n")) {
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      serviceRoleKey = line.slice(26).trim();
    }
  }

  if (!supabaseToken) throw new Error("SUPABASE_ACCESS_TOKEN not found in parent/.env.local");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
          } else {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function restQuery(endpoint, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
        path: endpoint,
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`REST ${res.statusCode}: ${data.slice(0, 300)}`));
          } else {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Feature vector building ─────────────────────────────────────────────────

function extractJurisdiction(courtName) {
  if (!courtName) return null;
  const upper = courtName.toUpperCase();

  // Common state patterns (case-insensitive)
  const states = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  ];

  for (const state of states) {
    if (upper.indexOf(state) >= 0) return state;
  }

  // Fall back to two-letter extraction if pattern not matched
  const match = upper.match(/\b([A-Z]{2})\b/);
  return match ? match[1] : null;
}

function classifyCourtLevel(courtName) {
  if (!courtName) return "trial";
  const lower = courtName.toLowerCase();

  if (lower.indexOf("supreme") >= 0) return "supreme";
  if (lower.indexOf("appellate") >= 0 || lower.indexOf("appeal") >= 0) return "appellate";
  if (lower.indexOf("circuit") >= 0) {
    if (lower.indexOf("u.s.") >= 0 || lower.indexOf("federal") >= 0) return "federal";
    return "appellate"; // state circuit
  }
  if (lower.indexOf("district") >= 0) return lower.indexOf("federal") >= 0 ? "federal" : "trial";

  return "trial";
}

function bucketYear(year) {
  if (!year) return null;
  const y = parseInt(year, 10);
  if (y >= 2020) return "2020s";
  if (y >= 2010) return "2010s";
  if (y >= 2000) return "2000s";
  if (y >= 1990) return "1990s";
  return "older";
}

function buildFeatureVector(caseRow) {
  return {
    jurisdiction: extractJurisdiction(caseRow.court),
    court_level: classifyCourtLevel(caseRow.court),
    year_bucket: bucketYear(caseRow.year),
    party_side: caseRow.party_side || null,
    outcome: caseRow.outcome || null,
    motion_types: Array.isArray(caseRow.motion_types) ? caseRow.motion_types : [],
    legal_issues: Array.isArray(caseRow.legal_issues) ? caseRow.legal_issues : [],
    benefit_type: caseRow.benefit_type || null,
  };
}

// ── Similarity computation ──────────────────────────────────────────────────

function jaccardSimilarity(setA, setB) {
  const a = new Set(setA || []);
  const b = new Set(setB || []);
  if (a.size === 0 && b.size === 0) return 1.0;

  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;

  return union > 0 ? intersection / union : 0;
}

function computeSimilarity(vectorA, vectorB) {
  let score = 0;
  let maxScore = 0;

  // Exact match features (weight 1 each)
  maxScore += 3;
  if (vectorA.jurisdiction === vectorB.jurisdiction) score += 1;
  if (vectorA.court_level === vectorB.court_level) score += 1;
  if (vectorA.year_bucket === vectorB.year_bucket) score += 1;

  // Party side match (weight 1)
  maxScore += 1;
  if (vectorA.party_side === vectorB.party_side) score += 1;

  // Motion type overlap via Jaccard (weight 2)
  maxScore += 2;
  const motionJaccard = jaccardSimilarity(vectorA.motion_types, vectorB.motion_types);
  score += 2 * motionJaccard;

  // Legal issue overlap via Jaccard (weight 2)
  maxScore += 2;
  const issueJaccard = jaccardSimilarity(vectorA.legal_issues, vectorB.legal_issues);
  score += 2 * issueJaccard;

  return maxScore > 0 ? score / maxScore : 0;
}

function findTopNeighbors(targetVector, allVectors, clusterId, allClusterIds) {
  const similarities = [];

  for (let i = 0; i < allVectors.length; i++) {
    if (allClusterIds[i] === clusterId) continue; // Skip self

    const sim = computeSimilarity(targetVector, allVectors[i]);
    if (sim > 0) {
      similarities.push({ cluster_id: allClusterIds[i], similarity: parseFloat(sim.toFixed(4)) });
    }
  }

  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, K_NEIGHBORS);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK k-NN SIMILAR CASE MATCHER ===\n");

  loadTokens();
  console.log("Loaded tokens from .env files");

  // Phase 1: Load all good-law cases from DB
  console.log("\nPhase 1: Loading good-law cases from DB...");

  let allCases = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const query = `/rest/v1/verified_case_law?select=courtlistener_cluster_id,court,year,party_side,outcome,motion_types,legal_issues,benefit_type&is_good_law=eq.true&limit=${pageSize}&offset=${offset}`;

    try {
      const rows = await restQuery(query);

      if (!Array.isArray(rows) || rows.length === 0) break;

      allCases = allCases.concat(rows);
      console.log(`  Loaded ${allCases.length} cases...`);

      if (rows.length < pageSize) break;
      offset += pageSize;

      if (allCases.length >= limit) {
        allCases = allCases.slice(0, limit);
        break;
      }

      await sleep(200); // Rate limiting
    } catch (e) {
      console.error(`Error loading cases at offset ${offset}:`, e.message);
      break;
    }
  }

  console.log(`Total good-law cases loaded: ${allCases.length}`);

  if (allCases.length === 0) {
    console.log("No cases to process.");
    return;
  }

  // Phase 2: Build feature vectors
  console.log("\nPhase 2: Building feature vectors...");

  const vectors = [];
  const clusterIds = [];

  for (const caseRow of allCases) {
    if (!caseRow.courtlistener_cluster_id) continue;

    vectors.push(buildFeatureVector(caseRow));
    clusterIds.push(caseRow.courtlistener_cluster_id);
  }

  console.log(`Feature vectors built: ${vectors.length}`);

  // Stats on feature coverage
  const withJurisdiction = vectors.filter(v => v.jurisdiction).length;
  const withMotionTypes = vectors.filter(v => v.motion_types.length > 0).length;
  const withLegalIssues = vectors.filter(v => v.legal_issues.length > 0).length;

  console.log(`  Jurisdiction extracted: ${withJurisdiction}/${vectors.length}`);
  console.log(`  Motion types: ${withMotionTypes}/${vectors.length}`);
  console.log(`  Legal issues: ${withLegalIssues}/${vectors.length}`);

  if (dryRun) {
    console.log("\nDry run complete.");
    return;
  }

  // Phase 3: Compute k-NN similarities
  console.log("\nPhase 3: Computing k-NN similarities (O(n^2))...");

  const startTime = Date.now();
  const featureVectorRows = [];

  for (let i = 0; i < vectors.length; i++) {
    if (i % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i / elapsed).toFixed(0);
      process.stdout.write(`  Case ${i}/${vectors.length} (${rate}/sec)...\n`);
    }

    const neighbors = findTopNeighbors(vectors[i], vectors, clusterIds[i], clusterIds);

    const features = {
      ...vectors[i],
      neighbors: neighbors,
    };

    featureVectorRows.push({
      cluster_id: clusterIds[i],
      features: features,
      jurisdiction: vectors[i].jurisdiction,
      charge_slug: null, // No charge context in this phase
    });
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nk-NN complete in ${elapsed.toFixed(1)}s`);
  console.log(`Feature vectors with neighbors: ${featureVectorRows.length}`);

  // Phase 4: Build upsert statements
  console.log("\nPhase 4: Building UPSERT statements...");

  const stmts = [];
  for (const row of featureVectorRows) {
    const stmt = `
INSERT INTO case_feature_vectors (cluster_id, features, jurisdiction, charge_slug)
VALUES (
  ${esc(row.cluster_id)},
  ${escJsonb(row.features)},
  ${esc(row.jurisdiction)},
  ${esc(row.charge_slug)}
)
ON CONFLICT (cluster_id) DO UPDATE SET
  features = EXCLUDED.features,
  jurisdiction = EXCLUDED.jurisdiction,
  charge_slug = EXCLUDED.charge_slug;
`.trim();
    stmts.push(stmt);
  }

  console.log(`UPSERT statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "feature-vector-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n\n"));
    console.log(`\nSaved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-similar-case-matcher.mjs --apply`);
    return;
  }

  // Apply to DB via Management API
  console.log(`\n--- Applying ${stmts.length} upserts in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0;
  let errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);

    try {
      await supabaseQuery(batch.join("\n\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} cases — ${rate}/sec`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n\n"));
          applied += batch.length;
          errors--;
        } catch {}
      }
    }

    if (i + BATCH_SIZE < stmts.length) await sleep(300);
  }

  console.log(`\n--- Results ---`);
  console.log(`Cases applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
