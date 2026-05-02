#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-va.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: none-exists — leginfo.legislature.ca.gov is JSF SPA;
//   per-section URL `codes_displaySection.xhtml?lawCode=PEN&sectionNum=N`
//   returns server-rendered HTML 200 OK (verified 2026-05-02). Public.Resource.Org
//   /pub/us/code/ca/ confirmed dead-end (court docket, not code mirror).
//
// License posture: Public.Resource.Org won Georgia v. PRO (SCOTUS 2020),
// confirming primary law cannot be copyrighted. CA does not assert
// copyright on Penal Code. We cite the official leginfo URL as
// authoritative source.
//
// Usage:
//   node scripts/ingest/seed-statutes-ca-pen.mjs [--dry-run] [--verbose] [--limit=N]
//
// Env required (live):
//   SUPABASE_DB_URL

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  parseCaSectionPage,
  isCaSectionNotFound,
  buildCaPenSourceUrl,
  buildCaPenFetchUrl,
  CA_PEN_DEFAULT_RANGES,
} from './lib/ca-pen-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader ────────────────────────────────────────────────────────────
const dotenvPath = path.resolve(__dirname, '..', '..', '.env.local');
if (fs.existsSync(dotenvPath)) {
  const txt = fs.readFileSync(dotenvPath, 'utf-8');
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
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Config ────────────────────────────────────────────────────────────────
export const CA_TITLE = 'PEN';
export const CA_TITLE_LABEL = 'Penal Code';
// 480 = real corpus floor. CA_PEN_DEFAULT_RANGES iterates 670 candidate
// section numbers, of which ~170 are legitimate gaps in the numbering
// (repealed / never-existed — page returns 200 with empty
// <div id="single_law_section">). Initial design guess of 600 was unvalidated
// (smoke was --limit=3). Real Part-1 + Part-2-slice corpus is ~499 sections.
// Floor 480 leaves a 4% buffer for upstream churn.
//
// Follow-up: expand ranges to full-PEN (~12,000 sections). See
// docs/plans/2026-05-02-worry-ca-pen-parser-anchor-failures.md.
const ROW_FLOOR = 480;
const RATE_MIN_MS = 600;
const RATE_MAX_MS = 1500;
const ALLOWED_HOSTS = new Set(['leginfo.legislature.ca.gov']);

// ── Zod schema ────────────────────────────────────────────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('CA'),
  title: z.literal('PEN'),
  section: z.string().regex(/^[\w.\-]+$/).max(40),
  subsection: z.null(),
  section_text: z.string().min(10).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return host === 'leginfo.legislature.ca.gov';
      } catch { return false; }
    }, 'Primary source_url host must be leginfo.legislature.ca.gov'),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.null(),
  scraped_at: z.string().datetime().max(40),
});

export function parseCliFlags(argv) {
  const flags = { dryRun: false, verbose: false, limit: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--verbose') flags.verbose = true;
    else if (arg.startsWith('--limit=')) flags.limit = Number.parseInt(arg.slice(8), 10);
  }
  return flags;
}

// Expand integer ranges to candidate section numbers.
export function expandRanges(ranges) {
  const out = [];
  for (const { from, to } of ranges) {
    const lo = Math.floor(from);
    const hi = Math.floor(to);
    for (let n = lo; n <= hi; n++) out.push(String(n));
  }
  return out;
}

export function buildRow({ section, titleText, bodyText, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'CA',
    title: CA_TITLE,
    section,
    subsection: null,
    section_text: sectionText.slice(0, 49990),
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

function isAllowedHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function randomDelay() { return RATE_MIN_MS + Math.floor(Math.random() * (RATE_MAX_MS - RATE_MIN_MS)); }

async function fetchSection(sectionNum, { fetchImpl }) {
  const url = buildCaPenFetchUrl(sectionNum);
  if (!isAllowedHost(url)) throw new Error('Host not allowed: ' + url);
  const f = fetchImpl || fetch;
  const res = await f(url, {
    headers: {
      'User-Agent': 'INAA-legal-research/1.0 (+https://imnotanattorney.com/about)',
      'Accept': 'text/html',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('HTTP ' + res.status);
  }
  return await res.text();
}

export async function seedCA({ dryRun, verbose, limit, sectionList, fetchImpl, dbFactory } = {}) {
  console.log('=== seed-statutes-ca-pen ' + new Date().toISOString() + ' ===');
  console.log('  title: ' + CA_TITLE + ' (' + CA_TITLE_LABEL + ')');
  console.log('  dry-run: ' + !!dryRun);

  let candidates = sectionList || expandRanges(CA_PEN_DEFAULT_RANGES);
  if (limit) candidates = candidates.slice(0, limit);
  console.log('  candidate sections: ' + candidates.length);

  const rows = [];
  const rejected = [];
  let i = 0;
  for (const secNum of candidates) {
    i += 1;
    let html;
    try {
      html = await fetchSection(secNum, { fetchImpl });
    } catch (e) {
      rejected.push({ section: secNum, issues: ['fetch: ' + e.message] });
      await sleep(randomDelay());
      continue;
    }
    if (!html || isCaSectionNotFound(html)) {
      // Sparse-numbered code: most candidates are gaps. Don't log — too noisy.
      await sleep(randomDelay());
      continue;
    }
    const parsed = parseCaSectionPage(html, secNum);
    if (!parsed) {
      rejected.push({ section: secNum, issues: ['parse: anchor not found'] });
      await sleep(randomDelay());
      continue;
    }
    const url = buildCaPenSourceUrl(secNum);
    const row = buildRow({
      section: secNum,
      titleText: parsed.titleText,
      bodyText: parsed.bodyText,
      sourceUrl: url,
    });
    const check = StatuteRowSchema.safeParse(row);
    if (!check.success) {
      rejected.push({ section: secNum, issues: check.error.issues.map((x) => x.path.join('.') + ': ' + x.message) });
      await sleep(randomDelay());
      continue;
    }
    rows.push(row);
    if (verbose && rows.length <= 3) {
      console.log('  OK §' + secNum + ' — ' + parsed.titleText.slice(0, 60));
    }
    if (i % 50 === 0) {
      console.log('  progress: ' + i + '/' + candidates.length + ' (kept ' + rows.length + ')');
    }
    await sleep(randomDelay());
  }

  console.log('  valid: ' + rows.length + ', rejected: ' + rejected.length);
  if (rejected.length > 0) {
    for (const r of rejected.slice(0, 5)) console.log('    skip ' + r.section + ': ' + r.issues.join('; '));
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — no DB write ===');
    return { rows, rejected };
  }

  if (rows.length < ROW_FLOOR) {
    throw new Error(`seedCA: row count ${rows.length} below floor ${ROW_FLOOR}`);
  }

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    await client.query('BEGIN');
    try {
      const del = await client.query(
        `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        ['CA', CA_TITLE],
      );
      console.log('  cleared ' + del.rowCount + ' prior CA/PEN rows');
      const COLS = ['jurisdiction','title','section','subsection','section_text','is_current','source_urls','text_hash','effective_date','scraped_at'];
      async function* rowsGen() {
        for (const r of rows) {
          yield [r.jurisdiction, r.title, r.section, r.subsection, r.section_text, r.is_current, textArrayLiteral(r.source_urls), r.text_hash, r.effective_date, r.scraped_at];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLS, rowsGen());
      console.log('  COPYd ' + rowCount + ' in ' + (durationMs / 1000).toFixed(1) + 's');
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    await cleanup();
  }
  return { rows, rejected };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  if (!flags.dryRun && !process.env.SUPABASE_DB_URL) {
    console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
    process.exit(1);
  }
  const out = await seedCA(flags);
  console.log('\n=== Summary ===');
  console.log('  rows : ' + out.rows.length);
  console.log('  rejected : ' + out.rejected.length);
  if (flags.dryRun && flags.limit) {
    console.log('PASS: dry-run smoke (--limit=' + flags.limit + ') — ' + out.rows.length + ' rows. Floor ' + ROW_FLOOR + ' enforced on full live run.');
    process.exit(0);
  }
  if (out.rows.length < ROW_FLOOR) {
    console.error('FAIL: floor ' + ROW_FLOOR + ' not met');
    process.exit(1);
  }
  console.log('PASS: ≥' + ROW_FLOOR + ' rows');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
