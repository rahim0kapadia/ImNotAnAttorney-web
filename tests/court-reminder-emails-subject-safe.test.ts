/**
 * Unit tests for subjectSafe() helper (A2).
 *
 * Covers the deferred-fix behavior: subject-line sanitation that strips
 * HTML-entity leakage (&amp; rendering literally in mail clients),
 * collapses whitespace, and caps length.
 */

import { describe, it, expect } from "vitest";
import {
  subjectSafe,
  reminder14d,
  reminder7d,
  reminder1d,
} from "@/lib/court-reminder-emails";

const baseCtx = {
  firstName: "Jane",
  chargeType: "other",
  courtDate: "2026-06-01",
  token: "t",
};

describe("subjectSafe", () => {
  it("decodes HTML entities so they don't render literally", () => {
    expect(subjectSafe("John &amp; Jane")).toBe("John & Jane");
    expect(subjectSafe("Mary &#39;O'Brien&#39;")).toBe("Mary 'O'Brien'");
    expect(subjectSafe("foo &lt;bar&gt;")).toBe("foo bar"); // angle brackets stripped
  });

  it("strips < and > characters to prevent header injection", () => {
    expect(subjectSafe("Attack<script>")).toBe("Attackscript");
  });

  it("collapses whitespace", () => {
    expect(subjectSafe("a    b\n\tc")).toBe("a b c");
  });

  it("caps length at default 40 chars", () => {
    const long = "x".repeat(100);
    expect(subjectSafe(long).length).toBe(40);
  });

  it("honors explicit max length", () => {
    expect(subjectSafe("abcdefghij", 5)).toBe("abcde");
  });

  it("preserves normal text unchanged", () => {
    expect(subjectSafe("Jane Doe")).toBe("Jane Doe");
    expect(subjectSafe("O'Brien")).toBe("O'Brien");
  });
});

describe("reminder subject lines sanitize user-supplied countyState", () => {
  it("reminder14d strips HTML entities from countyState in subject", () => {
    const { subject } = reminder14d({ ...baseCtx, countyState: "Smith &amp; Jones County" });
    expect(subject).toBe("Your court date is in 2 weeks, Smith & Jones County");
    expect(subject).not.toMatch(/&amp;/);
  });

  it("reminder7d strips HTML entities from countyState in subject", () => {
    const { subject } = reminder7d({ ...baseCtx, countyState: "O&#39;Brien County" });
    expect(subject).toBe("1 week until your court date, O'Brien County");
    expect(subject).not.toMatch(/&#39;/);
  });

  it("reminder1d strips HTML entities from countyState in subject", () => {
    const { subject } = reminder1d({ ...baseCtx, countyState: "Foo &lt;Bar&gt;" });
    expect(subject).toBe("Tomorrow: Foo Bar Court");
    expect(subject).not.toMatch(/&lt;|&gt;/);
  });

  it("falls back to 'your county' when countyState is the Unknown sentinel", () => {
    const { subject } = reminder14d({ ...baseCtx, countyState: "Unknown County" });
    expect(subject).toBe("Your court date is in 2 weeks, your county");
  });
});
