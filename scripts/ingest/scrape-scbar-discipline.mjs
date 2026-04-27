// csv-bulk-checked: https://www.sccourts.org/opinions-orders/opinions/published-opinions/supreme-court/
// Template: scripts/ingest/scrape-tnbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// South Carolina Supreme Court — attorney-discipline opinions scraper.
//
// Source (confirmed live 2026-04-27 via WebFetch + raw HTML probe):
//   Listing: https://www.sccourts.org/opinions-orders/opinions/published-opinions/supreme-court/
//   Filter:  ?term=YYYY-MM (returns all SC Supreme Court opinions for that month)
//   PDF URL: https://www.sccourts.org/media/opinions/HTMLFiles/SC/{NNNNN}.pdf
//
// SC publishes ALL Supreme Court opinions monthly. Attorney-discipline
// matters are identified by:
//   <span class="case-name teal-text">In the Matter of {Name}</span>
//   <p>In this attorney disciplinary matter, the Court imposes a {Type}.</p>
//
// Date heading is the H3 immediately preceding the accordion-item:
//   <h3 class="small-title white-text mb-0">{Month Day, Year}</h3>
//
// Bar numbers: SC opinions don't expose bar numbers in the listing.
//   Deterministic synthetic key: SC:<sha1(full_name|order_date)[:8]>
//
// Polite scraping: 800–1600 ms randomized delay. User-Agent identifies INAA.
//
// Usage:
//   node scripts/ingest/scrape-scbar-discipline.mjs                   # dry-run (5 yrs)
//   node scripts/ingest/scrape-scbar-discipline.mjs --apply
//   node scripts/ingest/scrape-scbar-discipline.mjs --start 2024-01 --end 2024-12
//   node scripts/ingest/scrape-scbar-discipline.mjs --limit 30
//   node scripts/ingest/scrape-scbar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_sc + _stg_discipline_sc populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.sccourts.org';
const LISTING_PATH = '/opinions-orders/opinions/published-opinions/supreme-court/';

function listingUrl(yyyyMm) {
  return `${BASE_URL}${LISTING_PATH}?term=${yyyyMm}`;
}

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'SC';

// ── Discipline type mapping ─────────────────────────────────────────────────
// SC opinion summaries use phrases like "definite suspension", "public
// reprimand", "disbarment", "transfer to incapacity inactive status".

const DISCIPLINE_PATTERNS = [
  [/incapacity\s+inactive|disability\s+inactive/i, 'disability_inactive'],
  [/disbar/i,                                      'disbarment'],
  [/voluntary\s+surrender/i,                       'resignation_with_charges'],
  [/interim\s+suspen/i,                            'interim_suspension'],
  [/(definite|indefinite)\s+suspen|suspen/i,       'suspension'],
  [/public\s+reprimand/i,                          'public_reprimand'],
  [/letter\s+of\s+caution|admonition|admoniti/i,   'admonition'],
  [/censure/i,                                     'censure'],
];

export function normalizeDiscipline(summary) {
  if (!summary) return null;
  const s = summary.trim();
  if (/\breinstate\w*/i.test(s)) return null; // reinstatements skipped
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(s)) return type;
  }
  return null;
}

// ── Date parsing ────────────────────────────────────────────────────────────

const MONTH_TO_NUM = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Parse "April 22, 2026" → "2026-04-22". Returns null on failure.
 */
export function parseDate(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const [, mon, dd, yyyy] = m;
  const mo = MONTH_TO_NUM[mon.toLowerCase()];
  if (!mo) return null;
  const dy = parseInt(dd, 10);
  if (dy < 1 || dy > 31) return null;
  return `${yyyy}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
}

// ── HTML utilities ──────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Name extraction from "In the Matter of ..." ─────────────────────────────

/**
 * Extract attorney name from a SC discipline case caption.
 * Captions verified live 2026-04-27:
 *   "In the Matter of MaRhonda Shatoya Smith"
 *   "In the Matter of David J. Miller"
 *   "In the Matter of Travis W. White"
 *
 * Some captions add ", Respondent." — we strip that.
 *
 * Returns { fullName, firstName, lastName } or null.
 */
export function extractAttorneyFromCaption(caption) {
  if (!caption) return null;
  const m = caption.match(/^In the Matter of\s+(.+?)(?:,\s+Respondent\.?\s*)?$/i);
  if (!m) return null;
  const fullName = m[1].trim();
  if (!fullName || fullName.length < 2 || fullName.length > 150) return null;
  // Skip "Anonymous Member" / "Anonymous Mediator" — anonymized cases
  if (/^anonymous/i.test(fullName)) return null;
  return { fullName, ...splitName(fullName) };
}

function splitName(fullName) {
  const cleaned = fullName.replace(/,\s*(Jr|Sr|II|III|IV)\.?$/i, ' $1');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: null, lastName: cleaned };
  const lastTok = parts[parts.length - 1];
  const isSuffix = /^(Jr|Sr|II|III|IV)$/i.test(lastTok);
  const lastName = isSuffix ? parts.slice(-2).join(' ') : lastTok;
  const lastIdx = parts.length - (isSuffix ? 2 : 1);
  const firstName = parts.slice(0, lastIdx).join(' ');
  return { firstName: firstName || null, lastName };
}

// ── Synthetic bar number ────────────────────────────────────────────────────

export function deterministicBarNumber(fullName, orderDate) {
  const key = (fullName + '|' + orderDate).toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return `SC:${hash.slice(0, 8)}`;
}

// ── Page parsing ────────────────────────────────────────────────────────────

/**
 * Parse one month's listing page.
 *
 * Page structure (verified live 2026-04-27):
 *   <h3 class="small-title white-text mb-0">{Month Day, Year}</h3>
 *   <div class="accordion-item case-result">
 *     <button class="result-title" ...>
 *       <span class="case-number teal-text">{Opinion#}</span>
 *       <span class="case-name teal-text">{Caption}</span>
 *     </button>
 *     <div class="result-info ..."><p>{Summary}</p></div>
 *     <p><a href=".../HTMLFiles/SC/{N}.pdf" ... class="download-link">...</a></p>
 *   </div>
 *
 * Date headings act as scope for all subsequent .accordion-item rows until
 * the next H3 heading. We segment the HTML at H3 boundaries, then within
 * each segment iterate accordion-items.
 */
export function parseListingPage(html, sourceUrl) {
  const records = [];

  // Split at date headings.
  const dateHeadingRe = /<h3\s+class="small-title\s+white-text\s+mb-0">([^<]+)<\/h3>/g;
  const segments = [];
  let lastIdx = 0;
  let lastDate = null;
  let m;
  while ((m = dateHeadingRe.exec(html)) !== null) {
    if (lastDate !== null) {
      segments.push({ date: lastDate, html: html.slice(lastIdx, m.index) });
    }
    lastDate = parseDate(stripTags(m[1]));
    lastIdx = m.index + m[0].length;
  }
  if (lastDate !== null) {
    segments.push({ date: lastDate, html: html.slice(lastIdx) });
  }

  for (const seg of segments) {
    if (!seg.date) continue;
    // Each accordion-item starts with <div class="accordion-item case-result">.
    // Use the next .accordion-item or the segment end as the slice boundary
    // (avoids fragile balanced-tag matching).
    const starts = [];
    const startRe = /<div\s+class="accordion-item\s+case-result"[^>]*>/g;
    let sm;
    while ((sm = startRe.exec(seg.html)) !== null) {
      starts.push({ from: sm.index, after: sm.index + sm[0].length });
    }
    for (let i = 0; i < starts.length; i++) {
      const next = i + 1 < starts.length ? starts[i + 1].from : seg.html.length;
      const itemHtml = seg.html.slice(starts[i].after, next);
      const captionMatch = itemHtml.match(/<span\s+class="case-name\s+teal-text">([\s\S]*?)<\/span>/);
      const summaryMatch = itemHtml.match(/<div\s+class="result-info[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/);
      const pdfMatch = itemHtml.match(/<a\s+href="([^"]+\.pdf)"[^>]*class="download-link"/);
      const opNumMatch = itemHtml.match(/<span\s+class="case-number\s+teal-text">([\s\S]*?)<\/span>/);

      const caption = captionMatch ? stripTags(captionMatch[1]) : null;
      const summary = summaryMatch ? stripTags(summaryMatch[1]) : null;
      const pdfUrl = pdfMatch ? pdfMatch[1] : null;
      const opinionNumber = opNumMatch ? stripTags(opNumMatch[1]) : null;

      // Filter: must be discipline matter
      if (!caption || !/^In the Matter of\b/i.test(caption)) continue;
      if (!summary || !/attorney\s+disciplinary\s+matter/i.test(summary)) continue;

      const attorney = extractAttorneyFromCaption(caption);
      if (!attorney) continue; // anonymized

      const disciplineType = normalizeDiscipline(summary);
      if (!disciplineType) continue;

      const barNumber = deterministicBarNumber(attorney.fullName, seg.date);

      records.push({
        bar_number: barNumber,
        full_name: attorney.fullName,
        first_name: attorney.firstName,
        last_name: attorney.lastName,
        city: null,
        order_date: seg.date,
        effective_date: seg.date,
        discipline_type: disciplineType,
        discipline_raw: (opinionNumber ? `Op. ${opinionNumber}: ` : '') + summary.slice(0, 500 - 32),
        violation_summary: summary.slice(0, 500),
        order_url: pdfUrl || null,
        source_url: sourceUrl,
      });
    }
  }

  return records;
}

// ── Month iteration ─────────────────────────────────────────────────────────

/** Yield YYYY-MM strings between start (inclusive) and end (inclusive). */
export function* monthsBetween(startYm, endYm) {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  let y = sy;
  let mo = sm;
  while (y < ey || (y === ey && mo <= em)) {
    yield `${y}-${String(mo).padStart(2, '0')}`;
    mo++;
    if (mo > 12) { mo = 1; y++; }
  }
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

function defaultStartEnd() {
  // Default: current month and 5 years back to capture meaningful history.
  const now = new Date();
  const end = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const startYear = now.getUTCFullYear() - 5;
  const start = `${startYear}-01`;
  return { start, end };
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const def = defaultStartEnd();
  const out = { apply: false, start: def.start, end: def.end, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start') out.start = args[++i];
    else if (a === '--end') out.end = args[++i];
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      process.stderr.write(
        fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 32).join('\n') + '\n',
      );
      process.exit(0);
    }
  }
  return out;
}

// ── Scrape orchestrator ─────────────────────────────────────────────────────

export async function scrapeSC(opts = {}) {
  const def = defaultStartEnd();
  const {
    apply = false,
    start = def.start,
    end = def.end,
    limit = Infinity,
    fetchImpl,
    dbFactory,
  } = opts;

  const allRecords = [];
  for (const ym of monthsBetween(start, end)) {
    if (allRecords.length >= limit) break;
    const url = listingUrl(ym);
    process.stderr.write(`[scbar] GET ${url}\n`);

    let html;
    try {
      html = await fetchHtml(url, fetchImpl);
    } catch (err) {
      process.stderr.write(`[scbar] ${ym} fetch failed: ${err.message} — skipping\n`);
      continue;
    }

    const monthRecords = parseListingPage(html, url);
    if (monthRecords.length > 0) {
      process.stderr.write(`[scbar] ${ym}: ${monthRecords.length} discipline opinions\n`);
    }
    allRecords.push(...monthRecords);

    if (!fetchImpl) await politeDelay();
  }

  const records = Number.isFinite(limit) ? allRecords.slice(0, limit) : allRecords;
  process.stderr.write(`[scbar] collected ${records.length} discipline opinions\n`);
  for (const r of records.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date})\n`,
    );
  }

  if (!apply) {
    process.stderr.write(`[scbar] dry-run — pass --apply to write to DB\n`);
    return { records };
  }
  if (records.length === 0) {
    throw new Error('[scbar] no rows parsed — aborting without touching DB');
  }
  const factory = dbFactory || createBulkClient;
  await load(records, factory);
  return { records };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records, dbFactory) {
  const { client, cleanup } = await dbFactory();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_sc`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_sc`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_sc (
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
      CREATE UNLOGGED TABLE public._stg_discipline_sc (
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
      '_stg_attorneys_sc',
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
      '_stg_discipline_sc',
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
      FROM _stg_attorneys_sc
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
      FROM _stg_discipline_sc s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insertResult.rowCount}\n`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_sc, public._stg_discipline_sc`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const OPTS = parseArgs(process.argv);
  scrapeSC({
    apply: OPTS.apply,
    start: OPTS.start,
    end: OPTS.end,
    limit: OPTS.limit,
  }).catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
