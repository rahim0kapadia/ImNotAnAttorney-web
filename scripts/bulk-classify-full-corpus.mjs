/**
 * Full Corpus Bulk Classification Pipeline
 *
 * Streams the entire 50GB opinions-2026-03-31.csv.bz2, filters to criminal
 * opinions, runs mechanical extraction + cross-validation on full opinion text,
 * and upserts results into classified_opinions.
 *
 * Target: 100K-500K classified criminal opinions with real extraction data.
 *
 * Usage:
 *   node scripts/bulk-classify-full-corpus.mjs                    # Dry-run stats
 *   node scripts/bulk-classify-full-corpus.mjs --apply            # Write to DB
 *   node scripts/bulk-classify-full-corpus.mjs --limit 100        # Test first 100 criminal opinions
 *   node scripts/bulk-classify-full-corpus.mjs --resume-from 500000  # Skip first 500K CSV rows
 *   node scripts/bulk-classify-full-corpus.mjs --apply --skip-patterns  # Skip pattern table rebuild
 *
 * Runtime: 2-6 hours. Safe to interrupt and re-run (ON CONFLICT idempotent).
 *
 * CRITICAL: Do NOT run while other bulk CSV scripts are running (OOM gotcha).
 *
 * Dependencies:
 *   npm install csv-parse
 *   scripts/lib/opinion-classifier.mjs
 *   scripts/lib/mechanical-extractor.mjs
 *   scripts/lib/cross-validator.mjs
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

import { classifyOpinionType, getExtractionSteps } from "./lib/opinion-classifier.mjs";
import { extractAll } from "./lib/mechanical-extractor.mjs";
import { crossValidate } from "./lib/cross-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;
const MIN_TEXT_LEN = 500;

const OPINIONS_BZ2 = path.join(
  PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2"
);
// Pre-filtered criminal CSV produced by scripts/filter-criminal-opinions.py
// (indexed_bzip2, 12-core parallel, ~50min run). When present, skip bzcat
// entirely — stream directly for ~10x faster classification reruns.
const OPINIONS_CRIMINAL_CSV = path.join(
  PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-criminal.csv"
);

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const skipPatterns = args.includes("--skip-patterns");

const limitIdx = args.indexOf("--limit");
const criminalLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const resumeIdx = args.indexOf("--resume-from");
const resumeFrom = resumeIdx >= 0 ? parseInt(args[resumeIdx + 1], 10) : 0;

// ── Criminal filter keywords ─────────────────────────────────────────────────
// indexOf on lowercased text — NO regex (project rule)
const CRIMINAL_KEYWORDS = [
  "criminal", "defendant", "guilty", "not guilty", "sentenced", "sentencing",
  "prosecution", "prosecutor", "indictment", "arraignment", "plea",
  "felony", "misdemeanor", "probation", "parole", "incarcerat",
  "motion to suppress", "motion to dismiss", "motion in limine",
  "fourth amendment", "miranda", "search and seizure", "probable cause",
  "beyond a reasonable doubt", "burden of proof", "jury trial",
  "self-defense", "habeas corpus", "post-conviction", "appeal",
  "conviction", "acquittal", "arrest", "warrant", "bail",
  "dui", "dwi", "assault", "battery", "theft", "robbery", "burglary",
  "murder", "manslaughter", "drug", "narcotic", "controlled substance",
  "domestic violence", "sex offense", "sexual assault",
];

function isCriminalOpinion(lowerText) {
  for (const kw of CRIMINAL_KEYWORDS) {
    if (lowerText.indexOf(kw) >= 0) return true;
  }
  return false;
}

// ── Token loading ─────────────────────────────────────────────────────────────
// Use .split("=").slice(1).join("=") to handle JWT keys that contain "="
let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  // Check process.env first so CI/container environments don't need the file
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    supabaseToken = process.env.SUPABASE_ACCESS_TOKEN.trim();
    return;
  }
  const envPath = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.split("=").slice(1).join("=").trim();
      return;
    }
  }
  throw new Error("SUPABASE_ACCESS_TOKEN not found in process.env or ImNotAnAttorney/.env.local");
}

// ── Management API query ──────────────────────────────────────────────────────
function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: "/v1/projects/" + PROJECT_REF + "/database/query",
        method: "POST",
        headers: {
          Authorization: "Bearer " + supabaseToken,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 400)));
          } else {
            try { resolve(JSON.parse(data)); } catch { resolve(data); }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── SQL escaping ──────────────────────────────────────────────────────────────
function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("\\").join("\\\\").split("'").join("''") + "'";
}

function escArr(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const inner = arr.map((v) => '"' + String(v).split("\\").join("\\\\").split("'").join("''").split('"').join('\\"') + '"').join(",");
  return "'{" + inner + "}'";
}

function escJsonb(obj) {
  if (!obj) return "NULL";
  return esc(JSON.stringify(obj));
}

// ── HTML stripping (no regex — project rule) ──────────────────────────────────
function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const out = [];
  for (const part of parts) {
    const closeIdx = part.indexOf(">");
    out.push(closeIdx >= 0 ? part.slice(closeIdx + 1) : part);
  }
  return out.join("").trim();
}

// ── Jurisdiction heuristic from text ─────────────────────────────────────────
// State name → two-letter code. No regex — indexOf scanning.
const STATE_PATTERNS = [
  ["florida", "fl"], ["california", "ca"], ["texas", "tx"], ["new york", "ny"],
  ["illinois", "il"], ["pennsylvania", "pa"], ["ohio", "oh"], ["georgia", "ga"],
  ["north carolina", "nc"], ["michigan", "mi"], ["new jersey", "nj"],
  ["virginia", "va"], ["washington", "wa"], ["arizona", "az"], ["massachusetts", "ma"],
  ["tennessee", "tn"], ["indiana", "in"], ["missouri", "mo"], ["maryland", "md"],
  ["wisconsin", "wi"], ["colorado", "co"], ["minnesota", "mn"], ["south carolina", "sc"],
  ["alabama", "al"], ["louisiana", "la"], ["kentucky", "ky"], ["oregon", "or"],
  ["oklahoma", "ok"], ["connecticut", "ct"], ["utah", "ut"], ["iowa", "ia"],
  ["nevada", "nv"], ["arkansas", "ar"], ["mississippi", "ms"], ["kansas", "ks"],
  ["new mexico", "nm"], ["nebraska", "ne"], ["idaho", "id"], ["west virginia", "wv"],
  ["hawaii", "hi"], ["new hampshire", "nh"], ["maine", "me"], ["montana", "mt"],
  ["rhode island", "ri"], ["delaware", "de"], ["south dakota", "sd"],
  ["north dakota", "nd"], ["alaska", "ak"], ["vermont", "vt"], ["wyoming", "wy"],
  ["district of columbia", "dc"],
];

function deriveJurisdictionFromText(text) {
  if (!text) return null;
  const lower = text.slice(0, 2000).toLowerCase(); // Only scan header
  // Federal courts: check before state names to avoid false positives
  if (lower.indexOf("circuit") >= 0 || lower.indexOf("district court of the united states") >= 0) {
    return "federal";
  }
  for (const [name, code] of STATE_PATTERNS) {
    if (lower.indexOf(name) >= 0) return code;
  }
  return null;
}

// ── Load statute map from DB ──────────────────────────────────────────────────
async function loadStatuteMap() {
  console.log("Loading statute map from jurisdiction_statutes...");
  const rows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const sql =
      "SELECT jurisdiction, statute_number, common_charge_slug AS charge_slug FROM jurisdiction_statutes " +
      "WHERE common_charge_slug IS NOT NULL AND statute_number IS NOT NULL " +
      "ORDER BY jurisdiction, statute_number " +
      "LIMIT " + PAGE + " OFFSET " + offset;
    const result = await supabaseQuery(sql);
    const page = Array.isArray(result) ? result : (result.rows || []);
    if (page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const map = new Map();
  for (const r of rows) {
    if (!r.jurisdiction || !r.statute_number || !r.charge_slug) continue;
    const key = (r.jurisdiction + ":" + r.statute_number).toLowerCase();
    map.set(key, { charge_slug: r.charge_slug, statute_number: r.statute_number });
  }
  console.log("  Statute map: " + map.size + " entries");
  return map;
}

// ── Load theory map from DB ───────────────────────────────────────────────────
async function loadTheoryMap() {
  console.log("Loading theory map from charge_defense_theories...");
  const rows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const sql =
      "SELECT charge_slug, theory_name, theory_keywords, motion_types " +
      "FROM charge_defense_theories " +
      "ORDER BY charge_slug, theory_name " +
      "LIMIT " + PAGE + " OFFSET " + offset;
    const result = await supabaseQuery(sql);
    const page = Array.isArray(result) ? result : (result.rows || []);
    if (page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const map = new Map();
  for (const r of rows) {
    if (!r.charge_slug || !r.theory_name) continue;
    const theories = map.get(r.charge_slug) || [];
    theories.push({
      theory_name: r.theory_name,
      theory_keywords: Array.isArray(r.theory_keywords) ? r.theory_keywords : [],
      motion_types: Array.isArray(r.motion_types) ? r.motion_types : [],
    });
    map.set(r.charge_slug, theories);
  }
  console.log("  Theory map: " + map.size + " charge slugs");
  return map;
}

// ── Load cluster_id → jurisdiction from pre-built map (case_name_full extraction) ──
function loadClusterJurisdictionMap() {
  const mapPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "cluster-jurisdiction-map.json");
  if (!fs.existsSync(mapPath)) {
    console.log("  No cluster-jurisdiction-map.json found. Run build-final-jurisdiction-map.mjs first (see docs/handoffs/2026-04-14-jurisdiction-fix-pipeline.md).");
    return new Map();
  }
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const map = new Map(Object.entries(raw));
  console.log("  Cluster jurisdiction map: " + map.size.toLocaleString() + " entries");
  return map;
}

// ── Load court-jurisdiction-map.json for court_id → jurisdiction fallback ─────
function loadCourtJurisdictionMap() {
  const mapPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "court-jurisdiction-map.json");
  if (!fs.existsSync(mapPath)) {
    console.log("  No court-jurisdiction-map.json found.");
    return new Map();
  }
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const map = new Map(Object.entries(raw));
  console.log("  Court jurisdiction map: " + map.size.toLocaleString() + " entries");
  return map;
}

// ── Load existing cluster_id → jurisdiction from classified_opinions ──────────
async function loadExistingJurisdictions() {
  console.log("Loading existing jurisdictions from classified_opinions...");
  const rows = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const sql =
      "SELECT cluster_id, jurisdiction FROM classified_opinions " +
      "ORDER BY cluster_id LIMIT " + PAGE + " OFFSET " + offset;
    const result = await supabaseQuery(sql);
    const page = Array.isArray(result) ? result : (result.rows || []);
    if (page.length === 0) break;
    for (const r of page) rows.push(r);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const map = new Map();
  for (const r of rows) {
    if (r.cluster_id && r.jurisdiction) map.set(String(r.cluster_id), r.jurisdiction);
  }
  console.log("  Existing jurisdictions: " + map.size + " clusters");
  return map;
}

// ── Build UPSERT SQL for one classified opinion ───────────────────────────────
function buildUpsert(params) {
  const {
    cluster_id, case_name, court, jurisdiction, decision_date,
    opinion_type, extracted, confidence, signals, source_url,
  } = params;

  const cols = [
    "cluster_id", "case_name", "court", "jurisdiction", "decision_date",
    "opinion_type", "charge_types", "motion_types", "defense_theories",
    "motion_outcomes", "motion_favorability", "case_favorability", "holding_text",
    "is_good_law", "classification_confidence", "cross_validation_signals",
    "classified_at", "classified_by", "source_urls", "updated_at",
  ];

  const vals = [
    esc(String(cluster_id)),
    esc((case_name || "").slice(0, 500)),
    esc((court || "").slice(0, 200)),
    esc(jurisdiction || "unknown"),
    decision_date ? esc(decision_date) : "NULL",
    esc(opinion_type),
    escArr(extracted.charge_types),
    escArr(extracted.motion_types),
    escArr(extracted.defense_theories),
    escJsonb(extracted.motion_outcomes),
    escJsonb(extracted.motion_favorability),
    extracted.case_favorability !== null && extracted.case_favorability !== undefined
      ? String(extracted.case_favorability)
      : "NULL",
    extracted.holding_text ? esc(extracted.holding_text.slice(0, 2000)) : "NULL",
    "true",
    esc(confidence),
    escJsonb(signals),
    "now()",
    "'bulk_full_corpus'",
    "ARRAY[" + esc(source_url) + "]",
    "now()",
  ];

  // ON CONFLICT: update all extractable fields; preserve existing non-empty values
  // via COALESCE / CASE so re-runs enrich rather than overwrite
  const updates = [
    "case_name = CASE WHEN EXCLUDED.case_name LIKE 'cluster:%' THEN classified_opinions.case_name ELSE EXCLUDED.case_name END",
    "opinion_type = EXCLUDED.opinion_type",
    "charge_types = CASE WHEN array_length(EXCLUDED.charge_types, 1) > 0 THEN EXCLUDED.charge_types ELSE classified_opinions.charge_types END",
    "motion_types = CASE WHEN array_length(EXCLUDED.motion_types, 1) > 0 THEN EXCLUDED.motion_types ELSE classified_opinions.motion_types END",
    "defense_theories = CASE WHEN array_length(EXCLUDED.defense_theories, 1) > 0 THEN EXCLUDED.defense_theories ELSE classified_opinions.defense_theories END",
    "motion_outcomes = COALESCE(EXCLUDED.motion_outcomes, classified_opinions.motion_outcomes)",
    "motion_favorability = COALESCE(EXCLUDED.motion_favorability, classified_opinions.motion_favorability)",
    "case_favorability = COALESCE(EXCLUDED.case_favorability, classified_opinions.case_favorability)",
    "holding_text = COALESCE(EXCLUDED.holding_text, classified_opinions.holding_text)",
    "classification_confidence = EXCLUDED.classification_confidence",
    "cross_validation_signals = EXCLUDED.cross_validation_signals",
    "classified_by = EXCLUDED.classified_by",
    "source_urls = ARRAY(SELECT DISTINCT unnest(array_cat(classified_opinions.source_urls, EXCLUDED.source_urls)))",
    "updated_at = now()",
  ];

  return (
    "INSERT INTO classified_opinions (" + cols.join(", ") + ") " +
    "VALUES (" + vals.join(", ") + ") " +
    "ON CONFLICT (cluster_id) DO UPDATE SET " +
    updates.join(", ") + ";"
  );
}

// ── bzcat finder ─────────────────────────────────────────────────────────────
function findBzcat() {
  const candidates = [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "bzcat",
  ];
  for (const p of candidates) {
    if (p === "bzcat") return p;
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return "bzcat";
}

// ── Memory logging ────────────────────────────────────────────────────────────
function logMem(label) {
  const m = process.memoryUsage();
  const mb = (b) => (b / 1024 / 1024).toFixed(0);
  process.stderr.write(
    "  [mem " + label + "] rss=" + mb(m.rss) + "MB heap=" +
    mb(m.heapUsed) + "/" + mb(m.heapTotal) + "MB external=" + mb(m.external) + "MB\n"
  );
}

// ── Apply upsert batches ──────────────────────────────────────────────────────
async function applyBatches(upserts, applyStart) {
  const totalBatches = Math.ceil(upserts.length / BATCH_SIZE);
  let applied = 0;
  let errors = 0;

  for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
    const batch = upserts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(
        "  Batch " + batchNum + "/" + totalBatches +
        ": " + batch.length + " rows — " + rate + "/sec\n"
      );
    } catch (e) {
      errors++;
      console.error("  Batch " + batchNum + " ERROR: " + e.message.slice(0, 250));
      // Retry once on rate-limit
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          errors--;
          console.log("  Batch " + batchNum + " retry succeeded.");
        } catch (e2) {
          console.error("  Batch " + batchNum + " retry failed: " + e2.message.slice(0, 150));
        }
      }
    }
    if (i + BATCH_SIZE < upserts.length) await sleep(300);
  }

  return { applied, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Auto-detect source: pre-filtered CSV (fast) vs raw bz2 (slow bzcat)
  const useCriminalCsv = fs.existsSync(OPINIONS_CRIMINAL_CSV);
  const sourceLabel = useCriminalCsv
    ? "opinions-criminal.csv (pre-filtered, direct stream)"
    : "opinions-2026-03-31.csv.bz2 (bzcat decompression)";

  console.log("=== FULL CORPUS BULK CLASSIFICATION ===\n");
  console.log("Source:         " + sourceLabel);
  console.log("Mode:           " + (applyMode ? "APPLY (writes to DB)" : "DRY RUN (stats only)"));
  console.log("Criminal limit: " + (isFinite(criminalLimit) ? criminalLimit : "unlimited"));
  console.log("Resume from:    row " + resumeFrom);
  console.log("");

  // Crash diagnostics
  process.on("uncaughtException", (e) => {
    console.error("UNCAUGHT: " + (e.stack || e.message));
    process.exit(2);
  });
  process.on("unhandledRejection", (e) => {
    console.error("UNHANDLED: " + (e && (e.stack || e)));
    process.exit(3);
  });

  if (!useCriminalCsv && !fs.existsSync(OPINIONS_BZ2)) {
    console.error("ERROR: neither opinions-criminal.csv nor opinions bz2 found.");
    console.error("  Run: python3 scripts/filter-criminal-opinions.py");
    process.exit(1);
  }

  loadToken();

  // Load reference maps (one streamer at a time — OOM gotcha)
  const clusterJurisdictions = loadClusterJurisdictionMap();
  const courtMap = loadCourtJurisdictionMap();
  const [statuteMap, theoryMap, existingJurisdictions] = await Promise.all([
    loadStatuteMap(),
    loadTheoryMap(),
    loadExistingJurisdictions(),
  ]);
  logMem("post-db-load");

  // ── Stream setup: pre-filtered CSV (fast) or bzcat bz2 (slow) ───────────────
  let parser;
  let bzcat = null; // only set when using bzcat fallback

  if (useCriminalCsv) {
    // Fast path: opinions-criminal.csv produced by filter-criminal-opinions.py
    // Already filtered to criminal opinions — no keyword check needed in stream loop.
    console.log("\nStreaming pre-filtered CSV: " + OPINIONS_CRIMINAL_CSV + "\n");
    const csvStream = fs.createReadStream(OPINIONS_CRIMINAL_CSV);
    parser = csvStream.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        escape: "\\",
        relax_column_count: true,
        relax_quotes: true,
      })
    );
    parser.on("error", (e) =>
      console.error("csv-parse error at row ~" + rowCount + ": " + e.message.slice(0, 150))
    );
  } else {
    // Slow path: bzcat decompression of full 50GB bz2
    // Consider running filter-criminal-opinions.py first for ~10x faster reruns.
    const bzcatPath = findBzcat();
    console.log("\nStreaming " + OPINIONS_BZ2 + " via bzcat...");
    console.log("bzcat path: " + bzcatPath);
    console.log("TIP: run python3 scripts/filter-criminal-opinions.py first for ~10x faster reruns.\n");

    bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["ignore", "pipe", "pipe"] });
    let bzcatStderr = "";
    bzcat.stderr.on("data", (d) => { bzcatStderr += d.toString().slice(0, 2000); });
    bzcat.on("error", (e) => console.error("bzcat error: " + e.message));
    bzcat.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error("bzcat exited: code=" + code + " signal=" + signal + " stderr=" + bzcatStderr.slice(0, 500));
      }
    });

    // CL CSV: backslash-escaped quotes, relax_column_count + relax_quotes for legal text
    parser = bzcat.stdout.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        escape: "\\",
        relax_column_count: true,
        relax_quotes: true,
      })
    );
    parser.on("error", (e) =>
      console.error("csv-parse error at row ~" + rowCount + ": " + e.message.slice(0, 150))
    );
  }

  // ── Counters ────────────────────────────────────────────────────────────────
  let rowCount = 0;
  let skippedResume = 0;
  let skippedNoText = 0;
  let skippedNotCriminal = 0;
  let criminalCount = 0;
  let processed = 0;
  let withCharges = 0;
  let withMotions = 0;
  let withTheories = 0;
  let verified = 0;
  let lowConfidence = 0;
  const typeCounts = {};

  const upserts = [];
  const startTime = Date.now();
  const applyStart = Date.now();
  let totalApplied = 0;
  let totalErrors = 0;

  // ── Stream + process ────────────────────────────────────────────────────────
  try {
    for await (const record of parser) {
      rowCount++;

      // Resume support: skip first N rows
      if (rowCount <= resumeFrom) {
        skippedResume++;
        if (rowCount % 500000 === 0) {
          process.stdout.write("  Skipping (resume): " + (rowCount / 1000000).toFixed(1) + "M rows...\n");
        }
        continue;
      }

      // Progress + memory log every 100K rows
      if ((rowCount - resumeFrom) % 100000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = ((rowCount - resumeFrom) / ((Date.now() - startTime) * 0.001)).toFixed(0);
        process.stdout.write(
          "  " + (rowCount / 1000000).toFixed(2) + "M rows | " +
          criminalCount + " criminal | " + processed + " classified | " +
          upserts.length + " queued | " + elapsed + "s | " + rate + " rows/sec\n"
        );
        if ((rowCount - resumeFrom) % 500000 === 0) logMem((rowCount / 1000000).toFixed(1) + "M");
      }

      // CL CSVs quote ALL values — strip surrounding quotes before using
      const cluster_id = (record.cluster_id || "").split('"').join("").trim();
      if (!cluster_id) { skippedNoText++; continue; }

      // Prefer plain_text; fall back to HTML variants
      let text = record.plain_text || "";
      if (text.length < MIN_TEXT_LEN) {
        const htmlSources = [
          record.html_with_citations,
          record.html,
          record.html_columbia,
          record.html_lawbox,
          record.html_anon_2020,
        ];
        for (const src of htmlSources) {
          if (src && src.length > MIN_TEXT_LEN) {
            text = stripHtml(src);
            break;
          }
        }
      }

      if (text.length < MIN_TEXT_LEN) {
        skippedNoText++;
        continue;
      }

      // Criminal filter — indexOf on lowercased text, no regex
      const lowerText = text.toLowerCase();
      if (!isCriminalOpinion(lowerText)) {
        skippedNotCriminal++;
        continue;
      }
      criminalCount++;

      // Enforce --limit on criminal opinions
      if (criminalCount > criminalLimit) {
        console.log("\n--limit " + criminalLimit + " criminal opinions reached. Stopping stream.");
        try { if (bzcat) bzcat.kill(); } catch {}
        break;
      }

      processed++;

      // Derive jurisdiction: cluster map (case_name_full) > court_id map > existing DB > text heuristic > "unknown"
      const courtId = (record.court_id || "").split('"').join("").trim();
      let jurisdiction =
        (clusterJurisdictions.get(cluster_id) || "").toLowerCase() ||
        (courtMap.get(courtId) || "").toLowerCase() ||
        existingJurisdictions.get(cluster_id) ||
        deriveJurisdictionFromText(text) ||
        "unknown";

      // Classify opinion type
      const { type: opinion_type } = classifyOpinionType(text);
      typeCounts[opinion_type] = (typeCounts[opinion_type] || 0) + 1;
      const extractionSteps = getExtractionSteps(opinion_type);

      // Extract
      const extracted = extractAll({
        text,
        jurisdiction,
        opinionType: opinion_type,
        extractionSteps,
        statuteMap,
        theoryMap,
        isGoodLaw: true, // Default; bulk-is-good-law.mjs refines this separately
      });

      // Cross-validate
      const { confidence, signals } = crossValidate(extracted, {
        nature_of_suit: null,
        court: record.author_str || "",
        jurisdiction,
        docketCharges: [],
      });

      // Stats
      if (extracted.charge_types.length > 0) withCharges++;
      if (extracted.motion_types.length > 0) withMotions++;
      if (extracted.defense_theories.length > 0) withTheories++;
      if (confidence === "verified") verified++;
      else lowConfidence++;

      // case_name placeholder — ON CONFLICT COALESCE preserves real name from existing row
      const case_name = "cluster:" + cluster_id;
      // author_str is judge name, not court. Court resolution needs docket data.
      // For now store "unknown" — future: resolve via cluster→docket→court pipeline.
      const court = "unknown";
      const decision_date = record.date_filed ? record.date_filed.slice(0, 10) : null;
      const source_url = "https://www.courtlistener.com/opinion/" + cluster_id + "/";

      upserts.push(
        buildUpsert({
          cluster_id,
          case_name,
          court,
          jurisdiction,
          decision_date,
          opinion_type,
          extracted,
          confidence,
          signals,
          source_url,
        })
      );

      // Flush to DB in batches while streaming (keeps memory bounded)
      if (applyMode && upserts.length >= BATCH_SIZE * 4) {
        const batch = upserts.splice(0, BATCH_SIZE * 4);
        process.stdout.write("  Flushing " + batch.length + " upserts to DB...\n");
        const { applied, errors } = await applyBatches(batch, applyStart);
        totalApplied += applied;
        totalErrors += errors;
      }
    }
  } catch (parseErr) {
    console.log(
      "\n  CSV parse error at row " + rowCount +
      " (continuing with collected data): " + parseErr.message.slice(0, 150)
    );
    try { if (bzcat) bzcat.kill(); } catch {}
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=== Streaming complete (" + elapsed + "s / " + (elapsed / 60).toFixed(1) + "min) ===");
  console.log("Total CSV rows:          " + rowCount);
  console.log("Skipped (resume):        " + skippedResume);
  console.log("Skipped (no text):       " + skippedNoText);
  console.log("Skipped (not criminal):  " + skippedNotCriminal);
  console.log("Criminal opinions:       " + criminalCount);
  console.log("Processed (classified):  " + processed);
  console.log("Upserts queued:          " + upserts.length + " (unflushed)");
  if (applyMode) console.log("Already flushed to DB:   " + totalApplied);

  console.log("\nOpinion types:");
  for (const [t, c] of Object.entries(typeCounts)) {
    console.log("  " + t + ": " + c);
  }
  console.log("\nExtraction stats:");
  console.log("  With charge types:   " + withCharges);
  console.log("  With motion types:   " + withMotions);
  console.log("  With defense theory: " + withTheories);
  console.log("  Confidence verified: " + verified);
  console.log("  Low confidence:      " + lowConfidence);

  if (!applyMode) {
    if (upserts.length > 0) {
      console.log("\nDry run — no DB writes. Pass --apply to write to DB.");
    } else {
      console.log("\nNo upserts to apply.");
    }
    return;
  }

  // ── Flush remaining upserts ────────────────────────────────────────────────
  if (upserts.length > 0) {
    console.log("\n--- Flushing remaining " + upserts.length + " upserts in batches of " + BATCH_SIZE + " ---\n");
    const { applied, errors } = await applyBatches(upserts, applyStart);
    totalApplied += applied;
    totalErrors += errors;
  }

  const totalTime = ((Date.now() - applyStart) / 1000).toFixed(1);
  console.log("\n--- Final Results ---");
  console.log("Total applied: " + totalApplied);
  console.log("Total errors:  " + totalErrors);
  console.log("Total time:    " + totalTime + "s");

  // ── Auto-compute pattern tables ────────────────────────────────────────────
  if (!skipPatterns && totalApplied > 0) {
    console.log("\n--- Computing pattern tables ---");
    try {
      const { spawnSync } = await import("child_process");
      const result = spawnSync("node", ["scripts/compute-pattern-tables.mjs", "--apply"], {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
        timeout: 300000, // 5 min
      });
      if (result.status !== 0) {
        const errMsg = result.error ? result.error.message : ("exit code " + result.status);
        console.error("Pattern table computation failed: " + errMsg.slice(0, 200));
        console.log("Run manually: node scripts/compute-pattern-tables.mjs --apply");
      }
    } catch (e) {
      console.error("Pattern table computation failed: " + e.message.slice(0, 200));
      console.log("Run manually: node scripts/compute-pattern-tables.mjs --apply");
    }
  } else if (skipPatterns) {
    console.log("\nSkipped pattern table computation (--skip-patterns).");
    console.log("Run manually: node scripts/compute-pattern-tables.mjs --apply");
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
