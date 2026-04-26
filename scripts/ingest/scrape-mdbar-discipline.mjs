// csv-bulk-checked: https://www.mdcourts.gov/attygrievance/sanctions
// Template: scripts/ingest/scrape-txbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Maryland Attorney Discipline Scraper
// Source: Maryland Courts Attorney Grievance Commission
//   Master page:  https://www.mdcourts.gov/attygrievance/sanctions
//   Annual PDFs:  https://www.courts.state.md.us/sites/default/files/import/attygrievance/pdfs/sanctionsfy<YY>.pdf
//   Coverage:     FY 2020 – FY 2026 (default). Master page claims FY 2006–present.
//
// bar_number caveat: Maryland sanctions PDFs do NOT include bar numbers.
//   A deterministic synthetic key is generated as:
//     MD:<sha1(normalized_full_name + "|" + order_date_iso)>::8
//   (first 8 hex chars of SHA-1). This preserves the UNIQUE constraint and
//   allows a future enrichment pass to replace with real MSBA bar numbers.
//   The "MD:" prefix and "::" separator make synthetic keys distinguishable
//   from real bar numbers in future reconciliation.
//
// Name format: MD sanctions use "LAST, First M." as the primary format, with
//   several variants:
//   - "LAST, First M." → "First M. Last"
//   - "LAST, SUFFIX, First M." (e.g., "GLENN, IV, Robert Edwin") → "Robert Edwin Glenn IV"
//   - "LAST, First M., Jr." (e.g., "JOHNSON, Bruce Allen, Jr.") → "Bruce Allen Johnson Jr."
//   - "LAST, First M. Jr." (e.g., "STROUD, Barron LeGrant Jr.") → "Barron LeGrant Stroud Jr."
//   Suffixes handled: Jr., Sr., II, III, IV, V, Esq.
//
// Date formats:
//   - "Month D, YYYY"  (dominant, e.g., "January 27, 2025")
//   - "M/D/YYYY"       (rare, e.g., "7/9/2024")
//
// Discipline enum (lowercase strings):
//   disbarment | suspension | interim_suspension | probation | public_reprimand |
//   resignation_with_charges | censure | admonition | reciprocal_discipline |
//   disability_inactive | unknown
//
// Usage:
//   node scripts/ingest/scrape-mdbar-discipline.mjs            # dry-run FY20-FY26
//   node scripts/ingest/scrape-mdbar-discipline.mjs --apply
//   node scripts/ingest/scrape-mdbar-discipline.mjs --start-fy 22 --apply
//   node scripts/ingest/scrape-mdbar-discipline.mjs --limit 20
//   node scripts/ingest/scrape-mdbar-discipline.mjs --help

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);

// ── Constants ────────────────────────────────────────────────────────────────

const JURISDICTION = 'MD';

// Dual URL patterns for fallback
const PDF_URL_PRIMARY   = (fy) => `https://www.courts.state.md.us/sites/default/files/import/attygrievance/pdfs/sanctionsfy${String(fy).padStart(2,'0')}.pdf`;
const PDF_URL_SECONDARY = (fy) => `https://www.mdcourts.gov/sites/default/files/import/attygrievance/pdfs/sanctionsfy${String(fy).padStart(2,'0')}.pdf`;

const UA_PRIMARY   = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const UA_FALLBACK  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)';

// Month name → zero-padded number
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_NUM = Object.fromEntries(
  MONTH_NAMES.map((m, i) => [m.toLowerCase(), String(i + 1).padStart(2, '0')])
);

// Suffix tokens (used in name parsing)
const SUFFIX_RE = /^(Jr\.?|Sr\.?|II|III|IV|V|Esq\.?)$/i;
const NUMERAL_SUFFIX_RE = /^(II|III|IV|V)$/i;

// ── Discipline normalization ──────────────────────────────────────────────────

// MD-specific patterns listed before generic ones that would otherwise win.
// "disbarment by consent" and "disbarred" must NOT map to resignation_with_charges.
const DISCIPLINE_PATTERNS = [
  // MD-specific first
  [/disbarment\s+by\s+consent/i,         'disbarment'],
  [/disbarred/i,                          'disbarment'],
  [/\bdisbar/i,                           'disbarment'],
  [/temporary\s+suspension/i,             'interim_suspension'],
  [/temporarily\s+suspen/i,               'interim_suspension'],
  [/interim\s+suspension/i,               'interim_suspension'],
  [/indefinite\s+suspension/i,            'suspension'],
  [/suspension\s+by\s+consent/i,          'suspension'],
  [/\bsuspen/i,                           'suspension'],
  [/resign(ation|ed)?\s+in\s+lieu/i,      'resignation_with_charges'],
  [/accepted.*resignation/i,              'resignation_with_charges'],
  [/commission\s+reprimand/i,             'public_reprimand'],
  [/reprimand\s+by\s+consent/i,           'public_reprimand'],
  [/\breprimand/i,                        'public_reprimand'],
  [/\bprobat/i,                           'probation'],
  [/\bcensure/i,                          'censure'],
  [/\badmonition/i,                       'admonition'],
  [/reciprocal\s+discipline/i,            'reciprocal_discipline'],
  [/disability\s+inactive/i,              'disability_inactive'],
];

/**
 * Map raw discipline text → canonical enum value.
 * Returns { type, raw }.
 */
export function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text.slice(0, 500) };
  }
  return { type: 'unknown', raw: text.slice(0, 500) };
}

// ── Name parsing ─────────────────────────────────────────────────────────────

/**
 * Parse MD "LAST, [SUFFIX,] First [Middle] [, Jr.]" format into "First Last [Suffix]".
 *
 * Input variants (all-caps LAST from PDF):
 *   "ANDERS, Joel William"
 *   "JOHNSON, Bruce Allen, Jr."
 *   "STROUD, Barron LeGrant Jr."   (suffix inline, no comma before)
 *   "HARDY, II, James Roger"       (numeral suffix BETWEEN last and first)
 *   "GLENN, IV, Robert Edwin"
 *
 * Returns null on parse failure.
 */
export function parseMdName(raw) {
  if (!raw || raw.length < 4) return null;

  // Split on " – " or " - " (em-dash separator between name and sanction)
  // raw should be just the name portion, but handle gracefully.
  const namePart = raw.split(/\s+[–—-]\s+/)[0].trim();

  const parts = namePart.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const lastName = parts[0]; // May be all-caps (e.g., "ANDERS")
  const normalizedLast = toTitleCase(lastName);

  // Check if parts[1] is a numeral suffix (II, III, IV, V)
  let numeralSuffix = null;
  let firstAndRest;

  if (NUMERAL_SUFFIX_RE.test(parts[1])) {
    // e.g., ["GLENN", "IV", "Robert Edwin"]
    numeralSuffix = parts[1];
    firstAndRest = parts.slice(2).join(', ');
  } else {
    firstAndRest = parts.slice(1).join(', ');
  }

  if (!firstAndRest) return null;

  // firstAndRest may still contain a trailing ", Jr." or inline "Jr." at end
  // Split into tokens and extract trailing suffix
  const tokens = firstAndRest.split(/\s+/);
  let trailingSuffix = null;

  // Check last token for Jr./Sr./Esq.
  if (tokens.length > 0 && SUFFIX_RE.test(tokens[tokens.length - 1])) {
    trailingSuffix = tokens.pop().replace(/,+$/, '');
  }

  const given = tokens.join(' ').replace(/,+$/, '').trim();
  if (!given) return null;

  // Assemble: "First [Middle] Last [Suffix]"
  const parts2 = [given, normalizedLast];
  const suffix = numeralSuffix || trailingSuffix;
  if (suffix) parts2.push(suffix);

  const fullName = parts2.join(' ').trim();
  if (fullName.length < 4 || fullName.length > 120) return null;
  return fullName;
}

/** Convert ALL-CAPS or UPPER word to Title Case. */
export function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)([a-z])/g, (_, c) => c.toUpperCase())
    // Preserve hyphenated names: "O'Brien", "MacDonald"
    .replace(/'-([a-z])/g, (_, c) => `'-${c.toUpperCase()}`)
    .replace(/Mc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/Mac([a-z])/g, (_, c) => `Mac${c.toUpperCase()}`);
}

// ── Date parsing ─────────────────────────────────────────────────────────────

// "January 27, 2025" or "January 27, 2025"
const DATE_MONTHNAME_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i;
// "7/9/2024" or "07/09/2024"
const DATE_SLASH_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

/**
 * Parse a date string in either "Month D, YYYY" or "M/D/YYYY" format.
 * Returns ISO date string "YYYY-MM-DD" or null.
 */
export function parseDate(text) {
  if (!text) return null;

  // Try month-name format first (dominant in MD PDFs)
  let m = DATE_MONTHNAME_RE.exec(text);
  if (m) {
    const mm = MONTH_NUM[m[1].toLowerCase()];
    if (!mm) return null;
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }

  // Fall back to slash format
  m = DATE_SLASH_RE.exec(text);
  if (m) {
    const mm = String(parseInt(m[1], 10)).padStart(2, '0');
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }

  return null;
}

// ── Synthetic bar number ─────────────────────────────────────────────────────

/**
 * Generate a deterministic synthetic bar number:
 *   MD:<sha1(normalized_full_name + "|" + order_date_iso)>::8
 * This preserves uniqueness and is stable across re-runs with the same data.
 */
export function syntheticBarNumber(fullName, orderDate) {
  const input = `${fullName.trim().toLowerCase()}|${orderDate}`;
  const hash = crypto.createHash('sha1').update(input, 'utf8').digest('hex');
  return `MD:${hash.slice(0, 8)}`;
}

// ── Entry extraction ─────────────────────────────────────────────────────────

// Pattern: All-caps last name (at least 2 chars) followed by ", First" separated
// by an em-dash or regular dash from the sanction text.
// The em-dash character in MD PDFs is "–" (U+2013).
const ENTRY_SPLIT_RE = /(?=^|\n)([A-Z][A-Z'\-]+(?:,\s*(?:II|III|IV|V|Jr\.?|Sr\.?|Esq\.?),?\s*)?[A-Z][A-Z'\-]*(?:,\s*[A-Za-z][^–—\n]{2,60})?)\s+[–—-]\s+/gm;

// Simpler, more reliable: split on lines that start with ALL-CAPS LASTNAME
const PARAGRAPH_ENTRY_RE = /\n([A-Z][A-Z'\-]{1,}(?:,\s*(?:II|III|IV|V|Jr\.?|Sr\.?))?(?:,\s*[A-Z][a-z][^\n–—]{0,60})?)\s*[–—]\s*/g;

/**
 * Extract discipline entries from normalized PDF text.
 * MD format: "LAST, First M. – Sanction on Date, narrative text."
 * Returns array of parsed record objects.
 */
export function extractEntries(fullText, sourceUrl) {
  // Normalize whitespace — collapse tab runs, fix PDF hyphen-breaks
  const t = fullText
    .replace(/-\n/g, '')
    .replace(/\r/g, '')
    .replace(/\t+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    // Keep newlines before all-caps entries for splitting
    .trim();

  // Split text into lines, then re-join into paragraphs per entry.
  // Strategy: an entry starts when a line begins with ALL-CAPS word(s)
  // followed by comma + mixed-case (the first name part) and then " – ".
  // We'll use a regex that matches these header lines.

  // Each entry block: "SMITH, John A. – Sanction on Date, narrative."
  // We split on the em-dash anchored to the entry header.
  // Use matchAll on the normalized text (newlines collapsed to spaces first
  // to handle wrapping, but we need to preserve entry boundaries).

  // Better: collapse only WITHIN entries (after splitting on entry boundaries).
  // Entry boundary = newline immediately followed by 2+ ALL-CAPS chars then comma.
  const ENTRY_HEADER_RE = /(?:^|\n)([A-Z][A-Z'\-]+(?:,\s*(?:II|III|IV|V|Jr\.?|Sr\.?))?(?:,\s*[A-Z][^\n–—]{0,80})?)\s*[–—]\s*/;

  // Split the text into chunks — one per entry
  // We look for lines that are ALL-CAPS names
  const lines = t.split('\n');
  const chunks = [];
  let current = null;

  for (const line of lines) {
    const stripped = line.trim();
    // Skip page markers like "-- 1 of 7 --"
    if (/^--\s*\d+\s+of\s+\d+\s*--/.test(stripped)) continue;
    // Skip the header line
    if (/^SANCTIONS AND ACTIONS/i.test(stripped)) continue;
    // Skip empty lines (but if we have a current entry, keep them as paragraph breaks)
    if (!stripped) {
      if (current !== null) current += ' ';
      continue;
    }

    // Check if this line starts a new entry: ALL-CAPS word(s) + comma + anything + em-dash
    // E.g.: "ANDERS, Joel William – Commission Reprimand..."
    // Or:   "GLENN, IV, Robert Edwin – Disbarment..."
    const isEntry = /^[A-Z][A-Z'\-]{1,}(?:,\s*(?:II|III|IV|V|Jr\.?|Sr\.?))?(?:,\s*[A-Z][a-z])/.test(stripped)
      && /[–—]/.test(stripped);

    if (isEntry) {
      if (current !== null) chunks.push(current.trim());
      current = stripped;
    } else {
      if (current !== null) {
        current += ' ' + stripped;
      }
    }
  }
  if (current !== null) chunks.push(current.trim());

  const records = [];
  const seen = new Set();

  for (const chunk of chunks) {
    try {
      const record = parseChunk(chunk, sourceUrl);
      if (!record) continue;
      const dedupeKey = `${record.bar_number}|${record.order_date}|${record.discipline_type}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      records.push(record);
    } catch (err) {
      // Defensive: log bad rows and continue
      process.stderr.write(`[md-parse] skip chunk (${err.message}): ${chunk.slice(0, 80)}\n`);
    }
  }

  return records;
}

/**
 * Parse a single entry chunk:
 *   "LAST, First M. – Sanction on Date, narrative."
 */
export function parseChunk(chunk, sourceUrl) {
  // Split on em-dash to get name vs sanction text
  const dashIdx = chunk.search(/[–—]/);
  if (dashIdx < 0) return null;

  const rawName = chunk.slice(0, dashIdx).trim();
  const sanctionText = chunk.slice(dashIdx + 1).trim();

  const fullName = parseMdName(rawName);
  if (!fullName) return null;

  // Extract order_date from the sanction text
  // Typical: "Commission Reprimand on August 30, 2024, for..."
  // Also: "Disbarred on January 27, 2025, effective immediately..."
  // Also: "Suspension for thirty days on July 9, 2024..."
  // Also: "Suspension by Consent for 150 days on January 27, 2025..."
  const orderDate = parseDate(sanctionText);
  if (!orderDate) return null;

  // Determine discipline type from sanction text
  const { type: disciplineType, raw: disciplineRaw } = normalizeDiscipline(sanctionText);

  // Build synthetic bar number
  const barNumber = syntheticBarNumber(fullName, orderDate);

  // Violation summary: the narrative after the date
  // Strip "on <date>," from start to get the reason clause
  const violationSummary = sanctionText.slice(0, 2000).trim();

  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: orderDate,
    discipline_type: disciplineType,
    discipline_raw: disciplineRaw || sanctionText.slice(0, 500),
    violation_summary: violationSummary,
    order_url: null,
    source_url: sourceUrl,
  };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchPdfBuffer(url, useragent) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': useragent },
  });
  if (!resp.ok) throw Object.assign(new Error(`HTTP ${resp.status}`), { status: resp.status });
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Fetch a single FY PDF with UA fallback on 403.
 * Returns null if not reachable even after fallback.
 */
async function fetchFyPdf(fy) {
  const primary = PDF_URL_PRIMARY(fy);
  const secondary = PDF_URL_SECONDARY(fy);

  for (const url of [primary, secondary]) {
    // Try primary UA first
    for (const ua of [UA_PRIMARY, UA_FALLBACK]) {
      try {
        const buf = await fetchPdfBuffer(url, ua);
        process.stderr.write(`[md] FY${fy} fetched from ${url} (${buf.length} bytes) ua=${ua.slice(0,30)}\n`);
        return { buf, url };
      } catch (err) {
        if (err.status === 403) {
          process.stderr.write(`[md] FY${fy} 403 at ${url} ua=${ua.slice(0,30)} — trying fallback\n`);
          continue;
        }
        if (err.status === 404) {
          process.stderr.write(`[md] FY${fy} 404 at ${url} — skipping\n`);
          return null;
        }
        throw err;
      }
    }
  }

  process.stderr.write(`[md] FY${fy} — all URLs/UAs failed, skipping\n`);
  return null;
}

// ── PDF parse ─────────────────────────────────────────────────────────────────

async function parseFyPdf(fy) {
  const result = await fetchFyPdf(fy);
  if (!result) return [];

  const { buf, url } = result;
  try {
    const parser = new PDFParse({ data: buf });
    const { text } = await parser.getText();
    const records = extractEntries(text, url);
    process.stderr.write(`[md] FY${fy} — ${records.length} entries parsed\n`);
    return records;
  } catch (err) {
    process.stderr.write(`[md] FY${fy} — parse failed: ${err.message}\n`);
    return [];
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, startFy: 20, endFy: 26, limit: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply')    out.apply = true;
    else if (a === '--start-fy') out.startFy = parseInt(args[++i], 10);
    else if (a === '--end-fy')   out.endFy   = parseInt(args[++i], 10);
    else if (a === '--limit')    out.limit   = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      // Print first 40 lines of this file as usage
      const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 40);
      process.stdout.write(lines.join('\n') + '\n');
      process.exit(0);
    }
  }
  return out;
}

// ── DB load ───────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    // Staging tables
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_md`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_md`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_md (
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
      CREATE UNLOGGED TABLE public._stg_discipline_md (
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

    // De-duplicate attorneys by bar_number (synthetic) — keep first occurrence
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const nameParts = r.full_name.split(/\s+/);
        const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
        const lastName  = nameParts[nameParts.length - 1] ?? null;
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number:   r.bar_number,
          full_name:    r.full_name,
          first_name:   firstName,
          last_name:    lastName,
          admission_date: null,
          current_status: null,
          city:         null,
          source_url:   r.source_url,
        });
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_md',
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
      '_stg_discipline_md',
      ['jurisdiction','bar_number','full_name','order_date','effective_date',
       'discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_md
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name,  public.attorneys.last_name),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW()
      RETURNING id, bar_number;
    `);
    process.stderr.write(`[db] attorneys upserted: ${upsertAttorneys.rowCount}\n`);

    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_md s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insertEvents.rowCount}\n`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_md, public._stg_discipline_md`);
  } finally {
    await cleanup();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  process.stderr.write(`[mdbar] start — apply=${OPTS.apply} FY${OPTS.startFy}..FY${OPTS.endFy}\n`);

  const records = [];
  for (let fy = OPTS.startFy; fy <= OPTS.endFy; fy++) {
    const r = await parseFyPdf(fy);
    records.push(...r);
    if (fy < OPTS.endFy) await politeDelay();
  }

  const limited = OPTS.limit ? records.slice(0, OPTS.limit) : records;
  process.stderr.write(`[mdbar] collected ${limited.length} discipline rows\n`);

  for (const r of limited.slice(0, 5)) {
    process.stderr.write(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date})\n`
    );
  }

  if (!OPTS.apply) {
    process.stderr.write(`[mdbar] dry-run — pass --apply to write to DB\n`);
    return;
  }

  if (limited.length === 0) {
    process.stderr.write(`[mdbar] no records — nothing to load\n`);
    return;
  }

  await load(limited);
  process.stderr.write(`[mdbar] done\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
