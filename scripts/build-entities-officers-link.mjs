// scripts/build-entities-officers-link.mjs
// Populates entities_officers from 3 officer sources:
//   A. officer_external_intel (454,288 rows — Brady/Giglio/NPI, multi-state)
//   B. cpd_officers (37,545 rows — Chicago PD, has badge current_star)
//   C. nypd_officers (96,494 rows — NYPD, has shield_no)
// NRE exonerations skipped in v1 (no reliable officer_name column).
//
// Dedup strategy: Map keyed name_first|name_last|jurisdiction|agency (lowercased).
// Priority: CPD + NYPD (have badge numbers) > officer_external_intel.
// Rows upserted via INSERT ... ON CONFLICT (canonical_id) DO NOTHING.
// canonical_id is a deterministic UUID v5 from the dedup key (stable across reruns).
//
// csv-bulk-checked: none-exists — entities_officers is internally derived, no external CSV
// Pattern: cl-bulk-data-defensive #18 (batch INSERT with pg copy pattern)
// Template: .tmp-session/apply-migration-d.mjs (createRequire pg pattern for worktree)
// bulk-insert-justified: ON CONFLICT DO NOTHING upsert semantics require INSERT, not COPY

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const webRepo = path.resolve(repoRoot, '..', 'ImNotAnAttorney-web');

// Resolve pg from ImNotAnAttorney-web/node_modules (worktree has no node_modules)
const require = createRequire(path.join(webRepo, 'package.json'));
const pg = require('pg');

// Load .env.local from cross-corpus repo root
import fs from 'fs';
const envPath = path.join(repoRoot, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envFile.split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) {
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).split('#')[0].trim();
    envVars[k] = v;
  }
}
const rawUrl = envVars['SUPABASE_DB_URL'];
if (!rawUrl) throw new Error('SUPABASE_DB_URL not set in .env.local');
const u = new URL(rawUrl);
u.port = '5432'; // session mode for DDL-safe ops
const connectionString = u.toString();

const { Client } = pg;

const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a name fragment for dedup key: lowercase, strip punctuation, collapse spaces.
 * Returns null for null/empty input (exported for testing). */
export function normalizeName(s) {
  if (!s) return null;
  const result = String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return result.length > 0 ? result : null;
}

/**
 * Deterministic UUID v5 from a namespace + dedup key string.
 * Stable across reruns — same input = same canonical_id.
 * Exported for testing.
 */
const UUID5_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

export function deterministicUuid(key) {
  // UUID v5: SHA-1(namespace_bytes + key_bytes), formatted as UUID
  const ns = UUID5_NAMESPACE.replace(/-/g, '');
  const nsBytes = Buffer.from(ns, 'hex');
  const keyBytes = Buffer.from(key, 'utf8');
  const hash = crypto.createHash('sha1')
    .update(nsBytes)
    .update(keyBytes)
    .digest();
  // Set version (5) and variant bits
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Build the dedup Map key. Exported for testing. */
export function dedupKey(nameFirst, nameLast, jurisdiction, agency) {
  return [
    normalizeName(nameFirst) || '',
    normalizeName(nameLast) || '',
    (jurisdiction || '').toLowerCase().trim(),
    (agency || '').toLowerCase().trim(),
  ].join('|');
}

// ---------------------------------------------------------------------------
// Source A: officer_external_intel
// ---------------------------------------------------------------------------
async function loadOfficerExternalIntel(client, map) {
  console.log('Loading officer_external_intel...');
  let offset = 0;
  const PAGE = 5000;
  let total = 0;
  let added = 0;

  while (true) {
    const rows = await client.query(
      `SELECT id, officer_name_normalized, state, agency
       FROM public.officer_external_intel
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [PAGE, offset]
    );
    if (rows.rows.length === 0) break;

    for (const row of rows.rows) {
      const normalized = (row.officer_name_normalized || '').trim();
      if (!normalized) continue;

      // Split normalized name: "john doe" → first="john", last="doe"
      // officer_name_normalized is typically "lastname firstname" or "firstname lastname"
      // We store as-is split by last space for last, rest for first
      const parts = normalized.split(' ');
      const nameLast = parts.length > 1 ? parts[parts.length - 1] : normalized;
      const nameFirst = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';

      const jurisdiction = (row.state || '').toLowerCase().trim();
      const agency = (row.agency || '').toLowerCase().trim();
      const key = dedupKey(nameFirst, nameLast, jurisdiction, agency);

      // Only add if not already in map (CPD/NYPD have priority — loaded after)
      if (!map.has(key)) {
        map.set(key, {
          canonical_id: deterministicUuid(key),
          name_first: nameFirst || null,
          name_last: nameLast || null,
          badge_number: null,
          agency: row.agency || null,
          jurisdiction: row.state || null,
          rank: null,
          start_date: null,
          end_date: null,
          provenance_source: 'officer_external_intel',
          provenance_record_id: String(row.id),
          provenance_extracted_at: new Date().toISOString(),
        });
        added++;
      }
    }

    total += rows.rows.length;
    offset += PAGE;
    if (rows.rows.length < PAGE) break;
    if (total % 50000 === 0) process.stdout.write(`  oei: ${total} scanned, ${map.size} unique\n`);
  }

  console.log(`  officer_external_intel: ${total} rows scanned, ${added} added to map`);
}

// ---------------------------------------------------------------------------
// Source B: cpd_officers (Chicago PD — has badge current_star)
// ---------------------------------------------------------------------------
async function loadCpdOfficers(client, map) {
  console.log('Loading cpd_officers...');
  const result = await client.query(
    `SELECT first_name, last_name, current_star, cleaned_rank, current_rank, appointed_date, resignation_date
     FROM public.cpd_officers
     WHERE last_name IS NOT NULL`
  );

  let added = 0;
  let overwritten = 0;

  for (const row of result.rows) {
    const nameFirst = normalizeName(row.first_name);
    const nameLast = normalizeName(row.last_name);
    const jurisdiction = 'il';
    const agency = 'chicago police department';
    const key = dedupKey(nameFirst, nameLast, jurisdiction, agency);

    const entry = {
      canonical_id: deterministicUuid(key),
      name_first: row.first_name ? row.first_name.trim() : null,
      name_last: row.last_name ? row.last_name.trim() : null,
      badge_number: row.current_star ? String(row.current_star).trim() : null,
      agency: 'Chicago Police Department',
      jurisdiction: 'IL',
      rank: row.cleaned_rank || row.current_rank || null,
      start_date: row.appointed_date ? row.appointed_date.toISOString().slice(0, 10) : null,
      end_date: row.resignation_date ? row.resignation_date.toISOString().slice(0, 10) : null,
      provenance_source: 'cpd_officers',
      provenance_record_id: null,
      provenance_extracted_at: new Date().toISOString(),
    };

    if (map.has(key)) {
      overwritten++;
    } else {
      added++;
    }
    map.set(key, entry); // CPD overwrites OEI (has badge number)
  }

  console.log(`  cpd_officers: ${result.rows.length} rows, ${added} added, ${overwritten} overwrote OEI entries`);
}

// ---------------------------------------------------------------------------
// Source C: nypd_officers (NYPD — has shield_no)
// Actual columns: officer_first_name, officer_last_name, current_rank_abbreviation, shield_no
// ---------------------------------------------------------------------------
async function loadNypdOfficers(client, map) {
  console.log('Loading nypd_officers...');
  const result = await client.query(
    `SELECT officer_first_name, officer_last_name, current_rank_abbreviation, shield_no,
            active_per_last_reported_status, last_reported_active_date
     FROM public.nypd_officers
     WHERE officer_last_name IS NOT NULL`
  );

  let added = 0;
  let overwritten = 0;

  for (const row of result.rows) {
    const nameFirst = normalizeName(row.officer_first_name);
    const nameLast = normalizeName(row.officer_last_name);
    const jurisdiction = 'ny';
    const agency = 'new york police department';
    const key = dedupKey(nameFirst, nameLast, jurisdiction, agency);

    // Determine end_date from active status
    let endDate = null;
    if (row.active_per_last_reported_status === 'No' && row.last_reported_active_date) {
      endDate = row.last_reported_active_date.toISOString().slice(0, 10);
    }

    const entry = {
      canonical_id: deterministicUuid(key),
      name_first: row.officer_first_name ? row.officer_first_name.trim() : null,
      name_last: row.officer_last_name ? row.officer_last_name.trim() : null,
      badge_number: row.shield_no ? String(row.shield_no).trim() : null,
      agency: 'New York Police Department',
      jurisdiction: 'NY',
      rank: row.current_rank_abbreviation || null,
      start_date: null,
      end_date: endDate,
      provenance_source: 'nypd_officers',
      provenance_record_id: null,
      provenance_extracted_at: new Date().toISOString(),
    };

    if (map.has(key)) {
      overwritten++;
    } else {
      added++;
    }
    map.set(key, entry); // NYPD overwrites OEI (has shield_no)
  }

  console.log(`  nypd_officers: ${result.rows.length} rows, ${added} added, ${overwritten} overwrote OEI entries`);
}

// ---------------------------------------------------------------------------
// Flush map entries to DB in batches
// ---------------------------------------------------------------------------
async function flushToDB(client, map) {
  const allEntries = Array.from(map.values());

  // Secondary dedup: (agency, badge_number) uniqueness constraint.
  // Multiple source entries can share the same badge even with different canonical_ids
  // (e.g. OEI has badge "16831.0" for CPD officer X; CPD row has same badge for officer Y).
  // Map iteration order puts OEI first (loaded first); CPD/NYPD loaded later overwrite by
  // name-key but may not collide on name — they CAN still share a badge with an OEI entry.
  // Strategy: iterate in insertion order (OEI first), skip any entry whose (agency, badge_number)
  // was already seen. Since CPD/NYPD entries come AFTER OEI in the source-load order but
  // map.values() preserves insertion order, OEI entries win on badge ties — acceptable because
  // both refer to the same physical officer when badge matches.
  const badgeSeen = new Set();
  const entries = [];
  for (const e of allEntries) {
    if (e.badge_number && e.agency) {
      const badgeKey = `${e.agency.toLowerCase()}|${e.badge_number}`;
      if (badgeSeen.has(badgeKey)) continue; // skip secondary-constraint collision
      badgeSeen.add(badgeKey);
    }
    entries.push(e);
  }
  const badgeDeduped = allEntries.length - entries.length;

  console.log(`\nFlushing ${entries.length} entries to entities_officers (${badgeDeduped} badge-deduped)...`);

  if (DRY_RUN) {
    console.log('DRY RUN: skipping DB write. Sample entry:', JSON.stringify(entries[0], null, 2));
    return { inserted: 0, skipped: entries.length };
  }

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    // Build multi-row INSERT
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const e of batch) {
      values.push(
        `($${pIdx++}::uuid, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::date, $${pIdx++}::date, $${pIdx++}, $${pIdx++}, $${pIdx++}::timestamptz)`
      );
      params.push(
        e.canonical_id,
        e.name_first,
        e.name_last,
        e.badge_number,
        e.agency,
        e.jurisdiction,
        e.rank,
        e.start_date,
        e.end_date,
        e.provenance_source,
        e.provenance_record_id,
        e.provenance_extracted_at
      );
    }

    const sql = `
      INSERT INTO public.entities_officers
        (canonical_id, name_first, name_last, badge_number, agency, jurisdiction, rank, start_date, end_date,
         provenance_source, provenance_record_id, provenance_extracted_at)
      VALUES ${values.join(',\n      ')}
      ON CONFLICT (canonical_id) DO NOTHING
    `;

    const result = await client.query(sql, params);
    inserted += result.rowCount;
    skipped += batch.length - result.rowCount;

    if ((i / BATCH_SIZE) % 20 === 0) {
      process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted} inserted so far\n`);
    }
  }

  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`=== build-entities-officers-link.mjs START${DRY_RUN ? ' (DRY RUN)' : ''} ===`);
  console.log(`DB: ${u.hostname}:${u.port}`);

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`SET statement_timeout = '30min'`);
    await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await client.query(`SET tcp_keepalives_idle = 60`);
    await client.query(`SET tcp_keepalives_interval = 10`);
    await client.query(`SET tcp_keepalives_count = 6`);

    // Check existing row count
    const existing = await client.query('SELECT COUNT(*) AS n FROM public.entities_officers');
    console.log(`entities_officers existing rows: ${existing.rows[0].n}`);

    // Build dedup map — load OEI first (lower priority), then CPD/NYPD (overwrite)
    const map = new Map();
    await loadOfficerExternalIntel(client, map);
    await loadCpdOfficers(client, map);
    await loadNypdOfficers(client, map);

    console.log(`\nTotal unique officers in map: ${map.size}`);

    // Flush to DB
    const { inserted, skipped } = await flushToDB(client, map);

    // Final verify
    const final = await client.query('SELECT COUNT(*) AS n FROM public.entities_officers');
    console.log(`\n=== SUMMARY ===`);
    console.log(`  Map size:         ${map.size}`);
    console.log(`  DB inserted:      ${inserted}`);
    console.log(`  DB skipped:       ${skipped} (ON CONFLICT DO NOTHING)`);
    console.log(`  entities_officers final rows: ${final.rows[0].n}`);
    console.log(`  Status: ${parseInt(final.rows[0].n) > 0 ? 'PASS' : 'FAIL (0 rows)'}`);

  } finally {
    try { await client.end(); } catch {}
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
