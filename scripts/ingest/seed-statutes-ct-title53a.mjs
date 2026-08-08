#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-il-ch720.mjs (anchor-split per-chapter pattern)
// Pattern: cl-bulk-data-defensive #14 (port 5432), #17 (session defaults), #18 (COPY FROM STDIN)
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — cga.ct.gov per-chapter HTML, no bulk file
// TLS workaround: https.Agent({rejectUnauthorized:false}) per gotcha-cga-ct-gov-tls-chain.md — CT site only, pg DB strict
//
// Seeds Connecticut Title 53a (Penal Code) statute sections into entities_statutes.
//
// Chapters seeded (3 chapters, ~423 sections):
//   950 — Penal Code: General Provisions (3 sections)
//   951 — Penal Code: Statutory Construction; Principles of Criminal Liability (22 sections)
//   952 — Penal Code: Offenses (398 sections)
//
// Source: https://www.cga.ct.gov/current/pub/chap_<N>.htm
// Robots: 404 (no policy). 2.0s polite delay defensively.
//
// Section-column convention: bare CT section ID e.g. "53a-1", "53a-54a".
// (jurisdiction='CT', title='53a', section=<sectionId>)
// CT sections are uniquely numbered across the title — no inter-chapter
// collision possible — so the chapter prefix would be redundant. Matches
// the convention adopted by parallel CT seeder run on 2026-05-02.
//
// Usage:
//   node scripts/ingest/seed-statutes-ct-title53a.mjs --dry-run
//   node scripts/ingest/seed-statutes-ct-title53a.mjs --chapters=950 --limit=5 --dry-run
//   node scripts/ingest/seed-statutes-ct-title53a.mjs                  (live; requires SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432 session mode)

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

import {
  CT_CHAPTERS,
  CT_TITLE,
  buildChapterUrl,
  ctHttpsFetch,
  parseChapterSections,
  parseEffectiveDate,
} from './lib/ct-cga-html.mjs';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader (web-repo only) ────────────────────────────────────────────────
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  /* dotenv optional — env may be pre-set */
}

// ── CLI ───────────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    chapters: null,
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--chapters=')) {
      flags.chapters = a.slice('--chapters='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── Config ────────────────────────────────────────────────────────────────────
export function buildCtConfig({ chapters, limit } = {}) {
  return {
    stateCode: 'CT',
    stateName: 'Connecticut',
    titleNum: CT_TITLE,
    titleLabel: 'Penal Code',
    allowedHosts: ['www.cga.ct.gov'],
    crawlDelayMs: 2000,
    fetchTimeoutMs: 60000,
    targetChapters: chapters && chapters.length
      ? CT_CHAPTERS.filter((c) => chapters.includes(c.num))
      : CT_CHAPTERS,
    limit: limit || null,
  };
}

// ── Section column ────────────────────────────────────────────────────────────
// Format: bare sectionId  e.g. "53a-1", "53a-54a"
// CT section numbers are unique across the title — no chapter prefix needed.
// chapterNum is unused here but retained as parameter for callers that need
// the source URL (which IS chapter-scoped).
export function buildSectionColumn(_chapterNum, sectionId) {
  return sectionId;
}

// ── Allowlist guard ───────────────────────────────────────────────────────────
function isAllowedSourceUrl(urlStr, allowedHostsSet) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    return allowedHostsSet.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ── Row schema (mirrors entities_statutes live columns) ───────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.string().regex(/^[A-Z]{2}$/, 'jurisdiction must be a 2-letter state code'),
  title: z.string().min(1).max(20),
  section: z.string().min(1).max(100),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
  scraped_at: z.string().datetime().max(40),
});

export function computeSectionHash(titleText, bodyText) {
  return crypto.createHash('sha256').update(`${titleText}\n\n${bodyText}`, 'utf8').digest('hex');
}

/**
 * Build a validated DB row from a parsed CT section.
 * Returns { row, errors }. row is null if validation failed.
 */
export function buildSectionRow(config, chapterNum, parsed) {
  if (!parsed || parsed.repealed) {
    return { row: null, errors: ['repealed or empty'] };
  }
  if (!parsed.bodyText || parsed.bodyText.trim().length < 12) {
    return { row: null, errors: ['bodyText too short'] };
  }

  const titleText = (parsed.titleText || `Section ${parsed.sectionId}`).trim();
  const bodyText = parsed.bodyText.trim();
  const sectionText = `${titleText.slice(0, 500)}\n\n${bodyText.slice(0, 49490)}`;

  const allowedHostsSet = new Set(config.allowedHosts.map((h) => h.toLowerCase()));
  if (!isAllowedSourceUrl(parsed.sectionUrl, allowedHostsSet)) {
    return { row: null, errors: [`sourceUrl not on allowlist or not HTTPS: ${parsed.sectionUrl}`] };
  }

  const raw = {
    jurisdiction: config.stateCode,
    title: config.titleNum,
    section: buildSectionColumn(chapterNum, parsed.sectionId),
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [parsed.sectionUrl],
    text_hash: computeSectionHash(titleText, bodyText),
    effective_date: parseEffectiveDate(parsed.sourceLine),
    scraped_at: new Date().toISOString(),
  };

  const result = StatuteRowSchema.safeParse(raw);
  if (!result.success) {
    return { row: null, errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  return { row: result.data, errors: [] };
}

// ── COPY helpers ──────────────────────────────────────────────────────────────
export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const parts = arr.map((u) => {
    const safe = String(u).split('\\').join('\\\\').split('"').join('\\"').split('\r').join(' ').split('\n').join(' ');
    return `"${safe}"`;
  });
  return `{${parts.join(',')}}`;
}

const COPY_COLS = [
  'jurisdiction', 'title', 'section', 'subsection',
  'section_text', 'is_current', 'source_urls', 'text_hash',
  'effective_date', 'scraped_at',
];

/**
 * Apply rows via DELETE-then-COPY in a transaction. Idempotent on (jurisdiction,title,section).
 */
export async function applyToDb(rows, config, opts = {}) {
  const { dryRun = false, dbFactory = createBulkClient } = opts;
  if (dryRun) {
    console.log(`[dry-run] would COPY ${rows.length} rows for ${config.stateCode} title ${config.titleNum}`);
    for (const r of rows.slice(0, 3)) {
      const preview = r.section_text.slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ${r.jurisdiction} § ${r.section}: ${preview}`);
    }
    if (rows.length > 3) console.log(`  …and ${rows.length - 3} more`);
    return { rowCount: rows.length, durationMs: 0, deleted: 0 };
  }

  const t0 = Date.now();
  const { client, cleanup } = await dbFactory();
  try {
    await client.query('BEGIN');
    try {
      // Self-healing DELETE: clean up rows from a prior run that used the
      // chapter-prefixed convention "<chapter>/<sectionId>" (e.g. "950/53a-1").
      // The current convention is bare sectionId. This DELETE is a no-op once
      // all prior prefixed rows are gone.
      const { rowCount: prefixedDeleted } = await client.query(
        "DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND section LIKE '%/%'",
        [config.stateCode, config.titleNum],
      );
      if (prefixedDeleted > 0) {
        console.log(`  self-healing: deleted ${prefixedDeleted} prior chapter-prefixed rows`);
      }

      const sectionIds = rows.map((r) => r.section);
      const { rowCount: deleted } = await client.query(
        'DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2 AND section = ANY($3::text[])',
        [config.stateCode, config.titleNum, sectionIds],
      );
      console.log(`  deleted ${deleted} prior rows for ${config.stateCode} title ${config.titleNum}`);

      async function* rowsGen() {
        for (const r of rows) {
          yield [
            r.jurisdiction,
            r.title,
            r.section,
            r.subsection,
            r.section_text,
            r.is_current,
            textArrayLiteral(r.source_urls),
            r.text_hash,
            r.effective_date,
            r.scraped_at,
          ];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COPY_COLS, rowsGen());

      // Pre-commit verify
      const { rows: vRows } = await client.query(
        `SELECT
           count(*)::int                                                       AS n,
           sum(CASE WHEN array_length(source_urls,1) IS NULL THEN 1 ELSE 0 END)::int AS missing_sources,
           sum(CASE WHEN section_text IS NULL OR section_text = '' THEN 1 ELSE 0 END)::int AS empty_body
         FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        [config.stateCode, config.titleNum],
      );
      const v = vRows[0];
      console.log(`  pre-commit verify: ${JSON.stringify(v)}`);
      if (v.missing_sources > 0) throw new Error(`${v.missing_sources} rows have empty source_urls`);
      if (v.empty_body > 0) throw new Error(`${v.empty_body} rows have empty section_text`);

      await client.query('COMMIT');
      const durationMs2 = Date.now() - t0;
      return { rowCount, durationMs: durationMs2, deleted };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    await cleanup();
  }
}

// ── Sleep ─────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Main ingest loop ──────────────────────────────────────────────────────────
/**
 * For each chapter: fetch HTML, parse all sections, build rows.
 * Uses ctHttpsFetch (TLS workaround) by default; tests pass fetchImpl.
 *
 * @param {ReturnType<typeof buildCtConfig>} config
 * @param {{ verbose?: boolean, fetchImpl?: Function }} opts
 */
export async function collectRows(config, opts = {}) {
  const { verbose = false, fetchImpl } = opts;
  const fetchOne = fetchImpl || (async (url) => {
    const { status, body } = await ctHttpsFetch(url, { timeoutMs: config.fetchTimeoutMs });
    if (status !== 200) throw new Error(`HTTP ${status} for ${url}`);
    return body;
  });

  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  let repealedCount = 0;
  let parsedCount = 0;

  for (const chapter of config.targetChapters) {
    const chapterUrl = buildChapterUrl(chapter.num);
    console.log(`\n  [chapter ${chapter.num}] ${chapter.label} — fetching ${chapterUrl}`);
    if (config.crawlDelayMs > 0) await sleep(config.crawlDelayMs);

    let html;
    try {
      html = await fetchOne(chapterUrl);
    } catch (e) {
      errorCount += 1;
      console.warn(`    [err] chapter ${chapter.num}: fetch failed — ${e.message}`);
      continue;
    }

    const parsed = parseChapterSections(html, chapter.num);
    if (parsed.length === 0) {
      console.warn(`    [warn] chapter ${chapter.num}: 0 sections parsed`);
      continue;
    }
    console.log(`  [chapter ${chapter.num}] discovered ${parsed.length} candidate sections`);

    let chapterParsed = 0;
    for (const ps of parsed) {
      if (config.limit !== null && parsedCount >= config.limit) break;

      if (ps.repealed) {
        repealedCount += 1;
        if (verbose) console.log(`    [skip] ${ps.sectionId}: repealed`);
        continue;
      }

      const { row, errors: rowErrors } = buildSectionRow(config, chapter.num, ps);
      if (rowErrors.length > 0) {
        // Treat short/empty bodies as skip not error
        if (rowErrors[0] === 'bodyText too short') {
          skipCount += 1;
          if (verbose) console.warn(`    [skip] ${ps.sectionId}: ${rowErrors.join('; ')}`);
        } else {
          errorCount += 1;
          if (verbose) console.warn(`    [err] ${ps.sectionId}: ${rowErrors.join('; ')}`);
        }
        continue;
      }
      rows.push(row);
      parsedCount += 1;
      chapterParsed += 1;
      if (verbose) {
        const preview = row.section_text.slice(0, 60).replace(/\n/g, ' ');
        console.log(`    [ok] ${row.section}: ${preview}`);
      } else if (chapterParsed % 50 === 0) {
        process.stdout.write('.');
      }
    }
    if (!verbose) process.stdout.write('\n');
    console.log(`  [chapter ${chapter.num}] parsed ${chapterParsed} sections`);

    if (config.limit !== null && parsedCount >= config.limit) {
      console.log(`  limit=${config.limit} reached — stopping`);
      break;
    }
  }

  return { rows, skipCount, errorCount, repealedCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = buildCtConfig({ chapters: flags.chapters, limit: flags.limit });

  const chapterLabels = config.targetChapters.map((c) => c.num).join(', ');

  if (flags.dryRun) {
    console.log('[seed-statutes-ct-title53a] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ct-title53a] LIVE RUN — will write to DB');
  }
  console.log(`  chapters: ${chapterLabels}`);
  if (config.limit) console.log(`  limit: ${config.limit}`);

  const t0 = Date.now();
  const { rows, skipCount, errorCount, repealedCount } = await collectRows(config, { verbose: flags.verbose });

  console.log(`\n[seed-statutes-ct-title53a] collected ${rows.length} rows (skip=${skipCount}, err=${errorCount}, repealed=${repealedCount})`);

  const dbResult = await applyToDb(rows, config, { dryRun: flags.dryRun });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  rows deleted : ${dbResult.deleted ?? 0}`);
  console.log(`  fetch skips  : ${skipCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  repealed     : ${repealedCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // SC floor: full-run target is >= 400 rows (chapters 950+951+952 = ~423 sections,
  // minus repealed). Partial runs (--chapters / --limit) skip the floor.
  const isFullRun = !flags.chapters && !flags.limit;
  if (!flags.dryRun && isFullRun && dbResult.rowCount < 400) {
    console.error(`\nFAIL: SC-CT-1 not met — only ${dbResult.rowCount} rows (need >= 400 for full run)`);
    process.exit(1);
  }

  console.log('\nPASS');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((err) => {
  console.error('[seed-statutes-ct-title53a] fatal:', err.message);
  process.exit(1);
});
