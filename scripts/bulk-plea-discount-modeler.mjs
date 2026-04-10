/**
 * Bulk Plea Discount Modeler
 *
 * Streams the 50 GB CourtListener opinions CSV and models plea discount curves
 * for the `plea_discount_curves` table.
 *
 * Phase 1: For each opinion matching our cluster IDs, classify as plea or trial
 *          and extract sentence lengths from the text.
 * Phase 2: Group by jurisdiction + charge key. Compute median baseline (trial),
 *          median plea sentence, and cooperation_bonus (discount in months).
 *          Requires >= 3 plea sentences AND >= 3 trial sentences per group.
 * Phase 3: INSERT into plea_discount_curves (ON CONFLICT DO NOTHING).
 *
 * Prerequisites:
 *   - data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2 (50 GB)
 *   - data/bulk-verify/statute-case-law-dump.json (refresh with bulk-dump-cases.mjs)
 *   - plea_discount_curves table exists (migration applied)
 *   - npm install csv-parse
 *
 * IMPORTANT: Do not run while bulk-classify-from-opinions.mjs is running.
 * Both stream the same 50 GB CSV and would halve throughput + saturate bzcat CPU.
 *
 * Usage:
 *   node scripts/bulk-plea-discount-modeler.mjs              # Generate SQL only
 *   node scripts/bulk-plea-discount-modeler.mjs --apply      # Generate + apply
 *   node scripts/bulk-plea-discount-modeler.mjs --dry-run    # Stats only
 *   node scripts/bulk-plea-discount-modeler.mjs --limit 100  # First N matches
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

// ── Plea case signals ───────────────────────────────────────────────────────
// Case-insensitive; applied to lowercased text via indexOf only — no regex.
const PLEA_SIGNALS = [
  "guilty plea",
  "pled guilty",
  "pleaded guilty",
  "plea of guilty",
  "plea agreement",
  "plea bargain",
  "plea deal",
  "nolo contendere",
  "no contest",
  "plea colloquy",
  "entered a plea",
  "accepted the plea",
];

// ── Trial case signals ───────────────────────────────────────────────────────
// Only applied when NO plea signal found.
const TRIAL_SIGNALS = [
  "jury trial",
  "bench trial",
  "trial by jury",
  "tried before",
  "went to trial",
  "jury returned",
  "jury found",
  "the verdict",
  "found guilty after trial",
  "convicted after trial",
];

// ── Sentence length extraction phrases ──────────────────────────────────────
// No regex. indexOf to locate phrase, then manual digit parsing.
const SENTENCE_PHRASES = [
  "sentenced to ",
  "sentence of ",
  "term of imprisonment of ",
  "imprisonment for ",
  "incarceration for ",
  "confinement for ",
];

/**
 * Extract sentence length in months from text starting at phraseIdx + phraseLen.
 * Returns null if the number or unit cannot be determined.
 * Maps: years → *12, months → 1x, days → /30, weeks → /4.3, "life" → 600.
 */
function extractSentenceMonths(text, phraseIdx, phraseLen) {
  let pos = phraseIdx + phraseLen;

  // Skip whitespace
  while (pos < text.length && text[pos] === " ") pos++;

  // Check for "life"
  if (text.slice(pos, pos + 4).toLowerCase() === "life") return 600;

  // Read digits (allow decimal)
  let numStr = "";
  while (pos < text.length && ((text[pos] >= "0" && text[pos] <= "9") || text[pos] === ".")) {
    numStr += text[pos];
    pos++;
  }
  if (!numStr) return null;
  const num = parseFloat(numStr);
  if (isNaN(num) || num <= 0) return null;

  // Skip whitespace before unit
  while (pos < text.length && text[pos] === " ") pos++;

  // Read unit (first 10 chars suffices)
  const remaining = text.slice(pos, pos + 10).toLowerCase();
  if (remaining.indexOf("year") === 0) return num * 12;
  if (remaining.indexOf("month") === 0) return num;
  if (remaining.indexOf("day") === 0) return Math.round((num / 30) * 10) / 10;
  if (remaining.indexOf("week") === 0) return Math.round((num / 4.3) * 10) / 10;

  return null; // Unit unrecognised
}

/**
 * Classify opinion text as plea or trial and extract all sentence lengths found.
 * Returns { type: "plea"|"trial"|null, sentences: number[] }
 */
function classifyAndExtract(text) {
  const lower = text.toLowerCase();

  // Determine case type
  let isPlea = false;
  for (const sig of PLEA_SIGNALS) {
    if (lower.indexOf(sig) >= 0) { isPlea = true; break; }
  }

  let isTrial = false;
  if (!isPlea) {
    for (const sig of TRIAL_SIGNALS) {
      if (lower.indexOf(sig) >= 0) { isTrial = true; break; }
    }
  }

  if (!isPlea && !isTrial) return { type: null, sentences: [] };

  // Extract sentence lengths
  const sentences = [];
  for (const phrase of SENTENCE_PHRASES) {
    let searchFrom = 0;
    // Scan all occurrences of this phrase
    while (true) {
      const idx = lower.indexOf(phrase, searchFrom);
      if (idx < 0) break;
      const months = extractSentenceMonths(lower, idx, phrase.length);
      if (months !== null && months > 0 && months <= 1200) {
        sentences.push(months);
      }
      searchFrom = idx + phrase.length;
    }
  }

  return { type: isPlea ? "plea" : "trial", sentences };
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

// ── Statistics helpers ───────────────────────────────────────────────────────

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
  console.log("=== BULK PLEA DISCOUNT MODELER (csv-parse) ===\n");

  if (!fs.existsSync(OPINIONS_BZ2)) { console.error(`ERROR: opinions CSV not found: ${OPINIONS_BZ2}`); process.exit(1); }
  if (!fs.existsSync(DUMP_FILE)) { console.error(`ERROR: dump not found: ${DUMP_FILE}`); process.exit(1); }

  // Build cluster → dump row index for fast lookup
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, "utf8"));
  const clusterToRow = new Map();
  for (const r of dump) {
    if (r.courtlistener_cluster_id) {
      clusterToRow.set(String(r.courtlistener_cluster_id), r);
    }
  }
  console.log(`Target clusters (all with cluster_id): ${clusterToRow.size}`);

  const bzcatPath = findBzcat();
  console.log(`Streaming opinions CSV through bzcat + csv-parse (escape: \\\\)...`);
  console.log(`Using: ${bzcatPath}\n`);

  const bzcat = spawn(bzcatPath, [OPINIONS_BZ2], { stdio: ["pipe", "pipe", "pipe"] });
  bzcat.stderr.on("data", () => {});

  const parser = bzcat.stdout.pipe(parse({
    columns: true, skip_empty_lines: true, escape: "\\", relax_column_count: true,
  }));

  // Phase 1 accumulator: key = "jurisdiction|charge_slug"
  // Each entry: { plea_sentences: number[], trial_sentences: number[], source_urls: Set<string> }
  // We derive jurisdiction from dump row; charge_slug from jurisdiction_statute_id or a fallback slug.
  const groups = new Map();

  let rowCount = 0;
  let matchCount = 0;
  let pleaCount = 0;
  let trialCount = 0;
  let extractedCount = 0;
  const startTime = Date.now();

  for await (const record of parser) {
    rowCount++;
    if (rowCount % 500000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      process.stdout.write(
        `  ${(rowCount / 1000000).toFixed(1)}M rows, ${matchCount} matched, ${pleaCount} plea / ${trialCount} trial (${elapsed.toFixed(0)}s)\n`
      );
    }

    const clusterId = record.cluster_id;
    if (!clusterId || !clusterToRow.has(clusterId)) continue;
    matchCount++;

    const dumpRow = clusterToRow.get(clusterId);

    let text = record.plain_text || "";
    if (text.length < 300) {
      const html = record.html_with_citations || record.html || record.html_columbia || "";
      if (html.length > 300) text = stripHtml(html);
    }
    if (text.length < 300) continue;

    const { type, sentences } = classifyAndExtract(text);
    if (!type || sentences.length === 0) continue;

    // Derive the group key from the dump row
    const jurisdiction = dumpRow.jurisdiction || "unknown";
    // Use statute slug from the dump row if present, otherwise fall back to charge type
    let chargeSlug = dumpRow.charge_slug || dumpRow.charge_type || "unknown";
    // Normalise to lowercase snake_case without regex
    chargeSlug = chargeSlug.toLowerCase().split(" ").join("_").split("-").join("_");

    const groupKey = jurisdiction + "|" + chargeSlug;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { jurisdiction, charge_slug: chargeSlug, plea_sentences: [], trial_sentences: [], source_urls: new Set() });
    }
    const g = groups.get(groupKey);
    const url = `https://www.courtlistener.com/opinion/${clusterId}/`;
    g.source_urls.add(url);

    if (type === "plea") {
      for (const s of sentences) g.plea_sentences.push(s);
      pleaCount++;
    } else {
      for (const s of sentences) g.trial_sentences.push(s);
      trialCount++;
    }

    extractedCount++;
    if (extractedCount % 500 === 0) process.stdout.write(`  ${extractedCount} opinions extracted...\n`);
    if (extractedCount >= limit) { bzcat.kill(); break; }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nStream complete: ${rowCount} rows in ${(elapsed / 60).toFixed(1)} min`);
  console.log(`Clusters matched: ${matchCount}`);
  console.log(`Plea cases (with sentences): ${pleaCount}`);
  console.log(`Trial cases (with sentences): ${trialCount}`);
  console.log(`Unique jurisdiction+charge groups: ${groups.size}`);

  // ── Phase 2: Compute discount curves ──────────────────────────────────────
  const MIN_SAMPLES = 3;
  const curves = [];

  for (const [, g] of groups) {
    if (g.plea_sentences.length < MIN_SAMPLES || g.trial_sentences.length < MIN_SAMPLES) continue;

    const pleaSorted = [...g.plea_sentences].sort((a, b) => a - b);
    const trialSorted = [...g.trial_sentences].sort((a, b) => a - b);

    const base_sentence = median(trialSorted);
    const plea_sentence = median(pleaSorted);
    const cooperation_bonus = base_sentence - plea_sentence;

    // Only keep groups where there is a meaningful discount
    if (base_sentence <= 0) continue;

    curves.push({
      jurisdiction: g.jurisdiction,
      charge_slug: g.charge_slug,
      base_sentence: Math.round(base_sentence * 10) / 10,
      plea_sentence: Math.round(plea_sentence * 10) / 10,
      cooperation_bonus: Math.round(cooperation_bonus * 10) / 10,
      sample_size: g.plea_sentences.length + g.trial_sentences.length,
      source_urls: Array.from(g.source_urls),
    });
  }

  curves.sort((a, b) => b.cooperation_bonus - a.cooperation_bonus);

  // ── Stats ──────────────────────────────────────────────────────────────────
  console.log(`\nJurisdiction+charge groups with enough data (>= ${MIN_SAMPLES} each): ${curves.length}`);

  if (curves.length > 0) {
    const avgDiscount = curves.reduce((acc, c) => {
      return acc + (c.cooperation_bonus / c.base_sentence);
    }, 0) / curves.length;
    console.log(`Average plea discount: ${(avgDiscount * 100).toFixed(1)}%`);

    console.log(`\n--- Top 10 highest plea discounts ---`);
    for (const c of curves.slice(0, 10)) {
      const pct = c.base_sentence > 0 ? ((c.cooperation_bonus / c.base_sentence) * 100).toFixed(1) : "N/A";
      console.log(
        `  ${(c.jurisdiction + "/" + c.charge_slug).padEnd(50)}` +
        `  trial=${c.base_sentence}mo  plea=${c.plea_sentence}mo  discount=${c.cooperation_bonus}mo (${pct}%)  n=${c.sample_size}`
      );
    }
  }

  if (dryRun) { console.log(`\nDry run complete.`); return; }
  if (curves.length === 0) { console.log("\nNo curves to apply."); return; }

  // ── Phase 3: Build INSERT statements ──────────────────────────────────────
  const stmts = [];
  for (const c of curves) {
    const stmt =
      `INSERT INTO plea_discount_curves (jurisdiction, charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls) ` +
      `VALUES (${esc(c.jurisdiction)}, ${esc(c.charge_slug)}, ${esc(c.base_sentence)}, ${esc(c.plea_sentence)}, ` +
      `${esc(c.cooperation_bonus)}, ${esc(c.sample_size)}, ${escArrayLiteral(c.source_urls)}) ` +
      `ON CONFLICT DO NOTHING;`;
    stmts.push(stmt);
  }

  console.log(`\nSQL statements: ${stmts.length}`);

  if (!applyMode) {
    const outPath = path.join(PROJECT_ROOT, "data", "bulk-verify", "plea-discount-curves.sql");
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, stmts.join("\n"));
    console.log(`Saved: ${outPath}`);
    console.log(`To apply: node scripts/bulk-plea-discount-modeler.mjs --apply`);
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
      process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} curves — ${rate}/sec\n`);
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
  console.log(`Curves applied: ${applied}  Errors: ${errors}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
