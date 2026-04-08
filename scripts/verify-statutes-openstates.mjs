/**
 * Verify Statute Existence via OpenStates API
 *
 * Cross-references unverified jurisdiction_statutes rows against the
 * OpenStates API (openstates.org). OpenStates aggregates all 50 state
 * legislatures into one free API.
 *
 * For each unverified statute (confidence_score = 0):
 *   1. Search OpenStates by jurisdiction + statute keyword
 *   2. If a matching bill/statute is found: append OpenStates URL to source_urls[]
 *      and bump confidence_score
 *   3. If NOT found: leave row unchanged (statute may exist but OpenStates may not have it)
 *
 * Setup: Free OpenStates API key required.
 *   1. Sign up at https://openstates.org/accounts/signup/
 *   2. Get key from https://openstates.org/account/profile/
 *   3. Add to .env.local: OPENSTATES_API_KEY=your-key-here
 *
 * Free tier: 500 req/day. We have 1,682 unverified statutes — runs in 4 days.
 *
 * Usage:
 *   node scripts/verify-statutes-openstates.mjs              # Verify all unverified
 *   node scripts/verify-statutes-openstates.mjs --limit 400  # Stay under daily limit
 *   node scripts/verify-statutes-openstates.mjs --jurisdiction NV  # Single state
 *   node scripts/verify-statutes-openstates.mjs --dry-run    # Show without writing
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OS_DELAY_MS = 200; // OpenStates rate limit is generous

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 500;
const jurIdx = args.indexOf("--jurisdiction");
const targetJur = jurIdx >= 0 ? args[jurIdx + 1].toUpperCase() : null;

// Read tokens
const parentEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
);
let supabaseToken = null;
for (const line of parentEnv.split("\n")) {
  if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
    supabaseToken = line.slice(22).trim();
  }
}

const webEnv = fs.readFileSync(
  path.resolve(PROJECT_ROOT, ".env.local"), "utf8"
);
let openstatesKey = null;
for (const line of webEnv.split("\n")) {
  if (line.startsWith("OPENSTATES_API_KEY=")) {
    openstatesKey = line.slice(19).trim();
  }
}

if (!supabaseToken) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }
if (!openstatesKey) {
  console.error("Missing OPENSTATES_API_KEY in .env.local");
  console.error("Get a free key at https://openstates.org/accounts/signup/");
  console.error("Then add: OPENSTATES_API_KEY=your-key-here to .env.local");
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve([]); }
        } else {
          reject(new Error(`SQL ${res.statusCode}: ${body.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function openStatesGet(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(`https://v3.openstates.org${urlPath}`, {
      headers: {
        "X-API-KEY": openstatesKey,
        Accept: "application/json",
        "User-Agent": "INAA-Legal-Research/1.0",
      },
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        } else if (res.statusCode === 429) {
          reject(new Error("RATE_LIMIT"));
        } else {
          resolve(null);
        }
      });
    }).on("error", reject);
  });
}

// State code → OpenStates jurisdiction ID
const OS_JURISDICTIONS = {
  AL: "ocd-jurisdiction/country:us/state:al/government",
  AK: "ocd-jurisdiction/country:us/state:ak/government",
  AZ: "ocd-jurisdiction/country:us/state:az/government",
  AR: "ocd-jurisdiction/country:us/state:ar/government",
  CA: "ocd-jurisdiction/country:us/state:ca/government",
  CO: "ocd-jurisdiction/country:us/state:co/government",
  CT: "ocd-jurisdiction/country:us/state:ct/government",
  DE: "ocd-jurisdiction/country:us/state:de/government",
  FL: "ocd-jurisdiction/country:us/state:fl/government",
  GA: "ocd-jurisdiction/country:us/state:ga/government",
  HI: "ocd-jurisdiction/country:us/state:hi/government",
  ID: "ocd-jurisdiction/country:us/state:id/government",
  IL: "ocd-jurisdiction/country:us/state:il/government",
  IN: "ocd-jurisdiction/country:us/state:in/government",
  IA: "ocd-jurisdiction/country:us/state:ia/government",
  KS: "ocd-jurisdiction/country:us/state:ks/government",
  KY: "ocd-jurisdiction/country:us/state:ky/government",
  LA: "ocd-jurisdiction/country:us/state:la/government",
  ME: "ocd-jurisdiction/country:us/state:me/government",
  MD: "ocd-jurisdiction/country:us/state:md/government",
  MA: "ocd-jurisdiction/country:us/state:ma/government",
  MI: "ocd-jurisdiction/country:us/state:mi/government",
  MN: "ocd-jurisdiction/country:us/state:mn/government",
  MS: "ocd-jurisdiction/country:us/state:ms/government",
  MO: "ocd-jurisdiction/country:us/state:mo/government",
  MT: "ocd-jurisdiction/country:us/state:mt/government",
  NE: "ocd-jurisdiction/country:us/state:ne/government",
  NV: "ocd-jurisdiction/country:us/state:nv/government",
  NH: "ocd-jurisdiction/country:us/state:nh/government",
  NJ: "ocd-jurisdiction/country:us/state:nj/government",
  NM: "ocd-jurisdiction/country:us/state:nm/government",
  NY: "ocd-jurisdiction/country:us/state:ny/government",
  NC: "ocd-jurisdiction/country:us/state:nc/government",
  ND: "ocd-jurisdiction/country:us/state:nd/government",
  OH: "ocd-jurisdiction/country:us/state:oh/government",
  OK: "ocd-jurisdiction/country:us/state:ok/government",
  OR: "ocd-jurisdiction/country:us/state:or/government",
  PA: "ocd-jurisdiction/country:us/state:pa/government",
  RI: "ocd-jurisdiction/country:us/state:ri/government",
  SC: "ocd-jurisdiction/country:us/state:sc/government",
  SD: "ocd-jurisdiction/country:us/state:sd/government",
  TN: "ocd-jurisdiction/country:us/state:tn/government",
  TX: "ocd-jurisdiction/country:us/state:tx/government",
  UT: "ocd-jurisdiction/country:us/state:ut/government",
  VT: "ocd-jurisdiction/country:us/state:vt/government",
  VA: "ocd-jurisdiction/country:us/state:va/government",
  WA: "ocd-jurisdiction/country:us/state:wa/government",
  WV: "ocd-jurisdiction/country:us/state:wv/government",
  WI: "ocd-jurisdiction/country:us/state:wi/government",
  WY: "ocd-jurisdiction/country:us/state:wy/government",
  DC: "ocd-jurisdiction/country:us/district:dc/government",
};

async function searchOpenStates(jurisdiction, statuteTitle) {
  const jurId = OS_JURISDICTIONS[jurisdiction];
  if (!jurId) return null;

  // Use the search endpoint with jurisdiction filter and title query
  const q = encodeURIComponent(statuteTitle.slice(0, 100));
  const path = `/bills?jurisdiction=${encodeURIComponent(jurId)}&q=${q}&page=1&per_page=5`;

  try {
    const data = await openStatesGet(path);
    if (data && data.results && data.results.length > 0) {
      return data.results[0]; // Top match
    }
    return null;
  } catch (err) {
    if (err.message === "RATE_LIMIT") throw err;
    return null;
  }
}

async function main() {
  console.log("=== OpenStates Statute Verification ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}, Limit: ${limit}`);
  if (targetJur) console.log(`Target jurisdiction: ${targetJur}`);

  // Fetch unverified statutes
  let sql = `SELECT id, jurisdiction, common_charge_slug, statute_number, statute_title, source_urls, confidence_score
             FROM jurisdiction_statutes
             WHERE confidence_score < 0.5`;
  if (targetJur) sql += ` AND jurisdiction = '${targetJur}'`;
  sql += ` ORDER BY jurisdiction, common_charge_slug LIMIT ${limit}`;

  const rows = await supabaseQuery(sql);
  console.log(`\n${rows.length} statutes to verify\n`);

  const stats = { found: 0, notFound: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = `[${i + 1}/${rows.length}] ${row.jurisdiction}/${row.common_charge_slug}`;

    if (!OS_JURISDICTIONS[row.jurisdiction]) {
      console.log(`${label} SKIP (not in OpenStates)`);
      stats.skipped++;
      continue;
    }

    process.stdout.write(`${label} "${(row.statute_title || "").slice(0, 40)}"... `);

    let result;
    try {
      result = await searchOpenStates(row.jurisdiction, row.statute_title || row.common_charge_slug);
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        console.log("RATE LIMIT — stopping");
        break;
      }
      console.log(`ERR: ${err.message}`);
      stats.errors++;
      continue;
    }

    if (result) {
      const osUrl = result.openstates_url || `https://openstates.org/${row.jurisdiction.toLowerCase()}/bills/${result.session}/${result.identifier}/`;
      console.log(`FOUND: ${(result.title || "").slice(0, 50)}`);
      stats.found++;

      if (!dryRun) {
        try {
          await supabaseQuery(
            `UPDATE jurisdiction_statutes SET
              source_urls = array_append(COALESCE(source_urls, '{}'), ${esc(osUrl)}),
              confidence_score = LEAST(1.00, COALESCE(confidence_score, 0) + 0.25)
             WHERE id = ${esc(row.id)}`
          );
        } catch (err) {
          console.log(`  DB err: ${err.message}`);
        }
      }
    } else {
      console.log("NOT FOUND");
      stats.notFound++;
    }

    await sleep(OS_DELAY_MS);
  }

  console.log("\n=== RESULTS ===");
  console.log(`Found in OpenStates : ${stats.found}`);
  console.log(`Not found           : ${stats.notFound}`);
  console.log(`Skipped (no jur map): ${stats.skipped}`);
  console.log(`Errors              : ${stats.errors}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
