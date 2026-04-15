#!/usr/bin/env node
// Verify Task 9 Step 3: cron-job.org registration for check-in-prompt.
// Usage: node scripts/verify-checkin-cron.mjs

const API_KEY = 'qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=';

const resp = await fetch('https://api.cron-job.org/jobs', {
  headers: { Authorization: `Bearer ${API_KEY}` },
});
const data = await resp.json();
const match = (data.jobs || []).find((j) => j.url && j.url.includes('check-in-prompt'));

if (match) {
  console.log('OK: job registered');
  console.log('  jobId:', match.jobId);
  console.log('  url:', match.url);
  console.log('  timezone:', match.schedule?.timezone);
  console.log('  hours:', JSON.stringify(match.schedule?.hours));
  console.log('  minutes:', JSON.stringify(match.schedule?.minutes));
  console.log('  enabled:', match.enabled);
} else {
  console.log('MISSING: no job found with check-in-prompt in URL');
  console.log('Total jobs:', (data.jobs || []).length);
}
