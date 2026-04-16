/**
 * Pre-filter: extract rows matching target cluster IDs from the 50GB opinions CSV.
 *
 * Uses readline (raw line scanning) instead of csv-parse to bypass the 5-8x
 * parsing overhead that made full-file scans take 33+ hours. Only the cluster_id
 * column (col 22, 0-indexed 21) is checked per line, no full CSV parsing.
 *
 * Output: a standard CSV file with header + matching rows. Typically ~350MB for
 * ~7K target clusters. All downstream scripts (motion extraction, master extractor,
 * appeal correlator phase 2) can read this file in seconds instead of re-streaming
 * the full 50GB bz2.
 *
 * Usage:
 *   node scripts/prefilter-opinions-csv.mjs
 *
 * Reads:
 *   - data/bulk-verify/statute-case-law-dump.json (target cluster IDs)
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50GB source)
 * Writes:
 *   - data/bulk-verify/cl-bulk/opinions-filtered.csv (matching rows only)
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

const OPINIONS_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2");
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-filtered.csv");

// cluster_id is column 22 (1-indexed) = index 21 (0-indexed) in the opinions CSV.
const CLUSTER_ID_COL_INDEX = 21;

// Regex to extract quoted numeric fields from any physical line. Matches ,"<digits>"
// patterns. Used for line-by-line cluster_id scanning since the actual cluster_id
// column is buried after 10 text columns with embedded newlines.
const NUMERIC_FIELD_RE = /,"(\d{4,9})"/g;

function findBzcat() {
  const gitBzcat = "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe";
  if (fs.existsSync(gitBzcat)) return gitBzcat;
  return "bzcat";
}

/**
 * Fast column extraction from a CSV line. Handles quoted fields correctly
 * for the target column only, doesn't parse the full row.
 *
 * Returns the value of column at `targetIndex` (0-based).
 */
function extractColumn(line, targetIndex) {
  let col = 0;
  let i = 0;
  let start = 0;

  while (i < line.length && col < targetIndex) {
    if (line[i] === '"') {
      // Skip quoted field
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            i += 2; // escaped quote
          } else {
            i++; // end of quoted field
            break;
          }
        } else {
          i++;
        }
      }
      // Skip comma after quoted field
      if (i < line.length && line[i] === ',') i++;
      col++;
      start = i;
    } else {
      // Unquoted field, find next comma
      const commaIdx = line.indexOf(',', i);
      if (commaIdx === -1) {
        // Last column on line
        return col === targetIndex ? line.slice(i).replace(/^"|"$/g, '') : null;
      }
      col++;
      i = commaIdx + 1;
      start = i;
    }
  }

  if (col !== targetIndex) return null;

  // Extract the target column value
  if (line[start] === '"') {
    const endQuote = line.indexOf('"', start + 1);
    return endQuote > start ? line.slice(start + 1, endQuote) : line.slice(start + 1);
  }
  const nextComma = line.indexOf(',', start);
  return nextComma === -1 ? line.slice(start) : line.slice(start, nextComma);
}

async function main() {
  console.log("=== PRE-FILTER: Extract target cluster rows from 50GB opinions CSV ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) {
    console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`ERROR: dump not found: ${DUMP_FILE}`);
    process.exit(1);
  }

  // Load target cluster IDs
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      targetClusters.add(String(r.courtlistener_cluster_id));
    }
  }
  console.log(`Target clusters: ${targetClusters.size}`);

  // Spawn bzcat
  const bzcatPath = findBzcat();
  console.log(`Using: ${bzcatPath}`);
  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});
  bzcat.on("error", (e) => console.error(`bzcat error: ${e.message}`));

  // Readline for raw line scanning (no CSV parsing overhead)
  const rl = readline.createInterface({
    input: bzcat.stdout,
    crlfDelay: Infinity,
  });

  // Output stream
  const out = fs.createWriteStream(OUTPUT_FILE);
  let headerWritten = false;

  // Multi-line record handling. CL opinions CSV has full opinion text in quoted
  // fields with embedded newlines, one csv-parse "record" spans ~41 physical
  // lines on average (3.1B lines / 76M records). We detect record boundaries by
  // checking if a line starts with "<digits>", (the quoted numeric id column).
  // Continuation lines inside quoted text fields won't match this pattern.
  const RECORD_START_RE = /^"\d+","/;
  let currentRecordLines = [];
  let currentRecordKeep = false;
  let recordCount = 0;

  let lineCount = 0;
  let matchCount = 0;
  const startTime = Date.now();

  function flushRecord() {
    if (currentRecordLines.length === 0) return;
    if (currentRecordKeep) {
      for (const l of currentRecordLines) {
        out.write(l + "\n");
      }
      matchCount++;
      if (matchCount % 500 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${matchCount} records matched, ${recordCount} records scanned (${(elapsed / 60).toFixed(1)} min)\n`);
      }
    }
    currentRecordLines = [];
    currentRecordKeep = false;
  }

  for await (const line of rl) {
    lineCount++;

    // First line = header, write unconditionally
    if (!headerWritten) {
      out.write(line + "\n");
      headerWritten = true;
      const cols = line.split(",");
      const clusterColName = cols[CLUSTER_ID_COL_INDEX]?.replace(/^"|"$/g, '');
      if (clusterColName !== "cluster_id") {
        console.error(`ERROR: Expected column ${CLUSTER_ID_COL_INDEX} to be "cluster_id", got "${clusterColName}"`);
        bzcat.kill();
        process.exit(1);
      }
      console.log(`Header verified: column ${CLUSTER_ID_COL_INDEX} = "cluster_id"`);
      console.log(`Streaming (multi-line aware)...\n`);
      continue;
    }

    // Detect new record boundary
    if (RECORD_START_RE.test(line)) {
      // Flush previous record
      flushRecord();
      recordCount++;
      currentRecordLines.push(line);
    } else {
      // Continuation line, belongs to current record
      currentRecordLines.push(line);
    }

    // Scan EVERY line for target cluster_id patterns. cluster_id (col 22)
    // appears deep in the record after 10 text columns with embedded newlines,
    // so it's NOT on the record-start line. We match ,"<digits>" patterns
    // against the target Set on every physical line. V8 regex is native speed;
    // false positives from other numeric columns are harmless (downstream
    // csv-parse validates on the small filtered file).
    if (!currentRecordKeep) {
      NUMERIC_FIELD_RE.lastIndex = 0;
      let m;
      while ((m = NUMERIC_FIELD_RE.exec(line)) !== null) {
        if (targetClusters.has(m[1])) {
          currentRecordKeep = true;
          break;
        }
      }
    }

    // Progress every 5M lines
    if (lineCount % 5000000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (lineCount / elapsed).toFixed(0);
      process.stdout.write(`  ${(lineCount / 1000000).toFixed(0)}M lines, ${recordCount} records, ${matchCount} matched, ${rate} lines/sec (${(elapsed / 60).toFixed(1)} min)\n`);
    }
  }

  // Flush last record
  flushRecord();

  await new Promise((resolve) => out.end(resolve));

  const elapsed = (Date.now() - startTime) / 1000;
  const fileSizeMB = fs.existsSync(OUTPUT_FILE)
    ? (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)
    : "?";

  console.log(`\n=== COMPLETE ===`);
  console.log(`  Lines scanned: ${lineCount.toLocaleString()}`);
  console.log(`  Rows matched: ${matchCount.toLocaleString()}`);
  console.log(`  Output: ${OUTPUT_FILE} (${fileSizeMB} MB)`);
  console.log(`  Time: ${(elapsed / 60).toFixed(1)} min (${(lineCount / elapsed).toFixed(0)} lines/sec)`);
  console.log(`\nAll downstream scripts can now read opinions-filtered.csv instead of the 50GB bz2.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
