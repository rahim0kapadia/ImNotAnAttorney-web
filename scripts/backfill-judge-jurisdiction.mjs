/**
 * Backfill judge_profiles.jurisdiction from positions JSONB court_id values.
 *
 * Uses the CourtListener court_id → state mapping (tmp-cl-court-state-map.json)
 * to derive a 2-letter state code for each judge based on their court positions.
 *
 * Priority: prefers non-FEDERAL state codes. If a judge has both state and
 * federal positions, uses the state court. If only federal, uses "FEDERAL".
 *
 * Usage:
 *   node scripts/backfill-judge-jurisdiction.mjs              # Dry run, show stats
 *   node scripts/backfill-judge-jurisdiction.mjs --apply      # Apply to database
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const applyMode = process.argv.includes("--apply");

const courtMap = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, "data", "tmp-cl-court-state-map.json"), "utf8")
);

function loadToken() {
  const parentEnvPath = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local");
  const envPath = fs.existsSync(parentEnvPath) ? parentEnvPath : path.resolve(PROJECT_ROOT, ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      return line.split("=").slice(1).join("=").trim();
    }
  }
  throw new Error("SUPABASE_ACCESS_TOKEN not found");
}

function loadServiceRoleKey() {
  const envContent = fs.readFileSync(path.resolve(PROJECT_ROOT, ".env.local"), "utf8");
  for (const line of envContent.split("\n")) {
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      return line.split("=").slice(1).join("=").trim();
    }
  }
  throw new Error("SUPABASE_SERVICE_ROLE_KEY not found");
}

function supabaseQuery(token, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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

function fetchPage(serviceRoleKey, offset, pageSize) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
      path: "/rest/v1/judge_profiles?select=id,positions&order=id",
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode === 416) resolve([]);
        else if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        else { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function deriveJurisdiction(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return null;

  const states = [];
  const federals = [];

  for (const pos of positions) {
    const courtId = pos.court_id || "";
    if (!courtId) continue;
    const mapped = courtMap[courtId];
    if (!mapped) continue;
    if (mapped === "FEDERAL" || mapped === "MILITARY" || mapped === "TRIBAL" || mapped === "INTERNATIONAL") {
      federals.push(mapped);
    } else {
      states.push(mapped);
    }
  }

  // Prefer state court jurisdiction
  if (states.length > 0) return states[0];
  if (federals.length > 0) return federals[0];
  return null;
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

async function main() {
  console.log("=== BACKFILL JUDGE JURISDICTION ===\n");

  const serviceRoleKey = loadServiceRoleKey();

  // Load all judges with positions via pagination
  const PAGE_SIZE = 1000;
  const allJudges = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(serviceRoleKey, offset, PAGE_SIZE);
    if (page.length === 0) break;
    allJudges.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`Loaded ${allJudges.length} judges`);

  // Derive jurisdiction for each
  const updates = [];
  let noPositions = 0;
  let noMapping = 0;
  const stateCounts = {};

  for (const judge of allJudges) {
    const jurisdiction = deriveJurisdiction(judge.positions);
    if (!jurisdiction) {
      if (!judge.positions || judge.positions.length === 0) noPositions++;
      else noMapping++;
      continue;
    }
    updates.push({ id: judge.id, jurisdiction });
    stateCounts[jurisdiction] = (stateCounts[jurisdiction] || 0) + 1;
  }

  console.log(`\nJurisdiction resolved: ${updates.length}`);
  console.log(`No positions JSONB: ${noPositions}`);
  console.log(`No court_id mapping: ${noMapping}`);

  const sorted = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`\nTop jurisdictions:`);
  for (const [state, count] of sorted) {
    console.log(`  ${state}: ${count}`);
  }

  if (!applyMode) {
    console.log(`\nDry run. Use --apply to write to database.`);
    return;
  }

  const token = loadToken();
  const BATCH_SIZE = 500;
  let applied = 0;
  let errors = 0;

  console.log(`\nApplying ${updates.length} updates in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const stmts = batch.map((u) =>
      `UPDATE judge_profiles SET jurisdiction = ${esc(u.jurisdiction)} WHERE id = ${esc(u.id)};`
    );
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

    try {
      await supabaseQuery(token, stmts.join("\n"));
      applied += batch.length;
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} updates (${applied} total)\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum} ERROR: ${e.message.slice(0, 200)}`);
    }

    if (i + BATCH_SIZE < updates.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`\nDone. Applied: ${applied}  Errors: ${errors}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
