#!/usr/bin/env node
/**
 * Link sentencing_distributions to judge_profiles.
 *
 * The original bulk-sentencing-outlier-detector.mjs failed to match judges
 * because it queried judge_profiles.name (doesn't exist) instead of full_name.
 * All 244 rows have judge_id = NULL — they are jurisdiction-level aggregates
 * (all judges lumped together), not per-judge distributions.
 *
 * This script re-derives per-judge sentencing distributions by:
 *   1. Loading the statute-case-law dump (cluster_id -> jurisdiction + charge_slug)
 *   2. Loading judge_profiles cl_person_id -> id mapping (Supabase)
 *   3. Streaming opinions-filtered.csv (1.1 GB) with csv-parse
 *   4. For each match: extracting sentence data, mapping author_id -> judge
 *   5. Grouping by judge_id|jurisdiction|charge_slug, computing percentiles
 *   6. Deleting old NULL-judge rows and inserting per-judge distributions
 *
 * Usage:
 *   node scripts/link-sentencing-to-judges.mjs --dry-run   # preview matches
 *   node scripts/link-sentencing-to-judges.mjs --apply      # write to DB
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { createReadStream, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

dotenv.config({ path: resolve(PROJECT_ROOT, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");

if (!dryRun && !apply) {
  console.error("Usage: --dry-run or --apply");
  process.exit(1);
}

const OPINIONS_CSV = resolve(PROJECT_ROOT, "data/bulk-verify/cl-bulk/opinions-filtered.csv");
const DUMP_FILE = resolve(PROJECT_ROOT, "data/bulk-verify/statute-case-law-dump.json");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

// ── Sentencing extraction (from original bulk-sentencing-outlier-detector) ──

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
  year: 12, month: 1, day: 1 / 30,
  years: 12, months: 1, days: 1 / 30,
};

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

function extractUnitAfter(text, startIdx) {
  let idx = startIdx;
  while (idx < text.length && ((text[idx] >= "0" && text[idx] <= "9") || text[idx] === ".")) idx++;
  while (idx < text.length && text[idx] === " ") idx++;
  let end = idx;
  while (end < text.length && ((text[end] >= "a" && text[end] <= "z") || (text[end] >= "A" && text[end] <= "Z"))) end++;
  return text.slice(idx, end).toLowerCase();
}

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

function computePercentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
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

// ── Step 1: Load statute-case-law dump + jurisdiction_statutes ──

async function loadDump() {
  // First, load jurisdiction_statutes to get jurisdiction + charge_slug per statute ID
  const jsMap = new Map(); // jurisdiction_statute_id -> { jurisdiction, chargeSlug }
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("jurisdiction_statutes")
      .select("id, jurisdiction, common_charge_slug")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("Fetch jurisdiction_statutes failed: " + error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      jsMap.set(row.id, {
        jurisdiction: row.jurisdiction || "unknown",
        chargeSlug: row.common_charge_slug || "unknown",
      });
    }
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  console.log("   Loaded " + jsMap.size + " jurisdiction_statutes");

  // Then load the case-law dump and join
  const dump = JSON.parse(readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Map();
  let resolved = 0;
  let unresolved = 0;
  for (const r of dump) {
    if (!r.courtlistener_cluster_id) continue;
    const jsEntry = jsMap.get(r.jurisdiction_statute_id);
    if (jsEntry) {
      targetClusters.set(String(r.courtlistener_cluster_id), jsEntry);
      resolved++;
    } else {
      // No jurisdiction info — skip (can't attribute to a charge)
      unresolved++;
    }
  }
  console.log("   Resolved: " + resolved + ", unresolved (no statute match): " + unresolved);
  return targetClusters;
}

// ── Step 2: Load judge_profiles cl_person_id -> id ──

async function loadJudgeMapping() {
  const map = new Map(); // cl_person_id (string) -> judge UUID
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("judge_profiles")
      .select("id, cl_person_id")
      .not("cl_person_id", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("Fetch judges failed: " + error.message);
    if (!data || data.length === 0) break;
    for (const row of data) map.set(String(row.cl_person_id), row.id);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return map;
}

// ── Step 3: Stream opinions CSV with csv-parse ──
// Columns: id, date_created, date_modified, author_str, per_curiam,
// joined_by_str, type, sha1, page_count, download_url, local_path,
// plain_text, html, html_lawbox, html_columbia, html_anon_2020,
// xml_harvard, xml_scan, html_with_citations, extracted_by_ocr,
// author_id, cluster_id

async function streamOpinions(targetClusters, judgeMap) {
  // Map<"judgeUUID|jurisdiction|chargeSlug", { ... }>
  const distributions = new Map();

  const parser = createReadStream(OPINIONS_CSV, { encoding: "utf8" })
    .pipe(parse({
      columns: true,
      skip_empty_lines: true,
      escape: "\\",
      relax_column_count: true,
      relax_quotes: true,
    }));

  let rowCount = 0;
  let clusterMatches = 0;
  let authorMatches = 0;
  let sentenceExtractions = 0;
  let textFound = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 2000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        process.stdout.write(
          "  " + rowCount + " rows, " + clusterMatches + " cluster hits, " +
          authorMatches + " author hits, " + sentenceExtractions + " extractions (" +
          elapsed + "s)\r"
        );
      }

      const clusterId = record.cluster_id;
      if (!clusterId || !targetClusters.has(clusterId)) continue;
      clusterMatches++;

      const authorId = (record.author_id || "").trim();
      if (!authorId) continue; // per curiam or no author

      const judgeId = judgeMap.get(authorId);
      if (!judgeId) continue; // author not in our judge_profiles
      authorMatches++;

      const dumpRow = targetClusters.get(clusterId);

      // Get opinion text — try plain_text first, fall back to HTML
      let text = (record.plain_text || "").trim();
      if (text.length < 200) {
        const html = record.html_with_citations || record.html || record.html_columbia || "";
        if (html.length > 200) text = stripHtml(html);
      }
      if (text.length < 200) continue;
      textFound++;

      const sentences = extractSentencingData(text);
      if (sentences.length === 0) continue;
      sentenceExtractions++;

      const jurisdiction = dumpRow.jurisdiction;
      const chargeSlug = dumpRow.chargeSlug;
      const key = judgeId + "|" + jurisdiction + "|" + chargeSlug;

      if (!distributions.has(key)) {
        distributions.set(key, {
          judgeId,
          jurisdiction,
          chargeSlug,
          sentences: [],
          sourceOpinionIds: new Set(),
        });
      }

      const entry = distributions.get(key);
      for (const s of sentences) {
        entry.sentences.push(s);
      }
      const opId = (record.id || "").trim();
      if (opId) entry.sourceOpinionIds.add(opId);
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${rowCount} rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
  }

  process.stdout.write("\n");
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("  CSV complete: " + rowCount + " rows in " + elapsed + "s");
  console.log("  Cluster matches: " + clusterMatches);
  console.log("  With author_id: " + authorMatches);
  console.log("  With text >= 200 chars: " + textFound);
  console.log("  With sentence data: " + sentenceExtractions);

  return distributions;
}

// ── Step 4: Compute percentiles and prepare results ──

function computeDistributions(distributions) {
  const results = [];
  for (const [, entry] of distributions) {
    if (entry.sentences.length < 3) continue;

    const sorted = [...entry.sentences].sort((a, b) => a - b);
    const p25 = computePercentile(sorted, 25);
    const median = computePercentile(sorted, 50);
    const p75 = computePercentile(sorted, 75);

    // Build source_urls from opinion IDs
    const sourceUrls = [];
    for (const opId of entry.sourceOpinionIds) {
      sourceUrls.push("https://www.courtlistener.com/opinion/" + opId + "/");
    }

    results.push({
      judgeId: entry.judgeId,
      jurisdiction: entry.jurisdiction,
      chargeSlug: entry.chargeSlug,
      medianMonths: Math.round(median * 100) / 100,
      p25: Math.round(p25 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      sampleSize: entry.sentences.length,
      sourceUrls,
    });
  }

  return results;
}

// ── Step 5: Apply to DB ──

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).split("'").join("''") + "'";
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return '"' + inner + '"';
  });
  return "'{" + items.join(",") + "}'::text[]";
}

let supabaseAccessToken = null;

function loadAccessToken() {
  if (supabaseAccessToken) return;
  const parentEnv = readFileSync(resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8");
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseAccessToken = line.slice(22).trim();
      break;
    }
  }
  if (!supabaseAccessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN not found in parent .env.local");
  }
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com",
      path: "/v1/projects/" + PROJECT_REF + "/database/query",
      method: "POST",
      headers: {
        Authorization: "Bearer " + supabaseAccessToken,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error("SQL " + res.statusCode + ": " + data.slice(0, 300)));
        } else {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function applyResults(results) {
  loadAccessToken();

  // Step A: Delete all existing rows with judge_id IS NULL (the broken aggregates + dupes)
  console.log("\n  Deleting existing NULL-judge rows...");
  await supabaseQuery(
    "DELETE FROM sentencing_distributions WHERE judge_id IS NULL;"
  );
  console.log("  Deleted old aggregate rows.");

  // Step B: Add unique index for upsert safety (idempotent)
  try {
    await supabaseQuery(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_sentencing_dist_judge_juris_charge ON sentencing_distributions (judge_id, jurisdiction, charge_slug);"
    );
    console.log("  Unique index created (or already existed).");
  } catch (e) {
    console.log("  Unique index note: " + e.message.slice(0, 200));
  }

  // Step C: Batch insert
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const stmts = batch.map((r) => {
      return "INSERT INTO sentencing_distributions (judge_id, jurisdiction, charge_slug, median_months, p25, p75, sample_size, source_urls) VALUES (" +
        esc(r.judgeId) + ", " +
        esc(r.jurisdiction) + ", " +
        esc(r.chargeSlug) + ", " +
        r.medianMonths + ", " +
        r.p25 + ", " +
        r.p75 + ", " +
        r.sampleSize + ", " +
        escArrayLiteral(r.sourceUrls) +
        ") ON CONFLICT (judge_id, jurisdiction, charge_slug) DO UPDATE SET " +
        "median_months = EXCLUDED.median_months, " +
        "p25 = EXCLUDED.p25, " +
        "p75 = EXCLUDED.p75, " +
        "sample_size = EXCLUDED.sample_size, " +
        "source_urls = EXCLUDED.source_urls;";
    });

    try {
      await supabaseQuery(stmts.join("\n"));
      inserted += batch.length;
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(results.length / BATCH_SIZE);
      const rate = (inserted / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write("  Batch " + batchNum + "/" + totalBatches + ": " + batch.length + " rows (" + rate + "/sec)\n");
    } catch (e) {
      errors++;
      console.error("  Batch error: " + e.message.slice(0, 200));
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(stmts.join("\n"));
          inserted += batch.length;
          errors--;
        } catch {}
      }
    }

    if (i + BATCH_SIZE < results.length) await sleep(300);
  }

  return { inserted, errors };
}

// ── Main ──

async function main() {
  console.log("=== LINK SENTENCING TO JUDGES ===");
  console.log("Mode: " + (dryRun ? "DRY RUN" : "APPLY") + "\n");

  console.log("1. Loading statute-case-law dump + jurisdiction_statutes...");
  const targetClusters = await loadDump();
  console.log("   " + targetClusters.size + " target clusters\n");

  console.log("2. Loading judge_profiles mapping...");
  const judgeMap = await loadJudgeMapping();
  console.log("   " + judgeMap.size + " judges with cl_person_id\n");

  console.log("3. Streaming opinions CSV to extract sentencing data...");
  console.log("   Source: " + OPINIONS_CSV + "\n");
  const distributions = await streamOpinions(targetClusters, judgeMap);

  console.log("\n4. Computing per-judge percentiles (min sample_size = 3)...");
  const results = computeDistributions(distributions);
  console.log("   " + results.length + " distributions (sample_size >= 3)");

  // Show top results
  const sorted = [...results].sort((a, b) => b.sampleSize - a.sampleSize);
  console.log("\n   Top 15 distributions by sample size:");
  for (let i = 0; i < Math.min(15, sorted.length); i++) {
    const r = sorted[i];
    console.log("   " + r.judgeId.slice(0, 8) + "... | " + r.jurisdiction + " | " + r.chargeSlug +
      " | median=" + r.medianMonths + "mo, p25=" + r.p25 + "mo, p75=" + r.p75 + "mo (n=" + r.sampleSize + ")");
  }

  // Distribution stats
  const rawEntries = distributions.size;
  const belowThreshold = rawEntries - results.length;
  console.log("\n   Raw groups: " + rawEntries);
  console.log("   Below threshold (n < 3): " + belowThreshold);
  console.log("   Final distributions: " + results.length);

  if (dryRun) {
    console.log("\nDry run complete. Use --apply to write to DB.");
    return;
  }

  if (results.length === 0) {
    console.log("\nNo distributions to insert.");
    return;
  }

  console.log("\n5. Applying to DB...");
  const { inserted, errors } = await applyResults(results);
  console.log("\n   Inserted: " + inserted);
  console.log("   Errors: " + errors);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
