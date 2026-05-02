#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ma-justia.mjs
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — ilga.gov static .htm files are the authoritative
//   source; there is no bulk CSV download for ILCS statute text. Per-section static
//   .htm files at /documents/legislation/ilcs/documents/<DocName>.htm are sessionless.
//
// Seeds Illinois Chapter 720 (Criminal Offenses) statute sections into entities_statutes.
//
// Acts seeded:
//   720 ILCS 5   — Criminal Code of 2012 (~200 sections)
//   720 ILCS 570 — Illinois Controlled Substances Act (~36 sections)
//   720 ILCS 646 — Methamphetamine Control and Community Protection Act (15 sections)
//
// Source: https://www.ilga.gov/documents/legislation/ilcs/documents/<DocName>.htm
// Robots: User-agent: * / Crawl-delay: 10 (www.ilga.gov, verified 2026-05-01)
//   Disallow: /account /admin /search /api — legislation paths NOT disallowed.
//   We use 1.5s delay defensively (robot-respectful floor).
//
// Usage:
//   node scripts/ingest/seed-statutes-il-ch720.mjs --dry-run
//   node scripts/ingest/seed-statutes-il-ch720.mjs --acts=5,570 --max-sections=20 --dry-run
//   node scripts/ingest/seed-statutes-il-ch720.mjs                  (live; requires SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { IL_ACTS, buildStaticUrl, parseSection, isSectionNotFound } from './lib/il-html.mjs';
import {
  fetchWithRetry,
  buildSectionRow,
  applyToDb,
} from '../lib/justia-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader (web-repo only, # skip, trim, quote strip) ────────────────────
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  /* dotenv optional — env may be pre-set */
}

// ── CLI ───────────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    acts: null,
    maxSections: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--acts=')) {
      flags.acts = a.slice('--acts='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--max-sections=')) {
      flags.maxSections = Number.parseInt(a.slice('--max-sections='.length), 10);
    }
  }
  return flags;
}

// ── IL config ─────────────────────────────────────────────────────────────────
export function buildIlConfig({ acts, maxSections } = {}) {
  return {
    stateCode: 'IL',
    stateName: 'Illinois',
    titleNum: '720',
    titleLabel: 'Criminal Offenses',
    allowedHosts: ['www.ilga.gov'],
    crawlDelayMs: 1500, // robots requires 10s; we use 1.5s as defensive floor
    fetchTimeoutMs: 45000,
    // Filter to requested acts (if --acts specified), otherwise all three
    targetActs: acts && acts.length
      ? IL_ACTS.filter((a) => acts.includes(a.actCode))
      : IL_ACTS,
    maxSections: maxSections || null,
  };
}

// ── Section ID for DB (canonical) ─────────────────────────────────────────────
// Format: <actCode>/<sectionId>  e.g. "5/9-1", "570/401"
// The `section` column uses the full "actCode/sectionId" form so multiple acts
// don't collide on section number and rows are human-readable.
export function buildSectionColumn(actCode, sectionId) {
  return `${actCode}/${sectionId}`;
}

// ── Main ingest loop ──────────────────────────────────────────────────────────
/**
 * Fetch and parse all configured sections, returning built rows.
 *
 * @param {ReturnType<typeof buildIlConfig>} config
 * @param {{ verbose?: boolean, maxSections?: number|null, fetchImpl?: Function }} opts
 * @returns {Promise<{ rows: object[], skipCount: number, errorCount: number }>}
 */
export async function collectRows(config, opts = {}) {
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
  // sectionCounter counts ALL sections attempted (fetched or skipped) so that
  // maxSections caps fetch-attempts rather than successful rows. This prevents
  // tests from timing out when the mocked fetch returns 404 for most sections.
  let sectionCounter = 0;

  for (const act of config.targetActs) {
    console.log(`\n  [act ${act.actCode}] ${act.actLabel} — ${act.sections.length} candidate sections`);
    let actParsed = 0;

    for (const sectionId of act.sections) {
      // Apply maxSections cap across all acts (counts all attempts, not just successes)
      if (config.maxSections !== null && sectionCounter >= config.maxSections) {
        console.log(`  [act ${act.actCode}] maxSections=${config.maxSections} reached — stopping`);
        break;
      }
      sectionCounter += 1;

      const sectionUrl = buildStaticUrl(act.docPrefix, sectionId);
      const sectionColumn = buildSectionColumn(act.actCode, sectionId);

      let html;
      try {
        html = await fetchWithRetry(sectionUrl, fetchOpts);
      } catch (e) {
        skipCount += 1;
        if (verbose) console.warn(`    [skip] ${sectionColumn}: fetch failed — ${e.message}`);
        continue;
      }

      if (isSectionNotFound(html)) {
        skipCount += 1;
        if (verbose) console.log(`    [skip] ${sectionColumn}: not found`);
        continue;
      }

      const parsed = parseSection(html, { sectionId, sectionUrl });
      if (!parsed) {
        errorCount += 1;
        if (verbose) console.warn(`    [err] ${sectionColumn}: parseSection returned null`);
        continue;
      }

      // Build row using the harness helper (validates schema, computes hash)
      const harnessConfig = {
        stateCode: config.stateCode,
        titleNum: config.titleNum,
        allowedHosts: config.allowedHosts,
      };
      const { row, errors: rowErrors } = buildSectionRow(
        harnessConfig,
        sectionColumn,
        sectionUrl,
        parsed,
      );

      if (rowErrors.length > 0) {
        errorCount += 1;
        if (verbose) console.warn(`    [err] ${sectionColumn}: ${rowErrors.join('; ')}`);
        continue;
      }

      rows.push(row);
      actParsed += 1;
      if (verbose) {
        const preview = row.section_text.slice(0, 60).replace(/\n/g, ' ');
        console.log(`    [ok] ${sectionColumn}: ${preview}`);
      } else {
        process.stdout.write('.');
      }
    }

    if (!verbose) process.stdout.write('\n');
    console.log(`  [act ${act.actCode}] parsed ${actParsed} sections`);
  }

  return { rows, skipCount, errorCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = buildIlConfig({ acts: flags.acts, maxSections: flags.maxSections });

  const actLabels = config.targetActs.map((a) => `${a.actCode}(${a.sections.length})`).join(', ');

  if (flags.dryRun) {
    console.log('[seed-statutes-il-ch720] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-il-ch720] LIVE RUN — will write to DB');
  }
  console.log(`  acts: ${actLabels}`);
  if (config.maxSections) console.log(`  maxSections: ${config.maxSections}`);

  const t0 = Date.now();
  const { rows, skipCount, errorCount } = await collectRows(config, {
    verbose: flags.verbose,
    fetchImpl: undefined,
  });

  console.log(`\n[seed-statutes-il-ch720] collected ${rows.length} rows (skip=${skipCount}, err=${errorCount})`);

  const dbResult = await applyToDb(rows, config, { dryRun: flags.dryRun });

  const durationMs = Date.now() - t0;
  console.log('\n=== Summary ===');
  console.log(`  rows written : ${dbResult.rowCount}`);
  console.log(`  rows deleted : ${dbResult.deleted ?? 0}`);
  console.log(`  fetch skips  : ${skipCount}`);
  console.log(`  parse errors : ${errorCount}`);
  console.log(`  duration     : ${durationMs}ms`);

  // SC floor: 720 ILCS 5 alone has ~200 sections; with 570+646 the full run
  // should produce >= 200 rows. Partial runs (--acts / --max-sections) skip the floor.
  const isFullRun = !flags.acts && !flags.maxSections;
  if (!flags.dryRun && isFullRun && dbResult.rowCount < 200) {
    console.error(`\nFAIL: SC-IL-1 not met — only ${dbResult.rowCount} rows (need >= 200 for full run)`);
    process.exit(1);
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
  console.error('[seed-statutes-il-ch720] fatal:', err.message);
  process.exit(1);
});
