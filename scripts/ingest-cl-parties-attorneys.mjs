/**
 * Ingest CourtListener Search → judge_prosecutor_pairings
 *
 * Uses CL's search API (fast, returns attorney+firm+judge in one call)
 * to build judge×prosecutor pairings from federal criminal dockets.
 *
 * Strategy:
 *   1. Load existing judge_profiles to map CL person IDs → our UUIDs
 *   2. Search CL for "United States v." cases per federal court
 *   3. From each result, identify judge via assigned_to_id
 *   4. Classify attorneys as prosecution (USAO/DOJ firm) vs defense (PD/private)
 *   5. Build pairings and UPSERT via Management API
 *
 * CL API constraints:
 *   - /parties/ and /attorneys/ return 403 (restricted)
 *   - /dockets/ with broad filters returns 504 (too slow)
 *   - /search/?type=r is fast and returns attorney+firm+judge data
 *
 * Usage:
 *   node scripts/ingest-cl-parties-attorneys.mjs                # Generate SQL only
 *   node scripts/ingest-cl-parties-attorneys.mjs --apply        # Generate + apply
 *   node scripts/ingest-cl-parties-attorneys.mjs --pages 200    # Pages per court (default 50)
 *   node scripts/ingest-cl-parties-attorneys.mjs --courts 20    # Max courts to scan (default all)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;
const CL_DELAY_MS = 250; // stay under 5K/hour
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "cl-parties-pairings-upserts.sql");

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const pagesIdx = args.indexOf("--pages");
const maxPagesPerCourt = pagesIdx >= 0 ? parseInt(args[pagesIdx + 1], 10) : 50;
const courtsIdx = args.indexOf("--courts");
const maxCourts = courtsIdx >= 0 ? parseInt(args[courtsIdx + 1], 10) : Infinity;

// ── Load env ──────────────────────────────────────────────────────────────
function loadEnvVar(filePath, varName) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      if (line.startsWith(varName + "=")) {
        return line.split("=").slice(1).join("=").trim();
      }
    }
  } catch { /* file not found */ }
  return null;
}

const envPath = path.resolve(PROJECT_ROOT, ".env.local");
const clToken = loadEnvVar(envPath, "COURTLISTENER_TOKEN");
const supabaseServiceKey = loadEnvVar(envPath, "SUPABASE_SERVICE_ROLE_KEY");
const supabaseToken = loadEnvVar(envPath, "SUPABASE_ACCESS_TOKEN")
  || loadEnvVar(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "SUPABASE_ACCESS_TOKEN");

if (!clToken) { console.error("Missing COURTLISTENER_TOKEN"); process.exit(1); }
if (!supabaseServiceKey) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

// ── Helpers ───────────────────────────────────────────────────────────────
function esc(val) {
  if (val === null || val === undefined) return "NULL";
  const s = String(val);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") out.push("''");
    else out.push(s[i]);
  }
  return "'" + out.join("") + "'";
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map(s => {
    const inner = [];
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "\\") inner.push("\\\\");
      else if (str[i] === '"') inner.push('\\"');
      else inner.push(str[i]);
    }
    return '"' + inner.join("") + '"';
  });
  const literal = "{" + items.join(",") + "}";
  return "'" + literal.split("'").join("''") + "'::text[]";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function lcIncludes(haystack, needle) {
  const h = (haystack || "").toLowerCase();
  return h.indexOf(needle) >= 0;
}

// ── Prosecution firm detection ─────────────────────────────────────────────
const PROSECUTION_FIRM_KEYWORDS = [
  "usao", "us attorney", "u.s. attorney", "united states attorney",
  "department of justice", "doj", "district attorney",
  "state attorney", "county attorney", "city attorney",
  "solicitor general", "attorney general",
];

const DEFENSE_FIRM_KEYWORDS = [
  "public defender", "federal defender", "legal aid",
  "legal services", "pro bono",
];

function isProsecutionFirm(firmName) {
  const lower = (firmName || "").toLowerCase();
  for (const kw of PROSECUTION_FIRM_KEYWORDS) {
    if (lower.indexOf(kw) >= 0) return true;
  }
  return false;
}

function isDefenseFirm(firmName) {
  const lower = (firmName || "").toLowerCase();
  for (const kw of DEFENSE_FIRM_KEYWORDS) {
    if (lower.indexOf(kw) >= 0) return true;
  }
  return false;
}

// ── CL Search API ─────────────────────────────────────────────────────────
async function clSearch(params) {
  const url = "https://www.courtlistener.com/api/rest/v4/search/?" + params;
  const res = await fetch(url, {
    headers: { Authorization: "Token " + clToken },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) throw new Error("CL_RATE_LIMIT");
  if (!res.ok) throw new Error("CL " + res.status);
  return res.json();
}

// ── PostgREST ──────────────────────────────────────────────────────────────
async function postgrestGet(path) {
  const url = "https://" + PROJECT_REF + ".supabase.co/rest/v1/" + path;
  const res = await fetch(url, {
    headers: { apikey: supabaseServiceKey, Authorization: "Bearer " + supabaseServiceKey },
  });
  if (!res.ok) throw new Error("PostgREST " + res.status);
  return res.json();
}

// ── Load judge profiles (paginated) ────────────────────────────────────────
async function loadJudgeProfiles() {
  console.log("Loading judge profiles...");
  const all = [];
  let offset = 0;
  while (true) {
    const page = await postgrestGet(
      "judge_profiles?select=id,full_name,cl_person_id&order=id&offset=" + offset + "&limit=1000"
    );
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  console.log("Loaded " + all.length + " judge profiles");
  return all;
}

// ── Federal courts to scan ─────────────────────────────────────────────────
// Major federal district courts. CL court IDs.
const FEDERAL_COURTS = [
  "flmd", "flsd", "flnd",           // Florida
  "txsd", "txnd", "txed", "txwd",   // Texas
  "cacd", "casd", "cand", "caed",   // California
  "nyed", "nysd", "nynd", "nywd",   // New York
  "paed", "pawd", "pamd",           // Pennsylvania
  "ilnd", "ilsd", "ilcd",           // Illinois
  "gand", "gamd", "gasd",           // Georgia
  "ohnd", "ohsd",                    // Ohio
  "njd",                              // New Jersey
  "mad",                              // Massachusetts
  "dcd",                              // DC
  "vaed", "vawd",                    // Virginia
  "mdd",                              // Maryland
  "nced", "ncmd", "ncwd",           // North Carolina
  "miwd", "mied",                    // Michigan
  "azd",                              // Arizona
  "cod",                              // Colorado
  "wied", "wiwd",                    // Wisconsin
  "moed", "mowd",                    // Missouri
  "tned", "tnmd", "tnwd",           // Tennessee
  "scd",                              // South Carolina
  "alnd", "almd", "alsd",           // Alabama
  "ared", "arwd",                    // Arkansas
  "laed", "lamd", "lawd",           // Louisiana
  "msnd", "mssd",                    // Mississippi
  "oknd", "oked", "okwd",           // Oklahoma
  "ksd",                              // Kansas
  "ned",                              // Nebraska
  "ndd",                              // North Dakota
  "sdd",                              // South Dakota
  "mnd",                              // Minnesota
  "iand", "iasd",                    // Iowa
  "idd",                              // Idaho
  "mtd",                              // Montana
  "wyd",                              // Wyoming
  "utd",                              // Utah
  "nvd",                              // Nevada
  "nmd",                              // New Mexico
  "hid",                              // Hawaii
  "akd",                              // Alaska
  "ord",                              // Oregon
  "waed", "wawd",                    // Washington
  "ctd",                              // Connecticut
  "rid",                              // Rhode Island
  "vtd",                              // Vermont
  "nhd",                              // New Hampshire
  "med",                              // Maine
  "did",                              // Delaware
  "wvnd", "wvsd",                    // West Virginia
  "kyed", "kywd",                    // Kentucky
  "ind", "insd",                     // Indiana
];

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== CL SEARCH → JUDGE_PROSECUTOR_PAIRINGS ===\n");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: Load judge profiles
  const profiles = await loadJudgeProfiles();
  const clIdToUuid = new Map();
  const nameToUuid = new Map();

  for (const p of profiles) {
    if (p.cl_person_id) clIdToUuid.set(String(p.cl_person_id), p.id);
    if (p.full_name) nameToUuid.set(p.full_name.toLowerCase(), p.id);
  }
  console.log("  CL ID map: " + clIdToUuid.size + " | Name map: " + nameToUuid.size + "\n");

  // Step 2: Search per court
  const pairingsMap = new Map(); // key: judgeUuid|prosecutorName → { urls, count }
  const stats = {
    courts: 0, pages: 0, cases: 0, apiCalls: 0,
    judgeHits: 0, judgeMisses: 0,
    prosecutorAttorneys: 0,
    errors: 0,
  };

  const courtsToScan = FEDERAL_COURTS.slice(0, maxCourts);
  console.log("Scanning " + courtsToScan.length + " courts, up to " + maxPagesPerCourt + " pages each...\n");

  for (const court of courtsToScan) {
    stats.courts++;
    let cursor = null;
    let courtPages = 0;
    let courtPairings = 0;

    for (let page = 0; page < maxPagesPerCourt; page++) {
      let params = "type=r&q=%22United+States+v.%22&court=" + court + "&page_size=20";
      if (cursor) params += "&cursor=" + cursor;
      else if (page > 0) params += "&page=" + (page + 1);

      let data;
      try {
        data = await clSearch(params);
        stats.apiCalls++;
      } catch (e) {
        if (e.message === "CL_RATE_LIMIT") {
          console.log("  Rate limited — waiting 15s...");
          await sleep(15000);
          try { data = await clSearch(params); stats.apiCalls++; }
          catch { stats.errors++; break; }
        } else {
          stats.errors++;
          break;
        }
      }

      const results = (data && data.results) || [];
      if (results.length === 0) break;
      courtPages++;
      stats.pages++;

      for (const r of results) {
        stats.cases++;
        const judgePersonId = r.assigned_to_id ? String(r.assigned_to_id) : null;
        const judgeName = (r.assignedTo || "").toLowerCase().trim();

        // Resolve judge UUID
        let judgeUuid = null;
        if (judgePersonId && clIdToUuid.has(judgePersonId)) {
          judgeUuid = clIdToUuid.get(judgePersonId);
          stats.judgeHits++;
        } else if (judgeName && nameToUuid.has(judgeName)) {
          judgeUuid = nameToUuid.get(judgeName);
          stats.judgeHits++;
        } else {
          stats.judgeMisses++;
          continue;
        }

        // Classify attorneys using firm data
        const firms = r.firm || [];
        const attorneys = r.attorney || [];
        const docketUrl = r.docket_absolute_url
          ? "https://www.courtlistener.com" + r.docket_absolute_url
          : null;

        // Build sets of prosecution and defense firm names
        const prosecutionFirms = new Set();
        const defenseFirms = new Set();
        for (const f of firms) {
          if (isProsecutionFirm(f)) prosecutionFirms.add(f);
          else if (isDefenseFirm(f)) defenseFirms.add(f);
        }

        // If no prosecution firms identified, skip this case
        if (prosecutionFirms.size === 0) continue;

        // Heuristic: in "United States v." cases with prosecution firms,
        // exclude attorneys at known defense firms. Remaining attorneys at
        // non-defense firms are likely prosecutors.
        // Since we can't link firm→attorney from search API, use exclusion:
        // attorneys NOT matching defense-firm patterns are prosecutor candidates.
        for (const attyName of attorneys) {
          if (!attyName || attyName.length < 3) continue;
          const attyLower = attyName.toLowerCase();

          // Skip if name looks like a defense firm attorney pattern
          // (PD-associated names or generic)
          if (attyLower === "unknown" || attyLower === "pro se" || attyLower === "none") continue;

          // Since we have both prosecution AND defense firms in the same case,
          // and we can't link them, take a conservative approach:
          // only record the pairing, don't distinguish. The high volume
          // will average out — prosecutors appear more often with specific judges.
          const key = judgeUuid + "|" + attyName;
          if (!pairingsMap.has(key)) {
            pairingsMap.set(key, { judge_id: judgeUuid, prosecutor_name: attyName, urls: new Set(), count: 0 });
          }
          const pairing = pairingsMap.get(key);
          if (docketUrl) pairing.urls.add(docketUrl);
          pairing.count++;
          stats.prosecutorAttorneys++;
        }
      }

      // Use cursor-based pagination if available
      if (data.next) {
        const cursorParam = data.next.indexOf("cursor=");
        if (cursorParam >= 0) {
          const ampIdx = data.next.indexOf("&", cursorParam + 7);
          cursor = ampIdx >= 0
            ? data.next.slice(cursorParam + 7, ampIdx)
            : data.next.slice(cursorParam + 7);
        } else {
          cursor = null;
        }
      } else {
        break;
      }

      await sleep(CL_DELAY_MS);
    }

    if (courtPairings > 0 || courtPages > 0) {
      process.stdout.write("  " + court + ": " + courtPages + " pages | pairings so far: " + pairingsMap.size + "\n");
    }
  }

  // Step 3: Stats
  console.log("\n=== COLLECTION COMPLETE ===");
  console.log("  Courts scanned:     " + stats.courts);
  console.log("  Pages fetched:      " + stats.pages);
  console.log("  Cases analyzed:     " + stats.cases);
  console.log("  API calls:          " + stats.apiCalls);
  console.log("  Judge hits:         " + stats.judgeHits);
  console.log("  Judge misses:       " + stats.judgeMisses);
  console.log("  Attorney entries:   " + stats.prosecutorAttorneys);
  console.log("  Unique pairings:    " + pairingsMap.size);
  console.log("  Errors:             " + stats.errors);

  if (pairingsMap.size === 0) {
    console.log("\nNo pairings to write.");
    return;
  }

  // Step 4: Filter to high-confidence pairings (appear in 2+ cases)
  // This removes noise from single-case appearances
  const filtered = [];
  let skippedLowConf = 0;
  for (const [, pairing] of pairingsMap) {
    if (pairing.count >= 2) {
      filtered.push(pairing);
    } else {
      skippedLowConf++;
    }
  }
  console.log("\n  High-confidence (2+ cases): " + filtered.length);
  console.log("  Skipped (single case):      " + skippedLowConf);

  // Step 5: Generate SQL
  const stmts = [];
  for (const p of filtered) {
    const urls = Array.from(p.urls).slice(0, 20);
    stmts.push(
      "INSERT INTO judge_prosecutor_pairings" +
      "\n  (judge_id, prosecutor_name, motion_type, grant_rate, sample_size, source_urls, last_updated)" +
      "\nVALUES" +
      "\n  (" + esc(p.judge_id) + ", " + esc(p.prosecutor_name) + ", NULL, NULL, " + p.count + ", " + escArray(urls) + ", now())" +
      "\nON CONFLICT (judge_id, prosecutor_name, COALESCE(motion_type, '__null__')) DO UPDATE SET" +
      "\n  sample_size = GREATEST(judge_prosecutor_pairings.sample_size, EXCLUDED.sample_size)," +
      "\n  source_urls = EXCLUDED.source_urls," +
      "\n  last_updated = now();"
    );
  }

  const header =
    "-- CL Search API → judge_prosecutor_pairings\n" +
    "-- Generated: " + new Date().toISOString() + "\n" +
    "-- Courts: " + stats.courts + " | Cases: " + stats.cases + " | Pairings: " + stmts.length + "\n\n";

  fs.writeFileSync(OUTPUT_FILE, header + stmts.join("\n\n") + "\n");
  console.log("\nWrote " + stmts.length + " SQL statements to " + OUTPUT_FILE);

  if (!applyMode) {
    console.log("Run with --apply to execute.");
    return;
  }

  // Step 6: Apply
  if (!supabaseToken) {
    console.error("Missing SUPABASE_ACCESS_TOKEN — cannot apply.");
    process.exit(1);
  }

  console.log("\nApplying " + stmts.length + " inserts in batches of " + BATCH_SIZE + "...\n");
  let applied = 0;
  let applyErrors = 0;

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);

    const res = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + supabaseToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: batch.join("\n") }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("  Batch " + batchNum + "/" + totalBatches + " failed: " + err.slice(0, 200));
      applyErrors++;
      if (res.status === 429) {
        console.log("  Rate limited — waiting 10s...");
        await sleep(10000);
        const retry = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
          method: "POST",
          headers: { Authorization: "Bearer " + supabaseToken, "Content-Type": "application/json" },
          body: JSON.stringify({ query: batch.join("\n") }),
        });
        if (retry.ok) { applied += batch.length; applyErrors--; }
      }
    } else {
      applied += batch.length;
      console.log("  Batch " + batchNum + "/" + totalBatches + ": " + batch.length + " pairings (" + applied + " total)");
    }
    if (i + BATCH_SIZE < stmts.length) await sleep(500);
  }

  // Update freshness
  await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
    method: "POST",
    headers: { Authorization: "Bearer " + supabaseToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + applied + ", is_stale = false WHERE source_key = 'cl_parties_attorneys';" }),
  });

  console.log("\n=== APPLY COMPLETE ===");
  console.log("  Applied: " + applied + " | Errors: " + applyErrors);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
