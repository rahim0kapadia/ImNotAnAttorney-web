/**
 * Unit tests for `deriveArchetype` — pure helper exported from the verify
 * endpoint (src/app/api/checkout/verify/route.ts, Task 4 of
 * docs/plans/2026-04-27-immediate-download-v2.md).
 *
 * No DB / Stripe / network I/O — the function is pure logic.
 * test-isolation-na: pure-function tests, no Supabase writes
 *
 * vi.mock stubs prevent module-load throws from stripe.ts (requires
 * STRIPE_SECRET_KEY at import time) and supabase/admin.ts (requires
 * SUPABASE_* env vars). Neither is needed for deriveArchetype which is
 * pure logic with no external calls.
 */

import { describe, it, expect, vi } from "vitest";

// Must be hoisted above the route import so the module-load guard in
// stripe.ts does not throw before vi.mock replaces the module.
vi.mock("@/lib/stripe", () => ({
  stripeTest: {},
  stripeLive: null,
  stripe: {},
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ limited: false }),
}));

vi.mock("@/lib/request", () => ({
  getClientIp: () => "127.0.0.1",
}));

import { deriveArchetype } from "../route";

// ─────────────────────────────────────────────────────────────────────────────
// Archetype A — playbook digital-product (8 SKUs)
// ─────────────────────────────────────────────────────────────────────────────
describe("Archetype A — playbook digital-product", () => {
  const playbookSlugs = [
    "dui-first-offense",
    "drug-possession",
    "probation-violation",
    "white-collar",
    "sex-offense",
    "federal-criminal",
    "drug-trafficking",
    "self-defense",
  ] as const;

  it.each(playbookSlugs)(
    "returns 'A' for tier=%s with productType=digital-product",
    (slug) => {
      expect(
        deriveArchetype({
          tier: slug,
          productType: "digital-product",
          standaloneProductSlug: null,
          hasPrePopulatedIntake: false,
        })
      ).toBe("A");
    }
  );

  it("returns 'A' regardless of hasPrePopulatedIntake value", () => {
    expect(
      deriveArchetype({
        tier: "dui-first-offense",
        productType: "digital-product",
        standaloneProductSlug: null,
        hasPrePopulatedIntake: true,
      })
    ).toBe("A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Archetype E — service tier / add-on (7 slugs)
// ─────────────────────────────────────────────────────────────────────────────
describe("Archetype E — service tier and add-ons", () => {
  const serviceSlugs = [
    "case-decoder",
    "intelligence-brief",
    "x-ray",
    "war-room",
    "situation-room",
    "extra-witness",
    "witness-pack",
  ] as const;

  it.each(serviceSlugs)(
    "returns 'E' for service tier slug=%s",
    (slug) => {
      expect(
        deriveArchetype({
          tier: slug,
          productType: null,
          standaloneProductSlug: null,
          hasPrePopulatedIntake: false,
        })
      ).toBe("E");
    }
  );

  it("returns 'E' even when productType is provided alongside service tier", () => {
    // E branch checks the tier, not productType — verify branch priority
    expect(
      deriveArchetype({
        tier: "x-ray",
        productType: "standalone",
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBe("E");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Archetype B — Tier 9 standalone with pre-populated intake
// ─────────────────────────────────────────────────────────────────────────────
describe("Archetype B — Tier 9 standalone with pre-populated intake", () => {
  // All 5 archetype-B SKUs per plan §1.2 (instant report, no intake form)
  const archetypeBSlugs = [
    "judge-report-card",
    "officer-background-check",
    "similar-cases-analyzer",
    "district-court-intelligence",
    "arrest-survival-kit",
  ] as const;

  it.each(archetypeBSlugs)(
    "returns 'B' for Tier 9 slug=%s with hasPrePopulatedIntake=true",
    (slug) => {
      expect(
        deriveArchetype({
          tier: null,
          productType: "standalone",
          standaloneProductSlug: slug,
          hasPrePopulatedIntake: true,
        })
      ).toBe("B");
    }
  );

  // The 4 archetype-C SKUs also flip to B when metadata allows pre-pop.
  // The function only checks the boolean — no slug-level restriction on B.
  const archetypeCslugsWithPrePop = [
    "precedent-watchlist",
    "charge-authority-pack",
    "motion-success-report",
    "federal-jury-instruction-brief",
  ] as const;

  it.each(archetypeCslugsWithPrePop)(
    "returns 'B' for Tier 9 slug=%s when caller signals hasPrePopulatedIntake=true",
    (slug) => {
      expect(
        deriveArchetype({
          tier: null,
          productType: "standalone",
          standaloneProductSlug: slug,
          hasPrePopulatedIntake: true,
        })
      ).toBe("B");
    }
  );

  it("returns 'B' when tier is also provided (tier ignored for standalone path)", () => {
    expect(
      deriveArchetype({
        tier: "some-other-tier",
        productType: "standalone",
        standaloneProductSlug: "judge-report-card",
        hasPrePopulatedIntake: true,
      })
    ).toBe("B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Archetype C — Tier 9 standalone without pre-populated intake
// ─────────────────────────────────────────────────────────────────────────────
describe("Archetype C — Tier 9 standalone, intake required", () => {
  // federal-sentencing-distribution is the confirmed archetype-C SKU from v1 PR #213
  it("returns 'C' for federal-sentencing-distribution with hasPrePopulatedIntake=false", () => {
    expect(
      deriveArchetype({
        tier: null,
        productType: "standalone",
        standaloneProductSlug: "federal-sentencing-distribution",
        hasPrePopulatedIntake: false,
      })
    ).toBe("C");
  });

  // Any other Tier 9 slug without pre-pop metadata also resolves to C
  const otherTier9Slugs = [
    "judge-report-card",
    "officer-background-check",
    "similar-cases-analyzer",
    "district-court-intelligence",
    "arrest-survival-kit",
    "precedent-watchlist",
    "charge-authority-pack",
    "motion-success-report",
    "federal-jury-instruction-brief",
  ] as const;

  it.each(otherTier9Slugs)(
    "returns 'C' for Tier 9 slug=%s when hasPrePopulatedIntake=false",
    (slug) => {
      expect(
        deriveArchetype({
          tier: null,
          productType: "standalone",
          standaloneProductSlug: slug,
          hasPrePopulatedIntake: false,
        })
      ).toBe("C");
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Archetype D — non-Tier-9 standalone (needs intake)
// ─────────────────────────────────────────────────────────────────────────────
describe("Archetype D — non-Tier-9 standalone research products", () => {
  // A representative sample from the 27-slug archetype-D set (plan §1.2)
  const archetypeDSlugs = [
    "employment-impact",
    "license-risk",
    "immigration-impact",
    "breathalyzer-challenge",
    "fst-review",
    "plea-consequences",
    "drug-test-reliability",
    "bail-hearing-prep",
    "sentencing-prep",
    "expungement-research",
  ] as const;

  it.each(archetypeDSlugs)(
    "returns 'D' for standalone slug=%s (not in TIER9_SLUGS)",
    (slug) => {
      expect(
        deriveArchetype({
          tier: null,
          productType: "standalone",
          standaloneProductSlug: slug,
          hasPrePopulatedIntake: false,
        })
      ).toBe("D");
    }
  );

  it("returns 'D' even when hasPrePopulatedIntake=true (non-Tier-9 has no report path)", () => {
    expect(
      deriveArchetype({
        tier: null,
        productType: "standalone",
        standaloneProductSlug: "employment-impact",
        hasPrePopulatedIntake: true,
      })
    ).toBe("D");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// null edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe("null edge cases", () => {
  it("returns null when all inputs are null", () => {
    expect(
      deriveArchetype({
        tier: null,
        productType: null,
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });

  it("returns null when all inputs are undefined", () => {
    expect(
      deriveArchetype({
        tier: undefined,
        productType: undefined,
        standaloneProductSlug: undefined,
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });

  it("returns null for an unrecognized tier with no productType or slug", () => {
    expect(
      deriveArchetype({
        tier: "totally-unknown-tier",
        productType: null,
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });

  it("returns null when productType is digital-product but tier is not a playbook slug", () => {
    // A branch requires BOTH productType=digital-product AND tier in PLAYBOOK_SLUGS.
    // 'judge-report-card' is a Tier 9 STANDALONE slug — it is NOT in PLAYBOOK_SLUGS.
    // No other branch matches (productType !== 'standalone'), so result is null.
    expect(
      deriveArchetype({
        tier: "judge-report-card",
        productType: "digital-product",
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });

  it("returns null when productType is standalone but slug is absent", () => {
    // The B/C/D branch requires standaloneProductSlug to be truthy.
    expect(
      deriveArchetype({
        tier: null,
        productType: "standalone",
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });

  it("returns null for empty-string slug with standalone productType", () => {
    expect(
      deriveArchetype({
        tier: null,
        productType: "standalone",
        standaloneProductSlug: "",
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });

  it("A branch does not fire when productType is missing even with playbook tier", () => {
    // productType must be 'digital-product' to reach A
    expect(
      deriveArchetype({
        tier: "dui-first-offense",
        productType: null,
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Branch priority — A before E before B/C/D
// ─────────────────────────────────────────────────────────────────────────────
describe("branch priority ordering", () => {
  it("A wins over E: playbook tier with digital-product type beats service-tier check", () => {
    // 'dui-first-offense' is NOT in SERVICE_TIER_SLUGS, so E branch never fires,
    // but this confirms A is evaluated first.
    expect(
      deriveArchetype({
        tier: "dui-first-offense",
        productType: "digital-product",
        standaloneProductSlug: null,
        hasPrePopulatedIntake: false,
      })
    ).toBe("A");
  });

  it("E fires before B/C/D: service tier with standalone productType still returns E", () => {
    // Even if productType is 'standalone', the tier check for E runs before B/C/D.
    expect(
      deriveArchetype({
        tier: "case-decoder",
        productType: "standalone",
        standaloneProductSlug: "judge-report-card",
        hasPrePopulatedIntake: true,
      })
    ).toBe("E");
  });

  it("D fires before null when standalone productType present with non-Tier9 slug", () => {
    expect(
      deriveArchetype({
        tier: null,
        productType: "standalone",
        standaloneProductSlug: "collateral-consequences",
        hasPrePopulatedIntake: false,
      })
    ).toBe("D");
  });
});
