/**
 * Server-rendering tests for mode-aware first templates in:
 *   - <MessageTemplates /> (check-in first template vs referral-first template)
 *   - <CreativeAssets /> (verbal one-liner for check-ins vs bail desk)
 *
 * Tracks fix-#10 review delta: the first-template label MUST switch on
 * `checkInEnabled`, and neither file should leak the wrong mode's copy.
 *
 * Zero-new-deps — react-dom/server renderToStaticMarkup, no jsdom.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { MessageTemplates } from "@/components/MessageTemplates";
import { CreativeAssets } from "@/components/partner/CreativeAssets";

const baseProps = {
  promoCode: "TESTPROMO",
  referralUrl: "https://example.com/r/TESTPROMO",
};

function renderMessages(checkInEnabled: boolean): string {
  return renderToStaticMarkup(
    React.createElement(MessageTemplates, { ...baseProps, checkInEnabled })
  );
}

function renderCreative(checkInEnabled: boolean): string {
  return renderToStaticMarkup(
    React.createElement(CreativeAssets, { ...baseProps, checkInEnabled })
  );
}

describe("<MessageTemplates /> mode-aware first-template switch", () => {
  it("check-in mode shows the 'Add to your check-in text' first template", () => {
    const html = renderMessages(true);
    expect(html).toContain("Add to your check-in text");
    // Referral-first label must NOT appear when check-in is enabled.
    expect(html).not.toContain("After the bail packet hand-off");
  });

  it("referral mode shows the 'After the bail packet hand-off' first template", () => {
    const html = renderMessages(false);
    expect(html).toContain("After the bail packet hand-off");
    expect(html).not.toContain("Add to your check-in text");
  });

  it("shared templates render in both modes", () => {
    const on = renderMessages(true);
    const off = renderMessages(false);
    for (const html of [on, off]) {
      expect(html).toContain("Quick share");
      expect(html).toContain("For someone else");
    }
  });
});

describe("<CreativeAssets /> mode-aware verbal one-liner switch", () => {
  it("check-in mode shows the 'Verbal One-Liner (for check-ins)' template", () => {
    const html = renderCreative(true);
    expect(html).toContain("Verbal One-Liner (for check-ins)");
    expect(html).not.toContain("Verbal One-Liner (at the bail desk)");
  });

  it("referral mode shows the 'Verbal One-Liner (at the bail desk)' template", () => {
    const html = renderCreative(false);
    expect(html).toContain("Verbal One-Liner (at the bail desk)");
    expect(html).not.toContain("Verbal One-Liner (for check-ins)");
  });

  it("shared social/email templates render in both modes", () => {
    const on = renderCreative(true);
    const off = renderCreative(false);
    for (const html of [on, off]) {
      expect(html).toContain("X (Twitter) Post");
      expect(html).toContain("Facebook Post");
      expect(html).toContain("Intro Email");
      expect(html).toContain("Follow-Up Email");
    }
  });
});
