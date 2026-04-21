/**
 * marshall-covid-prisons-ingest.mjs
 *
 * Loads the Marshall Project's COVID-19 prison-system dataset into Supabase.
 * Previous session's attempt (2026-04-20) failed because the table wasn't
 * created before COPY — retry lives here with explicit schema + TRUNCATE.
 *
 * Data source: The Marshall Project, "A State-by-State Look at Coronavirus in
 * Prisons" (mirror at data/marshall-prison-popups.csv). Snapshot covers
 * 2020-2021 COVID case + vaccination tracking per state DOC.
 *
 * All columns are TEXT (the CSV has integer columns with blank-string NULLs
 * and MM/DD/YYYY dates). Matches INAA all-TEXT convention for supplementary
 * reference datasets (see cl_financial_disclosures). Analysis views can cast
 * as needed.
 *
 * Uses pg-bulk-defaults.mjs createBulkClient per cl-bulk-data-defensive.md
 * gotcha #17. Does NOT fetch — loads from disk — so rule #19 doesn't apply.
 *
 * Usage:
 *   node scripts/marshall-covid-prisons-ingest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createBulkClient, bulkCopyCsv } from './lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') });

const CSV_PATH = path.resolve(
  PROJECT_ROOT,
  '..',
  'ImNotAnAttorney',
  'data',
  'marshall-prison-popups.csv',
);

const TABLE = 'marshall_covid_prisons';

const COLUMNS = [
  'name',
  'abbreviation',
  'staff_tests',
  'staff_tests_with_multiples',
  'total_staff_cases',
  'staff_recovered',
  'total_staff_deaths',
  'staff_partial_dose',
  'staff_full_dose',
  'prisoner_tests',
  'prisoner_tests_with_multiples',
  'total_prisoner_cases',
  'prisoners_recovered',
  'total_prisoner_deaths',
  'prisoners_partial_dose',
  'prisoners_full_dose',
  'as_of_date',
  'notes',
];

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }

  const csvBytes = fs.statSync(CSV_PATH).size;
  console.log(`source: ${CSV_PATH} (${(csvBytes / 1024).toFixed(1)} KB)`);

  const { client, cleanup } = await createBulkClient({
    workMemMB: 256,
    maintWorkMemMB: 1024,
    statementTimeout: '10min',
  });

  try {
    console.log(`(re)creating table ${TABLE}...`);
    // Previous session created a narrower stub (8 cols, typed, empty). Drop and
    // recreate with the full 18-column CSV schema (all-TEXT per INAA supplementary-
    // data convention; analysis views cast as needed).
    await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await client.query(`
      CREATE TABLE ${TABLE} (
        name                          TEXT,
        abbreviation                  TEXT,
        staff_tests                   TEXT,
        staff_tests_with_multiples    TEXT,
        total_staff_cases             TEXT,
        staff_recovered               TEXT,
        total_staff_deaths            TEXT,
        staff_partial_dose            TEXT,
        staff_full_dose               TEXT,
        prisoner_tests                TEXT,
        prisoner_tests_with_multiples TEXT,
        total_prisoner_cases          TEXT,
        prisoners_recovered           TEXT,
        total_prisoner_deaths         TEXT,
        prisoners_partial_dose        TEXT,
        prisoners_full_dose           TEXT,
        as_of_date                    TEXT,
        notes                         TEXT
      )
    `);

    console.log(`loading from ${path.basename(CSV_PATH)}...`);

    const result = await bulkCopyCsv(client, TABLE, COLUMNS, CSV_PATH);
    console.log(`loaded ${result.rowCount} rows in ${(result.durationMs / 1000).toFixed(1)}s`);

    const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
    console.log(`verified row count: ${countRes.rows[0].n}`);

    // Cast as_of_date (MM/DD/YYYY TEXT) to DATE for a real date range; lexical
    // sort on TEXT would put '01/...' before '12/...' regardless of year.
    const stateSpreadRes = await client.query(`
      SELECT COUNT(DISTINCT abbreviation)::int AS distinct_states,
             MIN(TO_DATE(as_of_date, 'MM/DD/YYYY'))::text AS earliest,
             MAX(TO_DATE(as_of_date, 'MM/DD/YYYY'))::text AS latest
      FROM ${TABLE}
      WHERE as_of_date ~ '^\\d{2}/\\d{2}/\\d{4}$'
    `);
    console.log('coverage:', stateSpreadRes.rows[0]);

    const sampleRes = await client.query(`
      SELECT name, abbreviation, as_of_date, total_prisoner_cases, total_prisoner_deaths
      FROM ${TABLE}
      WHERE abbreviation = 'FL'
      ORDER BY as_of_date
      LIMIT 3
    `);
    console.log('FL sample rows:', sampleRes.rows);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
