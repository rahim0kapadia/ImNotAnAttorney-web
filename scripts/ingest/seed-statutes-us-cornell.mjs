// Template: scripts/ingest/seed-statutes-fl.mjs
// Expert: openstates-team (framework) + Cornell LII (authoritative publisher per no-hallucinated-legal-data.md)
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — Cornell LII USC pages are web-only, no bulk JSON/CSV dump
//
// US federal statute seed — Phase 1 companion to FL seed (PR #104).
// Source: Cornell Legal Information Institute (law.cornell.edu/uscode/text/...).
// Target: entities_statutes (one row per section).
// Coverage: heavy-hit federal criminal statutes that INAA state reports may
// cross-reference (firearms, drugs, conspiracy). NOT comprehensive USC.
//
// Every row carries non-empty source_urls[] pointing to the Cornell LII URL
// we actually fetched. Zod contract rejects any row that fails integrity
// BEFORE it reaches INSERT.
//
// Usage:
//   node scripts/ingest/seed-statutes-us-cornell.mjs --dry-run
//   node scripts/ingest/seed-statutes-us-cornell.mjs
//
// Rate model: 0.5-2s random delay per fetch, 3 retries with exponential
// backoff, UA rotation, circuit breaker at 3 consecutive failures.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import { isSectionNotFound, stripHtml, parseSectionPage } from './lib/cornell-html.mjs';

export { isSectionNotFound, stripHtml, parseSectionPage };

// ── Env loader (web-repo only, indexOf line-by-line, skip #, trim, quote strip) ──
const envPaths = ['C:/Users/email/projects/ImNotAnAttorney-web/.env.local'];
const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf-8');
  for (const rawLine of txt.split('\n')) {
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
    if (!VALID_KEY_RX.test(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Target USC sections — heavy-hit federal criminal statutes ──
// (Hardcoded. Phase 1 = 15 sections. Expansion requires a separate PR with
// new tests + swarm review. Per expert-triangulation: Eric Mill's
// unitedstates/congress shows a similar curated-list pattern for the
// highest-signal federal material.)
export const USC_SECTIONS = [
  // Title 18 — federal crimes
  { title: '18', section: '371',  label: 'Conspiracy to commit offense' },
  { title: '18', section: '922',  label: 'Firearms — unlawful acts' },
  { title: '18', section: '924',  label: 'Firearms — penalties (including 924(c))' },
  { title: '18', section: '1001', label: 'False statements' },
  { title: '18', section: '1028', label: 'Identity fraud' },
  { title: '18', section: '1343', label: 'Wire fraud' },
  { title: '18', section: '1951', label: 'Hobbs Act — robbery / extortion' },
  { title: '18', section: '2113', label: 'Bank robbery' },
  { title: '18', section: '3553', label: 'Sentencing factors' },
  // v2 expansion (2026-04-24): gaps found by prompt audit grepping
  // src/lib/intelligence-brief/ + supabase/functions/generate-report/ for
  // `\d+ U.S.C. § \d+` references. Each section below is cited by at least
  // one prompt file and previously hit the (filtered) empty federal fallback.
  { title: '18', section: '2',    label: 'Aiding and abetting' },
  { title: '18', section: '201',  label: 'Bribery of a public official' },
  { title: '18', section: '1201', label: 'Federal kidnapping' },
  { title: '18', section: '1341', label: 'Mail fraud' },
  { title: '18', section: '1347', label: 'Health care fraud' },
  { title: '18', section: '1503', label: 'Obstruction of justice' },
  { title: '18', section: '1519', label: 'Destruction of records / federal investigation' },
  { title: '18', section: '1546', label: 'Immigration document fraud' },
  { title: '18', section: '1621', label: 'Perjury' },
  { title: '18', section: '1962', label: 'RICO — racketeering' },
  { title: '18', section: '2252', label: 'Child pornography possession' },

  // Title 21 — drugs
  { title: '21', section: '841',  label: 'Controlled substance — manufacture/distribute' },
  { title: '21', section: '844',  label: 'Controlled substance — simple possession' },
  { title: '21', section: '846',  label: 'Controlled substance — conspiracy' },
  { title: '21', section: '853',  label: 'Controlled substance — forfeiture' },

  // Title 26 — tax
  { title: '26', section: '7201', label: 'Tax evasion' },

  // Title 8 — immigration (criminal + INA definitions often cited)
  { title: '8',  section: '1101', label: 'Immigration — definitions (aggravated felony etc.)' },
  { title: '8',  section: '1227', label: 'Deportable aliens — criminal-immigration crossover' },
  { title: '8',  section: '1325', label: 'Illegal entry' },
  { title: '8',  section: '1326', label: 'Illegal reentry' },
];

// Single honest identifying UA for Cornell LII — they're a public-interest
// ally, not an adversarial target. Cascade-aligned per S3 from 2026-04-24
// code review. Browser-UA spoofing would misrepresent the bot and hinder
// Cornell sysops from reaching us if they want to throttle.
const USER_AGENTS = [
  'INAA-legal-research/1.0 (+https://imnotanattorney.com/about)',
];

const RATE_MIN_MS = 500;
const RATE_MAX_MS = 2000;
const RETRY_BACKOFFS_MS = [5000, 30000, 120000];
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_PAUSE_MS = 120000;

const CORNELL_BASE = 'https://www.law.cornell.edu/uscode/text/';

// ── CLI flags ────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
  }
  return flags;
}

// ── Zod contract (reject-before-INSERT) ───────────────────────────────────
export const StatuteRowSchema = z.object({
  jurisdiction: z.literal('US'),
  title: z.string().regex(/^\d+$/),
  section: z.string().regex(/^\d+$/),
  subsection: z.null(),
  section_text: z.string().min(20).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url().max(2048)).min(1).max(10)
    .refine((urls) => {
      try {
        const host = new URL(urls[0]).hostname.toLowerCase();
        return host === 'www.law.cornell.edu' || host === 'law.cornell.edu';
      } catch { return false; }
    }, 'Primary source_url host must be law.cornell.edu'),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.null(),
  scraped_at: z.string().datetime().max(40),
});

// ── URL + fetch with retry ───────────────────────────────────────────────
export function buildSectionUrl(title, section) {
  return CORNELL_BASE + title + '/' + section;
}

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function randomDelay() { return RATE_MIN_MS + Math.floor(Math.random() * (RATE_MAX_MS - RATE_MIN_MS)); }
function randomUa() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

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
        headers: { 'User-Agent': randomUa(), 'Accept': 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal,
      });
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_BACKOFFS_MS.length - 1) {
        await sleep(RETRY_BACKOFFS_MS[attempt]);
      }
      continue;
    }
    if (resp.ok) {
      const body = await resp.text();
      consecutiveFailures = 0;
      return body;
    }
    lastError = new Error('HTTP ' + resp.status);
    const retryable = resp.status >= 500 || resp.status === 429;
    if (!retryable) {
      consecutiveFailures = 0;
      throw lastError;
    }
    if (attempt < RETRY_BACKOFFS_MS.length - 1) {
      await sleep(RETRY_BACKOFFS_MS[attempt]);
    }
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
    console.warn('  circuit breaker OPEN for ' + (CIRCUIT_BREAKER_PAUSE_MS / 1000) + 's after ' + consecutiveFailures + ' consecutive failures');
  }
  throw lastError || new Error('fetchWithRetry: exhausted retries');
}

export function _resetBreakerForTests() { consecutiveFailures = 0; circuitOpenUntil = 0; }

// ── Row builder ──────────────────────────────────────────────────────────
export function buildRow({ title, section, titleText, bodyText, sourceUrl, scrapedAt }) {
  const sectionText = (titleText ? titleText.trim() + '\n\n' : '') + bodyText.trim();
  const textHash = crypto.createHash('sha256').update(sectionText).digest('hex');
  return {
    jurisdiction: 'US',
    title,
    section,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: textHash,
    effective_date: null,
    scraped_at: scrapedAt || new Date().toISOString(),
  };
}

// ── TEXT[] literal — matches seed-statutes-fl.mjs semantics exactly. ─────
export function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const parts = arr.map((u) => {
    const safe = String(u)
      .split('\\').join('\\\\')
      .split('"').join('\\"')
      .split('\r').join(' ')
      .split('\n').join(' ');
    return '"' + safe + '"';
  });
  return '{' + parts.join(',') + '}';
}

// ── Orchestrator ─────────────────────────────────────────────────────────
export async function seedUsCornell({ dryRun, sections, fetchImpl, dbFactory } = {}) {
  const targets = sections && sections.length ? sections : USC_SECTIONS;
  console.log('=== seed-statutes-us-cornell ' + new Date().toISOString() + ' ===');
  console.log('  sections: ' + targets.length + ' (Cornell LII / USC)');
  console.log('  dry-run: ' + !!dryRun);

  const allRows = [];
  const rejected = [];

  for (const target of targets) {
    const { title, section } = target;
    const sourceUrl = buildSectionUrl(title, section);
    let html;
    try {
      html = await fetchWithRetry(sourceUrl, { fetchImpl });
    } catch (e) {
      console.warn('  ' + title + ' USC ' + section + ': fetch failed — ' + e.message);
      continue;
    }
    const parsed = parseSectionPage(html, title, section);
    if (!parsed) {
      console.warn('  ' + title + ' USC ' + section + ': parse returned null');
      continue;
    }
    const row = buildRow({
      title, section,
      titleText: parsed.titleText,
      bodyText: parsed.bodyText,
      sourceUrl,
    });
    const check = StatuteRowSchema.safeParse(row);
    if (!check.success) {
      rejected.push({ title, section, issues: check.error.issues.map((i) => i.path.join('.') + ': ' + i.message) });
      continue;
    }
    allRows.push(row);
    console.log('  OK ' + title + ' USC ' + section + ' — ' + parsed.titleText.slice(0, 60) + ' — ' + parsed.bodyText.length + 'ch');
  }

  console.log('\n=== TOTAL: ' + allRows.length + '/' + targets.length + ' rows parsed ===');
  if (rejected.length > 0) {
    console.log('REJECTED (' + rejected.length + '):');
    for (const r of rejected) console.log('  ' + r.title + ' USC ' + r.section + ': ' + r.issues.join('; '));
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — no DB write ===');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
    const previewPath = path.join(repoRoot, 'data', 'statutes-us-' + stamp + '.jsonl');
    try {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true });
      fs.writeFileSync(previewPath, allRows.map((r) => JSON.stringify(r)).join('\n'));
      console.log('preview written to ' + previewPath);
    } catch (e) {
      console.warn('  WARN: could not write preview — ' + e.message);
    }
    return { rows: allRows, rejected };
  }

  if (allRows.length === 0) {
    throw new Error('seedUsCornell: no rows parsed — aborting DB write.');
  }

  const makeClient = dbFactory || createBulkClient;
  const { client, cleanup } = await makeClient();
  try {
    console.log('\nwriting ' + allRows.length + ' rows to entities_statutes...');
    await client.query('BEGIN');
    try {
      // Targeted DELETE: only our exact (title, section) pairs for US
      // jurisdiction. Leaves the 2,241 pre-existing Wikipedia-sourced named-
      // act rows alone (they have different title values like "Bland-Allison
      // Act" — not numeric USC titles).
      const titleSectionPairs = allRows.map((r) => r.title + ':' + r.section);
      const { rowCount: deleted } = await client.query(
        `DELETE FROM entities_statutes
          WHERE jurisdiction = 'US'
            AND (title || ':' || section) = ANY($1::text[])`,
        [titleSectionPairs],
      );
      if (deleted) console.log('  cleared ' + deleted + ' prior US Cornell rows');

      const COLS = [
        'jurisdiction', 'title', 'section', 'subsection',
        'section_text', 'is_current', 'source_urls',
        'text_hash', 'effective_date', 'scraped_at',
      ];
      async function* rowsGen() {
        for (const r of allRows) {
          yield [
            r.jurisdiction, r.title, r.section, r.subsection,
            r.section_text, r.is_current,
            textArrayLiteral(r.source_urls),
            r.text_hash, r.effective_date, r.scraped_at,
          ];
        }
      }
      const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLS, rowsGen());
      console.log('  COPYd ' + rowCount + ' rows in ' + (durationMs / 1000).toFixed(1) + 's');

      // Pre-commit verify.
      const { rows: verify } = await client.query(
        `SELECT count(*)::int AS n,
                sum(CASE WHEN array_length(source_urls, 1) IS NULL THEN 1 ELSE 0 END)::int AS missing_sources,
                sum(CASE WHEN section_text IS NULL OR section_text = '' THEN 1 ELSE 0 END)::int AS empty_body
           FROM entities_statutes
          WHERE jurisdiction = 'US'
            AND array_length(source_urls, 1) >= 1`,
      );
      console.log('pre-commit verify (Cornell-sourced US rows): ' + JSON.stringify(verify[0]));
      if (verify[0].missing_sources > 0) {
        throw new Error(verify[0].missing_sources + ' Cornell US rows have empty source_urls — rolling back');
      }
      if (verify[0].empty_body > 0) {
        throw new Error(verify[0].empty_body + ' Cornell US rows have empty section_text — rolling back');
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await cleanup();
  }

  return { rows: allRows, rejected };
}

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  await seedUsCornell(flags);
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
