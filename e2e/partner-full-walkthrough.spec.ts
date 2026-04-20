/**
 * E2E: Full bondsman partner walkthrough, every page, every form, every section.
 *
 * Tests the complete post-signup experience:
 * 1. Login page renders
 * 2. Dashboard loads with all sections visible
 * 3. Payment settings form (select method, fill, save)
 * 4. Notification preferences (toggle channels)
 * 5. Add client modal (fill required fields, submit)
 * 6. FTA calculator adjusts in real-time
 * 7. Toolkit copy buttons work
 * 8. Compliance report page loads with stats
 * 9. Checklist page (bondsman)
 * 10. Card page (non-bondsman regression)
 * 11. Conversion funnel toggle
 *
 * Reusable: run after any partner feature change.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

const BASE = "https://imnotanattorney.com";
const SUPABASE_URL = "https://jxjbjmgdukwkoclydqdr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function createSession(partnerId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await sb.from("partner_sessions").insert({
    partner_id: partnerId,
    session_token_hash: hash,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  return token;
}

async function authenticateAndGo(page: Page, partnerId: string, url: string): Promise<void> {
  const token = await createSession(partnerId);
  await page.goto(`${BASE}/partner/login`);
  await page.context().addCookies([{
    name: "partner-session",
    value: token,
    domain: "imnotanattorney.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }]);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

let bondsmanId: string | null = null;
let e2ePartnerId: string | null = null;

test.describe("Full Bondsman Partner Walkthrough", () => {
  test.beforeAll(async () => {
    await sb.from("court_reminders").delete().eq("partner_promo_code", "QAWALK");
    await sb.from("partners").delete().eq("email", "qa-walkthrough@imnotanattorney.com");

    const { data, error } = await sb.from("partners").insert({
      name: "QA Walkthrough Bondsman",
      email: "qa-walkthrough@imnotanattorney.com",
      phone: "+15559876543",
      company: "Walkthrough Bail Bonds",
      city: "Orlando",
      promo_code: "QAWALK",
      source: "bondsman",
      status: "approved",
      commission_rate: 10,
      commission_tier: "partner",
      total_referrals: 3,
      total_commission: 5970,
      total_paid_out: 0,
    }).select("id").single();

    if (error) throw new Error(`Setup failed: ${error.message}`);
    bondsmanId = data.id;

    const { data: e2e } = await sb.from("partners").select("id").eq("promo_code", "E2ETEST").single();
    e2ePartnerId = e2e?.id || null;
  });

  test.afterAll(async () => {
    if (bondsmanId) {
      await sb.from("court_reminders").delete().eq("partner_promo_code", "QAWALK");
      await sb.from("partner_sessions").delete().eq("partner_id", bondsmanId);
      await sb.from("partners").delete().eq("id", bondsmanId);
    }
    if (e2ePartnerId) {
      await sb.from("partner_sessions").delete().eq("partner_id", e2ePartnerId).gt("expires_at", new Date().toISOString());
    }
  });

  test("login page renders with email form", async ({ page }) => {
    await page.goto(`${BASE}/partner/login`);
    await expect(page.locator("#partner-login-email")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /send login link/i })).toBeVisible();
    await expect(page.getByText(/not a partner yet/i)).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/walkthrough-login.png", fullPage: true });
  });

  test("dashboard loads all sections for bondsman", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    // Post-audit copy:
    // - "Partner Dashboard" H1 → "Your Dashboard"
    // - "Payment Settings" section → "Where to send your money"
    // - "Notifications" section → "When we text or email you"
    // - "Ready-to-Send Messages" section → "Texts to send your clients"
    // - "Profile" → "Your info (shows on every flyer)"
    await expect(page.getByRole("heading", { name: /your dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("QA Walkthrough Bondsman").first()).toBeVisible();
    await expect(page.getByText(/add client/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /compliance checklist/i })).toBeVisible();
    await expect(page.getByText("QAWALK").first()).toBeVisible();
    await expect(page.getByText(/(ready-to-send messages|texts to send)/i).first()).toBeVisible();
    // "Creative Assets" section was renamed to "Scripts for the release
     // desk, the phone, and online" per the voice pass. "Compliance Kit"
     // was kept; still present.
    await expect(
      page.getByText(/scripts for the release desk|creative assets/i).first(),
    ).toBeVisible();
    // "Compliance Kit" → "Surety audit packet" (bondsman voice pass).
    await expect(
      page.getByText(/surety audit packet|compliance kit/i).first(),
    ).toBeVisible();
    // Earnings section H2 → "What you've earned" (bondsman voice).
    await expect(
      page.getByText(/what you'?ve earned|earnings/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/where to send your money/i)).toBeVisible();
    await expect(page.getByText(/when we text or email you/i)).toBeVisible();
    await expect(page.getByText(/your info|profile/i).first()).toBeVisible();
    await expect(page.getByText("qa-walkthrough@imnotanattorney.com")).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/walkthrough-dashboard-full.png", fullPage: true });
  });

  test("payment settings: select method and save", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    const paySection = page.getByText(/where to send your money/i);
    await paySection.scrollIntoViewIfNeeded();

    const methodSelect = page.locator("#pay-method");
    await methodSelect.selectOption("zelle");

    const zelleInput = page.locator("#pay-zelle");
    await expect(zelleInput).toBeVisible({ timeout: 5_000 });
    await zelleInput.fill("qa-bondsman@test.com");

    const saveBtn = page.getByRole("button", { name: /save settings/i });
    await saveBtn.click();

    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: "e2e/screenshots/walkthrough-payment-saved.png" });
  });

  test("notification prefs: toggle a channel", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    const notifSection = page.getByText(/when we text or email you/i).first();
    await notifSection.scrollIntoViewIfNeeded();

    const toggleBtns = page.locator('button[aria-pressed]');
    const count = await toggleBtns.count();
    expect(count).toBeGreaterThan(0);

    // Click a non-active channel to trigger a real toggle
    const inactiveToggle = page.locator('button[aria-pressed="false"]').first();
    await inactiveToggle.click();
    // Wait for save round-trip (button disables during save, re-enables after)
    await expect(inactiveToggle).toBeEnabled({ timeout: 5000 });
    await page.screenshot({ path: "e2e/screenshots/walkthrough-notifications.png" });
  });

  test("add client: fill form and submit", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    const addBtn = page.getByRole("button", { name: /add client/i });
    await addBtn.click();

    const modal = page.getByRole("dialog", { name: /add a client/i });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await page.getByLabel(/first name/i).fill("Test Defendant");
    await modal.getByLabel(/client email/i).fill("test-defendant-e2e@example.com");

    const chargeSelect = modal.locator("select").first();
    const chargeOptions = await chargeSelect.locator("option").allTextContents();
    if (chargeOptions.length > 1) {
      await chargeSelect.selectOption({ index: 1 });
    }

    await page.getByLabel(/county/i).fill("Orange County, FL");

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    await page.getByLabel(/court date/i).fill(futureDate);

    await page.screenshot({ path: "e2e/screenshots/walkthrough-add-client-filled.png" });

    const submitBtn = modal.getByRole("button", { name: /add client/i });
    await submitBtn.click();

    await expect(modal).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Test Defendant")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "e2e/screenshots/walkthrough-client-added.png" });
  });

  test("FTA calculator adjusts in real-time", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    const clientsInput = page.locator("#monthlyClients");
    if (await clientsInput.isVisible()) {
      await clientsInput.fill("50");
      await expect(page.getByText(/prevented/i).first()).toBeVisible();
      await page.screenshot({ path: "e2e/screenshots/walkthrough-fta-calc.png" });
    }
  });

  test("toolkit copy buttons work", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    const copyBtn = page.getByRole("button", { name: /copy promo code/i });
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await expect(page.getByText(/copied/i).first()).toBeVisible({ timeout: 3_000 });
    }
  });

  test("compliance report page loads with stats", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/compliance-report`);

    // Compliance report H1 rewritten to operator-first framing:
    // "{operator} · Defendant Compliance & Court-Appearance Program"
    // (was "Defendant Management Report" pre-audit).
    await expect(
      page.getByText(/defendant compliance|court-appearance program/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    const dateFilter = page.locator("select").first();
    await expect(dateFilter).toBeVisible();
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
    await expect(page.getByText(/back to dashboard/i).first()).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/walkthrough-compliance-report.png", fullPage: true });
  });

  test("checklist page renders for bondsman", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/checklist`);

    await expect(page.getByRole("button", { name: /print checklist/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Walkthrough Bail Bonds, Orlando").first()).toBeVisible();
    await expect(page.getByText("Bail Conditions Checklist").first()).toBeVisible();
    await expect(page.locator('img[alt*="QR code"]').first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "e2e/screenshots/walkthrough-checklist.png", fullPage: true });
  });

  test("card page renders for non-bondsman", async ({ page }) => {
    // E2ETEST was migrated to source=bondsman as part of bondsman-modes v2,
    // so can't piggy-back on it for non-bondsman assertions anymore. Seed
    // a throwaway generic partner for this test and clean up after.
    const genEmail = `qa-walkthrough-generic-${Date.now()}@imnotanattorney.com`;
    const genPromo = `QAWG${Date.now().toString().slice(-5)}`;
    await sb.from("partners").delete().eq("email", genEmail);
    const { data: gen, error: genErr } = await sb
      .from("partners")
      .insert({
        name: "QA Walkthrough Generic",
        email: genEmail,
        phone: "+15550005555",
        promo_code: genPromo,
        source: "generic",
        status: "approved",
        commission_rate: 10,
        commission_tier: "partner",
      })
      .select("id")
      .single();
    if (genErr) throw new Error(`generic setup: ${genErr.message}`);

    try {
      await authenticateAndGo(page, gen.id, `${BASE}/partner/card`);
      await expect(page.getByRole("button", { name: /print insert/i })).toBeVisible({ timeout: 15_000 });
      // Card page hero copy has been rewritten multiple times. Assert
      // partner-branding + QR rather than a specific hero sentence.
      await expect(page.getByText(genPromo).first()).toBeVisible();
      await expect(page.locator('img[alt*="QR code"]').first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: "e2e/screenshots/walkthrough-card.png", fullPage: true });
    } finally {
      await sb.from("partner_sessions").delete().eq("partner_id", gen.id);
      await sb.from("partners").delete().eq("id", gen.id);
    }
  });

  test("conversion funnel time toggle works", async ({ page }) => {
    await authenticateAndGo(page, bondsmanId!, `${BASE}/partner/dashboard`);

    const allTimeBtn = page.getByRole("button", { name: /all time/i });
    if (await allTimeBtn.isVisible()) {
      await allTimeBtn.click();
      await expect(allTimeBtn).toHaveAttribute("aria-pressed", "true");
    }
  });
});
