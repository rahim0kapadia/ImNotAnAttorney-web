/**
 * T3.2a parity test (worry-attorney-discipline-wire v2.4) — keep Deno-side
 * canonical and Node-side mirror lockstep for the BANNED_PHRASES_BLOCK list
 * used by the IB UPL gate.
 *
 * Pattern matches src/lib/report/__tests__/whitelist-parity.test.ts: read the
 * Deno-side file as text, parse the literal array, then deep-equal against the
 * Node mirror (vitest is Node-only; cannot import a Deno-side module via
 * normal resolution).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BANNED_PHRASES_BLOCK as NODE_LIST } from "../banned-phrases";

function parseDenoList(): string[] {
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
    "banned-phrases.ts",
  );
  const src = readFileSync(path, "utf8");
  const start = src.indexOf("export const BANNED_PHRASES_BLOCK");
  if (start < 0) throw new Error("Deno BANNED_PHRASES_BLOCK not found");
  const open = src.indexOf("[", start);
  // Match closing `])` of `Object.freeze([ ... ])`.
  const close = src.indexOf("])", open);
  if (open < 0 || close < 0) throw new Error("Deno banned list malformed");
  const body = src.slice(open + 1, close);

  const out: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    // Match a string literal: "..." optionally followed by `,`.
    const m = trimmed.match(/^"((?:[^"\\]|\\.)*)"\s*,?\s*$/);
    if (m) out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return out;
}

describe("BANNED_PHRASES_BLOCK parity (Deno ↔ Node)", () => {
  it("Deno-side canonical and Node-side mirror are deep-equal", () => {
    const deno = parseDenoList();
    expect(deno).toEqual([...NODE_LIST]);
  });

  it("BANNED_PHRASES_BLOCK has at least 10 phrases (false-green guard)", () => {
    // Success Criterion 13 — guards against a future hand-edit emptying the
    // array and producing a vacuous pass.
    expect(NODE_LIST.length).toBeGreaterThanOrEqual(10);
  });

  it("contains the canonical UPL trigger 'you should'", () => {
    expect(NODE_LIST).toContain("you should");
  });

  it("all phrases are lowercased (case-insensitive matching strategy)", () => {
    for (const p of NODE_LIST) {
      expect(p).toBe(p.toLowerCase());
    }
  });
});
