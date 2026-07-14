#!/usr/bin/env node
// Register the /api/cron/refresh-judge-disposition endpoint on cron-job.org.
//
// Schedule: weekly Monday 18:00 UTC (~14:00 ET / 11:00 PT) — staggered AFTER
// statutes-refresh-us (15:00) + statutes-refresh-fl (16:00 batch) to avoid
// load-bunching.
//
// Refresh budget: ~5-10min on XL tier (31M-row pass via REFRESH MATERIALIZED
// VIEW CONCURRENTLY).  Vercel maxDuration on the route = 800s.  cron-job.org
// requestTimeout = 900s (15min) to give a 50% headroom over the worst-case
// observed refresh time.
//
// Follows scripts/register-statutes-refresh-us-cron.mjs pattern.
//
// TICKET-2 (2026-05-03).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("ERROR: .env.local not found");
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    val = val.replace(/[\r\n]+$/, "");
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const CRONJOB_API_KEY = env.CRONJOB_API_KEY;
const CRON_AUTH_TOKEN = env.CRON_AUTH_TOKEN;
if (!CRONJOB_API_KEY || !CRON_AUTH_TOKEN) {
  console.error("ERROR: CRONJOB_API_KEY and CRON_AUTH_TOKEN required in .env.local");
  process.exit(1);
}

const BASE_URL = env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
const URL = `${BASE_URL}/api/cron/refresh-judge-disposition`;

const listResp = await fetch("https://api.cron-job.org/jobs", {
  headers: { Authorization: `Bearer ${CRONJOB_API_KEY}` },
});
const listData = await listResp.json();
const existing = (listData.jobs || []).find((j) => j.url === URL);
if (existing) {
  console.log("Already registered:");
  console.log("  jobId:", existing.jobId);
  console.log("  url:", existing.url);
  console.log("  enabled:", existing.enabled);
  console.log("  hours:", JSON.stringify(existing.schedule?.hours));
  console.log("  wdays:", JSON.stringify(existing.schedule?.wdays));
  console.log("  timezone:", existing.schedule?.timezone);
  process.exit(0);
}

const payload = {
  job: {
    url: URL,
    title: "ImNotAnAttorney: refresh-judge-disposition (TICKET-2)",
    enabled: true,
    saveResponses: true,
    schedule: {
      timezone: "UTC",
      mdays: [-1],
      wdays: [1], // Monday only
      months: [-1],
      hours: [18],
      minutes: [0],
    },
    extendedData: {
      headers: {
        Authorization: `Bearer ${CRON_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
    requestMethod: 0, // GET
    requestTimeout: 900, // 15 min — covers worst-case refresh on XL tier
  },
};

const resp = await fetch("https://api.cron-job.org/jobs", {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${CRONJOB_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});
const text = await resp.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("Invalid JSON response:", text.slice(0, 300));
  process.exit(1);
}
if (resp.ok && data.jobId) {
  console.log("OK created:");
  console.log("  jobId:", data.jobId);
  console.log("  url:", URL);
  console.log("  schedule: weekly Mon 18:00 UTC");
} else {
  console.error("FAILED:", JSON.stringify(data));
  process.exit(1);
}
