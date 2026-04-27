// Template: scripts/ingest/seed-statutes-fl.mjs
// Pattern: cl-bulk-data-defensive #19 (csv-bulk-checked) + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — Justia/codes.ohio.gov/revisor.mn.gov/leg.state.nv.us are HTML-only, no bulk CSV
//
// Justia statute scraper for OH/MN/NV charge taxonomy gap.
//
// Justia (law.justia.com) is the namesake source per the data-completeness plan, but
// Justia is fronted by Cloudflare bot-detection that returns 403/CF-challenge to
// every realistic-UA fetch from this network. Per spec ("Justia or state legislature
// if cleaner"), we fall back to the official state legislature publishers, which
// publish authenticated statute text without bot-detection:
//   OH → codes.ohio.gov (Ohio Laws / LSC)
//   MN → www.revisor.mn.gov (Office of the Revisor of Statutes)
//   NV → www.leg.state.nv.us (NV Legislature, NRS chapter pages with section anchors)
//
// Output: rows shaped to jurisdiction_statutes columns. Every row carries a verified
// HTTPS source_urls[] entry pointing to the page we actually fetched (Verification-
// URL Hard Rule, Architectural Invariant #13).
//
// HTML parsing helpers live in ./lib/justia-html.mjs (no fs imports — regex on
// in-memory strings, FL pattern). This file owns I/O, slug-map load, DB write.
//
// Usage:
//   node scripts/ingest/scrape-statutes-justia.mjs --dry-run                    # all states, no DB write
//   node scripts/ingest/scrape-statutes-justia.mjs --state=OH --dry-run         # OH only
//   node scripts/ingest/scrape-statutes-justia.mjs --state=OH                   # OH apply
//   node scripts/ingest/scrape-statutes-justia.mjs                              # all apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  parseOhioSection,
  parseMinnesotaSection,
  parseNevadaSection,
  extractOffenseClass,
  extractFineMax,
  extractPenaltyMin,
  extractPenaltyMax,
  buildStateLegUrl,
} from './lib/justia-html.mjs';

// ── Env loader (line-by-line, .indexOf — no regex on file contents) ─────────
const envPaths = [
  'C:/Users/email/projects/ImNotAnAttorney-web/.env.local',
];
const VALID_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
function isValidEnvKey(k) {
  if (!k.length) return false;
  if (k[0] >= '0' && k[0] <= '9') return false;
  for (const ch of k) if (!VALID_KEY_CHARS.includes(ch)) return false;
  return true;
}
for (const p of envPaths) {
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
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    if (!isValidEnvKey(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Slug map ─────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SLUG_MAP_PATH = path.resolve(__dirname, '..', '..', 'data', 'charge-taxonomy', '_justia-slug-map.json');
export const SLUG_MAP = JSON.parse(fs.readFileSync(SLUG_MAP_PATH, 'utf-8'));

// ── HTTP — UA rotation + retry + circuit breaker ────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];
const RATE_MIN_MS = 500;
const RATE_MAX_MS = 2000;
const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => RATE_MIN_MS + Math.floor(Math.random() * (RATE_MAX_MS - RATE_MIN_MS));
const randomUa = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

export async function fetchWithRetry(url, { signal, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  if (circuitOpenUntil > Date.now()) {
    await sleep(circuitOpenUntil - Date.now());
    consecutiveFailures = 0;
  }
  let lastError = null;
  for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
    await sleep(randomDelay());
    let resp;
    try {
      resp = await doFetch(url, {
        headers: {
          'User-Agent': randomUa(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal,
      });
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_BACKOFFS_MS.length - 1) await sleep(RETRY_BACKOFFS_MS[attempt]);
      continue;
    }
    if (resp.ok) {
      const body = await resp.text();
      consecutiveFailures = 0;
      return body;
    }
    lastError = new Error('HTTP ' + resp.status + ' on ' + url);
    const retryable = resp.status >= 500 || resp.status === 429;
    if (!retryable) {
      consecutiveFailures = 0;
      throw lastError;
    }
    if (attempt < RETRY_BACKOFFS_MS.length - 1) await sleep(RETRY_BACKOFFS_MS[attempt]);
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
    console.warn('  circuit breaker OPEN for ' + (CIRCUIT_BREAKER_PAUSE_MS / 1000) + 's after ' + consecutiveFailures + ' consecutive failures');
  }
  throw lastError || new Error('fetchWithRetry: exhausted retries');
}

export function _resetBreakerForTests() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

// ── Row builder ─────────────────────────────────────────────────────────────
export function buildRow({ jurisdiction, slug, mapEntry, parsed, fetchedUrl }) {
  const bodyTrimmed = (parsed.bodyText || '').slice(0, 2000);
  const noteParts = [
    'Statute text excerpted from official state publisher (' + new URL(fetchedUrl).hostname + ').',
  ];
  if (parsed.effective) noteParts.push('Effective: ' + parsed.effective + '.');
  noteParts.push('Excerpt: ' + bodyTrimmed.split('\n')[0].slice(0, 400));
  return {
    jurisdiction,
    common_charge_slug: slug,
    statute_number: mapEntry.statute_number,
    statute_title: mapEntry.title || parsed.titleText,
    offense_class: extractOffenseClass(parsed.bodyText),
    penalty_min: extractPenaltyMin(parsed.bodyText),
    penalty_max: extractPenaltyMax(parsed.bodyText),
    fine_max: extractFineMax(parsed.bodyText),
    elements: [],
    mandatory_minimum: null,
    enhancements: [],
    notes: noteParts.join(' '),
    active: true,
    source_urls: [fetchedUrl],
    statute_url: fetchedUrl,
    statute_source: new URL(fetchedUrl).hostname,
  };
}

// ── Per-state dispatch ───────────────────────────────────────────────────────
export async function scrapeStatute({ jurisdiction, slug, mapEntry, fetchImpl }) {
  const url = buildStateLegUrl(jurisdiction, mapEntry.statute_number);
  if (!url) throw new Error('no URL for ' + jurisdiction + ' / ' + slug);
  const html = await fetchWithRetry(url, { fetchImpl });
  let parsed;
  if (jurisdiction === 'OH') {
    parsed = parseOhioSection(html);
  } else if (jurisdiction === 'MN') {
    let bare = mapEntry.statute_number.split('§').pop();
    bare = bare.split('(')[0].split('+')[0].trim();
    parsed = parseMinnesotaSection(html, bare);
  } else if (jurisdiction === 'NV') {
    let bare = mapEntry.statute_number.split('§').pop();
    bare = bare.split('(')[0].split('+')[0].trim();
    if (bare.toUpperCase().startsWith('NRS ')) bare = bare.slice(4).trim();
    const parts = bare.split('.');
    if (parts.length !== 2) return null;
    parsed = parseNevadaSection(html, parts[0], parts[1]);
  } else {
    throw new Error('unknown jurisdiction: ' + jurisdiction);
  }
  if (!parsed) return null;
  return buildRow({ jurisdiction, slug, mapEntry, parsed, fetchedUrl: url });
}

// ── CLI flags ────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = { dryRun: false, state: null, only: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--state=')) flags.state = arg.slice('--state='.length).toUpperCase();
    else if (arg.startsWith('--only=')) flags.only = arg.slice('--only='.length);
  }
  return flags;
}

// ── DB writer ────────────────────────────────────────────────────────────────
async function makeDbClient() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing');
  const u = new URL(dbUrl);
  u.port = '5432';
  const client = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");
  await client.query("SET idle_in_transaction_session_timeout = '5min'");
  return client;
}

async function writeRows(rows) {
  const client = await makeDbClient();
  let inserted = 0;
  let skipped = 0;
  try {
    for (const r of rows) {
      const res = await client.query(
        `INSERT INTO jurisdiction_statutes (
           jurisdiction, common_charge_slug, statute_number, statute_title,
           offense_class, penalty_min, penalty_max, fine_max,
           elements, mandatory_minimum, enhancements, notes,
           active, source_urls, statute_url, statute_source
         ) VALUES ($1,$2,$3,$4, $5,$6,$7,$8, $9,$10,$11,$12, $13,$14,$15,$16)
         ON CONFLICT (jurisdiction, common_charge_slug)
         DO UPDATE SET
           statute_number = EXCLUDED.statute_number,
           statute_title = EXCLUDED.statute_title,
           offense_class = COALESCE(EXCLUDED.offense_class, jurisdiction_statutes.offense_class),
           penalty_min = COALESCE(EXCLUDED.penalty_min, jurisdiction_statutes.penalty_min),
           penalty_max = COALESCE(EXCLUDED.penalty_max, jurisdiction_statutes.penalty_max),
           fine_max = COALESCE(EXCLUDED.fine_max, jurisdiction_statutes.fine_max),
           notes = EXCLUDED.notes,
           active = true,
           source_urls = EXCLUDED.source_urls,
           statute_url = EXCLUDED.statute_url,
           statute_source = EXCLUDED.statute_source,
           updated_at = now()
         WHERE jurisdiction_statutes.active = false OR jurisdiction_statutes.source_urls IS NULL OR cardinality(jurisdiction_statutes.source_urls) = 0
         RETURNING id`,
        [
          r.jurisdiction, r.common_charge_slug, r.statute_number, r.statute_title,
          r.offense_class, r.penalty_min, r.penalty_max, r.fine_max,
          r.elements, r.mandatory_minimum, r.enhancements, r.notes,
          r.active, r.source_urls, r.statute_url, r.statute_source,
        ]
      );
      if (res.rowCount > 0) inserted += 1;
      else skipped += 1;
    }
  } finally {
    await client.end();
  }
  return { inserted, skipped };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export async function run({ dryRun, state, only, fetchImpl }) {
  const states = state ? [state] : ['OH', 'MN', 'NV'];
  const allRows = [];
  const failures = [];
  for (const j of states) {
    const slugs = SLUG_MAP[j];
    if (!slugs) throw new Error('no slug map for ' + j);
    const slugList = only ? [only] : Object.keys(slugs);
    console.log('\n=== ' + j + ' (' + slugList.length + ' slugs) ===');
    for (const slug of slugList) {
      const mapEntry = slugs[slug];
      if (!mapEntry) {
        failures.push({ j, slug, reason: 'not in slug map' });
        continue;
      }
      try {
        const row = await scrapeStatute({ jurisdiction: j, slug, mapEntry, fetchImpl });
        if (!row) {
          failures.push({ j, slug, reason: 'parser returned null' });
          console.warn('  FAIL ' + slug + ' (parser null)');
          continue;
        }
        allRows.push(row);
        console.log('  OK ' + slug + ' -- ' + row.statute_number + ' -- class=' + (row.offense_class || 'n/a'));
      } catch (e) {
        failures.push({ j, slug, reason: e.message });
        console.warn('  FAIL ' + slug + ' -- ' + e.message);
      }
    }
  }
  console.log('\n=== TOTAL: ' + allRows.length + ' rows; ' + failures.length + ' failures ===');
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures.slice(0, 30)) console.log('  ' + f.j + '/' + f.slug + ': ' + f.reason);
  }
  if (dryRun) {
    const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
    const previewPath = path.resolve(__dirname, '..', '..', 'data', 'statutes-justia-' + stamp + '.json');
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    fs.writeFileSync(previewPath, JSON.stringify(allRows, null, 2));
    console.log('\nDRY-RUN preview written to ' + previewPath);
    return { rows: allRows, failures };
  }
  if (allRows.length === 0) throw new Error('no rows produced -- aborting DB write');
  const { inserted, skipped } = await writeRows(allRows);
  console.log('\nDB write: ' + inserted + ' inserted/updated, ' + skipped + ' skipped (already populated)');
  return { rows: allRows, failures, inserted, skipped };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  await run(flags);
  console.log('\n=== done ===');
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) {
  main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
