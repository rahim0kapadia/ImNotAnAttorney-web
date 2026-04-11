/**
 * Bulk Good-Law from Citation Graph — Lissner/FLP recommended pattern
 *
 * Uses CL bulk data instead of API calls for is_good_law verification.
 * Per Mike Lissner (Free Law Project), the canonical pattern is:
 *   1. Look up citing opinions in the citation-map (graph)
 *   2. Read each citing opinion's plain_text from the opinions CSV
 *   3. Scan ±6 sentences around the citation for negative treatment signals
 *
 * Runtime: ~3 hours total (2x opinions CSV stream + citation-map + scan).
 * Compared to ~10.8 hours of API loop with 750ms rate-limit pacing.
 *
 * Phases (each saves intermediate state, so the script can resume after a crash):
 *   PHASE 1: Stream opinions CSV → cluster_id → [opinion_ids] map
 *            Saves: data/bulk-verify/good-law-graph/cluster-opinion-map.json
 *   PHASE 2: Stream citation-map → target_opinion_id → [citing_opinion_ids]
 *            Saves: data/bulk-verify/good-law-graph/citing-graph.json
 *   PHASE 3: Stream opinions CSV (pass 2) → save plain_text for citing opinions
 *            Saves: data/bulk-verify/good-law-graph/citing-texts.jsonl
 *   PHASE 4: For each cluster: scan citing opinions for negative treatment
 *            → bulk UPDATE statute_case_law SET is_good_law WHERE courtlistener_cluster_id = X
 *
 * Usage:
 *   node scripts/bulk-good-law-from-graph.mjs --phase 1     # Just phase 1
 *   node scripts/bulk-good-law-from-graph.mjs --phase 2     # Just phase 2
 *   node scripts/bulk-good-law-from-graph.mjs --phase 3     # Just phase 3
 *   node scripts/bulk-good-law-from-graph.mjs --phase 4 --apply
 *   node scripts/bulk-good-law-from-graph.mjs --all --apply # Run all phases
 *   node scripts/bulk-good-law-from-graph.mjs --phase 4 --dry-run  # Stats only
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

const BULK_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "cl-bulk");
const STATE_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "good-law-graph");
const OPINIONS_BZ2 = path.join(BULK_DIR, "opinions-2026-03-31.csv.bz2");
const CITATION_MAP_BZ2 = path.join(BULK_DIR, "citation-map-2026-03-31.csv.bz2");

const DUMP_FILE = path.join(PROJECT_ROOT, "data", "bulk-verify", "statute-case-law-dump.json");
const CLUSTER_OPINION_MAP_FILE = path.join(STATE_DIR, "cluster-opinion-map.json");
const CITING_GRAPH_FILE = path.join(STATE_DIR, "citing-graph.json");
const CITING_TEXTS_FILE = path.join(STATE_DIR, "citing-texts.jsonl");

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

const args = process.argv.slice(2);
const phaseIdx = args.indexOf("--phase");
const phase = phaseIdx >= 0 ? parseInt(args[phaseIdx + 1], 10) : null;
const runAll = args.includes("--all");
const applyMode = args.includes("--apply");
const dryRun = args.includes("--dry-run");

// ── SQL helpers ─────────────────────────────────────────────────────────────

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

function findBzcat() {
  const candidates = [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bzcat.exe",
    "bzcat",
  ];
  for (const p of candidates) {
    if (p === "bzcat") return p;
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return "bzcat";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Supabase ────────────────────────────────────────────────────────────────

let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
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
        if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── CSV streaming via csv-parse ────────────────────────────────────────────
// Canonical CL CSV pattern: csv-parse with escape: "\\" for backslash-escaped quotes.
// Replaces broken hand-rolled parsers (isRowStart, quote-counting) that failed on
// multi-line HTML content with embedded commas/quotes.

// ── PHASE 1: Build cluster_id → opinion_ids map ─────────────────────────────

async function phase1() {
  console.log("\n=== PHASE 1: opinions CSV → cluster_id → opinion_ids map ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) {
    console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`ERROR: dump not found: ${DUMP_FILE} (run bulk-dump-cases.mjs)`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  for (const r of dump) {
    if (r.courtlistener_cluster_id && r.is_good_law === null) {
      targetClusters.add(String(r.courtlistener_cluster_id));
    }
  }
  console.log(`Target clusters needing is_good_law: ${targetClusters.size}`);

  const clusterToOpinions = new Map();
  let matchCount = 0;
  let rowCount = 0;
  const startTime = Date.now();

  const bzcat1 = spawn(findBzcat(), [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat1.stderr.on("data", () => {});
  const parser1 = bzcat1.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  try {
    for await (const record of parser1) {
      rowCount++;
      if (rowCount % 1000000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matches (${elapsed.toFixed(0)}s)\n`);
      }

      const clusterId = record.cluster_id;
      if (!clusterId || !targetClusters.has(clusterId)) continue;

      const opinionId = record.id;
      if (!clusterToOpinions.has(clusterId)) {
        clusterToOpinions.set(clusterId, new Set());
      }
      clusterToOpinions.get(clusterId).add(opinionId);
      matchCount++;
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat1.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nPhase 1 complete in ${elapsed.toFixed(0)}s`);
  console.log(`Clusters mapped:   ${clusterToOpinions.size}/${targetClusters.size}`);
  console.log(`Total opinions:    ${matchCount}`);

  const out = {};
  for (const [clusterId, opSet] of clusterToOpinions) {
    out[clusterId] = Array.from(opSet);
  }
  fs.writeFileSync(CLUSTER_OPINION_MAP_FILE, JSON.stringify(out));
  console.log(`Saved: ${CLUSTER_OPINION_MAP_FILE}`);
}

// ── PHASE 2: Stream citation-map → build citing graph ───────────────────────

async function phase2() {
  console.log("\n=== PHASE 2: citation-map → citing graph ===\n");

  if (!fs.existsSync(CITATION_MAP_BZ2)) {
    console.error(`ERROR: citation-map not found: ${CITATION_MAP_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(CLUSTER_OPINION_MAP_FILE)) {
    console.error(`ERROR: phase 1 output not found. Run --phase 1 first.`);
    process.exit(1);
  }

  const clusterToOpinions = JSON.parse(fs.readFileSync(CLUSTER_OPINION_MAP_FILE, "utf8"));
  const targetOpinions = new Set();
  for (const opIds of Object.values(clusterToOpinions)) {
    for (const id of opIds) targetOpinions.add(String(id));
  }
  console.log(`Target opinions to check (cited_opinion_id): ${targetOpinions.size}`);

  const citingByTarget = new Map();
  const startTime = Date.now();
  let matchCount = 0;
  let rowCount = 0;

  const bzcat2 = spawn(findBzcat(), [CITATION_MAP_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat2.stderr.on("data", () => {});
  const parser2 = bzcat2.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  try {
    for await (const record of parser2) {
      rowCount++;
      if (rowCount % 1000000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} citation matches (${elapsed.toFixed(0)}s)\n`);
      }

      const cited = record.cited_opinion_id;
      if (!cited || !targetOpinions.has(cited)) continue;
      const citing = record.citing_opinion_id;
      if (!citing) continue;

      if (!citingByTarget.has(cited)) citingByTarget.set(cited, new Set());
      citingByTarget.get(cited).add(citing);
      matchCount++;
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat2.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nPhase 2 complete in ${elapsed.toFixed(0)}s`);
  console.log(`Matches:           ${matchCount}`);
  console.log(`Targets w/ citers: ${citingByTarget.size}/${targetOpinions.size}`);

  const out = {};
  for (const [target, set] of citingByTarget) out[target] = Array.from(set);
  fs.writeFileSync(CITING_GRAPH_FILE, JSON.stringify(out));
  console.log(`Saved: ${CITING_GRAPH_FILE}`);
}

// ── PHASE 3: Stream opinions CSV pass 2 → save citing texts ─────────────────

async function phase3() {
  console.log("\n=== PHASE 3: opinions CSV → citing opinion texts ===\n");

  if (!fs.existsSync(CITING_GRAPH_FILE)) {
    console.error(`ERROR: phase 2 output not found. Run --phase 2 first.`);
    process.exit(1);
  }

  const citingByTarget = JSON.parse(fs.readFileSync(CITING_GRAPH_FILE, "utf8"));
  const citingSet = new Set();
  for (const arr of Object.values(citingByTarget)) {
    for (const id of arr) citingSet.add(String(id));
  }
  console.log(`Citing opinions to fetch: ${citingSet.size}`);

  const out = fs.createWriteStream(CITING_TEXTS_FILE);
  let matchCount = 0;
  let rowCount = 0;
  const startTime = Date.now();

  const bzcat3 = spawn(findBzcat(), [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat3.stderr.on("data", () => {});
  const parser3 = bzcat3.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  try {
    for await (const record of parser3) {
      rowCount++;
      if (rowCount % 1000000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} texts saved (${elapsed.toFixed(0)}s)\n`);
      }

      const opinionId = record.id;
      if (!opinionId || !citingSet.has(opinionId)) continue;

      const plainText = record.plain_text || "";
      if (plainText.length === 0) continue;

      // Cap text length at 50KB to keep output manageable
      out.write(JSON.stringify({ id: opinionId, text: plainText.slice(0, 50000) }) + "\n");
      matchCount++;
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat3.kill(); } catch {}
  }

  out.end();
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nPhase 3 complete in ${elapsed.toFixed(0)}s`);
  console.log(`Citing texts saved: ${matchCount}/${citingSet.size}`);
  console.log(`File: ${CITING_TEXTS_FILE}`);
}

// ── PHASE 4: Scan + apply ───────────────────────────────────────────────────

const NEGATIVE_TREATMENT_SIGNALS = [
  "overruled", "overrule ", "overruling",
  "abrogated", "abrogating", "abrogate ",
  "superseded", "supersede ", "superseding",
  "receded from", "recede from",
  "no longer good law", "is no longer the law",
  "rejecting the holding", "expressly disapproved",
  "we disapprove",
];

async function phase4() {
  console.log("\n=== PHASE 4: scan + apply ===\n");

  for (const f of [CLUSTER_OPINION_MAP_FILE, CITING_GRAPH_FILE, CITING_TEXTS_FILE, DUMP_FILE]) {
    if (!fs.existsSync(f)) {
      console.error(`ERROR: required file missing: ${f}`);
      process.exit(1);
    }
  }

  const clusterToOpinions = JSON.parse(fs.readFileSync(CLUSTER_OPINION_MAP_FILE, "utf8"));
  const citingByTarget = JSON.parse(fs.readFileSync(CITING_GRAPH_FILE, "utf8"));

  console.log("Loading citing texts into memory...");
  const citingTexts = new Map();
  const lines = fs.readFileSync(CITING_TEXTS_FILE, "utf8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const { id, text } = JSON.parse(line);
      citingTexts.set(String(id), text);
    } catch {}
  }
  console.log(`Citing texts loaded: ${citingTexts.size}`);

  // Build cluster → case_name + citation map from dump
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const clusterMeta = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id && r.is_good_law === null) {
      const cid = String(r.courtlistener_cluster_id);
      if (!clusterMeta.has(cid)) {
        clusterMeta.set(cid, { case_name: r.case_name, citation: r.citation });
      }
    }
  }

  const results = [];
  let goodCount = 0, badCount = 0, unverifiedCount = 0;

  for (const [clusterId, opinionIds] of Object.entries(clusterToOpinions)) {
    const meta = clusterMeta.get(clusterId);
    if (!meta) continue;

    const citingIds = new Set();
    for (const opId of opinionIds) {
      const citers = citingByTarget[opId] || [];
      for (const c of citers) citingIds.add(String(c));
    }

    if (citingIds.size === 0) {
      // No citing opinions = nothing has overruled it
      results.push({ clusterId, isGoodLaw: true, treatment: null, checkedCount: 0 });
      goodCount++;
      continue;
    }

    let foundNegative = null;
    let textsChecked = 0;
    for (const citingId of citingIds) {
      const text = citingTexts.get(citingId);
      if (!text) continue;
      textsChecked++;

      const lower = text.toLowerCase();
      const caseName = (meta.case_name || "").toLowerCase();
      const citation = (meta.citation || "").toLowerCase();

      // Find a mention of our case in the citing opinion
      let mentionIdx = -1;
      if (caseName && caseName.length > 5) {
        mentionIdx = lower.indexOf(caseName);
      }
      if (mentionIdx < 0 && citation && citation.length > 3) {
        mentionIdx = lower.indexOf(citation);
      }
      if (mentionIdx < 0) continue;

      // ±1500 chars window ≈ ±6 sentences
      const winStart = Math.max(0, mentionIdx - 1500);
      const winEnd = Math.min(lower.length, mentionIdx + 1500);
      const window = lower.slice(winStart, winEnd);

      for (const signal of NEGATIVE_TREATMENT_SIGNALS) {
        if (window.indexOf(signal) >= 0) {
          foundNegative = {
            signal,
            citingId,
            snippet: text.slice(winStart, Math.min(winEnd, winStart + 400)),
          };
          break;
        }
      }
      if (foundNegative) break;
    }

    if (foundNegative) {
      results.push({
        clusterId,
        isGoodLaw: false,
        treatment: `${foundNegative.signal} in citing opinion ${foundNegative.citingId}`,
        checkedCount: textsChecked,
      });
      badCount++;
    } else if (textsChecked > 0) {
      results.push({ clusterId, isGoodLaw: true, treatment: null, checkedCount: textsChecked });
      goodCount++;
    } else {
      results.push({ clusterId, isGoodLaw: null, treatment: null, checkedCount: 0 });
      unverifiedCount++;
    }
  }

  console.log(`\n--- Phase 4 Analysis ---`);
  console.log(`Clusters processed:  ${results.length}`);
  console.log(`Good law:            ${goodCount}`);
  console.log(`Bad law:             ${badCount}`);
  console.log(`Unverified:          ${unverifiedCount}`);

  if (dryRun) {
    console.log(`\nDry run — no SQL applied.`);
    return;
  }

  if (!applyMode) {
    console.log(`\nNot applying. Pass --apply to write changes.`);
    return;
  }

  loadToken();
  const decided = results.filter(r => r.isGoodLaw !== null);
  console.log(`\n--- Applying ${decided.length} updates in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < decided.length; i += BATCH_SIZE) {
    const batch = decided.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(decided.length / BATCH_SIZE);

    const stmts = batch.map(r => {
      const url1 = `https://www.courtlistener.com/api/rest/v4/clusters/${r.clusterId}/`;
      const urls = [url1];
      if (r.isGoodLaw === false && r.treatment) {
        const citingMatch = r.treatment.split("opinion ")[1];
        if (citingMatch) urls.push(`https://www.courtlistener.com/opinion/${citingMatch}/`);
      }

      const treatmentSql = r.treatment
        ? `, negative_treatment = ${esc(r.treatment.slice(0, 500))}`
        : "";

      return `UPDATE statute_case_law SET ` +
        `is_good_law = ${r.isGoodLaw ? "true" : "false"}, ` +
        `source_urls = array_cat(COALESCE(source_urls, '{}'::text[]), ${escArrayLiteral(urls)}), ` +
        `negative_treatment_checked_at = NOW(), ` +
        `verified_at = NOW()${treatmentSql} ` +
        `WHERE courtlistener_cluster_id = ${esc(r.clusterId)} AND is_good_law IS NULL;`;
    }).join("\n");

    try {
      await supabaseQuery(stmts);
      applied += batch.length;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (applied / elapsed).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} clusters — ${rate}/sec\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
    }
    if (i + BATCH_SIZE < decided.length) await sleep(500);
  }

  console.log(`\n--- Phase 4 Apply Results ---`);
  console.log(`Clusters applied: ${applied}`);
  console.log(`Errors:           ${errors}`);
  console.log(`Note: each cluster updates ALL statute_case_law rows sharing it (~3.8:1 expansion).`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (runAll) {
    await phase1();
    await phase2();
    await phase3();
    await phase4();
  } else if (phase === 1) {
    await phase1();
  } else if (phase === 2) {
    await phase2();
  } else if (phase === 3) {
    await phase3();
  } else if (phase === 4) {
    await phase4();
  } else {
    console.log("Usage: --phase {1|2|3|4} or --all");
    console.log("  Phase 1: opinions CSV → cluster→opinion map (~30 min)");
    console.log("  Phase 2: citation-map → citing graph (~2 min)");
    console.log("  Phase 3: opinions CSV → citing texts (~60 min)");
    console.log("  Phase 4: scan + apply (use --apply) (~5 min)");
    process.exit(1);
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
