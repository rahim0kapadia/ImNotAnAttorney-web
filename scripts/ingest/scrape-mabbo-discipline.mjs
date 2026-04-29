// csv-bulk-checked: none-exists — Massachusetts BBO Salesforce Lightning SPA returns
//   ALL discipline records via a single Apex JSON POST (~864KB, 3300+ records).
//   Plan source #2 from docs/plans/2026-04-26-followup-ma-bbo-full-coverage.md.
// Template: scripts/ingest/scrape-mnsearch-discipline.mjs (Playwright pattern + DB load)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// Expert: openstates-team (per-state scraper class; source URL on every row).
//
// Massachusetts BBO public discipline + reinstatement decisions scraper.
//
// Source (confirmed 2026-04-29):
//   Public-facing UI: https://www.massbbo.org/s/decisions (Salesforce Lightning SPA).
//   The page issues a single Apex action POST to /sfsites/aura?...ApexAction.execute=1
//   that returns the FULL list of disciplinary decisions in one JSON payload.
//   Each entry contains:
//     - Id                       Salesforce object ID
//     - Case_Display_Label__c    "In the Matter of <First> [M.] <Last>[, <Suffix>]"
//     - Citation__c              "<vol> Mass. Att'y Disc. R. <pg> (<year>)"
//                                Sometimes parallel SJC citation: ", 437 Mass. 384 (2002)"
//     - Document_Url__c          https://www.massbbo.org/Files?fileName=<code>.pdf
//                                (filename code prefix encodes sanction type — see
//                                FILENAME_CODE_TO_DISCIPLINE map below)
//     - Sort_Text__c             "<Last> <First>" for alphabetical sort
//
// Auth: no login required; public anonymous Salesforce Community.
// CAPTCHA: not present on this URL (massbbo.lightning.force.com confirms via Apex
//   without challenge under normal Playwright traffic; if it surfaces in future,
//   surface as ERR rather than fabricate).
//
// bar_number = `MABBO:<salesforceId>` — IMPORTANT: this is a per-DISCIPLINARY-RECORD
//   key (one Salesforce ID per row in the BBO public listing), NOT per-attorney.
//   Multiple discipline events for the same attorney get DIFFERENT Salesforce IDs
//   and thus different bar_numbers — they coexist as separate rows in
//   attorney_discipline_events without colliding on the composite uniqueness
//   constraint (jurisdiction, bar_number, order_date, discipline_type).
//
//   BBO does NOT publish the attorney's bar registration number in this listing;
//   pulling registration numbers requires per-attorney lookup on a separate page.
//   We do not fabricate bar registration numbers.
//
//   Side effect: the `attorneys` table will contain one row per BBO record
//   (3315 rows) rather than one per attorney (~2400 unique attorneys). This is
//   the correct trade-off given the no-hallucinated-legal-data rule — a real
//   per-record artifact (Salesforce ID + verified PDF source URL) beats a
//   synthesized per-attorney key derived from name+date hashing.
//
//   This deliberately differs from the legacy `MASJC:<docket>` keys produced by
//   scrape-mabar-discipline.mjs (CourtListener-derived). All three (MASJC, MABBO,
//   MAFED) can coexist.
//
// source_url = the Document_Url__c PDF (HTTPS, hosted on massbbo.org). Provides
//   per-decision verification: each row points to the actual order PDF.
// order_url  = same as source_url (PDF is the order).
//
// Coverage: all BBO public records 1974-present (BBO retention scope).
//
// Usage:
//   node scripts/ingest/scrape-mabbo-discipline.mjs                  # dry-run all
//   node scripts/ingest/scrape-mabbo-discipline.mjs --apply
//   node scripts/ingest/scrape-mabbo-discipline.mjs --limit 50
//   node scripts/ingest/scrape-mabbo-discipline.mjs --help

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

import { chromium } from 'playwright';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);
const JURISDICTION = 'MA';
const PAGE_URL = 'https://www.massbbo.org/s/decisions';

// ── Filename-code → discipline type ──────────────────────────────────────────
//
// BBO publishes orders with filename prefixes that encode sanction class. Codes
// observed in 2026-04-29 dataset (3300+ entries; 35+ distinct prefixes):
//   bd  — Bar Discipline (disbarment / suspension / public reprimand)
//   pr  — Public Reprimand
//   ad  — Admonition
//   sus — Suspension (sometimes)
//   prv — Private (omitted — not public discipline)
//   etc.
// The order PDFs ARE the canonical source of sanction type. Without fetching each
// PDF the most we can determine from the index alone is "discipline event of
// unknown specific type". Using `unknown` here is the honest answer (matches
// scrape-mabar-discipline.mjs convention; ALLOWED_DISCIPLINE_TYPES set there
// admits 'unknown' for cases where snippet/title doesn't pin sanction).
//
// Future enhancement (separate phase): fetch each PDF, classify via keyword scan,
// upgrade discipline_type in-place.
//
// Conservative initial mapping by filename prefix where the prefix is unambiguous:
const FILENAME_CODE_PATTERNS = [
  [/^pr\d/i,       'public_reprimand'],   // pr10-040.pdf → public reprimand
  [/^ad\d/i,       'admonition'],         // admonition order codes
  [/^bd\d/i,       'unknown'],            // BD prefix is broad (could be disb/sus/reprimand)
  [/^reinst/i,     null],                 // reinstatement — not a discipline event
];

export function disciplineFromFilename(docUrl) {
  // Three return cases:
  //   null      = drop the row (e.g., reinstatement filename — not discipline)
  //   'unknown' = keep but don't classify sanction (BD prefix is broad, etc.)
  //   <type>    = specific sanction (public_reprimand, admonition, ...)
  //
  // Empty/null docUrl is distinct from unknown — without a doc URL we cannot
  // verify the source per no-hallucinated-legal-data rule, so the caller
  // (recordToDiscipline) drops the row entirely. Returning null here is the
  // signal that means "no source available; do not load."
  if (!docUrl) return null;
  // Extract filename from URL: ...fileName=bd10-040.pdf → bd10-040
  const m = docUrl.match(/fileName=([^&"'<>\s]+)\.pdf/i);
  if (!m) return 'unknown';
  const stem = m[1].toLowerCase();
  for (const [re, type] of FILENAME_CODE_PATTERNS) {
    if (re.test(stem)) return type; // null from this map also = drop
  }
  return 'unknown';
}

// ── Citation parsing ─────────────────────────────────────────────────────────
//
// "26 Mass. Att'y Disc. R. 1 (2010)" → year=2010
// "37 Mass. Att'y Disc. R. 1 (2021), 486 Mass. 1011 (2021)." → year=2021
// "40 Mass. Att'y Disc. R. ___ (2024)" → year=2024 (placeholder page)
//
export function extractYearFromCitation(cit) {
  if (!cit) return null;
  const m = String(cit).match(/\((\d{4})\)/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (y < 1974 || y > new Date().getUTCFullYear() + 1) return null; // BBO start = 1974
  return y;
}

// ── Name parsing ─────────────────────────────────────────────────────────────
//
// "In the Matter of <Display Name>" — strip prefix, return display name.
// Examples:
//   "In the Matter of Robert J. Abalos"
//   "In the Matter of Antonio Abbene, Jr."
//   "In the Matter of an Application for a Criminal Complaint" → reject (not individual)
//   "In the Matter of Two Attorneys" → reject
//
const NON_INDIVIDUAL_RE = /^(an?\s+impounded|discipline\s+of\s+an?\s+attorney|the\s+discipline\s+of\s+(an?\s+attorney|two|three|four|five|multiple|several)\b|two\s+attorneys|three\s+attorneys|several\s+attorneys|an?\s+application|a\s+grand\s+jury|the\s+petition|a\s+juvenile|the\s+estate)/i;

export function extractAttorneyName(label) {
  if (!label) return null;
  const m = String(label).match(/^In\s+the\s+Matter\s+of\s+(.+?)\s*$/i);
  if (!m) return null;
  const name = m[1].trim();
  if (NON_INDIVIDUAL_RE.test(name)) return null;
  if (name.length < 4 || name.length > 200) return null;
  // Need at least two whitespace-separated tokens
  if (!/\S\s+\S/.test(name)) return null;
  return name;
}

// ── Per-record mapping ───────────────────────────────────────────────────────

export function recordToDiscipline(rec) {
  const fullName = extractAttorneyName(rec.Case_Display_Label__c);
  if (!fullName) return null;
  const sourceUrl = String(rec.Document_Url__c || '');
  if (!/^https:\/\//i.test(sourceUrl)) return null; // never fabricate; HTTPS required
  const discipline = disciplineFromFilename(sourceUrl);
  if (discipline === null) return null; // explicit drop (reinstatement)
  const year = extractYearFromCitation(rec.Citation__c);
  if (!year) return null; // never fabricate dates
  // Use Jan 1 of the citation year as deterministic order_date placeholder
  // (consistent with legacy scrape-mabar-discipline.mjs / MN convention).
  // The PDF (source_url) is the authoritative dated artifact for downstream consumers.
  const orderDate = `${year}-01-01`;
  const sfId = String(rec.Id || '').trim();
  if (!/^[A-Za-z0-9]{15,18}$/.test(sfId)) return null;
  const barNumber = `MABBO:${sfId}`;
  return {
    bar_number: barNumber,
    full_name: fullName,
    order_date: orderDate,
    effective_date: null,
    discipline_type: discipline,
    discipline_raw: rec.Citation__c ? String(rec.Citation__c).slice(0, 500) : null,
    violation_summary: null,
    order_url: sourceUrl,
    source_url: sourceUrl,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    limit: Infinity,
    headed: true, // Salesforce Lightning routinely takes 10-15s to render; headed keeps debug visibility
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--headless') out.headed = false;
    else if (a === '--headed') out.headed = true;
    else if (a === '--help' || a === '-h') {
      const h = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 50).join('\n');
      console.log(h);
      process.exit(0);
    }
  }
  return out;
}

// ── Apex JSON capture ────────────────────────────────────────────────────────

async function fetchAllRecords(OPTS) {
  const browser = await chromium.launch({
    headless: !OPTS.headed,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  let captured = null;
  page.on('response', async (resp) => {
    const u = resp.url();
    if (!u.includes('/sfsites/aura?') || !u.includes('ApexAction')) return;
    let txt = '';
    try {
      txt = await resp.text();
      if (!txt.includes('Case_Display_Label__c')) return;
      // Strip Salesforce JSONP-ish XSSI prefix if present (`while(1);`)
      const jsonText = txt.replace(/^while\(1\);/, '');
      const parsed = JSON.parse(jsonText);
      // Walk into actions[0].returnValue.returnValue (observed shape 2026-04-29)
      const actions = (parsed && parsed.actions) || [];
      for (const a of actions) {
        const rv = a && a.returnValue;
        const list = rv && rv.returnValue;
        if (Array.isArray(list) && list.length && list[0].Case_Display_Label__c) {
          captured = list;
          break;
        }
      }
    } catch (e) {
      console.error(`[mabbo] response parse error: ${e.message} (payload sample: ${(txt || '').slice(0, 200)})`);
    }
  });

  await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  // Give Salesforce time to dispatch the Apex action.
  for (let i = 0; i < 30 && !captured; i++) {
    await sleep(2000);
  }

  await browser.close();
  if (!captured) throw new Error('No Apex JSON captured — page may have changed');
  return captured;
}

// ── DB load ───────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
    // TCP keepalives per cl-bulk-data-defensive.md gotcha #17 — orphan-backend defense.
    await client.query(`SET tcp_keepalives_idle = 60`);
    await client.query(`SET tcp_keepalives_interval = 10`);
    await client.query(`SET tcp_keepalives_count = 6`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ma_bbo`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ma_bbo`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ma_bbo (
        jurisdiction   char(2), bar_number text, full_name text,
        first_name     text,    last_name  text, admission_date date,
        current_status text,    city       text, source_url text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_ma_bbo (
        jurisdiction      char(2), bar_number text, full_name text,
        order_date        date,    effective_date date,
        discipline_type   text,    discipline_raw text,
        violation_summary text,    order_url text, source_url text
      );
    `);

    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const parts = r.full_name.split(/\s+/);
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: parts.length > 1 ? parts.slice(0, -1).join(' ') : null,
          last_name: parts[parts.length - 1].replace(/[,.]+$/, ''),
          source_url: r.source_url,
        });
      }
    }

    await bulkCopyRows(
      client,
      '_stg_attorneys_ma_bbo',
      ['jurisdiction', 'bar_number', 'full_name', 'first_name', 'last_name',
       'admission_date', 'current_status', 'city', 'source_url'],
      [...byBar.values()].map((a) => [
        a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
        null, null, null, a.source_url,
      ]),
    );

    await bulkCopyRows(
      client,
      '_stg_discipline_ma_bbo',
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
      FROM _stg_attorneys_ma_bbo
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
      FROM _stg_discipline_ma_bbo s
      JOIN public.attorneys a ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${ie.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ma_bbo, public._stg_discipline_ma_bbo`);
  } finally {
    await cleanup();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  console.error(`[mabbo] start — apply=${OPTS.apply} limit=${OPTS.limit} headed=${OPTS.headed}`);

  const all = await fetchAllRecords(OPTS);
  console.error(`[mabbo] fetched ${all.length} BBO records from Apex`);

  const records = [];
  let dropped = 0;
  for (const r of all) {
    const rec = recordToDiscipline(r);
    if (rec) records.push(rec);
    else dropped++;
  }
  console.error(`[mabbo] mapped ${records.length} discipline events (dropped ${dropped} non-individual / reinstatement / invalid)`);

  const limited = Number.isFinite(OPTS.limit) ? records.slice(0, OPTS.limit) : records;

  // Year coverage
  const byYear = {};
  for (const r of limited) {
    const y = r.order_date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  }
  console.error(`[mabbo] year coverage: ${JSON.stringify(byYear)}`);

  console.error('[mabbo] first 5 sample records:');
  for (const r of limited.slice(0, 5)) {
    console.error(`  · [${r.bar_number}] ${r.full_name} — ${r.discipline_type} (${r.order_date}) — ${r.source_url}`);
  }

  if (!OPTS.apply) {
    console.error('[mabbo] dry-run — pass --apply to write to DB');
    return;
  }
  if (limited.length === 0) {
    console.error('[mabbo] no records — nothing to load');
    return;
  }

  await load(limited);
  console.error('[mabbo] done');
}

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
