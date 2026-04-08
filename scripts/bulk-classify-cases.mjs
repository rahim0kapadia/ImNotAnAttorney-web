/**
 * Bulk Classify Cases — Download CL Clusters CSV, classify party_side locally
 *
 * Downloads the CourtListener opinion-clusters CSV (~2.28 GB bzip2).
 * Stream-parses it via bzcat, extracting syllabus + summary + disposition
 * for our cases. Classifies DEFENSE/PROSECUTION/NEUTRAL using the same
 * signal detection as classify-case-law.mjs.
 *
 * This handles party_side classification with ZERO API calls.
 * Negative treatment (is_good_law) still requires classify-case-law.mjs.
 *
 * Usage:
 *   node scripts/bulk-classify-cases.mjs                # Download + classify + generate SQL
 *   node scripts/bulk-classify-cases.mjs --apply        # Generate + apply to Supabase
 *   node scripts/bulk-classify-cases.mjs --dry-run      # Stats only
 *   node scripts/bulk-classify-cases.mjs --limit 100    # Process first N matches
 *   node scripts/bulk-classify-cases.mjs --skip-download # Use cached CSV
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 100;

const BULK_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk");
const CLUSTERS_BZ2 = path.join(BULK_DIR, "opinion-clusters-2026-03-31.csv.bz2");
const CLUSTERS_URL = "https://com-courtlistener-storage.s3-us-west-2.amazonaws.com/bulk-data/opinion-clusters-2026-03-31.csv.bz2";

const DEFAULT_DUMP = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "data", "bulk-verify", "classification-updates.sql");

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const skipDownload = args.includes("--skip-download");
const inputIdx = args.indexOf("--input");
const inputPath = inputIdx >= 0 ? path.resolve(args[inputIdx + 1]) : DEFAULT_DUMP;
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? path.resolve(args[outputIdx + 1]) : DEFAULT_OUTPUT;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Classification Signals (from classify-case-law.mjs) ─────────────────────

const DEFENSE_SIGNALS = [
  "reversed", "vacated", "quashed", "remanded",
  "we reverse", "we quash", "we vacate", "we remand",
  "is reversed", "is vacated", "is quashed", "is remanded",
  "error to admit", "error to deny", "error in admitting",
  "should have been suppressed", "must be suppressed",
  "trial court erred", "the trial court erred",
  "conviction is reversed", "judgment is reversed",
  "violated defendant", "rights were violated",
  "unconstitutional as applied",
];

const PROSECUTION_SIGNALS = [
  "affirmed", "we affirm", "is affirmed",
  "per curiam affirmed",
  "harmless error", "harmless beyond a reasonable doubt",
  "properly admitted", "properly denied",
  "no abuse of discretion", "did not abuse",
  "conviction is affirmed", "judgment is affirmed",
  "petition denied", "petition is denied",
  "without merit", "no merit", "no error",
  "conviction upheld",
];

const BINDING_COURTS = [
  "supreme court of florida",
  "district court of appeal of florida",
];

function classifyText(text, court) {
  const lower = text.toLowerCase();

  let defenseScore = 0;
  let prosecutionScore = 0;

  for (const signal of DEFENSE_SIGNALS) {
    if (lower.indexOf(signal) >= 0) defenseScore++;
  }
  for (const signal of PROSECUTION_SIGNALS) {
    if (lower.indexOf(signal) >= 0) prosecutionScore++;
  }

  // Extract outcome from last 30 sentences
  const sentences = text.split(".");
  let outcome = "";
  for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 30); i--) {
    const s = sentences[i].trim();
    const sLower = s.toLowerCase();
    if (sLower.indexOf("accordingly") >= 0 || sLower.indexOf("therefore") >= 0 ||
        sLower.indexOf("we reverse") >= 0 || sLower.indexOf("we affirm") >= 0 ||
        sLower.indexOf("we quash") >= 0 || sLower.indexOf("we vacate") >= 0 ||
        sLower.indexOf("is affirmed") >= 0 || sLower.indexOf("is reversed") >= 0 ||
        sLower.indexOf("we remand") >= 0 || sLower.indexOf("petition denied") >= 0) {
      outcome = s.slice(0, 300);
      break;
    }
  }

  // Key quote
  let keyQuote = "";
  for (const s of sentences) {
    const sLower = s.toLowerCase().trim();
    if (sLower.indexOf("we hold") >= 0 || sLower.indexOf("we conclude") >= 0 ||
        sLower.indexOf("the court holds") >= 0 || sLower.indexOf("we find that") >= 0) {
      keyQuote = s.trim().slice(0, 500);
      break;
    }
  }

  // Holding excerpt — first substantive paragraph
  let holdingExcerpt = "";
  const paragraphs = text.split("\n");
  for (const p of paragraphs) {
    const stripped = p.trim();
    if (stripped.length > 150 && !stripped.startsWith("No.") && !stripped.startsWith("*")) {
      holdingExcerpt = stripped.slice(0, 500);
      break;
    }
  }

  // Determine party_side
  let partySide = "UNKNOWN";
  if (defenseScore > 0 && prosecutionScore === 0) {
    partySide = "DEFENSE";
  } else if (prosecutionScore > 0 && defenseScore === 0) {
    partySide = "PROSECUTION";
  } else if (defenseScore > 0 && prosecutionScore > 0) {
    const outLower = outcome.toLowerCase();
    if (outLower.indexOf("reverse") >= 0 || outLower.indexOf("vacate") >= 0 ||
        outLower.indexOf("quash") >= 0 || outLower.indexOf("remand") >= 0) {
      partySide = "DEFENSE";
    } else if (outLower.indexOf("affirm") >= 0) {
      partySide = "PROSECUTION";
    } else {
      partySide = "NEUTRAL";
    }
  }

  // Binding authority
  const courtLower = (court || "").toLowerCase();
  let isBinding = false;
  for (const bc of BINDING_COURTS) {
    if (courtLower.indexOf(bc) >= 0) { isBinding = true; break; }
  }

  // Application text
  let application = "";
  if (partySide === "DEFENSE") {
    application = "Defense-favorable: " + (outcome || "trial court ruling reversed/vacated");
  } else if (partySide === "PROSECUTION") {
    application = "Prosecution-favorable: " + (outcome || "conviction/ruling affirmed");
  } else if (partySide === "NEUTRAL") {
    application = "Mixed signals — review holding for specific applicability";
  }

  return { partySide, outcome, keyQuote, holdingExcerpt, isBinding, application };
}

// ── SQL Helpers ─────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
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

// ── Download ────────────────────────────────────────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    console.log(`Destination: ${destPath}\n`);

    const file = fs.createWriteStream(destPath);
    let totalBytes = 0;
    let lastReport = 0;
    const startTime = Date.now();

    function doGet(getUrl, redirectCount) {
      if (redirectCount > 5) { reject(new Error("Too many redirects")); return; }
      https.get(getUrl, {
        headers: { "User-Agent": "INAA-Legal-Research/1.0 (legal research, contact: rahim0kapadia@gmail.com)" }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          doGet(res.headers.location, redirectCount + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const contentLength = parseInt(res.headers["content-length"] || "0", 10);

        res.on("data", (chunk) => {
          totalBytes += chunk.length;
          file.write(chunk);
          const mb = Math.floor(totalBytes / (1024 * 1024));
          if (mb >= lastReport + 50) {
            lastReport = mb;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = (totalBytes / (1024 * 1024) / elapsed).toFixed(1);
            const pct = contentLength ? ` (${Math.floor(totalBytes / contentLength * 100)}%)` : "";
            process.stdout.write(`  ${mb} MB${pct} — ${speed} MB/s\n`);
          }
        });

        res.on("end", () => {
          file.end();
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`  Done: ${(totalBytes / (1024 * 1024)).toFixed(0)} MB in ${elapsed.toFixed(0)}s`);
          resolve();
        });

        res.on("error", reject);
      }).on("error", reject);
    }

    doGet(url, 0);
  });
}

// ── CSV Parser (handles quoted fields with embedded commas/newlines) ─────────

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

// ── Stream + Classify ───────────────────────────────────────────────────────

// Find bzcat binary (works in PowerShell, cmd, and bash)
function findBzcat() {
  // Check common Windows locations first
  const candidates = [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bzcat.exe",
    "bzcat", // Fallback to PATH
  ];
  for (const p of candidates) {
    if (p === "bzcat") return p;
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return "bzcat";
}

async function streamAndClassify(bz2Path, targetClusterIds, rowMap) {
  return new Promise((resolve, reject) => {
    const results = new Map(); // cluster_id → classification result

    const bzcatPath = findBzcat();
    console.log(`\nStreaming clusters CSV through bzcat...`);
    console.log(`Using: ${bzcatPath}`);
    console.log(`Looking for ${targetClusterIds.size} cluster IDs...\n`);

    const bzcat = spawn(bzcatPath, [bz2Path], { stdio: ["pipe", "pipe", "pipe"] });
    const rl = createInterface({ input: bzcat.stdout, crlfDelay: Infinity });

    let headers = null;
    let headerMap = {}; // column name → index
    let lineCount = 0;
    let matchCount = 0;
    let lastReport = 0;
    const startTime = Date.now();

    // Handle multi-line CSV fields (quoted values with newlines)
    let pendingLine = "";
    let inQuotedField = false;

    rl.on("line", (rawLine) => {
      // Handle multi-line quoted fields
      if (inQuotedField) {
        pendingLine += "\n" + rawLine;
        // Count quotes to see if we've closed the field
        let quoteCount = 0;
        for (let i = 0; i < rawLine.length; i++) {
          if (rawLine[i] === '"') quoteCount++;
        }
        if (quoteCount % 2 === 1) {
          inQuotedField = false;
          // Process the complete line
          rawLine = pendingLine;
          pendingLine = "";
        } else {
          return; // Still in multi-line field
        }
      } else {
        // Check if this line has unmatched quotes (start of multi-line field)
        let quoteCount = 0;
        for (let i = 0; i < rawLine.length; i++) {
          if (rawLine[i] === '"') quoteCount++;
        }
        if (quoteCount % 2 === 1) {
          inQuotedField = true;
          pendingLine = rawLine;
          return;
        }
      }

      lineCount++;
      if (lineCount === 1) {
        headers = rawLine.split(",").map(h => h.trim());
        for (let i = 0; i < headers.length; i++) {
          headerMap[headers[i]] = i;
        }
        console.log(`  Columns: ${headers.length} (id at ${headerMap.id}, syllabus at ${headerMap.syllabus})`);
        return;
      }

      // Fast path: check if the cluster ID is in the first field before full parsing
      const firstComma = rawLine.indexOf(",");
      if (firstComma < 0) return;
      const clusterId = rawLine.slice(0, firstComma);

      if (!targetClusterIds.has(clusterId)) {
        // Progress every 2M lines
        const milestone = Math.floor(lineCount / 2000000);
        if (milestone > lastReport) {
          lastReport = milestone;
          const elapsed = (Date.now() - startTime) / 1000;
          process.stdout.write(`  ${(lineCount / 1000000).toFixed(1)}M lines, ${matchCount} matches (${elapsed.toFixed(0)}s)...\n`);
        }
        return;
      }

      // Full parse for matching rows
      const values = parseCsvLine(rawLine);
      matchCount++;

      const idIdx = headerMap.id || 0;
      const caseNameIdx = headerMap.case_name;
      const syllabusIdx = headerMap.syllabus;
      const summaryIdx = headerMap.summary;
      const dispositionIdx = headerMap.disposition;
      const postureIdx = headerMap.posture;
      const headnotesIdx = headerMap.headnotes;
      const dateFiledIdx = headerMap.date_filed;

      // Combine text fields for classification
      const textParts = [];
      if (syllabusIdx !== undefined && values[syllabusIdx]) textParts.push(values[syllabusIdx]);
      if (summaryIdx !== undefined && values[summaryIdx]) textParts.push(values[summaryIdx]);
      if (dispositionIdx !== undefined && values[dispositionIdx]) textParts.push(values[dispositionIdx]);
      if (postureIdx !== undefined && values[postureIdx]) textParts.push(values[postureIdx]);
      if (headnotesIdx !== undefined && values[headnotesIdx]) textParts.push(values[headnotesIdx]);

      const combinedText = textParts.join("\n");

      // Get the DB row for this cluster ID to get the court name
      const dbRow = rowMap.get(clusterId);
      const court = dbRow ? (dbRow.court || "") : "";

      if (combinedText.length > 10) {
        const classification = classifyText(combinedText, court);
        results.set(clusterId, {
          ...classification,
          caseName: caseNameIdx !== undefined ? values[caseNameIdx] : null,
          dateFiled: dateFiledIdx !== undefined ? values[dateFiledIdx] : null,
          textLength: combinedText.length,
        });
      }

      if (matchCount % 1000 === 0) {
        process.stdout.write(`  ${matchCount} classified...\n`);
      }

      // Early exit if we hit the limit
      if (matchCount >= limit) {
        bzcat.kill();
        rl.close();
      }
    });

    rl.on("close", () => {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`\n  Stream complete: ${(lineCount / 1000000).toFixed(1)}M lines in ${elapsed.toFixed(0)}s`);
      console.log(`  Matched: ${matchCount}, Classified: ${results.size}`);
      resolve(results);
    });

    bzcat.stderr.on("data", () => {}); // Suppress bzcat warnings
    bzcat.on("error", (err) => reject(new Error(`bzcat failed: ${err.message}`)));
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK CLASSIFY CASES (CL Clusters CSV) ===\n");

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Dump not found: ${inputPath}\nRun bulk-dump-cases.mjs first.`);
    process.exit(1);
  }

  const allRows = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  // Filter: has CL cluster ID, party_side not yet classified
  const toClassify = allRows.filter(r => {
    if (!r.courtlistener_cluster_id) return false;
    if (r.party_side && r.party_side !== "UNKNOWN") return false;
    return true;
  });

  console.log(`Total dump rows:         ${allRows.length}`);
  console.log(`Rows needing classify:   ${toClassify.length}`);

  if (toClassify.length === 0) {
    console.log("\nAll rows already classified.");
    return;
  }

  // Build lookup maps
  const clusterIdSet = new Set();
  const rowMap = new Map(); // cluster_id → DB row
  for (const row of toClassify) {
    clusterIdSet.add(row.courtlistener_cluster_id);
    rowMap.set(row.courtlistener_cluster_id, row);
  }

  console.log(`Unique cluster IDs:      ${clusterIdSet.size}`);

  // Step 1: Download clusters CSV if needed
  if (!skipDownload && !fs.existsSync(CLUSTERS_BZ2)) {
    if (!fs.existsSync(BULK_DIR)) fs.mkdirSync(BULK_DIR, { recursive: true });
    await downloadFile(CLUSTERS_URL, CLUSTERS_BZ2);
  } else if (fs.existsSync(CLUSTERS_BZ2)) {
    const sizeMB = (fs.statSync(CLUSTERS_BZ2).size / (1024 * 1024)).toFixed(0);
    console.log(`\nUsing cached clusters CSV: ${sizeMB} MB`);
  } else {
    console.error("ERROR: Clusters CSV not found and --skip-download specified.");
    process.exit(1);
  }

  // Step 2: Stream and classify
  const results = await streamAndClassify(CLUSTERS_BZ2, clusterIdSet, rowMap);

  // Step 3: Stats
  const partySideCounts = { DEFENSE: 0, PROSECUTION: 0, NEUTRAL: 0, UNKNOWN: 0 };
  for (const [, r] of results) {
    partySideCounts[r.partySide] = (partySideCounts[r.partySide] || 0) + 1;
  }

  const notFound = clusterIdSet.size - results.size;

  console.log(`\n--- Classification Results ---`);
  console.log(`DEFENSE:                 ${partySideCounts.DEFENSE}`);
  console.log(`PROSECUTION:             ${partySideCounts.PROSECUTION}`);
  console.log(`NEUTRAL:                 ${partySideCounts.NEUTRAL}`);
  console.log(`UNKNOWN (no signals):    ${partySideCounts.UNKNOWN}`);
  console.log(`Not found in CSV:        ${notFound}`);

  if (dryRun) {
    console.log(`\nDry run complete.`);
    return;
  }

  // Step 4: Generate SQL
  const sqlStatements = [];
  sqlStatements.push("-- Bulk Classification — Generated " + new Date().toISOString());
  sqlStatements.push("-- Source: bulk-classify-cases.mjs (CL clusters CSV)");
  sqlStatements.push("");

  for (const [clusterId, result] of results) {
    const dbRow = rowMap.get(clusterId);
    if (!dbRow) continue;

    let stmt = `UPDATE statute_case_law SET `;
    stmt += `party_side = ${esc(result.partySide)}`;

    if (result.outcome) stmt += `, outcome = ${esc(result.outcome.slice(0, 500))}`;
    if (result.keyQuote) stmt += `, key_quote = ${esc(result.keyQuote.slice(0, 500))}`;
    if (result.holdingExcerpt) stmt += `, holding_excerpt = ${esc(result.holdingExcerpt.slice(0, 500))}`;
    if (result.application) stmt += `, application = ${esc(result.application.slice(0, 500))}`;
    stmt += `, is_binding = ${result.isBinding}`;

    stmt += ` WHERE id = ${esc(dbRow.id)};`;
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
    console.log(`To apply: node scripts/bulk-classify-cases.mjs --apply`);
    return;
  }

  // Step 5: Batch apply
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
      console.error(`  Batch ${batchNum}: ERROR — ${e.message}`);
      if (e.message.indexOf("429") >= 0) {
        console.log("  Rate limited — waiting 10s...");
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
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
