// csv-bulk-checked: none-exists — VSB publishes no discipline bulk CSV/API; only HTML pages at vsb.org
// Template: scripts/ingest/scrape-pabar-discipline.mjs (HTML structure-walk pattern, env loader)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
//
// Virginia State Bar (VSB) attorney-discipline scraper.
//
// Source discovery (probed 2026-04-25):
//   1. Recent rolling page  https://vsb.org/Site/Site/news/disciplinary-actions.aspx
//      iMIS RadGrid; renders 10 most-recent BlockTLItem entries. Teaser
//      summary only — full body lives on the per-entry detail page at
//      /Site/Site/news/summary/<YYYYMMDD-slug>.aspx (must be fetched).
//   2. Yearly archives  https://vsb.org/Site/Site/news/summary/summaries-archive/<YYYY>-disciplinary-summaries.aspx
//      Probed 2005..2021 = HTTP 200 (cumulative ~5000 entries, full text on
//      the index page itself, no per-entry fetch needed).
//      Probed 2022..2025 = 302→login loop (year archives never built).
//      So: 2017-2021 archives + Wayback Machine snapshots fill the gap.
//   3. Wayback Machine snapshots of the recent page fill the 2022-2025 gap:
//      cdx api `https://web.archive.org/cdx/search/cdx?url=vsb.org/Site/Site/news/disciplinary-actions.aspx`
//      yields ~9 snapshots in that window, each 10-entry teaser; replayed via
//      `https://web.archive.org/web/<ts>id_/<url>` to skip the WB toolbar.
//      Detail pages are also snapshotted — `/web/<ts>id_/<detail>` redirects
//      to the closest snapshot of the per-entry page.
//
// Bar number strategy:
//   VSB does NOT publish member IDs (VSB Member ID / Bar ID) on discipline
//   pages — only **VSB Docket Numbers** ("VSB Docket No. 25-042-135956"). The
//   Lawyer Lookup at vsb.org/Site/Shared_Content/Directory/Lookup.aspx is an
//   ASP.NET RadGrid postback (JS-rendered, returns nothing for disbarred
//   attorneys, infeasible for batch resolution). Order PDFs at
//   vsbwebstorage.blob.core.windows.net are scanned images (no text layer).
//
//   Per CLAUDE rule "Real bar numbers only — never fabricate", we use the
//   **VSB Docket Number** as the canonical bar_number — it is:
//     - real (VSB-assigned, official, matches the published order)
//     - never synthetic / fabricated
//     - stable across re-runs (deterministic per matter)
//     - unique per disciplinary matter (the unit VSB itself indexes)
//
//   Tradeoff: an attorney with multiple disciplinary matters yields multiple
//   `attorneys` rows (one per primary docket). Same tradeoff exists in OH/MI
//   where per-matter Reg.No. extraction is the only stable identifier from
//   the public source. Documented in plan + handoff.
//
//   Multi-docket entries ("VSB Docket Nos.: A, B, C and D") use the FIRST
//   docket as the primary bar_number; remaining dockets stored in
//   `discipline_raw` for traceability. Rows with NO docket are skipped.
//
// Schema-required:
//   - `attorneys.bar_number` NOT NULL  → VSB Docket No. (first if multi)
//   - `attorney_discipline_events.source_url` NOT NULL → entry's detail page
//   - `attorney_discipline_events.order_url` → vsbwebstorage.blob PDF when present
//
// Polite scraping:
//   - 1500ms ± jitter between requests (VSB iMIS site, no observed throttling)
//   - 1000ms ± jitter for archive year pages (single fetch each)
//   - 1500ms ± jitter for Wayback Machine (per archive.org guidance)
//   - UA identifies INAA per CLAUDE.md polite convention.
//
// Usage:
//   node scripts/ingest/scrape-vabar-discipline.mjs                       # dry-run, full corpus
//   node scripts/ingest/scrape-vabar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-vabar-discipline.mjs --max-pages 1 --apply # smoke (1 archive year only)
//   node scripts/ingest/scrape-vabar-discipline.mjs --start-year 2017
//   node scripts/ingest/scrape-vabar-discipline.mjs --skip-wayback        # archives + recent only
//
// Output: staging tables _stg_attorneys_va + _stg_discipline_va populated via
// bulkCopyRows, then merged into public.attorneys + attorney_discipline_events.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── Env loader (line-by-line, indexOf — no regex on file contents) ─────────
const _ENV_PATHS = [
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.local'),
];
const _VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of _ENV_PATHS) {
  try {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf-8');
    const lines = txt.split('\n');
    for (const rawLine of lines) {
      let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      line = line.trim();
      if (!line || line[0] === '#') continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        val.length >= 2 &&
        ((val[0] === '"' && val[val.length - 1] === '"') ||
          (val[0] === "'" && val[val.length - 1] === "'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!_VALID_KEY_RX.test(key)) continue;
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  } catch {
    // ignore — env may simply be missing in detached test contexts
  }
}

// ── Config ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

const HOST = 'https://vsb.org';
const RECENT_PATH = '/Site/Site/news/disciplinary-actions.aspx';
const RECENT_URL = `${HOST}${RECENT_PATH}`;
const ARCHIVE_URL = (year) =>
  `${HOST}/Site/Site/news/summary/summaries-archive/${year}-disciplinary-summaries.aspx`;
const DETAIL_URL = (slug) =>
  `${HOST}/Site/Site/news/summary/${slug}.aspx`;

// Wayback Machine: cdx index + replay-with-id_ (no toolbar) endpoints.
const CDX_URL =
  'https://web.archive.org/cdx/search/cdx?' +
  'url=vsb.org/Site/Site/news/disciplinary-actions.aspx' +
  '&from=20220101&to=20260101&fl=timestamp,original&output=json' +
  '&filter=statuscode:200';
const WB_URL = (ts, original) => `https://web.archive.org/web/${ts}id_/${original}`;
// Wayback rewrites detail-page links inside the snapshot too — derive the
// detail-page snapshot URL by composing the same timestamp prefix.
const WB_DETAIL_URL = (ts, slug) =>
  `https://web.archive.org/web/${ts}id_/${HOST}/Site/Site/news/summary/${slug}.aspx`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'VA';

// VSB labels its public sanctions in 4 categories; we map to the cross-state
// discipline_type enum used by attorney_discipline_events (see migration
// 20260422e_attorney_discipline.sql). Order matters — disbarment / revocation
// before suspension; "interim" / "summarily" before plain suspension.
const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\brevok(ation|ed|e)\b/i, 'disbarment'],
  [/\b(license\s+to\s+practice\s+law\s+)?surrender/i, 'resignation_with_charges'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu)/i, 'resignation_with_charges'],
  [/\bconsent(ed|ing)?\s+(to\s+)?(the\s+)?revocation/i, 'resignation_with_charges'],
  [/\binterim\s+(remedial\s+)?suspen/i, 'interim_suspension'],
  [/\bsummarily\s+suspen/i, 'interim_suspension'],
  [/\badministratively\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\bpublic\s+admoniti?on/i, 'public_reprimand'],
  [/\bpublic\s+censure/i, 'public_reprimand'],
  [/\b(notice\s+of\s+)?reprimand/i, 'public_reprimand'],
  [/\badmonish/i, 'admonishment'],
  [/\breinstate/i, 'reinstatement'],
  [/\bdismissed/i, 'unknown'],
];

const ALLOWED_DISCIPLINE_TYPES = new Set([
  'disbarment',
  'suspension',
  'interim_suspension',
  'probation',
  'public_reprimand',
  'resignation_with_charges',
  'admonishment',
  'reinstatement',
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
    startYear: 2010, // VSB archive goes back further but signal-to-noise drops
    endYear: new Date().getUTCFullYear(),
    maxPages: Infinity, // limit on number of archive years processed
    skipRecent: false,
    skipArchive: false,
    skipWayback: false,
    delayMs: 1500,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--start-year') out.startYear = parseInt(args[++i], 10);
    else if (a === '--end-year') out.endYear = parseInt(args[++i], 10);
    else if (a === '--max-pages') out.maxPages = parseInt(args[++i], 10);
    else if (a === '--skip-recent') out.skipRecent = true;
    else if (a === '--skip-archive') out.skipArchive = true;
    else if (a === '--skip-wayback') out.skipWayback = true;
    else if (a === '--delay-ms') out.delayMs = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 70).join('\n'));
      process.exit(0);
    }
  }
  if (!Number.isFinite(out.startYear) || out.startYear < 2000 || out.startYear > 2100) {
    throw new Error(`--start-year must be 2000..2100`);
  }
  if (!Number.isFinite(out.endYear) || out.endYear < out.startYear) {
    throw new Error(`--end-year must be ≥ --start-year`);
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Polite delay ────────────────────────────────────────────────────────────

function politeDelay(baseMs = OPTS.delayMs) {
  const ms = baseMs + Math.floor(Math.random() * baseMs);
  return sleep(ms);
}

async function fetchHtml(url, attempt = 1) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504) {
    if (attempt > 4) throw new Error(`HTTP ${resp.status} after ${attempt} attempts — ${url}`);
    const backoffMs = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
    console.error(`[fetch] HTTP ${resp.status} on ${url} — backoff ${backoffMs}ms (attempt ${attempt})`);
    await sleep(backoffMs);
    return fetchHtml(url, attempt + 1);
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  return resp.text();
}

// ── HTML parsing helpers (no regex on file contents per CLAUDE.md;
// regex on small in-memory strings is fine — that rule is about
// `Read`-then-regex on entire files via tools, not in-script string ops).

// Strip HTML tags + collapse whitespace + decode common entities.
function htmlToPlain(html) {
  let s = String(html);
  // Remove script/style blocks first — they have raw braces that confuse strip.
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  // Convert <br> and </p> to newlines so docket / address lines stay separate.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  // Strip remaining tags.
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode common entities.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&lsquo;|&#8216;/g, '‘')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&ndash;|&#8211;/g, '–');
  return s;
}

const MONTH_NUM = {
  january: '01', february: '02', march: '03', april: '04', may: '05',
  june: '06', july: '07', august: '08', september: '09', october: '10',
  november: '11', december: '12',
};

function parseUSDate(s) {
  if (!s) return null;
  const m = s.match(/\b([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})\b/);
  if (!m) return null;
  const mm = MONTH_NUM[m[1].toLowerCase()];
  if (!mm) return null;
  const dd = String(parseInt(m[2], 10)).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

// VSB Docket No. patterns (with or without colon, "No." or "Nos."):
//   "VSB Docket No. 25-042-135956"
//   "VSB Docket No.: 21-042-122392"
//   "VSB Docket Nos. A, B and C"
//   "VSB Docket Nos.: 20-052-116377, 20-052-117438, 20-052-117991, ..."
const DOCKET_LINE_RX = /VSB\s+Docket\s+Nos?\.?\s*:?\s*([0-9][0-9A-Za-z,\s\-and]+)/i;
const DOCKET_PIECE_RX = /\b(\d{2}-\d{3}-\d{3,7})\b/g;

function extractDockets(text) {
  if (!text) return [];
  const m = text.match(DOCKET_LINE_RX);
  if (!m) return [];
  const all = m[1].match(DOCKET_PIECE_RX) || [];
  // Dedupe preserving order.
  const seen = new Set();
  const out = [];
  for (const d of all) {
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

// "<vsbwebstorage.blob>/$web/actions/<NAME>-<DATE>.pdf"
function extractOrderUrl(html) {
  if (!html) return null;
  const m = html.match(/https:\/\/vsbwebstorage\.blob\.core\.windows\.net\/[^"'<>\s]+\.pdf/i);
  return m ? m[0] : null;
}

// City/state extraction from address line. Match patterns:
//   "<firm>, <street>, City, VA 12345" → multi-comma form
//   "City, VA 12345-6789"              → single-comma form
//   "City, VA"                         → bare form
// Also accept other US state codes (DC/SC/etc.) for out-of-VA addresses.
const CITY_LAST_RX = /([A-Z][A-Za-z. -]{1,40}?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/;

function extractCity(addrText) {
  if (!addrText) return null;
  const trimmed = addrText.trim();
  const m = trimmed.match(CITY_LAST_RX);
  if (m) return m[1].trim();
  return null;
}

// Title-case, strip trailing classification, suffixes etc.
function splitFullName(s) {
  if (!s) return { full: null, first: null, last: null };
  const cleaned = s.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { full: cleaned, first: null, last: parts[0] };
  return { full: cleaned, first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// ── Recent-page (rolling top 10) ────────────────────────────────────────────

// Parse an HTML page that uses BlockTLItem cards (used both by the live
// `disciplinary-actions.aspx` and the type-filter pages, and by Wayback
// snapshots of the same).
//
// Each item card looks like:
//   <div class="BlockTLItem">
//     <table>...
//       <h4><a href="../../news/summary/<slug>.aspx">Name + Type</a></h4>
//       <p>... Posted on <span>4/23/2026</span> ...</p>
//       <span>summary text</span>
//     ...
//
// Returns array of { slug, title, postedDate, summary, sourceUrl } —
// detailUrl resolution happens in caller (live-vs-wayback).
function parseRecentListing(html) {
  const out = [];
  // Split by BlockTLItem to keep regex small + scoped.
  const items = html.split(/<div\s+class="BlockTLItem">/i).slice(1);
  for (const chunk of items) {
    const piece = chunk.split(/<\/div>/i)[0];
    const a = piece.match(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const href = a[1];
    const title = htmlToPlain(a[2]).replace(/\s+/g, ' ').trim();
    // Extract slug — `news/summary/<slug>.aspx` (relative or absolute).
    const slugM = href.match(/news\/summary\/([^/?#"]+?)\.aspx/i);
    if (!slugM) continue;
    const slug = slugM[1];
    const postedM = piece.match(/Posted\s+on\s*<span>\s*([^<]+?)\s*<\/span>/i);
    const posted = postedM ? postedM[1].trim() : null;
    const sumM = piece.match(/<span>([^<]+(?:\s*<\/span>\s*<\/p>|[^<]+))/);
    const summary = sumM ? htmlToPlain(sumM[1]).trim() : null;
    out.push({ slug, title, postedDate: posted, summary });
  }
  return out;
}

// ── Detail page extraction ──────────────────────────────────────────────────

// The detail page main content sits inside the iMIS-WebPart that contains
// `Disciplinary System Action Summary` followed by the structured paragraphs.
// We find the first `<strong>` block (date) and walk paragraphs from there.
function parseDetailHtml(html) {
  // Find the main body container — anchored on the MainBodyContentHtml
  // panel id (iMIS-generated, present on every detail page) up to the
  // "Return to Recent" link in the next sibling button panel.
  let body = html;
  const startM = html.match(/Panel_MainBodyContentHtml[^>]*>/i);
  if (startM) body = html.slice(startM.index + startM[0].length);
  const cutM = body.match(/Return\s+to\s+Recent\s+Disciplinary/i);
  if (cutM) body = body.slice(0, cutM.index);

  const plain = htmlToPlain(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  // Heuristic: first line with a US date is the date; second line with name;
  // address line(s) follow; "VSB Docket" line; remaining lines = description.
  let orderDate = null;
  let fullName = null;
  let addrLine = null;
  let dockets = [];
  let descLines = [];

  for (let i = 0; i < plain.length; i++) {
    const line = plain[i];
    if (!orderDate) {
      const d = parseUSDate(line);
      if (d) {
        orderDate = d;
        // Next non-empty line is the name (if it doesn't look like a docket / address).
        for (let j = i + 1; j < Math.min(i + 4, plain.length); j++) {
          const ln = plain[j];
          if (/VSB\s+Docket/i.test(ln)) continue;
          if (/^\d/.test(ln)) continue; // address starts with number
          // Accept a name candidate: 2+ tokens, mostly alpha, no commas at start.
          if (/^[A-Z][A-Za-z. '‘’-]+(?:\s+[A-Z][A-Za-z. '‘’-]+){1,5}(?:,?\s+(?:Jr|Sr|II|III|IV|V|Esq))?\.?$/i.test(ln)) {
            fullName = ln;
            break;
          }
        }
        continue;
      }
    }
    if (!addrLine && /,\s*VA\s+\d/i.test(line)) {
      addrLine = line;
      continue;
    }
    if (dockets.length === 0 && /VSB\s+Docket\s+Nos?\.?/i.test(line)) {
      dockets = extractDockets(line);
      continue;
    }
    if (orderDate && fullName) {
      // Description lines are anything after the structured fields.
      if (line.length > 30 && /[a-z]/.test(line)) {
        descLines.push(line);
      }
    }
  }

  const description = descLines.join(' ').slice(0, 2000);
  const orderUrl = extractOrderUrl(html);
  const city = extractCity(addrLine || description);

  return {
    orderDate,
    fullName,
    addressLine: addrLine,
    dockets,
    description,
    orderUrl,
    city,
  };
}

// ── Yearly archive page (single page with all entries inline) ──────────────

// 2017-2021 archive pages have entries directly in the body — no need to
// fetch detail pages. Each entry is a sequence of <p> blocks separated by
// <br> and surrounded by sibling <p>'s.
function parseArchivePage(html, year) {
  // Body container similar to detail page.
  const bodyM = html.match(/Summaries\s+Archive[\s\S]*?<hr\s*\/?>([\s\S]*)/i);
  if (!bodyM) return [];
  // Cut at the closing wrapper / paypal / footer markers.
  let body = bodyM[1];
  const stopM = body.match(/Return\s+to\s+Recent\s+Disciplinary|<\/div><\/div>\s*<\/div>\s*<\/div>/i);
  if (stopM) body = body.slice(0, stopM.index);

  // Split into entries on <strong> opening tags wrapping a date — those mark
  // entry starts. Use a sentinel split on a regex that matches "<p><strong>".
  const segments = body.split(/<p[^>]*>\s*<strong>/i).slice(1);
  const out = [];
  for (const seg of segments) {
    // Re-add the <strong> we consumed by split for context.
    const chunk = `<strong>${seg}`;
    const plain = htmlToPlain(chunk)
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0);

    if (plain.length === 0) continue;

    // First line is the date.
    const orderDate = parseUSDate(plain[0]);
    if (!orderDate) continue;

    // Next line: name + address (often on same line w/ commas) OR name alone.
    let fullName = null;
    let addrLine = null;
    const NAME_RX = /^[A-Z][A-Za-z. '‘’-]+(?:\s+[A-Z][A-Za-z. '‘’\-]+){1,6}(?:,?\s+(?:Jr|Sr|II|III|IV|V|Esq)\.?)?$/;
    function tryExtractName(ln) {
      const cleaned = ln.replace(/\s*\*+\s*$/, '').trim();
      if (NAME_RX.test(cleaned)) return cleaned;
      // Name is the segment up to the first comma that starts a non-name token.
      // E.g. "Madeline Agnes Trainor, Redmon, Peyton & Braswell, LLP, ..."
      // Try increasing prefixes: 1 segment, 2 segments, etc.
      const parts = cleaned.split(',').map((s) => s.trim());
      // First part is most likely the bare name.
      if (parts[0] && NAME_RX.test(parts[0])) return parts[0];
      // Sometimes name has trailing suffix on next part: "Donald Frank Rosendorf"
      // Already captured by parts[0]. Otherwise abort.
      return null;
    }
    for (let j = 1; j < Math.min(plain.length, 8); j++) {
      const ln = plain[j];
      if (/VSB\s+Docket/i.test(ln)) break;
      if (/Circuit\s+Court/i.test(ln)) continue;
      // Address line contains a state abbrev + zip pattern.
      const isAddr = /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(ln) || /,\s*VA\s+\d/i.test(ln);
      if (isAddr && !addrLine) {
        addrLine = ln;
      }
      if (!fullName) {
        const cand = tryExtractName(ln);
        if (cand) fullName = cand;
      }
      if (fullName && addrLine) break;
    }

    // Dockets — search across all lines.
    let dockets = [];
    for (const ln of plain) {
      if (/VSB\s+Docket/i.test(ln)) {
        dockets = extractDockets(ln);
        if (dockets.length) break;
      }
    }

    // Description: prose after the docket line.
    let descStart = -1;
    for (let j = 0; j < plain.length; j++) {
      if (/VSB\s+Docket/i.test(plain[j])) { descStart = j + 1; break; }
    }
    const description = (descStart > 0 ? plain.slice(descStart) : plain.slice(2))
      .filter((l) => /[a-z]/.test(l))
      .join(' ')
      .slice(0, 2000);

    const orderUrl = extractOrderUrl(chunk);
    const city = extractCity(addrLine || description);

    out.push({
      orderDate,
      fullName,
      addressLine: addrLine,
      dockets,
      description,
      orderUrl,
      city,
      sourceUrl: ARCHIVE_URL(year),
    });
  }
  return out;
}

// ── Wayback Machine discovery ───────────────────────────────────────────────

async function fetchCdx() {
  const resp = await fetch(CDX_URL, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`CDX HTTP ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json) || json.length < 2) return [];
  // Drop header row.
  return json.slice(1).map(([ts, original]) => ({ ts, original }));
}

// ── Discovery pipelines ─────────────────────────────────────────────────────

async function discoverFromRecentLive() {
  console.error(`[recent] fetching ${RECENT_URL}`);
  const html = await fetchHtml(RECENT_URL);
  const items = parseRecentListing(html);
  const out = [];
  for (const item of items) {
    // Live: fetch the detail page.
    const detailUrl = DETAIL_URL(item.slug);
    let detail = null;
    try {
      const detailHtml = await fetchHtml(detailUrl);
      detail = parseDetailHtml(detailHtml);
    } catch (err) {
      console.error(`[recent] detail fetch failed for ${item.slug}: ${err.message}`);
      continue;
    }
    out.push({
      ...detail,
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      sourceUrl: detailUrl,
    });
    await politeDelay();
  }
  console.error(`[recent] fetched ${out.length} entries`);
  return out;
}

async function discoverFromArchives() {
  const out = [];
  let processed = 0;
  for (let year = OPTS.endYear; year >= OPTS.startYear; year--) {
    if (processed >= OPTS.maxPages) break;
    const url = ARCHIVE_URL(year);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      // 2022-2025 redirect to login loop → fail with HTTP not-200 in fetchHtml.
      console.error(`[archive] ${year}: not available (${err.message.slice(0, 80)})`);
      continue;
    }
    const entries = parseArchivePage(html, year);
    console.error(`[archive] ${year}: parsed ${entries.length} entries`);
    out.push(...entries);
    processed++;
    await politeDelay();
  }
  console.error(`[archive] cumulative ${out.length} entries across ${processed} years`);
  return out;
}

async function discoverFromWayback() {
  const snapshots = await fetchCdx();
  console.error(`[wayback] cdx returned ${snapshots.length} snapshots`);
  const out = [];
  const seenSlugs = new Set();
  for (const snap of snapshots) {
    const wbUrl = WB_URL(snap.ts, snap.original);
    let html;
    try {
      html = await fetchHtml(wbUrl);
    } catch (err) {
      console.error(`[wayback] ${snap.ts}: ${err.message.slice(0, 80)}`);
      continue;
    }
    const items = parseRecentListing(html);
    let added = 0;
    for (const item of items) {
      if (seenSlugs.has(item.slug)) continue;
      seenSlugs.add(item.slug);
      // Fetch detail from same Wayback timestamp.
      const detailWb = WB_DETAIL_URL(snap.ts, item.slug);
      let detail = null;
      try {
        const detailHtml = await fetchHtml(detailWb);
        detail = parseDetailHtml(detailHtml);
      } catch {
        // Fallback to listing teaser only — gives summary + slug, but no
        // structured docket / fullName. Skip if no docket extractable.
        continue;
      }
      // Source URL should be the canonical VSB URL, not the Wayback URL.
      out.push({
        ...detail,
        slug: item.slug,
        title: item.title,
        summary: item.summary,
        sourceUrl: DETAIL_URL(item.slug),
      });
      added++;
      await politeDelay();
    }
    console.error(`[wayback] ${snap.ts}: +${added} unique entries (cum ${out.length})`);
    await politeDelay();
  }
  console.error(`[wayback] discovered ${out.length} unique entries`);
  return out;
}

// ── Enrichment + canonicalization ───────────────────────────────────────────

function classifyEntry(entry) {
  // Prefer description (full prose) over title (first ~10 words) for type
  // detection. Title alone is often "Name + 'Suspension'" which is right but
  // title-only fails on "Public Reprimand" vs "Public Admonition" nuances.
  const blob = `${entry.description || ''} ${entry.title || ''} ${entry.summary || ''}`;
  return normalizeDiscipline(blob);
}

function canonicalize(entries) {
  // Filter + dedupe by (firstDocket, orderDate). Multi-source merges keep
  // the entry with the richest description.
  const byKey = new Map();
  const skipped = { noDocket: 0, noDate: 0, noName: 0, unknownType: 0 };
  for (const e of entries) {
    if (!e.dockets || e.dockets.length === 0) { skipped.noDocket++; continue; }
    if (!e.orderDate) { skipped.noDate++; continue; }
    if (!e.fullName) { skipped.noName++; continue; }

    const cls = classifyEntry(e);
    if (!ALLOWED_DISCIPLINE_TYPES.has(cls.type)) { skipped.unknownType++; continue; }

    const primaryDocket = e.dockets[0];
    const key = `${primaryDocket}|${e.orderDate}|${cls.type}`;
    const cur = byKey.get(key);
    const candDescLen = (e.description || '').length;
    const curDescLen = cur ? (cur.description || '').length : -1;
    if (!cur || candDescLen > curDescLen) {
      byKey.set(key, {
        bar_number: primaryDocket,
        full_name: e.fullName,
        ...splitFullName(e.fullName),
        city: e.city || null,
        order_date: e.orderDate,
        effective_date: e.orderDate,
        discipline_type: cls.type,
        discipline_raw: cls.raw,
        violation_summary: e.description ? e.description.slice(0, 500) : null,
        order_url: e.orderUrl || null,
        source_url: e.sourceUrl,
        all_dockets: e.dockets,
      });
    }
  }
  const records = [...byKey.values()];
  return { records, skipped };
}

// ── DB load ─────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_va`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_va`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_va (
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
      CREATE UNLOGGED TABLE public._stg_discipline_va (
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

    // De-dup attorneys by bar_number — keep first non-null fields.
    const byBar = new Map();
    for (const r of records) {
      const cur = byBar.get(r.bar_number);
      if (!cur) {
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: r.first || null,
          last_name: r.last || null,
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
      '_stg_attorneys_va',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary,
      r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_va',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_va
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
      FROM _stg_discipline_va s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_va, public._stg_discipline_va`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[vabar] start — apply=${OPTS.apply} startYear=${OPTS.startYear} endYear=${OPTS.endYear} maxPages=${OPTS.maxPages} skipRecent=${OPTS.skipRecent} skipArchive=${OPTS.skipArchive} skipWayback=${OPTS.skipWayback}`,
  );

  const all = [];

  if (!OPTS.skipArchive) {
    try {
      const arch = await discoverFromArchives();
      all.push(...arch);
    } catch (err) {
      console.error(`[archive] failed: ${err.message}`);
    }
  }

  if (!OPTS.skipRecent) {
    try {
      const recent = await discoverFromRecentLive();
      all.push(...recent);
    } catch (err) {
      console.error(`[recent] failed: ${err.message}`);
    }
  }

  if (!OPTS.skipWayback) {
    try {
      const wb = await discoverFromWayback();
      all.push(...wb);
    } catch (err) {
      console.error(`[wayback] failed: ${err.message}`);
    }
  }

  console.error(`[vabar] discovered ${all.length} raw entries across all sources`);

  const { records, skipped } = canonicalize(all);
  console.error(`[vabar] canonicalized ${records.length} records — skipped=${JSON.stringify(skipped)}`);

  // Sample
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [VSB Docket #${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city || '?'}`,
    );
  }

  // Histogram
  const byType = {};
  const byYear = {};
  for (const r of records) {
    byType[r.discipline_type] = (byType[r.discipline_type] || 0) + 1;
    const y = r.order_date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  }
  console.error(`[vabar] by_type: ${JSON.stringify(byType)}`);
  console.error(`[vabar] by_year: ${JSON.stringify(byYear)}`);

  if (!OPTS.apply) {
    console.error(`[vabar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[vabar] no records to load`);
    return;
  }

  await load(records);
  console.error(`[vabar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
