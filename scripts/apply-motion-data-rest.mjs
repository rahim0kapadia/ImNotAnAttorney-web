/**
 * Apply cached motion extraction data via Supabase PostgREST (service role key).
 * Reads from data/bulk-verify/motion-extraction-results.json (saved by
 * bulk-extract-motion-legal-issues.mjs).
 *
 * Bypasses the Management API which requires a personal access token.
 * Uses additive merge: reads current arrays, merges in JS, writes back.
 *
 * Usage:
 *   node scripts/apply-motion-data-rest.mjs
 *   node scripts/apply-motion-data-rest.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CACHE_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "motion-extraction-results.json");

const dryRun = process.argv.includes("--dry-run");

// Load credentials from .env.local
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  const vars = {};
  for (const line of content.split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const eqIdx = line.indexOf("=");
    vars[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
  }
  return vars;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function mergeArrays(existing, newItems) {
  const set = new Set(existing || []);
  for (const item of newItems) set.add(item);
  return Array.from(set);
}

async function supabaseGet(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabasePatch(table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log("=== APPLY MOTION DATA VIA POSTGREST (service role key) ===\n");

  if (!fs.existsSync(CACHE_FILE)) {
    console.error(`Cache file not found: ${CACHE_FILE}`);
    console.error("Run bulk-extract-motion-legal-issues.mjs first (with or without --apply).");
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  const clusterIds = Object.keys(cache);
  console.log(`Loaded ${clusterIds.length} clusters from cache`);

  if (dryRun) {
    console.log("Dry run, would apply to these clusters. Exiting.");
    return;
  }

  let applied = 0, skipped = 0, errors = 0;
  const startTime = Date.now();
  const BATCH = 50;

  for (let i = 0; i < clusterIds.length; i += BATCH) {
    const batch = clusterIds.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(clusterIds.length / BATCH);

    try {
      // Fetch current values for this batch
      const inList = batch.join(",");
      const rows = await supabaseGet(
        "statute_case_law",
        `courtlistener_cluster_id=in.(${inList})&select=id,courtlistener_cluster_id,motion_types,legal_issues,supporting_rulings,source_urls`
      );

      // Group by cluster_id
      const byCluster = new Map();
      for (const row of rows) {
        const cid = String(row.courtlistener_cluster_id);
        if (!byCluster.has(cid)) byCluster.set(cid, []);
        byCluster.get(cid).push(row);
      }

      // Update each cluster's rows
      for (const clusterId of batch) {
        const extraction = cache[clusterId];
        const dbRows = byCluster.get(clusterId);
        if (!dbRows || dbRows.length === 0) { skipped++; continue; }

        const verificationUrl = `https://www.courtlistener.com/opinion/${clusterId}/`;
        const sample = dbRows[0];

        const merged = {};
        if (extraction.motion_types.length > 0) {
          merged.motion_types = mergeArrays(sample.motion_types, extraction.motion_types);
        }
        if (extraction.legal_issues.length > 0) {
          merged.legal_issues = mergeArrays(sample.legal_issues, extraction.legal_issues);
        }
        if (extraction.supporting_rulings.length > 0) {
          merged.supporting_rulings = mergeArrays(sample.supporting_rulings, extraction.supporting_rulings);
        }
        merged.source_urls = mergeArrays(sample.source_urls, [verificationUrl]);

        await supabasePatch("statute_case_law", `courtlistener_cluster_id=eq.${clusterId}`, merged);
        applied++;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = elapsed > 0 ? (applied / elapsed).toFixed(1) : "0";
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${applied} applied, ${skipped} skipped (${rate}/sec)\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum} error: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) await sleep(10000);
    }

    if (i + BATCH < clusterIds.length) await sleep(200);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n--- Results ---`);
  console.log(`Applied: ${applied}  Skipped: ${skipped}  Errors: ${errors}  Time: ${elapsed}s`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
