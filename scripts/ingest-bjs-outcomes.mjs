/**
 * BJS Felony Sentences in State Courts → outcome_benchmarks
 *
 * Reads CSV from data/bulk-verify/external-intel/bjs-felony.csv
 * (download from https://bjs.ojp.gov/topics/courts, Felony Sentences in State Courts)
 *
 * Aggregates by (jurisdiction_level, jurisdiction_name, offense_type) and computes:
 *   - conviction_rate, acquittal_rate, dismissal_rate
 *   - plea_rate, trial_rate
 *   - plea_trial_penalty_pct
 *   - median_sentence_months, mean_sentence_months
 *   - avg_days_to_disposition
 *
 * UPSERT key: (jurisdiction_level, jurisdiction_name, offense_type)
 * Also updates data_source_freshness with source_key='bjs_felony_sentences'
 *
 * Usage:
 *   node scripts/ingest-bjs-outcomes.mjs              # Dry-run (generate SQL only)
 *   node scripts/ingest-bjs-outcomes.mjs --apply      # Generate + apply via Management API
 *
 * Data source: https://bjs.ojp.gov/topics/courts
 *   1. Visit the URL above
 *   2. Download "Felony Sentences in State Courts" CSV or Excel-exported CSV
 *   3. Save to: data/bulk-verify/external-intel/bjs-felony.csv
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const CSV_INPUT = path.join(OUTPUT_DIR, "bjs-felony.csv");
const SQL_OUTPUT = path.join(OUTPUT_DIR, "bjs-outcome-upserts.sql");

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const dryRun = !applyMode;

const BATCH_SIZE = 200;
const SOURCE_URL = "https://bjs.ojp.gov/topics/courts";
const SOURCE_KEY = "bjs_felony_sentences";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Env loading ──────────────────────────────────────────────────────────────
// Load SUPABASE_ACCESS_TOKEN from parent repo .env.local (canonical location)
function loadEnv() {
  const envPath = path.join(PARENT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    const localPath = path.join(PROJECT_ROOT, ".env.local");
    if (!fs.existsSync(localPath)) return;
    const lines = fs.readFileSync(localPath, "utf8").split("\n");
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
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

// ── Helpers, NO REGEX (hook enforced) ──────────────────────────────────────

/**
 * Normalize a string: lowercase, keep a-z, 0-9, and space only.
 * Char-code loop, no regex on file contents.
 */
function normalize(name) {
  if (!name) return "";
  const out = [];
  const s = String(name);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 97 && c <= 122) { out.push(s[i]); }                         // a-z
    else if (c >= 65 && c <= 90) { out.push(String.fromCharCode(c + 32)); } // A-Z → a-z
    else if (c >= 48 && c <= 57) { out.push(s[i]); }                      // 0-9
    else if (c === 32) { out.push(" "); }                                   // space
  }
  // Collapse consecutive spaces and trim
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
  let start = 0;
  let end = result.length - 1;
  while (start <= end && result[start] === " ") start++;
  while (end >= start && result[end] === " ") end--;
  return result.slice(start, end + 1).join("");
}

/** SQL escape, single-quote doubling, no regex. */
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

/** Return SQL literal for a nullable float, fixed to 4 decimal places. */
function fmtFloat(n) {
  if (n === null || n === undefined || isNaN(n)) return "NULL";
  return n.toFixed(4);
}

/** Return SQL literal for a nullable float (2 decimal places). */
function fmtFloat2(n) {
  if (n === null || n === undefined || isNaN(n)) return "NULL";
  return n.toFixed(2);
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = arr.slice().sort(function(a, b) { return a - b; });
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

/**
 * Find a column value by trying multiple possible header names.
 * BJS CSV schema varies by dataset year, this handles all known variants.
 * Returns the first non-empty match, or null.
 */
function col(row, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (row[key] !== undefined && row[key] !== null) {
      const trimmed = String(row[key]).trim();
      if (trimmed !== "" && trimmed !== "." && trimmed !== "N/A" && trimmed !== ", ") {
        return trimmed;
      }
    }
  }
  return null;
}

/**
 * Parse a rate value that may be expressed as a percentage (0-100) or decimal (0-1).
 * BJS uses both formats across different publications.
 * Returns a decimal rate (0.0-1.0) or null.
 */
function parseRate(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "." || s === "N/A") return null;
  // Strip trailing % sign if present (char code 37)
  let numStr = s;
  if (s.charCodeAt(s.length - 1) === 37) {
    numStr = s.slice(0, s.length - 1).trim();
  }
  const n = parseFloat(numStr);
  if (isNaN(n)) return null;
  // If value > 1.0 it is a percentage (0-100 scale), normalize to 0-1
  if (n > 1.0) return n / 100;
  return n;
}

/**
 * Parse a count value. Returns integer or null.
 */
function parseCount(raw) {
  if (raw === null || raw === undefined) return null;
  // Remove commas (thousands separators) using char-code loop
  let s = String(raw).trim();
  const digits = [];
  let hasDot = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) { digits.push(s[i]); }   // 0-9
    else if (c === 46 && !hasDot) { digits.push("."); hasDot = true; } // decimal point
    // skip commas (44) and other chars
  }
  const n = parseFloat(digits.join(""));
  return isNaN(n) ? null : Math.round(n);
}

/**
 * Parse sentence months. BJS sometimes uses years, detect and convert.
 * Returns numeric months or null.
 */
function parseSentenceMonths(raw, columnName) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "." || s === "N/A") return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // If column name hints at years, convert to months
  if (columnName) {
    const lcName = columnName.toLowerCase();
    let isYears = false;
    // char-code scan for "year" in column name
    for (let i = 0; i + 3 < lcName.length; i++) {
      if (
        lcName.charCodeAt(i) === 121 &&      // y
        lcName.charCodeAt(i + 1) === 101 &&  // e
        lcName.charCodeAt(i + 2) === 97 &&   // a
        lcName.charCodeAt(i + 3) === 114     // r
      ) {
        isYears = true;
        break;
      }
    }
    if (isYears) return n * 12;
  }
  return n;
}

// ── Key detection: scan row headers to map to canonical field names ──────────

/**
 * Given a row object from csv-parse, attempt to identify which CSV column maps
 * to which logical BJS field. Returns a field-map object.
 * Uses char-code comparisons to find substring matches, no regex.
 */
function buildFieldMap(headers) {
  const map = {};

  function lcContains(haystack, needle) {
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    if (n.length > h.length) return false;
    for (let i = 0; i <= h.length - n.length; i++) {
      let match = true;
      for (let j = 0; j < n.length; j++) {
        if (h.charCodeAt(i + j) !== n.charCodeAt(j)) { match = false; break; }
      }
      if (match) return true;
    }
    return false;
  }

  for (const h of headers) {
    const lh = h.toLowerCase().trim();

    // Offense type column
    if (
      lh === "most serious offense" || lh === "offense_type" || lh === "offense" ||
      lh === "most serious offense type" || lh === "offense type" ||
      lcContains(lh, "offense") && !lcContains(lh, "drug") && !lcContains(lh, "violent") && !lcContains(lh, "property")
    ) {
      if (!map.offense) map.offense = h;
    }

    // Jurisdiction / state column
    if (
      lh === "state" || lh === "jurisdiction" || lh === "jurisdiction_name" ||
      lh === "state name" || lcContains(lh, "state") || lcContains(lh, "jurisdiction")
    ) {
      if (!map.jurisdiction) map.jurisdiction = h;
    }

    // Total cases column
    if (
      lh === "total" || lh === "number of cases" || lh === "total_cases" ||
      lh === "total felony convictions" || lh === "all offenses" ||
      (lcContains(lh, "total") && !lcContains(lh, "sentence")) ||
      lcContains(lh, "number of cases")
    ) {
      if (!map.total) map.total = h;
    }

    // Conviction columns
    if (
      lh === "conviction rate" || lh === "conviction_rate" || lh === "percent convicted" ||
      lh === "convicted" || lcContains(lh, "conviction rate") || lcContains(lh, "percent convicted")
    ) {
      if (!map.conviction_rate) map.conviction_rate = h;
    }
    if (
      lh === "convicted" || lh === "number convicted" || lcContains(lh, "number convicted")
    ) {
      if (!map.convicted_count) map.convicted_count = h;
    }

    // Acquittal columns
    if (
      lh === "acquittal rate" || lh === "acquittal_rate" || lh === "percent acquitted" ||
      lh === "acquitted" || lcContains(lh, "acquittal") || lcContains(lh, "acquitted")
    ) {
      if (!map.acquittal_rate) map.acquittal_rate = h;
    }

    // Dismissal columns
    if (
      lh === "dismissal rate" || lh === "dismissal_rate" || lh === "percent dismissed" ||
      lh === "dismissed" || lcContains(lh, "dismissal") || lcContains(lh, "dismissed")
    ) {
      if (!map.dismissal_rate) map.dismissal_rate = h;
    }

    // Plea disposition
    if (
      lh === "plea rate" || lh === "plea_rate" || lh === "guilty plea" ||
      lh === "percent plea" || lh === "plea" ||
      lcContains(lh, "plea rate") || lcContains(lh, "guilty plea") ||
      (lcContains(lh, "plea") && !lcContains(lh, "penalty") && !lcContains(lh, "trial"))
    ) {
      if (!map.plea_rate) map.plea_rate = h;
    }

    // Trial disposition
    if (
      lh === "trial rate" || lh === "trial_rate" || lh === "jury trial" ||
      lh === "percent trial" || lcContains(lh, "trial rate") ||
      (lcContains(lh, "trial") && !lcContains(lh, "penalty") && !lcContains(lh, "bench"))
    ) {
      if (!map.trial_rate) map.trial_rate = h;
    }

    // Sentence columns, plea
    if (
      lh === "mean sentence length (months) plea" || lh === "plea_avg_sentence" ||
      lh === "mean sentence plea" || lh === "average sentence plea" ||
      (lcContains(lh, "plea") && lcContains(lh, "sentence")) ||
      (lcContains(lh, "plea") && lcContains(lh, "mean"))
    ) {
      if (!map.plea_sentence) map.plea_sentence = h;
    }

    // Sentence columns, trial
    if (
      lh === "mean sentence length (months) trial" || lh === "trial_avg_sentence" ||
      lh === "mean sentence trial" || lh === "average sentence trial" ||
      (lcContains(lh, "trial") && lcContains(lh, "sentence")) ||
      (lcContains(lh, "trial") && lcContains(lh, "mean"))
    ) {
      if (!map.trial_sentence) map.trial_sentence = h;
    }

    // General sentence columns
    if (
      lh === "mean sentence" || lh === "mean_sentence_months" || lh === "mean sentence (months)" ||
      lh === "average sentence" || lh === "mean sentence length" ||
      (lcContains(lh, "mean sentence") && !lcContains(lh, "plea") && !lcContains(lh, "trial"))
    ) {
      if (!map.mean_sentence) map.mean_sentence = h;
    }
    if (
      lh === "median sentence" || lh === "median_sentence_months" || lh === "median sentence (months)" ||
      (lcContains(lh, "median sentence") && !lcContains(lh, "plea") && !lcContains(lh, "trial"))
    ) {
      if (!map.median_sentence) map.median_sentence = h;
    }

    // Days to disposition
    if (
      lh === "avg_days_to_disposition" || lh === "days to disposition" ||
      lh === "average days to disposition" || lh === "mean days to disposition" ||
      lcContains(lh, "days to disposition") || lcContains(lh, "time to disposition")
    ) {
      if (!map.days_to_disposition) map.days_to_disposition = h;
    }
  }

  return map;
}

// ── Aggregation bucket ────────────────────────────────────────────────────────

function buildAgg() {
  return {
    total: 0,
    convicted: 0,
    acquitted: 0,
    dismissed: 0,
    plea: 0,
    trial: 0,
    plea_sentences: [],
    trial_sentences: [],
    all_sentences: [],
    days_to_disposition: [],
    // direct rates from CSV (used when counts not available)
    conviction_rate_sum: 0,
    acquittal_rate_sum: 0,
    dismissal_rate_sum: 0,
    plea_rate_sum: 0,
    trial_rate_sum: 0,
    rate_rows: 0,
    mean_sentence_sum: 0,
    mean_sentence_rows: 0,
    median_sentence_sum: 0,
    median_sentence_rows: 0,
    plea_sentence_sum: 0,
    plea_sentence_rows: 0,
    trial_sentence_sum: 0,
    trial_sentence_rows: 0,
    days_sum: 0,
    days_rows: 0,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BJS FELONY OUTCOMES INGESTION ===\n");

  if (!fs.existsSync(CSV_INPUT)) {
    console.log("BJS data file not found at:");
    console.log("  " + CSV_INPUT);
    console.log("");
    console.log("To download:");
    console.log("  1. Visit https://bjs.ojp.gov/topics/courts");
    console.log("  2. Locate 'Felony Sentences in State Courts' (most recent year)");
    console.log("  3. Download the supplemental CSV or convert the Excel tables to CSV");
    console.log("  4. Save to: " + CSV_INPUT);
    console.log("");
    console.log("BJS publishes this report approximately every 4 years.");
    console.log("The data includes state-level conviction/acquittal/dismissal/plea rates,");
    console.log("sentence lengths by offense type, and time-to-disposition statistics.");
    process.exit(0);
  }

  console.log("Reading BJS CSV from: " + CSV_INPUT);
  const raw = fs.readFileSync(CSV_INPUT, "utf-8");

  let rows;
  try {
    rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    console.error("Failed to parse CSV: " + err.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error("CSV is empty, nothing to process.");
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  console.log("Parsed " + rows.length + " rows");
  console.log("Column headers detected: " + headers.join(", "));
  console.log("");

  const fieldMap = buildFieldMap(headers);
  console.log("Field mapping resolved:");
  for (const k of Object.keys(fieldMap)) {
    console.log("  " + k + " → " + fieldMap[k]);
  }
  console.log("");

  // ── Step 1: Aggregate rows by (jurisdiction_level, jurisdiction_name, offense_type) ──

  // Map key: "national|United States|Violent" or "state|California|Drug"
  const aggMap = new Map();

  let parsed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Extract offense type
    const offenseRaw = col(row, [
      fieldMap.offense,
      "Most Serious Offense", "offense_type", "Offense",
      "Most Serious Offense Type", "offense type", "Offense Type",
    ].filter(Boolean));

    if (!offenseRaw) { skipped++; continue; }
    const offenseType = normalize(offenseRaw) || offenseRaw.toLowerCase().trim();

    // Extract jurisdiction
    const jurisdictionRaw = col(row, [
      fieldMap.jurisdiction,
      "State", "Jurisdiction", "jurisdiction_name", "state",
      "State Name", "JURISDICTION",
    ].filter(Boolean));

    // Determine jurisdiction level and name
    let jurisdictionLevel;
    let jurisdictionName;

    if (!jurisdictionRaw) {
      // No jurisdiction column, treat entire dataset as national
      jurisdictionLevel = "national";
      jurisdictionName = "United States";
    } else {
      const jNorm = jurisdictionRaw.toLowerCase().trim();
      // Detect national-level rows using char-code substring scan
      const isNational = (
        jNorm === "united states" || jNorm === "u.s." || jNorm === "us" ||
        jNorm === "national" || jNorm === "all states" || jNorm === "total"
      );
      if (isNational) {
        jurisdictionLevel = "national";
        jurisdictionName = "United States";
      } else {
        jurisdictionLevel = "state";
        jurisdictionName = jurisdictionRaw.trim();
      }
    }

    // Extract total case count
    const totalRaw = col(row, [
      fieldMap.total,
      "Total", "Number of cases", "total_cases",
      "Total Felony Convictions", "All Offenses",
    ].filter(Boolean));
    const totalCases = parseCount(totalRaw);

    // Extract rates (direct from CSV)
    const convRate = parseRate(col(row, [
      fieldMap.conviction_rate,
      "Conviction rate", "conviction_rate", "Percent convicted", "Convicted",
    ].filter(Boolean)));

    const acqRate = parseRate(col(row, [
      fieldMap.acquittal_rate,
      "Acquittal rate", "acquittal_rate", "Percent acquitted", "Acquitted",
    ].filter(Boolean)));

    const dismissRate = parseRate(col(row, [
      fieldMap.dismissal_rate,
      "Dismissal rate", "dismissal_rate", "Percent dismissed", "Dismissed",
    ].filter(Boolean)));

    const pleaRate = parseRate(col(row, [
      fieldMap.plea_rate,
      "Plea rate", "plea_rate", "Guilty plea", "Percent plea", "Plea",
    ].filter(Boolean)));

    const trialRate = parseRate(col(row, [
      fieldMap.trial_rate,
      "Trial rate", "trial_rate", "Jury trial", "Percent trial",
    ].filter(Boolean)));

    // Extract sentence data
    const plaSentRaw = col(row, [
      fieldMap.plea_sentence,
      "Mean sentence length (months) plea", "plea_avg_sentence",
      "Mean sentence plea", "Average sentence plea",
    ].filter(Boolean));
    const pleaSent = parseSentenceMonths(plaSentRaw, fieldMap.plea_sentence);

    const trialSentRaw = col(row, [
      fieldMap.trial_sentence,
      "Mean sentence length (months) trial", "trial_avg_sentence",
      "Mean sentence trial", "Average sentence trial",
    ].filter(Boolean));
    const trialSent = parseSentenceMonths(trialSentRaw, fieldMap.trial_sentence);

    const meanSentRaw = col(row, [
      fieldMap.mean_sentence,
      "Mean sentence", "mean_sentence_months", "Mean sentence (months)",
      "Average sentence", "Mean sentence length",
    ].filter(Boolean));
    const meanSent = parseSentenceMonths(meanSentRaw, fieldMap.mean_sentence);

    const medSentRaw = col(row, [
      fieldMap.median_sentence,
      "Median sentence", "median_sentence_months", "Median sentence (months)",
    ].filter(Boolean));
    const medSent = parseSentenceMonths(medSentRaw, fieldMap.median_sentence);

    const daysRaw = col(row, [
      fieldMap.days_to_disposition,
      "avg_days_to_disposition", "Days to disposition",
      "Average days to disposition", "Mean days to disposition",
    ].filter(Boolean));
    const daysToDisp = daysRaw !== null ? parseFloat(daysRaw) : null;

    const aggKey = jurisdictionLevel + "|" + jurisdictionName + "|" + offenseType;
    if (!aggMap.has(aggKey)) {
      aggMap.set(aggKey, {
        jurisdictionLevel,
        jurisdictionName,
        offenseType,
        agg: buildAgg(),
      });
    }

    const entry = aggMap.get(aggKey);
    const agg = entry.agg;

    if (totalCases !== null && totalCases > 0) {
      agg.total += totalCases;
    }

    // Accumulate rates (average later if multiple rows per key)
    // Increment rate_rows if ANY rate is present (not just convRate)
    const hasAnyRate = convRate !== null || acqRate !== null || dismissRate !== null || pleaRate !== null || trialRate !== null;
    if (hasAnyRate) { agg.rate_rows++; }
    if (convRate !== null) { agg.conviction_rate_sum += convRate; }
    if (acqRate !== null) { agg.acquittal_rate_sum += acqRate; }
    if (dismissRate !== null) { agg.dismissal_rate_sum += dismissRate; }
    if (pleaRate !== null) { agg.plea_rate_sum += pleaRate; }
    if (trialRate !== null) { agg.trial_rate_sum += trialRate; }

    // Sentence accumulation
    if (pleaSent !== null && pleaSent > 0) { agg.plea_sentence_sum += pleaSent; agg.plea_sentence_rows++; }
    if (trialSent !== null && trialSent > 0) { agg.trial_sentence_sum += trialSent; agg.trial_sentence_rows++; }
    if (meanSent !== null && meanSent > 0) { agg.mean_sentence_sum += meanSent; agg.mean_sentence_rows++; }
    if (medSent !== null && medSent > 0) { agg.median_sentence_sum += medSent; agg.median_sentence_rows++; }
    if (daysToDisp !== null && daysToDisp > 0 && !isNaN(daysToDisp)) { agg.days_sum += daysToDisp; agg.days_rows++; }

    parsed++;
  }

  console.log("Aggregated into " + aggMap.size + " (jurisdiction, offense_type) groups");
  console.log("Parsed: " + parsed + ", Skipped: " + skipped);
  console.log("");

  // ── Step 2: Generate UPSERT SQL ───────────────────────────────────────────

  const sqlLines = [];
  let generated = 0;

  for (const [, entry] of aggMap) {
    const { jurisdictionLevel, jurisdictionName, offenseType, agg } = entry;

    // Resolve rates: prefer direct rate fields over derived-from-counts
    const nRateRows = agg.rate_rows > 0 ? agg.rate_rows : 1;

    const convRateFinal = agg.rate_rows > 0 ? agg.conviction_rate_sum / nRateRows : null;
    const acqRateFinal = agg.rate_rows > 0 ? agg.acquittal_rate_sum / nRateRows : null;
    const dismissRateFinal = agg.rate_rows > 0 ? agg.dismissal_rate_sum / nRateRows : null;
    const pleaRateFinal = agg.rate_rows > 0 ? agg.plea_rate_sum / nRateRows : null;
    const trialRateFinal = agg.rate_rows > 0 ? agg.trial_rate_sum / nRateRows : null;

    // Sentence stats
    const meanSentFinal = agg.mean_sentence_rows > 0 ? agg.mean_sentence_sum / agg.mean_sentence_rows : null;
    const medSentFinal = agg.median_sentence_rows > 0 ? agg.median_sentence_sum / agg.median_sentence_rows : null;
    const pleaSentFinal = agg.plea_sentence_rows > 0 ? agg.plea_sentence_sum / agg.plea_sentence_rows : null;
    const trialSentFinal = agg.trial_sentence_rows > 0 ? agg.trial_sentence_sum / agg.trial_sentence_rows : null;

    // plea_trial_penalty_pct = ((trial_avg - plea_avg) / plea_avg) * 100
    let plTrialPenalty = null;
    if (pleaSentFinal !== null && trialSentFinal !== null && pleaSentFinal > 0) {
      plTrialPenalty = ((trialSentFinal - pleaSentFinal) / pleaSentFinal) * 100;
    }

    const avgDaysFinal = agg.days_rows > 0 ? agg.days_sum / agg.days_rows : null;

    const sql =
      "INSERT INTO outcome_benchmarks\n" +
      "  (jurisdiction_level, jurisdiction_name, offense_type,\n" +
      "   conviction_rate, acquittal_rate, dismissal_rate,\n" +
      "   plea_conviction_rate, trial_conviction_rate, plea_trial_penalty_pct,\n" +
      "   plea_avg_sentence_months, trial_avg_sentence_months,\n" +
      "   median_sentence_months, mean_sentence_months,\n" +
      "   avg_days_to_disposition,\n" +
      "   source_urls, data_as_of)\n" +
      "VALUES (\n" +
      "  " + esc(jurisdictionLevel) + ",\n" +
      "  " + esc(jurisdictionName) + ",\n" +
      "  " + esc(offenseType) + ",\n" +
      "  " + fmtFloat(convRateFinal) + ",\n" +
      "  " + fmtFloat(acqRateFinal) + ",\n" +
      "  " + fmtFloat(dismissRateFinal) + ",\n" +
      "  " + fmtFloat(pleaRateFinal) + ",\n" +
      "  " + fmtFloat(trialRateFinal) + ",\n" +
      "  " + fmtFloat2(plTrialPenalty) + ",\n" +
      "  " + fmtFloat2(pleaSentFinal) + ",\n" +
      "  " + fmtFloat2(trialSentFinal) + ",\n" +
      "  " + fmtFloat2(medSentFinal) + ",\n" +
      "  " + fmtFloat2(meanSentFinal) + ",\n" +
      "  " + (avgDaysFinal !== null ? Math.round(avgDaysFinal) : "NULL") + ",\n" +
      "  ARRAY[" + esc(SOURCE_URL) + "],\n" +
      "  now()\n" +
      ")\n" +
      "ON CONFLICT (jurisdiction_level, jurisdiction_name, offense_type) DO UPDATE SET\n" +
      "  conviction_rate = EXCLUDED.conviction_rate,\n" +
      "  acquittal_rate = EXCLUDED.acquittal_rate,\n" +
      "  dismissal_rate = EXCLUDED.dismissal_rate,\n" +
      "  plea_conviction_rate = EXCLUDED.plea_conviction_rate,\n" +
      "  trial_conviction_rate = EXCLUDED.trial_conviction_rate,\n" +
      "  plea_trial_penalty_pct = EXCLUDED.plea_trial_penalty_pct,\n" +
      "  plea_avg_sentence_months = EXCLUDED.plea_avg_sentence_months,\n" +
      "  trial_avg_sentence_months = EXCLUDED.trial_avg_sentence_months,\n" +
      "  median_sentence_months = EXCLUDED.median_sentence_months,\n" +
      "  mean_sentence_months = EXCLUDED.mean_sentence_months,\n" +
      "  avg_days_to_disposition = EXCLUDED.avg_days_to_disposition,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  data_as_of = now(),\n" +
      "  updated_at = now();";

    sqlLines.push(sql);
    generated++;
  }

  console.log("Generated " + generated + " UPSERT statements");

  // ── Step 3: Write SQL file ────────────────────────────────────────────────

  fs.writeFileSync(SQL_OUTPUT, sqlLines.join("\n\n") + "\n");
  console.log("Wrote SQL to: " + SQL_OUTPUT);

  if (dryRun) {
    console.log("\nDry-run complete. Run with --apply to execute against the database.");
    return;
  }

  // ── Step 4: Apply via Supabase Management API ─────────────────────────────

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "SUPABASE_ACCESS_TOKEN not found.\n" +
      "Check: " + PARENT_ROOT + "/.env.local"
    );
    process.exit(1);
  }

  const apiBase = "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query";

  console.log("\nApplying " + generated + " UPSERTs via Management API in batches of " + BATCH_SIZE + "...");

  let applied = 0;
  let errors = 0;

  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n\n");
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sqlLines.length / BATCH_SIZE);
    const batchSize = Math.min(BATCH_SIZE, sqlLines.length - i);

    const res = await fetch(apiBase, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: batch }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Batch " + batchNum + "/" + totalBatches + " failed: " + errText.slice(0, 300));
      errors++;
    } else {
      console.log("Applied batch " + batchNum + "/" + totalBatches + " (" + batchSize + " statements)");
      applied += batchSize;
    }
  }

  // Update data_source_freshness
  const freshnessSQL =
    "UPDATE data_source_freshness " +
    "SET last_ingested_at = now(), last_row_count = " + applied + ", is_stale = false " +
    "WHERE source_key = " + esc(SOURCE_KEY) + ";";

  const freshRes = await fetch(apiBase, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: freshnessSQL }),
  });

  if (freshRes.ok) {
    console.log("data_source_freshness updated (source_key=" + SOURCE_KEY + ", rows=" + applied + ").");
  } else {
    const body = await freshRes.text();
    console.log("Note: data_source_freshness update failed (row may not exist yet): " + body.slice(0, 200));
  }

  console.log("\nDone. Applied: " + applied + ", Errors: " + errors);
  if (errors > 0) process.exit(1);
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
