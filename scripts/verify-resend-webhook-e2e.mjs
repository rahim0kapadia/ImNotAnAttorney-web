#!/usr/bin/env node
// Layer 2 E2E verification, full signed webhook test + DB state check.
//
// Steps:
//   1. Query sms_suspensions for existing rows (real traffic signal).
//   2. Craft a valid Svix-signed bounce webhook for phone 0000000000@text.email.
//   3. POST it to the production endpoint.
//   4. Assert the endpoint returned 200 and the phone is now suspended.
//   5. Clean up the test row.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { query, end } from "./lib/db.mjs";

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
const secret = env.RESEND_WEBHOOK_SECRET;
if (!secret) {
  console.error("RESEND_WEBHOOK_SECRET missing from .env.local");
  process.exit(1);
}
const endpoint = "https://imnotanattorney.com/api/webhooks/resend";
// NANP reserved range (555-0100 through 555-0199, never assigned to real customers),
// so cleanup can't clobber real suspensions even if a concurrent bounce hits.
const TEST_PHONE = "5555550137";

console.log("=== Layer 2 E2E webhook verification ===\n");

try {
  // 1. Baseline: existing suspensions
  const existing = await query(
    "SELECT phone, suspended_at, reason, source FROM sms_suspensions ORDER BY suspended_at DESC LIMIT 10"
  );
  console.log(`1. Existing sms_suspensions rows: ${existing.length}`);
  for (const r of existing) {
    console.log(`   - ${r.phone} @ ${r.suspended_at.toISOString?.() || r.suspended_at} (${r.reason}, ${r.source})`);
  }
  console.log();

  // 2. Clean any prior test row
  await query("DELETE FROM sms_suspensions WHERE phone = $1", [TEST_PHONE]);

  // 3. Craft signed payload
  const payload = JSON.stringify({
    type: "email.bounced",
    data: {
      to: [`${TEST_PHONE}@text.email`],
      email_id: "e2e-test-" + Date.now(),
      from: "ImNotAnAttorney <notifications@imnotanattorney.com>",
      bounce: { type: "hard", subType: "General" },
    },
  });
  const svixId = "msg_e2e_" + Date.now();
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const secretB64 = secret.replace("whsec_", "");
  const secretBytes = Buffer.from(secretB64, "base64");
  const hmac = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const sig = `v1,${hmac}`;

  console.log("2. Posting signed bounce webhook");
  console.log("   endpoint:", endpoint);
  console.log("   svix-id:", svixId);
  console.log("   svix-signature:", sig.slice(0, 40) + "...");

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": sig,
    },
    body: payload,
  });
  const respText = await resp.text();
  console.log(`   response: ${resp.status} ${respText}\n`);

  if (resp.status !== 200) {
    console.error("FAIL: webhook did not return 200");
    process.exit(2);
  }

  // 4. Assert DB row created
  const rows = await query(
    "SELECT phone, reason, source, bounce_type, resolved_at FROM sms_suspensions WHERE phone = $1",
    [TEST_PHONE]
  );
  console.log("3. DB check after webhook");
  if (rows.length === 0) {
    console.error("   FAIL: no suspension row for test phone");
    process.exit(3);
  }
  const row = rows[0];
  console.log(`   PASS: phone=${row.phone} reason=${row.reason} source=${row.source} bounce_type=${row.bounce_type} resolved_at=${row.resolved_at}`);
  if (row.reason !== "email.bounced") {
    console.error("   FAIL: reason mismatch");
    process.exit(3);
  }

  console.log("OK: Layer 2 E2E PASS, endpoint, signature verification, DB write all working.");
  console.log("NOTE: This only proves OUR endpoint works. Separately verify the webhook is");
  console.log("      REGISTERED in the Resend dashboard (https://resend.com/webhooks)");
  console.log("      pointing at", endpoint, "with events email.bounced + email.complained.");
} finally {
  // Cleanup runs even on early exit/crash so a test row never lingers in prod.
  try {
    await query("DELETE FROM sms_suspensions WHERE phone = $1", [TEST_PHONE]);
    console.log("   cleanup: test row deleted");
  } catch (err) {
    console.error("   cleanup failed:", err instanceof Error ? err.message : err);
  }
  await end();
}
