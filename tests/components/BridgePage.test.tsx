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

  it("renders outcome-tangible CTA and drops the old 'Take Back Control' copy", () => {
    const html = render({ ...baseProps });

    // New CTA — apostrophe may serialize as raw ' or as &#x27; depending
    // on react-dom/server version, so match via regex that accepts both.
    expect(html).toMatch(/See My Case(?:&#x27;|&apos;|')s Questions/);
    // Old CTA must be gone
    expect(html).not.toContain("Take Back Control");
  });

  it("renders daysUntilCourt pluralization correctly", () => {
    const html1 = render({ ...baseProps, daysUntilCourt: 1 });
    expect(html1).toContain("Your court date is 1 day away.");
    expect(html1).not.toContain("1 days");

    const html5 = render({ ...baseProps, daysUntilCourt: 5 });
    expect(html5).toContain("Your court date is 5 days away.");
  });

  it("omits countdown hint when daysUntilCourt is undefined or <= 0", () => {
    const htmlUndef = render({ ...baseProps });
    expect(htmlUndef).not.toContain("Your court date is");

    const htmlZero = render({ ...baseProps, daysUntilCourt: 0 });
    expect(htmlZero).not.toContain("Your court date is");

    const htmlNeg = render({ ...baseProps, daysUntilCourt: -3 });
    expect(htmlNeg).not.toContain("Your court date is");
  });

  it("includes partner display name in referral attribution", () => {
    const html = render({ ...baseProps });
    // "Jane Partner from ABC Bail Bonds, Tampa" should appear in the hero
    // and in the discount attribution line.
    expect(html).toContain("Jane Partner from ABC Bail Bonds, Tampa");
    // Discount copy
    expect(html).toContain("10% off case analysis is built in");
  });

  it("links to /r/<promoCode>/quiz on the CTA", () => {
    const html = render({ ...baseProps, promoCode: "ABC123" });
    expect(html).toContain('href="/r/ABC123/quiz"');
  });
});
