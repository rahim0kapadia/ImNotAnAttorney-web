import { Client } from 'pg';
import { config } from 'dotenv';
config({ path: '.env.local' });
const u = new URL(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
u.port = '5432';
const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`SET statement_timeout = '2min'`);

const bySource = await c.query(`
  SELECT COALESCE(sources, ARRAY[]::text[]) AS src,
         COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE npi_employment_history IS NOT NULL)::int AS with_npi,
         COUNT(*) FILTER (WHERE agency IS NOT NULL)::int AS with_agency
  FROM officer_external_intel
  WHERE state = 'GA'
  GROUP BY sources
  ORDER BY n DESC
`);
console.log('GA by sources:');
console.log(JSON.stringify(bySource.rows, null, 2));

const sample = await c.query(`
  SELECT officer_name, officer_name_normalized, agency, sources, brady_status, decertified,
         complaint_count, use_of_force_count, npi_employment_history IS NOT NULL AS has_npi
  FROM officer_external_intel
  WHERE state = 'GA'
  ORDER BY random()
  LIMIT 10
`);
console.log('\nGA random 10:');
console.log(JSON.stringify(sample.rows, null, 2));

// Compare to CA
const caBySource = await c.query(`
  SELECT COALESCE(sources, ARRAY[]::text[]) AS src, COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE npi_employment_history IS NOT NULL)::int AS with_npi
  FROM officer_external_intel
  WHERE state = 'CA'
  GROUP BY sources
  ORDER BY n DESC
  LIMIT 5
`);
console.log('\nCA by sources (top 5):');
console.log(JSON.stringify(caBySource.rows, null, 2));

await c.end();
