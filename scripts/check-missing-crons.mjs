#!/usr/bin/env node
// Check cron-job.org for partner-cleanup and court-reminders registrations.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const env = {};
  const p = path.join(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}
const env = loadEnv();
const apiKey = env.CRONJOB_API_KEY;
const resp = await fetch("https://api.cron-job.org/jobs", {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const data = await resp.json();
const jobs = data.jobs || [];
const targets = [
  "partner-cleanup",
  "court-reminders",
];
for (const t of targets) {
  const match = jobs.find((j) => j.url && j.url.includes(`/api/cron/${t}`));
  if (match) {
    console.log(`${t}: REGISTERED id=${match.jobId} enabled=${match.enabled} hours=${JSON.stringify(match.schedule?.hours)} minutes=${JSON.stringify(match.schedule?.minutes)} tz=${match.schedule?.timezone}`);
  } else {
    console.log(`${t}: MISSING`);
  }
}
