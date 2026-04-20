/**
 * Unit tests for subjectSafe() helper (A2).
 *
 * Covers the deferred-fix behavior: subject-line sanitation that strips
 * HTML-entity leakage (&amp; rendering literally in mail clients),
 * collapses whitespace, and caps length.
 */

import { describe, it, expect } from "vitest";
import { subjectSafe } from "@/lib/court-reminder-emails";

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
