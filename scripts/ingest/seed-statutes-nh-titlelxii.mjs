#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-il-ch720.mjs
// Pattern: cl-bulk-data-defensive #14 — port 5432 session-mode
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — gc.nh.gov per-section HTML, no bulk file
// Engine-only routing: 11s crawl-delay forbids Vercel cron 60s budget; engine
//   orchestrator owns periodic refresh. This initial backfill ran on a workstation.
//
// Plan: docs/plans/2026-05-02-nh-titlelxii-design.md
//
// Seeds New Hampshire RSA Title LXII (Criminal Code) into entities_statutes.
//
// Source: https://gc.nh.gov/rsa/html/LXII/{C}/{C}-{S}.htm  (per-section HTML)
// Robots: User-agent: * / Crawl-Delay: 11 (gc.nh.gov, verified 2026-05-02)
//
// Cohort (NH_COHORT_DEFAULT): 39 chapters of Title LXII Criminal Code.
// Floor (NH_TITLELXII_ROW_FLOOR): 250 rows (design report estimates 600-800;
//   conservative floor avoids brittleness if a few chapters are heavily repealed).
//
// Usage:
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs --dry-run
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs --dry-run --limit=3 --chapters=630
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs --verbose
//   node scripts/ingest/seed-statutes-nh-titlelxii.mjs                 (live; needs SUPABASE_DB_URL)

import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  NH_HOST,
  NH_TITLE,
  buildChapterUrl,
  buildNHSourceUrl,
  canonicalSectionId,
  discoverChapterTokens,
  discoverSections,
  parseSection,
} from './lib/nh-html.mjs';
import {
  fetchWithRetry,
  buildSectionRow,
  applyToDb,
} from '../lib/justia-harness.mjs';

const execFileP = promisify(execFile);

// ── Curl-transport fetchImpl (defeat undici deadlock on Windows) ──────────────
//
// Native Node fetch (undici) has a Windows-specific bug where AbortController
// occasionally fails to kill a stuck socket — leaves the script hung with 0 CPU
// and 0 active connections. Observed 2026-05-03 mid-NH-ingest after ~1 hr of
// stalled-no-progress. Workaround: spawn `curl --max-time` per fetch — the OS
// kernel kills the curl process on timeout, no shared event loop to deadlock.
//
// Returns a fetch-shaped object with .ok, .status, .statusText, .text() so the
// justia-harness fetchWithRetry retry/breaker logic still applies.
async function curlFetch(url, init = {}) {
  const headers = init.headers || {};
  const ua = headers['User-Agent'] || 'ImNotAnAttorney-statute-seed/1.0 (legal research)';
  const accept = headers['Accept'] || 'text/html';
  // 30s socket-level + 60s wall-clock
  const args = [
    '-sS', '-L', '--compressed',
    '--max-time', '60',
    '--connect-timeout', '15',
    '-A', ua,
    '-H', `Accept: ${accept}`,
    '-w', '\\n__HTTP_STATUS__=%{http_code}',
    url,
  ];
  let stdout, stderr;
  try {
    const r = await execFileP('curl', args, { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    stdout = r.stdout; stderr = r.stderr;
  } catch (e) {
    // curl exit codes: 28=timeout, 6/7=DNS/connect, others=transport. Surface as transport error.
    const err = new Error(`curl failed: ${e.code || 'unknown'} ${(e.stderr || e.message || '').slice(0, 200)}`);
    err.cause = e;
    throw err;
  }
  // Strip status footer
  const m = stdout.match(/\n__HTTP_STATUS__=(\d{3})\s*$/);
  let status = 0;
  let body = stdout;
  if (m) {
    status = Number.parseInt(m[1], 10);
    body = stdout.slice(0, m.index);
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status ? `HTTP ${status}` : 'unknown',
    text: async () => body,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader ────────────────────────────────────────────────────────────────
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  /* dotenv optional — env may be pre-set */
}

// ── Cohort + descriptions (verified 2026-05-02 via title TOC) ────────────────

/**
 * NH Title LXII chapter cohort. Verified 2026-05-02 against
 * https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII.htm
 * Excludes 632 (whole chapter repealed in 1975 — superseded by 632-A).
 */
export const NH_COHORT_DEFAULT = [
  '625', '626', '627', '628', '629',
  '630', '631', '632-A', '633',
  '634', '635', '636', '637', '638',
  '639', '639-A',
  '640', '641', '642', '643',
  '644', '644-A', '645',
  '646', '646-A',
  '647', '648',
  '649', '649-A', '649-B',
  '650', '650-A', '650-B', '650-C',
  '651', '651-A', '651-B', '651-C', '651-D', '651-E', '651-F',
];

export const NH_CHAPTER_DESCRIPTIONS = {
  '625': 'Preliminary',
  '626': 'General Principles',
  '627': 'Justification',
  '628': 'Responsibility',
  '629': 'Inchoate Crimes',
  '630': 'Homicide',
  '631': 'Assault and Related Offenses',
  '632-A': 'Sexual Assault and Related Offenses',
  '633': 'Interference with Freedom',
  '634': 'Destruction of Property',
  '635': 'Unauthorized Entries',
  '636': 'Robbery',
  '637': 'Theft',
  '638': 'Fraud',
  '639': 'Offenses Against the Family',
  '639-A': 'Controlled Drug-Related Crimes',
  '640': 'Corrupt Practices',
  '641': 'Falsification in Official Matters',
  '642': 'Obstructing Governmental Operations',
  '643': 'Abuse of Office',
  '644': 'Breaches of the Peace and Related Offenses',
  '644-A': 'Electronic Device Location Information',
  '645': 'Public Indecency',
  '646': 'Offenses Against the Flag',
  '646-A': 'Desecration of the Flag',
  '647': 'Gambling Offenses',
  '648': 'Subversive Activities',
  '649': 'Sabotage Prevention',
  '649-A': 'Child Sexual Abuse Images',
  '649-B': 'Computer Pornography and Child Exploitation Prevention',
  '650': 'Obscene Matter',
  '650-A': 'Felonious Use of Firearms',
  '650-B': 'Felonious Use of Body Armor',
  '650-C': 'Negligent Storage of Firearms',
  '651': 'Sentences',
  '651-A': 'Parole of Prisoners',
  '651-B': 'Registration of Criminal Offenders',
  '651-C': 'DNA Testing of Criminal Offenders',
  '651-D': 'Post-Conviction DNA Testing',
  '651-E': 'Interbranch Criminal and Juvenile Justice Council',
  '651-F': 'Information and Analysis Center',
};

export const NH_TITLELXII_ROW_FLOOR = 250;
export const NH_CRAWL_DELAY_MS = 11000;
export const NH_FETCH_TIMEOUT_MS = 45000;
export const NH_ALLOWED_HOSTS = [NH_HOST];

// ── CLI ───────────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    chapters: null,
    limit: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--chapters=')) {
      flags.chapters = a.slice('--chapters='.length).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      flags.limit = Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return flags;
}

// ── NH config ─────────────────────────────────────────────────────────────────
export function buildNhConfig({ chapters, limit } = {}) {
  const cohort = chapters && chapters.length
    ? NH_COHORT_DEFAULT.filter((c) => chapters.includes(c.toUpperCase()))
    : NH_COHORT_DEFAULT;
  return {
    stateCode: 'NH',
    stateName: 'New Hampshire',
    titleNum: NH_TITLE,            // 'LXII'
    titleLabel: 'Criminal Code',
    allowedHosts: NH_ALLOWED_HOSTS,
    crawlDelayMs: NH_CRAWL_DELAY_MS,
    fetchTimeoutMs: NH_FETCH_TIMEOUT_MS,
    cohort,
    limit: limit || null,
  };
}

// ── Discovery + parsing pipeline ──────────────────────────────────────────────

/**
 * Discover all section descriptors across the configured chapter cohort.
 * Returns ordered + deduped NHSectionDescriptor[].
 *
 * @param {ReturnType<typeof buildNhConfig>} config
 * @param {{ verbose?: boolean, fetchImpl?: Function }} [opts]
 */
export async function discoverAllSections(config, opts = {}) {
  const { verbose = false, fetchImpl } = opts;
  const fetchOpts = {
    allowedHosts: config.allowedHosts,
    crawlDelayMs: config.crawlDelayMs,
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchImpl,
  };
  const seen = new Set();
  const out = [];
  for (const chapter of config.cohort) {
    const url = buildChapterUrl(chapter);
    let html;
    try {
      html = await fetchWithRetry(url, fetchOpts);
    } catch (e) {
      console.warn(`  [chapter ${chapter}] fetch failed: ${e.message}`);
      continue;
    }
    const sections = discoverSections(html, chapter);
    if (verbose) {
      console.log(`  [chapter ${chapter}] ${sections.length} sections`);
    } else {
      process.stdout.write('.');
    }
    for (const s of sections) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
    }
  }
  if (!verbose) process.stdout.write('\n');
  return out;
}

/**
 * Fetch + parse all section descriptors → built validated rows.
 *
 * @param {ReturnType<typeof buildNhConfig>} config
 * @param {NHSectionDescriptor[]} descriptors
 * @param {{ verbose?: boolean, fetchImpl?: Function }} [opts]
 */
export async function collectRows(config, descriptors, opts = {}) {
  const { verbose = false, fetchImpl } = opts;
  const fetchOpts = {
    allowedHosts: config.allowedHosts,
    crawlDelayMs: config.crawlDelayMs,
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchImpl,
  };
  const rows = [];
  let skipCount = 0;
  let errorCount = 0;
  let attemptCount = 0;
  let parsedCount = 0;
  let repealedCount = 0;

  for (const d of descriptors) {
    if (config.limit !== null && attemptCount >= config.limit) {
      console.log(`  limit=${config.limit} reached — stopping`);
      break;
    }
    attemptCount += 1;

    let html;
    try {
      html = await fetchWithRetry(d.url, fetchOpts);
    } catch (e) {
      skipCount += 1;
      if (verbose) console.warn(`    [skip] ${d.sectionId}: fetch failed — ${e.message}`);
      continue;
    }

    const parsed = parseSection(html, d.sectionId);
    if (!parsed) {
      // null = repealed, 404-shape, parse-mismatch — all expected
      repealedCount += 1;
      if (verbose) console.log(`    [skip] ${d.sectionId}: repealed or unparseable`);
      continue;
    }

    const harnessConfig = {
      stateCode: config.stateCode,
      titleNum: config.titleNum,
      allowedHosts: config.allowedHosts,
    };
    const { row, errors } = buildSectionRow(harnessConfig, d.sectionId, d.url, parsed);
    if (errors.length > 0) {
      errorCount += 1;
      if (verbose) console.warn(`    [err] ${d.sectionId}: ${errors.join('; ')}`);
      continue;
    }
    rows.push(row);
    parsedCount += 1;
    // Always emit per-section heartbeat (even non-verbose) so log file shows
    // forward progress and we can detect hangs. Force flush via stderr write.
    process.stderr.write(`    OK ${d.sectionId} (${parsedCount}/${descriptors.length} in chapter, body=${row.section_text.length}b)\n`);
  }

  return { rows, skipCount, errorCount, repealedCount, attemptCount };
}

// ── Bucket-B harness adapter (per plan §1) ────────────────────────────────────
//
// These wrappers expose the parser shape the bucket-b harness expects when (and
// if) the harness contract lands. They're verified by tests and are inert to
// the orchestrator's direct discovery+parse flow above.

export function bucketBDiscover(tocHtml, configOrChapter) {
  const chapter = typeof configOrChapter === 'string' ? configOrChapter : configOrChapter?.chapter;
  if (!chapter) return [];
  return discoverSections(tocHtml, chapter);
}

export function bucketBParse(html, sectionRsaCite) {
  const out = parseSection(html, sectionRsaCite);
  if (!out) return null;
  // Harness contract: { titleText, bodyText } — drop effectiveDate field.
  return { titleText: out.titleText, bodyText: out.bodyText };
}

export function buildSourceUrl(sectionRsaCite) {
  // sectionRsaCite e.g. "630:1" or "632-A:2" — split on ':' once
  const idx = sectionRsaCite.indexOf(':');
  if (idx < 0) return null;
  const chapter = sectionRsaCite.slice(0, idx);
  const sec = sectionRsaCite.slice(idx + 1);
  return buildNHSourceUrl(chapter, sec);
}

export function buildChapterConfig(chapter) {
  return {
    chapter,
    chapterUrl: buildChapterUrl(chapter),
    description: NH_CHAPTER_DESCRIPTIONS[chapter] || null,
    crawlDelayMs: NH_CRAWL_DELAY_MS,
    fetchTimeoutMs: NH_FETCH_TIMEOUT_MS,
    allowedHosts: NH_ALLOWED_HOSTS,
  };
}

// Re-export so tests can reach helpers without touching the lib path directly.
export { canonicalSectionId, discoverChapterTokens };

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = buildNhConfig({ chapters: flags.chapters, limit: flags.limit });

  console.log('[seed-statutes-nh-titlelxii] gc.nh.gov RSA Title LXII Criminal Code');
  console.log(`  cohort: ${config.cohort.length} chapter(s) (engine-only routing flagged in seeder header)`);
  if (flags.chapters) console.log(`  --chapters filter: ${flags.chapters.join(',')}`);
  if (flags.limit) console.log(`  --limit: ${flags.limit}`);
  console.log(`  crawl-delay: ${config.crawlDelayMs}ms (matches gc.nh.gov robots.txt)`);
  console.log(`  fetch transport: curl child_process (defeats undici Windows deadlock)`);

  if (flags.dryRun) {
    console.log('  mode: DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('  mode: LIVE RUN — will write to entities_statutes (per-chapter commits)');
  }

  const t0 = Date.now();

  // Step 1: discover sections per chapter, then commit per chapter so a stall
  // mid-run still preserves earlier chapters in the DB. Force forward stdout
  // flushes so the nohup log isn't block-buffered.
  console.log('\n[step 1+2+3] per-chapter discover → fetch → COPY');
  let totalRows = 0;
  let totalAttempts = 0;
  let totalFetchSkip = 0;
  let totalRepealed = 0;
  let totalErrors = 0;

  for (let ci = 0; ci < config.cohort.length; ci++) {
    const chapter = config.cohort[ci];
    const tcs = Date.now();
    console.log(`\n  [${ci + 1}/${config.cohort.length}] chapter ${chapter} (${NH_CHAPTER_DESCRIPTIONS[chapter] || '?'})`);

    // Discover sections for THIS chapter only.
    const chapterUrl = buildChapterUrl(chapter);
    let chapterHtml;
    try {
      chapterHtml = await fetchWithRetry(chapterUrl, {
        allowedHosts: config.allowedHosts,
        crawlDelayMs: config.crawlDelayMs,
        fetchTimeoutMs: config.fetchTimeoutMs,
        fetchImpl: curlFetch,
      });
    } catch (e) {
      console.warn(`    chapter TOC fetch failed: ${e.message}`);
      continue;
    }
    const sections = discoverSections(chapterHtml, chapter);
    console.log(`    discovered: ${sections.length}`);

    if (config.limit !== null && totalAttempts >= config.limit) {
      console.log(`    limit=${config.limit} reached — stopping`);
      break;
    }

    // Apply --limit across chapters cumulatively.
    let allowedThisChapter = sections;
    if (config.limit !== null) {
      const remaining = Math.max(0, config.limit - totalAttempts);
      allowedThisChapter = sections.slice(0, remaining);
    }

    const { rows, skipCount, errorCount, repealedCount, attemptCount } = await collectRows(
      { ...config, limit: null },
      allowedThisChapter,
      { verbose: flags.verbose, fetchImpl: curlFetch },
    );

    totalAttempts += attemptCount;
    totalFetchSkip += skipCount;
    totalRepealed += repealedCount;
    totalErrors += errorCount;

    console.log(`    parsed=${rows.length} repealed_or_skipped=${repealedCount} fetch_skip=${skipCount} build_err=${errorCount}`);

    if (rows.length > 0) {
      const dbResult = await applyToDb(rows, config, { dryRun: flags.dryRun });
      totalRows += dbResult.rowCount;
      const tcMs = Date.now() - tcs;
      console.log(`    [chapter ${chapter}] +${dbResult.rowCount} rows committed (deleted ${dbResult.deleted ?? 0} prior) — ${(tcMs/1000).toFixed(0)}s`);
    } else if (flags.dryRun) {
      console.log(`    [chapter ${chapter}] dry-run, no rows`);
    } else {
      console.log(`    [chapter ${chapter}] zero rows to commit (all repealed?)`);
    }
  }

  const durationMs = Date.now() - t0;

  console.log('\n=== Summary ===');
  console.log(`  total rows written : ${totalRows}`);
  console.log(`  total fetch skips  : ${totalFetchSkip}`);
  console.log(`  total repealed     : ${totalRepealed}`);
  console.log(`  total build errors : ${totalErrors}`);
  console.log(`  total attempts     : ${totalAttempts}`);
  console.log(`  duration           : ${(durationMs/1000).toFixed(0)}s (${(durationMs/60000).toFixed(1)}min)`);

  // Floor only enforced on full live runs.
  const isFullRun = !flags.chapters && !flags.limit;
  if (!flags.dryRun) {
    if (isFullRun && totalRows < NH_TITLELXII_ROW_FLOOR) {
      console.error(`\nFAIL: row floor not met — ${totalRows} < ${NH_TITLELXII_ROW_FLOOR}`);
      process.exit(1);
    }
  } else {
    if (totalRows < 1 && totalAttempts >= 1) {
      console.error('\nFAIL: dry-run produced 0 rows — pipeline broken');
      process.exit(1);
    }
  }

  console.log('\nPASS');
  process.exit(0);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((err) => {
  console.error('[seed-statutes-nh-titlelxii] fatal:', err.message);
  process.exit(1);
});
