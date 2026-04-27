#!/usr/bin/env node
// Emergency scrub of expired plaintext intake/report tokens.
// Mirrors hourly cron route at src/app/api/cron/scrub-plaintext-tokens/route.ts.
// Use this when the cron is broken or you need an immediate scrub between
// hourly runs.
//
// Usage:
//   node scripts/scrub-plaintext-tokens.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Issues a single PATCH to orders table, NULLs all three plaintext-related
// columns for rows where plaintext_tokens_expires_at IS NOT NULL AND < NOW().
// Logs the count of scrubbed rows, exits 0 on success, 1 on error.

import { readFileSync } from "node:fs";

// Inline .env.local parse (no dotenv dependency — keep this bootstrapable)
function parseEnvLocal(filePath) {
  const envFile = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of envFile.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    // Strip surrounding double-quotes if present
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = parseEnvLocal(".env.local");
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "ERR: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const nowIso = new Date().toISOString();

// Build the URL with predicates:
// plaintext_tokens_expires_at=lt.<now> (less than now — expired)
// plaintext_tokens_expires_at=not.is.null (not null)
const url = `${SUPABASE_URL}/rest/v1/orders?plaintext_tokens_expires_at=lt.${encodeURIComponent(nowIso)}&plaintext_tokens_expires_at=not.is.null`;

const response = await fetch(url, {
  method: "PATCH",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    standalone_intake_token: null,
    standalone_report_token_plaintext: null,
    plaintext_tokens_expires_at: null,
  }),
});

if (!response.ok) {
  const errorBody = await response.text();
  console.error(`ERR: HTTP ${response.status}: ${errorBody}`);
  process.exit(1);
}

const scrubbed = await response.json();
const count = Array.isArray(scrubbed) ? scrubbed.length : 0;
console.log(`Scrubbed ${count} rows.`);
process.exit(0);
