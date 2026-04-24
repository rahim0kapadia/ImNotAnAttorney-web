// csv-bulk-checked: none-exists — Florida Bar publishes discipline only via monthly HTML news releases at /news-release-category/disciplinary-action/; no CSV, no API, confirmed 2026-04-24.
// Template: scripts/ingest/scrape-calbar-discipline.mjs (CA Bar pattern — listing → per-item scrape → staging + UPSERT)
// Expert: alex-hormozi (value equation — attorney-vetting $47 SKU for FL extension)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Florida Bar Supreme Court Disciplinary Actions scraper.
//
// Source (confirmed 2026-04-24 via WebFetch):
//   Listing:  https://www.floridabar.org/news-release-category/disciplinary-action/[page/N/]
//   Monthly:  https://www.floridabar.org/news-release/disciplinary-action/supreme-court-disciplines-{N}-attorneys-{v}/
//
// FL monthly news articles contain one paragraph per disciplined attorney. FL
// reports do NOT include the attorney's bar number — only name + address.
// We generate a deterministic synthetic bar_number = `fl-name-<md5(name)[:12]>`
// to preserve the (jurisdiction, bar_number) UNIQUE constraint while accepting
// a tiny collision risk on identical names (FL has ~100k attorneys; 48-bit
// hash collision probability is ~ negligible for a 6k-row scrape).
//
// Polite scraping: 1-2s randomized delay between requests. User-Agent
// identifies INAA as a contact address; no email sends from this script.
//
// Usage:
//   node scripts/ingest/scrape-flbar-discipline.mjs                     # dry-run
//   node scripts/ingest/scrape-flbar-discipline.mjs --apply             # write
//   node scripts/ingest/scrape-flbar-discipline.mjs --max-pages 10 --apply
//
// Output: staging tables _stg_attorneys_fl + _stg_discipline_fl populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const LISTING_URL = (page) =>
  page <= 1
    ? 'https://www.floridabar.org/news-release-category/disciplinary-action/'
    : `https://www.floridabar.org/news-release-category/disciplinary-action/page/${page}/`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'FL';

// Discipline type detection — order matters (disbarment before suspension).
const DISCIPLINE_PATTERNS = [
  [/\bdisciplinary\s+revocation/i, 'resignation_with_charges'],
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu\s+of)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bplaced\s+on\s+probation/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\bpublic\s+repro(val|of)/i, 'public_reprimand'],
  [/\badmonish/i, 'admonishment'],
];

function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text.slice(0, 500) };
  }
  return { type: 'unknown', raw: text.slice(0, 500) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, maxPages: 20, maxMonths: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--max-months') out.maxMonths = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 30).join('\n'));
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 1000 + Math.floor(Math.random() * 1500);
  return sleep(ms);
}

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  return resp.text();
}

// ── Listing page: collect monthly report URLs ───────────────────────────────

function extractMonthlyUrlsFromListing(html) {
  // Anchors point to /news-release/disciplinary-action/supreme-court-disciplines-N-attorneys-V/
  const urls = new Set();
  const re = /https?:\/\/www\.floridabar\.org\/news-release\/disciplinary-action\/[a-z0-9-]+\/?/gi;
  for (const match of html.matchAll(re)) {
    urls.add(match[0].replace(/\/$/, '') + '/');
  }
  return [...urls];
}

async function discoverMonthlyUrls() {
  const all = [];
  const seen = new Set();
  for (let p = 1; p <= OPTS.maxPages; p++) {
    const url = LISTING_URL(p);
    console.error(`[list] GET ${url}`);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.error(`[list] page ${p} failed: ${err.message} — stopping`);
      break;
    }
    const urls = extractMonthlyUrlsFromListing(html);
    const fresh = urls.filter((u) => !seen.has(u));
    for (const u of fresh) seen.add(u);
    if (fresh.length === 0) {
      console.error(`[list] page ${p} had 0 new monthly URLs — end of pagination`);
      break;
    }
    console.error(`[list] page ${p}: +${fresh.length} monthly reports (total ${seen.size})`);
    all.push(...fresh);
    await politeDelay();
  }
  return all;
}

// ── Monthly page: parse entries ─────────────────────────────────────────────

// Month-name → MM lookup for effective-date strings like "Sept. 4 court order".
const MONTH_MAP = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
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

function parseArticleTitle(html) {
  // Title is generic ("SUPREME COURT DISCIPLINES 8 ATTORNEYS"). Publication
  // date is embedded elsewhere as plain text. Prefer date meta first, then
  // fall back to any "Month D, YYYY" pattern outside tags.
  const meta = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  if (meta) {
    const iso = meta[1].match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  // Fallback: first "Month D, YYYY" in text content
  const dm = html.match(/>\s*([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\s*</);
  if (dm) {
    const mm = MONTH_MAP[dm[1].toLowerCase().replace(/\./g, '')];
    if (mm) return `${dm[3]}-${mm}-${String(parseInt(dm[2], 10)).padStart(2, '0')}`;
  }
  return null;
}

function extractArticleParagraphs(html) {
  // Find entry-content div, then each <p> inside. Keep tags so <strong> detection works.
  const bodyMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<footer|<aside|<section|$)/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  const paras = [];
  for (const m of bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    paras.push(m[1]);
  }
  return paras;
}

function parseEntry(paraHtml, reportDate, sourceUrl) {
  const text = stripTags(paraHtml);
  if (!text) return null;
  // Must contain at least one discipline keyword.
  if (!/\b(suspended|disbarred|disbarment|public repri|public repro|admonish|resign|revocation|interim suspen|emergency suspen|placed on probation|probation with)\b/i.test(text)) {
    return null;
  }

  // MUST start with leading <strong>Name...</strong> — no fallback (boilerplate
  // disclaimers contain discipline keywords but no leading bold name).
  const strongM = paraHtml.match(/^\s*<strong>\s*([^<,]+?)\s*,?\s*<\/strong>/i);
  if (!strongM) return null;
  let fullName = stripTags(strongM[1]).replace(/,+$/, '').trim();
  if (!fullName) return null;
  if (fullName.length > 120) return null; // obvious garbage
  // Heuristic: name must be Title Case (every word starts uppercase).
  if (!/^[A-Z][a-zA-Z.'-]*(?:\s+[A-Z][a-zA-Z.'-]*)+/.test(fullName)) return null;
  // Blocklist common non-attorney strong-bold text.
  if (/\b(supreme court|florida bar|news release|disciplinary action|case no|following a|click here|court orders|court order)\b/i.test(fullName)) return null;

  // Effective date: "effective <date>" or "following a <month> <day> court order"
  let effectiveDate = null;
  const effM =
    text.match(/effective\s+(\w{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i) ||
    text.match(/effective\s+(?:immediately|30 days|one month)?\s*(?:following|after)\s+(?:an?\s+)?(\w{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i) ||
    text.match(/(\w{3,9})\.?\s+(\d{1,2})\s+court order/i);
  if (effM) {
    const monKey = effM[1].toLowerCase().replace(/\./g, '');
    const mm = MONTH_MAP[monKey];
    const dd = parseInt(effM[2], 10);
    let yyyy = effM[3] ? parseInt(effM[3], 10) : null;
    if (mm && dd >= 1 && dd <= 31) {
      if (!yyyy && reportDate) {
        // Use report year; fix up December/January edge if month > reportMonth.
        const [ry, rm] = reportDate.split('-').map((x) => parseInt(x, 10));
        yyyy = ry;
        if (parseInt(mm, 10) > rm + 1) yyyy -= 1;
      }
      if (yyyy) effectiveDate = `${yyyy}-${mm}-${String(dd).padStart(2, '0')}`;
    }
  }

  // City extraction: text between first comma-group and discipline keyword
  // Address pattern: "Name, [address parts,] City, <discipline>"
  // The city usually sits just before the first discipline keyword.
  const discRe = /\b(suspended|disbarred|disbarment|public repri|public repro|admonished|resigned|resignation|disciplinary revocation|interim suspen|emergency suspen|placed on probation|probation with)\b/i;
  let city = null;
  const cityMatch = text.match(/,\s*([A-Z][A-Za-z. ]{1,30}?),\s*(?:[A-Z]{2},\s*)?(?:suspended|disbarred|public repri|public repro|admonished|disciplinary revocation|interim|emergency|placed on probation|resignation)/i);
  if (cityMatch) city = cityMatch[1].trim();

  // Admission year (optional): "(Admitted to Practice: YYYY)"
  const admM = text.match(/Admitted\s+to\s+Practice:?\s+(\d{4})/i);
  const admissionDate = admM ? `${admM[1]}-01-01` : null;

  // Violation summary: text after the last sentence-ending "." before the last paragraph or up to "(Case No."
  const caseNoIdx = text.search(/\(Case No\.|case number/i);
  const summary = (caseNoIdx > 0 ? text.slice(0, caseNoIdx) : text).slice(0, 2000);

  const { type, raw } = normalizeDiscipline(text);
  if (type === 'unknown') return null;

  // Synthetic bar_number from normalized name (deterministic, idempotent).
  const nameNorm = fullName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const barNumber = 'fl-name-' + crypto.createHash('md5').update(nameNorm).digest('hex').slice(0, 12);

  const orderDate = effectiveDate || reportDate || null;

  return {
    bar_number: barNumber,
    full_name: fullName,
    city,
    admission_date: admissionDate,
    effective_date: effectiveDate,
    order_date: orderDate,
    discipline_type: type,
    discipline_raw: raw,
    violation_summary: summary,
    order_url: null,
    source_url: sourceUrl,
  };
}

async function scrapeMonthly(url) {
  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.error(`[month] ${url} — ${err.message}`);
    return [];
  }
  const reportDate = parseArticleTitle(html);
  const paras = extractArticleParagraphs(html);
  const records = [];
  for (const p of paras) {
    const rec = parseEntry(p, reportDate, url);
    if (rec) records.push(rec);
  }
  console.error(`[month] ${url} — ${records.length} entries (reportDate=${reportDate || '?'})`);
  return records;
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_fl`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_fl`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_fl (
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
      CREATE UNLOGGED TABLE public._stg_discipline_fl (
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

    // De-dupe attorneys by bar_number (synthetic from name) before COPY.
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const clean = r.full_name.replace(/\s+/g, ' ').trim();
        const parts = clean.split(' ');
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : null;
        const last = parts[parts.length - 1];
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: r.admission_date,
          current_status: null,
          city: r.city,
          source_url: r.source_url,
        });
      } else {
        // Preserve earliest admission_date / any city we know.
        const prev = byBar.get(r.bar_number);
        if (!prev.admission_date && r.admission_date) prev.admission_date = r.admission_date;
        if (!prev.city && r.city) prev.city = r.city;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_fl',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_fl',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_fl
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        admission_date = COALESCE(EXCLUDED.admission_date, public.attorneys.admission_date),
        city           = COALESCE(EXCLUDED.city, public.attorneys.city),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW()
      RETURNING id, bar_number;
    `);
    console.error(`[db] attorneys upserted: ${upsertAttorneys.rowCount}`);

    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_fl s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_fl, public._stg_discipline_fl`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[flbar] start — apply=${OPTS.apply} maxPages=${OPTS.maxPages} maxMonths=${OPTS.maxMonths}`);

  const monthlyUrls = await discoverMonthlyUrls();
  console.error(`[flbar] discovered ${monthlyUrls.length} monthly reports`);

  const records = [];
  let processed = 0;
  for (const url of monthlyUrls) {
    if (processed >= OPTS.maxMonths) break;
    const r = await scrapeMonthly(url);
    records.push(...r);
    processed++;
    await politeDelay();
  }

  console.error(`[flbar] collected ${records.length} discipline rows from ${processed} monthly reports`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.effective_date || r.order_date || '?'}) — ${r.city || '?'}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[flbar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[flbar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[flbar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
