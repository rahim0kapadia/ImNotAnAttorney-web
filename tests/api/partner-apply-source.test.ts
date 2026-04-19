/**
 * POST /api/partners/apply — source allowlist + checkInMode validation.
 *
 * Fix #10 Task 4 deltas:
 *   - Unknown `source` value rejects with 400 "Invalid source"
 *   - source="bondsman" without checkInMode rejects with 400
 *     "Please pick how you work with clients"
 *   - source="bondsman" with invalid checkInMode rejects the same way
 *
 * Only the rate-limiter and admin client are mocked — validation fires BEFORE
 * any DB or email work, so we never hit the heavier mocks other route tests
 * need. Matches the lean style of tests/api/cron-check-in-filter.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase admin stub. Provides every chained method the route uses. Validation
// rejections fire before any DB call, but the "passes validation" tests walk
// through the full DB path; the stub has to keep resolving.
vi.mock("@/lib/supabase/admin", () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: "partner_test_1", promo_code: "TEST" }, error: null }),
      then: (fn: (x: unknown) => unknown) => fn({ data: null, error: null }),
    };
    return chain;
  }
  return {
    createAdminClient: () => ({
      from: () => makeChain(),
      rpc: async () => ({ data: null, error: null }),
    }),
  };
});

// Rate-limit stub — always allows the request through.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ limited: false }),
}));

// Email stub — only called if we reach the DB write phase, which these tests
// do not, but the import must resolve.
vi.mock("@/lib/email", () => ({
  sendEmail: async () => ({ ok: true }),
  escapeHtml: (s: string) => s,
}));

// Referral imports @/lib/stripe which throws at module init when
// STRIPE_SECRET_KEY is unset. Stub the referral surface the route uses so the
// import chain never reaches the live Stripe module.
vi.mock("@/lib/referral", () => ({
  createPartnerPromoCode: async () => ({ id: "promo_test_1" }),
  sanitizePromoCode: (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""),
}));

// Partner auth imports JWT secrets at module init — stub the surface we need.
vi.mock("@/lib/partner-auth", () => ({
  generateMagicLink: async () => ({ token: "test-token" }),
}));

vi.mock("@/lib/partner-emails", () => ({
  partnerWelcomeEmail: () => ({ subject: "Welcome", html: "<p>ok</p>" }),
}));

import { POST } from "@/app/api/partners/apply/route";
import { NextRequest } from "next/server";

function postBody(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/partners/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/partners/apply source allowlist", () => {
  it("rejects unknown source with 400 'Invalid source'", async () => {
    const res = await POST(
      postBody({
        name: "Test Partner",
        email: "test@example.com",
        compliance: true,
        source: "made-up",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid source");
  });

  it("accepts a valid source without checkInMode when source is not bondsman", async () => {
    // source='attorney' should pass validation past the source allowlist and
    // checkInMode guard, regardless of the DB outcome downstream. We only
    // assert the validation layer didn't trip.
    const res = await POST(
      postBody({
        name: "Test Attorney",
        email: "attorney@example.com",
        compliance: true,
        source: "attorney",
      })
    );
    // Any error at this point is NOT an "Invalid source" or mode-selection error.
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toBe("Invalid source");
      expect(body.error).not.toBe("Please pick how you work with clients");
    }
  });
});

describe("POST /api/partners/apply bondsman checkInMode guard", () => {
  it("rejects source='bondsman' without checkInMode (400)", async () => {
    const res = await POST(
      postBody({
        name: "Test Bondsman",
        email: "bondsman@example.com",
        compliance: true,
        source: "bondsman",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Please pick how you work with clients");
  });

  it("rejects source='bondsman' with invalid checkInMode value (400)", async () => {
    const res = await POST(
      postBody({
        name: "Test Bondsman",
        email: "bondsman@example.com",
        compliance: true,
        source: "bondsman",
        checkInMode: "maybe",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Please pick how you work with clients");
  });

  it("passes validation for source='bondsman' with checkInMode='enabled'", async () => {
    // Validation layer must let this through. DB/email downstream may fail
    // under these stubs, but the returned error (if any) is NOT the mode guard.
    const res = await POST(
      postBody({
        name: "Test Bondsman",
        email: "bondsman2@example.com",
        compliance: true,
        source: "bondsman",
        checkInMode: "enabled",
      })
    );
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toBe("Please pick how you work with clients");
      expect(body.error).not.toBe("Invalid source");
    }
  });

  it("passes validation for source='bondsman' with checkInMode='disabled'", async () => {
    const res = await POST(
      postBody({
        name: "Test Bondsman",
        email: "bondsman3@example.com",
        compliance: true,
        source: "bondsman",
        checkInMode: "disabled",
      })
    );
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toBe("Please pick how you work with clients");
      expect(body.error).not.toBe("Invalid source");
    }
  });
});
