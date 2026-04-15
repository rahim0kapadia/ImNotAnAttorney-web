/**
 * National Registry of Exonerations — HTML cache → exoneration_patterns
 *
 * Parses the cached HTML table from the NRE "Explore Exonerations" page.
 * Unlike the CSV variant (ingest-exoneration-registry.mjs), the HTML table
 * does NOT contain contributing-factor columns (FC, MWID, P/FA, OM, ILD,
 * F/MFE). Those columns are set to NULL. When the full CSV is later
 * downloaded, the CSV script will overwrite these rows with factor data.
 *
 * Cache file: data/bulk-verify/external-intel/exoneration-registry-cache.html
 * Source:     https://www.law.umich.edu/special/exoneration/ (now at
 *             https://exonerationregistry.org/cases)
 *
 * HTML table columns (13):
 *   0: Name, 1: State, 2: County, 3: Convicted (year),
 *   4: Exonerated (year), 5: Crime, 6: Sentence, 7: Years lost,
 *   8: Age (hidden), 9: Race (hidden), 10: Sex (hidden),
 *   11: Date of Release, 12: Posting Date (hidden)
 *
 * Aggregates by Crime → offense_type with:
 *   total_exonerations, avg_years_served, source_urls, data_as_of.
 *   All factor columns → NULL (not available in HTML).
 *
 * Also updates data_source_freshness (source_key='national_exoneration_registry').
 *
 * Usage:
 *   node scripts/ingest-exoneration-html.mjs              # dry-run (default)
 *   node scripts/ingest-exoneration-html.mjs --apply      # generate + apply
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const HTML_INPUT = path.join(OUTPUT_DIR, "exoneration-registry-cache.html");
const SQL_OUTPUT = path.join(OUTPUT_DIR, "exoneration-upserts.sql");

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const dryRun = !applyMode;

const BATCH_SIZE = 200;
const SOURCE_URL = "https://www.law.umich.edu/special/exoneration/";
const SOURCE_KEY = "national_exoneration_registry";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnv() {
  const candidates = [
    path.join(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"),
    path.join(PROJECT_ROOT, ".env.local"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
    break; // use first found
  }
}
loadEnv();

// ── Helpers — NO REGEX (hook enforced) ────────────────────────────────────────

/**
 * Normalize a string: lowercase, keep a-z, 0-9, space, and slash only.
 * Char-code loop — no regex on file contents.
 */
function normalize(name) {
  if (!name) return "";
  const out = [];
  const s = String(name);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 97 && c <= 122) { out.push(s[i]); }                              // a-z
    else if (c >= 65 && c <= 90) { out.push(String.fromCharCode(c + 32)); }   // A-Z → a-z
    else if (c >= 48 && c <= 57) { out.push(s[i]); }                          // 0-9
    else if (c === 32) { out.push(" "); }                                       // space
    else if (c === 47) { out.push("/"); }                                       // slash (e.g. "Drug Possession or Sale")
  }
  // Collapse consecutive spaces and trim
  const result = [];
  let prevSpace = false;
  for (const ch of out) {
    if (ch === " ") {
      if (!prevSpace) result.push(ch);
      prevSpace = true;
    } else {
      result.push(ch);
      prevSpace = false;
    }
  }
  let start = 0;
  let end = result.length - 1;
  while (start <= end && result[start] === " ") start++;
  while (end >= start && result[end] === " ") end--;
  return result.slice(start, end + 1).join("");
}

/** SQL escape — single-quote doubling, no regex. */
function esc(str) {
  if (str === null || str === undefined) return "NULL";
  const s = String(str);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") out.push("''");
    else out.push(s[i]);
  }
  return "'" + out.join("") + "'";
}

/** Return SQL literal for a nullable float, fixed to 2 decimal places. */
function fmtFloat2(n) {
  if (n === null || n === undefined || isNaN(n)) return "NULL";
  return n.toFixed(2);
}

/**
 * Extract text content from a cheerio element — strips whitespace.
 * Uses cheerio .text() which is char-safe.
 */
function cellText($, td) {
  const raw = $(td).text();
  // Trim: char-code loop
  const chars = [];
  let started = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    // Skip leading whitespace (space, tab, newline, carriage return)
    if (!started && (c === 32 || c === 9 || c === 10 || c === 13)) continue;
    started = true;
    chars.push(raw[i]);
  }
  // Trim trailing
  let end = chars.length - 1;
  while (end >= 0) {
    const c = chars[end].charCodeAt(0);
    if (c === 32 || c === 9 || c === 10 || c === 13) { end--; } else break;
  }
  return chars.slice(0, end + 1).join("");
}

/**
 * Parse "Years lost" value. Can be integer or decimal (e.g. "14.2", "0").
 * Returns float or null. Char-code loop — no regex.
 */
function parseYearsLost(raw) {
  if (!raw) return null;
  const s = String(raw);
  // Collect digits and at most one decimal point
  const digits = [];
  let hasDot = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      digits.push(s[i]);
    } else if (c === 46 && !hasDot) {
      digits.push(".");
      hasDot = true;
    }
  }
  if (digits.length === 0) return null;
  const val = parseFloat(digits.join(""));
  if (isNaN(val)) return null;
  return val;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== NRE HTML CACHE → exoneration_patterns ===\n");

  if (!fs.existsSync(HTML_INPUT)) {
    console.log("HTML cache not found at:");
    console.log("  " + HTML_INPUT);
    console.log("\nSave the NRE 'Explore Exonerations' page as HTML to that path.");
    process.exit(0);
  }

  console.log("Reading HTML cache from: " + HTML_INPUT);
  const html = fs.readFileSync(HTML_INPUT, "utf8");
  console.log("File size: " + html.length + " bytes");

  const $ = cheerio.load(html);

  // ── Step 1: Parse header names from <thead> ─────────────────────────────

  const headers = [];
  $("thead th").each(function () {
    // Header text is in <a> if sortable, or direct text for non-sortable.
    // Tooltip <span class="tooltip-wrapper"> contains "Info" text we must skip.
    const $clone = $(this).clone();
    $clone.find(".tooltip-wrapper").remove();
    headers.push(cellText($, $clone));
  });
  console.log("Headers (" + headers.length + "): " + headers.join(" | "));

  // Identify column indices by header text
  // We need: Crime (index 5), Years lost (index 7) based on inspection,
  // but let's find them dynamically for robustness.
  let crimeIdx = -1;
  let yearsLostIdx = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    if (h === "crime") crimeIdx = i;
    if (h === "years lost") yearsLostIdx = i;
  }

  if (crimeIdx < 0) {
    console.error("Could not find 'Crime' column in headers.");
    console.error("Found: " + headers.join(", "));
    process.exit(1);
  }
  if (yearsLostIdx < 0) {
    console.error("Could not find 'Years lost' column in headers.");
    console.error("Found: " + headers.join(", "));
    process.exit(1);
  }

  console.log("Crime column index: " + crimeIdx);
  console.log("Years lost column index: " + yearsLostIdx);

  // ── Step 2: Parse all rows from <tbody> ─────────────────────────────────

  const rows = [];
  $("tbody tr").each(function () {
    const cells = [];
    $(this).find("td").each(function () {
      cells.push(cellText($, this));
    });
    if (cells.length > 0) {
      rows.push(cells);
    }
  });

  console.log("Parsed " + rows.length + " case rows\n");

  if (rows.length === 0) {
    console.error("No rows found in HTML table.");
    process.exit(1);
  }

  // ── Step 3: Aggregate by Crime (offense_type) ──────────────────────────

  // Map: normalized offense type → { displayName, count, yearsLostValues[] }
  const aggMap = new Map();
  let parsed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];

    const crimeRaw = cells[crimeIdx];
    if (!crimeRaw) { skipped++; continue; }

    const offenseType = normalize(crimeRaw);
    if (!offenseType) { skipped++; continue; }

    if (!aggMap.has(offenseType)) {
      aggMap.set(offenseType, { displayName: crimeRaw, count: 0, yearsLostValues: [] });
    }

    const entry = aggMap.get(offenseType);
    entry.count++;

    // Parse years lost
    const yearsRaw = cells[yearsLostIdx];
    const years = parseYearsLost(yearsRaw);
    if (years !== null) {
      entry.yearsLostValues.push(years);
    }

    parsed++;
  }

  console.log("Aggregated into " + aggMap.size + " offense-type groups");
  console.log("Processed: " + parsed + ", Skipped: " + skipped + "\n");

  // ── Step 4: Generate UPSERT SQL ────────────────────────────────────────

  const sqlLines = [];
  let generated = 0;

  // Print summary table
  console.log("Offense Type".padEnd(40) + "Count".padStart(6) + "  Avg Years");
  console.log("-".repeat(60));

  for (const [offenseType, entry] of aggMap) {
    const n = entry.count;
    if (n === 0) continue;

    // avg_years_served
    let avgYearsServed = null;
    if (entry.yearsLostValues.length > 0) {
      let sum = 0;
      for (let j = 0; j < entry.yearsLostValues.length; j++) sum += entry.yearsLostValues[j];
      avgYearsServed = sum / entry.yearsLostValues.length;
    }

    const display = offenseType.length > 38 ? offenseType.slice(0, 38) + ".." : offenseType;
    const avgStr = avgYearsServed !== null ? avgYearsServed.toFixed(1) : "N/A";
    console.log(display.padEnd(40) + String(n).padStart(6) + "  " + avgStr);

    const sql =
      "INSERT INTO exoneration_patterns\n" +
      "  (offense_type,\n" +
      "   total_exonerations,\n" +
      "   false_confession_pct,\n" +
      "   mistaken_id_pct,\n" +
      "   perjury_pct,\n" +
      "   official_misconduct_pct,\n" +
      "   inadequate_defense_pct,\n" +
      "   forensic_error_pct,\n" +
      "   false_accusation_pct,\n" +
      "   avg_years_served,\n" +
      "   top_factor,\n" +
      "   top_factor_pct,\n" +
      "   source_urls,\n" +
      "   data_as_of)\n" +
      "VALUES (\n" +
      "  " + esc(offenseType) + ",\n" +
      "  " + n + ",\n" +
      "  NULL,\n" +   // false_confession_pct — not in HTML
      "  NULL,\n" +   // mistaken_id_pct — not in HTML
      "  NULL,\n" +   // perjury_pct — not in HTML
      "  NULL,\n" +   // official_misconduct_pct — not in HTML
      "  NULL,\n" +   // inadequate_defense_pct — not in HTML
      "  NULL,\n" +   // forensic_error_pct — not in HTML
      "  NULL,\n" +   // false_accusation_pct — not in HTML
      "  " + fmtFloat2(avgYearsServed) + ",\n" +
      "  NULL,\n" +   // top_factor — not in HTML
      "  NULL,\n" +   // top_factor_pct — not in HTML
      "  ARRAY[" + esc(SOURCE_URL) + "],\n" +
      "  now()\n" +
      ")\n" +
      "ON CONFLICT (offense_type) DO UPDATE SET\n" +
      "  total_exonerations = EXCLUDED.total_exonerations,\n" +
      "  avg_years_served = EXCLUDED.avg_years_served,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  data_as_of = now();";

    sqlLines.push(sql);
    generated++;
  }

  console.log("\nGenerated " + generated + " UPSERT statements");

  // ── Step 5: Write SQL file ─────────────────────────────────────────────

  const header =
    "-- NRE HTML cache → exoneration_patterns\n" +
    "-- Generated: " + new Date().toISOString() + "\n" +
    "-- Source: " + SOURCE_URL + "\n" +
    "-- Rows parsed: " + rows.length + "\n" +
    "-- Offense types: " + generated + "\n" +
    "-- NOTE: Contributing factor columns are NULL (not available in HTML).\n" +
    "--       Use ingest-exoneration-registry.mjs with the full CSV to populate them.\n\n";

  fs.writeFileSync(SQL_OUTPUT, header + sqlLines.join("\n\n") + "\n");
  console.log("Wrote SQL to: " + SQL_OUTPUT);

  if (dryRun) {
    console.log("\nDry-run complete. Run with --apply to execute against the database.");
    return;
  }

  // ── Step 6: Apply via Supabase Management API ──────────────────────────

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "SUPABASE_ACCESS_TOKEN not found in .env.local.\n" +
      "Set it in: " + path.join(PROJECT_ROOT, ".env.local")
    );
    process.exit(1);
  }

  const apiBase = "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query";

  console.log("\nApplying " + generated + " UPSERTs via Management API in batches of " + BATCH_SIZE + "...");

  let applied = 0;
  let errors = 0;

  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n\n");
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sqlLines.length / BATCH_SIZE);
    const batchSize = Math.min(BATCH_SIZE, sqlLines.length - i);

    const res = await fetch(apiBase, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: batch }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Batch " + batchNum + "/" + totalBatches + " failed: " + errText.slice(0, 500));
      errors++;
    } else {
      const body = await res.json();
      console.log("Applied batch " + batchNum + "/" + totalBatches + " (" + batchSize + " statements)");
      // Check for query-level errors in the response
      if (Array.isArray(body)) {
        for (let j = 0; j < body.length; j++) {
          if (body[j] && body[j].error) {
            console.error("  Statement error: " + JSON.stringify(body[j].error).slice(0, 200));
            errors++;
          }
        }
      }
      applied += batchSize;
    }
  }

  // ── Step 7: Update data_source_freshness ───────────────────────────────

  const freshnessSQL =
    "INSERT INTO data_source_freshness (source_key, source_name, source_url, last_ingested_at, last_row_count, is_stale)\n" +
    "VALUES (" + esc(SOURCE_KEY) + ", " + esc("National Registry of Exonerations") + ", " + esc(SOURCE_URL) + ", now(), " + applied + ", false)\n" +
    "ON CONFLICT (source_key) DO UPDATE SET\n" +
    "  last_ingested_at = now(),\n" +
    "  last_row_count = " + applied + ",\n" +
    "  is_stale = false;";

  const freshRes = await fetch(apiBase, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: freshnessSQL }),
  });

  if (freshRes.ok) {
    console.log("data_source_freshness updated (source_key=" + SOURCE_KEY + ", rows=" + applied + ").");
  } else {
    const body = await freshRes.text();
    console.log("Note: data_source_freshness update: " + body.slice(0, 300));
  }

  console.log("\nDone. Applied: " + applied + ", Errors: " + errors);
  if (errors > 0) process.exit(1);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
