// csv-bulk-checked: https://www.wicourts.gov/services/public/lawyerreg/statuspublic.htm
// Template: scripts/ingest/scrape-tnbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Wisconsin Court System — public attorney discipline scraper.
//
// Source (confirmed live 2026-04-26):
//   Listing: https://www.wicourts.gov/services/public/lawyerreg/statuspublic.htm
//   Coverage: ~82 currently-disciplined attorneys (snapshot — table holds those
//             still showing disciplinary status). Single page, no pagination.
//
// Live DOM structure (verified by fetch + Read 2026-04-26):
//   <tr>
//     <td>Lastname, First M.</td>
//     <td data-sort="YYYYMMDD">Mon DD, YYYY</td>
//     <td><a href="<order pdf url>">CASE-NUMBER</a></td>
//   </tr>
//
// The listing does NOT carry the discipline TYPE. Case-number prefix is the
// only signal we can extract without fetching/OCR-ing each PDF:
//   - "...AP...-D" → Wisconsin Supreme Court direct discipline action
//   - "YYYY OLR N" → Office of Lawyer Regulation referenced order
// Both are concrete disciplinary outcomes (the listing's heading reads
// "publicly disciplined lawyers"), but we can't determine
// disbarment/suspension/etc. from the listing alone. Per safety rule
// (no-hallucinated-legal-data), we record discipline_type='unknown' and
// preserve the raw case number in discipline_raw so a future enrichment pass
// can fetch the PDF and refine.
//
// Two URL flavors observed:
//   - /sc/opinion/DisplayDocument.pdf?content=pdf&seqNo=NNNNNN   (Supreme Court)
//   - /services/public/lawyerreg/statuspublic/<lastname>.pdf     (OLR)
// Both stored as order_url (HTTPS, public).
//
// WI does not display bar numbers in this table. Synthetic key:
//   "WI:<sha1(name|order_date)::8>"
//
// Usage:
//   node scripts/ingest/scrape-wibar-discipline.mjs               # dry-run
//   node scripts/ingest/scrape-wibar-discipline.mjs --apply       # write to DB
//   node scripts/ingest/scrape-wibar-discipline.mjs --limit 20

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.wicourts.gov';
const LISTING_URL = `${BASE_URL}/services/public/lawyerreg/statuspublic.htm`;
const JURISDICTION = 'WI';

const UA_PRIMARY =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const UA_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)';

// ── Date parsing ─────────────────────────────────────────────────────────────

const DATE_SORT_RE = /^(\d{4})(\d{2})(\d{2})$/;

/** "20251211" → "2025-12-11" or null */
export function parseSortDate(text) {
  if (!text) return null;
  const m = DATE_SORT_RE.exec(text.trim());
  if (!m) return null;
  const yr = parseInt(m[1], 10);
  if (yr < 1990 || yr > 2100) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ── Name parsing ─────────────────────────────────────────────────────────────

const SUFFIX_RE = /^(Jr\.?|Sr\.?|II|III|IV|V|Esq\.?)$/i;

/**
 * Parse "Lastname, First M." → "First M. Lastname"
 * Examples:
 *   "Alfredson, Melinda"      → "Melinda Alfredson"
 *   "Barham, Daniel O."       → "Daniel O. Barham"
 *   "Buran, John P."          → "John P. Buran"
 */
export function parseWiName(raw) {
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
  return `WI:${hash.slice(0, 8)}`;
}

// ── Row extraction ───────────────────────────────────────────────────────────

/**
 * Extract WI discipline rows. Pattern:
 *   <tr>
 *     <td>Lastname, First M.</td>
 *     <td data-sort="YYYYMMDD" ...>Mon DD, YYYY</td>
 *     <td><a href="<pdf>">CASE-NUMBER</a></td>
 *   </tr>
 */
export function extractRows(html) {
  if (!html) return [];

  const rowChunks = html.split(/<tr[^>]*>/i).slice(1);

  const records = [];
  const seen = new Set();

  for (const chunk of rowChunks) {
    const rowEnd = chunk.search(/<\/tr>/i);
    const row = rowEnd >= 0 ? chunk.slice(0, rowEnd) : chunk;

    // Skip header row
    if (/<th\b/i.test(row)) continue;

    const cellMatches = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cellMatches.length < 3) continue;

    const nameText = stripTags(cellMatches[0][2]).trim();

    // Extract data-sort attribute for date cell
    const dateCellAttrs = cellMatches[1][1] || '';
    const dataSortMatch = dateCellAttrs.match(/data-sort="(\d{8})"/i);
    let orderDate = null;
    if (dataSortMatch) {
      orderDate = parseSortDate(dataSortMatch[1]);
    }
    // Fallback: parse the visible date text
    if (!orderDate) {
      orderDate = parseHumanDate(stripTags(cellMatches[1][2]));
    }
    if (!orderDate) continue;

    // Case number cell — link
    const caseCell = cellMatches[2][2];
    const anchorMatch = caseCell.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;
    let orderHref = anchorMatch[1].trim().replace(/&amp;/g, '&');
    const caseNumber = stripTags(anchorMatch[2]).trim();
    if (!caseNumber) continue;

    const fullName = parseWiName(nameText);
    if (!fullName) continue;

    const orderUrl = orderHref.startsWith('http')
      ? orderHref
      : `${BASE_URL}${orderHref.startsWith('/') ? '' : '/services/public/lawyerreg/'}${orderHref}`;

    // Discipline type: 'unknown' — listing does not expose it.
    // Future enrichment pass can fetch the PDF and refine.
    const disciplineType = 'unknown';

    const barNumber = syntheticBarNumber(fullName, orderDate);
    const dedupeKey = `${barNumber}|${orderDate}|${disciplineType}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    records.push({
      bar_number:        barNumber,
      full_name:         fullName,
      order_date:        orderDate,
      effective_date:    orderDate,
      discipline_type:   disciplineType,
      discipline_raw:    `Case ${caseNumber}`.slice(0, 500),
      violation_summary: `Listed as publicly disciplined lawyer (case ${caseNumber}).`.slice(0, 2000),
      order_url:         orderUrl,
      source_url:        LISTING_URL,
    });
  }

  return records;
}

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
const HUMAN_DATE_RE = /([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})/;

function parseHumanDate(text) {
  if (!text) return null;
  const m = HUMAN_DATE_RE.exec(text);
  if (!m) return null;
  const mm = MONTH_MAP[m[1].slice(0, 3).toLowerCase()];
  if (!mm) return null;
  const dd = String(parseInt(m[2], 10)).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
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

async function fetchListing() {
  for (const ua of [UA_PRIMARY, UA_FALLBACK]) {
    try {
      const resp = await fetch(LISTING_URL, { headers: { 'User-Agent': ua } });
      if (!resp.ok) {
        process.stderr.write(`[wi] HTTP ${resp.status} with ua=${ua.slice(0, 30)}\n`);
        continue;
      }
      const html = await resp.text();
      process.stderr.write(`[wi] fetched ${html.length} bytes ua=${ua.slice(0, 30)}\n`);
      return html;
    } catch (err) {
      process.stderr.write(`[wi] fetch error ua=${ua.slice(0, 30)}: ${err.message}\n`);
    }
  }
  throw new Error('All UA fallbacks failed for WI listing');
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
      const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 40);
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
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_wi`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_wi`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_wi (
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
      CREATE UNLOGGED TABLE public._stg_discipline_wi (
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
      '_stg_attorneys_wi',
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
      '_stg_discipline_wi',
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
      FROM _stg_attorneys_wi
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
      FROM _stg_discipline_wi s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insE.rowCount}\n`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_wi, public._stg_discipline_wi`);
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  process.stderr.write(`[wibar] start — apply=${OPTS.apply}\n`);

  const html = await fetchListing();
  const records = extractRows(html);
  const limited = OPTS.limit ? records.slice(0, OPTS.limit) : records;

  process.stderr.write(`[wibar] parsed ${limited.length} discipline rows\n`);
  for (const r of limited.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date}) ${r.discipline_raw}\n`
    );
  }

  if (!OPTS.apply) {
    process.stderr.write(`[wibar] dry-run — pass --apply to write to DB\n`);
    return;
  }

  if (limited.length === 0) {
    process.stderr.write(`[wibar] no records — nothing to load\n`);
    return;
  }

  await load(limited);
  process.stderr.write(`[wibar] done\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
