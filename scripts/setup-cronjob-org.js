/**
 * Setup cron-job.org jobs for ImNotAnAttorney.
 * Run with: node scripts/setup-cronjob-org.js
 *
 * Reads secrets from .env.local (same pattern as e2e-test.js).
 * Requires CRONJOB_API_KEY and CRON_AUTH_TOKEN to be set in .env.local.
 *
 * Saves created job IDs to scripts/cronjob-org-ids.json for future reference.
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

async function getExistingJobs(apiKey) {
  const resp = await fetch('https://api.cron-job.org/jobs', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  if (!resp.ok) throw new Error(`Failed to fetch jobs: ${resp.status}`);
  const data = await resp.json();
  const existing = new Set();
  for (const job of (data.jobs || [])) {
    if (job.url) existing.add(job.url);
    if (job.title) existing.add(job.title);
  }
  return existing;
}

// Read env vars from .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found. Copy .env.example and fill in values.');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
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
  console.error('ERROR: CRONJOB_API_KEY and CRON_AUTH_TOKEN must be set in .env.local');
  process.exit(1);
}

const BASE_URL = env.NEXT_PUBLIC_SITE_URL || 'https://imnotanattorney.com';
const CRON_URL = `${BASE_URL}/api/cron`;

const CRON_JOBS = [
  {
    name: 'drip',
    schedule: { minutes: [0], hours: [14] },
    timeout: 300,
    description: 'Daily drip orchestrator — 19 tasks (emails, alerts, cleanup, reconciliation)',
  },
  {
    name: 'engine',
    schedule: {
      minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
      hours: [-1],
    },
    timeout: 30,
    description: 'Dispatch engine worker via GitHub Actions (discovery-tier processing)',
  },
  {
    name: 'generate-backup',
    schedule: {
      minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
      hours: [-1],
    },
    timeout: 30,
    description: 'Dispatch backup report generator (stuck Case Decoder recovery)',
  },
  {
    name: 'batch-poll',
    schedule: {
      minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
      hours: [-1],
    },
    timeout: 30,
    description: 'Poll Anthropic Batch API results — processes completed CD + IB Phase A batches',
  },
];

async function createCronJob(job) {
  const url = `${CRON_URL}/${job.name}`;

  const payload = {
    job: {
      url: url,
      title: `ImNotAnAttorney: ${job.name}`,
      enabled: true,
      saveResponses: true,
      schedule: {
        timezone: 'UTC',
        mdays: [-1],
        wdays: [-1],
        months: [-1],
        hours: job.schedule.hours,
        minutes: job.schedule.minutes,
      },
      extendedData: {
        headers: {
          'Authorization': `Bearer ${CRON_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
      requestMethod: 0, // GET
      requestTimeout: job.timeout,
    },
  };

  try {
    const response = await fetch('https://api.cron-job.org/jobs', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CRONJOB_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`Failed: ${job.name} - Invalid response: ${text.substring(0, 200)}`);
      return { success: false, name: job.name, error: text };
    }

    if (response.ok && data.jobId) {
      console.log(`Created: ${job.name} (ID: ${data.jobId})`);
      console.log(`  URL: ${url}`);
      console.log(`  Description: ${job.description}`);
      console.log(`  Timeout: ${job.timeout}s`);
      return { success: true, name: job.name, jobId: data.jobId };
    } else {
      console.error(`Failed: ${job.name} - ${JSON.stringify(data)}`);
      return { success: false, name: job.name, error: data };
    }
  } catch (error) {
    console.error(`Error: ${job.name} - ${error.message}`);
    return { success: false, name: job.name, error: error.message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Setting up cron-job.org for ImNotAnAttorney');
  if (DRY_RUN) console.log('*** DRY RUN — no API calls will be made ***');
  console.log('='.repeat(50));

  let existingJobs = new Set();
  if (!DRY_RUN) {
    console.log('Fetching existing jobs...');
    existingJobs = await getExistingJobs(CRONJOB_API_KEY);
    console.log(`Found ${existingJobs.size} existing job identifiers`);
    console.log('');
  }

  const results = [];
  let skipped = 0;

  for (let i = 0; i < CRON_JOBS.length; i++) {
    const job = CRON_JOBS[i];
    const jobUrl = `${CRON_URL}/${job.name}`;
    const jobTitle = `ImNotAnAttorney: ${job.name}`;

    if (DRY_RUN) {
      console.log(`WOULD CREATE: ${job.name}`);
      continue;
    }

    if (existingJobs.has(jobUrl) || existingJobs.has(jobTitle)) {
      console.log(`SKIP: ${job.name} already exists`);
      skipped++;
      continue;
    }

    const result = await createCronJob(job);
    results.push(result);

    // cron-job.org rate limit: 5 requests/minute — wait 13s between calls
    if (i < CRON_JOBS.length - 1) {
      console.log('  (waiting 13s for rate limit...)');
      await sleep(13000);
    }
  }

  // Save job IDs to file for future reference
  if (!DRY_RUN && results.length > 0) {
    const idsPath = path.join(__dirname, 'cronjob-org-ids.json');
    const ids = {};
    for (const r of results) {
      if (r.success) {
        ids[r.name] = r.jobId;
      }
    }
    fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2) + '\n');
    console.log(`\nJob IDs saved to ${idsPath}`);
  }

  console.log('='.repeat(50));
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Done. ${succeeded} created, ${skipped} skipped, ${failed} failed.`);
}

main().catch(console.error);
