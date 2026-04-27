// csv-bulk-checked: https://www.courts.mo.gov/page.jsp?id=109856
// Template: scripts/ingest/scrape-tnbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Missouri Supreme Court — public attorney discipline scraper.
//
// Source (confirmed live 2026-04-26 via curl with browser UA):
//   Listing: https://www.courts.mo.gov/page.jsp?id=109856
//   Coverage: 1,379+ orders since 2006-01-01 — single page, no pagination.
//
// Live DOM structure (verified by Read of fetched HTML):
//   <tr>
//     <td>MM-DD-YYYY</td>
//     <td><a href="/page.jsp?id=NNNN" target="_blank">Lastname, First [Middle] [Suffix] - Discipline Label</a></td>
//     <td>Ethics - Category</td>
//   </tr>
//
// Detail pages (e.g. /page.jsp?id=108481) are 403-blocked from non-browser
// User-Agents, so order_url is recorded but contents are not fetched.
// source_url = the listing page (HTTPS, public, no auth).
//
// MO does NOT publish bar numbers in the listing. We synthesize a deterministic
// key: "MO:<sha1(name|order_date)::8>". Same pattern as MD scraper.
//
// "Reinstatement" rows are skipped per existing TN/MN convention.
//
// Usage:
//   node scripts/ingest/scrape-mobar-discipline.mjs               # dry-run
//   node scripts/ingest/scrape-mobar-discipline.mjs --apply       # write to DB
//   node scripts/ingest/scrape-mobar-discipline.mjs --limit 20

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.courts.mo.gov';
const LISTING_URL = `${BASE_URL}/page.jsp?id=109856`;
const JURISDICTION = 'MO';

const UA_PRIMARY =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const UA_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)';

// ── Discipline normalization ─────────────────────────────────────────────────

const DISCIPLINE_PATTERNS = [
  [/\bdisabilit\w+\s+inactive/i,           'disability_inactive'],
  [/\breciprocal\b/i,                       'reciprocal_discipline'],
  [/\binterim\s+suspen/i,                   'interim_suspension'],
  [/\bemergency\s+suspen/i,                 'interim_suspension'],
  [/\btemporary\s+suspen/i,                 'interim_suspension'],
  [/\bdisbar/i,                             'disbarment'],
  [/\bresign\w*\s+(?:with|in\s+lieu)/i,     'resignation_with_charges'],
  [/\bsuspen/i,                             'suspension'],
  [/\bprobation\b/i,                        'probation'],
  [/\bpublic\s+reprimand\b/i,               'public_reprimand'],
  [/\breprimand\b/i,                        'public_reprimand'],
  [/\bcensure\b/i,                          'censure'],
  [/\badmonition\b/i,                       'admonition'],
  [/\badmonish/i,                           'admonition'],
  [/\bremoval\b/i,                          'disbarment'],
  [/\bcontempt\b/i,                         'unknown'],
];

export function normalizeDiscipline(linkLabel, categoryLabel) {
  const combined = `${linkLabel || ''} | ${categoryLabel || ''}`.toLowerCase();
  if (/\breinstate/i.test(combined)) return null;
  if (/\bno\s+discipline\s+imposed/i.test(combined)) return null;
  if (/\btermination\s+of\s+probation/i.test(combined)) return null;

  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(combined)) return type;
  }
  return 'unknown';
}

// ── Date parsing ─────────────────────────────────────────────────────────────

const DATE_DASH_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

export function parseDate(text) {
  if (!text) return null;
  const t = text.trim();
  const m = DATE_DASH_RE.exec(t);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const yr = parseInt(yyyy, 10);
  const mo = parseInt(mm, 10);
  const da = parseInt(dd, 10);
  if (yr < 2000 || yr > 2100) return null;
  if (mo < 1 || mo > 12) return null;
  if (da < 1 || da > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ── Name parsing ─────────────────────────────────────────────────────────────

const SUFFIX_RE = /^(Jr\.?|Sr\.?|II|III|IV|V|Esq\.?)$/i;

/**
 * Parse "Lastname, First [Middle] [, Suffix]" → "First [Middle] Last [Suffix]"
 * Examples:
 *   "Bert, Michael"                    → "Michael Bert"
 *   "Leggat Jr., Robert B."            → "Robert B. Leggat Jr."
 *   "Vogelman, Henry Joseph"           → "Henry Joseph Vogelman"
 *   "O'Laughlin, Frederick J."         → "Frederick J. O'Laughlin"
 */
export function parseMoName(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3 || cleaned.length > 200) return null;

  const idx = cleaned.indexOf(',');
  if (idx <= 0) return null;
  const lastPart = cleaned.slice(0, idx).trim();
  const givenPart = cleaned.slice(idx + 1).trim().replace(/,+$/, '');
  if (!lastPart || !givenPart) return null;

  let trailingSuffix = null;
  const givenTokens = givenPart.split(/\s+/);
  if (givenTokens.length > 0 && SUFFIX_RE.test(givenTokens[givenTokens.length - 1].replace(/,+$/, ''))) {
    trailingSuffix = givenTokens.pop().replace(/,+$/, '');
  }
  const givenClean = givenTokens.join(' ').replace(/,+$/, '').trim();
  if (!givenClean) return null;

  const parts = [givenClean, lastPart];
  if (trailingSuffix) parts.push(trailingSuffix);
  const full = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (full.length < 4 || full.length > 200) return null;
  return full;
}

// ── Synthetic bar number ─────────────────────────────────────────────────────

export function syntheticBarNumber(fullName, orderDate) {
  const input = `${fullName.trim().toLowerCase()}|${orderDate}`;
  const hash = crypto.createHash('sha1').update(input, 'utf8').digest('hex');
  return `MO:${hash.slice(0, 8)}`;
}

// ── Row extraction ───────────────────────────────────────────────────────────

export function extractRows(html) {
  if (!html) return [];

  const rowChunks = html.split(/<tr[^>]*>/i).slice(1);

  const records = [];
  const seen = new Set();

  for (const chunk of rowChunks) {
    const rowEnd = chunk.search(/<\/tr>/i);
    const row = rowEnd >= 0 ? chunk.slice(0, rowEnd) : chunk;

    const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cellMatches.length < 3) continue;

    const dateText = stripTags(cellMatches[0][1]).trim();
    const linkCell = cellMatches[1][1];
    const categoryText = stripTags(cellMatches[2][1]).trim();

    const anchorMatch = linkCell.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;
    const orderHref = anchorMatch[1].trim();
    const anchorText = stripTags(anchorMatch[2]).trim();

    const dashIdx = anchorText.search(/\s+[-–—]\s+/);
    if (dashIdx < 0) continue;
    const namePart = anchorText.slice(0, dashIdx).trim();
    const labelPart = anchorText.slice(dashIdx).replace(/^\s*[-–—]\s+/, '').trim();

    const orderDate = parseDate(dateText);
    if (!orderDate) continue;

    const fullName = parseMoName(namePart);
    if (!fullName) continue;

    const disciplineType = normalizeDiscipline(labelPart, categoryText);
    if (!disciplineType) continue;

    const barNumber = syntheticBarNumber(fullName, orderDate);

    const orderUrl = orderHref.startsWith('http')
      ? orderHref
      : `${BASE_URL}${orderHref.startsWith('/') ? '' : '/'}${orderHref}`;

    const dedupeKey = `${barNumber}|${orderDate}|${disciplineType}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    records.push({
      bar_number:        barNumber,
      full_name:         fullName,
      order_date:        orderDate,
      effective_date:    orderDate,
      discipline_type:   disciplineType,
      discipline_raw:    labelPart.slice(0, 500),
      violation_summary: `${labelPart} (${categoryText})`.slice(0, 2000),
      order_url:         orderUrl,
      source_url:        LISTING_URL,
    });
  }

  return records;
}

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

// www.courts.mo.gov gates non-browser User-Agents intermittently. We rotate
// UA + add browser-like Accept / Accept-Language / Referer + exponential
// backoff. 403 is the typical block response; retry with longer delay.
async function fetchListing() {
  const headersFor = (ua) => ({
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.courts.mo.gov/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  });

  const uaList = [UA_FALLBACK, UA_PRIMARY]; // browser UA first — site prefers it
  let attempt = 0;
  for (const ua of uaList) {
    for (const _ of [0, 1, 2]) {
      attempt += 1;
      const wait = Math.min(2000 * attempt, 8000);
      try {
        if (attempt > 1) await new Promise((r) => setTimeout(r, wait));
        const resp = await fetch(LISTING_URL, { headers: headersFor(ua) });
        if (!resp.ok) {
          process.stderr.write(`[mo] HTTP ${resp.status} attempt=${attempt} ua=${ua.slice(0, 30)}\n`);
          continue;
        }
        const html = await resp.text();
        process.stderr.write(`[mo] fetched ${html.length} bytes attempt=${attempt} ua=${ua.slice(0, 30)}\n`);
        return html;
      } catch (err) {
        process.stderr.write(`[mo] fetch error attempt=${attempt}: ${err.message}\n`);
      }
    }
  }
  throw new Error('All UA fallbacks failed for MO listing');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, limit: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply')      out.apply = true;
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 35);
      process.stdout.write(lines.join('\n') + '\n');
      process.exit(0);
    }
  }
  return out;
}

// ── DB load ──────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mo`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_mo`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_mo (
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
      CREATE UNLOGGED TABLE public._stg_discipline_mo (
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
        const tokens = r.full_name.split(/\s+/);
        const lastName  = tokens.length > 1 ? tokens[tokens.length - 1] : null;
        const firstName = tokens.length > 1 ? tokens.slice(0, -1).join(' ') : tokens[0];
        byBar.set(r.bar_number, {
          jurisdiction:   JURISDICTION,
          bar_number:     r.bar_number,
          full_name:      r.full_name,
          first_name:     firstName,
          last_name:      lastName,
          admission_date: null,
          current_status: null,
          city:           null,
          source_url:     r.source_url,
        });
      }
    }
    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_mo',
      ['jurisdiction','bar_number','full_name','first_name','last_name',
       'admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_mo',
      ['jurisdiction','bar_number','full_name','order_date','effective_date',
       'discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertA = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_mo
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name,  public.attorneys.last_name),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW()
      RETURNING id;
    `);
    process.stderr.write(`[db] attorneys upserted: ${upsertA.rowCount}\n`);

    const insE = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_mo s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insE.rowCount}\n`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mo, public._stg_discipline_mo`);
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  process.stderr.write(`[mobar] start — apply=${OPTS.apply}\n`);

  const html = await fetchListing();
  const records = extractRows(html);
  const limited = OPTS.limit ? records.slice(0, OPTS.limit) : records;

  process.stderr.write(`[mobar] parsed ${limited.length} discipline rows\n`);
  for (const r of limited.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date})\n`
    );
  }

  if (!OPTS.apply) {
    process.stderr.write(`[mobar] dry-run — pass --apply to write to DB\n`);
    return;
  }

  if (limited.length === 0) {
    process.stderr.write(`[mobar] no records — nothing to load\n`);
    return;
  }

  await load(limited);
  process.stderr.write(`[mobar] done\n`);
}

// Only run when executed directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
