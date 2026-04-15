#!/usr/bin/env node
// Verify Task 9 Step 3: cron-job.org registration for check-in-prompt.
// Usage: node scripts/verify-checkin-cron.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const env = {};
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}
const API_KEY = loadEnv().CRONJOB_API_KEY;
if (!API_KEY) {
  console.error("CRONJOB_API_KEY missing from .env.local");
  process.exit(1);
}

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
