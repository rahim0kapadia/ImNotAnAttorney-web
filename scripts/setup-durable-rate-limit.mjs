#!/usr/bin/env node
/**
 * Reusable setup script for durable rate-limit fallback via Upstash Redis.
 *
 * Provisions a dedicated Upstash Redis DB for this project's rate-limiting,
 * then writes three envs to Vercel prod:
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 *   - DURABLE_RL_PROVIDER=upstash
 *
 * After the script exits, the next Vercel deploy (any git push, or a
 * manual redeploy) will pick up the envs + wired factory.
 *
 * Usage:
 *   UPSTASH_EMAIL=you@domain.com \
 *   UPSTASH_API_KEY=... \
 *   VERCEL_TOKEN=... \
 *   node scripts/setup-durable-rate-limit.mjs
 *
 * Optional:
 *   DB_NAME=inna-web-rate-limit      # default based on package.json name
 *   REGION=us-east-1                 # default us-east-1
 *   VERCEL_PROJECT=imnotanattorney   # default from CLAUDE.md
 *
 * Idempotent: if a DB with the chosen name already exists on your Upstash
 * account, the script fetches its credentials and re-writes the same envs
 * (safe to re-run after a lockfile change or a new teammate pulling down).
 *
 * Security: this script reads tokens from YOUR env only. No tokens are
 * logged, emitted to stdout, or persisted. The Vercel env write uses the
 * Vercel REST API v9 with your VERCEL_TOKEN — the token never leaves this
 * process.
 *
 * Reusable across projects: copy this file into any Next.js repo on Vercel,
 * change the DB_NAME default, run. The DurableRateLimitStore contract +
 * factory + upstash impl lift cleanly into any project with the abstraction.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function die(msg) {
  console.error(`${RED}ERROR:${RESET} ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`${DIM}${msg}${RESET}`);
}

function ok(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function warn(msg) {
  console.warn(`${YELLOW}! ${msg}${RESET}`);
}

// Load repo package.json for default DB name
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
);

const UPSTASH_EMAIL = process.env.UPSTASH_EMAIL;
const UPSTASH_API_KEY = process.env.UPSTASH_API_KEY;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const DB_NAME = process.env.DB_NAME || `${pkg.name}-rate-limit`;
const REGION = process.env.REGION || "us-east-1";
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || "imnotanattorney";

if (!UPSTASH_EMAIL) die("UPSTASH_EMAIL env var required. Get from console.upstash.com/account.");
if (!UPSTASH_API_KEY) die("UPSTASH_API_KEY env var required. Generate at console.upstash.com/account/api.");
if (!VERCEL_TOKEN) die("VERCEL_TOKEN env var required. Generate at vercel.com/account/tokens (scope: your team, full access OR env-write).");

console.log(`${BOLD}Durable rate-limit setup${RESET}`);
console.log(`  DB name:        ${DB_NAME}`);
console.log(`  Region:         ${REGION}`);
console.log(`  Vercel project: ${VERCEL_PROJECT}`);
console.log("");

const upstashAuth = "Basic " + Buffer.from(`${UPSTASH_EMAIL}:${UPSTASH_API_KEY}`).toString("base64");

// Step 1: Look up existing DB or create a new one
info("1. Checking Upstash for existing DB...");
const listRes = await fetch("https://api.upstash.com/v2/redis/databases", {
  headers: { Authorization: upstashAuth },
});
if (!listRes.ok) {
  die(`Upstash list DBs failed: ${listRes.status} ${await listRes.text()}`);
}
const existingDbs = await listRes.json();
let db = Array.isArray(existingDbs) ? existingDbs.find((d) => d.database_name === DB_NAME) : null;

if (db) {
  ok(`Found existing DB "${DB_NAME}" (id: ${db.database_id}). Reusing.`);
} else {
  info("   No existing DB. Creating...");
  const createRes = await fetch("https://api.upstash.com/v2/redis/database", {
    method: "POST",
    headers: {
      Authorization: upstashAuth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: DB_NAME,
      region: REGION,
      tls: true,
    }),
  });
  if (!createRes.ok) {
    die(`Upstash create DB failed: ${createRes.status} ${await createRes.text()}`);
  }
  db = await createRes.json();
  ok(`Created DB "${DB_NAME}" (id: ${db.database_id}).`);
}

// Step 2: Fetch REST credentials for the DB (list response doesn't always include rest_token)
info("2. Fetching REST credentials...");
const detailRes = await fetch(`https://api.upstash.com/v2/redis/database/${db.database_id}`, {
  headers: { Authorization: upstashAuth },
});
if (!detailRes.ok) {
  die(`Upstash fetch DB details failed: ${detailRes.status} ${await detailRes.text()}`);
}
const detail = await detailRes.json();
const restUrl = detail.endpoint ? `https://${detail.endpoint}` : detail.rest_url;
const restToken = detail.rest_token;
if (!restUrl || !restToken) {
  die(`Upstash DB details missing rest_url/rest_token. Full response: ${JSON.stringify(detail)}`);
}
ok(`Got REST credentials.`);

// Step 3: Write envs to Vercel prod
info("3. Writing envs to Vercel project " + VERCEL_PROJECT + " (production)...");

// Vercel API: look up project id from slug
const projRes = await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT}`, {
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
});
if (!projRes.ok) {
  die(`Vercel project lookup failed: ${projRes.status} ${await projRes.text()}`);
}
const project = await projRes.json();
ok(`Found Vercel project "${VERCEL_PROJECT}" (id: ${project.id}).`);

async function upsertEnv(key, value) {
  // Vercel API v10 env upsert: the create endpoint supports "upsert=true".
  // Target "production" only — preview/development still use in-memory.
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${project.id}/env?upsert=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production"],
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    die(`Vercel env upsert for ${key} failed: ${res.status} ${body}`);
  }
  ok(`Wrote ${key} to Vercel prod.`);
}

await upsertEnv("UPSTASH_REDIS_REST_URL", restUrl);
await upsertEnv("UPSTASH_REDIS_REST_TOKEN", restToken);
await upsertEnv("DURABLE_RL_PROVIDER", "upstash");

console.log("");
console.log(`${GREEN}${BOLD}Done.${RESET}`);
console.log("");
console.log("Next steps:");
console.log(`  1. Redeploy (git push or ${DIM}vercel --prod${RESET} / dashboard redeploy)`);
console.log(`  2. Verify: ${DIM}ADMIN_PASSWORD=... node scripts/check-partner-envs.mjs${RESET}`);
console.log(`     Should show UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN + DURABLE_RL_PROVIDER all SET.`);
console.log(`  3. Magic-link 3/hour is now durable across Vercel isolates.`);
console.log("");
console.log(`${DIM}To undo: delete the DB from console.upstash.com and remove the 3 envs from Vercel.${RESET}`);
