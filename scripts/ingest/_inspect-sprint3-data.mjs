import fs from 'node:fs';
import pg from 'pg';
const envTxt = fs.readFileSync('.env.local','utf-8');
for(const l of envTxt.split(/\r?\n/)){const p=l.split('=');if(p.length<2)continue;const k=p[0];if(!/^[A-Z_]+$/.test(k))continue;if(!process.env[k])process.env[k]=p.slice(1).join('=');}
const u = new URL(process.env.SUPABASE_DB_URL); u.port='5432';
const c = new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:false}});
await c.connect();
for (const t of ['judge_motion_outcome_rates','cl_citation_map','pji_instructions','pji_sections','pji_books','cl_opinions_meta']) {
  try {
    const { rows: cols } = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position LIMIT 30`, [t]);
    console.log(`\n### ${t} (${cols.length} cols)`);
    for (const col of cols) console.log(`  ${col.column_name} ${col.data_type}`);
    const { rows: sample } = await c.query(`SELECT * FROM ${t} LIMIT 1`);
    if (sample[0]) console.log(`  sample:`, JSON.stringify(sample[0]).slice(0, 500));
  } catch (e) { console.log(`  ${t}: ERROR ${e.message}`); }
}
await c.end();
