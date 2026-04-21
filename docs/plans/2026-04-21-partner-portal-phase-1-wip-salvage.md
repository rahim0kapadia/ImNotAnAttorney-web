# Partner Portal Pristine — Phase 1: WIP Salvage + Regression Guardrails

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Parent design:** `docs/plans/2026-04-21-partner-portal-pristine-design.md`

**Goal:** Start the pristine pass from a clean, tested baseline. Rescue the two safe pieces of the `fix/vercel-r-code-refactor` WIP, discard the four regressive pieces, and add regression tests that make it structurally impossible to silently remove `getPartnerByCode` / `validatePartnerSession` / dashboard-API brand fields or the middleware `x-pathname` header ever again.

**Architecture:**
- Extract the partner-brand column list into a single shared constant (`PARTNER_BRAND_COLUMNS`) so the SELECT string, the return type, and the regression test all reference one source of truth — drift becomes structurally impossible.
- Regression tests mock the Supabase admin client to capture `.select()` arguments and assert brand columns are present (the admin client is untyped, so tsc alone can't catch SELECT-string drift).
- Middleware regression test: unit-test `NextResponse` header-setting by calling the middleware with a mock request.

**Tech Stack:** Vitest 4.x (globals), Next.js 15 App Router, Supabase JS client (untyped admin), TypeScript 5.

**Current branch state at plan start:**
- You are on `docs/partner-portal-pristine-design` (which is `master` + one design-doc commit).
- `master` tip = `8d40ba5`.
- `fix/vercel-r-code-refactor` has 2 clean commits ahead of master (`bef9b60` fix tests, `2dca313` docs architecture).
- Stash `stash@{0}` holds the 6 WIP files labeled `partner-portal-wip-salvage-candidate-2026-04-21`.

---

## Task 1: Create Phase 1 branch + clean baseline

**Files:**
- No file changes. Git operations only.

**Step 1:** Verify you're on the design branch with a clean working tree (ignoring untracked).

Run: `git status --short`
Expected: no `M ` or `A ` lines for tracked files (untracked `??` lines are fine).

**Step 2:** Check out `master` and create Phase 1 branch.

Run: `git checkout master && git checkout -b fix/partner-wip-salvage`
Expected: `Switched to a new branch 'fix/partner-wip-salvage'`

**Step 3:** Cherry-pick the two clean commits from `fix/vercel-r-code-refactor` (test fixes + architecture docs) — they're clean output from the completed refactor and should ride with this phase.

Run: `git cherry-pick bef9b60 2dca313`
Expected: two successful cherry-picks, no conflicts. If conflicts arise, **STOP** and ask — the cleanliness assumption was wrong.

**Step 4:** Verify TS + tests still pass after the cherry-picks.

Run: `npx tsc --noEmit --skipLibCheck`
Expected: clean exit.

Run: `npx vitest run`
Expected: all existing tests pass (~249).

**Step 5:** No commit this task. Cherry-picks are already commits.

- [ ] Task 1 complete

---

## Task 2: Extract `PARTNER_BRAND_COLUMNS` constant (DRY the source of truth)

**Files:**
- Create: `src/lib/partner-brand-columns.ts`

**Step 1: Write the failing test first.**

Create: `src/lib/__tests__/partner-brand-columns.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { PARTNER_BRAND_COLUMNS, PARTNER_BRAND_SELECT } from "../partner-brand-columns";

describe("PARTNER_BRAND_COLUMNS", () => {
  it("includes every partner-branding column consumed by OG images and PartnerBrandedShell", () => {
    expect(PARTNER_BRAND_COLUMNS).toEqual([
      "logo_url",
      "logo_storage_path",
      "brand_color_primary",
      "brand_color_accent",
      "brand_color_bg",
      "brand_color_source",
      "website_url",
      "brand_contrast_passed",
      "brand_updated_at",
    ]);
  });

  it("PARTNER_BRAND_SELECT returns a comma-joined SELECT fragment", () => {
    expect(PARTNER_BRAND_SELECT).toBe(
      "logo_url, logo_storage_path, brand_color_primary, brand_color_accent, brand_color_bg, brand_color_source, website_url, brand_contrast_passed, brand_updated_at"
    );
  });
});
```

**Step 2: Run test to verify it fails.**

Run: `npx vitest run src/lib/__tests__/partner-brand-columns.test.ts`
Expected: FAIL — "Cannot find module '../partner-brand-columns'".

**Step 3: Create the module with minimal implementation.**

Create: `src/lib/partner-brand-columns.ts`
```ts
/**
 * Single source of truth for the partner-branding column list.
 *
 * Consumed by:
 *   - `getPartnerByCode` in `src/lib/partner-by-code.ts` (drives OG images
 *     at `/r/[code]/opengraph-image.tsx` and `/r/[code]/[product]/opengraph-image.tsx`
 *     plus `PartnerBrandedShell` rendered in `/r/[code]/page.tsx`)
 *   - `validatePartnerSession` in `src/lib/partner-auth.ts` (drives
 *     `/partner/dashboard/branding/page.tsx` which reads every field)
 *   - `/api/partner/dashboard/route.ts` response body
 *
 * If you're tempted to remove a column: one of the consumers above will
 * silently break (Supabase admin client is untyped — tsc will NOT catch it).
 * Instead, remove from here AND every consumer in the same commit, or add a
 * data migration. The regression tests in `partner-brand-columns.test.ts`
 * and per-caller tests pin this list.
 */

export const PARTNER_BRAND_COLUMNS = [
  "logo_url",
  "logo_storage_path",
  "brand_color_primary",
  "brand_color_accent",
  "brand_color_bg",
  "brand_color_source",
  "website_url",
  "brand_contrast_passed",
  "brand_updated_at",
] as const;

export type PartnerBrandColumn = (typeof PARTNER_BRAND_COLUMNS)[number];

export const PARTNER_BRAND_SELECT = PARTNER_BRAND_COLUMNS.join(", ");
```

**Step 4: Run test to verify it passes.**

Run: `npx vitest run src/lib/__tests__/partner-brand-columns.test.ts`
Expected: PASS (2/2).

**Step 5: Commit.**

```bash
git add src/lib/partner-brand-columns.ts src/lib/__tests__/partner-brand-columns.test.ts
git commit -m "feat(partner): PARTNER_BRAND_COLUMNS constant — single source of truth

Consumed by getPartnerByCode, validatePartnerSession, dashboard API.
Supabase admin is untyped; drift between SELECT + consumer type was
invisible to tsc. Constant + unit test makes drift structurally
impossible."
```

- [ ] Task 2 complete

---

## Task 3: Regression test + refactor for `getPartnerByCode`

**Files:**
- Create: `src/lib/__tests__/partner-by-code.test.ts`
- Modify: `src/lib/partner-by-code.ts`

**Step 1: Write failing test that captures the SELECT argument.**

Create: `src/lib/__tests__/partner-by-code.test.ts`
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_BRAND_COLUMNS } from "../partner-brand-columns";

const capturedSelects: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        capturedSelects.push(cols);
        return {
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        };
      },
    }),
  }),
}));

describe("getPartnerByCode", () => {
  beforeEach(() => {
    capturedSelects.length = 0;
  });

  it("SELECT string includes every PARTNER_BRAND_COLUMNS entry", async () => {
    // Clear the React.cache for this code so the mock sees the call
    const { getPartnerByCode } = await import("../partner-by-code");
    await getPartnerByCode("TESTCODE1");

    expect(capturedSelects).toHaveLength(1);
    const select = capturedSelects[0];
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(select).toContain(col);
    }
  });

  it("SELECT string includes partner identity columns", async () => {
    const { getPartnerByCode } = await import("../partner-by-code");
    await getPartnerByCode("TESTCODE2");

    const select = capturedSelects[0];
    expect(select).toContain("id");
    expect(select).toContain("promo_code");
    expect(select).toContain("status");
    expect(select).toContain("check_in_enabled");
  });
});
```

**Step 2: Run test to verify it fails.**

Run: `npx vitest run src/lib/__tests__/partner-by-code.test.ts`
Expected: PASS already (the current `partner-by-code.ts` still has the brand columns). That's fine — this is a **regression guard**, pinning correct behavior so future refactors can't silently drift.

If it unexpectedly fails, investigate before proceeding.

**Step 3: Refactor `partner-by-code.ts` to use the shared constant.**

Modify: `src/lib/partner-by-code.ts`
```ts
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPromoCode } from "@/lib/promo-code";
import { PARTNER_BRAND_SELECT } from "@/lib/partner-brand-columns";

export const getPartnerByCode = cache(async (code: string) => {
  if (!isValidPromoCode(code)) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select(
      `id, name, company, city, promo_code, status, check_in_enabled, flip_at, ${PARTNER_BRAND_SELECT}`
    )
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data;
});
```

**Step 4: Run test to verify it still passes.**

Run: `npx vitest run src/lib/__tests__/partner-by-code.test.ts`
Expected: PASS (2/2). The refactor didn't change behavior, just factored the SELECT.

**Step 5: Commit.**

```bash
git add src/lib/partner-by-code.ts src/lib/__tests__/partner-by-code.test.ts
git commit -m "test(partner): regression guard on getPartnerByCode brand columns

Mocks the admin client to capture .select() args and asserts every
PARTNER_BRAND_COLUMNS entry is present. Refactors partner-by-code.ts
to interpolate PARTNER_BRAND_SELECT — drift becomes structurally
impossible."
```

- [ ] Task 3 complete

---

## Task 4: Regression test + refactor for `validatePartnerSession`

**Files:**
- Create: `src/lib/__tests__/partner-auth-session.test.ts`
- Modify: `src/lib/partner-auth.ts:161` (the SELECT string inside `validatePartnerSession`)

**Step 1: Write failing regression test.**

Create: `src/lib/__tests__/partner-auth-session.test.ts`
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_BRAND_COLUMNS } from "../partner-brand-columns";

const capturedSelects: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const chainable = {
      from: (table: string) => ({
        select: (cols: string) => {
          capturedSelects.push(`${table}::${cols}`);
          return {
            eq: () => chainable.from(table).select(cols),
            gt: () => chainable.from(table).select(cols),
            limit: () => chainable.from(table).select(cols),
            maybeSingle: async () => ({
              data: { partner_id: "test-partner-id" },
              error: null,
            }),
            single: async () => ({ data: null, error: new Error("stop") }),
          };
        },
      }),
    };
    return chainable;
  },
}));

describe("validatePartnerSession", () => {
  beforeEach(() => {
    capturedSelects.length = 0;
  });

  it("partners SELECT includes every PARTNER_BRAND_COLUMNS entry", async () => {
    const { validatePartnerSession } = await import("../partner-auth");
    await validatePartnerSession("fake-session-token");

    const partnersSelect = capturedSelects.find((s) =>
      s.startsWith("partners::")
    );
    expect(partnersSelect, "expected a SELECT on partners").toBeTruthy();
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(partnersSelect).toContain(col);
    }
  });
});
```

**Step 2: Run test to verify it passes on current code (regression guard).**

Run: `npx vitest run src/lib/__tests__/partner-auth-session.test.ts`
Expected: PASS. If it fails, the mock chain shape is wrong — adjust to match the actual Supabase JS fluent API.

**Step 3: Refactor `partner-auth.ts` to interpolate the shared constant in the SELECT.**

Modify: `src/lib/partner-auth.ts` — inside `validatePartnerSession`, change the partners select line from a hand-maintained string to interpolated use of `PARTNER_BRAND_SELECT`.

At top of file, add:
```ts
import { PARTNER_BRAND_SELECT } from "@/lib/partner-brand-columns";
```

In the function body, change:
```ts
const { data: partner, error: partnerError } = await supabase
  .from("partners")
  .select("id, name, email, phone, company, city, promo_code, commission_rate, commission_tier, status, preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, total_referrals, total_commission, total_paid_out, notification_prefs, source, check_in_enabled, flip_at, logo_url, logo_storage_path, brand_color_primary, brand_color_accent, brand_color_bg, brand_color_source, website_url, brand_contrast_passed, brand_updated_at")
```

to:
```ts
const { data: partner, error: partnerError } = await supabase
  .from("partners")
  .select(
    `id, name, email, phone, company, city, promo_code, commission_rate, commission_tier, status, preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, total_referrals, total_commission, total_paid_out, notification_prefs, source, check_in_enabled, flip_at, ${PARTNER_BRAND_SELECT}`
  )
```

Leave the explicit return-type annotation alone (still enumerates every field — that's load-bearing for consumers' tsc checks).

**Step 4: Run test + tsc.**

Run: `npx vitest run src/lib/__tests__/partner-auth-session.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit --skipLibCheck`
Expected: clean.

**Step 5: Commit.**

```bash
git add src/lib/partner-auth.ts src/lib/__tests__/partner-auth-session.test.ts
git commit -m "test(partner): regression guard on validatePartnerSession brand columns

Interpolates PARTNER_BRAND_SELECT into the partners SELECT; unit test
captures the select arg and asserts every brand column present."
```

- [ ] Task 4 complete

---

## Task 5: Regression test for dashboard API brand fields in response

**Files:**
- Create: `src/app/api/partner/dashboard/__tests__/dashboard-brand-fields.test.ts`
  (or `tests/api/partner-dashboard-brand-fields.test.ts` — match existing convention; check with `ls tests/api 2>/dev/null || ls src/app/api`)

**Step 1: Locate the existing dashboard-route test convention.**

Run: `find . -maxdepth 6 -type f -name "*.test.ts" -path "*dashboard*" 2>/dev/null; find tests -type d 2>/dev/null`
Decide: put new test in `tests/api/partner-dashboard-brand-fields.test.ts` if `tests/api/` exists; otherwise in `src/app/api/partner/dashboard/__tests__/brand-fields.test.ts`.

**Step 2: Write the test — assert the route's response shape includes brand fields.**

```ts
import { describe, it, expect, vi } from "vitest";
import { PARTNER_BRAND_COLUMNS } from "@/lib/partner-brand-columns";

vi.mock("@/lib/partner-auth", () => ({
  validatePartnerSession: async () => ({
    id: "p1",
    name: "Test Partner",
    email: "t@example.com",
    phone: null,
    company: "Co",
    city: "City",
    promo_code: "TESTCODE",
    commission_rate: 0.1,
    commission_tier: "partner",
    status: "approved",
    preferred_payment_method: null,
    payment_zelle: null,
    payment_venmo: null,
    payment_check_address: null,
    payment_paypal: null,
    total_referrals: 0,
    total_commission: 0,
    total_paid_out: 0,
    notification_prefs: null,
    source: null,
    check_in_enabled: false,
    flip_at: null,
    logo_url: "https://example.com/logo.png",
    logo_storage_path: "partners/p1/logo.png",
    brand_color_primary: "#112233",
    brand_color_accent: "#445566",
    brand_color_bg: "#000000",
    brand_color_source: "manual",
    website_url: "https://example.com",
    brand_contrast_passed: true,
    brand_updated_at: "2026-04-21T00:00:00Z",
  }),
  PARTNER_SESSION_COOKIE: "partner_session",
}));

// Additional mocks: createAdminClient for any earnings/referrals lookup the
// route performs. Review `src/app/api/partner/dashboard/route.ts` to identify
// all Supabase calls and stub them with empty-data fixtures.

describe("GET /api/partner/dashboard response shape", () => {
  it("response.partner includes every PARTNER_BRAND_COLUMNS field", async () => {
    // Import lazily so mocks apply first
    const { GET } = await import("@/app/api/partner/dashboard/route");
    const req = new Request("http://localhost/api/partner/dashboard", {
      headers: { cookie: "partner_session=fake-token" },
    });
    // Next's NextRequest typing — cast or construct minimally
    const res = await GET(req as never);
    const body = await res.json();
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(body.partner).toHaveProperty(col);
    }
  });
});
```

**Step 3: Adjust the test until it passes against the current (correct) code.**

The mock surface must cover every Supabase call the route makes. If the test fails with a mock-shape error, read `src/app/api/partner/dashboard/route.ts` top-to-bottom and stub every `from().select()...` chain it calls.

Run: `npx vitest run <path-to-new-test>`
Expected: PASS.

**Step 4: Commit.**

```bash
git add <path-to-new-test>
git commit -m "test(partner): regression guard on /api/partner/dashboard brand fields

Asserts response.partner includes every PARTNER_BRAND_COLUMNS field.
Future refactors that silently drop brand from the response body
will fail this test."
```

- [ ] Task 5 complete

---

## Task 6: Regression test for middleware `x-pathname` header

**Files:**
- Create: `src/__tests__/middleware-x-pathname.test.ts` (or wherever middleware tests live — check with `find . -maxdepth 4 -name "middleware*.test.ts"`)

**Step 1: Write the test.**

```ts
import { describe, it, expect } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("middleware x-pathname coupling", () => {
  it("sets x-pathname on request headers (consumed by app/layout.tsx)", async () => {
    const req = new NextRequest("https://imnotanattorney.com/r/TESTCODE");
    const res = await middleware(req);
    // NextResponse.next({ request: { headers } }) surfaces the rewritten
    // request headers via the `x-middleware-request-...` mechanism.
    // Inspect the request headers attached to the response:
    const pathname = res.headers.get("x-middleware-request-x-pathname");
    expect(pathname).toBe("/r/TESTCODE");
  });

  it("sets x-pathname on non-referral routes too", async () => {
    const req = new NextRequest("https://imnotanattorney.com/partner/dashboard");
    const res = await middleware(req);
    const pathname = res.headers.get("x-middleware-request-x-pathname");
    expect(pathname).toBe("/partner/dashboard");
  });
});
```

Note: the exact response header name for middleware-forwarded request headers depends on Next.js internals. If `x-middleware-request-x-pathname` doesn't work, alternative: inspect `res.headers.get("x-pathname")` directly, OR test by spying on `NextResponse.next` via vi.mock. Adjust during step 2 if needed.

**Step 2: Run test, adjust mock/assertion approach if needed.**

Run: `npx vitest run src/__tests__/middleware-x-pathname.test.ts`
Expected: PASS after assertion tuning. If the middleware has auth or redirect branches that fire first on `/partner/dashboard`, mock those or use a route the middleware passes through cleanly.

**Step 3: Add a coupling comment at the middleware write-site.**

Modify: `src/middleware.ts` — at both places that set `x-pathname`, add above the line:
```ts
// CONSUMED BY: src/app/layout.tsx reads x-pathname to decide whether to
// render global chrome (suppressed on partner-branded /r/[code]/* routes).
// If you remove this header, partner-branded routes will double-render the
// skip link. Do not remove without updating layout.tsx in the same commit.
requestHeaders.set("x-pathname", pathname);
```

**Step 4: Verify tests + tsc.**

Run: `npx vitest run src/__tests__/middleware-x-pathname.test.ts && npx tsc --noEmit --skipLibCheck`
Expected: green.

**Step 5: Commit.**

```bash
git add src/__tests__/middleware-x-pathname.test.ts src/middleware.ts
git commit -m "test(middleware): regression guard on x-pathname header

x-pathname is consumed by app/layout.tsx to suppress global chrome on
partner-branded routes. Coupling was invisible in the codebase (no
cross-reference). Adds a regression test and an inline comment at the
write-site naming the consumer."
```

- [ ] Task 6 complete

---

## Task 7: Apply safe WIP — `promo-code.ts` type guard

**Files:**
- Modify: `src/lib/promo-code.ts`
- Create: `src/lib/__tests__/promo-code.test.ts`

**Step 1: Write failing test.**

Create: `src/lib/__tests__/promo-code.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { isValidPromoCode, PROMO_CODE_REGEX } from "../promo-code";

describe("isValidPromoCode", () => {
  it("accepts alphanumeric 2-20 chars (case-insensitive)", () => {
    expect(isValidPromoCode("ab")).toBe(true);
    expect(isValidPromoCode("BAIL123")).toBe(true);
    expect(isValidPromoCode("ABCDEFGHIJ1234567890")).toBe(true); // 20
  });

  it("rejects too short / too long / punctuation", () => {
    expect(isValidPromoCode("a")).toBe(false);
    expect(isValidPromoCode("ABCDEFGHIJ12345678901")).toBe(false); // 21
    expect(isValidPromoCode("BAIL-123")).toBe(false);
    expect(isValidPromoCode("BAIL 123")).toBe(false);
  });

  it("is a type guard — rejects non-string input", () => {
    expect(isValidPromoCode(null as unknown)).toBe(false);
    expect(isValidPromoCode(undefined as unknown)).toBe(false);
    expect(isValidPromoCode(123 as unknown)).toBe(false);
    expect(isValidPromoCode({} as unknown)).toBe(false);
  });
});
```

**Step 2: Run — the last `describe` block will fail on current code.**

Run: `npx vitest run src/lib/__tests__/promo-code.test.ts`
Expected: FAIL on the type-guard case (current `isValidPromoCode` takes `string` so passing `null` would throw at `.test`).

**Step 3: Apply the safe WIP piece — tighten to a type guard.**

Modify: `src/lib/promo-code.ts` to:
```ts
export const PROMO_CODE_REGEX = /^[A-Z0-9]{2,20}$/i;
export function isValidPromoCode(code: unknown): code is string {
  return typeof code === "string" && PROMO_CODE_REGEX.test(code);
}
```

**Step 4: Run — all pass.**

Run: `npx vitest run src/lib/__tests__/promo-code.test.ts && npx tsc --noEmit --skipLibCheck`
Expected: green.

**Step 5: Commit.**

```bash
git add src/lib/promo-code.ts src/lib/__tests__/promo-code.test.ts
git commit -m "feat(promo-code): tighten isValidPromoCode to type guard

Unknown-typed input (from URL params, webhook bodies) no longer
throws at the regex call. Salvaged from fix/vercel-r-code-refactor WIP."
```

- [ ] Task 7 complete

---

## Task 8: Apply safe WIP — `referral-product-map.ts` key narrow

**Files:**
- Modify: `src/lib/referral-product-map.ts`
- Create: `src/lib/__tests__/referral-product-map.test.ts`

**Step 1: Write failing test.**

Create: `src/lib/__tests__/referral-product-map.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { resolveReferralProduct, REFERRAL_PRODUCT_MAP } from "../referral-product-map";

describe("resolveReferralProduct", () => {
  it("resolves every REFERRAL_PRODUCT_MAP key to its mapped slug", () => {
    for (const [slug, expected] of Object.entries(REFERRAL_PRODUCT_MAP)) {
      expect(resolveReferralProduct(slug)).toBe(expected);
    }
  });

  it("is case-insensitive on input", () => {
    expect(resolveReferralProduct("X-RAY")).toBe("x-ray");
    expect(resolveReferralProduct("Case-Decoder")).toBe("case-decoder");
    expect(resolveReferralProduct("DUI")).toBe("dui-first-offense");
  });

  it("returns null for unmapped slug", () => {
    expect(resolveReferralProduct("unknown-product")).toBeNull();
    expect(resolveReferralProduct("")).toBeNull();
  });
});
```

**Step 2: Run — should already pass (behavior unchanged).**

Run: `npx vitest run src/lib/__tests__/referral-product-map.test.ts`
Expected: PASS.

**Step 3: Apply the WIP's type narrowing (the behavior doesn't change; the change is pure type tightening).**

Modify: `src/lib/referral-product-map.ts` `resolveReferralProduct` to:
```ts
export function resolveReferralProduct(slug: string): TierSlug | null {
  const key = slug.toLowerCase() as keyof typeof REFERRAL_PRODUCT_MAP;
  return REFERRAL_PRODUCT_MAP[key] ?? null;
}
```

**Step 4: Verify green.**

Run: `npx vitest run src/lib/__tests__/referral-product-map.test.ts && npx tsc --noEmit --skipLibCheck`
Expected: green.

**Step 5: Commit.**

```bash
git add src/lib/referral-product-map.ts src/lib/__tests__/referral-product-map.test.ts
git commit -m "refactor(referral): narrow REFERRAL_PRODUCT_MAP key type

Salvaged from fix/vercel-r-code-refactor WIP. Adds coverage that pins
every map entry resolves + case-insensitive + null fallback."
```

- [ ] Task 8 complete

---

## Task 9: Drop the stash (WIP fully accounted for)

**Files:** no changes — stash hygiene.

**Step 1: Verify the stash no longer has anything we want.**

Run: `git stash show -p stash@{0} | head -80`
Confirm: every line in the stash diff matches one of:
- promo-code.ts type guard — ALREADY applied in Task 7.
- referral-product-map.ts narrow — ALREADY applied in Task 8.
- partner-auth.ts brand removal — DISCARDED (we kept brand fields).
- partner-by-code.ts brand removal — DISCARDED.
- dashboard/route.ts brand removal — DISCARDED.
- middleware.ts x-pathname removal — DISCARDED.

If any line doesn't match the above, **STOP** and reconcile.

**Step 2: Drop the stash.**

Run: `git stash drop stash@{0}`
Expected: `Dropped stash@{0} (...)`.

**Step 3: Verify stash list is empty (or at least no `partner-portal-wip-salvage-candidate` entry).**

Run: `git stash list | grep partner || echo "clean"`
Expected: `clean`.

- [ ] Task 9 complete

---

## Task 10: Full verification + push + PR

**Step 1: Full test suite.**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: clean.

Run: `npx vitest run`
Expected: all tests green (prior ~249 + 6 new test files).

**Step 2: Smoke the partner routes locally (manual, 2 min).**

Run dev server in another terminal: `npm run dev`
Visit: `http://localhost:3000/r/BAIL123` (or any seeded test code)
Verify: page renders with partner branding if brand set, OG image tag points to `/r/BAIL123/opengraph-image`.
Visit the OG URL directly: should render 1200×630 PNG with partner branding.

If there's no test partner with branding in local DB, skip this step and rely on the unit-test coverage; document in PR description.

**Step 3: Push branch.**

Run: `git push -u origin fix/partner-wip-salvage`

**Step 4: Open PR.**

Run:
```bash
gh pr create --title "fix(partner): WIP salvage + regression guardrails (phase 1 of pristine pass)" --body "$(cat <<'EOF'
## Summary
- Salvages the two safe pieces of the `fix/vercel-r-code-refactor` WIP (`isValidPromoCode` type guard, `resolveReferralProduct` key narrow)
- Discards the four regressive pieces (brand-field removal from `getPartnerByCode`, `validatePartnerSession`, dashboard API; `x-pathname` removal from middleware)
- Extracts `PARTNER_BRAND_COLUMNS` as a single source of truth shared by all three consumers
- Adds regression tests that make future silent drift structurally impossible (SELECT-string capture + response-shape assertions + middleware header guard)
- Documents the hidden middleware→layout `x-pathname` coupling in code

Parent design: `docs/plans/2026-04-21-partner-portal-pristine-design.md`
Phase 1 of 4. Phases 2-4 (E2E coverage, hardening, copy/UX polish) ship on follow-up branches.

## Test plan
- [ ] `npx tsc --noEmit --skipLibCheck` clean
- [ ] `npx vitest run` green (including 6 new test files)
- [ ] Local smoke: `/r/[code]` renders with partner branding; `/r/[code]/opengraph-image` serves a branded PNG
- [ ] `/partner/dashboard/branding` still loads and reads brand fields

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 5: Close out.**

- [ ] Task 10 complete
- [ ] Phase 1 merged to master
- [ ] Delete stale `fix/vercel-r-code-refactor` branch after merge (no unique commits remain)

---

## Phase 1 exit criteria

- [ ] 6 new test files committed
- [ ] `PARTNER_BRAND_COLUMNS` constant referenced by `getPartnerByCode`, `validatePartnerSession`, and covered by dashboard API regression test
- [ ] Middleware `x-pathname` header has inline consumer comment + regression test
- [ ] All existing tests still green
- [ ] `tsc --noEmit` clean
- [ ] PR merged, Vercel prod auto-deployed, manual /r/[code] smoke passes

After Phase 1 merges, proceed to Phase 2 (`chore/partner-e2e-coverage`) — expand `docs/plans/2026-04-21-partner-portal-phase-2-e2e-coverage.md` (stub in parent design doc) into bite-sized tasks.
