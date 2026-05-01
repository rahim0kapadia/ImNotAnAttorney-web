#!/usr/bin/env node
// Template: scripts/ingest/seed-statutes-ga.mjs (UniCourt single-file harness sibling)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows in justia-harness)
// Pattern: cl-bulk-data-defensive #17 (session-level timeouts via createBulkClient)
// Pattern: no-hallucinated-legal-data — every row carries a verified HTTPS source URL
// csv-bulk-checked: none-exists — Justia 403s with Cloudflare; malegislature.gov is the
//   official MA General Court publisher and the upstream of every Justia mirror anyway.
//
// Seeds Massachusetts General Laws Part IV Title I (Crimes and Punishments,
// Chapters 263-274) into entities_statutes via the per-section-fetch harness.
//
// Source: https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter<N>/Section<M>
// Robots: User-agent: * / Disallow: <empty>  (verified 2026-05-01)
//
// Usage:
//   node scripts/ingest/seed-statutes-ma-justia.mjs --dry-run
//   node scripts/ingest/seed-statutes-ma-justia.mjs --chapters=265 --max-sections=10 --dry-run
//   node scripts/ingest/seed-statutes-ma-justia.mjs                  (live; requires SUPABASE_DB_URL)
//
// Env required for live run:
//   SUPABASE_DB_URL — direct postgres connection (port 5432)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  MA_CHAPTER_LABELS,
  buildChapterUrl,
  discoverSectionUrls,
  parseSection,
  sectionIdFromUrl,
} from './lib/ma-html.mjs';
import { ingestStateBySections } from '../lib/justia-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loader (web-repo only, # skip, trim, quote strip) ────────────────
const dotenvPath = path.resolve(__dirname, '../../.env.local');
try {
  const { config } = await import('dotenv');
  config({ path: dotenvPath });
} catch {
  /* dotenv optional — env may be pre-set */
}

// ── CLI ──────────────────────────────────────────────────────────────────
export function parseCliFlags(argv) {
  const flags = {
    dryRun: false,
    verbose: false,
    chapters: null,
    maxSections: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--chapters=')) {
      flags.chapters = a.slice('--chapters='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--max-sections=')) {
      flags.maxSections = Number.parseInt(a.slice('--max-sections='.length), 10);
    }
  }
  return flags;
}

// ── MA config ────────────────────────────────────────────────────────────
export function buildMaConfig({ chapters, maxSections } = {}) {
  const targets = chapters && chapters.length ? chapters : MA_CHAPTER_LABELS;
  return {
    stateCode: 'MA',
    stateName: 'Massachusetts',
    titleNum: 'I',
    titleLabel: 'Crimes and Punishments',
    chapterRootUrls: targets.map((c) => buildChapterUrl(c)),
    allowedHosts: ['malegislature.gov'],
    discoverSectionUrls,
    parseSection,
    sectionIdFromUrl,
    crawlDelayMs: 1500, // robots-permissive; 1.5s defensive default
    fetchTimeoutMs: 45000,
    maxSections: maxSections || null,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = buildMaConfig({ chapters: flags.chapters, maxSections: flags.maxSections });

  if (flags.dryRun) {
    console.log('[seed-statutes-ma-justia] DRY RUN — no DB writes');
  } else {
    if (!process.env.SUPABASE_DB_URL) {
      console.error('ERROR: SUPABASE_DB_URL not set. Run with --dry-run or set the env var.');
      process.exit(1);
    }
    console.log('[seed-statutes-ma-justia] LIVE RUN — will write to DB');
  }

  console.log(`  chapters: [${config.chapterRootUrls.length}] ${config.chapterRootUrls.map((u) => u.split('Chapter')[1]).join(', ')}`);
  if (config.maxSections) console.log(`  maxSections: ${config.maxSections}`);

  const result = await ingestStateBySections(config, {
    dryRun: flags.dryRun,
    verbose: flags.verbose,
  });

  console.log('\n=== Summary ===');
  console.log(`  rows written : ${result.rowCount}`);
  console.log(`  fetch fails  : ${result.skipCount}`);
  console.log(`  parse errors : ${result.errorCount}`);
  console.log(`  duration     : ${result.durationMs}ms`);

  // SC floor: chapters 263-274 contain ~600+ sections (incl. repealed). Even
  // with chapter sub-selection, expect >= 30 rows for any nontrivial run.
  // For a full-title run we expect >= 300 rows.
  // The floor below is keyed to the full-run expectation; partial runs (--chapters / --max-sections)
  // skip the floor check.
  const isFullRun = !flags.chapters && !flags.maxSections;
  if (!flags.dryRun && isFullRun && result.rowCount < 300) {
    console.error(`\nFAIL: SC-MA-1 not met — only ${result.rowCount} rows (need >= 300 for full-title run)`);
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
  console.error('[seed-statutes-ma-justia] fatal:', err.message);
  process.exit(1);
});
