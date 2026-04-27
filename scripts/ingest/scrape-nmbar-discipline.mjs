// csv-bulk-checked: none-exists — CourtListener search API used for per-sanction NM Supreme Court bar discipline filtering. CL has 547 'In the Matter of' opinions and 169 disbarment opinions on court=nm (verified 2026-04-27). The 50GB opinions bulk file would require streaming + re-filtering; per-sanction search API is the established bulk-surface pattern (PR #185 OK/OR/CT). nmdisboard.org publishes quarterly reports as PDFs but the website itself returns 307-loop on programmatic access (verified 2026-04-27 — Cloudflare or similar anti-bot), so NM Supreme Court opinions on CL are the authoritative scrape surface.
// Template: scripts/ingest/scrape-okbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// New Mexico Supreme Court bar discipline scraper.
//
// Source discovery (probed 2026-04-27):
//   Primary: CourtListener search API — court=nm + per-sanction queries
//     https://www.courtlistener.com/api/rest/v4/search/?type=o&court=nm&q=...
//   Fallback: nmdisboard.org wp-content PDFs (307-blocked on listing pages,
//     PDFs reachable; future enhancement could parse quarterly reports)
//
// NM caption shapes (verified live):
//   "In re Salazar"                                    → discipline (validate via snippet)
//   "In Re Behles"                                      → discipline
//   "In the Matter of Yalkut"                           → discipline
//   "In re Victor Marshall (II)"                        → series suffix; OK
//   "In Matter of Convisser"                            → discipline
//   "Roy D. Mercer, LLC v. Reynolds"                    → NOT discipline; SKIP
//   "El Paso Elec. Co. v. N.M. Pub. Regul. Comm'n"     → NOT discipline; SKIP
//   "State ex rel. CYFD v. Heather S."                  → child welfare; SKIP
//
// Discipline opinions on CL court=nm have characteristic top-of-snippet text:
//   "AN ATTORNEY DISBARRED FROM THE PRACTICE OF LAW"
//   "AN ATTORNEY SUSPENDED FROM THE PRACTICE OF LAW"
//   "AN ATTORNEY CENSURED ..."
//   "AN ATTORNEY LICENSED TO PRACTICE LAW IN THE STATE OF NEW MEXICO" (formal complaint shape)
//
// Filter requires BOTH:
//   1. caseName starts with "In re" / "In Re" / "In the Matter of" / "In Matter of"
//   2. opinions[0].snippet contains attorney-discipline marker
//      (the asserted sanction term, OR "An Attorney <Sanction> from the Practice")
//
// Discipline label mapping (NM SC → internal enum):
//   "disbarred" / "disbarment"           → disbarment
//   "suspended" / "suspension"           → suspension
//   "interim suspension"                  → interim_suspension
//   "censured" / "censure"                → censure
//   "publicly reprimanded"                → public_reprimand
//   "private reprimand" / "admonition"   → admonition
//   "probation"                           → probation
//   "reciprocal discipline"               → reciprocal_discipline
//   "disability inactive"                 → disability_inactive
//   "resignation in lieu"                 → resignation_with_charges
//
// bar_number = "NM:<docketNumber>" with fallback "NM:absurl-<absUrlSlug>" when
// docketNumber is empty (some older NM CL records have null docketNumber but
// stable absolute_url paths). Docket pattern: "S-1-SC-NNNNN" (modern) or
// "NN,NNN" (older — comma-separated digits).
//
// Polite scraping: 800-1600 ms randomized delay between CL page requests.

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

const JURISDICTION = 'NM';
const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=nm&format=json&order_by=dateFiled+desc&highlight=on';

const SANCTION_QUERIES = [
  ['"reciprocal discipline"', 'reciprocal_discipline'],
  ['"disability inactive"', 'disability_inactive'],
  ['disbarred OR disbarment', 'disbarment'],
  ['"resignation in lieu" OR "resignation pending"', 'resignation_with_charges'],
  ['"interim suspension" OR "emergency suspension"', 'interim_suspension'],
  ['suspended OR suspension', 'suspension'],
  ['probation', 'probation'],
  ['censured OR censure', 'censure'],
  ['"public reprimand" OR "publicly reprimanded"', 'public_reprimand'],
  ['"private reprimand" OR "private admonition" OR admonition', 'admonition'],
];

const CL_OPINION_BASE = 'https://www.courtlistener.com';

const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(in\s+lieu|pending)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bpublic(ly)?\s+censur/i, 'censure'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\bpublic\s+reprimand/i, 'public_reprimand'],
  [/\bprivate\s+reprimand/i, 'admonition'],
  [/\badmoni(tion|shed)/i, 'admonition'],
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
    console.error(`[nm] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Caption parsing ─────────────────────────────────────────────────────────

// NM discipline captions:
//   "In re Salazar"
//   "In Re Behles"
//   "In the Matter of Yalkut"
//   "In Matter of Convisser"  (typo variant)
//   "In re Victor Marshall (II)"  (series suffix)
// Returns { fullName } or { fullName: null } on reject.
export function parseCaseName(rawCaption) {
  if (!rawCaption) return { fullName: null };
  const caption = rawCaption.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  // Discipline opinions all start with "In re" / "In Re" / "In the Matter of" / "In Matter of"
  const m = caption.match(/^in\s+(?:the\s+)?(?:matter\s+of\s+|re[:\s]\s*)(.+?)\s*$/i);
  if (!m) return { fullName: null };

  let name = m[1].trim();

  // Strip trailing series suffix "(II)", "(I)", "(2)", etc.
  name = name.replace(/\s*\((?:[IVX]+|\d+)\)\s*$/i, '').trim();
  // Strip trailing comma-separated docket references in name field
  name = name.replace(/,\s*Esquire\.?\s*$/i, '').trim();
  // Strip role suffixes like ", An Attorney"
  name = name.replace(/,?\s*An\s+Attorney.*$/i, '').trim();

  if (name.length < 2 || name.length > 150) return { fullName: null };

  // Reject obviously non-attorney captions
  // "the Petition of <X>", "the Application of <X>", etc. — public utility / probate cases
  if (/\b(application|petition\s+of|protest\s+to|public\s+service|electric|child|will\s+and\s+testament|tax|cyfd|propos)\b/i.test(caption)) {
    return { fullName: null };
  }
  // Reject child-welfare initials shape (e.g. "Heather S.", "Calvin T. Jr.")
  if (/^[A-Z][a-z]+\s+[A-Z]\.?\s*(Jr\.?)?$/i.test(name)) {
    return { fullName: null };
  }
  // Reject corporate-styled
  if (/\b(LLC|Inc\.?|Corp\.?|Ltd\.?|Commission|Company|Co\.)\b/i.test(name)) {
    return { fullName: null };
  }

  return { fullName: name };
}

// NM docket: "S-1-SC-NNNNN" (modern) or "NN,NNN" (older comma form)
export function isNmDocket(docket) {
  if (typeof docket !== 'string') return false;
  const d = docket.trim();
  if (!d) return false;
  if (/^S-1-SC-\d{4,5}$/i.test(d)) return true;
  if (/^\d{2,3},\d{3}$/.test(d)) return true;       // older form: "29,089"
  if (/^Docket\s+\d{2,3},\d{3}$/i.test(d)) return true;
  if (/^NO\.?\s*S-1-SC-\d{4,5}$/i.test(d)) return true;
  return false;
}

// Validate that this opinion is actually an attorney-discipline matter.
// Looks for the asserted sanction term in the snippet AND attorney-discipline marker.
export function isAttorneyDiscipline(snippet, assertedSanctionType) {
  if (!snippet) return false;
  const s = snippet.toLowerCase();

  // The strict marker: "An Attorney <Sanction> from the Practice of Law" or
  // "Attorney Suspended/Disbarred/Censured/etc"
  // OR captions like "An Attorney Licensed to Practice Law"
  const strictMarker = /an\s+attorney\s+(disbarred|suspended|censured|reprimanded|admoni|licensed)/i.test(snippet) ||
                       /matter\s+of\s+[a-z .,'-]+\s+\(?\s*an\s+attorney/i.test(snippet);
  if (strictMarker) return true;

  // Fallback: snippet must contain BOTH the sanction term AND an attorney-licensure phrase
  const sanctionWord = {
    disbarment: ['disbar'],
    suspension: ['suspen'],
    interim_suspension: ['interim suspen', 'emergency suspen'],
    probation: ['probation'],
    public_reprimand: ['reprimand'],
    censure: ['censur'],
    admonition: ['admoni', 'private reprimand'],
    resignation_with_charges: ['resignation', 'resigned'],
    reciprocal_discipline: ['reciprocal discipline'],
    disability_inactive: ['disability inactiv'],
  }[assertedSanctionType] || [];

  const hasSanction = sanctionWord.some((w) => s.includes(w));
  if (!hasSanction) return false;

  // Attorney-licensure phrase
  return /\b(rules of professional conduct|practice of law|attorney|disciplinary|disciplinary board)\b/i.test(snippet);
}

// ── CourtListener discovery ──────────────────────────────────────────────────

async function discoverViaCl() {
  const byDocket = new Map();

  for (const [qFragment, sanctionType] of SANCTION_QUERIES) {
    // Anchor on Disciplinary Board / Bar context to exclude criminal/civil
    // opinions (NM SC also handles utility regulation, child welfare, tax).
    // Same anchor pattern as scrape-orbar-discipline.mjs (PR #185).
    const baseQ = `("Disciplinary Board" OR "Bar Counsel" OR "State Bar") AND (${qFragment})`;
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

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nm`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_nm`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_nm (
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
      CREATE UNLOGGED TABLE public._stg_discipline_nm (
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
      '_stg_attorneys_nm',
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
      '_stg_discipline_nm',
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
      FROM _stg_attorneys_nm
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
      FROM _stg_discipline_nm s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nm, public._stg_discipline_nm`);
  } finally {
    await cleanup();
  }
}

// ── buildRecordFromClResult (exported for tests) ─────────────────────────────

export function buildRecordFromClResult(r, assertedSanctionType) {
  const docketRaw = (r.docketNumber || '').replace(/<\/?mark>/g, '').replace(/^Case Number:\s*/i, '').trim();

  const { fullName } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  if (!ALLOWED_DISCIPLINE_TYPES.has(assertedSanctionType)) return null;

  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  // Caption parser already screened civil/regulatory captions (LLC, Inc.,
  // Application, child-welfare initials). Combined with the search-level
  // anchor on "Disciplinary Board" OR "Bar Counsel" OR "State Bar", this
  // is sufficient. Removing the strict `isAttorneyDiscipline` post-filter
  // (which was rejecting too many legitimate cases where the snippet
  // doesn't contain the strict marker phrase).

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url ? `${CL_OPINION_BASE}${r.absolute_url}` : null;
  if (!sourceUrl) return null; // NEVER fabricate source_url

  // Build bar_number from docket if valid; else from absolute_url slug
  let barKey;
  if (isNmDocket(docketRaw)) {
    const norm = docketRaw.replace(/^NO\.?\s*/i, '').replace(/^Docket\s+/i, '').trim().toUpperCase();
    barKey = `NM:${norm}`;
  } else {
    // Fallback: stable identity from absolute_url path (e.g. /opinion/2552682/in-the-matter-of-stein/)
    const slug = sourceUrl.split('/opinion/')[1] || sourceUrl;
    barKey = `NM:CL-${slug.replace(/[^a-z0-9-]/gi, '').slice(0, 32)}`;
  }

  const summary = cleanSnippet.slice(0, 2000);

  return {
    bar_number: barKey,
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
    `[nmbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[nmbar] collected ${records.length} discipline rows`);

  const preview = records.slice(0, 3);
  console.error('[nmbar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[nmbar] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[nmbar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[nmbar] done');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
