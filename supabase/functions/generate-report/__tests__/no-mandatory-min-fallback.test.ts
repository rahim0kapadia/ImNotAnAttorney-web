/**
 * Regression lock for the mandatory_minimum NULL→"None" hallucination.
 *
 * Audit 2026-04-24 found that 80% of jurisdiction_statutes rows have NULL
 * mandatory_minimum, but the previous fallback `|| "None"` rendered
 * "Mandatory Minimum: None" — a confident factual claim where truth was
 * "we don't know yet". For DUI/drug/firearms charges that's potentially
 * life-altering misinformation (federal cocaine distribution HAS mandatory
 * minimums; state statutes vary).
 *
 * The fix: omit the Mandatory Minimum line entirely when the column is
 * NULL, instead of rendering "None". The model can't assert facts about
 * data we don't have.
 *
 * This test is a static-content lock: re-introducing the bad pattern in
 * the Deno function will fail this test at vitest time.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SOURCE = path.resolve(
  __dirname,
  "..",
  "index.ts",
);

describe("generate-report Edge Function — mandatory_minimum hallucination guard", () => {
  it("does NOT use `|| \"None\"` fallback on mandatory_minimum", () => {
    const src = fs.readFileSync(SOURCE, "utf-8");
    // Must not contain the previous bug pattern.
    const banned = /mandatory_minimum\s*\|\|\s*["']None["']/i;
    expect(banned.test(src)).toBe(false);
  });

  it("does NOT use `|| \"none\"` (case-insensitive) on mandatory_minimum", () => {
    const src = fs.readFileSync(SOURCE, "utf-8");
    const banned = /mandatory_minimum\s*\|\|\s*["']none["']/i;
    expect(banned.test(src)).toBe(false);
  });

  it("guards Mandatory Minimum line behind a truthy check", () => {
    const src = fs.readFileSync(SOURCE, "utf-8");
    // The current implementation should look something like
    // `if (statute.mandatory_minimum) { chargeLines.push(...) }`
    // Lock that the line is NEVER pushed unconditionally.
    const unconditionalPush =
      /chargeLines\.push\([^)]*Mandatory Minimum/;
    const guardedPush =
      /if\s*\(\s*statute\.mandatory_minimum\s*\)\s*{[\s\S]*?chargeLines\.push\([^)]*Mandatory Minimum/;
    if (unconditionalPush.test(src)) {
      expect(guardedPush.test(src)).toBe(true);
    }
  });
});
