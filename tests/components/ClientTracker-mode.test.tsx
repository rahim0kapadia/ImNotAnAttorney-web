/**
 * Server-rendering test for <ClientTracker /> under both bondsman-modes v2 states.
 *
 * Invariant: thead column count MUST match the per-row tbody cell count in BOTH
 * checkInEnabled=true and checkInEnabled=false modes, or table rendering gets
 * misaligned (Task 24, fix #9 of bondsman modes v2).
 *
 * Uses react-dom/server + a tiny HTML scan — project doesn't install jsdom or
 * testing-library, bootstrap-mode keeps this test zero-new-deps (matches
 * CourtReminderForm-compact.test.tsx convention).
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { ClientTracker } from "@/components/partner/ClientTracker";

interface SampleClient {
  id: string;
  token: string;
  first_name: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  status: string;
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  check_in_days: string[] | null;
  check_in_source: string | null;
}

const sampleClient: SampleClient = {
  id: "c_1",
  token: "t_1",
  first_name: "Alex",
  charge_type: "dui",
  county_state: "Pinellas, FL",
  court_date: "2099-12-31",
  status: "active",
  reminders_sent: [],
  created_at: "2026-04-18T00:00:00Z",
  converted_at: null,
  check_in_days: ["monday", "wednesday", "friday"],
  check_in_source: "partner",
};

function render(checkInEnabled: boolean): string {
  return renderToStaticMarkup(
    React.createElement(ClientTracker, {
      clients: [sampleClient],
      onAddClient: () => {},
      checkInSummary: { c_1: { count: 2, lastCheckIn: "2026-04-18T12:00:00Z" } },
      checkInEnabled,
    }),
  );
}

/**
 * Count occurrences of a regex in a string without relying on String.matchAll's
 * iterator cost. Uses a literal global regex walk — cheaper than matchAll for
 * short test HTML.
 */
function count(html: string, pattern: RegExp): number {
  let n = 0;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while (re.exec(html) !== null) n++;
  return n;
}

describe("<ClientTracker /> column-count invariants (bondsman-modes v2)", () => {
  it("referral mode: thead column count equals per-row tbody cell count", () => {
    const html = render(false);
    const headers = count(html, /<th\b/g);
    const cells = count(html, /<td\b/g);
    const rows = count(html, /<tr\b/g);
    // rows = 1 header row + 1 body row
    expect(rows).toBe(2);
    // One body row means cells per row = total cells / body rows.
    expect(headers).toBeGreaterThan(0);
    expect(cells).toBe(headers);
  });

  it("check-in mode: thead column count equals per-row tbody cell count", () => {
    const html = render(true);
    const headers = count(html, /<th\b/g);
    const cells = count(html, /<td\b/g);
    const rows = count(html, /<tr\b/g);
    expect(rows).toBe(2);
    expect(headers).toBeGreaterThan(0);
    expect(cells).toBe(headers);
  });

  it("check-in mode has exactly two more columns than referral mode", () => {
    const referralHeaders = count(render(false), /<th\b/g);
    const checkInHeaders = count(render(true), /<th\b/g);
    expect(checkInHeaders - referralHeaders).toBe(2);
  });

  it("all thead cells carry scope=\"col\"", () => {
    const html = render(true);
    const headers = count(html, /<th\b/g);
    const scoped = count(html, /<th\b[^>]*scope="col"/g);
    expect(scoped).toBe(headers);
  });

  it("partner-source client shows Lucide Star (svg) with sr-only label", () => {
    const html = render(true);
    // Lucide renders an <svg> with lucide class. sr-only sibling is the paired label.
    expect(html).toContain("Set by partner");
    expect(html.toLowerCase()).toMatch(/<svg[^>]*lucide/);
  });

  it("last-check-in date uses text-zinc-400 (contrast fix), not text-zinc-600", () => {
    const html = render(true);
    // Ensure no zinc-600 text-xs pair remains in the cell.
    expect(html).not.toMatch(/text-zinc-600 text-xs/);
  });
});
