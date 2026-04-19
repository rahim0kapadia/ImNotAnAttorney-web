/**
 * E2E: Referral-mode bridge page (Task 29, bondsman modes v2).
 *
 * Covers:
 *   - /r/{code} for a check-in-disabled partner renders the bridge page
 *     (NOT a redirect to /checkin/{code} — that redirect only fires for
 *     partners with check_in_enabled=true).
 *   - Hero mentions "sent you" (trust-transfer line per BridgePage).
 *   - The raw promo code string is NOT surfaced in the page body —
 *     ToolkitSection / promo-code-visible copy was demoted in Fix #9 and
 *     the referral-mode bridge omits the code so the client never sees it.
 *
 * Gate: needs a seeded partner — see e2e/seed-partners.sql (E2EREFE with
 * check_in_enabled=false).
 */

import { test, expect } from "@playwright/test";

const BASE = "https://imnotanattorney.com";
const PARTNER_CODE = "E2EREFE";

test.describe("Referral bridge (Task 29)", () => {
  // Top-level test.skip() is a no-op under @playwright/test — skip must run
  // inside a describe/beforeEach to actually skip the tests.
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partner (E2EREFE) — run scripts/seed-e2e-partners.mjs first",
    );
  });

  test("bridge renders for referral-mode partner without showing promo code", async ({ page }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}`);

    // Hero should surface the partner trust-transfer line. BridgePage renders:
    //   "Because {displayName} sent you, 10% off case analysis is built in."
    // So we assert on a case-insensitive "sent you" substring which also
    // catches the "{displayName} sent you" amber callout.
    const body = page.locator("main");
    await expect(body).toContainText(/sent you/i, { timeout: 15_000 });

    // Promo code string MUST NOT appear anywhere in the visible page body.
    // This locks the Fix #9 ToolkitSection demotion + referral-mode bridge
    // copy invariant — the client never sees the raw code.
    const bodyText = (await body.innerText()).toUpperCase();
    expect(bodyText).not.toContain(PARTNER_CODE);
  });
});
