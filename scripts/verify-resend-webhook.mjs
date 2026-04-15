#!/usr/bin/env node
// Verify Resend webhook registration for Layer 2 SMS bounce detection.
// Checks: (1) RESEND_WEBHOOK_SECRET set locally, (2) webhook registered at Resend
// pointing at our endpoint, (3) subscribed to email.bounced + email.complained.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

function loadEnv() {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
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
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const EXPECTED_URL = "https://imnotanattorney.com/api/webhooks/resend";
const REQUIRED_EVENTS = ["email.bounced", "email.complained"];

console.log("=== Layer 2 SMS bounce webhook verification ===\n");

// 1. Local env
// Prefer full-access "Dev1" key when present — restricted RESEND_API_KEY can't list webhooks.
const apiKey = env.RESEND_API_KEY_FULL || env.RESEND_API_KEY;
const usingFull = !!env.RESEND_API_KEY_FULL;

console.log("1. Local .env.local");
console.log("   RESEND_API_KEY:", env.RESEND_API_KEY ? "SET" : "MISSING");
console.log("   RESEND_API_KEY_FULL:", env.RESEND_API_KEY_FULL ? "SET" : "MISSING (webhook list will fail on restricted key)");
console.log("   using:", usingFull ? "RESEND_API_KEY_FULL" : "RESEND_API_KEY (restricted)");
console.log("   RESEND_WEBHOOK_SECRET:", env.RESEND_WEBHOOK_SECRET ? "SET" : "MISSING");
if (env.RESEND_WEBHOOK_SECRET) {
  console.log("   secret prefix:", env.RESEND_WEBHOOK_SECRET.slice(0, 6) + "...");
  console.log("   secret starts with whsec_:", env.RESEND_WEBHOOK_SECRET.startsWith("whsec_"));
}
console.log();

if (!apiKey) {
  console.error("Cannot query Resend API without an API key");
  process.exit(1);
}

// 2. Resend API — list webhooks
console.log("2. Resend webhooks (GET /webhooks)");
const resp = await fetch("https://api.resend.com/webhooks", {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!resp.ok) {
  console.error("   ERROR:", resp.status, await resp.text());
  process.exit(1);
}
const body = await resp.json();
const hooks = body.data || body.webhooks || body;
const list = Array.isArray(hooks) ? hooks : [];
console.log(`   Total webhooks: ${list.length}`);
for (const h of list) {
  console.log(`   - id=${h.id}`);
  console.log(`     endpoint=${h.endpoint_url || h.url}`);
  console.log(`     status=${h.status || (h.disabled_at ? "disabled" : "enabled")}`);
  console.log(`     events=${JSON.stringify(h.events)}`);
}
console.log();

// 3. Evaluate
const match = list.find((h) => (h.endpoint_url || h.url) === EXPECTED_URL);
console.log("3. Evaluation");
if (!match) {
  console.log(`   NOT REGISTERED: no webhook with endpoint=${EXPECTED_URL}`);
  console.log(`   Fix: register at https://resend.com/webhooks pointing at that URL,`);
  console.log(`        subscribe to ${REQUIRED_EVENTS.join(" + ")}, copy whsec_ into .env.local as RESEND_WEBHOOK_SECRET.`);
  process.exit(2);
}
console.log(`   REGISTERED: id=${match.id}`);
const events = match.events || [];
const missingEvents = REQUIRED_EVENTS.filter((e) => !events.includes(e));
if (missingEvents.length > 0) {
  console.log(`   MISSING EVENTS: ${missingEvents.join(", ")}`);
  console.log(`   Fix: add these events in the Resend dashboard.`);
  process.exit(2);
} else {
  console.log(`   All required events subscribed: ${REQUIRED_EVENTS.join(", ")}`);
}
const isDisabled = match.status === "disabled" || !!match.disabled_at;
if (isDisabled) {
  console.log("   WARNING: webhook is DISABLED");
  process.exit(2);
}
console.log("   Webhook is ACTIVE.\n");
console.log("OK: Layer 2 ready end-to-end.");
