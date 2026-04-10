/**
 * Bulk Extract Co-Defendant Divergence Analysis from Opinions CSV
 *
 * Streams the 50 GB opinions CSV using csv-parse (with escape: "\\" for CL's
 * backslash-escaped quotes). For each opinion matching our cluster IDs,
 * scans plain_text for co-defendant signals and outcome divergences:
 *   1. co_defendant_signal detection — "co-defendant", "jointly charged", etc.
 *   2. outcome_diff extraction — one acquitted, other convicted, etc.
 *   3. divergence_factors — JSONB with primary/co-defendant outcomes + legal issues
 *
 * Stores verification source URL in source_urls[] per safety rule.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - co_defendant_analysis table created (migration applied)
 *   - npm install csv-parse
 *
 * IMPORTANT: Do not run while bulk-classify-from-opinions.mjs or bulk-extract-motion-legal-issues.mjs
 * are running. Both stream the same 50 GB CSV and would halve throughput + saturate bzcat CPU.
 *
 * Usage:
 *   node scripts/bulk-co-defendant-divergence-analyzer.mjs              # Generate SQL only
 *   node scripts/bulk-co-defendant-divergence-analyzer.mjs --apply      # Generate + apply
 *   node scripts/bulk-co-defendant-divergence-analyzer.mjs --dry-run    # Stats only
 *   node scripts/bulk-co-defendant-divergence-analyzer.mjs --limit 100  # First N matches
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

// ── Co-defendant detection signals ──────────────────────────────────────────
const CO_DEFENDANT_SIGNALS = [
  "co-defendant",
  "codefendant",
  "and [Name], defendants",
  "jointly charged",
  "jointly indicted",
  "tried together",
  "severed from",
  "companion case",
  "related case",
];

// ── Outcome signals ─────────────────────────────────────────────────────────
const ACQUITTAL_SIGNALS = [
  "acquitted",
  "not guilty",
  "dismissed",
  "acquittal",
];

const CONVICTION_SIGNALS = [
  "convicted",
  "found guilty",
  "guilty verdict",
  "conviction",
];

const PLEA_SIGNALS = [
  "plea",
  "pled guilty",
  "pleaded guilty",
  "plea of guilty",
];

const SENTENCING_SIGNALS = [
  "sentenced to",
  "sentence to",
  "term of imprisonment",
  "imposed sentence",
];

// ── Legal issue signals (subset for co-defendant context) ──────────────────
const LEGAL_ISSUES = [
  ["fourth_amendment", "fourth amendment", "search and seizure"],
  ["fifth_amendment", "fifth amendment", "miranda"],
  ["sixth_amendment", "sixth amendment", "right to counsel"],
  ["brady_violation", "brady violation", "brady material"],
  ["ineffective_assistance", "ineffective assistance", "strickland"],
  ["double_jeopardy", "double jeopardy"],
  ["hearsay", "hearsay"],
  ["sufficiency_of_evidence", "insufficient evidence", "sufficiency of the evidence"],
];

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

// ── Extract co-defendant data ───────────────────────────────────────────────

function detectCoDefendants(text) {
  if (!text || text.length < 500) return [];

  const lower = text.toLowerCase();
  const detections = [];

  for (const signal of CO_DEFENDANT_SIGNALS) {
    const sigLower = signal.toLowerCase();
    let idx = lower.indexOf(sigLower);
    while (idx >= 0) {
      const startIdx = Math.max(0, idx - 1500);
      const endIdx = Math.min(text.length, idx + 1500);
      const context = text.slice(startIdx, endIdx).trim();

      // Extract outcomes from context
      const contextLower = context.toLowerCase();
      let primaryOutcome = "unknown";
      let coDefendantOutcome = "unknown";

      // Try to detect outcome patterns
      for (const acq of ACQUITTAL_SIGNALS) {
        if (contextLower.indexOf(acq) >= 0) {
          const acqIdx = contextLower.indexOf(acq);
          if (acqIdx < idx - startIdx) primaryOutcome = "acquitted";
          else coDefendantOutcome = "acquitted";
          break;
        }
      }

      for (const conv of CONVICTION_SIGNALS) {
        if (contextLower.indexOf(conv) >= 0) {
          const convIdx = contextLower.indexOf(conv);
          if (convIdx < idx - startIdx) {
            if (primaryOutcome === "unknown") primaryOutcome = "convicted";
          } else {
            if (coDefendantOutcome === "unknown") coDefendantOutcome = "convicted";
          }
          break;
        }
      }

      for (const plea of PLEA_SIGNALS) {
        if (contextLower.indexOf(plea) >= 0) {
          const pleaIdx = contextLower.indexOf(plea);
          if (pleaIdx < idx - startIdx) {
            if (primaryOutcome === "unknown") primaryOutcome = "plea";
          } else {
            if (coDefendantOutcome === "unknown") coDefendantOutcome = "plea";
          }
          break;
        }
      }

      for (const sent of SENTENCING_SIGNALS) {
        if (contextLower.indexOf(sent) >= 0) {
          const sentIdx = contextLower.indexOf(sent);
          if (sentIdx < idx - startIdx) {
            if (primaryOutcome !== "acquitted") primaryOutcome = "sentenced";
          } else {
            if (coDefendantOutcome !== "acquitted") coDefendantOutcome = "sentenced";
          }
          break;
        }
      }

      // Extract legal issues from context
      const legalIssuesInContext = new Set();
      for (const [canonical, ...phrases] of LEGAL_ISSUES) {
        for (const phrase of phrases) {
          if (contextLower.indexOf(phrase.toLowerCase()) >= 0) {
            legalIssuesInContext.add(canonical);
            break;
          }
        }
      }

      // Only include if there's an actual divergence
      const hasDivergence = primaryOutcome !== "unknown" && coDefendantOutcome !== "unknown" && primaryOutcome !== coDefendantOutcome;

      if (hasDivergence) {
        detections.push({
          signal: signal,
          context,
          primaryOutcome,
          coDefendantOutcome,
          legalIssues: Array.from(legalIssuesInContext),
          divergenceText: `primary ${primaryOutcome}, co-defendant ${coDefendantOutcome}`,
        });
      }

      idx = lower.indexOf(sigLower, idx + 1);
    }
  }

  return detections;
}

// ── SQL / Supabase ──────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escJsonb(obj) {
  const json = JSON.stringify(obj);
  const escaped = json.split("'").join("''");
  return `'${escaped}'::jsonb`;
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

async function main() {
  console.log("=== BULK CO-DEFENDANT DIVERGENCE ANALYZER (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      targetClusters.add(String(r.courtlistener_cluster_id));
    }
  }
  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);

  const bzcatPath = findBzcat();
  console.log(`Streaming opinions CSV through bzcat + csv-parse (escape: \\\\)...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true,
  }));

  const results = new Map();
  let rowCount = 0;
  let matchCount = 0;
  let withDivergenceCount = 0;
  const startTime = Date.now();

  for await (const record of parser) {
    rowCount++;
    if (rowCount % 500000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${withDivergenceCount} with divergence (${elapsed.toFixed(0)}s)\n`);
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

    const detections = detectCoDefendants(text);
    if (detections.length === 0) continue;

    results.set(clusterId, detections);
    withDivergenceCount++;
    if (withDivergenceCount % 500 === 0) process.stdout.write(`  ${withDivergenceCount} cases with divergence...\n`);
    if (withDivergenceCount >= limit) { bzcat.kill(); break; }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Clusters with co-defendant divergence: ${results.size}`);

  // Stats: outcomes found
  const outcomeCounts = new Map();
  for (const [, detections] of results) {
    for (const d of detections) {
      const key = `${d.primaryOutcome} vs ${d.coDefendantOutcome}`;
      outcomeCounts.set(key, (outcomeCounts.get(key) || 0) + 1);
    }
  }
  console.log(`\n--- Outcome divergences found ---`);
  for (const [outcome, c] of [...outcomeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${outcome.padEnd(40)} ${c}`);
  }

  if (dryRun) { console.log(`\nDry run complete.`); return; }
  if (results.size === 0) { console.log("\nNo divergences to apply."); return; }

  // Build INSERT statements
  const stmts = [];
  for (const [clusterId, detections] of results) {
    const verificationUrl = `https://www.courtlistener.com/opinion/${clusterId}/`;

    for (const d of detections) {
      const divergenceFactors = {
        co_defendant_signal: d.signal,
        primary_outcome: d.primaryOutcome,
        co_defendant_outcome: d.coDefendantOutcome,
        legal_issues: d.legalIssues,
      };

      const stmt = `INSERT INTO co_defendant_analysis (primary_case_id, co_defendant_case_id, outcome_diff, divergence_factors, source_urls) VALUES (${esc(clusterId)}, NULL, ${esc(d.divergenceText)}, ${escJsonb(divergenceFactors)}, ARRAY[${esc(verificationUrl)}]::text[]) ON CONFLICT DO NOTHING;`;
      stmts.push(stmt);
    }
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "co-defendant-divergence-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-co-defendant-divergence-analyzer.mjs --apply`);
    return;
  }

  loadToken();
  console.log(`\n--- Applying ${stmts.length} inserts in batches of ${BATCH_SIZE} ---\n`);

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
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} inserts — ${rate}/sec\n`);
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
  console.log(`Inserts applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
