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

    // Header — co-branded (use .first() — dual render: screen + print blocks)
    await expect(page.getByText("QA Bail Bonds, Tampa").first()).toBeVisible();
    await expect(page.getByText("Bail Conditions Checklist").first()).toBeVisible();

    // Bail condition checkboxes (.first() — dual screen+print render)
    await expect(page.getByText("Do not leave jurisdiction").first()).toBeVisible();
    await expect(page.getByText("No new arrests while on bail").first()).toBeVisible();
    await expect(page.getByText("Attend ALL scheduled court dates").first()).toBeVisible();

    // Court reminders section
    await expect(page.getByText("Free Court Reminders").first()).toBeVisible();
    await expect(page.getByText("imnotanattorney.com/r/QABONDSMAN/reminders").first()).toBeVisible();

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
    // Use the existing E2ETEST partner (source: null)
    const { data: e2ePartner } = await sb
      .from("partners")
      .select("id")
      .eq("promo_code", "E2ETEST")
      .single();

    if (!e2ePartner) {
      test.skip();
      return;
    }

    await authenticateAndGo(page, e2ePartner.id, `${BASE}/partner/dashboard`);

    // Should see "Bail Packet Insert" NOT "Compliance Checklist"
    const cardLink = page.getByRole("heading", { name: /bail packet insert/i });
    await expect(cardLink).toBeVisible({ timeout: 15_000 });

    const checklistLink = page.getByRole("heading", { name: /compliance checklist/i });
    await expect(checklistLink).not.toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/non-bondsman-dashboard.png", fullPage: true });

    // Cleanup E2ETEST sessions
    await sb.from("partner_sessions").delete().eq("partner_id", e2ePartner.id).gt("expires_at", new Date().toISOString());
  });
});
