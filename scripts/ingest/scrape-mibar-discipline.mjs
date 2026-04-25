// csv-bulk-checked: none-exists — Michigan ADB publishes no discipline bulk CSV; only RSS (recent ~100/feed) + per-item HTML pages on Lexum's norma platform.
// Template: scripts/ingest/scrape-pabar-discipline.mjs (PA JSON API win — same staging + bulkCopyRows pattern)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows — per-row INSERT banned)
//
// Michigan Attorney Discipline Board scraper.
//
// Source (probed 2026-04-24):
//   Public site:    https://www.adbmich.org/         (CMS shell, JS-rendered)
//   Records DB:     https://records.adbmich.org/     (redirects to norma.lexum.com)
//   RSS feeds:
//     Notices:      https://norma.lexum.com/adbmich/no/en/rss.do  (~100 items)
//     Op/Orders:    https://norma.lexum.com/adbmich/op/en/rss.do  (~100 items)
//   Item iframe:    https://norma.lexum.com/adbmich/{no|op}/en/item/<id>/index.do?iframe=true
//
// Strategy:
//   The RSS feeds are limited to ~100 items each (recent rolling window). To
//   reach the ≥300-event target across a multi-year window, we walk item IDs
//   sequentially from --max-id down to --min-id. Item IDs are shared across
//   the no/ and op/ collections — each ID lives in exactly one collection.
//   We try /no/ first; on 404 fall back to /op/. Records found in either
//   collection produce one event row each.
//
//   The per-item iframe page contains a server-rendered metadata table:
//     Collection, Issued Date, Pnumber, Case number, Document Type, County,
//     Title, Effective Date, City, State.
//   The "Title" cell is the disposition (e.g. "Notice of Reprimand (By
//   Consent)", "Order of Suspension", "Notice of Automatic Interim
//   Suspension") — that's our discipline_type signal.
//
// Hard constraints (parent prompt):
//   - 100% source_url coverage (the iframe item URL).
//   - Real Michigan P-number (digits only in DB, prefixed "P" → P-number stored
//     as "P<digits>" so it matches the P\d{4,6} regex check).
//   - bulkCopyRows only; per-row INSERT banned (cl-bulk-data-defensive #18).
//   - Session settings: statement_timeout='30min', idle_in_transaction_session_timeout='5min',
//     tcp_keepalives. Port 5432. (createBulkClient handles this.)
//   - Polite: 1-2 s/req randomized; INAA UA.
//
// Usage:
//   node scripts/ingest/scrape-mibar-discipline.mjs                       # dry-run, walk 1..7541
//   node scripts/ingest/scrape-mibar-discipline.mjs --apply               # write to DB
//   node scripts/ingest/scrape-mibar-discipline.mjs --max-id 7541 --min-id 6500 --apply
//   node scripts/ingest/scrape-mibar-discipline.mjs --max-id 7541 --max-misses 50  # smoke
//
// Output: staging tables _stg_attorneys_mi + _stg_discipline_mi populated via
// bulkCopyRows, merged into public.attorneys + public.attorney_discipline_events.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

// ── Env loader (line-by-line, indexOf — no regex on file contents) ─────────
// Mirrors seed-statutes-fl.mjs and the post-SEC-W1 single-source convention:
// only the web repo's .env.local. Skips comments + blank lines, strips
// balanced surrounding quotes, validates key shape.
const _ENV_PATHS = [
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
  // worktree-local symlink fallback (kept second so primary path wins)
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
    break; // first existing path wins
  } catch {
    // ignore — env may simply be missing in detached test contexts
  }
}

// ── Config ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

const HOST = 'https://norma.lexum.com';
const COLLECTIONS = ['no', 'op']; // Notices first, then Orders/Opinions
const ITEM_URL = (col, id) => `${HOST}/adbmich/${col}/en/item/${id}/index.do?iframe=true`;
const ITEM_PUBLIC_URL = (col, id) => `${HOST}/adbmich/${col}/en/item/${id}/index.do`;
const RSS_URL = (col) => `${HOST}/adbmich/${col}/en/rss.do`;

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

const JURISDICTION = 'MI';

// Discipline type detection — order matters (disbarment before suspension;
// "interim" / "automatic" / "temporary" before plain "suspension"; reciprocal
// disbarment-then-suspension still classifies as disbarment).
const DISCIPLINE_PATTERNS = [
  [/\brevocation\s+of\s+(license|admission)/i, 'disbarment'],
  [/\bdisbar/i, 'disbarment'],
  [/\bresign(ation|ed)?\s+(with\s+(charges|disciplinary)|in\s+lieu)/i, 'resignation_with_charges'],
  [/\bautomatic\s+interim\s+suspen/i, 'interim_suspension'],
  [/\bautomatic\s+suspen/i, 'interim_suspension'],
  [/\binterim\s+suspen/i, 'interim_suspension'],
  [/\btemporary\s+suspen/i, 'interim_suspension'],
  [/\bemergency\s+suspen/i, 'interim_suspension'],
  [/\bsuspen/i, 'suspension'],
  [/\bprobation/i, 'probation'],
  [/\bpublic\s+repri(mand|of)/i, 'public_reprimand'],
  [/\b(notice\s+of\s+)?reprimand/i, 'public_reprimand'],
  [/\bpublic\s+censure/i, 'public_reprimand'],
  [/\badmonish/i, 'admonishment'],
  [/\breinstate/i, 'reinstatement'],
  [/\bdisability\s+inactive|transfer(red)?\s+to\s+inactive/i, 'disability_inactive'],
  [/\bdisabled?\b/i, 'disability_inactive'],
];

function normalizeDiscipline(titleField, documentType) {
  const blob = `${titleField || ''} ${documentType || ''}`.trim();
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
    minId: 1,
    maxId: 7541, // highest seen in RSS as of 2026-04-24; --max-id auto-bumps from RSS if --auto-max
    autoMax: true, // bump maxId from RSS feeds before walking
    maxMisses: 80, // give up after this many consecutive 404s (a margin around historical ID gaps)
    delayMin: 1000,
    delayMax: 2000,
    onlyRss: false, // smoke: skip sequential walk, RSS only
    skipRss: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--min-id') out.minId = parseInt(args[++i], 10);
    else if (a === '--max-id') { out.maxId = parseInt(args[++i], 10); out.autoMax = false; }
    else if (a === '--max-misses') out.maxMisses = parseInt(args[++i], 10);
    else if (a === '--delay-min') out.delayMin = parseInt(args[++i], 10);
    else if (a === '--delay-max') out.delayMax = parseInt(args[++i], 10);
    else if (a === '--only-rss') out.onlyRss = true;
    else if (a === '--skip-rss') out.skipRss = true;
    else if (a === '--no-auto-max') out.autoMax = false;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 50).join('\n'));
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!Number.isFinite(out.minId) || out.minId < 1) {
    throw new Error('--min-id must be >= 1');
  }
  if (!Number.isFinite(out.maxId) || out.maxId < out.minId) {
    throw new Error('--max-id must be >= --min-id');
  }
  return out;
}

const OPTS = parseArgs(process.argv);

// ── HTTP ────────────────────────────────────────────────────────────────────

function politeDelay() {
  const range = Math.max(1, OPTS.delayMax - OPTS.delayMin);
  const ms = OPTS.delayMin + Math.floor(Math.random() * range);
  return sleep(ms);
}

// Lexum's edge returns 403 on bursts (observed 2026-04-24: ~100 requests in
// 60s triggered IP-block). Retry on 403 with exponential backoff (60s, 120s,
// 240s). 404 = real "not in this collection" → no retry. 5xx → one short
// retry then bubble.
async function httpGet(url, attempt = 0) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.adbmich.org/',
      },
    });
  } catch (err) {
    if (attempt >= 2) throw err;
    console.error(`[net] ${url}: ${err.message} — retrying in 5s`);
    await sleep(5000);
    return httpGet(url, attempt + 1);
  }
  if (resp.status === 403 && attempt < 3) {
    const wait = 60_000 * Math.pow(2, attempt);
    console.error(`[net] 403 on ${url} — backing off ${wait / 1000}s (attempt ${attempt + 1}/3)`);
    await sleep(wait);
    return httpGet(url, attempt + 1);
  }
  if (resp.status >= 500 && attempt < 1) {
    console.error(`[net] ${resp.status} on ${url} — short retry in 10s`);
    await sleep(10_000);
    return httpGet(url, attempt + 1);
  }
  return { status: resp.status, ok: resp.ok, text: resp.ok ? await resp.text() : null };
}

// ── Parse helpers ───────────────────────────────────────────────────────────

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(s) {
  if (!s) return s;
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function splitName(full) {
  if (!full) return { first: null, last: null, full };
  // Michigan ADB uses "Last, First M. [Suffix]" — sometimes "Last, Jr., First M."
  const ix = full.indexOf(',');
  if (ix < 0) {
    const parts = full.replace(/\s+/g, ' ').trim().split(' ');
    if (parts.length === 1) return { first: null, last: parts[0], full };
    return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1], full };
  }
  const last = full.slice(0, ix).trim();
  const rest = full.slice(ix + 1).trim();
  // If rest contains another comma like "Jr., Luther W." treat token before
  // the second comma as suffix; combine into last.
  const ix2 = rest.indexOf(',');
  if (ix2 >= 0 && /\b(jr|sr|ii|iii|iv|v)\b\.?/i.test(rest.slice(0, ix2))) {
    const suffix = rest.slice(0, ix2).trim();
    const first = rest.slice(ix2 + 1).trim() || null;
    return { first, last: `${last}, ${suffix}`, full };
  }
  return { first: rest || null, last, full };
}

function parseMdy(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// Pull a metadata-table cell value by label. Robust to whitespace and to the
// site's stray-newline indentation. The <td class="metadata"> cell may be
// followed directly by another <tr> (no closing </td>), so we accept either
// </td> OR a <tr/<td start as terminator.
//   <td class="label">Pnumber</td>
//   <td class="metadata">
//                                49768
//                    </tr>
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractMetaCell(html, label) {
  const pattern =
    '<td[^>]*class="label"[^>]*>\\s*' +
    escapeRegex(label) +
    '\\s*</td>\\s*<td[^>]*class="metadata"[^>]*>([\\s\\S]*?)(?:</td>|<\\s*/?\\s*tr\\b|<td\\b)';
  const re = new RegExp(pattern, 'i');
  const m = html.match(re);
  if (!m) return null;
  const v = stripTags(m[1]);
  return v || null;
}

// Pull <h3 class="title">…</h3>
function extractH3Title(html) {
  const m = html.match(/<h3[^>]*class="title"[^>]*>([\s\S]*?)<\/h3>/i);
  return m ? stripTags(m[1]) : null;
}

// Parse one item iframe HTML into a record. Returns null on missing required
// fields (P-number or order date or attorney name).
function parseItem(html, collection, id) {
  const fullName = extractH3Title(html);
  const pnumberRaw = extractMetaCell(html, 'Pnumber');
  const issuedDate = extractMetaCell(html, 'Issued Date');
  const effectiveDate = extractMetaCell(html, 'Effective Date');
  const docType = extractMetaCell(html, 'Document Type');
  const titleField = extractMetaCell(html, 'Title');
  const county = extractMetaCell(html, 'County');
  const city = extractMetaCell(html, 'City');
  const caseNumber = extractMetaCell(html, 'Case number') || extractMetaCell(html, 'Case Number');

  if (!fullName || !pnumberRaw) return null;
  const pnumDigits = (pnumberRaw.match(/\d{4,6}/) || [])[0];
  if (!pnumDigits) return null;

  const orderDate = parseMdy(issuedDate);
  const effDate = parseMdy(effectiveDate) || orderDate;
  if (!orderDate) return null;

  const { type, raw } = normalizeDiscipline(titleField, docType);

  return {
    bar_number: `P${pnumDigits}`,
    full_name: fullName,
    order_date: orderDate,
    effective_date: effDate,
    discipline_type: type,
    discipline_raw: raw,
    title_field: titleField,
    document_type: docType,
    case_number: caseNumber,
    county: county || null,
    city: city || null,
    source_url: ITEM_PUBLIC_URL(collection, id),
    api_url: ITEM_URL(collection, id),
    collection,
  };
}

// Parse RSS feed into {id, link} pairs (used to discover the latest live ID).
function parseRssLinkIds(xml) {
  const out = [];
  if (!xml) return out;
  const itemBlocks = xml.split(/<item>/).slice(1);
  for (const blk of itemBlocks) {
    const inner = blk.split('</item>')[0];
    const linkMatch = inner.match(/<link>([\s\S]*?)<\/link>/i);
    if (!linkMatch) continue;
    const link = linkMatch[1].trim();
    const idMatch = link.match(/\/item\/(\d+)\/index\.do/);
    const colMatch = link.match(/\/adbmich\/(no|op)\/en\/item\//);
    if (!idMatch || !colMatch) continue;
    out.push({ id: parseInt(idMatch[1], 10), collection: colMatch[1], link });
  }
  return out;
}

// ── Scrape phases ───────────────────────────────────────────────────────────

async function discoverMaxIdFromRss() {
  let maxId = 0;
  for (const col of COLLECTIONS) {
    const url = RSS_URL(col);
    try {
      const { ok, status, text } = await httpGet(url);
      if (!ok) {
        console.error(`[rss] ${col}: HTTP ${status}`);
        continue;
      }
      const ids = parseRssLinkIds(text);
      for (const it of ids) if (it.id > maxId) maxId = it.id;
      console.error(`[rss] ${col}: ${ids.length} items, top id=${ids.length ? Math.max(...ids.map(x => x.id)) : 'n/a'}`);
    } catch (err) {
      console.error(`[rss] ${col}: ${err.message}`);
    }
    await politeDelay();
  }
  return maxId;
}

async function fetchItemAcrossCollections(id) {
  // Try notices first, then orders. Either-or — never both.
  for (const col of COLLECTIONS) {
    const url = ITEM_URL(col, id);
    let resp;
    try {
      resp = await httpGet(url);
    } catch (err) {
      console.error(`[fetch] id=${id} col=${col}: ${err.message}`);
      continue;
    }
    if (!resp.ok) continue;
    const rec = parseItem(resp.text, col, id);
    if (rec) return rec;
    // 200 but unparseable — log and keep trying alternate collection.
    console.error(`[parse] id=${id} col=${col}: 200 but no metadata extracted`);
  }
  return null;
}

async function walkSequential() {
  const records = [];
  let consecutive404 = 0;
  let scanned = 0;
  for (let id = OPTS.maxId; id >= OPTS.minId; id--) {
    scanned++;
    const rec = await fetchItemAcrossCollections(id);
    if (rec) {
      consecutive404 = 0;
      records.push(rec);
      if (records.length % 25 === 0) {
        console.error(`[walk] id=${id} found=${records.length} scanned=${scanned} (latest: ${rec.full_name} [${rec.bar_number}] ${rec.discipline_type} ${rec.order_date})`);
      }
    } else {
      consecutive404++;
      if (consecutive404 >= OPTS.maxMisses) {
        console.error(`[walk] hit ${consecutive404} consecutive misses at id=${id} — stopping`);
        break;
      }
    }
    await politeDelay();
  }
  console.error(`[walk] scanned ${scanned} ids → ${records.length} records`);
  return records;
}

async function harvestRss() {
  const records = [];
  for (const col of COLLECTIONS) {
    const url = RSS_URL(col);
    try {
      const { ok, status, text } = await httpGet(url);
      if (!ok) {
        console.error(`[rss] ${col}: HTTP ${status}`);
        continue;
      }
      const ids = parseRssLinkIds(text);
      console.error(`[rss-harvest] ${col}: ${ids.length} ids to fetch`);
      for (const it of ids) {
        const rec = await fetchItemAcrossCollections(it.id);
        if (rec) records.push(rec);
        await politeDelay();
      }
    } catch (err) {
      console.error(`[rss-harvest] ${col}: ${err.message}`);
    }
  }
  return records;
}

// ── Load ────────────────────────────────────────────────────────────────────

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mi`);
    await client.query(`DROP TABLE IF EXISTS public._stg_discipline_mi`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_attorneys_mi (
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
      CREATE UNLOGGED TABLE public._stg_discipline_mi (
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
    for (const r of records) {
      const { first, last } = splitName(r.full_name);
      const cur = byBar.get(r.bar_number);
      if (!cur) {
        byBar.set(r.bar_number, {
          jurisdiction: JURISDICTION,
          bar_number: r.bar_number,
          full_name: r.full_name,
          first_name: first,
          last_name: last,
          admission_date: null,
          current_status: null,
          city: r.city || r.county || null,
          source_url: r.source_url,
        });
      } else {
        if (!cur.city && (r.city || r.county)) cur.city = r.city || r.county;
      }
    }

    const attorneyRows = [...byBar.values()].map((a) => [
      a.jurisdiction, a.bar_number, a.full_name, a.first_name, a.last_name,
      a.admission_date, a.current_status, a.city, a.source_url,
    ]);
    await bulkCopyRows(
      client,
      '_stg_attorneys_mi',
      ['jurisdiction','bar_number','full_name','first_name','last_name','admission_date','current_status','city','source_url'],
      attorneyRows,
    );

    // De-dupe events on (bar_number, order_date, discipline_type) before COPY,
    // mirroring the unique constraint so re-runs don't COPY collisions before
    // ON CONFLICT runs.
    const seen = new Set();
    const eventRows = [];
    for (const r of records) {
      const key = `${r.bar_number}|${r.order_date}|${r.discipline_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const summary = (r.title_field || r.document_type || '').slice(0, 500) || null;
      eventRows.push([
        JURISDICTION,
        r.bar_number,
        r.full_name,
        r.order_date,
        r.effective_date,
        r.discipline_type,
        r.discipline_raw,
        summary,
        null,           // order_url — no PDF link extracted in this round
        r.source_url,   // source_url — required, 100% populated
      ]);
    }

    await bulkCopyRows(
      client,
      '_stg_discipline_mi',
      ['jurisdiction','bar_number','full_name','order_date','effective_date','discipline_type','discipline_raw','violation_summary','order_url','source_url'],
      eventRows,
    );

    const upsertAttorneys = await client.query(`
      INSERT INTO public.attorneys
        (jurisdiction, bar_number, full_name, first_name, last_name,
         admission_date, current_status, city, source_url, last_seen_at)
      SELECT jurisdiction, bar_number, full_name, first_name, last_name,
             admission_date, current_status, city, source_url, NOW()
      FROM _stg_attorneys_mi
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
      FROM _stg_discipline_mi s
      JOIN public.attorneys a
        ON a.jurisdiction = s.jurisdiction AND a.bar_number = s.bar_number
      WHERE s.order_date IS NOT NULL
      ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;
    `);
    console.error(`[db] discipline events inserted: ${insertEvents.rowCount}`);

    await client.query(`DROP TABLE IF EXISTS public._stg_attorneys_mi, public._stg_discipline_mi`);
  } finally {
    await cleanup();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[mibar] start — apply=${OPTS.apply} min=${OPTS.minId} max=${OPTS.maxId} maxMisses=${OPTS.maxMisses} onlyRss=${OPTS.onlyRss} skipRss=${OPTS.skipRss}`,
  );

  if (OPTS.autoMax) {
    const rssMax = await discoverMaxIdFromRss();
    if (rssMax > OPTS.maxId) {
      console.error(`[mibar] auto-bumping max-id ${OPTS.maxId} → ${rssMax} (from RSS)`);
      OPTS.maxId = rssMax;
    }
  }

  let records;
  if (OPTS.onlyRss) {
    records = await harvestRss();
  } else {
    records = await walkSequential();
  }

  console.error(`[mibar] collected ${records.length} discipline rows`);

  // Sanity: 100% must have source_url and bar_number P\d{4,6}.
  const missingUrl = records.filter((r) => !r.source_url).length;
  const badBar = records.filter((r) => !/^P\d{4,6}$/.test(r.bar_number)).length;
  console.error(`[mibar] sanity: missing_source_url=${missingUrl} bad_bar_number=${badBar}`);
  if (missingUrl > 0 || badBar > 0) {
    throw new Error('sanity check failed — abort before DB write');
  }

  // Histogram preview.
  const hist = new Map();
  for (const r of records) hist.set(r.discipline_type, (hist.get(r.discipline_type) || 0) + 1);
  for (const [k, v] of [...hist.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${k}: ${v}`);
  }
  for (const r of records.slice(0, 5)) {
    console.error(
      `  · ${r.full_name} [${r.bar_number}] — ${r.discipline_type} (${r.order_date}) — ${r.city || r.county || '?'} — ${r.source_url}`,
    );
  }

  if (!OPTS.apply) {
    console.error(`[mibar] dry-run — pass --apply to write to DB`);
    return;
  }
  if (records.length === 0) {
    console.error(`[mibar] no records — nothing to load`);
    return;
  }

  await load(records);
  console.error(`[mibar] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
