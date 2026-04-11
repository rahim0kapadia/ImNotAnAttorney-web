/**
 * USSC Individual Sentencing Datafiles → judge_sentencing_patterns + outcome_benchmarks
 *
 * Downloads and parses USSC individual case-level data (FY2002-FY2025).
 * Aggregates sentencing statistics per judge per offense type.
 *
 * Data format: Fixed-width ASCII files from ussc.gov.
 * Download separately — this script processes already-downloaded files.
 *
 * Prerequisites:
 *   - Download USSC ASCII files to data/external/ussc/
 *   - .env.local with SUPABASE_ACCESS_TOKEN
 *
 * Usage:
 *   node scripts/ingest-ussc-sentencing.mjs                    # Dry-run (generate SQL)
 *   node scripts/ingest-ussc-sentencing.mjs --apply            # Generate + apply
 *   node scripts/ingest-ussc-sentencing.mjs --limit 1000       # Process first N cases
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const USSC_DIR = path.join(PROJECT_ROOT, "data", "external", "ussc");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── USSC column positions (from USSC codebook) ─────────────────────────────
// These map fixed-width positions to field names for the opafy*.dat files.
// Positions vary by fiscal year — this covers FY2016+ format.
// For earlier years, adjust positions or use the SAS/SPSS reader approach.
const USSC_COLUMNS = {
  USSCIDN: { start: 0, end: 7 },        // case ID
  SENSPLT0: { start: 15, end: 20 },      // sentence months (primary)
  MONSEX: { start: 21, end: 22 },        // defendant sex
  DISTRICT: { start: 23, end: 25 },      // federal district code
  CIRCDIST: { start: 26, end: 28 },      // circuit
  OFFTYPE2: { start: 29, end: 31 },      // offense type (2-digit)
  XCRHISSR: { start: 32, end: 33 },      // criminal history category
  REASON1: { start: 34, end: 36 },       // departure reason 1
  GLMIN: { start: 37, end: 40 },         // guideline minimum
  GLMAX: { start: 41, end: 44 },         // guideline maximum
  JUDGESSION: { start: 45, end: 55 },    // judge name/ID (varies)
  DISPOSIT: { start: 56, end: 57 },      // disposition (plea/trial)
};
// NOTE: Actual positions MUST be verified against the codebook for each FY file.
// The above is illustrative — implementer must download codebook PDF from ussc.gov.

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeJudgeName(raw) {
  const trimmed = raw.trim().toLowerCase();
  // Collapse whitespace
  const parts = trimmed.split(" ").filter(Boolean);
  const joined = parts.join(" ");
  // Remove trailing suffixes like jr, sr, iii, ii, iv
  const suffixes = ["jr", "sr", "iii", "ii", "iv", "jr.", "sr."];
  const words = joined.split(" ");
  while (words.length > 1 && suffixes.includes(words[words.length - 1].replace(",", ""))) {
    words.pop();
  }
  // Remove trailing comma if present
  const result = words.join(" ");
  if (result.endsWith(",")) return result.slice(0, -1);
  return result;
}

function escapeSQLStr(str) {
  if (str === null || str === undefined) return "NULL";
  // Escape single quotes by doubling them (SQL standard)
  return "'" + String(str).split("'").join("''") + "'";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Check for USSC data directory
  if (!fs.existsSync(USSC_DIR)) {
    console.error("USSC data directory not found: " + USSC_DIR);
    console.error("Download USSC Individual Datafiles from https://www.ussc.gov/research/datafiles/commission-datafiles");
    console.error("Place ASCII .dat files in data/external/ussc/");
    process.exit(1);
  }

  const files = fs.readdirSync(USSC_DIR).filter(f => f.endsWith(".dat") || f.endsWith(".csv"));
  if (files.length === 0) {
    console.error("No .dat or .csv files found in " + USSC_DIR);
    process.exit(1);
  }

  console.log("Found " + files.length + " USSC data files");

  // Aggregate: judge_name → { district, state, offenses: Map<offense, records[]> }
  const judgeAgg = new Map();
  // Aggregate: (district|offense) → { district, state, offenseType, sentences[], pleas, trials, pleaSentences[], trialSentences[] }
  const benchmarkAgg = new Map();
  let totalCases = 0;

  for (const file of files) {
    console.log("Processing " + file + "...");
    const filePath = path.join(USSC_DIR, file);

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (totalCases >= limit) break;

      // Parse fields — adapt parsing based on file format (.dat vs .csv)
      let fields;
      if (file.endsWith(".csv")) {
        fields = parseCSVLine(line);
      } else {
        fields = parseFixedWidth(line);
      }

      if (!fields || !fields.sentenceMonths || !fields.district) continue;

      totalCases++;

      // Judge aggregation
      if (fields.judgeName) {
        const normalized = normalizeJudgeName(fields.judgeName);
        if (!judgeAgg.has(normalized)) {
          judgeAgg.set(normalized, { district: fields.district, state: fields.state, offenses: new Map() });
        }
        const judge = judgeAgg.get(normalized);
        const offKey = fields.offenseType || "unknown";
        if (!judge.offenses.has(offKey)) judge.offenses.set(offKey, []);
        judge.offenses.get(offKey).push({
          sentence: fields.sentenceMonths,
          departure: fields.departureReason,
          disposition: fields.disposition,
          crimHistory: fields.crimHistoryCategory,
        });
      }

      // Benchmark aggregation
      const benchKey = fields.district + "|" + (fields.offenseType || "unknown");
      if (!benchmarkAgg.has(benchKey)) {
        benchmarkAgg.set(benchKey, {
          district: fields.district,
          state: fields.state,
          offenseType: fields.offenseType || "unknown",
          sentences: [],
          pleas: 0,
          trials: 0,
          pleaSentences: [],
          trialSentences: [],
        });
      }
      const bench = benchmarkAgg.get(benchKey);
      bench.sentences.push(fields.sentenceMonths);
      if (fields.disposition === "plea") {
        bench.pleas++;
        bench.pleaSentences.push(fields.sentenceMonths);
      } else if (fields.disposition === "trial") {
        bench.trials++;
        bench.trialSentences.push(fields.sentenceMonths);
      }
    }

    if (totalCases >= limit) break;
  }

  console.log("Processed " + totalCases + " cases, " + judgeAgg.size + " judges, " + benchmarkAgg.size + " benchmarks");

  // Generate SQL
  const sourceUrl = "https://www.ussc.gov/research/datafiles/commission-datafiles";
  const sqlLines = [];

  // Judge sentencing patterns
  for (const [name, data] of judgeAgg) {
    const allSentences = [];
    const offenseBreakdown = [];
    let totalCount = 0;

    for (const [offense, records] of data.offenses) {
      const sentences = records.map(r => r.sentence).sort((a, b) => a - b);
      allSentences.push(...sentences);
      const departures = records.filter(r => r.departure);
      totalCount += records.length;

      offenseBreakdown.push({
        offense_type: offense,
        count: records.length,
        median: median(sentences),
        departure_rate: departures.length / records.length,
      });
    }

    if (allSentences.length < 5) continue; // Skip judges with too few cases

    allSentences.sort((a, b) => a - b);

    sqlLines.push(
      "INSERT INTO judge_sentencing_patterns (judge_name, judge_name_normalized, district, state, total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, offense_breakdown, source_urls, sources, data_period)\n" +
      "VALUES (" + escapeSQLStr(name) + ", " + escapeSQLStr(name) + ", " + escapeSQLStr(data.district) + ", " + escapeSQLStr(data.state) + ", " + totalCount + ", " + median(allSentences) + ", " + mean(allSentences) + ", " + percentile(allSentences, 25) + ", " + percentile(allSentences, 75) + ", " + escapeSQLStr(JSON.stringify(offenseBreakdown)) + "::jsonb, ARRAY[" + escapeSQLStr(sourceUrl) + "], ARRAY['ussc'], 'FY2002-FY2025')\n" +
      "ON CONFLICT (judge_name_normalized, district) DO UPDATE SET\n" +
      "  total_cases = EXCLUDED.total_cases,\n" +
      "  median_sentence_months = EXCLUDED.median_sentence_months,\n" +
      "  mean_sentence_months = EXCLUDED.mean_sentence_months,\n" +
      "  p25_sentence_months = EXCLUDED.p25_sentence_months,\n" +
      "  p75_sentence_months = EXCLUDED.p75_sentence_months,\n" +
      "  offense_breakdown = EXCLUDED.offense_breakdown,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  data_as_of = now();"
    );
  }

  // Outcome benchmarks
  for (const [, data] of benchmarkAgg) {
    if (data.sentences.length < 10) continue;
    data.sentences.sort((a, b) => a - b);
    data.pleaSentences.sort((a, b) => a - b);
    data.trialSentences.sort((a, b) => a - b);

    const total = data.sentences.length;
    const pleaAvg = data.pleaSentences.length > 0 ? mean(data.pleaSentences) : null;
    const trialAvg = data.trialSentences.length > 0 ? mean(data.trialSentences) : null;
    const penalty = pleaAvg && trialAvg ? ((trialAvg - pleaAvg) / pleaAvg * 100).toFixed(1) : null;

    const pleaAvgStr = pleaAvg !== null ? pleaAvg.toFixed(1) : "NULL";
    const trialAvgStr = trialAvg !== null ? trialAvg.toFixed(1) : "NULL";
    const penaltyStr = penalty !== null ? penalty : "NULL";

    sqlLines.push(
      "INSERT INTO outcome_benchmarks (jurisdiction_level, jurisdiction_name, state, offense_type, total_cases, median_sentence_months, mean_sentence_months, plea_rate, trial_rate, plea_avg_sentence_months, trial_avg_sentence_months, plea_trial_penalty_pct, source_urls, sources, data_period)\n" +
      "VALUES ('district', " + escapeSQLStr(data.district) + ", " + escapeSQLStr(data.state) + ", " + escapeSQLStr(data.offenseType) + ", " + total + ", " + median(data.sentences) + ", " + mean(data.sentences) + ", " + (data.pleas / total).toFixed(4) + ", " + (data.trials / total).toFixed(4) + ", " + pleaAvgStr + ", " + trialAvgStr + ", " + penaltyStr + ", ARRAY[" + escapeSQLStr(sourceUrl) + "], ARRAY['ussc'], 'FY2002-FY2025')\n" +
      "ON CONFLICT (jurisdiction_level, jurisdiction_name, offense_type) DO UPDATE SET\n" +
      "  total_cases = EXCLUDED.total_cases,\n" +
      "  median_sentence_months = EXCLUDED.median_sentence_months,\n" +
      "  mean_sentence_months = EXCLUDED.mean_sentence_months,\n" +
      "  plea_rate = EXCLUDED.plea_rate,\n" +
      "  trial_rate = EXCLUDED.trial_rate,\n" +
      "  plea_avg_sentence_months = EXCLUDED.plea_avg_sentence_months,\n" +
      "  trial_avg_sentence_months = EXCLUDED.trial_avg_sentence_months,\n" +
      "  plea_trial_penalty_pct = EXCLUDED.plea_trial_penalty_pct,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  data_as_of = now();"
    );
  }

  // Write SQL
  const sqlPath = path.join(OUTPUT_DIR, "ussc-sentencing-ingest.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log("Wrote " + sqlLines.length + " SQL statements to " + sqlPath);

  // Apply if requested
  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }

    const sql = fs.readFileSync(sqlPath, "utf8");
    const res = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });

    if (res.ok) {
      console.log("Applied successfully");
    } else {
      console.error("Apply failed:", (await res.text()).slice(0, 500));
      process.exit(1);
    }

    // Update freshness tracker
    await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = " + sqlLines.length + ", is_stale = false WHERE source_key = 'ussc_individual_datafiles';" }),
    });
  }
}

// ── Stats helpers ───────────────────────────────────────────────────────────

function median(arr) {
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function mean(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr, p) {
  if (arr.length === 0) return null;
  const idx = (p / 100) * (arr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return arr[lower];
  return arr[lower] + (arr[upper] - arr[lower]) * (idx - lower);
}

function parseFixedWidth(line) {
  // NOTE: This is a STUB. The USSC codebook defines exact column positions that
  // vary by fiscal year. Download the codebook PDF from
  // https://www.ussc.gov/research/datafiles/commission-datafiles
  // and implement the parser based on the actual file format received.
  //
  // Expected return shape:
  // { judgeName, district, state, offenseType, sentenceMonths,
  //   departureReason, disposition, crimHistoryCategory }
  //
  // The USSC_COLUMNS map above gives approximate positions for FY2016+ but
  // must be verified against the codebook for each fiscal year file.
  return null;
}

function parseCSVLine(line) {
  // NOTE: This is a STUB. If USSC data is in CSV format, parse normally.
  // Column mapping depends on the specific file version — check headers.
  // Return same shape as parseFixedWidth.
  return null;
}

main().catch(err => { console.error(err); process.exit(1); });
