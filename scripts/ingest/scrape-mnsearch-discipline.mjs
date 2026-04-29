// csv-bulk-checked: none-exists — lawyersearch.mncourts.gov is a Volterra-protected
//   ASP.NET MVC web app with no public bulk download. POST /Search/Index returns
//   server-rendered HTML; POST /Search/Detail returns JSON. Plan source #1 from
//   docs/plans/2026-04-26-followup-mn-discipline-historical-years.md.
// Template: scripts/ingest/scrape-mnbar-discipline.mjs (DB load + bar_number convention)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// Expert: openstates-team (Pupa rate-limit pattern: 5-10s base + jitter, UA rotation,
//   circuit breaker on 3 consecutive failures, session reset every 10 min).
//
// Minnesota Lawyer Search — authoritative discipline scraper.
//
// Source (confirmed 2026-04-29):
//   Search UI:    https://lawyersearch.mncourts.gov/
//   Index POST:   https://lawyersearch.mncourts.gov/Search/Index
//                 (returns HTML; rows have button[id=<MarsId>] onclick="openmodal('<id>')")
//   Detail POST:  https://lawyersearch.mncourts.gov/Search/Detail
//                 (JSON body: { MarsId: "<id>" })
//                 returns array of [{ attName, attLastName, attFirstName, attMiddleName,
//                   attSuffName, marsNumber, admissionDate, businessPhone, Auth, city,
//                   stateCode, country, feeStatus/feeStatusCode, clesStatus/clesStatusCode,
//                   discStatus/discStatusCode, decisions: [{ ord, caseNumber, detDate,
//                   detDesc, docURL, ruleViolations: [{ Description, LongDescription }] }] }]
//
// WAF: Volterra ADC fingerprints curl. Playwright-driven Chromium passes.
// Rate-limit: aggressive — observed block after ~5 fast requests in 2026-04-29 testing.
// Defensive pattern (per openstates-team Pupa):
//   - Base delay 8s + 0-4s jitter between every request (configurable via --rate-ms)
//   - UA rotation per request
//   - Circuit breaker: 3 consecutive failures → 120s pause + force re-launch context
//   - Session reset every 100 requests (Volterra cookie freshness)
//
// bar_number = `MN:<marsNumber>` — REAL Minnesota mars license number, idempotent across
//   runs. This supersedes the synthetic `MN:<sha1[0:8]>` keys produced by the legacy
//   scrape-mnbar-discipline.mjs (annual-report PDF parser). Use --replace-existing
//   to atomically swap synthetic-keyed rows for real-keyed ones.
//
// source_url = 'https://lawyersearch.mncourts.gov/' (canonical search homepage,
//   reproducible via name lookup; no per-attorney permalink exists). All HTTPS.
// order_url = null (docURL filename available in Detail response but the document
//   serving endpoint is undocumented; deliberately left null rather than fabricate).
//
// Coverage: every Minnesota-licensed attorney with public discipline events,
//   all years 1996+ (per OLPR data retention).
//
// Usage:
//   node scripts/ingest/scrape-mnsearch-discipline.mjs                        # dry-run, all letters
//   node scripts/ingest/scrape-mnsearch-discipline.mjs --letters a,b,c        # subset for testing
//   node scripts/ingest/scrape-mnsearch-discipline.mjs --apply                # write to DB
//   node scripts/ingest/scrape-mnsearch-discipline.mjs --apply --replace-existing
//                                                                             # delete legacy MN rows first
//   node scripts/ingest/scrape-mnsearch-discipline.mjs --rate-ms 12000        # slower (default 8000)
//   node scripts/ingest/scrape-mnsearch-discipline.mjs --max-attorneys 50     # cap for smoke
//   node scripts/ingest/scrape-mnsearch-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

import { chromium } from 'playwright';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const JURISDICTION = 'MN';
const SEARCH_URL = 'https://lawyersearch.mncourts.gov/';
const SOURCE_URL = SEARCH_URL; // canonical, HTTPS, 200-OK at scrape-time

// Rotating browser UAs (Pupa pattern).
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];
function pickUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]; }

// ── Discipline mapping (detDesc → enum) ──────────────────────────────────────
//
// Order matters: specific before general. Mirrors scrape-mabar-discipline.mjs.
//
// Order: REPRIMAND patterns BEFORE PROBATION (so "Reprimand/Probation" maps to
// public_reprimand, not probation). Specific before general.
export const DISCIPLINE_PATTERNS = [
  [/^reciprocal/i,                                                                'reciprocal_discipline'],
  [/disability/i,                                                                 'disability_inactive'],
  [/^disbar/i,                                                                    'disbarment'],
  [/stayed\s+disbar/i,                                                            'disbarment'],
  [/^resign/i,                                                                    'resignation_with_charges'],
  [/interim\s+suspen/i,                                                           'interim_suspension'],
  [/temporary\s+suspen/i,                                                         'interim_suspension'],
  [/^suspen/i,                                                                    'suspension'],
  [/admonition|admonish/i,                                                        'admonition'],
  [/public\s+reprimand|reprimand\s*\/\s*probation|reprimand\s+and\s+probation/i,  'public_reprimand'],
  [/reprimand/i,                                                                  'public_reprimand'],
  [/probation/i,                                                                  'probation'],
  [/censure/i,                                                                    'censure'],
  // Excluded (informational, not discipline events):
  //   "Reinstated", "Reinstatement", "Reinstatement/Probation",
  //   "Petition for Reinstatement Denied", "Transfer", etc.
];

// detDesc strings that DO NOT map to a discipline event (drop the row).
const NON_DISCIPLINE = /^(reinstate|petition\s+for\s+reinstatement|transfer|denied|admitted|approved|dismissed)/i;

export function mapDiscipline(detDesc) {
  if (!detDesc) return null;
  const trimmed = detDesc.trim();
  if (NON_DISCIPLINE.test(trimmed)) return null;
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(trimmed)) return type;
  }
  return null; // unknown → drop, never fabricate
}

// ── Date normalization ───────────────────────────────────────────────────────

// detDate is "MM/DD/YYYY". Convert to ISO YYYY-MM-DD. Validate.
export function normalizeDetDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== +yyyy || d.getUTCMonth() !== +mm - 1 || d.getUTCDate() !== +dd) return null;
  return `${yyyy}-${String(+mm).padStart(2, '0')}-${String(+dd).padStart(2, '0')}`;
}

// ── Name normalization ───────────────────────────────────────────────────────
//
// Detail JSON gives both attName ("FIRST [MIDDLE] LAST") and
// attFirstName/attMiddleName/attLastName/attSuffName separately. Build a clean
// title-cased "First Middle Last [Suffix]" form.
//
export function buildFullName(detail) {
  const parts = [
    detail.attFirstName || '',
    detail.attMiddleName || '',
    detail.attLastName || '',
    detail.attSuffName || '',
  ].map((s) => titleCase(String(s).trim())).filter(Boolean);
  // attLastName may include hyphens or apostrophes — preserve.
  return parts.join(' ');
}

function titleCase(s) {
  if (!s) return s;
  // Preserve common suffixes
  if (/^(Jr|Sr|II|III|IV)\.?$/i.test(s)) {
    const u = s.toUpperCase().replace(/\.$/, '');
    if (u === 'JR') return 'Jr.';
    if (u === 'SR') return 'Sr.';
    return u;
  }
  return s.toLowerCase().replace(/(?:^|[\s\-'])\S/g, (c) => c.toUpperCase());
}

export function buildBarNumber(marsNumber) {
  const id = String(marsNumber || '').trim();
  if (!/^\d{4,10}$/.test(id)) return null;
  return `MN:${id}`;
}

// ── Detail → records ─────────────────────────────────────────────────────────
//
// Detail response is an array of length 1 (per spec). For each `decisions[i]`
// entry, emit a single attorney_discipline_events record. Drop entries that
// don't map to a discipline_type (Reinstated etc.) so we never fabricate.
//
export function detailToRecords(detail) {
  if (!detail) return [];
  const fullName = buildFullName(detail);
  const barNumber = buildBarNumber(detail.marsNumber);
  if (!fullName || !barNumber) return [];

  const decisions = Array.isArray(detail.decisions) ? detail.decisions : [];
  const out = [];
  for (const d of decisions) {
    const orderDate = normalizeDetDate(d.detDate);
    const disciplineType = mapDiscipline(d.detDesc);
    if (!orderDate) continue; // never load null-date rows
    if (!disciplineType) continue; // Reinstated/Transfer/Denied — drop
    const ruleSummary = Array.isArray(d.ruleViolations)
      ? d.ruleViolations
          .filter((r) => r && r.Description)
          .map((r) => r.LongDescription
            ? `${r.Description} (${r.LongDescription})`
            : r.Description)
          .join('; ')
          .slice(0, 2000)
      : null;
    out.push({
      bar_number: barNumber,
      full_name: fullName,
      order_date: orderDate,
      effective_date: null,
      discipline_type: disciplineType,
      discipline_raw: (d.detDesc || '').toString().slice(0, 500),
      violation_summary: ruleSummary || null,
      order_url: null, // docURL filename present but serving endpoint undocumented
      source_url: SOURCE_URL,
    });
  }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    replaceExisting: false,
    letters: 'abcdefghijklmnopqrstuvwxyz'.split(''),
    rateMs: 8000,
    jitterMs: 4000,
    maxAttorneys: Infinity,
    checkpointFile: null, // optional JSONL checkpoint — written per-letter so a crash mid-sweep keeps progress
    // Volterra ADC WAF on lawyersearch fingerprints headless Chromium and
    // returns a rejection HTML page on POST /Search/Index. Real-Chrome (headed)
    // bypasses the fingerprint. Default headed=true; override with --headless
    // when running in a Xvfb / virtual-display environment.
    headed: true,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--replace-existing') out.replaceExisting = true;
    else if (a === '--headed') out.headed = true;
    else if (a === '--headless') out.headed = false;
    else if (a === '--letters') out.letters = String(args[++i]).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    else if (a === '--rate-ms') out.rateMs = parseInt(args[++i], 10);
    else if (a === '--jitter-ms') out.jitterMs = parseInt(args[++i], 10);
    else if (a === '--max-attorneys') out.maxAttorneys = parseInt(args[++i], 10);
    else if (a === '--checkpoint-file') out.checkpointFile = args[++i];
    else if (a === '--help' || a === '-h') {
      const header = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 60).join('\n');
      console.log(header);
      process.exit(0);
    }
  }
  return out;
}

function politeDelay(opts) {
  return sleep(opts.rateMs + Math.floor(Math.random() * Math.max(0, opts.jitterMs)));
}

// ── Playwright session ───────────────────────────────────────────────────────

async function openSession(opts) {
  const browser = await chromium.launch({
    headless: !opts.headed,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: pickUA(),
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  return { browser, ctx, page };
}

async function rotateSession(session) {
  if (session && session.browser) {
    try { await session.browser.close(); } catch {}
  }
  return null;
}

// Re-open session with retry — never let a transient Chromium launch failure
// cascade into an infinite null-session retry loop.
async function reopenSessionOrExit(opts, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await openSession(opts);
    } catch (e) {
      console.error(`[mnsearch] ${label} session reopen attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) {
        console.error(`[mnsearch] FATAL: cannot reopen Chromium session after 3 attempts — exiting`);
        process.exit(1);
      }
      await sleep(10000 * attempt);
    }
  }
}

// ── Search index ──────────────────────────────────────────────────────────────
//
// POST /Search/Index from inside the loaded page (preserves Volterra cookies).
// Returns { html, marsIds }. Filters Authorized=NO+YES (we want everyone,
// including reinstated attorneys who may still have historical decisions).
//
async function searchByLastName(page, lastName) {
  return await page.evaluate(async (ln) => {
    const form = new URLSearchParams();
    form.set('LastName', ln);
    form.set('FirstName', '');
    form.set('City', '');
    form.set('SelectedState', '');
    form.set('LawyerID', '');
    form.set('SelectedRuleViolation', '');
    form.set('Authorized', 'All');
    const r = await fetch('/Search/Index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const html = await r.text();
    return { status: r.status, html };
  }, lastName);
}

// Parse rendered table HTML, extract MarsIds.
//
// Two extraction modes (kept together for back-compat with older smoke fixtures):
//   1. JS-rendered button (legacy fixtures): `openmodal("0387795")` or
//      `<button id="0387795" onclick="openmodal(...)">`.
//   2. Server-rendered #searchResults table (current production response): row has
//      8 cells; cell-7 (zero-indexed) is marsNumber. Cell-4 (`Public decision issued?`)
//      filters to YES — only those have any discipline events worth probing.
//
// extractMarsIds() returns ALL ids regardless of decision flag (legacy callers).
// extractDisciplinedMarsIds() returns only ids whose row says decision issued = YES.
//
export function extractMarsIds(html) {
  if (!html) return [];
  const ids = new Set();
  // Legacy openmodal patterns (smoke fixture / modal-trigger HTML).
  const re1 = /openmodal\(\s*['"]([0-9]{4,10})['"]\s*\)/g;
  const re2 = /<button[^>]*\bid=["']([0-9]{4,10})["'][^>]*onclick=["'][^"']*openmodal/gi;
  let m;
  while ((m = re1.exec(html))) ids.add(m[1]);
  while ((m = re2.exec(html))) ids.add(m[1]);
  // Server-rendered #searchResults table — pull last cell of every <tr>.
  const tbodyMatch = /<table[^>]*\bid=["']searchResults["'][^>]*>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  if (tbodyMatch) {
    const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let row;
    while ((row = rowRe.exec(tbodyMatch[1]))) {
      const cells = [...row[0].matchAll(cellRe)].map((c) => c[1].replace(/<[^>]+>/g, '').trim());
      if (cells.length < 8) continue;
      const mid = String(cells[7]).trim();
      if (/^\d{4,10}$/.test(mid)) ids.add(mid);
    }
  }
  return [...ids];
}

// Returns array of { marsId, hasDecision } for every row in #searchResults table.
// Filters at the call-site let us skip /Search/Detail for non-disciplined attorneys.
export function extractMarsRowsFromSearch(html) {
  if (!html) return [];
  const out = [];
  const tbodyMatch = /<table[^>]*\bid=["']searchResults["'][^>]*>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  if (!tbodyMatch) return out;
  const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let row;
  while ((row = rowRe.exec(tbodyMatch[1]))) {
    const cells = [...row[0].matchAll(cellRe)].map((c) => c[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 8) continue;
    const mid = String(cells[7]).trim();
    if (!/^\d{4,10}$/.test(mid)) continue;
    out.push({
      marsId: mid,
      attName: cells[1] || null,
      admitDate: cells[2] || null,
      authorized: cells[3] || null,
      hasDecision: /^yes$/i.test(cells[4] || ''),
      city: cells[5] || null,
      state: cells[6] || null,
    });
  }
  return out;
}

// Detect WAF rejection.
function isWafBlock(html) {
  if (!html) return false;
  return /requested URL was rejected/i.test(html) || /support request/i.test(html);
}

async function getDetail(page, marsId) {
  return await page.evaluate(async (mid) => {
    const r = await fetch('/Search/Detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ MarsId: mid }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { ok: false, status: r.status, text: (await r.text()).slice(0, 400) };
    }
    return { ok: true, status: r.status, json: await r.json() };
  }, marsId);
}

// ── Main sweep ───────────────────────────────────────────────────────────────

async function runSweep(OPTS) {
  console.error(`[mnsearch] start — apply=${OPTS.apply} replaceExisting=${OPTS.replaceExisting} letters=${OPTS.letters.join('')} rateMs=${OPTS.rateMs} jitterMs=${OPTS.jitterMs}`);

  let session = await reopenSessionOrExit(OPTS, 'initial');
  let consecutiveFailures = 0;
  let reqCount = 0;

  const records = [];
  let totalAttorneysSeen = 0;

  for (const letter of OPTS.letters) {
    // Rotate session every 100 requests.
    if (reqCount > 0 && reqCount % 100 === 0) {
      console.error(`[mnsearch] req=${reqCount}: rotating session`);
      await rotateSession(session);
      session = await reopenSessionOrExit(OPTS, 'sweep');
    }
    let attempt = 0;
    let marsRows = [];
    while (attempt < 3) {
      attempt++;
      try {
        const { status, html } = await searchByLastName(session.page, letter);
        reqCount++;
        if (isWafBlock(html)) {
          consecutiveFailures++;
          console.error(`[mnsearch] letter=${letter} attempt=${attempt} WAF-block (status=${status})`);
          if (consecutiveFailures >= 3) {
            console.error(`[mnsearch] circuit-breaker tripped — sleeping 120s + rotating session`);
            await sleep(120000);
            await rotateSession(session);
            session = await reopenSessionOrExit(OPTS, 'sweep');
            consecutiveFailures = 0;
          } else {
            await sleep(15000 * attempt);
            await rotateSession(session);
            session = await reopenSessionOrExit(OPTS, 'sweep');
          }
          continue;
        }
        marsRows = extractMarsRowsFromSearch(html);
        consecutiveFailures = 0;
        const withDecision = marsRows.filter((r) => r.hasDecision);
        console.error(`[mnsearch] letter=${letter} totalRows=${marsRows.length} withDecision=${withDecision.length}`);
        break;
      } catch (e) {
        consecutiveFailures++;
        console.error(`[mnsearch] letter=${letter} attempt=${attempt} ERR ${e.message}`);
        await sleep(8000 * attempt);
      }
    }
    // Skip Detail call for rows where Public decision issued = NO. Saves 95%+ requests.
    const marsIds = marsRows.filter((r) => r.hasDecision).map((r) => r.marsId);

    await politeDelay(OPTS);

    for (const mid of marsIds) {
      if (totalAttorneysSeen >= OPTS.maxAttorneys) {
        console.error(`[mnsearch] hit --max-attorneys ${OPTS.maxAttorneys}, stopping early`);
        break;
      }
      totalAttorneysSeen++;

      let attempt2 = 0;
      let detail = null;
      while (attempt2 < 3) {
        attempt2++;
        try {
          const r = await getDetail(session.page, mid);
          reqCount++;
          if (!r.ok) {
            consecutiveFailures++;
            console.error(`[mnsearch] mid=${mid} attempt=${attempt2} non-json status=${r.status} text=${r.text}`);
            if (isWafBlock(r.text)) {
              if (consecutiveFailures >= 3) {
                console.error(`[mnsearch] circuit-breaker tripped — sleeping 120s + rotating session`);
                await sleep(120000);
                await rotateSession(session);
                session = await reopenSessionOrExit(OPTS, 'sweep');
                consecutiveFailures = 0;
              } else {
                await sleep(15000 * attempt2);
              }
              continue;
            }
            await sleep(5000 * attempt2);
            continue;
          }
          consecutiveFailures = 0;
          detail = Array.isArray(r.json) ? r.json[0] : r.json;
          break;
        } catch (e) {
          consecutiveFailures++;
          console.error(`[mnsearch] mid=${mid} attempt=${attempt2} ERR ${e.message}`);
          await sleep(5000 * attempt2);
        }
      }

      if (detail) {
        const recs = detailToRecords(detail);
        if (recs.length) {
          records.push(...recs);
          console.error(`[mnsearch] mid=${mid} ${recs[0].full_name}: +${recs.length} discipline events`);
        }
      }

      await politeDelay(OPTS);
    }

    // Checkpoint after each letter — appends NDJSON so a mid-sweep crash on
    // letter Q still has letters A-P captured. Script can resume by reading
    // the checkpoint, deduping, and skipping completed letters.
    if (OPTS.checkpointFile) {
      try {
        const stamp = new Date().toISOString();
        const lines = records
          .filter((r) => !r._checkpointed)
          .map((r) => {
            r._checkpointed = true;
            return JSON.stringify({ ...r, _checkpointed: undefined, _letter: letter, _ts: stamp });
          });
        if (lines.length) {
          await fs.promises.appendFile(OPTS.checkpointFile, lines.join('\n') + '\n', 'utf8');
          console.error(`[mnsearch] checkpoint: appended ${lines.length} records to ${OPTS.checkpointFile} (after letter ${letter})`);
        }
      } catch (e) {
        console.error(`[mnsearch] checkpoint write failed (letter=${letter}): ${e.message}`);
      }
    }

    if (totalAttorneysSeen >= OPTS.maxAttorneys) break;
  }

  await rotateSession(session);
  // Strip checkpoint flag before returning records to caller.
  for (const r of records) delete r._checkpointed;
  console.error(`[mnsearch] sweep complete: ${totalAttorneysSeen} attorneys probed, ${records.length} discipline event records`);
  return records;
}

// ── DB load ───────────────────────────────────────────────────────────────────

async function load(records, OPTS) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
    // TCP keepalives per cl-bulk-data-defensive.md gotcha #17 — orphan-backend defense.
    await client.query(`SET tcp_keepalives_idle = 60`);
    await client.query(`SET tcp_keepalives_interval = 10`);
    await client.query(`SET tcp_keepalives_count = 6`);

    // --replace-existing: atomic single-transaction swap. The legacy
    // sha1-keyed rows are only removed if the entire bulk insert below
    // also succeeds. If anything fails, ROLLBACK keeps both legacy rows
    // and pre-load state intact.
    await client.query(`BEGIN`);
    let legacyDeleted = 0;
    if (OPTS.replaceExisting) {
      const del = await client.query(
        `DELETE FROM public.attorney_discipline_events
           WHERE jurisdiction='MN' AND bar_number ~ '^MN:[0-9a-f]{8}$'`
      );
      legacyDeleted = del.rowCount;
      console.error(`[db] deleted legacy MN sha1-keyed events (in-tx, will rollback if load fails): ${legacyDeleted}`);
    }

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mn_search`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_mn_search`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_mn_search (
        jurisdiction   char(2), bar_number text, full_name text,
        first_name     text,    last_name  text, admission_date date,
        current_status text,    city       text, source_url text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_mn_search (
        jurisdiction      char(2), bar_number text, full_name text,
        order_date        date,    effective_date date,
        discipline_type   text,    discipline_raw text,
        violation_summary text,    order_url text, source_url text
      );
    `);

    // De-dup attorneys by bar_number (multiple events per attorney common).
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const parts = r.full_name.split(/\s+/);
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: parts.length > 1 ? parts.slice(0, -1).join(' ') : null,
          last_name: parts[parts.length - 1],
          source_url: r.source_url,
        });
      }
    }

    await bulkCopyRows(
      client,
      '_stg_attorneys_mn_search',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      [...byBar.values()].map((a) => [
        a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
        null, null, null, a.source_url,
      ]),
    );

    await bulkCopyRows(
      client,
      '_stg_discipline_mn_search',
      ['jurisdiction', 'bar_number', 'full_name', 'order_date', 'effective_date',
       'discipline_type', 'discipline_raw', 'violation_summary', 'order_url', 'source_url'],
      records.map((r) => [
        JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
        r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
      ]),
    );

    const ua = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_mn_search
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name    = EXCLUDED.full_name,
        first_name   = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,  public.attorneys.last_name),
        source_url   = COALESCE(EXCLUDED.source_url, public.attorneys.source_url),
        last_seen_at = NOW();
    `);
    console.error(`[db] attorneys upserted: ${ua.rowCount}`);

    const ie = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_mn_search s
      JOIN public.attorneys a ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${ie.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mn_search, public._stg_discipline_mn_search`);
    // Single-transaction commit: legacy DELETE + new INSERT either both land or both roll back.
    // UNLOGGED staging tables are intentional (transient; per gotcha #8 they would be wiped on a
    // Supabase restart, which is acceptable here because the script re-runs from scratch on retry
    // — we never depend on staging table persistence across script invocations).
    await client.query(`COMMIT`);
  } catch (err) {
    try { await client.query(`ROLLBACK`); } catch {}
    throw err;
  } finally {
    await cleanup();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  const records = await runSweep(OPTS);

  // Year coverage report
  const byYear = {};
  for (const r of records) {
    const y = r.order_date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  }
  console.error(`[mnsearch] year coverage: ${JSON.stringify(byYear)}`);

  if (!OPTS.apply) {
    console.error('[mnsearch] dry-run — pass --apply to write to DB');
    return;
  }
  if (records.length === 0) {
    console.error('[mnsearch] no records — nothing to load');
    return;
  }

  await load(records, OPTS);
  console.error('[mnsearch] done');
}

// Only run main when invoked directly (so tests can import safely).
// Wrap realpathSync in try/catch — if argv[1] is missing or a broken symlink
// we still allow the file to be import-only (tests, REPL).
let invoked = false;
try {
  invoked = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
} catch {
  invoked = false;
}
if (invoked) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
