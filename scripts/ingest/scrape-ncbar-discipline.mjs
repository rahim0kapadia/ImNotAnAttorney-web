// csv-bulk-checked: https://www.ncbar.gov/lawyer-discipline/past-orders-of-discipline/orders-of-discipline/
// Template: scripts/ingest/scrape-tnbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// North Carolina State Bar — past orders of discipline scraper.
//
// Source (confirmed live 2026-04-27 via raw-HTML probe + JSON API call):
//   Search page: https://www.ncbar.gov/lawyer-discipline/past-orders-of-discipline/orders-of-discipline/
//   Results URL: https://www.ncbar.gov/lawyer-discipline/past-orders-of-discipline/orders-of-discipline/orders-of-discipline-results/
//   JSON API:    POST https://www.ncbar.gov/mypastordersofdiscipline/search/
//
// The results page renders a Lit web component (<past-orders-of-discipline-table-lit>)
// that calls the JSON API in the browser. We hit the API directly.
//
// API request body (JSON): {
//   firstName, lastName, termSearch, filterDisposition,
//   pageSize, pageNumber, resultsPageGuid
// }
// resultsPageGuid is required; current value is published in the page HTML
// inside <past-orders-of-discipline-table-lit resultsPageGuid="...">.
// The scraper fetches the results-page HTML once on startup to extract the
// live guid.
//
// Each API record: { id, name, disciplinaryOrderNumber, disposition, pdfLink }
//   · `name`        : "Last, First [Middle]"
//   · `disciplinaryOrderNumber` : e.g. "97DHC25", "00DHC1", "13DHC17", "19BCR4"
//   · `disposition` : e.g. "Suspension", "Disbarred", "Reprimand", "Reinstatement"
//   · `pdfLink`     : "/mypastordersofdiscipline/getfile?id=<uuid>&search="
//
// CRITICAL DATE LIMITATION:
//   The JSON API does not return an order date. The order number prefix
//   includes a 2-digit year (e.g. "97DHC25" => 1997, "00DHC1" => 2000,
//   "13DHC17" => 2013). We use that year + January 1 as the order_date
//   sentinel. Discipline_raw stores the full order number so the precise
//   date can be recovered manually from the PDF when needed.
//   NOTE: years 70-99 map to 19xx, 00-50 map to 20xx (pivot at 50).
//
// Bar numbers: NC API does not expose bar numbers in this endpoint.
//   Deterministic synthetic key: NC:<sha1(full_name|order_date)[:8]>
//
// Reinstatement / dismissal records are skipped — these aren't punitive
// disciplinary events.
//
// Polite scraping: 800–1600 ms randomized delay between API calls.
// User-Agent identifies INAA.
//
// Usage:
//   node scripts/ingest/scrape-ncbar-discipline.mjs              # dry-run
//   node scripts/ingest/scrape-ncbar-discipline.mjs --apply
//   node scripts/ingest/scrape-ncbar-discipline.mjs --limit 50
//   node scripts/ingest/scrape-ncbar-discipline.mjs --help

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.ncbar.gov';
const RESULTS_PAGE_URL = `${BASE_URL}/lawyer-discipline/past-orders-of-discipline/orders-of-discipline/orders-of-discipline-results/`;
const API_URL = `${BASE_URL}/mypastordersofdiscipline/search/`;
const PAGE_SIZE = 100;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const JURISDICTION = 'NC';

// ── Discipline mapping ──────────────────────────────────────────────────────
// NC's `disposition` enum (from live page filter dropdown 2026-04-27).
// We keep only punitive types — skip dismissals, reinstatements, etc.

const DISPOSITION_MAP = new Map([
  ['Letter of Warning',         'admonition'],
  ['Admonition',                'admonition'],
  ['Reprimand',                 'public_reprimand'],
  ['Private Reprimand',         'private_reprimand'],
  ['Censure',                   'censure'],
  ['Suspension',                'suspension'],
  ['Suspension with Part Stayed', 'suspension'],
  ['Suspension with All Stayed', 'suspension'],
  ['Suspension Possible Stay',  'suspension'],
  ['Suspension Stayed',         'suspension'],
  ['Suspension - Temporarily Stayed by COA', 'suspension'],
  ['Stayed Interim Suspension', 'interim_suspension'],
  ['Stayed Suspension Extended', 'suspension'],
  ['Stayed Suspension Remains in Effect', 'suspension'],
  ['Suspension Activated',      'suspension'],
  ['Disbarred',                 'disbarment'],
  ['Disbarred on Consent',      'disbarment'],
  ['Disbarment Vacated',        null], // skip — punitive removed
  ['Disability Inactive',       'disability_inactive'],
  ['Disability Inactive Stayed', 'disability_inactive'],
  ['Interim Suspension',        'interim_suspension'],
  ['Criminal Contempt',         'censure'],
  ['Enjoined from Practicing Law', 'suspension'],
  ['Stayed',                    null], // ambiguous, skip
  ['Stay Denied',               null], // procedural, skip
  ['Injunction Lifted',         null],
  ['Rescinded',                 null],
  ['Reinstatement',             null],
  ['Reinstated Upon Conditions', null],
  ['Reinstatment Dismissed',    null],
  ['Reinstatement Denied',      null],
  ['Petition Withdrawn',        null],
  ['Resignation Withdrawn',     null],
  ['Motion Withdrawn',          null],
  ['Voluntary Dismissal with Prejudice', null],
  ['Voluntary Dismissal without Prejudice', null],
  ['Dismissed with Prejudice',  null],
  ['Dismissed without Prejudice', null],
  ['Involuntary Dismissal',     null],
  ['Reversed by AOC',           null],
  ['Transfer Back to Active Status', null],
  ['Panel Recommendation Deny Rein', null],
  ['Other',                     null],
]);

export function normalizeDiscipline(disposition) {
  if (!disposition) return null;
  const trimmed = String(disposition).trim();
  if (!DISPOSITION_MAP.has(trimmed)) return null; // unknown → skip
  return DISPOSITION_MAP.get(trimmed); // may be null (skip)
}

// ── Order-number → year extraction ──────────────────────────────────────────

/**
 * Extract a 2-digit year prefix from a NC disciplinary-order number.
 * Format examples (verified live 2026-04-27):
 *   97DHC25      → 97 → 1997
 *   00DHC1       → 00 → 2000
 *   13DHC17      → 13 → 2013
 *   19BCR4       → 19 → 2019
 *   18G0701      → 18 → 2018
 *   24DHC9       → 24 → 2024
 *
 * Pivot rule: years 70-99 map to 19xx, 00-50 map to 20xx.
 *
 * Returns ISO YYYY-01-01 string or null on failure.
 */
export function orderNumberToDate(orderNumber) {
  if (!orderNumber) return null;
  const m = String(orderNumber).match(/^(\d{2})/);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  if (Number.isNaN(yy)) return null;
  const year = yy >= 70 ? 1900 + yy : (yy <= 50 ? 2000 + yy : null);
  if (year === null) return null;
  return `${year}-01-01`;
}

// ── Name parsing ────────────────────────────────────────────────────────────

/**
 * NC names arrive as "Last, First Middle". Convert to:
 *   { fullName: "First Middle Last", firstName, lastName }
 *
 * Verified live 2026-04-27 against e.g.
 *   "Smith, Franklin Delano"  → "Franklin Delano Smith"
 *   "Smith, James W."         → "James W. Smith"
 *   "Adams, Robert W."        → "Robert W. Adams"
 */
export function parseName(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.length < 2 || s.length > 150) return null;
  const commaIdx = s.indexOf(',');
  if (commaIdx <= 0) {
    // No comma — leave as-is.
    return { fullName: s, firstName: null, lastName: s };
  }
  const lastName = s.slice(0, commaIdx).trim();
  const firstName = s.slice(commaIdx + 1).trim();
  if (!lastName || !firstName) return null;
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
  return { fullName, firstName, lastName };
}

// ── Synthetic bar number ────────────────────────────────────────────────────

export function deterministicBarNumber(fullName, orderDate) {
  const key = (fullName + '|' + orderDate).toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return `NC:${hash.slice(0, 8)}`;
}

// ── Record normalisation ────────────────────────────────────────────────────

export function transformApiRecord(apiRow, sourceUrl) {
  const name = parseName(apiRow?.name);
  if (!name) return null;

  const disciplineType = normalizeDiscipline(apiRow?.disposition);
  if (!disciplineType) return null;

  const orderDate = orderNumberToDate(apiRow?.disciplinaryOrderNumber);
  if (!orderDate) return null;

  const barNumber = deterministicBarNumber(name.fullName, orderDate);

  const orderUrl = apiRow?.pdfLink
    ? `${BASE_URL}${apiRow.pdfLink.startsWith('/') ? '' : '/'}${apiRow.pdfLink}`
    : null;

  const summary = `Order ${apiRow?.disciplinaryOrderNumber || '?'} — ${apiRow?.disposition || '?'}`;

  return {
    bar_number: barNumber,
    full_name: name.fullName,
    first_name: name.firstName,
    last_name: name.lastName,
    city: null,
    order_date: orderDate,
    effective_date: orderDate,
    discipline_type: disciplineType,
    discipline_raw: String(apiRow?.disposition || '').slice(0, 500),
    violation_summary: summary.slice(0, 500),
    order_url: orderUrl,
    source_url: sourceUrl,
  };
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

async function postJson(url, body, fetchImpl) {
  const fn = fetchImpl || fetch;
  const resp = await fn(url, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — POST ${url}`);
  }
  return resp.json();
}

/** Extract `resultsPageGuid="..."` from the live results page. */
export function extractResultsPageGuid(html) {
  if (!html) return null;
  const m = html.match(/resultsPageGuid="([0-9a-fA-F\-]{36})"/);
  return m ? m[1] : null;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      process.stderr.write(
        fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 56).join('\n') + '\n',
      );
      process.exit(0);
    }
  }
  return out;
}

// ── Scrape orchestrator ─────────────────────────────────────────────────────

export async function scrapeNC(opts = {}) {
  const {
    apply = false,
    limit = Infinity,
    fetchImpl,
    dbFactory,
  } = opts;

  // Step 1 — fetch the results page once to grab the live guid.
  process.stderr.write(`[ncbar] GET ${RESULTS_PAGE_URL}\n`);
  const pageHtml = await fetchHtml(RESULTS_PAGE_URL, fetchImpl);
  const guid = extractResultsPageGuid(pageHtml);
  if (!guid) {
    throw new Error('[ncbar] could not extract resultsPageGuid from page HTML');
  }
  process.stderr.write(`[ncbar] resultsPageGuid=${guid}\n`);

  // Step 2 — paginate the JSON API.
  const allApiRows = [];
  let pageNumber = 1;
  let totalCount = null;

  while (true) {
    if (allApiRows.length >= limit) break;

    const body = {
      firstName: '',
      lastName: '',
      termSearch: '',
      filterDisposition: '',
      pageSize: PAGE_SIZE,
      pageNumber,
      resultsPageGuid: guid,
    };
    process.stderr.write(`[ncbar] POST ${API_URL} pageNumber=${pageNumber}\n`);
    let json;
    try {
      json = await postJson(API_URL, body, fetchImpl);
    } catch (err) {
      process.stderr.write(`[ncbar] page ${pageNumber} failed: ${err.message} — stopping\n`);
      break;
    }

    if (!json?.success) {
      process.stderr.write(`[ncbar] api success=false: ${JSON.stringify(json?.messages)} — stopping\n`);
      break;
    }
    const results = json?.data?.results || [];
    if (totalCount === null) {
      totalCount = json?.data?.totalCount || 0;
      process.stderr.write(`[ncbar] totalCount=${totalCount}\n`);
    }
    if (results.length === 0) {
      process.stderr.write(`[ncbar] empty page — done\n`);
      break;
    }
    allApiRows.push(...results);
    process.stderr.write(`[ncbar] page ${pageNumber}: ${results.length} rows (cum ${allApiRows.length}/${totalCount})\n`);

    // Stop when we've fetched everything the API knows about.
    if (allApiRows.length >= totalCount) break;
    pageNumber++;
    if (!fetchImpl) await politeDelay();
  }

  // Step 3 — normalize.
  const records = [];
  for (const row of allApiRows) {
    const rec = transformApiRecord(row, RESULTS_PAGE_URL);
    if (rec) records.push(rec);
    if (records.length >= limit) break;
  }

  process.stderr.write(`[ncbar] collected ${records.length} discipline rows (from ${allApiRows.length} api rows)\n`);
  for (const r of records.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date})\n`,
    );
  }

  if (!apply) {
    process.stderr.write(`[ncbar] dry-run — pass --apply to write to DB\n`);
    return { records };
  }
  if (records.length === 0) {
    throw new Error('[ncbar] no rows parsed — aborting without touching DB');
  }
  const factory = dbFactory || createBulkClient;
  await load(records, factory);
  return { records };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records, dbFactory) {
  const { client, cleanup } = await dbFactory();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nc`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_nc`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_nc (
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
      CREATE UNLOGGED TABLE public._stg_discipline_nc (
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
      }
    }
    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);
    await bulkCopyRows(
      client,
      '_stg_attorneys_nc',
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
      '_stg_discipline_nc',
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
      FROM _stg_attorneys_nc
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
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
      FROM _stg_discipline_nc s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insertResult.rowCount}\n`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_nc, public._stg_discipline_nc`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const OPTS = parseArgs(process.argv);
  scrapeNC({
    apply: OPTS.apply,
    limit: OPTS.limit,
  }).catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
