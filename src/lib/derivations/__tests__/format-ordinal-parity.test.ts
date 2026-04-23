/**
 * Tier-ladder Worry-to-Pristine R2-S7 closure: Node/Deno parity test for
 * formatOrdinal.
 *
 * Two implementations exist by necessity:
 *   - src/lib/derivations/constants.ts (Node)
 *   - supabase/functions/generate-report/index.ts (Deno)
 *
 * Edge Functions are Deno and can't import Node modules cleanly, so the
 * function is mirrored rather than shared. This test locks the shape so
 * drift between them fails at PR review.
 *
 * Pattern matches whitelist-parity.test.ts (Phase 2 round-2 S2 precedent).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatOrdinal as nodeFormatOrdinal } from "@/lib/derivations/constants";

// Extract the Deno copy by reading the Edge Function source + parsing the
// function body. Must stay in sync with the regex below if the function
// signature changes.
function loadDenoFormatOrdinal(): (n: number) => string {
  const edgePath = resolve(
    __dirname,
    "../../../../supabase/functions/generate-report/index.ts",
  );
  const src = readFileSync(edgePath, "utf8");
  const match = src.match(
    /function formatOrdinal\(n: number \| string\): string \{([\s\S]*?)\n\}/,
  );
  if (!match) {
    throw new Error(
      "formatOrdinal not found in Edge Function — signature changed; update regex",
    );
  }
  // Strip TS annotations inside the body so new Function can parse it.
  const body = match[1]
    .replace(/: number \| string/g, "")
    .replace(/: number/g, "")
    .replace(/: string/g, "");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function("n", body) as (n: number) => string;
}

describe("formatOrdinal Node/Deno parity (R2-S7)", () => {
  const denoFormatOrdinal = loadDenoFormatOrdinal();

  it("matches across 0..200 (covers all teen + tens + edge-case ranges)", () => {
    for (let n = 0; n <= 200; n++) {
      expect(denoFormatOrdinal(n)).toBe(nodeFormatOrdinal(n));
    }
  });

  it("matches the documented anchor cases", () => {
    const anchors: Array<[number, string]> = [
      [1, "1st"],
      [2, "2nd"],
      [3, "3rd"],
      [4, "4th"],
      [11, "11th"],
      [12, "12th"],
      [13, "13th"],
      [21, "21st"],
      [22, "22nd"],
      [23, "23rd"],
      [101, "101st"],
      [111, "111th"],
      [121, "121st"],
    ];
    for (const [n, expected] of anchors) {
      expect(nodeFormatOrdinal(n)).toBe(expected);
      expect(denoFormatOrdinal(n)).toBe(expected);
    }
  });

  it("both copies handle non-finite input by stringifying", () => {
    expect(nodeFormatOrdinal(Number.NaN)).toBe("NaN");
    expect(denoFormatOrdinal(Number.NaN as unknown as number)).toBe("NaN");
    expect(nodeFormatOrdinal(Number.POSITIVE_INFINITY)).toBe("Infinity");
    expect(denoFormatOrdinal(Number.POSITIVE_INFINITY as unknown as number)).toBe(
      "Infinity",
    );
  });
});
