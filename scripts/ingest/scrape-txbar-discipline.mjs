// csv-bulk-checked: none-exists — Texas Bar publishes discipline via monthly Texas Bar Journal articles; no CSV/API, confirmed 2026-04-24.
// Template: scripts/ingest/scrape-flbar-discipline.mjs (fetch + regex + bulkCopyRows pattern)
// Expert: alex-hormozi (Attorney-Vetting $47 TX extension)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN)
//
// Texas Bar disciplinary actions scraper — PDF-based via UH Law archive.
//
// Source (confirmed 2026-04-24):
//   Archive: https://www.law.uh.edu/libraries/ethics/attydiscipline/[year]daindex.html
//   Monthly: https://www.law.uh.edu/libraries/ethics/attydiscipline/[year]/[Month][year].pdf
//   Coverage: 2001-2017 (archive last updated 2017; post-2017 requires the Texas
//   Bar Journal digital platform at lsc-pagepro.mydigitalpublication.com which
//   uses per-issue numeric content IDs — out of scope here).
//
// Entry pattern (verbatim from PDFs):
//   "On <Month> <day>, <year>, <Name> [#<bar>], <age>, of <city>, was <discipline>."
//   followed by a narrative paragraph describing the violations.
//
// Usage:
//   node scripts/ingest/scrape-txbar-discipline.mjs                   # dry-run, 2014-2017
//   node scripts/ingest/scrape-txbar-discipline.mjs --apply
//   node scripts/ingest/scrape-txbar-discipline.mjs --start-year 2015 --end-year 2017 --apply

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const BASE = 'https://www.law.uh.edu/libraries/ethics/attydiscipline';
const USER_AGENT = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const JURISDICTION = 'TX';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_NUM = Object.fromEntries(MONTHS.map((m, i) => [m.toLowerCase(), String(i + 1).padStart(2, '0')]));

const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+in\s+lieu/i, 'resignation_with_charges'],
  [/\baccepted.*resignation/i, 'resignation_with_charges'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobated/i, 'probation'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\breprimand/i, 'public_reprimand'],
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
  const out = { apply: false, startYear: 2014, endYear: 2017 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-year') out.startYear = parseInt(args[++i], 10);
    else if (a === '--end-year') out.endYear = parseInt(args[++i], 10);
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
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchBuffer(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ── Parse PDF ───────────────────────────────────────────────────────────────

// Anchor: bar number bracket. Walk outward for name (before), date (before
// within ~500 chars via nearest "On <Month> D, YYYY"), city + discipline (after).
const BAR_RE = /\[#(\d{6,10})\]\s*,\s*(?:\d+,\s*)?of\s+([^,]+?)\s*,\s+([^.]+?)\./g;
const ON_DATE_RE = /On\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/g;

// Name extractor: last "Title Case" run within the 80 chars immediately
// preceding the bar bracket. Handles initials (e.g., "David A. Chaumette"),
// hyphens, apostrophes, single-letter middles.
function extractNameBefore(window) {
  // Strip trailing punctuation/space. Walk backwards collecting capitalized tokens.
  const tokens = window.trim().split(/\s+/);
  const name = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (/^[A-Z][A-Za-z.'\-]*\.?$/.test(tok) || /^[A-Z]\.$/.test(tok) || /^(II|III|IV|Jr\.?|Sr\.?)$/.test(tok)) {
      name.unshift(tok);
      if (name.length >= 6) break; // enough
    } else if (name.length >= 2) {
      // hit a non-name token — stop (we have at least first + last)
      break;
    } else {
      // havent started collecting yet, skip (could be "of" / "accepted" / etc)
      continue;
    }
  }
  const fullName = name.join(' ').replace(/,+$/, '').trim();
  if (fullName.length < 4 || fullName.length > 80) return null;
  if (!/\S\s+\S/.test(fullName)) return null; // need at least 2 tokens
  return fullName;
}

function extractEntries(fullText, sourceUrl) {
  // Normalize PDF whitespace: hyphen-break continuations, newline→space, runs→single.
  const t = fullText
    .replace(/-\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');

  // Pre-collect all "On <Month> D, YYYY" anchor positions for date-linking.
  const dateAnchors = [];
  for (const m of t.matchAll(ON_DATE_RE)) {
    const mm = MONTH_NUM[m[1].toLowerCase()];
    if (!mm) continue;
    dateAnchors.push({
      pos: m.index,
      iso: `${m[3]}-${mm}-${String(parseInt(m[2], 10)).padStart(2, '0')}`,
    });
  }
  function nearestDateBefore(pos) {
    let best = null;
    for (const a of dateAnchors) {
      if (a.pos > pos) break;
      if (pos - a.pos <= 400) best = a.iso;
      else if (!best && pos - a.pos <= 800) best = a.iso;
    }
    return best;
  }

  const records = [];
  const seen = new Set();
  for (const m of t.matchAll(BAR_RE)) {
    const [, bar, cityRaw, discRaw] = m;
    const key = `${bar}|${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const nameWindow = t.slice(Math.max(0, m.index - 80), m.index);
    const fullName = extractNameBefore(nameWindow);
    if (!fullName) continue;

    const orderDate = nearestDateBefore(m.index);
    if (!orderDate) continue;

    const city = cityRaw.replace(/\s+/g, ' ').trim();
    if (!city || city.length > 80) continue;

    const { type, raw } = normalizeDiscipline(discRaw);
    if (type === 'unknown') continue;

    records.push({
      bar_number: bar,
      full_name: fullName,
      city,
      effective_date: orderDate,
      order_date: orderDate,
      discipline_type: type,
      discipline_raw: raw,
      violation_summary: discRaw.slice(0, 2000),
      order_url: null,
      source_url: sourceUrl,
    });
  }
  return records;
}

async function parsePdf(url) {
  let buf;
  try {
    buf = await fetchBuffer(url);
  } catch (err) {
    console.error(`[pdf] ${url} — ${err.message}`);
    return [];
  }
  try {
    const parser = new PDFParse({ data: buf });
    const { text } = await parser.getText();
    const records = extractEntries(text, url);
    console.error(`[pdf] ${url} — ${records.length} entries (${buf.length} bytes)`);
    return records;
  } catch (err) {
    console.error(`[pdf] parse failed ${url} — ${err.message}`);
    return [];
  }
}

// ── Main flow ───────────────────────────────────────────────────────────────

async function discoverPdfUrls(year) {
  // Try each month URL directly instead of scraping the HTML index (some
  // months missing from index, some present — enumerate by pattern).
  const urls = [];
  for (const m of MONTHS) {
    urls.push(`${BASE}/${year}/${m}${year}.pdf`);
  }
  return urls;
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_tx`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_tx`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_tx (
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
      CREATE UNLOGGED TABLE public._stg_discipline_tx (
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
        const parts = r.full_name.split(/\s+/);
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : null;
        const last = parts[parts.length - 1];
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
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
      '_stg_attorneys_tx',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_tx',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_tx
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
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
      FROM _stg_discipline_tx s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_tx, public._stg_discipline_tx`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[txbar] start — apply=${OPTS.apply} years=${OPTS.startYear}..${OPTS.endYear}`);

  const records = [];
  for (let year = OPTS.startYear; year <= OPTS.endYear; year++) {
    const pdfUrls = await discoverPdfUrls(year);
    for (const url of pdfUrls) {
      const r = await parsePdf(url);
      records.push(...r);
      await politeDelay();
    }
  }

  console.error(`[txbar] collected ${records.length} discipline rows`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[txbar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[txbar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[txbar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
