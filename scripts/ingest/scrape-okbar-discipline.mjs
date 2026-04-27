// csv-bulk-checked: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=okla&q=%22SCBD%22 — CL search returns 1,238 OK Supreme Court SCBD opinions (verified 2026-04-27); OSCN has SCBD dockets but no bulk export, OBA publishes hearings only. CL is the authoritative bulk surface.
// Template: scripts/ingest/scrape-cobar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Oklahoma Bar Association attorney-discipline scraper.
//
// Source discovery (probed 2026-04-27):
//   Primary: CourtListener search API — court=okla + q="SCBD"
//     https://www.courtlistener.com/api/rest/v4/search/?type=o&court=okla&q=%22SCBD%22&order_by=dateFiled+desc
//     Returns 1,238 OK Supreme Court Bar Discipline opinions (1999-2026) with
//     docket numbers (SCBD-NNNN format), case names of the form
//     "STATE [OF OKLAHOMA] ex rel. [OBA / OKLAHOMA BAR ASSOCIATION] v. <RESP>",
//     dateFiled, and snippet text bearing sanction language. No auth required
//     for the search endpoint.
//
//   Fallback / verification: oscn.net case lookup
//     https://www.oscn.net/applications/oscn/start.asp — per-case lookup only;
//     no bulk listing. OBA publishes hearing notices in Oklahoma Bar Journal,
//     not a structured archive of disciplinary outcomes. CL is the bulk surface.
//
// OK SCBD docket format: SCBD-NNNN (e.g. SCBD-7480, SCBD-8073).
// bar_number = "OKSCBD:<docketNumber>" — deterministic, idempotent. OBA bar
// numbers (4-5 digits) appear in opinion text but are not in the search
// metadata; case-number identity is the reliable join key.
//
// Caption stripping: "STATE [OF OKLAHOMA] ex rel. [OKLAHOMA BAR ASSOCIATION |
// OBA] v. " prefix is stripped. Trailing comma + bar# (e.g. ", OBA No. 12345")
// is captured into violation_summary if present, but bar_number stays the
// docket-prefixed form per spec.
//
// Discipline label mapping (OK SC → internal enum):
//   "disbarred" / "disbarment"          → disbarment
//   "suspended"  / "suspension"         → suspension
//   "interim suspension"                → interim_suspension
//   "publicly censured" / "censured"    → censure
//   "private reprimand"                 → admonition
//   "public reprimand"                  → public_reprimand
//   "probation"                         → probation
//   "resigned" / "resignation"          → resignation_with_charges
//   "reciprocal discipline"             → reciprocal_discipline
//   "disability inactive"               → disability_inactive
//
// Polite scraping: 800-1600 ms randomized delay between CL page requests.
// UA identifies INAA per project convention.
//
// First 3 rows logged verbatim in dry-run output (spec requirement).
//
// Usage:
//   node scripts/ingest/scrape-okbar-discipline.mjs                         # dry-run
//   node scripts/ingest/scrape-okbar-discipline.mjs --apply                 # write to DB
//   node scripts/ingest/scrape-okbar-discipline.mjs --start-row 0 --limit 50 --apply
//   node scripts/ingest/scrape-okbar-discipline.mjs --help
//
// Output: staging tables _stg_attorneys_ok + _stg_discipline_ok populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Env loader (inline, line-by-line — SEC-W1: no dotenv import) ────────────
// Web-repo .env.local only — cross-repo reads widened credential blast-radius.
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

const JURISDICTION = 'OK';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// CourtListener search — no auth required for public search endpoint.
// court=okla covers the Oklahoma Supreme Court which publishes SCBD opinions.
// Top-level r.snippet is empty in v4; r.opinions[0].snippet contains the
// indexed text. The default q=SCBD highlight focuses on docket label, missing
// sanction language. We issue PER-SANCTION queries so each result's snippet
// is anchored on the sanction term — guarantees discipline_type tagging
// without fetching 1,200+ full opinion bodies.
const CL_SEARCH_BASE =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=okla&format=json&order_by=dateFiled+desc&highlight=on';

// Per-sanction queries. Order matters — earlier hits win (specific over generic).
// Each query produces (docketSet, disciplineType) entries that are merged.
const SANCTION_QUERIES = [
  ['"reciprocal discipline"', 'reciprocal_discipline'],
  ['"disability inactive"', 'disability_inactive'],
  ['disbarred OR disbarment', 'disbarment'],
  ['"resignation pending" OR "resigned pending" OR "resignation in lieu"', 'resignation_with_charges'],
  ['"interim suspension" OR "emergency suspension" OR "temporary suspension"', 'interim_suspension'],
  ['suspended OR suspension', 'suspension'],
  ['probation', 'probation'],
  ['"public censure" OR "publicly censured" OR censure OR censured', 'censure'],
  ['"private reprimand" OR "private admonition"', 'admonition'],
  ['"public reprimand" OR reprimand OR reprimanded', 'public_reprimand'],
];

const CL_OPINION_BASE = 'https://www.courtlistener.com';

// Discipline patterns — order matters (specific before generic).
const DISCIPLINE_PATTERNS = [
  [/\breciprocal\s+disciplin/i, 'reciprocal_discipline'],
  [/\bdisability\s+inactiv/i, 'disability_inactive'],
  [/\bdisbar(red|ment|ring)/i, 'disbarment'],
  [/\bdisciplinary\s+revocation/i, 'resignation_with_charges'],
  [/\bresign(ation|ed)?\s+(with|in\s+lieu|pending)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bsuspen(d|ded|sion)/i, 'suspension'],
  [/\bprobation\b/i, 'probation'],
  [/\bpublic(ly)?\s+censur/i, 'censure'],
  [/\bcensur(ed|e)\b/i, 'censure'],
  [/\bprivate\s+repri(mand|of)/i, 'admonition'],
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
    startDate: '1999-01-01',
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
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 8) throw new Error(`HTTP ${resp.status} after ${attempt} retries — ${url}`);
    // CL rate-limits aggressively; cap backoff at 60s, 8 attempts = ~5 min max wait.
    const baseMs = Math.min(60000, 3000 * Math.pow(2, attempt - 1));
    const ms = baseMs + Math.floor(Math.random() * 2000);
    console.error(`[ok] HTTP ${resp.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  return resp.json();
}

// ── Case name parsing ───────────────────────────────────────────────────────

// OK SCBD cases:
//   "STATE OF OKLAHOMA ex rel. OBA v. KLINE"
//   "STATE OF OKLAHOMA ex rel., OBA v. LILE"
//   "STATE ex rel. OKLAHOMA BAR ASSOCIATION v. LAW WATSON PRYOR MCMEANS"
//   "STATE ex rel. OKLAHOMA BAR ASSOCIATION v. LOWERY"
// Strip "STATE [OF OKLAHOMA] ex rel.[,] [OKLAHOMA BAR ASSOCIATION | OBA] v." prefix.
// Optionally strip trailing OBA bar number annotation.
// Return { fullName, obaNum } — obaNum may be null.
export function parseCaseName(caseName) {
  if (!caseName) return { fullName: null, obaNum: null };

  let name = caseName
    .replace(/^STATE\s+(OF\s+OKLAHOMA\s+)?ex\s+rel\.?,?\s+/i, '')
    .replace(/^(THE\s+)?OKLAHOMA\s+BAR\s+ASSOCIATION\s+v\.?\s*/i, '')
    .replace(/^OBA\s+v\.?\s*/i, '')
    .replace(/^IN\s+(THE\s+MATTER\s+OF\s+|RE[:\s])\s*/i, '')
    .trim();

  // Reject reversed captions like "X v. Oklahoma Bar Association" (reinstatement
  // appeals — separate event class)
  if (/\bv\.\s+(the\s+)?(oklahoma\s+bar\s+association|oba)\b/i.test(name)) {
    return { fullName: null, obaNum: null };
  }

  // Extract trailing OBA# (4-5 digits) annotation if present
  const obaMatch = name.match(/,?\s*(?:OBA\s+(?:No\.?\s*)?)?#?(\d{4,5})\s*$/i);
  let obaNum = null;
  if (obaMatch && /OBA|#/i.test(name.slice(Math.max(0, obaMatch.index - 8), obaMatch.index + obaMatch[0].length))) {
    obaNum = obaMatch[1];
    name = name.slice(0, obaMatch.index).trim();
  }

  // Normalize ALL-CAPS surnames: "JOHN P. SMITH" → "John P. Smith"
  name = name.replace(/\b([A-Z]{2,})\b/g, (m) =>
    m.charAt(0) + m.slice(1).toLowerCase()
  );

  // Reject if name is a court phrase
  if (/\b(supreme court|presiding|disciplinary|professional responsibility)\b/i.test(name)) {
    return { fullName: null, obaNum: null };
  }
  if (name.length < 3 || name.length > 120) return { fullName: null, obaNum: null };

  return { fullName: name, obaNum };
}

// Docket "SCBD-7480" → valid SCBD case
export function isScbdDocket(docket) {
  return typeof docket === 'string' && /^SCBD[-\s]?\d{3,5}$/i.test(docket.trim());
}

// ── CourtListener discovery ──────────────────────────────────────────────────

// Issue one search per sanction term so each result's snippet is anchored on
// sanction language. First match wins (earlier in SANCTION_QUERIES = more
// specific). Returns array of records (one per docket).
async function discoverViaCl() {
  const byDocket = new Map();

  for (const [qFragment, sanctionType] of SANCTION_QUERIES) {
    const baseQ = `SCBD AND (${qFragment})`;
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
        // First match wins (SANCTION_QUERIES is ordered specific→generic)
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

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ok`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ok`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ok (
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
      CREATE UNLOGGED TABLE public._stg_discipline_ok (
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
      '_stg_attorneys_ok',
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
      '_stg_discipline_ok',
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
      FROM _stg_attorneys_ok
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
      FROM _stg_discipline_ok s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ok, public._stg_discipline_ok`);
  } finally {
    await cleanup();
  }
}

// ── buildRecordFromClResult (exported for tests) ─────────────────────────────

/**
 * Convert a single CourtListener search result into a discipline record.
 *
 * @param r CL search result object
 * @param assertedSanctionType The sanction the calling per-sanction query
 *   anchored on. We trust the query — if the query said "SCBD AND disbarred"
 *   and the result came back, the opinion contains "disbarred". We still try
 *   to enrich with normalizeDiscipline(opinion-snippet) for raw text, but the
 *   sanction TYPE is set from the query. Avoids the empty-top-level-snippet
 *   trap and the false-negative risk of regex over <mark>-tagged HTML.
 *
 * Returns null if the result should be skipped (non-SCBD docket, missing name,
 * reversed caption, missing source_url).
 */
export function buildRecordFromClResult(r, assertedSanctionType) {
  // CL with highlight=on returns docketNumber as e.g. "<mark>SCBD</mark>-7961".
  // Strip <mark> tags before validation. Also tolerate "Case Number: " prefix.
  const docket = (r.docketNumber || '')
    .replace(/<\/?mark>/g, '')
    .replace(/^Case Number:\s*/i, '')
    .trim();
  if (!isScbdDocket(docket)) return null;

  const { fullName, obaNum } = parseCaseName(r.caseName || '');
  if (!fullName) return null;

  if (!ALLOWED_DISCIPLINE_TYPES.has(assertedSanctionType)) return null;

  // Pull richer snippet for raw text + summary. Top-level r.snippet is empty
  // in CL v4; the indexed text lives at r.opinions[0].snippet.
  const opinionSnippet = (r.opinions && r.opinions[0] && r.opinions[0].snippet) || '';
  const cleanSnippet = opinionSnippet.replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();

  const orderDate = r.dateFiled || null;
  const sourceUrl = r.absolute_url
    ? `${CL_OPINION_BASE}${r.absolute_url}`
    : null;
  if (!sourceUrl) return null; // NEVER fabricate source_url

  // Normalize docket: strip whitespace, force uppercase, ensure dash form
  const normDocket = docket.replace(/\s+/g, '').replace(/^SCBD-?/i, 'SCBD-').toUpperCase();
  const barNumber = `OKSCBD:${normDocket}`;
  const obaNote = obaNum ? ` [OBA #${obaNum}]` : '';
  const summary = (cleanSnippet + obaNote).slice(0, 2000);

  return {
    bar_number: barNumber,
    full_name: fullName,
    oba_num: obaNum,
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
    `[okbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate}` +
    (OPTS.endDate ? ` endDate=${OPTS.endDate}` : '') +
    ` limit=${OPTS.limit} startRow=${OPTS.startRow}`
  );

  let records = await discoverViaCl();

  if (OPTS.startRow > 0) records = records.slice(OPTS.startRow);
  if (Number.isFinite(OPTS.limit)) records = records.slice(0, OPTS.limit);

  console.error(`[okbar] collected ${records.length} discipline rows`);

  const preview = records.slice(0, 3);
  console.error('[okbar] first 3 rows:');
  for (const r of preview) {
    console.error(
      `  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type}` +
      ` (order_date=${r.order_date || '?'}) — ${r.source_url}`
    );
  }

  if (!OPTS.apply) {
    console.error('[okbar] dry-run — pass --apply to write to DB');
    return;
  }

  if (records.length === 0) {
    console.error('[okbar] no records — nothing to load');
    return;
  }

  await load(records);
  console.error('[okbar] done');
}

// Only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
