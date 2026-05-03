// Probe: look for state FIPS lookup + check overlap county_name shapes
import { query, end } from "./lib/db.mjs";

async function main() {
  console.log("=== tables matching 'fips' or 'state' ===");
  const t = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%fips%' OR table_name ILIKE '%state%')
    ORDER BY table_name
  `);
  console.table(t);

  console.log("=== tables with county_fips or county_name col ===");
  const c = await query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND (column_name ILIKE '%county_fips%' OR column_name='state_fips' OR column_name='state_code')
    ORDER BY table_name, column_name
  `);
  console.table(c);

  console.log("=== ACS county_name sample (first 12) ===");
  const acs = await query(`
    SELECT state_fips, state_name, county_name FROM acs_county_demographics
    ORDER BY state_fips, county_fips LIMIT 12
  `);
  console.table(acs);

  console.log("=== ACS county_name shape: how many end in 'County'/'Parish'/'Borough' ===");
  const shape = await query(`
    SELECT
      SUM(CASE WHEN county_name ILIKE '% County' THEN 1 ELSE 0 END) AS ends_county,
      SUM(CASE WHEN county_name ILIKE '% Parish' THEN 1 ELSE 0 END) AS ends_parish,
      SUM(CASE WHEN county_name ILIKE '% Borough' THEN 1 ELSE 0 END) AS ends_borough,
      SUM(CASE WHEN county_name ILIKE '% Census Area' THEN 1 ELSE 0 END) AS ends_census_area,
      SUM(CASE WHEN county_name ILIKE '% Municipality' THEN 1 ELSE 0 END) AS ends_municipality,
      SUM(CASE WHEN county_name ILIKE '% city' THEN 1 ELSE 0 END) AS ends_city,
      COUNT(*) AS total
    FROM acs_county_demographics
  `);
  console.log(shape[0]);

  await end();
}
main().catch((e) => { console.error(e); process.exit(1); });
