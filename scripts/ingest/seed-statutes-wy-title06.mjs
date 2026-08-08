#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-va.mjs
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// csv-bulk-checked: https://wyoleg.gov/statutes/compress/title06.pdf
//   (single 415KB PDF, full Title 6 — verified 2026-05-02 via curl HEAD).
//
// Seeds Wyoming Title 6 (Crimes and Offenses) into entities_statutes.
// PDF parsing via pdf-parse v2.4.5 (already in package.json deps).
//
// Source: wyoleg.gov publishes statutes under WY Constitution Art. 3 § 33;
// no copyright claim; primary-law-cannot-be-copyrighted (Wheaton v. Peters,
// 1834; reaffirmed Georgia v. PRO 2020).
//
// Usage:
//   node scripts/ingest/seed-statutes-wy-title06.mjs [--dry-run] [--verbose] [--limit=N]
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
  fetchAndParseWyTitle06,
  buildWySourceUrl,
  WY_TITLE06_PDF_URL,
} from './lib/wy-title06-pdf.mjs';

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
export const WY_TITLE = '6';
export const WY_TITLE_LABEL = 'Crimes and Offenses';
// WY Title 6 has ~304 actual sections across 10 chapters (verified 2026-05-02
// against parsed PDF). Floor set conservatively at 270 to absorb minor
// parser variance; full live run typically lands at ~287.
const ROW_FLOOR = 270;

// ── Zod schema ────────────────────────────────────────────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('WY'),
  title: z.literal('6'),
  section: z.string().regex(/^6-\d+(?:\.\d+)?-\d+(?:\.\d+)?$/),
  subsection: z.null(),
  section_text: z.string().min(5).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return host === 'wyoleg.gov';
      } catch { return false; }
    }, 'Primary source_url host must be wyoleg.gov'),
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
    jurisdiction: 'WY',
    title: WY_TITLE,
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

export async function seedWY({ dryRun, verbose, limit, sectionsOverride, fetchImpl, dbFactory } = {}) {
  console.log('=== seed-statutes-wy-title06 ' + new Date().toISOString() + ' ===');
  console.log('  title: ' + WY_TITLE + ' (' + WY_TITLE_LABEL + ')');
  console.log('  source: ' + WY_TITLE06_PDF_URL);
  console.log('  dry-run: ' + !!dryRun);

  let sections = sectionsOverride;
  if (!sections) {
    console.log('  fetching + parsing PDF...');
    sections = await fetchAndParseWyTitle06({ fetchImpl });
  }
  console.log('  parsed ' + sections.length + ' candidate sections');
  if (limit) sections = sections.slice(0, limit);

  const rows = [];
  const rejected = [];
  const seen = new Set();
  for (const sec of sections) {
    if (seen.has(sec.sectionNum)) continue;
    seen.add(sec.sectionNum);
    const url = buildWySourceUrl(sec.sectionNum);
    const row = buildRow({
      section: sec.sectionNum,
      titleText: sec.titleText,
      bodyText: sec.bodyText,
      sourceUrl: url,
    });
    const check = StatuteRowSchema.safeParse(row);
    if (!check.success) {
      rejected.push({ section: sec.sectionNum, issues: check.error.issues.map((x) => x.path.join('.') + ': ' + x.message) });
      continue;
    }
    rows.push(row);
    if (verbose && rows.length <= 3) {
      console.log('  OK §' + sec.sectionNum + ' — ' + sec.titleText.slice(0, 60));
    }
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
    throw new Error(`seedWY: row count ${rows.length} below floor ${ROW_FLOOR}`);
  }

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    await client.query('BEGIN');
    try {
      const del = await client.query(
        `DELETE FROM entities_statutes WHERE jurisdiction = $1 AND title = $2`,
        ['WY', WY_TITLE],
      );
      console.log('  cleared ' + del.rowCount + ' prior WY/6 rows');
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
  const out = await seedWY(flags);
  console.log('\n=== Summary ===');
  console.log('  rows : ' + out.rows.length);
  console.log('  rejected : ' + out.rejected.length);
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
