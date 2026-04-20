/**
 * E2E: Bondsman white-label + review-round hardening.
 *
 * Covers every behavior a meticulous human would check after the round 1-13
 * review cycles on the white-label shell, the bondsman-referral audit
 * master plan (18 items), and the round-by-round security/FTC/a11y fixes.
 *
 * Not a replacement for partner-full-walkthrough.spec.ts — that one covers
 * login + CRUD flows. This one covers the invariants the review rounds
 * surfaced: disclosure presence, dual-lockup, skip-link, SVG rejection,
 * path-traversal rejection, mobile viewport, bondsman-only gates.
 *
 * Feature-flag aware: the partner-branded shell is gated on
 * NEXT_PUBLIC_PARTNER_BRANDING_ENABLED. When the flag is off in the prod
 * build, shell-specific tests skip with a recorded reason rather than
 * fail, so the spec stays useful pre- and post-flag-flip.
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

// Unique suffix per run so beforeAll retries never collide on the partners
// unique-email constraint. Runs get their own seed rows; afterAll cleans
// them, and leftover rows from crashed prior runs get swept by the delete-
// first-insert pattern in beforeAll.
const RUN_SUFFIX = `${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
const PROMO = `QAH${RUN_SUFFIX.toUpperCase().slice(0, 7)}`;
const PROMO_OTHER = `QAO${RUN_SUFFIX.toUpperCase().slice(0, 7)}`;
const PROMO_CI = `QAC${RUN_SUFFIX.toUpperCase().slice(0, 7)}`;
const EMAIL = `qa-hardening-${RUN_SUFFIX}@imnotanattorney.com`;
const EMAIL_OTHER = `qa-hardening-other-${RUN_SUFFIX}@imnotanattorney.com`;
const EMAIL_CI = `qa-hardening-ci-${RUN_SUFFIX}@imnotanattorney.com`;

let partnerId: string | null = null;
let partnerOtherId: string | null = null;
let partnerCiId: string | null = null;

async function createSession(pid: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await sb.from("partner_sessions").insert({
    partner_id: pid,
    session_token_hash: hash,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  return token;
}

async function authAs(page: Page, pid: string, url: string): Promise<void> {
  const token = await createSession(pid);
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

/**
 * Probe whether the partner-branded shell is active on the live build.
 * Flag `NEXT_PUBLIC_PARTNER_BRANDING_ENABLED` is baked in at build time;
 * marker = the shell's `[data-partner-branded]` attribute that only that
 * component emits. Cached across tests in the module scope so the probe
 * runs once.
 */
let _shellActive: boolean | null = null;
async function shellActive(page: Page): Promise<boolean> {
  if (_shellActive !== null) return _shellActive;
  if (!partnerId) return false;
  await page.goto(`${BASE}/r/${PROMO}`);
  await page.waitForLoadState("networkidle");
  const count = await page.locator("[data-partner-branded]").count();
  _shellActive = count > 0;
  return _shellActive;
}

test.describe("Bondsman hardening — review-rounds 1-13 invariants", () => {
  test.beforeAll(async () => {
    // Defensive delete by email in case a prior crashed run left rows.
    await sb.from("court_reminders").delete().eq("partner_promo_code", PROMO);
    await sb.from("partners").delete().eq("email", EMAIL);
    await sb.from("partners").delete().eq("email", EMAIL_OTHER);

    const { data, error } = await sb.from("partners").insert({
      name: "QA Hardening Bondsman",
      email: EMAIL,
      phone: "+15550001111",
      company: "Hardening Bail Bonds",
      city: "Tampa",
      promo_code: PROMO,
      source: "bondsman",
      status: "approved",
      commission_rate: 10,
      commission_tier: "partner",
      // Referral mode (check-in off) so /r/{code} renders BridgePage under
      // the partner-branded shell instead of 307-ing to /checkin/{code}.
      check_in_enabled: false,
    }).select("id").single();
    if (error) throw new Error(`Setup failed: ${error.message}`);
    partnerId = data.id;

    const { data: other, error: otherErr } = await sb.from("partners").insert({
      name: "QA Other Bondsman",
      email: EMAIL_OTHER,
      phone: "+15550002222",
      company: "Other Bail Bonds",
      city: "Miami",
      promo_code: PROMO_OTHER,
      source: "bondsman",
      status: "approved",
      commission_rate: 10,
      commission_tier: "partner",
    }).select("id").single();
    if (otherErr) throw new Error(`Setup failed (other): ${otherErr.message}`);
    partnerOtherId = other.id;

    // Third partner for check-in mode — /checkin/{code} is where the
    // CourtReminderForm renders with requirePhone + requireConsent
    // (TCPA copy lives on that form path only).
    await sb.from("partners").delete().eq("email", EMAIL_CI);
    const { data: ci, error: ciErr } = await sb.from("partners").insert({
      name: "QA CI Bondsman",
      email: EMAIL_CI,
      phone: "+15550004444",
      company: "CheckIn Bail Bonds",
      city: "Jacksonville",
      promo_code: PROMO_CI,
      source: "bondsman",
      status: "approved",
      commission_rate: 10,
      commission_tier: "partner",
      check_in_enabled: true,
    }).select("id").single();
    if (ciErr) throw new Error(`Setup failed (ci): ${ciErr.message}`);
    partnerCiId = ci.id;
  });

  test.afterAll(async () => {
    if (partnerId) {
      await sb.from("court_reminders").delete().eq("partner_promo_code", PROMO);
      await sb.from("partner_sessions").delete().eq("partner_id", partnerId);
      await sb.from("partners").delete().eq("id", partnerId);
    }
    if (partnerOtherId) {
      await sb.from("partner_sessions").delete().eq("partner_id", partnerOtherId);
      await sb.from("partners").delete().eq("id", partnerOtherId);
    }
    if (partnerCiId) {
      await sb.from("court_reminders").delete().eq("partner_promo_code", PROMO_CI);
      await sb.from("partner_sessions").delete().eq("partner_id", partnerCiId);
      await sb.from("partners").delete().eq("id", partnerCiId);
    }
  });

  // ── Partner-branded shell (white-label) — flag-gated ─────────────────

  test("r/{code} renders accountability strip with role=note (shell active)", async ({ page }) => {
    const active = await shellActive(page);
    test.skip(!active, "Partner-branded shell not active on this build (flag off).");
    await page.goto(`${BASE}/r/${PROMO}`);
    await page.waitForLoadState("networkidle");
    const strip = page.getByRole("note", { name: /legal disclaimer/i });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText(/not legal advice/i);
    await expect(strip).toContainText(/referral fee/i);
  });

  test("r/{code} has a skip-to-main-content link pointing at #main-content (shell active)", async ({ page }) => {
    const active = await shellActive(page);
    test.skip(!active, "Partner-branded shell not active on this build (flag off).");
    await page.goto(`${BASE}/r/${PROMO}`);
    await page.waitForLoadState("networkidle");
    // Presence + attributes, not headless-Tab focus (which is unreliable in
    // Playwright Chromium when `body` isn't already active). A11y compliance
    // needs the link to exist with the right href + sr-only-until-focus
    // styling; focus order is tested implicitly by whether it's the first
    // <a> in the rendered DOM. Check both.
    const skip = page.locator('a[href="#main-content"]').first();
    await expect(skip).toHaveText(/skip to (main )?content/i);
    const firstAnchorIsSkip = await page.evaluate(() => {
      const first = document.querySelector("a");
      return first?.getAttribute("href") === "#main-content";
    });
    expect(firstAnchorIsSkip).toBe(true);
  });

  test("r/{code} has exactly one <main> landmark", async ({ page }) => {
    await page.goto(`${BASE}/r/${PROMO}`);
    await page.waitForLoadState("networkidle");
    const mains = await page.locator("main").count();
    expect(mains).toBe(1);
  });

  test("r/{code} header shows INAA wordmark", async ({ page }) => {
    await page.goto(`${BASE}/r/${PROMO}`);
    await page.waitForLoadState("networkidle");
    const headerHasInaa = await page
      .locator("header")
      .getByText(/ImNotAnAttorney/)
      .first()
      .isVisible()
      .catch(() => false);
    // Dual-lockup when shell is active, global header when not — either way
    // the wordmark must be in the top chrome.
    expect(headerHasInaa).toBe(true);
  });

  test("r/{code} partner-branded strip uses mechanism framing (shell active)", async ({ page }) => {
    const active = await shellActive(page);
    test.skip(!active, "Partner-branded shell not active on this build (flag off).");
    await page.goto(`${BASE}/r/${PROMO}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/earns a referral fee when you buy/i)).toBeVisible();
  });

  // ── 404 copy + no speed claim ───────────────────────────────────────

  test("r/{invalid} 404 shows 'This link expired. Your case didn't.' + Start-the-decoder CTA", async ({ page }) => {
    await page.goto(`${BASE}/r/NOTAREALCODE123`);
    await expect(page.getByRole("heading", { name: /this link expired/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start the decoder/i })).toBeVisible();
    // Brand-rule — no speed claim
    expect(await page.getByText(/60 seconds/i).count()).toBe(0);
  });

  // ── OG image ────────────────────────────────────────────────────────

  test("r/{code}/opengraph-image returns a non-trivial PNG with 200 status", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${PROMO}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const body = await res.body();
    expect(body.length).toBeGreaterThan(5000);
  });

  // ── BridgePage CTA + dead countdown ─────────────────────────────────

  test("BridgePage CTA uses 'Know what they know' and legacy countdown is gone", async ({ page }) => {
    await page.goto(`${BASE}/r/${PROMO}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: /know what they know/i })).toBeVisible();
    expect(await page.getByText(/Your court date is .* day/i).count()).toBe(0);
  });

  // ── Product deep-link A4 structure ──────────────────────────────────

  test("r/{code}/{product} renders product page (not instant checkout redirect)", async ({ page }) => {
    const res = await page.goto(`${BASE}/r/${PROMO}/case-decoder`);
    expect(page.url()).toContain("case-decoder");
    expect(page.url()).not.toContain("/checkout");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByText(/not legal advice/i).first()).toBeVisible();
  });

  // ── Reminders page + TCPA consent ───────────────────────────────────

  test("r/{code}/reminders shows mutual-stake H1 and no speed claim", async ({ page }) => {
    await page.goto(`${BASE}/r/${PROMO}/reminders`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading").first()).toContainText(/miss court, lose the bond/i);
    expect(await page.getByText(/30 seconds/i).count()).toBe(0);
  });

  // /checkin/{code} is where CourtReminderForm renders with requirePhone +
  // requireConsent. That's the TCPA-bearing surface. /r/{code}/reminders
  // is email-only (no phone → no SMS → no TCPA consent needed), so TCPA
  // tests target the check-in route on a check-in-enabled seed partner.
  test("checkin form consent description carries all CTIA clauses in order", async ({ page }) => {
    await page.goto(`${BASE}/checkin/${PROMO_CI}`);
    await page.waitForLoadState("networkidle");
    const consent = page.locator("#consent-desc");
    await expect(consent).toBeVisible();
    const txt = (await consent.textContent()) || "";
    expect(txt).toMatch(/Sender:\s*ImNotAnAttorney/i);
    expect(txt).toMatch(/msg frequency varies/i);
    expect(txt).toMatch(/data rates/i);
    expect(txt).toMatch(/consent not required/i);
    expect(txt).toMatch(/STOP/);
    expect(txt).toMatch(/HELP/i);
    // CTIA best-practice ordering: anti-coercion before STOP/HELP.
    expect(txt.indexOf("Consent not required")).toBeLessThan(txt.indexOf("STOP"));
  });

  test("checkin form consent checkbox is required", async ({ page }) => {
    await page.goto(`${BASE}/checkin/${PROMO_CI}`);
    await page.waitForLoadState("networkidle");
    const consentCheckbox = page.locator("#consent");
    await expect(consentCheckbox).toBeVisible();
    const isRequired = await consentCheckbox.evaluate(
      (el) => (el as HTMLInputElement).required,
    );
    expect(isRequired).toBe(true);
  });

  // ── Dashboard: bondsman-only surfaces ───────────────────────────────

  test("bondsman dashboard renders forfeiture-shield cluster + activation checklist when empty", async ({ page }) => {
    if (!partnerId) throw new Error("setup failed");
    await authAs(page, partnerId, `${BASE}/partner/dashboard`);
    await expect(page.getByText(/your forfeiture shield/i)).toBeVisible();
    await expect(page.getByText(/bond exposure on watch/i)).toBeVisible();
    await expect(page.getByText(/\(estimated\)/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /get that number off zero/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /copy my partner link/i })).toBeVisible();
    await expect(page.locator("#toolkit")).toBeAttached();
  });

  test("bondsman dashboard activation checklist disappears once an active client exists", async ({ page }) => {
    if (!partnerId) throw new Error("setup failed");
    const { error: seedErr } = await sb.from("court_reminders").insert({
      token: crypto.randomBytes(16).toString("hex"),
      first_name: "Ada",
      last_name: "L",
      charge_type: "dui",
      county_state: "Hillsborough, FL",
      court_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
      partner_promo_code: PROMO,
      status: "active",
      email: `ada-${RUN_SUFFIX}@example.com`,
    });
    if (seedErr) throw seedErr;

    try {
      await authAs(page, partnerId, `${BASE}/partner/dashboard`);
      await expect(page.getByText(/your forfeiture shield/i)).toBeVisible();
      expect(await page.getByRole("heading", { name: /get that number off zero/i }).count()).toBe(0);
      await expect(page.getByRole("heading", { name: /this week on your behalf/i })).toBeVisible();
    } finally {
      await sb.from("court_reminders").delete().eq("partner_promo_code", PROMO);
    }
  });

  test("non-bondsman dashboard suppresses forfeiture-shield cluster", async ({ page }) => {
    const genEmail = `qa-generic-${RUN_SUFFIX}@imnotanattorney.com`;
    const genPromo = `QAG${RUN_SUFFIX.toUpperCase().slice(0, 7)}`;
    await sb.from("partners").delete().eq("email", genEmail);
    const { data, error } = await sb.from("partners").insert({
      name: "QA Generic Partner",
      email: genEmail,
      phone: "+15550003333",
      promo_code: genPromo,
      source: "generic",
      status: "approved",
      commission_rate: 10,
      commission_tier: "partner",
    }).select("id").single();
    if (error) throw new Error(`generic setup: ${error.message}`);
    try {
      await authAs(page, data.id, `${BASE}/partner/dashboard`);
      expect(await page.getByText(/your forfeiture shield/i).count()).toBe(0);
      expect(await page.getByRole("heading", { name: /get that number off zero/i }).count()).toBe(0);
      await expect(page.getByRole("heading", { name: /bail packet insert/i })).toBeVisible();
    } finally {
      await sb.from("partner_sessions").delete().eq("partner_id", data.id);
      await sb.from("partners").delete().eq("id", data.id);
    }
  });

  // ── Partner branding dashboard ──────────────────────────────────────

  test("branding dashboard uses bondsman-voice copy + scope-boundary block", async ({ page }) => {
    if (!partnerId) throw new Error("setup failed");
    await authAs(page, partnerId, `${BASE}/partner/dashboard/branding`);
    await expect(page.getByRole("heading", { name: /your brand on the referral page/i })).toBeVisible();
    await expect(page.getByText(/You are not providing legal services/i)).toBeVisible();
    const file = page.locator('input[type="file"]');
    const accept = await file.getAttribute("accept");
    expect(accept || "").not.toContain("svg");
    expect(accept || "").toContain("png");
  });

  test("branding dashboard file input has accessible label", async ({ page }) => {
    if (!partnerId) throw new Error("setup failed");
    await authAs(page, partnerId, `${BASE}/partner/dashboard/branding`);
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();
    const id = await fileInput.getAttribute("id");
    const ariaLabel = await fileInput.getAttribute("aria-label");
    const ariaLabelledBy = await fileInput.getAttribute("aria-labelledby");
    const labelledViaFor = id
      ? (await page.locator(`label[for="${id}"]`).count()) > 0
      : false;
    expect(Boolean(ariaLabel) || Boolean(ariaLabelledBy) || labelledViaFor).toBeTruthy();
  });

  test("branding dashboard 'See it live' link uses noopener + noreferrer", async ({ page }) => {
    if (!partnerId) throw new Error("setup failed");
    await authAs(page, partnerId, `${BASE}/partner/dashboard/branding`);
    const link = page.getByRole("link", { name: /see it live/i });
    await expect(link).toBeVisible();
    const rel = (await link.getAttribute("rel")) || "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  // ── API security ────────────────────────────────────────────────────

  test("POST /api/partner/branding/upload rejects SVG at magic-byte sniff", async ({ request }) => {
    if (!partnerId) throw new Error("setup failed");
    const token = await createSession(partnerId);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await request.post(`${BASE}/api/partner/branding/upload`, {
      headers: { cookie: `partner-session=${token}` },
      multipart: {
        file: { name: "logo.svg", mimeType: "image/svg+xml", buffer: svg },
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const body = (await res.text()).toLowerCase();
    expect(body).toMatch(/svg|unsupported|not.*supported|image/);
  });

  test("PATCH /api/partner/branding/save rejects cross-partner logo_storage_path", async ({ request }) => {
    if (!partnerId || !partnerOtherId) throw new Error("setup failed");
    const token = await createSession(partnerId);
    const res = await request.patch(`${BASE}/api/partner/branding/save`, {
      headers: {
        cookie: `partner-session=${token}`,
        "content-type": "application/json",
      },
      data: { logo_storage_path: `${PROMO_OTHER}/logo.png` },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH /api/partner/branding/save rejects path traversal", async ({ request }) => {
    if (!partnerId) throw new Error("setup failed");
    const token = await createSession(partnerId);
    const res = await request.patch(`${BASE}/api/partner/branding/save`, {
      headers: {
        cookie: `partner-session=${token}`,
        "content-type": "application/json",
      },
      data: { logo_storage_path: `${PROMO}/../${PROMO_OTHER}/logo.png` },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH /api/partner/branding/save rejects javascript: website_url", async ({ request }) => {
    if (!partnerId) throw new Error("setup failed");
    const token = await createSession(partnerId);
    const res = await request.patch(`${BASE}/api/partner/branding/save`, {
      headers: {
        cookie: `partner-session=${token}`,
        "content-type": "application/json",
      },
      data: { website_url: "javascript:alert(1)" },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH /api/partner/branding/save rejects internal-address logo_url", async ({ request }) => {
    if (!partnerId) throw new Error("setup failed");
    const token = await createSession(partnerId);
    const res = await request.patch(`${BASE}/api/partner/branding/save`, {
      headers: {
        cookie: `partner-session=${token}`,
        "content-type": "application/json",
      },
      data: { logo_url: "http://169.254.169.254/latest/meta-data/" },
    });
    expect(res.status()).toBe(400);
  });

  // ── Mobile viewport ────────────────────────────────────────────────

  test("r/{code} renders without horizontal overflow on 375px viewport", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/r/${PROMO}`);
      await page.waitForLoadState("networkidle");
      const body = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth + 2);
    } finally {
      await ctx.close();
    }
  });

  // ── Partner FAQ split ──────────────────────────────────────────────

  test("/partners renders split FAQ — defendant benefit + commission ladder", async ({ page }) => {
    await page.goto(`${BASE}/partners`);
    await page.waitForLoadState("networkidle");
    const hasDefendantQ = (await page.getByText(/what does the defendant get from my link/i).count()) > 0;
    const hasCaseDecoder = (await page.getByText(/Case Decoder/i).count()) > 0;
    expect(hasDefendantQ || hasCaseDecoder).toBeTruthy();
    await expect(page.getByText(/10.*15.*20/).first()).toBeVisible();
  });

  test("/partners hero leads with bondsman outcome", async ({ page }) => {
    await page.goto(`${BASE}/partners`);
    await page.waitForLoadState("networkidle");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText(/your clients skip court/i);
  });

  // ── Partners terms UPL prohibition ──────────────────────────────────

  test("/partners/terms Section 4 forbids 'substitute for counsel' framing", async ({ page }) => {
    await page.goto(`${BASE}/partners/terms`);
    await page.waitForLoadState("networkidle");
    const cannotDo = page.locator("#cannot-do");
    await expect(cannotDo).toBeVisible();
    const txt = ((await cannotDo.textContent()) || "").toLowerCase();
    expect(txt).toMatch(/substitute for legal representation|substitute.*attorney|replaces hiring counsel/);
  });

  // ── Print collateral — BondsmanValueStack ──────────────────────────

  test("/partner/card shows BondsmanValueStack on screen", async ({ page }) => {
    if (!partnerId) throw new Error("setup failed");
    await authAs(page, partnerId, `${BASE}/partner/card`);
    await expect(page.getByRole("heading", { name: /what this is worth to you/i })).toBeVisible();
  });
});
