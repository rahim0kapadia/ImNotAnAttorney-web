// csv-bulk-checked: none-exists — CourtListener search API used for per-sanction filtering of Vermont Supreme Court bar discipline opinions. CL has 105 "Office of Disciplinary Counsel/Professional Responsibility Board" opinions on court=vt (probed 2026-04-27). vermontjudiciary.org publishes PRB decisions but the listing is split across multiple HTML index pages without a structured archive endpoint; VT SC opinions on CL are the bulk-tractable surface (PR #185 OK/OR/CT pattern).
// Template: scripts/ingest/scrape-nmbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Vermont Supreme Court bar discipline scraper.
//
// Source discovery (probed 2026-04-27):
//   Primary: CourtListener search API — court=vt + per-sanction queries
//
// VT caption shapes (verified live):
//   "In Re Matthew Ragaller (Office of Disciplinary Counsel, Appellant)" → discipline
//   "In Re Norman E. Watts, Esq. (Office of Disciplinary Counsel)"        → discipline
//   "In re Theodore Studdert-Kennedy / In re PRB-021-2022 (Office of Disciplinary Counsel)" → discipline
//   "In re Eva P. Vekos, Esq. (Office of Disciplinary Counsel)"           → discipline
//   "In Re C. Robert Manby, Jr., Esq."                                    → discipline (no parenthetical, but PRB context)
//   "In Re Lisa Wellman-Ally, Esq. (Office of Disciplinary Counsel)"      → discipline
//   "In Re Holland Cannabis, LLC"                                         → SKIP (corporate)
//
// Filter requires:
//   1. caseName starts with "In Re" / "In re"
//   2. caseName contains "(Office of Disciplinary Counsel)" parenthetical
//      OR "Esq." suffix (PRB attorney form)
//
// VT docket: "NN-AP-NNN" (e.g. "25-AP-019", "23-AP-302", "24-AP-070").
// Multi-docket "23-AP-263, 23-AP-264" — normalize to first.
//
// Discipline label mapping (VT SC → internal enum) — same as NM/NE.
//
// bar_number = "VT:<docketNumber>" — deterministic, idempotent.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

{
  const ENV_PATH = 'C:/Users/email/projects/ImNotAnAttorney-web/.env.local';
  const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
  if (fs.existsSync(ENV_PATH)) {
    const txt = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const rawLine of txt.split('\n')) {
      let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      line = line.trim();
      if (!line || line[0] === '#') continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
          (val[0] === "'" && val[val.length - 1] === "'"))) {
        val = val.slice(1, -1);
      }
      if (!VALID_KEY_RX.test(key)) continue;
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const JURISDICTION = 'VT';
const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=vt&format=json&order_by=dateFiled+desc&highlight=on';

const SANCTION_QUERIES = [
  ['"reciprocal discipline"', 'reciprocal_discipline'],
  ['"disability inactive"', 'disability_inactive'],
  ['disbarred OR disbarment', 'disbarment'],
  ['"resignation" OR "resigned"', 'resignation_with_charges'],
  ['"interim suspension" OR "temporary suspension"', 'interim_suspension'],
  ['suspended OR suspension', 'suspension'],
  ['probation', 'probation'],
  ['censured OR censure', 'censure'],
  ['"public reprimand" OR "publicly reprimanded"', 'public_reprimand'],
  ['"private reprimand" OR admonition OR admonishment', 'admonition'],
];

const CL_OPINION_BASE = 'https://www.courtlistener.com';

const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bresign(ation|ed)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\bpublic(ly)?\s+reprimand/i, 'public_reprimand'],
  [/\bprivate\s+reprimand/i, 'admonition'],
  [/\badmoni(tion|shed|shment)/i, 'admonition'],
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

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false, startRow: 0, limit: Infinity,
    startDate: '1990-01-01', endDate: null, maxPages: Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-row') out.startRow = parseInt(args[++i], 10);
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--start-date') out.startDate = args[++i];
    else if (a === '--end-date') out.endDate = args[++i];
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 50).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchJson(url, attempt = 1) {
  const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
  if (process.env.COURTLISTENER_TOKEN) {
    headers['Authorization'] = `Token ${process.env.COURTLISTENER_TOKEN}`;
  }
  const resp = await fetch(url, { headers });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 8) throw new Error(`HTTP ${resp.status} after ${attempt} retries — ${url}`);
    const baseMs = Math.min(60000, 3000 * Math.pow(2, attempt - 1));
    const ms = baseMs + Math.floor(Math.random() * 2000);
    console.error(`[vt] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// VT discipline: "In Re <Name> (Office of Disciplinary Counsel...)"
//                "In Re <Name>, Esq. (Office of Disciplinary Counsel)"
//                "In Re <Name>, Esq." (PRB form, no parenthetical)
//                "In re <Name> / In re PRB-NNN-YYYY (Office of Disciplinary Counsel)" (multi-caption)
export function parseCaseName(rawCaption) {
  if (!rawCaption) return { fullName: null };
  const caption = rawCaption.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  // The PRB-context anchor lives in the CL search (anchored on
  // "Office of Disciplinary Counsel" OR "Professional Responsibility Board").
  // Caption-level filtering only needs to gate against obvious non-attorney
  // matters (corporate, statutory, regulatory). Many older PRB cases appear
  // on CL with the bare "In Re <Name>" caption (no parenthetical, no Esq.) —
  // those are still discipline orders and must NOT be rejected.

  // Reject corporate / non-attorney
  if (/\b(LLC|Inc\.?|Corp\.?|Cannabis|Holding|Trust\b)\b/i.test(caption)) {
    return { fullName: null };
  }
  // Reject estate/sealed/special-matter
  if (/\bin\s+re\s+(estate|sealed|petition|application|grand\s+jury|appeal\s+of)\b/i.test(caption)) {
    return { fullName: null };
  }

  // Match leading "In Re" / "In re"
  const m = caption.match(/^in\s+re\s+(.+?)\s*$/i);
  if (!m) return { fullName: null };

  let body = m[1].trim();

  // Multi-caption: "Theodore Studdert-Kennedy / In re PRB-021-2022 (Office...)"
  // Take the first segment (the named attorney).
  if (body.includes(' / ')) body = body.split(' / ')[0].trim();

  // Strip parenthetical at end: "(Office of Disciplinary Counsel...)"
  body = body.replace(/\s*\([^)]*\)\s*$/i, '').trim();

  // Strip ", Esq.", ", Esquire"
  let name = body.replace(/,\s*(Esq\.?|Esquire)\s*$/i, '').trim();
  // Strip ", Jr." etc.
  name = name.replace(/,\s*(II|III|IV|V|Jr\.?|Sr\.?)\s*$/i, '').trim();
  name = name.replace(/[.,]+$/, '').trim();

  if (name.length < 2 || name.length > 150) return { fullName: null };

  // Reject PRB-only references (no human name)
  if (/^PRB[-\s]/i.test(name)) return { fullName: null };

  return { fullName: name };
}

// VT docket: modern "NN-AP-NNN" (multi-docket "23-AP-263, 23-AP-264" → first)
//            OR legacy "YYYY-NNN" (4-digit year + 3-digit serial)
//            OR "NN-NNN" (2-digit year + 3-digit serial, very old)
export function normalizeVtDocket(docketRaw) {
  if (typeof docketRaw !== 'string') return null;
  const stripped = docketRaw
    .replace(/<\/?mark>/g, '')
    .replace(/^Case Number:\s*/i, '')
    .trim();
  // Modern: 25-AP-019
  let m = stripped.match(/^(\d{2}-AP-\d{2,4})(?:[,\s]|$)/i);
  if (m) return m[1].toUpperCase();
  // Legacy: 2021-080 (4-digit year + 3-digit serial)
  m = stripped.match(/^(\d{4}-\d{3,4})(?:[,\s]|$)/);
  if (m) return m[1];
  return null;
}

export function isVtDocket(docketRaw) {
  return normalizeVtDocket(docketRaw) !== null;
}

async function discoverViaCl() {
  const byKey = new Map();

  for (const [qFragment, sanctionType] of SANCTION_QUERIES) {
    const baseQ = `("Office of Disciplinary Counsel" OR "Professional Responsibility Board") AND (${qFragment})`;
    let url =
      CL_SEARCH_BASE +
      `&q=${encodeURIComponent(baseQ)}` +
      `&filed_after=${encodeURIComponent(OPTS.startDate)}` +
      (OPTS.endDate ? `&filed_before=${encodeURIComponent(OPTS.endDate)}` : '');

    let page = 0;
    let pageSanctionAccepted = 0;
    while (url && page < OPTS.maxPages) {
      page++;
      console.error(`[cl:${sanctionType}] page ${page} — fetching`);
      const json = await fetchJson(url);
      if (!Array.isArray(json.results)) {
        console.error(`[cl:${sanctionType}] unexpected response shape — keys: ${Object.keys(json).join(', ')}`);
        break;
      }
      for (const r of json.results) {
        const record = buildRecordFromClResult(r, sanctionType);
        if (!record) continue;
        const dedupKey = `${record.bar_number}|${record.order_date || ''}`;
        if (!byKey.has(dedupKey)) {
          byKey.set(dedupKey, record);
          pageSanctionAccepted++;
        }
      }
      console.error(`[cl:${sanctionType}] page ${page}: ${json.results.length} results, total kept: ${byKey.size}`);
      url = json.next || null;
      if (url) await politeDelay();
    }
    console.error(`[cl:${sanctionType}] complete — accepted ${pageSanctionAccepted} new events`);
  }
  return [...byKey.values()];
}

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_vt`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_vt`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_vt (
        jurisdiction char(2), bar_number text, full_name text,
        first_name text, last_name text, admission_date date,
        current_status text, city text, source_url text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_vt (
        jurisdiction char(2), bar_number text, full_name text,
        order_date date, effective_date date,
        discipline_type text, discipline_raw text, violation_summary text,
        order_url text, source_url text
      );
    `);

    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const clean = r.full_name.replace(/\s+/g, ' ').trim();
        const parts = clean.split(' ');
        const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : null;
        const last = parts[parts.length - 1];
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION, bar_number: r.bar_number,
          full_name: r.full_name, first_name: first, last_name: last,
          admission_date: null, current_status: null, city: null,
          source_url: r.source_url,
        });
      }
    }

    await bulkCopyRows(
      client, '_stg_attorneys_vt',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      [...byBar.values()].map((a) => [
        a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
        a.admission_date, a.current_status, a.city, a.source_url,
      ]),
    );
    await bulkCopyRows(
      client, '_stg_discipline_vt',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      records.map((r) => [
        JURISDICTION, r.bar_number, r.full_name,
        r.order_date, r.effective_date,
        r.discipline_type, r.discipline_raw, r.violation_summary,
        r.order_url, r.source_url,
      ]),
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_vt
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
      FROM _stg_discipline_vt s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_vt, public._stg_discipline_vt`);
  } finally {
    await cleanup();
  }
}

export function buildRecordFromClResult(r, assertedSanctionType) {
  const docketRaw = r.docketNumber || '';
  const docket = normalizeVtDocket(docketRaw);
  if (!docket) return null;

  const { fullName } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  if (!ALLOWED_DISCIPLINE_TYPES.has(assertedSanctionType)) return null;

  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url ? `${CL_OPINION_BASE}${r.absolute_url}` : null;
  if (!sourceUrl) return null;

  const barNumber = `VT:${docket}`;
  const summary = cleanSnippet.slice(0, 2000);
  return {
    bar_number: barNumber, full_name: fullName,
    order_date: orderDate, effective_date: null,
    discipline_type: assertedSanctionType,
    discipline_raw: cleanSnippet ? cleanSnippet.slice(0, 500) : null,
    violation_summary: summary,
    order_url: sourceUrl, source_url: sourceUrl,
  };
}

async function main() {
  console.error(
    `[vtbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();
  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[vtbar] collected ${records.length} discipline rows`);

  const preview = records.slice(0, 3);
  console.error('[vtbar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[vtbar] dry-run — pass --apply to write to DB');
    return;
  }
  if (records.length === 0) {
    console.error('[vtbar] no records — nothing to load');
    return;
  }
  await load(records);
  console.error('[vtbar] done');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
