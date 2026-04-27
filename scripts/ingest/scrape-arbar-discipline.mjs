// csv-bulk-checked: https://www.arcourts.gov/professional-conduct/opinions — Arkansas Judiciary Drupal Views table publishes attorney-discipline opinions paginated 19 pages × ~50 rows ≈ 950 entries (verified 2026-04-27); detail pages expose structured field--name-field-bar-number + given-name + last-name + city + state + zip + date-filed + disciplinary-type + PDF attachment. CL court=ark returns only ~58 results (mostly unrelated). Drupal HTML is the bulk surface.
// Template: scripts/ingest/scrape-mobar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Arkansas Office of Professional Conduct attorney-discipline scraper.
//
// Source discovery (probed live 2026-04-27):
//   Index: https://www.arcourts.gov/professional-conduct/opinions  (canonical)
//   Note: /administration/professional-conduct/opinions redirects to a
//   different page on plain curl; the canonical URL above (without
//   /administration/) returns the Drupal Views table directly.
//
// Pagination: ?page=N (0-indexed), 50 rows per page, 19 pages (page=0..18).
//
// Per-row fields in index table:
//   <td class="views-field views-field-title"><a href="/administration/professional-conduct/opinions/{slug}">{NUMBER} - {SANCTION}</a></td>
//   <td class="views-field views-field-field-given-name">{Given Name}</td>
//   <td class="views-field views-field-field-city">{City}</td>
//   <td class="views-field views-field-field-state">{ST}</td>
//   <td class="views-field views-field-field-date-filed">{MM/DD/YYYY}</td>
//
// Detail page exposes structured fields:
//   <div class="field field--name-field-bar-number">...{BAR_NUMBER}</div>
//   <div class="field field--name-field-given-name">...{First}</div>
//   <div class="field field--name-field-last-name">...{Last}</div>
//   <div class="field field--name-field-zip-code">...{ZIP}</div>
//   <div class="field field--name-field-attachment">...{PDF URL}</div>
//
// Bar numbers ARE published — no synthesis required. Format
// `bar_number = "AR:<digit-string>"` to namespace alongside other states.
//
// Sanction labels (observed in slugs):
//   caution, consent-caution, reprimand, consent-reprimand, suspension,
//   interim-suspension, modified-interim-suspension, stayed-suspension,
//   probation, reinstatement, initiate-disbarment.
//
// "reinstatement" rows are SKIPPED per existing TN/MO/MN convention (re-
// admission post-discipline is not itself a discipline event).
//
// Polite scraping: 1.0-1.8 s randomized delay between page fetches plus
// 0.6-1.2 s between detail fetches. UA = INAA primary; fallback to browser
// UA if the canonical URL redirects (rare site state).
//
// Usage:
//   node scripts/ingest/scrape-arbar-discipline.mjs                 # dry-run
//   node scripts/ingest/scrape-arbar-discipline.mjs --apply         # write to DB
//   node scripts/ingest/scrape-arbar-discipline.mjs --max-pages 3 --apply
//   node scripts/ingest/scrape-arbar-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Env loader (inline, line-by-line — SEC-W1: no dotenv import) ────────────
{
  const ENV_PATH = 'C:/Users/email/projects/ImNotAnAttorney-web/.env.local';
  const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
  if (fs.existsSync(ENV_PATH)) {
    const txt = fs.readFileSync(ENV_PATH, 'utf-8');
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
      if (!VALID_KEY_RX.test(key)) continue;
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.arcourts.gov';
const LISTING_URL = `${BASE_URL}/professional-conduct/opinions`;
const JURISDICTION = 'AR';

const UA_PRIMARY =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const UA_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)';

// ── Discipline normalization ─────────────────────────────────────────────────

// Order matters — specific before generic. Pulls from BOTH the slug
// (e.g. "consent-caution") AND the visible TYPE label (e.g. "CAUTION").
const DISCIPLINE_PATTERNS = [
  [/\binitiate\s*[- ]?\s*disbar/i,        'disbarment'],
  [/\bdisbar/i,                            'disbarment'],
  [/\binterim\s*[- ]?\s*suspen/i,          'interim_suspension'],
  [/\bmodified\s*[- ]?\s*interim/i,        'interim_suspension'],
  [/\bstayed\s*[- ]?\s*suspen/i,           'suspension'],
  [/\bsuspen/i,                            'suspension'],
  [/\bprobation/i,                         'probation'],
  [/\bconsent\s*[- ]?\s*reprimand/i,       'public_reprimand'],
  [/\breprimand/i,                         'public_reprimand'],
  [/\bconsent\s*[- ]?\s*caution/i,         'admonition'],
  [/\bcaution/i,                           'admonition'],
  [/\bcensure/i,                           'censure'],
  [/\bresign/i,                            'resignation_with_charges'],
  [/\bdisability\s+inactiv/i,              'disability_inactive'],
];

export const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'interim_suspension', 'probation',
  'public_reprimand', 'resignation_with_charges', 'censure',
  'admonition', 'reciprocal_discipline', 'disability_inactive',
]);

export function normalizeDiscipline(slug, label) {
  const combined = `${slug || ''} | ${label || ''}`.toLowerCase();
  if (/reinstate/.test(combined)) return null; // skip reinstatements
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(combined)) return type;
  }
  return 'unknown';
}

// ── Date parsing ─────────────────────────────────────────────────────────────

const SLASH_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function parseDate(text) {
  if (!text) return null;
  const t = text.trim();
  const m = SLASH_DATE_RE.exec(t);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const yr = parseInt(yyyy, 10);
  const mo = parseInt(mm, 10);
  const da = parseInt(dd, 10);
  if (yr < 1990 || yr > 2100) return null;
  if (mo < 1 || mo > 12) return null;
  if (da < 1 || da > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ── HTML parsing helpers ─────────────────────────────────────────────────────

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Pull "Last, First Middle" from a "Given Name" + "Last Name" pair.
export function buildFullName(given, last) {
  const g = (given || '').trim();
  const l = (last || '').trim();
  if (!g && !l) return null;
  const combined = [g, l].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (combined.length < 2) return null;
  return combined;
}

/**
 * Parse one row of the Drupal Views index table. The five <td>s in document
 * order are: title-link / given-name / city / state / date-filed.
 * Returns { slug, opinionNumber, sanctionLabel, givenName, city, state,
 * dateFiled } or null if any required field missing.
 */
export function parseIndexRow(tdGroup) {
  if (!Array.isArray(tdGroup) || tdGroup.length < 5) return null;

  // td[0] — anchor with href + opinion number + sanction label
  const linkMatch = tdGroup[0].match(
    /href="(\/administration\/professional-conduct\/opinions\/([\w-]+))"[^>]*>([^<]+)</i,
  );
  if (!linkMatch) return null;
  const [, hrefPath, slug, linkText] = linkMatch;
  // linkText form: "2025-028 - CONSENT CAUTION" (with hyphen) or
  // "2022-017 SUSPENSION" (no hyphen). Tolerate both.
  const numMatch = linkText.match(/^([0-9]{4}-[0-9]{3})\b/);
  if (!numMatch) return null;
  const opinionNumber = numMatch[1];
  const sanctionLabel = linkText.replace(/^[0-9]{4}-[0-9]{3}\s*-?\s*/, '').trim();

  // td[1..4] — text cells
  const stripCell = (s) =>
    decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const givenName = stripCell(tdGroup[1]);
  const city = stripCell(tdGroup[2]);
  const stateLabel = stripCell(tdGroup[3]);
  const dateFiled = stripCell(tdGroup[4]);

  return {
    slug,
    href: hrefPath,
    opinionNumber,
    sanctionLabel,
    givenName,
    city,
    state: stateLabel,
    dateFiled,
  };
}

/**
 * Walk the HTML for index rows. Each row has 5 <td> tags carrying a
 * `views-field` class. Group every 5 consecutive cells (in document
 * order) into a logical row.
 */
export function extractIndexRows(html) {
  // Capture every <td ... class="views-field views-field-XXX" ...>BODY</td>
  const cellRe = /<td[^>]*class="views-field views-field-[\w-]+"[^>]*>([\s\S]*?)<\/td>/gi;
  const cells = [];
  let m;
  while ((m = cellRe.exec(html)) !== null) {
    cells.push(m[0]); // keep full opening tag — we need the first cell's class hints + the anchor href
  }
  const rows = [];
  for (let i = 0; i + 4 < cells.length; i += 5) {
    const row = parseIndexRow(cells.slice(i, i + 5));
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Pull structured fields from a detail page. Field markers:
 *   <div class="field field--name-field-bar-number ..."><div class="field--label">...</div><div class="field--item">VALUE</div></div>
 * Returns { barNumber, dateFiled, caseNumber, disciplinaryType, givenName,
 * lastName, city, state, zipCode, pdfUrl }. Missing fields → null.
 */
export function parseDetailPage(html) {
  const fieldRe = (name) =>
    new RegExp(
      `<div class="field field--name-field-${name}[^"]*"[^>]*>[\\s\\S]*?<div class="field--item"[^>]*>([\\s\\S]*?)</div>`,
      'i',
    );
  const grab = (n) => {
    const re = fieldRe(n);
    const m = html.match(re);
    if (!m) return null;
    return decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  };

  // PDF: nested anchor inside field--item
  const pdfMatch = html.match(
    /class="field field--name-field-attachment[^"]*"[\s\S]*?href="(https?:\/\/[^"]+\.pdf)"/i,
  );
  let pdfUrl = pdfMatch ? pdfMatch[1] : null;
  if (pdfUrl && pdfUrl.startsWith('http://')) pdfUrl = 'https://' + pdfUrl.slice(7);

  // date-filed has a <time datetime="..."> attribute
  let dateFiled = null;
  const timeMatch = html.match(
    /class="field field--name-field-date-filed[^"]*"[\s\S]*?<time datetime="(\d{4}-\d{2}-\d{2})/i,
  );
  if (timeMatch) dateFiled = timeMatch[1];

  // disciplinary-type is the visible label; case-number is the field--item text
  const disciplinaryType = grab('disciplinary-type');
  const caseNumber = grab('case-number');
  const givenName = grab('given-name');
  const lastName = grab('last-name');
  const city = grab('city');
  const state = grab('state');
  const zipCode = grab('zip-code');
  const barNumber = grab('bar-number');

  return {
    barNumber,
    dateFiled,
    caseNumber,
    disciplinaryType,
    givenName,
    lastName,
    city,
    state,
    zipCode,
    pdfUrl,
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay(min = 1000, max = 1800) {
  const ms = min + Math.floor(Math.random() * (max - min));
  return sleep(ms);
}

async function fetchHtml(url, attempt = 1) {
  const ua = attempt === 1 ? UA_PRIMARY : UA_FALLBACK;
  const headers = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const resp = await fetch(url, { headers, redirect: 'follow' });
  if (resp.status === 429 || resp.status === 503) {
    if (attempt > 5) throw new Error(`HTTP ${resp.status} after ${attempt} retries — ${url}`);
    const ms = Math.min(60000, 1500 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 1500);
    console.error(`[ar] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchHtml(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.text();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    maxPages: 25, // 19 pages × 50 rows = ~950; cap with safety margin
    delayMin: 1000,
    delayMax: 1800,
    skipDetail: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--delay-min') out.delayMin = parseInt(args[++i], 10);
    else if (a === '--delay-max') out.delayMax = parseInt(args[++i], 10);
    else if (a === '--skip-detail') out.skipDetail = true;
    else if (a === '--help' || a === '-h') {
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 60).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Discovery ────────────────────────────────────────────────────────────────

async function discoverIndex() {
  const seen = new Set();
  const rows = [];
  for (let page = 0; page < OPTS.maxPages; page++) {
    const url = page === 0 ? LISTING_URL : `${LISTING_URL}?page=${page}`;
    console.error(`[ar] fetching index page ${page} — ${url}`);
    const html = await fetchHtml(url);
    const pageRows = extractIndexRows(html);
    if (pageRows.length === 0) {
      console.error(`[ar] page ${page}: 0 rows — stopping pagination`);
      break;
    }
    let added = 0;
    for (const r of pageRows) {
      if (seen.has(r.slug)) continue;
      seen.add(r.slug);
      rows.push(r);
      added++;
    }
    console.error(`[ar] page ${page}: ${pageRows.length} rows (${added} new)`);
    if (added === 0) break; // cycle
    await politeDelay(OPTS.delayMin, OPTS.delayMax);
  }
  return rows;
}

async function enrichWithDetail(indexRow) {
  const url = `${BASE_URL}${indexRow.href}`;
  const html = await fetchHtml(url);
  const detail = parseDetailPage(html);
  return { url, detail };
}

// ── Build records ────────────────────────────────────────────────────────────

export function buildRecord(indexRow, detailUrl, detail) {
  const sanctionType = normalizeDiscipline(indexRow.slug, indexRow.sanctionLabel);
  if (!sanctionType) return null; // reinstatements skipped
  if (!ALLOWED_DISCIPLINE_TYPES.has(sanctionType)) return null;

  // Prefer detail-page bar number; fall back to deterministic synthesis if
  // the detail page is unreachable (shouldn't happen in practice for AR).
  let barNumber = null;
  if (detail && detail.barNumber && /^\d{4,8}$/.test(detail.barNumber.replace(/\D/g, ''))) {
    barNumber = `AR:${detail.barNumber.replace(/\D/g, '')}`;
  } else {
    barNumber = `AR:${indexRow.opinionNumber}`;
  }

  const fullName = (detail && buildFullName(detail.givenName, detail.lastName)) ||
    buildFullName(indexRow.givenName, '') || indexRow.givenName;
  if (!fullName) return null;

  const orderDate = (detail && detail.dateFiled && /^\d{4}-\d{2}-\d{2}$/.test(detail.dateFiled))
    ? detail.dateFiled
    : parseDate(indexRow.dateFiled);
  if (!orderDate) return null;

  // Force HTTPS source URL (AR detail pages publish PDFs on http://).
  let sourceUrl = LISTING_URL;
  let orderUrl = detailUrl || sourceUrl;
  if (orderUrl.startsWith('http://')) orderUrl = 'https://' + orderUrl.slice(7);
  const pdfUrl = (detail && detail.pdfUrl) ? detail.pdfUrl : null;

  const violationSummary = [
    `Opinion ${indexRow.opinionNumber}`,
    indexRow.sanctionLabel || (detail && detail.disciplinaryType) || '',
    detail && detail.city ? `${detail.city}, ${detail.state || ''}`.trim() : '',
  ].filter(Boolean).join(' — ').slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    first_name: detail && detail.givenName ? detail.givenName : null,
    last_name: detail && detail.lastName ? detail.lastName : null,
    city: detail && detail.city ? detail.city : null,
    order_date: orderDate,
    effective_date: null,
    discipline_type: sanctionType,
    discipline_raw: (indexRow.sanctionLabel || (detail && detail.disciplinaryType) || '').slice(0, 500),
    violation_summary: violationSummary,
    order_url: pdfUrl || orderUrl, // prefer PDF when present
    source_url: orderUrl,           // canonical detail page (https)
  };
}

// ── DB load ──────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ar`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ar`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ar (
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
      CREATE UNLOGGED TABLE public._stg_discipline_ar (
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
      '_stg_attorneys_ar',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name,
      r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw,
      r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_ar',
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
      FROM _stg_attorneys_ar
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        city           = COALESCE(EXCLUDED.city, public.attorneys.city),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW();
    `);
    console.error(`[db] attorneys upserted: ${upsertAttorneys.rowCount}`);

    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name,
             s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw,
             s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_ar s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ar, public._stg_discipline_ar`);
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[arbar] start — apply=${OPTS.apply} maxPages=${OPTS.maxPages} skipDetail=${OPTS.skipDetail}`);

  const indexRows = await discoverIndex();
  console.error(`[arbar] index complete — ${indexRows.length} unique rows`);

  const records = [];
  for (let i = 0; i < indexRows.length; i++) {
    const indexRow = indexRows[i];
    let detailUrl = `${BASE_URL}${indexRow.href}`;
    let detail = null;
    if (!OPTS.skipDetail) {
      try {
        const r = await enrichWithDetail(indexRow);
        detailUrl = r.url;
        detail = r.detail;
      } catch (e) {
        console.error(`[arbar] detail-fetch failed for ${indexRow.slug}: ${e.message}`);
      }
      await politeDelay(600, 1200);
    }
    const rec = buildRecord(indexRow, detailUrl, detail);
    if (rec) records.push(rec);
    if ((i + 1) % 25 === 0) {
      console.error(`[arbar] enriched ${i + 1}/${indexRows.length}`);
    }
  }

  console.error(`[arbar] collected ${records.length} discipline rows`);
  console.error('[arbar] first 3 rows:');
  for (const r of records.slice(0, 3)) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type} (${r.order_date}) — ${r.source_url}`,
    );
  }

  if (!OPTS.apply) {
    console.error('[arbar] dry-run — pass --apply to write to DB');
    return;
  }
  if (records.length === 0) {
    console.error('[arbar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[arbar] done');
}

// Only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
