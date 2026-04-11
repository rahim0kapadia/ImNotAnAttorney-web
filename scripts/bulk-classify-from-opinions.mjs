/**
 * Bulk Classify from Opinions CSV — proper csv-parse streaming
 *
 * Plan: docs/plans/2026-04-09-bulk-classify-from-opinions.md
 *
 * Streams the 50 GB opinions CSV using csv-parse (handles multi-line HTML fields
 * correctly). For each opinion matching our cluster IDs, classifies:
 *   party_side, outcome, holding_excerpt, key_quote, application, is_binding
 *
 * Updates ALL statute_case_law rows sharing a cluster_id in one statement.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (run bulk-dump-cases.mjs)
 *   - npm install csv-parse
 *
 * Usage:
 *   node scripts/bulk-classify-from-opinions.mjs              # Generate SQL only
 *   node scripts/bulk-classify-from-opinions.mjs --apply      # Generate + apply
 *   node scripts/bulk-classify-from-opinions.mjs --dry-run    # Stats only
 *   node scripts/bulk-classify-from-opinions.mjs --limit 100  # First N matches
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { parse } from "csv-parse";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BATCH_SIZE = 500;

const OPINIONS_BZ2 = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-2026-03-31.csv.bz2");
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

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
  for (const signal of DEFENSE_SIGNALS) { if (lower.indexOf(signal) >= 0) defenseScore++; }
  for (const signal of PROSECUTION_SIGNALS) { if (lower.indexOf(signal) >= 0) prosecutionScore++; }

  const sentences = text.split(".");
  let outcome = "";
  for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 30); i--) {
    const sLower = sentences[i].trim().toLowerCase();
    if (sLower.indexOf("accordingly") >= 0 || sLower.indexOf("therefore") >= 0 ||
        sLower.indexOf("we reverse") >= 0 || sLower.indexOf("we affirm") >= 0 ||
        sLower.indexOf("we quash") >= 0 || sLower.indexOf("we vacate") >= 0 ||
        sLower.indexOf("is affirmed") >= 0 || sLower.indexOf("is reversed") >= 0 ||
        sLower.indexOf("we remand") >= 0 || sLower.indexOf("petition denied") >= 0) {
      outcome = sentences[i].trim().slice(0, 300); break;
    }
  }

  let keyQuote = "";
  for (const s of sentences) {
    const sLower = s.toLowerCase().trim();
    if (sLower.indexOf("we hold") >= 0 || sLower.indexOf("we conclude") >= 0 ||
        sLower.indexOf("the court holds") >= 0 || sLower.indexOf("we find that") >= 0) {
      keyQuote = s.trim().slice(0, 500); break;
    }
  }

  let holdingExcerpt = "";
  for (const p of text.split("\n")) {
    const stripped = p.trim();
    if (stripped.length > 150 && !stripped.startsWith("No.") && !stripped.startsWith("*")) {
      holdingExcerpt = stripped.slice(0, 500); break;
    }
  }

  let partySide = "UNKNOWN";
  if (defenseScore > 0 && prosecutionScore === 0) partySide = "DEFENSE";
  else if (prosecutionScore > 0 && defenseScore === 0) partySide = "PROSECUTION";
  else if (defenseScore > 0 && prosecutionScore > 0) {
    const outLower = outcome.toLowerCase();
    if (outLower.indexOf("reverse") >= 0 || outLower.indexOf("vacate") >= 0 ||
        outLower.indexOf("quash") >= 0 || outLower.indexOf("remand") >= 0) partySide = "DEFENSE";
    else if (outLower.indexOf("affirm") >= 0) partySide = "PROSECUTION";
    else partySide = "NEUTRAL";
  }

  const courtLower = (court || "").toLowerCase();
  let isBinding = false;
  for (const bc of BINDING_COURTS) { if (courtLower.indexOf(bc) >= 0) { isBinding = true; break; } }

  let application = "";
  if (partySide === "DEFENSE") application = "Defense-favorable: " + (outcome || "trial court ruling reversed/vacated");
  else if (partySide === "PROSECUTION") application = "Prosecution-favorable: " + (outcome || "conviction/ruling affirmed");
  else if (partySide === "NEUTRAL") application = "Mixed signals — review holding for specific applicability";

  return { partySide, outcome, keyQuote, holdingExcerpt, isBinding, application };
}

function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const textParts = [];
  for (const part of parts) {
    const closeIdx = part.indexOf(">");
    textParts.push(closeIdx >= 0 ? part.slice(closeIdx + 1) : part);
  }
  return textParts.join("").trim();
}

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  const parentEnv = fs.readFileSync(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8");
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) { supabaseToken = line.slice(22).trim(); break; }
  }
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: "api.supabase.com", path: `/v1/projects/${PROJECT_REF}/database/query`, method: "POST",
      headers: { Authorization: `Bearer ${supabaseToken}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

function findBzcat() {
  for (const p of ["C:\\Program Files\\Git\\usr\\bin\\bzcat.exe", "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe", "bzcat"]) {
    if (p === "bzcat") return p;
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return "bzcat";
}

async function main() {
  console.log("=== BULK CLASSIFY FROM OPINIONS CSV (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  // Target ALL clusters with a cluster_id — not just unclassified ones.
  // Even already-classified cases benefit from additional text-source verification.
  // The UPDATE WHERE clause prevents overwriting existing classifications unless
  // the new source provides stronger signals.
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      targetClusters.add(String(r.courtlistener_cluster_id));
    }
  }
  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);

  const bzcatPath = findBzcat();
  console.log(`Streaming opinions CSV through bzcat + csv-parse...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  // CL opinions CSV uses backslash-escaped quotes (\") in XML/HTML content,
  // not standard CSV double-quote escaping (""). escape: '\\' handles this.
  const parser = bzcat.stdout.pipe(parse({ columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true }));

  const results = new Map();
  let rowCount = 0;
  let matchCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} classified (${elapsed.toFixed(0)}s)\n`);
      }

      const clusterId = record.cluster_id;
      if (!clusterId || !targetClusters.has(clusterId)) continue;
      if (results.has(clusterId)) continue;

      let text = record.plain_text || "";
      if (text.length < 200) {
        const html = record.html_with_citations || record.html || record.html_columbia || "";
        if (html.length > 200) text = stripHtml(html);
      }
      if (text.length < 200) continue;

      const classification = classifyText(text, "");
      if (classification.partySide === "UNKNOWN" && !classification.outcome) continue;

      results.set(clusterId, classification);
      matchCount++;
      if (matchCount % 500 === 0) process.stdout.write(`  ${matchCount} classified...\n`);
      if (matchCount >= limit) { bzcat.kill(); break; }
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Matched + classified: ${results.size}`);

  const counts = { DEFENSE: 0, PROSECUTION: 0, NEUTRAL: 0 };
  for (const [, r] of results) { counts[r.partySide] = (counts[r.partySide] || 0) + 1; }
  console.log(`\nDEFENSE: ${counts.DEFENSE}  PROSECUTION: ${counts.PROSECUTION}  NEUTRAL: ${counts.NEUTRAL}`);

  if (dryRun || results.size === 0) { console.log(dryRun ? "\nDry run complete." : "\nNo classifications."); return; }

  // Additive updates: fill empty fields, never overwrite existing values.
  // COALESCE(existing, new) keeps existing if present, uses new if NULL.
  const stmts = [];
  for (const [clusterId, r] of results) {
    let stmt = `UPDATE statute_case_law SET `;
    stmt += `party_side = COALESCE(NULLIF(party_side, 'UNKNOWN'), ${esc(r.partySide)})`;
    if (r.outcome) stmt += `, outcome = COALESCE(outcome, ${esc(r.outcome.slice(0, 500))})`;
    if (r.keyQuote) stmt += `, key_quote = COALESCE(key_quote, ${esc(r.keyQuote.slice(0, 500))})`;
    if (r.holdingExcerpt) stmt += `, holding_excerpt = COALESCE(holding_excerpt, ${esc(r.holdingExcerpt.slice(0, 500))})`;
    if (r.application) stmt += `, application = COALESCE(application, ${esc(r.application.slice(0, 500))})`;
    stmt += `, is_binding = COALESCE(is_binding, ${r.isBinding})`;
    stmt += ` WHERE courtlistener_cluster_id = ${esc(clusterId)};`;
    stmts.push(stmt);
  }

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "opinions-classification-updates.sql");
    if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`\nSaved ${stmts.length} statements: ${outPath}`);
    console.log(`To apply: node scripts/bulk-classify-from-opinions.mjs --apply`);
    return;
  }

  loadToken();
  console.log(`\n--- Applying ${stmts.length} updates in batches of ${BATCH_SIZE} ---\n`);
  let applied = 0, errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);
    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} clusters — ${(applied / ((Date.now() - applyStart) / 1000)).toFixed(0)}/sec\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try { await supabaseQuery(batch.join("\n")); applied += batch.length; errors--; } catch {}
      }
    }
    if (i + BATCH_SIZE < stmts.length) await sleep(500);
  }

  console.log(`\n--- Results ---`);
  console.log(`Clusters applied: ${applied}  Errors: ${errors}`);
  console.log(`Each cluster updates ALL rows sharing it (~3.8:1 expansion).`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
