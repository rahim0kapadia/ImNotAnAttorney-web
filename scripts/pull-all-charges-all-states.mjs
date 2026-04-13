/**
 * Pull case law from CourtListener for ALL charge types × ALL states.
 *
 * Extends pull-dui-all-states.mjs to cover every charge type the
 * AvailabilityChecker and Similar Cases Analyzer support.
 *
 * Usage:
 *   node scripts/pull-all-charges-all-states.mjs                   # Dry run
 *   node scripts/pull-all-charges-all-states.mjs --apply           # Pull + insert
 *   node scripts/pull-all-charges-all-states.mjs --apply --charge drug-possession
 *   node scripts/pull-all-charges-all-states.mjs --apply --state FL
 *   node scripts/pull-all-charges-all-states.mjs --apply --per-state 80
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
const chargeIdx = args.indexOf("--charge");
const onlyCharge = chargeIdx >= 0 ? args[chargeIdx + 1] : null;
const perStateIdx = args.indexOf("--per-state");
const PER_STATE = perStateIdx >= 0 ? parseInt(args[perStateIdx + 1], 10) : 50;
const BATCH_SIZE = 50;

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  for (const line of fs.readFileSync(filepath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(path.join(PROJECT_ROOT, ".env.local"));
loadEnv(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"));

const CL_TOKEN = process.env.COURTLISTENER_TOKEN;
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CL_TOKEN) throw new Error("Missing COURTLISTENER_TOKEN");
if (!SUPABASE_TOKEN) throw new Error("Missing SUPABASE_ACCESS_TOKEN");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// ── Charge types → search queries ───────────────────────────────────────────
// Maps our charge_slug to CourtListener search terms that find relevant opinions.
const CHARGE_QUERIES = {
  "drug-possession": [
    '"drug possession"',
    '"possession of controlled substance"',
    '"possession of marijuana" OR "possession of cocaine"',
  ],
  "drug-trafficking": [
    '"drug trafficking"',
    '"trafficking in controlled substance"',
    '"drug distribution" OR "intent to distribute"',
  ],
  "assault": [
    '"aggravated assault"',
    '"simple assault" OR "assault and battery"',
    '"felony assault"',
  ],
  "domestic-violence": [
    '"domestic violence"',
    '"domestic battery" OR "domestic assault"',
  ],
  "theft": [
    '"grand theft" OR "petty theft"',
    '"larceny" OR "shoplifting"',
    '"theft of property"',
  ],
  "sex-offense": [
    '"sexual assault" OR "sexual battery"',
    '"sex offense" OR "indecent exposure"',
  ],
  "weapons": [
    '"weapons possession" OR "felon in possession"',
    '"concealed carry" OR "unlawful possession of firearm"',
  ],
  "white-collar": [
    '"embezzlement" OR "money laundering"',
    '"wire fraud" OR "tax evasion"',
    '"white collar crime"',
  ],
  "federal": [
    '"federal indictment" OR "federal conspiracy"',
    '"RICO" OR "racketeering"',
  ],
  "probation-violation": [
    '"probation violation"',
    '"violation of probation" OR "revocation of probation"',
  ],
  "self-defense": [
    '"self-defense" OR "justifiable force"',
    '"stand your ground" OR "castle doctrine"',
  ],
  "robbery": [
    '"armed robbery"',
    '"robbery" -"tax robbery" -"train robbery"',
  ],
  "burglary": [
    '"burglary" OR "breaking and entering"',
    '"home invasion"',
  ],
  "fraud": [
    '"fraud" -"anti-fraud"',
    '"identity theft" OR "forgery"',
  ],
  "dui": [
    '"driving under the influence"',
    '"DUI" OR "DWI"',
    '"operating while intoxicated"',
  ],
  "dui-repeat": [
    '"second DUI" OR "third DUI"',
    '"repeat DUI" OR "felony DUI"',
    '"habitual DUI" OR "multiple DUI"',
  ],
  "murder": [
    '"murder in the first degree" OR "first degree murder"',
    '"murder in the second degree" OR "second degree murder"',
    '"attempted murder"',
  ],
  "manslaughter": [
    '"voluntary manslaughter"',
    '"involuntary manslaughter"',
    '"vehicular homicide" OR "vehicular manslaughter"',
  ],
  "kidnapping": [
    '"kidnapping" OR "unlawful imprisonment"',
    '"human trafficking"',
  ],
  "arson": [
    '"arson"',
  ],
  "stalking": [
    '"stalking" OR "cyberstalking"',
    '"harassment" OR "terroristic threats"',
  ],
  "child-abuse": [
    '"child abuse" OR "child endangerment"',
    '"child neglect" OR "elder abuse"',
  ],
  "hit-and-run": [
    '"hit and run" OR "leaving the scene"',
    '"fleeing and eluding" OR "reckless driving"',
  ],
  "contempt": [
    '"contempt of court"',
    '"obstruction of justice" OR "resisting arrest"',
    '"failure to appear"',
  ],
};

// ── Court IDs per state ─────────────────────────────────────────────────────
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

async function clSearch(query, courts, pageSize = 20) {
  const courtParam = courts.join(" ");
  const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=o&court=${encodeURIComponent(courtParam)}&filed_after=2000-01-01&stat_Precedential=on&order_by=dateFiled+desc&page_size=${pageSize}`;

  const res = await fetch(url, {
    headers: { Authorization: `Token ${CL_TOKEN}` },
  });

  if (res.status === 429) {
    console.log("      Rate limited, waiting 15s...");
    await sleep(15000);
    return clSearch(query, courts, pageSize);
  }
  if (res.status === 502 || res.status === 503) {
    await sleep(5000);
    return clSearch(query, courts, pageSize);
  }
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return data.results || [];
}

function extractCourtLevel(courtId) {
  if (!courtId) return "trial";
  if (courtId.includes("app") || courtId.includes("superct") || courtId.includes("specapp")) return "appellate";
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
  console.log("=== ALL CHARGES × ALL STATES COURTLISTENER PULL ===\n");
  console.log(`Mode: ${applyMode ? "APPLY" : "DRY RUN"}`);
  console.log(`Per state per charge: ${PER_STATE} cases max`);
  if (onlyState) console.log(`Single state: ${onlyState}`);
  if (onlyCharge) console.log(`Single charge: ${onlyCharge}`);

  // Load existing cluster_ids to skip dupes
  const seenClusters = new Set();
  let offset = 0;
  while (true) {
    const res = await fetch(
      `https://jxjbjmgdukwkoclydqdr.supabase.co/rest/v1/case_feature_vectors?select=cluster_id&offset=${offset}&limit=1000`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    if (!res.ok) break;
    const rows = await res.json();
    for (const r of rows) seenClusters.add(String(r.cluster_id));
    if (rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`Existing vectors: ${seenClusters.size}`);

  const charges = onlyCharge ? [onlyCharge] : Object.keys(CHARGE_QUERIES).sort();
  const states = onlyState ? [onlyState] : Object.keys(STATE_COURTS).sort();

  const allRows = [];
  const chargeSummary = {};

  for (const charge of charges) {
    const queries = CHARGE_QUERIES[charge];
    if (!queries) { console.log(`\n⚠ No queries for ${charge}`); continue; }

    console.log(`\n── ${charge} ──`);
    let chargeTotal = 0;

    for (const state of states) {
      const courts = STATE_COURTS[state];
      if (!courts) continue;

      const stateResults = [];

      for (const q of queries) {
        if (stateResults.length >= PER_STATE) break;
        const results = await clSearch(q, courts, Math.min(PER_STATE - stateResults.length, 20));
        for (const r of results) {
          if (stateResults.length >= PER_STATE) break;
          const cid = String(r.cluster_id);
          if (seenClusters.has(cid)) continue;
          seenClusters.add(cid);
          stateResults.push(r);
        }
        await sleep(400);
      }

      if (stateResults.length === 0) continue;

      for (const r of stateResults) {
        const year = r.dateFiled ? parseInt(r.dateFiled.slice(0, 4), 10) : null;
        allRows.push({
          cluster_id: String(r.cluster_id),
          features: {
            jurisdiction: state,
            court_level: extractCourtLevel(r.court_id),
            year_bucket: yearBucket(year),
            party_side: null,
            outcome: null,
            motion_types: [],
            legal_issues: [charge],
            benefit_type: null,
          },
          jurisdiction: state,
          charge_slug: charge,
        });
      }

      chargeTotal += stateResults.length;
      process.stdout.write(`  ${state}:${stateResults.length} `);
    }

    console.log(`\n  Total: ${chargeTotal}`);
    chargeSummary[charge] = chargeTotal;
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log("PULL SUMMARY");
  console.log(`${"=".repeat(50)}`);
  let grandTotal = 0;
  for (const [charge, count] of Object.entries(chargeSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${charge}: ${count}`);
    grandTotal += count;
  }
  console.log(`  TOTAL NEW: ${grandTotal}`);

  if (!applyMode) {
    console.log("\nDry run complete. Use --apply to insert.");
    return;
  }

  if (allRows.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  // Apply in batches
  console.log(`\nApplying ${allRows.length} upserts in batches of ${BATCH_SIZE}...`);
  let applied = 0, errors = 0;

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
      const bn = Math.floor(i / BATCH_SIZE) + 1;
      const tb = Math.ceil(allRows.length / BATCH_SIZE);
      if (bn % 10 === 0 || bn === tb) console.log(`  Batch ${bn}/${tb}: ${applied} applied`);
    } catch (e) {
      errors++;
      console.error(`  Batch error: ${e.message.slice(0, 200)}`);
    }
    await sleep(300);
  }

  console.log(`\n--- RESULTS ---`);
  console.log(`Applied: ${applied}  Errors: ${errors}`);
  console.log(`Total vectors now: ${seenClusters.size}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
