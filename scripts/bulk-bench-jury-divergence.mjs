/**
 * Bulk Bench vs Jury Trial Divergence Analysis
 *
 * Streams the 50 GB opinions CSV and computes acquittal rate divergence
 * between bench and jury trials per judge + charge combination.
 *
 * For each opinion:
 *   1. Classify trial type (bench/jury/null) via plain_text signal matching
 *   2. Extract outcome (acquittal/conviction/dismissal/null)
 *   3. Match opinion author to judge in judge_profiles
 *   4. Record: { trial_type, outcome, judge_id, charge_slug, cluster_id }
 *
 * Then compute divergence:
 *   - Group by judge_id + charge_slug
 *   - bench_acquittal_rate = bench_acquittals / bench_total
 *   - jury_acquittal_rate = jury_acquittals / jury_total
 *   - Only include groups with bench_sample >= 1 AND jury_sample >= 1
 *
 * Applies via:
 *   INSERT INTO bench_jury_divergence (judge_id, charge_slug, bench_acquittal_rate, jury_acquittal_rate, bench_sample, jury_sample, source_urls)
 *   UPDATE judge_profiles SET bench_acquittal_rate = X, jury_acquittal_rate = Y WHERE id = '...'
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - npm install csv-parse
 *   - .env.local with SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN
 *
 * Usage:
 *   node scripts/bulk-bench-jury-divergence.mjs              # Generate SQL only
 *   node scripts/bulk-bench-jury-divergence.mjs --apply      # Generate + apply
 *   node scripts/bulk-bench-jury-divergence.mjs --dry-run    # Stats only
 *   node scripts/bulk-bench-jury-divergence.mjs --limit 100  # First N matches
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

// ── Trial type + outcome signals ────────────────────────────────────────────

const BENCH_SIGNALS = [
  "bench trial",
  "non-jury trial",
  "tried without a jury",
  "tried to the court",
  "court trial",
  "waived jury",
  "waiver of jury",
  "stipulated bench trial",
];

const JURY_SIGNALS = [
  "jury trial",
  "tried before a jury",
  "jury returned a verdict",
  "jury found",
  "jury convicted",
  "jury acquitted",
  "the jury",
  "jury deliberat",
];

const ACQUITTAL_SIGNALS = [
  "acquitted",
  "not guilty",
  "judgment of acquittal",
  "directed verdict",
];

const CONVICTION_SIGNALS = [
  "convicted",
  "found guilty",
  "guilty verdict",
];

const DISMISSAL_SIGNALS = [
  "dismissed",
  "nolle prosequi",
  "nol pros",
];

// ── Extract trial JUDGE name from opinion preamble ─────────────────────────
// Appellate opinions name the trial judge in the first ~1500 chars.
// author_id/author_str = appellate judge who WROTE the opinion (wrong for us).
// We need the trial judge whose bench/jury behavior is being reviewed.

// Patterns by jurisdiction (priority order, most specific first):
// FL:  "Appeal from the Circuit Court for Broward County; N. Hunter Davis, Judge;"
// FL:  "Barbara K. Hobbs, Judge." (standalone line)
// NY:  "(Christopher J. Burns, J.)" or "(Burns, J.)"
// General: "the Honorable [Name], Judge" / "Before the Honorable [Name]"
// General: "presiding judge [Name]" / "Judge [Name] presiding"
// General: "trial court judge [Name]" / "trial judge [Name]"

function extractTrialJudge(text) {
  // Only scan preamble, body text mentions many judges, causing false positives
  const preamble = text.slice(0, 1500).toLowerCase();

  // Pattern 1: FL-style, "County; [Name], Judge;" or "[Name], Judge."
  // Match "Name, Judge" where Name is 2-4 capitalized words before ", judge"
  const flMatch = preamble.match(/([a-z][a-z.''-]+(?:\s+[a-z][a-z.''-]+){1,4}),\s*judge[.;\s]/i);
  if (flMatch) {
    const name = flMatch[1].trim();
    // Filter out false positives (court names, generic phrases)
    if (!name.match(/circuit|county|district|court|appeal|supreme|state|united/i)) {
      return name;
    }
  }

  // Pattern 2: NY-style, "(Name, J.)" parenthetical
  const nyMatch = preamble.match(/\(([a-z][a-z.''-]+(?:\s+[a-z][a-z.''-]+){0,3}),\s*j\.\)/i);
  if (nyMatch) {
    const name = nyMatch[1].trim();
    if (!name.match(/circuit|county|district|court|appeal|supreme|state/i)) {
      return name;
    }
  }

  // Pattern 3: "the honorable [Name]", very common across states
  const honMatch = preamble.match(/(?:the\s+)?honorable\s+([a-z][a-z.''-]+(?:\s+[a-z][a-z.''-]+){1,4})/i);
  if (honMatch) {
    const name = honMatch[1].trim();
    // Strip trailing ", judge" or ", circuit judge" etc
    const cleaned = name.replace(/,\s*(circuit\s+)?judge.*$/i, "").trim();
    if (!cleaned.match(/circuit|county|district|court|appeal|supreme|state/i) && cleaned.length > 3) {
      return cleaned;
    }
  }

  // Pattern 4: "presiding judge [Name]" / "trial judge [Name]" / "trial court judge [Name]"
  const trialMatch = preamble.match(/(?:presiding|trial(?:\s+court)?)\s+judge\s+([a-z][a-z.''-]+(?:\s+[a-z][a-z.''-]+){0,4})/i);
  if (trialMatch) {
    const name = trialMatch[1].trim();
    // Strip trailing comma/period but preserve middle initials (e.g. "William T. Moore")
    const cleaned = name.replace(/,\s*$/, "").replace(/\.\s*$/, "").trim();
    if (cleaned.length > 3) return cleaned;
  }

  // Pattern 5: "judge [Name] presiding", common in many states
  const presidingMatch = preamble.match(/judge\s+([a-z][a-z.''-]+(?:\s+[a-z][a-z.''-]+){0,4})\s+presiding/i);
  if (presidingMatch) {
    const name = presidingMatch[1].trim();
    const cleaned = name.replace(/,\s*$/, "").replace(/\.\s*$/, "").trim();
    if (!cleaned.match(/circuit|county|district|court/i) && cleaned.length > 3) return cleaned;
  }

  // Pattern 6: "the trial court, Judge [Name],", inline mention
  const inlineMatch = preamble.match(/(?:the\s+)?trial\s+court,?\s+judge\s+([a-z][a-z.''-]+(?:\s+[a-z][a-z.''-]+){0,4})/i);
  if (inlineMatch) {
    const name = inlineMatch[1].trim();
    const cleaned = name.replace(/,.*$/, "").replace(/\s+presiding.*$/i, "").trim();
    if (!cleaned.match(/circuit|county|district|court/i) && cleaned.length > 3) return cleaned;
  }

  return null;
}

// Normalize judge name for matching: lowercase, strip titles, collapse whitespace
function normalizeJudgeName(name) {
  return name
    .toLowerCase()
    .replace(/^(hon\.?|honorable|judge|justice|chief justice)\s+/gi, "")
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/gi, (m) => m) // keep suffixes
    .replace(/\s+/g, " ")
    .trim();
}

// ── Extract trial classification from text ──────────────────────────────────

function classifyTrial(text) {
  const lower = text.toLowerCase();

  let trialType = null;
  for (const sig of BENCH_SIGNALS) {
    if (lower.indexOf(sig) >= 0) { trialType = "bench"; break; }
  }
  if (!trialType) {
    for (const sig of JURY_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { trialType = "jury"; break; }
    }
  }

  let outcome = null;
  for (const sig of ACQUITTAL_SIGNALS) {
    if (lower.indexOf(sig) >= 0) { outcome = "acquittal"; break; }
  }
  if (!outcome) {
    for (const sig of CONVICTION_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { outcome = "conviction"; break; }
    }
  }
  if (!outcome) {
    for (const sig of DISMISSAL_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { outcome = "dismissal"; break; }
    }
  }

  return { trialType, outcome };
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
  // SUPABASE_ACCESS_TOKEN lives in the parent repo, not the web repo
  const parentEnvPath = path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local");
  const envPath = fs.existsSync(parentEnvPath) ? parentEnvPath : path.resolve(PROJECT_ROOT, ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.split("=").slice(1).join("=").trim();
      break;
    }
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

// ── Load judge profiles ─────────────────────────────────────────────────────

async function loadJudgeProfiles() {
  const envContent = fs.readFileSync(path.resolve(PROJECT_ROOT, ".env.local"), "utf8");
  const serviceRoleKey = envContent
    .split("\n")
    .find(line => line.startsWith("SUPABASE_SERVICE_ROLE_KEY="))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim();

  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not found in .env.local");

  // PostgREST silently caps at 1000 rows regardless of ?limit= value.
  // Must paginate via Range header to load all 15,613+ judges.
  const PAGE_SIZE = 1000;
  const allJudges = [];
  let offset = 0;

  while (true) {
    const page = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
        path: "/rest/v1/judge_profiles?select=id,full_name,cl_person_id&order=id",
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
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
            // Range not satisfiable, no more rows
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

  return allJudges;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK BENCH VS JURY DIVERGENCE ANALYSIS ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Set();
  const clusterToCharges = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      const clusterId = String(r.courtlistener_cluster_id);
      targetClusters.add(clusterId);
      if (!clusterToCharges.has(clusterId)) {
        clusterToCharges.set(clusterId, []);
      }
      if (r.charge_slug) {
        clusterToCharges.get(clusterId).push(r.charge_slug);
      }
    }
  }
  console.log(`Target clusters: ${targetClusters.size}`);

  // Load judge profiles for name matching
  console.log(`Loading judge profiles...`);
  let judges = [];
  if (!dryRun) {
    judges = await loadJudgeProfiles();
    console.log(`Loaded ${judges.length} judges`);
  }

  const judgeByNameLower = new Map();
  const judgeByLastName = new Map(); // last name -> [{id, full}] for partial match
  const judgeByClPersonId = new Map();
  for (const j of judges) {
    const nameLower = (j.full_name || "").toLowerCase().trim();
    if (nameLower) {
      judgeByNameLower.set(nameLower, j.id);
      judgeByNameLower.set(normalizeJudgeName(nameLower), j.id);
      const parts = nameLower.split(/\s+/);
      if (parts.length >= 2) {
        const lastName = parts[parts.length - 1].replace(/[,.]$/, "");
        if (!judgeByLastName.has(lastName)) judgeByLastName.set(lastName, []);
        judgeByLastName.get(lastName).push({ id: j.id, full: nameLower });
      }
    }
    if (j.cl_person_id) judgeByClPersonId.set(j.cl_person_id, j.id);
  }
  let trialJudgeMatches = 0;
  let authorFallbackMatches = 0;

  const bzcatPath = findBzcat();
  console.log(`\nStreaming opinions CSV through bzcat + csv-parse (escape: \\\\)...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true,
    relax_quotes: true, on_record: (record) => record,
  }));

  // Track observations: judge_id + charge_slug -> { bench: [], jury: [] }
  const observations = new Map();
  let rowCount = 0;
  let matchCount = 0;
  let classifiedCount = 0;
  const startTime = Date.now();

  // Wrap in try-catch: CL opinions CSV has unescaped quotes in legal text
  // that cause fatal "Quote Not Closed" errors. We collect data until the
  // parser crashes, then proceed with what we have.
  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${classifiedCount} classified, ${trialJudgeMatches} trial-judge + ${authorFallbackMatches} author (${elapsed.toFixed(0)}s)\n`);
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

      const { trialType, outcome } = classifyTrial(text);
      if (!trialType || !outcome) continue;

      classifiedCount++;

      // STRATEGY: Cast a wide net, filter later. Three tiers:
      // 1. Regex-extract trial judge name from preamble (most precise)
      // 2. Scan preamble for ANY judge last name from our DB (flexible, catches more)
      // 3. Fallback to author_id/author_str (appellate judge, rarely useful)
      let judgeId = null;

      // Tier 1: Regex extraction (structured patterns like "Name, Judge.")
      const trialJudgeName = extractTrialJudge(text);
      if (trialJudgeName) {
        const normalized = normalizeJudgeName(trialJudgeName);
        judgeId = judgeByNameLower.get(normalized);
        if (!judgeId) {
          const parts = normalized.split(/\s+/);
          const lastName = parts[parts.length - 1];
          const candidates = judgeByLastName.get(lastName);
          if (candidates && candidates.length === 1) judgeId = candidates[0].id;
        }
        if (judgeId) trialJudgeMatches++;
      }

      // Tier 2: Scan preamble for any judge last name from our DB
      // (catches unstructured mentions like "Judge Smith ruled that...")
      if (!judgeId) {
        const preamble = text.slice(0, 1500).toLowerCase();
        for (const [lastName, candidates] of judgeByLastName) {
          if (lastName.length < 4) continue; // skip short names (lee, wu), too many false positives
          // Require "judge" or "hon" nearby to reduce false positives
          const idx = preamble.indexOf(lastName);
          if (idx < 0) continue;
          // Check 30 chars before the name for judge/honorable/hon context
          const context = preamble.slice(Math.max(0, idx - 30), idx);
          if (context.indexOf("judge") >= 0 || context.indexOf("hon") >= 0 || context.indexOf(", j.") >= 0) {
            if (candidates.length === 1) {
              judgeId = candidates[0].id;
              trialJudgeMatches++;
              break;
            }
            // Multiple judges share this last name, try first+last from preamble
            for (const c of candidates) {
              if (preamble.indexOf(c.full) >= 0) {
                judgeId = c.id;
                trialJudgeMatches++;
                break;
              }
            }
            if (judgeId) break;
          }
        }
      }

      // Tier 3: author_id/author_str fallback (appellate judge)
      if (!judgeId) {
        const authorId = record.author_id;
        if (authorId) judgeId = judgeByClPersonId.get(authorId);
        if (!judgeId) {
          const authorName = (record.author_str || "").toLowerCase().trim();
          if (authorName) judgeId = judgeByNameLower.get(authorName);
        }
        if (judgeId) authorFallbackMatches++;
      }
      if (!judgeId) continue;

      // Get charges for this cluster
      const charges = clusterToCharges.get(clusterId) || [];
      for (const chargeSlug of charges) {
        const key = `${judgeId}|${chargeSlug}`;
        if (!observations.has(key)) {
          observations.set(key, { bench: [], jury: [] });
        }
        observations.get(key)[trialType].push(outcome);
      }

      if (classifiedCount >= limit) { bzcat.kill(); break; }
    }
  } catch (parseErr) {
    // "Quote Not Closed" is fatal in csv-parse, CL opinions CSV has
    // unescaped quotes in legal opinion text. Proceed with collected data.
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Opinions classified: ${classifiedCount}`);
  console.log(`Trial judge matches: ${trialJudgeMatches}`);
  console.log(`Author fallback matches: ${authorFallbackMatches}`);

  // Compute divergence
  const divergences = [];
  let groupsComputed = 0;
  let groupsFiltered = 0;

  for (const [key, trials] of observations) {
    const [judgeId, chargeSlug] = key.split("|");
    const benchTrials = trials.bench;
    const juryTrials = trials.jury;

    const benchTotal = benchTrials.length;
    const juryTotal = juryTrials.length;

    // Only include if both have >= 1 sample (lowered from >= 2 to capture more judges)
    if (benchTotal < 1 || juryTotal < 1) { groupsFiltered++; continue; }

    const benchAcquittals = benchTrials.filter(o => o === "acquittal").length;
    const juryAcquittals = juryTrials.filter(o => o === "acquittal").length;

    const benchRate = benchAcquittals / benchTotal;
    const juryRate = juryAcquittals / juryTotal;

    divergences.push({
      judgeId,
      chargeSlug,
      benchRate,
      juryRate,
      benchSample: benchTotal,
      jurySample: juryTotal,
      divergence: Math.abs(benchRate - juryRate),
    });

    groupsComputed++;
  }

  // Sort by divergence
  divergences.sort((a, b) => b.divergence - a.divergence);

  console.log(`\nDivergence groups: ${groupsComputed}  (filtered < 2 samples: ${groupsFiltered})`);
  console.log(`\n--- Top 20 Bench vs Jury Divergences ---`);
  for (let i = 0; i < Math.min(20, divergences.length); i++) {
    const d = divergences[i];
    console.log(`  ${d.judgeId.padEnd(30)} ${d.chargeSlug.padEnd(25)} Bench: ${(d.benchRate * 100).toFixed(1)}% (n=${d.benchSample}) | Jury: ${(d.juryRate * 100).toFixed(1)}% (n=${d.jurySample})`);
  }

  if (dryRun) { console.log(`\nDry run complete.`); return; }
  if (divergences.length === 0) { console.log("\nNo divergences to apply."); return; }

  // Build INSERT + UPDATE statements
  const insertStmts = [];
  const updateJudgeStmts = [];
  const judgeAggregates = new Map();

  for (const d of divergences) {
    const verificationUrl = `https://www.courtlistener.com/`;
    const stmt = `INSERT INTO bench_jury_divergence (judge_id, charge_slug, bench_acquittal_rate, jury_acquittal_rate, bench_sample, jury_sample, source_urls) VALUES (${esc(d.judgeId)}, ${esc(d.chargeSlug)}, ${d.benchRate}, ${d.juryRate}, ${d.benchSample}, ${d.jurySample}, ${escArrayLiteral([verificationUrl])}) ON CONFLICT DO NOTHING;`;
    insertStmts.push(stmt);

    // Aggregate by judge for judge_profiles update
    if (!judgeAggregates.has(d.judgeId)) {
      judgeAggregates.set(d.judgeId, { benchRates: [], juryRates: [] });
    }
    judgeAggregates.get(d.judgeId).benchRates.push(d.benchRate);
    judgeAggregates.get(d.judgeId).juryRates.push(d.juryRate);
  }

  for (const [judgeId, rates] of judgeAggregates) {
    const avgBench = rates.benchRates.reduce((a, b) => a + b, 0) / rates.benchRates.length;
    const avgJury = rates.juryRates.reduce((a, b) => a + b, 0) / rates.juryRates.length;
    const stmt = `UPDATE judge_profiles SET bench_acquittal_rate = ${avgBench}, jury_acquittal_rate = ${avgJury} WHERE id = ${esc(judgeId)};`;
    updateJudgeStmts.push(stmt);
  }

  console.log(`\nSQL statements: ${insertStmts.length} INSERTs + ${updateJudgeStmts.length} judge UPDATEs`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "bench-jury-divergence-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, [...insertStmts, ...updateJudgeStmts].join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-bench-jury-divergence.mjs --apply`);
    return;
  }

  loadToken();
  console.log(`\n--- Applying ${insertStmts.length + updateJudgeStmts.length} statements in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0, errors = 0;
  const applyStart = Date.now();
  const allStmts = [...insertStmts, ...updateJudgeStmts];

  for (let i = 0; i < allStmts.length; i += BATCH_SIZE) {
    const batch = allStmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allStmts.length / BATCH_SIZE);
    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} statements, ${rate}/sec\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try { await supabaseQuery(batch.join("\n")); applied += batch.length; errors--; } catch {}
      }
    }
    if (i + BATCH_SIZE < allStmts.length) await sleep(500);
  }

  console.log(`\n--- Results ---`);
  console.log(`Statements applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
