/**
 * Build case_feature_vectors directly from cl_opinion_clusters + cl_dockets.
 *
 * TICKET-9 rescope: bypasses CL Search API 60-results-per-pair page-size cap
 * (pull-all-charges-all-states.mjs uses 3 queries × 20 page_size = 60 max
 * per (state, charge) pair).
 *
 * Source path:
 *   cl_opinion_clusters cl
 *     JOIN cl_dockets d ON d.id = cl.docket_id
 *     WHERE d.court_id = ANY($STATE_COURTS)
 *
 * Vector shape: matches `pull-all-charges-all-states.mjs:369-386` so the
 * downstream Similar Cases Analyzer ($297) and AvailabilityChecker can
 * consume the rows uniformly. The `legal_issues` field is left empty when
 * we don't have classifier output (CA classified_opinions empty as of
 * 2026-05-03), so the rows count toward CA coverage floor without forcing
 * a misclassification.
 *
 * Usage:
 *   node scripts/build-case-feature-vectors-from-db.mjs --state CA           # Dry run
 *   node scripts/build-case-feature-vectors-from-db.mjs --state CA --apply
 *   node scripts/build-case-feature-vectors-from-db.mjs --state CA --apply --limit 500
 *   node scripts/build-case-feature-vectors-from-db.mjs --state CA --apply --verbose
 */

import { query, end } from './lib/db.mjs';

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flagVal(name) {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}
const STATE = (flagVal('state') || 'CA').toUpperCase();
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const LIMIT = parseInt(flagVal('limit') || '0', 10) || null;
const BATCH_SIZE = 500;

// ── Court IDs per state (mirror pull-all-charges-all-states.mjs:171-223) ────
const STATE_COURTS = {
  AL: ["alactapp", "alacrimapp", "ala"],
  AK: ["alaska", "alaskactapp"],
  AZ: ["ariz", "arizctapp"],
  AR: ["ark", "arkctapp"],
  CA: ["cal", "calctapp"],
  CO: ["colo", "coloctapp"],
  CT: ["conn", "connappct", "connsuperct"],
  DE: ["del", "delch", "delsuperct"],
  DC: ["dc"],
  FL: ["fla", "fladistctapp", "flaapp"],
  GA: ["ga", "gactapp"],
  HI: ["haw", "hawapp"],
  ID: ["idaho", "idahoctapp"],
  IL: ["ill", "illappct"],
  IN: ["ind", "indctapp"],
  IA: ["iowa", "iowactapp"],
  KS: ["kan", "kanctapp"],
  KY: ["ky", "kyctapp"],
  LA: ["la", "lactapp"],
  ME: ["me"],
  MD: ["md", "mdctspecapp"],
  MA: ["mass", "massappct"],
  MI: ["mich", "michctapp"],
  MN: ["minn", "minnctapp"],
  MS: ["miss", "missctapp"],
  MO: ["mo", "moctapp"],
  MT: ["mont"],
  NE: ["neb", "nebctapp"],
  NV: ["nev", "nevapp"],
  NH: ["nh"],
  NJ: ["nj", "njsuperctappdiv"],
  NM: ["nm", "nmctapp"],
  NY: ["ny", "nyappterm", "nyappdiv"],
  NC: ["nc", "ncctapp"],
  ND: ["nd", "ndctapp"],
  OH: ["ohio", "ohioctapp"],
  OK: ["okla", "oklacivapp", "oklacrimapp"],
  OR: ["or", "orctapp"],
  PA: ["pa", "pasuperct", "pacommwct"],
  RI: ["ri"],
  SC: ["sc", "scctapp"],
  SD: ["sd"],
  TN: ["tenn", "tennctapp", "tenncrimapp"],
  TX: ["tex", "texapp", "texcrimapp"],
  UT: ["utah", "utahctapp"],
  VT: ["vt"],
  VA: ["va", "vactapp"],
  WA: ["wash", "washctapp"],
  WV: ["wva"],
  WI: ["wis", "wisctapp"],
  WY: ["wyo"],
};

function extractCourtLevel(courtId) {
  if (!courtId) return "trial";
  if (courtId.includes("app") || courtId.includes("superct") || courtId.includes("specapp")) return "appellate";
  return "supreme";
}

function yearBucket(year) {
  if (!year) return "2010s";
  if (year >= 2020) return "2020s";
  if (year >= 2010) return "2010s";
  if (year >= 2000) return "2000s";
  if (year >= 1990) return "1990s";
  return "older";
}

async function main() {
  const courts = STATE_COURTS[STATE];
  if (!courts) throw new Error(`Unknown state: ${STATE}`);

  console.log(`=== build-case-feature-vectors-from-db ===`);
  console.log(`State: ${STATE}  Courts: ${JSON.stringify(courts)}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);

  // Session defenses (cl-bulk-data-defensive #17)
  await query(`SET statement_timeout = '30min'`);
  await query(`SET idle_in_transaction_session_timeout = '5min'`);

  // 1. Discover candidate cluster_ids: NOT YET vectorized + JOIN cl_dockets by court_id
  console.log('\nDiscovering candidate clusters (NOT YET in case_feature_vectors)...');
  const candidates = await query(`
    SELECT cl.id::text AS cluster_id,
           cl.date_filed,
           d.court_id
    FROM cl_opinion_clusters cl
    JOIN cl_dockets d ON d.id = cl.docket_id
    WHERE d.court_id = ANY($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM case_feature_vectors cv
        WHERE cv.cluster_id = cl.id::text
      )
    ORDER BY cl.date_filed DESC NULLS LAST
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `, [courts]);

  console.log(`Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('Nothing to insert. Done.');
    return;
  }

  // 2. Build vector rows
  const rows = candidates.map(c => {
    const year = c.date_filed ? new Date(c.date_filed).getUTCFullYear() : null;
    return {
      cluster_id: c.cluster_id,
      jurisdiction: STATE,
      charge_slug: null, // unknown without classifier; nullable per existing pattern
      features: {
        jurisdiction: STATE,
        court_level: extractCourtLevel(c.court_id),
        year_bucket: yearBucket(year),
        party_side: null,
        outcome: null,
        motion_types: [],
        legal_issues: [],
        benefit_type: null,
      },
    };
  });

  if (VERBOSE) {
    console.log('Sample row:', JSON.stringify(rows[0], null, 2));
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would insert ${rows.length} rows. Use --apply to insert.`);
    return;
  }

  // 3. UPSERT in batches via parameterized INSERT (per-row conditional logic
  // requires ON CONFLICT DO UPDATE, which COPY can't express)
  // bulk-insert-justified: ON CONFLICT (cluster_id) DO UPDATE for upsert semantics; per-row UPDATE on conflict cannot be expressed via COPY FROM STDIN
  console.log(`\nInserting ${rows.length} rows in batches of ${BATCH_SIZE}...`);
  let applied = 0, errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Build VALUES list
    const params = [];
    const values = batch.map((r, idx) => {
      const off = idx * 4;
      params.push(r.cluster_id, JSON.stringify(r.features), r.jurisdiction, r.charge_slug);
      return `($${off + 1}, $${off + 2}::jsonb, $${off + 3}, $${off + 4})`;
    }).join(',');

    const sql = `
      INSERT INTO case_feature_vectors (cluster_id, features, jurisdiction, charge_slug)
      VALUES ${values}
      ON CONFLICT (cluster_id) DO UPDATE SET
        features = EXCLUDED.features,
        jurisdiction = EXCLUDED.jurisdiction,
        charge_slug = COALESCE(case_feature_vectors.charge_slug, EXCLUDED.charge_slug)
    `;

    try {
      await query(sql, params);
      applied += batch.length;
      const bn = Math.floor(i / BATCH_SIZE) + 1;
      const tb = Math.ceil(rows.length / BATCH_SIZE);
      const pct = ((applied / rows.length) * 100).toFixed(1);
      const eta = ((Date.now() - t0) / applied) * (rows.length - applied) / 1000;
      console.log(`  Batch ${bn}/${tb}: ${applied}/${rows.length} (${pct}%)  ETA ${eta.toFixed(0)}s`);
    } catch (e) {
      errors++;
      console.error(`  Batch ${i}-${i + batch.length} ERROR: ${e.message.slice(0, 240)}`);
    }
  }

  console.log(`\n--- RESULTS ---`);
  console.log(`Applied: ${applied}  Errors: ${errors}  Elapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // 4. Re-count CA vectors
  const finalCount = await query(`
    SELECT COUNT(*)::int AS n
    FROM case_feature_vectors
    WHERE jurisdiction=$1
  `, [STATE]);
  console.log(`Total ${STATE} vectors now: ${finalCount[0].n}`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => end());
