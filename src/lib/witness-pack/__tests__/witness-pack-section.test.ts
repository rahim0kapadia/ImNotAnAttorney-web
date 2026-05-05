// src/lib/witness-pack/__tests__/witness-pack-section.test.ts
import { describe, it, expect } from "vitest";
import { renderWitnessPackSection } from "../witness-pack-section";
import type { WitnessProfileResult } from "@/lib/cross-corpus/witness-profile";

function makeResult(overrides: Partial<WitnessProfileResult> = {}): WitnessProfileResult {
  return {
    meta: { generatedAt: "2026-05-05T12:00:00.000Z", table: "classified_opinions" },
    state: "FL",
    chargeType: "dui",
    witnesses: [
      { name: "Officer Martinez", case_count: 12 },
      { name: "Jane Smith", case_count: 3 },
    ],
    experts: [{ name: "Dr. BAC Expert", case_count: 5 }],
    sample_size: 47,
    ...overrides,
  };
}

describe("renderWitnessPackSection", () => {
  it("SC-1: outputs Witnesses section header when data is present", () => {
    const md = renderWitnessPackSection(makeResult());
    expect(md).toContain("## Witnesses");
  });

  it("renders witness names and case counts in a table", () => {
    const md = renderWitnessPackSection(makeResult());
    expect(md).toContain("Officer Martinez");
    expect(md).toContain("12");
    expect(md).toContain("Jane Smith");
    expect(md).toContain("3");
  });

  it("renders expert witnesses section", () => {
    const md = renderWitnessPackSection(makeResult());
    expect(md).toContain("### Expert Witnesses");
    expect(md).toContain("Dr. BAC Expert");
    expect(md).toContain("5");
  });

  it("shows insufficient-data message when sample_size < 2", () => {
    const md = renderWitnessPackSection(
      makeResult({ sample_size: 1, witnesses: [], experts: [] })
    );
    expect(md).toContain("Insufficient case sample");
    expect(md).not.toContain("### Common Witnesses");
  });

  it("shows no-witnesses message when witnesses array is empty but sample is large enough", () => {
    const md = renderWitnessPackSection(
      makeResult({ witnesses: [], sample_size: 10 })
    );
    expect(md).toContain("No recurring witness names");
  });

  it("passes UPL guard — contains disclaimer footer", () => {
    const md = renderWitnessPackSection(makeResult());
    expect(md).toContain("not legal advice");
  });

  it("throws on UPL-banned phrase in data", () => {
    // Simulate a hypothetical upstream rendering bug injecting a banned phrase
    // We test the guard by passing a result where witness name contains banned text
    const badResult = makeResult({
      witnesses: [{ name: "you should hire", case_count: 5 }],
    });
    // The UPL guard checks the final rendered markdown
    expect(() => renderWitnessPackSection(badResult)).toThrow(/UPL violation/);
  });
});
