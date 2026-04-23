import fs from 'node:fs';
import pg from 'pg';
const envTxt = fs.readFileSync('.env.local','utf-8');
for(const l of envTxt.split(/\r?\n/)){const p=l.split('=');if(p.length<2)continue;const k=p[0];if(!/^[A-Z_]+$/.test(k))continue;if(!process.env[k])process.env[k]=p.slice(1).join('=');}
const u = new URL(process.env.SUPABASE_DB_URL); u.port='5432';
const c = new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:false}});
await c.connect();
const caseId = '2f714088-8dee-422e-b5dc-0c601af7e134';
const { rows } = await c.query(`SELECT length(report_html) len, report_html, updated_at FROM cases WHERE id = $1`, [caseId]);
const html = rows[0].report_html || '';
console.log(`report len: ${rows[0].len} | updated: ${rows[0].updated_at}`);
const checks = ['Rising Precedents','Rising Precedents in Your Charge Type','Key Language From These Cases','How Your Circuit Handles','Federal Sentencing Distribution','About Your Judge','JUSTFAIR'];
console.log(`\nSubstring checks:`);
for (const s of checks) console.log(`  ${html.includes(s) ? 'YES' : 'NO '} ${s}`);
await c.end();
