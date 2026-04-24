// Template: scripts/ingest/pji-ingest.mjs
// Expert: openstates-team
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — FL Online Sunshine is web-only; FLLawDL2025.zip is a Windows InstallShield installer, not parseable bulk data
//
// FL state statutes seed — Phase 1 of state-statutes-scaling.
// Source: Florida Online Sunshine (http://www.leg.state.fl.us/Statutes/).
// Target: entities_statutes (one row per section).
// Coverage: chapters 316 (DUI/traffic), 775 (penalties), 784 (assault/battery),
//           810 (burglary), 812 (theft/robbery), 893 (drug abuse prevention).
//
// Every row carries non-empty source_urls[] pointing to a URL we actually fetched
// (per-section page on leg.state.fl.us). Zod contract rejects any row that
// fails the integrity check BEFORE it reaches INSERT (OpenStates Rule 2).
//
// Usage:
//   node scripts/ingest/seed-statutes-fl.mjs --dry-run             # preview only
//   node scripts/ingest/seed-statutes-fl.mjs --chapters=893        # single chapter
//   node scripts/ingest/seed-statutes-fl.mjs --chapters=316,893    # subset
//   node scripts/ingest/seed-statutes-fl.mjs                       # full Phase 1
//
// Rate model (OpenStates Rule 3): 0.5-2s random delay per fetch, 3 retries with
// exponential 5-120s backoff on failure, User-Agent rotation, circuit breaker
// 120s after 3 consecutive failures.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  isSectionNotFound,
  stripHtml,
  extractSectionNumbers,
  parseSectionPage,
} from './lib/fl-html.mjs';

// Re-export helpers for tests without pulling in the main() runner.
export {
  isSectionNotFound,
  stripHtml,
  extractSectionNumbers,
  parseSectionPage,
};

// ── Env loader (line-by-line, indexOf — no regex on file contents) ─────────
// Web-repo .env.local only — cross-repo reads widened credential blast-radius
// (SEC-W1 from 2026-04-24 security audit). Skips comment lines (`#`), trims
// whitespace, strips balanced surrounding quotes. Matches dotenv semantics
// closely enough for this scope.
const envPaths = [
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  const lines = txt.split('\n');
  for (const rawLine of lines) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes.
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Config: FL chapter→range hardcoded lookup (OpenStates Rule 1) ──────────
// Hardcoded, NOT a formula. FL redraws ranges occasionally; a formula breaks
// silently. Phase 1 covers 6 chapters ≈ 80% of INAA FL intake.
export const FL_CHAPTERS = {
  316: { range: '0300-0399', description: 'Traffic / DUI' },
  775: { range: '0700-0799', description: 'Penalties' },
  784: { range: '0700-0799', description: 'Assault / battery' },
  810: { range: '0800-0899', description: 'Burglary' },
  812: { range: '0800-0899', description: 'Theft / robbery' },
  893: { range: '0800-0899', description: 'Drug abuse prevention' },
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 INAA-legal-research/1.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 INAA-legal-research/1.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 INAA-legal-research/1.0',
];

const RATE_MIN_MS = 500;
const RATE_MAX_MS = 2000;
const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;

// HTTPS mandatory — plaintext HTTP is MITM-able and an attacker can substitute
// statute text that passes SHA-256 integrity (hash is over the delivered bytes,
// not over an out-of-band source of truth). SEC-C1 from 2026-04-24 audit.
const FL_BASE = 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=';

// ── CLI flags ────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = { dryRun: false, chapters: null, limitSections: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--chapters=')) {
      flags.chapters = arg.slice('--chapters='.length)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n));
    } else if (arg.startsWith('--limit=')) {
      flags.limitSections = Number.parseInt(arg.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── Zod contract (OpenStates Rule 2 — reject-before-INSERT) ─────────────────
// Shape matches LIVE entities_statutes schema (verified 2026-04-24):
//   canonical_id is DB-generated UUID (not provided by script)
//   section_text is a single column (title + body merged with blank line)
//   subsection is nullable, part of the unique (jurisdiction, title, section,
//     subsection, effective_date) index — seed always writes NULL subsection.
//
// Max caps from 2026-04-24 security audit (SEC-W6): section_text capped at
// the parser layer (20KB) and ALSO here with headroom so a parser bug never
// produces megabyte rows. source_urls capped to 10 entries + 2048 chars per
// URL. URL host restricted via .refine hostname check (SEC-W7).
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('FL'),
  title: z.string().regex(/^\d+$/),
  section: z.string().regex(/^\d+\.\w[\w.-]*$/),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return host === 'www.leg.state.fl.us' || host === 'leg.state.fl.us';
      } catch { return false; }
    }, 'Primary source_url host must be leg.state.fl.us'),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
      // Reject invalid real dates: "0000-01-01", "2024-02-30", etc.
      const d = new Date(s + 'T00:00:00Z');
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'effective_date must be a valid calendar date'),
    z.null(),
  ]),
  scraped_at: z.string().datetime().max(40),
});

// ── URL construction (OpenStates Rule 1) ────────────────────────────────────
export function buildChapterIndexUrl(chapter) {
  const meta = FL_CHAPTERS[chapter];
  if (!meta) throw new Error('Chapter ' + chapter + ' not in FL_CHAPTERS map');
  const pad = String(chapter).padStart(4, '0');
  return FL_BASE + meta.range + '/' + pad + '/' + pad + 'ContentsIndex.html';
}

export function buildChapterPageUrl(chapter) {
  const meta = FL_CHAPTERS[chapter];
  if (!meta) throw new Error('Chapter ' + chapter + ' not in FL_CHAPTERS map');
  const pad = String(chapter).padStart(4, '0');
  return FL_BASE + meta.range + '/' + pad + '/' + pad + '.html';
}

export function buildSectionUrl(chapter, section) {
  const meta = FL_CHAPTERS[chapter];
  if (!meta) throw new Error('Chapter ' + chapter + ' not in FL_CHAPTERS map');
  const pad = String(chapter).padStart(4, '0');
  // FL section filenames use the padded chapter too: 0893.01.html, 0316.193.html.
  // The unpadded form returns a generic fallback page (not a 404), so we MUST
  // pad. Section string in the DB stays unpadded ("893.01").
  const dot = section.indexOf('.');
  const rest = dot >= 0 ? section.slice(dot) : ('.' + section);
  return FL_BASE + meta.range + '/' + pad + '/Sections/' + pad + rest + '.html';
}

// ── HTTP fetch with retry + UA rotation + circuit breaker ──────────────────
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomDelay() { return RATE_MIN_MS + Math.floor(Math.random() * (RATE_MAX_MS - RATE_MIN_MS)); }
function randomUa() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

export async function fetchWithRetry(url, { signal, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  if (circuitOpenUntil > Date.now()) {
    await sleep(circuitOpenUntil - Date.now());
    consecutiveFailures = 0;
  }

  // Retry flow split from status flow so that non-retryable errors (4xx except
  // 429) don't drive the outer loop or bump the breaker counter (W3/W4 from
  // 2026-04-24 code review).
  let lastError = null;
  for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
    await sleep(randomDelay());
    let resp;
    try {
      resp = await doFetch(url, {
        headers: { 'User-Agent': randomUa(), 'Accept': 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal,
      });
    } catch (e) {
      // Network-level failure — retryable.
      lastError = e;
      if (attempt < RETRY_BACKOFFS_MS.length - 1) {
        await sleep(RETRY_BACKOFFS_MS[attempt]);
      }
      continue;
    }

    if (resp.ok) {
      const body = await resp.text();
      consecutiveFailures = 0;
      return body;
    }

    // Non-2xx response.
    lastError = new Error('HTTP ' + resp.status);
    const retryable = resp.status >= 500 || resp.status === 429;
    if (!retryable) {
      // 404 etc: don't retry, don't bump breaker.
      consecutiveFailures = 0;
      throw lastError;
    }
    if (attempt < RETRY_BACKOFFS_MS.length - 1) {
      await sleep(RETRY_BACKOFFS_MS[attempt]);
    }
  }

  // Exhausted retries on retryable errors only.
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
    console.warn('  circuit breaker OPEN for ' + (CIRCUIT_BREAKER_PAUSE_MS / 1000) + 's after ' + consecutiveFailures + ' consecutive failures');
  }
  throw lastError || new Error('fetchWithRetry: exhausted retries');
}

// Test helper — reset breaker between cases.
export function _resetBreakerForTests() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

// ── Row builder ─────────────────────────────────────────────────────────────
// canonical_id is NOT set here — DB auto-generates UUID via gen_random_uuid().
// title + body collapse into single section_text (titleText + blank line + body),
// matching the live single-column shape.
export function buildRow({ chapter, section, titleText, bodyText, effectiveDate, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'FL',
    title: String(chapter),
    section,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: textHash,
    effective_date: effectiveDate,
    scraped_at: scrapedAt || new Date().toISOString(),
  };
}

// ── TEXT[] literal for COPY. Escapes ALL Postgres-array-literal delimiters. ─
// Characters that must escape inside a quoted array element: `\`, `"`. The
// whole element is quoted so `,` `{` `}` are safe within quotes, but we ALSO
// escape `\r` `\n` to avoid CSV-layer row breakage when csvEscape (above)
// wraps the whole array as a single CSV field. SEC-W2 fix from 2026-04-24.
export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const parts = arr.map((u) => {
    const safe = String(u)
      .split('\\').join('\\\\')
      .split('"').join('\\"')
      .split('\r').join(' ')
      .split('\n').join(' ');
    return '"' + safe + '"';
  });
  return '{' + parts.join(',') + '}';
}

// ── Orchestrator ────────────────────────────────────────────────────────────
export async function seedFL({ dryRun, chapters, limitSections, fetchImpl, dbFactory }) {
  const targets = chapters && chapters.length ? chapters : Object.keys(FL_CHAPTERS).map(Number);
  console.log('=== seed-statutes-fl ' + new Date().toISOString() + ' ===');
  console.log('  chapters: [' + targets.join(', ') + ']');
  console.log('  dry-run: ' + dryRun);
  if (limitSections) console.log('  limit sections per chapter: ' + limitSections);

  const allRows = [];
  const byChapter = {};
  const rejected = [];

  for (const chapter of targets) {
    if (!FL_CHAPTERS[chapter]) {
      console.warn('  skipping chapter ' + chapter + ' (not in map)');
      continue;
    }
    console.log('\n--- Chapter ' + chapter + ' (' + FL_CHAPTERS[chapter].description + ') ---');

    const indexUrl = buildChapterIndexUrl(chapter);
    console.log('  fetching index: ' + indexUrl);
    let indexHtml;
    try {
      indexHtml = await fetchWithRetry(indexUrl, { fetchImpl });
    } catch (e) {
      console.warn('  WARN chapter ' + chapter + ': index fetch failed — ' + e.message);
      byChapter[chapter] = { parsed: 0, rejected: 0, status: 'index_failed' };
      continue;
    }

    let sections = extractSectionNumbers(indexHtml, chapter);
    if (sections.length === 0) {
      const chapterPageUrl = buildChapterPageUrl(chapter);
      console.log('  no sections from index, trying chapter page: ' + chapterPageUrl);
      try {
        const chapterHtml = await fetchWithRetry(chapterPageUrl, { fetchImpl });
        sections = extractSectionNumbers(chapterHtml, chapter);
      } catch (e) {
        console.warn('  WARN chapter ' + chapter + ': chapter page fetch failed — ' + e.message);
      }
    }

    if (limitSections) sections = sections.slice(0, limitSections);
    console.log('  discovered ' + sections.length + ' sections');

    let ok = 0;
    let bad = 0;
    for (const section of sections) {
      const sectionUrl = buildSectionUrl(chapter, section);
      let html;
      try {
        html = await fetchWithRetry(sectionUrl, { fetchImpl });
      } catch (e) {
        console.warn('    section ' + section + ': fetch failed — ' + e.message);
        bad += 1;
        continue;
      }

      const parsed = parseSectionPage(html, chapter, section);
      if (!parsed) {
        console.warn('    section ' + section + ': not-found or thin page');
        bad += 1;
        continue;
      }

      const row = buildRow({
        chapter,
        section,
        titleText: parsed.titleText,
        bodyText: parsed.bodyText,
        effectiveDate: parsed.effectiveDate,
        sourceUrl: sectionUrl,
      });

      const check = StatuteRowSchema.safeParse(row);
      if (!check.success) {
        rejected.push({ chapter, section, issues: check.error.issues.map((i) => i.path.join('.') + ': ' + i.message) });
        bad += 1;
        continue;
      }

      allRows.push(row);
      ok += 1;
      if (ok <= 3) {
        console.log('    OK ' + section + ' — ' + parsed.titleText.slice(0, 60) + ' — ' + parsed.bodyText.length + 'ch');
      }
    }

    byChapter[chapter] = { parsed: ok, rejected: bad, total: sections.length };
    console.log('  chapter ' + chapter + ': ' + ok + ' parsed, ' + bad + ' rejected/failed');
  }

  console.log('\n=== TOTAL: ' + allRows.length + ' rows across ' + Object.keys(byChapter).length + ' chapters ===');
  console.log(JSON.stringify(byChapter, null, 2));
  if (rejected.length > 0) {
    console.log('\nREJECTED (' + rejected.length + '):');
    for (const r of rejected.slice(0, 10)) {
      console.log('  ch' + r.chapter + ' §' + r.section + ': ' + r.issues.join('; '));
    }
    if (rejected.length > 10) console.log('  ... ' + (rejected.length - 10) + ' more');
  }

  // Dedupe on the full unique-index tuple (jurisdiction, title, section,
  // subsection, effective_date) so two legitimately-different amendments of
  // the same section survive (C3 from 2026-04-24 code review). Postgres
  // unique index defaults to NULLS-DISTINCT, so two rows with NULL
  // subsection+effective_date would NOT collide on the DB — still we dedupe
  // so the in-memory set is clean before COPY.
  const seen = new Map();
  for (const r of allRows) {
    const key = r.title + ':' + r.section + ':' +
      (r.subsection || '') + ':' + (r.effective_date || '');
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];
  if (deduped.length !== allRows.length) {
    console.log('After dedupe: ' + deduped.length + ' rows (was ' + allRows.length + ')');
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — no DB write ===');
    // Absolute path under repo root so the preview lands in the gitignored
    // data/ dir regardless of cwd (SEC-W8 from 2026-04-24 security audit).
    const { fileURLToPath } = await import('node:url');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
    const previewPath = path.join(repoRoot, 'data', 'statutes-fl-' + stamp + '.jsonl');
    try {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true });
      fs.writeFileSync(previewPath, deduped.map((r) => JSON.stringify(r)).join('\n'));
      console.log('preview written to ' + previewPath);
    } catch (e) {
      console.warn('  WARN: could not write preview file — ' + e.message);
    }
    return { rows: deduped, byChapter, rejected };
  }

  if (deduped.length === 0) {
    // Don't process.exit — kills test runners and orchestrators that import
    // this module (W7 from 2026-04-24 code review).
    throw new Error('seedFL: no rows parsed — aborting DB write.');
  }

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    console.log('\nwriting ' + deduped.length + ' rows to entities_statutes...');

    // Note on DELETE-before-COPY: canonical_id UUIDs regenerate on every run.
    // No downstream code persists canonical_id as a foreign key or uses it as
    // a long-lived identifier — entity-whitelist + generate-report treat it
    // as an in-memory Map key per report. C1 from 2026-04-24 code review
    // acknowledged & documented.
    await client.query('BEGIN');
    try {
      // Parameterized DELETE — defends against any future caller passing
      // untrusted chapter values into seedFL({chapters}) (C2 / SEC-W5).
      const titleStrs = targets.map(String);
      const { rowCount: deleted } = await client.query(
        'DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = ANY($2::text[])',
        ['FL', titleStrs],
      );
      if (deleted) console.log('  cleared ' + deleted + ' prior FL rows for chapters [' + titleStrs.join(', ') + ']');

      // canonical_id omitted — DB gen_random_uuid() fills it.
      const COLS = [
        'jurisdiction', 'title', 'section', 'subsection',
        'section_text', 'is_current', 'source_urls',
        'text_hash', 'effective_date', 'scraped_at',
      ];

      async function* rowsGen() {
        for (const r of deduped) {
          yield [
            r.jurisdiction, r.title, r.section, r.subsection,
            r.section_text, r.is_current,
            textArrayLiteral(r.source_urls),
            r.text_hash, r.effective_date, r.scraped_at,
          ];
        }
      }

      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLS, rowsGen());
      console.log('  COPYd ' + rowCount + ' rows in ' + (durationMs / 1000).toFixed(1) + 's');

      // Verify INSIDE the transaction so a broken row-set can roll back
      // (C4 from 2026-04-24 code review — post-commit verify had no rollback
      // path).
      const { rows: verify } = await client.query(
        "SELECT count(*)::int AS n, " +
        "       sum(CASE WHEN array_length(source_urls, 1) IS NULL THEN 1 ELSE 0 END)::int AS missing_sources, " +
        "       sum(CASE WHEN section_text IS NULL OR section_text = '' THEN 1 ELSE 0 END)::int AS empty_body " +
        "  FROM entities_statutes " +
        " WHERE jurisdiction = 'FL'",
      );
      console.log('\npre-commit verify: ' + JSON.stringify(verify[0]));
      if (verify[0].missing_sources > 0) {
        throw new Error(verify[0].missing_sources + ' FL rows have empty source_urls — rolling back');
      }
      if (verify[0].empty_body > 0) {
        throw new Error(verify[0].empty_body + ' FL rows have empty section_text — rolling back');
      }

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
  await seedFL(flags);
  console.log('\n=== done ===');
}

// W12 from 2026-04-24 code review — use pathToFileURL for canonical compare.
import { pathToFileURL } from 'node:url';
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) {
  main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
