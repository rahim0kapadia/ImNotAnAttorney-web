#!/usr/bin/env node
// Register 6 /api/cron/statutes-refresh-fl/<chapter> endpoints on cron-job.org.
// Staggered Monday 16:00/16:10/16:20/16:30/16:40/16:50 UTC — runs after
// dpic-sync (13:00) and statutes-refresh-us (15:00) with 10min spacing so
// concurrent load on FL Online Sunshine is bounded.
//
// Follows scripts/register-statutes-refresh-us-cron.mjs pattern.

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
    val = val.replace(/[\r\n]+$/, '');
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

// Staggered 10min apart. ch316 is the largest (282 sections, ~60-90s run);
// placed first so if it times out, later chapters still run.
const CHAPTERS = [
  { chapter: '316', hour: 16, minute: 0,  desc: 'Traffic / DUI (282 sections)' },
  { chapter: '775', hour: 16, minute: 10, desc: 'Penalties (55 sections)' },
  { chapter: '784', hour: 16, minute: 20, desc: 'Assault / battery (28 sections)' },
  { chapter: '810', hour: 16, minute: 30, desc: 'Burglary (21 sections)' },
  { chapter: '812', hour: 16, minute: 40, desc: 'Theft / robbery (44 sections)' },
  { chapter: '893', hour: 16, minute: 50, desc: 'Drug abuse prevention (40 sections)' },
];

const listResp = await fetch('https://api.cron-job.org/jobs', {
  headers: { Authorization: `Bearer ${CRONJOB_API_KEY}` },
});
if (!listResp.ok) {
  // W8 fix from 2026-04-24 code review: fail closed on list-jobs failure.
  // Otherwise existing=[] and the loop below creates 6 duplicate jobs that
  // hit the same endpoint concurrently, defeating the 10-min stagger.
  const body = await listResp.text();
  console.error(`ERROR: list-jobs HTTP ${listResp.status}: ${body.slice(0, 300)}`);
  process.exit(1);
}
const listData = await listResp.json();
const existing = listData.jobs || [];

const summary = [];

for (const c of CHAPTERS) {
  const url = `${BASE_URL}/api/cron/statutes-refresh-fl/${c.chapter}`;
  const prior = existing.find((j) => j.url === url);
  if (prior) {
    summary.push(`ch${c.chapter}: already registered jobId=${prior.jobId}`);
    continue;
  }
  const payload = {
    job: {
      url,
      title: `ImNotAnAttorney: statutes-refresh-fl-${c.chapter}`,
      enabled: true,
      saveResponses: true,
      schedule: {
        timezone: 'UTC',
        mdays: [-1],
        wdays: [1], // Monday
        months: [-1],
        hours: [c.hour],
        minutes: [c.minute],
      },
      extendedData: {
        headers: {
          Authorization: `Bearer ${CRON_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
      requestMethod: 0,
      requestTimeout: 300,
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
  try { data = JSON.parse(text); } catch { data = null; }
  if (resp.ok && data && data.jobId) {
    summary.push(`ch${c.chapter}: created jobId=${data.jobId} @ Mon ${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')} UTC — ${c.desc}`);
  } else {
    summary.push(`ch${c.chapter}: FAILED — ${text.slice(0, 200)}`);
  }
}

console.log('=== FL refresh cron registration ===');
for (const s of summary) console.log('  ' + s);
