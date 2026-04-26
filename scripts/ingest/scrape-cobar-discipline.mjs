// csv-bulk-checked: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=colo&q=%22PDJ%22 — CL search is the authoritative bulk source for CO PDJ opinions; no CSV export exists from coloradopdj.com (Norma/Lexum portal returns 403 to crawlers); OARC attorney-search is 1:1 lookup only.
// Template: scripts/ingest/scrape-flbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Colorado Bar (Office of the Presiding Disciplinary Judge) attorney-discipline scraper.
//
// Source discovery (probed 2026-04-25):
//   Primary: CourtListener search API — court=colo + q="PDJ"
//     https://www.courtlistener.com/api/rest/v4/search/?type=o&court=colo&q=%22PDJ%22&order_by=dateFiled+desc
//     Returns 229+ CO Supreme Court discipline opinions 2014-2026 with docket
//     numbers (YYPDJnnn format), case names embedding attorney reg# (e.g.
//     "People v. Storey, 25828"), dateFiled, and snippet text bearing sanction
//     language. No auth required for the search endpoint.
//
//   Fallback: coloradopdj.com/research (Norma/Lexum portal)
//     research.coloradopdj.com returns HTTP 403 to non-browser UA. CL is the
//     reliable bulk surface and is kept as primary.
//
//   OARC attorney-search: https://www.coloradolegalregulation.com/attorney-search/
//     Per-attorney lookup only; no bulk listing. Used only to verify spot-check
//     registration numbers after a load.
//
// CO PDJ docket format: YYPDJnnn (e.g. 20PDJ063, 23PDJ012).
// bar_number = "COPDJ:<docketNumber>" — deterministic, idempotent (CO PDJ
// uses case# not bar#; registration number appears in case name but is
// unreliable for cases where it's absent or ambiguous).
//
// Registration numbers (5-digit) ARE extracted from case names when present
// (e.g. "People v. Storey, 25828") and stored in the violation_summary for
// reference, but bar_number always uses the COPDJ: prefix per spec.
//
// Caption stripping: "People v. " and "The PEOPLE of the State of Colorado v."
// prefixes are stripped; trailing ", NNNNN" registration numbers are stripped
// from the display name.
//
// Discipline label mapping (CO PDJ → internal enum):
//   "disbarred" / "disbarment"          → disbarment
//   "suspended"  / "suspension"         → suspension
//   "interim suspension"                → interim_suspension
//   "publicly censured" / "censured"    → censure
//   "private admonition"                → admonition
//   "probation"                         → probation
//   "public reprimand"                  → public_reprimand
//   "resigned" / "resignation"          → resignation_with_charges
//   "reciprocal discipline"             → reciprocal_discipline
//   "disability inactive"               → disability_inactive
//
// Polite scraping: 800–1600ms randomized delay between CL page requests.
// UA identifies INAA per project convention.
//
// First 3 rows logged verbatim in dry-run output (spec requirement).
//
// Usage:
//   node scripts/ingest/scrape-cobar-discipline.mjs                         # dry-run
//   node scripts/ingest/scrape-cobar-discipline.mjs --apply                 # write to DB
//   node scripts/ingest/scrape-cobar-discipline.mjs --start-row 0 --limit 50 --apply
//   node scripts/ingest/scrape-cobar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_co + _stg_discipline_co populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const JURISDICTION = 'CO';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// CourtListener search — no auth required for public search endpoint.
// court=colo covers the Colorado Supreme Court which publishes PDJ opinions.
const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=colo&format=json&order_by=dateFiled+desc' +
  '&q=' +
  encodeURIComponent('"PDJ"');

const CL_OPINION_BASE = 'https://www.courtlistener.com';

// Discipline patterns — order matters (specific before generic).
// disbarment must appear BEFORE disciplinary_revocation — the word "disciplinary"
// inside "disciplinary revocation" would otherwise shadow a snippet that also
// contains "disbarred" (e.g. "was disbarred; disciplinary revocation noted").
const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bdisciplinary\s+revocation/i, 'resignation_with_charges'],
  [/\bresign(ation|ed)?\s+(with|in\s+lieu)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bpublic(ly)?\s+censur/i, 'censure'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\bprivate\s+admonition/i, 'admonition'],
  [/\badmonish(ed|ment)/i, 'admonition'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\breprimand(ed)?\b/i, 'public_reprimand'],
];

export const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'interim_suspension', 'probation',
  'public_reprimand', 'resignation_with_charges', 'censure',
  'admonition', 'reciprocal_discipline', 'disability_inactive',
]);

export function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text.slice(0, 500) };
  }
  return { type: 'unknown', raw: text.slice(0, 500) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

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
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 55).join('\n');
      console.log(header);
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
    console.error(`[co] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Case name parsing ───────────────────────────────────────────────────────

// CO PDJ cases: "The PEOPLE of the State of Colorado v. First M. LAST, REGNUM"
// or simpler: "People v. First LAST, REGNUM"
// Strip "People v." prefix and trailing ", REGNUM" (5-digit number).
// Return { fullName, regNum } — regNum may be null if not present.
export function parseCaseName(caseName) {
  if (!caseName) return { fullName: null, regNum: null };

  // Strip "People v." or "The PEOPLE of the State of Colorado v." prefix
  let name = caseName
    .replace(/^The\s+PEOPLE\s+of\s+the\s+State\s+of\s+Colorado\s+v\.\s*/i, '')
    .replace(/^The\s+People\s+of\s+the\s+State\s+of\s+Colorado\s+v\.\s*/i, '')
    .replace(/^People\s+v\.\s*/i, '')
    .replace(/^In\s+the\s+Matter\s+of\s+/i, '')
    .trim();

  // Also handle reversed caption "PARK v. People" — skip those (reinstatement)
  if (/\bv\.\s+(the\s+)?people\b/i.test(name)) {
    return { fullName: null, regNum: null };
  }

  // Extract trailing registration number ", NNNNN" (5 digits typical, but some 4-6)
  const regMatch = name.match(/,\s*#?(\d{4,6})\s*$/);
  const regNum = regMatch ? regMatch[1] : null;
  if (regMatch) name = name.slice(0, regMatch.index).trim();

  // Normalize ALL-CAPS surnames: "Brenda L. STOREY" → "Brenda L. Storey"
  name = name.replace(/\b([A-Z]{2,})\b/g, (m) =>
    m.charAt(0) + m.slice(1).toLowerCase()
  );

  // Reject if name looks like a citation / court phrase
  if (/\b(supreme court|presiding|disciplinary judge|office|regulation)\b/i.test(name)) {
    return { fullName: null, regNum: null };
  }
  if (name.length < 3 || name.length > 120) return { fullName: null, regNum: null };

  return { fullName: name, regNum };
}

// Docket "20PDJ063" → valid PDJ case
export function isPdjDocket(docket) {
  return typeof docket === 'string' && /^\d{2}PDJ\d{3,}$/i.test(docket.trim());
}

// ── CourtListener discovery ──────────────────────────────────────────────────

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
      `[cl] page ${page}: ${json.results.length} results (PDJ kept: ${records.length} total so far)`
    );

    url = json.next || null;
    if (url) await politeDelay();
  }

  return records;
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    // Defensive session settings (cl-bulk-data-defensive #17)
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_co`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_co`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_co (
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
      CREATE UNLOGGED TABLE public._stg_discipline_co (
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

    // Dedupe attorneys by bar_number (one row per PDJ case = one attorney entry)
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const clean = r.full_name.replace(/\s+/g, ' ').trim();
        const parts = clean.split(' ');
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
      '_stg_attorneys_co',
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
      '_stg_discipline_co',
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
      FROM _stg_attorneys_co
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
      FROM _stg_discipline_co s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_co, public._stg_discipline_co`);
  } finally {
    await cleanup();
  }
}

// ── buildRecordFromClResult (exported for tests) ─────────────────────────────

/**
 * Convert a single CourtListener search result object into a discipline record.
 * Returns null if the result should be skipped (SA docket, unknown discipline,
 * reversed caption, missing source_url).
 */
export function buildRecordFromClResult(r) {
  const docket = (r.docketNumber || '').replace(/^Case Number:\s*/i, '').trim();
  if (!isPdjDocket(docket)) return null;

  const { fullName, regNum } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  const snippet = r.snippet || '';
  const { type: disciplineType, raw: disciplineRaw } = normalizeDiscipline(snippet);
  if (!ALLOWED_DISCIPLINE_TYPES.has(disciplineType)) return null;

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url
    ? `${CL_OPINION_BASE}${r.absolute_url}`
    : null;
  if (!sourceUrl) return null; // NEVER fabricate source_url

  const barNumber = `COPDJ:${docket}`;
  const regNote = regNum ? ` [CO Reg. #${regNum}]` : '';
  const summary = (snippet + regNote).slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    reg_num: regNum,
    order_date: orderDate,
    effective_date: null,
    discipline_type: disciplineType,
    discipline_raw: disciplineRaw,
    violation_summary: summary,
    order_url: sourceUrl,
    source_url: sourceUrl,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[cobar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();

  // Apply startRow + limit window (useful for smoke-tests / resumption)
  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[cobar] collected ${records.length} discipline rows`);

  // Log first 3 rows verbatim (spec requirement)
  const preview = records.slice(0, 3);
  console.error('[cobar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[cobar] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[cobar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[cobar] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
