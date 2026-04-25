// csv-bulk-checked: none-exists — Ohio Supreme Court publishes no discipline bulk CSV
// Template: scripts/ingest/scrape-pabar-discipline.mjs (PA JSON API win) + scripts/ingest/scrape-txbar-discipline.mjs (PDF parsing)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// Expert: alex-hormozi (value equation — Attorney-Vetting $47 SKU OH extension)
//
// Ohio Bar (Supreme Court of Ohio / Disciplinary Counsel) attorney-discipline scraper.
//
// Source discovery (probed 2026-04-24):
//   1. ODC listing  https://odc.ohio.gov/recent-disciplinary-decisions/page/N/
//      11 pages × ~20 entries = ~220 cases, 2019-04 → 2026-04. Wix-rendered;
//      titles + dates only on the listing. No body content.
//   2. CourtListener https://www.courtlistener.com/api/rest/v4/search/
//      court=ohio + q='disciplinary counsel' OR 'bar assn' OR 'bar association'
//      → 1,800+ Ohio Supreme Court discipline opinions 2014-2026 with rich
//      syllabus text (sanction-bearing) + neutralCite + ROD download_url.
//      Authoritative bulk source — replaces brute ROD scan.
//   3. Slip Opinion PDFs at
//      https://www.supremecourt.ohio.gov/rod/docs/pdf/0/{year}/{year}-Ohio-{N}.pdf
//      Per-curiam opinions contain Attorney Registration No. (real, 7 digits)
//      and city. We hit the CL-cached storage URL (cheaper, same content) and
//      fall back to the OHSC source if CL has no local_path.
//
// CourtListener is the primary discovery surface. ODC listing slugs are also
// scraped to capture freshly-decided cases not yet ingested by CL (~7-day lag).
//
// Schema-required Reg. No. (NOT NULL bar_number) is extracted from the PDF
// text. Rows missing Reg. No. are SKIPPED — no synthetic IDs.
// Rows missing order_date or with discipline_type='unknown' are SKIPPED.
//
// Polite scraping: 1-2s randomized delay between PDF fetches. ODC listing
// is hit at 1-2s/req. UA identifies INAA per CLAUDE.md polite convention.
//
// Usage:
//   node scripts/ingest/scrape-ohbar-discipline.mjs                       # dry-run, full corpus
//   node scripts/ingest/scrape-ohbar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-ohbar-discipline.mjs --max-pages 1 --apply # smoke (~50 rows)
//   node scripts/ingest/scrape-ohbar-discipline.mjs --start-date 2018-01-01 --apply
//
// Requires: pdf-parse (transitive — install with `npm i --no-save pdf-parse`).
//
// Output: staging tables _stg_attorneys_oh + _stg_discipline_oh populated via
// bulkCopyRows, then merged into public.attorneys + attorney_discipline_events.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'OH';

const CL_TOKEN = process.env.COURTLISTENER_TOKEN;

const CL_SEARCH_URL =
  'https://www.courtlistener.com/api/rest/v4/search/' +
  '?type=o&court=ohio&format=json&order_by=dateFiled+desc' +
  '&q=' +
  encodeURIComponent('"disciplinary counsel" OR "bar assn" OR "bar association"');

const ODC_LISTING_BASE = 'https://odc.ohio.gov/recent-disciplinary-decisions';
const ODC_LISTING_URL = (page) =>
  page <= 1 ? `${ODC_LISTING_BASE}/` : `${ODC_LISTING_BASE}/page/${page}/`;

const ROD_URL = (year, n) =>
  `https://www.supremecourt.ohio.gov/rod/docs/pdf/0/${year}/${year}-Ohio-${n}.pdf`;

// Discipline patterns — order matters (disbarment before suspension; specific
// before generic).
const DISCIPLINE_PATTERNS = [
  [/\bpermanent(ly)?\s+disbar/i, 'disbarment'],
  [/\bdisbar(red|ment)/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu)/i, 'resignation_with_charges'],
  [/\bdisciplinary\s+revocation/i, 'resignation_with_charges'],
  [/\binterim\s+(remedial\s+)?suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bindefinite(ly)?\s+suspen/i, 'suspension'],
  [/\bsuspen(d|sion)/i, 'suspension'],
  [/\bplaced\s+on\s+probation/i, 'probation'],
  [/\bprobation\b/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\bpublic\s+censure/i, 'public_reprimand'],
  [/\breprimand(ed)?/i, 'public_reprimand'],
];

const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment', 'suspension', 'probation', 'public_reprimand',
  'resignation_with_charges', 'interim_suspension',
]);

function normalizeDiscipline(text) {
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
    startDate: '2014-01-01',
    endDate: null,
    maxPages: Infinity, // CL paginated discovery
    odcMaxPages: 11,
    skipOdc: false,
    skipCl: false,
    pdfThrottleMs: 1200, // 1-2s polite
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-date') out.startDate = args[++i];
    else if (a === '--end-date') out.endDate = args[++i];
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--odc-max-pages') out.odcMaxPages = parseInt(args[++i], 10);
    else if (a === '--skip-odc') out.skipOdc = true;
    else if (a === '--skip-cl') out.skipCl = true;
    else if (a === '--pdf-throttle-ms') out.pdfThrottleMs = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 50).join('\n'));
      process.exit(0);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.startDate)) {
    throw new Error(`--start-date must be YYYY-MM-DD, got: ${out.startDate}`);
  }
  if (out.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(out.endDate)) {
    throw new Error(`--end-date must be YYYY-MM-DD, got: ${out.endDate}`);
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Polite delay ────────────────────────────────────────────────────────────

function politeDelay(baseMs = OPTS.pdfThrottleMs) {
  const ms = baseMs + Math.floor(Math.random() * baseMs);
  return sleep(ms);
}

// ── CourtListener discovery ─────────────────────────────────────────────────

function parseNeutralCite(s) {
  // "2024 Ohio 222" → { year: '2024', n: '222' }
  if (!s) return null;
  const m = s.match(/^(\d{4})\s+Ohio\s+(\d+)\s*$/i);
  if (!m) return null;
  return { year: m[1], n: m[2] };
}

async function fetchClPage(url, attempt = 1) {
  if (!CL_TOKEN) {
    throw new Error('COURTLISTENER_TOKEN not set in env — required for CL discovery. Use --skip-cl to bypass.');
  }
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Token ${CL_TOKEN}`,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 5) {
      throw new Error(`CL HTTP ${resp.status} ${resp.statusText} after ${attempt} attempts — ${url}`);
    }
    const backoffMs = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
    console.error(`[cl] HTTP ${resp.status}, attempt ${attempt}, backing off ${backoffMs}ms`);
    await sleep(backoffMs);
    return fetchClPage(url, attempt + 1);
  }
  if (!resp.ok) {
    throw new Error(`CL HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  return resp.json();
}

async function discoverViaCl() {
  const found = []; // { caseName, dateFiled, neutralCite, downloadUrl, syllabus, snippet, sourceUrl }
  let url =
    CL_SEARCH_URL +
    `&filed_after=${encodeURIComponent(OPTS.startDate)}` +
    (OPTS.endDate ? `&filed_before=${encodeURIComponent(OPTS.endDate)}` : '');
  let page = 0;
  while (url && page < OPTS.maxPages) {
    page++;
    const json = await fetchClPage(url);
    if (!Array.isArray(json.results)) {
      console.error(`[cl] unexpected shape — keys=${Object.keys(json).join(',')}`);
      break;
    }
    for (const r of json.results) {
      if (!r.dateFiled || !r.caseName) continue;

      // Filter to actual discipline cases by case name
      const cn = r.caseName.toLowerCase();
      const isDiscipline =
        /\bdisciplinary\s+counsel\b/.test(cn) ||
        /\bbar\s+ass(n|oc)/.test(cn) ||
        /\bbar\s+association\b/.test(cn);
      if (!isDiscipline) continue;

      // Skip reinstatement / petition cases — out of scope (event already
      // captured at original discipline date)
      const syllabus = (r.syllabus || '').slice(0, 1000);
      if (/petition\s+for\s+reinstatement/i.test(syllabus)) continue;
      if (/case\s+dismissed/i.test(syllabus)) continue;
      if (/^\s*on\s+certification\s+of\s+default\s*\.?\s*$/i.test(syllabus)) {
        // "On certification of default." — too thin; the corresponding
        // sanction order will be a separate event.
        // Keep it but mark unknown sanction (will be skipped downstream)
      }

      const cites = Array.isArray(r.citation) ? r.citation : [];
      const neutral = r.neutralCite || cites.find((c) => /^\d{4}\s+Ohio\s+\d+$/i.test(c));
      const parsed = parseNeutralCite(neutral);
      let pdfUrl = null;
      if (Array.isArray(r.opinions)) {
        for (const op of r.opinions) {
          if (op.download_url && /\.pdf$/i.test(op.download_url)) {
            pdfUrl = op.download_url;
            break;
          }
          if (op.local_path) {
            pdfUrl = `https://storage.courtlistener.com/${op.local_path}`;
            break;
          }
        }
      }
      if (!pdfUrl && parsed) {
        pdfUrl = ROD_URL(parsed.year, parsed.n);
      }
      if (!pdfUrl) continue;

      found.push({
        caseName: r.caseName,
        dateFiled: r.dateFiled,
        docketNumber: r.docketNumber || null,
        neutralCite: neutral || null,
        pdfUrl,
        syllabus,
        snippet: (r.opinions?.[0]?.snippet || '').slice(0, 1000),
      });
    }
    console.error(`[cl] page ${page}: +${json.results.length} raw; cumulative discipline=${found.length}; next=${json.next ? 'yes' : 'no'}`);
    url = json.next || null;
    if (url) await politeDelay(800);
  }
  return found;
}

// ── ODC listing discovery ───────────────────────────────────────────────────

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  return resp.text();
}

function extractOdcSlugCitations(html) {
  // Slugs of the form ".../post/<style>-slip-opinion-no-YYYY-ohio-N"
  // contain the slip opinion citation directly. Older slugs end in board
  // case numbers (e.g., "20-032") — those we cannot map to a slip opinion
  // without further lookup; we skip them here and rely on CL coverage.
  const out = [];
  const re = /href="(https:\/\/odc\.ohio\.gov\/post\/([a-z0-9-]+))"/gi;
  const seen = new Set();
  for (const m of html.matchAll(re)) {
    const slug = m[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const cite = slug.match(/-slip-opinion-no-(\d{4})-ohio-(\d+)$/);
    if (!cite) continue;
    out.push({
      caseUrl: m[1],
      slug,
      year: cite[1],
      n: cite[2],
    });
  }
  return out;
}

async function discoverViaOdc() {
  const found = [];
  for (let page = 1; page <= OPTS.odcMaxPages; page++) {
    const url = ODC_LISTING_URL(page);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.error(`[odc] page ${page} failed: ${err.message}`);
      break;
    }
    const items = extractOdcSlugCitations(html);
    if (items.length === 0) {
      console.error(`[odc] page ${page}: 0 slip-opinion slugs (older posts on this page) — continuing`);
    }
    for (const it of items) {
      found.push({
        caseName: it.slug.replace(/-/g, ' '),
        dateFiled: null, // unknown until we parse the PDF
        docketNumber: null,
        neutralCite: `${it.year} Ohio ${it.n}`,
        pdfUrl: ROD_URL(it.year, it.n),
        syllabus: null,
        snippet: null,
        odcSourceUrl: it.caseUrl,
      });
    }
    console.error(`[odc] page ${page}: +${items.length} slip-opinion slugs (cum ${found.length})`);
    await politeDelay(1000);
  }
  return found;
}

// ── PDF parsing ─────────────────────────────────────────────────────────────

async function fetchBuffer(url, attempt = 1) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/pdf' },
  });
  if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
    if (attempt > 4) throw new Error(`HTTP ${resp.status} after ${attempt} attempts — ${url}`);
    const backoffMs = 1500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
    await sleep(backoffMs);
    return fetchBuffer(url, attempt + 1);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

const REG_RE =
  /(?:Attorney\s+Registration\s+No\.?|Attorney\s+Reg\.?\s*No\.?|Reg\.?\s*No\.?\s+|registration\s+number)\s*[:#]?\s*(\d{4,8})/i;

const SUBMIT_DECIDE_RE =
  /Submitted\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})\s*[—–-]\s*Decided\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/;

const CITY_OHIO_RE = /\bof\s+([A-Z][A-Za-z. -]{1,40}?),\s+Ohio\b/;

const MONTH_NUM = {
  january: '01', february: '02', march: '03', april: '04', may: '05',
  june: '06', july: '07', august: '08', september: '09', october: '10',
  november: '11', december: '12',
};

function isoFromMonthDayYear(month, day, year) {
  const mm = MONTH_NUM[month.toLowerCase()];
  if (!mm) return null;
  const dd = String(parseInt(day, 10)).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

async function extractFromPdf(url) {
  let buf;
  try {
    buf = await fetchBuffer(url);
  } catch (err) {
    return { ok: false, err: err.message };
  }
  let text;
  try {
    const parser = new PDFParse({ data: buf });
    const out = await parser.getText();
    text = out.text || '';
  } catch (err) {
    return { ok: false, err: `pdf-parse: ${err.message}` };
  }
  const t = text.replace(/\s+/g, ' ');
  const reg = t.match(REG_RE);
  const sd = t.match(SUBMIT_DECIDE_RE);
  const decidedDate = sd ? isoFromMonthDayYear(sd[4], sd[5], sd[6]) : null;
  const submittedDate = sd ? isoFromMonthDayYear(sd[1], sd[2], sd[3]) : null;
  const cityM = t.match(CITY_OHIO_RE);
  // Sanction extraction — prefer the last sentence containing a sanction verb
  // since per-curiam opinions end with "X is suspended... It is so ordered."
  // Scan the back half of the document.
  const tail = t.slice(Math.max(0, t.length - 4000));
  const tailDisc = normalizeDiscipline(tail);
  const wholeDisc = tailDisc.type !== 'unknown' ? tailDisc : normalizeDiscipline(t.slice(0, 6000));
  return {
    ok: true,
    bar_number: reg ? reg[1] : null,
    decided_date: decidedDate,
    submitted_date: submittedDate,
    city: cityM ? cityM[1].trim() : null,
    discipline_type: wholeDisc.type,
    discipline_raw: wholeDisc.raw,
    pdf_bytes: buf.length,
    text_excerpt: t.slice(0, 800),
  };
}

// ── Name + caseName extraction ──────────────────────────────────────────────

// Convert "Disciplinary Counsel v. VanBibber" → "VanBibber"
// Convert "Columbus Bar Assn. v. Armengau" → "Armengau"
// Convert "Disciplinary Counsel v. Hunter, Tracie 22-037" → "Hunter, Tracie"
function caseStyleToRespondent(caseName) {
  if (!caseName) return null;
  const m = caseName.match(/v\.\s+(.+?)\s*$/i);
  if (!m) return null;
  let s = m[1];
  // Strip trailing slip-opinion citation
  s = s.replace(/,?\s*Slip\s+Opinion.*$/i, '');
  // Strip trailing case number like " 22-037" or " 2024-0157"
  s = s.replace(/\s+\d{2,4}-\d{2,4}\s*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

function splitFullName(s) {
  if (!s) return { full: null, first: null, last: null };
  // PDF-extracted full name like "Ronald Coleman Taylor Jr."
  const cleaned = s.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { full: cleaned, first: null, last: parts[0] };
  return { full: cleaned, first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function extractFullNameFromPdfText(text) {
  // PDFs use "Respondent, <Full Name>, of <City>, Ohio" or similar.
  // Variant: "{¶ 1} Respondent, Mary Smith, of Columbus, Ohio, Attorney Registration No. ..."
  const m = text.match(/Respondent,?\s+([A-Z][A-Za-z.'’\- ]+?),\s+of\s+[A-Z]/);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  // Variant 2: "Petitioner, Mary Smith,"
  const m2 = text.match(/Petitioner,?\s+([A-Z][A-Za-z.'’\- ]+?),\s+of\s+[A-Z]/);
  if (m2) return m2[1].replace(/\s+/g, ' ').trim();
  return null;
}

// ── Pipeline ────────────────────────────────────────────────────────────────

function dedupeByPdfUrl(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    if (!r.pdfUrl) continue;
    if (seen.has(r.pdfUrl)) continue;
    seen.add(r.pdfUrl);
    out.push(r);
  }
  return out;
}

async function enrich(record) {
  const ext = await extractFromPdf(record.pdfUrl);
  if (!ext.ok) {
    return { kind: 'pdf-fail', pdfUrl: record.pdfUrl, err: ext.err };
  }
  const fullNamePdf = extractFullNameFromPdfText(ext.text_excerpt);
  const respondentSlugStyle = caseStyleToRespondent(record.caseName);
  const fullName = fullNamePdf || respondentSlugStyle || record.caseName;
  const { first, last } = splitFullName(fullName);

  // discipline_type fallback: prefer syllabus → snippet → PDF tail
  let disc = ext.discipline_type;
  let raw = ext.discipline_raw;
  if (disc === 'unknown' && record.syllabus) {
    const s = normalizeDiscipline(record.syllabus);
    if (s.type !== 'unknown') { disc = s.type; raw = s.raw; }
  }

  // order_date fallback: prefer PDF "Decided" date → CL dateFiled → null
  const orderDate = ext.decided_date || record.dateFiled || null;

  return {
    kind: 'ok',
    bar_number: ext.bar_number,
    full_name: fullName,
    first_name: first,
    last_name: last,
    city: ext.city,
    order_date: orderDate,
    decided_date: ext.decided_date,
    submitted_date: ext.submitted_date,
    discipline_type: disc,
    discipline_raw: raw,
    violation_summary: (record.syllabus || ext.discipline_raw || '').slice(0, 500) || null,
    source_url: record.pdfUrl,
    case_name: record.caseName,
    docket_number: record.docketNumber,
    neutral_cite: record.neutralCite,
  };
}

// ── DB load ─────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_oh`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_oh`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_oh (
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
      CREATE UNLOGGED TABLE public._stg_discipline_oh (
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

    // De-dup attorneys by bar_number — keep first non-null city / name.
    const byBar = new Map();
    for (const r of records) {
      const cur = byBar.get(r.bar_number);
      if (!cur) {
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: r.first_name,
          last_name: r.last_name,
          admission_date: null,
          current_status: null,
          city: r.city,
          source_url: r.source_url,
        });
      } else {
        if (!cur.city && r.city) cur.city = r.city;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_oh',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.decided_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.source_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_oh',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_oh
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
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
      FROM _stg_discipline_oh s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_oh, public._stg_discipline_oh`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[ohbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate} endDate=${OPTS.endDate || '(none)'} skipCl=${OPTS.skipCl} skipOdc=${OPTS.skipOdc}`,
  );

  // Discovery
  const discovered = [];
  if (!OPTS.skipCl) {
    try {
      const cl = await discoverViaCl();
      discovered.push(...cl);
      console.error(`[ohbar] CL discovered ${cl.length} candidates`);
    } catch (err) {
      console.error(`[ohbar] CL discovery failed: ${err.message}`);
      if (OPTS.skipOdc) throw err;
    }
  }
  if (!OPTS.skipOdc) {
    try {
      const odc = await discoverViaOdc();
      discovered.push(...odc);
      console.error(`[ohbar] ODC discovered ${odc.length} candidates`);
    } catch (err) {
      console.error(`[ohbar] ODC discovery failed: ${err.message}`);
    }
  }

  const unique = dedupeByPdfUrl(discovered);
  console.error(`[ohbar] unique candidates: ${unique.length}`);

  if (unique.length === 0) {
    console.error('[ohbar] no candidates discovered — abort');
    return;
  }

  // Enrichment
  const records = [];
  const skipped = { noBar: 0, noDate: 0, unknownType: 0, pdfFail: 0 };
  for (let i = 0; i < unique.length; i++) {
    const cand = unique[i];
    const r = await enrich(cand);
    if (i % 25 === 0) {
      console.error(`[pdf] ${i + 1}/${unique.length} — ${cand.pdfUrl} (kept=${records.length})`);
    }
    if (r.kind === 'pdf-fail') {
      skipped.pdfFail++;
      continue;
    }
    if (!r.bar_number) {
      skipped.noBar++;
      continue;
    }
    if (!r.order_date) {
      skipped.noDate++;
      continue;
    }
    if (!ALLOWED_DISCIPLINE_TYPES.has(r.discipline_type)) {
      skipped.unknownType++;
      continue;
    }
    records.push(r);
    await politeDelay(OPTS.pdfThrottleMs);
  }

  console.error(`[ohbar] enriched — kept=${records.length}, skipped=${JSON.stringify(skipped)}`);

  // Sample
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city || '?'}`,
    );
  }

  // Histogram
  const hist = {};
  for (const r of records) hist[r.discipline_type] = (hist[r.discipline_type] || 0) + 1;
  console.error(`[ohbar] histogram: ${JSON.stringify(hist)}`);

  if (!OPTS.apply) {
    console.error(`[ohbar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[ohbar] no records to load`);
    return;
  }

  await load(records);
  console.error(`[ohbar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
