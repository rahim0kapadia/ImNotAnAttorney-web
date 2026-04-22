#!/usr/bin/env node
/**
 * Local script: queries /api/admin/env-presence and pretty-prints which
 * partner-system env vars are set on the deploy.
 *
 * Usage:
 *   ADMIN_PASSWORD=... node scripts/check-partner-envs.mjs
 *   ADMIN_PASSWORD=... BASE_URL=https://imnotanattorney.com node scripts/check-partner-envs.mjs
 *
 * Env:
 *   ADMIN_PASSWORD  — required; matches the ADMIN_PASSWORD env on Vercel
 *   BASE_URL        — optional; defaults to https://imnotanattorney.com
 *
 * Exits 0 if all env vars are present, 1 if any are missing (useful as a
 * CI smoke step: `node scripts/check-partner-envs.mjs || echo "envs drifted"`).
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const BASE_URL = process.env.BASE_URL || "https://imnotanattorney.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error("ERROR: ADMIN_PASSWORD env var required.");
  console.error("Usage: ADMIN_PASSWORD=... node scripts/check-partner-envs.mjs");
  process.exit(2);
}

const url = `${BASE_URL}/api/admin/env-presence`;

let res;
try {
  res = await fetch(url, {
    headers: { "x-admin-password": ADMIN_PASSWORD },
  });
} catch (err) {
  console.error(`ERROR: fetch ${url} failed: ${err?.message ?? err}`);
  process.exit(1);
}

if (res.status !== 200) {
  console.error(`ERROR: ${url} returned ${res.status}.`);
  if (res.status === 401) {
    console.error("  (ADMIN_PASSWORD did not match — check the env var.)");
  }
  process.exit(1);
}

const body = await res.json();
const { envs, missing_count, present_count, checked_at } = body;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

console.log(`${BOLD}Partner-system env presence on ${BASE_URL}${RESET}`);
console.log(`Checked at: ${checked_at}`);
console.log(`Present: ${GREEN}${present_count}${RESET}   Missing: ${missing_count > 0 ? RED : GREEN}${missing_count}${RESET}`);
console.log("");

const keys = Object.keys(envs).sort();
const maxLen = Math.max(...keys.map((k) => k.length));
for (const key of keys) {
  const present = envs[key];
  const icon = present ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  const status = present ? `${GREEN}SET${RESET}` : `${RED}MISSING${RESET}`;
  console.log(`  ${icon}  ${key.padEnd(maxLen)}  ${status}`);
}

process.exit(missing_count > 0 ? 1 : 0);
