#!/usr/bin/env node
// Register the bounce/complaint webhook in Resend.
// Endpoint: /api/webhooks/resend, events: [email.bounced, email.complained].
// Returns the signing_secret which must be stored as RESEND_WEBHOOK_SECRET in
// both .env.local and Vercel production env.
//
// Safe to re-run: checks for an existing registration on our endpoint first.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const apiKey = env.RESEND_API_KEY_FULL || env.RESEND_API_KEY;
if (!apiKey) {
  console.error("No API key available. Set RESEND_API_KEY_FULL in .env.local");
  process.exit(1);
}

const ENDPOINT = "https://imnotanattorney.com/api/webhooks/resend";
const EVENTS = ["email.bounced", "email.complained"];

console.log("=== Register Resend bounce webhook ===\n");

// 1. Check if already registered
const listResp = await fetch("https://api.resend.com/webhooks", {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!listResp.ok) {
  console.error("Failed to list webhooks:", listResp.status, await listResp.text());
  process.exit(1);
}
const listBody = await listResp.json();
const hooks = Array.isArray(listBody.data) ? listBody.data : Array.isArray(listBody.webhooks) ? listBody.webhooks : [];

console.log(`Existing webhooks: ${hooks.length}`);
for (const h of hooks) {
  console.log(`  - id=${h.id} endpoint=${h.endpoint || h.endpoint_url || h.url || "(unknown field)"} events=${JSON.stringify(h.events)}`);
}
console.log();

const match = hooks.find((h) => {
  const e = h.endpoint || h.endpoint_url || h.url;
  return e === ENDPOINT;
});

if (match) {
  console.log(`Already registered: id=${match.id}`);
  const events = match.events || [];
  const missing = EVENTS.filter((e) => !events.includes(e));
  if (missing.length === 0) {
    console.log("All required events subscribed. Nothing to do.");
    console.log("NOTE: Resend does not return the signing_secret on list — retrieve it from the");
    console.log("dashboard or by re-creating the webhook if you don't already have it stored.");
    process.exit(0);
  }
  console.log(`Missing events: ${missing.join(", ")} — add in dashboard or PATCH via API.`);
  process.exit(2);
}

// 2. Create new webhook
console.log(`Creating webhook → ${ENDPOINT}`);
console.log(`Events: ${EVENTS.join(", ")}\n`);
const createResp = await fetch("https://api.resend.com/webhooks", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ endpoint: ENDPOINT, events: EVENTS }),
});
const createText = await createResp.text();
if (!createResp.ok) {
  console.error(`Create failed: ${createResp.status}`);
  console.error(createText);
  process.exit(1);
}
const created = JSON.parse(createText);
console.log("OK: webhook created");
console.log("  id:", created.id);
console.log("  endpoint:", created.endpoint || created.endpoint_url);
console.log("  events:", JSON.stringify(created.events));
console.log("  signing_secret:", created.signing_secret);
console.log();
console.log("NEXT STEPS:");
console.log("  1. Update .env.local: RESEND_WEBHOOK_SECRET=" + created.signing_secret);
console.log("  2. Update Vercel prod env: RESEND_WEBHOOK_SECRET (same value), redeploy");
console.log("  3. Re-run scripts/verify-resend-webhook-e2e.mjs to confirm live");
