// csv-bulk-checked: none-exists — CourtListener API is the canonical permalink
//   source for MN Supreme Court attorney-discipline orders (court=minn).
// Template: scripts/ingest/scrape-mabar-discipline.mjs (CL pagination + politeness pattern)
// Pattern: cl-bulk-data-defensive #18 (single-tx UPDATE)
//
// MN attorney-discipline order_url enricher (CourtListener cross-reference).
//
// Why: scrape-mnsearch-discipline.mjs stores `source_url=https://lawyersearch.mncourts.gov/`
// (canonical search portal) for every MN row, and `order_url=null`. The portal is
// reproducible by name lookup but NOT a click-through permalink. This enricher
// looks up each attorney in CourtListener (court=minn, surname + DISCIPLINARY
// keyword) and populates order_url with the CL opinion permalink for the
// closest-date matching opinion.
//
// Coverage: CL indexes most MN Supreme Court attorney-discipline opinions but
// NOT all — newer or memorandum-only orders may be absent. We populate where
// CL has the canonical permalink; rows without a CL match keep order_url=null
// (per no-hallucinated-legal-data.md — never fabricate).
//
// Match logic:
//   1. For each unique MN attorney, search CL with court=minn + q=surname
//      + "DISCIPLINARY ACTION AGAINST" or "REINSTATEMENT" keyword.
//   2. Filter to results whose caseName contains the surname.
//   3. For each existing attorney_discipline_events row (bar_number,order_date,
//      discipline_type), pick the CL match with dateFiled closest to order_date
//      (within ±60 days window).
//   4. UPDATE order_url in a single transaction.
//
// Politeness: 1.2 sec inter-request delay (CL rate-limit safe; we have ~1200
// unique attorneys = ~25 min wall clock).
//
// Usage:
//   node scripts/ingest/enrich-mn-courtlistener.mjs                  # dry-run
//   node scripts/ingest/enrich-mn-courtlistener.mjs --apply
//   node scripts/ingest/enrich-mn-courtlistener.mjs --limit 30       # smoke
//   node scripts/ingest/enrich-mn-courtlistener.mjs --rate-ms 1500   # slower

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

import { query, end } from '../lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const CL_BASE = 'https://www.courtlistener.com';

// Bearer token (optional — boosts CL rate limit from 5K/day to higher tier
// for authenticated users). If absent, anonymous works for our volume.
const CL_TOKEN = process.env.COURTLISTENER_TOKEN || '';

// CL caseName patterns that confirm the result is an attorney-discipline order
// (vs unrelated matter sharing a surname). Matches Hansmeier-style verbose
// (DISCIPLINARY ACTION AGAINST <Full Name>), Powell-style terse (Disciplinary
// Action Against <Surname>), Reinstatement petitions, and "matter of" variants
// observed across CL data. Anything that fails this regex is silently filtered
// out at the matchEventsToCandidates filter step (line ~150) — that is the
// safe behavior; non-matching caseNames simply don't produce updates.
const DISCIPLINE_CASE_NAME_RE = /^(?:in\s+re(?:\s*:)?\s+)?(?:the\s+)?(?:matter\s+of(?:\s+the\s+discipline\s+of)?\s+|petition\s+for\s+)?(?:disciplinary\s+action\s+against|reinstatement\s+of|petition\s+for\s+reinstatement|application\s+for\s+reinstatement)/i;

// Days tolerance — match CL dateFiled to MN order_date within ±N days.
// Order_date in our DB is the OLPR Decision date (e.g. 04/22/2020). CL's
// dateFiled is when the opinion was filed by the court — usually same day
// or within a few days. We use ±60 days for safety against minor jitter.
const DATE_TOLERANCE_DAYS = 60;

// ── HTTP ─────────────────────────────────────────────────────────────────────

// Retry on transient 5xx + rate-limit. 4xx (other than 429) is permanent
// (auth, not-found, malformed) and surfaces immediately.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchJson(url, attempt = 1) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  if (CL_TOKEN) headers.Authorization = `Token ${CL_TOKEN}`;
  const r = await fetch(url, { headers });
  if (RETRYABLE_STATUSES.has(r.status)) {
    if (attempt > 5) throw new Error(`HTTP ${r.status} after ${attempt} retries — ${url}`);
    const ms = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
    console.error(`[mn-cl] HTTP ${r.status} attempt ${attempt}, backing off ${ms}ms`);
    await sleep(ms);
    return fetchJson(url, attempt + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json();
}

// ── CL search ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const MAX_PAGES = 3; // 60-result cap — common surnames (Johnson, Anderson) may exceed first page

// Fetch up to MAX_PAGES of results for a CL query. Per code-review SUGGESTION
// #3, common surnames can exceed 20 results and silently truncate; bounded
// pagination ensures the closest-date match isn't beyond position 20.
async function clSearchPaginated(query, OPTS) {
  const results = [];
  let url = `${CL_BASE}/api/rest/v4/search/?type=o&court=minn&q=${encodeURIComponent(query)}&format=json&page_size=${PAGE_SIZE}`;
  for (let page = 1; page <= MAX_PAGES && url; page++) {
    const j = await fetchJson(url);
    if (Array.isArray(j.results)) results.push(...j.results);
    url = j.next || null;
    await sleep(OPTS.rateMs);
  }
  return results;
}

// Per code-review SUGGESTION #2: always run both searches and dedupe by
// absolute_url. Otherwise an attorney with both a discipline event and a
// reinstatement event misses the reinstatement candidate when the discipline
// search returns any non-empty result (even unrelated ones).
async function clSearchAll(surname, OPTS) {
  const a = await clSearchPaginated(`"DISCIPLINARY ACTION AGAINST" "${surname}"`, OPTS);
  const b = await clSearchPaginated(`"REINSTATEMENT" "${surname}"`, OPTS);
  const seen = new Set();
  const merged = [];
  for (const c of [...a, ...b]) {
    if (!c.absolute_url) continue;
    if (seen.has(c.absolute_url)) continue;
    seen.add(c.absolute_url);
    merged.push(c);
  }
  return merged;
}

// ── Match logic ──────────────────────────────────────────────────────────────

function daysApart(a, b) {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(ms / 86400000);
}

// Given-name verification — Code-reviewer CRITICAL #1 fix.
//
// Surname-only matching can false-positive when two MN attorneys share a
// surname AND have discipline events within ±60 days of each other (e.g.,
// two "Johnson"s). A CL caseName "DISCIPLINARY ACTION AGAINST MICHAEL JOHNSON"
// would otherwise be assigned to the DB row for "DAVID JOHNSON" if dates align,
// violating no-hallucinated-legal-data.md (wrong canonical URL for the row).
//
// To prevent this: extract the given name from the CL caseName and require a
// case-insensitive substring match against the attorney's full_name. The
// extractor is conservative — if it can't confidently extract a given name,
// we fall back to surname-only match (preserves the prior behavior for
// edge-case caseNames the regex doesn't handle, with a warn flag).
//
// Patterns observed in CL court=minn data:
//   "In Re Petition for DISCIPLINARY ACTION AGAINST Paul Robert HANSMEIER, ..."
//   "In re Disciplinary Action Against Powell"             (surname-only — no given)
//   "In re Reinstatement of Smith"                          (surname-only)
//   "In re Disciplinary Action Against Adams Powell"        (compound surname, no given)
//   "In Re Petition for DISCIPLINARY ACTION AGAINST John Q Public, ..."
const NAME_AFTER_AGAINST_RE = /(?:disciplinary\s+action\s+against|reinstatement\s+of|petition\s+for\s+reinstatement|application\s+for\s+reinstatement)\s+(.+?)(?:[,;]|\s+a\s+(?:minnesota|disbar|suspen|former)|\s+an\s+attorney|\s*$)/i;

export function extractCandidateGivenName(caseName) {
  if (!caseName) return null;
  const m = caseName.match(NAME_AFTER_AGAINST_RE);
  if (!m) return null;
  const namePart = m[1].trim();
  if (!namePart) return null;
  // First whitespace-separated token = given name.
  const tokens = namePart.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null; // surname-only caption — no given to verify
  // Tokens may include "Petition" leakage; strip if first token is one of
  // the known caption-fragment leaks.
  const STOPWORDS = new Set(['petition', 'a', 'an', 'the', 'matter']);
  if (STOPWORDS.has(tokens[0].toLowerCase())) return null;
  // Strip trailing punctuation
  return tokens[0].replace(/[,.;]+$/, '');
}

// Check given name match between attorney's full_name and CL caseName.
// Returns 'verified' | 'no-given-in-caption' | 'mismatch'.
//   'verified' — caseName has a given name AND it matches one of the attorney's tokens
//   'no-given-in-caption' — caseName uses surname-only (Powell-style) — fall back to surname-match (acceptable)
//   'mismatch' — caseName has a given name AND it does NOT match — REJECT.
//                Also returned when fullName is unusable (null/empty/single-token)
//                — without something to verify against we cannot pass through.
export function verifyGivenName(fullName, caseName) {
  // Defensive: if we have no attorney full_name to verify against, treat as
  // mismatch rather than pass-through. Callers that have an unusable name
  // shouldn't be matching CL captions at all.
  if (!fullName || typeof fullName !== 'string') return 'mismatch';
  const fullTokens = fullName.split(/\s+/).filter(Boolean);
  if (fullTokens.length < 2) return 'mismatch';
  const candidateGiven = extractCandidateGivenName(caseName);
  if (!candidateGiven) return 'no-given-in-caption';
  // Drop the last non-suffix token (surname) — the rest are first/middle tokens.
  let dropIdx = fullTokens.length - 1;
  while (dropIdx > 0 && SUFFIX_RE.test(fullTokens[dropIdx])) dropIdx--;
  const givenTokens = fullTokens.slice(0, dropIdx).map((t) => t.toLowerCase().replace(/[.,]+$/, ''));
  if (givenTokens.length === 0) return 'mismatch';
  const candidateLower = candidateGiven.toLowerCase().replace(/[.,]+$/, '');
  // Match if candidate equals any first/middle token, OR is a single-letter
  // initial that matches the first letter of any first/middle token.
  for (const t of givenTokens) {
    if (t === candidateLower) return 'verified';
    // Initial form: candidate "P" matches "Paul"; or candidate "Paul" matches "P"
    if (candidateLower.length === 1 && t.startsWith(candidateLower)) return 'verified';
    if (t.length === 1 && candidateLower.startsWith(t)) return 'verified';
  }
  return 'mismatch';
}

// For one attorney's events, walk CL candidates + assign closest match per event.
// Returns Map<event_id_key, {order_url, days_off, ...}>.
// event_id_key = `${bar}|${order_date YYYY-MM-DD}|${discipline_type}`.
//
// Match preconditions (per code-review CRITICAL #1):
//   1. caseName contains attorney's surname (case-insensitive)
//   2. caseName matches DISCIPLINE_CASE_NAME_RE (attorney-discipline pattern)
//   3. candidate has both absolute_url and dateFiled
//   4. given-name verification: caseName given-name (if extractable) matches
//      one of the attorney's first/middle tokens. If caseName is surname-only,
//      this check is skipped (acceptable per CL caption variation).
export function matchEventsToCandidates(events, candidates, surname, fullName) {
  const byEvent = new Map();
  if (!candidates.length) return byEvent;

  const filtered = candidates.filter((c) => {
    const cn = (c.caseName || '').toLowerCase();
    if (!cn.includes(surname.toLowerCase())) return false;
    if (!DISCIPLINE_CASE_NAME_RE.test(cn)) return false;
    if (!c.absolute_url || !c.dateFiled) return false;
    // Given-name verification — fullName is optional (legacy callers without
    // it pass undefined; for those we skip verification, behavior unchanged).
    if (fullName) {
      const verdict = verifyGivenName(fullName, c.caseName || '');
      if (verdict === 'mismatch') return false; // hard reject
      // 'verified' or 'no-given-in-caption' both pass through
    }
    return true;
  });

  for (const ev of events) {
    if (!ev.order_date) continue;
    let best = null;
    let bestDays = Infinity;
    for (const c of filtered) {
      const d = daysApart(ev.order_date, c.dateFiled);
      if (d < bestDays && d <= DATE_TOLERANCE_DAYS) {
        best = c;
        bestDays = d;
      }
    }
    if (best) {
      byEvent.set(
        `${ev.bar_number}|${ev.order_date.toISOString().slice(0, 10)}|${ev.discipline_type}`,
        {
          order_url: `${CL_BASE}${best.absolute_url}`,
          days_off: bestDays,
          docket: best.docketNumber,
          case_name: best.caseName,
        },
      );
    }
  }
  return byEvent;
}

// ── Surname extraction ───────────────────────────────────────────────────────

const SUFFIX_RE = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

// Compound-surname particle tokens (per code-review WARNING #2). When the
// last non-suffix token is preceded by one of these, the surname spans
// multiple tokens (e.g., "DE LA CRUZ" -> "DE LA CRUZ", not just "CRUZ").
// Conservative list — when in doubt, single-token surname is the fallback.
const SURNAME_PARTICLE_RE = /^(de|del|de\s*la|de\s*los|van|von|der|den|la|le|st\.?|saint|mc|mac|o|d)$/i;

export function surnameOf(fullName) {
  if (!fullName) return null;
  const tokens = fullName.split(/\s+/).filter(Boolean);
  // Walk back past suffix tokens to the surname end.
  let endIdx = tokens.length - 1;
  while (endIdx > 0 && SUFFIX_RE.test(tokens[endIdx])) endIdx--;
  if (endIdx < 0) return null;
  // Walk back past particle tokens to find the surname start.
  let startIdx = endIdx;
  while (startIdx > 0 && SURNAME_PARTICLE_RE.test(tokens[startIdx - 1])) {
    startIdx--;
  }
  // If we walked back past tokens, take the multi-token surname.
  if (startIdx < endIdx) return tokens.slice(startIdx, endIdx + 1).join(' ');
  return tokens[endIdx];
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    limit: Infinity,
    rateMs: 1200,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--rate-ms') out.rateMs = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 35).join('\n'));
      process.exit(0);
    }
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  console.error(`[mn-cl] start — apply=${OPTS.apply} limit=${OPTS.limit} rateMs=${OPTS.rateMs} token=${CL_TOKEN ? 'yes' : 'no'}`);

  // Per cl-bulk-data-defensive.md gotcha #17 (code-reviewer CRITICAL #2):
  // set defensive session-level settings so a 25-30 min run with a single
  // pg.Client doesn't leave a zombie backend if Node crashes mid-flight.
  // statement_timeout: self-abort if any single statement runs > 30 min.
  // tcp_keepalives_*: kernel detects client death within ~2 min, kills backend.
  await query(`SET statement_timeout = '30min'`);
  await query(`SET idle_in_transaction_session_timeout = '5min'`);
  await query(`SET tcp_keepalives_idle = 60`);
  await query(`SET tcp_keepalives_interval = 10`);
  await query(`SET tcp_keepalives_count = 6`);

  // Pull all unique MN attorneys with at least one event lacking order_url.
  const attorneys = await query(
    `SELECT bar_number, full_name,
            ARRAY_AGG(json_build_object(
              'order_date', order_date,
              'discipline_type', discipline_type
            ) ORDER BY order_date) AS events
       FROM attorney_discipline_events
      WHERE jurisdiction='MN'
        AND bar_number LIKE 'MN:0%'
        AND (order_url IS NULL OR order_url='')
      GROUP BY bar_number, full_name
      ORDER BY bar_number
      LIMIT $1`,
    [Number.isFinite(OPTS.limit) ? OPTS.limit : 100000],
  );
  console.error(`[mn-cl] attorneys to enrich: ${attorneys.length}`);

  if (attorneys.length === 0) {
    console.error('[mn-cl] nothing to do');
    await end();
    return;
  }

  const updates = [];
  let processed = 0;
  let withMatch = 0;
  let httpErrors = 0;

  for (const att of attorneys) {
    processed++;
    const surname = surnameOf(att.full_name);
    if (!surname || surname.length < 2) continue;

    let candidates = [];
    try {
      // Always run BOTH searches + dedupe by absolute_url (code-review S2).
      // Plus paginate up to 60 results per query (code-review S3) so common
      // surnames don't silently truncate.
      candidates = await clSearchAll(surname, OPTS);
    } catch (e) {
      httpErrors++;
      if (httpErrors <= 5 || processed % 50 === 0) {
        console.error(`[mn-cl] err ${att.bar_number} ${surname}: ${e.message}`);
      }
      continue;
    }

    const events = att.events.map((e) => ({
      bar_number: att.bar_number,
      order_date: new Date(e.order_date),
      discipline_type: e.discipline_type,
    }));
    // Pass full_name so given-name verification can run (code-review CRITICAL #1).
    const matches = matchEventsToCandidates(events, candidates, surname, att.full_name);
    if (matches.size) {
      withMatch++;
      for (const [k, v] of matches) {
        const [bar_number, order_date, discipline_type] = k.split('|');
        updates.push({
          bar_number,
          order_date,
          discipline_type,
          order_url: v.order_url,
          days_off: v.days_off,
        });
      }
    }

    if (processed % 50 === 0 || processed <= 5) {
      console.error(`[mn-cl] progress ${processed}/${attorneys.length} attorneys-with-match=${withMatch} updates=${updates.length} httpErr=${httpErrors}`);
    }
  }

  console.error(`[mn-cl] done ${processed}/${attorneys.length}: matched=${withMatch} updates=${updates.length} httpErr=${httpErrors}`);

  if (updates.length === 0) {
    console.error('[mn-cl] no updates to apply');
    await end();
    return;
  }

  console.error('[mn-cl] sample updates (first 5):');
  for (const u of updates.slice(0, 5)) {
    console.error(`  ${u.bar_number} ${u.order_date} ${u.discipline_type} (±${u.days_off}d) → ${u.order_url}`);
  }

  if (!OPTS.apply) {
    console.error('[mn-cl] dry-run — pass --apply to write order_url');
    await end();
    return;
  }

  // BEGIN/COMMIT correctness depends on scripts/lib/db.mjs being a single
  // pg.Client (not a pg.Pool). All BEGIN/UPDATE/COMMIT statements run on the
  // same connection. If db.mjs ever switches to a pool, this transaction must
  // be rewritten to acquire one client and reuse it explicitly. Code-review
  // WARNING #3.
  await query(`BEGIN`);
  try {
    const bars = updates.map((u) => u.bar_number);
    const dates = updates.map((u) => u.order_date);
    const types = updates.map((u) => u.discipline_type);
    const urls = updates.map((u) => u.order_url);
    const upd = await query(
      `WITH x AS (
         SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[])
                AS t(bar_number, order_date, discipline_type, order_url)
       )
       UPDATE attorney_discipline_events e
          SET order_url = x.order_url
         FROM x
        WHERE e.jurisdiction='MN'
          AND e.bar_number = x.bar_number
          AND e.order_date = x.order_date
          AND e.discipline_type = x.discipline_type
          AND (e.order_url IS NULL OR e.order_url='')
        RETURNING e.bar_number;`,
      [bars, dates, types, urls],
    );
    console.error(`[mn-cl] UPDATE rowCount: ${upd.length}`);
    await query(`COMMIT`);
    console.error('[mn-cl] committed');
  } catch (err) {
    try { await query(`ROLLBACK`); } catch {}
    throw err;
  } finally {
    await end();
  }
}

const invoked = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (invoked) main().catch((e) => { console.error(e); process.exit(1); });
