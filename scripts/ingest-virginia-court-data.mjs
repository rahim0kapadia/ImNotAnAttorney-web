/**
 * Virginia Circuit Criminal Court, Bench vs Jury Divergence Pipeline
 *
 * Ingests Virginia circuit criminal court data (2024) into bench_jury_divergence table.
 * Data source: virginiacourtdata.org, anonymized circuit criminal case records.
 *
 * ConcludedBy values:
 *   "Trial - Judge With Witness" = bench trial
 *   "Trial - Jury"              = jury trial
 *   "Guilty Plea"               = plea deal
 *
 * SentenceTime is in DAYS, convert to months via / 30.44.
 *
 * Groups by Virginia FIPS locality code (mapped to county/city name) + ChargeType.
 * Produces per locality + offense type:
 *   - bench/jury median and mean sentence months
 *   - trial_penalty_pct = (jury_median - bench_median) / bench_median * 100
 *   - plea median sentence for context
 *   - sample sizes
 *
 * Target: bench_jury_divergence table (state_code = 'VA', data distinguishable from USSC)
 *
 * Usage:
 *   node scripts/ingest-virginia-court-data.mjs                 # Dry-run (default)
 *   node scripts/ingest-virginia-court-data.mjs --apply         # Push to Supabase
 *   node scripts/ingest-virginia-court-data.mjs --limit 10000   # First N rows per CSV (testing)
 *
 * Prerequisites:
 *   .env.local with SUPABASE_ACCESS_TOKEN (or parent repo .env.local)
 *   CSV shards in data/bulk-verify/external-intel/virginia-court-data/circuit_criminal_2024/
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const VA_DATA_DIR = path.join(
  PROJECT_ROOT, "data", "bulk-verify", "external-intel",
  "virginia-court-data", "circuit_criminal_2024"
);
const SQL_OUTPUT = path.join(
  PROJECT_ROOT, "data", "bulk-verify", "external-intel",
  "virginia-bench-jury-upserts.sql"
);
const SOURCE_URL = "https://virginiacourtdata.org/";
const FISCAL_YEAR = "2024";

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const rowLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// Minimum sample thresholds, Virginia jury trials are rare (~1,856 across 274K rows)
const MIN_BENCH_AGGREGATE = 2;
const MIN_JURY_AGGREGATE = 2;
const MIN_BENCH_PER_TYPE = 3;
const MIN_JURY_PER_TYPE = 3;

// Days per month for conversion
const DAYS_PER_MONTH = 30.44;

// ── Virginia FIPS → Locality Name map ──────────────────────────────────────
// Standard US Census FIPS county codes for Virginia (state 51).
// Verified against virginiacourtdata.org CSV locality cross-reference.
// Counties: 001-199 (odd + 036). Independent cities: 510-840.

const VA_FIPS = {
  // Counties
  "1": "Accomack County", "3": "Albemarle County", "5": "Alleghany County",
  "7": "Amelia County", "9": "Amherst County", "11": "Appomattox County",
  "13": "Arlington County", "15": "Augusta County", "17": "Bath County",
  "19": "Bedford County", "21": "Bland County", "23": "Botetourt County",
  "25": "Brunswick County", "27": "Buchanan County", "29": "Buckingham County",
  "31": "Campbell County", "33": "Caroline County", "35": "Carroll County",
  "36": "Charles City County", "37": "Charlotte County",
  "41": "Chesterfield County", "43": "Clarke County", "45": "Craig County",
  "47": "Culpeper County", "49": "Cumberland County", "51": "Dickenson County",
  "53": "Dinwiddie County", "57": "Essex County", "59": "Fairfax County",
  "61": "Fauquier County", "63": "Floyd County", "65": "Fluvanna County",
  "67": "Franklin County", "69": "Frederick County", "71": "Giles County",
  "73": "Gloucester County", "75": "Goochland County", "77": "Grayson County",
  "79": "Greene County", "81": "Greensville County", "83": "Halifax County",
  "85": "Hanover County", "87": "Henrico County", "89": "Henry County",
  "91": "Highland County", "93": "Isle of Wight County", "95": "James City County",
  "97": "King and Queen County", "99": "King George County",
  "101": "King William County", "103": "Lancaster County", "105": "Lee County",
  "107": "Loudoun County", "109": "Louisa County", "111": "Lunenburg County",
  "113": "Madison County", "115": "Mathews County", "117": "Mecklenburg County",
  "119": "Middlesex County", "121": "Montgomery County", "125": "Nelson County",
  "127": "New Kent County", "131": "Northampton County",
  "133": "Northumberland County", "135": "Nottoway County", "137": "Orange County",
  "139": "Page County", "141": "Patrick County", "143": "Pittsylvania County",
  "145": "Powhatan County", "147": "Prince Edward County",
  "149": "Prince George County", "153": "Prince William County",
  "155": "Pulaski County", "157": "Rappahannock County", "159": "Richmond County",
  "161": "Roanoke County", "163": "Rockbridge County", "165": "Rockingham County",
  "167": "Russell County", "169": "Scott County", "171": "Shenandoah County",
  "173": "Smyth County", "175": "Southampton County", "177": "Spotsylvania County",
  "179": "Stafford County", "181": "Surry County", "183": "Sussex County",
  "185": "Tazewell County", "187": "Warren County", "191": "Washington County",
  "193": "Westmoreland County", "195": "Wise County", "197": "Wythe County",
  "199": "York County",
  // Independent cities
  "510": "Alexandria", "520": "Bristol", "530": "Buena Vista",
  "540": "Charlottesville", "550": "Chesapeake", "570": "Colonial Heights",
  "580": "Covington", "590": "Danville", "595": "Emporia",
  "600": "Fairfax City", "610": "Falls Church", "620": "Franklin City",
  "630": "Fredericksburg", "640": "Galax", "650": "Hampton",
  "660": "Harrisonburg", "670": "Hopewell", "678": "Lexington",
  "680": "Lynchburg", "683": "Manassas", "685": "Manassas Park",
  "690": "Martinsville", "700": "Newport News", "710": "Norfolk",
  "720": "Norton", "730": "Petersburg", "735": "Poquoson",
  "740": "Portsmouth", "750": "Radford", "760": "Richmond City",
  "770": "Roanoke City", "775": "Salem", "790": "Staunton",
  "800": "Suffolk", "810": "Virginia Beach", "820": "Waynesboro",
  "830": "Williamsburg", "840": "Winchester",
};

function fipsLabel(code) {
  return VA_FIPS[String(code).trim()] || ("VA FIPS " + code);
}

// ── CSV field splitter (respects quoted fields, addresses have commas) ─────

function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Math helpers ────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

// ── SQL helpers (no regex, hook enforced) ──────────────────────────────────

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

function numOrNull(v) {
  return v !== null && v !== undefined ? Number(v).toFixed(2) : "NULL";
}

// ── Env loading ─────────────────────────────────────────────────────────────

function loadToken() {
  for (const envPath of [
    path.join(PARENT_ROOT, ".env.local"),
    path.join(PROJECT_ROOT, ".env.local"),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
        return line.split("=").slice(1).join("=").trim();
      }
    }
  }
  return null;
}

// ── CSV Parsing, one file at a time per OOM gotcha ─────────────────────────

const NEEDED_HEADERS = ["ConcludedBy", "SentenceTime", "fips", "ChargeType", "Class"];

async function parseVirginiaCsv(csvPath, label, groups, stats) {
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headerMap = null;
  let rowCount = 0;
  let trialRows = 0;
  let parseErrors = 0;

  try {
    for await (const line of rl) {
      if (!headerMap) {
        const fields = splitCsvLine(line);
        headerMap = {};
        for (let i = 0; i < fields.length; i++) {
          headerMap[fields[i].trim()] = i;
        }
        // Verify required columns exist
        for (const col of NEEDED_HEADERS) {
          if (headerMap[col] === undefined) {
            console.log("    SKIP " + label + ": missing column " + col);
            return;
          }
        }
        continue;
      }

      if (rowCount >= rowLimit) break;
      rowCount++;

      const fields = splitCsvLine(line);

      const concluded = (fields[headerMap.ConcludedBy] || "").trim();
      const fips = (fields[headerMap.fips] || "").trim();
      const chargeType = (fields[headerMap.ChargeType] || "").trim();
      const sentRaw = (fields[headerMap.SentenceTime] || "").trim();

      // Only bench trials, jury trials, and guilty pleas
      let trialType;
      if (concluded === "Trial - Judge With Witness") trialType = "bench";
      else if (concluded === "Trial - Jury") trialType = "jury";
      else if (concluded === "Guilty Plea") trialType = "plea";
      else continue;

      // Must have FIPS code
      if (!fips) continue;

      // Only Felony and Misdemeanor (skip Infraction, Civil, Other)
      if (chargeType !== "Felony" && chargeType !== "Misdemeanor") continue;

      // Parse sentence days → months
      const sentDays = parseFloat(sentRaw);
      if (isNaN(sentDays) || sentDays < 0) continue;
      // Filter extreme values (>100 years = 36500 days, likely data error)
      if (sentDays > 36500) continue;

      const sentMonths = sentDays / DAYS_PER_MONTH;

      // Group keys: locality aggregate + locality + chargeType
      const aggKey = fips + "|all";
      const typeKey = fips + "|" + chargeType;

      if (!groups.has(aggKey)) groups.set(aggKey, { bench: [], jury: [], plea: [] });
      if (!groups.has(typeKey)) groups.set(typeKey, { bench: [], jury: [], plea: [] });

      groups.get(aggKey)[trialType].push(sentMonths);
      groups.get(typeKey)[trialType].push(sentMonths);

      if (trialType === "bench" || trialType === "jury") trialRows++;
    }
  } catch (err) {
    parseErrors++;
    console.log("    PARSE ERROR in " + label + ": " + (err.message || "").slice(0, 200));
    console.log("    Rows parsed before error: " + rowCount);
  }

  stats.totalRows += rowCount;
  stats.trialRows += trialRows;
  stats.parseErrors += parseErrors;
  console.log(
    "    " + label + ": " + rowCount.toLocaleString() + " rows, " +
    trialRows + " trial rows" + (parseErrors > 0 ? " (" + parseErrors + " parse errors)" : "")
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== VIRGINIA BENCH VS JURY DIVERGENCE PIPELINE ===\n");

  // Discover CSV shards
  if (!fs.existsSync(VA_DATA_DIR)) {
    console.error("Data directory not found: " + VA_DATA_DIR);
    process.exit(1);
  }

  const csvFiles = fs.readdirSync(VA_DATA_DIR)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map((f) => path.join(VA_DATA_DIR, f));

  if (csvFiles.length === 0) {
    console.error("No CSV files found in " + VA_DATA_DIR);
    process.exit(1);
  }

  console.log("CSV shards found: " + csvFiles.length);
  for (const f of csvFiles) console.log("  " + path.basename(f));
  console.log("");

  // ── Phase 1: Parse CSVs sequentially (one at a time per OOM gotcha) ───────

  const groups = new Map();
  const stats = { totalRows: 0, trialRows: 0, parseErrors: 0 };

  for (const csvPath of csvFiles) {
    await parseVirginiaCsv(csvPath, path.basename(csvPath), groups, stats);
  }

  console.log("\n--- Aggregation Summary ---");
  console.log("Total rows parsed: " + stats.totalRows.toLocaleString());
  console.log("Trial rows (bench + jury): " + stats.trialRows.toLocaleString());
  console.log("Groups (locality x type): " + groups.size);

  // ── Phase 2: Compute divergence stats ─────────────────────────────────────

  const results = [];
  let filteredTooFew = 0;

  for (const [key, data] of groups) {
    const sepIdx = key.indexOf("|");
    const fips = key.slice(0, sepIdx);
    const typeCode = key.slice(sepIdx + 1);
    const isAggregate = typeCode === "all";

    const minBench = isAggregate ? MIN_BENCH_AGGREGATE : MIN_BENCH_PER_TYPE;
    const minJury = isAggregate ? MIN_JURY_AGGREGATE : MIN_JURY_PER_TYPE;

    if (data.bench.length < minBench || data.jury.length < minJury) {
      filteredTooFew++;
      continue;
    }

    const distName = fipsLabel(fips);
    const offName = isAggregate ? "All Offenses" : typeCode;

    const benchMedian = median(data.bench);
    const juryMedian = median(data.jury);
    const benchMean = mean(data.bench);
    const juryMean = mean(data.jury);
    const pleaMedian = data.plea.length > 0 ? median(data.plea) : null;

    let trialPenalty = null;
    if (benchMedian !== null && juryMedian !== null && benchMedian > 0) {
      trialPenalty = (juryMedian - benchMedian) / benchMedian * 100;
    }

    results.push({
      distName,
      chargeSlug: offName,
      offenseCategory: offName,
      benchMedian,
      juryMedian,
      benchMean,
      juryMean,
      trialPenalty,
      pleaMedian,
      pleaSample: data.plea.length,
      benchSample: data.bench.length,
      jurySample: data.jury.length,
    });
  }

  // Sort: aggregates first per district, then by jury sample size
  results.sort((a, b) => {
    if (a.distName !== b.distName) return a.distName.localeCompare(b.distName);
    if (a.chargeSlug === "All Offenses") return -1;
    if (b.chargeSlug === "All Offenses") return 1;
    return b.jurySample - a.jurySample;
  });

  console.log("\nDivergence rows generated: " + results.length);
  console.log("Filtered (below threshold): " + filteredTooFew);

  // Print top 20 by trial penalty
  console.log("\n--- Top 20 by Trial Penalty ---");
  const sorted = results.slice()
    .filter((r) => r.trialPenalty !== null)
    .sort((a, b) => b.trialPenalty - a.trialPenalty);
  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const r = sorted[i];
    const penaltyStr = r.trialPenalty !== null
      ? (r.trialPenalty >= 0 ? "+" : "") + r.trialPenalty.toFixed(1) + "%"
      : "N/A";
    console.log(
      "  " + r.distName.padEnd(28) +
      r.chargeSlug.padEnd(16) +
      "Bench: " + (r.benchMedian !== null ? r.benchMedian.toFixed(1) + "mo" : "?").padEnd(10) +
      "Jury: " + (r.juryMedian !== null ? r.juryMedian.toFixed(1) + "mo" : "?").padEnd(10) +
      "Penalty: " + penaltyStr.padEnd(10) +
      "n=" + r.benchSample + "/" + r.jurySample + "/" + r.pleaSample
    );
  }

  // Locality summary
  const localities = new Set(results.map((r) => r.distName));
  console.log("\n--- Locality Coverage ---");
  console.log("Localities with data: " + localities.size);

  if (results.length === 0) {
    console.log("\nNo divergence data met sample thresholds.");
    return;
  }

  // ── Phase 3: Generate SQL ─────────────────────────────────────────────────

  const sqlLines = [];

  // Clear existing Virginia data (idempotent rebuild), scoped to state_code = 'VA'
  sqlLines.push("DELETE FROM bench_jury_divergence WHERE state_code = 'VA';");
  sqlLines.push("");

  for (const r of results) {
    const sql =
      "INSERT INTO bench_jury_divergence (\n" +
      "  judge_id, district, charge_slug, offense_category,\n" +
      "  bench_median_sentence, jury_median_sentence,\n" +
      "  bench_mean_sentence, jury_mean_sentence,\n" +
      "  trial_penalty_pct,\n" +
      "  plea_median_sentence, plea_sample,\n" +
      "  bench_sample, jury_sample,\n" +
      "  fiscal_year_range, source_urls, state_code\n" +
      ") VALUES (\n" +
      "  NULL, " + esc(r.distName) + ", " + esc(r.chargeSlug) + ", " + esc(r.offenseCategory) + ",\n" +
      "  " + numOrNull(r.benchMedian) + ", " + numOrNull(r.juryMedian) + ",\n" +
      "  " + numOrNull(r.benchMean) + ", " + numOrNull(r.juryMean) + ",\n" +
      "  " + (r.trialPenalty !== null ? r.trialPenalty.toFixed(1) : "NULL") + ",\n" +
      "  " + numOrNull(r.pleaMedian) + ", " + r.pleaSample + ",\n" +
      "  " + r.benchSample + ", " + r.jurySample + ",\n" +
      "  " + esc(FISCAL_YEAR) + ", ARRAY[" + esc(SOURCE_URL) + "], 'VA'\n" +
      ");";

    sqlLines.push(sql);
  }

  // Write SQL file
  fs.mkdirSync(path.dirname(SQL_OUTPUT), { recursive: true });
  fs.writeFileSync(SQL_OUTPUT, sqlLines.join("\n") + "\n");
  console.log("\nSQL written to: " + SQL_OUTPUT);
  console.log("Statements: 1 DELETE + " + results.length + " INSERTs");

  if (!applyMode) {
    console.log("\nDry-run complete. Run with --apply to push to Supabase.");
    return;
  }

  // ── Phase 4: Apply via Management API ─────────────────────────────────────

  const token = loadToken();
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN not found. Check .env.local files.");
    process.exit(1);
  }

  console.log("\nApplying " + (results.length + 1) + " statements via Management API...");

  const fullSql = sqlLines.join("\n");
  const res = await fetch(
    "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: fullSql }),
    }
  );

  if (res.ok) {
    console.log("Applied successfully, " + results.length + " rows inserted.");
  } else {
    const body = await res.text();
    console.error("Apply failed (" + res.status + "): " + body.slice(0, 500));
    process.exit(1);
  }

  // Update data_source_freshness
  const freshnessSQL =
    "INSERT INTO data_source_freshness (source_key, source_name, source_url, last_ingested_at, last_row_count, is_stale) " +
    "VALUES ('virginia_bench_jury_divergence', 'Virginia Circuit Criminal Bench vs Jury', " + esc(SOURCE_URL) + ", now(), " + results.length + ", false) " +
    "ON CONFLICT (source_key) DO UPDATE SET " +
    "last_ingested_at = now(), last_row_count = " + results.length + ", is_stale = false;";

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
    console.log("data_source_freshness updated (source_key=virginia_bench_jury_divergence).");
  } else {
    console.warn("Freshness update failed: " + (await freshRes.text()).slice(0, 200));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
