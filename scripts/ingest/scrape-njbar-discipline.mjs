// Template: scripts/ingest/scrape-pabar-discipline.mjs (PA JSON API win)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// csv-bulk-checked: none-exists — NJ DRB Lookup Portal serves HTML only (ASP.NET WebForms with VIEWSTATE; no JSON/CSV bulk endpoint exposed). Confirmed 2026-04-25 by probing https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneyResults.aspx?k=A and inspecting markup.
//
// New Jersey Disciplinary Review Board (DRB) public-discipline scraper.
//
// Source (probed 2026-04-25):
//   Landing UI: https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneys.aspx
//   Letter pages:
//     https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneyResults.aspx?k=<A-Z>
//
// Why this source: The DRB is the constitutional body of the NJ Supreme Court
// that adjudicates attorney misconduct; the Lookup Portal is the canonical
// public registry of NJ attorneys disciplined since January 1988. Each letter
// page (?k=A..Z) returns a flat HTML page listing every disciplined attorney
// whose surname starts with that letter, with one or more decision rows per
// attorney. Bar numbers (Bar IDs in DRB parlance) are real and required — they
// are the NJ admission ID in `NNNNN-YYYY` form.
//
// Page structure (stable markup, observed 2026-04-25):
//
//   <div ... background-color: #F0F0E3; ...>
//     LASTNAME, FIRST M
//     (Bar ID: <a href="SearchResults.aspx?type=attorney&master_id=NNN&bar_admin_no=NNNNN-YYYY">NNNNN-YYYY</a>)
//   </div>
//   <table id="ContentPlaceHolder1_rpResults_gvDecisions_<idx>">
//     <tr>
//       <td>
//         <span style="color: Red;">CASE_TYPE (DOCKET)</span>
//         MM/DD/YYYY
//         - <a href="SearchResults.aspx?type=docket_no&docket_no=DOCKET">SANCTION_LABEL</a>
//       </td>
//     </tr>
//     ... (one or more <tr> per attorney) ...
//   </table>
//
// Cardinality probe (letter A): 116 attorneys, 217 decisions, 18 attorneys
// with multiple decisions. Extrapolated full corpus ≈ 3,000 attorneys / 5,000+
// events.
//
// Why HTML scraping (no API): the search UI is ASP.NET WebForms. We tried the
// page in scope; there is no XHR JSON endpoint behind the alphabetical view —
// the entire result set is server-rendered into a single page per letter. We
// hit each letter page once, parse with regex against stable id/class markers,
// and apply 1-2s polite delays between pages per CLAUDE.md polite-scraping
// convention.
//
// User-Agent identifies INAA per polite-scraping convention. attorney_id
// (bar_admin_no) is required by schema (NOT NULL bar_number) — rows missing
// it are dropped with a warning. (DRB is bar-number-indexed; missing IDs are
// vanishingly rare and would indicate parse failure rather than source data.)
//
// Usage:
//   node scripts/ingest/scrape-njbar-discipline.mjs                       # dry-run, all 26 letters
//   node scripts/ingest/scrape-njbar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-njbar-discipline.mjs --letters A,B         # smoke test
//   node scripts/ingest/scrape-njbar-discipline.mjs --letters A --apply   # 1-letter end-to-end smoke
//
// Output: staging tables _stg_attorneys_nj + _stg_discipline_nj populated via
// bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── Config ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

const BASE_URL =
  'https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneyResults.aspx';
const LANDING_URL =
  'https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneys.aspx';

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'NJ';

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Map DRB sanction-label free text (drawn from <a docket_no=...>LABEL</a>) and
// fallback CASE_TYPE to the normalized discipline_type enum used by the
// attorney_discipline_events schema. Order matters — disbarment checked before
// suspension so reciprocal-disbarment-then-suspension still classify as
// disbarment. Cross-referenced with PA/CA/TX scrapers for enum consistency.
//
// Common DRB labels seen in probe: DISBAR, REPRIMAND, CENSURE, ADMONITION,
// '1 YR. SUSP.', '6 MO. SUSP.', '3 MO. SUSP.', 'TEMP. SUSPENSION',
// 'STAYED SUSP.', 'PROBATION', 'NO DISCIPLINE', 'DISMISSED', 'REINSTATED',
// 'DISBAR BY CONSENT', 'TRANSFERRED TO DISABILITY INACTIVE'.
// DRB uses several abbreviations in the sanction-link text — most notably
// "PUB REP" (Public Reprimand, ~180 events), "RESTORE" (reinstatement,
// ~180), "PRIV REP" (private reprimand, ~rare). Patterns probed against
// the live corpus on 2026-04-25; matched against the unknown-bucket
// histogram to maximize coverage.
const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemp(\.|orary)?\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsusp(\.|en)|\bsusp\b/i, 'suspension'],
  [/\bprobation/i, 'probation'],
  [/\bpub(?:\.|lic)?\s+rep\b/i, 'public_reprimand'],          // PUB REP, PUB. REP, PUBLIC REPRIMAND (matches "PUB REP …")
  [/\bcensure/i, 'public_reprimand'],
  [/\breprimand/i, 'public_reprimand'],
  [/\bpriv(?:\.|ate)?\s+rep\b/i, 'admonishment'],             // PRIV REP — historical equivalent of admonition
  [/\badmon/i, 'admonishment'],
  [/\breinstate/i, 'reinstatement'],
  [/\brestore/i, 'reinstatement'],                             // DRB shorthand for reinstatement
  [/\bdisab(led|ility)\b/i, 'disability_inactive'],
  [/\blic(\.|ense)?\s+revoked/i, 'disbarment'],                // license revocation == disbarment effect
  [/\bsanction/i, 'sanction'],
  [/\bdismiss/i, 'dismissed'],                                 // outcome: charges dismissed
  [/\bno\s+(additional\s+)?discipline/i, 'dismissed'],         // outcome: no discipline imposed
  [/\bvacate/i, 'dismissed'],                                  // outcome: prior order vacated
  [/\bremand/i, 'dismissed'],                                  // outcome: remanded to lower body
  [/\btime\s+served/i, 'suspension'],                          // sentence-equivalent suspension
];

function normalizeDiscipline(sanctionLabel, caseType) {
  const blob = `${sanctionLabel || ''} ${caseType || ''}`.trim();
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
    letters: ALL_LETTERS.slice(),
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--letters') {
      const raw = String(args[++i] || '').toUpperCase();
      const letters = raw
        .split(/[,\s]+/)
        .filter(Boolean)
        .filter((c) => /^[A-Z]$/.test(c));
      if (!letters.length) throw new Error(`--letters expected comma-separated A-Z, got: ${raw}`);
      out.letters = letters;
    } else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 60).join('\n'));
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── Fetch / parse ───────────────────────────────────────────────────────────

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}

function squish(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

function parseMDY(s) {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const mm = String(parseInt(m[1], 10)).padStart(2, '0');
  const dd = String(parseInt(m[2], 10)).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function splitName(full) {
  if (!full) return { first: null, last: null };
  // DRB names come "LASTNAME, FIRST MIDDLE [SUFFIX]". Split on first comma.
  const ix = full.indexOf(',');
  if (ix < 0) {
    const parts = full.replace(/\s+/g, ' ').trim().split(' ');
    if (parts.length === 1) return { first: null, last: parts[0] };
    return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
  }
  const last = full.slice(0, ix).trim();
  const first = full.slice(ix + 1).trim() || null;
  return { first, last };
}

function politeDelay() {
  const ms = 1000 + Math.floor(Math.random() * 1000);
  return sleep(ms);
}

async function fetchLetter(letter) {
  const url = `${BASE_URL}?k=${letter}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': LANDING_URL,
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  const html = await resp.text();
  return { url, html };
}

// Each attorney is rendered as a header div followed by a gvDecisions table
// containing 1+ decision rows. Anchor on the bar-id link, then locate the
// adjacent gvDecisions table by sequential index. We slice between successive
// "background-color: #F0F0E3" markers (the header tint) — that boundary is
// the same on every observed page.
function parseLetter(html, letterUrl) {
  const out = [];

  // Split on the F0F0E3 header marker. First chunk is page chrome (skip).
  const chunks = html.split(/style="border: 1px solid #cccccc; text-align: left; background-color: #F0F0E3;[\s\S]*?padding: 3px;"/);
  // chunks[0] is everything before first attorney; chunks[i>=1] starts AFTER
  // the marker, so it begins with `> NAME (Bar ID: ...) </div> <decision-table>`.

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Bar ID anchor: <a ... bar_admin_no=NNNNN-YYYY ...> NNNNN-YYYY </a>
    const barM = chunk.match(/bar_admin_no=([A-Za-z0-9-]+)[^>]*>\s*([A-Za-z0-9-]+)\s*<\/a>/);
    if (!barM) continue;
    const barNumber = (barM[1] || barM[2] || '').trim();
    if (!barNumber) continue;

    // Master ID (DRB internal) — useful for the per-attorney detail URL.
    const masterIdM = chunk.match(/master_id=(\d+)/);
    const masterId = masterIdM ? masterIdM[1] : null;

    // Name appears in the ">NAME (Bar ID:" preface. The chunk begins right
    // after the F0F0E3 div opening, so the leading text up to "(Bar ID:" is
    // the attorney name (with the ">" of the opening tag stripped).
    const nameM = chunk.match(/^[\s\S]*?>\s*([^<]+?)\s*&nbsp;?\(Bar ID:/);
    const fullName = nameM ? squish(nameM[1]) : null;
    if (!fullName) continue;

    // Decision rows live in the next gvDecisions table. Extract the table
    // bound to this attorney chunk only (bounded above; the next chunk
    // boundary is the next F0F0E3 header).
    const tableM = chunk.match(/<table id="ContentPlaceHolder1_rpResults_gvDecisions_\d+"[^>]*>([\s\S]*?)<\/table>/);
    if (!tableM) continue;

    // The decisions table is laid out as a two-column grid: each <tr> holds
    // up to TWO <td> cells, each containing one full decision (case label,
    // date, sanction link). The right cell is sometimes empty (`<td></td>`)
    // when the row count is odd. We iterate <td> cells, not <tr> rows, so
    // both cells contribute one decision each.
    const cells = tableM[1].match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];

    const attorneyDetailUrl = masterId
      ? `https://drblookupportal.judiciary.state.nj.us/SearchResults.aspx?type=attorney&master_id=${masterId}&bar_admin_no=${encodeURIComponent(barNumber)}`
      : null;

    for (const tr of cells) {
      // <span style="color: Red;"> CASE_TYPE (DOCKET) </span>
      const caseM = tr.match(/<span\s+style="color:\s*Red;">([\s\S]*?)<\/span>/i);
      if (!caseM) continue; // empty trailing cell on odd-count rows
      const caseRaw = caseM ? squish(caseM[1]) : null;
      let caseType = caseRaw;
      let docketNumber = null;
      if (caseRaw) {
        const dm = caseRaw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        if (dm) {
          caseType = dm[1].trim();
          docketNumber = dm[2].trim();
        }
      }

      // Date is the loose text between </span> and the next <a> sanction link,
      // matching " MM/DD/YYYY  - ".
      const dateM = tr.match(/<\/span>([\s\S]*?)<a/);
      const orderDate = dateM ? parseMDY(squish(dateM[1])) : null;

      // Sanction label: anchor text of the docket-link <a>.
      const sanctionM = tr.match(/<a[^>]*type=docket_no[^>]*>([\s\S]*?)<\/a>/i);
      const sanctionLabel = sanctionM ? squish(sanctionM[1]) : null;

      // Order URL: link target (DRB SearchResults — the public viewer for the
      // docket entry; this is the per-decision verifiable URL). Note the
      // capture must allow zero chars BEFORE the literal so the very-first
      // SearchResults.aspx in the href (which is the entire href on this
      // page) is captured. Earlier draft used `[^'"]+SearchResults` which
      // required chars before the literal and missed every row.
      const orderUrlM = tr.match(/href=['"]([^'"]*SearchResults\.aspx\?type=docket_no[^'"]*)['"]/i);
      const orderUrl = orderUrlM
        ? `https://drblookupportal.judiciary.state.nj.us/${orderUrlM[1].replace(/^\.?\/?/, '')}`
        : null;

      const { type, raw } = normalizeDiscipline(sanctionLabel, caseType);

      out.push({
        bar_number: barNumber,
        master_id: masterId,
        full_name: fullName,
        case_type: caseType,
        docket_number: docketNumber,
        order_date: orderDate,
        sanction_label: sanctionLabel,
        discipline_type: type,
        discipline_raw: raw,
        order_url: orderUrl,
        attorney_detail_url: attorneyDetailUrl,
        source_url: letterUrl,
      });
    }
  }

  return out;
}

// The DRB ASP.NET app intermittently serves empty result lists (no header
// chunks, no decisions) — observed during the 2026-04-25 full run for letters
// B and C, both of which contain hundreds of attorneys. A page is "empty" if
// it has < 5 KB of body or zero `Bar ID:` markers. Retry up to 3 times with
// exponential backoff before giving up. Only X and Q legitimately have very
// few rows; we still retry once for those to confirm.
function looksEmpty(html) {
  if (!html || html.length < 5000) return true;
  return !html.includes('Bar ID:');
}

async function fetchLetterWithRetry(letter, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const { url, html } = await fetchLetter(letter);
      if (!looksEmpty(html)) return { url, html };
      // Empty body — backoff and retry. Letters X/Q can be legitimately tiny;
      // a single retry confirms the empty result is real, not transient.
      console.error(`[drb] letter ${letter}: empty page on attempt ${i + 1}, retrying...`);
    } catch (err) {
      lastErr = err;
      console.error(`[drb] letter ${letter}: fetch error on attempt ${i + 1}: ${err.message}`);
    }
    await sleep(2000 * (i + 1));
  }
  // Final fetch — accept whatever comes back (caller will record 0 rows).
  if (lastErr) throw lastErr;
  return fetchLetter(letter);
}

async function scrape() {
  const all = [];
  for (let i = 0; i < OPTS.letters.length; i++) {
    const letter = OPTS.letters[i];
    const { url, html } = await fetchLetterWithRetry(letter);
    const rows = parseLetter(html, url);
    console.error(`[drb] letter ${letter}: ${rows.length} decision rows (cum ${all.length + rows.length})`);
    for (const r of rows) all.push(r);
    if (i < OPTS.letters.length - 1) await politeDelay();
  }
  return all;
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nj`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_nj`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_nj (
        jurisdiction    char(2),
        bar_number      text,
        full_name       text,
        first_name      text,
        last_name       text,
        admission_date  date,
        current_status  text,
        source_url      text
      );
      CREATE UNLOGGED TABLE public._stg_discipline_nj (
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

    // Derive admission_date from the year suffix on the DRB bar number
    // (NNNNN-YYYY = registration number-admission year). This is the year
    // the attorney was admitted to the NJ bar; we store it as Jan 1 of that
    // year (day-precision unknown from this source).
    function admissionFromBarNumber(bar) {
      const m = bar.match(/-(\d{4})$/);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      if (y < 1900 || y > 2100) return null;
      return `${y}-01-01`;
    }

    // De-dupe attorneys by bar_number; retain the attorney_detail_url as the
    // canonical attorneys.source_url so a downstream verifier can confirm.
    const byBar = new Map();
    for (const r of records) {
      if (byBar.has(r.bar_number)) continue;
      const { first, last } = splitName(r.full_name);
      byBar.set(r.bar_number, {
        jurisdiction: JURISDICTION,
        bar_number: r.bar_number,
        full_name: r.full_name,
        first_name: first,
        last_name: last,
        admission_date: admissionFromBarNumber(r.bar_number),
        current_status: null, // DRB doesn't report current status; leave NULL
        source_url: r.attorney_detail_url || r.source_url,
      });
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_nj',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','source_url'],
      attorneyRows,
    );

    // Filter discipline rows to those with a valid order_date AND a non-null
    // discipline_type — the unique constraint is (jurisdiction, bar_number,
    // order_date, discipline_type) with NULLS DISTINCT, so dateless rows
    // would silently accumulate dups on re-run.
    const disciplineRows = records
      .filter((r) => r.order_date)
      .map((r) => [
        JURISDICTION,
        r.bar_number,
        r.full_name,
        r.order_date,
        r.order_date, // DRB conflates order/effective dates into one column
        r.discipline_type,
        r.discipline_raw,
        // Keep the raw case label (e.g., "PRESENTMENT (19-219)") as a
        // human-readable summary; downstream consumers can render this.
        [r.case_type, r.docket_number ? `(${r.docket_number})` : null]
          .filter(Boolean)
          .join(' ') || null,
        r.order_url,
        r.source_url,
      ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_nj',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, source_url, NOW()
      FROM _stg_attorneys_nj
      ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET
        full_name      = EXCLUDED.full_name,
        first_name     = COALESCE(EXCLUDED.first_name, public.attorneys.first_name),
        last_name      = COALESCE(EXCLUDED.last_name, public.attorneys.last_name),
        admission_date = COALESCE(EXCLUDED.admission_date, public.attorneys.admission_date),
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
      FROM _stg_discipline_nj s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_nj, public._stg_discipline_nj`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[njbar] start — apply=${OPTS.apply} letters=${OPTS.letters.join(',')}`,
  );

  const records = await scrape();

  console.error(`[njbar] collected ${records.length} decision rows`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.order_date || '?'}) — ${r.case_type || '?'}/${r.docket_number || '?'}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[njbar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[njbar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[njbar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
