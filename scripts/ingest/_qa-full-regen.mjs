import fs from 'node:fs';
const envTxt = fs.readFileSync('.env.local','utf-8');
for(const l of envTxt.split(/\r?\n/)){const p=l.split('=');if(p.length<2)continue;const k=p[0];if(!/^[A-Z_]+$/.test(k))continue;if(!process.env[k])process.env[k]=p.slice(1).join('=');}
const caseId = '2f714088-8dee-422e-b5dc-0c601af7e134';
const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}/functions/v1/generate-report`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log(`POST ${url}`);
console.log(`caseId: ${caseId}`);
console.log(`started: ${new Date().toISOString()}`);
const T0 = Date.now();
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ caseId, force: true, tier: 'intelligence-brief', phase: 'B' }),
});
const body = await res.text();
console.log(`finished: ${new Date().toISOString()} | elapsed: ${((Date.now()-T0)/1000/60).toFixed(1)} min`);
console.log(`HTTP ${res.status}`);
console.log(body.slice(0, 1000));
