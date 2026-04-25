// csv-bulk-checked: none-exists — TBJ digital magazine has no bulk CSV; per-issue scrape via Playwright (lsc-pagepro JS-rendered viewer)
// Template: scripts/ingest/scrape-txbar-discipline.mjs (existing 2014-2017 PDF loader — reused regex + load path + staging schema)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// Expert: alex-hormozi (Attorney-Vetting $47 SKU TX 2018-2026 gap closure)
//
// Texas Bar disciplinary actions scraper — 2018-04 onwards via Texas Bar Journal
// digital archive on lsc-pagepro.mydigitalpublication.com.
//
// Source (confirmed 2026-04-24 via Playwright probe):
//   Issue list: https://lsc-pagepro.mydigitalpublication.com/publication/?m=21412&l=1&p=58&view=issuelistBrowser&ver=html5
//   Per-issue contents: /publication/?i=<issueId>&view=contentsBrowser
//   Per-article: /article/Disciplinary+Actions/<articleId>/<issueId>/article.html
//   The viewer is JS-rendered — direct fetch returns HTTP 202 with empty body.
//   Playwright headless captures the .article-content container (~18-20K chars per issue).
//
// Format observed (matches existing 2014-2017 BAR_RE pattern):
//   "On <Month> <day>, <year>, NAME [#<bar>], of <city>, was <discipline>."
//   Sections: BODA / DISBARMENT / RESIGNATION / SUSPENSION / REPRIMAND. The existing
//   regex captures the standard "On date, name [#bar], of city, was discipline" entries.
//   BODA section uses a different prose shape ("of <city>, attorney <name> [#bar], <age>") and
//   yields fewer captures — acceptable trade-off given DISBARMENT/SUSPENSION/REPRIMAND
//   carry the bulk of the disciplinary signal.
//
// Usage:
//   node scripts/ingest/scrape-txbar-2018plus.mjs                    # dry-run, all issues 2018-04+
//   node scripts/ingest/scrape-txbar-2018plus.mjs --apply
//   node scripts/ingest/scrape-txbar-2018plus.mjs --start-year 2018 --end-year 2018 --apply
//   node scripts/ingest/scrape-txbar-2018plus.mjs --issue-id 850944 --apply   # single issue
//   node scripts/ingest/scrape-txbar-2018plus.mjs --headful                   # show browser
//
// Output: staging tables _stg_attorneys_tx2018, _stg_discipline_tx2018 (COPY FROM STDIN),
// merged into public.attorneys + public.attorney_discipline_events.
// ON CONFLICT idempotent against existing 2014-2017 rows.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// ── Config ──────────────────────────────────────────────────────────────────

const ARCHIVE_URL =
  'https://lsc-pagepro.mydigitalpublication.com/publication/?m=21412&l=1&p=58&view=issuelistBrowser&ver=html5';
const CONTENTS_URL = (issueId) =>
  `https://lsc-pagepro.mydigitalpublication.com/publication/?i=${issueId}&view=contentsBrowser`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'TX';

const DISCIPLINE_PATTERNS = [
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+in\s+lieu/i, 'resignation_with_charges'],
  [/\baccepted.*resignation/i, 'resignation_with_charges'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobated/i, 'probation'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\breprimand/i, 'public_reprimand'],
];

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
    startYear: 2018,
    endYear: 2026,
    issueId: null,
    headful: false,
    limit: Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--headful') out.headful = true;
    else if (a === '--start-year') out.startYear = parseInt(args[++i], 10);
    else if (a === '--end-year') out.endYear = parseInt(args[++i], 10);
    else if (a === '--issue-id') out.issueId = String(args[++i]);
    else if (a === '--limit') {
      const n = parseInt(args[++i], 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--limit must be positive integer');
      out.limit = n;
    } else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 35).join('\n'));
      process.exit(0);
    }
  }
  return out;
}

const OPTS = parseArgs(process.argv);

function politeDelay() {
  const ms = 1000 + Math.floor(Math.random() * 1000);
  return sleep(ms);
}

// ── Parse helpers (verbatim from scrape-txbar-discipline.mjs) ───────────────

const BAR_RE = /\[#(\d{6,10})\]\s*,\s*(?:\d+,\s*)?of\s+([^,]+?)\s*,\s+([^.]+?)\./g;
const ON_DATE_RE = /On\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/g;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_NUM = Object.fromEntries(MONTHS.map((m, i) => [m.toLowerCase(), String(i + 1).padStart(2, '0')]));

function extractNameBefore(window) {
  const tokens = window.trim().split(/\s+/);
  const name = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    // Allow ALL-CAPS tokens too (2025+ format)
    if (
      /^[A-Z][A-Za-z.'\-]*\.?$/.test(tok) ||
      /^[A-Z]\.$/.test(tok) ||
      /^(II|III|IV|JR\.?|SR\.?|Jr\.?|Sr\.?)$/.test(tok) ||
      /^[A-Z][A-Z.'\-]+$/.test(tok)
    ) {
      name.unshift(tok);
      if (name.length >= 6) break;
    } else if (name.length >= 2) {
      break;
    } else {
      continue;
    }
  }
  const fullName = name.join(' ').replace(/,+$/, '').trim();
  if (fullName.length < 4 || fullName.length > 80) return null;
  if (!/\S\s+\S/.test(fullName)) return null;
  return fullName;
}

function extractEntries(fullText, sourceUrl) {
  const t = fullText
    .replace(/-\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');

  const dateAnchors = [];
  for (const m of t.matchAll(ON_DATE_RE)) {
    const mm = MONTH_NUM[m[1].toLowerCase()];
    if (!mm) continue;
    dateAnchors.push({
      pos: m.index,
      iso: `${m[3]}-${mm}-${String(parseInt(m[2], 10)).padStart(2, '0')}`,
    });
  }
  function nearestDateBefore(pos) {
    let best = null;
    for (const a of dateAnchors) {
      if (a.pos > pos) break;
      if (pos - a.pos <= 400) best = a.iso;
      else if (!best && pos - a.pos <= 800) best = a.iso;
    }
    return best;
  }

  const records = [];
  const seen = new Set();
  for (const m of t.matchAll(BAR_RE)) {
    const [, bar, cityRaw, discRaw] = m;
    const key = `${bar}|${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const nameWindow = t.slice(Math.max(0, m.index - 80), m.index);
    const fullName = extractNameBefore(nameWindow);
    if (!fullName) continue;

    const orderDate = nearestDateBefore(m.index);
    if (!orderDate) continue;

    const city = cityRaw.replace(/\s+/g, ' ').trim();
    if (!city || city.length > 80) continue;

    const { type, raw } = normalizeDiscipline(discRaw);
    if (type === 'unknown') continue;

    records.push({
      bar_number: bar,
      full_name: fullName,
      city,
      effective_date: orderDate,
      order_date: orderDate,
      discipline_type: type,
      discipline_raw: raw,
      violation_summary: discRaw.slice(0, 2000),
      order_url: null,
      source_url: sourceUrl,
    });
  }
  return records;
}

// ── Discover issues ─────────────────────────────────────────────────────────

async function discoverIssues(page) {
  console.error(`[archive] GET ${ARCHIVE_URL}`);
  const r = await page.goto(ARCHIVE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  if (!r || !r.ok()) {
    // lsc-pagepro frequently returns 202 — accept anyway
    console.error(`[archive] status=${r?.status()} (continuing — 202 is normal)`);
  }
  await page.waitForTimeout(2500);

  const issues = await page.$$eval('a[href]', (els) =>
    els
      .map((e) => {
        const href = e.getAttribute('href') || '';
        const text = (e.textContent || '').replace(/\s+/g, ' ').trim();
        const m = href.match(/^\/publication\/\?i=(\d+)$/);
        if (!m) return null;
        const lm = text.match(/^([A-Za-z]+(?:\/[A-Za-z]+)?)\s+(\d{4})$/);
        if (!lm) return null;
        return { issueId: m[1], monthLabel: lm[1], year: parseInt(lm[2], 10) };
      })
      .filter(Boolean),
  );

  // De-dupe by issueId (anchor pairs may exist)
  const byId = new Map();
  for (const i of issues) if (!byId.has(i.issueId)) byId.set(i.issueId, i);
  return [...byId.values()];
}

async function findDisciplinaryArticleUrl(page, issueId) {
  const url = CONTENTS_URL(issueId);
  console.error(`[contents] GET ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const articleHref = await page.$$eval('a[href]', (els) => {
    for (const e of els) {
      const href = e.getAttribute('href') || '';
      if (/\/article\/[Dd]isciplinary[+%20\s]?[Aa]ctions\//i.test(href) && /\d+\/\d+\/article\.html/.test(href)) {
        return href;
      }
    }
    return null;
  });
  if (!articleHref) return null;
  return new URL(articleHref, 'https://lsc-pagepro.mydigitalpublication.com').toString();
}

async function fetchArticleText(page, articleUrl) {
  console.error(`[article] GET ${articleUrl}`);
  await page.goto(articleUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  const text = await page.evaluate(() => {
    const sel = ['.article-content', 'article', '#article-content', 'main'];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.length > 500) return el.innerText;
    }
    return document.body.innerText || '';
  });
  return text;
}

// ── Scrape ──────────────────────────────────────────────────────────────────

async function scrape() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !OPTS.headful });
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();

  let issues;
  if (OPTS.issueId) {
    issues = [{ issueId: OPTS.issueId, monthLabel: 'unknown', year: 0 }];
  } else {
    issues = await discoverIssues(page);
    issues = issues.filter((i) => i.year >= OPTS.startYear && i.year <= OPTS.endYear);
    // Skip pre-Apr 2018 if user is starting at 2018 — keep all by default though
    console.error(`[archive] discovered ${issues.length} issues in ${OPTS.startYear}..${OPTS.endYear}`);
  }

  const allRecords = [];
  let issueCount = 0;
  for (const iss of issues) {
    if (allRecords.length >= OPTS.limit) break;
    issueCount++;
    console.error(`[issue ${issueCount}/${issues.length}] ${iss.monthLabel} ${iss.year} (id=${iss.issueId})`);

    let articleUrl = null;
    try {
      articleUrl = await findDisciplinaryArticleUrl(page, iss.issueId);
    } catch (err) {
      console.error(`[contents] error: ${err.message}`);
    }
    if (!articleUrl) {
      console.error(`[contents] no Disciplinary Actions article in issue ${iss.issueId}`);
      await politeDelay();
      continue;
    }
    await politeDelay();

    let text;
    try {
      text = await fetchArticleText(page, articleUrl);
    } catch (err) {
      console.error(`[article] error: ${err.message}`);
      await politeDelay();
      continue;
    }
    if (!text || text.length < 500) {
      console.error(`[article] empty/too-short text len=${text?.length ?? 0}`);
      await politeDelay();
      continue;
    }

    const records = extractEntries(text, articleUrl);
    console.error(`  → ${records.length} entries (text ${text.length} chars)`);
    allRecords.push(...records);

    await politeDelay();
  }

  await browser.close();
  return allRecords;
}

// ── Load (mirror of scrape-txbar-discipline.mjs with _stg_*_tx2018 tables) ──

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_tx2018`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_tx2018`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_tx2018 (
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
      CREATE UNLOGGED TABLE public._stg_discipline_tx2018 (
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
        const parts = r.full_name.split(/\s+/);
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
          city: r.city,
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
      '_stg_attorneys_tx2018',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    const disciplineRows = records.map((r) => [
      JURISDICTION, r.bar_number, r.full_name, r.order_date, r.effective_date,
      r.discipline_type, r.discipline_raw, r.violation_summary, r.order_url, r.source_url,
    ]);

    await bulkCopyRows(
      client,
      '_stg_discipline_tx2018',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      disciplineRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_tx2018
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
      FROM _stg_discipline_tx2018 s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_tx2018, public._stg_discipline_tx2018`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[txbar-2018] start — apply=${OPTS.apply} years=${OPTS.startYear}..${OPTS.endYear} issueId=${OPTS.issueId ?? 'all'}`);

  const records = await scrape();

  console.error(`[txbar-2018] collected ${records.length} discipline rows`);
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [#${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[txbar-2018] dry-run — pass --apply to write to DB`);
    return;
  }
  if (records.length === 0) {
    console.error(`[txbar-2018] no records — nothing to load`);
    return;
  }
  await load(records);
  console.error(`[txbar-2018] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
