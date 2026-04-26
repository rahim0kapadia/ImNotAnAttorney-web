// csv-bulk-checked: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=mass&q=%22In+the+Matter+of%22
//   CL search is the only viable bulk source for MA discipline opinions.
//   decisions.massbbo.org returns 403 (CAPTCHA-protected). The annual report PDFs
//   at bbopublic.massbbo.org/web/f/fyNNNN.pdf are narrative statistics, not per-attorney
//   discipline registers (confirmed 2026-04-25: PDFs contain no BBO # entries).
//   massbbo.org attorney portal requires Salesforce Community login — no public bulk.
// Template: scripts/ingest/scrape-cobar-discipline.mjs (CL search pattern)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Massachusetts SJC attorney discipline scraper.
//
// Source (confirmed 2026-04-25):
//   CourtListener search — court=mass + q="In the Matter of"
//   Returns ~988 SJC opinions on attorney discipline cases (2014+).
//   Caption format: "In the Matter of <FIRST> [M.] <LAST>"
//   Docket format: SJC-NNNNN or "SJC NNNNN"
//   Snippet: boilerplate SJC notice — explicit sanction language rarely in snippet.
//
// bar_number = "MASJC:<normalized-docket>" — deterministic, idempotent.
//   Normalized: strip spaces and leading "SJC " → "MASJC:SJC-13370"
//
// Discipline type note:
//   SJC snippets contain only the standard "NOTICE: All slip opinions..." header.
//   Explicit sanction keywords are not in the snippet. Records are stored with
//   discipline_type='unknown' — a downstream enrichment pass could fetch opinion
//   bodies to classify, but that is a separate phase.
//
// Coverage: all available SJC discipline opinions indexed by CourtListener.
//
// Usage:
//   node scripts/ingest/scrape-mabar-discipline.mjs              # dry-run
//   node scripts/ingest/scrape-mabar-discipline.mjs --apply
//   node scripts/ingest/scrape-mabar-discipline.mjs --start-date 2020-01-01 --apply
//   node scripts/ingest/scrape-mabar-discipline.mjs --limit 50
//   node scripts/ingest/scrape-mabar-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ───────────────────────────────────────────────────────────────────

const JURISDICTION = 'MA';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=mass&format=json&order_by=dateFiled+desc' +
  '&q=' + encodeURIComponent('"In the Matter of"');

const CL_OPINION_BASE = 'https://www.courtlistener.com';

// Discipline patterns — most SJC snippets won't contain these but apply when available.
// Order matters: specific before general.
export const DISCIPLINE_PATTERNS = [
  [/\binterim\s+suspen/i,                                                  'interim_suspension'],
  [/\bemergency\s+suspen/i,                                                'interim_suspension'],
  [/\bdisbar(?:red|ring|ment)?\b/i,                                         'disbarment'],
  [/\bresign(?:ation|ed)?\s+(?:with\s+(?:pending\s+)?charges|in\s+lieu)/i, 'resignation_with_charges'],
  [/\bindefinite\s+suspen/i,                                               'suspension'],
  [/\bsuspend(?:ed)?\b/i,                                                  'suspension'],
  [/\bsuspen(?:sion|ded)\b/i,                                              'suspension'],
  [/\bplaced\s+on\s+probation/i,                                           'probation'],
  [/\bprobation\b/i,                                                       'probation'],
  [/\bpublic\s+reprimand/i,                                                'public_reprimand'],
  [/\bcensure\b/i,                                                         'censure'],
  [/\badmonition\b/i,                                                      'admonition'],
  [/\badmonish(?:ed|ment)\b/i,                                             'admonition'],
  [/\breciprocal\s+disciplin/i,                                            'reciprocal_discipline'],
  [/\bdisability\s+inactive/i,                                             'disability_inactive'],
];

export const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'interim_suspension', 'probation',
  'public_reprimand', 'resignation_with_charges', 'censure',
  'admonition', 'reciprocal_discipline', 'disability_inactive',
  // 'unknown' accepted: SJC "In the Matter of" dockets are attorney discipline proceedings
  // even when snippet lacks explicit sanction keyword (SJC snippet = boilerplate notice).
  'unknown',
]);

export function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text.slice(0, 500) };
  }
  return { type: 'unknown', raw: text.slice(0, 500) };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    startRow: 0,
    limit: Infinity,
    startDate: '2014-01-01',
    endDate: null,
    maxPages: Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') {
      out.apply = true;
    } else if (a === '--start-row') {
      out.startRow = parseInt(args[++i], 10);
    } else if (a === '--limit') {
      out.limit = parseInt(args[++i], 10);
    } else if (a === '--start-date') {
      out.startDate = args[++i];
    } else if (a === '--end-date') {
      out.endDate = args[++i];
    } else if (a === '--max-pages') {
      out.maxPages = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 32).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── HTTP ─────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

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
    console.error(`[ma] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Case name parsing ─────────────────────────────────────────────────────────

// MA SJC discipline captions: "In the Matter of <First> [M.] <LAST>"
// or "In the Matter of <First> <Last>"
// Some non-discipline cases: "In the Matter of an Impounded Case", "In the Matter of the Discipline of Two Attorneys"
// Returns { fullName } or null if not a usable single-attorney caption.
export function parseCaseName(caseName) {
  if (!caseName) return { fullName: null };

  let name = caseName
    .replace(/^In\s+the\s+Matter\s+of\s+/i, '')
    .trim();

  // Skip phrases that indicate non-individual-attorney captions
  if (/^(an?\s+impounded|the\s+discipline\s+of\s+(two|three|four|five|multiple|several)\b|a\s+member|the\s+petition)/i.test(name)) {
    return { fullName: null };
  }

  // Normalize ALL-CAPS surnames
  name = name.replace(/\b([A-Z]{2,})\b/g, (m) =>
    m.charAt(0) + m.slice(1).toLowerCase()
  );

  // Reject if name looks like a court phrase
  if (/\b(supreme\s+court|presiding|disciplinary|board\s+of|commonwealth|petition|two\s+attorneys)\b/i.test(name)) {
    return { fullName: null };
  }

  if (name.length < 4 || name.length > 100) return { fullName: null };
  if (!/\S\s+\S/.test(name)) return { fullName: null }; // need at least two tokens

  return { fullName: name };
}

// Normalize docket: "SJC 13370" → "SJC-13370", "SJC-13370" stays
export function normalizeDocket(raw) {
  if (!raw) return null;
  return raw.trim().replace(/^SJC\s+(\d+)$/i, 'SJC-$1');
}

// ── CL discovery ──────────────────────────────────────────────────────────────

async function discoverViaCl() {
  const records = [];
  let url =
    CL_SEARCH_BASE +
    `&filed_after=${encodeURIComponent(OPTS.startDate)}` +
    (OPTS.endDate ? `&filed_before=${encodeURIComponent(OPTS.endDate)}` : '');

  let page = 0;
  while (url && page < OPTS.maxPages) {
    page++;
    console.error(`[cl] page ${page} — ${url}`);

    const json = await fetchJson(url);

    if (!Array.isArray(json.results)) {
      console.error(`[cl] unexpected response shape — keys: ${Object.keys(json).join(', ')}`);
      break;
    }

    for (const r of json.results) {
      const record = buildRecordFromClResult(r);
      if (record) records.push(record);
    }

    console.error(
      `[cl] page ${page}: ${json.results.length} results (MA kept: ${records.length} total so far)`
    );

    url = json.next || null;
    if (url) await politeDelay();
  }

  return records;
}

// ── buildRecordFromClResult (exported for tests) ──────────────────────────────

export function buildRecordFromClResult(r) {
  const docket = normalizeDocket(r.docketNumber);
  // Only accept SJC-NNNNN discipline dockets
  if (!docket || !/^SJC-\d+$/i.test(docket)) return null;

  const { fullName } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  // snippet is nested at r.opinions[0].snippet — r.snippet is undefined at search result level
  const snippet = r.opinions?.[0]?.snippet || '';
  const { type: disciplineType, raw: disciplineRaw } = normalizeDiscipline(snippet);
  if (!ALLOWED_DISCIPLINE_TYPES.has(disciplineType)) return null;

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url
    ? `${CL_OPINION_BASE}${r.absolute_url}`
    : null;
  if (!sourceUrl) return null; // NEVER fabricate source_url

  const barNumber = `MASJC:${docket}`;
  const summary = snippet.replace(/\s+/g, ' ').trim().slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: null,
    discipline_type: disciplineType,
    discipline_raw: disciplineRaw,
    violation_summary: summary,
    order_url: sourceUrl,
    source_url: sourceUrl,
  };
}

// ── DB load ───────────────────────────────────────────────────────────────────

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

    // De-dup attorneys by bar_number
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
      '_stg_discipline_ma',
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
      FROM _stg_attorneys_ma
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
      FROM _stg_discipline_ma s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ma, public._stg_discipline_ma`);
  } finally {
    await cleanup();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[mabar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[mabar] collected ${records.length} discipline rows`);

  const preview = records.slice(0, 3);
  console.error('[mabar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[mabar] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[mabar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[mabar] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
