#!/usr/bin/env node
// Register the /api/cron/ao-d3-sync endpoint on cron-job.org.
// Runs 13:00 UTC on the 7th of Jan / Apr / Jul / Oct — one week after each
// quarter-end, giving the AO time to publish the new STFJ D-3 XLSX.
// Follows the pattern of scripts/register-dpic-sync-cron.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const CRONJOB_API_KEY = env.CRONJOB_API_KEY;
const CRON_AUTH_TOKEN = env.CRON_AUTH_TOKEN;
if (!CRONJOB_API_KEY || !CRON_AUTH_TOKEN) {
  console.error('ERROR: CRONJOB_API_KEY and CRON_AUTH_TOKEN required in .env.local');
  process.exit(1);
}

const BASE_URL = env.NEXT_PUBLIC_SITE_URL || 'https://imnotanattorney.com';
const URL = `${BASE_URL}/api/cron/ao-d3-sync`;

const listResp = await fetch('https://api.cron-job.org/jobs', {
  headers: { Authorization: `Bearer ${CRONJOB_API_KEY}` },
});
const listData = await listResp.json();
const existing = (listData.jobs || []).find((j) => j.url === URL);
if (existing) {
  console.log('Already registered:');
  console.log('  jobId:', existing.jobId);
  console.log('  url:', existing.url);
  console.log('  enabled:', existing.enabled);
  console.log('  months:', JSON.stringify(existing.schedule?.months));
  console.log('  mdays:', JSON.stringify(existing.schedule?.mdays));
  console.log('  hours:', JSON.stringify(existing.schedule?.hours));
  console.log('  timezone:', existing.schedule?.timezone);
  process.exit(0);
}

const payload = {
  job: {
    url: URL,
    title: 'ImNotAnAttorney: ao-d3-sync',
    enabled: true,
    saveResponses: true,
    schedule: {
      timezone: 'UTC',
      mdays: [7],                 // 7th of selected months
      wdays: [-1],
      months: [1, 4, 7, 10],       // Jan / Apr / Jul / Oct (week after each quarter-end)
      hours: [13],
      minutes: [0],
    },
    extendedData: {
      headers: {
        Authorization: `Bearer ${CRON_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
    requestMethod: 0,
    requestTimeout: 120,
  },
};

const resp = await fetch('https://api.cron-job.org/jobs', {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${CRONJOB_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
const text = await resp.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error('Invalid JSON response:', text.slice(0, 300));
  process.exit(1);
}
if (resp.ok && data.jobId) {
  console.log('OK created:');
  console.log('  jobId:', data.jobId);
  console.log('  url:', URL);
  console.log('  schedule: 7th of Jan/Apr/Jul/Oct at 13:00 UTC');
} else {
  console.error('FAILED:', JSON.stringify(data));
  process.exit(1);
}
