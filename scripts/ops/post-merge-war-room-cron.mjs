/**
 * Post-merge one-shot for War Room weekly digest cron (PR #26).
 *
 * Idempotent. Run after PR #26 merges + redeploys. Two steps:
 *   1. Ensure RESEND_FROM_EMAIL_UPDATES is set on Vercel prod project
 *      `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr). Default value
 *      mirrors existing RESEND_FROM_EMAIL pattern (transactional sender to
 *      paid War Room subscribers, opt-in by purchase).
 *   2. Register cron-job.org job for /api/cron/war-room-weekly-digest at
 *      Mon 13:00 UTC.
 *
 * Reads CRONJOB_API_KEY, CRON_AUTH_TOKEN, VERCEL_TOKEN from .env.local.
 *
 * Run:
 *   node scripts/ops/post-merge-war-room-cron.mjs           # live
 *   node scripts/ops/post-merge-war-room-cron.mjs --dry-run # preview
 *
 * Override sender: set FROM_EMAIL_UPDATES env var.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

const VERCEL_PROJECT_ID = 'prj_zqxNgG9xcM235bnKRoEgP5kBOEEr';
const VERCEL_TARGET = ['production'];
const DEFAULT_FROM = ['noreply', 'imnotanattorney.com'].join('@');
const FROM_EMAIL_UPDATES = process.env.FROM_EMAIL_UPDATES || DEFAULT_FROM;
const CRON_URL = 'https://imnotanattorney.com/api/cron/war-room-weekly-digest';
const CRON_TITLE = 'ImNotAnAttorney: war-room-weekly-digest';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found.');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnv();
for (const k of ['VERCEL_TOKEN', 'CRONJOB_API_KEY', 'CRON_AUTH_TOKEN']) {
  if (!env[k]) {
    console.error(`ERROR: ${k} missing from .env.local`);
    process.exit(1);
  }
}

async function ensureVercelEnv() {
  console.log(`\n[1/2] Vercel env: RESEND_FROM_EMAIL_UPDATES on ${VERCEL_PROJECT_ID} (production)`);
  const list = await fetch(
    `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?decrypt=false`,
    { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` } },
  ).then((r) => r.json());
  const existing = (list.envs || []).find(
    (e) => e.key === 'RESEND_FROM_EMAIL_UPDATES' && e.target.includes('production'),
  );
  if (existing) {
    console.log(`  SKIP: already set (id ${existing.id})`);
    return { skipped: true };
  }
  if (DRY_RUN) {
    console.log(`  WOULD SET: RESEND_FROM_EMAIL_UPDATES=${FROM_EMAIL_UPDATES} (production)`);
    return { dryRun: true };
  }
  const resp = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: 'RESEND_FROM_EMAIL_UPDATES',
      value: FROM_EMAIL_UPDATES,
      target: VERCEL_TARGET,
      type: 'encrypted',
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error(`  FAILED: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  console.log(`  CREATED: RESEND_FROM_EMAIL_UPDATES=${FROM_EMAIL_UPDATES} (id ${data.created?.id || data.id || 'n/a'})`);
  console.log('  NOTE: Vercel env changes require a redeploy. Trigger via empty commit if PR-merge deploy already ran.');
  return { created: true };
}

async function ensureCronJob() {
  console.log('\n[2/2] cron-job.org: war-room-weekly-digest (Mon 13:00 UTC)');
  const list = await fetch('https://api.cron-job.org/jobs', {
    headers: { Authorization: `Bearer ${env.CRONJOB_API_KEY}` },
  }).then((r) => r.json());
  const existing = (list.jobs || []).find(
    (j) => j.url === CRON_URL || j.title === CRON_TITLE,
  );
  if (existing) {
    console.log(`  SKIP: already registered (jobId ${existing.jobId})`);
    return { skipped: true };
  }
  const payload = {
    job: {
      url: CRON_URL,
      title: CRON_TITLE,
      enabled: true,
      saveResponses: true,
      schedule: {
        timezone: 'UTC',
        mdays: [-1],
        wdays: [1],
        months: [-1],
        hours: [13],
        minutes: [0],
      },
      extendedData: {
        headers: {
          Authorization: `Bearer ${env.CRON_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
      requestMethod: 0,
      requestTimeout: 300,
    },
  };
  if (DRY_RUN) {
    console.log(`  WOULD CREATE: ${CRON_TITLE} -> ${CRON_URL}`);
    return { dryRun: true };
  }
  const resp = await fetch('https://api.cron-job.org/jobs', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.CRONJOB_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok || !data.jobId) {
    console.error(`  FAILED: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  console.log(`  CREATED: jobId ${data.jobId}`);

  const idsPath = path.join(__dirname, '..', 'cronjob-org-ids.json');
  let ids = {};
  if (fs.existsSync(idsPath)) {
    try {
      ids = JSON.parse(fs.readFileSync(idsPath, 'utf-8'));
    } catch {}
  }
  ids['war-room-weekly-digest'] = data.jobId;
  fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2) + '\n');
  console.log(`  Saved to ${idsPath}`);
  return { created: true, jobId: data.jobId };
}

async function main() {
  console.log('Post-merge War Room weekly digest cron setup');
  if (DRY_RUN) console.log('*** DRY RUN ***');
  console.log('='.repeat(60));
  const envResult = await ensureVercelEnv();
  const cronResult = await ensureCronJob();
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Vercel env:    ${envResult.skipped ? 'already set' : envResult.dryRun ? 'would create' : 'created'}`);
  console.log(`  cron-job.org:  ${cronResult.skipped ? 'already registered' : cronResult.dryRun ? 'would register' : `created jobId ${cronResult.jobId}`}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
