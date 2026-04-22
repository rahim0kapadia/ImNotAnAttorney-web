/**
 * Flip NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true on Vercel production.
 *
 * Production project is `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr),
 * NOT `imnotanattorney-web` — per CLAUDE.md CRITICAL note. The VERCEL_PROJECT_ID
 * in .env.local currently points at the legacy imnotanattorney-web project;
 * this script hardcodes the production project id to avoid that trap.
 *
 * Steps:
 *   1. GET /v9/projects/{prod}/env — find existing NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED
 *   2. If exists + value=="true" + has "production" target → report already-on, exit 0
 *   3. If exists but value != "true" → PATCH to "true"
 *   4. If missing → POST create
 *   5. Print final state. Env changes require a rebuild to take effect — caller
 *      must git push an empty commit to master after this.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;
// Hardcoded production project id per CLAUDE.md — NOT the .env.local value.
const PRODUCTION_PROJECT_ID = 'prj_zqxNgG9xcM235bnKRoEgP5kBOEEr';
const KEY = 'NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED';
const TARGET_VALUE = 'true';

if (!TOKEN || !TEAM_ID) {
  console.error('Missing VERCEL_TOKEN or VERCEL_TEAM_ID in .env.local');
  process.exit(1);
}

const apiBase = `https://api.vercel.com`;
const qs = `teamId=${encodeURIComponent(TEAM_ID)}`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

async function listEnv() {
  const r = await fetch(`${apiBase}/v9/projects/${PRODUCTION_PROJECT_ID}/env?${qs}`, { headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`listEnv failed: ${r.status} ${t}`);
  }
  const body = await r.json();
  return body.envs || [];
}

async function patchEnv(envId, value) {
  const r = await fetch(`${apiBase}/v9/projects/${PRODUCTION_PROJECT_ID}/env/${envId}?${qs}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ value, target: ['production'] }),
  });
  if (!r.ok) throw new Error(`patchEnv failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function createEnv(value) {
  const r = await fetch(`${apiBase}/v10/projects/${PRODUCTION_PROJECT_ID}/env?${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key: KEY,
      value,
      type: 'plain', // NEXT_PUBLIC_* must be plain so client bundle sees it
      target: ['production'],
    }),
  });
  if (!r.ok) throw new Error(`createEnv failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function main() {
  console.log(`Looking for ${KEY} on project ${PRODUCTION_PROJECT_ID} (prod)`);
  const envs = await listEnv();
  const matches = envs.filter((e) => e.key === KEY);
  console.log(`Found ${matches.length} existing record(s) for ${KEY}`);

  if (matches.length === 0) {
    console.log(`  Creating new env var: ${KEY}=${TARGET_VALUE} (production)`);
    const res = await createEnv(TARGET_VALUE);
    console.log(`  Created: id=${res.id || 'unknown'} key=${res.key} target=${JSON.stringify(res.target)}`);
  } else {
    for (const m of matches) {
      const targets = m.target || [];
      console.log(`  Record id=${m.id} type=${m.type} targets=${JSON.stringify(targets)} value=${m.value === undefined ? '<encrypted>' : JSON.stringify(m.value)}`);
      if (!targets.includes('production')) {
        console.log(`  Skipping — not targeted at production`);
        continue;
      }
      if (m.value === TARGET_VALUE) {
        console.log(`  Already ${TARGET_VALUE} — no change needed`);
        continue;
      }
      console.log(`  Patching to ${TARGET_VALUE}`);
      const res = await patchEnv(m.id, TARGET_VALUE);
      console.log(`  Patched: id=${res.id} key=${res.key} value=${res.value}`);
    }
  }

  console.log('\nVerifying post-change state...');
  const after = await listEnv();
  const final = after.filter((e) => e.key === KEY);
  for (const m of final) {
    console.log(`  ${m.key}=${m.value ?? '<encrypted>'} target=${JSON.stringify(m.target)}`);
  }

  console.log('\nNEXT STEP: trigger a redeploy. Push an empty commit to master:');
  console.log('  git commit --allow-empty -m "chore(deploy): flip NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true"');
  console.log('  git push origin master');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
