/**
 * Parse CourtListener courts.csv to build court_id → jurisdiction mapping
 *
 * Decompresses courts-2026-03-31.csv.bz2, streams all records, builds a mapping
 * of court_id (e.g., "ca1", "fladist", "nyed") to two-letter state code or "federal".
 *
 * Output: court-jurisdiction-map.json — {"court_id": "STATE_CODE", ...}
 *
 * Usage:
 *   node scripts/parse-cl-courts.mjs              # Build map
 *   node scripts/parse-cl-courts.mjs --dry-run   # Show stats only
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const BZ2_PATH = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "courts-2026-03-31.csv.bz2");
const CSV_TEMP = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "courts-decoded.csv");
const MAP_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "court-jurisdiction-map.json");

const dryRun = process.argv.includes("--dry-run");

// ── Decompression ─────────────────────────────────────────────────────────────
console.log("Decompressing courts CSV from bz2...");

try {
  // Use PowerShell + bzcat (from Git Bash) to decompress
  const cmd = `powershell -Command "& 'C:\\Program Files\\Git\\usr\\bin\\bzcat.exe' '${BZ2_PATH}'" > "${CSV_TEMP}"`;
  execSync(cmd, { stdio: "inherit" });
  console.log("✓ Decompressed to " + CSV_TEMP);
} catch (err) {
  console.error("ERROR: Decompression failed");
  console.error(err.message);
  process.exit(1);
}

// ── Validation ────────────────────────────────────────────────────────────────
if (!fs.existsSync(CSV_TEMP)) {
  console.error("ERROR: Decompressed CSV not found at " + CSV_TEMP);
  process.exit(1);
}

const stats = fs.statSync(CSV_TEMP);
console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

// ── Parsing ───────────────────────────────────────────────────────────────────
console.log("Parsing courts CSV...\n");

const courtMap = {};
let rowCount = 0;
let headerLogged = false;

const fileStream = fs.createReadStream(CSV_TEMP);
const parser = fileStream.pipe(
  parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  })
);

try {
  for await (const record of parser) {
    rowCount++;

    // Log header on first row
    if (!headerLogged) {
      console.log("CSV Columns:", Object.keys(record).join(", "));
      console.log("");
      headerLogged = true;
    }

    // Extract court_id (primary key in CL)
    const court_id = (record.id || record.court_id || "").trim();
    if (!court_id) continue;

    // Determine jurisdiction from available fields
    // CL courts CSV has: id, jurisdiction (s/sag/st/f/fci/f-app-panel), full_name, etc.
    let jurisdiction = null;

    // Priority 1: Parse from court_id pattern (most reliable for state ID codes)
    jurisdiction = deriveStateFromCourtId(court_id);

    // Priority 2: If court_id didn't give us a state, try court name
    if (!jurisdiction) {
      jurisdiction = deriveStateFromCourtName(record.full_name || record.short_name || "");
    }

    // Priority 3: Check if it's federal from jurisdiction type code
    if (!jurisdiction) {
      const jurCode = (record.jurisdiction || "").trim().toLowerCase();
      if (jurCode.startsWith("f")) jurisdiction = "FEDERAL";
    }

    // Final fallback: "unknown"
    if (!jurisdiction) {
      jurisdiction = "unknown";
    }

    courtMap[court_id] = jurisdiction;

    // Show first 5 records for inspection
    if (rowCount <= 5) {
      console.log(`[Row ${rowCount}] ${court_id} → ${jurisdiction}`);
      console.log(`  Full name: ${record.full_name || "N/A"}`);
      console.log(`  Jurisdiction code: ${record.jurisdiction || "N/A"}`);
      console.log(`  Position: ${record.position || "N/A"}`);
      console.log("");
    }
  }
} catch (err) {
  console.error("ERROR during CSV parsing:", err.message);
  process.exit(1);
}

console.log(`✓ Parsed ${rowCount} rows`);
console.log(`✓ Built mapping for ${Object.keys(courtMap).length} unique courts\n`);

// ── Statistics ────────────────────────────────────────────────────────────────
const jurisdictionCounts = {};
for (const [courtId, jur] of Object.entries(courtMap)) {
  jurisdictionCounts[jur] = (jurisdictionCounts[jur] || 0) + 1;
}

console.log("Jurisdiction Distribution:");
Object.entries(jurisdictionCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([jur, count]) => {
    console.log(`  ${jur}: ${count}`);
  });

if (Object.keys(jurisdictionCounts).length > 20) {
  console.log(`  ... and ${Object.keys(jurisdictionCounts).length - 20} more`);
}

// ── Write output ──────────────────────────────────────────────────────────────
if (!dryRun) {
  console.log("\nWriting court-jurisdiction-map.json...");
  fs.writeFileSync(MAP_OUTPUT, JSON.stringify(courtMap, null, 2), "utf8");
  console.log("✓ Written to " + MAP_OUTPUT);

  // Also preserve the decoded CSV for reference
  console.log(`✓ Decoded CSV available at ${CSV_TEMP}`);
}

// Cleanup temp CSV after successful write
if (!dryRun && fs.existsSync(CSV_TEMP)) {
  console.log("Cleaning up temp CSV...");
  fs.unlinkSync(CSV_TEMP);
  console.log("✓ Temp file removed");
}

console.log("\n=== COMPLETE ===");

// ── Helper: Derive state from court_id pattern ─────────────────────────────────
function deriveStateFromCourtId(courtId) {
  const id = courtId.toLowerCase();

  // Federal circuits (ca1-ca11, cadc, cafc)
  if (id.match(/^ca\d+$|^cadc$|^cafc$/)) return "FEDERAL";

  // Federal district: contains state abbrev + "d" or state abbrev only
  // Examples: nyed (NY Eastern District), cacd (CA Central District), ilnd (IL Northern District)
  const districtMatch = id.match(/^([a-z]{1,2})([a-z]*d)?$/);
  if (districtMatch) {
    const stateAbbrev = districtMatch[1];
    const isDistrict = districtMatch[2]; // "d", "nd", "sd", "ed", "wd"

    // Map 2-letter state abbrev to STATE code
    const stateMap = {
      al: "AL", ak: "AK", az: "AZ", ar: "AR", ca: "CA", co: "CO", ct: "CT", de: "DE",
      fl: "FL", ga: "GA", hi: "HI", id: "ID", il: "IL", in: "IN", ia: "IA", ks: "KS",
      ky: "KY", la: "LA", me: "ME", md: "MD", ma: "MA", mi: "MI", mn: "MN", ms: "MS",
      mo: "MO", mt: "MT", ne: "NE", nv: "NV", nh: "NH", nj: "NJ", nm: "NM", ny: "NY",
      nc: "NC", nd: "ND", oh: "OH", ok: "OK", or: "OR", pa: "PA", ri: "RI", sc: "SC",
      sd: "SD", tn: "TN", tx: "TX", ut: "UT", vt: "VT", va: "VA", wa: "WA", wv: "WV",
      wi: "WI", wy: "WY", us: "FEDERAL", us: "FEDERAL"
    };

    if (isDistrict) return stateMap[stateAbbrev] || "unknown";
    if (stateMap[stateAbbrev]) return stateMap[stateAbbrev];
  }

  // State courts: longer patterns like "fladist", "flaapp2dist", "caapp1st", "vtsuperct", "mesuperct"
  // Try 3-letter prefix first (more specific), then 2-letter
  const stateMap3 = {
    fla: "FL", cal: "CA", tex: "TX", nys: "NY", ill: "IL", penn: "PA", ohio: "OH",
    mich: "MI", mass: "MA", conn: "CT", utah: "UT", nev: "NV", ark: "AR", miss: "MS",
    kan: "KS", neb: "NE", idaho: "ID", minn: "MN", wis: "WI", col: "CO",
  };

  const stateMap2 = {
    fl: "FL", ca: "CA", tx: "TX", ny: "NY", il: "IL", pa: "PA", oh: "OH", ga: "GA",
    nc: "NC", mi: "MI", nj: "NJ", va: "VA", wa: "WA", az: "AZ", ma: "MA", tn: "TN",
    in: "IN", mo: "MO", md: "MD", wi: "WI", co: "CO", mn: "MN", sc: "SC", al: "AL",
    la: "LA", ky: "KY", or: "OR", ok: "OK", ct: "CT", ut: "UT", ia: "IA", nv: "NV",
    ar: "AR", ms: "MS", ks: "KS", nm: "NM", ne: "NE", id: "ID", wv: "WV", hi: "HI",
    nh: "NH", me: "ME", ri: "RI", de: "DE", sd: "SD", nd: "ND", mt: "MT", wy: "WY", vt: "VT", ak: "AK"
  };

  // Try 3-letter prefix first
  for (const [prefix, state] of Object.entries(stateMap3)) {
    if (id.startsWith(prefix)) {
      const remainder = id.slice(prefix.length);
      if (!remainder || /^(dist|ct|app|court|super|cir|reports?|ag|trial|appellate|supreme|appeals)/.test(remainder)) {
        return state;
      }
    }
  }

  // Try 2-letter prefix
  for (const [prefix, state] of Object.entries(stateMap2)) {
    if (id.startsWith(prefix)) {
      const remainder = id.slice(prefix.length);
      if (!remainder || /^(dist|ct|app|court|super|cir|reports?|ag|trial|appellate|supreme|appeals|d)/.test(remainder)) {
        return state;
      }
    }
  }

  return null;
}

// ── Helper: Derive state from court name ──────────────────────────────────────
function deriveStateFromCourtName(name) {
  const lower = name.toLowerCase();
  const stateNames = [
    ["florida", "FL"], ["california", "CA"], ["texas", "TX"], ["new york", "NY"],
    ["illinois", "IL"], ["pennsylvania", "PA"], ["ohio", "OH"], ["georgia", "GA"],
    ["north carolina", "NC"], ["michigan", "MI"], ["new jersey", "NJ"], ["virginia", "VA"],
    ["washington", "WA"], ["arizona", "AZ"], ["massachusetts", "MA"], ["tennessee", "TN"],
    ["indiana", "IN"], ["missouri", "MO"], ["maryland", "MD"], ["wisconsin", "WI"],
    ["colorado", "CO"], ["minnesota", "MN"], ["south carolina", "SC"], ["alabama", "AL"],
    ["louisiana", "LA"], ["kentucky", "KY"], ["oregon", "OR"], ["oklahoma", "OK"],
    ["connecticut", "CT"], ["utah", "UT"], ["iowa", "IA"], ["nevada", "NV"],
    ["arkansas", "AR"], ["mississippi", "MS"], ["kansas", "KS"], ["new mexico", "NM"],
  ];
  for (const [fullName, code] of stateNames) {
    if (lower.includes(fullName)) return code;
  }
  return null;
}
