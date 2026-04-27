// csv-bulk-checked: https://www.mebaroverseers.org/dah_schedule/court_grievance_decisions.html — Maine Board of Overseers of the Bar publishes the full historical discipline decisions index as a single static HTML page (~470 entries from 2000-present, organized by year, with PDF order links via maine.gov/tools/whatsnew/attach.php?id=N&an=1). No CSV/JSON bulk endpoint exists; the HTML page IS the canonical bulk surface. CourtListener court=me has only ~115 board-vs-attorney opinions, far below the HTML count.
// Template: scripts/ingest/scrape-flbar-discipline.mjs (HTML pattern + synthetic bar_number)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Maine attorney-discipline scraper.
//
// Source discovery (probed 2026-04-27):
//   Primary: Maine Board of Overseers of the Bar — Court & Grievance Decisions
//     https://www.mebaroverseers.org/dah_schedule/court_grievance_decisions.html
//     One static HTML page with year-section tables (2000 through 2026). Each
//     row is a discipline decision with date, respondent, issuing body,
//     sanction + PDF link, and disposition narrative. Maine-side bar numbers
//     are NOT published on this page; we synthesize bar_number =
//     "me-name-<md5>" per the FL/MA-narrative convention.
//
//   Out of scope (covered elsewhere or no public surface):
//     - Maine Supreme Court (court=me on CL): only about 115 opinions, mostly
//       "Board of Overseers v. <Name>" duplicates of the HTML page.
//     - Disbarred-attorneys list (separate page, subset of court_grievance).
//     - Administrative suspensions (non-discipline; nonpayment of dues etc).
//
// Caption forms accepted (column 2 "Respondent"):
//   ACCEPT: "<Name>" e.g. "Thomas S. Karod", "Dan P. Umphrey"
//   ACCEPT: "In re: <Name>" / "In Re: <Name>" e.g. "In re: Margaret P. Shalhoob"
//   ACCEPT: "<Name>, Esq." e.g. "In re: Stephen D. Bither, Esq."
//   ACCEPT: "Petition for Reinstatement of <Name>" — discipline-class event
//   REJECT: rows with non-name placeholders (caption length validation)
//   STRIP: trailing ", Esq." / ", Esquire" / leading "In re: " / "In Re: "
//
// Sanction column (column 4 "Order") is the link cell with text like
// "Disbarment [PDF]", "Suspension [PDF]", etc. We map that text to our enum.
//
// PDF order URL: https://www.maine.gov/tools/whatsnew/attach.php?id=NNNNNNNN&an=1
//
// Disposition column (column 5) is narrative — used as violation_summary.
//
// Polite scraping: SINGLE HTTP fetch (one HTML page = entire dataset), no
// per-PDF fetch. UA identifies INAA per project convention.
//
// Usage:
//   node scripts/ingest/scrape-mebar-discipline.mjs                         # dry-run
//   node scripts/ingest/scrape-mebar-discipline.mjs --apply                 # write to DB
//   node scripts/ingest/scrape-mebar-discipline.mjs --max-rows 50           # limit
//   node scripts/ingest/scrape-mebar-discipline.mjs --help

import fs from 'node:fs';
import crypto from 'node:crypto';
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

const JURISDICTION = 'ME';
const USER_AGENT = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const SOURCE_URL = 'https://www.mebaroverseers.org/dah_schedule/court_grievance_decisions.html';

// Sanction text → internal enum mapping. Pattern matched against column 4
// link text (e.g. "Disbarment [PDF]") AND column 5 disposition narrative.
const DISCIPLINE_PATTERNS = [
  // Most specific first to avoid early generic matches.
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(in\s+lieu|from)/i, 'resignation_with_charges'],
  [/\b(immediate|interim|emergency)\s+suspen/i, 'interim_suspension'],
  [/\bsurrender\s+of\s+licens/i, 'resignation_with_charges'],
  [/\border\s+of\s+surrender/i, 'resignation_with_charges'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\b(public\s+)?reprimand(ed)?/i, 'public_reprimand'],
  [/\b(private\s+admonition|admonition|admonished)/i, 'admonition'],
  [/\bprobation\b/i, 'probation'],
  [/\breinstatement\s+den/i, 'sanction'],
  [/\bsanction\b/i, 'sanction'],
];

export const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'interim_suspension', 'probation',
  'public_reprimand', 'resignation_with_charges', 'censure',
  'admonition', 'reciprocal_discipline', 'disability_inactive',
  'sanction', 'unknown',
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
    apply: false, maxRows: Infinity, startRow: 0,
    fixturePath: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--max-rows') out.maxRows = parseInt(args[++i], 10);
    else if (a === '--start-row') out.startRow = parseInt(args[++i], 10);
    else if (a === '--fixture') out.fixturePath = args[++i];
    else if (a === '--help' || a === '-h') {
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 50).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}
const OPTS = parseArgs(process.argv);

async function fetchHtml(url, attempt = 1) {
  const headers = { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' };
  const resp = await fetch(url, { headers });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 5) throw new Error(`HTTP ${resp.status} after ${attempt} retries — ${url}`);
    const ms = Math.min(60000, 3000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 2000);
    console.error(`[me] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchHtml(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.text();
}

// Caption normalization
//
// Maine Respondent column variants:
//   "Thomas S. Karod"
//   "In re: Margaret P. Shalhoob"
//   "In Re: Stephen D. Bither, Esq."
//   "In re: Petition for Reinstatement of Seth T. Carey"
//   "Peter W. Drum"
//   "In re: Daniel C. Purdy, Esq."
//
// Strategy: strip leading "In re:" / "In Re:", strip trailing ", Esq.",
// strip "Petition for Reinstatement of" prefix, trim.
export function parseRespondent(rawCell) {
  if (!rawCell) return { fullName: null };
  let name = rawCell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Strip leading "In re:" / "In Re:" / "In RE:"
  name = name.replace(/^In\s+[Rr][eE][:\s]+/i, '').trim();
  // Strip "Petition for Reinstatement of" prefix
  name = name.replace(/^Petition\s+for\s+Reinstatement\s+of\s+/i, '').trim();
  // Strip "Petition of" prefix
  name = name.replace(/^Petition\s+of\s+/i, '').trim();
  // Strip trailing ", Esq." / ", Esquire" / "Esq." / " Esq" — case-insensitive
  name = name.replace(/[,\s]+Esquire\.?$/i, '').replace(/[,\s]+Esq\.?$/i, '').trim();

  if (name.length < 2 || name.length > 120) return { fullName: null };
  // Must contain at least one space (first + last)
  if (!/\s/.test(name)) return { fullName: null };
  if (!/[A-Za-z]/.test(name)) return { fullName: null };
  if (/^(unknown|anonymous|n\/a|none)$/i.test(name)) return { fullName: null };

  return { fullName: name };
}

// Date parsing — Maine column 1 is "M/D/YYYY" or "M/D/YY"
export function parseDate(s) {
  if (!s) return null;
  const cleaned = s.replace(/<[^>]+>/g, '').trim();
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let mo = m[1].padStart(2, '0');
  let d = m[2].padStart(2, '0');
  let y = m[3];
  if (y.length === 2) {
    // Maine archive starts 1999. 00–30 → 20YY, 31–99 → 19YY
    y = parseInt(y, 10) <= 30 ? `20${y}` : `19${y}`;
  }
  return `${y}-${mo}-${d}`;
}

// Page parser
//
// Strategy: rather than depend on a particular DOM library, slice the HTML
// at the year tables (`<table ... id="YYYY">` ... `</table>`) and within
// each, walk groups of 5 consecutive `<td>` cells (Maine HTML has nested/
// malformed tr tags so we anchor on td-groups). For each row, extract:
// date | respondent | issued_by | order(link) | disposition.
export function extractEntriesFromHtml(html) {
  const entries = [];

  const tableRe = /<table[^>]*id="(\d{4})"[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const year = tableMatch[1];
    const tableInner = tableMatch[2];

    // Match 5 consecutive <td>...</td> cells.
    const rowRe = /<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;

    let rowMatch;
    while ((rowMatch = rowRe.exec(tableInner)) !== null) {
      const dateCell = rowMatch[1];
      const respondentCell = rowMatch[2];
      const issuedByCell = rowMatch[3];
      const orderCell = rowMatch[4];
      const dispositionCell = rowMatch[5];

      // Skip header rows defensively (header uses <th>, not <td>).
      const dateText = dateCell.replace(/<[^>]+>/g, '').trim();
      if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateText)) continue;

      const orderDate = parseDate(dateText);
      if (!orderDate) continue;

      const { fullName } = parseRespondent(respondentCell);
      if (!fullName) continue;

      // Order cell: extract PDF URL + sanction text
      const linkMatch = orderCell.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      let orderUrl = null;
      let sanctionText = '';
      if (linkMatch) {
        orderUrl = linkMatch[1].trim();
        sanctionText = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s*\[PDF\]\s*$/i, '').trim();
      } else {
        sanctionText = orderCell.replace(/<[^>]+>/g, '').replace(/\s*\[PDF\]\s*$/i, '').trim();
      }

      const disposition = dispositionCell.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const issuedBy = issuedByCell.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

      // Map to discipline_type. Prefer sanction text (column 4); fall back
      // to disposition narrative (column 5).
      const combinedText = `${sanctionText} ${disposition}`.trim();
      const { type, raw } = normalizeDiscipline(combinedText);

      entries.push({
        year,
        order_date: orderDate,
        full_name: fullName,
        sanction_text: sanctionText || null,
        disposition,
        issued_by: issuedBy,
        order_url: orderUrl,
        discipline_type: type,
        discipline_raw: raw || sanctionText || disposition || null,
      });
    }
  }
  return entries;
}

export function buildRecord(entry) {
  const nameNorm = entry.full_name.toLowerCase().replace(/[^a-z]/g, '');
  if (nameNorm.length < 3) return null;
  const barNumber = 'me-name-' + crypto.createHash('md5').update(nameNorm).digest('hex').slice(0, 12);

  if (!ALLOWED_DISCIPLINE_TYPES.has(entry.discipline_type)) return null;

  // Drop non-discipline procedural rows. Maine publishes many administrative
  // orders — Receiver Appointments, Receiver Discharges, Reports of Findings
  // (without sanction language) — that don't represent a discipline event
  // against the attorney. These all classify as 'unknown' here. We exclude
  // them rather than ship low-signal rows that would mislead defendants.
  if (entry.discipline_type === 'unknown') return null;

  return {
    bar_number: barNumber,
    full_name: entry.full_name,
    order_date: entry.order_date,
    effective_date: null,
    discipline_type: entry.discipline_type,
    discipline_raw: entry.discipline_raw,
    violation_summary: entry.disposition ? entry.disposition.slice(0, 2000) : null,
    order_url: entry.order_url,
    source_url: SOURCE_URL,
  };
}

async function discoverFromHtml(html) {
  const entries = extractEntriesFromHtml(html);
  console.error(`[mebar] parsed ${entries.length} raw entries from HTML`);
  const records = [];
  for (const entry of entries) {
    const rec = buildRecord(entry);
    if (rec) records.push(rec);
  }
  console.error(`[mebar] kept ${records.length} valid discipline records`);
  return records;
}

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_me`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_me`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_me (
        jurisdiction char(2), bar_number text, full_name text, first_name text, last_name text,
        admission_date date, current_status text, city text, source_url text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_me (
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
      client, '_stg_attorneys_me',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      [...byBar.values()].map((a) => [
        a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
        a.admission_date, a.current_status, a.city, a.source_url,
      ]),
    );

    await bulkCopyRows(
      client, '_stg_discipline_me',
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
        admission_date, current_status, city, source_url, NOW() FROM _stg_attorneys_me
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
      FROM _stg_discipline_me s
      JOIN public.attorneys a ON a.jurisdiction=s.jurisdiction AND a.bar_number=s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertE.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_me, public._stg_discipline_me`);
  } finally {
    await cleanup();
  }
}

async function main() {
  console.error(`[mebar] start — apply=${OPTS.apply} maxRows=${OPTS.maxRows} startRow=${OPTS.startRow}` +
    (OPTS.fixturePath ? ` fixture=${OPTS.fixturePath}` : ''));

  let html;
  if (OPTS.fixturePath) {
    html = fs.readFileSync(OPTS.fixturePath, 'utf-8');
    console.error(`[mebar] loaded fixture (${html.length} bytes)`);
  } else {
    console.error(`[mebar] fetching ${SOURCE_URL}`);
    html = await fetchHtml(SOURCE_URL);
    console.error(`[mebar] fetched ${html.length} bytes`);
  }

  let records = await discoverFromHtml(html);
  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.maxRows)) records = records.slice(0, OPTS.maxRows);

  console.error(`[mebar] collected ${records.length} discipline rows`);
  for (const r of records.slice(0, 3)) {
    console.error(`  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type} (order_date=${r.order_date || '?'}) — ${r.order_url || '(no PDF)'}`);
  }
  if (!OPTS.apply) {
    console.error('[mebar] dry-run — pass --apply to write to DB');
    return;
  }
  if (records.length === 0) {
    console.error('[mebar] no records — nothing to load');
    return;
  }
  await load(records);
  console.error('[mebar] done');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
