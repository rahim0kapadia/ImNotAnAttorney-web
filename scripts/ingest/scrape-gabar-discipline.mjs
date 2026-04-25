// Template: scripts/ingest/scrape-pabar-discipline.mjs (PA JSON API win)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// csv-bulk-checked: none-exists — GA Bar publishes no discipline bulk CSV
//
// State Bar of Georgia — disciplinary actions scraper.
//
// Source (probed 2026-04-24):
//   Live listing:  https://www.gabar.org/public/recent-attorney-discipline
//                  (rolling 6-month window; ~20 entries at any time)
//   Legacy live:   https://www.gabar.org/forthepublic/recent-discipline.cfm
//                  (same shape, redirects to current URL)
//   Order PDFs:    /docs/default-source/disciplinaries/<name>_<TYPE>.pdf  (current)
//                  /forthepublic/upload/<name>_<TYPE>.pdf                (pre-2024)
//                  /publicdiscipline/pdf/<name>_<TYPE>.pdf               (pre-2020)
//
// GA Bar publishes no JSON API and no bulk CSV. The discipline-summaries
// member-directory route requires JS interaction and is 1:1 lookup only.
// To extend the rolling 6-month window into a multi-year corpus we walk
// the Wayback Machine snapshots of the same listing URL and union the
// entries. Each entry's UNIQUE constraint
// (jurisdiction, bar_number, order_date, discipline_type) collapses
// duplicates that appear in multiple snapshots into one row.
//
// Deviation from parent prompt: the listing does NOT publish bar
// numbers (only name + address + admission year). We use a deterministic
// synthetic bar_number `ga-name-<md5(normalizedName)[:12]>` matching the
// existing FL precedent (scrape-flbar-discipline.mjs) on master. Spot-
// check 3 attorneys in gabar.org member directory after load to confirm
// real-shape coverage. See docs/plans/2026-04-24-ga-bar-discipline-scraper.md
// for the full rationale.
//
// Usage:
//   node scripts/ingest/scrape-gabar-discipline.mjs                       # dry-run, live + Wayback
//   node scripts/ingest/scrape-gabar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-gabar-discipline.mjs --no-wayback          # live page only
//   node scripts/ingest/scrape-gabar-discipline.mjs --max-snapshots 30    # cap Wayback walk
//   node scripts/ingest/scrape-gabar-discipline.mjs --from 20180101       # earliest Wayback ts
//
// Output: staging tables _stg_attorneys_ga + _stg_discipline_ga populated
// via bulkCopyRows, merged into public.attorneys + attorney_discipline_events.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const LIVE_URL = 'https://www.gabar.org/public/recent-attorney-discipline';

// Two URL forms have stable archives. Querying both prefixes maximizes
// historical coverage (the path changed in 2024-09).
const WAYBACK_TARGET_URLS = [
  'gabar.org/public/recent-attorney-discipline',
  'gabar.org/forthepublic/recent-discipline.cfm',
];

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'GA';

// Filename suffix → normalized discipline_type. GA Bar embeds the action
// in the order PDF filename (e.g. `Fry_D.pdf` = disbarment).
//
// Verified against 2026-04-24 sample of 90 archived PDFs:
//   D  = disbarment           IS  = interim suspension
//   S  = suspension           ISL = interim suspension lift (reinstatement after IS)
//   PR = public reprimand     R   = reinstatement
//   VS = voluntary surrender  RG  = received-grievance / unknown
//   RB = review board         RBR = review board ruling
//   RPR = review of public reprimand
const SUFFIX_TO_TYPE = {
  D: 'disbarment',
  VS: 'resignation_with_charges',          // voluntary surrender of license
  IS: 'interim_suspension',
  ISL: 'reinstatement',
  S: 'suspension',
  PR: 'public_reprimand',
  RPR: 'public_reprimand',
  R: 'reinstatement',
  RG: 'unknown',
  RB: 'unknown',
  RBR: 'unknown',
};

// Free-text label → normalized discipline_type. Used when a row has no
// PDF link. Order matters — disbarment before suspension.
const TEXT_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bvoluntary\s+surrender/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\breinstat/i, 'reinstatement'],
  [/\bsuspen/i, 'suspension'],
  [/\bpublic\s+repri/i, 'public_reprimand'],
  [/\bpublic\s+repro/i, 'public_reprimand'],
  [/\breprimand/i, 'public_reprimand'],
  [/\bprobation/i, 'probation'],
];

function normalizeDisciplineFromHref(href) {
  if (!href) return null;
  // Strip Wayback prefix if present, then take the basename.
  // Also strip any `?sfvrsn=...` querystring (live page) and any
  // trailing `-N` revision suffix (e.g. `kinley_is-2.pdf`).
  const cleaned = href.replace(/^\/web\/\d+\//, '').split('?')[0];
  const m = cleaned.match(/_([A-Za-z]{1,4})(?:-\d+)?\.pdf$/i);
  if (!m) return null;
  const sfx = m[1].toUpperCase();
  return SUFFIX_TO_TYPE[sfx] || null;
}

function normalizeDisciplineFromText(text) {
  if (!text) return null;
  for (const [re, type] of TEXT_PATTERNS) {
    if (re.test(text)) return type;
  }
  return null;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    noWayback: false,
    maxSnapshots: 200,
    from: '20120101',
    to: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--no-wayback') out.noWayback = true;
    else if (a === '--max-snapshots') out.maxSnapshots = parseInt(args[++i], 10);
    else if (a === '--from') out.from = args[++i];
    else if (a === '--to') out.to = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 40).join('\n'));
      process.exit(0);
    }
  }
  if (!/^\d{8}$/.test(out.from)) {
    throw new Error(`--from must be YYYYMMDD, got: ${out.from}`);
  }
  if (out.to && !/^\d{8}$/.test(out.to)) {
    throw new Error(`--to must be YYYYMMDD, got: ${out.to}`);
  }
  if (!Number.isFinite(out.maxSnapshots) || out.maxSnapshots <= 0) {
    throw new Error(`--max-snapshots must be a positive integer`);
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay(minMs = 1000, maxMs = 2000) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return sleep(ms);
}

async function fetchText(url, { acceptJson = false } = {}) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': acceptJson ? 'application/json' : 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${url}`);
  }
  return resp.text();
}

// ── HTML parser ─────────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsDate(s) {
  if (!s) return null;
  // Accepts M/D/YYYY, MM/DD/YYYY, or M/D/YY (2-digit). Two-digit years
  // resolve to 2000-2099 (no GA Bar discipline page predates 2000 in
  // any archived form we use).
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let yyyy = parseInt(m[3], 10);
  if (yyyy < 100) yyyy = 2000 + yyyy;
  const mm = String(parseInt(m[1], 10)).padStart(2, '0');
  const dd = String(parseInt(m[2], 10)).padStart(2, '0');
  if (yyyy < 1980 || yyyy > 2100) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// Resolve a PDF href to a stable absolute URL.
//
// Live snapshot hrefs look like `/docs/default-source/disciplinaries/...`.
// Wayback snapshot hrefs look like `/web/<ts>/https://www.gabar.org/...`.
// We always preserve the Wayback wrapper when present (it is the
// archive-stable URL), and absolutize the gabar.org-only hrefs against
// the live host.
function absolutizeHref(href, sourceUrl) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/web/')) {
    // Wayback in-page link — prefix archive host.
    return `https://web.archive.org${href}`;
  }
  if (href.startsWith('/')) {
    // Site-relative — absolutize against live gabar.org.
    return `https://www.gabar.org${href}`;
  }
  try {
    return new URL(href, sourceUrl).toString();
  } catch {
    return null;
  }
}

function splitFullName(full) {
  const clean = full.replace(/\s+/g, ' ').trim().replace(/,$/, '');
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return { first: null, last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function makeBarNumber(fullName) {
  const norm = fullName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return 'ga-name-' + crypto.createHash('md5').update(norm).digest('hex').slice(0, 12);
}

// Parse one discipline `<p>` block. Returns null if shape doesn't match.
//
// Expected shape (live + 2018 snapshot both verified 2026-04-24):
//   <p>
//     <strong>Full Name</strong><br>
//     Address line 1<br>
//     City, GA ZIP<br>
//     Admitted to Bar YYYY<br>
//     <a href="...PDF...">Discipline Label</a><br>
//     M/D/YYYY
//   </p>
function parseDisciplineParagraph(paraHtml, sourceUrl, reason = { v: null }) {
  // Must start with bold name (snapshot-stable signal — boilerplate
  // disclaimers contain discipline keywords but no leading bold name).
  // 2024+ live page wraps name in `<strong>Name<br></strong>` so the
  // body can contain inner tags. Use [\s\S] not [^<] so `<br>` inside
  // is captured, then stripTags + nbsp-strip.
  const strongM = paraHtml.match(/<strong>([\s\S]*?)<\/strong>/i);
  if (!strongM) { reason.v = 'no-strong'; return null; }
  const fullName = stripTags(strongM[1])
    .replace(/ /g, ' ')
    .replace(/,+$/, '')
    .trim();
  if (!fullName || fullName.length < 4 || fullName.length > 120) { reason.v = 'short'; return null; }

  // Heuristic: name must be Title Case with at least 2 words.
  if (!/^[A-Z][A-Za-z.''-]*(?:\s+[A-Z][A-Za-z.''-]*)+/.test(fullName)) { reason.v = 'not-title-case'; return null; }

  // Blocklist common non-attorney bold text.
  if (/\b(supreme court|state bar|news release|disciplinary action|case no|click here|admitted to|recent attorney|member directory)\b/i.test(fullName)) {
    reason.v = 'blocklist';
    return null;
  }

  // PDF order link (preferred — encodes discipline type in suffix).
  // Use [\s\S]*? for label body because 2024+ live HTML wraps the link
  // text with `<br>` tags inside the anchor.
  let orderUrl = null;
  let typeFromHref = null;
  let labelText = null;
  const aMatches = [...paraHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const am of aMatches) {
    const href = am[1];
    // Allowlist of GA-Bar / GA-Supreme-Court PDF host paths. The 2025+
    // listings link out to gasupreme.us for new orders; pre-2024
    // listings used internal gabar.org paths. All four shapes are
    // valid sources.
    if (/\.pdf(\?|$)/i.test(href) && /(disciplinaries|forthepublic\/upload|publicdiscipline\/pdf|public\/pdf\/PublicDiscipline|gasupreme\.us\/wp-content\/uploads)/i.test(href)) {
      orderUrl = absolutizeHref(href, sourceUrl);
      typeFromHref = normalizeDisciplineFromHref(href);
      labelText = stripTags(am[2]).trim() || null;
      if (typeFromHref) break;
      // If suffix wasn't recognized (e.g. `kinley_is-2.pdf` with -2),
      // keep iterating in case another anchor has a clean suffix.
    }
  }

  const text = stripTags(paraHtml);
  const typeFromText = normalizeDisciplineFromText(labelText || text);

  const disciplineType = typeFromHref || typeFromText;
  if (!disciplineType || disciplineType === 'unknown') { reason.v = 'no-type'; return null; }

  // Date — last "M/D/YYYY" or "M/D/YY" in the paragraph. 2025+ snapshots
  // use 2-digit years (`07/22/25`); pre-2025 use 4-digit (`10/16/2017`).
  // parseUsDate handles both forms.
  const dateMatches = [...text.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g)];
  const orderDate = dateMatches.length ? parseUsDate(dateMatches[dateMatches.length - 1][1]) : null;
  if (!orderDate) { reason.v = 'no-date'; return null; }

  // Admission year (optional).
  const admM = text.match(/Admitted\s+to\s+(?:the\s+)?Bar\s+(\d{4})/i);
  const admissionDate = admM ? `${admM[1]}-01-01` : null;

  // City — look for "City, GA <ZIP>".
  let city = null;
  const cityM = text.match(/,\s*([A-Z][A-Za-z. ]{1,40}?),\s*GA\s+\d{5}/);
  if (cityM) city = cityM[1].trim();

  // Violation summary: trim down the paragraph text.
  const violationSummary = (labelText || text).slice(0, 500);

  const barNumber = makeBarNumber(fullName);
  const { first, last } = splitFullName(fullName);

  return {
    bar_number: barNumber,
    full_name: fullName,
    first_name: first,
    last_name: last,
    admission_date: admissionDate,
    city,
    discipline_type: disciplineType,
    discipline_raw: (labelText || disciplineType).slice(0, 500),
    violation_summary: violationSummary,
    order_url: orderUrl,
    order_date: orderDate,
    effective_date: orderDate,
    // Source URL points to the listing page (live or Wayback) the entry
    // came from. PDF orderUrl is captured separately and sometimes null
    // (very old entries dropped their PDFs). source_url is NEVER null.
    source_url: sourceUrl,
  };
}

function extractParagraphs(html) {
  // GA Bar's discipline page has used multiple block forms over the
  // years:
  //   - 2010-2024: <p><strong>Name</strong><br>...address...<br>
  //                <a href=PDF>Discipline</a><br>date</p>
  //   - 2024+    : `<div>...<div><strong>Name</strong></div>
  //                <div>address</div><div><a>Discipline</a></div>
  //                <div>date</div>...` (nested <div> with no <p>)
  //
  // To handle both, we split at every `<strong>` boundary and capture
  // the text BETWEEN consecutive `<strong>` tags. Each chunk owns one
  // attorney's full record. The starting `<strong>` itself is included
  // so the existing parseDisciplineParagraph()'s leading-bold check
  // still works.
  const blocks = [];
  const re = /<strong>[\s\S]*?<\/strong>/gi;
  const matches = [...html.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    blocks.push(html.slice(start, end));
  }
  return blocks;
}

function parsePage(html, sourceUrl) {
  const paras = extractParagraphs(html);
  const records = [];
  let rejectedNoStrong = 0, rejectedNotTitleCase = 0, rejectedShort = 0,
      rejectedNoType = 0, rejectedNoDate = 0;
  for (const p of paras) {
    const reason = { v: null };
    const rec = parseDisciplineParagraph(p, sourceUrl, reason);
    if (rec) records.push(rec);
    else {
      if (reason.v === 'no-strong') rejectedNoStrong++;
      else if (reason.v === 'not-title-case') rejectedNotTitleCase++;
      else if (reason.v === 'short') rejectedShort++;
      else if (reason.v === 'no-type') rejectedNoType++;
      else if (reason.v === 'no-date') rejectedNoDate++;
    }
  }
  if (process.env.GABAR_DEBUG === '1') {
    console.error(
      `[parse] ${sourceUrl}: blocks=${paras.length} kept=${records.length} ` +
      `rejected: noStrong=${rejectedNoStrong} notTC=${rejectedNotTitleCase} ` +
      `short=${rejectedShort} noType=${rejectedNoType} noDate=${rejectedNoDate}`,
    );
  }
  return records;
}

// ── Wayback CDX walker ──────────────────────────────────────────────────────

async function fetchCdx(targetUrl) {
  const params = new URLSearchParams({
    url: targetUrl,
    output: 'json',
    from: OPTS.from,
    to: OPTS.to || '20260424',
    'collapse': 'timestamp:8',
    filter: 'statuscode:200',
    limit: '500',
  });
  const url = `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
  console.error(`[cdx] GET ${url}`);
  const text = await fetchText(url, { acceptJson: true });
  if (!text.trim()) return [];
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length < 2) return [];
  // Skip header row.
  return rows.slice(1).map((r) => ({
    timestamp: r[1],
    original: r[2],
  }));
}

async function discoverWaybackSnapshots() {
  const all = [];
  const seen = new Set();
  for (const target of WAYBACK_TARGET_URLS) {
    let rows;
    try {
      rows = await fetchCdx(target);
    } catch (err) {
      console.error(`[cdx] ${target} — ${err.message}`);
      continue;
    }
    for (const r of rows) {
      const key = `${r.timestamp.slice(0, 6)}|${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({
        timestamp: r.timestamp,
        original: r.original,
        snapshotUrl: `https://web.archive.org/web/${r.timestamp}/${r.original}`,
      });
    }
    await politeDelay(500, 1500);
  }
  // Sort newest first so an early --max-snapshots cap still hits live-
  // adjacent rotation rather than stopping in 2012.
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return all;
}

async function scrapeWayback() {
  const snapshots = await discoverWaybackSnapshots();
  console.error(`[wayback] ${snapshots.length} candidate snapshots discovered (cap=${OPTS.maxSnapshots})`);

  const records = [];
  let processed = 0;
  for (const snap of snapshots) {
    if (processed >= OPTS.maxSnapshots) break;
    let html;
    try {
      html = await fetchText(snap.snapshotUrl);
    } catch (err) {
      console.error(`[wayback] ${snap.snapshotUrl} — ${err.message}`);
      processed++;
      await politeDelay();
      continue;
    }
    const recs = parsePage(html, snap.snapshotUrl);
    console.error(`[wayback] ${snap.timestamp} — ${recs.length} entries`);
    records.push(...recs);
    processed++;
    await politeDelay();
  }
  return records;
}

async function scrapeLive() {
  const html = await fetchText(LIVE_URL);
  const recs = parsePage(html, LIVE_URL);
  console.error(`[live] ${recs.length} entries`);
  return recs;
}

// ── DB load (mirrors PA / FL pattern) ───────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ga`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_ga`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_ga (
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
      CREATE UNLOGGED TABLE public._stg_discipline_ga (
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

    // De-dupe attorneys by bar_number — earliest admission_date wins,
    // any city we know about wins over null.
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
          admission_date: r.admission_date,
          current_status: null,
          city: r.city,
          source_url: r.source_url,
        });
      } else {
        if (!cur.admission_date && r.admission_date) cur.admission_date = r.admission_date;
        if (!cur.city && r.city) cur.city = r.city;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys_ga',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_ga',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_ga
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

    // NULLS DISTINCT default — rows without order_date would bypass
    // the unique constraint. Filter them out (parser guarantees
    // order_date but the DB-side filter is a safety belt).
    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline_ga s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_ga, public._stg_discipline_ga`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[gabar] start — apply=${OPTS.apply} noWayback=${OPTS.noWayback} maxSnapshots=${OPTS.maxSnapshots} from=${OPTS.from}`);

  const all = [];
  try {
    all.push(...await scrapeLive());
  } catch (err) {
    console.error(`[live] failed: ${err.message}`);
  }

  if (!OPTS.noWayback) {
    try {
      all.push(...await scrapeWayback());
    } catch (err) {
      console.error(`[wayback] failed: ${err.message}`);
    }
  }

  // In-memory dedup before staging so the staging COPY is leaner. The
  // DB-side ON CONFLICT is the authoritative dedup but trimming here
  // saves COPY bandwidth.
  const seen = new Set();
  const records = [];
  for (const r of all) {
    const k = `${r.bar_number}|${r.order_date}|${r.discipline_type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    records.push(r);
  }

  console.error(`[gabar] collected ${records.length} unique discipline rows from ${all.length} raw entries`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city || '?'}`,
    );
  }

  // Histogram for sanity-check.
  const hist = {};
  let withOrderUrl = 0;
  for (const r of records) {
    hist[r.discipline_type] = (hist[r.discipline_type] || 0) + 1;
    if (r.order_url) withOrderUrl++;
  }
  console.error(`[gabar] histogram:`, hist);
  console.error(`[gabar] order_url coverage: ${withOrderUrl}/${records.length}`);
  console.error(`[gabar] source_url coverage: ${records.length}/${records.length} (every record)`);

  if (!OPTS.apply) {
    console.error(`[gabar] dry-run — pass --apply to write to DB`);
    return;
  }

  if (records.length === 0) {
    console.error(`[gabar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[gabar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
