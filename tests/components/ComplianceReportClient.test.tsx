/**
 * Server-rendering test for <ComplianceReportClient /> mode gating
 * (Task 27, bondsman modes v2).
 *
 * Invariants locked here:
 *   - checkInMode="disabled" MUST NOT render the words "check-in",
 *     "missed", or "schedule" anywhere in the output (case-insensitive).
 *   - checkInMode="disabled" renders the referral-mode intro copy that
 *     points at court-date reminder activity + "Referral mode".
 *   - checkInMode="enabled" renders the full bondsman-mode intro that
 *     includes "check-in compliance".
 *
 * Zero-new-deps pattern: react-dom/server renderToStaticMarkup, no jsdom,
 * no @testing-library — matches ClientTracker-mode.test.tsx convention.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { ComplianceReportClient } from "@/app/partner/compliance-report/ComplianceReportClient";

type ComplianceClient = React.ComponentProps<
  typeof ComplianceReportClient
>["clients"][number];

const partner = {
  name: "QA Bondsman",
  company: "QA Bail Bonds",
  promo_code: "QABOND",
};

const sampleClient: ComplianceClient = {
  id: "c_1",
  first_name: "Alex",
  charge_type: "dui",
  county_state: "Pinellas, FL",
  court_date: "2099-12-31",
  status: "active",
  reminders_sent: ["reminder_7d"],
  created_at: "2026-04-01T00:00:00Z",
  converted_at: null,
  check_in_days: ["monday", "wednesday", "friday"],
  check_in_source: "partner",
};

function render(checkInMode: "enabled" | "disabled"): string {
  return renderToStaticMarkup(
    React.createElement(ComplianceReportClient, {
      partner,
      checkInMode,
      clients: [sampleClient],
      checkIns: [
        { court_reminder_id: "c_1", checked_in_at: "2026-04-10T12:00:00Z" },
      ],
    }),
  );
}

describe("<ComplianceReportClient /> mode gating (bondsman-modes v2)", () => {
  it("referral mode (disabled): omits all check-in-specific strings", () => {
    const html = render("disabled").toLowerCase();
    // The referral-mode intro mentions "check-in workflows are off" — that's
    // allowed and expected. To keep the invariant tight we scan the HTML
    // EXCLUDING the known referral-mode intro sentence and then check that
    // no other "check-in" / "missed" / "schedule" strings remain.
    const referralIntro =
      "this report shows court-date reminder activity across your clients. your account is in referral mode. check-in workflows are off.";
    const stripped = html.split(referralIntro).join("");
    // Now the stripped markup MUST NOT mention check-in features.
    expect(stripped).not.toContain("check-in");
    expect(stripped).not.toContain("missed");
    expect(stripped).not.toContain("schedule");
    // Column headers that are check-in-specific MUST be absent.
    expect(stripped).not.toContain("compliance rate");
    expect(stripped).not.toContain("last check-in");
  });

  it("referral mode (disabled): renders the referral-mode intro copy", () => {
    const html = render("disabled");
    expect(html).toContain("Your account is in Referral mode.");
    expect(html).toContain("Check-in workflows are off.");
    // Must NOT render the check-in-enabled intro branch.
    expect(html).not.toContain("check-in compliance");
  });

  it("check-in mode (enabled): renders the check-in compliance intro copy", () => {
    const html = render("enabled");
    expect(html).toContain("check-in compliance");
    // Summary card present.
    expect(html).toContain("Check-Ins");
    expect(html).toContain("Compliance Rate");
    // Must NOT render the referral-mode disclaimer.
    expect(html).not.toContain("Your account is in Referral mode.");
    expect(html).not.toContain("Check-in workflows are off.");
  });

  it("check-in mode has exactly 4 more table columns than referral mode", () => {
    // referral mode columns: Name, Charge, Court Date, Status, Reminders = 5
    // enabled mode adds:     Check-Ins, Last Check-In, Schedule, Compliance = +4
    const count = (s: string, re: RegExp): number => {
      const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let n = 0;
      while (r.exec(s) !== null) n++;
      return n;
    };
    const disabledHeaders = count(render("disabled"), /<th\b/g);
    const enabledHeaders = count(render("enabled"), /<th\b/g);
    expect(enabledHeaders - disabledHeaders).toBe(4);
  });
});
