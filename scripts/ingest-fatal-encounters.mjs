/**
 * Fatal Encounters → officer_external_intel (agency-level)
 *
 * Parses the Fatal Encounters CSV (~31K records of deaths during police
 * encounters) and groups them by agency + state. Stores agency-level
 * incident counts and summaries into officer_external_intel using a
 * sentinel officer_name_normalized of `__agency__:{normalized_agency}`
 * so records don't collide with real officer rows.
 *
 * Data source: https://fatalencounters.org/
 * Download CSV and save to: data/external-intel/fatal-encounters/fatal-encounters.csv
 *
 * The render function queries `__agency__:` prefix entries when an
 * officer's agency is known, providing agency-level context (total
 * fatal encounters, force type breakdown, recent incident summaries).
 *
 * UPSERT key: (officer_name_normalized, state, agency)
 * ON CONFLICT: replaces counts and summaries from Fatal Encounters,
 *   preserves any other source data via array_cat dedup.
 *
 * Usage:
 *   node scripts/ingest-fatal-encounters.mjs                # Dry-run (generate SQL only)
 *   node scripts/ingest-fatal-encounters.mjs --apply        # Generate + apply via Management API
 *   node scripts/ingest-fatal-encounters.mjs --limit 500    # Test with first N agency upserts
 */
import fs from "fs";
import { createReadStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "external-intel", "fatal-encounters");
const CSV_FILE = path.join(OUTPUT_DIR, "fatal-encounters.csv");

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const BATCH_SIZE = 100;
const SOURCE_URL = "https://fatalencounters.org/";
const SOURCE_KEY = "fatal_encounters";
const CUTOFF_DATE = new Date("2013-01-01");
const MAX_SUMMARIES = 20;

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
 * Normalize a string: lowercase, keep only a-z, 0-9, and space, collapse spaces.
 * Uses char-code loop, no regex on file contents (hook-enforced).
 */
function normalize(str) {
  if (!str) return "";
  const lower = str.toLowerCase();
  const chars = [];
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    // keep a-z (97-122), 0-9 (48-57), space (32)
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 32) {
      chars.push(lower[i]);
    }
  }
  const parts = chars.join("").split(" ").filter(function(p) { return p.length > 0; });
  return parts.join(" ");
}

/**
 * Parse a date string in "month/day/year" format.
 * Returns a Date object or null if unparseable.
 */
function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  // Expect M/D/YYYY or MM/DD/YYYY
  const slashIdx1 = trimmed.indexOf("/");
  if (slashIdx1 < 0) return null;
  const slashIdx2 = trimmed.indexOf("/", slashIdx1 + 1);
  if (slashIdx2 < 0) return null;

  const month = parseInt(trimmed.substring(0, slashIdx1), 10);
  const day = parseInt(trimmed.substring(slashIdx1 + 1, slashIdx2), 10);
  const year = parseInt(trimmed.substring(slashIdx2 + 1), 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;

  return new Date(year, month - 1, day);
}

/**
 * Parse the 2-letter state code. Fatal Encounters uses full state names sometimes.
 * Handles both 2-letter codes and known full names.
 */
const STATE_MAP = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
  "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
  "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
  "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
};

function parseState(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Check if already 2 uppercase letters
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    const c0 = upper.charCodeAt(0);
    const c1 = upper.charCodeAt(1);
    if (c0 >= 65 && c0 <= 90 && c1 >= 65 && c1 <= 90) return upper;
  }
  // Try full name lookup
  const lower = trimmed.toLowerCase();
  if (STATE_MAP[lower]) return STATE_MAP[lower];
  return null;
}

/**
 * Truncate a string to maxLen chars without breaking mid-word.
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  const cut = str.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.substring(0, lastSpace) + "...";
  return cut + "...";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== FATAL ENCOUNTERS INGESTION (Agency-Level) ===\n");

  if (!fs.existsSync(CSV_FILE)) {
    console.log("Fatal Encounters CSV not found at:");
    console.log("  " + CSV_FILE);
    console.log("");
    console.log("To download:");
    console.log("  1. Visit https://fatalencounters.org/");
    console.log("  2. Download the full spreadsheet / CSV");
    console.log("  3. Save to: " + CSV_FILE);
    process.exit(0);
  }

  // ── Step 1: Stream CSV and collect records ─────────────────────────────────
  // ONE streamer at a time (concurrent CSV streamers = OOM on Windows)

  console.log("Streaming CSV from: " + CSV_FILE);

  const records = [];
  let rawCount = 0;
  let skippedNoAgency = 0;
  let skippedNoState = 0;
  let skippedPreCutoff = 0;
  let skippedNoDate = 0;

  const parser = createReadStream(CSV_FILE).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    })
  );

  try {
    for await (const row of parser) {
      rawCount++;

      // Extract agency
      const agency = (row["Agency or agencies involved"] || "").trim();
      if (!agency || agency.length < 2) {
        skippedNoAgency++;
        continue;
      }

      // Extract and validate state
      const state = parseState(row["State"]);
      if (!state) {
        skippedNoState++;
        continue;
      }

      // Extract and filter by date
      const dateStr = row["Date of injury resulting in death (month/day/year)"] || "";
      const date = parseDate(dateStr);
      if (!date) {
        skippedNoDate++;
        continue;
      }
      if (date < CUTOFF_DATE) {
        skippedPreCutoff++;
        continue;
      }

      // Extract remaining fields
      const city = (row["Location of death (city)"] || "").trim();
      const county = (row["Location of death (county)"] || "").trim();
      const forceType = (row["Highest level of force"] || "").trim();
      const disposition = (row["Dispositions/Exclusions INTERNAL USE, NOT FOR ANALYSIS"] || "").trim();
      const description = (row["Brief description"] || "").trim();
      const uniqueId = (row["Unique ID"] || "").trim();

      records.push({
        agency,
        state,
        date,
        dateStr: dateStr.trim(),
        city,
        county,
        forceType,
        disposition,
        description,
        uniqueId,
      });
    }
  } catch (err) {
    // Defensive: collect partial data on crash (CL bulk data rule)
    console.error("CSV streaming error (continuing with " + records.length + " records collected): " + err.message);
  }

  console.log("Raw rows processed: " + rawCount);
  console.log("Records after filtering (since 2013): " + records.length);
  console.log("Skipped, no agency: " + skippedNoAgency);
  console.log("Skipped, no state: " + skippedNoState);
  console.log("Skipped, no date: " + skippedNoDate);
  console.log("Skipped, pre-2013: " + skippedPreCutoff);

  if (records.length === 0) {
    console.log("\nNo records to process. Exiting.");
    process.exit(0);
  }

  // ── Step 2: Group by (agency_normalized + state) ───────────────────────────

  // Map: agencyKey → { agency, state, incidents: [] }
  const agencyMap = new Map();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const agencyNorm = normalize(r.agency);
    const key = agencyNorm + "|" + r.state;

    if (!agencyMap.has(key)) {
      agencyMap.set(key, {
        agency: r.agency,
        agencyNorm,
        state: r.state,
        incidents: [],
      });
    }

    agencyMap.get(key).incidents.push({
      date: r.date,
      dateStr: r.dateStr,
      city: r.city,
      county: r.county,
      forceType: r.forceType,
      disposition: r.disposition,
      description: r.description,
      uniqueId: r.uniqueId,
    });
  }

  console.log("\nGrouped into " + agencyMap.size + " unique agencies");

  // ── Step 3: Compute per-agency stats and generate SQL ──────────────────────

  const sqlLines = [];
  let upsertCount = 0;

  // Force type tallies across all agencies (for diagnostics)
  const globalForceTypes = new Map();

  for (const [, agg] of agencyMap) {
    if (upsertCount >= limit) break;

    const totalIncidents = agg.incidents.length;

    // Sort incidents newest-first for summary extraction
    agg.incidents.sort(function(a, b) { return b.date.getTime() - a.date.getTime(); });

    // Force type breakdown
    const forceBreakdown = new Map();
    for (let i = 0; i < agg.incidents.length; i++) {
      const ft = agg.incidents[i].forceType || "Unknown";
      forceBreakdown.set(ft, (forceBreakdown.get(ft) || 0) + 1);
      globalForceTypes.set(ft, (globalForceTypes.get(ft) || 0) + 1);
    }

    // Disposition breakdown
    const dispBreakdown = new Map();
    for (let i = 0; i < agg.incidents.length; i++) {
      const d = agg.incidents[i].disposition || "Unknown";
      dispBreakdown.set(d, (dispBreakdown.get(d) || 0) + 1);
    }

    // Build the most recent MAX_SUMMARIES incident summaries
    const summaries = [];
    const summaryCount = Math.min(agg.incidents.length, MAX_SUMMARIES);
    for (let i = 0; i < summaryCount; i++) {
      const inc = agg.incidents[i];
      const summary = {
        date: inc.dateStr,
        city: inc.city || null,
        force_type: inc.forceType || null,
        disposition: inc.disposition || null,
      };
      // Include truncated description if available
      if (inc.description) {
        summary.description = truncate(inc.description, 300);
      }
      summaries.push(summary);
    }

    // Build force_breakdown object
    const forceObj = {};
    for (const [ft, count] of forceBreakdown) {
      forceObj[ft] = count;
    }

    // Build disposition_breakdown object
    const dispObj = {};
    for (const [d, count] of dispBreakdown) {
      dispObj[d] = count;
    }

    // npi_employment_history repurposed as agency incident metadata jsonb
    const metadata = {
      total_incidents: totalIncidents,
      force_type_breakdown: forceObj,
      disposition_breakdown: dispObj,
      recent_incidents: summaries,
      date_range: {
        earliest: agg.incidents[agg.incidents.length - 1].dateStr,
        latest: agg.incidents[0].dateStr,
      },
    };

    const officerNameNormalized = "__agency__:" + agg.agencyNorm;
    const officerName = "[AGENCY] " + agg.agency;

    sqlLines.push(
      "INSERT INTO officer_external_intel " +
      "(officer_name, officer_name_normalized, state, agency, " +
      "use_of_force_count, " +
      "npi_employment_history, " +
      "source_urls, sources, data_as_of) " +
      "VALUES (" +
        esc(officerName) + ", " +
        esc(officerNameNormalized) + ", " +
        esc(agg.state) + ", " +
        esc(agg.agency) + ", " +
        escNum(totalIncidents) + ", " +
        esc(JSON.stringify(metadata)) + "::jsonb, " +
        "ARRAY[" + esc(SOURCE_URL) + "], " +
        "ARRAY['fatal_encounters'], " +
        "now()" +
      ") " +
      "ON CONFLICT (officer_name_normalized, state, agency) DO UPDATE SET " +
        "use_of_force_count = EXCLUDED.use_of_force_count, " +
        "npi_employment_history = EXCLUDED.npi_employment_history, " +
        "source_urls = CASE WHEN officer_external_intel.source_urls @> ARRAY[" + esc(SOURCE_URL) + "] " +
          "THEN officer_external_intel.source_urls " +
          "ELSE array_cat(officer_external_intel.source_urls, ARRAY[" + esc(SOURCE_URL) + "]) END, " +
        "sources = CASE WHEN officer_external_intel.sources @> ARRAY['fatal_encounters'] " +
          "THEN officer_external_intel.sources " +
          "ELSE array_cat(officer_external_intel.sources, ARRAY['fatal_encounters']) END, " +
        "data_as_of = now(), " +
        "updated_at = now();"
    );

    upsertCount++;
  }

  console.log("Generated " + upsertCount + " UPSERT statements");

  // Print top 10 force types
  const sortedForce = Array.from(globalForceTypes.entries())
    .sort(function(a, b) { return b[1] - a[1]; });
  console.log("\nForce type distribution (top 10):");
  for (let i = 0; i < Math.min(10, sortedForce.length); i++) {
    console.log("  " + sortedForce[i][0] + ": " + sortedForce[i][1]);
  }

  // Print top 10 agencies by incident count
  const sortedAgencies = Array.from(agencyMap.values())
    .sort(function(a, b) { return b.incidents.length - a.incidents.length; });
  console.log("\nTop 10 agencies by incident count:");
  for (let i = 0; i < Math.min(10, sortedAgencies.length); i++) {
    const a = sortedAgencies[i];
    console.log("  " + a.agency + " (" + a.state + "): " + a.incidents.length);
  }

  // Write SQL file
  const sqlPath = path.join(OUTPUT_DIR, "fatal-encounters-upserts.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log("\nWrote SQL to: " + sqlPath);

  if (dryRun) {
    console.log("\nDry run complete. Run with --apply to execute against the database.");
    return;
  }

  // ── Step 4: Apply via Supabase Management API ─────────────────────────────

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

  // ── Step 5: Update data_source_freshness ──────────────────────────────────

  const freshnessSQL =
    "INSERT INTO data_source_freshness (source_key, source_name, source_url, last_ingested_at, last_row_count, is_stale) " +
    "VALUES (" + esc(SOURCE_KEY) + ", " + esc("Fatal Encounters") + ", " + esc(SOURCE_URL) + ", now(), " + applied + ", false) " +
    "ON CONFLICT (source_key) DO UPDATE SET " +
      "last_ingested_at = now(), " +
      "last_row_count = " + applied + ", " +
      "is_stale = false, " +
      "updated_at = now();";

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

main().catch(function(err) { console.error(err); process.exit(1); });
