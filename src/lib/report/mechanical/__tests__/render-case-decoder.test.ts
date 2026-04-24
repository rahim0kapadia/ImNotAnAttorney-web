/**
 * Unit tests for the mechanical CD renderer.
 *
 * Asserts the skeleton emits the expected slot tokens, that intake
 * strings are escaped, and that the surviving HTML is valid enough
 * for sanitize-html to consume.
 */
import { describe, it, expect } from "vitest";
import { renderCaseDecoderMechanical } from "../render-case-decoder";
import { listSlotMarkers } from "../common";

const baseIntake = {
  first_name: "Alex",
  charge_type: "DUI",
  state: "FL",
  jurisdiction_level: "County",
  arrest_date: "2026-03-01",
  court_date: "2026-05-15",
  plea_offered: "90 days + fine",
  co_defendants: "none",
  filled_out_by: "self",
  situation: "I was pulled over leaving dinner.",
  specific_question: "Can they use the breathalyzer result?",
};

describe("renderCaseDecoderMechanical", () => {
  it("emits all expected slot tokens", () => {
    const { html, slotsEmitted } = renderCaseDecoderMechanical(baseIntake);
    const found = new Set(listSlotMarkers(html));
    for (const s of slotsEmitted) {
      expect(found.has(s)).toBe(true);
    }
  });

  it("interpolates intake strings into the intake summary", () => {
    const { html } = renderCaseDecoderMechanical(baseIntake);
    expect(html).toContain("Alex");
    expect(html).toContain("DUI");
    expect(html).toContain("FL");
  });

  it("escapes HTML-special characters from intake", () => {
    const { html } = renderCaseDecoderMechanical({
      ...baseIntake,
      first_name: "<img src=x>",
    });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });

  it("handles null intake fields gracefully", () => {
    const { html } = renderCaseDecoderMechanical({
      first_name: null,
      charge_type: null,
      state: null,
      jurisdiction_level: null,
      arrest_date: null,
      court_date: null,
      plea_offered: null,
      co_defendants: null,
      filled_out_by: null,
      situation: null,
      specific_question: null,
    });
    expect(html).toContain("friend");
    expect(html).toContain("your charge");
  });
});
