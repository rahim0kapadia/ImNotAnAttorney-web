// csv-bulk-checked: https://bbopublic.massbbo.org/web/f/fy2024.pdf (PDF fallback — decisions.massbbo.org returned 403 on first fetch 2026-04-25)
// Template: scripts/ingest/scrape-txbar-discipline.mjs (PDF prose pattern)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// Massachusetts Board of Bar Overseers (BBO) discipline scraper.
//
// Source decision branch (resolved 2026-04-25):
//   PRIMARY  https://decisions.massbbo.org/ → 403 Forbidden; cannot scrape
//   FALLBACK https://bbopublic.massbbo.org/web/f/fy<YYYY>.pdf
//            FY2020..FY2025 (BBO fiscal year ends June 30 each year)
//
// Annual report PDF structure:
//   Each attorney entry is a paragraph headed by attorney name (Title Case)
//   followed by their BBO number — "BBO #<6–7 digits>" or "BBO# <digits>"
//   and a narrative describing the discipline.
//
// Usage:
//   node scripts/ingest/scrape-mabar-discipline.mjs              # dry-run FY2020-FY2025
//   node scripts/ingest/scrape-mabar-discipline.mjs --apply
//   node scripts/ingest/scrape-mabar-discipline.mjs --start-fy 2022 --limit 50 --apply
//   node scripts/ingest/scrape-mabar-discipline.mjs --help

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

const JURISDICTION = 'MA';

// BBO annual-report PDFs. Fiscal year N = July (N-1) – June N.
const FY_PDF_URL = (fy) => `https://bbopublic.massbbo.org/web/f/fy${fy}.pdf`;

const FY_MIN = 2020;
const FY_MAX = 2025;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// Month name → zero-padded two-digit number
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_NUM = Object.fromEntries(
  MONTHS.map((m, i) => [m.toLowerCase(), String(i + 1).padStart(2, '0')]),
);

// ── Discipline patterns ─────────────────────────────────────────────────────
// Order matters — more specific before general.

export const DISCIPLINE_PATTERNS = [
  [/\binterim\s+suspen/i,                                                   'interim_suspension'],
  [/\bemergency\s+suspen/i,                                                  'interim_suspension'],
  [/\bdisbar(?:red|ment)?\s+by\s+consent/i,                                 'disbarment'],
  [/\bdisbar/i,                                                              'disbarment'],
  [/\bresign(?:ation|ed)?\s+(?:with\s+(?:pending\s+)?charges|in\s+lieu)/i,  'resignation_with_charges'],
  [/\bindefinite\s+suspen/i,                                                 'suspension'],
  [/\bterm\s+suspen/i,                                                       'suspension'],
  [/\bsuspended?\s+for\s+\d/i,                                              'suspension'],
  [/\bsuspen/i,                                                              'suspension'],
  [/\bplaced\s+on\s+probation/i,                                            'probation'],
  [/\bprobation/i,                                                           'probation'],
  [/\bpublic\s+repri?(?:mand|of)/i,                                         'public_reprimand'],
  [/\bcensure/i,                                                             'censure'],
  [/\badmonition/i,                                                          'admonition'],
  [/\badmonish/i,                                                            'admonition'],
  [/\breciprocal\s+disci?pline/i,                                           'reciprocal_discipline'],
  [/\bdisability\s+inactive/i,                                              'disability_inactive'],
];

export function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text.slice(0, 500) };
  }
  return { type: 'unknown', raw: text.slice(0, 500) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, startFy: FY_MIN, endFy: FY_MAX, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--start-fy') {
      out.startFy = parseInt(args[++i], 10);
    } else if (a === '--limit') {
      out.limit = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 25);
      process.stdout.write(lines.join('\n') + '\n');
      process.exit(0);
    }
  }
  return out;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchBuffer(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

// BBO # regex: "BBO #123456", "BBO# 123456", "BBO#1234567", "BBO # 1234567"
export const BBO_RE = /BBO\s*#?\s*(\d{6,7})/gi;

// Date anchors: "On January 15, 2024" or "Effective January 15, 2024"
const DATE_RE = /(?:On|Effective)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/g;
// No-day variant: "Month, YYYY" → default day 01
const DATE_NODAY_RE = /(?:On|Effective)\s+([A-Z][a-z]+),\s+(\d{4})/g;

export function parseDate(monthName, day, year) {
  const mm = MONTH_NUM[(monthName || '').toLowerCase()];
  if (!mm) return null;
  const dd = day ? String(parseInt(day, 10)).padStart(2, '0') : '01';
  return `${year}-${mm}-${dd}`;
}

// Legal context words that appear in MA BBO report headers/sentences, not in attorney names.
const NAME_STOPWORDS = new Set([
  'Court','Judicial','Supreme','Board','Overseers','Bar','Discipline','Imposed',
  'Massachusetts','Commonwealth','Reinstatement','Effective','Order','Orders',
  'Attorney','Attorneys','Respondent','Following','Hearing','Committee',
]);

/**
 * Walk backwards from BBO anchor collecting Title-Case tokens for the name.
 * MA format: "First Last" — no comma inversion.
 * Stops at known legal context words to avoid including header text.
 */
export function extractNameBefore(window) {
  const cleaned = window.replace(/[.;:,]+\s*$/, '').trim();
  const tokens = cleaned.split(/\s+/);
  const name = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i].replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z.'\-]+$/, '');
    if (!tok) continue;
    // Stop immediately if we hit a legal stopword — we've left the name span.
    if (NAME_STOPWORDS.has(tok)) break;
    if (
      /^[A-Z][a-z]+$/.test(tok) ||
      /^[A-Z]\.$/.test(tok) ||
      /^[A-Z][a-z]+['\-][A-Z][a-z]+$/.test(tok) || // hyphenated/apostrophe
      /^(II|III|IV|Jr\.?|Sr\.?|Esq\.?)$/.test(tok)
    ) {
      name.unshift(tok);
      if (name.length >= 5) break;
    } else if (name.length >= 2) {
      break;
    }
  }
  const fullName = name.join(' ').trim();
  if (fullName.length < 4 || fullName.length > 80) return null;
  if (!/\S\s+\S/.test(fullName)) return null; // need at least two tokens
  return fullName;
}

/**
 * Extract all discipline entries from a normalized PDF text blob.
 */
export function extractEntries(fullText, sourceUrl) {
  if (!fullText || fullText.trim().length < 50) return [];

  const t = fullText
    .replace(/-\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');

  // Pre-collect date anchors
  const dateAnchors = [];
  for (const m of t.matchAll(DATE_RE)) {
    const iso = parseDate(m[1], m[2], m[3]);
    if (iso) dateAnchors.push({ pos: m.index, iso, noDay: false });
  }
  for (const m of t.matchAll(DATE_NODAY_RE)) {
    const iso = parseDate(m[1], null, m[2]);
    if (iso) dateAnchors.push({ pos: m.index, iso, noDay: true });
  }
  dateAnchors.sort((a, b) => a.pos - b.pos);

  function nearestDate(pos) {
    // MA PDFs typically have the date AFTER the BBO # ("BBO #123456. On Jan 15...").
    // Search after first, then before as fallback.
    let bestAfter = null;
    let bestBefore = null;
    for (const a of dateAnchors) {
      const dist = a.pos - pos;
      if (dist >= 0 && dist <= 600) {
        // date is after BBO anchor — prefer closest
        if (!bestAfter || dist < (bestAfter.pos - pos)) bestAfter = a;
      } else if (dist < 0 && Math.abs(dist) <= 500) {
        bestBefore = a; // last before anchor within 500 chars
      }
    }
    return (bestAfter || bestBefore)?.iso ?? null;
  }

  const records = [];
  const seen = new Set();

  BBO_RE.lastIndex = 0;
  for (const m of t.matchAll(BBO_RE)) {
    const bar_number = m[1];
    const bboPos = m.index;
    const key = `${bar_number}|${bboPos}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Name: up to 120 chars before the BBO anchor
    const nameWindow = t.slice(Math.max(0, bboPos - 120), bboPos);
    const full_name = extractNameBefore(nameWindow);
    if (!full_name) continue;

    // Discipline text: up to 400 chars after BBO#, capped at next BBO anchor to prevent bleed.
    const windowStart = bboPos + m[0].length;
    const windowEnd = windowStart + 400;
    const windowSlice = t.slice(windowStart, windowEnd);
    // Find next BBO # in window — stop before it.
    BBO_RE.lastIndex = 0;
    const nextBbo = BBO_RE.exec(windowSlice);
    const afterBbo = nextBbo ? windowSlice.slice(0, nextBbo.index) : windowSlice;
    BBO_RE.lastIndex = 0; // reset for outer loop
    const { type: discipline_type, raw: discipline_raw } = normalizeDiscipline(afterBbo);

    const order_date = nearestDate(bboPos);
    if (!order_date) continue;

    const violation_summary = afterBbo.replace(/\s+/g, ' ').trim().slice(0, 2000);

    try {
      records.push({
        bar_number,
        full_name,
        order_date,
        effective_date: order_date,
        discipline_type,
        discipline_raw,
        violation_summary,
        order_url: null,
        source_url: sourceUrl,
      });
    } catch (err) {
      console.error(`[parse] skipping bad row bar=${bar_number}: ${err.message}`);
    }
  }

  return records;
}

// ── PDF fetch + parse ────────────────────────────────────────────────────────

async function parsePdfUrl(url) {
  let buf;
  try {
    buf = await fetchBuffer(url);
  } catch (err) {
    console.error(`[pdf] fetch failed ${url} — ${err.message}`);
    return [];
  }
  if (!buf || buf.length < 1000) {
    console.error(`[pdf] empty/tiny response ${url} (${buf?.length ?? 0} bytes) — skipping`);
    return [];
  }
  try {
    const parser = new PDFParse({ data: buf });
    const { text } = await parser.getText();
    const records = extractEntries(text || '', url);
    console.error(`[pdf] ${url} — ${records.length} entries (${buf.length} bytes)`);
    return records;
  } catch (err) {
    console.error(`[pdf] parse failed ${url} — ${err.message}`);
    return [];
  }
}

// ── DB load ─────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    // Defensive session settings (cl-bulk-data-defensive #17)
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ma`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ma`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ma (
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
      CREATE UNLOGGED TABLE public._stg_discipline_ma (
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

    // De-dup attorneys — keep first occurrence per bar_number
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const parts = r.full_name.split(/\s+/);
        const last = parts[parts.length - 1];
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : null;
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: null,
          current_status: null,
          city: null,
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
      '_stg_attorneys_ma',
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
      '_stg_discipline_ma',
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
      FROM _stg_attorneys_ma
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name,  public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,   public.attorneys.last_name),
        city         = COALESCE(EXCLUDED.city,         public.attorneys.city),
        source_url   = COALESCE(EXCLUDED.source_url,   public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id, bar_number;
    `);
    console.error(`[db] attorneys upserted: ${upsertAttorneys.rowCount}`);

    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_ma s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(
      `DROP TABLE IF EXISTS public._stg_attorneys_ma, public._stg_discipline_ma`,
    );
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  console.error(
    `[mabar] start — apply=${OPTS.apply} fy=${OPTS.startFy}..${OPTS.endFy} limit=${OPTS.limit}`,
  );

  const records = [];
  for (let fy = OPTS.startFy; fy <= OPTS.endFy; fy++) {
    if (records.length >= OPTS.limit) break;
    const url = FY_PDF_URL(fy);
    const rows = await parsePdfUrl(url);
    records.push(...rows);
    await politeDelay();
  }

  const limited = records.slice(0, Number.isFinite(OPTS.limit) ? OPTS.limit : undefined);
  console.error(`[mabar] collected ${limited.length} discipline rows`);
  for (const r of limited.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [BBO #${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.source_url}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[mabar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (limited.length === 0) {
    console.error(`[mabar] no records — nothing to load`);
    return;
  }

  await load(limited);
  console.error(`[mabar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
