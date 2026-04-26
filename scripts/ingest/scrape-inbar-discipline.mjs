// csv-bulk-checked: https://www.in.gov/courts/public-records/orders/discipline/
// Template: scripts/ingest/scrape-flbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Indiana Supreme Court Attorney Disciplinary Cases scraper.
//
// Source (confirmed 2026-04-25 via WebFetch):
//   Base:  https://www.in.gov/courts/public-records/orders/discipline/
//   Years: Archive dropdown 2018-present. Year filtering is client-side JS;
//          the server returns all rows for the queried year via ?year=YYYY.
//          The default page (no param) shows current year rows.
//
// Field notes (captured 2026-04-25):
//   Columns: Date (MM/DD/YYYY) | Cause No. | Order/Opinion | Case Caption
//   - No bar number in table → synthetic key INSC:<cause-number>
//   - Caption prefix "In the Matter of " / "In re " stripped → full_name
//   - discipline_type = 'see_pdf' for v1 (type only inside PDF, not in table)
//   - discipline_raw  = 'see order_url'
//   - PDF href may be relative (/courts/files/...) or absolute (public.courts.in.gov)
//
// Usage:
//   node scripts/ingest/scrape-inbar-discipline.mjs              # dry-run (all years)
//   node scripts/ingest/scrape-inbar-discipline.mjs --apply      # write to DB
//   node scripts/ingest/scrape-inbar-discipline.mjs --year 2023  # single year
//   node scripts/ingest/scrape-inbar-discipline.mjs --limit 20   # cap rows
//   node scripts/ingest/scrape-inbar-discipline.mjs --help

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.in.gov/courts/public-records/orders/discipline/';
const BASE_HOST = 'https://www.in.gov';
const JURISDICTION = 'IN';
const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// Archive years available on the site as of 2026-04-25.
const ARCHIVE_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// Caption prefixes to strip → full_name.
const CAPTION_PREFIXES = [
  /^in\s+the\s+matter\s+of\s*:?\s*/i,
  /^in\s+re\s*:?\s*/i,
];

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, year: null, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--year') {
      out.year = parseInt(args[++i], 10);
    } else if (a === '--limit') {
      out.limit = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      const lines = fs.readFileSync(__filename, 'utf8').split('\n');
      console.log(lines.slice(0, 28).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── HTTP ─────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.text();
}

// ── HTML parsing ─────────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|td|th|tr|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip "In the Matter of " / "In re " prefix from caption text. */
export function stripCaptionPrefix(caption) {
  let s = caption.trim();
  for (const re of CAPTION_PREFIXES) {
    const replaced = s.replace(re, '');
    if (replaced !== s) {
      s = replaced.trim();
      break;
    }
  }
  return s.replace(/[:]+$/, '').trim();
}

/** Resolve a potentially relative PDF href to an absolute URL. */
export function resolveHref(href) {
  if (!href) return null;
  href = href.trim();
  if (!href) return null;
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return BASE_HOST + href;
  return BASE_HOST + '/' + href;
}

/** Parse "MM/DD/YYYY" → "YYYY-MM-DD" or null. */
export function parseDate(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Build synthetic bar_number from cause number: INSC:<cause-number>. */
export function buildBarNumber(causeNumber) {
  return `INSC:${causeNumber}`;
}

/**
 * Parse the discipline table from page HTML.
 * Table columns: Date | Cause No. | Order/Opinion | Case Caption
 * Returns array of raw row objects.
 */
export function parseTable(html, sourceUrl) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRe.exec(html)) !== null) {
    const rowHtml = trMatch[1];

    // Skip header rows.
    if (/<th[\s>]/i.test(rowHtml)) continue;

    // Extract <td> cells.
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1]);
    }
    if (cells.length < 4) continue;

    const orderDate = parseDate(stripTags(cells[0]));
    if (!orderDate) continue;

    const causeRaw = stripTags(cells[1]).trim();
    if (!causeRaw) continue;

    // Some rows list multiple cause numbers (comma-separated); use the first.
    const causeFirst = causeRaw.split(/[,;]/)[0].trim();
    if (!causeFirst) continue;

    const captionHtml = cells[3];

    // Extract PDF href from the anchor in the caption cell.
    let orderUrl = null;
    const aMatch = captionHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
    if (aMatch) orderUrl = resolveHref(aMatch[1]);

    const fullName = stripCaptionPrefix(stripTags(captionHtml));
    if (!fullName || fullName.length > 200) continue;

    rows.push({
      order_date: orderDate,
      cause_number: causeFirst,
      cause_raw: causeRaw,
      full_name: fullName,
      order_url: orderUrl,
      source_url: sourceUrl,
    });
  }

  return rows;
}

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * Walk all archive years (or a single --year) and collect records.
 * The site serves all rows on the default page; ?year=YYYY fetches year-
 * specific data. We filter collected rows to the requested year by date.
 */
async function collectRecords() {
  const currentYear = new Date().getFullYear();
  const years = OPTS.year ? [OPTS.year] : [...ARCHIVE_YEARS];

  const allRecords = [];
  const seenKeys = new Set(); // dedup by cause_number + order_date

  for (const yr of years) {
    const url =
      yr === currentYear ? BASE_URL : `${BASE_URL}?year=${yr}`;

    console.error(`[inbar] GET ${url}`);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.error(`[inbar] year ${yr} failed: ${err.message} — skipping`);
      await politeDelay();
      continue;
    }

    const rows = parseTable(html, url);

    // Filter to rows belonging to this year.
    const filtered = rows.filter(
      (r) => parseInt(r.order_date.slice(0, 4), 10) === yr,
    );

    console.error(
      `[inbar] year ${yr}: ${rows.length} total rows → ${filtered.length} in-year`,
    );

    for (const r of filtered) {
      const key = `${r.cause_number}|${r.order_date}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      allRecords.push(r);
      if (allRecords.length >= OPTS.limit) break;
    }

    if (allRecords.length >= OPTS.limit) break;

    await politeDelay();
  }

  return allRecords;
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_in`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_in`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_in (
        jurisdiction    char(2),
        bar_number      text,
        full_name       text,
        first_name      text,
        last_name       text,
        admission_date  date,
        current_status  text,
        city            text,
        source_url      text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_in (
        jurisdiction      char(2),
        bar_number        text,
        full_name         text,
        order_date        date,
        effective_date    date,
        discipline_type   text,
        discipline_raw    text,
        violation_summary text,
        order_url         text,
        source_url        text
      );
    `);

    // De-dupe attorneys by bar_number before COPY.
    const byBar = new Map();
    for (const r of records) {
      const barNum = buildBarNumber(r.cause_number);
      if (!byBar.has(barNum)) {
        const clean = r.full_name.replace(/\s+/g, ' ').trim();
        const parts = clean.split(' ');
        const last = parts[parts.length - 1];
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : null;
        byBar.set(barNum, {
          jurisdiction: JURISDICTION,
          bar_number: barNum,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: null,
          current_status: null,
          city: null,
          source_url: r.source_url,
        });
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_in',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION,
      buildBarNumber(r.cause_number),
      r.full_name,
      r.order_date,
      null,           // effective_date — not in table
      'see_pdf',      // discipline_type v1 sentinel
      'see order_url',
      null,           // violation_summary — not in table
      r.order_url,
      r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_in',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_in
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name,  public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,   public.attorneys.last_name),
        source_url   = COALESCE(EXCLUDED.source_url,  public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id, bar_number;
    `);
    console.error(`[db] attorneys upserted: ${upsertAttorneys.rowCount}`);

    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date,
             s.effective_date, s.discipline_type, s.discipline_raw,
             s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_in s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_in, public._stg_discipline_in`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[inbar] start — apply=${OPTS.apply} year=${OPTS.year ?? 'all'} limit=${OPTS.limit}`,
  );

  const records = await collectRecords();
  console.error(`[inbar] collected ${records.length} discipline rows`);

  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [${buildBarNumber(r.cause_number)}] — see_pdf (${r.order_date}) — ${r.order_url ?? 'no-pdf'}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[inbar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[inbar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[inbar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
