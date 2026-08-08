#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-mn-chapter609.mjs (single-cohort harness driver)
// Template: scripts/ingest/seed-statutes-ma-criminal.mjs (multi-chapter cohort iteration)
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// Pattern: gotcha-az-leg-robots-120s — slow-crawl-delay state, engine-only routing
// csv-bulk-checked: none-exists — gc.nh.gov publishes per-section HTML only
//
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ ENGINE-ONLY ROUTING — DO NOT REGISTER ON cron-job.org / Vercel cron       ║
// ╠═══════════════════════════════════════════════════════════════════════════╣
// ║ NH gc.nh.gov publishes Crawl-delay: 11 in robots.txt (verified 2026-05-02).║
// ║ Per gotcha-az-leg-robots-120s, slow-crawl-delay states (>30s soft cap)    ║
// ║ are routed to engine workers, not Vercel cron (900s limit).               ║
// ║                                                                            ║
// ║ Math: 11s × ~50 chapter TOC fetches + 11s × ~700 section fetches          ║
// ║   = ~140 minutes single-pass. Vercel cron caps at 900s (15 min).          ║
// ║                                                                            ║
// ║ Action for orchestration: run this seeder on an engine worker (long-      ║
// ║ running Node process) OR shard the cohort across N Vercel cron runs of    ║
// ║ ~5 chapters each (~13 min per shard). Engine-only is the cleaner default. ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// NH state statutes seed — Wave 2 Group 3 (Bucket B-clean, 11s crawl-delay).
// Source: New Hampshire RSA Title LXII (Criminal Code).
// Target: entities_statutes (one row per active section).
// Coverage: Chapters 625-651-F (~42 chapters; verified 2026-05-02 against title TOC).
//
// Estimated rows: ~600-800 across cohort (Wave 2 design report 2026-05-02).
// Floor enforced on full live runs: NH_TITLELXII_ROW_FLOOR = 250 (conservative).
//
// Strategy: per-chapter cohort (each chapter has its own TOC URL). Harness
// DELETE-then-COPY scopes to (jurisdiction='NH', title=chapter), making
// per-chapter re-runs idempotent. Title-level ingest scopes by repeated
// per-chapter calls; if the orchestration team needs single-title scope, set
// titleNum to "LXII" and switch to a single-cohort shape (not done here
// because per-chapter scoping is the harness's natural unit).
//
// Usage:
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs --dry-run --limit=3
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs --dry-run --verbose
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs --chapters=630
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs            # full title
//
// Environment: requires SUPABASE_DB_URL (or pass --connectionString).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  discoverSections as nhDiscoverSections,
  parseSection as nhParseSection,
  partsFromUrl,
  buildChapterUrl,
  buildNHSourceUrl,
} from './lib/nh-html.mjs';
import { ingestBucketBState } from './lib/bucket-b-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Env loader (web-repo only, # skip, trim, quote strip) ────────────────
const envPaths = ['C:/Users/email/projects/ImNotAnAttorney-web/.env.local'];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  for (const rawLine of txt.split('\n')) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Coverage: NH Title LXII (Criminal Code) ─────────────────────────────
// Verified 2026-05-02 against https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII.htm
export const NH_COHORT_DEFAULT = [
  '625', '626', '627', '628', '629', '630', '631', '632', '632-A', '633',
  '634', '635', '636', '637', '638', '639', '639-A', '640', '641', '642',
  '643', '644', '644-A', '645', '646', '646-A', '647', '648', '649', '649-A',
  '649-B', '650', '650-A', '650-B', '650-C', '651', '651-A', '651-B', '651-C',
  '651-D', '651-E', '651-F',
];

export const NH_CHAPTER_DESCRIPTIONS = {
  '625': 'Preliminary',
  '626': 'General Principles',
  '627': 'Justification',
  '628': 'Responsibility',
  '629': 'Inchoate Crimes',
  '630': 'Homicide',
  '631': 'Assault and Related Offenses',
  '632': 'Rape',
  '632-A': 'Sexual Assault and Related Offenses',
  '633': 'Interference with Freedom',
  '634': 'Destruction of Property',
  '635': 'Unauthorized Entries',
  '636': 'Robbery',
  '637': 'Theft',
  '638': 'Fraud',
  '639': 'Offenses Against the Family',
  '639-A': 'Controlled Drug-Related Crimes',
  '640': 'Corrupt Practices',
  '641': 'Falsification in Official Matters',
  '642': 'Obstructing Governmental Operations',
  '643': 'Abuse of Office',
  '644': 'Breaches of the Peace and Related Offenses',
  '644-A': 'Electronic Device Location Information',
  '645': 'Public Indecency',
  '646': 'Offenses Against the Flag',
  '646-A': 'Desecration of the Flag',
  '647': 'Gambling Offenses',
  '648': 'Subversive Activities',
  '649': 'Sabotage Prevention',
  '649-A': 'Child Sexual Abuse Images',
  '649-B': 'Computer Pornography and Child Exploitation Prevention',
  '650': 'Obscene Matter',
  '650-A': 'Felonious Use of Firearms',
  '650-B': 'Felonious Use of Body Armor',
  '650-C': 'Negligent Storage of Firearms',
  '651': 'Sentences',
  '651-A': 'Parole of Prisoners',
  '651-B': 'Registration of Criminal Offenders',
  '651-C': 'DNA Testing of Criminal Offenders',
  '651-D': 'Post-Conviction DNA Testing',
  '651-E': 'Interbranch Criminal and Juvenile Justice Council',
  '651-F': 'Information and Analysis Center',
};

// Conservative floor. Design report estimates 600-800 across cohort. Floor
// is set well below the minimum estimate to avoid runtime brittleness if a
// few chapters are heavily repealed at refresh time.
export const NH_TITLELXII_ROW_FLOOR = 250;

// ── Adapter: NH parser → BucketBStateConfig contract ────────────────────

/**
 * Bridge nhDiscoverSections(html, chapter) → harness's
 * discoverSections(tocHtml, config) shape. The harness passes the config so
 * we read the chapter token from there.
 */
export function bucketBDiscover(tocHtml, config) {
  return nhDiscoverSections(tocHtml, config.titleNum);
}

/**
 * Bridge nhParseSection(html, sectionNum) → harness's
 * parseSection(html, sectionNum) → {titleText, bodyText} | null.
 * Drops effectiveDate (always null in NH parser anyway).
 */
export function bucketBParse(sectionHtml, sectionNum) {
  const parsed = nhParseSection(sectionHtml, sectionNum);
  if (!parsed) return null;
  return { titleText: parsed.titleText, bodyText: parsed.bodyText };
}

/**
 * Authoritative source URL builder. NH section URLs are deterministic from
 * the canonical citation, so we round-trip through partsFromUrl reverse.
 *
 *   sectionNum "630:1"     → https://gc.nh.gov/rsa/html/LXII/630/630-1.htm
 *   sectionNum "632-A:2"   → https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm
 *   sectionNum "630:1-a"   → https://gc.nh.gov/rsa/html/LXII/630/630-1-a.htm
 *
 * @param {string} sectionNum  canonical citation form, e.g. "630:1"
 * @returns {string}
 */
export function buildSourceUrl(sectionNum) {
  const colonIdx = sectionNum.indexOf(':');
  if (colonIdx < 0) {
    throw new Error(`buildSourceUrl: missing colon in NH sectionNum: ${sectionNum}`);
  }
  const chapter = sectionNum.slice(0, colonIdx);
  const section = sectionNum.slice(colonIdx + 1);
  return buildNHSourceUrl(chapter, section);
}

// ── Per-chapter config builder ───────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['gc.nh.gov']);
const CRAWL_DELAY_MS = 11000; // robots.txt: Crawl-delay: 11 (HARD; do not lower)
const FETCH_TIMEOUT_MS = 30000;

/**
 * Build a BucketBStateConfig for an NH chapter.
 *
 * @param {string} chapter  e.g. "630" or "632-A"
 * @returns {object}
 */
export function buildChapterConfig(chapter) {
  const desc = NH_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
  return {
    stateCode: 'NH',
    stateName: 'New Hampshire',
    titleNum: chapter,
    titleLabel: desc,
    chapterListUrl: buildChapterUrl(chapter),
    discoverSections: bucketBDiscover,
    parseSection: bucketBParse,
    buildSourceUrl,
    crawlDelay: '11s',
    crawlDelayMs: CRAWL_DELAY_MS,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    allowedHosts: ALLOWED_HOSTS,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────

export function parseCliFlags(argv) {
  const out = { dryRun: false, verbose: false, limit: null, chapters: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isInteger(n) && n > 0) out.limit = n;
    } else if (a.startsWith('--chapters=')) {
      const raw = a.slice('--chapters='.length);
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      // Accept numeric ("625") or letter-suffixed ("632-A") chapter tokens.
      const valid = parts.filter((p) => /^\d{3}(?:-[A-Z])?$/.test(p));
      if (valid.length > 0) out.chapters = valid;
    }
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Iterate cohort chapters, call ingestBucketBState() per chapter, aggregate.
 */
export async function seedNH(opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    limit = null,
    chapters = null,
    connectionString,
  } = opts;

  const targets = chapters && chapters.length ? chapters : NH_COHORT_DEFAULT;

  console.log(`=== seed-statutes-nh-titlelxii ${new Date().toISOString()} ===`);
  console.log(`  cohort   : [${targets.length} chapters]`);
  if (verbose) console.log(`  chapters : ${targets.join(', ')}`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log(`  limit    : ${limit ?? '(all per chapter)'}`);
  console.log(`  verbose  : ${verbose}`);
  console.log(`  routing  : ENGINE-ONLY (11s Crawl-delay; not Vercel-cron-safe)`);

  const t0 = Date.now();
  const results = [];
  let totalRows = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const chapter of targets) {
    if (!NH_CHAPTER_DESCRIPTIONS[chapter]) {
      console.warn(`  WARN: chapter ${chapter} not in NH_CHAPTER_DESCRIPTIONS — proceeding anyway`);
    }
    const desc = NH_CHAPTER_DESCRIPTIONS[chapter] || `Chapter ${chapter}`;
    console.log(`\n--- NH Chapter ${chapter} (${desc}) ---`);

    const config = buildChapterConfig(chapter);
    try {
      const r = await ingestBucketBState(config, {
        dryRun,
        verbose,
        limit,
        connectionString,
      });
      results.push({
        chapter,
        rowCount: r.rowCount,
        skipCount: r.skipCount,
        errorCount: r.errorCount,
        durationMs: r.durationMs,
        ok: true,
      });
      totalRows += r.rowCount;
      totalSkipped += r.skipCount;
      totalErrors += r.errorCount;
    } catch (err) {
      console.error(`  FAIL chapter ${chapter}: ${err.message}`);
      results.push({
        chapter,
        rowCount: 0,
        skipCount: 0,
        errorCount: 0,
        durationMs: 0,
        ok: false,
        error: err.message,
      });
    }
  }

  const totalDurationMs = Date.now() - t0;

  console.log('\n=== Summary ===');
  for (const r of results) {
    const status = r.ok ? 'OK ' : 'FAIL';
    console.log(`  ${status}  ch ${String(r.chapter).padEnd(6)} rows=${r.rowCount} skip=${r.skipCount} err=${r.errorCount} ${r.durationMs}ms${r.error ? ` — ${r.error}` : ''}`);
  }
  console.log(`  TOTAL   rows=${totalRows} skip=${totalSkipped} err=${totalErrors} ${totalDurationMs}ms`);

  return {
    chapters: results,
    totalRows,
    totalSkipped,
    totalErrors,
    totalDurationMs,
  };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const out = await seedNH(flags);

  // Smoke gate: at least one chapter must produce ≥1 row.
  if (out.totalRows < 1) {
    console.error('\nFAIL: 0 rows across cohort — harness or adapter broken');
    process.exit(1);
  }

  // Production-floor gate: only enforced on full live runs (no --limit, no --dry-run, no --chapters subset).
  if (!flags.dryRun && flags.limit == null && flags.chapters == null && out.totalRows < NH_TITLELXII_ROW_FLOOR) {
    console.error(`\nFAIL: total rows ${out.totalRows} below NH floor ${NH_TITLELXII_ROW_FLOOR}`);
    process.exit(1);
  }

  console.log('\nDONE');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
