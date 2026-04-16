/**
 * Bulk Verify via CourtListener, Mark CL-tracked cases with source URLs + validation
 *
 * For cases that have courtlistener_cluster_id but weren't verified via CAP:
 *   1. Constructs CourtListener source URLs from cluster IDs (no download needed)
 *   2. Sets validation_level = VALID_MODERATE (CL API confirmed existence)
 *   3. Adds CL opinion URL to source_urls
 *
 * NOTE: The CL bulk citations CSV maps opinion-to-opinion (not cluster-to-cluster),
 * so negative treatment checking still requires classify-case-law.mjs API calls.
 * This script handles everything that CAN be done locally for CL-tracked cases.
 *
 * After running this, run classify-case-law.mjs for is_good_law + party_side.
 *
 * Usage:
 *   node scripts/bulk-verify-courtlistener.mjs                # Generate SQL only
 *   node scripts/bulk-verify-courtlistener.mjs --apply        # Generate + apply to Supabase
 *   node scripts/bulk-verify-courtlistener.mjs --dry-run      # Stats only
 *   node scripts/bulk-verify-courtlistener.mjs --limit 100    # Process first N rows
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 100;

const DEFAULT_DUMP = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-verification-updates.sql");

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
  const items = arr.map(s => `"${String(s).split('"').join('""').split("'").join("''")}"` );
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK VERIFY CL-TRACKED CASES ===\n");

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Dump not found: ${inputPath}\nRun bulk-dump-cases.mjs first.`);
    process.exit(1);
  }

  const allRows = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  // Filter: has CL cluster ID, not already VALID_STRONG, not CAP-verified
  const clRows = allRows.filter(r => {
    if (!r.courtlistener_cluster_id) return false;
    if (r.validation_level === "VALID_STRONG") return false;
    const urls = parsePostgresArray(r.source_urls);
    if (urls.some(u => u && u.indexOf("static.case.law") >= 0)) return false;
    return true;
  }).slice(0, limit);

  console.log(`Total dump rows:         ${allRows.length}`);
  console.log(`CL-only rows to verify:  ${clRows.length}`);

  if (clRows.length === 0) {
    console.log("\nNo CL-only rows to verify.");
    return;
  }

  // Categorize by current state
  let alreadyHasClUrl = 0;
  let needsClUrl = 0;
  let alreadyGoodLaw = 0;
  let needsGoodLawCheck = 0;

  for (const row of clRows) {
    const urls = parsePostgresArray(row.source_urls);
    const cid = row.courtlistener_cluster_id;
    const hasClUrl = urls.some(u => u && u.indexOf("courtlistener.com/opinion/" + cid) >= 0);
    if (hasClUrl) alreadyHasClUrl++;
    else needsClUrl++;

    if (row.is_good_law === true) alreadyGoodLaw++;
    else needsGoodLawCheck++;
  }

  console.log(`\n--- Current State ---`);
  console.log(`Already has CL URL:      ${alreadyHasClUrl}`);
  console.log(`Needs CL URL added:      ${needsClUrl}`);
  console.log(`Already good law:        ${alreadyGoodLaw}`);
  console.log(`Needs is_good_law check: ${needsGoodLawCheck} (via classify-case-law.mjs)`);

  if (dryRun) {
    console.log(`\nDry run complete.`);
    console.log(`\nWould generate ${clRows.length} UPDATE statements.`);
    console.log(`After applying, run classify-case-law.mjs for is_good_law + party_side.`);
    return;
  }

  // Generate SQL: set validation_level, add CL URL, bump confidence
  const sqlStatements = [];
  sqlStatements.push("-- Bulk CL Verification, Generated " + new Date().toISOString());
  sqlStatements.push("-- Source: bulk-verify-courtlistener.mjs");
  sqlStatements.push(`-- Cases: ${clRows.length}`);
  sqlStatements.push("");

  for (const row of clRows) {
    const cid = row.courtlistener_cluster_id;
    const existingUrls = parsePostgresArray(row.source_urls);
    const clUrl = `https://www.courtlistener.com/opinion/${cid}/`;
    const hasClUrl = existingUrls.some(u => u && u.indexOf("courtlistener.com/opinion/" + cid) >= 0);
    const newUrls = hasClUrl ? existingUrls : [...existingUrls, clUrl];

    const existingConf = row.confidence_score ? parseFloat(row.confidence_score) : 0;
    const safeConf = isNaN(existingConf) ? 0 : existingConf;
    const newConf = Math.min(1.0, safeConf + 0.15).toFixed(2);

    let stmt = `UPDATE statute_case_law SET `;
    stmt += `validation_level = 'VALID_MODERATE', `;
    stmt += `source_urls = ${escArray(newUrls)}, `;
    stmt += `confidence_score = ${newConf}, `;
    stmt += `verified_at = NOW()`;
    stmt += ` WHERE id = ${esc(row.id)};`;
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
    console.log(`To apply: node scripts/bulk-verify-courtlistener.mjs --apply`);
    return;
  }

  // Batch apply
  console.log(`\n--- Applying ${updateStmts.length} updates in batches of ${BATCH_SIZE} ---\n`);

  loadToken();

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
  console.log(`Applied:                 ${applied}`);
  console.log(`Batch errors:            ${batchErrors}`);
  console.log(`\nNext step, negative treatment check + classification:`);
  console.log(`  node scripts/classify-case-law.mjs --limit 500`);
  console.log(`  (repeat until all ${needsGoodLawCheck} cases processed)`);
  console.log(`  Estimated: ~${Math.ceil(needsGoodLawCheck * 2.5 / 5000)} hours at CL rate limit`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
