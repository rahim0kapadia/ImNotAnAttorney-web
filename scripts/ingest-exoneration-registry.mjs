/**
 * National Registry of Exonerations → exoneration_patterns
 *
 * Reads CSV from data/bulk-verify/external-intel/exonerations.csv
 * (download from https://www.law.umich.edu/special/exoneration/)
 *
 * Aggregates per-row case data into offense-type summary statistics and
 * UPSERTs into exoneration_patterns. Computes per offense type:
 *   - total_exonerations (count of cases)
 *   - false_confession_pct (FC tag)
 *   - mistaken_id_pct (MWID tag)
 *   - perjury_pct (P/FA tag)
 *   - official_misconduct_pct (OM tag)
 *   - inadequate_defense_pct (ILD tag)
 *   - forensic_error_pct (F/MFE tag)
 *   - false_accusation_pct (FA tag — separate from P/FA when present)
 *   - avg_years_served (Exonerated year - Convicted year)
 *   - top_factor + top_factor_pct (highest-% contributing factor)
 *
 * Also updates data_source_freshness with source_key='national_exoneration_registry'.
 *
 * UPSERT key: (offense_type)
 *
 * Usage:
 *   node scripts/ingest-exoneration-registry.mjs              # dry-run (default)
 *   node scripts/ingest-exoneration-registry.mjs --apply      # generate + apply
 *
 * Data source: https://www.law.umich.edu/special/exoneration/
 *   1. Visit the URL above
 *   2. Click "The Registry" → "Download" (Excel or CSV)
 *   3. Export/save as CSV
 *   4. Save to: data/bulk-verify/external-intel/exonerations.csv
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";

const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const CSV_INPUT = path.join(OUTPUT_DIR, "exonerations.csv");
const SQL_OUTPUT = path.join(OUTPUT_DIR, "exoneration-upserts.sql");

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const dryRun = !applyMode;

const BATCH_SIZE = 200;
const SOURCE_URL = "https://www.law.umich.edu/special/exoneration/";
const SOURCE_KEY = "national_exoneration_registry";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Env loading ───────────────────────────────────────────────────────────────
// Load SUPABASE_ACCESS_TOKEN from parent repo .env.local (canonical location)
function loadEnv() {
  const envPath = path.join(PARENT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    const localPath = path.join(PROJECT_ROOT, ".env.local");
    if (!fs.existsSync(localPath)) return;
    const lines = fs.readFileSync(localPath, "utf8").split("\n");
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
    return;
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── Helpers — NO REGEX (hook enforced) ────────────────────────────────────────

/**
 * Normalize a string: lowercase, keep a-z, 0-9, and space only.
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

/** Return SQL literal for a nullable float, fixed to 4 decimal places. */
function fmtFloat(n) {
  if (n === null || n === undefined || isNaN(n)) return "NULL";
  return n.toFixed(4);
}

/** Return SQL literal for a nullable float, fixed to 2 decimal places. */
function fmtFloat2(n) {
  if (n === null || n === undefined || isNaN(n)) return "NULL";
  return n.toFixed(2);
}

/**
 * Find a column value by trying multiple possible header names.
 * NRE CSV schema varies by download year — this handles all known variants.
 * Returns the first non-empty match, or null.
 */
function col(row, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (key && row[key] !== undefined && row[key] !== null) {
      const trimmed = String(row[key]).trim();
      if (trimmed !== "" && trimmed !== "." && trimmed !== "N/A" && trimmed !== "-") {
        return trimmed;
      }
    }
  }
  return null;
}

/**
 * Determine whether a contributing factor tag is present in this row.
 *
 * The NRE uses two encoding conventions across its versions:
 *   - Column contains the tag name itself ("FC", "MWID", etc.) when present,
 *     empty string / missing when absent
 *   - Column contains "1" when present, "" / "0" / missing when absent
 *
 * Returns true if the factor is present for this case.
 */
function factorPresent(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  if (s === "" || s === "0") return false;
  return true;
}

/**
 * Parse a year value from a CSV cell. Returns integer year or null.
 * Handles values like "2003", "2003 ", "ca. 2003", "~2003".
 * Uses char-code loop — no regex.
 */
function parseYear(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "." || s === "N/A" || s === "?") return null;
  // Extract up to 4 consecutive digit characters to find the year
  const digits = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      digits.push(s[i]);
      if (digits.length === 4) break;
    } else if (digits.length > 0) {
      // Stop at first non-digit after we started collecting
      break;
    }
  }
  if (digits.length < 4) return null;
  const year = parseInt(digits.join(""), 10);
  // Sanity bounds: NRE goes back to ~1900, max is current year + 1
  if (year < 1900 || year > 2030) return null;
  return year;
}

// ── Column header detection ────────────────────────────────────────────────────

/**
 * Build a field map from CSV headers to canonical field names.
 * NRE column names have changed across years — this covers all known variants.
 * Uses substring scan — no regex.
 */
function lcContains(haystack, needle) {
  const h = String(haystack).toLowerCase();
  const n = String(needle).toLowerCase();
  if (n.length > h.length) return false;
  for (let i = 0; i <= h.length - n.length; i++) {
    let match = true;
    for (let j = 0; j < n.length; j++) {
      if (h.charCodeAt(i + j) !== n.charCodeAt(j)) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

function buildFieldMap(headers) {
  const map = {};

  for (const h of headers) {
    const lh = h.toLowerCase().trim();

    // Offense type
    if (!map.offense) {
      if (
        lh === "most serious crime" || lh === "worst crime display" ||
        lh === "crime" || lh === "offense" || lh === "most serious offense" ||
        lcContains(lh, "most serious crime") || lcContains(lh, "worst crime") ||
        (lcContains(lh, "crime") && !lcContains(lh, "state")) ||
        lcContains(lh, "offense type")
      ) {
        map.offense = h;
      }
    }

    // State
    if (!map.state) {
      if (lh === "state" || lh === "st") {
        map.state = h;
      }
    }

    // Convicted year
    if (!map.convicted) {
      if (
        lh === "convicted" || lh === "conviction year" || lh === "yr convicted" ||
        lh === "year convicted" || lcContains(lh, "convicted")
      ) {
        map.convicted = h;
      }
    }

    // Exonerated year
    if (!map.exonerated) {
      if (
        lh === "exonerated" || lh === "exoneration year" || lh === "yr exonerated" ||
        lh === "year exonerated" || lcContains(lh, "exonerated")
      ) {
        map.exonerated = h;
      }
    }

    // Contributing factor columns — exact tag names take priority
    // FC — False Confession
    if (!map.fc) {
      if (lh === "fc" || lh === "false confession" || lcContains(lh, "false confession")) {
        map.fc = h;
      }
    }

    // MWID — Mistaken Witness ID
    if (!map.mwid) {
      if (
        lh === "mwid" || lh === "mistaken witness id" ||
        lh === "mistaken id" || lcContains(lh, "mistaken witness") ||
        lcContains(lh, "mistaken id")
      ) {
        map.mwid = h;
      }
    }

    // P/FA — Perjury or False Accusation (combined column in many NRE versions)
    if (!map.pfa) {
      if (
        lh === "p/fa" || lh === "perjury/false accusation" ||
        lh === "perjury or false accusation" || lh === "perjury" ||
        (lcContains(lh, "perjury") && lcContains(lh, "false accusation")) ||
        (lcContains(lh, "p/fa"))
      ) {
        map.pfa = h;
      }
    }

    // FA — False Accusation (standalone column, present in some versions)
    if (!map.fa) {
      if (
        lh === "fa" ||
        (lh === "false accusation" && !lcContains(lh, "perjury"))
      ) {
        map.fa = h;
      }
    }

    // OM — Official Misconduct
    if (!map.om) {
      if (
        lh === "om" || lh === "official misconduct" ||
        lcContains(lh, "official misconduct")
      ) {
        map.om = h;
      }
    }

    // ILD — Inadequate Legal Defense
    if (!map.ild) {
      if (
        lh === "ild" || lh === "inadequate legal defense" ||
        lh === "inadequate defense" || lcContains(lh, "inadequate")
      ) {
        map.ild = h;
      }
    }

    // F/MFE — False or Misleading Forensic Evidence
    if (!map.fmfe) {
      if (
        lh === "f/mfe" || lh === "false or misleading forensic evidence" ||
        lh === "forensic evidence" || lh === "forensic error" ||
        lcContains(lh, "forensic evidence") || lcContains(lh, "misleading forensic") ||
        lh === "fmfe"
      ) {
        map.fmfe = h;
      }
    }
  }

  return map;
}

// ── Aggregation bucket per offense type ────────────────────────────────────────

function buildAgg() {
  return {
    total: 0,
    fc: 0,          // false confession count
    mwid: 0,        // mistaken witness ID count
    pfa: 0,         // perjury / false accusation (combined) count
    fa: 0,          // false accusation (standalone) count
    om: 0,          // official misconduct count
    ild: 0,         // inadequate legal defense count
    fmfe: 0,        // false/misleading forensic evidence count
    yearsServed: [], // array of (exonerated - convicted) values
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== NATIONAL REGISTRY OF EXONERATIONS INGESTION ===\n");

  if (!fs.existsSync(CSV_INPUT)) {
    console.log("Exoneration registry CSV not found at:");
    console.log("  " + CSV_INPUT);
    console.log("");
    console.log("To download:");
    console.log("  1. Visit https://www.law.umich.edu/special/exoneration/");
    console.log("  2. Click 'The Registry' then 'Download'");
    console.log("  3. Export as CSV (Excel: File > Save As > CSV)");
    console.log("  4. Save to: " + CSV_INPUT);
    console.log("");
    console.log("The NRE is maintained by University of Michigan Law School.");
    console.log("Each row represents one exonerated person, with contributing");
    console.log("factor flags (FC, MWID, P/FA, OM, ILD, F/MFE) and conviction/");
    console.log("exoneration years for years-served computation.");
    process.exit(0);
  }

  console.log("Reading NRE CSV from: " + CSV_INPUT);
  const raw = fs.readFileSync(CSV_INPUT, "utf-8");

  let rows;
  try {
    rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    console.error("Failed to parse CSV: " + err.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error("CSV is empty — nothing to process.");
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  console.log("Parsed " + rows.length + " case rows");
  console.log("Column headers: " + headers.join(", "));
  console.log("");

  const fieldMap = buildFieldMap(headers);
  console.log("Field mapping resolved:");
  for (const k of Object.keys(fieldMap)) {
    console.log("  " + k + " → " + fieldMap[k]);
  }
  console.log("");

  if (!fieldMap.offense) {
    console.error(
      "Could not identify offense/crime column in headers.\n" +
      "Expected one of: 'Most Serious Crime', 'Worst Crime Display', 'Crime', 'Offense'.\n" +
      "Detected headers: " + headers.join(", ")
    );
    process.exit(1);
  }

  // ── Step 1: Aggregate rows by offense_type ───────────────────────────────

  const aggMap = new Map();
  let parsed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Extract offense type
    const offenseRaw = col(row, [fieldMap.offense].filter(Boolean));
    if (!offenseRaw) { skipped++; continue; }
    const offenseType = normalize(offenseRaw) || offenseRaw.toLowerCase().trim();
    if (!offenseType) { skipped++; continue; }

    if (!aggMap.has(offenseType)) {
      aggMap.set(offenseType, { offenseType, agg: buildAgg() });
    }
    const entry = aggMap.get(offenseType);
    const agg = entry.agg;

    agg.total++;

    // Contributing factors
    const fcVal = col(row, [fieldMap.fc, "FC"].filter(Boolean));
    if (factorPresent(fcVal)) agg.fc++;

    const mwidVal = col(row, [fieldMap.mwid, "MWID"].filter(Boolean));
    if (factorPresent(mwidVal)) agg.mwid++;

    const pfaVal = col(row, [fieldMap.pfa, "P/FA"].filter(Boolean));
    if (factorPresent(pfaVal)) agg.pfa++;

    // Standalone FA column (only some NRE versions have this separate)
    if (fieldMap.fa) {
      const faVal = col(row, [fieldMap.fa, "FA"].filter(Boolean));
      if (factorPresent(faVal)) agg.fa++;
    }

    const omVal = col(row, [fieldMap.om, "OM"].filter(Boolean));
    if (factorPresent(omVal)) agg.om++;

    const ildVal = col(row, [fieldMap.ild, "ILD"].filter(Boolean));
    if (factorPresent(ildVal)) agg.ild++;

    const fmfeVal = col(row, [fieldMap.fmfe, "F/MFE"].filter(Boolean));
    if (factorPresent(fmfeVal)) agg.fmfe++;

    // Years served: exoneration year - conviction year
    const convYear = parseYear(col(row, [fieldMap.convicted, "Convicted", "convicted"].filter(Boolean)));
    const exonYear = parseYear(col(row, [fieldMap.exonerated, "Exonerated", "exonerated"].filter(Boolean)));
    if (convYear !== null && exonYear !== null && exonYear >= convYear) {
      agg.yearsServed.push(exonYear - convYear);
    }

    parsed++;
  }

  console.log("Aggregated into " + aggMap.size + " offense-type groups");
  console.log("Processed: " + parsed + ", Skipped: " + skipped);
  console.log("");

  // ── Step 2: Generate UPSERT SQL ──────────────────────────────────────────

  const sqlLines = [];
  let generated = 0;

  for (const [, entry] of aggMap) {
    const { offenseType, agg } = entry;
    const n = agg.total;
    if (n === 0) continue;

    // Compute percentages (0.0-1.0 range)
    const fcPct = n > 0 ? agg.fc / n : null;
    const mwidPct = n > 0 ? agg.mwid / n : null;
    const pfaPct = n > 0 ? agg.pfa / n : null;
    const omPct = n > 0 ? agg.om / n : null;
    const ildPct = n > 0 ? agg.ild / n : null;
    const fmfePct = n > 0 ? agg.fmfe / n : null;

    // false_accusation_pct: prefer standalone FA if we have data, else null
    const faPct = (fieldMap.fa && n > 0) ? agg.fa / n : null;

    // avg_years_served
    let avgYearsServed = null;
    if (agg.yearsServed.length > 0) {
      let sum = 0;
      for (let j = 0; j < agg.yearsServed.length; j++) sum += agg.yearsServed[j];
      avgYearsServed = sum / agg.yearsServed.length;
    }

    // top_factor + top_factor_pct: find the contributing factor with the highest %
    const factors = [
      { name: "false_confession", pct: fcPct },
      { name: "mistaken_id", pct: mwidPct },
      { name: "perjury_false_accusation", pct: pfaPct },
      { name: "official_misconduct", pct: omPct },
      { name: "inadequate_defense", pct: ildPct },
      { name: "forensic_error", pct: fmfePct },
    ];
    if (faPct !== null) {
      factors.push({ name: "false_accusation", pct: faPct });
    }

    let topFactor = null;
    let topFactorPct = null;
    for (let j = 0; j < factors.length; j++) {
      if (factors[j].pct !== null && (topFactorPct === null || factors[j].pct > topFactorPct)) {
        topFactor = factors[j].name;
        topFactorPct = factors[j].pct;
      }
    }

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
      "  " + fmtFloat(fcPct) + ",\n" +
      "  " + fmtFloat(mwidPct) + ",\n" +
      "  " + fmtFloat(pfaPct) + ",\n" +
      "  " + fmtFloat(omPct) + ",\n" +
      "  " + fmtFloat(ildPct) + ",\n" +
      "  " + fmtFloat(fmfePct) + ",\n" +
      "  " + fmtFloat(faPct) + ",\n" +
      "  " + fmtFloat2(avgYearsServed) + ",\n" +
      "  " + esc(topFactor) + ",\n" +
      "  " + fmtFloat(topFactorPct) + ",\n" +
      "  ARRAY[" + esc(SOURCE_URL) + "],\n" +
      "  now()\n" +
      ")\n" +
      "ON CONFLICT (offense_type) DO UPDATE SET\n" +
      "  total_exonerations = EXCLUDED.total_exonerations,\n" +
      "  false_confession_pct = EXCLUDED.false_confession_pct,\n" +
      "  mistaken_id_pct = EXCLUDED.mistaken_id_pct,\n" +
      "  perjury_pct = EXCLUDED.perjury_pct,\n" +
      "  official_misconduct_pct = EXCLUDED.official_misconduct_pct,\n" +
      "  inadequate_defense_pct = EXCLUDED.inadequate_defense_pct,\n" +
      "  forensic_error_pct = EXCLUDED.forensic_error_pct,\n" +
      "  false_accusation_pct = EXCLUDED.false_accusation_pct,\n" +
      "  avg_years_served = EXCLUDED.avg_years_served,\n" +
      "  top_factor = EXCLUDED.top_factor,\n" +
      "  top_factor_pct = EXCLUDED.top_factor_pct,\n" +
      "  source_urls = EXCLUDED.source_urls,\n" +
      "  data_as_of = now(),\n" +
      "  updated_at = now();";

    sqlLines.push(sql);
    generated++;
  }

  console.log("Generated " + generated + " UPSERT statements");

  // ── Step 3: Write SQL file ────────────────────────────────────────────────

  fs.writeFileSync(SQL_OUTPUT, sqlLines.join("\n\n") + "\n");
  console.log("Wrote SQL to: " + SQL_OUTPUT);

  if (dryRun) {
    console.log("\nDry-run complete. Run with --apply to execute against the database.");
    return;
  }

  // ── Step 4: Apply via Supabase Management API ─────────────────────────────

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "SUPABASE_ACCESS_TOKEN not found.\n" +
      "Check: " + path.join(PARENT_ROOT, ".env.local")
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
      console.error("Batch " + batchNum + "/" + totalBatches + " failed: " + errText.slice(0, 300));
      errors++;
    } else {
      console.log("Applied batch " + batchNum + "/" + totalBatches + " (" + batchSize + " statements)");
      applied += batchSize;
    }
  }

  // Update data_source_freshness
  const freshnessSQL =
    "UPDATE data_source_freshness " +
    "SET last_ingested_at = now(), last_row_count = " + applied + ", is_stale = false " +
    "WHERE source_key = " + esc(SOURCE_KEY) + ";";

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
    console.log("Note: data_source_freshness update failed (row may not exist yet): " + body.slice(0, 200));
  }

  console.log("\nDone. Applied: " + applied + ", Errors: " + errors);
  if (errors > 0) process.exit(1);
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
