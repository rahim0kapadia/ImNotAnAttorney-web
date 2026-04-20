/**
 * E2E: Bondsman compliance checklist + partner-type dashboard routing.
 *
 * Creates a temporary bondsman test partner, tests:
 * 1. Unauthenticated redirect to login
 * 2. Bondsman dashboard shows "Compliance Checklist" link
 * 3. Checklist page renders all sections
 * 4. Print media layout screenshot
 * 5. Non-bondsman dashboard shows "Bail Packet Insert" link
 *
 * Cleans up the temporary partner after tests.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local for SUPABASE_SERVICE_ROLE_KEY
config({ path: resolve(__dirname, "../.env.local") });

const BASE = "https://imnotanattorney.com";
const SUPABASE_URL = "https://jxjbjmgdukwkoclydqdr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper: create a partner session in DB and return the raw token
async function createPartnerSession(partnerId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  const { error } = await sb.from("partner_sessions").insert({
    partner_id: partnerId,
    session_token_hash: hash,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  return token;
}

// Helper: set session cookie and navigate (avoids sameSite=Strict first-nav issue)
async function authenticateAndGo(page: Page, partnerId: string, url: string): Promise<void> {
  const token = await createPartnerSession(partnerId);

  // Navigate to the site first so cookie is same-site on subsequent navigations
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

let bondsmanPartnerId: string | null = null;

test.describe("Partner Checklist Feature", () => {
  // Setup: create a temporary bondsman partner
  test.beforeAll(async () => {
    // Clean up any leftover from prior failed runs
    await sb.from("partners").delete().eq("email", "qa-bondsman-e2e@imnotanattorney.com");

    const { data, error } = await sb
      .from("partners")
      .insert({
        name: "QA Bondsman",
        email: "qa-bondsman-e2e@imnotanattorney.com",
        phone: "+15551234567",
        company: "QA Bail Bonds",
        city: "Tampa",
        promo_code: "QABONDSMAN",
        source: "bondsman",
        status: "approved",
        commission_rate: 10,
        commission_tier: "partner",
        total_referrals: 0,
        total_commission: 0,
        total_paid_out: 0,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to create test partner: ${error.message}`);
    bondsmanPartnerId = data.id;
  });

  // Cleanup: remove test partner + sessions
  test.afterAll(async () => {
    if (bondsmanPartnerId) {
      await sb.from("partner_sessions").delete().eq("partner_id", bondsmanPartnerId);
      await sb.from("partners").delete().eq("id", bondsmanPartnerId);
    }
  });

  test("unauthenticated /partner/checklist redirects to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/partner/checklist`);
    await page.waitForURL(/\/partner\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/partner/login");
  });

  test("bondsman dashboard shows Compliance Checklist link", async ({ page }) => {
    await authenticateAndGo(page, bondsmanPartnerId!, `${BASE}/partner/dashboard`);

    // Should see "Compliance Checklist" NOT "Bail Packet Insert"
    const checklistLink = page.getByRole("heading", { name: /compliance checklist/i });
    await expect(checklistLink).toBeVisible({ timeout: 15_000 });

    const cardLink = page.getByRole("heading", { name: /bail packet insert/i });
    await expect(cardLink).not.toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/bondsman-dashboard.png", fullPage: true });
  });

  test("checklist page renders all sections", async ({ page }) => {
    await authenticateAndGo(page, bondsmanPartnerId!, `${BASE}/partner/checklist`);

    // Toolbar
    await expect(page.getByRole("button", { name: /print checklist/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /back to dashboard/i })).toBeVisible();

    // Header, co-branded (use .first(), dual render: screen + print blocks)
    await expect(page.getByText("QA Bail Bonds, Tampa").first()).toBeVisible();
    await expect(page.getByText("Bail Conditions Checklist").first()).toBeVisible();

    // Bail condition checkboxes (.first(), dual screen+print render)
    await expect(page.getByText("Do not leave jurisdiction").first()).toBeVisible();
    await expect(page.getByText("No new arrests while on bail").first()).toBeVisible();
    await expect(page.getByText("Attend ALL scheduled court dates").first()).toBeVisible();

    // Court reminders / check-in section. Post-audit (bondsman modes v2)
    // the checklist page branches on partner.check_in_enabled and renders
    // either "Court Check-In Set-Up" or "Court Date Prep" — was flat
    // "Free Court Reminders" before.
    const checkinLabel = page.getByText("Court Check-In Set-Up").first();
    const reminderLabel = page.getByText("Court Date Prep").first();
    const hasEither = (await checkinLabel.count()) > 0 || (await reminderLabel.count()) > 0;
    expect(hasEither).toBeTruthy();
    // The rendered URL branches on the toggle flag + partner.check_in_enabled:
    // `/checkin/QABONDSMAN` (check-in mode) or `/r/QABONDSMAN/reminders`
    // (referral mode). Assert the domain + promo segment, not the full path.
    await expect(
      page.getByText(/imnotanattorney\.com\/(checkin|r)\/QABONDSMAN/).first(),
    ).toBeVisible();

    // QR code rendered
    const qrImg = page.locator('img[alt*="QR code"]').first();
    await expect(qrImg).toBeVisible({ timeout: 15_000 });

    // Bondsman phone auto-filled
    await expect(page.getByText("+15551234567").first()).toBeVisible();

    // Footer
    await expect(page.getByText("Legal Information").first()).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/checklist-screen.png", fullPage: true });
  });

  test("checklist print layout is clean", async ({ page }) => {
    await authenticateAndGo(page, bondsmanPartnerId!, `${BASE}/partner/checklist`);

    // Wait for QR code to render
    await expect(page.locator('img[alt*="QR code"]').first()).toBeVisible({ timeout: 15_000 });

    // Emulate print media and screenshot
    await page.emulateMedia({ media: "print" });
    await page.screenshot({
      path: "e2e/screenshots/checklist-print.png",
      fullPage: true,
    });

    // In print mode, toolbar should be hidden and print-only block visible
    const toolbar = page.getByRole("button", { name: /print checklist/i });
    await expect(toolbar).not.toBeVisible();

    // Checklist content still visible in print (.last() = print-only block; .first() = screen preview, hidden in print)
    await expect(page.getByText("Bail Conditions Checklist").last()).toBeVisible();
  });

  test("non-bondsman dashboard shows Bail Packet Insert link", async ({ page }) => {
    // E2ETEST was migrated to source=bondsman + check_in_enabled=true as
    // part of the bondsman-modes v2 carve-out (2026-04-18). Can't rely on
    // it for "non-bondsman" anymore. Seed a throwaway generic partner for
    // this assertion, clean it up after.
    const genEmail = `qa-nonbondsman-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@imnotanattorney.com`;
    const genPromo = `QANB${Date.now().toString().slice(-5)}`;
    await sb.from("partners").delete().eq("email", genEmail);
    const { data: gen, error: genErr } = await sb
      .from("partners")
      .insert({
        name: "QA Non-Bondsman",
        email: genEmail,
        phone: "+15557778888",
        promo_code: genPromo,
        source: "generic",
        status: "approved",
        commission_rate: 10,
        commission_tier: "partner",
      })
      .select("id")
      .single();
    if (genErr) throw new Error(`non-bondsman setup: ${genErr.message}`);

    try {
      await authenticateAndGo(page, gen.id, `${BASE}/partner/dashboard`);
      const cardLink = page.getByRole("heading", { name: /bail packet insert/i });
      await expect(cardLink).toBeVisible({ timeout: 15_000 });
      const checklistLink = page.getByRole("heading", { name: /compliance checklist/i });
      await expect(checklistLink).not.toBeVisible();
      await page.screenshot({ path: "e2e/screenshots/non-bondsman-dashboard.png", fullPage: true });
    } finally {
      await sb.from("partner_sessions").delete().eq("partner_id", gen.id);
      await sb.from("partners").delete().eq("id", gen.id);
    }
  });
});
