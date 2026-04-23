import fs from 'node:fs';
import pg from 'pg';
const envTxt = fs.readFileSync('.env.local','utf-8');
for(const l of envTxt.split(/\r?\n/)){const p=l.split('=');if(p.length<2)continue;const k=p[0];if(!/^[A-Z_]+$/.test(k))continue;if(!process.env[k])process.env[k]=p.slice(1).join('=');}
const u = new URL(process.env.SUPABASE_DB_URL); u.port='5432';
const c = new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:false}});
await c.connect();

// 1) Did any of the 10 shown rising cases have quotes?
const risingClusterIds = [3185469,3171724,3216494,4503089,9231323,4410372,4239978,3216497,3122395,3174030];
const { rows: q } = await c.query(`SELECT cluster_id, case_name, rank FROM authority_quotes_criminal WHERE cluster_id = ANY($1::bigint[]) ORDER BY cluster_id, rank`, [risingClusterIds]);
console.log(`quotes matching shown rising cases: ${q.length}`);
for (const r of q.slice(0,20)) console.log(`  cluster=${r.cluster_id} rank=${r.rank} case=${r.case_name?.slice(0,40)}`);

// 2) Charge-filtered rising for 'dui'
const { rows: cfr } = await c.query(`
  SELECT ta.charge_type, ta.rank, ta.cluster_id, ta.case_name
  FROM charge_type_top_authorities ta
  WHERE ta.charge_type ILIKE 'dui%'
  ORDER BY ta.charge_type, ta.rank
  LIMIT 30
`);
console.log(`\ncharge_type_top_authorities for 'dui%': ${cfr.length} rows`);
for (const r of cfr.slice(0,10)) console.log(`  ${r.charge_type} rank=${r.rank} case=${r.case_name?.slice(0,40)}`);

// 3) Intersect with rising_flag=true
const ids = cfr.map(r => r.cluster_id);
if (ids.length) {
  const { rows: rf } = await c.query(`
    SELECT cluster_id, case_name, jurisdiction, rising_flag, velocity
    FROM citation_velocity_criminal WHERE cluster_id = ANY($1::bigint[]) AND rising_flag = true
  `, [ids]);
  console.log(`\nOf those, ${rf.length} are rising_flag=true`);
  for (const r of rf) console.log(`  ${r.case_name?.slice(0,40)} vel=${r.velocity} juris=${r.jurisdiction}`);
}

// 4) Circuit motion rates for "5" (Texas = 5th circuit)
const { rows: cmr } = await c.query(`
  SELECT circuit, motion_type, charge_type, filed_count, grant_rate, deviation_from_baseline
  FROM motion_outcome_rates_by_circuit
  WHERE circuit = '5' AND charge_type = '(all)'
  ORDER BY filed_count DESC LIMIT 10
`);
console.log(`\ncircuit='5' charge_type='(all)' rows: ${cmr.length}`);
for (const r of cmr) console.log(`  ${r.motion_type} filed=${r.filed_count} grant=${r.grant_rate} dev=${r.deviation_from_baseline}`);

// 5) Test ILIKE encoding for charge type
const { rows: testIlike } = await c.query(`SELECT COUNT(*) FROM charge_type_top_authorities WHERE charge_type ILIKE $1`, ['dui*']);
console.log(`\nILIKE 'dui*' count: ${testIlike[0].count}`);
const { rows: testIlike2 } = await c.query(`SELECT COUNT(*) FROM charge_type_top_authorities WHERE charge_type ILIKE $1`, ['dui%']);
console.log(`ILIKE 'dui%' count: ${testIlike2[0].count}`);

// 6) Test the URL-style ILIKE for PostgREST
// PostgREST ilike uses * as wildcard, translated to LIKE... but does it work?
// Let's try via HTTP
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${url}/rest/v1/charge_type_top_authorities?charge_type=ilike.dui*&limit=5&select=charge_type,rank,cluster_id`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
});
console.log(`\nPostgREST ilike.dui*: HTTP ${res.status}`);
const body = await res.json();
console.log(JSON.stringify(body).slice(0, 500));
await c.end();
