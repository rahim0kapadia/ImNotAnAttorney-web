/**
 * Bulk Extract Motion Types + Legal Issues from Opinions CSV
 *
 * Plan: C:/Users/email/.claude/plans/stateless-stargazing-cerf.md (P0.3, P1.1)
 *
 * Streams the 50 GB opinions CSV using csv-parse (with escape: "\\" for CL's
 * backslash-escaped quotes). For each opinion matching our cluster IDs,
 * extracts three deterministic signals from plain_text:
 *   1. motion_types[] — which motion types this case supports
 *   2. legal_issues[] — 4A/5A/6A/Brady/IAC/speedy/etc.
 *   3. supporting_rulings[] — granted/denied directions per motion
 *
 * Updates via COALESCE additive pattern — fills empty arrays, never overwrites.
 * Store verification source URL in source_urls[] per safety rule.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - statute_case_law columns motion_types/legal_issues/supporting_rulings (migration applied)
 *   - npm install csv-parse
 *
 * IMPORTANT: Do not run while bulk-classify-from-opinions.mjs is running.
 * Both stream the same 50 GB CSV and would halve throughput + saturate bzcat CPU.
 *
 * Usage:
 *   node scripts/bulk-extract-motion-legal-issues.mjs              # Generate SQL only
 *   node scripts/bulk-extract-motion-legal-issues.mjs --apply      # Generate + apply
 *   node scripts/bulk-extract-motion-legal-issues.mjs --dry-run    # Stats only
 *   node scripts/bulk-extract-motion-legal-issues.mjs --limit 100  # First N matches
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
const OPINIONS_FILTERED = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk", "opinions-filtered.csv");
const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const applyMode = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Motion type signals ─────────────────────────────────────────────────────
// Each entry: [canonical_name, ...phrases to match in lowercased text]
const MOTION_SIGNALS = [
  ["suppress_motion", "motion to suppress", "suppression motion", "motion for suppression"],
  ["dismiss_motion", "motion to dismiss", "motion for dismissal"],
  ["in_limine_motion", "motion in limine"],
  ["new_trial_motion", "motion for new trial", "motion for a new trial"],
  ["mistrial_motion", "motion for mistrial", "motion for a mistrial"],
  ["continuance_motion", "motion for continuance", "motion to continue"],
  ["severance_motion", "motion for severance", "motion to sever"],
  ["change_of_venue_motion", "motion for change of venue", "change of venue motion"],
  ["discovery_motion", "motion for discovery", "motion to compel discovery", "discovery motion"],
  ["franks_motion", "franks hearing", "franks motion"],
  ["speedy_trial_motion", "motion for speedy trial", "speedy trial motion"],
  ["competency_motion", "motion for competency", "competency hearing"],
  ["recusal_motion", "motion to recuse", "motion for recusal", "motion for disqualification"],
  ["bill_of_particulars", "bill of particulars", "motion for bill of particulars"],
  ["pretrial_release_motion", "motion for pretrial release", "motion for bond reduction", "motion to modify bond"],
  ["judgment_acquittal_motion", "motion for judgment of acquittal", "judgment of acquittal", "rule 29 motion"],
  ["arrest_judgment_motion", "motion in arrest of judgment"],
  ["withdraw_plea_motion", "motion to withdraw plea", "motion to withdraw guilty plea"],
];

// ── Legal issue signals ─────────────────────────────────────────────────────
const ISSUE_SIGNALS = [
  ["fourth_amendment", "fourth amendment", "4th amendment", "search and seizure", "warrantless search", "probable cause", "reasonable suspicion"],
  ["fifth_amendment", "fifth amendment", "5th amendment", "miranda", "self-incrimination", "custodial interrogation", "right to remain silent"],
  ["sixth_amendment", "sixth amendment", "6th amendment", "right to counsel", "confrontation clause", "cross-examination", "compulsory process"],
  ["eighth_amendment", "eighth amendment", "8th amendment", "cruel and unusual", "excessive bail", "excessive fine"],
  ["fourteenth_amendment", "fourteenth amendment", "14th amendment", "due process", "equal protection"],
  ["brady_violation", "brady violation", "brady material", "exculpatory evidence", "brady v. maryland"],
  ["giglio_violation", "giglio material", "giglio violation", "impeachment evidence"],
  ["ineffective_assistance", "ineffective assistance", "strickland", "ineffective counsel"],
  ["speedy_trial", "speedy trial", "right to speedy trial", "speedy trial act"],
  ["double_jeopardy", "double jeopardy", "twice placed in jeopardy"],
  ["chain_of_custody", "chain of custody", "break in the chain"],
  ["hearsay", "hearsay", "hearsay exception", "out-of-court statement"],
  ["expert_testimony", "daubert", "frye", "expert witness", "expert testimony", "scientific evidence"],
  ["identification", "eyewitness identification", "show-up identification", "photographic lineup", "suggestive lineup"],
  ["confession", "involuntary confession", "coerced confession", "voluntariness"],
  ["jury_instruction", "jury instruction", "jury charge", "erroneous instruction"],
  ["prosecutorial_misconduct", "prosecutorial misconduct", "improper argument", "golden rule argument"],
  ["sufficiency_of_evidence", "sufficiency of the evidence", "insufficient evidence"],
  ["sentencing", "sentencing guidelines", "mitigating factor", "aggravating factor", "departure from guidelines"],
  ["jurisdiction", "subject matter jurisdiction", "personal jurisdiction", "venue"],
];

// ── Ruling direction signals ────────────────────────────────────────────────
const RULING_GRANTED = [
  "the motion is granted", "motion was granted", "motion granted", "granted the motion",
  "suppressed the evidence", "evidence was suppressed", "suppression was proper",
  "reversed on this ground", "reversed and remanded",
];
const RULING_DENIED = [
  "the motion is denied", "motion was denied", "motion denied", "denied the motion",
  "affirmed the denial", "properly denied", "no abuse of discretion in denying",
];

function extractFromText(text) {
  const lower = text.toLowerCase();
  const motions = new Set();
  const issues = new Set();
  const rulings = new Set();

  for (const [canonical, ...phrases] of MOTION_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) { motions.add(canonical); break; }
    }
  }
  for (const [canonical, ...phrases] of ISSUE_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) { issues.add(canonical); break; }
    }
  }
  for (const phrase of RULING_GRANTED) {
    if (lower.indexOf(phrase) >= 0) { rulings.add("granted"); break; }
  }
  for (const phrase of RULING_DENIED) {
    if (lower.indexOf(phrase) >= 0) { rulings.add("denied"); break; }
  }

  return {
    motion_types: Array.from(motions),
    legal_issues: Array.from(issues),
    supporting_rulings: Array.from(rulings),
  };
}

// ── HTML strip (no regex) ───────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return "";
  const parts = html.split("<");
  const out = [];
  for (const part of parts) {
    const closeIdx = part.indexOf(">");
    out.push(closeIdx >= 0 ? part.slice(closeIdx + 1) : part);
  }
  return out.join("").trim();
}

// ── SQL / Supabase ──────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    const inner = String(s).split('\\').join('\\\\').split('"').join('\\"');
    return `"${inner}"`;
  });
  const literal = `{${items.join(",")}}`;
  return `'${literal.split("'").join("''")}'::text[]`;
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

// ── Main ────────────────────────────────────────────────────────────────────

function logMem(label) {
  const m = process.memoryUsage();
  const mb = (b) => (b / 1024 / 1024).toFixed(0);
  process.stderr.write(`  [mem ${label}] rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}MB external=${mb(m.external)}MB\n`);
}

async function main() {
  console.log("=== BULK EXTRACT MOTION TYPES + LEGAL ISSUES (csv-parse) ===\n");

  // Crash diagnostics — catch silent deaths
  process.on("uncaughtException", (e) => { console.error(`UNCAUGHT: ${e.stack || e.message}`); process.exit(2); });
  process.on("unhandledRejection", (e) => { console.error(`UNHANDLED: ${e?.stack || e}`); process.exit(3); });

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      targetClusters.add(String(r.courtlistener_cluster_id));
    }
  }
  // Free the dump array — only the Set is needed
  dump.length = 0;

  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);
  logMem("post-dump");

  // Auto-detect pre-filtered CSV (seconds) vs full bz2 stream (hours).
  // Pre-filter created by: node scripts/prefilter-opinions-csv.mjs
  let csvStream;
  const filteredSize = fs.existsSync(OPINIONS_FILTERED) ? fs.statSync(OPINIONS_FILTERED).size : 0;
  if (filteredSize > 10000) {
    console.log(`Using pre-filtered CSV: ${OPINIONS_FILTERED}`);
    console.log(`  (${(fs.statSync(OPINIONS_FILTERED).size / 1024 / 1024).toFixed(1)} MB — will complete in seconds)\n`);
    csvStream = fs.createReadStream(OPINIONS_FILTERED);
  } else {
    const bzcatPath = findBzcat();
    console.log(`Streaming opinions CSV through bzcat + csv-parse (escape: \\\\)...`);
    console.log(`Using: ${bzcatPath}\n`);
    const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
    let bzcatStderr = "";
    bzcat.stderr.on("data", (d) => { bzcatStderr += d.toString().slice(0, 2000); });
    bzcat.on("error", (e) => console.error(`bzcat error: ${e.message}`));
    bzcat.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) console.error(`bzcat exited: code=${code} signal=${signal} stderr=${bzcatStderr.slice(0, 500)}`);
    });
    csvStream = bzcat.stdout;
  }

  const parser = csvStream.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));
  let rowCount = 0;
  parser.on("error", (e) => console.error(`csv-parse error at row ~${rowCount}: ${e.message}`));

  const results = new Map();
  let matchCount = 0;
  let withDataCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${withDataCount} extracted (${elapsed.toFixed(0)}s)\n`);
        logMem(`${(rowCount / 1000000).toFixed(1)}M`);
      }

      const clusterId = record.cluster_id;
      if (!clusterId || !targetClusters.has(clusterId)) continue;
      matchCount++;
      if (results.has(clusterId)) continue;

      let text = record.plain_text || "";
      if (text.length < 500) {
        const html = record.html_with_citations || record.html || record.html_columbia || "";
        if (html.length > 500) text = stripHtml(html);
      }
      if (text.length < 500) continue;

      const extracted = extractFromText(text);
      if (extracted.motion_types.length === 0 && extracted.legal_issues.length === 0) continue;

      results.set(clusterId, extracted);
      withDataCount++;
      if (withDataCount % 500 === 0) process.stdout.write(`  ${withDataCount} extractions...\n`);
      if (withDataCount >= limit) { bzcat.kill(); break; }
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Clusters with extractions: ${results.size}`);

  // Stats: how many clusters have each motion type
  const motionCounts = new Map();
  const issueCounts = new Map();
  for (const [, r] of results) {
    for (const m of r.motion_types) motionCounts.set(m, (motionCounts.get(m) || 0) + 1);
    for (const i of r.legal_issues) issueCounts.set(i, (issueCounts.get(i) || 0) + 1);
  }
  console.log(`\n--- Motion types found ---`);
  for (const [m, c] of [...motionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(30)} ${c}`);
  }
  console.log(`\n--- Legal issues found ---`);
  for (const [i, c] of [...issueCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${i.padEnd(30)} ${c}`);
  }

  // Always save extraction results as JSON cache (enables PostgREST apply without re-streaming)
  if (results.size > 0) {
    const cachePath = path.join(PROJECT_ROOT, "data", "bulk-verify", "motion-extraction-results.json");
    const cacheDir = path.dirname(cachePath);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const cacheObj = {};
    for (const [k, v] of results) cacheObj[k] = v;
    fs.writeFileSync(cachePath, JSON.stringify(cacheObj));
    console.log(`\nCached ${results.size} extractions → ${cachePath}`);
  }

  if (dryRun) { console.log(`\nDry run complete.`); return; }
  if (results.size === 0) { console.log("\nNo extractions to apply."); return; }

  // Build UPDATE statements — additive COALESCE pattern
  // Uses array_cat + DISTINCT to merge new signals with existing, no overwrites.
  const stmts = [];
  for (const [clusterId, r] of results) {
    const verificationUrl = `https://www.courtlistener.com/opinion/${clusterId}/`;

    let setParts = [];
    if (r.motion_types.length > 0) {
      setParts.push(`motion_types = (SELECT ARRAY(SELECT DISTINCT unnest(array_cat(COALESCE(motion_types, '{}'::text[]), ${escArrayLiteral(r.motion_types)}))))`);
    }
    if (r.legal_issues.length > 0) {
      setParts.push(`legal_issues = (SELECT ARRAY(SELECT DISTINCT unnest(array_cat(COALESCE(legal_issues, '{}'::text[]), ${escArrayLiteral(r.legal_issues)}))))`);
    }
    if (r.supporting_rulings.length > 0) {
      setParts.push(`supporting_rulings = (SELECT ARRAY(SELECT DISTINCT unnest(array_cat(COALESCE(supporting_rulings, '{}'::text[]), ${escArrayLiteral(r.supporting_rulings)}))))`);
    }
    setParts.push(`source_urls = array_cat(COALESCE(source_urls, '{}'::text[]), ${escArrayLiteral([verificationUrl])})`);

    const stmt = `UPDATE statute_case_law SET ${setParts.join(", ")} WHERE courtlistener_cluster_id = ${esc(clusterId)};`;
    stmts.push(stmt);
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "motion-legal-issue-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-extract-motion-legal-issues.mjs --apply`);
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
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} clusters — ${rate}/sec\n`);
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
  console.log(`Each cluster updates ALL rows sharing it (~3.8:1 row expansion).`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
