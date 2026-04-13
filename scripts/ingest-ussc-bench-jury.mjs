/**
 * USSC Bench vs Jury Divergence Pipeline
 *
 * Downloads and processes USSC Individual Offender Datafiles (FY14-FY24)
 * to compute bench trial vs jury trial sentencing divergence by federal district.
 *
 * DISPOSIT codes: 1=Guilty Plea, 2=Nolo, 3=Jury Trial, 4=Bench Trial, 5=Plea+Trial(>1ct)
 * SENTTOT: total sentence in months (0=probation, 470=life, 9996-9999=missing)
 *
 * Produces per district + offense category:
 *   - bench/jury median and mean sentence months
 *   - trial_penalty_pct = (jury_median - bench_median) / bench_median * 100
 *   - plea median sentence for context
 *   - sample sizes
 *
 * Target: bench_jury_divergence table (sentencing columns added by 20260412a migration)
 *
 * Usage:
 *   node scripts/ingest-ussc-bench-jury.mjs                     # Process local CSVs (dry-run)
 *   node scripts/ingest-ussc-bench-jury.mjs --download           # Download missing years first
 *   node scripts/ingest-ussc-bench-jury.mjs --download --apply   # Download + process + push to DB
 *   node scripts/ingest-ussc-bench-jury.mjs --years 20,21,22,23  # Specific fiscal years only
 *   node scripts/ingest-ussc-bench-jury.mjs --limit 5000         # First N rows per CSV (testing)
 *
 * Prerequisites:
 *   npm install csv-parse
 *   .env.local with SUPABASE_SERVICE_ROLE_KEY (or parent repo .env.local with SUPABASE_ACCESS_TOKEN)
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { execSync } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const USSC_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel", "ussc");
const SQL_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel", "ussc-bench-jury-upserts.sql");
const SOURCE_URL = "https://www.ussc.gov/research/datafiles/commission-datafiles";

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const doDownload = args.includes("--download");
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const rowLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const yearsIdx = args.indexOf("--years");
const targetYears = yearsIdx >= 0
  ? args[yearsIdx + 1].split(",").map((y) => y.trim())
  : null; // null = all available

// Default range: FY14-FY24 (11 years, ~550 bench + ~18K jury trials)
const ALL_YEARS = ["14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"];

// Minimum sample thresholds for inclusion
const MIN_BENCH_AGGREGATE = 2;   // bench trials are rare (~50/year nationally)
const MIN_JURY_AGGREGATE = 10;
const MIN_BENCH_PER_OFFENSE = 2;
const MIN_JURY_PER_OFFENSE = 5;

// ── Columns we need (header-name → local key) ──────────────────────────────
const NEEDED_COLS = ["DISPOSIT", "SENTTOT", "SENSPLT0", "DISTRICT", "OFFGUIDE", "SENTRNGE"];

// ── Env loading ─────────────────────────────────────────────────────────────

function loadToken() {
  const envPath = path.join(PARENT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    const localEnv = path.join(PROJECT_ROOT, ".env.local");
    if (!fs.existsSync(localEnv)) return null;
    return loadTokenFrom(localEnv);
  }
  return loadTokenFrom(envPath);
}

function loadTokenFrom(envPath) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      return line.split("=").slice(1).join("=").trim();
    }
  }
  return null;
}

// ── District label map (USSC district codes → human labels) ─────────────────

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
  return DISTRICT_LABELS[String(code).trim()] || ("District Code " + code);
}

// ── OFFGUIDE → offense category labels ──────────────────────────────────────

const OFFGUIDE_LABELS = {
  "1": "Homicide", "2": "Sex Offenses", "3": "Kidnapping",
  "4": "Drug Trafficking", "5": "Drug Possession", "6": "Fraud",
  "7": "Property Offenses", "8": "Robbery", "9": "Arson",
  "10": "Extortion/Racketeering", "11": "Firearms", "12": "Tax",
  "13": "Money Laundering", "14": "Immigration", "15": "Child Exploitation",
  "16": "Administration of Justice", "17": "Environmental", "18": "Food & Drug",
  "19": "National Defense", "20": "Antitrust", "21": "Bribery/Corruption",
  "22": "Civil Rights", "23": "Counterfeiting", "24": "Gambling",
  "25": "Money Laundering", "26": "Individual Rights", "27": "Other",
  "28": "Pornography/Prostitution", "29": "Prison Offenses", "30": "Stalking/Harassment",
};

function offguideLabel(code) {
  const key = String(code).trim();
  return OFFGUIDE_LABELS[key] || OFFGUIDE_LABELS[key.padStart(2, "0")] || ("Offense " + key);
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

// ── SQL helpers (no regex — hook enforced) ──────────────────────────────────

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

// ── Download helpers ────────────────────────────────────────────────────────

function downloadFile(url, dest, redirects) {
  if (redirects === undefined) redirects = 5;
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error("Too many redirects"));

    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);

    proto.get(url, { headers: { "User-Agent": "Mozilla/5.0 (USSC-Research)" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirect without Location header"));
        // Handle relative redirects
        const nextUrl = location.startsWith("http") ? location : new URL(location, url).href;
        return downloadFile(nextUrl, dest, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error("HTTP " + res.statusCode));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(resolve); });
      file.on("error", (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
    }).on("error", (e) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(e);
    });
  });
}

function findCsvInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith(".csv") && f.indexOf("opafy") >= 0) return path.join(dir, f);
  }
  // Check one level of subdirectories
  for (const f of files) {
    const sub = path.join(dir, f);
    try {
      if (fs.statSync(sub).isDirectory()) {
        const found = findCsvInDir(sub);
        if (found) return found;
      }
    } catch {}
  }
  return null;
}

// USSC URL patterns vary by year:
// FY24: opafy24nid_csv.zip (CSV) — only year with CSV
// FY18-FY23: opafy{YY}nid.zip (SAS/SPSS) — need Python conversion
// FY16-FY17: opafy{YY}-nid.zip (SAS/SPSS, hyphenated)
// FY15: opafy15nid.zip (SAS/SPSS)
function sasZipUrl(yy) {
  const yyNum = parseInt(yy, 10);
  const sep = (yyNum === 16 || yyNum === 17) ? "-" : "";
  return "https://www.ussc.gov/sites/default/files/zip/opafy" + yy + sep + "nid.zip";
}

function findSasInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.endsWith(".sas7bdat") || lower.endsWith(".sav")) return path.join(dir, f);
  }
  for (const f of files) {
    const sub = path.join(dir, f);
    try {
      if (fs.statSync(sub).isDirectory()) {
        const found = findSasInDir(sub);
        if (found) return found;
      }
    } catch {}
  }
  return null;
}

async function downloadYear(yy) {
  const yearDir = path.join(USSC_DIR, "fy" + yy);

  // Check if CSV already exists
  const existing = findCsvInDir(yearDir);
  if (existing) {
    console.log("  FY" + yy + ": already extracted at " + path.basename(existing));
    return existing;
  }
  const fullDir = path.join(USSC_DIR, "fy" + yy + "-full");
  const existingFull = findCsvInDir(fullDir);
  if (existingFull) {
    console.log("  FY" + yy + ": already extracted at " + path.relative(USSC_DIR, existingFull));
    return existingFull;
  }

  fs.mkdirSync(yearDir, { recursive: true });

  // Try CSV zip first (only works for FY24)
  const csvUrl = "https://www.ussc.gov/sites/default/files/zip/opafy" + yy + "nid_csv.zip";
  const csvZipPath = path.join(USSC_DIR, "opafy" + yy + "nid_csv.zip");
  let downloaded = false;

  try {
    console.log("  FY" + yy + ": trying CSV zip...");
    await downloadFile(csvUrl, csvZipPath);
    execSync(
      "powershell -Command \"Expand-Archive -Path '" + csvZipPath + "' -DestinationPath '" + yearDir + "' -Force\"",
      { timeout: 120000, stdio: "pipe" }
    );
    const csv = findCsvInDir(yearDir);
    if (csv) { console.log("  FY" + yy + ": CSV extracted"); return csv; }
  } catch {}

  // Fall back to SAS zip + Python conversion
  const sasUrl = sasZipUrl(yy);
  const sasZipPath = path.join(USSC_DIR, "opafy" + yy + "nid.zip");
  console.log("  FY" + yy + ": downloading SAS from " + sasUrl + "...");
  try {
    await downloadFile(sasUrl, sasZipPath);
    const stats = fs.statSync(sasZipPath);
    console.log("  FY" + yy + ": downloaded " + (stats.size / 1024 / 1024).toFixed(1) + " MB");
  } catch (e) {
    console.log("  FY" + yy + ": download FAILED — " + e.message);
    return null;
  }

  // Extract SAS
  try {
    execSync(
      "powershell -Command \"Expand-Archive -Path '" + sasZipPath + "' -DestinationPath '" + yearDir + "' -Force\"",
      { timeout: 120000, stdio: "pipe" }
    );
  } catch (e) {
    console.log("  FY" + yy + ": extract FAILED — " + (e.message || "").slice(0, 100));
    return null;
  }

  // Check if CSV was already converted (from a previous run)
  const existingCsv = findCsvInDir(yearDir);
  if (existingCsv) {
    console.log("  FY" + yy + ": CSV already exists at " + path.basename(existingCsv));
    return existingCsv;
  }

  // USSC pre-FY24 ships fixed-width .dat + .sas syntax (not .sas7bdat)
  // Use convert-ussc-dat.py to parse column positions and extract needed columns
  const csvOut = path.join(yearDir, "opafy" + yy + "nid.csv");
  console.log("  FY" + yy + ": converting .dat → CSV via column positions...");
  try {
    const converterPath = path.join(PROJECT_ROOT, "scripts", "convert-ussc-dat.py");
    execSync(
      "python \"" + converterPath + "\" \"" + yearDir + "\"",
      { timeout: 600000, stdio: "pipe" }
    );
    console.log("  FY" + yy + ": converted to CSV");
    return findCsvInDir(yearDir);
  } catch (e) {
    // Fall back to .sas7bdat converter if .dat approach fails
    const sasFile = findSasInDir(yearDir);
    if (sasFile) {
      try {
        const sasPyPath = path.join(PROJECT_ROOT, "scripts", "convert-ussc-sas.py");
        execSync(
          "python \"" + sasPyPath + "\" \"" + sasFile + "\" \"" + csvOut + "\"",
          { timeout: 600000, stdio: "pipe" }
        );
        return csvOut;
      } catch {}
    }
    console.log("  FY" + yy + ": conversion FAILED — " + (e.message || "").slice(0, 150));
    return null;
  }
}

// ── CSV Discovery ───────────────────────────────────────────────────────────

function discoverLocalCsvs() {
  const csvPaths = [];
  const years = targetYears || ALL_YEARS;
  for (const yy of years) {
    // Check fy{yy}/ and fy{yy}-full/
    for (const suffix of ["", "-full"]) {
      const dir = path.join(USSC_DIR, "fy" + yy + suffix);
      const csv = findCsvInDir(dir);
      if (csv) {
        csvPaths.push({ year: yy, path: csv });
        break;
      }
    }
  }
  return csvPaths;
}

// ── CSV Parsing via readline (csv-parse chokes on 27K columns) ──────────────
// USSC values are all numeric — no embedded commas — simple split is safe.
// One file at a time per OOM gotcha.

async function parseUSSCCsv(csvPath, fyLabel, groups, stats) {
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headerMap = null;
  let rowCount = 0;
  let trialRows = 0;

  for await (const line of rl) {
    if (!headerMap) {
      // First line = header — build index for needed columns
      const fields = line.split(",");
      headerMap = {};
      for (let i = 0; i < fields.length; i++) {
        let col = fields[i].trim().toUpperCase();
        // Strip surrounding quotes from header names
        if (col.length >= 2 && col[0] === '"' && col[col.length - 1] === '"') {
          col = col.slice(1, -1);
        }
        if (NEEDED_COLS.indexOf(col) >= 0) {
          headerMap[col] = i;
        }
      }
      if (headerMap.DISPOSIT === undefined || headerMap.DISTRICT === undefined) {
        console.log("    SKIP " + fyLabel + ": missing DISPOSIT or DISTRICT column");
        break;
      }
      if (headerMap.SENTTOT === undefined && headerMap.SENSPLT0 === undefined) {
        console.log("    SKIP " + fyLabel + ": missing SENTTOT and SENSPLT0 columns");
        break;
      }
      continue;
    }

    if (rowCount >= rowLimit) break;
    rowCount++;

    // Split and extract only needed fields by index
    const fields = line.split(",");

    const disposit = (fields[headerMap.DISPOSIT] || "").trim();
    const distCode = (fields[headerMap.DISTRICT] || "").trim();

    // Only process trials (3=jury, 4=bench) and pleas (1=guilty plea, 2=nolo)
    if (disposit !== "1" && disposit !== "2" && disposit !== "3" && disposit !== "4") continue;
    if (!distCode) continue;

    // Sentence months — prefer SENSPLT0, fall back to SENTTOT
    const sentRaw = headerMap.SENSPLT0 !== undefined ? (fields[headerMap.SENSPLT0] || "") : "";
    const sentFallback = headerMap.SENTTOT !== undefined ? (fields[headerMap.SENTTOT] || "") : "";
    const sentMonths = parseFloat(sentRaw || sentFallback);

    // Filter invalid sentences (9996-9999 = missing codes in USSC)
    if (isNaN(sentMonths) || sentMonths < 0 || sentMonths > 9000) continue;

    const offCode = headerMap.OFFGUIDE !== undefined ? (fields[headerMap.OFFGUIDE] || "").trim() : "";

    // Get or create groups for this district + offense and district aggregate
    const offKey = distCode + "|" + (offCode || "unknown");
    const aggKey = distCode + "|all";

    if (!groups.has(offKey)) groups.set(offKey, { bench: [], jury: [], plea: [] });
    if (!groups.has(aggKey)) groups.set(aggKey, { bench: [], jury: [], plea: [] });

    const offGroup = groups.get(offKey);
    const aggGroup = groups.get(aggKey);

    if (disposit === "3") {
      offGroup.jury.push(sentMonths);
      aggGroup.jury.push(sentMonths);
      trialRows++;
    } else if (disposit === "4") {
      offGroup.bench.push(sentMonths);
      aggGroup.bench.push(sentMonths);
      trialRows++;
    } else {
      offGroup.plea.push(sentMonths);
      aggGroup.plea.push(sentMonths);
    }
  }

  stats.totalRows += rowCount;
  stats.trialRows += trialRows;
  console.log("    " + fyLabel + ": " + rowCount.toLocaleString() + " rows, " + trialRows + " trial rows");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== USSC BENCH VS JURY DIVERGENCE PIPELINE ===\n");

  fs.mkdirSync(USSC_DIR, { recursive: true });

  // ── Phase 1: Discover / download CSVs ─────────────────────────────────────

  const years = targetYears || ALL_YEARS;
  const csvFiles = [];

  if (doDownload) {
    console.log("Downloading USSC CSVs for FY" + years.join(", FY") + "...\n");
    for (const yy of years) {
      const csvPath = await downloadYear(yy);
      if (csvPath) csvFiles.push({ year: yy, path: csvPath });
    }
    console.log("");
  } else {
    const local = discoverLocalCsvs();
    csvFiles.push(...local);
  }

  if (csvFiles.length === 0) {
    console.log("No CSV files found. Run with --download to fetch from USSC.");
    console.log("URL pattern: https://www.ussc.gov/sites/default/files/zip/opafy{YY}nid_csv.zip");
    process.exit(0);
  }

  console.log("Processing " + csvFiles.length + " CSV file(s):\n");
  for (const f of csvFiles) {
    console.log("  FY" + f.year + ": " + f.path);
  }
  console.log("");

  // ── Phase 2: Parse CSVs sequentially (one at a time per OOM gotcha) ───────

  // groups: Map<"distCode|offCode", { bench: number[], jury: number[], plea: number[] }>
  const groups = new Map();
  const stats = { totalRows: 0, trialRows: 0 };

  for (const f of csvFiles) {
    await parseUSSCCsv(f.path, "FY" + f.year, groups, stats);
  }

  const fyMin = csvFiles[0].year;
  const fyMax = csvFiles[csvFiles.length - 1].year;
  const fiscalYearRange = csvFiles.length === 1
    ? "FY20" + fyMin
    : "FY20" + fyMin + "-FY20" + fyMax;

  console.log("\n--- Aggregation Summary ---");
  console.log("Total rows parsed: " + stats.totalRows.toLocaleString());
  console.log("Trial rows (bench + jury): " + stats.trialRows.toLocaleString());
  console.log("Groups (district x offense): " + groups.size);
  console.log("Fiscal year range: " + fiscalYearRange);

  // ── Phase 3: Compute divergence stats ─────────────────────────────────────

  const results = [];
  let filteredTooFew = 0;

  for (const [key, data] of groups) {
    const sepIdx = key.indexOf("|");
    const distCode = key.slice(0, sepIdx);
    const offCode = key.slice(sepIdx + 1);

    const isAggregate = offCode === "all";

    // Minimum sample thresholds
    const minBench = isAggregate ? MIN_BENCH_AGGREGATE : MIN_BENCH_PER_OFFENSE;
    const minJury = isAggregate ? MIN_JURY_AGGREGATE : MIN_JURY_PER_OFFENSE;

    if (data.bench.length < minBench || data.jury.length < minJury) {
      filteredTooFew++;
      continue;
    }

    const distName = districtLabel(distCode);
    const offName = isAggregate ? "All Offenses" : offguideLabel(offCode);

    const benchMedian = median(data.bench);
    const juryMedian = median(data.jury);
    const benchMean = mean(data.bench);
    const juryMean = mean(data.jury);
    const pleaMedian = data.plea.length > 0 ? median(data.plea) : null;

    // Trial penalty: how much longer jury sentences are vs bench (%)
    let trialPenalty = null;
    if (benchMedian !== null && juryMedian !== null) {
      if (benchMedian > 0) {
        trialPenalty = (juryMedian - benchMedian) / benchMedian * 100;
      }
      // If bench median is 0 (all probation) but jury > 0, can't compute meaningful %
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

  // Print top 15
  console.log("\n--- Top 15 by Trial Penalty ---");
  const sorted = results.slice().filter((r) => r.trialPenalty !== null).sort((a, b) => b.trialPenalty - a.trialPenalty);
  for (let i = 0; i < Math.min(15, sorted.length); i++) {
    const r = sorted[i];
    const penaltyStr = r.trialPenalty !== null ? (r.trialPenalty >= 0 ? "+" : "") + r.trialPenalty.toFixed(1) + "%" : "N/A";
    console.log(
      "  " + r.distName.padEnd(35) +
      r.chargeSlug.padEnd(22) +
      "Bench: " + (r.benchMedian !== null ? r.benchMedian.toFixed(1) : "?").padEnd(8) +
      "Jury: " + (r.juryMedian !== null ? r.juryMedian.toFixed(1) : "?").padEnd(8) +
      "Penalty: " + penaltyStr.padEnd(10) +
      "n=" + r.benchSample + "/" + r.jurySample
    );
  }

  if (results.length === 0) {
    console.log("\nNo divergence data met sample thresholds.");
    return;
  }

  // ── Phase 4: Generate SQL ─────────────────────────────────────────────────

  const sqlLines = [];

  // Clear existing USSC district-level data (idempotent rebuild)
  sqlLines.push("DELETE FROM bench_jury_divergence WHERE judge_id IS NULL AND district IS NOT NULL;");
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
      "  fiscal_year_range, source_urls\n" +
      ") VALUES (\n" +
      "  NULL, " + esc(r.distName) + ", " + esc(r.chargeSlug) + ", " + esc(r.offenseCategory) + ",\n" +
      "  " + numOrNull(r.benchMedian) + ", " + numOrNull(r.juryMedian) + ",\n" +
      "  " + numOrNull(r.benchMean) + ", " + numOrNull(r.juryMean) + ",\n" +
      "  " + (r.trialPenalty !== null ? r.trialPenalty.toFixed(1) : "NULL") + ",\n" +
      "  " + numOrNull(r.pleaMedian) + ", " + r.pleaSample + ",\n" +
      "  " + r.benchSample + ", " + r.jurySample + ",\n" +
      "  " + esc(fiscalYearRange) + ", ARRAY[" + esc(SOURCE_URL) + "]\n" +
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

  // ── Phase 5: Apply via Management API ─────────────────────────────────────

  const token = loadToken();
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN not found. Check parent .env.local");
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
    console.log("Applied successfully — " + results.length + " rows inserted.");
  } else {
    const body = await res.text();
    console.error("Apply failed (" + res.status + "): " + body.slice(0, 500));
    process.exit(1);
  }

  // Update data_source_freshness
  const freshnessSQL =
    "INSERT INTO data_source_freshness (source_key, source_name, source_url, last_ingested_at, last_row_count, is_stale) " +
    "VALUES ('ussc_bench_jury_divergence', 'USSC Bench vs Jury Divergence', 'https://www.ussc.gov/research/datafiles/commission-datafiles', now(), " + results.length + ", false) " +
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
    console.log("data_source_freshness updated (source_key=ussc_bench_jury_divergence).");
  } else {
    console.warn("Freshness update failed: " + (await freshRes.text()).slice(0, 200));
  }

  console.log("\nDone. Feature gate in render.ts will auto-reveal bench/jury section.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
