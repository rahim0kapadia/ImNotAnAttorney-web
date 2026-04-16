/**
 * Bulk Is-Good-Law, Zero-citation fast path for is_good_law verification
 *
 * Reads citation_count from the already-downloaded CL clusters CSV.
 * Cases with citation_count = 0 are immediately marked is_good_law = true:
 * if no opinion has ever cited this case, nothing could have overruled it.
 *
 * Cases with citation_count > 0 still need classify-case-law.mjs (API loop)
 * to check for negative treatment signals in citing opinions.
 *
 * This eliminates 30-50% of the API work instantly, with zero API calls.
 * Verification source URLs are stored for every updated row.
 *
 * Prerequisites:
 *   - data/bulk-verify/statute-case-law-dump.json (from bulk-dump-cases.mjs)
 *   - data/bulk-verify/cl-bulk/opinion-clusters-2026-03-31.csv.bz2 (from bulk-classify-cases.mjs)
 *
 * Usage:
 *   node scripts/bulk-is-good-law.mjs                # Generate SQL only
 *   node scripts/bulk-is-good-law.mjs --apply        # Generate + apply to Supabase
 *   node scripts/bulk-is-good-law.mjs --dry-run      # Stats only, no SQL written
 *   node scripts/bulk-is-good-law.mjs --limit 1000   # Process first N matching rows
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { stripQuotes } from "./lib/csv-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 100;

const BULK_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk");
const CLUSTERS_BZ2 = path.join(BULK_DIR, "opinion-clusters-2026-03-31.csv.bz2");

const DEFAULT_DUMP = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "is-good-law-updates.sql");

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const inputIdx = args.indexOf("--input");
const inputPath = inputIdx >= 0 ? path.resolve(args[inputIdx + 1]) : DEFAULT_DUMP;
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? path.resolve(args[outputIdx + 1]) : DEFAULT_OUTPUT;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── SQL Helpers ─────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'";
  const items = arr.map(s => `"${String(s).split('"').join('""').split("'").join("''")}"`);
  return `'{${items.join(",")}}'`;
}

function parsePostgresArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string") return [];
  if (val === "{}") return [];
  const inner = val.slice(1, -1);
  const items = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"' && !inQuote) { inQuote = true; continue; }
    if (ch === '"' && inQuote) {
      if (i + 1 < inner.length && inner[i + 1] === '"') { current += '"'; i++; continue; }
      inQuote = false; continue;
    }
    if (ch === "," && !inQuote) { items.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.length > 0) items.push(current);
  return items;
}

// ── Supabase ────────────────────────────────────────────────────────────────

let supabaseToken = null;

function loadToken() {
  const parentEnv = fs.readFileSync(
    path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8"
  );
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
      break;
    }
  }
  if (!supabaseToken) {
    console.error("ERROR: SUPABASE_ACCESS_TOKEN not found");
    process.exit(1);
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
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data}`));
        else {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── bzcat ─────────────────────────────────────────────────────────────────

function findBzcat() {
  const candidates = [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bzcat.exe",
    "bzcat",
  ];
  for (const p of candidates) {
    if (p === "bzcat") return p;
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return "bzcat";
}

// ── CSV Parser ─────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

// ── Stream CSV for citation counts ──────────────────────────────────────────

async function streamCitationCounts(bz2Path, targetClusterIds) {
  return new Promise((resolve, reject) => {
    // cluster_id (string) → { citationCount, precedentialStatus }
    const results = new Map();

    const bzcatPath = findBzcat();
    console.log(`\nStreaming clusters CSV through bzcat...`);
    console.log(`Using: ${bzcatPath}`);
    console.log(`Looking for ${targetClusterIds.size} cluster IDs...\n`);

    const bzcat = spawn(bzcatPath, [bz2Path], { stdio: ["pipe", "pipe", "pipe"] });
    const rl = createInterface({ input: bzcat.stdout, crlfDelay: Infinity });

    let headerMap = {};
    let lineCount = 0;
    let matchCount = 0;
    let lastReport = 0;
    const startTime = Date.now();

    // Handle multi-line quoted fields
    let pendingLine = "";
    let inQuotedField = false;

    rl.on("line", (rawLine) => {
      if (inQuotedField) {
        pendingLine += "\n" + rawLine;
        let quoteCount = 0;
        for (let i = 0; i < rawLine.length; i++) {
          if (rawLine[i] === '"') quoteCount++;
        }
        if (quoteCount % 2 === 1) {
          inQuotedField = false;
          rawLine = pendingLine;
          pendingLine = "";
        } else {
          return;
        }
      } else {
        let quoteCount = 0;
        for (let i = 0; i < rawLine.length; i++) {
          if (rawLine[i] === '"') quoteCount++;
        }
        if (quoteCount % 2 === 1) {
          inQuotedField = true;
          pendingLine = rawLine;
          return;
        }
      }

      lineCount++;

      if (lineCount === 1) {
        // Parse header row, strip surrounding quotes from each column name
        const rawHeaders = rawLine.split(",");
        for (let i = 0; i < rawHeaders.length; i++) {
          headerMap[stripQuotes(rawHeaders[i])] = i;
        }
        const citIdx = headerMap.citation_count !== undefined ? headerMap.citation_count : "NOT FOUND";
        const precIdx = headerMap.precedential_status !== undefined ? headerMap.precedential_status : "NOT FOUND";
        console.log(`  Columns: ${rawHeaders.length}`);
        console.log(`  citation_count index:      ${citIdx}`);
        console.log(`  precedential_status index: ${precIdx}`);
        if (citIdx === "NOT FOUND") {
          console.warn(`  WARNING: citation_count column not found, all rows treated as having citations`);
        }
        return;
      }

      // Fast path: extract cluster ID from first field before full parse
      const firstComma = rawLine.indexOf(",");
      if (firstComma < 0) return;
      let clusterId = rawLine.slice(0, firstComma);
      // CL clusters CSV wraps IDs in double quotes, strip them
      if (clusterId.length >= 2 && clusterId[0] === '"' && clusterId[clusterId.length - 1] === '"') {
        clusterId = clusterId.slice(1, -1);
      }

      if (!targetClusterIds.has(clusterId)) {
        const milestone = Math.floor(lineCount / 2000000);
        if (milestone > lastReport) {
          lastReport = milestone;
          const elapsed = (Date.now() - startTime) / 1000;
          process.stdout.write(
            `  ${(lineCount / 1000000).toFixed(1)}M lines, ${matchCount} matches (${elapsed.toFixed(0)}s)...\n`
          );
        }
        return;
      }

      // Full parse, only need citation_count + precedential_status
      const values = parseCsvLine(rawLine);
      matchCount++;

      const citationCountIdx = headerMap.citation_count;
      const precedentialIdx = headerMap.precedential_status;

      // null = column not in CSV (unknown), 0 = confirmed no citations
      const citationCount = citationCountIdx !== undefined
        ? (parseInt(values[citationCountIdx], 10) || 0)
        : null;

      const precedentialStatus = precedentialIdx !== undefined
        ? stripQuotes(values[precedentialIdx] || "")
        : "";

      results.set(clusterId, { citationCount, precedentialStatus });

      if (matchCount % 1000 === 0) {
        process.stdout.write(`  ${matchCount} matched...\n`);
      }

      if (matchCount >= limit) {
        bzcat.kill();
        rl.close();
      }
    });

    rl.on("close", () => {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(
        `\n  Stream complete: ${(lineCount / 1000000).toFixed(1)}M lines in ${elapsed.toFixed(0)}s`
      );
      console.log(`  Matched: ${matchCount} cluster IDs`);
      resolve(results);
    });

    bzcat.stderr.on("data", () => {}); // suppress bzcat progress output
    bzcat.on("error", (err) => reject(new Error(`bzcat failed: ${err.message}`)));
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK IS-GOOD-LAW (Zero-Citation Fast Path) ===\n");

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Dump not found: ${inputPath}`);
    console.error(`Run: node scripts/bulk-dump-cases.mjs`);
    process.exit(1);
  }

  if (!fs.existsSync(CLUSTERS_BZ2)) {
    console.error(`ERROR: Clusters CSV not found: ${CLUSTERS_BZ2}`);
    console.error(`The CSV is downloaded by bulk-classify-cases.mjs, check data/bulk-verify/cl-bulk/`);
    process.exit(1);
  }

  const sizeMB = (fs.statSync(CLUSTERS_BZ2).size / (1024 * 1024)).toFixed(0);
  console.log(`Clusters CSV: ${sizeMB} MB`);

  const allRows = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  // Filter: has CL cluster ID. Process ALL, even already-verified cases
  // get additional source URLs from this method (citation_count=0 proof).
  const needsVerification = allRows.filter(r => {
    if (!r.courtlistener_cluster_id) return false;
    return true; // is_good_law is null
  });

  const alreadyVerified = allRows.filter(r =>
    r.is_good_law === true || r.is_good_law === false
  ).length;

  console.log(`Total dump rows:              ${allRows.length}`);
  console.log(`Already has is_good_law:      ${alreadyVerified}`);
  console.log(`Needs is_good_law check:      ${needsVerification.length}`);

  if (needsVerification.length === 0) {
    console.log("\nAll rows already have is_good_law set. Nothing to do.");
    return;
  }

  // Build cluster ID set and row lookup
  const clusterIdSet = new Set();
  const rowMap = new Map(); // cluster_id (string) → DB row
  for (const row of needsVerification) {
    clusterIdSet.add(row.courtlistener_cluster_id);
    rowMap.set(row.courtlistener_cluster_id, row);
  }

  console.log(`Unique cluster IDs to check:  ${clusterIdSet.size}`);

  // Stream the CSV
  const results = await streamCitationCounts(CLUSTERS_BZ2, clusterIdSet);

  // Categorize
  const zeroCitationRows = [];  // → mark is_good_law = true immediately
  const hasCitationRows = [];   // → still needs API (classify-case-law.mjs)
  let notFoundInCsv = 0;

  const precStatusCounts = {}; // breakdown for zero-citation rows

  for (const [clusterId, data] of results) {
    const dbRow = rowMap.get(clusterId);
    if (!dbRow) continue;

    const entry = { dbRow, data, clusterId };

    if (data.citationCount === null) {
      // citation_count column not found, can't determine, send to API loop
      hasCitationRows.push(entry);
    } else if (data.citationCount === 0) {
      zeroCitationRows.push(entry);
      const prec = data.precedentialStatus || "Unknown";
      precStatusCounts[prec] = (precStatusCounts[prec] || 0) + 1;
    } else {
      hasCitationRows.push(entry);
    }
  }

  for (const clusterId of clusterIdSet) {
    if (!results.has(clusterId)) notFoundInCsv++;
  }

  const totalStillNeedsApi = hasCitationRows.length + notFoundInCsv;

  console.log(`\n--- Citation Count Analysis ---`);
  console.log(`citation_count = 0 (safe → is_good_law = true): ${zeroCitationRows.length}`);
  console.log(`citation_count > 0 (needs API check):           ${hasCitationRows.length}`);
  console.log(`Not found in clusters CSV (needs API):           ${notFoundInCsv}`);

  if (zeroCitationRows.length > 0 && Object.keys(precStatusCounts).length > 0) {
    console.log(`\n  Precedential status of zero-citation rows:`);
    const sorted = Object.entries(precStatusCounts).sort((a, b) => b[1] - a[1]);
    for (const [status, count] of sorted) {
      console.log(`    ${status}: ${count}`);
    }
  }

  const coveragePct = clusterIdSet.size > 0
    ? Math.round(zeroCitationRows.length / clusterIdSet.size * 100)
    : 0;
  console.log(`\n→ Bulk fast path covers:    ${zeroCitationRows.length}/${clusterIdSet.size} (${coveragePct}%)`);
  console.log(`→ Still needs API loop:     ${totalStillNeedsApi} cases`);

  if (totalStillNeedsApi > 0) {
    const estHours = (Math.ceil(totalStillNeedsApi * 2.5 / 5000 * 10) / 10).toFixed(1);
    console.log(`  Estimated API time:       ~${estHours} hours at CL rate limit`);
  }

  if (dryRun) {
    console.log(`\nDry run complete. No SQL generated.`);
    return;
  }

  if (zeroCitationRows.length === 0) {
    console.log(`\nNo zero-citation rows to update.`);
    console.log(`All ${totalStillNeedsApi} remaining cases need classify-case-law.mjs API loop.`);
    return;
  }

  // Generate SQL
  const sqlStatements = [];
  sqlStatements.push("-- Bulk Is-Good-Law (Zero-Citation Fast Path), Generated " + new Date().toISOString());
  sqlStatements.push("-- Source: bulk-is-good-law.mjs");
  sqlStatements.push("-- Logic: citation_count = 0 in CL clusters CSV → no opinion can have overruled this case");
  sqlStatements.push(`-- Cases: ${zeroCitationRows.length}`);
  sqlStatements.push("");

  // Update by cluster_id (not row id) so that ALL statute_case_law rows
  // sharing the same cluster get verified in one statement (4:1 expansion typical)
  for (const { clusterId } of zeroCitationRows) {
    const clOpinionUrl = `https://www.courtlistener.com/opinion/${clusterId}/`;
    const clApiUrl = `https://www.courtlistener.com/api/rest/v4/clusters/${clusterId}/`;
    const newUrlsLiteral = escArray([clOpinionUrl, clApiUrl]);

    // PostgreSQL handles array dedup via array_cat, we just append both URLs
    // and let the application layer dedupe later if needed.
    let stmt = `UPDATE statute_case_law SET `;
    stmt += `is_good_law = true, `;
    stmt += `source_urls = array_cat(COALESCE(source_urls, '{}'::text[]), ${newUrlsLiteral}), `;
    stmt += `confidence_score = LEAST(1.0::numeric, COALESCE(confidence_score, 0::numeric) + 0.10::numeric), `;
    stmt += `verified_at = NOW()`;
    stmt += ` WHERE courtlistener_cluster_id = ${esc(clusterId)};`;
    sqlStatements.push(stmt);
  }

  const updateStmts = sqlStatements.filter(s => s.startsWith("UPDATE"));
  sqlStatements.push("");
  sqlStatements.push(`-- Total: ${updateStmts.length} statements`);

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, sqlStatements.join("\n"));

  console.log(`\nSQL file: ${outputPath}`);
  console.log(`UPDATE statements: ${updateStmts.length}`);

  if (!applyMode) {
    console.log(`\n========================================`);
    console.log(`  NO CHANGES APPLIED TO DATABASE`);
    console.log(`========================================`);
    console.log(`To apply: node scripts/bulk-is-good-law.mjs --apply`);
    if (totalStillNeedsApi > 0) {
      console.log(`\nAfter applying, run classify-case-law.mjs for the remaining ${totalStillNeedsApi} cases.`);
    }
    return;
  }

  // Batch apply
  loadToken();

  console.log(`\n--- Applying ${updateStmts.length} updates in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0;
  let batchErrors = 0;

  for (let i = 0; i < updateStmts.length; i += BATCH_SIZE) {
    const batch = updateStmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updateStmts.length / BATCH_SIZE);

    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} applied\n`);
    } catch (e) {
      batchErrors++;
      console.error(`  Batch ${batchNum}: ERROR, ${e.message}`);
      if (e.message.indexOf("429") >= 0) {
        console.log("  Rate limited, waiting 10s...");
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          batchErrors--;
        } catch (e2) {
          console.error(`  Batch ${batchNum} retry: FAILED`);
        }
      }
    }

    if (i + BATCH_SIZE < updateStmts.length) await sleep(1000);
  }

  console.log(`\n--- Results ---`);
  console.log(`Applied:                      ${applied}`);
  console.log(`Batch errors:                 ${batchErrors}`);

  if (totalStillNeedsApi > 0) {
    const estHours = (Math.ceil(totalStillNeedsApi * 2.5 / 5000 * 10) / 10).toFixed(1);
    console.log(`\nRemaining for API loop: ${totalStillNeedsApi} cases (~${estHours}h)`);
    console.log(`  node scripts/classify-case-law.mjs --limit 500`);
    console.log(`  (repeat until all ${totalStillNeedsApi} processed)`);
  } else {
    console.log(`\nAll is_good_law values are now set.`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
