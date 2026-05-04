// ============================================================================
// DEPRECATED 2026-05-04 - DO NOT RUN. csv-parse over 50 GB opinions bz2 is
// broken: relax_quotes:true silently shifts trailing columns when legal text
// contains unquoted commas, corrupting cluster_id and other columns. Same bug
// class that broke T5, T6 smoke, and Phase 1 of bulk-master-extractor.
//
// REPLACEMENT (DB-first; uses cl_opinion_bodies, no parser):
//   node scripts/bulk-master-extractor.mjs --apply --tables judge_prosecutor_pairings
//
// Predecessor PRs: #309 (T6), #312 (Phase 1), #313 (Phase 0).
// To run anyway (emergency rollback only): pass --allow-deprecated.
// ============================================================================

/**
 * Bulk Judge-Prosecutor Pairing Matrix from Opinions
 *
 * Streams the 50 GB CourtListener opinions CSV and builds a judge-prosecutor
 * pairing matrix for the judge_prosecutor_pairings table. For each opinion
 * matching our cluster IDs, extracts:
 *   1. Judge ID (from author_id or judge_profiles name match)
 *   2. Prosecutor name (via title phrase scan + name extraction)
 *   3. Motion outcomes (granted vs. denied)
 *
 * Accumulates into a Map<judge_id+prosecutor_name+motion_type, {grant_count, deny_count, ...}>
 * Then computes grant_rate = grant_count / total and filters by sample_size >= 2.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - judge_prosecutor_pairings table with columns: judge_id, prosecutor_name, motion_type, grant_rate, sample_size, source_urls
 *   - npm install csv-parse
 *
 * IMPORTANT: Do not run while bulk-classify-from-opinions.mjs or bulk-extract-motion-legal-issues.mjs is running.
 * All three stream the same 50 GB CSV.
 *
 * Usage:
 *   node scripts/bulk-judge-prosecutor-pairing.mjs              # Generate SQL only
 *   node scripts/bulk-judge-prosecutor-pairing.mjs --apply      # Generate + apply
 *   node scripts/bulk-judge-prosecutor-pairing.mjs --dry-run    # Stats only
 *   node scripts/bulk-judge-prosecutor-pairing.mjs --limit 100  # First N matches
 */

// Deprecation guard - see banner above.
if (!process.argv.includes('--allow-deprecated')) {
  console.error('');
  console.error('[DEPRECATED] bulk-judge-prosecutor-pairing.mjs - see header banner.');
  console.error('  Use: node scripts/bulk-master-extractor.mjs --apply --tables judge_prosecutor_pairings');
  console.error('  To run anyway (emergency only): pass --allow-deprecated');
  console.error('');
  process.exit(1);
}

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

// ── Motion type signals for outcome tracking ────────────────────────────────
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

// ── Prosecutor title signals ────────────────────────────────────────────────
// Patterns to search for in lowercased text to find prosecutor mentions
const PROSECUTOR_PATTERNS = [
  "assistant district attorney ",
  "assistant state attorney ",
  "assistant united states attorney ",
  "prosecutor ",
  "district attorney ",
  "state attorney ",
  "ada ",
  "ausa ",
  "the state, represented by ",
  "the government, represented by ",
];

// ── Judge profiles cache ────────────────────────────────────────────────────
let judgeProfiles = null;

async function loadJudgeProfiles() {
  if (judgeProfiles) return judgeProfiles;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || (() => {
    const line = fs.readFileSync(path.resolve(PROJECT_ROOT, ".env.local"), "utf8").split("\n").find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) || "";
    return line.split("=").slice(1).join("=").trim();
  })();

  console.log("Loading judge profiles...");

  // PostgREST silently caps at 1000 rows regardless of ?limit= value.
  // Must paginate via Range header to load all 15,000+ judges.
  const PAGE_SIZE = 1000;
  const allJudges = [];
  let offset = 0;

  while (true) {
    const page = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
        path: "/rest/v1/judge_profiles?select=id,full_name&order=id",
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
          Prefer: "count=exact",
        },
      }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400 && res.statusCode !== 416) {
            reject(new Error(`Judge load ${res.statusCode}: ${data.slice(0, 200)}`));
          } else if (res.statusCode === 416) {
            resolve([]);
          } else {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          }
        });
      });
      req.on("error", reject);
      req.end();
    });

    if (page.length === 0) break;
    allJudges.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  judgeProfiles = allJudges;
  console.log(`Loaded ${judgeProfiles.length} judge profiles`);
  return judgeProfiles;
}

// ── Extract motion outcomes from text ────────────────────────────────────────
function extractMotionOutcomes(text) {
  const lower = text.toLowerCase();
  const motions = new Set();
  const outcomes = {};

  // Find mentioned motion types
  for (const [canonical, ...phrases] of MOTION_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) { motions.add(canonical); break; }
    }
  }

  // For each motion mentioned, determine if granted or denied
  for (const motion of motions) {
    let granted = false, denied = false;

    for (const phrase of RULING_GRANTED) {
      if (lower.indexOf(phrase) >= 0) { granted = true; break; }
    }
    for (const phrase of RULING_DENIED) {
      if (lower.indexOf(phrase) >= 0) { denied = true; break; }
    }

    outcomes[motion] = { granted, denied };
  }

  return outcomes;
}

// ── Extract prosecutor name from text ────────────────────────────────────────
// Scans for prosecutor titles, then extracts the name that follows
function extractProsecutors(text) {
  const lower = text.toLowerCase();
  const prosecutors = new Set();

  for (const pattern of PROSECUTOR_PATTERNS) {
    let idx = lower.indexOf(pattern);
    while (idx >= 0) {
      // Skip the pattern, find the start of the name
      const nameStart = idx + pattern.length;
      let nameEnd = nameStart;

      // Read until punctuation or lowercase letter (2+ chars starting with uppercase)
      while (nameEnd < text.length) {
        const char = text[nameEnd];
        if (char === "," || char === "." || char === ";") break;
        if (char === " " && nameEnd > nameStart + 2) {
          // Check if next char is lowercase
          if (nameEnd + 1 < text.length && text[nameEnd + 1] === text[nameEnd + 1].toLowerCase()) break;
        }
        nameEnd++;
      }

      const name = text.slice(nameStart, nameEnd).trim();
      if (name.length >= 2 && name[0] === name[0].toUpperCase()) {
        prosecutors.add(name);
      }

      idx = lower.indexOf(pattern, idx + 1);
    }
  }

  return Array.from(prosecutors);
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

async function main() {
  console.log("=== BULK JUDGE-PROSECUTOR PAIRING MATRIX (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  const clusterToId = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      const clusterId = String(r.courtlistener_cluster_id);
      targetClusters.add(clusterId);
      if (!clusterToId.has(clusterId)) clusterToId.set(clusterId, r.id);
    }
  }
  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);

  // Load judge profiles for name matching
  let profiles = [];
  if (!dryRun) {
    try {
      profiles = await loadJudgeProfiles();
    } catch (e) {
      console.warn(`Warning: could not load judge profiles: ${e.message}`);
    }
  }

  const profilesByName = new Map();
  for (const p of profiles) {
    if (p.full_name) profilesByName.set(p.full_name.toLowerCase(), p.id);
  }

  const bzcatPath = findBzcat();
  console.log(`Streaming opinions CSV through bzcat + csv-parse (escape: \\\\)...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  // Accumulate: Map<judge_id+prosecutor_name+motion_type, {grant_count, deny_count, clusters: Set}>
  const pairings = new Map();
  let rowCount = 0;
  let matchCount = 0;
  let extractCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${extractCount} pairs (${elapsed.toFixed(0)}s)\n`);
      }

      const clusterId = record.cluster_id;
      if (!clusterId || !targetClusters.has(clusterId)) continue;
      matchCount++;

      let text = record.plain_text || "";
      if (text.length < 500) {
        const html = record.html_with_citations || record.html || record.html_columbia || "";
        if (html.length > 500) text = stripHtml(html);
      }
      if (text.length < 500) continue;

      // Extract judge: try author_id first, then name match
      let judgeId = record.author_id ? String(record.author_id) : null;
      if (!judgeId && record.judge_name) {
        judgeId = profilesByName.get(record.judge_name.toLowerCase()) || null;
      }
      if (!judgeId) continue;

      // Extract prosecutors
      const prosecutors = extractProsecutors(text);
      if (prosecutors.length === 0) continue;

      // Extract motion outcomes
      const outcomes = extractMotionOutcomes(text);
      if (Object.keys(outcomes).length === 0) continue;

      // Accumulate pairings
      for (const prosecutor of prosecutors) {
        for (const [motionType, outcome] of Object.entries(outcomes)) {
          const key = `${judgeId}|${prosecutor}|${motionType}`;
          if (!pairings.has(key)) {
            pairings.set(key, { grant_count: 0, deny_count: 0, clusters: new Set() });
          }
          const p = pairings.get(key);
          if (outcome.granted) p.grant_count++;
          if (outcome.denied) p.deny_count++;
          p.clusters.add(clusterId);
        }
      }

      extractCount++;
      if (extractCount % 500 === 0) process.stdout.write(`  ${extractCount} pairings...\n`);
      if (extractCount >= limit) { bzcat.kill(); break; }
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Unique pairings: ${pairings.size}`);

  // Filter to sample_size >= 2 and compute grant rates
  const filtered = [];
  for (const [key, data] of pairings) {
    const sample_size = data.grant_count + data.deny_count;
    if (sample_size >= 2) {
      const [judgeId, prosecutor, motionType] = key.split("|");
      filtered.push({
        judge_id: judgeId,
        prosecutor_name: prosecutor,
        motion_type: motionType,
        grant_rate: data.grant_count / sample_size,
        sample_size,
        clusters: data.clusters,
      });
    }
  }

  console.log(`\nFiltered to sample_size >= 2: ${filtered.length} pairings`);

  // Stats by motion type
  const byMotion = new Map();
  for (const p of filtered) {
    byMotion.set(p.motion_type, (byMotion.get(p.motion_type) || 0) + 1);
  }
  console.log(`\n--- Pairings by motion type ---`);
  for (const [m, c] of [...byMotion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(30)} ${c}`);
  }

  if (dryRun) { console.log(`\nDry run complete.`); return; }
  if (filtered.length === 0) { console.log("\nNo pairings to apply."); return; }

  // Build INSERT statements
  const stmts = [];
  for (const pairing of filtered) {
    const urls = Array.from(pairing.clusters).map(cid => `https://www.courtlistener.com/opinion/${cid}/`);
    const stmt = `INSERT INTO judge_prosecutor_pairings (judge_id, prosecutor_name, motion_type, grant_rate, sample_size, source_urls) VALUES (${esc(pairing.judge_id)}, ${esc(pairing.prosecutor_name)}, ${esc(pairing.motion_type)}, ${pairing.grant_rate}, ${pairing.sample_size}, ${escArrayLiteral(urls)}) ON CONFLICT DO NOTHING;`;
    stmts.push(stmt);
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "judge-prosecutor-pairing-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-judge-prosecutor-pairing.mjs --apply`);
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
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} pairings, ${rate}/sec\n`);
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
  console.log(`Pairings applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
