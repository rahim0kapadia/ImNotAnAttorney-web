// csv-bulk-checked: https://www.mywsba.org/personifyebusiness/DisciplineNoticeDirectory.aspx
// Template: scripts/ingest/scrape-calbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Washington State Bar Association (WSBA) — disciplinary actions scraper.
//
// Source (confirmed 2026-04-25 via live DOM inspection):
//   https://www.mywsba.org/personifyebusiness/DisciplineNoticeDirectory.aspx
//   ASP.NET WebForms with __VIEWSTATE postback. Requires at least one search
//   criterion (empty search returns "provide at least one search criteria").
//   Year dropdowns only go back to 1996; use year-from=1996 as broadest range.
//   Results table id: dnn_ctr2981_DNNWebControlContainer_ctl00_dg
//   Columns positional (no class names): [0] Bar#, [1] First, [2] Last, [3] Action, [4] Effective Date
//   Bar# cell anchor href: DisciplineNoticeDirectory/DisciplineNoticeDetail.aspx?dID=N
//   Bar numbers: raw values like "000009701210", "10112LPO", "10138"
//     → strip leading zeros + non-digit suffix to get canonical numeric string.
//   Pagination via __doPostBack "Next Page >" / "Last >>" links.
//   ~1808 total records (2026-04-25), ~22 rows/page ≈ 83 pages.
//   Date format: MM/DD/YYYY (pre-2000 dates exist in corpus).
//
// Actual TD class names observed: none (all empty — positional columns only).
//
// Usage:
//   node scripts/ingest/scrape-wabar-discipline.mjs                        # dry-run
//   node scripts/ingest/scrape-wabar-discipline.mjs --apply                # write to DB
//   node scripts/ingest/scrape-wabar-discipline.mjs --start-page 5        # resume
//   node scripts/ingest/scrape-wabar-discipline.mjs --limit 50            # cap rows
//   node scripts/ingest/scrape-wabar-discipline.mjs --headful             # show browser
//   node scripts/ingest/scrape-wabar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_wa + _stg_discipline_wa via
// bulkCopyRows, merged into public.attorneys + public.attorney_discipline_events.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.mywsba.org/personifyebusiness';
const LIST_URL = BASE_URL + '/DisciplineNoticeDirectory.aspx';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'WA';

// Form field IDs (DNN prefix confirmed 2026-04-25)
const PREFIX = 'dnn_ctr2981_DNNWebControlContainer_ctl00_';
const FIELD = {
  yearFrom: PREFIX + 'ddYearFrom',
  yearTo:   PREFIX + 'ddYearTo',
  submit:   PREFIX + 'btnSubmit',
};

// Results grid ID (confirmed 2026-04-25)
const GRID_ID = PREFIX + 'dg';

// ── Discipline normalization ─────────────────────────────────────────────────
//
// WA action labels observed in ActionType dropdown + data rows (2026-04-25):
//   Disbarment                         → disbarment
//   Resignation in Lieu of Disbarment  → resignation_with_charges
//   Resignation in Lieu of Discipline  → resignation_with_charges
//   Suspension                         → suspension
//   Interim Suspension                 → interim_suspension
//   Reprimand                          → public_reprimand
//   Censure                            → censure
//   Admonition                         → admonition
//   Reciprocal Discipline              → reciprocal_discipline
//   Revocation                         → suspension  (LPO license revocations)
//   Voluntary Cancellation in Lieu...  → resignation_with_charges

const DISCIPLINE_PATTERNS = [
  // More-specific multi-word patterns must come before broad single-word ones.
  // "Resignation in Lieu of Disbarment" contains "disbar" — check resign first.
  [/resign\w*\s+in\s+lieu/i, 'resignation_with_charges'],
  [/voluntary\s+cancell/i,   'resignation_with_charges'],
  [/\bdisbar/i,              'disbarment'],
  [/interim\s+suspen/i,      'interim_suspension'],
  [/\bsuspen/i,             'suspension'],
  [/\brevoc/i,              'suspension'],     // LPO revocations → closest enum
  [/\bprobation/i,          'probation'],
  [/\breprimand/i,          'public_reprimand'],
  [/\bcensure/i,            'censure'],
  [/\badmonition/i,         'admonition'],
  [/reciprocal/i,           'reciprocal_discipline'],
];

export function normalizeDiscipline(raw) {
  if (!raw) return { type: 'unknown', raw: null };
  const text = raw.trim();
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text };
  }
  return { type: 'unknown', raw: text };
}

// ── Date parsing ─────────────────────────────────────────────────────────────
//
// WSBA dates are MM/DD/YYYY. Pre-2000 dates exist — do NOT assume year >= 2000.

export function parseDateMM_DD_YYYY(text) {
  if (!text) return null;
  const clean = text.trim();
  const m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day   = m[2].padStart(2, '0');
    const year  = m[3];
    return `${year}-${month}-${day}`;
  }
  // Fallback: ISO yyyy-mm-dd (tests may pass this format)
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return clean;
  return null;
}

// ── Bar number normalization ─────────────────────────────────────────────────
//
// Raw values: "000009701210", "10112LPO", "10138"
// Extract leading digit block, strip leading zeros, keep at least '0'.

export function normalizeBarNumber(raw) {
  if (!raw) return null;
  const clean = raw.trim();
  const m = clean.match(/^(\d+)/);
  if (!m) return null;
  return m[1].replace(/^0+/, '') || '0';
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    apply:     false,
    startPage: 1,
    limit:     Infinity,
    headful:   false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      opts.apply = true;
    } else if (a === '--headful') {
      opts.headful = true;
    } else if (a === '--start-page') {
      const n = parseInt(args[++i], 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`--start-page must be a positive integer`);
      opts.startPage = n;
    } else if (a === '--limit') {
      const n = parseInt(args[++i], 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`--limit must be a positive integer`);
      opts.limit = n;
    } else if (a === '--help' || a === '-h') {
      const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 35).join('\n');
      process.stdout.write(lines + '\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

// ── Polite delay 800–1600ms ───────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

// ── Row extraction from a loaded results page ────────────────────────────────
//
// Exported so tests can call it against fixture HTML via jsdom / cheerio.

export function extractRowsFromHtml(html) {
  // Parse with a minimal regex-free approach: locate the grid table,
  // then walk <tr> elements. We use cheerio-style string parsing for tests,
  // but in production this runs inside page.evaluate() instead.
  // This function is used ONLY in tests with fixture HTML (via cheerio shim).
  throw new Error('extractRowsFromHtml is a test-shim entry point; call extractRowsFromPage in production');
}

// In-browser extraction (called via page.evaluate())
export function _buildExtractorFn(gridId, baseUrl) {
  // Returns a serialisable function string for page.evaluate
  return function extractRows(gridId, baseUrl) {
    const table = document.getElementById(gridId);
    if (!table) return [];
    const trs = Array.from(table.querySelectorAll('tr')).filter(
      (r) => !r.classList.contains('gridHeader'),
    );
    return trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      if (cells.length < 5) return null;
      const [barCell, firstCell, lastCell, actionCell, dateCell] = cells;
      const barAnchor = barCell.querySelector('a');
      const barRaw = barAnchor
        ? barAnchor.textContent.trim()
        : barCell.textContent.trim();
      let orderUrl = null;
      if (barAnchor) {
        const href = barAnchor.getAttribute('href') || '';
        orderUrl = href.startsWith('http')
          ? href
          : baseUrl + '/DisciplineNoticeDirectory/' + href.replace(/^.*DisciplineNoticeDetail/, 'DisciplineNoticeDetail');
      }
      const dateSpan = dateCell.querySelector('span');
      const dateRaw = (dateSpan || dateCell).textContent.trim();
      return {
        bar_number_raw: barRaw,
        first_name:     firstCell.textContent.trim(),
        last_name:      lastCell.textContent.trim(),
        action_raw:     actionCell.textContent.trim(),
        date_raw:       dateRaw,
        order_url:      orderUrl,
        source_url:     window.location.href,
      };
    }).filter(Boolean);
  };
}

// Normalise raw row objects from browser
function normalizeRows(rows, fallbackSourceUrl) {
  return rows.map((r) => {
    const barNumber = normalizeBarNumber(r.bar_number_raw);
    const { type: disciplineType, raw: disciplineRaw } = normalizeDiscipline(r.action_raw);
    const effectiveDate = parseDateMM_DD_YYYY(r.date_raw);
    return {
      bar_number_raw:  r.bar_number_raw,
      bar_number:      barNumber,
      first_name:      r.first_name,
      last_name:       r.last_name,
      full_name:       `${r.first_name} ${r.last_name}`.trim(),
      discipline_type: disciplineType,
      discipline_raw:  disciplineRaw,
      effective_date:  effectiveDate,
      order_date:      effectiveDate,
      order_url:       r.order_url,
      source_url:      r.source_url || fallbackSourceUrl,
    };
  });
}

// ── Scrape ───────────────────────────────────────────────────────────────────

async function scrape(opts) {
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: !opts.headful });
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();

  const records = [];
  let pageNum = 1;

  try {
    process.stderr.write(`[wsba] Loading search form...\n`);
    await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // Submit with broadest available year range
    const toYear = String(new Date().getFullYear());
    await page.selectOption('#' + FIELD.yearFrom, '1996');
    await page.selectOption('#' + FIELD.yearTo, toYear);

    process.stderr.write(`[wsba] Submitting search (1996–${toYear})...\n`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      page.click('#' + FIELD.submit),
    ]);

    // Skip pages before startPage
    for (let skip = 1; skip < opts.startPage; skip++) {
      process.stderr.write(`[wsba] Skipping page ${skip}...\n`);
      const moved = await clickNext(page);
      if (!moved) {
        process.stderr.write(`[wsba] No next page at skip ${skip}.\n`);
        await browser.close();
        return records;
      }
      await politeDelay();
      pageNum++;
    }

    // Main scrape loop
    while (records.length < opts.limit) {
      process.stderr.write(`[wsba] Page ${pageNum}...\n`);

      // Wait for grid
      try {
        await page.waitForSelector('#' + GRID_ID, { timeout: 15000 });
      } catch {
        process.stderr.write(`[wsba] Grid not found on page ${pageNum} — stopping.\n`);
        break;
      }

      const extractFn = _buildExtractorFn();
      const rawRows = await page.evaluate(extractFn, GRID_ID, BASE_URL);

      if (rawRows.length === 0) {
        process.stderr.write(`[wsba] Empty page ${pageNum} — stopping.\n`);
        break;
      }

      const normalized = normalizeRows(rawRows, page.url());
      process.stderr.write(`[wsba] Page ${pageNum}: ${normalized.length} rows\n`);

      if (pageNum === opts.startPage) {
        for (const r of normalized.slice(0, 3)) {
          process.stderr.write(
            `  · [${r.bar_number_raw}] ${r.first_name} ${r.last_name} — ${r.discipline_type} (${r.effective_date || '?'})\n`,
          );
        }
      }

      for (const r of normalized) {
        records.push(r);
        if (records.length >= opts.limit) break;
      }

      if (records.length >= opts.limit) break;

      const moved = await clickNext(page);
      if (!moved) {
        process.stderr.write(`[wsba] No "Next Page" link — last page reached.\n`);
        break;
      }

      await politeDelay();
      pageNum++;
    }
  } finally {
    await browser.close();
  }

  return records;
}

// Click "Next Page >" — returns true if link existed.
async function clickNext(page) {
  const link = await page.$('a:text("Next Page >")');
  if (!link) return false;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
    link.click(),
  ]);
  return true;
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();

  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_wa`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_wa`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_wa (
        jurisdiction   char(2),
        bar_number     text,
        full_name      text,
        first_name     text,
        last_name      text,
        source_url     text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_wa (
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

    // De-dupe attorneys by bar_number
    const byBar = new Map();
    for (const r of records) {
      if (!r.bar_number) continue;
      if (!byBar.has(r.bar_number)) {
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number:   r.bar_number,
          full_name:    r.full_name,
          first_name:   r.first_name,
          last_name:    r.last_name,
          source_url:   r.source_url,
        });
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name,
      a.first_name,  a.last_name,  a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_wa',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name', 'source_url'],
      attorneyRows,
    );

    const disciplineRows = records
      .filter((r) => r.bar_number)
      .map((r) => [
        JURISDICTION, r.bar_number, r.full_name,
        r.order_date, r.effective_date,
        r.discipline_type, r.discipline_raw,
        null,           // violation_summary not on list page
        r.order_url,    r.source_url,
      ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_wa',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      disciplineRows,
    );

    // Upsert attorneys
    const upsertA = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             source_url, NOW()
      FROM _stg_attorneys_wa
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        source_url   = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id;
    `);
    process.stderr.write(`[db] attorneys upserted: ${upsertA.rowCount}\n`);

    // Idempotent insert — ON CONFLICT DO NOTHING
    const insertD = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name,
         order_date, effective_date, discipline_type, discipline_raw,
         violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name,
             s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary,
             s.order_url, s.source_url
      FROM _stg_discipline_wa s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[db] discipline events inserted: ${insertD.rowCount}\n`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_wa, public._stg_discipline_wa`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  process.stderr.write(
    `[wsba] start — apply=${opts.apply} startPage=${opts.startPage} ` +
    `limit=${opts.limit} headful=${opts.headful}\n`,
  );

  const records = await scrape(opts);
  process.stderr.write(`[wsba] collected ${records.length} rows\n`);

  if (opts.apply) {
    await load(records);
    process.stderr.write(`[wsba] done\n`);
  } else {
    process.stderr.write(`[wsba] dry-run — pass --apply to write to DB\n`);
  }
}

// Run only when executed directly (not when imported by tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n' + (err.stack || '') + '\n');
    process.exit(1);
  });
}
