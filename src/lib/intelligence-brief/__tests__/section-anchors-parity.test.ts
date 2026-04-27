/**
 * T2.1 parity test (worry-attorney-discipline-wire v2.4) — keep Deno-side
 * canonical and Node-side mirror lockstep for IB section heading anchors.
 *
 * Pattern mirrors src/lib/report/__tests__/whitelist-parity.test.ts: read the
 * Deno-side file as text (the Node toolchain cannot import a Deno-only TS file
 * directly), parse the literal map, then deep-equal against the Node mirror.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { IB_SECTION_ANCHORS as NODE_ANCHORS } from "../section-anchors";

function parseDenoAnchors(): Record<string, string> {
  const path = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "supabase",
    "functions",
    "generate-report",
    "lib",
    "section-anchors.ts",
  );
  const src = readFileSync(path, "utf8");
  const start = src.indexOf("export const IB_SECTION_ANCHORS");
  if (start < 0) throw new Error("Deno IB_SECTION_ANCHORS not found");
  const open = src.indexOf("{", start);
  const close = src.indexOf("} as const", open);
  if (open < 0 || close < 0) throw new Error("Deno anchor map malformed");
  const body = src.slice(open + 1, close);

  const out: Record<string, string> = {};
  // Match KEY:  "value", but skip lines whose first non-whitespace is `//`
  // (true line-comments). Inline `// ...` after the literal is also tolerated
  // because the regex stops at the closing quote of the value.
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return out;
}

describe("IB_SECTION_ANCHORS parity (Deno ↔ Node)", () => {
  it("Deno-side canonical and Node-side mirror have identical entries", () => {
    const deno = parseDenoAnchors();
    expect(deno).toEqual(NODE_ANCHORS);
  });

  it("ATTORNEY_DISCIPLINE anchor is the new section heading", () => {
    expect(NODE_ANCHORS.ATTORNEY_DISCIPLINE).toBe(
      "Your Attorney's Public Bar Record",
    );
  });

  it("BRADY_GIGLIO_APPENDIX is the deterministic lower-order bound", () => {
    expect(NODE_ANCHORS.BRADY_GIGLIO_APPENDIX).toBe(
      "Appendix A: Brady/Giglio Checklist",
    );
  });
});
