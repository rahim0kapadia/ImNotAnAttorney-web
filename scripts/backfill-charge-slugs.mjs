/**
 * Backfill charge_slug on case_feature_vectors
 *
 * Problem: bulk-similar-case-matcher.mjs sets charge_slug = NULL on all 1,008
 * rows because it reads verified_case_law which has no charge-type column.
 * The Similar Cases Analyzer product queries case_feature_vectors filtered by
 * charge_slug, so it always returns 0 results.
 *
 * Solution: Resolve charge_slug via the dump file's jurisdiction_statute_id FK:
 *   dump row → jurisdiction_statute_id → jurisdiction_statutes.common_charge_slug
 *
 * Same resolution pattern as bulk-master-extractor.mjs (lines 1680-1757),
 * applied retroactively to the already-computed feature vectors.
 *
 * When a cluster_id maps to multiple charge slugs (case cited for multiple
 * charges), we prefer slugs that match ALLOWED_CHARGE_TYPES from the intake
 * form. If multiple match, we pick the most frequent in that cluster's dump
 * rows. If none match ALLOWED_CHARGE_TYPES, we take the most frequent slug.
 *
 * Usage:
 *   node scripts/backfill-charge-slugs.mjs              # Generate SQL only
 *   node scripts/backfill-charge-slugs.mjs --apply       # Generate + apply
 *   node scripts/backfill-charge-slugs.mjs --dry-run     # Stats only
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 100;

const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "charge-slug-backfill.sql");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");

// ── ALLOWED_CHARGE_TYPES (from src/lib/charge-types.ts) ────────────────────
// These are the values the intake form accepts. Prefer these over taxonomy-only slugs.
const ALLOWED_CHARGE_TYPES = new Set([
  "drug-possession", "drug-trafficking", "dui", "dui-first", "dui-repeat",
  "assault", "domestic-violence", "theft", "sex-offense", "sex-offense-contact",
  "sex-offense-digital", "weapons", "white-collar", "federal",
  "probation-violation", "self-defense", "other",
  "drug", "other-felony", "other-misdemeanor", "robbery", "burglary", "fraud",
]);

// Legacy → canonical mapping (from charge-types.ts LEGACY_SLUG_MAP)
const LEGACY_SLUG_MAP = {
  "dui": "dui-dwi",
  "dui-first": "dui-first-offense",
  "dui-repeat": "dui-repeat-offense",
  "assault": "simple-assault",
  "theft": "theft-larceny",
  "fraud": "fraud-general",
  "white-collar": "fraud-general",
  "drug": "drug-possession",
  "sex-offense": "sex-offense-contact",
  "weapons": "weapons-possession",
  "federal": "federal-other",
  "other": "other",
  "other-felony": "other",
  "other-misdemeanor": "other",
};

// Reverse: canonical taxonomy slug → intake form slug
// So "dui-first-offense" maps back to "dui-first" which is what the intake sends
const CANONICAL_TO_INTAKE = {};
for (const [intake, canonical] of Object.entries(LEGACY_SLUG_MAP)) {
  if (!CANONICAL_TO_INTAKE[canonical]) CANONICAL_TO_INTAKE[canonical] = intake;
}

// Extended mapping: taxonomy common_charge_slugs → ALLOWED_CHARGE_TYPES values
// The taxonomy has fine-grained slugs (dui-first-offense, simple-assault, etc.)
// that map to the intake form's coarser slugs.
const TAXONOMY_TO_INTAKE = {
  // DUI variants
  "dui-dwi": "dui",
  "dui-first-offense": "dui-first",
  "dui-repeat-offense": "dui-repeat",
  "dui-drugs": "dui",
  "dui-underage": "dui",
  "dui-commercial": "dui",

  // Assault variants
  "simple-assault": "assault",
  "aggravated-assault": "assault",
  "assault-deadly-weapon": "assault",

  // Theft variants
  "theft-larceny": "theft",
  "grand-theft": "theft",
  "petty-theft": "theft",
  "shoplifting": "theft",
  "auto-theft": "theft",

  // Drug variants
  "drug-possession-marijuana": "drug-possession",
  "drug-possession-with-intent": "drug-possession",
  "drug-paraphernalia": "drug-possession",
  "drug-manufacturing": "drug-trafficking",

  // Violence/domestic
  "domestic-violence": "domestic-violence",
  "domestic-battery": "domestic-violence",

  // Sex offenses
  "sex-offense-contact": "sex-offense-contact",
  "sex-offense-digital": "sex-offense-digital",
  "indecent-exposure": "sex-offense",
  "sexual-battery": "sex-offense-contact",

  // Weapons
  "weapons-possession": "weapons",
  "felon-in-possession": "weapons",
  "concealed-carry-violation": "weapons",

  // Robbery/burglary
  "robbery": "robbery",
  "armed-robbery": "robbery",
  "burglary": "burglary",
  "home-invasion": "burglary",

  // Fraud/white-collar
  "fraud-general": "fraud",
  "fraud-wire": "fraud",
  "fraud-insurance": "fraud",
  "identity-theft": "fraud",
  "forgery": "fraud",
  "embezzlement": "white-collar",
  "money-laundering": "white-collar",
  "tax-evasion": "white-collar",

  // Probation
  "probation-violation": "probation-violation",

  // Federal
  "federal-other": "federal",
  "conspiracy": "federal",
  "racketeering": "federal",

  // Other mapped to closest intake type
  "murder-first-degree": "other",
  "murder-second-degree": "other",
  "voluntary-manslaughter": "other",
  "involuntary-manslaughter": "other",
  "vehicular-homicide": "other",
  "kidnapping": "other",
  "arson": "other",
  "stalking": "other",
  "trespassing": "other",
  "disorderly-conduct": "other",
  "resisting-arrest": "other",
  "fleeing-eluding": "other",
  "violation-protective-order": "domestic-violence",
  "receiving-stolen-property": "theft",
  "hit-and-run": "other",
  "child-abuse": "other",
  "child-endangerment": "other",
  "perjury": "other",
  "obstruction-justice": "other",
  "contempt-of-court": "other",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let supabaseToken = null;
let serviceRoleKey = null;

function loadTokens() {
  // Parent token
  const parentEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
  );
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
    }
  }

  // Service role key
  const webEnv = fs.readFileSync(path.resolve(PROJECT_ROOT, ".env.local"), "utf8");
  for (const line of webEnv.split("\n")) {
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      serviceRoleKey = line.slice(26).trim();
    }
  }

  if (!supabaseToken) throw new Error("SUPABASE_ACCESS_TOKEN not found");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not found");
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function restQuery(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
      path: endpoint,
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`REST ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function restQueryWithRange(endpoint, rangeStart, rangeEnd) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
      path: endpoint,
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Range: `${rangeStart}-${rangeEnd}`,
        "Range-Unit": "items",
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`REST ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Given an array of taxonomy charge slugs, pick the best one to store
 * as charge_slug on case_feature_vectors. Priority:
 *   1. Slugs that directly appear in ALLOWED_CHARGE_TYPES
 *   2. Slugs that map to an ALLOWED_CHARGE_TYPE via TAXONOMY_TO_INTAKE
 *   3. Most frequent slug among the candidates
 */
function pickBestChargeSlug(slugs) {
  if (!slugs || slugs.length === 0) return null;
  if (slugs.length === 1) {
    return resolveToIntake(slugs[0]);
  }

  // Count frequency of each resolved intake slug
  const counts = {};
  for (const raw of slugs) {
    const resolved = resolveToIntake(raw);
    if (resolved) {
      counts[resolved] = (counts[resolved] || 0) + 1;
    }
  }

  // Pick most frequent
  let best = null;
  let bestCount = 0;
  for (const [slug, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = slug;
      bestCount = count;
    }
  }

  return best;
}

function resolveToIntake(taxonomySlug) {
  if (!taxonomySlug) return null;

  // Already an allowed intake type
  if (ALLOWED_CHARGE_TYPES.has(taxonomySlug)) return taxonomySlug;

  // Map from taxonomy to intake
  if (TAXONOMY_TO_INTAKE[taxonomySlug]) return TAXONOMY_TO_INTAKE[taxonomySlug];

  // Fallback: "other"
  return "other";
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BACKFILL charge_slug ON case_feature_vectors ===\n");

  loadTokens();
  console.log("Loaded tokens\n");

  // Step 1: Load dump file
  console.log("Step 1: Loading dump file...");
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`ERROR: Dump not found: ${DUMP_FILE}`);
    process.exit(1);
  }
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  console.log(`  Dump rows: ${dump.length}`);

  // Step 2: Load jurisdiction_statutes resolver (same pattern as master extractor)
  console.log("\nStep 2: Loading jurisdiction_statutes resolver...");
  const jurStatuteMap = new Map(); // id → { jurisdiction, charge_slug }

  let offset = 0;
  while (offset < 100000) {
    const pageRows = await restQueryWithRange(
      "/rest/v1/jurisdiction_statutes?select=id,jurisdiction,common_charge_slug&order=id",
      offset, offset + 999
    );
    for (const row of pageRows) {
      if (row.id) {
        jurStatuteMap.set(row.id, {
          jurisdiction: row.jurisdiction || null,
          charge_slug: row.common_charge_slug || null,
        });
      }
    }
    if (pageRows.length < 1000) break;
    offset += 1000;
    await sleep(200);
  }
  console.log(`  jurisdiction_statutes loaded: ${jurStatuteMap.size}`);

  // Step 3: Build cluster_id → charge_slugs[] map from dump
  console.log("\nStep 3: Resolving charge slugs from dump...");
  const clusterToSlugs = new Map(); // cluster_id → charge_slug[]

  let resolved = 0;
  let unresolved = 0;

  for (const row of dump) {
    if (!row.courtlistener_cluster_id) continue;
    const cid = String(row.courtlistener_cluster_id);

    let chargeSlug = null;
    if (row.jurisdiction_statute_id) {
      const jsRow = jurStatuteMap.get(row.jurisdiction_statute_id);
      if (jsRow && jsRow.charge_slug) {
        chargeSlug = jsRow.charge_slug;
        resolved++;
      } else {
        unresolved++;
      }
    } else {
      unresolved++;
    }

    if (chargeSlug) {
      if (!clusterToSlugs.has(cid)) clusterToSlugs.set(cid, []);
      clusterToSlugs.get(cid).push(chargeSlug);
    }
  }

  console.log(`  Dump rows resolved: ${resolved}`);
  console.log(`  Dump rows unresolved: ${unresolved}`);
  console.log(`  Unique cluster_ids with charge data: ${clusterToSlugs.size}`);

  // Step 4: Fetch case_feature_vectors cluster_ids
  console.log("\nStep 4: Fetching case_feature_vectors cluster_ids...");
  const cfvRows = await supabaseQuery(
    "SELECT cluster_id FROM case_feature_vectors WHERE charge_slug IS NULL"
  );

  if (!Array.isArray(cfvRows)) {
    console.error("ERROR: Unexpected response from case_feature_vectors query:", cfvRows);
    process.exit(1);
  }

  console.log(`  Rows with NULL charge_slug: ${cfvRows.length}`);

  // Step 5: Match and resolve
  console.log("\nStep 5: Matching cluster_ids...");
  let matched = 0;
  let noMatch = 0;
  const updates = []; // { cluster_id, charge_slug }

  const slugDistribution = {};

  for (const row of cfvRows) {
    const cid = String(row.cluster_id);
    const slugs = clusterToSlugs.get(cid);

    if (slugs && slugs.length > 0) {
      const bestSlug = pickBestChargeSlug(slugs);
      if (bestSlug) {
        updates.push({ cluster_id: cid, charge_slug: bestSlug });
        slugDistribution[bestSlug] = (slugDistribution[bestSlug] || 0) + 1;
        matched++;
      } else {
        noMatch++;
      }
    } else {
      noMatch++;
    }
  }

  console.log(`  Matched: ${matched}`);
  console.log(`  No match: ${noMatch}`);
  console.log(`\n  Charge slug distribution:`);

  const sortedSlugs = Object.entries(slugDistribution).sort((a, b) => b[1] - a[1]);
  for (const [slug, count] of sortedSlugs) {
    console.log(`    ${slug}: ${count}`);
  }

  if (dryRun) {
    console.log("\nDry run complete.");
    return;
  }

  if (updates.length === 0) {
    console.log("\nNo updates to apply.");
    return;
  }

  // Step 6: Generate SQL
  console.log("\nStep 6: Generating SQL...");

  const stmts = [];
  stmts.push("-- Backfill charge_slug on case_feature_vectors");
  stmts.push("-- Generated: " + new Date().toISOString());
  stmts.push("-- Source: dump file → jurisdiction_statutes.common_charge_slug");
  stmts.push("");

  for (const u of updates) {
    stmts.push(
      `UPDATE case_feature_vectors SET charge_slug = ${esc(u.charge_slug)} WHERE cluster_id = ${esc(u.cluster_id)};`
    );
  }

  stmts.push("");
  stmts.push(`-- Total: ${updates.length} updates`);

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, stmts.join("\n"));
  console.log(`  SQL saved: ${OUTPUT_FILE}`);

  if (!applyMode) {
    console.log(`\n========================================`);
    console.log(`  NO CHANGES APPLIED TO DATABASE`);
    console.log(`========================================`);
    console.log(`To apply: node scripts/backfill-charge-slugs.mjs --apply`);
    return;
  }

  // Step 7: Apply
  const updateStmts = stmts.filter(s => s.startsWith("UPDATE"));
  console.log(`\n--- Applying ${updateStmts.length} updates in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0;
  let errors = 0;

  for (let i = 0; i < updateStmts.length; i += BATCH_SIZE) {
    const batch = updateStmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updateStmts.length / BATCH_SIZE);

    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} applied`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ERROR — ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        console.log("  Rate limited — waiting 10s...");
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          errors--;
        } catch (e2) {
          console.error(`  Batch ${batchNum} retry: FAILED`);
        }
      }
    }

    if (i + BATCH_SIZE < updateStmts.length) await sleep(300);
  }

  console.log(`\n--- Results ---`);
  console.log(`Applied: ${applied}`);
  console.log(`Errors: ${errors}`);
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
