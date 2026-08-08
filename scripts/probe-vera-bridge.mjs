// Probe: confirm vera_incarceration_county can bridge state_code -> state_fips -> county_fips
import { query, end } from "./lib/db.mjs";

async function main() {
  console.log("=== vera_incarceration_county columns ===");
  const c = await query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vera_incarceration_county'
    ORDER BY ordinal_position
  `);
  console.table(c);

  console.log("=== sample vera bridge rows ===");
  const s = await query(`
    SELECT DISTINCT state_code, state_fips, county_fips, county_name
    FROM vera_incarceration_county
    WHERE county_fips IS NOT NULL
    ORDER BY state_code, county_fips LIMIT 20
  `);
  console.table(s);

  console.log("=== distinct (state_code, county_name) rows in vera ===");
  const d = await query(`
    SELECT COUNT(DISTINCT (state_code, county_name)) AS distinct_pairs,
           COUNT(DISTINCT state_code) AS states
    FROM vera_incarceration_county
    WHERE county_fips IS NOT NULL
  `);
  console.log(d[0]);

  console.log("=== vera state_code coverage vs police_stops states ===");
  const ovl = await query(`
    SELECT v.state_code, COUNT(DISTINCT v.county_fips) AS vera_counties
    FROM vera_incarceration_county v
    WHERE v.county_fips IS NOT NULL
    GROUP BY v.state_code
    ORDER BY v.state_code
  `);
  console.table(ovl);

  console.log("=== ACS dataset values (vintage check) ===");
  const dv = await query(`
    SELECT vintage, dataset, COUNT(*)::int AS n
    FROM acs_county_demographics
    GROUP BY vintage, dataset
    ORDER BY vintage DESC
  `);
  console.table(dv);

  // Confirm the join: vera (state_code, county_name) -> vera county_fips -> ACS (state_fips, county_fips)
  console.log("=== sanity: ACS row joinable via vera bridge ===");
  const j = await query(`
    SELECT v.state_code, v.county_name, v.county_fips, a.pop_white_nh, a.pop_black_nh
    FROM vera_incarceration_county v
    LEFT JOIN acs_county_demographics a
      ON a.state_fips = v.state_fips AND a.county_fips = v.county_fips
    WHERE v.state_code IN ('CA','TX','NC','FL') AND v.county_fips IS NOT NULL
    GROUP BY v.state_code, v.county_name, v.county_fips, a.pop_white_nh, a.pop_black_nh
    ORDER BY v.state_code, v.county_name
    LIMIT 8
  `);
  console.table(j);

  await end();
}
main().catch((e) => { console.error(e); process.exit(1); });
