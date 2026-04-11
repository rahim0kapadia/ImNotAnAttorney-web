/**
 * Brady/Giglio List → officer_external_intel
 *
 * Scrapes giglio-bradylist.com for officers with Brady/Giglio disclosures.
 * UPSERTs into officer_external_intel on (officer_name_normalized, state, agency).
 *
 * Usage:
 *   node scripts/ingest-brady-giglio.mjs              # Dry-run (generate SQL)
 *   node scripts/ingest-brady-giglio.mjs --apply      # Generate + apply
 *   node scripts/ingest-brady-giglio.mjs --limit 50   # Test with 50 records
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function esc(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

/** Normalize officer name: lowercase, keep only letters and spaces, collapse spaces. */
function normalize(name) {
  const lower = name.toLowerCase();
  const chars = [];
  for (const ch of lower) {
    const code = ch.charCodeAt(0);
    // keep a-z (97-122) and space (32)
    if ((code >= 97 && code <= 122) || code === 32) {
      chars.push(ch);
    }
  }
  // collapse multiple spaces into one, trim
  const parts = chars.join("").split(" ").filter(p => p.length > 0);
  return parts.join(" ");
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function main() {
  if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

  console.log("=== BRADY/GIGLIO LIST INGESTION ===\n");

  // Fetch the main page to discover state listing links
  const baseUrl = "https://giglio-bradylist.com";
  let mainHtml;
  try {
    mainHtml = await fetchPage(baseUrl);
  } catch (err) {
    console.error("Failed to fetch Brady/Giglio list:", err.message);
    console.log("\nFallback: Check if a cached HTML file exists at data/bulk-verify/external-intel/brady-giglio-cache.html");
    const cachePath = path.join(OUTPUT_DIR, "brady-giglio-cache.html");
    if (fs.existsSync(cachePath)) {
      mainHtml = fs.readFileSync(cachePath, "utf-8");
      console.log("Using cached HTML file.");
    } else {
      console.error("No cache available. Download the page manually and save to:", cachePath);
      process.exit(1);
    }
  }

  const $ = cheerio.load(mainHtml);
  const records = [];

  // Parse officer entries from tables — structure varies by site version.
  // Look for table rows with officer name, agency, state, reason.
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 3) {
      const name = $(cells[0]).text().trim();
      const agency = $(cells[1]).text().trim();
      const state = $(cells[2]).text().trim();
      const reason = cells.length >= 4 ? $(cells[3]).text().trim() : null;

      if (name && name.length > 2 && name !== "Name" && !name.includes("Officer")) {
        records.push({ name, agency, state: state.substring(0, 2).toUpperCase(), reason });
      }
    }
  });

  console.log(`Parsed ${records.length} officer records from Brady/Giglio list`);
  if (records.length === 0) {
    console.log("No records found — site structure may have changed.");
    console.log("Save the HTML to data/bulk-verify/external-intel/brady-giglio-cache.html for manual inspection.");
    // Don't exit with error — the site structure may need manual adaptation
    process.exit(0);
  }

  const sqlLines = [];
  let count = 0;

  for (const r of records.slice(0, limit)) {
    const normalized = normalize(r.name);
    sqlLines.push(
      `INSERT INTO officer_external_intel (officer_name, officer_name_normalized, state, agency, brady_status, brady_reason, source_urls, sources) ` +
      `VALUES (${esc(r.name)}, ${esc(normalized)}, ${esc(r.state)}, ${esc(r.agency)}, 'listed', ${esc(r.reason)}, ARRAY[${esc(baseUrl)}], ARRAY['Brady/Giglio List']) ` +
      `ON CONFLICT (officer_name_normalized, state, agency) DO UPDATE SET brady_status = 'listed', brady_reason = EXCLUDED.brady_reason, source_urls = EXCLUDED.source_urls, updated_at = now();`
    );
    count++;
  }

  // Update data_source_freshness
  sqlLines.push(
    `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${count}, is_stale = false WHERE source_key = 'brady_giglio_list';`
  );

  const outputFile = path.join(OUTPUT_DIR, "brady-giglio-upserts.sql");
  fs.writeFileSync(outputFile, sqlLines.join("\n") + "\n");
  console.log(`\nWrote ${count} UPSERT statements to ${outputFile}`);

  if (dryRun) {
    console.log("Dry run complete. Run with --apply to execute.");
    return;
  }

  // Apply via Management API
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || fs.readFileSync(path.join(PROJECT_ROOT, "../ImNotAnAttorney/.env.local"), "utf-8")
        .split("\n").find(l => l.startsWith("SUPABASE_ACCESS_TOKEN="))
        ?.split("=").slice(1).join("=");

  if (!token) { console.error("SUPABASE_ACCESS_TOKEN not found"); process.exit(1); }

  const BATCH_SIZE = 200;
  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: batch }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, err.slice(0, 200));
    } else {
      console.log(`Applied batch ${i / BATCH_SIZE + 1} (${Math.min(BATCH_SIZE, sqlLines.length - i)} statements)`);
    }
  }

  console.log(`\nDone. ${count} officers ingested from Brady/Giglio list.`);
}

main().catch(err => { console.error(err); process.exit(1); });
