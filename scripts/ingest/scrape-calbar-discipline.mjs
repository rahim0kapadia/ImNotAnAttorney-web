// csv-bulk-checked: none-exists — CA State Bar publishes discipline only via HTML public-disclosure pages; no CSV, no API, confirmed 2026-04-22.
// Template: scripts/ingest-virginia-court-data.mjs (CLI pattern) + playwright module
// Expert: alex-hormozi (value equation — attorney-vetting $47 SKU)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)
//
// CA State Bar Recent Disciplinary Actions scraper.
//
// Source (confirmed 2026-04-22 via WebFetch):
//   https://www.calbar.ca.gov/public/concerns-about-attorney/recent-disciplinary-actions
//   The page is a single paginated listing (?page=0..N) — NOT monthly archives as
//   originally speculated. Each row exposes: attorney full name, bar number,
//   residence city/county, brief violation summary, effective date, discipline
//   type inferred from summary ("disbarred", "suspended", etc.). Order PDFs are
//   NOT linked on the list; the page directs users to State Bar Court case
//   search for the underlying order. order_url is therefore populated only when
//   the per-attorney profile page exposes a discipline history link.
//
// Polite scraping: 1-2s randomized delay between page hits. User-Agent
// identifies as INAA (noreply-legal@inaa.com — a contact address, no email
// sends from this script).
//
// Usage:
//   node scripts/ingest/scrape-calbar-discipline.mjs                       # dry-run, from 2020-01-01
//   node scripts/ingest/scrape-calbar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-calbar-discipline.mjs --start-date 2024-01-01 --limit 50
//   node scripts/ingest/scrape-calbar-discipline.mjs --headful             # show browser
//
// Output: staging tables _stg_attorneys, _stg_attorney_discipline populated via
// bulkCopyRows, then merged into public.attorneys + public.attorney_discipline_events.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── Config ──────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIST_URL =
  'https://www.calbar.ca.gov/public/concerns-about-attorney/recent-disciplinary-actions';
const PROFILE_URL = (bar) =>
  `https://apps.calbar.ca.gov/attorney/Licensee/Detail/${encodeURIComponent(bar)}`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'CA';

// Normalization: free-text summary → discipline_type enum.
// Order matters: disbarment checked before suspension so "disbarred after
// interim suspension" maps to disbarment.
const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/resign(ation)?\s+with\s+(charges|disciplinary)/i, 'resignation_with_charges'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+repro(val|of)/i, 'public_reproval'],
];

function normalizeDiscipline(text) {
  if (!text) return { type: 'unknown', raw: text ?? null };
  for (const [re, type] of DISCIPLINE_PATTERNS) {
    if (re.test(text)) return { type, raw: text };
  }
  return { type: 'unknown', raw: text };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    startDate: '2020-01-01',
    limit: Infinity,
    headful: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--headful') out.headful = true;
    else if (a === '--start-date') out.startDate = args[++i];
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 32).join('\n'));
      process.exit(0);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.startDate)) {
    throw new Error(`--start-date must be YYYY-MM-DD, got: ${out.startDate}`);
  }
  return out;
}

const __filename = fileURLToPath(import.meta.url);
const OPTS = parseArgs(process.argv);

// Randomized 1-2s polite delay.
function politeDelay() {
  const ms = 1000 + Math.floor(Math.random() * 1000);
  return sleep(ms);
}

function parseDateMaybe(text) {
  if (!text) return null;
  // Accept "April 10, 2026" / "Apr 10, 2026" / "2026-04-10".
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(text);
  if (!isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return null;
}

function splitName(full) {
  if (!full) return { first: null, last: null };
  const clean = full.replace(/\s+/g, ' ').trim();
  const parts = clean.split(' ');
  if (parts.length === 1) return { first: null, last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// ── Scrape ──────────────────────────────────────────────────────────────────

async function scrape() {
  // Playwright is only imported when we actually scrape — keeps dry-help fast,
  // and lets the migration file ship without requiring playwright installed.
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: !OPTS.headful });
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();

  const startCutoff = new Date(OPTS.startDate + 'T00:00:00Z');
  const records = [];
  let pageIdx = 0;
  let stop = false;

  while (!stop && records.length < OPTS.limit) {
    const url = `${LIST_URL}?page=${pageIdx}`;
    console.error(`[list] GET ${url}`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!resp || !resp.ok()) {
      console.error(`[list] page ${pageIdx} returned ${resp && resp.status()} — stopping`);
      break;
    }

    // Each discipline entry is contained in an article/list item — selector is
    // intentionally broad because CA Bar's Drupal markup has shifted in the
    // past. Adjust after first --headful diagnostic run if needed.
    const rows = await page.$$eval(
      'article, .views-row, li.discipline-item',
      (nodes) =>
        nodes.map((n) => {
          const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
          const link = n.querySelector('a[href*="/attorney/"], a[href*="Licensee/Detail"]');
          const href = link ? link.getAttribute('href') : null;
          const heading = n.querySelector('h2, h3, .views-field-title');
          return {
            text,
            profileHref: href,
            heading: heading ? heading.textContent.trim() : null,
          };
        }),
    );

    if (rows.length === 0) {
      console.error(`[list] page ${pageIdx} had 0 rows — end of pagination`);
      break;
    }

    for (const r of rows) {
      // Pattern: "Ronen Zargarof [#295853] of Beverly Hills, disbarred for ...
      // Effective Date: April 10, 2026. Los Angeles County"
      const barMatch = r.text.match(/\[#(\d{4,7})\]/);
      if (!barMatch) continue;
      const barNumber = barMatch[1];

      const nameMatch = r.text.match(/^([^[]+?)\s*\[#\d+\]/);
      const fullName = nameMatch ? nameMatch[1].trim() : (r.heading || '').trim();

      const cityMatch = r.text.match(/\]\s+of\s+([^,]+?),\s+(?:disbarred|suspended|placed|resigned|reproved|on interim|on probation)/i);
      const city = cityMatch ? cityMatch[1].trim() : null;

      const effDateMatch = r.text.match(/Effective Date:\s*([^.]+?\d{4})/i);
      const effectiveDate = effDateMatch ? parseDateMaybe(effDateMatch[1]) : null;

      // Summary starts after "]" and goes through the next period before
      // Effective Date or end of text.
      const afterBar = r.text.split(/\[#\d+\]\s*/)[1] || '';
      const summary = afterBar.split(/\s*Effective Date:/i)[0].trim();

      const { type, raw } = normalizeDiscipline(summary);

      records.push({
        bar_number: barNumber,
        full_name: fullName,
        city,
        effective_date: effectiveDate,
        order_date: effectiveDate, // CA list doesn't separate order vs effective; assume same, reconciled later
        discipline_type: type,
        discipline_raw: raw,
        violation_summary: summary,
        order_url: null,
        source_url: url,
        profile_href: r.profileHref,
      });

      if (effectiveDate) {
        const eff = new Date(effectiveDate + 'T00:00:00Z');
        if (eff < startCutoff) {
          stop = true; // list is ordered newest-first; once we cross cutoff, done
          break;
        }
      }
      if (records.length >= OPTS.limit) break;
    }

    pageIdx++;
    await politeDelay();
  }

  // Enrich with profile info (admission_date + current_status) — bounded to
  // unique bar numbers so we don't hammer the profile host.
  const uniqueBars = [...new Set(records.map((r) => r.bar_number))];
  const profileByBar = new Map();
  for (const bar of uniqueBars) {
    if (profileByBar.size >= OPTS.limit) break;
    const purl = PROFILE_URL(bar);
    console.error(`[profile] GET ${purl}`);
    try {
      const resp = await page.goto(purl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (resp && resp.ok()) {
        const data = await page.evaluate(() => {
          const txt = document.body.textContent || '';
          const admit = txt.match(/Admitted to the State Bar of California[^0-9A-Za-z]*([A-Z][a-z]+ \d{1,2}, \d{4})/);
          const status = txt.match(/License Status:?\s*([A-Za-z ]+?)(?:[\n\r]|$)/i);
          return {
            admissionText: admit ? admit[1] : null,
            statusText: status ? status[1].trim() : null,
          };
        });
        profileByBar.set(bar, {
          admission_date: parseDateMaybe(data.admissionText),
          current_status: data.statusText ? data.statusText.toLowerCase() : null,
          source_url: purl,
        });
      }
    } catch (err) {
      console.error(`[profile] ${bar} failed: ${err.message}`);
    }
    await politeDelay();
  }

  await browser.close();

  return { records, profileByBar };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load({ records, profileByBar }) {
  const { client, cleanup } = await createBulkClient();
  try {
    // Staging: UNLOGGED (not TEMP ON COMMIT DROP — that drops between autocommit statements).
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys (
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
      CREATE UNLOGGED TABLE public._stg_discipline (
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

    // De-dupe attorneys by bar_number before COPY (the list has one row per
    // discipline action, so the same attorney can recur).
    const byBar = new Map();
    for (const r of records) {
      if (!byBar.has(r.bar_number)) {
        const { first, last } = splitName(r.full_name);
        const prof = profileByBar.get(r.bar_number) || {};
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: prof.admission_date || null,
          current_status: prof.current_status || null,
          city: r.city,
          source_url: prof.source_url || r.source_url,
        });
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_attorneys',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    // UPSERT attorneys (update last_seen_at + fill-in-blanks for optional cols).
    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys
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

    // INSERT discipline events joined to attorneys for attorney_id FK.
    const insertEvents = await client.query(`
      INSERT INTO public.attorney_discipline_events
        (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date,
         discipline_type, discipline_raw, violation_summary, order_url, source_url)
      SELECT a.id, s.jurisdiction, s.bar_number, s.full_name, s.order_date, s.effective_date,
             s.discipline_type, s.discipline_raw, s.violation_summary, s.order_url, s.source_url
      FROM _stg_discipline s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    // Cleanup staging.
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys, public._stg_discipline`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[calbar] start — apply=${OPTS.apply} startDate=${OPTS.startDate} limit=${OPTS.limit} headful=${OPTS.headful}`,
  );

  const { records, profileByBar } = await scrape();

  console.error(`[calbar] collected ${records.length} discipline rows across ${profileByBar.size} attorneys`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.effective_date || '?'}) — ${r.city || '?'}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[calbar] dry-run — pass --apply to write to DB`);
    return;
  }

  await load({ records, profileByBar });
  console.error(`[calbar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
