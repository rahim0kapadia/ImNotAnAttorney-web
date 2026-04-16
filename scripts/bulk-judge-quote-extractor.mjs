/**
 * Bulk Extract Judge Quotes from Opinions CSV
 *
 * Streams the 50 GB CourtListener opinions CSV and extracts verbatim judge quotes
 * into the judge_quotes database table. Links quotes to judges by name matching.
 *
 * For each opinion matching our cluster IDs, searches plain_text for judicial holding
 * phrases and extracts the containing sentence. Classifies each quote by topic
 * (suppression, dismissal, sentencing, etc.) and matches to judge_profiles by name.
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - judge_quotes table exists with schema (judge_id uuid, quote text, topic text, case_cited text, source_url text, cluster_id text)
 *   - judge_profiles table populated
 *   - npm install csv-parse
 *
 * IMPORTANT: Do not run while bulk-classify-from-opinions.mjs is running.
 * Both stream the same 50 GB CSV and would halve throughput + saturate bzcat CPU.
 *
 * Usage:
 *   node scripts/bulk-judge-quote-extractor.mjs              # Generate SQL only
 *   node scripts/bulk-judge-quote-extractor.mjs --apply      # Generate + apply
 *   node scripts/bulk-judge-quote-extractor.mjs --dry-run    # Stats only
 *   node scripts/bulk-judge-quote-extractor.mjs --limit 100  # First N matches
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

// ── Judge holding phrase anchors ────────────────────────────────────────────
// Case-insensitive phrases that mark judicial pronouncements
const JUDGE_PHRASE_ANCHORS = [
  "we hold that",
  "we held that",
  "this court holds",
  "this court held",
  "we conclude that",
  "we concluded that",
  "we find that",
  "we found that",
  "it is ordered that",
  "it is hereby ordered",
  "we reverse",
  "we affirm",
  "we therefore hold",
];

// ── Topic classification signals ────────────────────────────────────────────
// Each quote matched against these phrases to classify topic
const TOPIC_SIGNALS = [
  ["suppression", "suppress", "suppression"],
  ["dismissal", "dismiss", "dismissal"],
  ["sentencing", "sentenc"],
  ["mistrial", "mistrial"],
  ["habeas", "habeas"],
  ["plea", "plea"],
  ["ineffective_assistance", "ineffective", "strickland"],
  ["jury_instruction", "jury instruction"],
  ["probable_cause", "probable cause"],
  ["search_seizure", "search and seizure", "fourth amendment"],
];

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

let supabaseServiceKey = null;
function loadServiceKey() {
  if (supabaseServiceKey) return;
  const envPath = path.resolve(PROJECT_ROOT, ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) { supabaseServiceKey = line.slice(26).trim(); break; }
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

function restApiCall(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://jxjbjmgdukwkoclydqdr.supabase.co/rest/v1${endpoint}`);
    const reqBody = body ? JSON.stringify(body) : null;
    const headers = {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "apikey": supabaseServiceKey,
    };
    if (body) headers["Content-Type"] = "application/json";

    const req = https.request(url, {
      method, headers,
      ...(reqBody && { headers: { ...headers, "Content-Length": Buffer.byteLength(reqBody) } }),
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`API ${res.statusCode}: ${data.slice(0, 300)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on("error", reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

function findBzcat() {
  for (const p of ["C:\\Program Files\\Git\\usr\\bin\\bzcat.exe", "C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe", "bzcat"]) {
    if (p === "bzcat") return p;
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return "bzcat";
}

// ── Quote extraction logic ──────────────────────────────────────────────────

function extractSentence(text, matchIndex) {
  // Find preceding period or semicolon (or start of text)
  let start = 0;
  for (let i = matchIndex - 1; i >= 0; i--) {
    if (text[i] === '.' || text[i] === ';' || text[i] === '\n') {
      start = i + 1;
      break;
    }
  }
  // Skip leading whitespace
  while (start < text.length && /\s/.test(text[start])) start++;

  // Find trailing period or semicolon (or end of text)
  let end = text.length;
  for (let i = matchIndex; i < text.length; i++) {
    if (text[i] === '.' || text[i] === ';') {
      end = i + 1;
      break;
    }
  }

  let sentence = text.slice(start, end).trim();
  if (sentence.length > 500) sentence = sentence.slice(0, 497) + "...";
  return sentence;
}

function classifyTopic(quote) {
  const lower = quote.toLowerCase();
  for (const [topic, ...phrases] of TOPIC_SIGNALS) {
    for (const phrase of phrases) {
      if (lower.indexOf(phrase) >= 0) return topic;
    }
  }
  return "general";
}

function extractQuotes(text, limit = 10) {
  if (!text || text.length < 200) return [];

  const lower = text.toLowerCase();
  const quotes = [];
  const seen = new Set();

  for (const anchor of JUDGE_PHRASE_ANCHORS) {
    let idx = 0;
    while (quotes.length < limit) {
      idx = lower.indexOf(anchor, idx);
      if (idx === -1) break;

      const sentence = extractSentence(text, idx);
      if (seen.has(sentence) || sentence.length < 40) { idx += anchor.length; continue; }

      seen.add(sentence);
      quotes.push({
        quote: sentence,
        topic: classifyTopic(sentence),
      });
      idx += anchor.length;
    }
    if (quotes.length >= limit) break;
  }

  return quotes;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BULK EXTRACT JUDGE QUOTES (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const targetClusters = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id && r.case_name) {
      targetClusters.set(String(r.courtlistener_cluster_id), r.case_name);
    }
  }
  console.log(`Target clusters (all with cluster_id): ${targetClusters.size}`);

  // Load judge profiles for name matching
  // PostgREST silently caps at 1000 rows regardless of ?limit= value.
  // Must paginate via Range header to load all 15,000+ judges.
  console.log("Loading judge profiles...");
  loadServiceKey();
  let judges = [];
  try {
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (true) {
      const page = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: "jxjbjmgdukwkoclydqdr.supabase.co",
          path: "/rest/v1/judge_profiles?select=id,full_name&order=id",
          method: "GET",
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
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
      judges.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (e) {
    console.warn(`Warning: could not load judge profiles: ${e.message.slice(0, 100)}`);
  }
  const judgeMap = new Map();
  for (const j of judges) {
    if (j.id && j.full_name) {
      judgeMap.set(j.full_name.toLowerCase(), j.id);
    }
  }
  console.log(`Loaded ${judgeMap.size} judges\n`);

  const bzcatPath = findBzcat();
  console.log(`Streaming opinions CSV through bzcat + csv-parse (escape: \\\\)...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true, relax_quotes: true,
  }));

  const results = [];
  let rowCount = 0;
  let matchCount = 0;
  let quotesExtracted = 0;
  const topicCounts = new Map();
  const judgeMatchCount = { matched: 0, unmatched: 0 };
  const startTime = Date.now();

  try {
    for await (const record of parser) {
      rowCount++;
      if (rowCount % 500000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        process.stdout.write(`  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${quotesExtracted} quotes (${elapsed.toFixed(0)}s)\n`);
      }

      const clusterId = record.cluster_id;
      if (!clusterId || !targetClusters.has(clusterId)) continue;
      matchCount++;

      let text = record.plain_text || "";
      if (text.length < 200) {
        const html = record.html_with_citations || record.html || record.html_columbia || "";
        if (html && html.length > 200) {
          // Strip HTML tags (no regex)
          const parts = html.split("<");
          const out = [];
          for (const part of parts) {
            const closeIdx = part.indexOf(">");
            out.push(closeIdx >= 0 ? part.slice(closeIdx + 1) : part);
          }
          text = out.join("").trim();
        }
      }
      if (text.length < 200) continue;

      const quotes = extractQuotes(text, 10);
      if (quotes.length === 0) continue;

      // Try to match opinion author to a judge
      let judgeId = null;
      const authorName = record.author || "";
      if (authorName) {
        const authorLower = authorName.toLowerCase();
        for (const [judgeName, id] of judgeMap) {
          if (authorLower.indexOf(judgeName) >= 0 || judgeName.indexOf(authorLower) >= 0) {
            judgeId = id;
            break;
          }
        }
      }
      if (judgeId) judgeMatchCount.matched++;
      else judgeMatchCount.unmatched++;

      const caseName = targetClusters.get(clusterId) || "";
      for (const q of quotes) {
        results.push({
          judge_id: judgeId,
          quote: q.quote,
          topic: q.topic,
          case_cited: caseName,
          source_url: `https://www.courtlistener.com/opinion/${clusterId}/`,
          cluster_id: clusterId,
        });
        topicCounts.set(q.topic, (topicCounts.get(q.topic) || 0) + 1);
        quotesExtracted++;
      }

      if (quotesExtracted % 500 === 0) process.stdout.write(`  ${quotesExtracted} quotes...\n`);
      if (results.length >= limit) { bzcat.kill(); break; }
    }
  } catch (parseErr) {
    console.log(`\n  CSV parse error at ${(rowCount / 1000000).toFixed(1)}M rows (continuing with collected data): ${parseErr.message.slice(0, 120)}`);
    try { bzcat.kill(); } catch {}
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Opinions matched: ${matchCount}`);
  console.log(`Quotes extracted: ${results.length}`);
  console.log(`Judge matches: ${judgeMatchCount.matched}, Unmatched: ${judgeMatchCount.unmatched}`);

  console.log(`\n--- Topics found ---`);
  for (const [topic, c] of [...topicCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${topic.padEnd(25)} ${c}`);
  }

  if (dryRun) { console.log(`\nDry run complete.`); return; }
  if (results.length === 0) { console.log("\nNo quotes to apply."); return; }

  // Build INSERT statements with ON CONFLICT DO NOTHING
  const stmts = [];
  for (const r of results) {
    const stmt = `INSERT INTO judge_quotes (judge_id, quote, topic, case_cited, source_url, cluster_id) VALUES (${r.judge_id ? esc(r.judge_id) : "NULL"}, ${esc(r.quote)}, ${esc(r.topic)}, ${esc(r.case_cited)}, ${esc(r.source_url)}, ${esc(r.cluster_id)}) ON CONFLICT DO NOTHING;`;
    stmts.push(stmt);
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "judge-quotes-updates.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-judge-quote-extractor.mjs --apply`);
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
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} quotes, ${rate}/sec\n`);
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
  console.log(`Quotes applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
