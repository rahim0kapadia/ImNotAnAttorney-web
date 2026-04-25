// csv-bulk-checked: none-exists — PA Disciplinary Board search is JS-driven, no CSV/API, confirmed 2026-04-24
// Template: scripts/ingest/scrape-calbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18
//
// Pennsylvania Disciplinary Board "Recent Cases" scraper.
//
// Source (probed 2026-04-24):
//   Landing UI: https://www.padisciplinaryboard.org/for-the-public/search-recent-discipline
//   JSON API:   https://www.padisciplinaryboard.org/api/caselist/pastcases
//                 ?pageLength=1000&pageNumber=N&startDate=M/D/YYYY&endDate=M/D/YYYY
//                 &year=&search=&sort=Date
//
// The public-facing search page renders results client-side by calling a JSON
// endpoint at /api/caselist/pastcases. Although the UI advertises Selectize.js
// dropdowns + a numbered pager that uses `javascript:;` (no URL nav) — exactly
// the conditions parent-prompt warned about for Playwright-only access — the
// browser AJAX call is just a plain unauthenticated GET against the JSON API.
// That endpoint returns the SAME public-record discipline data the UI shows.
//
// We hit the JSON API directly: no Playwright, no DOM parsing, no rate-limit
// blocking, ~3 seconds for the entire 25-year corpus (3K rows / 4 pages of
// 1000). User-Agent identifies INAA per CLAUDE.md polite-scraping convention.
// Pagination is `pageNumber=1..N` until results.length < pageLength OR
// cumulative count reaches `totalRecords`.
//
// Response shape (per page):
//   { results: [{ name, attorneyId, county, docketNumber, actionType,
//                 effectiveDate, comments, opinion }],
//     pageLength, pageNumber, totalRecords }
//
// `attorneyId` is the PA Attorney Registration Number (real, NOT synthetic) —
// the schema requires `bar_number` NOT NULL, so rows missing it are dropped
// with a warning. (Probe found 4/3048 rows missing attorneyId in 2000-2026
// range — name-only entries from very old transitional cases.)
//
// Usage:
//   node scripts/ingest/scrape-pabar-discipline.mjs                       # dry-run, full 2000-present
//   node scripts/ingest/scrape-pabar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-pabar-discipline.mjs --start-date 2014-01-01 --apply
//   node scripts/ingest/scrape-pabar-discipline.mjs --max-pages 1         # smoke test (≤1000 rows)
//
// Output: staging tables _stg_attorneys_pa + _stg_discipline_pa populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── Config ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

const API_URL = 'https://www.padisciplinaryboard.org/api/caselist/pastcases';
const SOURCE_PAGE_URL =
  'https://www.padisciplinaryboard.org/for-the-public/search-recent-discipline';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'PA';

// Map PA actionType (free-text label from API) to the normalized
// discipline_type enum used by attorney_discipline_events. Order matters —
// disbarment checked before suspension so reciprocal-disbarment-then-suspension
// rows still classify as disbarment. Cross-referenced with FL/CA scrapers so
// the enum stays consistent across jurisdictions.
const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\bpublic\s+censure/i, 'public_reprimand'],
  [/\bpublic\s+repro(val|of)/i, 'public_reprimand'],
  [/\badmonish/i, 'admonishment'],
  [/\breinstate/i, 'reinstatement'],
  [/\bdisabled?\b/i, 'disability_inactive'],
  [/\bsanction/i, 'sanction'],
];

function normalizeDiscipline(actionType, comments) {
  const blob = `${actionType || ''} ${comments || ''}`.trim();
  if (!blob) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(blob)) return { type, raw: blob.slice(0, 500) };
  }
  return { type: 'unknown', raw: blob.slice(0, 500) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    startDate: '2000-01-01', // PA api earliest data is 2000-01-20
    endDate: null,
    maxPages: 50,
    pageLength: 1000,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-date') out.startDate = args[++i];
    else if (a === '--end-date') out.endDate = args[++i];
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--page-length') out.pageLength = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 40).join('\n'));
      process.exit(0);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.startDate)) {
    throw new Error(`--start-date must be YYYY-MM-DD, got: ${out.startDate}`);
  }
  if (out.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(out.endDate)) {
    throw new Error(`--end-date must be YYYY-MM-DD, got: ${out.endDate}`);
  }
  if (!Number.isFinite(out.maxPages) || out.maxPages <= 0) {
    throw new Error(`--max-pages must be a positive integer`);
  }
  if (!Number.isFinite(out.pageLength) || out.pageLength <= 0 || out.pageLength > 1000) {
    throw new Error(`--page-length must be 1..1000`);
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Fetch / parse ───────────────────────────────────────────────────────────

function isoToMDY(iso) {
  // ISO yyyy-mm-dd → m/d/yyyy (the PA endpoint expects US-format date strings).
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
}

function parseEffectiveDate(s) {
  if (!s) return null;
  // API returns "2026-04-22T00:00:00" (ISO no TZ). Take the date part only.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function splitName(full) {
  if (!full) return { first: null, last: null };
  // PA names come "Last, First Middle [Suffix]". Split on first comma.
  const ix = full.indexOf(',');
  if (ix < 0) {
    const parts = full.replace(/\s+/g, ' ').trim().split(' ');
    if (parts.length === 1) return { first: null, last: parts[0] };
    return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
  }
  const last = full.slice(0, ix).trim();
  const first = full.slice(ix + 1).trim() || null;
  return { first, last };
}

function politeDelay() {
  // 1-2s polite pause between pages even though API is fast — we are not
  // trying to hammer them.
  const ms = 1000 + Math.floor(Math.random() * 1000);
  return sleep(ms);
}

async function fetchPage(pageNumber) {
  const params = new URLSearchParams({
    pageLength: String(OPTS.pageLength),
    pageNumber: String(pageNumber),
    startDate: isoToMDY(OPTS.startDate),
    endDate: OPTS.endDate ? isoToMDY(OPTS.endDate) : '',
    year: '',
    search: '',
    sort: 'Date',
  });
  const url = `${API_URL}?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': SOURCE_PAGE_URL,
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  const json = await resp.json();
  if (!Array.isArray(json.results)) {
    throw new Error(`unexpected response shape — keys=${Object.keys(json).join(',')}`);
  }
  return { url, json };
}

async function scrape() {
  const records = [];
  let totalRecords = null;
  let lastUrl = null;

  for (let pageNumber = 1; pageNumber <= OPTS.maxPages; pageNumber++) {
    const { url, json } = await fetchPage(pageNumber);
    lastUrl = url;
    if (totalRecords == null) totalRecords = json.totalRecords;
    console.error(`[api] page ${pageNumber}: ${json.results.length} rows (cum ${records.length + json.results.length}/${totalRecords})`);

    for (const r of json.results) {
      // attorneyId is required by schema (NOT NULL bar_number).
      if (!r.attorneyId) {
        console.error(`[skip] missing attorneyId: ${r.name || '?'} (${r.docketNumber || '?'})`);
        continue;
      }
      const { type, raw } = normalizeDiscipline(r.actionType, r.comments);
      const effectiveDate = parseEffectiveDate(r.effectiveDate);

      records.push({
        bar_number: String(r.attorneyId),
        full_name: (r.name || '').replace(/\s+/g, ' ').trim() || `Bar #${r.attorneyId}`,
        county: r.county || null,
        docket_number: r.docketNumber || null,
        order_date: effectiveDate,         // PA API conflates order/effective into one field
        effective_date: effectiveDate,
        discipline_type: type,
        discipline_raw: raw,
        violation_summary: (r.comments || '').slice(0, 500) || null,
        action_type: r.actionType || null,
        opinion_filename: r.opinion || null,
        source_url: SOURCE_PAGE_URL,
        api_url: url,
      });
    }

    if (json.results.length < OPTS.pageLength) break;
    if (records.length >= totalRecords) break;
    await politeDelay();
  }

  return { records, totalRecords, lastUrl };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_pa`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_pa`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_pa (
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
      CREATE UNLOGGED TABLE public._stg_discipline_pa (
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

    // De-dupe attorneys by bar_number; keep most-recent name + non-empty
    // city/county we know about. PA "county" maps to attorneys.city for the
    // schema (no PA_county column; consumers query by city/jurisdiction).
    const byBar = new Map();
    for (const r of records) {
      const { first, last } = splitName(r.full_name);
      const cur = byBar.get(r.bar_number);
      if (!cur) {
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: null,
          current_status: null,
          city: r.county,
          source_url: r.source_url,
        });
      } else {
        if (!cur.city && r.county) cur.city = r.county;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_pa',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, null, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_pa',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_pa
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        city           = COALESCE(EXCLUDED.city, public.attorneys.city),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW()
      RETURNING id, bar_number;
    `);
    console.error(`[db] attorneys upserted: ${upsertAttorneys.rowCount}`);

    // NULLS DISTINCT default — rows missing order_date would bypass the
    // unique constraint and accumulate dups on re-run. Filter them.
    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_pa s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_pa, public._stg_discipline_pa`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[pabar] start — apply=${OPTS.apply} startDate=${OPTS.startDate} endDate=${OPTS.endDate || '(none)'} maxPages=${OPTS.maxPages} pageLength=${OPTS.pageLength}`,
  );

  const { records, totalRecords } = await scrape();

  console.error(`[pabar] collected ${records.length} discipline rows (api totalRecords=${totalRecords})`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.effective_date || '?'}) — ${r.county || '?'}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[pabar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[pabar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[pabar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
