// csv-bulk-checked: none-exists — CourtListener search API used for per-sanction filtering of federal Court of Appeals attorney-misconduct opinions. CL has 29 anchored opinions across all federal circuits where docketNumber matches the "-am" attorney-misconduct suffix (probed 2026-04-27); the 2nd Circuit dominates (all 29 hits are CA2 because CA2's clerk is the only circuit that systematically tags discipline dockets as "-am" and publishes them on CL). Federal admin-office discipline records are not on CL and most circuits' attorney-discipline orders are sealed. No bulk endpoint exists.
// Template: scripts/ingest/scrape-dcbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Federal Courts of Appeals attorney-discipline scraper.
//
// Jurisdiction code: 'US' — by convention for federal-court records in this
// scrape (the attorneys table column is CHAR(2) USPS-style; 'US' is the
// closest reserved code and won't collide with any state).
//
// Source discovery (probed 2026-04-27):
//   Primary: CourtListener search API across all federal appellate circuits
//   filtered to docketNumber containing "-am" (attorney-misconduct).
//
//     https://www.courtlistener.com/api/rest/v4/search/?type=o&court=ca1,ca2,ca3,ca4,ca5,ca6,ca7,ca8,ca9,ca10,ca11,cadc,cafc&q=docketNumber%3A*-am&...
//
// Federal -am caption shapes (verified live, all 29 CL hits are CA2):
//   "In Re Andres M. Aranda"               → discipline (canonical)
//   "In re Bernfeld"                       → discipline
//   "In Re Peter S. Gordon"                → discipline (full name)
//   "In Re Fengling Liu"                   → discipline
//   "In Re: [Redacted], Attorneys."        → SKIP (anonymous redacted)
//   "In Re Attorney Disciplinary Appeal"   → SKIP (no name)
//
// Filter: docketNumber must contain "-am" or "-AM" — that's the CA2 clerk's
// attorney-misconduct tag. Captions are "In Re/In re <Name>" forward only.
// "In Re: [Redacted]" with no name is rejected.
//
// Federal -am docket: NN-NNNNN-am or NN-NNNN-am (e.g. "14-90027-am",
// "07-9056-am", "09-90133-AM"). May appear as "Docket NN-NNNNN-am" prefix or
// "No. NN-NNNNN-am". Multi-docket "08-9002-am, 07-9064-am" normalizes to
// first.
//
// Discipline label mapping (federal CA → internal enum):
//   "disbarred" / "disbarment"            → disbarment
//   "suspended" / "suspension"            → suspension
//   "reciprocal discipline"               → reciprocal_discipline
//   "publicly reprimanded"                → public_reprimand
//   "resignation"                         → resignation_with_charges
//   "removed" / "removal" / "stricken"    → disbarment
//
// bar_number = "US:CA<circuit>:<docketNumber>" — deterministic; circuit is
// extracted from result.court when available (e.g. "US:ca2:14-90027-am").
// Falls back to "US:<docketNumber>" if circuit unknown.
//
// Polite scraping: 800-1600 ms randomized delay between CL page requests.
//
// Usage:
//   node scripts/ingest/scrape-federalbar-discipline.mjs                # dry-run
//   node scripts/ingest/scrape-federalbar-discipline.mjs --apply        # write
//   node scripts/ingest/scrape-federalbar-discipline.mjs --start-date 2010-01-01 --apply

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Env loader (inline) ─────────────────────────────────────────────────────
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

const JURISDICTION = 'US';
const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// All 13 federal Courts of Appeals — query across all circuits at once and
// let the -am suffix filter pull the attorney-misconduct subset.
const FEDERAL_CIRCUITS = [
  'ca1', 'ca2', 'ca3', 'ca4', 'ca5', 'ca6', 'ca7', 'ca8',
  'ca9', 'ca10', 'ca11', 'cadc', 'cafc',
];

const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=' + FEDERAL_CIRCUITS.join(',') +
  '&format=json&order_by=dateFiled+desc&highlight=on';

// Single -am docket query is enough — every -am docket IS attorney-misconduct
// by definition. We'll classify sanction from snippet rather than by per-
// sanction search, because the universe is small (29 hits) and a single
// query against docketNumber:*-am is more efficient than 10 sanction queries
// each with ~3 hits.
const PRIMARY_QUERY = 'docketNumber:*-am';

const CL_OPINION_BASE = 'https://www.courtlistener.com';

const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bpermanent(ly)?\s+disbar/i, 'disbarment'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bremov(ed|al)\s+from\s+the\s+(roll|bar)/i, 'disbarment'],
  [/\bstricken\s+from\s+the\s+(roll|bar)/i, 'disbarment'],
  [/\bresign(ation|ed)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\bpublic(ly)?\s+reprimand/i, 'public_reprimand'],
  [/\bprivate\s+reprimand/i, 'admonition'],
  [/\badmoni(tion|shed)/i, 'admonition'],
];

export const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'interim_suspension', 'probation',
  'public_reprimand', 'resignation_with_charges', 'censure',
  'admonition', 'reciprocal_discipline', 'disability_inactive',
  'unknown',
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

// ── HTTP ────────────────────────────────────────────────────────────────────

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
    console.error(`[us] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Caption parsing ─────────────────────────────────────────────────────────

// Federal -am attorney-misconduct captions:
//   "In Re Andres M. Aranda"           → name (canonical)
//   "In re Bernfeld"                   → surname only
//   "In Re Peter S. Gordon"            → full name
//   "In Re Uzmah Saghir"               → full name
//   "In Re: [Redacted], Attorneys."    → SKIP (anonymous)
//   "In Re Attorney Disciplinary Appeal" → SKIP (no name)
// Returns { fullName } or { fullName: null } on reject.
export function parseCaseName(rawCaption) {
  if (!rawCaption) return { fullName: null };
  const caption = rawCaption.replace(/<\/?mark>/g, '').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

  // Must start with "In Re" or "In re" or "Matter Of"
  let m = caption.match(/^(?:In\s+Re|Matter\s+Of)[:\s]+(.+?)\s*$/i);
  if (!m) return { fullName: null };

  let name = m[1].trim();

  // Reject redacted / anonymous
  if (/^\[?Redacted\]?\b/i.test(name)) return { fullName: null };
  if (/^Attorney\s+Disciplinary\s+Appeal/i.test(name)) return { fullName: null };
  if (/^Anonymous\b/i.test(name)) return { fullName: null };

  // Reject process / rule captions
  if (/^(the|a|application|petition|rules?|disciplinary|admission|order|complaint)\b/i.test(name)) {
    return { fullName: null };
  }

  // Strip trailing ", Attorneys." / ", Esq." / ", Jr." etc.
  name = name.replace(/,\s*Attorneys?\.?\s*$/i, '').trim();
  name = name.replace(/,\s*(II|III|IV|V|Jr\.?|Sr\.?|Esq\.?)\s*$/i, '').trim();
  name = name.replace(/[.,]+$/, '').trim();

  if (name.length < 2 || name.length > 150) return { fullName: null };

  // Defense-in-depth: must contain at least one alphabetic character (not just digits / punctuation)
  if (!/[A-Za-z]{2,}/.test(name)) return { fullName: null };

  return { fullName: name };
}

// Federal -am docket — must contain "-am" or "-AM" suffix on a docket-like
// token. Multi-docket strings normalize to the first.
export function normalizeFederalDocket(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/<\/?mark>/g, '').trim();
  // Strip "Docket " or "No. " prefix
  s = s.replace(/^(?:Docket\s+|No\.?\s+)/i, '').trim();
  // If multi-docket (comma-separated), take first
  s = s.split(',')[0].trim();
  // Trailing period strip
  s = s.replace(/\.$/, '').trim();
  if (!/-am$/i.test(s)) return null;
  // Validate shape: NN-NNNN-am or NN-NNNNN-am
  if (!/^\d{2}-\d{4,6}-am$/i.test(s)) return null;
  return s;
}

// ── CourtListener discovery ──────────────────────────────────────────────────

async function discoverViaCl() {
  const byKey = new Map();

  let url =
    CL_SEARCH_BASE +
    `&q=${encodeURIComponent(PRIMARY_QUERY)}` +
    `&filed_after=${encodeURIComponent(OPTS.startDate)}` +
    (OPTS.endDate ? `&filed_before=${encodeURIComponent(OPTS.endDate)}` : '');

  let page = 0;
  while (url && page < OPTS.maxPages) {
    page++;
    console.error(`[cl:federal-am] page ${page} — fetching`);

    const json = await fetchJson(url);

    if (!Array.isArray(json.results)) {
      console.error(`[cl:federal-am] unexpected response shape — keys: ${Object.keys(json).join(', ')}`);
      break;
    }

    for (const r of json.results) {
      const record = buildRecordFromClResult(r);
      if (!record) continue;
      const dedupKey = `${record.bar_number}|${record.order_date || ''}`;
      if (!byKey.has(dedupKey)) {
        byKey.set(dedupKey, record);
      }
    }

    console.error(
      `[cl:federal-am] page ${page}: ${json.results.length} results, total kept: ${byKey.size}`
    );

    url = json.next || null;
    if (url) await politeDelay();
  }

  return [...byKey.values()];
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_us`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_us`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_us (
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
      CREATE UNLOGGED TABLE public._stg_discipline_us (
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
      '_stg_attorneys_us',
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
      '_stg_discipline_us',
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
      FROM _stg_attorneys_us
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
      FROM _stg_discipline_us s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_us, public._stg_discipline_us`);
  } finally {
    await cleanup();
  }
}

// ── buildRecordFromClResult (exported for tests) ─────────────────────────────

export function buildRecordFromClResult(r) {
  const docket = normalizeFederalDocket(r.docketNumber || '');
  if (!docket) return null;

  const { fullName } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

  // Classify sanction from snippet (no per-sanction search loop for federal —
  // universe is small enough to single-pass)
  const disc = normalizeDiscipline(cleanSnippet);
  const disciplineType = disc.type;
  if (!ALLOWED_DISCIPLINE_TYPES.has(disciplineType)) return null;

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url ? `${CL_OPINION_BASE}${r.absolute_url}` : null;
  if (!sourceUrl) return null; // NEVER fabricate source_url

  // Circuit-aware bar_number: extract circuit from court field if present
  const circuit = inferCircuit(r);
  const barNumber = circuit
    ? `US:${circuit}:${docket}`
    : `US:${docket}`;

  const summary = cleanSnippet.slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: null,
    discipline_type: disciplineType,
    discipline_raw: cleanSnippet ? cleanSnippet.slice(0, 500) : null,
    violation_summary: summary,
    order_url: sourceUrl,
    source_url: sourceUrl,
  };
}

// CL "court" field is verbose like "Court of Appeals for the Second Circuit".
// Map to short circuit code (ca1..ca11, cadc, cafc).
export function inferCircuit(r) {
  const court = (r.court || '').toLowerCase();
  if (!court) return null;
  if (court.includes('first circuit')) return 'ca1';
  if (court.includes('second circuit')) return 'ca2';
  if (court.includes('third circuit')) return 'ca3';
  if (court.includes('fourth circuit')) return 'ca4';
  if (court.includes('fifth circuit')) return 'ca5';
  if (court.includes('sixth circuit')) return 'ca6';
  if (court.includes('seventh circuit')) return 'ca7';
  if (court.includes('eighth circuit')) return 'ca8';
  if (court.includes('ninth circuit')) return 'ca9';
  if (court.includes('tenth circuit')) return 'ca10';
  if (court.includes('eleventh circuit')) return 'ca11';
  if (court.includes('d.c. circuit') || court.includes('district of columbia circuit')) return 'cadc';
  if (court.includes('federal circuit')) return 'cafc';
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[federalbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[federalbar] collected ${records.length} discipline rows`);

  const preview = records.slice(0, 3);
  console.error('[federalbar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[federalbar] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[federalbar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[federalbar] done');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
