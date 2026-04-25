// Template: scripts/ingest/seed-statutes-oh.mjs (Phase 2 first) + seed-statutes-fl.mjs (Phase 1 base)
// Expert: openstates-team (per-state scraper class pattern)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — Code of Virginia is web-only (developer page mentions REST API but path not discoverable)
//
// VA state statutes seed — Phase 2 second state (after OH PR #128).
// Source: Code of Virginia (https://law.lis.virginia.gov/vacode/).
// Target: entities_statutes (one row per section).
// Coverage: Title 18.2 (Crimes and Offenses Generally), 4 high-signal chapters:
//   ch4 (Crimes Against the Person), ch5 (Crimes Against Property),
//   ch6 (Crimes Involving Fraud), ch7 (Crimes Involving Health and Safety — DUI/drugs).
//
// Usage:
//   node scripts/ingest/seed-statutes-va.mjs --dry-run
//   node scripts/ingest/seed-statutes-va.mjs --chapters=7 --limit=5
//   node scripts/ingest/seed-statutes-va.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import { isSectionNotFound, stripHtml, extractSectionNumbers, parseSectionPage } from './lib/va-html.mjs';

export { isSectionNotFound, stripHtml, extractSectionNumbers, parseSectionPage };

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

// ── Coverage: VA Title 18.2 chapters 4-7 (criminal high-signal) ─────────
// VA section IDs embed the title (18.2-266), so we store title='18.2' on
// every row regardless of chapter — chapter is structural in the URL only.
export const VA_TITLE = '18.2';
export const VA_CHAPTERS = {
  4: { description: 'Crimes Against the Person' },
  5: { description: 'Crimes Against Property' },
  6: { description: 'Crimes Involving Fraud' },
  7: { description: 'Crimes Involving Health and Safety (incl. DUI 18.2-266)' },
};

const USER_AGENT = 'INAA-legal-research/1.0 (+https://imnotanattorney.com/about)';
const RATE_MIN_MS = 500;
const RATE_MAX_MS = 2000;
const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;
const VA_BASE = 'https://law.lis.virginia.gov/vacode/';
const ALLOWED_HOSTS = new Set(['law.lis.virginia.gov']);

// ── CLI flags ────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = { dryRun: false, chapters: null, limitSections: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--chapters=')) {
      flags.chapters = arg.slice('--chapters='.length).split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n));
    } else if (arg.startsWith('--limit=')) {
      flags.limitSections = Number.parseInt(arg.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── Zod contract (reject-before-INSERT) ──────────────────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('VA'),
  // VA "title" stores the full Title 18.2 ID since VA section IDs already
  // embed the title (18.2-266). Chapter is structural in URL only.
  title: z.string().regex(/^\d+(?:\.\d+)?$/),
  // VA section format: <title>-<num> e.g. "18.2-266" or "18.2-266.1"
  section: z.string().regex(/^\d+(?:\.\d+)?-\d+(?:\.\d+)?$/),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return host === 'law.lis.virginia.gov';
      } catch { return false; }
    }, 'Primary source_url host must be law.lis.virginia.gov'),
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
  if (!VA_CHAPTERS[chapter]) throw new Error('Chapter ' + chapter + ' not in VA_CHAPTERS');
  return VA_BASE + 'title' + VA_TITLE + '/chapter' + chapter + '/';
}

export function buildSectionUrl(chapter, section) {
  if (!VA_CHAPTERS[chapter]) throw new Error('Chapter ' + chapter + ' not in VA_CHAPTERS');
  return VA_BASE + 'title' + VA_TITLE + '/chapter' + chapter + '/section' + section + '/';
}

function isAllowedHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch { return false; }
}

void isAllowedHost; // referenced inside fetchWithRetry

// ── Fetch with retry + circuit breaker ───────────────────────────────────
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomDelay() { return RATE_MIN_MS + Math.floor(Math.random() * (RATE_MAX_MS - RATE_MIN_MS)); }

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
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
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
      return body;
    }
    lastError = new Error('HTTP ' + resp.status);
    const retryable = resp.status >= 500 || resp.status === 429;
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

export function _resetBreakerForTests() { consecutiveFailures = 0; circuitOpenUntil = 0; }

// ── Row builder ──────────────────────────────────────────────────────────
export function buildRow({ section, titleText, bodyText, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'VA',
    title: VA_TITLE,
    section,
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
export async function seedVA({ dryRun, chapters, limitSections, fetchImpl, dbFactory } = {}) {
  const targets = chapters && chapters.length ? chapters : Object.keys(VA_CHAPTERS).map(Number);
  console.log('=== seed-statutes-va ' + new Date().toISOString() + ' ===');
  console.log('  chapters: [' + targets.join(', ') + ']');
  console.log('  dry-run: ' + !!dryRun);
  if (limitSections) console.log('  limit per chapter: ' + limitSections);

  const allRows = [];
  const byChapter = {};
  const rejected = [];

  for (const chapter of targets) {
    if (!VA_CHAPTERS[chapter]) {
      console.warn('  skipping chapter ' + chapter + ' (not in map)');
      continue;
    }
    console.log('\n--- Title ' + VA_TITLE + ' Chapter ' + chapter + ' (' + VA_CHAPTERS[chapter].description + ') ---');
    const chapterUrl = buildChapterUrl(chapter);
    let chapterHtml;
    try {
      chapterHtml = await fetchWithRetry(chapterUrl, { fetchImpl });
    } catch (e) {
      console.warn('  WARN ch ' + chapter + ': fetch failed — ' + e.message);
      byChapter[chapter] = { parsed: 0, rejected: 0, status: 'index_failed' };
      continue;
    }
    let sections = extractSectionNumbers(chapterHtml, VA_TITLE, chapter);
    if (limitSections) sections = sections.slice(0, limitSections);
    console.log('  discovered ' + sections.length + ' sections');

    let ok = 0, bad = 0;
    for (const section of sections) {
      const sectionUrl = buildSectionUrl(chapter, section);
      let html;
      try {
        html = await fetchWithRetry(sectionUrl, { fetchImpl });
      } catch (e) {
        console.warn('    section ' + section + ': fetch failed — ' + e.message);
        bad += 1; continue;
      }
      const parsed = parseSectionPage(html, section);
      if (!parsed) {
        bad += 1; continue;
      }
      const row = buildRow({
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
      if (ok <= 3) console.log('    OK ' + section + ' — ' + parsed.titleText.slice(0, 60) + ' — ' + parsed.bodyText.length + 'ch');
    }
    byChapter[chapter] = { parsed: ok, rejected: bad, total: sections.length };
    console.log('  chapter ' + chapter + ': ' + ok + ' parsed, ' + bad + ' rejected/failed');
  }

  console.log('\n=== TOTAL: ' + allRows.length + ' rows across ' + Object.keys(byChapter).length + ' chapters ===');
  console.log(JSON.stringify(byChapter, null, 2));
  if (rejected.length > 0) {
    console.log('\nREJECTED (' + rejected.length + '):');
    for (const r of rejected.slice(0, 10)) console.log('  ch' + r.chapter + ' §' + r.section + ': ' + r.issues.join('; '));
  }

  // Dedupe on full natural key.
  const seen = new Map();
  for (const r of allRows) {
    const key = r.title + ':' + r.section + ':' + (r.subsection || '') + ':' + (r.effective_date || '');
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];

  if (dryRun) {
    console.log('\n=== DRY RUN — no DB write ===');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
    const previewPath = path.join(repoRoot, 'data', 'statutes-va-' + stamp + '.jsonl');
    try {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true });
      fs.writeFileSync(previewPath, deduped.map((r) => JSON.stringify(r)).join('\n'));
      console.log('preview: ' + previewPath);
    } catch (e) { console.warn('  WARN: ' + e.message); }
    return { rows: deduped, byChapter, rejected };
  }

  if (deduped.length === 0) throw new Error('seedVA: no rows parsed');

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    console.log('\nwriting ' + deduped.length + ' rows...');
    await client.query('BEGIN');
    try {
      const sectionStrs = deduped.map((r) => r.section);
      const { rowCount: deleted } = await client.query(
        'DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND section = ANY($3::text[])',
        ['VA', VA_TITLE, sectionStrs],
      );
      if (deleted) console.log('  cleared ' + deleted + ' prior VA rows');
      const COLS = ['jurisdiction','title','section','subsection','section_text','is_current','source_urls','text_hash','effective_date','scraped_at'];
      async function* rowsGen() {
        for (const r of deduped) {
          yield [r.jurisdiction, r.title, r.section, r.subsection, r.section_text, r.is_current, textArrayLiteral(r.source_urls), r.text_hash, r.effective_date, r.scraped_at];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLS, rowsGen());
      console.log('  COPYd ' + rowCount + ' rows in ' + (durationMs / 1000).toFixed(1) + 's');
      const { rows: verify } = await client.query(
        "SELECT count(*)::int AS n, sum(CASE WHEN array_length(source_urls,1) IS NULL THEN 1 ELSE 0 END)::int AS missing_sources, sum(CASE WHEN section_text IS NULL OR section_text='' THEN 1 ELSE 0 END)::int AS empty_body FROM entities_statutes WHERE jurisdiction='VA'"
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
  await seedVA(flags);
  console.log('\n=== done ===');
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
