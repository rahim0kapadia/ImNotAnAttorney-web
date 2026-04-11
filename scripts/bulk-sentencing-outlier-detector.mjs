/**
 * Bulk Sentencing Outlier Detector — Judge Percentile Analyzer
 *
 * Streams the 50 GB CourtListener opinions CSV and extracts sentencing data,
 * computing per-judge percentiles (p25, median, p75) for the sentencing_distributions table.
 *
 * For each opinion matching our cluster IDs, extracts sentence lengths from plain_text
 * using keyword matching (no regex). Normalizes all sentence durations to months,
 * groups by judge + jurisdiction + charge_slug, and computes percentiles for groups
 * with sample_size >= 3.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - sentencing_distributions table (migration applied)
 *   - judge_profiles table (pre-populated with judge IDs and names)
 *   - npm install csv-parse
 *
 * Usage:
 *   node scripts/bulk-sentencing-outlier-detector.mjs              # Generate SQL only
 *   node scripts/bulk-sentencing-outlier-detector.mjs --apply      # Generate + apply
 *   node scripts/bulk-sentencing-outlier-detector.mjs --dry-run    # Stats only
 *   node scripts/bulk-sentencing-outlier-detector.mjs --limit 100  # First N matches
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;

const OPINIONS_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2");
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Sentencing patterns ─────────────────────────────────────────────────────
// Match sentence phrases in lowercased text, extract numeric value.
// Normalize to months: years × 12, days ÷ 30.
const SENTENCING_PATTERNS = [
  "sentenced to",
  "term of imprisonment of",
  "imprisonment for",
  "sentence of",
  "years in prison",
  "months in prison",
  "-year sentence",
  "-month sentence",
];

const DURATION_UNITS = {
  "year": 12,
  "month": 1,
  "day": 1 / 30,
  "years": 12,
  "months": 1,
  "days": 1 / 30,
};

// ── Helper: Extract number after phrase (no regex) ────────────────────────
function extractNumberAfter(text, phrase) {
  const idx = text.indexOf(phrase);
  if (idx < 0) return null;
  let start = idx + phrase.length;
  while (start < text.length && text[start] === " ") start++;
  let end = start;
  while (end < text.length && ((text[end] >= "0" && text[end] <= "9") || text[end] === ".")) end++;
  if (end === start) return null;
  const num = parseFloat(text.slice(start, end));
  return isNaN(num) ? null : num;
}

// ── Helper: Extract unit word after number ──────────────────────────────────
function extractUnitAfter(text, startIdx) {
  let idx = startIdx;
  while (idx < text.length && ((text[idx] >= "0" && text[idx] <= "9") || text[idx] === ".")) idx++;
  while (idx < text.length && text[idx] === " ") idx++;
  let end = idx;
  while (end < text.length && ((text[end] >= "a" && text[end] <= "z") || (text[end] >= "A" && text[end] <= "Z"))) end++;
  return text.slice(idx, end).toLowerCase();
}

// ── Helper: Percentile computation ──────────────────────────────────────────
function computePercentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// ── Extract sentencing data from opinion text ───────────────────────────────
function extractSentencingData(text) {
  const lower = text.toLowerCase();
  const sentences = [];

  for (const pattern of SENTENCING_PATTERNS) {
    let searchIdx = 0;
    while (searchIdx < lower.length) {
      const idx = lower.indexOf(pattern, searchIdx);
      if (idx < 0) break;

      const num = extractNumberAfter(lower, pattern);
      if (num !== null) {
        let unitIdx = idx + pattern.length;
        while (unitIdx < lower.length && (lower[unitIdx] < "0" || lower[unitIdx] > "9") && lower[unitIdx] !== ".") unitIdx++;
        while (unitIdx < lower.length && ((lower[unitIdx] >= "0" && lower[unitIdx] <= "9") || lower[unitIdx] === ".")) unitIdx++;
        while (unitIdx < lower.length && lower[unitIdx] === " ") unitIdx++;

        const unit = extractUnitAfter(lower, unitIdx);
        let months = num;
        if (unit && DURATION_UNITS[unit]) {
          months = num * DURATION_UNITS[unit];
        } else if (pattern.includes("year")) {
          months = num * 12;
        } else if (pattern.includes("day")) {
          months = num / 30;
        }

        if (months > 0 && months < 1200) {
          sentences.push(months);
        }
      }

      searchIdx = idx + 1;
    }
  }

  return [...new Set(sentences)];
}

// ── SQL / Supabase ──────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return `"${inner}"`;
  });
  const literal = `{${items.join(",")}}`;
  return `'${literal.split("'").join("''")}'::text[]`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  const parentEnv = fs.readFileSync(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8");
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
      break;
    }
  }
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function findBzcat() {
  const paths = [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "bzcat"
  ];
  for (const p of paths) {
    if (p === "bzcat") return p;
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return "bzcat";
}

// ── HTML strip (no regex) ───────────────────────────────────────────────────

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

// ── Judge name matching ─────────────────────────────────────────────────────

async function loadJudges() {
  const envFile = fs.readFileSync(path.resolve(PROJECT_ROOT, ".env.local"), "utf8");
  let key = null;
  let sbUrl = null;
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.slice("SUPABASE_SERVICE_ROLE_KEY=".length).trim();
    if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) sbUrl = line.slice("NEXT_PUBLIC_SUPABASE_URL=".length).trim();
  }
  if (!key || !sbUrl) throw new Error("Missing SUPABASE env vars in .env.local");

  const map = new Map();
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const url = `${sbUrl}/rest/v1/judge_profiles?select=id,full_name&order=id&offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: "Bearer " + key }
    });
    if (!res.ok) throw new Error("Judge fetch failed: " + res.status + " " + (await res.text()).slice(0, 200));
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const j of batch) {
      if (j.id && j.full_name) map.set(j.full_name.toLowerCase(), j.id);
    }
    offset += PAGE;
    if (batch.length < PAGE) break;
  }
  return map;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK SENTENCING OUTLIER DETECTOR (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) {
    console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`ERROR: dump not found: ${DUMP_FILE}`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      targetClusters.set(String(r.courtlistener_cluster_id), r);
    }
  }
  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);

  console.log("Loading judge profiles...");
  const judges = await loadJudges();
  console.log(`Loaded ${judges.size} judges\n`);

  const bzcatPath = findBzcat();
  console.log(`Streaming opinions CSV through bzcat + csv-parse (escape: \\)...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true,
    skip_empty_lines: true,
    escape: "\\",
    relax_column_count: true,
    relax_quotes: true,
  }));
  parser.on("error", (err) => {
    console.warn(`  CSV parse warning (skipping): ${err.message.slice(0, 100)}`);
  });

  // Map<"judge_id|jurisdiction|charge_slug", {judge_id, jurisdiction, charge_slug, sentences: [...]}>
  const distributions = new Map();
  let rowCount = 0;
  let matchCount = 0;
  let withDataCount = 0;
  const startTime = Date.now();

  for await (const record of parser) {
    rowCount++;
    if (rowCount % 500000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${withDataCount} extracted (${elapsed.toFixed(0)}s)\n`);
    }

    const clusterId = record.cluster_id;
    if (!clusterId || !targetClusters.has(clusterId)) continue;
    matchCount++;

    const dumpRow = targetClusters.get(clusterId);
    let text = record.plain_text || "";
    if (text.length < 500) {
      const html = record.html_with_citations || record.html || record.html_columbia || "";
      if (html.length > 500) text = stripHtml(html);
    }
    if (text.length < 500) continue;

    const sentences = extractSentencingData(text);
    if (sentences.length === 0) continue;

    // Attempt to match opinion author to judge
    let judgeId = null;
    const authorStr = (record.author || "").toLowerCase();
    for (const [judgeName, jId] of judges) {
      if (authorStr.indexOf(judgeName) >= 0) {
        judgeId = jId;
        break;
      }
    }

    const jurisdiction = dumpRow.jurisdiction || "unknown";
    const chargeSlug = dumpRow.statute_slug || "unknown";
    const key = `${judgeId || "unknown"}|${jurisdiction}|${chargeSlug}`;

    if (!distributions.has(key)) {
      distributions.set(key, {
        judge_id: judgeId,
        jurisdiction: jurisdiction,
        charge_slug: chargeSlug,
        sentences: []
      });
    }

    const entry = distributions.get(key);
    for (const s of sentences) {
      entry.sentences.push(s);
    }

    withDataCount++;
    if (withDataCount % 500 === 0) {
      process.stdout.write(`  ${withDataCount} extractions...\n`);
    }
    if (withDataCount >= limit) {
      bzcat.kill();
      break;
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Clusters with sentence data: ${withDataCount}`);

  // Compute percentiles and filter groups with sample_size >= 3
  const results = [];
  for (const [, entry] of distributions) {
    if (entry.sentences.length < 3) continue;

    const sorted = entry.sentences.sort((a, b) => a - b);
    const p25 = computePercentile(sorted, 25);
    const median = computePercentile(sorted, 50);
    const p75 = computePercentile(sorted, 75);

    results.push({
      judge_id: entry.judge_id,
      jurisdiction: entry.jurisdiction,
      charge_slug: entry.charge_slug,
      median_months: Math.round(median * 100) / 100,
      p25: Math.round(p25 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      sample_size: entry.sentences.length,
      source_urls: ["https://www.courtlistener.com/"],
    });
  }

  console.log(`\nDistributions (sample_size >= 3): ${results.length}`);
  console.log(`Sample distribution sample sizes:`);
  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    console.log(`  ${r.judge_id || "unknown"}|${r.jurisdiction}|${r.charge_slug}: median=${r.median_months}mo, p25=${r.p25}mo, p75=${r.p75}mo (n=${r.sample_size})`);
  }

  if (dryRun) {
    console.log(`\nDry run complete.`);
    return;
  }
  if (results.length === 0) {
    console.log("\nNo distributions to apply.");
    return;
  }

  // Build INSERT statements with ON CONFLICT upsert pattern
  const stmts = [];
  for (const r of results) {
    const verificationUrl = "https://www.courtlistener.com/";
    const stmt = `INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls)
VALUES (${esc(r.judge_id)}, ${esc(r.jurisdiction)}, ${esc(r.charge_slug)}, ${r.median_months}, ${r.p25}, ${r.p75}, ${r.sample_size}, ${escArrayLiteral([verificationUrl])})
ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET
  median_months = EXCLUDED.median_months,
  p25 = EXCLUDED.p25,
  p75 = EXCLUDED.p75,
  sample_size = EXCLUDED.sample_size,
  source_urls = array_cat(COALESCE(source_urls, '{}'::text[]), EXCLUDED.source_urls);`;
    stmts.push(stmt);
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "sentencing-distributions-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outPath, stmts.join("\n\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-sentencing-outlier-detector.mjs --apply`);
    return;
  }

  loadToken();
  console.log(`\n--- Applying ${stmts.length} distributions in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0;
  let errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);
    try {
      await supabaseQuery(batch.join("\n\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} distributions — ${rate}/sec\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n\n"));
          applied += batch.length;
          errors--;
        } catch {}
      }
    }
    if (i + BATCH_SIZE < stmts.length) {
      await sleep(500);
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Distributions applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
