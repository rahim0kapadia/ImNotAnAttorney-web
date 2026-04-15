/**
 * National Police Index (gz) -> officer_external_intel
 *
 * Streams per-state NPI processed CSV.gz files one at a time (never concurrent
 * -- OOM risk on Windows), groups by person_nbr+state, builds employment
 * history arrays, detects wandering officers, upserts via Supabase JS client.
 *
 * Input:  data/external-intel/npi/us-post-data/db/data/output/{az,ca,ga}/XX-processed.csv.gz
 * Target: officer_external_intel (officer_name, officer_name_normalized, state,
 *         agency, npi_employment_history, npi_is_wandering_officer, source_urls, sources)
 *
 * UNIQUE constraint: (officer_name_normalized, state, agency)
 * Strategy: group by person_nbr within each state file, determine PRIMARY agency
 * (most recent employment), upsert one row per officer with full history.
 *
 * Usage:
 *   node scripts/ingest-npi.mjs             # All state files
 *   node scripts/ingest-npi.mjs --dry-run   # Parse only, no DB writes
 *   node scripts/ingest-npi.mjs --limit 500 # Cap officers per state
 *   node scripts/ingest-npi.mjs --state az  # Single state only
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const NPI_BASE = path.join(
  PROJECT_ROOT, "data", "external-intel", "npi",
  "us-post-data", "db", "data", "output"
);

const SOURCE_URL = "https://invisible.institute/national-police-index";
const UPSERT_BATCH = 100;
const LOG_EVERY = 1000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const stateIdx = args.indexOf("--state");
const onlyState = stateIdx >= 0 ? args[stateIdx + 1].toLowerCase() : null;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize name: lowercase, strip non-alpha except spaces, collapse spaces.
 * Char-code loop -- no regex on file contents (hook-enforced).
 */
function normalizeName(name) {
  if (!name) return "";
  const lower = name.toLowerCase();
  const chars = [];
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    if ((code >= 97 && code <= 122) || code === 32) {
      chars.push(lower[i]);
    }
  }
  return chars.join("").split(" ").filter(function (p) { return p.length > 0; }).join(" ");
}

/**
 * Build a proper display name from first/last/middle/full_name.
 * NPI full_name is often "last, first" format -- normalize to "First Last".
 */
function buildDisplayName(row) {
  const first = (row.first_name || "").trim();
  const last = (row.last_name || "").trim();
  const full = (row.full_name || "").trim();

  if (first && last) return first + " " + last;

  // full_name is often "last, first" -- flip it
  if (full && full.includes(",")) {
    const parts = full.split(",").map(function (s) { return s.trim(); });
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase() +
        " " +
        parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
  }

  if (full) return full;
  if (last) return last;
  return "";
}

/**
 * Extract a 2-letter state code. Char-code loop, no regex.
 */
function parseState(raw) {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const letters = [];
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) letters.push(upper[i]);
  }
  if (letters.length >= 2) return letters.slice(0, 2).join("");
  return null;
}

/**
 * Parse a date string into YYYY-MM-DD or null. Rejects obvious bad dates.
 */
function parseDate(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0000-00-00" || trimmed === "None") return null;
  // Already ISO-ish? Return as-is if it looks like a date
  if (trimmed.length >= 10 && trimmed[4] === "-") return trimmed.substring(0, 10);
  return trimmed || null;
}

/**
 * Discover all *-processed.csv.gz files under the NPI output directory.
 * Returns array of { filePath, stateCode }.
 */
function discoverFiles() {
  const files = [];

  if (!fs.existsSync(NPI_BASE)) {
    console.error("NPI data directory not found: " + NPI_BASE);
    process.exit(1);
  }

  const stateDirs = fs.readdirSync(NPI_BASE, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory(); });

  for (const dir of stateDirs) {
    const stateCode = dir.name.toLowerCase();
    if (onlyState && stateCode !== onlyState) continue;

    const stateDir = path.join(NPI_BASE, dir.name);
    const entries = fs.readdirSync(stateDir);

    for (const entry of entries) {
      if (entry.endsWith("-processed.csv.gz")) {
        files.push({
          filePath: path.join(stateDir, entry),
          stateCode: stateCode.toUpperCase(),
          fileName: entry,
        });
      }
    }
  }

  return files;
}

/**
 * Stream a single .csv.gz file through csv-parse with defensive options.
 * Returns a Map keyed by person_nbr -> { displayName, normalizedName, state, records[] }
 *
 * ONE STREAMER AT A TIME. Never call this concurrently.
 */
async function streamFile(filePath, stateCode) {
  const officers = new Map();
  let rowCount = 0;
  let errorCount = 0;

  const fileStream = fs.createReadStream(filePath);
  const gunzip = zlib.createGunzip();
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  fileStream.pipe(gunzip).pipe(parser);

  try {
    for await (const row of parser) {
      rowCount++;

      const personNbr = (row.person_nbr || "").trim();
      if (!personNbr) continue;

      const displayName = buildDisplayName(row);
      if (!displayName || displayName.length < 2) continue;

      const state = parseState(row.state) || stateCode;
      const agency = (row.agency_name || "").trim() || "Unknown Agency";
      const rank = (row.rank || "").trim() || null;
      const startDate = parseDate(row.start_date);
      const endDate = parseDate(row.end_date);

      // employment_status varies by state: AZ/GA have it, CA has separation_reason
      const employmentStatus = (row.employment_status || "").trim() || null;
      const separationReason = (row.separation_reason || "").trim() || null;
      const status = employmentStatus || separationReason || null;

      const key = personNbr + "|" + state;

      if (!officers.has(key)) {
        officers.set(key, {
          displayName: displayName,
          normalizedName: normalizeName(displayName),
          state: state,
          records: [],
        });
      }

      const officer = officers.get(key);

      // Keep the best display name (prefer one with first+last over reversed full_name)
      if (row.first_name && row.last_name && officer.displayName.includes(",")) {
        officer.displayName = displayName;
        officer.normalizedName = normalizeName(displayName);
      }

      officer.records.push({
        agency: agency,
        rank: rank,
        start_date: startDate,
        end_date: endDate,
        employment_status: status,
      });

      if (rowCount % 50000 === 0) {
        console.log("  ... streamed " + rowCount + " rows, " + officers.size + " officers so far");
      }
    }
  } catch (err) {
    // Defensive: collect partial data on parser crash (legal data pattern)
    errorCount++;
    console.warn("  Parser error after " + rowCount + " rows: " + err.message);
    console.warn("  Continuing with " + officers.size + " officers collected before crash");
  }

  console.log("  Streamed " + rowCount + " rows -> " + officers.size + " officers" +
    (errorCount > 0 ? " (" + errorCount + " parse errors)" : ""));

  return officers;
}

/**
 * Process an officer Map into upsert-ready rows.
 * - Builds npi_employment_history sorted by start_date desc
 * - Detects wandering officers (2+ distinct agencies, at least one non-Lapsed separation)
 * - Picks most recent agency as primary
 *
 * Returns array of row objects ready for supabase upsert.
 */
function buildUpsertRows(officers) {
  const rows = [];

  for (const [, officer] of officers) {
    if (!officer.normalizedName) continue;

    // Sort records by start_date desc (most recent first), nulls last
    const sorted = officer.records.slice().sort(function (a, b) {
      const da = a.start_date || "";
      const db = b.start_date || "";
      if (da > db) return -1;
      if (da < db) return 1;
      return 0;
    });

    // Build employment history array
    const history = sorted.map(function (r) {
      return {
        agency: r.agency,
        rank: r.rank,
        start_date: r.start_date,
        end_date: r.end_date,
        employment_status: r.employment_status,
      };
    });

    // Detect distinct agencies
    const agencySet = new Set();
    for (const r of sorted) {
      agencySet.add(normalizeName(r.agency));
    }

    // Wandering officer: 2+ distinct agencies AND at least one non-Lapsed status
    // (a separation that isn't just a lapsed certification)
    let isWandering = false;
    if (agencySet.size >= 2) {
      let hasNonLapsed = false;
      for (const r of sorted) {
        const st = (r.employment_status || "").toLowerCase();
        if (st && st !== "lapsed") {
          hasNonLapsed = true;
          break;
        }
      }
      isWandering = hasNonLapsed;
    }

    // Primary agency: most recent record's agency
    const primaryAgency = sorted[0].agency;

    rows.push({
      officer_name: officer.displayName,
      officer_name_normalized: officer.normalizedName,
      state: officer.state,
      agency: primaryAgency,
      npi_employment_history: history,
      npi_is_wandering_officer: isWandering,
      source_urls: [SOURCE_URL],
      sources: ["NPI"],
    });
  }

  return rows;
}

/**
 * Upsert rows into officer_external_intel in batches.
 * ON CONFLICT merges NPI fields, preserves existing Brady/Giglio data.
 */
async function upsertBatch(rows) {
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);

    const { error } = await supabase
      .from("officer_external_intel")
      .upsert(batch, {
        onConflict: "officer_name_normalized,state,agency",
        ignoreDuplicates: false,
      });

    if (error) {
      errors++;
      console.error("  Batch " + Math.floor(i / UPSERT_BATCH + 1) +
        " error: " + error.message);

      // If batch fails, try individual rows to maximize data saved
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from("officer_external_intel")
          .upsert([row], {
            onConflict: "officer_name_normalized,state,agency",
            ignoreDuplicates: false,
          });
        if (rowErr) {
          errors++;
        } else {
          upserted++;
        }
      }
    } else {
      upserted += batch.length;
    }

    if ((i + UPSERT_BATCH) % (LOG_EVERY) < UPSERT_BATCH) {
      console.log("  ... upserted " + upserted + " / " + rows.length);
    }
  }

  return { upserted, errors };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== NPI INGESTION (gz streaming) ===\n");

  const files = discoverFiles();
  if (files.length === 0) {
    console.error("No *-processed.csv.gz files found under " + NPI_BASE);
    if (onlyState) console.error("(filtered to state: " + onlyState + ")");
    process.exit(1);
  }

  console.log("Found " + files.length + " file(s):");
  for (const f of files) {
    console.log("  " + f.stateCode + ": " + f.fileName);
  }
  console.log("");

  if (dryRun) console.log("[DRY RUN -- no DB writes]\n");

  let totalOfficers = 0;
  let totalUpserted = 0;
  let totalErrors = 0;
  let totalWandering = 0;

  // Process ONE file at a time (never concurrent -- OOM risk)
  for (const file of files) {
    console.log("--- " + file.stateCode + ": " + file.fileName + " ---");

    const officers = await streamFile(file.filePath, file.stateCode);
    const rows = buildUpsertRows(officers);

    // Apply limit if set
    const capped = rows.length > limit ? rows.slice(0, limit) : rows;

    const wandering = capped.filter(function (r) { return r.npi_is_wandering_officer; }).length;
    totalWandering += wandering;

    console.log("  Officers: " + capped.length +
      (rows.length > limit ? " (capped from " + rows.length + ")" : "") +
      " | Wandering: " + wandering);

    totalOfficers += capped.length;

    if (!dryRun && capped.length > 0) {
      const result = await upsertBatch(capped);
      totalUpserted += result.upserted;
      totalErrors += result.errors;
      console.log("  Upserted: " + result.upserted + " | Errors: " + result.errors);
    }

    console.log("");
  }

  // Update data_source_freshness
  if (!dryRun && totalUpserted > 0) {
    const { error: freshnessErr } = await supabase
      .from("data_source_freshness")
      .upsert([{
        source_key: "npi",
        source_name: "National Police Index",
        source_url: SOURCE_URL,
        last_ingested_at: new Date().toISOString(),
        last_row_count: totalUpserted,
        is_stale: false,
      }], { onConflict: "source_key" });

    if (freshnessErr) {
      console.warn("data_source_freshness update failed: " + freshnessErr.message);
    } else {
      console.log("Updated data_source_freshness (source_key='npi', rows=" + totalUpserted + ")");
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log("Files processed:   " + files.length);
  console.log("Officers parsed:   " + totalOfficers);
  console.log("Wandering officers: " + totalWandering);
  if (!dryRun) {
    console.log("Upserted:          " + totalUpserted);
    console.log("Errors:            " + totalErrors);
  } else {
    console.log("[DRY RUN -- no DB writes]");
  }

  if (totalErrors > 0) process.exit(1);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
