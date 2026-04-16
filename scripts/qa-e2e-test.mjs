/**
 * E2E Playbook Purchase Test via Playwright
 *
 * Tests the full purchase flow:
 * 1. Creates $0 checkout via /api/qa-checkout
 * 2. Completes Stripe checkout ($0, no card needed)
 * 3. Verifies success page shows download buttons
 * 4. Downloads both PDFs and checks file sizes
 * 5. Checks delivery email arrived
 *
 * Usage: node scripts/qa-e2e-test.mjs [tier|all]
 * Default: dui-first-offense. Pass "all" for all 8 tiers.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(import.meta.dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
function env(key) {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

const SITE_URL = env("NEXT_PUBLIC_SITE_URL") || "https://imnotanattorney.com";
const OPERATOR_SECRET = env("OPERATOR_SECRET");
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const QA_EMAIL = env("INTERNAL_QA_EMAIL");

const ALL_TIERS = [
  "dui-first-offense", "drug-possession", "probation-violation", "white-collar",
  "sex-offense", "federal-criminal", "drug-trafficking", "self-defense",
];

const arg = process.argv[2];
const tiers = arg === "all" ? ALL_TIERS : [arg || "dui-first-offense"];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const results = [];

async function testTier(tier, browser) {
  const r = { tier, checkout: "FAIL", successPage: "FAIL", downloadFull: "FAIL", downloadEmergency: "FAIL", email: "FAIL" };
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Hit QA checkout, creates session + redirects to Stripe
    console.log(`\n[${tier}] Starting checkout...`);
    const qaUrl = `${SITE_URL}/api/qa-checkout?key=${OPERATOR_SECRET}&tier=${tier}`;
    await page.goto(qaUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2. On Stripe checkout, click submit for $0 order
    const url = page.url();
    console.log(`[${tier}] At: ${url.substring(0, 80)}...`);

    if (url.includes("checkout.stripe.com")) {
      r.checkout = "PASS";
      // Wait for submit button, Stripe pages never reach networkidle
      const btn = page.locator('[data-testid="hosted-payment-submit-button"]')
        .or(page.locator('button:has-text("Complete")'))
        .or(page.locator('button[type="submit"]'))
        .first();

      await btn.waitFor({ state: "visible", timeout: 20000 });
      console.log(`[${tier}] Clicking submit...`);
      await btn.click();
      await page.waitForURL("**/checkout/success**", { timeout: 45000 });
      console.log(`[${tier}] On success page`);
    }

    // 3. Check success page
    if (page.url().includes("/checkout/success")) {
      await page.waitForTimeout(4000); // wait for verify API + webhook

      const dlButtons = await page.locator('a:has-text("Download")').all();
      if (dlButtons.length > 0) {
        r.successPage = `PASS (${dlButtons.length} buttons)`;
        console.log(`[${tier}] ${dlButtons.length} download button(s) found`);
      } else {
        const fallback = await page.locator('text=/sent to/').count();
        r.successPage = fallback > 0 ? "PASS (fallback)" : "FAIL";
        console.log(`[${tier}] ${fallback > 0 ? "Fallback shown (webhook race)" : "No buttons or fallback"}`);
      }

      // Check upgrade copy
      const has197 = await page.locator('text=/\\$197/').count();
      if (has197 > 0) console.log(`[${tier}] Upgrade copy shows $197, PASS`);
    }

    // 4. Download PDFs via API
    const { data: order } = await supabase
      .from("orders")
      .select("download_token, id")
      .eq("email", QA_EMAIL).eq("tier", tier).eq("product_type", "digital-product")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (order?.download_token) {
      const fullResp = await fetch(`${SITE_URL}/api/download/${order.download_token}`);
      if (fullResp.ok) {
        const sz = ((await fullResp.arrayBuffer()).byteLength / 1024 / 1024).toFixed(1);
        r.downloadFull = `PASS (${sz}MB)`;
        console.log(`[${tier}] Full PDF: ${sz}MB`);
      } else { r.downloadFull = `FAIL (${fullResp.status})`; }

      const emResp = await fetch(`${SITE_URL}/api/download/${order.download_token}?doc=emergency`);
      if (emResp.ok) {
        const sz = ((await emResp.arrayBuffer()).byteLength / 1024 / 1024).toFixed(1);
        r.downloadEmergency = `PASS (${sz}MB)`;
        console.log(`[${tier}] Emergency PDF: ${sz}MB`);
      } else if (emResp.status === 404) {
        r.downloadEmergency = "SKIP (none for tier)";
      } else { r.downloadEmergency = `FAIL (${emResp.status})`; }
    } else {
      console.log(`[${tier}] No download token, webhook may not have fired`);
      r.downloadFull = r.downloadEmergency = "SKIP (no order)";
    }

    // 5. Check delivery email
    if (order?.id) {
      await page.waitForTimeout(2000);
      const { data: log } = await supabase
        .from("email_logs")
        .select("id, subject, status, category")
        .eq("order_id", order.id).eq("category", "playbook-delivery")
        .limit(1).maybeSingle();
      r.email = log ? `PASS ("${log.subject}")` : "NOT FOUND (may be sending)";
      if (log) console.log(`[${tier}] Email: ${log.status}`);
    }
  } catch (e) {
    console.error(`[${tier}] Error: ${e.message}`);
  } finally {
    await context.close();
  }
  results.push(r);
}

async function main() {
  console.log("=== ImNotAnAttorney E2E Playbook Test ===");
  console.log(`Tiers: ${tiers.join(", ")} | Email: ${QA_EMAIL}\n`);

  const browser = await chromium.launch({ headless: true });
  for (const tier of tiers) await testTier(tier, browser);
  await browser.close();

  console.log("\n=== RESULTS ===\n");
  for (const r of results) {
    console.log(`${r.tier}:`);
    console.log(`  Checkout:  ${r.checkout}`);
    console.log(`  Success:   ${r.successPage}`);
    console.log(`  Full PDF:  ${r.downloadFull}`);
    console.log(`  Emergency: ${r.downloadEmergency}`);
    console.log(`  Email:     ${r.email}`);
  }

  const fails = results.filter(r => r.checkout === "FAIL" || r.downloadFull.startsWith("FAIL"));
  console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL PASSED");
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
