/**
 * Server-side rendering test for <CourtReminderForm /> in compact-mode.
 *
 * Verifies review-deltas on commit 31faf161:
 *   - compact + requireConsent + requirePhone hides charge/county/checkin fields
 *   - phone + consent inputs render when requirePhone + requireConsent are on
 *   - consent checkbox has id="consent" + aria-describedby="consent-desc"
 *   - phone input has inputMode numeric + pattern + maxLength
 *
 * Uses react-dom/server (no jsdom, no @testing-library dep) — project doesn't
 * install either, bootstrap-mode keeps this test zero-new-deps.
 */

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

// CheckInDayPicker only renders in non-compact flow but is imported at module
// scope. Stub it so the component tree doesn't have to resolve it.
vi.mock("@/components/partner/CheckInDayPicker", () => ({
  CheckInDayPicker: () => null,
}));

import { CourtReminderForm } from "@/components/CourtReminderForm";

function render(props: React.ComponentProps<typeof CourtReminderForm>): string {
  return renderToStaticMarkup(React.createElement(CourtReminderForm, props));
}

describe("<CourtReminderForm /> compact-mode rendering", () => {
  it("hides charge + county + check-in picker when compactMode=true", () => {
    const html = render({
      partnerPromoCode: "TESTPROMO",
      compactMode: true,
      requirePhone: true,
      requireConsent: true,
    });

    // Charge picker select element must not be present
    expect(html).not.toContain('id="chargeType"');
    expect(html).not.toContain("Select your charge type");

    // County & State input must not be present
    expect(html).not.toContain('id="countyState"');
    expect(html).not.toContain("County &amp; State");
    expect(html).not.toContain("County & State");

    // Check-in picker label must not be present
    expect(html).not.toContain("What days does your bondsman want you to check in?");
    expect(html).not.toContain("I don&apos;t know");
    expect(html).not.toContain("I don't know");
  });

  it("renders phone input with numeric inputMode + pattern + maxLength when requirePhone=true", () => {
    const html = render({
      partnerPromoCode: "TESTPROMO",
      compactMode: true,
      requirePhone: true,
      requireConsent: true,
    });

    expect(html).toContain('id="phone"');
    expect(html).toContain('type="tel"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('maxLength="20"');
    // Pattern attr — regex contents can vary slightly on escape, match the key chars.
    expect(html).toMatch(/pattern="[^"]*0-9[^"]*"/);
  });

  it("renders consent checkbox with id=consent and aria-describedby=consent-desc", () => {
    const html = render({
      partnerPromoCode: "TESTPROMO",
      compactMode: true,
      requirePhone: true,
      requireConsent: true,
    });

    expect(html).toContain('id="consent"');
    expect(html).toContain('for="consent"');
    expect(html).toContain('aria-describedby="consent-desc"');
    expect(html).toContain('id="consent-desc"');
    expect(html).toContain("I agree to SMS and email communications");
  });

  it("omits phone + consent when their require flags are false", () => {
    const html = render({
      partnerPromoCode: "TESTPROMO",
      compactMode: true,
      requirePhone: false,
      requireConsent: false,
    });
    expect(html).not.toContain('id="phone"');
    expect(html).not.toContain('id="consent"');
  });
});
