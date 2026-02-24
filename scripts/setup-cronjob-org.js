/**
 * Setup cron-job.org jobs for ImNotAnAttorney.
 * Run with: node scripts/setup-cronjob-org.js
 *
 * Reads secrets from .env.local (same pattern as e2e-test.js).
 * Requires CRONJOB_API_KEY and CRON_SECRET to be set in .env.local.
 */

const fs = require('fs');
const path = require('path');

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
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const CRONJOB_API_KEY = env.CRONJOB_API_KEY;
const CRON_SECRET = env.CRON_SECRET;

if (!CRONJOB_API_KEY || !CRON_SECRET) {
  console.error('ERROR: CRONJOB_API_KEY and CRON_SECRET must be set in .env.local');
  process.exit(1);
}

const BASE_URL = env.NEXT_PUBLIC_SITE_URL || 'https://imnotanattorney.com';
const CRON_URL = `${BASE_URL}/api/cron`;

const CRON_JOBS = [
  {
    name: 'drip',
    // Daily at 14:00 UTC = 9:00 AM EST
    schedule: { minutes: [0], hours: [14] },
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
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
      },
      requestMethod: 0, // GET
      requestTimeout: 300, // 5 minutes
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
      return { success: false, error: text };
    }

    if (response.ok && data.jobId) {
      console.log(`Created: ${job.name} (ID: ${data.jobId})`);
      console.log(`  URL: ${url}`);
      console.log(`  Schedule: Daily at 14:00 UTC (9:00 AM EST)`);
      return { success: true, jobId: data.jobId };
    } else {
      console.error(`Failed: ${job.name} - ${JSON.stringify(data)}`);
      return { success: false, error: data };
    }
  } catch (error) {
    console.error(`Error: ${job.name} - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Setting up cron-job.org for ImNotAnAttorney');
  console.log('='.repeat(50));

  for (const job of CRON_JOBS) {
    await createCronJob(job);
  }

  console.log('='.repeat(50));
  console.log('Done.');
}

main().catch(console.error);
