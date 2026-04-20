/**
 * Server-side rendering tests for <BridgePage /> (Task 16, bondsman-modes v2).
 *
 * Verifies:
 *   - referral-mode line (court-date reminders + walkthrough) renders only
 *     when checkInEnabled=false
 *   - outcome-tangible CTA ("See My Case's Questions") replaces the old
 *     "Take Back Control of Your Case" copy
 *   - daysUntilCourt > 0 renders the countdown hint with correct
 *     pluralization ("1 day" vs "5 days")
 *
 * Follows the zero-new-deps pattern from CourtReminderForm-compact.test.tsx:
 * react-dom/server renderToStaticMarkup, no jsdom, no @testing-library.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { BridgePage } from "@/components/BridgePage";

function render(props: React.ComponentProps<typeof BridgePage>): string {
  return renderToStaticMarkup(React.createElement(BridgePage, props));
}

const baseProps = {
  partnerName: "Jane Partner",
  company: "ABC Bail Bonds",
  city: "Tampa",
  promoCode: "TESTPROMO",
};

describe("<BridgePage /> mode-aware rendering", () => {
  it("renders referral-mode line when checkInEnabled=false", () => {
    const html = render({ ...baseProps, checkInEnabled: false });

    // Referral-mode nudge must be present
    expect(html).toContain("court-date reminders and a walkthrough");
    expect(html).toContain("what to expect at your hearing");
  });

  it("omits referral-mode line when checkInEnabled=true (default)", () => {
    const html = render({ ...baseProps });

    expect(html).not.toContain("court-date reminders and a walkthrough");
    expect(html).not.toContain("what to expect at your hearing");
  });

  it("omits referral-mode line when checkInEnabled is explicitly true", () => {
    const html = render({ ...baseProps, checkInEnabled: true });

    expect(html).not.toContain("court-date reminders and a walkthrough");
  });

  it("renders the operator-voice CTA and drops the old 'Take Back Control' copy", () => {
    const html = render({ ...baseProps });

    // Current CTA post-referral-flow rewrite (09b39b2). The prior
    // "See My Case's Questions" variant was replaced with the brand tagline.
    expect(html).toContain("Know what they know");
    // Old CTAs must be gone.
    expect(html).not.toContain("Take Back Control");
    expect(html).not.toMatch(/See My Case(?:&#x27;|&apos;|')s Questions/);
  });

  // NOTE: `daysUntilCourt` prop + countdown block were removed from
  // BridgePage in commit ad72ef1 (check_in_enabled wiring refactor). The
  // previously-colocated pluralization + omit-when-missing tests were
  // deleted 2026-04-19 along with the stale prop. Re-add here only if
  // the countdown is ever reintroduced as a BridgePage concern.

  it("includes partner display name in referral attribution", () => {
    const html = render({ ...baseProps });
    // "Jane Partner from ABC Bail Bonds, Tampa" should appear in the hero
    // and in the discount attribution line.
    expect(html).toContain("Jane Partner from ABC Bail Bonds, Tampa");
    // Discount copy (09b39b2 rewrote from "10% off case analysis is built in"
    // to operator-voice "10% is already taken off before you see any price").
    expect(html).toContain("10% is already taken off before you see any price");
  });

  it("links to /r/<promoCode>/quiz on the CTA", () => {
    const html = render({ ...baseProps, promoCode: "ABC123" });
    expect(html).toContain('href="/r/ABC123/quiz"');
  });

  it("renders partnerName alone when company and city are null", () => {
    const html = render({
      partnerName: "Jordan",
      company: null,
      city: null,
      promoCode: "TESTPROMO",
    });
    // Name renders, but no "from" attribution since there's no company.
    expect(html).toContain("Jordan");
    expect(html).not.toContain("Jordan from");
    // Discount attribution still names the partner (operator-voice rewrite
    // replaced "Because Jordan sent you" with "Jordan put you on the…" line).
    expect(html).toContain("Jordan put you on the partner-referral list");
  });

  it("renders 'Name from Company' without city when company is set but city is null", () => {
    const html = render({
      partnerName: "Jordan",
      company: "ABC Bail Bonds",
      city: null,
      promoCode: "TESTPROMO",
    });
    expect(html).toContain("Jordan from ABC Bail Bonds");
    // No trailing comma + city.
    expect(html).not.toContain("Jordan from ABC Bail Bonds,");
  });
});
