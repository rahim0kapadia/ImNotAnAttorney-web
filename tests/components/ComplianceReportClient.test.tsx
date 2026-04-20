/**
 * Server-rendering test for <ComplianceReportClient /> mode gating
 * (Task 27, bondsman modes v2).
 *
 * Invariants locked here:
 *   - checkInMode="disabled" MUST NOT render the specific check-in-feature
 *     strings the component emits: "check-in compliance" (enabled intro),
 *     "last check-in" / "check-in source" (table columns/labels), "set by
 *     bondsman" / "set by client" (source attribution), "compliance rate"
 *     (stat card). Generic words like "check-in"/"missed"/"schedule" are
 *     too broad — the referral-mode intro itself says "Check-in workflows
 *     are off." so a bare .not.toContain("check-in") would false-positive.
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
    // Assert against the SPECIFIC phrases the component emits in enabled mode,
    // not bare words. "check-in" / "missed" / "schedule" are too broad —
    // "Check-in workflows are off." is the referral-mode intro itself.
    //
    // Enabled-only strings (grep ComplianceReportClient.tsx for each):
    expect(html).not.toContain("check-in compliance"); // enabled intro
    expect(html).not.toContain("compliance rate");     // StatCard label
    expect(html).not.toContain("last check-in");       // table header
    expect(html).not.toContain("set by bondsman");     // check_in_source label
    expect(html).not.toContain("set by client");       // check_in_source label
    // The enabled-mode "Check-Ins" StatCard + table header must also be absent.
    // Rendered HTML is lowercased above, so compare against the lowercase form.
    expect(html).not.toContain(">check-ins<");         // header/label cell
  });

  it("referral mode (disabled): renders the referral-mode intro copy", () => {
    const html = render("disabled");
    // Tier B bondsman-modes-v2 rewrote the intro as operator-first voice.
    // Referral-mode intro is distinguishable by "48-hour, 24-hour, and
    // morning-of" cadence (check-in mode doesn't mention specific windows).
    expect(html).toContain("automated court-date reminder program");
    expect(html).toContain("48-hour, 24-hour, and morning-of");
    // Must NOT render the check-in-enabled intro branch.
    expect(html).not.toContain("active compliance program");
    expect(html).not.toContain("Check-in mode is on");
  });

  it("check-in mode (enabled): renders the check-in compliance intro copy", () => {
    const html = render("enabled");
    // Enabled-mode intro distinctive phrases (Tier B rewrite).
    expect(html).toContain("active compliance program");
    expect(html).toContain("Check-in mode is on");
    // Check-in summary columns present (uppercase in thead).
    expect(html).toContain("Check-Ins");
    expect(html).toContain("Compliance");
    // Must NOT render the referral-mode intro branch.
    expect(html).not.toContain("automated court-date reminder program");
    expect(html).not.toContain("48-hour, 24-hour, and morning-of");
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
