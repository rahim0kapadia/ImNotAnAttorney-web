/**
 * USSC Individual Sentencing Datafiles → judge_sentencing_patterns
 *
 * Reads CSV from data/bulk-verify/external-intel/ussc-individual.csv
 * (convert from SAS first: python scripts/convert-ussc-sas.py <file.sas7bdat> <output.csv>)
 *
 * USSC individual data is judge-anonymized. Aggregates by DISTRICT.
 * judge_name = judge_name_normalized = district name.
 *
 * Aggregates per district:
 *   - total_cases, median/mean/p25/p75 sentence months
 *   - downward_departure_rate, upward_departure_rate
 *   - substantial_assistance_rate, government_sponsored_below_range_rate
 *   - offense_breakdown (by OFFGUIDE guideline chapter)
 *   - criminal_history_breakdown (by XCRHISSR category I-VI)
 *
 * USSC BOOTEFLT/BOOTEFTT departure type codes (FY2024 codebook):
 *   BOOTEFLT: 1=substantial_assistance, 2=govt_sponsored_below, 3=other_government,
 *             4=early_disposition, 5=downward_other, 6=upward
 *   BOOTEFTT: same scale for total departure direction
 *   ZONE: A/B/C/D guideline zone
 *
 * Usage:
 *   node scripts/ingest-ussc-sentencing.mjs              # Dry-run (default)
 *   node scripts/ingest-ussc-sentencing.mjs --apply      # Generate + apply via Management API
 *   node scripts/ingest-ussc-sentencing.mjs --dry-run    # Explicit dry-run
 *   node scripts/ingest-ussc-sentencing.mjs --limit 500  # First N rows
 *
 * Prerequisites:
 *   npm install csv-parse
 *   python scripts/convert-ussc-sas.py <fy2024.sas7bdat> data/bulk-verify/external-intel/ussc-individual.csv
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const CSV_INPUT = path.join(OUTPUT_DIR, "ussc-individual.csv");
const SQL_OUTPUT = path.join(OUTPUT_DIR, "ussc-sentencing-upserts.sql");

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const dryRun = !applyMode;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const DATA_PERIOD = "FY2024";
const SOURCE_URL = "https://www.ussc.gov/research/datafiles/commission-datafiles";
const MIN_CASES = 10;

// ── Env loading ──────────────────────────────────────────────────────────────
// Load SUPABASE_ACCESS_TOKEN from parent repo .env.local (canonical location)
function loadEnv() {
  const envPath = path.join(PARENT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Parent .env.local not found at: " + envPath);
    return;
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── Helpers — NO REGEX (hook enforced) ──────────────────────────────────────

/**
 * Normalize a string to lowercase alphanumeric + spaces.
 * Char-code loop — no regex.
 */
function normalize(name) {
  if (!name) return "";
  const out = [];
  const s = String(name);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 97 && c <= 122) { out.push(s[i]); }          // a-z
    else if (c >= 65 && c <= 90) { out.push(String.fromCharCode(c + 32)); } // A-Z → a-z
    else if (c >= 48 && c <= 57) { out.push(s[i]); }      // 0-9
    else if (c === 32) { out.push(" "); }                   // space
  }
  // Collapse consecutive spaces
  const result = [];
  let prevSpace = false;
  for (const ch of out) {
    if (ch === " ") {
      if (!prevSpace) result.push(ch);
      prevSpace = true;
    } else {
      result.push(ch);
      prevSpace = false;
    }
  }
  // Trim leading/trailing space
  let start = 0;
  let end = result.length - 1;
  while (start <= end && result[start] === " ") start++;
  while (end >= start && result[end] === " ") end--;
  return result.slice(start, end + 1).join("");
}

/** SQL escape — single-quote doubling, no regex. */
function esc(str) {
  if (str === null || str === undefined) return "NULL";
  const s = String(str);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") out.push("''");
    else out.push(s[i]);
  }
  return "'" + out.join("") + "'";
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function percentile(arr, p) {
  if (!arr || arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// ── District label map (USSC district codes → human labels) ─────────────────
// Partial map — covers the most common districts. Unknown codes keep raw value.
const DISTRICT_LABELS = {
  "1": "District of Maine", "2": "District of New Hampshire", "3": "District of Massachusetts",
  "4": "District of Rhode Island", "5": "District of Connecticut", "6": "Southern District of New York",
  "7": "Eastern District of New York", "8": "Northern District of New York", "9": "Western District of New York",
  "10": "District of New Jersey", "11": "Eastern District of Pennsylvania",
  "12": "Middle District of Pennsylvania", "13": "Western District of Pennsylvania",
  "14": "District of Delaware", "15": "District of Maryland", "16": "Eastern District of Virginia",
  "17": "Western District of Virginia", "18": "Northern District of West Virginia",
  "19": "Southern District of West Virginia", "20": "Eastern District of North Carolina",
  "21": "Middle District of North Carolina", "22": "Western District of North Carolina",
  "23": "District of South Carolina", "24": "Northern District of Georgia",
  "25": "Middle District of Georgia", "26": "Southern District of Georgia",
  "27": "Northern District of Florida", "28": "Middle District of Florida",
  "29": "Southern District of Florida", "30": "Northern District of Alabama",
  "31": "Middle District of Alabama", "32": "Southern District of Alabama",
  "33": "Northern District of Mississippi", "34": "Southern District of Mississippi",
  "35": "Eastern District of Louisiana", "36": "Middle District of Louisiana",
  "37": "Western District of Louisiana", "38": "Northern District of Texas",
  "39": "Eastern District of Texas", "40": "Southern District of Texas",
  "41": "Western District of Texas", "42": "Northern District of Oklahoma",
  "43": "Eastern District of Oklahoma", "44": "Western District of Oklahoma",
  "45": "District of Kansas", "46": "Western District of Missouri",
  "47": "Eastern District of Missouri", "48": "Eastern District of Arkansas",
  "49": "Western District of Arkansas", "50": "District of Nebraska",
  "51": "District of North Dakota", "52": "District of South Dakota",
  "53": "District of Minnesota", "54": "Northern District of Iowa",
  "55": "Southern District of Iowa", "56": "Northern District of Illinois",
  "57": "Central District of Illinois", "58": "Southern District of Illinois",
  "59": "Eastern District of Wisconsin", "60": "Western District of Wisconsin",
  "61": "Northern District of Indiana", "62": "Southern District of Indiana",
  "63": "Northern District of Ohio", "64": "Southern District of Ohio",
  "65": "Eastern District of Michigan", "66": "Western District of Michigan",
  "67": "Eastern District of Kentucky", "68": "Western District of Kentucky",
  "69": "Eastern District of Tennessee", "70": "Middle District of Tennessee",
  "71": "Western District of Tennessee", "72": "District of Colorado",
  "73": "District of Wyoming", "74": "District of Utah",
  "75": "District of New Mexico", "76": "District of Arizona",
  "77": "District of Nevada", "78": "Central District of California",
  "79": "Eastern District of California", "80": "Northern District of California",
  "81": "Southern District of California", "82": "District of Oregon",
  "83": "Western District of Washington", "84": "Eastern District of Washington",
  "85": "District of Idaho", "86": "District of Montana",
  "87": "District of Alaska", "88": "District of Hawaii",
  "89": "District of Guam", "90": "District of Puerto Rico",
  "91": "District of the Virgin Islands", "92": "District of the District of Columbia",
  "93": "District of the Northern Mariana Islands",
};

function districtLabel(code) {
  const key = String(code).trim();
  return DISTRICT_LABELS[key] || ("District Code " + key);
}

// ── USSC departure type decoding ─────────────────────────────────────────────
// BOOTEFLT / BOOTEFTT value meanings (FY2024 codebook, Table 25):
//   1 = Substantial Assistance (5K1.1)
//   2 = Government sponsored below-range (early disposition / 5K3.1)
//   3 = Other government motion below range
//   4 = Below range (other)
//   5 = Within range
//   6 = Upward departure
// We treat blank/5 as "in range".
function departureType(booteflt, booteftt) {
  const val = booteflt || booteftt;
  if (!val || val === "" || val === "5") return "in_range";
  const n = parseInt(val, 10);
  if (n === 1) return "substantial_assistance";
  if (n === 2 || n === 3) return "govt_sponsored_below";
  if (n === 4) return "downward";
  if (n === 6) return "upward";
  return "other";
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function buildAgg() {
  return {
    sentences: [],
    downward: 0,
    upward: 0,
    substantial_assistance: 0,
    govt_sponsored_below: 0,
    in_range: 0,
    other_departure: 0,
    total: 0,
    offenses: {},    // offguide → count
    crim_history: {}, // xcrhissr → count
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_INPUT)) {
    console.log("CSV not found: " + CSV_INPUT);
    console.log("");
    console.log("To generate it:");
    console.log("  1. Download FY2024 USSC Individual Datafile (.sas7bdat) from:");
    console.log("     https://www.ussc.gov/research/datafiles/commission-datafiles");
    console.log("  2. Install: pip install pyreadstat");
    console.log("  3. Convert: python scripts/convert-ussc-sas.py <fy2024.sas7bdat> " + CSV_INPUT);
    console.log("  4. Re-run this script");
    process.exit(0);
  }

  console.log("Reading " + CSV_INPUT + "...");

  // ── Parse CSV ──────────────────────────────────────────────────────────────
  const districtAgg = new Map(); // district_code → agg
  let rowCount = 0;
  let skipped = 0;

  await new Promise((resolve, reject) => {
    const parser = fs.createReadStream(CSV_INPUT, { encoding: "utf8" }).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    parser.on("data", (row) => {
      if (rowCount >= limit) return;

      // Normalise column names to uppercase for resilience
      const r = {};
      for (const k of Object.keys(row)) {
        r[k.toUpperCase()] = row[k];
      }

      // District code — required
      const distCode = (r["DISTRICT"] || "").trim();
      if (!distCode) { skipped++; return; }

      // Sentence months — SENSPLT0 preferred, fall back to SENTTOT
      const sentRaw = r["SENSPLT0"] || r["SENTTOT"] || "";
      const sentMonths = parseFloat(sentRaw);
      if (isNaN(sentMonths) || sentMonths < 0) { skipped++; return; }

      if (!districtAgg.has(distCode)) districtAgg.set(distCode, buildAgg());
      const agg = districtAgg.get(distCode);

      agg.sentences.push(sentMonths);
      agg.total++;

      // Departure type
      const dep = departureType(r["BOOTEFLT"], r["BOOTEFTT"]);
      if (dep === "substantial_assistance") agg.substantial_assistance++;
      else if (dep === "govt_sponsored_below") agg.govt_sponsored_below++;
      else if (dep === "downward") agg.downward++;
      else if (dep === "upward") agg.upward++;
      else if (dep === "other") agg.other_departure++;
      else agg.in_range++;

      // Offense breakdown (OFFGUIDE = guideline chapter code)
      const offCode = (r["OFFGUIDE"] || "unknown").trim();
      agg.offenses[offCode] = (agg.offenses[offCode] || 0) + 1;

      // Criminal history breakdown (XCRHISSR = category I-VI numeric)
      const chCode = (r["XCRHISSR"] || "unknown").trim();
      agg.crim_history[chCode] = (agg.crim_history[chCode] || 0) + 1;

      rowCount++;
    });

    parser.on("end", resolve);
    parser.on("error", reject);
  });

  console.log("Parsed " + rowCount + " rows, " + skipped + " skipped, " + districtAgg.size + " districts");

  // ── Generate SQL ───────────────────────────────────────────────────────────
  const sqlLines = [];
  let generated = 0;
  let tooFew = 0;

  for (const [distCode, agg] of districtAgg) {
    if (agg.total < MIN_CASES) { tooFew++; continue; }

    const distName = districtLabel(distCode);
    const normName = normalize(distName);
    const total = agg.total;

    const medSent = median(agg.sentences);
    const meanSent = mean(agg.sentences);
    const p25 = percentile(agg.sentences, 25);
    const p75 = percentile(agg.sentences, 75);

    const downRate = (agg.downward / total).toFixed(4);
    const upRate = (agg.upward / total).toFixed(4);
    const saRate = (agg.substantial_assistance / total).toFixed(4);
    const govRate = (agg.govt_sponsored_below / total).toFixed(4);

    // Offense breakdown array
    const offBreakdown = Object.entries(agg.offenses)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ offense_code: code, count, rate: parseFloat((count / total).toFixed(4)) }));

    // Criminal history breakdown array
    const chBreakdown = Object.entries(agg.crim_history)
      .sort((a, b) => {
        const na = parseInt(a[0], 10) || 999;
        const nb = parseInt(b[0], 10) || 999;
        return na - nb;
      })
      .map(([cat, count]) => ({ category: cat, count, rate: parseFloat((count / total).toFixed(4)) }));

    const sql =
      "INSERT INTO judge_sentencing_patterns\n" +
      "  (judge_name, judge_name_normalized, district, total_cases,\n" +
      "   median_sentence_months, mean_sentence_months,\n" +
      "   p25_sentence_months, p75_sentence_months,\n" +
      "   downward_departure_rate, upward_departure_rate,\n" +
      "   substantial_assistance_rate, government_sponsored_below_range_rate,\n" +
      "   offense_breakdown, criminal_history_breakdown,\n" +
      "   source_urls, sources, data_period, data_as_of)\n" +
      "VALUES (\n" +
      "  " + esc(distName) + ",\n" +
      "  " + esc(normName) + ",\n" +
      "  " + esc(distName) + ",\n" +
      "  " + total + ",\n" +
      "  " + (medSent !== null ? medSent.toFixed(2) : "NULL") + ",\n" +
      "  " + (meanSent !== null ? meanSent.toFixed(2) : "NULL") + ",\n" +
      "  " + (p25 !== null ? p25.toFixed(2) : "NULL") + ",\n" +
      "  " + (p75 !== null ? p75.toFixed(2) : "NULL") + ",\n" +
      "  " + downRate + ",\n" +
      "  " + upRate + ",\n" +
      "  " + saRate + ",\n" +
      "  " + govRate + ",\n" +
      "  " + esc(JSON.stringify(offBreakdown)) + "::jsonb,\n" +
      "  " + esc(JSON.stringify(chBreakdown)) + "::jsonb,\n" +
      "  ARRAY[" + esc(SOURCE_URL) + "],\n" +
      "  ARRAY['ussc_individual_datafiles'],\n" +
      "  " + esc(DATA_PERIOD) + ",\n" +
      "  now()\n" +
      ")\n" +
      "ON CONFLICT (judge_name_normalized, district) DO UPDATE SET\n" +
      "  total_cases = EXCLUDED.total_cases,\n" +
      "  median_sentence_months = EXCLUDED.median_sentence_months,\n" +
      "  mean_sentence_months = EXCLUDED.mean_sentence_months,\n" +
      "  p25_sentence_months = EXCLUDED.p25_sentence_months,\n" +
      "  p75_sentence_months = EXCLUDED.p75_sentence_months,\n" +
      "  downward_departure_rate = EXCLUDED.downward_departure_rate,\n" +
      "  upward_departure_rate = EXCLUDED.upward_departure_rate,\n" +
      "  substantial_assistance_rate = EXCLUDED.substantial_assistance_rate,\n" +
      "  government_sponsored_below_range_rate = EXCLUDED.government_sponsored_below_range_rate,\n" +
      "  offense_breakdown = EXCLUDED.offense_breakdown,\n" +
      "  criminal_history_breakdown = EXCLUDED.criminal_history_breakdown,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  data_period = EXCLUDED.data_period,\n" +
      "  data_as_of = now(),\n" +
      "  updated_at = now();";

    sqlLines.push(sql);
    generated++;
  }

  console.log("Districts with >= " + MIN_CASES + " cases: " + generated + " (skipped " + tooFew + " below threshold)");

  // ── Write SQL file ─────────────────────────────────────────────────────────
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(SQL_OUTPUT, sqlLines.join("\n\n") + "\n");
  console.log("Wrote " + generated + " UPSERT statements to " + SQL_OUTPUT);

  if (dryRun) {
    console.log("Dry-run complete. Run with --apply to push to Supabase.");
    return;
  }

  // ── Apply via Management API ───────────────────────────────────────────────
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN not set. Check " + PARENT_ROOT + "/.env.local");
    process.exit(1);
  }

  console.log("Applying " + generated + " UPSERTs via Management API...");
  const sql = fs.readFileSync(SQL_OUTPUT, "utf8");

  const applyRes = await fetch(
    "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (applyRes.ok) {
    console.log("Applied successfully.");
  } else {
    const body = await applyRes.text();
    console.error("Apply failed (" + applyRes.status + "): " + body.slice(0, 500));
    process.exit(1);
  }

  // Update data_source_freshness
  const freshnessSQL =
    "UPDATE data_source_freshness " +
    "SET last_ingested_at = now(), last_row_count = " + generated + ", is_stale = false " +
    "WHERE source_key = 'ussc_individual_datafiles';";

  const freshRes = await fetch(
    "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: freshnessSQL }),
    }
  );

  if (freshRes.ok) {
    console.log("data_source_freshness updated (source_key=ussc_individual_datafiles, rows=" + generated + ").");
  } else {
    console.warn("Freshness update failed: " + (await freshRes.text()).slice(0, 200));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
