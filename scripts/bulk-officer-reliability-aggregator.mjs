/**
 * Bulk Officer Reliability Aggregator
 *
 * Streams the 50 GB CourtListener opinions CSV and extracts officer reliability data.
 * For each opinion matching our cluster IDs, scans plain_text for:
 *   1. Officer mentions (Officer/Detective/Sergeant/etc. + name extraction)
 *   2. Testimony credibility signals (discredited, impeached, contradicted, Brady, false testimony, etc.)
 *   3. Aggregates per officer: testimony_count, discredited_count, reliability_score
 *
 * Computes reliability_score = 1.0 - (discredited_count / testimony_count), capped at [0, 1].
 * Stores verification source URL in source_urls[] per safety rule.
 * Only includes officers with testimony_count >= 2.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - officer_reliability table created (migration applied)
 *   - npm install csv-parse
 *
 * IMPORTANT: Do not run while bulk-classify-from-opinions.mjs is running.
 * Both stream the same 50 GB CSV and would halve throughput + saturate bzcat CPU.
 *
 * Usage:
 *   node scripts/bulk-officer-reliability-aggregator.mjs              # Generate SQL only
 *   node scripts/bulk-officer-reliability-aggregator.mjs --apply      # Generate + apply
 *   node scripts/bulk-officer-reliability-aggregator.mjs --dry-run    # Stats only
 *   node scripts/bulk-officer-reliability-aggregator.mjs --limit 100  # First N matches
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

// ── Officer title signals ───────────────────────────────────────────────────
// Phrases that precede officer names
const OFFICER_TITLES = [
  "officer ",
  "detective ",
  "sergeant ",
  "deputy ",
  "trooper ",
  "agent ",
  "corporal ",
  "lieutenant ",
];

// ── Credibility signals ─────────────────────────────────────────────────────
// Phrases indicating testimony was discredited or impeached
const CREDIBILITY_NEGATIVE = [
  "not credible",
  "lacked credibility",
  "incredible",
  "discredited",
  "impeached",
  "contradicted by",
  "inconsistent with",
  "suppressed",
  "brady",
  "false testimony",
  "fabricated",
  "excessive force",
  "dishonest",
  "untrustworthy",
  "perjured",
  "bias",
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

// ── Extract officer name after title phrase (no regex) ────────────────────

function extractOfficerName(text, titleEndIdx) {
  let start = titleEndIdx;
  while (start < text.length && text[start] === " ") start++;
  let end = start;
  // Read until we hit a non-name character pattern
  while (end < text.length && end - start < 40) {
    const ch = text[end];
    if (ch === "," || ch === "." || ch === ";" || ch === ":" || ch === "(" || ch === "\n") break;
    end++;
  }
  const name = text.slice(start, end).trim();
  // Must have at least 2 chars and start with uppercase
  if (name.length < 2) return null;
  if (name[0] < "A" || name[0] > "Z") return null;
  return name;
}

// ── Extract officer mentions + credibility from text ────────────────────────

function extractOfficerData(text) {
  const lower = text.toLowerCase();
  const officerMap = new Map(); // key: "Title Surname" → {name, testimony_count, discredited_count}

  // Find all officer title mentions
  for (const title of OFFICER_TITLES) {
    let searchIdx = 0;
    while (true) {
      const idx = lower.indexOf(title, searchIdx);
      if (idx === -1) break;
      const titleEndIdx = idx + title.length;
      const name = extractOfficerName(text, titleEndIdx);
      if (name) {
        const key = `${title.trim()} ${name}`;
        if (!officerMap.has(key)) {
          officerMap.set(key, {
            title: title.trim(),
            name: name,
            testimony_count: 0,
            discredited_count: 0,
            clusters: new Set(),
          });
        }
        const officer = officerMap.get(key);
        officer.testimony_count++;
        searchIdx = titleEndIdx;
      } else {
        searchIdx = idx + 1;
      }
    }
  }

  // For each officer mention, check surrounding context (±1500 chars) for credibility signals
  for (const title of OFFICER_TITLES) {
    let searchIdx = 0;
    while (true) {
      const idx = lower.indexOf(title, searchIdx);
      if (idx === -1) break;
      const titleEndIdx = idx + title.length;
      const name = extractOfficerName(text, titleEndIdx);
      if (name) {
        const key = `${title.trim()} ${name}`;
        const officer = officerMap.get(key);
        if (officer) {
          // Check ±1500 chars around the mention
          const contextStart = Math.max(0, idx - 1500);
          const contextEnd = Math.min(text.length, titleEndIdx + 1500);
          const context = lower.slice(contextStart, contextEnd);

          // Check for credibility negative signals
          for (const signal of CREDIBILITY_NEGATIVE) {
            if (context.indexOf(signal) >= 0) {
              officer.discredited_count++;
              break; // Count once per mention, not per signal
            }
          }
        }
        searchIdx = titleEndIdx;
      } else {
        searchIdx = idx + 1;
      }
    }
  }

  return officerMap;
}

// ── SQL / Supabase ──────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).split("'").join("''")}'`;
}

function escArrayLiteral(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map((s) => {
    const inner = String(s).split("\\").join("\\\\").split('"').join('\\"');
    return `"${inner}"`;
  });
  const literal = `{${items.join(",")}}`;
  return `'${literal.split("'").join("''")}'::text[]`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let supabaseToken = null;
function loadToken() {
  if (supabaseToken) return;
  const parentEnv = fs.readFileSync(path.resolve(PROJECT_ROOT, "..", "ImNotAnAttorney", ".env.local"), "utf8");
  for (const line of parentEnv.split("\n")) {
    if (line.startsWith("SUPABASE_ACCESS_TOKEN=")) {
      supabaseToken = line.slice(22).trim();
      break;
    }
  }
}

function supabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          if (res.statusCode >= 400) reject(new Error(`SQL ${res.statusCode}: ${data.slice(0, 300)}`));
          else {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function findBzcat() {
  for (const p of [
    "C:\\Program Files\\Git\\usr\\bin\\bzcat.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe",
    "bzcat",
  ]) {
    if (p === "bzcat") return p;
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return "bzcat";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK OFFICER RELIABILITY AGGREGATOR (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) {
    console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`);
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`ERROR: dump not found: ${DUMP_FILE}`);
    process.exit(1);
  }

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

  const parser = bzcat.stdout.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      escape: "\\",
      relax_column_count: true,
      relax_quotes: true,
    })
  );

  const globalOfficerMap = new Map(); // key: "Title Surname" → aggregated data
  let rowCount = 0;
  let matchCount = 0;
  let withDataCount = 0;
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(
          `  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${withDataCount} with officer data (${elapsed.toFixed(0)}s)\n`
        );
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

      const officerData = extractOfficerData(text);
      if (officerData.size === 0) continue;

      // Merge into global map
      for (const [key, officerInfo] of officerData) {
        if (!globalOfficerMap.has(key)) {
          globalOfficerMap.set(key, {
            title: officerInfo.title,
            name: officerInfo.name,
            testimony_count: 0,
            discredited_count: 0,
            clusters: new Set(),
          });
        }
        const global = globalOfficerMap.get(key);
        global.testimony_count += officerInfo.testimony_count;
        global.discredited_count += officerInfo.discredited_count;
        global.clusters.add(clusterId);
      }

      withDataCount++;
      if (withDataCount % 500 === 0) process.stdout.write(`  ${withDataCount} opinions with officer data...\n`);
      if (withDataCount >= limit) {
        bzcat.kill();
        break;
      }
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Opinions with officer data: ${withDataCount}`);

  // Filter: only officers with testimony_count >= 2
  const validOfficers = [];
  for (const [key, officerInfo] of globalOfficerMap) {
    if (officerInfo.testimony_count >= 2) {
      const reliabilityScore = 1.0 - officerInfo.discredited_count / officerInfo.testimony_count;
      validOfficers.push({
        key,
        ...officerInfo,
        reliability_score: Math.max(0, Math.min(1, reliabilityScore)),
      });
    }
  }

  console.log(`\nOfficers with testimony_count >= 2: ${validOfficers.length}`);

  // Stats: top officers by testimony count
  const byTestimony = [...validOfficers].sort((a, b) => b.testimony_count - a.testimony_count);
  console.log(`\n--- Top 20 Officers by Testimony Count ---`);
  for (let i = 0; i < Math.min(20, byTestimony.length); i++) {
    const o = byTestimony[i];
    console.log(
      `  ${o.key.padEnd(30)} testimony=${o.testimony_count}, discredited=${o.discredited_count}, score=${o.reliability_score.toFixed(3)}`
    );
  }

  // Stats: lowest reliability scores
  const byScore = [...validOfficers].sort((a, b) => a.reliability_score - b.reliability_score);
  console.log(`\n--- Lowest Reliability Scores (top 20) ---`);
  for (let i = 0; i < Math.min(20, byScore.length); i++) {
    const o = byScore[i];
    console.log(
      `  ${o.key.padEnd(30)} score=${o.reliability_score.toFixed(3)}, testimony=${o.testimony_count}, discredited=${o.discredited_count}`
    );
  }

  if (dryRun) {
    console.log(`\nDry run complete.`);
    return;
  }
  if (validOfficers.length === 0) {
    console.log("\nNo officers to insert.");
    return;
  }

  // Build INSERT statements
  const stmts = [];
  for (const officer of validOfficers) {
    const bradyHistory = Array.from(officer.clusters);
    const verificationUrl = `https://www.courtlistener.com/opinion/${bradyHistory[0]}/`;

    const stmt = `INSERT INTO officer_reliability (officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls) VALUES (${esc(officer.name)}, 'state', 'multi', ${officer.testimony_count}, ${officer.discredited_count}, ${officer.reliability_score.toFixed(3)}, ${escArrayLiteral(bradyHistory)}, ${escArrayLiteral([verificationUrl])}) ON CONFLICT DO NOTHING;`;
    stmts.push(stmt);
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "officer-reliability-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-officer-reliability-aggregator.mjs --apply`);
    return;
  }

  loadToken();
  console.log(`\n--- Applying ${stmts.length} inserts in batches of ${BATCH_SIZE} ---\n`);

  let applied = 0,
    errors = 0;
  const applyStart = Date.now();

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const batch = stmts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stmts.length / BATCH_SIZE);
    try {
      await supabaseQuery(batch.join("\n"));
      applied += batch.length;
      const rate = (applied / ((Date.now() - applyStart) / 1000)).toFixed(0);
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} officers — ${rate}/sec\n`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${batchNum}: ${e.message.slice(0, 200)}`);
      if (e.message.indexOf("429") >= 0) {
        await sleep(10000);
        try {
          await supabaseQuery(batch.join("\n"));
          applied += batch.length;
          errors--;
        } catch {}
      }
    }
    if (i + BATCH_SIZE < stmts.length) await sleep(500);
  }

  console.log(`\n--- Results ---`);
  console.log(`Officers applied: ${applied}  Errors: ${errors}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
