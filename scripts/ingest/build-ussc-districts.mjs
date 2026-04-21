// Template: scripts/ingest/build-federal-sentencing-distributions.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #18 (UNLOGGED staging + COPY FROM STDIN + atomic swap)
// csv-bulk-checked: none-exists — source is the USSC Codebook PDF (hardcoded below)
//
// Build ussc_districts canonical lookup table — 94 federal judicial district
// codes → human-readable names, states, circuits, and cl_courts FK.
//
// Source: U.S. Sentencing Commission Public Release Codebook FY99-FY24,
//   Appendix A pp. A-1 (CIRCDIST) + A-3 (DISTRICT), verified via pdftotext.
// URL: https://www.ussc.gov/sites/default/files/pdf/research-and-publications/datafiles/USSC_Public_Release_Codebook_FY99_FY24.pdf
//
// The matview `ussc_similar_cases_summary` uses the DISTRICT column (codes
// 00-96 with gaps at 21/59/92). CIRCDIST is the derived 01-94-ordered code
// used in the USSC Sourcebook. Both are included here for downstream joins.

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const SOURCE_URL = 'https://www.ussc.gov/sites/default/files/pdf/research-and-publications/datafiles/USSC_Public_Release_Codebook_FY99_FY24.pdf';

// Columns (order matters for COPY): district_code, circdist_code,
// district_name, short_name, state_code, state_name, circuit, cl_court_id,
// source_url
//
// NOTE on code padding: USSC codebook Appendix A displays district codes
// 00-09 with a leading zero for visual alignment, but the raw `DISTRICT`
// column in the Individual Offender Datafile stores them unpadded ("0",
// "1", ..., "9"). `ussc_similar_cases_summary.district` preserves that
// unpadded format. CIRCDIST stays zero-padded because we don't join on it
// — it's display-only for alignment with USSC Sourcebook references.
const DISTRICTS = [
  // DC Circuit
  ['90', '01', 'District of Columbia', 'D.D.C.', 'DC', 'District of Columbia', 'DC', 'dcd'],

  // 1st Circuit
  ['0', '02', 'District of Maine', 'D. Maine', 'ME', 'Maine', '1st', 'med'],
  ['1', '03', 'District of Massachusetts', 'D. Massachusetts', 'MA', 'Massachusetts', '1st', 'mad'],
  ['2', '04', 'District of New Hampshire', 'D. New Hampshire', 'NH', 'New Hampshire', '1st', 'nhd'],
  ['3', '06', 'District of Rhode Island', 'D. Rhode Island', 'RI', 'Rhode Island', '1st', 'rid'],
  ['4', '05', 'District of Puerto Rico', 'D. Puerto Rico', 'PR', 'Puerto Rico', '1st', 'prd'],

  // 2nd Circuit
  ['5', '07', 'District of Connecticut', 'D. Connecticut', 'CT', 'Connecticut', '2nd', 'ctd'],
  ['6', '09', 'Northern District of New York', 'N.D. New York', 'NY', 'New York', '2nd', 'nynd'],
  ['7', '08', 'Eastern District of New York', 'E.D. New York', 'NY', 'New York', '2nd', 'nyed'],
  ['8', '10', 'Southern District of New York', 'S.D. New York', 'NY', 'New York', '2nd', 'nysd'],
  ['9', '11', 'Western District of New York', 'W.D. New York', 'NY', 'New York', '2nd', 'nywd'],
  ['10', '12', 'District of Vermont', 'D. Vermont', 'VT', 'Vermont', '2nd', 'vtd'],

  // 3rd Circuit
  ['11', '13', 'District of Delaware', 'D. Delaware', 'DE', 'Delaware', '3rd', 'ded'],
  ['12', '14', 'District of New Jersey', 'D. New Jersey', 'NJ', 'New Jersey', '3rd', 'njd'],
  ['13', '15', 'Eastern District of Pennsylvania', 'E.D. Pennsylvania', 'PA', 'Pennsylvania', '3rd', 'paed'],
  ['14', '16', 'Middle District of Pennsylvania', 'M.D. Pennsylvania', 'PA', 'Pennsylvania', '3rd', 'pamd'],
  ['15', '17', 'Western District of Pennsylvania', 'W.D. Pennsylvania', 'PA', 'Pennsylvania', '3rd', 'pawd'],
  ['91', '18', 'District of the Virgin Islands', 'D.V.I.', 'VI', 'Virgin Islands', '3rd', 'vid'],

  // 4th Circuit
  ['16', '19', 'District of Maryland', 'D. Maryland', 'MD', 'Maryland', '4th', 'mdd'],
  ['17', '20', 'Eastern District of North Carolina', 'E.D. North Carolina', 'NC', 'North Carolina', '4th', 'nced'],
  ['18', '21', 'Middle District of North Carolina', 'M.D. North Carolina', 'NC', 'North Carolina', '4th', 'ncmd'],
  ['19', '22', 'Western District of North Carolina', 'W.D. North Carolina', 'NC', 'North Carolina', '4th', 'ncwd'],
  ['20', '23', 'District of South Carolina', 'D. South Carolina', 'SC', 'South Carolina', '4th', 'scd'],
  ['22', '24', 'Eastern District of Virginia', 'E.D. Virginia', 'VA', 'Virginia', '4th', 'vaed'],
  ['23', '25', 'Western District of Virginia', 'W.D. Virginia', 'VA', 'Virginia', '4th', 'vawd'],
  ['24', '26', 'Northern District of West Virginia', 'N.D. West Virginia', 'WV', 'West Virginia', '4th', 'wvnd'],
  ['25', '27', 'Southern District of West Virginia', 'S.D. West Virginia', 'WV', 'West Virginia', '4th', 'wvsd'],

  // 5th Circuit
  ['35', '28', 'Eastern District of Louisiana', 'E.D. Louisiana', 'LA', 'Louisiana', '5th', 'laed'],
  ['96', '29', 'Middle District of Louisiana', 'M.D. Louisiana', 'LA', 'Louisiana', '5th', 'lamd'],
  ['36', '30', 'Western District of Louisiana', 'W.D. Louisiana', 'LA', 'Louisiana', '5th', 'lawd'],
  ['37', '31', 'Northern District of Mississippi', 'N.D. Mississippi', 'MS', 'Mississippi', '5th', 'msnd'],
  ['38', '32', 'Southern District of Mississippi', 'S.D. Mississippi', 'MS', 'Mississippi', '5th', 'mssd'],
  ['40', '33', 'Eastern District of Texas', 'E.D. Texas', 'TX', 'Texas', '5th', 'txed'],
  ['39', '34', 'Northern District of Texas', 'N.D. Texas', 'TX', 'Texas', '5th', 'txnd'],
  ['41', '35', 'Southern District of Texas', 'S.D. Texas', 'TX', 'Texas', '5th', 'txsd'],
  ['42', '36', 'Western District of Texas', 'W.D. Texas', 'TX', 'Texas', '5th', 'txwd'],

  // 6th Circuit
  ['43', '37', 'Eastern District of Kentucky', 'E.D. Kentucky', 'KY', 'Kentucky', '6th', 'kyed'],
  ['44', '38', 'Western District of Kentucky', 'W.D. Kentucky', 'KY', 'Kentucky', '6th', 'kywd'],
  ['45', '39', 'Eastern District of Michigan', 'E.D. Michigan', 'MI', 'Michigan', '6th', 'mied'],
  ['46', '40', 'Western District of Michigan', 'W.D. Michigan', 'MI', 'Michigan', '6th', 'miwd'],
  ['47', '41', 'Northern District of Ohio', 'N.D. Ohio', 'OH', 'Ohio', '6th', 'ohnd'],
  ['48', '42', 'Southern District of Ohio', 'S.D. Ohio', 'OH', 'Ohio', '6th', 'ohsd'],
  ['49', '43', 'Eastern District of Tennessee', 'E.D. Tennessee', 'TN', 'Tennessee', '6th', 'tned'],
  ['50', '44', 'Middle District of Tennessee', 'M.D. Tennessee', 'TN', 'Tennessee', '6th', 'tnmd'],
  ['51', '45', 'Western District of Tennessee', 'W.D. Tennessee', 'TN', 'Tennessee', '6th', 'tnwd'],

  // 7th Circuit
  ['53', '46', 'Central District of Illinois', 'C.D. Illinois', 'IL', 'Illinois', '7th', 'ilcd'],
  ['52', '47', 'Northern District of Illinois', 'N.D. Illinois', 'IL', 'Illinois', '7th', 'ilnd'],
  ['54', '48', 'Southern District of Illinois', 'S.D. Illinois', 'IL', 'Illinois', '7th', 'ilsd'],
  ['55', '49', 'Northern District of Indiana', 'N.D. Indiana', 'IN', 'Indiana', '7th', 'innd'],
  ['56', '50', 'Southern District of Indiana', 'S.D. Indiana', 'IN', 'Indiana', '7th', 'insd'],
  ['57', '51', 'Eastern District of Wisconsin', 'E.D. Wisconsin', 'WI', 'Wisconsin', '7th', 'wied'],
  ['58', '52', 'Western District of Wisconsin', 'W.D. Wisconsin', 'WI', 'Wisconsin', '7th', 'wiwd'],

  // 8th Circuit
  ['60', '53', 'Eastern District of Arkansas', 'E.D. Arkansas', 'AR', 'Arkansas', '8th', 'ared'],
  ['61', '54', 'Western District of Arkansas', 'W.D. Arkansas', 'AR', 'Arkansas', '8th', 'arwd'],
  ['62', '55', 'Northern District of Iowa', 'N.D. Iowa', 'IA', 'Iowa', '8th', 'iand'],
  ['63', '56', 'Southern District of Iowa', 'S.D. Iowa', 'IA', 'Iowa', '8th', 'iasd'],
  ['64', '57', 'District of Minnesota', 'D. Minnesota', 'MN', 'Minnesota', '8th', 'mnd'],
  ['65', '58', 'Eastern District of Missouri', 'E.D. Missouri', 'MO', 'Missouri', '8th', 'moed'],
  ['66', '59', 'Western District of Missouri', 'W.D. Missouri', 'MO', 'Missouri', '8th', 'mowd'],
  ['67', '60', 'District of Nebraska', 'D. Nebraska', 'NE', 'Nebraska', '8th', 'ned'],
  ['68', '61', 'District of North Dakota', 'D. North Dakota', 'ND', 'North Dakota', '8th', 'ndd'],
  ['69', '62', 'District of South Dakota', 'D. South Dakota', 'SD', 'South Dakota', '8th', 'sdd'],

  // 9th Circuit
  ['95', '63', 'District of Alaska', 'D. Alaska', 'AK', 'Alaska', '9th', 'akd'],
  ['70', '64', 'District of Arizona', 'D. Arizona', 'AZ', 'Arizona', '9th', 'azd'],
  ['73', '65', 'Central District of California', 'C.D. California', 'CA', 'California', '9th', 'cacd'],
  ['72', '66', 'Eastern District of California', 'E.D. California', 'CA', 'California', '9th', 'caed'],
  ['71', '67', 'Northern District of California', 'N.D. California', 'CA', 'California', '9th', 'cand'],
  ['74', '68', 'Southern District of California', 'S.D. California', 'CA', 'California', '9th', 'casd'],
  ['93', '69', 'District of Guam', 'D. Guam', 'GU', 'Guam', '9th', 'gud'],
  ['75', '70', 'District of Hawaii', 'D. Hawaii', 'HI', 'Hawaii', '9th', 'hid'],
  ['76', '71', 'District of Idaho', 'D. Idaho', 'ID', 'Idaho', '9th', 'idd'],
  ['77', '72', 'District of Montana', 'D. Montana', 'MT', 'Montana', '9th', 'mtd'],
  ['78', '73', 'District of Nevada', 'D. Nevada', 'NV', 'Nevada', '9th', 'nvd'],
  ['94', '74', 'District of the Northern Mariana Islands', 'D.N.M.I.', 'MP', 'Northern Mariana Islands', '9th', 'nmid'],
  ['79', '75', 'District of Oregon', 'D. Oregon', 'OR', 'Oregon', '9th', 'ord'],
  ['80', '76', 'Eastern District of Washington', 'E.D. Washington', 'WA', 'Washington', '9th', 'waed'],
  ['81', '77', 'Western District of Washington', 'W.D. Washington', 'WA', 'Washington', '9th', 'wawd'],

  // 10th Circuit
  ['82', '78', 'District of Colorado', 'D. Colorado', 'CO', 'Colorado', '10th', 'cod'],
  ['83', '79', 'District of Kansas', 'D. Kansas', 'KS', 'Kansas', '10th', 'ksd'],
  ['84', '80', 'District of New Mexico', 'D. New Mexico', 'NM', 'New Mexico', '10th', 'nmd'],
  ['86', '81', 'Eastern District of Oklahoma', 'E.D. Oklahoma', 'OK', 'Oklahoma', '10th', 'oked'],
  ['85', '82', 'Northern District of Oklahoma', 'N.D. Oklahoma', 'OK', 'Oklahoma', '10th', 'oknd'],
  ['87', '83', 'Western District of Oklahoma', 'W.D. Oklahoma', 'OK', 'Oklahoma', '10th', 'okwd'],
  ['88', '84', 'District of Utah', 'D. Utah', 'UT', 'Utah', '10th', 'utd'],
  ['89', '85', 'District of Wyoming', 'D. Wyoming', 'WY', 'Wyoming', '10th', 'wyd'],

  // 11th Circuit
  ['27', '86', 'Middle District of Alabama', 'M.D. Alabama', 'AL', 'Alabama', '11th', 'almd'],
  ['26', '87', 'Northern District of Alabama', 'N.D. Alabama', 'AL', 'Alabama', '11th', 'alnd'],
  ['28', '88', 'Southern District of Alabama', 'S.D. Alabama', 'AL', 'Alabama', '11th', 'alsd'],
  ['30', '89', 'Middle District of Florida', 'M.D. Florida', 'FL', 'Florida', '11th', 'flmd'],
  ['29', '90', 'Northern District of Florida', 'N.D. Florida', 'FL', 'Florida', '11th', 'flnd'],
  ['31', '91', 'Southern District of Florida', 'S.D. Florida', 'FL', 'Florida', '11th', 'flsd'],
  ['33', '92', 'Middle District of Georgia', 'M.D. Georgia', 'GA', 'Georgia', '11th', 'gamd'],
  ['32', '93', 'Northern District of Georgia', 'N.D. Georgia', 'GA', 'Georgia', '11th', 'gand'],
  ['34', '94', 'Southern District of Georgia', 'S.D. Georgia', 'GA', 'Georgia', '11th', 'gasd'],
];

const { client, cleanup } = await createBulkClient({
  workMemMB: 256, maintWorkMemMB: 1024, statementTimeout: '10min',
});

try {
  console.log(`=== build-ussc-districts ${new Date().toISOString()} ===`);
  console.log(`DISTRICTS constant: ${DISTRICTS.length} rows`);
  if (DISTRICTS.length !== 94) {
    throw new Error(`Expected 94 districts, got ${DISTRICTS.length}`);
  }

  // 1/6  Ensure target table
  console.log('\n[1/6] CREATE TABLE IF NOT EXISTS ussc_districts...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS ussc_districts (
      district_code TEXT PRIMARY KEY,
      circdist_code TEXT,
      district_name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      state_code TEXT,
      state_name TEXT,
      circuit TEXT NOT NULL,
      cl_court_id TEXT,
      source_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 2/6  Create UNLOGGED staging (drop first to avoid stale state, per cl-bulk-data-defensive #8-9)
  console.log('\n[2/6] DROP + CREATE UNLOGGED staging...');
  await client.query('DROP TABLE IF EXISTS ussc_districts_stage');
  await client.query(`
    CREATE UNLOGGED TABLE ussc_districts_stage (
      district_code TEXT,
      circdist_code TEXT,
      district_name TEXT,
      short_name TEXT,
      state_code TEXT,
      state_name TEXT,
      circuit TEXT,
      cl_court_id TEXT
    )
  `);

  // 3/6  Stream 94 rows via COPY FROM STDIN (per cl-bulk-data-defensive #18)
  console.log('\n[3/6] COPY 94 rows into staging...');
  const { rowCount, durationMs } = await bulkCopyRows(
    client,
    'ussc_districts_stage',
    ['district_code', 'circdist_code', 'district_name', 'short_name',
     'state_code', 'state_name', 'circuit', 'cl_court_id'],
    DISTRICTS,
  );
  console.log(`  COPY complete: ${rowCount} rows in ${durationMs}ms`);
  if (rowCount !== 94) {
    throw new Error(`COPY loaded ${rowCount} rows, expected 94`);
  }

  // 4/6  Verify cl_court_id FKs exist in cl_courts
  console.log('\n[4/6] Verify cl_court_id references resolve to cl_courts rows...');
  const missing = await client.query(`
    SELECT s.district_code, s.cl_court_id
    FROM ussc_districts_stage s
    LEFT JOIN cl_courts c ON c.id = s.cl_court_id
    WHERE s.cl_court_id IS NOT NULL AND c.id IS NULL
    ORDER BY s.district_code
  `);
  if (missing.rows.length > 0) {
    console.log(`  WARNING: ${missing.rows.length} cl_court_id references not found in cl_courts:`);
    for (const r of missing.rows) console.log(`    ${r.district_code} -> ${r.cl_court_id}`);
  } else {
    console.log('  All cl_court_id references resolve.');
  }

  // 5/6  TRUNCATE + INSERT SELECT (clean slate — handles prior-run stale
  // rows from the 2-digit-vs-1-digit code format fix).
  console.log('\n[5/6] TRUNCATE + INSERT SELECT from staging into ussc_districts...');
  await client.query('TRUNCATE TABLE ussc_districts');
  const upsertResult = await client.query(`
    INSERT INTO ussc_districts (
      district_code, circdist_code, district_name, short_name,
      state_code, state_name, circuit, cl_court_id, source_url
    )
    SELECT
      district_code, circdist_code, district_name, short_name,
      state_code, state_name, circuit,
      -- NULL out cl_court_id when target row is missing
      (SELECT c.id FROM cl_courts c WHERE c.id = s.cl_court_id),
      $1::text AS source_url
    FROM ussc_districts_stage s
    ON CONFLICT (district_code) DO UPDATE SET
      circdist_code = EXCLUDED.circdist_code,
      district_name = EXCLUDED.district_name,
      short_name = EXCLUDED.short_name,
      state_code = EXCLUDED.state_code,
      state_name = EXCLUDED.state_name,
      circuit = EXCLUDED.circuit,
      cl_court_id = EXCLUDED.cl_court_id,
      source_url = EXCLUDED.source_url
  `, [SOURCE_URL]);
  console.log(`  Upserted ${upsertResult.rowCount} rows.`);

  // 6/6  Indexes + cleanup staging
  console.log('\n[6/6] CREATE INDEXes + DROP staging + ANALYZE...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS ussc_districts_circdist
      ON ussc_districts (circdist_code) WHERE circdist_code IS NOT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS ussc_districts_state
      ON ussc_districts (state_code) WHERE state_code IS NOT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS ussc_districts_cl_court
      ON ussc_districts (cl_court_id) WHERE cl_court_id IS NOT NULL
  `);
  await client.query(`
    COMMENT ON TABLE ussc_districts IS
      'USSC DISTRICT + CIRCDIST code lookup (94 federal judicial districts). Source: USSC Public Release Codebook FY99-FY24 Appendix A (${SOURCE_URL}). Cadence: stable; update only when USSC renumbers districts. Ingester: scripts/ingest/build-ussc-districts.mjs.'
  `);
  await client.query('DROP TABLE IF EXISTS ussc_districts_stage');
  await client.query('ANALYZE ussc_districts');

  // Final verification
  const total = await client.query('SELECT COUNT(*) FROM ussc_districts');
  const withClCourt = await client.query('SELECT COUNT(*) FROM ussc_districts WHERE cl_court_id IS NOT NULL');
  const coveredCircuits = await client.query(`
    SELECT circuit, COUNT(*) n FROM ussc_districts GROUP BY circuit ORDER BY
    CASE circuit WHEN 'DC' THEN 0 ELSE CAST(REGEXP_REPLACE(circuit, '[a-z]+', '', 'g') AS INT) END
  `);
  console.log(`\n=== VERIFICATION ===`);
  console.log(`Total rows:           ${total.rows[0].count}`);
  console.log(`With cl_court_id:     ${withClCourt.rows[0].count} / ${total.rows[0].count}`);
  console.log(`\nCircuit breakdown:`);
  for (const r of coveredCircuits.rows) console.log(`  ${r.circuit.padEnd(5)} ${r.n}`);

  // Cross-check: every matview district code must exist in ussc_districts
  const matviewCoverage = await client.query(`
    SELECT COUNT(DISTINCT m.district) AS matview_distinct,
           COUNT(DISTINCT m.district) FILTER (WHERE d.district_code IS NOT NULL) AS matched
    FROM ussc_similar_cases_summary m
    LEFT JOIN ussc_districts d ON d.district_code = m.district
    WHERE m.district IS NOT NULL AND m.district != 'UNK'
  `);
  const mv = matviewCoverage.rows[0];
  console.log(`\nMatview cross-check (ussc_similar_cases_summary):`);
  console.log(`  distinct district codes:   ${mv.matview_distinct}`);
  console.log(`  matched in ussc_districts: ${mv.matched}`);
  if (Number(mv.matview_distinct) !== Number(mv.matched)) {
    console.log(`  WARNING: ${Number(mv.matview_distinct) - Number(mv.matched)} matview codes not in lookup.`);
    const unmatched = await client.query(`
      SELECT DISTINCT m.district, SUM(m.n_cases) AS total
      FROM ussc_similar_cases_summary m
      LEFT JOIN ussc_districts d ON d.district_code = m.district
      WHERE d.district_code IS NULL AND m.district IS NOT NULL AND m.district != 'UNK'
      GROUP BY m.district
      ORDER BY total DESC
    `);
    for (const r of unmatched.rows) console.log(`    ${String(r.district).padEnd(6)} ${r.total} cases`);
  }

  // Spot check fixture bucket — district=42 should resolve to W.D. Texas
  const fixture = await client.query(`
    SELECT district_code, short_name, state_code, circuit
    FROM ussc_districts WHERE district_code='42'
  `);
  console.log(`\nFixture spot-check (district_code='42'):`);
  console.log(` `, fixture.rows[0]);

  console.log(`\n=== DONE ===`);
} catch (err) {
  console.error('FAILED:', err);
  process.exitCode = 1;
} finally {
  await cleanup();
}
