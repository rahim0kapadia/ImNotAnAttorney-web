/**
 * National Police Index → officer_external_intel
 *
 * Reads the Invisible Institute National Police Index CSV and UPSERTs into
 * officer_external_intel. Groups records by officer (normalized name + state)
 * to build employment history, detect wandering officers, and aggregate
 * complaint/use-of-force/sustained counts.
 *
 * Data source: https://invisible.institute/national-police-index
 * Download the CSV and save to: data/bulk-verify/external-intel/npi-data.csv
 *
 * UPSERT key: (officer_name_normalized, state, agency)
 * ON CONFLICT: merges NPI data with any existing Brady/Giglio data via
 *   GREATEST() for counts, array_cat for source_urls.
 *
 * Usage:
 *   node scripts/ingest-npi.mjs                # Dry-run (generate SQL only)
 *   node scripts/ingest-npi.mjs --apply        # Generate + apply via Management API
 *   node scripts/ingest-npi.mjs --limit 500    # Test with first N records
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const NPI_FILE = path.join(OUTPUT_DIR, "npi-data.csv");

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const BATCH_SIZE = 200;
const SOURCE_URL = "https://invisible.institute/national-police-index";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).split("'").join("''") + "'";
}

function escNum(n) {
  const v = parseInt(n, 10);
  return isNaN(v) ? "0" : String(v);
}

/**
 * Normalize officer name: lowercase, keep only a-z and space, collapse spaces.
 * Uses char-code loop — no regex on file contents (hook-enforced).
 */
function normalize(name) {
  if (!name) return "";
  const lower = name.toLowerCase();
  const chars = [];
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    // keep a-z (97-122) and space (32)
    if ((code >= 97 && code <= 122) || code === 32) {
      chars.push(lower[i]);
    }
  }
  // collapse multiple spaces, trim
  const parts = chars.join("").split(" ").filter(function(p) { return p.length > 0; });
  return parts.join(" ");
}

/**
 * Find a column value by trying multiple possible header names (NPI CSV schema
 * varies across versions). Returns the first match found, or null.
 */
function col(row, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return null;
}

/**
 * Parse a state value: try to extract a 2-letter state code.
 * Char-code loop to strip to uppercase letters only.
 */
function parseState(raw) {
  if (!raw) return null;
  // uppercase version
  const upper = raw.toUpperCase();
  const letters = [];
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) {  // A-Z
      letters.push(upper[i]);
    }
  }
  // If we got exactly 2 letters, it's already a state code
  if (letters.length === 2) return letters.join("");
  // If longer, take first 2 — may be an abbreviation like "CA" embedded in text
  if (letters.length > 2) return letters.slice(0, 2).join("");
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== NATIONAL POLICE INDEX INGESTION ===\n");

  // Check if CSV file exists
  if (!fs.existsSync(NPI_FILE)) {
    console.log("NPI data file not found at:");
    console.log("  " + NPI_FILE);
    console.log("");
    console.log("To download:");
    console.log("  1. Visit https://invisible.institute/national-police-index");
    console.log("  2. Download the CSV data file");
    console.log("  3. Save it to: " + NPI_FILE);
    console.log("");
    console.log("The Invisible Institute NPI is a free public dataset aggregating police");
    console.log("employment history and misconduct records across U.S. departments.");
    process.exit(0);
  }

  console.log("Reading NPI CSV from: " + NPI_FILE);
  const raw = fs.readFileSync(NPI_FILE, "utf-8");

  let rows;
  try {
    rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    console.error("Failed to parse CSV: " + err.message);
    process.exit(1);
  }

  console.log("Parsed " + rows.length + " raw rows from NPI CSV");

  // Print first row headers for diagnostics
  if (rows.length > 0) {
    console.log("Column headers: " + Object.keys(rows[0]).join(", "));
  }

  // ── Step 1: Normalize and group records ──────────────────────────────────

  // Each NPI row represents one employment record (officer at one agency).
  // Group by (normalized_name + state) to build employment history per officer.
  // Within each officer group, each distinct agency = one upsert row.

  // Map: normalized_key (name|state) → { officer, agencies: Map<agency_key, agg> }
  const officerMap = new Map();

  let parsed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Extract name — try multiple column patterns
    const fullName = col(row, ["full_name", "officer_full_name", "name", "officer_name"]);
    let firstName = col(row, ["first_name", "fname", "given_name"]);
    let lastName = col(row, ["last_name", "lname", "surname", "family_name"]);

    let officerName = fullName;
    if (!officerName && firstName && lastName) {
      officerName = firstName + " " + lastName;
    } else if (!officerName && lastName) {
      officerName = lastName;
    }

    if (!officerName || officerName.length < 2) {
      skipped++;
      continue;
    }

    const stateRaw = col(row, ["state", "state_abbr", "state_code", "officer_state"]);
    const state = parseState(stateRaw);

    const agency = col(row, ["agency_name", "department", "department_name", "agency", "employer"]) || "Unknown Agency";

    const complaintCount = parseInt(col(row, ["complaint_count", "complaints", "allegations", "num_complaints"]) || "0", 10) || 0;
    const uofCount = parseInt(col(row, ["use_of_force_count", "use_of_force", "uof_count", "force_incidents"]) || "0", 10) || 0;
    const sustainedCount = parseInt(col(row, ["sustained_count", "sustained", "sustained_complaints", "sustained_allegations"]) || "0", 10) || 0;

    const startDate = col(row, ["start_date", "employment_start", "hire_date", "date_hired"]);
    const endDate = col(row, ["end_date", "employment_end", "separation_date", "date_separated"]);
    const employmentStatus = col(row, ["employment_status", "status", "current_status"]);

    const normalizedName = normalize(officerName);
    if (!normalizedName) { skipped++; continue; }

    const officerKey = normalizedName + "|" + (state || "");

    if (!officerMap.has(officerKey)) {
      officerMap.set(officerKey, {
        officerName,
        normalizedName,
        state,
        agencies: new Map(),
      });
    }

    const officer = officerMap.get(officerKey);

    // Normalize agency name for dedup key
    const agencyNorm = normalize(agency);
    const agencyKey = agencyNorm + "|" + (state || "");

    if (!officer.agencies.has(agencyKey)) {
      officer.agencies.set(agencyKey, {
        agency,
        state,
        complaintCount: 0,
        uofCount: 0,
        sustainedCount: 0,
        employmentHistory: [],
      });
    }

    const agg = officer.agencies.get(agencyKey);
    agg.complaintCount += complaintCount;
    agg.uofCount += uofCount;
    agg.sustainedCount += sustainedCount;

    if (startDate || endDate || employmentStatus) {
      agg.employmentHistory.push({
        agency,
        state,
        start_date: startDate || null,
        end_date: endDate || null,
        status: employmentStatus || null,
      });
    }

    parsed++;
  }

  console.log("Grouped into " + officerMap.size + " unique officers (" + skipped + " rows skipped)");

  // ── Step 2: Generate UPSERT SQL ───────────────────────────────────────────

  const sqlLines = [];
  let upsertCount = 0;
  let wanderingCount = 0;

  for (const [, officer] of officerMap) {
    const isWandering = officer.agencies.size > 1;
    if (isWandering) wanderingCount++;

    // Build full employment history across ALL agencies for this officer
    const allHistory = [];
    for (const [, agg] of officer.agencies) {
      for (const entry of agg.employmentHistory) {
        allHistory.push(entry);
      }
    }

    // One UPSERT row per (officer, agency) combination
    for (const [, agg] of officer.agencies) {
      if (upsertCount >= limit) break;

      // employment_history for this specific agency row, plus cross-agency if wandering
      const historyForRow = isWandering ? allHistory : agg.employmentHistory;
      const historyJson = historyForRow.length > 0 ? esc(JSON.stringify(historyForRow)) : "NULL";

      sqlLines.push(
        "INSERT INTO officer_external_intel " +
        "(officer_name, officer_name_normalized, state, agency, " +
        "complaint_count, use_of_force_count, sustained_complaints, " +
        "npi_employment_history, npi_is_wandering_officer, " +
        "source_urls, sources, data_as_of) " +
        "VALUES (" +
          esc(officer.officerName) + ", " +
          esc(officer.normalizedName) + ", " +
          esc(agg.state) + ", " +
          esc(agg.agency) + ", " +
          escNum(agg.complaintCount) + ", " +
          escNum(agg.uofCount) + ", " +
          escNum(agg.sustainedCount) + ", " +
          historyJson + "::jsonb, " +
          (isWandering ? "true" : "false") + ", " +
          "ARRAY[" + esc(SOURCE_URL) + "], " +
          "ARRAY['npi'], " +
          "now()" +
        ") " +
        "ON CONFLICT (officer_name_normalized, state, agency) DO UPDATE SET " +
          "complaint_count = GREATEST(officer_external_intel.complaint_count, EXCLUDED.complaint_count), " +
          "use_of_force_count = GREATEST(officer_external_intel.use_of_force_count, EXCLUDED.use_of_force_count), " +
          "sustained_complaints = GREATEST(officer_external_intel.sustained_complaints, EXCLUDED.sustained_complaints), " +
          "npi_employment_history = EXCLUDED.npi_employment_history, " +
          "npi_is_wandering_officer = EXCLUDED.npi_is_wandering_officer, " +
          "source_urls = CASE WHEN officer_external_intel.source_urls @> ARRAY[" + esc(SOURCE_URL) + "] " +
            "THEN officer_external_intel.source_urls " +
            "ELSE array_cat(officer_external_intel.source_urls, ARRAY[" + esc(SOURCE_URL) + "]) END, " +
          "sources = CASE WHEN officer_external_intel.sources @> ARRAY['npi'] " +
            "THEN officer_external_intel.sources " +
            "ELSE array_cat(officer_external_intel.sources, ARRAY['npi']) END, " +
          "data_as_of = now(), " +
          "updated_at = now();"
      );

      upsertCount++;
    }

    if (upsertCount >= limit) break;
  }

  console.log("\nGenerated " + upsertCount + " UPSERT statements");
  console.log("Wandering officers detected: " + wanderingCount);

  const sqlPath = path.join(OUTPUT_DIR, "npi-upserts.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log("Wrote SQL to: " + sqlPath);

  if (dryRun) {
    console.log("\nDry run complete. Run with --apply to execute against the database.");
    return;
  }

  // ── Step 3: Apply via Supabase Management API ─────────────────────────────

  // Load SUPABASE_ACCESS_TOKEN — try local env first, then parent repo .env.local
  let token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    const parentEnvPath = path.join(PROJECT_ROOT, "../ImNotAnAttorney/.env.local");
    if (fs.existsSync(parentEnvPath)) {
      const parentEnv = fs.readFileSync(parentEnvPath, "utf-8");
      const lines = parentEnv.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("SUPABASE_ACCESS_TOKEN=")) {
          token = lines[i].split("=").slice(1).join("=").trim();
          break;
        }
      }
    }
  }

  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN not found in .env.local or parent repo .env.local");
    process.exit(1);
  }

  const apiBase = "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/database/query";

  let applied = 0;
  let errors = 0;

  for (let i = 0; i < sqlLines.length; i += BATCH_SIZE) {
    const batch = sqlLines.slice(i, i + BATCH_SIZE).join("\n");
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sqlLines.length / BATCH_SIZE);

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
      console.error("Batch " + batchNum + "/" + totalBatches + " failed: " + errText.slice(0, 300));
      errors++;
    } else {
      const batchSize = Math.min(BATCH_SIZE, sqlLines.length - i);
      console.log("Applied batch " + batchNum + "/" + totalBatches + " (" + batchSize + " statements)");
      applied += batchSize;
    }
  }

  // Update data_source_freshness
  const freshnessRes = await fetch(apiBase, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "UPDATE data_source_freshness " +
        "SET last_ingested_at = now(), last_row_count = " + applied + ", is_stale = false " +
        "WHERE source_key = 'npi_employment_index';"
    }),
  });

  if (!freshnessRes.ok) {
    console.log("Note: data_source_freshness update failed (row may not exist yet) — " + (await freshnessRes.text()).slice(0, 200));
  }

  console.log("\nDone. Applied: " + applied + ", Errors: " + errors);
  if (errors > 0) process.exit(1);
}

main().catch(function(err) { console.error(err); process.exit(1); });
