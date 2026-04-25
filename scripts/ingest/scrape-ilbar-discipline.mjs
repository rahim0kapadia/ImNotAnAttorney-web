// Template: scripts/ingest/scrape-pabar-discipline.mjs (PA JSON API win)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// csv-bulk-checked: none-exists — ARDC publishes no bulk CSV; site-search + HTML-extract only
//
// Illinois ARDC ("iardc.org") attorney discipline scraper.
//
// Source (probed 2026-04-24):
//   Landing UI:  https://www.iardc.org/DisciplinarySearch  (Case Research)
//   Search POST: https://www.iardc.org/DisciplinarySearch/SearchResults
//                  → returns HTML with PageKey UUID + __RequestVerificationToken
//   Grid POST:   https://www.iardc.org/DisciplinarySearch/SearchGrid?page=N&rows=100
//                  → returns HTML <tbody> with one <tr> per disciplinary
//                    proceeding (lawyer GUID, case#, effective-date,
//                    disposition, document-type, proceeding-type)
//   Profile GET: https://www.iardc.org/Lawyer/PrintableDetails/<guid>
//                  → fully public, contains the canonical ARDC AttorneyNumber
//                    (the real bar #), address, admission, AND every public
//                    discipline case for that lawyer (case#, disposition,
//                    effective-date, summary)
//
// The grid page enumerates discipline proceedings; the profile page is the
// authoritative per-lawyer record (bar# + all cases). We scrape grid pages to
// discover lawyer GUIDs, then dedupe and pull each unique profile once. The
// profile gives us bar# AND complete discipline history, so the per-event row
// shape is built from the profile (not the grid).
//
// Total population (probed 2026-04-24):
//   ProceedingTypes=Disciplinary, 2020-01-01..2024-12-31 → 13,629 grid rows
//   That implies several thousand unique disciplined attorneys; even 3-5
//   pages of 100 rows each comfortably clears the >500-event exit bar.
//
// Source URL used:
//   https://www.iardc.org/Lawyer/PrintableDetails/<guid> — stable, public,
//   bookmarkable. Verified via curl HEAD as part of acceptance.
//
// Usage:
//   node scripts/ingest/scrape-ilbar-discipline.mjs                       # dry-run, default window
//   node scripts/ingest/scrape-ilbar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-ilbar-discipline.mjs --start-date 2018-01-01 --end-date 2024-12-31 --apply
//   node scripts/ingest/scrape-ilbar-discipline.mjs --max-pages 3 --apply # smoke (≤300 grid rows)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── Config ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

const SEARCH_FORM_URL = 'https://www.iardc.org/DisciplinarySearch';
const SEARCH_RESULTS_URL = 'https://www.iardc.org/DisciplinarySearch/SearchResults';
const SEARCH_GRID_URL = 'https://www.iardc.org/DisciplinarySearch/SearchGrid';
const PROFILE_URL = (guid) =>
  `https://www.iardc.org/Lawyer/PrintableDetails/${guid}?searchIncludedFormerNames=False&includeFormerNames=False`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'IL';

// Map ARDC disposition phrasing → normalized discipline_type enum. ORDER
// MATTERS — disbarment-related phrases checked before suspension-related so
// reciprocal-disbarment-then-suspension still classifies as disbarment.
// Cross-referenced with PA/CA/FL scrapers so the enum stays consistent.
const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+(repri(mand|of)|censure|repro(val|of))/i, 'public_reprimand'],
  [/\bcensure/i, 'public_reprimand'],
  [/\breprimand/i, 'public_reprimand'],
  [/\breinstate/i, 'reinstatement'],
  [/\bdisability\s+inactive/i, 'disability_inactive'],
  [/\bdisabled?\b/i, 'disability_inactive'],
  [/\brestor(ed|ation)/i, 'reinstatement'],
  [/\bsanction/i, 'sanction'],
];

function normalizeDiscipline(disposition) {
  const blob = (disposition || '').trim();
  if (!blob) return { type: 'unknown', raw: null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(blob)) return { type, raw: blob.slice(0, 500) };
  }
  return { type: 'unknown', raw: blob.slice(0, 500) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    startDate: '2015-01-01',
    endDate: '2024-12-31',
    maxPages: 50,
    pageRows: 100,
    minDelayMs: 1000,
    maxDelayMs: 2000,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-date') out.startDate = args[++i];
    else if (a === '--end-date') out.endDate = args[++i];
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--page-rows') out.pageRows = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 45).join('\n'));
      process.exit(0);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.startDate)) {
    throw new Error(`--start-date must be YYYY-MM-DD, got: ${out.startDate}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.endDate)) {
    throw new Error(`--end-date must be YYYY-MM-DD, got: ${out.endDate}`);
  }
  if (!Number.isFinite(out.maxPages) || out.maxPages <= 0) {
    throw new Error('--max-pages must be positive');
  }
  if (!Number.isFinite(out.pageRows) || out.pageRows <= 0 || out.pageRows > 100) {
    throw new Error('--page-rows must be 1..100');
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Fetch ───────────────────────────────────────────────────────────────────

function isoToMDY(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
}

function politeDelay() {
  const ms = OPTS.minDelayMs + Math.floor(Math.random() * (OPTS.maxDelayMs - OPTS.minDelayMs));
  return sleep(ms);
}

// HTML decode for limited common entities. Profile pages contain &#39;, &amp;, &quot;.
function decodeHtml(s) {
  if (s == null) return s;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  if (s == null) return s;
  return decodeHtml(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Cookie jar — accumulate Set-Cookie headers across requests.
class CookieJar {
  constructor() { this.cookies = new Map(); }
  ingest(setCookieHeader) {
    if (!setCookieHeader) return;
    // Node's fetch returns Set-Cookie headers comma-joined; split on comma
    // followed by a space-then-name=value-with-no-= start. Robust enough for
    // the small number of cookies ARDC sets (just __RequestVerificationToken
    // and a session cookie at most).
    const parts = setCookieHeader.split(/,(?=[^,;=]+=[^;,=]+)/);
    for (const part of parts) {
      const [pair] = part.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function fetchWithJar(jar, url, init = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(init.headers || {}),
  };
  const cookie = jar.header();
  if (cookie) headers['Cookie'] = cookie;
  const r = await fetch(url, { ...init, headers });
  jar.ingest(r.headers.get('set-cookie'));
  return r;
}

// ── Step 1: open form, get token ────────────────────────────────────────────

async function openSearchForm(jar) {
  const r = await fetchWithJar(jar, SEARCH_FORM_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status} on GET ${SEARCH_FORM_URL}`);
  const html = await r.text();
  const formToken = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) || [])[1];
  if (!formToken) throw new Error('could not extract form __RequestVerificationToken');
  return { formToken };
}

// ── Step 2: POST search, capture PageKey ────────────────────────────────────

async function submitSearch(jar, formToken) {
  const params = new URLSearchParams();
  params.append('__RequestVerificationToken', formToken);
  params.append('AfterRaw', isoToMDY(OPTS.startDate));
  params.append('BeforeRaw', isoToMDY(OPTS.endDate));
  params.append('ProceedingTypes', 'Disciplinary');

  const r = await fetchWithJar(jar, SEARCH_RESULTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': SEARCH_FORM_URL,
    },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on POST ${SEARCH_RESULTS_URL}`);
  const html = await r.text();
  const pageKey = (html.match(/PageKey:\s*"([0-9a-f-]+)"/i) || [])[1];
  const formToken2 = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) || [])[1];
  if (!pageKey || !formToken2) {
    throw new Error('could not extract PageKey or token from SearchResults page');
  }
  return { pageKey, formToken: formToken2 };
}

// ── Step 3: paginate SearchGrid → collect (guid, name, case#, effective-date,
// disposition, doc-type, proceeding-type) tuples ────────────────────────────

function parseGridRows(html) {
  // <tr class="table-top"> is one disciplinary proceeding row. Within each:
  //   1st <td> contains <a class='show-lawyer-profile' data-id='<guid>'>Name</a>
  //   2nd <td> = case number
  //   3rd <td> = effective date (m/d/yyyy)
  //   4th <td> = disposition text
  //   5th <td> = document-type form (button label = doc type)
  //   6th <td> = proceeding type
  const rows = [];
  const trRe = /<tr class="table-top">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const tr = m[1];
    const guidMatch = tr.match(/class='show-lawyer-profile'\s+data-id='([0-9a-f-]+)'[^>]*>([^<]+)</);
    if (!guidMatch) continue;
    const guid = guidMatch[1];
    const lawyerName = decodeHtml(guidMatch[2]).trim();

    // Extract all <td> bodies in order (we need 6 of them; some are <td class=...>)
    const tdRe = /<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g;
    const tds = [];
    let tm;
    while ((tm = tdRe.exec(tr)) !== null) tds.push(tm[1]);
    if (tds.length < 6) continue;

    const caseNumber = stripTags(tds[1]);
    const effectiveDate = stripTags(tds[2]);
    const disposition = stripTags(tds[3]);
    const docButton = (tds[4].match(/<button[^>]*>([\s\S]*?)<\/button>/) || [])[1];
    const docType = stripTags(docButton || '');
    const proceedingType = stripTags(tds[5]);

    rows.push({ guid, lawyerName, caseNumber, effectiveDate, disposition, docType, proceedingType });
  }
  return rows;
}

async function fetchGridPage(jar, pageKey, formToken, page, rows) {
  const url = `${SEARCH_GRID_URL}?page=${page}&rows=${rows}`;
  const params = new URLSearchParams();
  params.append('PageKey', pageKey);
  params.append('__RequestVerificationToken', formToken);
  params.append('Before', `${isoToMDY(OPTS.endDate)} 12:00:00 AM`);
  params.append('After', '');
  params.append('ProceedingTypes', 'Disciplinary');

  const r = await fetchWithJar(jar, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': SEARCH_RESULTS_URL,
    },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on POST ${url}`);
  const html = await r.text();
  const totalCount = parseInt((html.match(/data-total-results["\s,]+(\d+)/) || [])[1] || '0', 10);
  return { html, totalCount, rows: parseGridRows(html) };
}

// ── Step 4: parse each lawyer's PrintableDetails ────────────────────────────

function parseEffectiveDate(s) {
  if (!s) return null;
  // Profile dates are "m/d/yyyy" (e.g. "11/19/2025") or "Month d, yyyy" (e.g. "November 10, 2016")
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = String(parseInt(m[1], 10)).padStart(2, '0');
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const months = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };
  m = s.match(/^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (m && months[m[1]]) {
    const mm = String(months[m[1]]).padStart(2, '0');
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

function parseAddress(html) {
  // <label>Registered Address</label>...<div class="form-control-static">
  //   <div>line1</div><div>line2</div><div>City, State zip</div>
  const m = html.match(/Registered Address[\s\S]{0,200}?<div class="form-control-static">([\s\S]*?)<\/div>\s*<\/div>/);
  if (!m) return { city: null, state: null, raw: null };
  const inner = m[1];
  const lines = [...inner.matchAll(/<div>([\s\S]*?)<\/div>/g)].map((mm) => stripTags(mm[1])).filter(Boolean);
  if (lines.length === 0) return { city: null, state: null, raw: null };
  const last = lines[lines.length - 1];
  const cityState = last.match(/^(.+?),\s*([A-Z][A-Za-z .]+?)\s*\d{5}/);
  if (cityState) {
    return { city: cityState[1].trim(), state: cityState[2].trim(), raw: lines.join(' / ') };
  }
  return { city: null, state: null, raw: lines.join(' / ') };
}

function parseAdmissionDate(html) {
  const m = html.match(/Date Admitted[\s\S]{0,400}?<p class="form-control-static">([^<]+)<\/p>/);
  if (!m) return null;
  return parseEffectiveDate(stripTags(m[1]));
}

function parseRegistrationStatus(html) {
  const m = html.match(/Illinois Registration Status[\s\S]{0,400}?<p class="form-control-static">([^<]+)<\/p>/);
  return m ? stripTags(m[1]).slice(0, 500) : null;
}

function parseDisciplineCases(html) {
  // Pattern: each case starts with
  //   <div class="lawyer-proceeding-header-group">
  //       <strong>In re Lastname, First Middle, 2024PR00082</strong>
  //   </div>
  //   <table class="table"> ... rows ... </table>
  //
  // Rows of interest:
  //   <td>Disposition</td><td class="proceeding-value">...</td>
  //   <td>Effective Date of Disposition</td><td class="proceeding-value">m/d/yyyy</td>
  //   <td>End Date of Disposition</td><td class="proceeding-value">m/d/yyyy</td>
  //   <td>Case Summary</td><td class="proceeding-value">...</td>
  //   <td>Definition of Disposition</td><td class="proceeding-value">...</td>
  const cases = [];
  const blockRe = /<div class="lawyer-proceeding-header-group">([\s\S]*?<table class="table">[\s\S]*?<\/table>)/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    const headerMatch = block.match(/<strong>In re\s+([\s\S]*?)<\/strong>/);
    const caseHeader = headerMatch ? stripTags(headerMatch[1]) : null;
    // Header format: "Lastname, First Middle, 2024PR00082" — split off case# at last comma
    let caseNumber = null;
    let respondentName = null;
    if (caseHeader) {
      const lastComma = caseHeader.lastIndexOf(',');
      if (lastComma > 0) {
        const tail = caseHeader.slice(lastComma + 1).trim();
        if (/^\d{4}[A-Z]{2}\d{4,6}$/i.test(tail) || /^\d{2,4}\s*[A-Z]+\s*\d{2,6}/i.test(tail)) {
          caseNumber = tail;
          respondentName = caseHeader.slice(0, lastComma).trim();
        } else {
          respondentName = caseHeader;
        }
      } else {
        respondentName = caseHeader;
      }
    }

    // Pull rows
    const rowRe = /<td>([^<]+)<\/td>\s*<td class="proceeding-value">([\s\S]*?)<\/td>/g;
    const fields = {};
    let rm;
    while ((rm = rowRe.exec(block)) !== null) {
      const key = stripTags(rm[1]);
      const val = stripTags(rm[2]);
      fields[key] = val;
    }

    cases.push({
      caseNumber,
      respondentName,
      disposition: fields['Disposition'] || null,
      effectiveDate: parseEffectiveDate(fields['Effective Date of Disposition'] || ''),
      endDate: parseEffectiveDate(fields['End Date of Disposition'] || ''),
      summary: fields['Case Summary'] || fields['Definition of Disposition'] || null,
    });
  }
  return cases;
}

async function fetchProfile(jar, guid) {
  const url = PROFILE_URL(guid);
  const r = await fetchWithJar(jar, url);
  if (!r.ok) throw new Error(`HTTP ${r.status} on GET ${url}`);
  const html = await r.text();

  // ARDC AttorneyNumber lives in: <input id="AttorneyNumber" name="AttorneyNumber" type="hidden" value="6324798" />
  const attorneyNumber = (html.match(/id="AttorneyNumber"[^>]*value="(\d{4,8})"/) || [])[1];

  // Full Licensed Name
  const fullLicensedName = (html.match(/Full Licensed Name[\s\S]{0,400}?<p class="form-control-static">([^<]+)<\/p>/) || [])[1];

  // Title (modal-title)
  const titleName = (html.match(/<h4 class="modal-title"[^>]*id="modalLabel">([^<]+)<\/h4>/) || [])[1];
  const fullName = stripTags(fullLicensedName || titleName || '');

  const { city, state } = parseAddress(html);
  const admissionDate = parseAdmissionDate(html);
  const status = parseRegistrationStatus(html);
  const cases = parseDisciplineCases(html);

  return {
    guid,
    barNumber: attorneyNumber || null,
    fullName: fullName || null,
    city,
    state,
    admissionDate,
    status,
    cases,
    sourceUrl: url,
  };
}

// ── Orchestration ───────────────────────────────────────────────────────────

function splitName(full) {
  if (!full) return { first: null, last: null };
  // Profile fullName is "First Middle Last" (space-separated). The grid's
  // lawyerName format is "Last, First Middle" (comma-separated). The Full
  // Licensed Name from the profile is canonical and space-separated.
  const parts = full.replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return { first: null, last: parts[0] };
  // Heuristic: if the name has a comma, take left of comma as last.
  const ix = full.indexOf(',');
  if (ix > 0) {
    const last = full.slice(0, ix).trim();
    const first = full.slice(ix + 1).trim() || null;
    return { first, last };
  }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

async function scrape() {
  const jar = new CookieJar();
  console.error(`[ilbar] step 1: opening search form`);
  const { formToken } = await openSearchForm(jar);

  console.error(`[ilbar] step 2: submitting search ${OPTS.startDate}..${OPTS.endDate} ProceedingTypes=Disciplinary`);
  const { pageKey, formToken: tok2 } = await submitSearch(jar, formToken);
  console.error(`[ilbar]   pageKey=${pageKey}`);

  // Step 3: paginate grid → collect unique GUIDs.
  const guidOrder = [];
  const guidSeen = new Map();
  let totalCount = null;
  for (let page = 1; page <= OPTS.maxPages; page++) {
    const { totalCount: tc, rows } = await fetchGridPage(jar, pageKey, tok2, page, OPTS.pageRows);
    if (totalCount == null) totalCount = tc;
    if (rows.length === 0) {
      console.error(`[ilbar]   grid page ${page}: 0 rows — stopping`);
      break;
    }
    for (const r of rows) {
      if (!guidSeen.has(r.guid)) {
        guidSeen.set(r.guid, r);
        guidOrder.push(r.guid);
      }
    }
    console.error(`[ilbar]   grid page ${page}: ${rows.length} rows (uniq lawyers so far: ${guidOrder.length} / total grid rows: ${totalCount})`);
    if (rows.length < OPTS.pageRows) break;
    await politeDelay();
  }

  // Step 4: pull each unique lawyer's profile.
  console.error(`[ilbar] step 4: fetching ${guidOrder.length} unique profiles`);
  const profiles = [];
  let i = 0;
  for (const guid of guidOrder) {
    i++;
    try {
      const profile = await fetchProfile(jar, guid);
      profiles.push(profile);
      if (i % 25 === 0 || i === guidOrder.length) {
        const events = profiles.reduce((a, p) => a + p.cases.length, 0);
        console.error(`[ilbar]   profiles ${i}/${guidOrder.length}  bar#-coverage=${profiles.filter((p) => p.barNumber).length}  events=${events}`);
      }
    } catch (err) {
      console.error(`[ilbar]   profile ${guid} failed: ${err.message}`);
    }
    await politeDelay();
  }

  return { profiles, totalGridCount: totalCount };
}

// ── Build records (attorneys + events) ──────────────────────────────────────

function buildRecords(profiles) {
  const attorneys = [];
  const events = [];

  for (const p of profiles) {
    if (!p.barNumber) {
      // Per rule no-hallucinated-legal-data + spec — if ARDC doesn't expose
      // a bar number, SKIP rather than fabricate.
      continue;
    }
    if (!p.fullName) continue;
    const { first, last } = splitName(p.fullName);
    attorneys.push({
      jurisdiction: JURISDICTION,
      bar_number: p.barNumber,
      full_name: p.fullName,
      first_name: first,
      last_name: last,
      admission_date: p.admissionDate,
      current_status: p.status,
      city: p.city,
      source_url: p.sourceUrl,
    });

    for (const c of p.cases) {
      if (!c.disposition) continue;
      const orderDate = c.effectiveDate;
      if (!orderDate) continue;
      const { type, raw } = normalizeDiscipline(c.disposition);
      events.push({
        jurisdiction: JURISDICTION,
        bar_number: p.barNumber,
        full_name: p.fullName,
        order_date: orderDate,
        effective_date: orderDate,
        discipline_type: type,
        discipline_raw: raw,
        violation_summary: (c.summary || '').slice(0, 500) || null,
        order_url: null,           // ARDC does not expose direct order URLs without auth
        source_url: p.sourceUrl,   // canonical public profile URL — verified
      });
    }
  }

  return { attorneys, events };
}

// ── DB load ─────────────────────────────────────────────────────────────────

async function load(attorneys, events) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_il`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_il`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_il (
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
      CREATE UNLOGGED TABLE public._stg_discipline_il (
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

    // De-dupe attorneys by bar_number.
    const byBar = new Map();
    for (const a of attorneys) {
      const cur = byBar.get(a.bar_number);
      if (!cur) { byBar.set(a.bar_number, a); continue; }
      // Prefer non-null city / admission_date / status from later records.
      cur.city = cur.city || a.city;
      cur.admission_date = cur.admission_date || a.admission_date;
      cur.current_status = cur.current_status || a.current_status;
    }
    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_il',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const eventRows = events.map((e) => [
      e.jurisdiction, e.bar_number, e.full_name, e.order_date, e.effective_date,
      e.discipline_type, e.discipline_raw, e.violation_summary, e.order_url, e.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_il',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      eventRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_il
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        admission_date = COALESCE(EXCLUDED.admission_date, public.attorneys.admission_date),
        current_status = COALESCE(EXCLUDED.current_status, public.attorneys.current_status),
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
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_il s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_il, public._stg_discipline_il`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[ilbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate} endDate=${OPTS.endDate} maxPages=${OPTS.maxPages} pageRows=${OPTS.pageRows}`,
  );

  const { profiles, totalGridCount } = await scrape();
  const { attorneys, events } = buildRecords(profiles);

  console.error(
    `[ilbar] collected: ${profiles.length} profiles, ${attorneys.length} attorneys-with-bar#, ${events.length} events (grid totalRows=${totalGridCount})`,
  );

  for (const e of events.slice(0, 5)) {
    console.error(
      `  · ${e.full_name} [#${e.bar_number}] — ${e.discipline_type} (${e.order_date}) — ${e.source_url}`,
    );
  }

  if (!OPTS.apply) {
    console.error('[ilbar] dry-run — pass --apply to write to DB');
    return;
  }
  if (events.length === 0) {
    console.error('[ilbar] no events — nothing to load');
    return;
  }

  await load(attorneys, events);
  console.error('[ilbar] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
