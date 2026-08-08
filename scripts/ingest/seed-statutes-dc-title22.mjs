#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-va.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://raw.githubusercontent.com/DCCouncil/law-xml/master/dc/council/code/titles/22/index.xml
//   (Title 22 index lists 582 per-section XML files; bulk via raw GitHub)
//
// Seeds DC Title 22 (Criminal Offenses and Penalties) into entities_statutes.
// Source: github.com/DCCouncil/law-xml — official DC Council public-domain
// repo. README explicitly says "use bulk download, please do not scrape".
//
// Usage:
//   node scripts/ingest/seed-statutes-dc-title22.mjs [--dry-run] [--verbose] [--limit=N]
//
// Env required (live):
//   SUPABASE_DB_URL — direct postgres connection string

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import {
  extractDcSectionRefs,
  parseDcSection,
  buildDcSourceUrl,
  buildDcRawUrl,
  DC_INDEX_URL,
} from './lib/dc-title22-xml.mjs';

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
export const DC_TITLE = '22';
export const DC_TITLE_LABEL = 'Criminal Offenses and Penalties';
const ROW_FLOOR = 500;
const RATE_DELAY_MS = 50; // raw.githubusercontent.com — generous, no throttle observed
const ALLOWED_HOSTS = new Set(['raw.githubusercontent.com']);

// ── Zod schema ────────────────────────────────────────────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('DC'),
  title: z.literal('22'),
  section: z.string().regex(/^22-[\w.]+$/),
  subsection: z.null(),
  section_text: z.string().min(10).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return host === 'code.dccouncil.gov';
      } catch { return false; }
    }, 'Primary source_url host must be code.dccouncil.gov'),
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

export function buildRow({ section, titleText, bodyText, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'DC',
    title: DC_TITLE,
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

async function fetchUrl(url, { fetchImpl } = {}) {
  if (!isAllowedHost(url)) throw new Error('Host not allowed: ' + url);
  const f = fetchImpl || fetch;
  const res = await f(url, {
    headers: {
      'User-Agent': 'INAA-legal-research/1.0 (+https://imnotanattorney.com/about)',
      'Accept': 'application/xml,text/xml,*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function seedDC({ dryRun, verbose, limit, fetchImpl, dbFactory } = {}) {
  console.log('=== seed-statutes-dc-title22 ' + new Date().toISOString() + ' ===');
  console.log('  title: ' + DC_TITLE + ' (' + DC_TITLE_LABEL + ')');
  console.log('  dry-run: ' + !!dryRun);

  console.log('  fetching index.xml...');
  const indexXml = await fetchUrl(DC_INDEX_URL, { fetchImpl });
  let sectionIds = extractDcSectionRefs(indexXml);
  if (limit) sectionIds = sectionIds.slice(0, limit);
  console.log('  discovered ' + sectionIds.length + ' section refs');

  const rows = [];
  const rejected = [];
  let i = 0;
  for (const secId of sectionIds) {
    i += 1;
    const rawUrl = buildDcRawUrl(secId);
    let xml;
    try {
      xml = await fetchUrl(rawUrl, { fetchImpl });
    } catch (e) {
      rejected.push({ section: secId, issues: ['fetch: ' + e.message] });
      continue;
    }
    const parsed = parseDcSection(xml, secId);
    if (!parsed) {
      rejected.push({ section: secId, issues: ['parse: empty/invalid'] });
      continue;
    }
    const row = buildRow({
      section: secId,
      titleText: parsed.titleText,
      bodyText: parsed.bodyText,
      sourceUrl: buildDcSourceUrl(secId),
    });
    const check = StatuteRowSchema.safeParse(row);
    if (!check.success) {
      rejected.push({ section: secId, issues: check.error.issues.map((x) => x.path.join('.') + ': ' + x.message) });
      continue;
    }
    rows.push(row);
    if (verbose && rows.length <= 3) {
      console.log('  OK ' + secId + ' — ' + parsed.titleText.slice(0, 60));
    }
    if (i % 100 === 0) console.log('  progress: ' + i + '/' + sectionIds.length);
    await sleep(RATE_DELAY_MS);
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
    throw new Error(`seedDC: row count ${rows.length} below floor ${ROW_FLOOR}`);
  }

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    await client.query('BEGIN');
    try {
      const del = await client.query(
        `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        ['DC', DC_TITLE],
      );
      console.log('  cleared ' + del.rowCount + ' prior DC/22 rows');
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
  const out = await seedDC(flags);
  console.log('\n=== Summary ===');
  console.log('  rows : ' + out.rows.length);
  console.log('  rejected : ' + out.rejected.length);
  // Floor check skipped on dry-run --limit=N (smoke validation only).
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
