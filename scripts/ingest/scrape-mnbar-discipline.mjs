// csv-bulk-checked: https://lprb.mncourts.gov/
// Template: scripts/ingest/scrape-txbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Minnesota LPRB — annual report discipline scraper.
//
// Source (confirmed 2026-04-25):
//   Annual Reports: https://lprb.mncourts.gov/about/annual-reports/
//   PDFs hosted at https://lprb.mncourts.gov/wp-content/uploads/<year>/<month>/
//   URL pattern is irregular per year (hardcoded below, verified 2026-04-25).
//
// Coverage: 2022-2024 machine-readable PDFs (104 rows).
//   2019: HTTP 404 as of 2026-04-25.
//   2020-2021: Image-only scanned PDFs — pdf-parse returns empty text.
//
// PDF structure (verified across 2022-2024 reports):
//   Each report contains an "OLPR SUMMARY OF PUBLIC MATTERS DECIDED" appendix
//   (table A.13) with:
//     DETERMINATION DATES BETWEEN: 1/1/YYYY AND 12/31/YYYY
//   followed by discipline sections:
//     Supreme Court Disbarment X ATTORNEYS Y FILES
//     LASTNAME, FIRSTNAME M  A21-1234  <file_count>
//
// Bar numbers: MN annual reports do not publish bar numbers.
//   Deterministic synthetic key: MN:<sha1(full_name|order_date)[:8]>
//   Stable across runs for the same attorney+date.
//
// Name conversion: "LAST, FIRST MIDDLE" all-caps → "First Middle Last" title-case.
//
// Usage:
//   node scripts/ingest/scrape-mnbar-discipline.mjs              # dry-run all years
//   node scripts/ingest/scrape-mnbar-discipline.mjs --apply
//   node scripts/ingest/scrape-mnbar-discipline.mjs --year 2023 --apply
//   node scripts/ingest/scrape-mnbar-discipline.mjs --limit 10
//   node scripts/ingest/scrape-mnbar-discipline.mjs --help

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);

// ── Config ────────────────────────────────────────────────────────────────────

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const JURISDICTION = 'MN';

// Hardcoded PDF URLs verified 2026-04-25 against lprb.mncourts.gov/about/annual-reports/
// Pattern is irregular — different upload months, some compressed, some not.
//
// 2019: URL returns HTTP 404 as of 2026-04-25 — omitted.
// 2020: Image-only scanned PDF — pdf-parse extracts empty text. Omitted.
// 2021: Image-only scanned PDF — pdf-parse extracts empty text. Omitted.
// 2022-2024: Machine-readable text PDFs — fully parseable.
const PDF_URLS = {
  2022: 'https://lprb.mncourts.gov/wp-content/uploads/2024/05/2022-Annual-Report.pdf',
  2023: 'https://lprb.mncourts.gov/wp-content/uploads/2024/05/2023-Annual-Report_compressed.pdf',
  2024: 'https://lprb.mncourts.gov/wp-content/uploads/2024/11/2024-Annual-Report_compressed.pdf',
};

// ── Discipline section header → enum mapping ──────────────────────────────────
//
// Section headers appear as: "Supreme Court Disbarment X ATTORNEYS Y FILES"
// More-specific patterns must come before less-specific ones.
//
const SECTION_PATTERNS = [
  [/resign|voluntary\s+surrender/i,          'resignation_with_charges'],
  [/interim\s+sus/i,                         'interim_suspension'],
  [/suspension\s+stayed.*probation/i,        'probation'],
  [/reprimand.*probation|probation.*reprimand/i, 'probation'],
  [/disability/i,                            'disability_inactive'],
  [/censure/i,                               'censure'],
  [/suspension/i,                            'suspension'],
  [/reprimand/i,                             'public_reprimand'],
  [/disbar/i,                                'disbarment'],
];

function sectionHeaderToDiscipline(header) {
  for (const [re, type] of SECTION_PATTERNS) {
    if (re.test(header)) return type;
  }
  return null;
}

// ── Name normalization ─────────────────────────────────────────────────────────
//
// Input:  "LAST, FIRST MIDDLE"  or  "LAST, F M"  (all-caps, comma-separated)
// Output: "First Middle Last"   (title-case, initials get dot appended)
//
const SUFFIX_RE = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

function toTitleCase(s) {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

export function normalizeName(rawLastFirst) {
  const commaIdx = rawLastFirst.indexOf(',');
  if (commaIdx < 0) return toTitleCase(rawLastFirst.trim());

  const rawLast = rawLastFirst.slice(0, commaIdx).trim();
  const rawFirstMiddle = rawLastFirst.slice(commaIdx + 1).trim();

  const lastTokens = rawLast.split(/\s+/);
  const fmTokens = rawFirstMiddle.split(/\s+/).filter(Boolean);

  const lastSuffix = [];
  const lastParts = [];
  for (const t of lastTokens) {
    if (SUFFIX_RE.test(t)) lastSuffix.push(t);
    else lastParts.push(t);
  }

  const allParts = [...fmTokens, ...lastParts, ...lastSuffix];
  return allParts.map((tok) => {
    if (SUFFIX_RE.test(tok)) {
      const t = tok.toLowerCase().replace(/\.$/, '');
      if (t === 'jr') return 'Jr.';
      if (t === 'sr') return 'Sr.';
      return tok.toUpperCase();
    }
    if (tok.length === 1) return tok.toUpperCase() + '.';
    return toTitleCase(tok);
  }).join(' ');
}

// ── Deterministic bar_number ───────────────────────────────────────────────────

export function deterministicBarNumber(fullName, orderDate) {
  const key = (fullName + '|' + orderDate).toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return `MN:${hash.slice(0, 8)}`;
}

// ── PDF text parser ────────────────────────────────────────────────────────────
//
// Locates the "OLPR SUMMARY OF PUBLIC MATTERS DECIDED" page(s), which may appear
// twice per report (two consecutive calendar years). Parses each independently.
//
// Attorney line pattern: "LASTNAME, FIRSTNAME M  A21-1234  1"
// Case number regex matches A-prefixed or ADM-prefixed court file numbers.
//
const CASE_NUM_RE = /\b(A(?:DM)?\d{2}-\d{3,5})\b/;
const DET_DATE_RE = /DETERMINATION\s+DATES\s+BETWEEN\s*:\s*\d{1,2}\/\d{1,2}\/(\d{4})\s+AND/i;

// Newer reports (2023+) use a single-column format:
//   Supreme Court Disbarment 3 ATTORNEYS 14 FILES
//   HERNANDEZ, JOHN T A21-0327 5
//
// Older reports (pre-2023) use a two-column tab-delimited layout on the same line:
//   Supreme Court Disbarment  4 ATTORNEYS  Supreme Court Reprimand  3 ATTORNEYS
//   BLOMQVIST, BARRY L  A19-1461  BIERDORF, DANIEL J  A20-0875
//
// In the older format, the attorney table is on the page AFTER the DETERMINATION header,
// separated by a page marker (-- N of M --). We handle both by:
//   1. Scanning the full text for DETERMINATION DATES to capture calYear
//   2. Parsing all pages after the OLPR SUMMARY for attorney entries
//   3. Handling both single-column and two-column line formats

export function extractEntriesFromText(fullText, pdfUrl) {
  const pages = fullText.split(/--\s+\d+\s+of\s+\d+\s+--/);
  const records = [];

  // Find all OLPR SUMMARY start pages with their determination years
  // Each summary may span multiple pages (header page + attorney table page(s))
  const summaryStarts = [];
  for (let i = 0; i < pages.length; i++) {
    if (/OLPR\s+SUMMARY\s+OF\s+PUBLIC\s+MATTERS/i.test(pages[i])) {
      const dateMatch = pages[i].match(DET_DATE_RE);
      const calYear = dateMatch ? dateMatch[1] : null;
      summaryStarts.push({ pageIdx: i, calYear });
    }
  }

  for (const { pageIdx, calYear } of summaryStarts) {
    const orderDate = calYear ? `${calYear}-01-01` : null;

    // Collect the header page plus the next 2 pages (the attorney table may span them)
    const sectionText = pages.slice(pageIdx, pageIdx + 3).join('\n');
    const lines = sectionText.split('\n').map((l) => l.trim()).filter(Boolean);

    let currentDiscipline = null;

    for (const line of lines) {
      // Skip appendix page labels like "A. 13" or "A. 14"
      if (/^A\.\s+\d+$/.test(line)) continue;

      // Detect new-format section header: "Supreme Court Disbarment X ATTORNEYS Y FILES"
      if (/\d+\s+ATTORNEYS?\s+\d+\s+FILES?/i.test(line)) {
        currentDiscipline = sectionHeaderToDiscipline(line);
        continue;
      }

      // Detect old-format section header: "Supreme Court Disbarment  4 ATTORNEYS  ..."
      // (no FILES count on same token — just X ATTORNEYS)
      if (/\d+\s+ATTORNEYS?\b/i.test(line) && !/FILES?/i.test(line)) {
        // May have multiple sections on one line (two-column). Parse left portion.
        const disc = sectionHeaderToDiscipline(line);
        if (disc) currentDiscipline = disc;
        continue;
      }

      // Non-discipline sections (Reinstatement, Dismissal) — null out discipline
      if (/^(Reinstate|Dismissal)/i.test(line) && !/\d+\s+ATTORNEYS?/i.test(line)) {
        currentDiscipline = null;
        continue;
      }

      if (!currentDiscipline || !orderDate) continue;

      // Attorney line(s) may contain one or two entries (two-column old format).
      // Split on double-tab or multiple spaces between two "LAST, FIRST" patterns.
      // We extract ALL case-number occurrences from the line and the name before each.
      const segments = splitAthleteLineSegments(line);
      for (const { nameRaw, disciplineOverride } of segments) {
        if (!nameRaw || nameRaw.length < 3) continue;
        // disciplineOverride may come from an inline section header in same line (old format)
        const disc = disciplineOverride || currentDiscipline;
        const fullName = normalizeName(nameRaw);
        if (!fullName || fullName.length < 4) continue;
        const barNumber = deterministicBarNumber(fullName, orderDate);
        records.push({
          bar_number: barNumber,
          full_name: fullName,
          order_date: orderDate,
          effective_date: null,
          discipline_type: disc,
          discipline_raw: line.slice(0, 500),
          violation_summary: null,
          order_url: null,
          source_url: pdfUrl,
          calendar_year: calYear ? parseInt(calYear, 10) : null,
        });
      }
    }
  }

  return records;
}

// Split a PDF line that may contain one or two attorney entries (old two-column format).
// Returns array of { nameRaw, disciplineOverride }.
function splitAthleteLineSegments(line) {
  // Find all case number positions in the line
  const matches = [...line.matchAll(new RegExp(CASE_NUM_RE.source, 'g'))];
  if (matches.length === 0) return [];

  const results = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const prevEnd = i === 0 ? 0 : (matches[i - 1].index + matches[i - 1][0].length);
    const nameRaw = line.slice(prevEnd, m.index).trim().replace(/\s+/g, ' ');
    // Check if the name segment contains a section header keyword (two-column layout)
    // e.g. "Supreme Court Reprimand  3 ATTORNEYS  BIERDORF, DANIEL J"
    let disciplineOverride = null;
    if (/\d+\s+ATTORNEYS?\b/i.test(nameRaw)) {
      disciplineOverride = sectionHeaderToDiscipline(nameRaw);
      // Extract the actual name part after the header text
      // Find the last all-caps token run that looks like a name
      const cleaned = nameRaw.replace(/.*\d+\s+ATTORNEYS?\b\s*/i, '');
      results.push({ nameRaw: cleaned.trim(), disciplineOverride });
    } else {
      results.push({ nameRaw, disciplineOverride: null });
    }
  }
  return results;
}

// ── HTTP + PDF fetch ───────────────────────────────────────────────────────────

function politeDelay() {
  return sleep(800 + Math.floor(Math.random() * 800));
}

async function fetchBuffer(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function parsePdf(url) {
  let buf;
  try {
    buf = await fetchBuffer(url);
  } catch (err) {
    console.error(`[mnbar] fetch failed ${url} — ${err.message}`);
    return [];
  }
  try {
    const parser = new PDFParse({ data: buf });
    const { text } = await parser.getText();
    const records = extractEntriesFromText(text, url);
    console.error(`[mnbar] ${url} — ${records.length} entries (${buf.length} bytes)`);
    return records;
  } catch (err) {
    console.error(`[mnbar] parse failed ${url} — ${err.message}`);
    return [];
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const allYears = Object.keys(PDF_URLS).map(Number).sort();
  const out = { apply: false, years: allYears, limit: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--year') {
      const y = parseInt(args[++i], 10);
      if (!PDF_URLS[y]) {
        console.error(`[mnbar] unknown year ${y}. Available: ${allYears.join(', ')}`);
        process.exit(1);
      }
      out.years = [y];
    } else if (a === '--limit') {
      out.limit = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(
        fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 27).join('\n') + '\n',
      );
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── DB load ────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mn`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_mn`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_mn (
        jurisdiction   char(2), bar_number text, full_name text,
        first_name     text,    last_name  text, admission_date date,
        current_status text,    city       text, source_url text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_mn (
        jurisdiction      char(2), bar_number text, full_name text,
        order_date        date,    effective_date date,
        discipline_type   text,    discipline_raw text,
        violation_summary text,    order_url text, source_url text
      );
    `);

    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const parts = r.full_name.split(/\s+/);
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: parts.length > 1 ? parts.slice(0, -1).join(' ') : null,
          last_name: parts[parts.length - 1],
          source_url: r.source_url,
        });
      }
    }

    await bulkCopyRows(
      client,
      '_stg_attorneys_mn',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
        'admission_date', 'current_status', 'city', 'source_url'],
      [...byBar.values()].map((a) => [
        a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
        null, null, null, a.source_url,
      ]),
    );

    await bulkCopyRows(
      client,
      '_stg_discipline_mn',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
        'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      records.map((r) => [
        JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
        r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
      ]),
    );

    const ua = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_mn
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,  public.attorneys.last_name),
        source_url   = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id;
    `);
    console.error(`[db] attorneys upserted: ${ua.rowCount}`);

    const ie = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_mn s
      JOIN public.attorneys a ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${ie.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mn, public._stg_discipline_mn`);
  } finally {
    await cleanup();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[mnbar] start — apply=${OPTS.apply} years=${OPTS.years.join(',')}`);

  const allRecords = [];
  for (let i = 0; i < OPTS.years.length; i++) {
    const year = OPTS.years[i];
    const records = await parsePdf(PDF_URLS[year]);
    allRecords.push(...records);
    if (i < OPTS.years.length - 1) await politeDelay();
  }

  const limited = OPTS.limit ? allRecords.slice(0, OPTS.limit) : allRecords;
  console.error(`[mnbar] collected ${limited.length} discipline rows`);
  for (const r of limited.slice(0, 8)) {
    console.error(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date}) cal_year=${r.calendar_year}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[mnbar] dry-run — pass --apply to write to DB`);
    return;
  }
  if (limited.length === 0) {
    console.error(`[mnbar] no records — nothing to load`);
    return;
  }

  await load(limited);
  console.error(`[mnbar] done`);
}

main().catch((err) => { console.error(err); process.exit(1); });
