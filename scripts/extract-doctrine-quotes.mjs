#!/usr/bin/env node
// TICKET-10: Doctrine extraction over CourtListener opinion bodies.
//
// Template: scripts/cl-bulk-loader.mjs (cursor + COPY FROM STDIN pattern)
// Pattern: cl-bulk-data-defensive.md #18 (no per-row INSERT in bulk loops)
// csv-bulk-checked: none-exists -- source is already-loaded cl_opinion_bodies (1.5M rows)
//
// What this does:
//   1. Stream cl_opinion_bodies in cursor batches keyed on opinion_id ASC
//      (id-based pagination -- no statement-timeout-prone OFFSET).
//   2. For each opinion, scan plain_text for any DOCTRINE_ALIAS_INDEX alias
//      (case-insensitive, whole-word, longest-first).
//   3. Per (opinion, doctrine) match, extract a verbatim ±400-char window
//      and dedup by sha1(quote_text). Keeps the first match per doctrine
//      per opinion so quotes don't pile up in long opinions.
//   4. Resolve jurisdiction (court full_name -> state postal code) via
//      cl_courts join cached at startup.
//   5. COPY FROM STDIN to doctrine_opinion_quotes. Idempotent via
//      ON CONFLICT (opinion_id, doctrine_slug, quote_sha1) DO NOTHING --
//      handled by the unique index on the destination table; we COPY into
//      a staging UNLOGGED table then INSERT ... ON CONFLICT DO NOTHING.
//
// Usage:
//   node scripts/extract-doctrine-quotes.mjs --dry-run [--limit=1000]
//   node scripts/extract-doctrine-quotes.mjs --apply  [--limit=N] [--from=ID]
//
// Flags:
//   --dry-run    Scan but do NOT write rows. Prints sample matches + stats.
//   --apply      Write rows to doctrine_opinion_quotes.
//   --limit=N    Stop after N opinions processed. Default: no limit.
//   --from=ID    Resume cursor from opinion_id > ID. Default: 0.
//   --batch=N    Cursor batch size. Default: 500.
//   --window=N   Quote window radius (chars on each side). Default: 400.
//   --verbose    Per-batch log lines.

import crypto from 'node:crypto';
import { loadDbUrl } from './lib/load-env.mjs';
process.env.SUPABASE_DB_URL ||= loadDbUrl();
import { createBulkClient, bulkCopyRows } from './lib/pg-bulk-defaults.mjs';
import { DOCTRINE_ALIAS_INDEX, DOCTRINE_BY_SLUG, DOCTRINE_ALIAS_COUNT } from '../src/lib/doctrines/taxonomy.mjs';
import { deriveStateCode } from './lib/state-mapper.mjs';

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const argMap = {};
for (const a of args) {
  if (a === '--dry-run') argMap.dryRun = true;
  else if (a === '--apply') argMap.apply = true;
  else if (a === '--verbose') argMap.verbose = true;
  else if (a.startsWith('--limit=')) argMap.limit = parseInt(a.slice(8), 10);
  else if (a.startsWith('--from=')) argMap.from = parseInt(a.slice(7), 10);
  else if (a.startsWith('--batch=')) argMap.batch = parseInt(a.slice(8), 10);
  else if (a.startsWith('--window=')) argMap.window = parseInt(a.slice(9), 10);
}
if (!argMap.dryRun && !argMap.apply) {
  console.error('Usage: extract-doctrine-quotes.mjs (--dry-run | --apply) [--limit=N] [--from=ID] [--batch=N] [--window=N] [--verbose]');
  process.exit(2);
}

const LIMIT = argMap.limit || Infinity;
const FROM = argMap.from || 0;
const BATCH = argMap.batch || 500;
const WINDOW = argMap.window || 400;
const VERBOSE = !!argMap.verbose;
const APPLY = !!argMap.apply;

// ---------------------------------------------------------------- aliases
// Build whole-word regex per alias once. We don't merge into one giant
// regex because we need per-match doctrine_slug attribution.
const ALIAS_PATTERNS = DOCTRINE_ALIAS_INDEX.map(({ alias, lower, slug }) => {
  // Escape regex metachars in alias text, then require whole-word boundary.
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    re: new RegExp(`\\b${escaped}\\b`, 'i'),
    lower,
    slug,
  };
});

// ---------------------------------------------------------------- core
function sha1(s) {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
}

function buildSourceUrl(clusterId, slug) {
  if (!slug) return `https://www.courtlistener.com/opinion/${clusterId}/`;
  return `https://www.courtlistener.com/opinion/${clusterId}/${slug}/`;
}

// Cap quotes per (opinion, doctrine) so a single 200-page opinion that
// references one doctrine 50 times doesn't dominate the spotlight ranking.
// 5 distinct windows is enough for spotlight surface and keeps per-opinion
// work bounded.
const MAX_QUOTES_PER_OPINION_DOCTRINE = 5;

/**
 * Scan one opinion for doctrine matches.
 *
 * Strategy: emit up to MAX_QUOTES_PER_OPINION_DOCTRINE distinct windows
 * per (opinion, doctrine). Each window is a verbatim ±WINDOW slice
 * around one occurrence; sha1 dedup handles overlap (windows ≤2*WINDOW
 * apart will overlap heavily and produce identical-after-trim text).
 *
 * Total relevance_score for a doctrine in this opinion = matchCount * (cit + 1)
 * (matchCount is the FULL opinion-wide count, not capped — captures
 * depth-of-treatment regardless of how many windows we materialize).
 */
function scanOpinion(plainText, opinionId, clusterId) {
  const lower = plainText.toLowerCase();
  // Per-doctrine state: list of offsets + total matchCount.
  const perDoctrine = new Map(); // slug -> { offsets: number[], matchCount: number }

  for (const { lower: aliasLower, slug } of ALIAS_PATTERNS) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(aliasLower, from);
      if (idx === -1) break;
      const before = idx === 0 ? ' ' : lower[idx - 1];
      const after = idx + aliasLower.length >= lower.length ? ' ' : lower[idx + aliasLower.length];
      const isWordBefore = /[a-z0-9_]/.test(before);
      const isWordAfter = /[a-z0-9_]/.test(after);
      if (!isWordBefore && !isWordAfter) {
        let entry = perDoctrine.get(slug);
        if (!entry) {
          entry = { offsets: [], matchCount: 0 };
          perDoctrine.set(slug, entry);
        }
        entry.matchCount++;
        // Keep up to MAX_QUOTES distinct offsets, picking those spaced
        // at least 2*WINDOW apart so windows don't trivially overlap.
        if (entry.offsets.length === 0) {
          entry.offsets.push(idx);
        } else if (entry.offsets.length < MAX_QUOTES_PER_OPINION_DOCTRINE) {
          const lastOffset = entry.offsets[entry.offsets.length - 1];
          if (idx - lastOffset >= WINDOW * 2) {
            entry.offsets.push(idx);
          }
        }
      }
      from = idx + aliasLower.length;
    }
  }

  const rows = [];
  for (const [slug, { offsets, matchCount }] of perDoctrine) {
    for (const offset of offsets) {
      const start = Math.max(0, offset - WINDOW);
      const end = Math.min(plainText.length, offset + WINDOW);
      const quote = plainText.slice(start, end).trim();
      if (quote.length < 50) continue;
      rows.push({
        opinion_id: opinionId,
        cluster_id: clusterId,
        doctrine_slug: slug,
        quote_text: quote,
        quote_offset: offset,
        doctrine_match_count: matchCount,
        quote_sha1: sha1(quote),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  console.log(`[extract-doctrine-quotes] starting`);
  console.log(`  mode: ${APPLY ? 'APPLY (writes rows)' : 'DRY-RUN (no writes)'}`);
  console.log(`  taxonomy: ${DOCTRINE_BY_SLUG.size} doctrines / ${DOCTRINE_ALIAS_COUNT} aliases`);
  console.log(`  cursor: from opinion_id > ${FROM}, batch ${BATCH}, limit ${LIMIT === Infinity ? 'none' : LIMIT}`);

  const { client, cleanup } = await createBulkClient();

  try {
    // 1. Cache court_id -> { name, jurisdiction, state_code } at startup.
    console.log(`[extract] caching cl_courts...`);
    const courtRows = await client.query(`
      SELECT id, full_name, jurisdiction
      FROM cl_courts
    `);
    const courtMap = new Map();
    for (const c of courtRows.rows) {
      courtMap.set(c.id, {
        name: c.full_name,
        jurisdiction: c.jurisdiction,
        state_code: deriveStateCode({ court_id: c.id, court_name: c.full_name }),
      });
    }
    console.log(`[extract] cached ${courtMap.size} courts`);

    // 2. Stream opinions in cursor batches.
    let cursor = FROM;
    let processed = 0;
    let scanned = 0;
    let totalMatches = 0;
    let totalRowsWritten = 0;
    const sampleByDoctrine = new Map();

    // Per-batch staging pattern: each cursor batch COPYs to a fresh UNLOGGED
    // staging table, then INSERT ... ON CONFLICT DO NOTHING flushes to the
    // permanent table, then staging is dropped. A mid-run crash loses at most
    // one batch (≤BATCH opinions) — not the entire run.

    while (processed < LIMIT) {
      const batchSize = Math.min(BATCH, LIMIT - processed);
      // Pull plain_text + cluster join in one go.
      const batch = await client.query(
        `
        SELECT
          ob.opinion_id,
          ob.cluster_id,
          ob.plain_text,
          c.slug AS cluster_slug,
          c.citation_count,
          d.court_id
        FROM cl_opinion_bodies ob
        LEFT JOIN cl_opinion_clusters c ON c.id = ob.cluster_id
        LEFT JOIN cl_dockets d ON d.id = c.docket_id
        WHERE ob.opinion_id > $1
          AND ob.plain_text IS NOT NULL
          AND LENGTH(ob.plain_text) >= 500
        ORDER BY ob.opinion_id
        LIMIT $2
        `,
        [cursor, batchSize]
      );

      if (batch.rows.length === 0) break;

      const rowsToWrite = [];
      for (const op of batch.rows) {
        scanned++;
        const matches = scanOpinion(op.plain_text, BigInt(op.opinion_id), BigInt(op.cluster_id));
        if (matches.length === 0) continue;
        totalMatches += matches.length;

        const court = op.court_id ? courtMap.get(op.court_id) : null;
        const cit = Number(op.citation_count) || 0;
        const sourceUrl = buildSourceUrl(op.cluster_id, op.cluster_slug);

        for (const m of matches) {
          // relevance = matchCount * (citation_count + 1)
          const relevance = m.doctrine_match_count * (cit + 1);
          rowsToWrite.push([
            m.opinion_id.toString(),
            m.cluster_id.toString(),
            m.doctrine_slug,
            null,                                  // charge_slug v2
            court?.jurisdiction ?? null,
            op.court_id ?? null,
            court?.state_code ?? null,
            m.quote_text,
            m.quote_offset,
            m.doctrine_match_count,
            cit,
            relevance,
            sourceUrl,
            m.quote_sha1,
          ]);

          // Sample-keeping for dry-run output.
          if (!sampleByDoctrine.has(m.doctrine_slug) && m.quote_text.length > 100) {
            sampleByDoctrine.set(m.doctrine_slug, {
              opinion_id: op.opinion_id,
              state: court?.state_code ?? 'FED',
              citation_count: cit,
              quote_excerpt: m.quote_text.slice(0, 280),
              source_url: sourceUrl,
            });
          }
        }
      }

      if (APPLY && rowsToWrite.length > 0) {
        // 1. Create a fresh UNLOGGED staging table for this batch.
        await client.query(`
          DROP TABLE IF EXISTS _dq_staging;
          CREATE UNLOGGED TABLE _dq_staging (
            opinion_id BIGINT, cluster_id BIGINT, doctrine_slug TEXT,
            charge_slug TEXT, jurisdiction TEXT, court_id TEXT,
            state_code TEXT, quote_text TEXT, quote_offset INT,
            doctrine_match_count INT, citation_count INT,
            relevance_score REAL, source_url TEXT, quote_sha1 TEXT
          )
        `);
        // 2. COPY batch rows into staging.
        const { rowCount: stagedCount, durationMs } = await bulkCopyRows(
          client,
          '_dq_staging',
          [
            'opinion_id', 'cluster_id', 'doctrine_slug', 'charge_slug',
            'jurisdiction', 'court_id', 'state_code', 'quote_text',
            'quote_offset', 'doctrine_match_count', 'citation_count',
            'relevance_score', 'source_url', 'quote_sha1',
          ],
          (async function* () { for (const r of rowsToWrite) yield r; })()
        );
        // 3. Flush staging -> permanent table (dedup via unique index).
        const flushResult = await client.query(`
          INSERT INTO doctrine_opinion_quotes (
            opinion_id, cluster_id, doctrine_slug, charge_slug,
            jurisdiction, court_id, state_code, quote_text, quote_offset,
            doctrine_match_count, citation_count, relevance_score,
            source_url, quote_sha1
          )
          SELECT opinion_id, cluster_id, doctrine_slug, charge_slug,
            jurisdiction, court_id, state_code, quote_text, quote_offset,
            doctrine_match_count, citation_count, relevance_score,
            source_url, quote_sha1
          FROM _dq_staging
          ON CONFLICT (opinion_id, doctrine_slug, quote_sha1) DO NOTHING
        `);
        const flushed = flushResult.rowCount ?? 0;
        totalRowsWritten += flushed;
        // 4. Drop staging — permanent rows are safe now.
        await client.query(`DROP TABLE IF EXISTS _dq_staging`);
        if (VERBOSE) console.log(`  staged ${stagedCount} flushed ${flushed} rows (${durationMs}ms copy)`);
      }

      cursor = batch.rows[batch.rows.length - 1].opinion_id;
      processed += batch.rows.length;
      if (VERBOSE || processed % 5000 === 0) {
        const rate = (processed / ((Date.now() - t0) / 1000)).toFixed(1);
        console.log(`  processed=${processed} scanned=${scanned} matches=${totalMatches} cursor=${cursor} rate=${rate}/s`);
      }
    }

    const elapsedMs = Date.now() - t0;
    console.log(`\n[extract-doctrine-quotes] DONE`);
    console.log(`  processed:     ${processed} opinions`);
    console.log(`  scanned ok:    ${scanned}`);
    console.log(`  matches found: ${totalMatches}`);
    console.log(`  rows written:  ${totalRowsWritten}`);
    console.log(`  elapsed:       ${(elapsedMs / 1000).toFixed(1)}s`);

    if (sampleByDoctrine.size > 0) {
      console.log(`\nSAMPLE MATCHES (one per doctrine):`);
      for (const [slug, sample] of sampleByDoctrine) {
        console.log(`  ${slug} [${sample.state}, cited ${sample.citation_count}x]`);
        console.log(`    ${sample.quote_excerpt.replace(/\s+/g, ' ').trim().slice(0, 200)}...`);
        console.log(`    ${sample.source_url}`);
      }
    }
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error('extract-doctrine-quotes FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
