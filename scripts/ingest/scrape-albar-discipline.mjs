// csv-bulk-checked: https://www.alabar.org/office-of-general-counsel/disciplinary-history/
// Template: scripts/ingest/scrape-tnbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Alabama State Bar — disciplinary-history scraper.
//
// Source (confirmed live 2026-04-27 via WebFetch + raw HTML probe):
//   Listing: https://www.alabar.org/office-of-general-counsel/disciplinary-history/
//   Pagination: /page/N/ (N = 2..63 as of 2026-04-27, 935 total entries, 15 per page)
//
// AL publishes a paginated HTML list. Each entry is a row with three columns:
//   <div class="col-g-2 ... date">M/D/YYYY</div>
//   <div class="col-g-3 ... discipline">Type Imposed</div>
//   <div class="col-g-7 ... details">Narrative — attorney name + city embedded</div>
//
// Pre-2018 entries are anonymized — the narrative says "an attorney" with no
// name. AL explicitly states: pre-2018 discipline "has been edited to remove
// any identifying information." Those rows are SKIPPED — without a name we
// can't build a synthesized bar number, and they'd violate per-attorney
// granularity anyway.
//
// Bar numbers: AL does not publish bar numbers in this listing.
//   Deterministic synthetic key: AL:<sha1(full_name|order_date)[:8]>
//   Stable across runs for the same attorney+date.
//
// Discipline types in source: "Private Reprimand", "Public Reprimand With
// Publication", "Public Reprimand Without Publication", "Suspended",
// "Disbarred", "Disability Inactive", "Probation", "Surrender of license".
// Mapped to canonical enum below.
//
// Polite scraping: 800–1600 ms randomized delay. User-Agent identifies INAA.
//
// Usage:
//   node scripts/ingest/scrape-albar-discipline.mjs              # dry-run
//   node scripts/ingest/scrape-albar-discipline.mjs --apply
//   node scripts/ingest/scrape-albar-discipline.mjs --start-page 1 --end-page 5
//   node scripts/ingest/scrape-albar-discipline.mjs --limit 50
//   node scripts/ingest/scrape-albar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_al + _stg_discipline_al populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.alabar.org';
const LISTING_PATH = '/office-of-general-counsel/disciplinary-history';

function listingUrl(page) {
  return page <= 1
    ? `${BASE_URL}${LISTING_PATH}/`
    : `${BASE_URL}${LISTING_PATH}/page/${page}/`;
}

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'AL';

// ── Discipline type mapping ─────────────────────────────────────────────────
// Source label → canonical enum.

const DISCIPLINE_PATTERNS = [
  [/disability\s+inactive/i,                   'disability_inactive'],
  [/disbar/i,                                  'disbarment'],
  [/surrender\s+of\s+license/i,                'resignation_with_charges'],
  [/interim\s+suspen/i,                        'interim_suspension'],
  [/suspended|suspension/i,                    'suspension'],
  [/probation/i,                               'probation'],
  [/private\s+reprimand/i,                     'private_reprimand'],
  [/public\s+reprimand/i,                      'public_reprimand'],
  [/public\s+censure|censure/i,                'censure'],
];

export function normalizeDiscipline(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/\breinstated?\b/i.test(trimmed)) return null;
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(trimmed)) return type;
  }
  return null;
}

// ── Date parsing ────────────────────────────────────────────────────────────

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

function decodeEntities(s) {
  return s
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&raquo;/g, '»');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Name + city extraction ──────────────────────────────────────────────────
//
// AL details column has these shapes (verified live 2026-04-27):
//
//   Named:    "Bradley James Latta, of Hoover, Alabama, was issued a Public
//              Reprimand With Publication by the Disciplinary Commission..."
//   Named:    "On {date}, the Supreme Court of Alabama issued an order
//              accepting the voluntary surrender of {Name}'s license..."
//   Named:    "{Name} was summarily suspended for failing to respond..."
//   Anon:     "On {date}, the Disciplinary Commission of the Alabama State
//              Bar issued an attorney a private reprimand..."
//   Anon:     "An attorney 'failed to competently...'"
//   Anon:     "A Birmingham, Alabama attorney was issued a Private Reprimand
//              by the Disciplinary Commission..."

const ANON_PHRASES = [
  /^on\s+\d{1,2}\/\d{1,2}\/\d{4}\s*,\s*the\s+disciplinary\s+commission\s+of\s+the\s+alabama\s+state\s+bar\s+issued\s+an\s+attorney\b/i,
  /^an\s+(?:alabama\s+)?attorney\b/i,
  /^a\s+(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*,\s*)?(?:[A-Za-z .]+)\s+attorney\s+(?:was|received)\b/i,
];

export function isAnonymousEntry(narrative) {
  if (!narrative) return true;
  const s = narrative.trim();
  if (!s) return true;
  for (const re of ANON_PHRASES) {
    if (re.test(s)) return true;
  }
  return false;
}

/**
 * Extract attorney name from named-entry narrative.
 *
 * Patterns recognised (live-DOM verified 2026-04-27 against page 2 sample):
 *  1. "{City}, Alabama attorney, {Name} was issued ..."   (with comma after Name)
 *  2. "{City}, Alabama attorney {Name} was [summarily] suspended ..."  (no comma)
 *  3. "{City} attorney, {Name}, was summarily suspended ..."  (only one Alabama)
 *  4. "{City} attorney {Name} was disbarred ..."
 *  5. "On {date}, the Supreme Court ... voluntary surrender of {Name}'s license ..."
 *  6. "{Name}, of {City}, [Alabama,] was issued ..."
 *
 * NOTE: The narrative may begin with city ("Hoover, Alabama attorney, ...")
 * OR with date ("On January 19, 2024, ...") OR with the attorney name
 * directly. Patterns checked in priority order.
 *
 * Returns { fullName, firstName, lastName, city } or null if anonymous /
 * unparseable.
 */
const NAME_RE = "[A-Z][A-Za-z.'\\-]+(?:\\s+[A-Z][A-Za-z.'\\-]+){1,4}(?:,?\\s+(?:Jr|Sr|II|III|IV))?";

export function extractAttorney(narrative) {
  if (!narrative || isAnonymousEntry(narrative)) return null;
  const s = narrative.trim();

  // Pattern A: "{City}, Alabama attorney, {Name}, was/were ..." (W. McGowen III variant)
  const mA = s.match(new RegExp(`^([A-Z][A-Za-z .'\\-]+?)(?:,\\s+Alabama)?\\s+attorney,?\\s+(${NAME_RE})\\s*,?\\s+was\\b`));
  if (mA) {
    const city = mA[1].trim();
    const fullName = mA[2].replace(/\s+/g, ' ').trim();
    return { fullName, ...splitName(fullName), city };
  }

  // Pattern B: "voluntary surrender of {Name}'s license"
  const mB = s.match(new RegExp(`voluntary\\s+surrender\\s+of\\s+(${NAME_RE})['’]s\\s+license`, 'i'));
  if (mB) {
    const fullName = mB[1].replace(/\s+/g, ' ').trim();
    return { fullName, ...splitName(fullName), city: null };
  }

  // Pattern C: "{Name}, of {City}, ..."
  const mC = s.match(new RegExp(`^(${NAME_RE})\\s*,\\s*of\\s+([A-Z][A-Za-z .'\\-]+?)\\s*,`));
  if (mC) {
    const fullName = mC[1].replace(/\s+/g, ' ').trim();
    const city = mC[2].trim();
    return { fullName, ...splitName(fullName), city };
  }

  // Pattern D: bare "{Name} was ..."
  const mD = s.match(new RegExp(`^(${NAME_RE})\\s+was\\b`));
  if (mD) {
    const fullName = mD[1].replace(/\s+/g, ' ').trim();
    return { fullName, ...splitName(fullName), city: null };
  }

  // Pattern E: "{City}, Alabama attorney {Name} was disbarred/suspended/..."
  // (no comma between attorney and name — e.g. "Birmingham attorney Sandy Eugene Lee was disbarred")
  const mE = s.match(new RegExp(`^([A-Z][A-Za-z .'\\-]+?)(?:,\\s+Alabama)?\\s+attorney\\s+(${NAME_RE})\\s+was\\b`));
  if (mE) {
    const city = mE[1].trim();
    const fullName = mE[2].replace(/\s+/g, ' ').trim();
    return { fullName, ...splitName(fullName), city };
  }

  return null;
}

function splitName(fullName) {
  // "First [Middle] Last [, Jr/Sr/II/III/IV]"
  const cleaned = fullName.replace(/,\s*(Jr|Sr|II|III|IV)\.?$/i, ' $1');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: null, lastName: cleaned };
  const lastName = parts[parts.length - 1].match(/^(Jr|Sr|II|III|IV)$/i)
    ? parts.slice(-2).join(' ')
    : parts[parts.length - 1];
  const lastIdx = parts.length - (lastName.includes(' ') ? 2 : 1);
  const firstName = parts.slice(0, lastIdx).join(' ');
  return { firstName: firstName || null, lastName };
}

// ── Synthetic bar number ────────────────────────────────────────────────────

export function deterministicBarNumber(fullName, orderDate) {
  const key = (fullName + '|' + orderDate).toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return `AL:${hash.slice(0, 8)}`;
}

// ── Page parsing ────────────────────────────────────────────────────────────

/**
 * Extract entries from raw HTML. Each visible row is a triple of div blocks:
 *   <div class="col-g-2 col-g-medium-12 date">M/D/YYYY</div>
 *   <div class="col-g-3 col-g-medium-12 discipline">Type</div>
 *   <div class="col-g-7 col-g-medium-12 details">Narrative ... <a>Read more</a></div>
 *
 * We extract three independent ordered lists of dates/disciplines/details and
 * pair by index. The hidden #disc-details-N expander divs use different
 * classes so they don't pollute the detail list.
 */
export function parseListingPage(html, sourceUrl) {
  const dates = [...html.matchAll(/<div\s+class="col-g-2\s+col-g-medium-12\s+date"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => stripTags(m[1]));
  const discs = [...html.matchAll(/<div\s+class="col-g-3\s+col-g-medium-12\s+discipline"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => stripTags(m[1]));
  const dets = [...html.matchAll(/<div\s+class="col-g-7\s+col-g-medium-12\s+details"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => stripTags(m[1])
      .replace(/\s*Read\s*more\s*»?\s*$/i, '')
      .replace(/\s*Read\s*»?\s*$/i, '')
      .replace(/\s*…\s*$/, '')
      .trim());

  const n = Math.min(dates.length, discs.length, dets.length);
  const records = [];

  for (let i = 0; i < n; i++) {
    const orderDate = parseDate(dates[i]);
    if (!orderDate) continue;

    const disciplineType = normalizeDiscipline(discs[i]);
    if (!disciplineType) continue;

    const narrative = dets[i];
    const attorney = extractAttorney(narrative);
    if (!attorney) continue; // anonymous or unparseable — skip

    const barNumber = deterministicBarNumber(attorney.fullName, orderDate);

    records.push({
      bar_number: barNumber,
      full_name: attorney.fullName,
      first_name: attorney.firstName,
      last_name: attorney.lastName,
      city: attorney.city,
      order_date: orderDate,
      effective_date: orderDate,
      discipline_type: disciplineType,
      discipline_raw: discs[i].slice(0, 500),
      violation_summary: narrative.slice(0, 500),
      order_url: null,
      source_url: sourceUrl,
    });
  }

  return records;
}

export function hasNextPage(html, currentPage) {
  // AL pagination link uses path /page/N+1/
  const next = currentPage + 1;
  return html.includes(`/page/${next}/`);
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
  const out = { apply: false, startPage: 1, endPage: Infinity, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-page') out.startPage = parseInt(args[++i], 10);
    else if (a === '--end-page') out.endPage = parseInt(args[++i], 10);
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      process.stderr.write(
        fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 42).join('\n') + '\n',
      );
      process.exit(0);
    }
  }
  return out;
}

// ── Scrape orchestrator ─────────────────────────────────────────────────────

export async function scrapeAL(opts = {}) {
  const {
    apply = false,
    startPage = 1,
    endPage = Infinity,
    limit = Infinity,
    fetchImpl,
    dbFactory,
  } = opts;

  const allRecords = [];
  let page = startPage;

  while (page <= endPage && allRecords.length < limit) {
    const url = listingUrl(page);
    process.stderr.write(`[albar] GET ${url}\n`);

    let html;
    try {
      html = await fetchHtml(url, fetchImpl);
    } catch (err) {
      process.stderr.write(`[albar] page ${page} fetch failed: ${err.message} — stopping\n`);
      break;
    }

    const pageRecords = parseListingPage(html, url);
    process.stderr.write(`[albar] page ${page}: ${pageRecords.length} named records\n`);
    allRecords.push(...pageRecords);

    if (!hasNextPage(html, page)) {
      process.stderr.write(`[albar] no next page after page ${page} — done\n`);
      break;
    }
    page++;
    if (!fetchImpl) await politeDelay();
  }

  const records = Number.isFinite(limit) ? allRecords.slice(0, limit) : allRecords;
  process.stderr.write(`[albar] collected ${records.length} discipline rows (named only)\n`);
  for (const r of records.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city || '?'}\n`,
    );
  }

  if (!apply) {
    process.stderr.write(`[albar] dry-run — pass --apply to write to DB\n`);
    return { records };
  }
  if (records.length === 0) {
    throw new Error('[albar] no rows parsed — aborting without touching DB');
  }
  const factory = dbFactory || createBulkClient;
  await load(records, factory);
  return { records };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records, dbFactory) {
  const { client, cleanup } = await dbFactory();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_al`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_al`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_al (
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
      CREATE UNLOGGED TABLE public._stg_discipline_al (
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

    // De-dupe attorneys by bar_number (synthetic key — same name+date collapse).
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
      '_stg_attorneys_al',
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
      '_stg_discipline_al',
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
      FROM _stg_attorneys_al
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
      FROM _stg_discipline_al s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insertResult.rowCount}\n`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_al, public._stg_discipline_al`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const OPTS = parseArgs(process.argv);
  scrapeAL({
    apply: OPTS.apply,
    startPage: OPTS.startPage,
    endPage: OPTS.endPage,
    limit: OPTS.limit,
  }).catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
