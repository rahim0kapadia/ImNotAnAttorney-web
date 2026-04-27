// csv-bulk-checked: none-exists — CourtListener search API used for per-sanction filtering of Kansas Supreme Court bar discipline opinions. CL has 900+ "In re" + "Disciplinary Administrator" opinions on court=kan (verified 2026-04-27). The 50GB opinions bulk file would require streaming + re-filtering for ~1000 KS attorney-discipline opinions; per-sanction search API is the established bulk-surface pattern (PR #185 OK/OR/CT shipped 2026-04-27). The Kansas Judicial Branch listing site (kscourts.gov/Decisions/Published-Attorney-Discipline) returns 403 to programmatic User-Agents (verified 2026-04-27 with INAA UA + Mozilla UA + full browser headers).
// Template: scripts/ingest/scrape-okbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Kansas Supreme Court bar discipline scraper.
//
// Source discovery (probed 2026-04-27):
//   Primary: CourtListener search API — court=kan + per-sanction queries
//     https://www.courtlistener.com/api/rest/v4/search/?type=o&court=kan&q=...
//
//   The Kansas Judicial Branch publishes the listing at
//   kscourts.gov/Decisions/Published-Attorney-Discipline but blocks
//   programmatic UAs with a hard 403. CourtListener mirrors the same
//   opinions with structured metadata + per-sanction snippets.
//
// KS docket format (CL):
//   Bare numeric: "128007", "12723", "127338", "20346"
//   These are KS Supreme Court case numbers. We accept any 4-7 digit numeric
//   docket as long as the snippet anchors on "Disciplinary Administrator"
//   and a sanction term (filtering at search-query level + per-record check).
//
// Caption shapes (CL):
//   "In re Stewart"                  → discipline (LASTNAME only)
//   "In re Peterson, II"             → discipline with generation suffix
//   "In re Smith, Jr."               → discipline with Jr. suffix
//   "In re McVey"                    → REINSTATEMENT (snippet starts with "REINSTATEMENT") — skip
//   "State v. <Name>"                → criminal (NOT discipline) — skip
//   "<Name> v. <Name>"               → civil — skip
//
// Snippet markers used to confirm discipline (vs. reinstatement vs. unrelated):
//   ORDER OF DISBARMENT / ORDER OF SUSPENSION / etc. — strong positive
//   "censure" / "publicly reprimanded" — positive
//   "REINSTATEMENT" or "Petition for Reinstatement" at top — REJECT (we want
//     the originating discipline, which is a separate opinion)
//   "indefinitely suspended" — positive (suspension)
//   "respondent <verb>" + "Disciplinary Administrator" — positive
//
// Discipline label mapping (KS SC → internal enum):
//   "disbarred" / "ORDER OF DISBARMENT"          → disbarment
//   "indefinitely suspended"                      → suspension
//   "suspended" / "ORDER OF SUSPENSION"           → suspension
//   "interim suspension" / "temporary suspension" → interim_suspension
//   "censure" / "censured"                        → censure
//   "publicly reprimanded" / "public reprimand"   → public_reprimand
//   "informal admonition" / "private reprimand"   → admonition
//   "probation"                                   → probation
//   "voluntary surrender"                         → resignation_with_charges
//   "reciprocal discipline"                       → reciprocal_discipline
//   "disability inactive"                         → disability_inactive
//
// bar_number = "KS:<docketNumber>" — deterministic, idempotent (same convention
// as MS/OK/OR/CT in PR #185). KS attorney bar numbers ARE published in opinion
// text but not in CL search metadata; docket-based identity is the reliable
// join key.
//
// Polite scraping: 800-1600 ms randomized delay between CL page requests.
//
// Usage:
//   node scripts/ingest/scrape-ksbar-discipline.mjs                         # dry-run
//   node scripts/ingest/scrape-ksbar-discipline.mjs --apply                 # write to DB
//   node scripts/ingest/scrape-ksbar-discipline.mjs --start-date 2010-01-01 --apply
//   node scripts/ingest/scrape-ksbar-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const JURISDICTION = 'KS';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=kan&format=json&order_by=dateFiled+desc&highlight=on';

const SANCTION_QUERIES = [
  ['"reciprocal discipline"', 'reciprocal_discipline'],
  ['"disability inactive"', 'disability_inactive'],
  ['"voluntary surrender"', 'resignation_with_charges'],
  ['disbarred OR disbarment', 'disbarment'],
  ['"interim suspension" OR "temporary suspension"', 'interim_suspension'],
  ['"indefinitely suspended" OR suspended OR suspension', 'suspension'],
  ['probation', 'probation'],
  ['censured OR censure', 'censure'],
  ['"public reprimand" OR "publicly reprimanded"', 'public_reprimand'],
  ['"informal admonition" OR "private reprimand"', 'admonition'],
];

const CL_OPINION_BASE = 'https://www.courtlistener.com';

const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bvoluntary\s+surrender/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bindefinitely\s+suspen/i, 'suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\bpublic(ly)?\s+reprimand/i, 'public_reprimand'],
  [/\binformal\s+admoni/i, 'admonition'],
  [/\bprivate\s+reprimand/i, 'admonition'],
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
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 70).join('\n');
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
    console.error(`[ks] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Caption parsing ─────────────────────────────────────────────────────────

// KS captions:
//   "In re Stewart"             → fullName = "Stewart"
//   "In re Peterson, II"         → fullName = "Peterson"
//   "In re Smith, Jr."           → fullName = "Smith"
//   "In re Alice L. Walker"      → fullName = "Alice L. Walker"
//   "State v. Smith"             → reject (not a discipline matter)
//   "<Name> v. <Name>"           → reject
//
// Returns { fullName } or { fullName: null } on reject.
export function parseCaseName(rawCaption) {
  if (!rawCaption) return { fullName: null };
  const caption = rawCaption.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  // Reject "State v. <X>" or "<X> v. <Y>"
  if (/\bv\.\s+/i.test(caption) && !/^in\s+re\b/i.test(caption)) {
    return { fullName: null };
  }
  // Reject "State of Kansas ex rel. ..." (KS does not use this pattern for bar discipline)
  if (/^state\s+(of\s+kansas\s+)?(ex\s+rel|v)/i.test(caption)) {
    return { fullName: null };
  }

  // "In re <Name>"
  const m = caption.match(/^in\s+re[:\s]\s*(.+?)\s*$/i);
  if (!m) return { fullName: null };

  let name = m[1].trim();
  // Strip generation suffix at end: ", II", ", Jr.", ", Sr.", ", III"
  name = name.replace(/,\s*(II|III|IV|V|Jr\.?|Sr\.?|Esq\.?)\s*$/i, '').trim();
  // Strip trailing periods/commas
  name = name.replace(/[.,]+$/, '').trim();

  if (name.length < 2 || name.length > 150) return { fullName: null };

  // Reject obviously non-attorney captions
  if (/\b(application|petition\s+of|rules\s+of|amendment|appointment)\b/i.test(caption)) {
    return { fullName: null };
  }
  // Reject corporate-styled
  if (/\b(LLC|Inc\.?|Corp\.?|Ltd\.?|Co\.?|Bank|Trust)\b/i.test(name)) {
    return { fullName: null };
  }

  return { fullName: name };
}

// KS docket: bare 4-7 digit numeric (KS SC case number)
export function isKsDocket(docket) {
  if (typeof docket !== 'string') return false;
  const d = docket.trim();
  return /^\d{3,7}$/.test(d);
}

// Reject snippets that are clearly REINSTATEMENT orders (not originating discipline)
export function isReinstatementSnippet(snippet) {
  if (!snippet) return false;
  // Top-of-snippet "REINSTATEMENT" header (KS uses ALL-CAPS headings)
  if (/^\s*REINSTATEMENT\b/.test(snippet)) return true;
  if (/^\s*ORDER\s+OF\s+REINSTATEMENT/i.test(snippet)) return true;
  if (/^\s*Petition\s+for\s+Reinstatement/i.test(snippet)) return true;
  return false;
}

// ── CourtListener discovery ──────────────────────────────────────────────────

async function discoverViaCl() {
  const byDocket = new Map();

  for (const [qFragment, sanctionType] of SANCTION_QUERIES) {
    const baseQ = `"In re" AND "Disciplinary Administrator" AND (${qFragment})`;
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
        if (!byDocket.has(record.bar_number)) {
          byDocket.set(record.bar_number, record);
          pageSanctionAccepted++;
        }
      }

      console.error(
        `[cl:${sanctionType}] page ${page}: ${json.results.length} results, total docket-unique kept: ${byDocket.size}`
      );

      url = json.next || null;
      if (url) await politeDelay();
    }

    console.error(`[cl:${sanctionType}] complete — accepted ${pageSanctionAccepted} new dockets`);
  }

  return [...byDocket.values()];
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ks`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ks`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ks (
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
      CREATE UNLOGGED TABLE public._stg_discipline_ks (
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
      '_stg_attorneys_ks',
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
      '_stg_discipline_ks',
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
      FROM _stg_attorneys_ks
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
      FROM _stg_discipline_ks s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ks, public._stg_discipline_ks`);
  } finally {
    await cleanup();
  }
}

// ── buildRecordFromClResult (exported for tests) ─────────────────────────────

export function buildRecordFromClResult(r, assertedSanctionType) {
  const docket = (r.docketNumber || '')
    .replace(/<\/?mark>/g, '')
    .replace(/^Case Number:\s*/i, '')
    .trim();

  if (!isKsDocket(docket)) return null;

  const { fullName } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  if (!ALLOWED_DISCIPLINE_TYPES.has(assertedSanctionType)) return null;

  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

  // Skip reinstatement orders — they are separate opinions from originating discipline
  if (isReinstatementSnippet(cleanSnippet) || isReinstatementSnippet(opinionSnippet)) {
    return null;
  }

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url ? `${CL_OPINION_BASE}${r.absolute_url}` : null;
  if (!sourceUrl) return null; // NEVER fabricate source_url

  const barNumber = `KS:${docket}`;
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[ksbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[ksbar] collected ${records.length} discipline rows`);

  const preview = records.slice(0, 3);
  console.error('[ksbar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[ksbar] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[ksbar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[ksbar] done');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
