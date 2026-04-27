// csv-bulk-checked: https://www.mad.uscourts.gov/attorneys/data/discipline.json
//   The MAD attorney-discipline page is a static JS app that loads /attorneys/data/discipline.json
//   (returns ~499 records with name, docket, disposition, date — verified 2026-04-26).
//   This is the canonical free public bulk endpoint for federal-court attorney discipline
//   in the District of Massachusetts. No API key. No rate limit. JSON, not HTML scrape.
// Template: scripts/ingest/scrape-mabar-discipline.mjs (state-side SJC sibling)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Massachusetts FEDERAL-COURT (MAD) attorney discipline scraper.
//
// Source (confirmed 2026-04-26):
//   https://www.mad.uscourts.gov/attorneys/discipline.htm renders a table from
//   https://www.mad.uscourts.gov/attorneys/data/discipline.json (AJAX, static JSON).
//   Each record:
//     { name: "Smith, John A." | "John A. Smith",
//       docket: "10-mc-10158-MLW",
//       disposition: "Disbarment" | "Term Suspension" | ...
//       date: "M/D/YYYY" }
//   ~499 records, 2010-2026.
//
//   Distinct from the SJC state-court "In the Matter of" CL-indexed records
//   loaded by scrape-mabar-discipline.mjs (which covers the state side via
//   CourtListener court=mass). Both scrapers share schema; bar_number prefix
//   differs ("MAFED:" here vs "MASJC:" there) so unique constraint
//   (jurisdiction, bar_number, order_date, discipline_type) does not collide.
//
// bar_number = "MAFED:<docket>" — deterministic, idempotent.
//   The docket itself (e.g. "10-mc-10158-MLW") is unique per case in the MAD index.
//
// source_url:
//   The discipline.json endpoint has no per-row deep-link, but the canonical
//   public listing page IS https://www.mad.uscourts.gov/attorneys/discipline.htm
//   which serves the JSON via AJAX. Every row lists the same listing URL —
//   acceptable per HARD RULE: source_url returns 200, lists the row at scrape time.
//
// Usage:
//   node scripts/ingest/scrape-mabar-federal-discipline.mjs              # dry-run
//   node scripts/ingest/scrape-mabar-federal-discipline.mjs --apply
//   node scripts/ingest/scrape-mabar-federal-discipline.mjs --limit 50
//   node scripts/ingest/scrape-mabar-federal-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ───────────────────────────────────────────────────────────────────

const JURISDICTION = 'MA';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const MAD_JSON_URL = 'https://www.mad.uscourts.gov/attorneys/data/discipline.json';
const MAD_LISTING_URL = 'https://www.mad.uscourts.gov/attorneys/discipline.htm';

// Discipline patterns — covers all 140 distinct dispositions seen in live data
// (checked 2026-04-26). Order matters: specific before general.
export const DISCIPLINE_PATTERNS = [
  [/\breinstate(?:d|ment)?\b/i,                                            'reinstatement'],
  [/\binterim\s+suspen/i,                                                  'interim_suspension'],
  [/\bemergency\s+suspen/i,                                                'interim_suspension'],
  [/\b(?:immediate|immed)\s+(?:temp(?:orary)?|admin(?:istrative)?)\s+suspen/i, 'interim_suspension'],
  [/\btemp(?:orary)?\s+suspen/i,                                           'interim_suspension'],
  [/\bdisbar(?:red|ring|ment)?\b/i,                                         'disbarment'],
  [/\bjudgment\s+of\s+disbarment/i,                                        'disbarment'],
  [/\bresign(?:ation|ed)?\s+(?:with\s+(?:pending\s+)?charges|in\s+lieu)/i, 'resignation_with_charges'],
  [/\breciprocal\s+(?:disciplin|disciplinary)/i,                           'reciprocal_discipline'],
  [/\bdisability\s+inactive/i,                                             'disability_inactive'],
  [/\bdisability\s+(?:status|leave)/i,                                     'disability_inactive'],
  [/\bindefinite\s+suspen/i,                                               'suspension'],
  [/\bterm\s+suspen/i,                                                     'suspension'],
  [/\badmin(?:istrative)?\s+suspen/i,                                      'suspension'],
  [/\bsuspend(?:ed)?\b/i,                                                  'suspension'],
  [/\bsuspen(?:sion|ded)\b/i,                                              'suspension'],
  [/\bplaced\s+on\s+probation/i,                                           'probation'],
  [/\bprobation\b/i,                                                       'probation'],
  [/\bpublic\s+reprimand/i,                                                'public_reprimand'],
  [/\bcensure\b/i,                                                         'censure'],
  [/\badmonition\b/i,                                                      'admonition'],
  [/\badmonish(?:ed|ment)\b/i,                                             'admonition'],
];

// Reinstatement is an OUTCOME, not a discipline event — filter it out.
// All other allowed types map to attorney_discipline_events normally.
export const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'interim_suspension', 'probation',
  'public_reprimand', 'resignation_with_charges', 'censure',
  'admonition', 'reciprocal_discipline', 'disability_inactive',
]);

export function normalizeDiscipline(text) {
  if (!text) return { type: null, raw: null };
  const cleaned = text.replace(/\s+/g, ' ').trim();
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(cleaned)) return { type, raw: cleaned.slice(0, 500) };
  }
  return { type: 'unknown', raw: cleaned.slice(0, 500) };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    startRow: 0,
    limit: Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--start-row') {
      out.startRow = parseInt(args[++i], 10);
    } else if (a === '--limit') {
      out.limit = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 40).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchJson(url, attempt = 1) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 5) throw new Error(`HTTP ${resp.status} after ${attempt} retries — ${url}`);
    const ms = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
    console.error(`[ma-fed] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await new Promise((r) => setTimeout(r, ms));
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Name parsing ─────────────────────────────────────────────────────────────

// MAD names appear in two forms:
//   "Last, First M." (older entries, ~30 of 499)
//   "First M. Last" (newer entries, ~469 of 499)
// Normalize both to "First Last" form.
export function normalizeName(raw) {
  if (!raw) return null;
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [last, rest] = s.split(',', 2).map((x) => x.trim());
    if (!last || !rest) return s;
    return `${rest} ${last}`;
  }
  return s;
}

export function splitName(fullName) {
  if (!fullName) return { first: null, last: null };
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: null, last: parts[0] };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return { first, last };
}

// "M/D/YYYY" → "YYYY-MM-DD"
export function normalizeDate(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Normalize docket: trim + collapse whitespace; preserve content
export function normalizeDocket(raw) {
  if (!raw) return null;
  return raw.replace(/\s+/g, ' ').trim();
}

// ── Build record ─────────────────────────────────────────────────────────────

export function buildRecordFromMadRow(r) {
  const docket = normalizeDocket(r.docket);
  if (!docket) return null;

  const fullName = normalizeName(r.name);
  if (!fullName) return null;
  if (fullName.length < 4 || fullName.length > 120) return null;

  const orderDate = normalizeDate(r.date);
  if (!orderDate) return null;

  const dispositionRaw = (r.disposition || '').replace(/\n/g, ' / ').trim();
  const { type: disciplineType, raw: disciplineRaw } = normalizeDiscipline(dispositionRaw);
  if (!ALLOWED_DISCIPLINE_TYPES.has(disciplineType)) return null;

  const barNumber = `MAFED:${docket}`;
  const summary = dispositionRaw.slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: null,
    discipline_type: disciplineType,
    discipline_raw: disciplineRaw,
    violation_summary: summary,
    order_url: MAD_LISTING_URL,
    source_url: MAD_LISTING_URL,
  };
}

// ── Discovery ────────────────────────────────────────────────────────────────

async function discover() {
  console.error(`[ma-fed] fetching ${MAD_JSON_URL}`);
  const arr = await fetchJson(MAD_JSON_URL);
  if (!Array.isArray(arr)) {
    throw new Error(`expected array, got ${typeof arr}`);
  }
  console.error(`[ma-fed] received ${arr.length} raw entries`);

  const records = [];
  let skipped = 0;
  for (const r of arr) {
    const rec = buildRecordFromMadRow(r);
    if (rec) records.push(rec);
    else skipped++;
  }
  console.error(`[ma-fed] kept ${records.length}, skipped ${skipped} (reinstatements + non-discipline + bad rows)`);

  // In-batch dedup: same (bar_number, order_date, discipline_type)
  const seen = new Set();
  const deduped = [];
  for (const r of records) {
    const k = `${r.bar_number}|${r.order_date}|${r.discipline_type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }
  if (deduped.length !== records.length) {
    console.error(`[ma-fed] in-batch dedup: ${records.length} → ${deduped.length}`);
  }
  return deduped;
}

// ── DB load ──────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ma_fed`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ma_fed`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ma_fed (
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
      CREATE UNLOGGED TABLE public._stg_discipline_ma_fed (
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

    // Dedup attorneys by bar_number
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const { first, last } = splitName(r.full_name);
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
      '_stg_attorneys_ma_fed',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name,
      r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw,
      r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_ma_fed',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_ma_fed
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
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name,
             s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw,
             s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_ma_fed s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ma_fed, public._stg_discipline_ma_fed`);
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[ma-fed] start — apply=${OPTS.apply} limit=${OPTS.limit} startRow=${OPTS.startRow}`);

  let records = await discover();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[ma-fed] collected ${records.length} discipline rows`);

  // Validate live: print first 3 rows for eyeballing before --apply commits
  const preview = records.slice(0, 3);
  console.error('[ma-fed] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date}) — ${r.source_url}`
    );
  }

  // Distribution check
  const byType = {};
  for (const r of records) byType[r.discipline_type] = (byType[r.discipline_type] || 0) + 1;
  console.error('[ma-fed] discipline_type distribution:', byType);

  if (!OPTS.apply) {
    console.error('[ma-fed] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[ma-fed] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[ma-fed] done');
}

// Only run main() when invoked directly, not when imported by tests.
// process.argv[1] resolves to the script path on direct invocation; tests
// invoke `node --test <test-file>` so process.argv[1] points at the test file.
const isDirectInvocation = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
