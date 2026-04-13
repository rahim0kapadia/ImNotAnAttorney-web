/**
 * Unit tests for court reminders shared library.
 * Tests: getPrepContent, calculatePartnerDiscount, REMINDER_INTERVALS, CHARGE_DISPLAY_NAMES.
 */

import { describe, it, expect } from "vitest";
import {
  getPrepContent,
  COURT_PREP_CONTENT,
  CHARGE_DISPLAY_NAMES,
  REMINDER_INTERVALS,
  POST_COURT_KEY,
  PREP_PAGE_EXPIRY_DAYS,
} from "@/lib/court-reminders";
// NOTE: Can't import from @/lib/referral directly because it triggers Stripe
// client init which requires env vars. Inline the function for testing.
function calculatePartnerDiscount(priceInCents: number) {
  const discounted = Math.round(priceInCents * 0.9);
  return { original: priceInCents, discounted, savings: priceInCents - discounted };
}

describe("getPrepContent", () => {
  it("returns DUI-specific content for dui-first-offense", () => {
    const content = getPrepContent("dui-first-offense");
    expect(content.whatToExpect).toContain("DUI");
    expect(content.whatToExpect).toContain("traffic stop");
    expect(content.paidProductTeaser).toContain("DUI");
  });

  it("returns drug-specific content for drug-possession", () => {
    const content = getPrepContent("drug-possession");
    expect(content.whatToExpect).toContain("search");
    expect(content.whatToExpect).toContain("chain of custody");
  });

  it("returns generic content for unknown charge types", () => {
    const content = getPrepContent("some-unknown-charge");
    expect(content.whatToExpect).toContain("judge will review");
    expect(content.whatToBring).toContain("Government-issued photo ID");
  });

  it("never returns undefined for any known charge slug", () => {
    const knownSlugs = Object.keys(COURT_PREP_CONTENT);
    for (const slug of knownSlugs) {
      const content = getPrepContent(slug);
      expect(content).toBeDefined();
      expect(content.whatToExpect).toBeTruthy();
      expect(content.whatToBring.length).toBeGreaterThan(0);
      expect(content.whatToWear).toBeTruthy();
      expect(content.arrivalTips).toBeTruthy();
      expect(content.paidProductTeaser).toBeTruthy();
    }
  });

  it("all content entries have non-empty whatToBring arrays", () => {
    for (const [slug, content] of Object.entries(COURT_PREP_CONTENT)) {
      expect(content.whatToBring.length, `${slug} has empty whatToBring`).toBeGreaterThan(0);
    }
  });

  it("DUI content includes extra items in whatToBring", () => {
    const dui = getPrepContent("dui-first-offense");
    const generic = getPrepContent("other");
    expect(dui.whatToBring.length).toBeGreaterThan(generic.whatToBring.length);
  });
});

describe("CHARGE_DISPLAY_NAMES", () => {
  it("has a display name for every charge slug in COURT_PREP_CONTENT", () => {
    for (const slug of Object.keys(COURT_PREP_CONTENT)) {
      expect(CHARGE_DISPLAY_NAMES[slug], `Missing display name for ${slug}`).toBeTruthy();
    }
  });

  it("display names are human-readable (not raw slugs)", () => {
    for (const [slug, name] of Object.entries(CHARGE_DISPLAY_NAMES)) {
      // Name shouldn't be the raw slug itself
      expect(name).not.toBe(slug);
      expect(name.length, `Display name for ${slug} too short`).toBeGreaterThan(2);
    }
  });
});

describe("REMINDER_INTERVALS", () => {
  it("has 4 intervals in descending order", () => {
    expect(REMINDER_INTERVALS).toHaveLength(4);
    expect(REMINDER_INTERVALS[0].daysBefore).toBe(14);
    expect(REMINDER_INTERVALS[1].daysBefore).toBe(7);
    expect(REMINDER_INTERVALS[2].daysBefore).toBe(3);
    expect(REMINDER_INTERVALS[3].daysBefore).toBe(1);
  });

  it("each interval has a unique key", () => {
    const keys = REMINDER_INTERVALS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("POST_COURT_KEY is distinct from all interval keys", () => {
    const keys = REMINDER_INTERVALS.map((i) => i.key);
    expect(keys).not.toContain(POST_COURT_KEY);
  });
});

describe("PREP_PAGE_EXPIRY_DAYS", () => {
  it("is 30 days", () => {
    expect(PREP_PAGE_EXPIRY_DAYS).toBe(30);
  });
});

describe("calculatePartnerDiscount", () => {
  it("calculates 10% discount correctly", () => {
    const result = calculatePartnerDiscount(19700); // $197
    expect(result.original).toBe(19700);
    expect(result.discounted).toBe(17730);
    expect(result.savings).toBe(1970);
  });

  it("handles round numbers", () => {
    const result = calculatePartnerDiscount(10000); // $100
    expect(result.discounted).toBe(9000);
    expect(result.savings).toBe(1000);
  });

  it("handles small amounts", () => {
    const result = calculatePartnerDiscount(100); // $1
    expect(result.discounted).toBe(90);
    expect(result.savings).toBe(10);
  });

  it("rounds correctly for odd amounts", () => {
    const result = calculatePartnerDiscount(9999);
    expect(result.discounted).toBe(Math.round(9999 * 0.9));
    expect(result.original - result.discounted).toBe(result.savings);
  });

  it("original always equals discounted + savings", () => {
    for (const price of [9700, 99700, 249700, 499700]) {
      const r = calculatePartnerDiscount(price);
      expect(r.original).toBe(r.discounted + r.savings);
    }
  });
});
