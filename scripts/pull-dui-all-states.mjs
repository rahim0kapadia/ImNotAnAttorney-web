/**
 * Pull DUI/DWI opinions from CourtListener for all 50 states.
 *
 * Queries the CourtListener search API for "driving under the influence" OR
 * "DUI" OR "DWI" opinions, extracts cluster_id + court + date, and inserts
 * feature vectors directly into case_feature_vectors with charge_slug = 'dui'.
 *
 * This bypasses the full pipeline (jurisdiction_statutes → verified_case_law →
 * dump → matcher) for a targeted charge type that needs immediate coverage.
 *
 * Usage:
 *   node scripts/pull-dui-all-states.mjs              # Dry run (stats only)
 *   node scripts/pull-dui-all-states.mjs --apply       # Pull + insert
 *   node scripts/pull-dui-all-states.mjs --state FL    # Single state
 *   node scripts/pull-dui-all-states.mjs --per-state 100  # Max per state (default 50)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const stateIdx = args.indexOf("--state");
const onlyState = stateIdx >= 0 ? args[stateIdx + 1] : null;
const perStateIdx = args.indexOf("--per-state");
const PER_STATE = perStateIdx >= 0 ? parseInt(args[perStateIdx + 1], 10) : 50;
const BATCH_SIZE = 50;

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("Missing .env.local");
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// Also load SUPABASE_ACCESS_TOKEN from parent repo
const parentEnvPath = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local");
if (fs.existsSync(parentEnvPath)) {
  const lines = fs.readFileSync(parentEnvPath, "utf8").split("\n");
  for (const line of lines) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      process.env.SUPABASE_ACCESS_TOKEN = line.slice(22).trim();
    }
  }
}

const CL_TOKEN = process.env.COURTLISTENER_TOKEN;
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!CL_TOKEN) throw new Error("Missing COURTLISTENER_TOKEN");
if (!SUPABASE_TOKEN) throw new Error("Missing SUPABASE_ACCESS_TOKEN");

// ── CourtListener court IDs per state ───────────────────────────────────────
// Maps state code → array of court IDs to search
const STATE_COURTS = {
  AL: ["alactapp", "alacrimapp", "ala"],
  AK: ["alaska", "alaskactapp"],
  AZ: ["ariz", "arizctapp"],
  AR: ["ark", "arkctapp"],
  CA: ["cal", "calctapp"],
  CO: ["colo", "coloctapp"],
  CT: ["conn", "connappct", "connsuperct"],
  DE: ["del", "delch", "delsuperct"],
  DC: ["dc"],
  FL: ["fla", "fladistctapp", "flaapp"],
  GA: ["ga", "gactapp"],
  HI: ["haw", "hawapp"],
  ID: ["idaho", "idahoctapp"],
  IL: ["ill", "illappct"],
  IN: ["ind", "indctapp"],
  IA: ["iowa", "iowactapp"],
  KS: ["kan", "kanctapp"],
  KY: ["ky", "kyctapp"],
  LA: ["la", "lactapp"],
  ME: ["me"],
  MD: ["md", "mdctspecapp"],
  MA: ["mass", "massappct"],
  MI: ["mich", "michctapp"],
  MN: ["minn", "minnctapp"],
  MS: ["miss", "missctapp"],
  MO: ["mo", "moctapp"],
  MT: ["mont"],
  NE: ["neb", "nebctapp"],
  NV: ["nev", "nevapp"],
  NH: ["nh"],
  NJ: ["nj", "njsuperctappdiv"],
  NM: ["nm", "nmctapp"],
  NY: ["ny", "nyappterm", "nyappdiv"],
  NC: ["nc", "ncctapp"],
  ND: ["nd", "ndctapp"],
  OH: ["ohio", "ohioctapp"],
  OK: ["okla", "oklacivapp", "oklacrimapp"],
  OR: ["or", "orctapp"],
  PA: ["pa", "pasuperct", "pacommwct"],
  RI: ["ri"],
  SC: ["sc", "scctapp"],
  SD: ["sd"],
  TN: ["tenn", "tennctapp", "tenncrimapp"],
  TX: ["tex", "texapp", "texcrimapp"],
  UT: ["utah", "utahctapp"],
  VT: ["vt"],
  VA: ["va", "vactapp"],
  WA: ["wash", "washctapp"],
  WV: ["wva"],
  WI: ["wis", "wisctapp"],
  WY: ["wyo"],
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clSearch(query, courts, pageSize = 20, afterDate = "2000-01-01") {
  const courtParam = courts.join(" ");
  const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=o&court=${encodeURIComponent(courtParam)}&filed_after=${afterDate}&stat_Precedential=on&order_by=dateFiled+desc&page_size=${pageSize}`;

  const res = await fetch(url, {
    headers: { Authorization: `Token ${CL_TOKEN}` },
  });

  if (res.status === 429) {
    console.log("    Rate limited, waiting 10s...");
    await sleep(10000);
    return clSearch(query, courts, pageSize, afterDate);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`    CL API ${res.status}: ${text.slice(0, 200)}`);
    return [];
  }

  const data = await res.json();
  return data.results || [];
}

function extractCourtLevel(courtId) {
  if (!courtId) return "trial";
  if (courtId.includes("app") || courtId.includes("superct")) return "appellate";
  // State supreme courts typically have short IDs matching state abbreviation patterns
  return "supreme";
}

function yearBucket(year) {
  if (!year) return "2010s";
  if (year >= 2020) return "2020s";
  if (year >= 2010) return "2010s";
  if (year >= 2000) return "2000s";
  if (year >= 1990) return "1990s";
  return "older";
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escJsonb(obj) {
  if (!obj) return "NULL";
  const json = JSON.stringify(obj);
  return "'" + json.split("'").join("''") + "'::jsonb";
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
          Authorization: `Bearer ${SUPABASE_TOKEN}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
          else {
            try { resolve(JSON.parse(data)); }
            catch { resolve(data); }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== DUI/DWI ALL-STATE COURTLISTENER PULL ===\n");
  console.log(`Mode: ${applyMode ? "APPLY" : "DRY RUN"}`);
  console.log(`Per state: ${PER_STATE} cases max`);
  if (onlyState) console.log(`Single state: ${onlyState}`);

  const states = onlyState ? [onlyState] : Object.keys(STATE_COURTS).sort();
  const allRows = [];
  const seenClusters = new Set();

  // Load existing cluster_ids to skip
  const existingRes = await fetch(
    `https://jxjbjmgdukwkoclydqdr.supabase.co/rest/v1/case_feature_vectors?select=cluster_id&charge_slug=eq.dui`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (existingRes.ok) {
    const existing = await existingRes.json();
    for (const r of existing) seenClusters.add(String(r.cluster_id));
    console.log(`Existing DUI vectors: ${seenClusters.size}`);
  }

  console.log(`\nPulling from CourtListener...\n`);

  for (const state of states) {
    const courts = STATE_COURTS[state];
    if (!courts) { console.log(`  ${state}: no courts mapped`); continue; }

    // Search for DUI opinions in this state's courts
    const queries = ['"driving under the influence"', '"DUI" OR "DWI"', '"operating while intoxicated"'];
    const stateResults = [];

    for (const q of queries) {
      if (stateResults.length >= PER_STATE) break;
      const results = await clSearch(q, courts, Math.min(PER_STATE, 20));
      for (const r of results) {
        if (stateResults.length >= PER_STATE) break;
        const cid = String(r.cluster_id);
        if (seenClusters.has(cid)) continue;
        seenClusters.add(cid);
        stateResults.push(r);
      }
      await sleep(500); // Respect rate limits
    }

    if (stateResults.length === 0) {
      console.log(`  ${state}: 0 new cases`);
      continue;
    }

    // Build feature vectors
    for (const r of stateResults) {
      const year = r.dateFiled ? parseInt(r.dateFiled.slice(0, 4), 10) : null;
      const features = {
        jurisdiction: state,
        court_level: extractCourtLevel(r.court_id),
        year_bucket: yearBucket(year),
        party_side: null,
        outcome: null,
        motion_types: [],
        legal_issues: ["dui"],
        benefit_type: null,
      };

      allRows.push({
        cluster_id: String(r.cluster_id),
        features,
        jurisdiction: state,
        charge_slug: "dui",
      });
    }

    console.log(`  ${state}: ${stateResults.length} new DUI cases`);
  }

  console.log(`\nTotal new DUI vectors: ${allRows.length}`);

  if (!applyMode) {
    console.log("\nDry run complete. Use --apply to insert.");
    return;
  }

  if (allRows.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  // Build and apply UPSERTs in batches
  console.log(`\nApplying ${allRows.length} upserts in batches of ${BATCH_SIZE}...`);

  let applied = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(row => `
INSERT INTO case_feature_vectors (cluster_id, features, jurisdiction, charge_slug)
VALUES (${esc(row.cluster_id)}, ${escJsonb(row.features)}, ${esc(row.jurisdiction)}, ${esc(row.charge_slug)})
ON CONFLICT (cluster_id) DO UPDATE SET
  features = EXCLUDED.features,
  jurisdiction = EXCLUDED.jurisdiction,
  charge_slug = EXCLUDED.charge_slug;`.trim());

    try {
      await supabaseQuery(stmts.join("\n"));
      applied += batch.length;
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allRows.length / BATCH_SIZE);
      console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} cases`);
    } catch (e) {
      errors++;
      console.error(`  Batch error: ${e.message.slice(0, 200)}`);
    }
    await sleep(300);
  }

  console.log(`\n--- Results ---`);
  console.log(`Applied: ${applied}  Errors: ${errors}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
