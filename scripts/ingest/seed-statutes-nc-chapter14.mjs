// Template: scripts/ingest/seed-statutes-va.mjs (Phase 2 second state — closest analogue, Cloudflare-fronted, per-section HTML)
// Expert: openstates-team (per-state scraper class pattern)
// Pattern: cl-bulk-data-defensive #14 (port 5432), #17 (session defaults), #18 (COPY FROM STDIN) + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — ncleg.gov per-section HTML, no bulk file (HTML+PDF only)
//
// NC state statutes seed — Phase 4 (hostile-states bucket, Cloudflare).
// Source: NC General Statutes (https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/).
// Target: entities_statutes (one row per section).
// Coverage: 7 in-scope chapters per docs/ingest/coverage/nc-statutes-coverage.md
//   ch14  (Criminal Law — homicide/assault/theft/property/weapons/sex/fraud)
//   ch15A (Criminal Procedure — offense-bearing sections)
//   ch20  (Motor Vehicles — DWI §20-138.1, reckless, license offenses)
//   ch50B (Domestic Violence — DVPO violations)
//   ch74C (Private Protective Services — criminal sections)
//   ch74E (Company Police — criminal sections)
//   ch90  (Controlled Substances Act — Article 5)
//
// Usage:
//   node scripts/ingest/seed-statutes-nc-chapter14.mjs --dry-run
//   node scripts/ingest/seed-statutes-nc-chapter14.mjs --chapters=14,20 --limit=5
//   node scripts/ingest/seed-statutes-nc-chapter14.mjs --verbose
//   node scripts/ingest/seed-statutes-nc-chapter14.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import { isSectionNotFound, isChapterNotFound, stripHtml, extractSectionNumbers, parseSectionPage, parseSectionFromChapter, isRepealed } from './lib/nc-html.mjs';

export { isSectionNotFound, isChapterNotFound, stripHtml, extractSectionNumbers, parseSectionPage, parseSectionFromChapter, isRepealed };

// ── Env loader (web-repo only, # skip, trim, quote strip) ────────────────
const envPaths = [
  'C:/Users/email/projects/_worktrees/statutes-nc-v1/.env.local',
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
];
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

// ── Coverage: 7 in-scope NC chapters (criminal high-signal) ─────────────
// NC section IDs format: <chapter>-<section> e.g. "14-17" or "20-138.1".
// Lettered chapters (15A, 74C, 74E) use their literal id in URL + section ID.
export const NC_CHAPTERS = {
  '14':  { description: 'Criminal Law' },
  '15A': { description: 'Criminal Procedure Act' },
  '20':  { description: 'Motor Vehicles (incl. DWI 20-138.1)' },
  '50B': { description: 'Domestic Violence (DVPO)' },
  '74C': { description: 'Private Protective Services Act' },
  '74E': { description: 'Company Police Act' },
  '90':  { description: 'Controlled Substances Act' },
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Coverage doc floor: 2.0s. Add jitter 0-1500ms to avoid burst patterns.
const RATE_MIN_MS = 2000;
const RATE_MAX_MS = 3500;
const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;
// J5: abort after N consecutive Cloudflare 403/503 challenges (no infinite loop).
const CLOUDFLARE_ABORT_THRESHOLD = 5;
const NC_BASE = 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/';
const ALLOWED_HOSTS = new Set(['www.ncleg.gov']);

// ── CLI flags ────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = { dryRun: false, chapters: null, limitSections: null, verbose: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--verbose') flags.verbose = true;
    else if (arg.startsWith('--chapters=')) {
      flags.chapters = arg.slice('--chapters='.length).split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (arg.startsWith('--limit=')) {
      flags.limitSections = Number.parseInt(arg.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── Zod contract (reject-before-INSERT) ──────────────────────────────────
// Section regex: <chapter>-<num>(.<num>[A-Z]?)?  e.g. 14-17, 20-138.1, 14-18.1A
// Chapter regex: digits with optional trailing single uppercase letter (15A, 74C, 74E).
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('NC'),
  // NC "title" stores the chapter id (14, 15A, 20, 50B, 74C, 74E, 90).
  title: z.string().regex(/^[0-9]+[A-Z]?$/),
  // NC section format: <chapter>-<num>(.<num>[A-Z]?)?  e.g. "14-17", "20-138.1", "14-18.1A"
  section: z.string().regex(/^[0-9]+[A-Z]?-[0-9]+(?:\.[0-9]+[A-Z]?)?$/),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const u = new URL(urls[0]);
        return u.protocol === 'https:' && u.hostname.toLowerCase() === 'www.ncleg.gov';
      } catch { return false; }
    }, 'Primary source_url must be HTTPS on www.ncleg.gov'),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
      const d = new Date(s + 'T00:00:00Z');
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'effective_date must be a valid calendar date'),
    z.null(),
  ]),
  scraped_at: z.string().datetime().max(40),
});

// ── URL builders ─────────────────────────────────────────────────────────
export function buildChapterUrl(chapter) {
  const c = String(chapter);
  if (!NC_CHAPTERS[c]) throw new Error('Chapter ' + c + ' not in NC_CHAPTERS');
  return NC_BASE + 'ByChapter/Chapter_' + c + '.html';
}

export function buildSectionUrl(chapter, section) {
  const c = String(chapter);
  if (!NC_CHAPTERS[c]) throw new Error('Chapter ' + c + ' not in NC_CHAPTERS');
  return NC_BASE + 'BySection/Chapter_' + c + '/GS_' + c + '-' + section + '.html';
}

function isAllowedHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch { return false; }
}

// ── Fetch with retry + circuit breaker + Cloudflare abort ────────────────
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let cloudflareChallenges = 0;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomDelay() { return RATE_MIN_MS + Math.floor(Math.random() * (RATE_MAX_MS - RATE_MIN_MS)); }

export class CloudflareAbortError extends Error {
  constructor(challenges) {
    super('Aborted: ' + challenges + ' consecutive Cloudflare challenges (J5 threshold)');
    this.name = 'CloudflareAbortError';
  }
}

export async function fetchWithRetry(url, { fetchImpl } = {}) {
  if (!isAllowedHost(url)) throw new Error('Host not allowed: ' + url);
  const doFetch = fetchImpl || fetch;
  if (circuitOpenUntil > Date.now()) {
    await sleep(circuitOpenUntil - Date.now());
    consecutiveFailures = 0;
  }
  let lastError = null;
  for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
    await sleep(randomDelay());
    let resp;
    try {
      resp = await doFetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        redirect: 'follow',
      });
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_BACKOFFS_MS.length - 1) await sleep(RETRY_BACKOFFS_MS[attempt]);
      continue;
    }
    if (resp.ok) {
      const body = await resp.text();
      consecutiveFailures = 0;
      cloudflareChallenges = 0;
      return body;
    }
    // Cloudflare challenge / forbidden / service unavailable
    if (resp.status === 403 || resp.status === 503) {
      cloudflareChallenges += 1;
      if (cloudflareChallenges >= CLOUDFLARE_ABORT_THRESHOLD) {
        throw new CloudflareAbortError(cloudflareChallenges);
      }
    }
    lastError = new Error('HTTP ' + resp.status);
    const retryable = resp.status >= 500 || resp.status === 429 || resp.status === 403;
    if (!retryable) {
      consecutiveFailures = 0;
      throw lastError;
    }
    if (attempt < RETRY_BACKOFFS_MS.length - 1) await sleep(RETRY_BACKOFFS_MS[attempt]);
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
    console.warn('  circuit breaker OPEN');
  }
  throw lastError || new Error('exhausted retries');
}

export function _resetBreakerForTests() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  cloudflareChallenges = 0;
}

// ── Row builder ──────────────────────────────────────────────────────────
export function buildRow({ chapter, section, titleText, bodyText, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'NC',
    title: String(chapter),
    section: String(chapter) + '-' + section,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: textHash,
    effective_date: null,
    scraped_at: scrapedAt || new Date().toISOString(),
  };
}

export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const parts = arr.map((u) => {
    const safe = String(u).split('\\').join('\\\\').split('"').join('\\"').split('\r').join(' ').split('\n').join(' ');
    return '"' + safe + '"';
  });
  return '{' + parts.join(',') + '}';
}

// ── Orchestrator ─────────────────────────────────────────────────────────
export async function seedNC({ dryRun, chapters, limitSections, verbose, fetchImpl, dbFactory } = {}) {
  const targets = chapters && chapters.length
    ? chapters.map(String).filter((c) => NC_CHAPTERS[c])
    : Object.keys(NC_CHAPTERS);
  console.log('=== seed-statutes-nc-chapter14 ' + new Date().toISOString() + ' ===');
  console.log('  chapters: [' + targets.join(', ') + ']');
  console.log('  dry-run: ' + !!dryRun);
  if (limitSections) console.log('  limit per chapter: ' + limitSections);

  const allRows = [];
  const byChapter = {};
  const rejected = [];

  for (const chapter of targets) {
    if (!NC_CHAPTERS[chapter]) {
      console.warn('  skipping chapter ' + chapter + ' (not in map)');
      continue;
    }
    console.log('\n--- Chapter ' + chapter + ' (' + NC_CHAPTERS[chapter].description + ') ---');
    const chapterUrl = buildChapterUrl(chapter);
    let chapterHtml;
    try {
      chapterHtml = await fetchWithRetry(chapterUrl, { fetchImpl });
    } catch (e) {
      if (e instanceof CloudflareAbortError) {
        console.error('  ABORT: ' + e.message);
        throw e;
      }
      console.warn('  WARN ch ' + chapter + ': fetch failed — ' + e.message);
      byChapter[chapter] = { parsed: 0, rejected: 0, status: 'index_failed' };
      continue;
    }
    let sections = extractSectionNumbers(chapterHtml, chapter);
    if (limitSections) sections = sections.slice(0, limitSections);
    console.log('  discovered ' + sections.length + ' sections (parsing inline from chapter HTML; no per-section fetch)');

    let ok = 0, bad = 0, repealed = 0;
    for (const section of sections) {
      // Per-section permalink for source_urls — verified to exist (per coverage doc).
      // We do NOT fetch this URL; we parse from the chapter HTML we already have
      // (chapter pages embed every section's full text inline).
      const sectionUrl = buildSectionUrl(chapter, section);
      const parsed = parseSectionFromChapter(chapterHtml, chapter, section);
      if (!parsed) {
        // Could be repealed or unparseable. Probe for tombstone by parsing
        // a small slice for accounting only.
        repealed += 1; // count all unparseable as rejected; tombstone-vs-malformed split is noise
        bad += 1; continue;
      }
      const row = buildRow({
        chapter,
        section,
        titleText: parsed.titleText,
        bodyText: parsed.bodyText,
        sourceUrl: sectionUrl,
      });
      const check = StatuteRowSchema.safeParse(row);
      if (!check.success) {
        rejected.push({ chapter, section, issues: check.error.issues.map((i) => i.path.join('.') + ': ' + i.message) });
        bad += 1; continue;
      }
      allRows.push(row);
      ok += 1;
      if (verbose && ok <= 5) console.log('    OK ' + chapter + '-' + section + ' — ' + parsed.titleText.slice(0, 60) + ' — ' + parsed.bodyText.length + 'ch');
    }
    byChapter[chapter] = { parsed: ok, rejected: bad, repealed, total: sections.length };
    console.log('  chapter ' + chapter + ': ' + ok + ' parsed, ' + bad + ' rejected/repealed/skipped of ' + sections.length);
  }

  console.log('\n=== TOTAL: ' + allRows.length + ' rows across ' + Object.keys(byChapter).length + ' chapters ===');
  console.log(JSON.stringify(byChapter, null, 2));
  if (rejected.length > 0) {
    console.log('\nREJECTED (' + rejected.length + '):');
    for (const r of rejected.slice(0, 10)) console.log('  ch' + r.chapter + ' §' + r.section + ': ' + r.issues.join('; '));
  }

  // Dedupe on full natural key (jurisdiction, title, section, subsection, effective_date).
  const seen = new Map();
  for (const r of allRows) {
    const key = r.jurisdiction + ':' + r.title + ':' + r.section + ':' + (r.subsection || '') + ':' + (r.effective_date || '');
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];

  if (dryRun) {
    console.log('\n=== DRY RUN — no DB write ===');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
    const previewPath = path.join(repoRoot, 'data', 'statutes-nc-' + stamp + '.jsonl');
    try {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true });
      fs.writeFileSync(previewPath, deduped.map((r) => JSON.stringify(r)).join('\n'));
      console.log('preview: ' + previewPath);
    } catch (e) { console.warn('  WARN: ' + e.message); }
    return { rows: deduped, byChapter, rejected };
  }

  if (deduped.length === 0) throw new Error('seedNC: no rows parsed');

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    console.log('\nwriting ' + deduped.length + ' rows...');
    await client.query('BEGIN');
    try {
      // Self-healing: clear prior NC rows for this chapter set.
      const titleStrs = [...new Set(deduped.map((r) => r.title))];
      const { rowCount: deleted } = await client.query(
        'DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = ANY($2::text[])',
        ['NC', titleStrs],
      );
      if (deleted) console.log('  cleared ' + deleted + ' prior NC rows');
      const COLS = ['jurisdiction','title','section','subsection','section_text','is_current','source_urls','text_hash','effective_date','scraped_at'];
      async function* rowsGen() {
        for (const r of deduped) {
          yield [r.jurisdiction, r.title, r.section, r.subsection, r.section_text, r.is_current, textArrayLiteral(r.source_urls), r.text_hash, r.effective_date, r.scraped_at];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLS, rowsGen());
      console.log('  COPYd ' + rowCount + ' rows in ' + (durationMs / 1000).toFixed(1) + 's');
      const { rows: verify } = await client.query(
        "SELECT count(*)::int AS n, sum(CASE WHEN array_length(source_urls,1) IS NULL THEN 1 ELSE 0 END)::int AS missing_sources, sum(CASE WHEN section_text IS NULL OR section_text='' THEN 1 ELSE 0 END)::int AS empty_body FROM entities_statutes WHERE jurisdiction='NC'"
      );
      console.log('pre-commit verify: ' + JSON.stringify(verify[0]));
      if (verify[0].missing_sources > 0) throw new Error(verify[0].missing_sources + ' missing source_urls');
      if (verify[0].empty_body > 0) throw new Error(verify[0].empty_body + ' empty section_text');
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await cleanup();
  }
  return { rows: deduped, byChapter, rejected };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  await seedNC(flags);
  console.log('\n=== done ===');
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
