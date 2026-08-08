// Probe: inspect police_stops + acs_county_demographics schema for TICKET-4 matview design
// Pattern: cl-bulk-data-defensive #20 (verify schema before encoding)
import { query, end } from "./lib/db.mjs";

async function main() {
  console.log("=== police_stops columns ===");
  const psCols = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='police_stops'
    ORDER BY ordinal_position
  `);
  console.table(psCols);

  // Tier verified: XL (16GB RAM, ceiling 1024MB) per work-mem-log.js CHECKED 2026-05-03
  await query(`SET statement_timeout = '15min'`);
  await query(`SET work_mem = '512MB'`);

  console.log("=== pg_class size estimate ===");
  const sizeEst = await query(`
    SELECT
      reltuples::bigint AS est_rows,
      pg_size_pretty(pg_total_relation_size('police_stops')) AS total_size
    FROM pg_class
    WHERE relname='police_stops'
  `);
  console.log(sizeEst[0]);

  console.log("=== police_stops sample ===");
  const psSample = await query(`SELECT * FROM police_stops LIMIT 3`);
  console.log(JSON.stringify(psSample, null, 2));

  console.log("=== indexes on police_stops ===");
  const idx = await query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename='police_stops'
  `);
  console.table(idx);

  console.log("=== distinct subject_race (1% TABLESAMPLE) ===");
  const races = await query(`
    SELECT subject_race, COUNT(*)::bigint AS n
    FROM police_stops TABLESAMPLE SYSTEM (1)
    WHERE subject_race IS NOT NULL
    GROUP BY subject_race
    ORDER BY n DESC
  `);
  console.table(races);

  console.log("=== distinct state_code (1% TABLESAMPLE) ===");
  const states = await query(`
    SELECT state_code, COUNT(*)::bigint AS n
    FROM police_stops TABLESAMPLE SYSTEM (1)
    GROUP BY state_code
    ORDER BY n DESC
    LIMIT 60
  `);
  console.table(states);

  console.log("=== sample (state, county_name) (1% TABLESAMPLE, top 30) ===");
  const counties = await query(`
    SELECT state_code, county_name, COUNT(*)::bigint AS n
    FROM police_stops TABLESAMPLE SYSTEM (1)
    WHERE county_name IS NOT NULL
    GROUP BY state_code, county_name
    ORDER BY n DESC
    LIMIT 30
  `);
  console.table(counties);

  console.log("=== stop_date range (1% sample) ===");
  const dr = await query(`
    SELECT MIN(stop_date) AS min_d, MAX(stop_date) AS max_d
    FROM police_stops TABLESAMPLE SYSTEM (1)
    WHERE stop_date IS NOT NULL
  `);
  console.log(dr[0]);

  console.log("=== acs_county_demographics columns ===");
  const acsCols = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='acs_county_demographics'
    ORDER BY ordinal_position
  `);
  console.table(acsCols);

  console.log("=== acs_county_demographics rowcount ===");
  const acsCount = await query(`SELECT COUNT(*)::bigint AS n FROM acs_county_demographics`);
  console.log(acsCount[0]);

  console.log("=== acs_county_demographics sample ===");
  const acsSample = await query(`SELECT * FROM acs_county_demographics LIMIT 2`);
  console.log(JSON.stringify(acsSample, null, 2));

  await end();
}
main().catch((e) => { console.error(e); process.exit(1); });
