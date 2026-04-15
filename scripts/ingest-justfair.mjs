/**
 * JUSTFAIR Ingestion Script — Federal Sentencing Intelligence
 *
 * Streams 595,851 federal sentencing records from JUSTFAIR (Federal Judicial
 * Sentencing To Advance Inclusivity and Reduce Disparities) and aggregates into:
 *
 *   1. judge_sentencing_patterns — per-judge sentencing stats (upsert with USSC data)
 *   2. sentencing_distributions  — district-level charge sentencing percentiles
 *   3. judge_demographics        — judge biographical data (gender, race, appointing president)
 *   4. judge_sentencing_demographics — per-judge sentencing by defendant race (disparity analysis)
 *
 * Source: https://osf.io/nseh5/
 * Data: FinalDataset.csv — 1.3GB, 400+ columns, FY2001–FY2018
 *
 * Prerequisites:
 *   - data/external-intel/justfair/FinalDataset.csv
 *   - npm install csv-parse
 *   - SUPABASE_ACCESS_TOKEN in parent .env.local
 *   - Migration 20260414f_justfair_demographics.sql applied
 *
 * Usage:
 *   node scripts/ingest-justfair.mjs                  # Dry run — stats only
 *   node scripts/ingest-justfair.mjs --apply          # Generate SQL + apply to Supabase
 *   node scripts/ingest-justfair.mjs --limit 1000     # Test with first N rows
 *   node scripts/ingest-justfair.mjs --migrate        # Apply migration SQL first, then ingest
 *   node scripts/ingest-justfair.mjs --migrate --apply # Full pipeline: migrate + ingest + apply
 */

import fs from "fs";
import path from "path";
import https from "https";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 100;

const CSV_PATH = path.join(PROJECT_ROOT, "data", "external-intel", "justfair", "FinalDataset.csv");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "external-intel", "justfair", "sql-output");
const MIGRATION_PATH = path.join(PROJECT_ROOT, "supabase", "migrations", "20260414f_justfair_demographics.sql");
const SOURCE_URL = "https://osf.io/nseh5/";

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const migrateMode = args.includes("--migrate");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ════════════════════════════════════════════════════════════════════════════
// RACE CODE MAPPING (USSC codebook)
// ════════════════════════════════════════════════════════════════════════════

const RACE_MAP = {
  "1": "White",
  "2": "Black",
  "3": "Hispanic",
  "7": "Other",
  "8": "Multi-racial",
};

// ════════════════════════════════════════════════════════════════════════════
// DISPOSITION CODES (USSC codebook — DISPOSIT variable)
// ════════════════════════════════════════════════════════════════════════════
// 1 = Guilty plea, 2 = Nolo contendere, 3 = Jury trial, 4 = Bench trial,
// 5 = Guilty plea + trial (mixed), 6 = Nolo contendere + trial

const DISPOSITION_LABELS = {
  "1": "guilty_plea",
  "2": "nolo_contendere",
  "3": "jury_trial",
  "4": "bench_trial",
  "5": "guilty_plea_and_trial",
  "6": "nolo_and_trial",
};

// ════════════════════════════════════════════════════════════════════════════
// DRUG TYPE CODES (USSC codebook — DRUGTYP1)
// ════════════════════════════════════════════════════════════════════════════

const DRUG_LABELS = {
  "1": "powder_cocaine",
  "2": "crack_cocaine",
  "3": "heroin",
  "4": "marijuana",
  "5": "methamphetamine",
  "6": "other_drug",
};

// ════════════════════════════════════════════════════════════════════════════
// CRIMINAL HISTORY CATEGORY (USSC — CRIMHIST, I–VI)
// ════════════════════════════════════════════════════════════════════════════

const CRIMHIST_LABELS = {
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
  "5": "V",
  "6": "VI",
};

// ════════════════════════════════════════════════════════════════════════════
// OFFENSE TYPE LABELS (USSC OFFTYPE2 / simplified)
// ════════════════════════════════════════════════════════════════════════════

const OFFENSE_LABELS = {
  "1": "administration_of_justice",
  "2": "antitrust",
  "3": "arson",
  "4": "assault",
  "5": "bribery_corruption",
  "6": "burglary",
  "7": "child_pornography",
  "8": "commercialized_vice",
  "9": "drug_possession",
  "10": "drug_trafficking",
  "11": "embezzlement",
  "12": "environmental",
  "13": "extortion_racketeering",
  "14": "firearms",
  "15": "food_drug",
  "16": "forgery_counterfeiting",
  "17": "fraud",
  "18": "gambling",
  "19": "immigration",
  "20": "kidnapping",
  "21": "larceny",
  "22": "manslaughter",
  "23": "money_laundering",
  "24": "murder",
  "25": "national_defense",
  "26": "obscenity",
  "27": "prison",
  "28": "robbery",
  "29": "sexual_abuse",
  "30": "stalking_harassing",
  "31": "tax",
  "32": "other",
};

// ════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS (from bulk-master-extractor.mjs)
// ════════════════════════════════════════════════════════════════════════════

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map(function (s) {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return '"' + inner + '"';
  });
  const literal = "{" + items.join(",") + "}";
  return "'" + literal.split("'").join("''") + "'::text[]";
}

function escJsonb(obj) {
  const json = JSON.stringify(obj);
  return "'" + json.split("'").join("''") + "'::jsonb";
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function round2(n) {
  if (n === null || n === undefined) return "NULL";
  return Math.round(n * 100) / 100;
}

/**
 * Normalize a judge name for dedup/matching.
 * Uses string methods only (no regex on content).
 */
function normalizeJudgeName(name) {
  if (!name) return "";
  var s = name.toLowerCase();
  // Collapse whitespace: split on spaces, filter empties, rejoin
  var parts = s.split(" ");
  var cleaned = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.length > 0) cleaned.push(p);
  }
  s = cleaned.join(" ");
  // Remove periods and commas
  s = s.split(".").join("").split(",").join("");
  return s.trim();
}

// ════════════════════════════════════════════════════════════════════════════
// SUPABASE MANAGEMENT API
// ════════════════════════════════════════════════════════════════════════════

let supabaseToken = null;

function loadToken() {
  if (supabaseToken) return;
  const parentEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
  );
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.split("=").slice(1).join("=").trim();
      break;
    }
  }
  if (!supabaseToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN not found in parent .env.local");
  }
}

function supabaseQuery(sql) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: "/v1/projects/" + PROJECT_REF + "/database/query",
      method: "POST",
      headers: {
        Authorization: "Bearer " + supabaseToken,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, function (res) {
      let data = "";
      res.on("data", function (d) { data += d; });
      res.on("end", function () {
        if (res.statusCode >= 400) reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 500)));
        else { try { resolve(JSON.parse(data)); } catch (e) { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function applyBatch(tableName, stmts) {
  if (!stmts || stmts.length === 0) return { applied: 0, errors: 0 };

  console.log("\n  --- Applying " + tableName + ": " + stmts.length + " statements ---");
  let applied = 0;
  let errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);

    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const elapsed = (Date.now() - applyStart) / 1000;
      const rate = elapsed > 0 ? (applied / elapsed).toFixed(0) : "---";
      process.stdout.write("    Batch " + batchNum + "/" + totalBatches + ": " + batch.length + " stmts — " + rate + "/sec\n");
    } catch (e) {
      errors++;
      console.error("    Batch " + batchNum + " ERROR: " + e.message.slice(0, 300));
      // Retry on rate limit
      if (e.message.indexOf("429") >= 0) {
        console.log("    Rate limited — waiting 10s...");
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          errors--;
        } catch (retryErr) {
          console.error("    Retry failed: " + retryErr.message.slice(0, 200));
        }
      }
    }

    if (i + BATCH_SIZE < stmts.length) await sleep(500);
  }

  console.log("    " + tableName + " complete: applied=" + applied + " errors=" + errors);
  return { applied, errors };
}

// ════════════════════════════════════════════════════════════════════════════
// MIGRATION SQL
// ════════════════════════════════════════════════════════════════════════════

const MIGRATION_SQL = [
  "-- JUSTFAIR Demographics — judge biographical + defendant-race sentencing disparity tables",
  "-- Source: JUSTFAIR (Federal Judicial Sentencing To Advance Inclusivity and Reduce Disparities)",
  "-- OSF: https://osf.io/nseh5/",
  "-- 595,851 federal sentencing records, FY2001-FY2018",
  "",
  "CREATE EXTENSION IF NOT EXISTS pg_trgm;",
  "",
  "CREATE TABLE IF NOT EXISTS judge_demographics (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  judge_name text NOT NULL,",
  "  judge_name_normalized text NOT NULL,",
  "  district text,",
  "  gender text,",
  "  race_ethnicity text,",
  "  appointing_president text,",
  "  appointing_party text,",
  "  aba_rating text,",
  "  birth_year integer,",
  "  law_school text,",
  "  senior_status_date text,",
  "  active_start integer,",
  "  active_end integer,",
  "  source_urls text[] NOT NULL DEFAULT '{}',",
  "  created_at timestamptz DEFAULT now(),",
  "  UNIQUE (judge_name_normalized, district)",
  ");",
  "",
  "CREATE INDEX IF NOT EXISTS idx_judge_demo_name ON judge_demographics",
  "  USING gin (judge_name_normalized gin_trgm_ops);",
  "CREATE INDEX IF NOT EXISTS idx_judge_demo_district ON judge_demographics (district);",
  "CREATE INDEX IF NOT EXISTS idx_judge_demo_party ON judge_demographics (appointing_party);",
  "",
  "CREATE TABLE IF NOT EXISTS judge_sentencing_demographics (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  judge_name_normalized text NOT NULL,",
  "  district text NOT NULL,",
  "  defendant_race text NOT NULL,",
  "  total_cases integer DEFAULT 0,",
  "  median_sentence_months numeric,",
  "  mean_sentence_months numeric,",
  "  guideline_departure_rate numeric,",
  "  avg_departure_pct numeric,",
  "  source_urls text[] NOT NULL DEFAULT '{}',",
  "  created_at timestamptz DEFAULT now(),",
  "  UNIQUE (judge_name_normalized, district, defendant_race)",
  ");",
  "",
  "CREATE INDEX IF NOT EXISTS idx_judge_sent_demo_name ON judge_sentencing_demographics",
  "  USING gin (judge_name_normalized gin_trgm_ops);",
  "CREATE INDEX IF NOT EXISTS idx_judge_sent_demo_district ON judge_sentencing_demographics (district);",
  "CREATE INDEX IF NOT EXISTS idx_judge_sent_demo_race ON judge_sentencing_demographics (defendant_race);",
  "",
  "ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS mean_months numeric;",
  "ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS p10 numeric;",
  "ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS p90 numeric;",
  "ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS sources text[] DEFAULT '{}'::text[];",
  "",
  "ALTER TABLE judge_demographics ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE judge_sentencing_demographics ENABLE ROW LEVEL SECURITY;",
  "",
  "DO $$",
  "BEGIN",
  "  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_demographics' AND policyname='service_all') THEN",
  "    CREATE POLICY service_all ON judge_demographics FOR ALL USING (true) WITH CHECK (true);",
  "  END IF;",
  "  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_sentencing_demographics' AND policyname='service_all') THEN",
  "    CREATE POLICY service_all ON judge_sentencing_demographics FOR ALL USING (true) WITH CHECK (true);",
  "  END IF;",
  "END $$;",
].join("\n");

// ════════════════════════════════════════════════════════════════════════════
// STREAMING AGGREGATION — accumulator Maps
// ════════════════════════════════════════════════════════════════════════════

// Key: "judgeNorm|district" -> sentencing accum
const judgeSentencingAccum = new Map();

// Key: "district|offenseLabel" -> district sentencing accum
const districtSentencingAccum = new Map();

// Key: "judgeNorm|district" -> biographical data
const judgeDemoAccum = new Map();

// Key: "judgeNorm|district|race" -> demographic sentencing accum
const judgeDemoSentAccum = new Map();

// Counters
let rowsRead = 0;
let rowsSkipped = 0;
let rowsWithSentence = 0;
let rowsWithJudge = 0;
let parseErrors = 0;

// ════════════════════════════════════════════════════════════════════════════
// FIELD EXTRACTION HELPERS
// ════════════════════════════════════════════════════════════════════════════

function parseNum(val) {
  if (val === undefined || val === null || val === "" || val === "-8" || val === "-9") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseInt2(val) {
  if (val === undefined || val === null || val === "" || val === "-8" || val === "-9") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function cleanStr(val) {
  if (!val || val === "-8" || val === "-9" || val === '""') return null;
  // Strip surrounding quotes that csv-parse may leave
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s || null;
}

function computeDepartureInfo(sentTot, glMin, glMax) {
  // Returns: { departed, direction, departurePct } or null
  if (sentTot === null || glMin === null || glMax === null) return null;
  if (glMin <= 0 && glMax <= 0) return null;

  if (sentTot < glMin) {
    var pct = glMin > 0 ? ((glMin - sentTot) / glMin) * 100 : 0;
    return { departed: true, direction: "down", departurePct: -pct };
  }
  if (sentTot > glMax) {
    var pct2 = glMax > 0 ? ((sentTot - glMax) / glMax) * 100 : 0;
    return { departed: true, direction: "up", departurePct: pct2 };
  }
  return { departed: false, direction: "within", departurePct: 0 };
}

/**
 * Find law school from the School/Degree columns.
 * JUSTFAIR has up to 5 school/degree pairs per judge.
 * Law degrees: J.D., JD, LL.B., LLB, or contains "LAW".
 */
function extractLawSchool(record) {
  var pairs = [
    [cleanStr(record.School1), cleanStr(record.Degree1)],
    [cleanStr(record.School2), cleanStr(record.Degree2)],
    [cleanStr(record.School3), cleanStr(record.Degree3)],
    [cleanStr(record.School4), cleanStr(record.Degree4)],
    [cleanStr(record.School5), cleanStr(record.Degree5)],
  ];
  for (var i = 0; i < pairs.length; i++) {
    var school = pairs[i][0];
    var degree = pairs[i][1];
    if (!school || !degree) continue;
    var dUpper = degree.toUpperCase();
    if (dUpper === "J.D." || dUpper === "JD" || dUpper === "LL.B." || dUpper === "LLB" || dUpper.indexOf("LAW") >= 0) {
      return school;
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// STREAMING PHASE — Single pass over 1.3GB CSV
// ════════════════════════════════════════════════════════════════════════════

async function streamCSV() {
  console.log("=== PHASE 1: Streaming JUSTFAIR CSV ===");
  console.log("File: " + CSV_PATH);

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error("CSV not found: " + CSV_PATH);
  }

  const fileSize = fs.statSync(CSV_PATH).size;
  console.log("Size: " + (fileSize / (1024 * 1024 * 1024)).toFixed(2) + " GB");
  console.log("Limit: " + (limit === Infinity ? "none" : limit));
  console.log("");

  const stream = fs.createReadStream(CSV_PATH, { highWaterMark: 64 * 1024 });
  const parser = stream.pipe(parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    cast: false,
  }));

  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowsRead++;

      if (rowsRead > limit) break;

      // Progress every 50K rows
      if (rowsRead % 50000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = Math.round(rowsRead / elapsed);
        process.stdout.write("  " + rowsRead.toLocaleString() + " rows (" + rate + "/sec)\n");
      }

      // ── Extract core fields ──────────────────────────────────────────
      const judgeName = cleanStr(record.judge_clean_full);
      const district = cleanStr(record.DISTRICT);
      const sentTot = parseNum(record.SENTTOT);
      const glMin = parseNum(record.GLMIN);
      const glMax = parseNum(record.GLMAX);
      const raceCode = cleanStr(record.NEWRACE);
      const crimHist = cleanStr(record.CRIMHIST);
      const offType = cleanStr(record.OFFTYPE2) || cleanStr(record.OFFTYPESB);
      const fiscalYr = parseInt2(record.FISCALYR);

      // Judge demographics (from FJC merge in JUSTFAIR)
      const judgeGender = cleanStr(record.Gender);
      const judgeRace = cleanStr(record.RaceorEthnicity);
      const appointingPres = cleanStr(record.AppointingPresident1);
      const appointingParty = cleanStr(record.PartyofAppointingPresident1);
      const abaRating = cleanStr(record.ABARating1);
      const birthYear = parseInt2(record.BirthYear);
      const seniorDate = cleanStr(record.SeniorStatusDate1);
      const activeStart = parseInt2(record.activestart || record.STARTYR);
      const activeEnd = parseInt2(record.activeend || record.ENDYR);

      // Skip rows without a judge name
      if (!judgeName) {
        rowsSkipped++;
        continue;
      }
      rowsWithJudge++;

      const judgeNorm = normalizeJudgeName(judgeName);
      const judgeDistKey = judgeNorm + "|" + (district || "unknown");

      // ── Accumulate judge demographics (deduplicated) ─────────────────
      if (!judgeDemoAccum.has(judgeDistKey)) {
        var lawSchool = extractLawSchool(record);

        judgeDemoAccum.set(judgeDistKey, {
          name: judgeName,
          norm: judgeNorm,
          district: district || "unknown",
          gender: judgeGender,
          race: judgeRace,
          president: appointingPres,
          party: appointingParty,
          aba: abaRating,
          birthYear: birthYear,
          school: lawSchool,
          seniorDate: seniorDate,
          activeStart: activeStart,
          activeEnd: activeEnd,
        });
      }

      // ── Accumulate sentencing data (only if sentence >= 0) ───────────
      if (sentTot === null || sentTot < 0) {
        rowsSkipped++;
        continue;
      }
      rowsWithSentence++;

      const departure = computeDepartureInfo(sentTot, glMin, glMax);

      // 1. Per-judge sentencing patterns
      if (!judgeSentencingAccum.has(judgeDistKey)) {
        judgeSentencingAccum.set(judgeDistKey, {
          name: judgeName,
          norm: judgeNorm,
          district: district || "unknown",
          sentences: [],
          downDepartures: 0,
          upDepartures: 0,
          withinRange: 0,
          totalWithGuidelines: 0,
          offenses: {},
          crimHist: {},
          fiscalYrs: new Set(),
        });
      }
      var jAcc = judgeSentencingAccum.get(judgeDistKey);
      jAcc.sentences.push(sentTot);
      if (fiscalYr) jAcc.fiscalYrs.add(fiscalYr);

      // Offense breakdown
      var offLabel = OFFENSE_LABELS[offType] || "unknown";
      jAcc.offenses[offLabel] = (jAcc.offenses[offLabel] || 0) + 1;

      // Criminal history breakdown
      var chLabel = CRIMHIST_LABELS[crimHist] || "unknown";
      jAcc.crimHist[chLabel] = (jAcc.crimHist[chLabel] || 0) + 1;

      // Departure tracking
      if (departure) {
        jAcc.totalWithGuidelines++;
        if (departure.direction === "down") jAcc.downDepartures++;
        else if (departure.direction === "up") jAcc.upDepartures++;
        else jAcc.withinRange++;
      }

      // 2. District-level sentencing (for sentencing_distributions)
      var distKey = (district || "unknown") + "|" + offLabel;
      if (!districtSentencingAccum.has(distKey)) {
        districtSentencingAccum.set(distKey, {
          district: district || "unknown",
          chargeSlug: offLabel,
          sentences: [],
        });
      }
      districtSentencingAccum.get(distKey).sentences.push(sentTot);

      // 3. Judge x defendant race sentencing (for disparity analysis)
      var raceName = RACE_MAP[raceCode] || null;
      if (raceName) {
        var demoKey = judgeNorm + "|" + (district || "unknown") + "|" + raceName;
        if (!judgeDemoSentAccum.has(demoKey)) {
          judgeDemoSentAccum.set(demoKey, {
            judgeNorm: judgeNorm,
            district: district || "unknown",
            race: raceName,
            sentences: [],
            departures: [],
          });
        }
        var dAcc = judgeDemoSentAccum.get(demoKey);
        dAcc.sentences.push(sentTot);
        if (departure && departure.departurePct !== null) {
          dAcc.departures.push(departure.departurePct);
        }
      }
    }
  } catch (err) {
    parseErrors++;
    console.error("\n  CSV parse error at row " + rowsRead + ": " + err.message.slice(0, 300));
    console.log("  Continuing with partial data...\n");
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log("\n=== PHASE 1 COMPLETE ===");
  console.log("  Rows read:          " + rowsRead.toLocaleString());
  console.log("  Rows with judge:    " + rowsWithJudge.toLocaleString());
  console.log("  Rows with sentence: " + rowsWithSentence.toLocaleString());
  console.log("  Rows skipped:       " + rowsSkipped.toLocaleString());
  console.log("  Parse errors:       " + parseErrors);
  console.log("  Elapsed:            " + elapsed.toFixed(1) + "s (" + Math.round(rowsRead / elapsed) + " rows/sec)");
  console.log("  Unique judges:      " + judgeSentencingAccum.size);
  console.log("  District groups:    " + districtSentencingAccum.size);
  console.log("  Demo groups:        " + judgeDemoSentAccum.size);
  console.log("  Judge bios:         " + judgeDemoAccum.size);
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: Aggregation + SQL Generation
// ════════════════════════════════════════════════════════════════════════════

function generateSQL() {
  console.log("\n=== PHASE 2: Generating SQL ===");

  const allStmts = {
    judge_sentencing_patterns: [],
    sentencing_distributions: [],
    judge_demographics: [],
    judge_sentencing_demographics: [],
  };

  const sourceUrls = [SOURCE_URL];

  // ── 1. judge_sentencing_patterns ─────────────────────────────────────────
  let sentPatternCount = 0;
  for (const [, entry] of judgeSentencingAccum) {
    if (entry.sentences.length < 3) continue;

    const sorted = entry.sentences.slice().sort(function (a, b) { return a - b; });
    const med = round2(median(sorted));
    const mn = round2(mean(sorted));
    const p25 = round2(percentile(sorted, 25));
    const p75 = round2(percentile(sorted, 75));
    const downRate = entry.totalWithGuidelines > 0
      ? round2(entry.downDepartures / entry.totalWithGuidelines)
      : "NULL";
    const upRate = entry.totalWithGuidelines > 0
      ? round2(entry.upDepartures / entry.totalWithGuidelines)
      : "NULL";

    const fyArr = Array.from(entry.fiscalYrs).sort();
    const dataPeriod = fyArr.length > 0 ? "FY" + fyArr[0] + "-FY" + fyArr[fyArr.length - 1] : "JUSTFAIR";

    // Remove "unknown" key from breakdowns
    const offBreak = Object.assign({}, entry.offenses);
    delete offBreak.unknown;
    const chBreak = Object.assign({}, entry.crimHist);
    delete chBreak.unknown;

    allStmts.judge_sentencing_patterns.push(
      "INSERT INTO judge_sentencing_patterns " +
      "(judge_name, judge_name_normalized, district, total_cases, " +
      "median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, " +
      "downward_departure_rate, upward_departure_rate, " +
      "offense_breakdown, criminal_history_breakdown, " +
      "source_urls, sources, data_period)\n" +
      "VALUES (" +
      esc(entry.name) + ", " + esc(entry.norm) + ", " + esc(entry.district) + ", " + entry.sentences.length + ", " +
      med + ", " + mn + ", " + p25 + ", " + p75 + ", " +
      downRate + ", " + upRate + ", " +
      escJsonb(offBreak) + ", " + escJsonb(chBreak) + ", " +
      escArrayLiteral(sourceUrls) + ", " + escArrayLiteral(["JUSTFAIR"]) + ", " + esc(dataPeriod) + ")\n" +
      "ON CONFLICT (judge_name_normalized, district) DO UPDATE SET\n" +
      "  total_cases = EXCLUDED.total_cases,\n" +
      "  median_sentence_months = EXCLUDED.median_sentence_months,\n" +
      "  mean_sentence_months = EXCLUDED.mean_sentence_months,\n" +
      "  p25_sentence_months = EXCLUDED.p25_sentence_months,\n" +
      "  p75_sentence_months = EXCLUDED.p75_sentence_months,\n" +
      "  downward_departure_rate = EXCLUDED.downward_departure_rate,\n" +
      "  upward_departure_rate = EXCLUDED.upward_departure_rate,\n" +
      "  offense_breakdown = EXCLUDED.offense_breakdown,\n" +
      "  criminal_history_breakdown = EXCLUDED.criminal_history_breakdown,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  sources = EXCLUDED.sources,\n" +
      "  data_period = EXCLUDED.data_period,\n" +
      "  updated_at = now();"
    );
    sentPatternCount++;
  }
  console.log("  judge_sentencing_patterns: " + sentPatternCount + " UPSERTs (sample >= 3)");

  // ── 2. sentencing_distributions (district-level) ─────────────────────────
  let distCount = 0;
  for (const [, entry] of districtSentencingAccum) {
    if (entry.sentences.length < 5) continue;

    const sorted = entry.sentences.slice().sort(function (a, b) { return a - b; });
    const med = round2(median(sorted));
    const mn = round2(mean(sorted));
    const p10Val = round2(percentile(sorted, 10));
    const p25Val = round2(percentile(sorted, 25));
    const p75Val = round2(percentile(sorted, 75));
    const p90Val = round2(percentile(sorted, 90));

    allStmts.sentencing_distributions.push(
      "INSERT INTO sentencing_distributions " +
      "(judge_id, jurisdiction, charge_slug, median_months, mean_months, p10, p25, p75, p90, sample_size, source_urls, sources)\n" +
      "VALUES (" +
      "NULL, " + esc(entry.district) + ", " + esc(entry.chargeSlug) + ", " +
      med + ", " + mn + ", " + p10Val + ", " + p25Val + ", " + p75Val + ", " + p90Val + ", " +
      entry.sentences.length + ", " + escArrayLiteral(sourceUrls) + ", " + escArrayLiteral(["JUSTFAIR"]) + ");"
    );
    distCount++;
  }
  console.log("  sentencing_distributions: " + distCount + " INSERTs (sample >= 5)");

  // ── 3. judge_demographics ────────────────────────────────────────────────
  let demoCount = 0;
  for (const [, entry] of judgeDemoAccum) {
    allStmts.judge_demographics.push(
      "INSERT INTO judge_demographics " +
      "(judge_name, judge_name_normalized, district, gender, race_ethnicity, " +
      "appointing_president, appointing_party, aba_rating, birth_year, law_school, " +
      "senior_status_date, active_start, active_end, source_urls)\n" +
      "VALUES (" +
      esc(entry.name) + ", " + esc(entry.norm) + ", " + esc(entry.district) + ", " +
      esc(entry.gender) + ", " + esc(entry.race) + ", " +
      esc(entry.president) + ", " + esc(entry.party) + ", " + esc(entry.aba) + ", " +
      (entry.birthYear || "NULL") + ", " + esc(entry.school) + ", " +
      esc(entry.seniorDate) + ", " + (entry.activeStart || "NULL") + ", " +
      (entry.activeEnd || "NULL") + ", " + escArrayLiteral(sourceUrls) + ")\n" +
      "ON CONFLICT (judge_name_normalized, district) DO UPDATE SET\n" +
      "  gender = COALESCE(EXCLUDED.gender, judge_demographics.gender),\n" +
      "  race_ethnicity = COALESCE(EXCLUDED.race_ethnicity, judge_demographics.race_ethnicity),\n" +
      "  appointing_president = COALESCE(EXCLUDED.appointing_president, judge_demographics.appointing_president),\n" +
      "  appointing_party = COALESCE(EXCLUDED.appointing_party, judge_demographics.appointing_party),\n" +
      "  aba_rating = COALESCE(EXCLUDED.aba_rating, judge_demographics.aba_rating),\n" +
      "  birth_year = COALESCE(EXCLUDED.birth_year, judge_demographics.birth_year),\n" +
      "  law_school = COALESCE(EXCLUDED.law_school, judge_demographics.law_school),\n" +
      "  senior_status_date = COALESCE(EXCLUDED.senior_status_date, judge_demographics.senior_status_date),\n" +
      "  active_start = COALESCE(EXCLUDED.active_start, judge_demographics.active_start),\n" +
      "  active_end = COALESCE(EXCLUDED.active_end, judge_demographics.active_end);"
    );
    demoCount++;
  }
  console.log("  judge_demographics: " + demoCount + " UPSERTs");

  // ── 4. judge_sentencing_demographics ─────────────────────────────────────
  let demoSentCount = 0;
  for (const [, entry] of judgeDemoSentAccum) {
    if (entry.sentences.length < 3) continue;

    const sorted = entry.sentences.slice().sort(function (a, b) { return a - b; });
    const med = round2(median(sorted));
    const mn = round2(mean(sorted));

    // Guideline departure rate: fraction of cases with non-zero departure
    const depCount = entry.departures.filter(function (d) { return d !== 0; }).length;
    const depRate = entry.departures.length > 0 ? round2(depCount / entry.departures.length) : "NULL";

    // Average departure percentage (signed: negative = below guidelines)
    const avgDep = entry.departures.length > 0 ? round2(mean(entry.departures)) : "NULL";

    allStmts.judge_sentencing_demographics.push(
      "INSERT INTO judge_sentencing_demographics " +
      "(judge_name_normalized, district, defendant_race, total_cases, " +
      "median_sentence_months, mean_sentence_months, guideline_departure_rate, avg_departure_pct, source_urls)\n" +
      "VALUES (" +
      esc(entry.judgeNorm) + ", " + esc(entry.district) + ", " + esc(entry.race) + ", " +
      entry.sentences.length + ", " + med + ", " + mn + ", " + depRate + ", " + avgDep + ", " +
      escArrayLiteral(sourceUrls) + ")\n" +
      "ON CONFLICT (judge_name_normalized, district, defendant_race) DO UPDATE SET\n" +
      "  total_cases = EXCLUDED.total_cases,\n" +
      "  median_sentence_months = EXCLUDED.median_sentence_months,\n" +
      "  mean_sentence_months = EXCLUDED.mean_sentence_months,\n" +
      "  guideline_departure_rate = EXCLUDED.guideline_departure_rate,\n" +
      "  avg_departure_pct = EXCLUDED.avg_departure_pct;"
    );
    demoSentCount++;
  }
  console.log("  judge_sentencing_demographics: " + demoSentCount + " UPSERTs (sample >= 3)");

  return allStmts;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("==============================================================");
  console.log("  JUSTFAIR Ingestion — Federal Sentencing Intelligence");
  console.log("  595,851 records x 400+ columns -> 4 target tables");
  console.log("==============================================================\n");

  console.log("Mode:  " + (applyMode ? "GENERATE + APPLY" : "DRY RUN (stats + SQL files)"));
  console.log("Limit: " + (limit === Infinity ? "none (full dataset)" : limit));
  console.log("");

  // ── Optional: Apply migration ───────────────────────────────────────────
  if (migrateMode) {
    console.log("=== PHASE 0: Applying Migration ===");
    loadToken();

    // Save migration file
    fs.writeFileSync(MIGRATION_PATH, MIGRATION_SQL);
    console.log("  Saved migration: " + MIGRATION_PATH);

    // Apply via Management API
    try {
      await supabaseQuery(MIGRATION_SQL);
      console.log("  Migration applied successfully.\n");
    } catch (e) {
      console.error("  Migration error: " + e.message.slice(0, 300));
      console.error("  Tables may already exist (IF NOT EXISTS should handle this).");
      console.log("");
    }
  }

  // ── Phase 1: Stream CSV ─────────────────────────────────────────────────
  const phase1Start = Date.now();
  await streamCSV();

  // ── Phase 2: Generate SQL ───────────────────────────────────────────────
  const allStmts = generateSQL();

  // ── Save SQL files ──────────────────────────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalStmts = 0;
  for (const tableName of Object.keys(allStmts)) {
    const stmts = allStmts[tableName];
    if (stmts && stmts.length > 0) {
      const outPath = path.join(OUTPUT_DIR, tableName + "-justfair.sql");
      fs.writeFileSync(outPath, stmts.join("\n\n"));
      totalStmts += stmts.length;
      console.log("  Saved: " + outPath + " (" + stmts.length + " stmts)");
    }
  }

  console.log("\nTotal SQL statements: " + totalStmts);

  if (!applyMode) {
    console.log("\nDry run complete. To apply:");
    console.log("  node scripts/ingest-justfair.mjs --apply");
    console.log("  node scripts/ingest-justfair.mjs --migrate --apply  (includes migration)");

    // Print sample data for verification
    console.log("\n=== SAMPLE DATA ===");

    // Top 10 judges by case count
    const sortedJudges = Array.from(judgeSentencingAccum.entries())
      .sort(function (a, b) { return b[1].sentences.length - a[1].sentences.length; })
      .slice(0, 10);

    console.log("\nTop 10 judges by case count:");
    for (const [, entry] of sortedJudges) {
      const sorted = entry.sentences.slice().sort(function (a, b) { return a - b; });
      var depStr = "n/a";
      if (entry.totalWithGuidelines > 0) {
        depStr = round2(entry.downDepartures / entry.totalWithGuidelines * 100) + "%";
      }
      console.log("  " + entry.name + " (" + entry.district + "): " +
        entry.sentences.length + " cases, median=" + round2(median(sorted)) + "mo, " +
        "down_dep=" + depStr);
    }

    // Top 10 districts by case count
    const sortedDistricts = Array.from(districtSentencingAccum.entries())
      .sort(function (a, b) { return b[1].sentences.length - a[1].sentences.length; })
      .slice(0, 10);

    console.log("\nTop 10 district+offense groups by case count:");
    for (const [, entry] of sortedDistricts) {
      console.log("  " + entry.district + "/" + entry.chargeSlug + ": " +
        entry.sentences.length + " cases");
    }

    // Demographics summary
    const partyCounts = {};
    const genderCounts = {};
    const raceCounts = {};
    for (const [, entry] of judgeDemoAccum) {
      var p = entry.party || "unknown";
      partyCounts[p] = (partyCounts[p] || 0) + 1;
      var g = entry.gender || "unknown";
      genderCounts[g] = (genderCounts[g] || 0) + 1;
      var r = entry.race || "unknown";
      raceCounts[r] = (raceCounts[r] || 0) + 1;
    }
    console.log("\nJudge demographics summary:");
    console.log("  Appointing party: " + JSON.stringify(partyCounts));
    console.log("  Gender: " + JSON.stringify(genderCounts));
    console.log("  Race: " + JSON.stringify(raceCounts));

    return;
  }

  // ── Phase 3: Apply ──────────────────────────────────────────────────────
  console.log("\n=== PHASE 3: Applying to Supabase ===");
  loadToken();

  const applyOrder = [
    "judge_demographics",
    "judge_sentencing_patterns",
    "sentencing_distributions",
    "judge_sentencing_demographics",
  ];

  const applyStart = Date.now();
  let totalApplied = 0;
  let totalErrors = 0;

  for (const tableName of applyOrder) {
    if (allStmts[tableName] && allStmts[tableName].length > 0) {
      const result = await applyBatch(tableName, allStmts[tableName]);
      if (result) {
        totalApplied += result.applied;
        totalErrors += result.errors;
      }
    }
  }

  const applyElapsed = (Date.now() - applyStart) / 1000;
  const totalElapsed = (Date.now() - phase1Start) / 1000;

  console.log("\n==============================================================");
  console.log("  JUSTFAIR INGESTION COMPLETE");
  console.log("--------------------------------------------------------------");
  console.log("  Rows processed:  " + rowsRead.toLocaleString());
  console.log("  SQL applied:     " + totalApplied.toLocaleString());
  console.log("  Errors:          " + totalErrors);
  console.log("  Apply time:      " + (applyElapsed / 60).toFixed(1) + " min");
  console.log("  Total time:      " + (totalElapsed / 60).toFixed(1) + " min");
  console.log("==============================================================");
}

main().catch(function (e) {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
