// csv-bulk-checked: https://www.tbpr.org/news-publications/recent-disciplinary-actions
// Template: scripts/ingest/scrape-flbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Tennessee Board of Professional Responsibility — disciplinary actions scraper.
//
// Source (confirmed 2026-04-25 via WebFetch):
//   Listing: https://www.tbpr.org/news-publications/recent-disciplinary-actions
//   Paginated: ?page=N (0-indexed, Drupal pagination)
//
// TBPR publishes a paginated HTML table — one row per disciplined attorney —
// with columns: Attorney Name, Bar Number, City, Action, Effective Date, Order.
// Bar numbers ARE published (unlike FL/GA), so no synthetic key is needed.
// "Reinstated" rows are skipped per spec.
//
// Polite scraping: 800–1600 ms randomized delay. User-Agent identifies INAA.
//
// Usage:
//   node scripts/ingest/scrape-tnbar-discipline.mjs               # dry-run
//   node scripts/ingest/scrape-tnbar-discipline.mjs --apply       # write to DB
//   node scripts/ingest/scrape-tnbar-discipline.mjs --start-page 0 --end-page 5
//   node scripts/ingest/scrape-tnbar-discipline.mjs --limit 50
//   node scripts/ingest/scrape-tnbar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_tn + _stg_discipline_tn populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.tbpr.org';
const LISTING_PATH = '/news-publications/recent-disciplinary-actions';

function listingUrl(page) {
  return page === 0
    ? `${BASE_URL}${LISTING_PATH}`
    : `${BASE_URL}${LISTING_PATH}?page=${page}`;
}

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'TN';

// ── Discipline type mapping ─────────────────────────────────────────────────
// Map TBPR action text → canonical enum.
// Order matters — more specific patterns first.

const DISCIPLINE_PATTERNS = [
  [/\bdisabilit\w+\s+inactive\b/i,             'disability_inactive'],
  [/\breciprocal\b/i,                           'reciprocal_discipline'],
  [/\binterim\s+suspen/i,                       'interim_suspension'],
  [/\bemergency\s+suspen/i,                     'interim_suspension'],
  [/\bdisbar/i,                                 'disbarment'],
  [/\bresign\w*\s+(?:with|in\s+lieu)/i,         'resignation_with_charges'],
  [/\bpending\s+charges?\b/i,                   'resignation_with_charges'],
  [/\bsuspen/i,                                 'suspension'],
  [/\bprobation\b/i,                            'probation'],
  [/\bpublic\s+reprimand\b/i,                   'public_reprimand'],
  [/\bpublic\s+censure\b/i,                     'censure'],
  [/\bcensure\b/i,                              'censure'],
  [/\badmonition\b/i,                           'admonition'],
  [/\badmonish/i,                               'admonition'],
];

/**
 * Map raw TBPR action text to canonical discipline_type enum value.
 * Returns null if the action is "Reinstated" (skip per spec) or unrecognized.
 */
export function normalizeDiscipline(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Skip reinstatements per spec.
  if (/\breinstated?\b/i.test(trimmed)) return null;
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(trimmed)) return type;
  }
  return null;
}

// ── Date parsing ────────────────────────────────────────────────────────────

/**
 * Parse MM/DD/YYYY date strings from TBPR table cells.
 * Returns ISO YYYY-MM-DD or null on failure.
 */
export function parseDate(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const mo = mm.padStart(2, '0');
  const dy = dd.padStart(2, '0');
  if (parseInt(mo, 10) < 1 || parseInt(mo, 10) > 12) return null;
  if (parseInt(dy, 10) < 1 || parseInt(dy, 10) > 31) return null;
  return `${yyyy}-${mo}-${dy}`;
}

// ── HTML utilities ──────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract href from raw <td> cell HTML, resolving relative to BASE_URL.
 * Returns null if no anchor found.
 */
export function extractOrderUrl(tdHtml) {
  if (!tdHtml) return null;
  const m = tdHtml.match(/<a[^>]+href=["']([^"']+)["']/i);
  if (!m) return null;
  const href = m[1].trim();
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
}

// ── Table row parsing ───────────────────────────────────────────────────────

/**
 * Parse one <tr> from the TBPR discipline table.
 * Expected columns (0-indexed):
 *   0: Attorney Name (Last, First M.)
 *   1: Bar Number
 *   2: City
 *   3: Action
 *   4: Effective Date
 *   5: Order (anchor to PDF, optional)
 *
 * Returns a record object or null if row should be skipped.
 */
export function parseTableRow(trHtml, sourceUrl) {
  const tdMatches = [...trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
  if (tdMatches.length < 5) return null;

  const cells = tdMatches.map((m) => stripTags(m[1]));
  const rawOrderCell = tdMatches[5] ? tdMatches[5][1] : '';

  const [rawName, rawBarNumber, rawCity, rawAction, rawDate] = cells;

  if (!rawName || !rawAction) return null;

  const fullName = rawName.trim().replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 150) return null;

  // Bar numbers must be non-empty digits (TBPR format: 6-digit numeric).
  const barNumber = rawBarNumber ? rawBarNumber.trim().replace(/\s+/g, '') : null;
  if (!barNumber || !/^\d+$/.test(barNumber)) return null;

  const city = rawCity ? rawCity.trim() : null;

  // Map action → canonical type; null = skip (Reinstated or unknown).
  const disciplineType = normalizeDiscipline(rawAction);
  if (!disciplineType) return null;

  const orderDate = parseDate(rawDate);
  const orderUrl = extractOrderUrl(rawOrderCell) || null;

  // Name split: "Last, First Middle" → first_name, last_name.
  let firstName = null;
  let lastName = fullName;
  const commaIdx = fullName.indexOf(',');
  if (commaIdx > 0) {
    lastName = fullName.slice(0, commaIdx).trim();
    firstName = fullName.slice(commaIdx + 1).trim() || null;
  }

  return {
    bar_number: barNumber,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    city,
    order_date: orderDate,
    effective_date: orderDate,
    discipline_type: disciplineType,
    discipline_raw: rawAction.slice(0, 500),
    violation_summary: null,
    order_url: orderUrl,
    source_url: sourceUrl,
  };
}

// ── Page parsing ────────────────────────────────────────────────────────────

/**
 * Extract all discipline rows from one listing page HTML.
 * Throws if >2% of attempted rows errored (per spec defensive rule).
 * Returns array of parsed records (nulls already filtered).
 */
export function parseListingPage(html, sourceUrl) {
  // Match the first <table> containing discipline rows.
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];

  const tableHtml = tableMatch[0];
  const records = [];
  let badRows = 0;
  let totalRows = 0;

  for (const trMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const trHtml = trMatch[1];
    // Skip header rows.
    if (/<th/i.test(trHtml)) continue;
    totalRows++;
    try {
      const rec = parseTableRow(trHtml, sourceUrl);
      if (rec) records.push(rec);
    } catch (err) {
      badRows++;
      process.stderr.write(`[tnbar] row parse error: ${err.message}\n`);
    }
  }

  if (totalRows > 0 && badRows / totalRows > 0.02) {
    throw new Error(
      `[tnbar] too many row-parse errors: ${badRows}/${totalRows} ` +
      `(${((badRows / totalRows) * 100).toFixed(1)}% > 2% threshold)`,
    );
  }

  return records;
}

/**
 * Return true if the page HTML indicates there is a next page.
 */
export function hasNextPage(html, currentPage) {
  const nextPage = currentPage + 1;
  return html.includes(`page=${nextPage}`) || /rel=["']next["']/i.test(html);
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchHtml(url, fetchImpl) {
  const fn = fetchImpl || fetch;
  const resp = await fn(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  return resp.text();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, startPage: 0, endPage: Infinity, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--start-page') {
      out.startPage = parseInt(args[++i], 10);
    } else if (a === '--end-page') {
      out.endPage = parseInt(args[++i], 10);
    } else if (a === '--limit') {
      out.limit = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      process.stderr.write(
        fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 26).join('\n') + '\n',
      );
      process.exit(0);
    }
  }
  return out;
}

// ── Scrape orchestrator ─────────────────────────────────────────────────────

export async function scrapeTN(opts = {}) {
  const {
    apply = false,
    startPage = 0,
    endPage = Infinity,
    limit = Infinity,
    fetchImpl,
    dbFactory,
  } = opts;

  const allRecords = [];
  let page = startPage;

  while (page <= endPage && allRecords.length < limit) {
    const url = listingUrl(page);
    process.stderr.write(`[tnbar] GET ${url}\n`);

    let html;
    try {
      html = await fetchHtml(url, fetchImpl);
    } catch (err) {
      process.stderr.write(`[tnbar] page ${page} fetch failed: ${err.message} — stopping\n`);
      break;
    }

    const pageRecords = parseListingPage(html, url);
    process.stderr.write(`[tnbar] page ${page}: ${pageRecords.length} records\n`);
    allRecords.push(...pageRecords);

    if (!hasNextPage(html, page)) {
      process.stderr.write(`[tnbar] no next page after page ${page} — done\n`);
      break;
    }

    page++;
    if (!fetchImpl) await politeDelay();
  }

  const records = Number.isFinite(limit) ? allRecords.slice(0, limit) : allRecords;

  process.stderr.write(`[tnbar] collected ${records.length} discipline rows\n`);
  for (const r of records.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date || '?'}) — ${r.city || '?'}\n`,
    );
  }

  if (!apply) {
    process.stderr.write(`[tnbar] dry-run — pass --apply to write to DB\n`);
    return { records };
  }

  if (records.length === 0) {
    throw new Error('[tnbar] no rows parsed — aborting without touching DB');
  }

  const factory = dbFactory || createBulkClient;
  await load(records, factory);
  return { records };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records, dbFactory) {
  const { client, cleanup } = await dbFactory();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_tn`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_tn`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_tn (
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
      CREATE UNLOGGED TABLE public._stg_discipline_tn (
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
      if (!byBar.has(r.bar_number)) {
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: r.first_name,
          last_name: r.last_name,
          admission_date: null,
          current_status: null,
          city: r.city,
          source_url: r.source_url,
        });
      } else {
        const prev = byBar.get(r.bar_number);
        if (!prev.city && r.city) prev.city = r.city;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_tn',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_tn',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      disciplineRows,
    );

    const upsertResult = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_tn
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        city         = COALESCE(EXCLUDED.city, public.attorneys.city),
        source_url   = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id, bar_number;
    `);
    process.stderr.write(`[db] attorneys upserted: ${upsertResult.rowCount}\n`);

    const insertResult = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_tn s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insertResult.rowCount}\n`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_tn, public._stg_discipline_tn`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

// Guard: only run when executed directly, not when imported by tests.
// import.meta.url is a file:// URL; process.argv[1] is a filesystem path.
// pathToFileURL normalises both to the same scheme for a reliable comparison.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const OPTS = parseArgs(process.argv);
  scrapeTN({
    apply: OPTS.apply,
    startPage: OPTS.startPage,
    endPage: OPTS.endPage,
    limit: OPTS.limit,
  }).catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
