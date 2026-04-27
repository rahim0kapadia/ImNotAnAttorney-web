// csv-bulk-checked: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=nev&q=%22In+re+Discipline%22 — CL search returns 204 Nevada Supreme Court attorney-discipline opinions (verified 2026-04-27); covers "In re Discipline of …", "In re Resignation of …", reciprocal-discipline orders, public reprimands. nvbar.org PDF orders (2025.08.26-Reprimand.pdf etc.) are flat files with no index, and the State Bar listing page returns 403 to scrapers — CL is the bulk surface.
// Template: scripts/ingest/scrape-okbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Nevada State Bar attorney-discipline scraper.
//
// Source discovery (probed live 2026-04-27):
//   Primary: CourtListener search API — court=nev
//     Returns 204+ NV Supreme Court discipline opinions (1990s-2026) with
//     docket numbers (5-6 digit), case names of the form
//     "In re Discipline of <Name>" / "In re Resignation of <Name>".
//   Fallback: nvbar.org publishes monthly Bar Counsel Reports (PDF) with
//     case summaries, but no structured archive — CL covers the same
//     sanctions in structured form via Supreme Court orders.
//
// NV docket format: 5-6 digit numeric ("86781", "85691"). Some older
// matters use "ADKT" prefix for rule changes — those are NOT discipline.
//
// bar_number = "NV:<docketNumber>" — deterministic, idempotent. NV State
// Bar numbers (5-digit "Bar No.") are NOT in the CL search metadata; case-
// number identity is the reliable join key.
//
// Caption variants:
//   "In re Discipline of <Name>"          → primary
//   "In Re: Discipline Of <Name>"         → variant casing
//   "In re Resignation of <Name>"         → resignation_with_charges
//   "In Re: Reciprocal Discipline of …"   → reciprocal_discipline
//   "In re Reinstatement of …"            → SKIPPED (not discipline)
//
// Discipline label mapping (NV SC → internal enum) — from per-sanction CL
// query snippet language (top-level r.snippet empty in CL v4; sanction text
// in r.opinions[0].snippet).
//
// Polite scraping: 800-1600 ms randomized delay between CL pages. UA = INAA
// primary. CL token (COURTLISTENER_TOKEN env) bumps rate ~10x.
//
// Usage:
//   node scripts/ingest/scrape-nvbar-discipline.mjs               # dry-run
//   node scripts/ingest/scrape-nvbar-discipline.mjs --apply       # write to DB
//   node scripts/ingest/scrape-nvbar-discipline.mjs --start-date 2010-01-01 --apply
//   node scripts/ingest/scrape-nvbar-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Env loader (inline, line-by-line — SEC-W1: no dotenv import) ────────────
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

// ── Config ──────────────────────────────────────────────────────────────────

const JURISDICTION = 'NV';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=nev&format=json&order_by=dateFiled+desc&highlight=on';

// Per-sanction queries. Order matters — earlier hits win.
const SANCTION_QUERIES = [
  ['"reciprocal discipline"', 'reciprocal_discipline'],
  ['"disability inactive"', 'disability_inactive'],
  ['"In Re: Resignation" OR "In re Resignation"', 'resignation_with_charges'],
  ['disbarred OR disbarment', 'disbarment'],
  ['"interim suspension" OR "temporary suspension"', 'interim_suspension'],
  ['suspended OR suspension', 'suspension'],
  ['probation', 'probation'],
  ['"public reprimand" OR reprimand OR reprimanded', 'public_reprimand'],
  ['"private reprimand" OR letter OR admonition', 'admonition'],
  ['censured OR censure', 'censure'],
];

const CL_OPINION_BASE = 'https://www.courtlistener.com';

const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i,            'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i,              'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i,             'disbarment'],
  [/\bresign(ation|ed)\b/i,                'resignation_with_charges'],
  [/\binterim\s+suspen/i,                  'interim_suspension'],
  [/\btemporary\s+suspen/i,                'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i,                'suspension'],
  [/\bprobation\b/i,                       'probation'],
  [/\bpublic\s+repri(mand|of)/i,           'public_reprimand'],
  [/\breprimand(ed)?\b/i,                  'public_reprimand'],
  [/\bcensur(ed|e)\b/i,                    'censure'],
  [/\badmonish/i,                          'admonition'],
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

// ── Caption parsing ─────────────────────────────────────────────────────────

/**
 * Parse "In re Discipline of <Name>" / "In Re: Discipline Of <Name>" /
 * "In re Resignation of <Name>" / "In re Reinstatement of <Name>".
 * Returns { fullName, isReinstatement } or { fullName: null, ... }.
 */
export function parseCaseName(caseName) {
  if (!caseName) return { fullName: null, isReinstatement: false };

  // CL highlight=on wraps query-matched phrases in <mark>...</mark>. Strip
  // before any caption parsing — same gotcha as docketNumber (#185 OK fix).
  let s = caseName.replace(/<\/?mark>/gi, '').replace(/\s+/g, ' ').trim();

  // Reject reinstatements outright — they are not discipline events.
  if (/^in\s+re[:\s]+reinstatement/i.test(s)) {
    return { fullName: null, isReinstatement: true };
  }

  // Strip leading "In re Discipline Of " / "In Re: Discipline Of " /
  // "In re Resignation of " / "In Re: Reciprocal Discipline of " / etc.
  s = s
    .replace(/^IN\s+RE[:\s]+(?:RECIPROCAL\s+)?(?:DISCIPLINE|RESIGNATION|SANCTION)\s+OF\s+/i, '')
    .replace(/^IN\s+THE\s+MATTER\s+OF\s+(?:DISCIPLINE\s+OF\s+)?/i, '');

  // If the strip didn't fire, this isn't a discipline case caption.
  if (s.length < 2) return { fullName: null, isReinstatement: false };
  if (s.toLowerCase() === caseName.toLowerCase()) {
    // No prefix matched — likely a non-discipline case
    return { fullName: null, isReinstatement: false };
  }

  // Strip trailing ", Bar No. NNNNN" / ", Esq."
  s = s.replace(/,\s*(?:bar\s+no\.?\s*\d{4,6}|esq\.?)\s*$/i, '').trim();

  // Reject if it's a court-phrase or too long
  if (/\b(supreme court|state bar|disciplinary board|bar counsel)\b/i.test(s)) {
    return { fullName: null, isReinstatement: false };
  }
  if (s.length < 3 || s.length > 120) return { fullName: null, isReinstatement: false };

  // Normalize ALL-CAPS → Title-case
  s = s.replace(/\b([A-Z]{2,})\b/g, (m) =>
    m.charAt(0) + m.slice(1).toLowerCase(),
  );

  return { fullName: s, isReinstatement: false };
}

export function isNvDiscipDocket(docket) {
  if (typeof docket !== 'string') return false;
  const cleaned = docket.replace(/<\/?mark>/g, '').trim();
  // Reject ADKT (rule-change dockets, not discipline)
  if (/^ADKT/i.test(cleaned)) return false;
  return /^\d{4,6}$/.test(cleaned);
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay() {
  const ms = 800 + Math.floor(Math.random() * 800);
  return sleep(ms);
}

async function fetchJson(url, attempt = 1) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  };
  if (process.env.COURTLISTENER_TOKEN) {
    headers['Authorization'] = `Token ${process.env.COURTLISTENER_TOKEN}`;
  }
  const resp = await fetch(url, { headers });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 8) throw new Error(`HTTP ${resp.status} after ${attempt} retries — ${url}`);
    const baseMs = Math.min(60000, 3000 * Math.pow(2, attempt - 1));
    const ms = baseMs + Math.floor(Math.random() * 2000);
    console.error(`[nv] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    startRow: 0,
    limit: Infinity,
    startDate: '1990-01-01',
    endDate: null,
    maxPages: Infinity,
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
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 60).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── buildRecordFromClResult (exported for tests) ─────────────────────────────

export function buildRecordFromClResult(r, assertedSanctionType) {
  const docket = (r.docketNumber || '')
    .replace(/<\/?mark>/g, '')
    .replace(/^Case Number:\s*/i, '')
    .trim();
  if (!isNvDiscipDocket(docket)) return null;

  const { fullName, isReinstatement } = parseCaseName(r.caseName || '');
  if (!fullName || isReinstatement) return null;

  if (!ALLOWED_DISCIPLINE_TYPES.has(assertedSanctionType)) return null;

  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  const orderDate = r.dateFiled || null;
  if (!orderDate) return null;

  const sourceUrl = r.absolute_url ? `${CL_OPINION_BASE}${r.absolute_url}` : null;
  if (!sourceUrl) return null;

  const barNumber = `NV:${docket.replace(/\s+/g, '')}`;
  const summary = cleanSnippet.slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: null,
    discipline_type: assertedSanctionType,
    discipline_raw: cleanSnippet ? cleanSnippet.slice(0, 500) : null,
    violation_summary: summary,
    order_url: sourceUrl,
    source_url: sourceUrl,
  };
}

// ── Discovery ────────────────────────────────────────────────────────────────

async function discoverViaCl() {
  const byBar = new Map();

  for (const [qFragment, sanctionType] of SANCTION_QUERIES) {
    const baseQ = `("In re Discipline" OR "In Re: Discipline" OR "In re Resignation") AND (${qFragment})`;
    let url =
      CL_SEARCH_BASE +
      `&q=${encodeURIComponent(baseQ)}` +
      `&filed_after=${encodeURIComponent(OPTS.startDate)}` +
      (OPTS.endDate ? `&filed_before=${encodeURIComponent(OPTS.endDate)}` : '');

    let page = 0;
    let pageAccepted = 0;
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
        // First-match-wins per docket+order_date (same matter may appear
        // in multiple sanction queries — keep the first/most-specific).
        const key = `${record.bar_number}|${record.order_date}`;
        if (!byBar.has(key)) {
          byBar.set(key, record);
          pageAccepted++;
        }
      }

      console.error(
        `[cl:${sanctionType}] page ${page}: ${json.results.length} results, total kept: ${byBar.size}`,
      );

      url = json.next || null;
      if (url) await politeDelay();
    }

    console.error(`[cl:${sanctionType}] complete — accepted ${pageAccepted} new`);
  }

  return [...byBar.values()];
}

// ── DB load ──────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nv`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_nv`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_nv (
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
      CREATE UNLOGGED TABLE public._stg_discipline_nv (
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
      '_stg_attorneys_nv',
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
      '_stg_discipline_nv',
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
      FROM _stg_attorneys_nv
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        source_url     = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at   = NOW();
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
      FROM _stg_discipline_nv s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nv, public._stg_discipline_nv`);
  } finally {
    await cleanup();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[nvbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
      (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
      ` limit=${OPTS.limit} startRow=${OPTS.startRow}`,
  );

  let records = await discoverViaCl();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[nvbar] collected ${records.length} discipline rows`);

  console.error('[nvbar] first 3 rows:');
  for (const r of records.slice(0, 3)) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type} (${r.order_date}) — ${r.source_url}`,
    );
  }

  if (!OPTS.apply) {
    console.error('[nvbar] dry-run — pass --apply to write to DB');
    return;
  }
  if (records.length === 0) {
    console.error('[nvbar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[nvbar] done');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
