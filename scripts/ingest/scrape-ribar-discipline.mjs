// csv-bulk-checked: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=ri&q=%22In+the+Matter+of%22+AND+%22M.P.%22 — CL search returns 315+ RI Supreme Court attorney-discipline opinions tagged "In the Matter of <Name>" with M.P. dockets (verified 2026-04-27); RI Disciplinary Board (courts.ri.gov/programs-services/Pages/Disciplinary-Board.aspx) publishes per-decision PDFs at courts.ri.gov/Published Orders/Supreme-YYYY-NNN.pdf but lacks a structured CSV/JSON index. CL is the structured bulk surface.
// Template: scripts/ingest/scrape-nhbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Rhode Island attorney-discipline scraper.
//
// Source discovery (probed 2026-04-27):
//   Primary: CourtListener search API — court=ri (RI Supreme Court)
//     https://www.courtlistener.com/api/rest/v4/search/?type=o&court=ri&q=%22In+the+Matter+of%22+AND+(%22disbar%22+OR+%22suspended%22+OR+%22censured%22+OR+%22reprimand%22)
//     RI publishes attorney discipline as Supreme Court opinions in the
//     "In the Matter of <Name>" caption form, tagged with M.P. dockets
//     (e.g. "2025-0331-M.P.", "No. 2017-393-M.P."). Per-sanction queries
//     anchor each result on sanction language.
//
//   Out of scope (no discipline-only structured surface):
//     - RI Disciplinary Board page is a static FAQ; no listing.
//     - courts.ri.gov/Published Orders/Supreme-YYYY-NNN.pdf is per-PDF only.
//
// RI SC docket format: YYYY-NNN-M.P. or YYYY-NNNN-M.P. Examples:
// 2025-0331-M.P., 2025-0222-M.P., 2024-0214-M.P., No. 2017-393-M.P.
// Some older entries combine multiple dockets:
// "2014-348-M.P. (P1/12-463A)" — we keep first M.P. token only.
// bar_number = "RISC:<docketNumber>".
//
// Caption: ACCEPT only "In the Matter of <Name>" form, AND require docket
// matches M.P. shape. REJECT "State v.", "In re X v.", and any caption
// without "In the Matter of" prefix.
//
// Polite scraping: 800-1600 ms randomized delay between CL page requests.
// UA identifies INAA per project convention.
//
// Usage:
//   node scripts/ingest/scrape-ribar-discipline.mjs                         # dry-run
//   node scripts/ingest/scrape-ribar-discipline.mjs --apply                 # write to DB
//   node scripts/ingest/scrape-ribar-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// Env loader (inline, line-by-line — SEC-W1: no dotenv import)
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

const JURISDICTION = 'RI';
const USER_AGENT = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=ri&format=json&order_by=dateFiled+desc&highlight=on';
const CL_OPINION_BASE = 'https://www.courtlistener.com';

const SANCTION_QUERIES = [
  ['"reciprocal discipline"', 'reciprocal_discipline'],
  ['"disability inactive" OR "transferred to disability"', 'disability_inactive'],
  ['disbarred OR disbarment', 'disbarment'],
  ['"resignation in lieu" OR "resigned from the bar"', 'resignation_with_charges'],
  ['"interim suspension" OR "emergency suspension" OR "temporary suspension"', 'interim_suspension'],
  ['suspended OR suspension', 'suspension'],
  ['probation', 'probation'],
  ['"public censure" OR "publicly censured" OR censure OR censured', 'censure'],
  ['"private reprimand" OR admonition OR admonished', 'admonition'],
  ['"public reprimand" OR reprimand OR reprimanded', 'public_reprimand'],
];

const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(in\s+lieu|from)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\b(private\s+reprimand|admonition|admonished)/i, 'admonition'],
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
  const out = { apply: false, startRow: 0, limit: Infinity, startDate: '1990-01-01', endDate: null, maxPages: Infinity };
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

function politeDelay() { return sleep(800 + Math.floor(Math.random() * 800)); }

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
    console.error(`[ri] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// Caption parsing
//
// RI captions accepted:
//   ACCEPT: "In the Matter of <Name>" (with optional "Esq."/"Jr."/etc. trailers)
//   ACCEPT: "In re <Name>" / "In Re <Name>" — older RI discipline opinions
//     used this form (e.g. "In re Carden", "In re Gelfuso") with valid M.P.
//     dockets. Caption-anchor: must NOT contain "Member of the Bar" filler.
//   REJECT: "State v. <X>" (criminal case mentioning discipline)
//   REJECT: "<X> v. <Y>" (civil)
//   REJECT: "In re a Member of the Bar" (anonymous filler caption)
//
// Strip leading prefix and trailing ", Esq."
export function parseCaseName(caseName) {
  if (!caseName) return { fullName: null };
  let raw = caseName.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  // Hard rejects
  if (/^\s*(?:State|People|Commonwealth)\s+v\./i.test(raw)) return { fullName: null };

  // Pattern A: "In the Matter of <Name>"
  let m = raw.match(/^In\s+the\s+Matter\s+of[:\s]+(.+)$/i);
  if (m) {
    let name = m[1].trim()
      .replace(/[,\s]+Esquire\.?$/i, '')
      .replace(/[,\s]+Esq\.?$/i, '').trim();
    if (name.length < 2 || name.length > 120) return { fullName: null };
    if (!/\s/.test(name)) return { fullName: null };
    if (!/[A-Za-z]/.test(name)) return { fullName: null };
    if (/^a\s+Member\s+of\s+the\s+Bar/i.test(name)) return { fullName: null };
    return { fullName: name };
  }

  // Pattern B: "In re <Name>" / "In Re <Name>" — older RI form. The name
  // must NOT contain "Member of the Bar" filler (anonymous caption).
  m = raw.match(/^In\s+re\s+(.+)$/i);
  if (m) {
    let name = m[1].trim()
      .replace(/[,\s]+Esquire\.?$/i, '')
      .replace(/[,\s]+Esq\.?$/i, '').trim();
    // Reject anonymous "Member of the Bar" filler captions
    if (/\bMember\s+of\s+the\s+Bar\b/i.test(name)) return { fullName: null };
    if (/^a\s+Member\b/i.test(name)) return { fullName: null };
    if (/^Anonymous\b/i.test(name)) return { fullName: null };
    if (name.length < 2 || name.length > 80) return { fullName: null };
    if (!/[A-Za-z]/.test(name)) return { fullName: null };
    return { fullName: name };
  }

  return { fullName: null };
}

// RI dockets: YYYY-NNN-M.P. or YYYY-NNNN-M.P. Older "No. YYYY-NNN-M.P."
// prefix, and rare combo form "2014-348-M.P. (P1/12-463A)".
export function isRiDocket(docket) {
  if (typeof docket !== 'string') return false;
  const cleaned = docket.replace(/<\/?mark>/g, '').trim()
    .replace(/^No\.?\s+/i, '')
    .replace(/–|—/g, '-')
    .trim();
  // Match YYYY-NNN-M.P. or YYYY-NNNN-M.P. — allow trailing "(...)"  combo form
  return /^\d{4}-\d{2,4}-M\.?P\.?(?:\s*\(.+\))?$/i.test(cleaned);
}

export function normalizeRiDocket(docket) {
  let cleaned = docket.replace(/<\/?mark>/g, '').trim()
    .replace(/^No\.?\s+/i, '')
    .replace(/–|—/g, '-');
  // Drop combo trailer "(P1/...)" — keep just the M.P. token
  cleaned = cleaned.replace(/\s*\(.+\)\s*$/, '').trim();
  // Normalize M.P./M.P/M.P. → "M.P."
  cleaned = cleaned.replace(/M\.?P\.?$/i, 'M.P.');
  return cleaned.toUpperCase().replace('M.P.', 'M.P.');
}

async function discoverViaCl() {
  const byDocket = new Map();

  for (const [qFragment, sanctionType] of SANCTION_QUERIES) {
    const baseQ = `"In the Matter of" AND (${qFragment})`;
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
        console.error(`[cl:${sanctionType}] unexpected shape — keys: ${Object.keys(json).join(', ')}`);
        break;
      }
      for (const r of json.results) {
        const record = buildRecordFromClResult(r, sanctionType);
        if (!record) continue;
        if (!byDocket.has(record.bar_number)) {
          byDocket.set(record.bar_number, record);
          pageAccepted++;
        }
      }
      console.error(`[cl:${sanctionType}] page ${page}: ${json.results.length} results, total kept: ${byDocket.size}`);
      url = json.next || null;
      if (url) await politeDelay();
    }
    console.error(`[cl:${sanctionType}] complete — accepted ${pageAccepted} new dockets`);
  }

  return [...byDocket.values()];
}

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ri`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ri`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ri (
        jurisdiction char(2), bar_number text, full_name text, first_name text, last_name text,
        admission_date date, current_status text, city text, source_url text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_ri (
        jurisdiction char(2), bar_number text, full_name text, order_date date, effective_date date,
        discipline_type text, discipline_raw text, violation_summary text, order_url text, source_url text
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
          jurisdiction: JURISDICTION, bar_number: r.bar_number, full_name: r.full_name,
          first_name: first, last_name: last, admission_date: null,
          current_status: null, city: null, source_url: r.source_url,
        });
      }
    }

    await bulkCopyRows(
      client, '_stg_attorneys_ri',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      [...byBar.values()].map((a) => [
        a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
        a.admission_date, a.current_status, a.city, a.source_url,
      ]),
    );

    await bulkCopyRows(
      client, '_stg_discipline_ri',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      records.map((r) => [
        JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
        r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
      ]),
    );

    const upsertA = await client.query(`
      INSERT INTO public.attorneys (jurisdiction, bar_number, full_name, first_name, last_name,
        admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
        admission_date, current_status, city, source_url, NOW() FROM _stg_attorneys_ri
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        first_name = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        source_url = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at = NOW()
      RETURNING id;
    `);
    console.error(`[db] attorneys upserted: ${upsertA.rowCount}`);

    const insertE = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_ri s
      JOIN public.attorneys a ON a.jurisdiction=s.jurisdiction AND a.bar_number=s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertE.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ri, public._stg_discipline_ri`);
  } finally {
    await cleanup();
  }
}

export function buildRecordFromClResult(r, assertedSanctionType) {
  const docket = (r.docketNumber || '').replace(/<\/?mark>/g, '').replace(/^Case Number:\s*/i, '').trim();
  if (!isRiDocket(docket)) return null;

  const { fullName } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  if (!ALLOWED_DISCIPLINE_TYPES.has(assertedSanctionType)) return null;

  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url ? `${CL_OPINION_BASE}${r.absolute_url}` : null;
  if (!sourceUrl) return null;

  const normDocket = normalizeRiDocket(docket);
  const barNumber = `RISC:${normDocket}`;

  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: null,
    discipline_type: assertedSanctionType,
    discipline_raw: cleanSnippet ? cleanSnippet.slice(0, 500) : null,
    violation_summary: cleanSnippet.slice(0, 2000),
    order_url: sourceUrl,
    source_url: sourceUrl,
  };
}

async function main() {
  console.error(`[ribar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`);

  let records = await discoverViaCl();
  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[ribar] collected ${records.length} discipline rows`);
  for (const r of records.slice(0, 3)) {
    console.error(`  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type} (order_date=${r.order_date || '?'}) — ${r.source_url}`);
  }
  if (!OPTS.apply) {
    console.error('[ribar] dry-run — pass --apply to write to DB');
    return;
  }
  if (records.length === 0) {
    console.error('[ribar] no records — nothing to load');
    return;
  }
  await load(records);
  console.error('[ribar] done');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
