// Template: scripts/ingest/seed-statutes-oh.mjs
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — tcss.legis.texas.gov serves per-chapter HTML (no bulk CSV)
//
// TX Penal Code seed — Phase 2 companion to FL/OH/VA/NC/WA.
// Source: https://tcss.legis.texas.gov/resources/PE/htm/PE.<chapter>.htm
//   One HTML file per chapter; all sections are inline.
//   statutes.capitol.texas.gov is a Next.js SPA returning a 250881-byte shell.
//   The real file server is tcss.legis.texas.gov (confirmed 2026-05-01).
//
// Public-facing canonical URL per section:
//   https://statutes.capitol.texas.gov/Docs/PE/htm/PE.<ch>.htm#<section>
//   (extracted from the href in the section anchor; never fabricated)
//
// Every row carries non-empty source_urls[] pointing to the canonical URL.
// Zod contract rejects any row that fails integrity BEFORE INSERT.
//
// Usage:
//   node scripts/ingest/seed-statutes-tx-pe.mjs --dry-run
//   node scripts/ingest/seed-statutes-tx-pe.mjs --chapters=49 --dry-run --verbose
//   node scripts/ingest/seed-statutes-tx-pe.mjs

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseChapter, isChapterNotFound } from './lib/tx-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ENV_CANDIDATES = [
  path.join(REPO_ROOT, '.env.local'),
  path.resolve(REPO_ROOT, '..', '..', 'ImNotAnAttorney-web', '.env.local'),
  path.resolve(REPO_ROOT, '..', 'ImNotAnAttorney-web', '.env.local'),
];

const UA = 'ImNotAnAttorney-statute-seed/1.0 (legal research)';
const DELAY_MS = 800;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const FLOOR = 300;

const TX_PE_CHAPTERS = [
  1, 2, 3, 6, 7, 8, 9, 12, 15, 16,
  19, 20, 21, 22, 25, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 42, 43, 46,
  47, 48, 49, 50, 51, 71, 72, 76,
];

function loadEnv() {
  for (const envFile of ENV_CANDIDATES) {
    if (!fs.existsSync(envFile)) continue;
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx < 1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1);
      if (key && !(key in process.env)) process.env[key] = val;
    }
    break;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const chaptersArg = args.find(a => a.startsWith('--chapters='));
  const chaptersFilter = chaptersArg
    ? chaptersArg.slice('--chapters='.length).split(',').map(s => s.trim()).filter(Boolean)
    : null;
  return { dryRun, verbose, chaptersFilter };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildChapterUrl(chapter) {
  return `https://tcss.legis.texas.gov/resources/PE/htm/PE.${chapter}.htm`;
}

async function fetchHtml(url, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      await sleep(DELAY_MS * attempt);
      return fetchHtml(url, attempt + 1);
    }
    throw err;
  }
}

// Schema matches entities_statutes actual columns
export const StatuteRowSchema = z.object({
  jurisdiction:   z.literal('TX'),
  title:          z.string().min(2).max(500),
  section:        z.string().regex(/^\d+\.[0-9A-Za-z]+$/, 'TX section must be N.NN format'),
  subsection:     z.null(),
  section_text:   z.string().min(2).max(8200),
  is_current:     z.literal(true),
  source_urls:    z.array(z.string().url()).min(1).refine(
    urls => urls.every(u => u.startsWith('https://statutes.capitol.texas.gov/')),
    { message: 'source_url must be on statutes.capitol.texas.gov' }
  ),
  text_hash:      z.string().length(64),
  effective_date: z.null(),
  scraped_at:     z.string(),
});

export function buildRow(section) {
  const sectionText = (section.titleText ? section.titleText.trim() + '\n\n' : '') + section.bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction:   'TX',
    title:          section.titleText,
    section:        section.sectionNum,
    subsection:     null,
    section_text:   sectionText,
    is_current:     true,
    source_urls:    [section.sourceUrl],
    text_hash:      textHash,
    effective_date: null,
    scraped_at:     new Date().toISOString(),
  };
}

export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

function csvEscapeField(s) {
  if (s === '\\N') return s;
  if (/[",\n\r\\]/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '""') + '"';
  }
  return s;
}

async function bulkCopyRowsToDb(client, table, columns, rows) {
  const { from: copyFrom } = await import('pg-copy-streams');
  return new Promise((resolve, reject) => {
    const stream = client.query(
      copyFrom(`COPY ${table} (${columns.join(',')}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`)
    );
    stream.on('error', reject);
    stream.on('finish', resolve);
    for (const row of rows) {
      const vals = columns.map(col => {
        const v = row[col];
        if (v === null || v === undefined) return '\\N';
        if (Array.isArray(v)) return csvEscapeField(textArrayLiteral(v));
        return csvEscapeField(String(v));
      });
      stream.write(vals.join(',') + '\n');
    }
    stream.end();
  });
}

export async function seedTX({ dryRun = false, verbose = false, chaptersFilter = null } = {}) {
  loadEnv();

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl && !dryRun) {
    throw new Error('SUPABASE_DB_URL or DATABASE_URL required for live run');
  }

  const targetChapters = chaptersFilter
    ? TX_PE_CHAPTERS.filter(ch => chaptersFilter.includes(String(ch)))
    : TX_PE_CHAPTERS;

  console.log(`[TX-PE] ${dryRun ? 'DRY-RUN' : 'LIVE'} — ${targetChapters.length} chapters`);

  const allRows = [];
  let fetchErrors = 0;
  let chaptersNotFound = 0;

  for (const ch of targetChapters) {
    const url = buildChapterUrl(ch);
    if (verbose) process.stdout.write(`  Chapter ${ch}: `);

    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.error(`\n  [ERROR] Chapter ${ch}: ${err.message}`);
      fetchErrors++;
      continue;
    }

    if (isChapterNotFound(html)) {
      if (verbose) console.log('NOT FOUND');
      chaptersNotFound++;
      continue;
    }

    const sections = parseChapter(html, String(ch));
    if (verbose) process.stdout.write(`${sections.length} sections ... `);

    let chapterCount = 0;
    for (const section of sections) {
      const row = buildRow(section);
      const check = StatuteRowSchema.safeParse(row);
      if (!check.success) {
        if (verbose) console.warn(`\n    [SKIP] ${section.sectionNum}: ${check.error.issues.map(i => i.message).join('; ')}`);
        continue;
      }
      allRows.push(check.data);
      chapterCount++;
    }

    if (verbose) console.log(`${chapterCount} valid rows`);
    await sleep(DELAY_MS);
  }

  const seen = new Set();
  const deduped = [];
  for (const row of allRows) {
    const key = `TX:${row.section}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(row); }
  }

  console.log(`[TX-PE] parsed=${allRows.length} deduped=${deduped.length} notFound=${chaptersNotFound} errors=${fetchErrors}`);

  if (!chaptersFilter && deduped.length < FLOOR) {
    throw new Error(`Floor not met: ${deduped.length} < ${FLOOR}`);
  }

  if (dryRun) {
    console.log('[TX-PE] DRY-RUN complete — no DB writes');
    for (const r of deduped.slice(0, 3)) {
      console.log(`  ${r.section}: ${r.title.slice(0, 60)} | ${r.source_urls[0]}`);
    }
    return { count: deduped.length, dryRun: true };
  }

  const { default: pg } = await import('pg');
  const { Pool } = pg;
  const connUrl = new URL(dbUrl);
  connUrl.port = '5432';
  const pool = new Pool({ connectionString: connUrl.toString(), ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query(`SET statement_timeout = '10min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await client.query(`SET tcp_keepalives_idle = 60`);
    await client.query(`SET tcp_keepalives_interval = 10`);
    await client.query(`SET tcp_keepalives_count = 6`);

    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM entities_statutes WHERE jurisdiction = 'TX'`);
    console.log(`[TX-PE] Deleted ${del.rowCount} existing TX rows`);

    const COLS = ['jurisdiction','title','section','subsection','section_text','is_current','source_urls','text_hash','effective_date','scraped_at'];
    await bulkCopyRowsToDb(client, 'entities_statutes', COLS, deduped);
    await client.query('COMMIT');
    console.log(`[TX-PE] Inserted ${deduped.length} rows via COPY`);

    const integrity = await client.query(`
      SELECT
        count(*)::int AS n,
        sum(CASE WHEN source_urls IS NULL OR array_length(source_urls,1) IS NULL OR array_length(source_urls,1) = 0 THEN 1 ELSE 0 END)::int AS null_urls,
        sum(CASE WHEN source_urls[1] NOT LIKE 'https:%' THEN 1 ELSE 0 END)::int AS non_https
      FROM entities_statutes WHERE jurisdiction = 'TX'
    `);
    const { n, null_urls, non_https } = integrity.rows[0];
    console.log(`[TX-PE] Integrity: n=${n} null_urls=${null_urls} non_https=${non_https}`);

    if (!chaptersFilter && n < FLOOR) throw new Error(`Post-write floor failed: n=${n} < ${FLOOR}`);
    if (null_urls > 0) throw new Error(`null_urls=${null_urls}`);
    if (non_https > 0) throw new Error(`non_https=${non_https}`);

    return { count: n, null_urls, non_https };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    try { client.release(); } catch {}
    try { await pool.end(); } catch {}
  }
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const { dryRun, verbose, chaptersFilter } = parseArgs();
  seedTX({ dryRun, verbose, chaptersFilter })
    .then(r => { console.log('[TX-PE] Done:', r); process.exit(0); })
    .catch(e => { console.error('[TX-PE] FATAL:', e.message); process.exit(1); });
}
