// csv-bulk-checked: https://www.ladb.org/DR/
// Template: scripts/ingest/scrape-tnbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Louisiana Attorney Disciplinary Board — public discipline scraper.
//
// Source (confirmed live 2026-04-26):
//   Listing: https://www.ladb.org/DR/
//   Coverage: Three collapsible panels (Supreme Court / Disciplinary Board /
//             Hearing Committee) holding chronological list-group items.
//
// Live DOM structure (verified by fetch + Read 2026-04-26):
//   <div id="collapseSC" ...>
//     <ul class="list-group">
//       <li class='list-group-item'>
//         <a id='doc-NNNNN' role='button' href='#'
//            onclick='openHandler($(this),NNNNN, "pdf");'>
//           <strong>MM/DD/YYYY:</strong>&nbsp;LASTNAME, FIRSTNAME, CASE-NUMBER (DATE) ---So.3d---
//         </a>
//       </li>
//       ...
//     </ul>
//   </div>
//   (Same pattern under #collapseBD and #collapseHC.)
//
// PDF endpoint (resolved from /DR/LIB/LADB-dr.js openHandler):
//   https://www.ladb.org/handler.document.aspx?DocID=<NNNNN>
//   Confirmed 2026-04-26: returns content-type application/pdf, ~900KB.
//
// LA does NOT publish bar numbers in the listing. Synthetic key:
//   "LA:<sha1(name|order_date)::8>"
//
// Discipline TYPE is not exposed in the listing — case-number prefix gives
// a weak signal (B = original disciplinary case at LASC, OB = original-bar,
// DB = Disciplinary Board), but not the actual sanction. Per
// no-hallucinated-legal-data, we record discipline_type='unknown' and
// preserve the panel + case-number in discipline_raw / violation_summary so
// a future enrichment pass can refine via PDF fetch.
//
// Usage:
//   node scripts/ingest/scrape-labar-discipline.mjs               # dry-run
//   node scripts/ingest/scrape-labar-discipline.mjs --apply       # write to DB
//   node scripts/ingest/scrape-labar-discipline.mjs --limit 20

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.ladb.org';
const LISTING_URL = `${BASE_URL}/DR/`;
const PDF_URL = (docId) => `${BASE_URL}/handler.document.aspx?DocID=${docId}`;
const JURISDICTION = 'LA';

const UA_PRIMARY =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const UA_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)';

// ── Date parsing ─────────────────────────────────────────────────────────────

const DATE_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** "04/21/2026" → "2026-04-21" or null */
export function parseDate(text) {
  if (!text) return null;
  const m = DATE_SLASH_RE.exec(text.trim());
  if (!m) return null;
  const mm = String(parseInt(m[1], 10)).padStart(2, '0');
  const dd = String(parseInt(m[2], 10)).padStart(2, '0');
  const yr = parseInt(m[3], 10);
  if (yr < 1990 || yr > 2100) return null;
  return `${m[3]}-${mm}-${dd}`;
}

// ── Name normalization ───────────────────────────────────────────────────────

const SUFFIX_RE = /^(JR\.?|SR\.?|II|III|IV|V|ESQ\.?)$/i;

/**
 * Parse "LASTNAME, FIRSTNAME, CASE-NUMBER" (after stripping trailing "(date) ---So.3d---").
 * The text is ALL-CAPS in LA listings, similar to MD.
 *
 * Examples:
 *   "CHARLES, MICHELLE ANDRICA"          → "Michelle Andrica Charles"
 *   "FEWELL, RICHARD L., JR."            → "Richard L. Fewell Jr."
 *   "BURNS, LIONEL JR."                  → "Lionel Burns Jr."
 *   "KOERNER, LOUIS R. JR."              → "Louis R. Koerner Jr."
 *   "BERNARD, G. KARL"                   → "G. Karl Bernard"
 *   "LOUVIERE, DREW M"                   → "Drew M Louviere"
 *   "ST. ANGELO, GREGORY JOSEPH"         → "Gregory Joseph St. Angelo"
 *   "VAN HORN, MURIEL OFFAN"             → "Muriel Offan Van Horn"
 */
export function parseLaName(raw) {
  if (!raw) return null;
  let cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3 || cleaned.length > 200) return null;

  // Case number / date suffixes may sneak in if regex slips — strip
  // anything from " (" onward (e.g., "JOHN, DOE (04/01/26)..."):
  const parenIdx = cleaned.search(/\s+\(/);
  if (parenIdx > 0) cleaned = cleaned.slice(0, parenIdx).trim();
  // Strip trailing dashes / "---So.3d---" debris
  cleaned = cleaned.replace(/[-–—]+\s*$/, '').trim();

  const idx = cleaned.indexOf(',');
  if (idx <= 0) return null;
  const lastPart = cleaned.slice(0, idx).trim();
  const givenPart = cleaned.slice(idx + 1).trim().replace(/,+$/, '');
  if (!lastPart || !givenPart) return null;

  // Possible ", JR." trailing comma form
  let trailingSuffix = null;
  const givenTokens = givenPart.split(/\s+/);
  if (givenTokens.length > 0) {
    const lastTok = givenTokens[givenTokens.length - 1].replace(/,+$/, '');
    if (SUFFIX_RE.test(lastTok)) {
      trailingSuffix = lastTok;
      givenTokens.pop();
    }
  }
  const givenClean = givenTokens.join(' ').replace(/,+$/, '').trim();
  if (!givenClean) return null;

  const fullCaps = `${givenClean} ${lastPart}${trailingSuffix ? ' ' + trailingSuffix : ''}`;
  const titled = toTitleCase(fullCaps).replace(/\s+/g, ' ').trim();
  if (titled.length < 4 || titled.length > 200) return null;
  return titled;
}

/** Convert ALL-CAPS to Title Case, preserve roman-numeral suffixes & initials. */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((tok) => {
      if (!tok) return tok;
      // Roman numeral suffix
      if (/^(ii|iii|iv|v|vi|vii)$/i.test(tok)) return tok.toUpperCase();
      // Single initial like "G." / "L."
      if (/^[a-z]\.?$/i.test(tok)) return tok.toUpperCase();
      // Compound abbreviations like "St." / "Mc"
      // Apostrophe-aware capitalization (e.g., O'Brien)
      return tok
        .replace(/^([a-z])/, (c) => c.toUpperCase())
        .replace(/'([a-z])/g, (_, c) => `'${c.toUpperCase()}`)
        .replace(/^Mc([a-z])/, (_, c) => `Mc${c.toUpperCase()}`);
    })
    .join(' ');
}

// ── Synthetic bar number ─────────────────────────────────────────────────────

export function syntheticBarNumber(fullName, orderDate) {
  const input = `${fullName.trim().toLowerCase()}|${orderDate}`;
  const hash = crypto.createHash('sha1').update(input, 'utf8').digest('hex');
  return `LA:${hash.slice(0, 8)}`;
}

// ── Row extraction ───────────────────────────────────────────────────────────

const PANELS = [
  { id: 'collapseSC', name: 'Supreme Court' },
  { id: 'collapseBD', name: 'Disciplinary Board' },
  { id: 'collapseHC', name: 'Hearing Committee' },
];

/**
 * Extract LA discipline rows from listing page HTML.
 *
 * Each <li class="list-group-item"> contains:
 *   <a id="doc-NNNNN" ... onclick="openHandler($(this),NNNNN, &quot;pdf&quot;);">
 *     <strong>MM/DD/YYYY:</strong>&nbsp;LASTNAME, FIRSTNAME, CASE-NUMBER (DATE) ---So.3d---
 *   </a>
 */
export function extractRows(html) {
  if (!html) return [];

  const records = [];
  const seen = new Set();

  for (const panel of PANELS) {
    // Find the panel block
    const panelOpenRe = new RegExp(`<div\\s+id="${panel.id}"[^>]*>([\\s\\S]*?)</div>`, 'i');
    const m = panelOpenRe.exec(html);
    if (!m) {
      process.stderr.write(`[la] panel ${panel.id} not found\n`);
      continue;
    }
    const panelHtml = m[1];

    // Each list-group-item
    const items = [...panelHtml.matchAll(/<li\s+class=['"]list-group-item['"][^>]*>([\s\S]*?)<\/li>/gi)];
    process.stderr.write(`[la] panel ${panel.id}: ${items.length} list items\n`);

    for (const itemMatch of items) {
      const itemHtml = itemMatch[1];

      // Anchor with doc id
      const anchorMatch = itemHtml.match(
        /<a\s+id=['"]doc-(\d+)['"][^>]*onclick=['"]openHandler\([^,]+,\s*\d+,\s*&quot;([^&]+)&quot;\);?['"][^>]*>([\s\S]*?)<\/a>/i
      );
      if (!anchorMatch) continue;
      const docId = anchorMatch[1];
      const fileType = anchorMatch[2];
      const innerHtml = anchorMatch[3];

      if (fileType !== 'pdf') continue;

      // Date from <strong>MM/DD/YYYY:</strong>
      const dateMatch = innerHtml.match(/<strong>(\d{1,2}\/\d{1,2}\/\d{4}):<\/strong>/i);
      if (!dateMatch) continue;
      const orderDate = parseDate(dateMatch[1]);
      if (!orderDate) continue;

      // After the closing </strong> + &nbsp;, the rest is "LASTNAME, FIRSTNAME, CASE (date) ---..."
      const afterStrong = innerHtml.split(/<\/strong>/i)[1] || '';
      const text = stripTags(afterStrong).replace(/^[\s:]+/, '').trim();

      // Split on the SECOND comma to separate name from case-number tail
      // "CHARLES, MICHELLE ANDRICA, 2026-B-00336 (04/21/26) ---So.3d---"
      // Strategy: case-number pattern is usually "YYYY-XX-NNNN" or "NN-DB-NNN"
      const caseRe = /,\s*(\d{2,4}[-A-Z][\w-]+|\d{2}-DB-\d+|ROPC-\d+)\s*(?:\(([^)]+)\))?/i;
      const caseMatch = caseRe.exec(text);
      if (!caseMatch) continue;
      const namePortion = text.slice(0, caseMatch.index).trim();
      const caseNumber = caseMatch[1];

      const fullName = parseLaName(namePortion);
      if (!fullName) continue;

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
        discipline_raw:    `${panel.name}: ${caseNumber}`.slice(0, 500),
        violation_summary: `${panel.name} discipline order — case ${caseNumber}.`.slice(0, 2000),
        order_url:         PDF_URL(docId),
        source_url:        LISTING_URL,
      });
    }
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

async function fetchListing() {
  for (const ua of [UA_PRIMARY, UA_FALLBACK]) {
    try {
      const resp = await fetch(LISTING_URL, { headers: { 'User-Agent': ua } });
      if (!resp.ok) {
        process.stderr.write(`[la] HTTP ${resp.status} with ua=${ua.slice(0, 30)}\n`);
        continue;
      }
      const html = await resp.text();
      process.stderr.write(`[la] fetched ${html.length} bytes ua=${ua.slice(0, 30)}\n`);
      return html;
    } catch (err) {
      process.stderr.write(`[la] fetch error ua=${ua.slice(0, 30)}: ${err.message}\n`);
    }
  }
  throw new Error('All UA fallbacks failed for LA listing');
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
      const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 45);
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
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_la`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_la`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_la (
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
      CREATE UNLOGGED TABLE public._stg_discipline_la (
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
      '_stg_attorneys_la',
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
      '_stg_discipline_la',
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
      FROM _stg_attorneys_la
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
      FROM _stg_discipline_la s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insE.rowCount}\n`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_la, public._stg_discipline_la`);
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  process.stderr.write(`[labar] start — apply=${OPTS.apply}\n`);

  const html = await fetchListing();
  const records = extractRows(html);
  const limited = OPTS.limit ? records.slice(0, OPTS.limit) : records;

  process.stderr.write(`[labar] parsed ${limited.length} discipline rows\n`);
  for (const r of limited.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date}) ${r.discipline_raw}\n`
    );
  }

  if (!OPTS.apply) {
    process.stderr.write(`[labar] dry-run — pass --apply to write to DB\n`);
    return;
  }

  if (limited.length === 0) {
    process.stderr.write(`[labar] no records — nothing to load\n`);
    return;
  }

  await load(limited);
  process.stderr.write(`[labar] done\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
