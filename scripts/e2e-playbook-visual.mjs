#!/usr/bin/env node
/**
 * E2E Visual Test — Playbook Purchase Funnel
 *
 * Validates all playbook sales pages, checkout pages, and service listings
 * render correctly using Playwright. This is a read-only visual validation
 * script — no Stripe calls, no DB writes. Safe to run against production.
 *
 * Test suites:
 *   1. All 8 playbook sales pages load (/playbook/<slug>)
 *   2. All 8 playbook checkout pages work (no "Invalid tier")
 *   3. Upgrade cost on DUI checkout is not "$0"
 *   4. All 8 playbooks listed on /services "Instant Products" section
 *   5. Main tier checkout pages show correct prices
 *
 * Run: node scripts/e2e-playbook-visual.mjs [--base-url http://localhost:3000]
 *
 * Requires: playwright (already a project dependency)
 */
import { chromium } from "playwright";

// ================================================================
// CONFIG
// ================================================================

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "http://localhost:3000";

/** Playbook slugs and their expected prices (post Hormozi pricing lift, 2026-04-07). */
const PLAYBOOK_SLUGS = [
  { slug: "dui-first-offense", expectedPrice: "$127" },
  { slug: "drug-possession", expectedPrice: "$127" },
  { slug: "probation-violation", expectedPrice: "$127" },
  { slug: "white-collar", expectedPrice: "$147" },
  { slug: "sex-offense", expectedPrice: "$127" },
  { slug: "federal-criminal", expectedPrice: "$147" },
  { slug: "drug-trafficking", expectedPrice: "$147" },
  { slug: "self-defense", expectedPrice: "$127" },
];

const MAIN_TIERS = [
  { slug: "case-decoder", expectedPrice: "$197" },
  { slug: "intelligence-brief", expectedPrice: "$997" },
  { slug: "x-ray", expectedPrice: "$2,497" },
];

const NAV_TIMEOUT = 30_000;
const SELECTOR_TIMEOUT = 10_000;

// ================================================================
// TEST STATE
// ================================================================

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`    ✓ ${testName}`);
    passed++;
  } else {
    console.error(`    ✗ FAIL: ${testName}`);
    failed++;
  }
}

/**
 * Safely navigate to a URL and wait for network idle.
 * Returns true on success, false on navigation failure.
 */
async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
    return true;
  } catch (err) {
    console.error(`    ✗ Navigation failed: ${url} — ${err.message}`);
    failed++;
    return false;
  }
}

/**
 * Safely query text content of a selector. Returns null if not found.
 */
async function safeTextContent(page, selector, timeout = SELECTOR_TIMEOUT) {
  try {
    await page.locator(selector).first().waitFor({ timeout });
    return (await page.locator(selector).first().textContent())?.trim() || "";
  } catch {
    return null;
  }
}

/**
 * Get full page text content (for broad text searches).
 */
async function getPageText(page) {
  return page.evaluate(() => document.body?.innerText || "");
}

// ================================================================
// TEST SUITES
// ================================================================

/**
 * Test 1: All 8 Playbook Sales Pages Load
 *
 * For each /playbook/<slug>:
 *   - h1 exists
 *   - Correct price is displayed
 *   - CTA button/link exists ("Get Instant Access")
 */
async function testPlaybookSalesPages(page) {
  console.log("\n━━━ Test 1: Playbook Sales Pages ━━━");

  for (const { slug, expectedPrice } of PLAYBOOK_SLUGS) {
    const url = `${BASE_URL}/playbook/${slug}`;
    console.log(`  → ${slug}`);

    if (!(await safeGoto(page, url))) continue;

    const h1Text = await safeTextContent(page, "h1");
    assert(h1Text && h1Text.length > 0, `${slug}: h1 exists ("${h1Text?.slice(0, 50)}...")`);

    const pageText = await getPageText(page);
    assert(pageText.includes(expectedPrice), `${slug}: price "${expectedPrice}" is displayed`);

    const ctaExists = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      return links.some((a) => a.textContent?.includes("Get Instant Access"));
    });
    assert(ctaExists, `${slug}: CTA "Get Instant Access" exists`);
  }
}

/**
 * Test 2: All 8 Checkout Pages Work (No "Invalid tier")
 *
 * For each /checkout?tier=<slug>:
 *   - Page does NOT show "Invalid tier selected"
 *   - Correct price is displayed
 *   - CTA button exists
 */
async function testPlaybookCheckoutPages(page) {
  console.log("\n━━━ Test 2: Playbook Checkout Pages ━━━");

  for (const { slug, expectedPrice } of PLAYBOOK_SLUGS) {
    const url = `${BASE_URL}/checkout?tier=${slug}`;
    console.log(`  → ${slug}`);

    if (!(await safeGoto(page, url))) continue;

    // Wait for client-side hydration
    await page.waitForFunction(
      () => {
        const text = document.body.innerText || "";
        return text.includes("$") || text.includes("Invalid tier");
      },
      undefined,
      { timeout: 15000 }
    ).catch(() => {});

    const pageText = await getPageText(page);

    assert(
      !pageText.includes("Invalid tier selected"),
      `${slug}: no "Invalid tier selected" error`
    );

    assert(pageText.includes(expectedPrice), `${slug}: price "${expectedPrice}" is displayed`);

    const buttonExists = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some(
        (b) =>
          b.textContent?.includes("Get Instant Access") ||
          b.textContent?.includes("Secure Checkout") ||
          b.textContent?.includes("Pay")
      );
    });
    assert(buttonExists, `${slug}: CTA button exists`);
  }
}

/**
 * Test 3: Upgrade Cost Not "$0"
 *
 * On /checkout?tier=dui-first-offense, verify the upgrade nudge
 * shows a cost that is NOT "$0".
 */
async function testUpgradeCostNotZero(page) {
  console.log("\n━━━ Test 3: Upgrade Cost Not $0 ━━━");

  const url = `${BASE_URL}/checkout?tier=dui-first-offense`;
  console.log(`  → dui-first-offense checkout`);

  if (!(await safeGoto(page, url))) return;

  await page.waitForFunction(
    () => {
      const text = document.body.innerText || "";
      return text.includes("$") || text.includes("Invalid tier");
    },
    undefined,
    { timeout: 15000 }
  ).catch(() => {});

  const pageText = await getPageText(page);

  const upgradeMatch = pageText.match(/Upgrade cost:\s*(\$[\d,]+)/);
  assert(
    upgradeMatch !== null,
    `upgrade nudge is present (found: "${upgradeMatch?.[0] || "not found"}")`
  );

  if (upgradeMatch) {
    const upgradeCost = upgradeMatch[1];
    assert(upgradeCost !== "$0", `upgrade cost is not "$0" (found: "${upgradeCost}")`);
  } else {
    assert(false, `upgrade cost is not "$0" (nudge text not found)`);
  }
}

/**
 * Test 4: All Service Tiers on /services
 *
 * Visit /services and verify all 8 playbooks are referenced in the
 * "Instant Products" section.
 */
async function testServicesPage(page) {
  console.log("\n━━━ Test 4: All 8 Playbooks on /services ━━━");

  const url = `${BASE_URL}/services`;
  console.log(`  → /services`);

  if (!(await safeGoto(page, url))) return;

  const instantProductsExists = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h2"));
    return headings.some((h) => h.textContent?.includes("Instant Products"));
  });
  assert(instantProductsExists, `"Instant Products" section heading exists`);

  for (const { slug } of PLAYBOOK_SLUGS) {
    const linkExists = await page.evaluate((s) => {
      const links = Array.from(document.querySelectorAll("a"));
      return links.some(
        (a) =>
          a.href.includes(`/checkout?tier=${s}`) ||
          a.href.includes(`/playbook/${s}`)
      );
    }, slug);
    assert(linkExists, `${slug}: link exists on /services`);
  }
}

/**
 * Test 5: Main Tiers Checkout
 *
 * Verify the main (non-playbook) tier checkout pages render with
 * the correct prices.
 */
async function testMainTiersCheckout(page) {
  console.log("\n━━━ Test 5: Main Tiers Checkout ━━━");

  for (const { slug, expectedPrice } of MAIN_TIERS) {
    const url = `${BASE_URL}/checkout?tier=${slug}`;
    console.log(`  → ${slug} (expect ${expectedPrice})`);

    if (!(await safeGoto(page, url))) continue;

    await page.waitForFunction(
      () => {
        const text = document.body.innerText || "";
        return text.includes("$") || text.includes("Invalid tier");
      },
      undefined,
      { timeout: 15000 }
    ).catch(() => {});

    const pageText = await getPageText(page);

    assert(
      !pageText.includes("Invalid tier selected"),
      `${slug}: no "Invalid tier selected" error`
    );

    assert(
      pageText.includes(expectedPrice),
      `${slug}: price "${expectedPrice}" is displayed`
    );

    const buttonExists = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some(
        (b) =>
          b.textContent?.includes("Get My") ||
          b.textContent?.includes("Secure Checkout") ||
          b.textContent?.includes("Pay")
      );
    });
    assert(buttonExists, `${slug}: CTA button exists`);
  }
}

// ================================================================
// RUNNER
// ================================================================

async function run() {
  console.log(`\nE2E Visual Test — Playbook Purchase Funnel`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (E2E Visual Test) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    await testPlaybookSalesPages(page);
    await testPlaybookCheckoutPages(page);
    await testUpgradeCostNotZero(page);
    await testServicesPage(page);
    await testMainTiersCheckout(page);
  } catch (err) {
    console.error(`\nUnexpected error: ${err.message}`);
    console.error(err.stack);
    failed++;
  } finally {
    await context.close();
    await browser.close();
  }

  // Summary
  console.log(`\n━━━ Results ━━━`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`  ${passed + failed} total assertions\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
