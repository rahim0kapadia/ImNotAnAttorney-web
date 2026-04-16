/**
 * Bulk Appeal Outcome Correlator
 *
 * Computes appellate trends (reversal/affirmance rates by argument type, jurisdiction, year).
 *
 * Two-pass architecture:
 *   Phase 1: Stream citation-map CSV (522 MB), identify citing opinions
 *   Phase 2: Stream opinions CSV (50 GB), classify citing opinions for reversal/affirmance
 *   Phase 3: Compute trends by argument_type + jurisdiction + year
 *   Phase 4: Apply to appellate_trends table
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/citation-map-2026-03-31.csv.bz2 (522 MB)
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (cluster_id mappings)
 *   - npm install csv-parse
 *
 * Usage:
 *   node scripts/bulk-appeal-outcome-correlator.mjs --phase 1              # Stream citation-map
 *   node scripts/bulk-appeal-outcome-correlator.mjs --phase 2              # Stream opinions + classify
 *   node scripts/bulk-appeal-outcome-correlator.mjs --phase 3              # Compute trends
 *   node scripts/bulk-appeal-outcome-correlator.mjs --phase 4 --apply      # Apply to DB
 *   node scripts/bulk-appeal-outcome-correlator.mjs --all --apply          # All phases
 *   node scripts/bulk-appeal-outcome-correlator.mjs --dry-run              # Stats only
 */

import fs from "fs";
import path from "path";
import https from "https";
import readline from "readline";
import { spawn } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;

const CITATION_MAP_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "citation-map-2026-03-31.csv.bz2");
const OPINIONS_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2");
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const CITING_MAP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "good-law-graph", "appeal-citing-map.json");
const CLASSIFICATIONS_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "good-law-graph", "appeal-classifications.json");

// ── Court name → state code mapping ──────────────────────────────────────────
// Derives 2-letter state code from CL court name string. Returns "federal" for
// federal circuits, null if unrecognized. Uses char-code scan (no regex).
const STATE_NAMES_TO_CODES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "d.c.": "DC",
};

function deriveJurisdictionFromCourt(courtName) {
  if (!courtName) return null;
  const lc = courtName.toLowerCase();
  // Check for federal circuit courts
  if (lc.indexOf("circuit") >= 0 || lc.indexOf("united states") >= 0) return "federal";
  // Scan for state names in court name
  for (const [name, code] of Object.entries(STATE_NAMES_TO_CODES)) {
    if (lc.indexOf(name) >= 0) return code;
  }
  return null;
}

const args = process.argv.slice(2);
const phases = args.filter(a => a.startsWith("--phase")).map(a => parseInt(a.split(" ")[1] || args[args.indexOf(a) + 1], 10));
const runAll = args.includes("--all");
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");

let phasesToRun = [];
if (runAll) {
  phasesToRun = [1, 2, 3, 4];
} else if (phases.length > 0) {
  phasesToRun = phases;
} else {
  phasesToRun = [1, 2, 3];
}

// ── Legal issue signals (from template) ──────────────────────────────────────
const ISSUE_SIGNALS = [
  ["fourth_amendment", "fourth amendment", "4th amendment", "search and seizure", "warrantless search", "probable cause", "reasonable suspicion"],
  ["fifth_amendment", "fifth amendment", "5th amendment", "miranda", "self-incrimination", "custodial interrogation", "right to remain silent"],
  ["sixth_amendment", "sixth amendment", "6th amendment", "right to counsel", "confrontation clause", "cross-examination", "compulsory process"],
  ["eighth_amendment", "eighth amendment", "8th amendment", "cruel and unusual", "excessive bail", "excessive fine"],
  ["fourteenth_amendment", "fourteenth amendment", "14th amendment", "due process", "equal protection"],
  ["brady_violation", "brady violation", "brady material", "exculpatory evidence", "brady v. maryland"],
  ["giglio_violation", "giglio material", "giglio violation", "impeachment evidence"],
  ["ineffective_assistance", "ineffective assistance", "strickland", "ineffective counsel"],
  ["speedy_trial", "speedy trial", "right to speedy trial", "speedy trial act"],
  ["double_jeopardy", "double jeopardy", "twice placed in jeopardy"],
  ["chain_of_custody", "chain of custody", "break in the chain"],
  ["hearsay", "hearsay", "hearsay exception", "out-of-court statement"],
  ["expert_testimony", "daubert", "frye", "expert witness", "expert testimony", "scientific evidence"],
  ["identification", "eyewitness identification", "show-up identification", "photographic lineup", "suggestive lineup"],
  ["confession", "involuntary confession", "coerced confession", "voluntariness"],
  ["jury_instruction", "jury instruction", "jury charge", "erroneous instruction"],
  ["prosecutorial_misconduct", "prosecutorial misconduct", "improper argument", "golden rule argument"],
  ["sufficiency_of_evidence", "sufficiency of the evidence", "insufficient evidence"],
  ["sentencing", "sentencing guidelines", "mitigating factor", "aggravating factor", "departure from guidelines"],
  ["jurisdiction", "subject matter jurisdiction", "personal jurisdiction", "venue"],
];

// ── Reversal/Affirmance signals (no regex, indexOf only) ────────────────────
const REVERSAL_SIGNALS = [
  "reversed", "reverse the", "we reverse",
  "vacated", "we vacate",
  "remanded", "remand for",
  "reversed and remanded",
];

const AFFIRMANCE_SIGNALS = [
  "affirmed", "we affirm", "judgment affirmed",
  "affirm the",
];

function extractArgumentType(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [canonical, ...phrases] of ISSUE_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) return canonical;
    }
  }
  return null;
}

function classifyReversal(text) {
  if (!text) return "other";
  const lower = text.toLowerCase();

  // Check reversal signals first (stronger signal)
  for (const signal of REVERSAL_SIGNALS) {
    if (lower.indexOf(signal) >= 0) return "reversed";
  }

  // Check affirmance signals
  for (const signal of AFFIRMANCE_SIGNALS) {
    if (lower.indexOf(signal) >= 0) return "affirmed";
  }

  return "other";
}

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

// ── SQL / Supabase ──────────────────────────────────────────────────────────

function escapeString(val) {
  if (val === null || val === undefined) return "NULL";
  const str = String(val);
  const escaped = str.split("'").join("''");
  return `'${escaped}'`;
}

function escapeArray(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = [];
  for (const item of arr) {
    const str = String(item);
    let escaped = "";
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "\\") escaped += "\\\\";
      else if (ch === '"') escaped += '\\"';
      else escaped += ch;
    }
    items.push(`"${escaped}"`);
  }
  const literal = `{${items.join(",")}}`;
  const quoted = literal.split("'").join("''");
  return `'${quoted}'::text[]`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  const parentEnv = fs.readFileSync(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8");
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) { supabaseToken = line.slice(22).trim(); break; }
  }
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com", path: `/v1/projects/${PROJECT_REF}/database/query`, method: "POST",
      headers: { Authorization: `Bearer ${supabaseToken}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

function findBzcat() {
  for (const p of ["C:\\Program Files\\Git\\usr\\bin\\bzcat.exe", "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe", "bzcat"]) {
    if (p === "bzcat") return p;
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return "bzcat";
}

// ── Phase 1: Stream citation-map to identify citing opinions ────────────────

async function phase1() {
  console.log("=== PHASE 1: Stream Citation-Map → Build Citing Map ===\n");

  if (!fs.existsSync(CITATION_MAP_BZ2)) {
    console.error(`ERROR: citation-map CSV not found: ${CITATION_MAP_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`ERROR: dump not found: ${DUMP_FILE}`);
    process.exit(1);
  }

  // Load target cluster IDs from dump
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  const clusterToJurisdiction = new Map();
  const clusterToYear = new Map();

  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      const clusterId = String(r.courtlistener_cluster_id);
      targetClusters.add(clusterId);
      // Derive jurisdiction from court name if jurisdiction field missing
      const jur = r.jurisdiction || deriveJurisdictionFromCourt(r.court);
      if (jur) clusterToJurisdiction.set(clusterId, jur);
      if (r.year) clusterToYear.set(clusterId, r.year);
    }
  }
  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);
  console.log(`Dumped cluster metadata: ${clusterToJurisdiction.size} jurisdictions, ${clusterToYear.size} years\n`);

  const bzcatPath = findBzcat();
  const bzcat = spawn(bzcatPath, [CITATION_MAP_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  // Map: cited_cluster_id -> Array<citing_opinion_id>
  const citingMap = new Map();
  let rowCount = 0;
  let matchCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 1000000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} citations found (${elapsed.toFixed(0)}s)\n`);
      }

      const citedOpinionId = record.cited_opinion_id;
      const citingOpinionId = record.citing_opinion_id;

      if (!citedOpinionId || !citingOpinionId) continue;

      // Map opinion_id to cluster_id, for now, assume opinion_id contains cluster info
      // (We'll verify in Phase 2 by matching against the opinions CSV)
      if (!citingMap.has(citedOpinionId)) {
        citingMap.set(citedOpinionId, []);
      }
      citingMap.get(citedOpinionId).push(citingOpinionId);
      matchCount++;
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Unique cited opinions: ${citingMap.size}`);
  console.log(`Total citations: ${matchCount}`);

  // Save Phase 1 output as JSONL. The previous single-blob JSON.stringify
  // hit V8's max string length (~512MB) on large citingMaps. JSONL sidesteps
  // this by serializing incrementally in batches. Format:
  //   Line 1: {"type":"meta","targetClusters":[...],"clusterToJurisdiction":{...},"clusterToYear":{...}}
  //   Lines 2+: {"type":"batch","citing":["id1","id2",...]}   (CITING_BATCH_SIZE ids per line)
  // Phase 2 only needs the flat set of citing opinion IDs, so the
  // cited → citing mapping is flattened on write to minimize output size.
  const outputDir = path.dirname(CITING_MAP_FILE);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const CITING_BATCH_SIZE = 10000;
  const writeStream = fs.createWriteStream(CITING_MAP_FILE);

  const writeWithBackpressure = (chunk) => new Promise((resolve, reject) => {
    if (writeStream.write(chunk)) { resolve(); return; }
    writeStream.once("drain", resolve);
    writeStream.once("error", reject);
  });

  // Meta line
  await writeWithBackpressure(JSON.stringify({
    type: "meta",
    targetClusters: Array.from(targetClusters),
    clusterToJurisdiction: Object.fromEntries(clusterToJurisdiction),
    clusterToYear: Object.fromEntries(clusterToYear),
  }) + "\n");

  // Flatten citingMap → unique citing ID stream, written in batches.
  // Dedup per-batch (not globally, that would rebuild the OOM problem);
  // Phase 2 dedups on the receiving end using its own Set.
  let batch = [];
  let batchesWritten = 0;
  let totalWritten = 0;
  for (const opinions of citingMap.values()) {
    for (const opinionId of opinions) {
      batch.push(opinionId);
      if (batch.length >= CITING_BATCH_SIZE) {
        await writeWithBackpressure(JSON.stringify({ type: "batch", citing: batch }) + "\n");
        totalWritten += batch.length;
        batch = [];
        batchesWritten++;
        if (batchesWritten % 100 === 0) {
          process.stdout.write(`  Wrote ${batchesWritten} batches (${(totalWritten / 1000000).toFixed(1)}M IDs)\n`);
        }
      }
    }
  }
  if (batch.length > 0) {
    await writeWithBackpressure(JSON.stringify({ type: "batch", citing: batch }) + "\n");
    totalWritten += batch.length;
    batchesWritten++;
  }

  await new Promise((resolve, reject) => {
    writeStream.end((err) => err ? reject(err) : resolve());
  });

  console.log(`\nSaved Phase 1 output: ${CITING_MAP_FILE}`);
  console.log(`  ${batchesWritten} batches, ${totalWritten} citing IDs`);
}

// ── Phase 2: Stream opinions CSV to classify citing opinions ────────────────

async function phase2() {
  console.log("=== PHASE 2: Stream Opinions CSV → Classify Citing Opinions ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) {
    console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(CITING_MAP_FILE)) {
    console.error(`ERROR: Phase 1 output not found: ${CITING_MAP_FILE}`);
    console.error("Run Phase 1 first: node scripts/bulk-appeal-outcome-correlator.mjs --phase 1");
    process.exit(1);
  }

  // Load Phase 1 output (JSONL, see Phase 1 writer for format).
  // First line is meta; remaining lines are {type:"batch", citing:[ids...]}.
  let clusterToJurisdiction = {};
  let clusterToYear = {};
  const citingOpinionIds = new Set();

  const rl = readline.createInterface({
    input: fs.createReadStream(CITING_MAP_FILE),
    crlfDelay: Infinity,
  });
  let lineNum = 0;
  for await (const line of rl) {
    if (!line) continue;
    lineNum++;
    const obj = JSON.parse(line);
    if (obj.type === "meta") {
      clusterToJurisdiction = obj.clusterToJurisdiction || {};
      clusterToYear = obj.clusterToYear || {};
      continue;
    }
    if (obj.type === "batch" && Array.isArray(obj.citing)) {
      for (const opinionId of obj.citing) {
        citingOpinionIds.add(String(opinionId));
      }
    }
  }

  console.log(`Loaded ${citingOpinionIds.size} citing opinion IDs to classify (from ${lineNum} JSONL lines)\n`);

  const bzcatPath = findBzcat();
  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  // Array of classifications
  const classifications = [];
  let rowCount = 0;
  let matchCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} opinions classified (${elapsed.toFixed(0)}s)\n`);
      }

      const opinionId = String(record.id);
      const clusterId = String(record.cluster_id);

      if (!citingOpinionIds.has(opinionId)) continue;
      matchCount++;

      // Extract text for classification
      let text = record.plain_text || "";
      if (text.length < 500) {
        const html = record.html_with_citations || record.html || record.html_columbia || "";
        if (html.length > 500) text = stripHtml(html);
      }

      if (text.length < 500) continue;

      // Classify reversal outcome
      const outcome = classifyReversal(text);

      // Extract argument type
      const argumentType = extractArgumentType(text);

      // Get jurisdiction and year from Phase 1 data (if available)
      const jurisdiction = clusterToJurisdiction[clusterId] || "unknown";
      const year = clusterToYear[clusterId] || null;

      if (argumentType && year) {
        classifications.push({
          opinionId,
          clusterId,
          argumentType,
          jurisdiction,
          year: parseInt(year, 10),
          outcome,
        });
      }
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Opinions matched: ${matchCount}`);
  console.log(`Opinions classified: ${classifications.length}`);

  // Save Phase 2 output
  const outputDir = path.dirname(CLASSIFICATIONS_FILE);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(CLASSIFICATIONS_FILE, JSON.stringify(classifications, null, 2));
  console.log(`\nSaved Phase 2 output: ${CLASSIFICATIONS_FILE}`);

  // Quick stats
  const outcomes = new Map();
  const argumentTypes = new Map();
  for (const c of classifications) {
    outcomes.set(c.outcome, (outcomes.get(c.outcome) || 0) + 1);
    argumentTypes.set(c.argumentType, (argumentTypes.get(c.argumentType) || 0) + 1);
  }

  console.log(`\n--- Outcomes ---`);
  for (const [outcome, count] of [...outcomes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${outcome.padEnd(15)} ${count}`);
  }

  console.log(`\n--- Argument Types ---`);
  for (const [type, count] of [...argumentTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${type.padEnd(25)} ${count}`);
  }
}

// ── Phase 3: Compute trends ──────────────────────────────────────────────────

async function phase3() {
  console.log("=== PHASE 3: Compute Appellate Trends ===\n");

  if (!fs.existsSync(CLASSIFICATIONS_FILE)) {
    console.error(`ERROR: Phase 2 output not found: ${CLASSIFICATIONS_FILE}`);
    console.error("Run Phase 2 first: node scripts/bulk-appeal-outcome-correlator.mjs --phase 2");
    process.exit(1);
  }

  const classifications = JSON.parse(fs.readFileSync(CLASSIFICATIONS_FILE, "utf8"));
  console.log(`Loaded ${classifications.length} classifications\n`);

  // Group by (argumentType, jurisdiction, year)
  const trends = new Map();

  for (const c of classifications) {
    const key = `${c.argumentType}|${c.jurisdiction}|${c.year}`;
    if (!trends.has(key)) {
      trends.set(key, {
        argumentType: c.argumentType,
        jurisdiction: c.jurisdiction,
        year: c.year,
        reversed: 0,
        affirmed: 0,
        other: 0,
      });
    }
    const group = trends.get(key);
    if (c.outcome === "reversed") group.reversed++;
    else if (c.outcome === "affirmed") group.affirmed++;
    else group.other++;
  }

  // Filter to minimum sample size (3)
  const MIN_SAMPLE = 3;
  const filtered = [];

  for (const [key, group] of trends) {
    const total = group.reversed + group.affirmed + group.other;
    if (total >= MIN_SAMPLE) {
      filtered.push({
        ...group,
        sampleSize: total,
        reverseRate: (group.reversed / total).toFixed(4),
        affirmRate: (group.affirmed / total).toFixed(4),
      });
    }
  }

  console.log(`Total groups: ${trends.size}`);
  console.log(`Groups with n >= ${MIN_SAMPLE}: ${filtered.length}`);

  // Sort by reverse rate (descending)
  filtered.sort((a, b) => parseFloat(b.reverseRate) - parseFloat(a.reverseRate));

  console.log(`\n--- Top 20 Highest Reversal Rates ---`);
  for (const t of filtered.slice(0, 20)) {
    console.log(`  ${t.argumentType.padEnd(25)} ${t.jurisdiction.padEnd(10)} ${t.year} | rev=${t.reverseRate} aff=${t.affirmRate} n=${t.sampleSize}`);
  }

  // Save filtered trends
  const outputDir = path.dirname(CLASSIFICATIONS_FILE);
  const trendsFile = path.join(outputDir, "appeal-trends.json");
  fs.writeFileSync(trendsFile, JSON.stringify(filtered, null, 2));
  console.log(`\nSaved filtered trends: ${trendsFile}`);

  if (dryRun) {
    console.log("Dry run complete.");
    return;
  }

  return filtered;
}

// ── Phase 4: Apply to database ──────────────────────────────────────────────

async function phase4(trends) {
  console.log("=== PHASE 4: Apply to appellate_trends Table ===\n");

  if (!trends) {
    if (!fs.existsSync(path.join(path.dirname(CLASSIFICATIONS_FILE), "appeal-trends.json"))) {
      console.error("ERROR: No trends computed. Run Phase 3 first.");
      process.exit(1);
    }
    trends = JSON.parse(fs.readFileSync(path.join(path.dirname(CLASSIFICATIONS_FILE), "appeal-trends.json"), "utf8"));
  }

  console.log(`Trends to apply: ${trends.length}\n`);

  // Build INSERT statements without regex
  const stmts = [];
  for (const t of trends) {
    const sourceUrl = "https://www.courtlistener.com/";
    const argumentTypeEsc = escapeString(t.argumentType);
    const jurisdictionEsc = escapeString(t.jurisdiction);
    const sourceUrlsArr = escapeArray([sourceUrl]);

    const stmt = [
      "INSERT INTO appellate_trends (argument_type, jurisdiction, year, reverse_rate, affirm_rate, sample_size, source_urls)",
      "VALUES (" + argumentTypeEsc + ", " + jurisdictionEsc + ", " + t.year + ", " + t.reverseRate + ", " + t.affirmRate + ", " + t.sampleSize + ", " + sourceUrlsArr + ")",
      "ON CONFLICT (argument_type, jurisdiction, year) DO UPDATE SET",
      "  reverse_rate = EXCLUDED.reverse_rate,",
      "  affirm_rate = EXCLUDED.affirm_rate,",
      "  sample_size = EXCLUDED.sample_size,",
      "  source_urls = EXCLUDED.source_urls;",
    ].join("\n");

    stmts.push(stmt);
  }

  console.log(`SQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "appeal-trends-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-appeal-outcome-correlator.mjs --phase 4 --apply`);
    return;
  }

  loadToken();
  console.log(`\n--- Applying ${stmts.length} updates in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0, errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);
    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} trends, ${rate}/sec\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try { await supabaseQuery(batch.join("\n")); applied += batch.length; errors--; } catch {}
      }
    }
    if (i + BATCH_SIZE < stmts.length) await sleep(500);
  }

  console.log(`\n--- Results ---`);
  console.log(`Trends applied: ${applied}  Errors: ${errors}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK APPEAL OUTCOME CORRELATOR ===\n");
  console.log(`Phases to run: ${phasesToRun.join(", ")}`);
  console.log(`Dry run: ${dryRun}, Apply mode: ${applyMode}\n`);

  try {
    if (phasesToRun.includes(1)) {
      await phase1();
      console.log("\n");
    }

    if (phasesToRun.includes(2)) {
      await phase2();
      console.log("\n");
    }

    let trends = null;
    if (phasesToRun.includes(3)) {
      trends = await phase3();
      console.log("\n");
    }

    if (phasesToRun.includes(4)) {
      await phase4(trends);
      console.log("\n");
    }

    console.log("=== COMPLETE ===");
  } catch (e) {
    console.error("FATAL:", e.message);
    process.exit(1);
  }
}

main();
