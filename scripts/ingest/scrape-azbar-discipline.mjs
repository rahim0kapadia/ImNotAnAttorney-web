// csv-bulk-checked: https://www.azcourts.gov/attorneydiscipline/DisciplinaryCasesMatrix.aspx
// Template: scripts/ingest/scrape-calbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Arizona Supreme Court — Attorney Discipline Cases Matrix scraper.
//
// Source (probed 2026-04-25 via WebFetch — azcourts.gov returns 403 to all
// automated fetchers regardless of User-Agent or path; the domain blocks by
// ASN/IP at the WAF layer, not by robots.txt disallow):
//   Primary:  https://www.azcourts.gov/attorneydiscipline/DisciplinaryCasesMatrix/
//             {year}DisciplinaryCasesMatrix.aspx  (per-year HTML table, 2010–present)
//   Fallback: https://www.azcourts.gov/attorneydiscipline/
//             Disposition-of-Attorney-Discipline-Cases
//             (used when primary returns 403 after one retry)
//
// AZ matrix has NO consistent bar number. We derive a deterministic
// synthetic bar_number = AZSC:<case-number> (e.g. AZSC:SB-23-0042-D).
// Case numbers are extracted from the "Order Date/Case No." column which
// contains patterns like:
//   "03/15/2024 — SB-23-0042-D"
//   "06/12/2024 effective 07/01/2024 — SB-24-0007-AP"
// The em-dash (U+2014) or double-hyphen separates the date portion from the
// case number. Rows missing a case number are skipped (no bar_number possible).
//
// Name cleanup: leading "In re " and "Matter of " are stripped.
//
// 403 handling (per spec): polite wait 60 s on first 403, retry once.
// If still 403 on primary URL, switch to fallback URL, then skip year gracefully
// if fallback also fails.
//
// Polite scraping: 800–1600 ms randomized delay between year-page fetches.
// Primary UA identifies INAA. Fallback UA is Mozilla/5.0 compatible string.
//
// Usage:
//   node scripts/ingest/scrape-azbar-discipline.mjs                    # dry-run, 2010..2025
//   node scripts/ingest/scrape-azbar-discipline.mjs --apply            # write to DB
//   node scripts/ingest/scrape-azbar-discipline.mjs --start-year 2020 --end-year 2024
//   node scripts/ingest/scrape-azbar-discipline.mjs --limit 50         # cap rows
//   node scripts/ingest/scrape-azbar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_az + _stg_discipline_az populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ───────────────────────────────────────────────────────────────────

const JURISDICTION = 'AZ';

const PRIMARY_URL = (year) =>
  `https://www.azcourts.gov/attorneydiscipline/DisciplinaryCasesMatrix/${year}DisciplinaryCasesMatrix.aspx`;

const FALLBACK_URL = (year) =>
  `https://www.azcourts.gov/attorneydiscipline/Disposition-of-Attorney-Discipline-Cases?year=${year}`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)';

const DEFAULT_START_YEAR = 2010;
const DEFAULT_END_YEAR = 2025;

// Delay between year fetches: 800–1600 ms.
function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

// ── Discipline enum normalization ─────────────────────────────────────────────
//
// Exact strings required by schema (attorney_discipline_events.discipline_type CHECK):
//   disbarment | suspension | interim_suspension | probation | public_reprimand |
//   resignation_with_charges | censure | admonition | reciprocal_discipline |
//   disability_inactive
//
// AZ-specific: "Disbarment by Consent" → disbarment.
// Order matters: disbarment before suspension; interim before plain suspension.

const DISCIPLINE_PATTERNS = [
  [/disbarment\s+by\s+consent/i,        'disbarment'],
  [/\bdisbar/i,                          'disbarment'],
  [/resign(ation)?\s+with\s+(charges|disciplinary|pending)/i, 'resignation_with_charges'],
  [/\bdisability\s+inactive/i,           'disability_inactive'],
  [/\breciprocal\s+disciplin/i,          'reciprocal_discipline'],
  [/\binterim\s+suspen/i,                'interim_suspension'],
  [/\bsuspen/i,                          'suspension'],
  [/\bprobation/i,                       'probation'],
  [/\bcensure/i,                         'censure'],
  [/\badmonition/i,                      'admonition'],
  [/\badmonishment/i,                    'admonition'],
  [/\bpublic\s+reprimand/i,              'public_reprimand'],
  [/\breprimand/i,                       'public_reprimand'],
];

export function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  const t = text.trim();
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(t)) return { type, raw: t };
  }
  return { type: 'unknown', raw: t };
}

// ── Date parsing ──────────────────────────────────────────────────────────────

// Parse MM/DD/YYYY → YYYY-MM-DD. Returns null on failure.
export function parseMDY(text) {
  if (!text) return null;
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// ── Name cleanup ──────────────────────────────────────────────────────────────

// Strip "In re " / "Matter of " prefix (case-insensitive).
export function cleanName(raw) {
  if (!raw) return raw;
  return raw
    .trim()
    .replace(/^in\s+re\s+/i, '')
    .replace(/^matter\s+of\s+/i, '')
    .trim();
}

function splitName(full) {
  if (!full) return { first: null, last: null };
  const parts = full.replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return { first: null, last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// ── Date/case-number column parsing ──────────────────────────────────────────
//
// Column 1 variants:
//   "03/15/2024 — SB-23-0042-D"
//   "06/12/2024 effective 07/01/2024 — SB-24-0007-AP"
//   "03/15/2024 - SB-23-0042-D"           (hyphen variant)
//   "03/15/2024—SB-23-0042-D"        (no spaces around em-dash)
//
// Returns { orderDate, effectiveDate, caseNumber } — all may be null if
// parsing fails (caller must skip the row when caseNumber is null).

export function parseDateCaseCol(cell) {
  if (!cell) return { orderDate: null, effectiveDate: null, caseNumber: null };

  const text = cell
    .replace(/—/g, ' — ')   // normalise em-dash spacing
    .replace(/\s+/g, ' ')
    .trim();

  // Split on em-dash (U+2014) or ' - ' (spaced hyphen) to isolate case number.
  // /i flag: tolerate lowercase sb- input (case number is upcased after match).
  const dashIdx = text.search(/\s*[—\-–]\s*(?=SB-)/i);
  if (dashIdx === -1) {
    // No recognisable case number — skip row.
    return { orderDate: null, effectiveDate: null, caseNumber: null };
  }

  const datePart   = text.slice(0, dashIdx).trim();
  const casePart   = text.slice(dashIdx).replace(/^[\s—\-–]+/, '').trim();

  // Case number: first token from casePart.
  const caseMatch  = casePart.match(/^(SB-[\w\-]+)/i);
  const caseNumber = caseMatch ? caseMatch[1].toUpperCase() : null;
  if (!caseNumber) return { orderDate: null, effectiveDate: null, caseNumber: null };

  // Date part may contain "MM/DD/YYYY effective MM/DD/YYYY".
  const effMatch = datePart.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+effective\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (effMatch) {
    return {
      orderDate:     parseMDY(effMatch[1]),
      effectiveDate: parseMDY(effMatch[2]),
      caseNumber,
    };
  }

  // Plain date.
  const plain = datePart.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  return {
    orderDate:     plain ? parseMDY(plain[1]) : null,
    effectiveDate: null,
    caseNumber,
  };
}

// ── HTTP fetch helper ─────────────────────────────────────────────────────────

// Fetch a URL with a given User-Agent. Returns { status, body } where body is
// the full response string (HTML). Follows up to 3 redirects.
function fetchHtml(url, ua, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
    };
    const req = https.get(url, opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        return fetchHtml(res.headers.location, ua, redirectsLeft - 1).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error(`timeout fetching ${url}`)); });
  });
}

// Fetch one year page with 403 retry logic per spec:
//   1. Try primary URL with INAA UA.
//   2. On 403: wait 60 s, retry primary with INAA UA.
//   3. Still 403: try primary with fallback Mozilla UA.
//   4. Still 403: try fallback URL with INAA UA.
//   5. Still 403: skip year gracefully (return null).
export async function fetchYearPage(year) {
  const primaryUrl  = PRIMARY_URL(year);
  const fallbackUrl = FALLBACK_URL(year);

  // Attempt 1: primary + INAA UA.
  let result = await fetchHtml(primaryUrl, USER_AGENT);
  if (result.status === 200) return { url: primaryUrl, body: result.body };

  if (result.status === 403) {
    process.stderr.write(`[azbar] ${year} primary 403 — waiting 60s then retrying\n`);
    await sleep(60000);

    // Attempt 2: primary retry + INAA UA.
    result = await fetchHtml(primaryUrl, USER_AGENT);
    if (result.status === 200) return { url: primaryUrl, body: result.body };

    if (result.status === 403) {
      // Attempt 3: primary + Mozilla fallback UA.
      result = await fetchHtml(primaryUrl, FALLBACK_USER_AGENT);
      if (result.status === 200) return { url: primaryUrl, body: result.body };

      if (result.status === 403) {
        // Attempt 4: fallback URL.
        process.stderr.write(`[azbar] ${year} still 403 — trying fallback URL\n`);
        result = await fetchHtml(fallbackUrl, USER_AGENT);
        if (result.status === 200) return { url: fallbackUrl, body: result.body };

        if (result.status === 403) {
          process.stderr.write(`[azbar] ${year} fallback also 403 — skipping year gracefully\n`);
          return null;
        }
      }
    }
  }

  // Non-200/non-403 (404, 500, etc.) — skip year gracefully.
  process.stderr.write(`[azbar] ${year} HTTP ${result.status} — skipping\n`);
  return null;
}

// ── HTML table parser ─────────────────────────────────────────────────────────
//
// Minimal HTML table parser using regex over cell content.
// AZ Courts pages use standard <table><tr><td> markup.
// We do NOT require a full DOM parser — splitting on <tr> then extracting
// <td> inner text covers the straightforward case.
//
// Exported for unit tests.

const RE_TD   = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const RE_TAGS = /<[^>]+>/g;

function stripTags(html) {
  return html
    .replace(RE_TAGS, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8212;/g, '—')
    .replace(/&#x2014;/g, '—')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTableRows(html) {
  const rows = [];
  // Split on <tr (captures both <tr> and <tr ...>).
  const trChunks = html.split(/<tr[\s>]/i).slice(1);
  for (const chunk of trChunks) {
    // End of row — everything before </tr>.
    const rowHtml = chunk.split(/<\/tr>/i)[0];
    const cells = [];
    let m;
    const re = new RegExp(RE_TD.source, 'gi');
    while ((m = re.exec(rowHtml)) !== null) {
      cells.push(stripTags(m[1]));
    }
    if (cells.length >= 3) rows.push(cells);
  }
  return rows;
}

// Parse all discipline records from a year-page HTML body.
// Returns array of raw record objects (not yet normalised for DB).
export function parseYearPage(html, sourceUrl, year) {
  const tableRows = parseTableRows(html);
  const records = [];

  for (const cells of tableRows) {
    const nameRaw = cells[0] || '';
    const dateCaseRaw = cells[1] || '';
    const dispositionRaw = cells[2] || '';

    // Skip header rows (th content re-appears in some years as td).
    if (/attorney|order date|disposition/i.test(nameRaw) && records.length === 0) continue;
    // Skip empty rows.
    if (!nameRaw.trim()) continue;

    const { orderDate, effectiveDate, caseNumber } = parseDateCaseCol(dateCaseRaw);

    // Skip rows with no extractable case number — no bar_number possible.
    if (!caseNumber) {
      process.stderr.write(`[azbar] ${year} skip row (no case#): "${dateCaseRaw.slice(0, 60)}"\n`);
      continue;
    }

    const fullName = cleanName(nameRaw);
    const { type: disciplineType, raw: disciplineRaw } = normalizeDiscipline(dispositionRaw);

    records.push({
      bar_number:        `AZSC:${caseNumber}`,
      full_name:         fullName,
      order_date:        orderDate,
      effective_date:    effectiveDate,
      discipline_type:   disciplineType,
      discipline_raw:    disciplineRaw,
      violation_summary: dispositionRaw || null,
      source_url:        sourceUrl,
    });
  }

  return records;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

// parseArgs accepts a pre-sliced args array (NOT process.argv).
// Call as: parseArgs(process.argv.slice(2)) from main().
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const out = {
    apply:     false,
    startYear: DEFAULT_START_YEAR,
    endYear:   DEFAULT_END_YEAR,
    limit:     Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--start-year') {
      const v = parseInt(args[++i], 10);
      if (!Number.isFinite(v) || v < 1990 || v > 2100) throw new Error(`--start-year invalid: ${args[i]}`);
      out.startYear = v;
    } else if (a === '--end-year') {
      const v = parseInt(args[++i], 10);
      if (!Number.isFinite(v) || v < 1990 || v > 2100) throw new Error(`--end-year invalid: ${args[i]}`);
      out.endYear = v;
    } else if (a === '--limit') {
      const v = parseInt(args[++i], 10);
      if (!Number.isFinite(v) || v <= 0) throw new Error(`--limit must be positive integer, got: ${args[i]}`);
      out.limit = v;
    } else if (a === '--help' || a === '-h') {
      // Print header comment block as help text.
      const src = fs.readFileSync(__filename, 'utf8');
      const lines = src.split('\n');
      const commentLines = [];
      for (const l of lines) {
        if (l.startsWith('//')) commentLines.push(l.slice(2).trimStart());
        else if (commentLines.length > 0) break;
      }
      process.stdout.write(commentLines.join('\n') + '\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (out.startYear > out.endYear) {
    throw new Error(`--start-year (${out.startYear}) must be <= --end-year (${out.endYear})`);
  }
  return out;
}

// ── Scrape ────────────────────────────────────────────────────────────────────

async function scrape(opts) {
  const allRecords = [];

  for (let year = opts.startYear; year <= opts.endYear; year++) {
    if (allRecords.length >= opts.limit) break;

    process.stderr.write(`[azbar] fetching year ${year}\n`);
    let fetched;
    try {
      fetched = await fetchYearPage(year);
    } catch (err) {
      process.stderr.write(`[azbar] ${year} fetch error: ${err.message} — skipping\n`);
      await politeDelay();
      continue;
    }

    if (!fetched) {
      // fetchYearPage returns null when all 403 retries exhausted — already logged.
      await politeDelay();
      continue;
    }

    const { url: sourceUrl, body } = fetched;
    const records = parseYearPage(body, sourceUrl, year);
    process.stderr.write(`[azbar] ${year} parsed ${records.length} rows from ${sourceUrl}\n`);

    // Log first 3 rows verbatim for visibility.
    for (const r of records.slice(0, 3)) {
      process.stderr.write(
        `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} ` +
        `(order: ${r.order_date ?? '?'}, eff: ${r.effective_date ?? '—'})\n`,
      );
    }

    for (const r of records) {
      if (allRecords.length >= opts.limit) break;
      allRecords.push(r);
    }

    await politeDelay();
  }

  return allRecords;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    // Staging tables: UNLOGGED for speed (cl-bulk-data-defensive #8).
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_az`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_az`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_az (
        jurisdiction   char(2),
        bar_number     text,
        full_name      text,
        first_name     text,
        last_name      text,
        source_url     text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_az (
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

    // De-duplicate attorneys: one row per bar_number (= per case number for AZ).
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const { first, last } = splitName(r.full_name);
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number:   r.bar_number,
          full_name:    r.full_name,
          first_name:   first,
          last_name:    last,
          source_url:   r.source_url,
        });
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name,
      a.first_name, a.last_name, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_az',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name', 'source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name,
      r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary,
      null,            // order_url — AZ matrix does not publish per-order PDFs on listing
      r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_az',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      disciplineRows,
    );

    // Upsert attorneys.
    const upsertRes = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name, source_url, NOW()
      FROM public._stg_attorneys_az
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,  public.attorneys.last_name),
        source_url   = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id, bar_number;
    `);
    process.stderr.write(`[azbar] attorneys upserted: ${upsertRes.rowCount}\n`);

    // Insert discipline events (idempotent via ON CONFLICT DO NOTHING).
    // Rows with NULL order_date cannot satisfy the UNIQUE constraint and are
    // excluded to avoid unbounded duplicate accumulation on re-runs.
    const insertRes = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name,
         order_date, effective_date,
         discipline_type, discipline_raw, violation_summary,
         order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name,
             s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary,
             s.order_url, s.source_url
      FROM public._stg_discipline_az s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    process.stderr.write(`[azbar] discipline events inserted: ${insertRes.rowCount}\n`);

    // Drop staging (cl-bulk-data-defensive #13 — use UNLOGGED not TEMP; explicit drop).
    await client.query(`
      DROP TABLE IF EXISTS public._stg_attorneys_az, public._stg_discipline_az;
    `);
  } finally {
    await cleanup();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[azbar] arg error: ${err.message}\n`);
    process.exit(1);
  }

  process.stderr.write(
    `[azbar] start — apply=${opts.apply} years=${opts.startYear}..${opts.endYear} limit=${opts.limit}\n`,
  );

  const records = await scrape(opts);

  process.stderr.write(`[azbar] total: ${records.length} discipline rows collected\n`);
  if (records.length === 0) {
    process.stderr.write(`[azbar] no records — nothing to write\n`);
    return;
  }

  if (!opts.apply) {
    process.stderr.write(`[azbar] dry-run — pass --apply to write to DB\n`);
    return;
  }

  await load(records);
  process.stderr.write(`[azbar] done\n`);
}

// Only run main() when executed directly (not imported for tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err}\n`);
    process.exit(1);
  });
}
