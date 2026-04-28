#!/usr/bin/env node
/**
 * @fileoverview E2E archetype verification — programmatic post-purchase smoke
 *
 * For each of the 5 post-purchase archetypes (A/B/C/D/E), this script:
 *   1. Pre-flight cleanup of residual QA orders (cases first, then orders)
 *   2. Hits /api/qa-checkout to mint a $0 Stripe session via the QA coupon
 *   3. Drives Playwright through the Stripe Checkout submit click ($0, no card)
 *   4. Waits for /checkout/success — Stripe sends real webhook, session flips to
 *      payment_status=no_payment_required, /api/checkout/verify returns archetype
 *   5. Polls the orders row for archetype-specific token state
 *   6. Calls /api/checkout/verify and asserts archetype + URLs
 *   7. Reaches each download/report/intake URL to confirm it serves
 *   8. Post-test cleanup
 *
 * Archetype taxonomy: docs/plans/2026-04-27-immediate-download-v2.md §1.2
 *
 * Usage: node scripts/e2e-archetype-verify.mjs
 * Exit:  0 if all 5 archetypes pass; 1 otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ENV_PATH = path.join(repoRoot, ".env.local");

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) throw new Error(`env file not found: ${envPath}`);
  const env = {};
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const must = (k) => {
  if (!env[k]) throw new Error(`missing env: ${k}`);
  return env[k];
};

const ORIGIN = env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
const OPERATOR_SECRET = must("OPERATOR_SECRET");
const QA_EMAIL = must("INTERNAL_QA_EMAIL");
const SUPA_URL = must("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY = must("SUPABASE_SERVICE_ROLE_KEY");

async function pgQuery(table, qs) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error(`pgQuery ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pgDelete(table, qs) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs}`, {
    method: "DELETE",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      Prefer: "return=representation",
    },
  });
  if (!res.ok) throw new Error(`pgDelete ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollOrder(sessionId, predicate, timeoutMs = 30000, intervalMs = 1000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const rows = await pgQuery(
      "orders",
      `stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`,
    );
    last = rows[0] || null;
    if (last && predicate(last)) return last;
    await sleep(intervalMs);
  }
  return last;
}

// FK-safe cleanup: cases (FK to orders) first, then orders.
async function cleanupOrdersForSku({ tier, slug }) {
  const conds = [];
  if (tier) conds.push(`tier.eq.${tier}`);
  if (slug) conds.push(`standalone_product_slug.eq.${slug}`);
  if (conds.length === 0) return 0;

  const findQs = `email=eq.${encodeURIComponent(QA_EMAIL)}&or=(${conds.join(",")})&select=id`;
  let found;
  try {
    found = await pgQuery("orders", findQs);
  } catch (e) {
    console.error(`  cleanup find error for ${tier || slug}:`, e.message);
    return 0;
  }
  if (!found.length) return 0;

  const ids = found.map((r) => r.id);
  const inList = `(${ids.join(",")})`;

  try {
    await pgDelete("cases", `order_id=in.${inList}`);
  } catch (e) {
    console.error(`  cleanup cases error:`, e.message);
  }

  try {
    const deleted = await pgDelete("orders", `id=in.${inList}`);
    return deleted.length;
  } catch (e) {
    console.error(`  cleanup orders error:`, e.message);
    return 0;
  }
}

async function fetchVerify(sessionId) {
  const res = await fetch(`${ORIGIN}/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function reach(url, init = {}) {
  const res = await fetch(url, { redirect: "manual", ...init });
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    /* ignore body */
  }
  return { status: res.status, headers: res.headers, body: bodyText };
}

async function driveCheckout(browser, qsParams) {
  const url = `${ORIGIN}/api/qa-checkout?${new URLSearchParams({
    key: OPERATOR_SECRET,
    ...qsParams,
  }).toString()}`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let sessionId = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
    const stripeUrl = page.url();
    const m = stripeUrl.match(/cs_(?:live|test)_[A-Za-z0-9]+/);
    if (m) sessionId = m[0];

    const btn = page
      .locator('[data-testid="hosted-payment-submit-button"]')
      .or(page.locator('button:has-text("Complete")'))
      .or(page.locator('button[type="submit"]'))
      .first();
    await btn.waitFor({ state: "visible", timeout: 20000 });
    await btn.click();

    await page.waitForURL(/\/checkout\/success/, { timeout: 60000 });
    if (!sessionId) {
      const m2 = page.url().match(/cs_(?:live|test)_[A-Za-z0-9]+/);
      if (m2) sessionId = m2[0];
    }
  } finally {
    await ctx.close();
  }
  if (!sessionId) throw new Error("never captured cs_ session id");
  return sessionId;
}

const archetypes = [
  {
    label: "A",
    name: "dui-first-offense ($127 playbook)",
    qa: { tier: "dui-first-offense" },
    sku: { tier: "dui-first-offense" },
    pollPredicate: (row) => row.product_type === "digital-product" && row.download_token != null,
    expect: async ({ order, verify }) => {
      const checks = [];
      checks.push(["orders.tier === dui-first-offense", order?.tier === "dui-first-offense"]);
      checks.push(["orders.product_type === digital-product", order?.product_type === "digital-product"]);
      checks.push(["orders.download_token IS NOT NULL", order?.download_token != null]);
      checks.push(["verify.archetype === A", verify?.json?.archetype === "A"]);
      checks.push(["verify.downloadUrl present", typeof verify?.json?.downloadUrl === "string"]);
      if (verify?.json?.downloadUrl) {
        const r = await reach(verify.json.downloadUrl);
        const ct = r.headers.get("content-type") || "";
        const cd = r.headers.get("content-disposition") || "";
        const ok = r.status === 200 && (ct.includes("pdf") || cd.includes("attachment"));
        checks.push([`downloadUrl reachable (status=${r.status} ct=${ct})`, ok]);
      } else {
        checks.push(["downloadUrl reachable", false]);
      }
      return checks;
    },
  },
  {
    label: "B",
    name: "arrest-survival-kit ($47 Tier 9 pre-pop)",
    qa: { product: "arrest-survival-kit", state: "FL" },
    sku: { slug: "arrest-survival-kit" },
    pollPredicate: (row) => row.product_type === "standalone" && row.standalone_report_token_plaintext != null,
    pollTimeoutMs: 60000,
    expect: async ({ order, verify }) => {
      const checks = [];
      checks.push(["orders.standalone_product_slug === arrest-survival-kit", order?.standalone_product_slug === "arrest-survival-kit"]);
      checks.push(["orders.product_type === standalone", order?.product_type === "standalone"]);
      checks.push(["orders.standalone_intake_token IS NOT NULL", order?.standalone_intake_token != null]);
      checks.push(["orders.plaintext_tokens_expires_at IS NOT NULL", order?.plaintext_tokens_expires_at != null]);
      const ttlOk = order?.plaintext_tokens_expires_at && Date.parse(order.plaintext_tokens_expires_at) > Date.now();
      checks.push(["plaintext_tokens_expires_at > NOW()", !!ttlOk]);
      checks.push(["orders.standalone_report_token_plaintext IS NOT NULL", order?.standalone_report_token_plaintext != null]);
      checks.push(["verify.archetype === B", verify?.json?.archetype === "B"]);
      checks.push(["verify.reportUrl present", typeof verify?.json?.reportUrl === "string"]);
      if (verify?.json?.reportUrl) {
        const r = await reach(verify.json.reportUrl);
        const ok = r.status === 200 && /arrest survival kit/i.test(r.body);
        checks.push([`reportUrl reachable + body (status=${r.status})`, ok]);
      } else {
        checks.push(["reportUrl reachable", false]);
      }
      return checks;
    },
  },
  {
    label: "C",
    name: "charge-authority-pack ($97 Tier 9 pre-pop via A6)",
    qa: { product: "charge-authority-pack", chargeType: "dui", state: "FL", circuit: "11" },
    sku: { slug: "charge-authority-pack" },
    pollPredicate: (row) => row.product_type === "standalone" && (row.standalone_intake_token != null || row.standalone_report_token_plaintext != null),
    pollTimeoutMs: 60000,
    expect: async ({ order, verify }) => {
      const checks = [];
      checks.push(["orders.product_type === standalone", order?.product_type === "standalone"]);
      const arch = verify?.json?.archetype;
      const archOk = arch === "B" || arch === "C";
      checks.push([`verify.archetype is B or C (got=${arch})`, archOk]);
      if (arch === "B") {
        checks.push(["B path: standalone_report_token_plaintext IS NOT NULL", order?.standalone_report_token_plaintext != null]);
        checks.push(["B path: reportUrl present", typeof verify?.json?.reportUrl === "string"]);
        if (verify?.json?.reportUrl) {
          const r = await reach(verify.json.reportUrl);
          checks.push([`B path: reportUrl reachable (${r.status})`, r.status === 200]);
        } else {
          checks.push(["B path: reportUrl reachable", false]);
        }
      } else if (arch === "C") {
        checks.push(["C path: intakeUrl present", typeof verify?.json?.intakeUrl === "string"]);
        if (verify?.json?.intakeUrl) {
          const r = await reach(verify.json.intakeUrl);
          const ok = r.status === 200 || r.status === 307 || r.status === 302;
          checks.push([`C path: intakeUrl reachable (${r.status})`, ok]);
        } else {
          checks.push(["C path: intakeUrl reachable", false]);
        }
      }
      return checks;
    },
  },
  {
    label: "D",
    name: "employment-impact ($197 standalone research)",
    qa: { product: "employment-impact" },
    sku: { slug: "employment-impact" },
    pollPredicate: (row) => row.product_type === "standalone" && row.standalone_intake_token != null,
    expect: async ({ order, verify }) => {
      const checks = [];
      checks.push(["orders.product_type === standalone", order?.product_type === "standalone"]);
      checks.push(["orders.standalone_intake_token IS NOT NULL", order?.standalone_intake_token != null]);
      checks.push(["verify.archetype === D", verify?.json?.archetype === "D"]);
      checks.push(["verify.intakeUrl present", typeof verify?.json?.intakeUrl === "string"]);
      checks.push(["verify.reportUrl absent", verify?.json?.reportUrl == null]);
      if (verify?.json?.intakeUrl) {
        const r = await reach(verify.json.intakeUrl);
        const ok = r.status === 200 || r.status === 307 || r.status === 302;
        checks.push([`intakeUrl reachable (${r.status})`, ok]);
      } else {
        checks.push(["intakeUrl reachable", false]);
      }
      return checks;
    },
  },
  {
    label: "E",
    name: "case-decoder ($197 service tier)",
    qa: { tier: "case-decoder" },
    sku: { tier: "case-decoder" },
    pollPredicate: (row) => row.tier === "case-decoder",
    expect: async ({ order, verify }) => {
      const checks = [];
      checks.push(["orders.tier === case-decoder", order?.tier === "case-decoder"]);
      const ptOk = order?.product_type === "service" || order?.product_type == null;
      checks.push([`orders.product_type service-shape (got=${order?.product_type})`, ptOk]);
      checks.push(["verify.archetype === E", verify?.json?.archetype === "E"]);
      checks.push(["verify.downloadUrl absent", verify?.json?.downloadUrl == null]);
      checks.push(["verify.reportUrl absent", verify?.json?.reportUrl == null]);
      return checks;
    },
  },
];

async function runOne(browser, arc) {
  console.log(`\n── Archetype ${arc.label}: ${arc.name} ──`);
  const delN = await cleanupOrdersForSku(arc.sku);
  console.log(`  Pre-flight: deleted ${delN} rows for ${arc.sku.tier || arc.sku.slug}`);

  const result = { label: arc.label, name: arc.name, steps: [], checks: [], passed: false, error: null };
  try {
    const sessionId = await driveCheckout(browser, arc.qa);
    result.steps.push(["Playwright drove Stripe Checkout to /checkout/success", true, sessionId]);
    console.log(`  session: ${sessionId}`);

    const order = await pollOrder(sessionId, arc.pollPredicate, arc.pollTimeoutMs ?? 30000);
    result.steps.push([`order row reaches archetype-state`, order != null && arc.pollPredicate(order), order?.id]);

    const verify = await fetchVerify(sessionId);
    result.steps.push([`verify endpoint 200`, verify.status === 200]);
    result.steps.push([`verify.verified === true`, verify.json?.verified === true]);

    const archChecks = await arc.expect({ order, verify });
    result.checks = archChecks;

    const allPassed =
      result.steps.every((s) => s[1] === true) && archChecks.every((c) => c[1] === true);
    result.passed = allPassed;
  } catch (err) {
    result.error = err.message;
    console.error(`  ERROR: ${err.message}`);
  }

  for (const [label, ok, extra] of result.steps) {
    console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${extra !== undefined ? ` (${String(extra).slice(0, 80)})` : ""}`);
  }
  for (const [label, ok] of result.checks) {
    console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}`);
  }

  const delN2 = await cleanupOrdersForSku(arc.sku);
  console.log(`  Post-test: deleted ${delN2} rows`);
  return result;
}

async function main() {
  console.log("E2E Archetype Verification (Playwright)");
  console.log(`Origin: ${ORIGIN}`);
  console.log(`QA email: ${QA_EMAIL}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const arc of archetypes) {
      try {
        results.push(await runOne(browser, arc));
      } catch (e) {
        results.push({ label: arc.label, name: arc.name, passed: false, error: e.message, steps: [], checks: [] });
      }
    }
  } finally {
    await browser.close();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("FINAL MATRIX");
  console.log("══════════════════════════════════════════════");
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}]  ${r.label}  ${r.name}${r.error ? `  — ${r.error}` : ""}`);
  }
  const allPass = results.every((r) => r.passed);
  console.log("══════════════════════════════════════════════");
  console.log(allPass ? "VERDICT: All 5 archetypes work end-to-end on prod." : "VERDICT: One or more archetypes failed. See above.");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
