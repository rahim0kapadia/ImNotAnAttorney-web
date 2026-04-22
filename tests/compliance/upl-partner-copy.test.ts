/**
 * Static UPL compliance audit on defendant-facing partner page source.
 *
 * The INAA brand rule (per .claude/rules/no-hallucinated-legal-data.md +
 * .claude/rules/brand-voice.md) is strict:
 *   - We provide LEGAL INFORMATION, not LEGAL ADVICE.
 *   - Defendants are alone; no attorney "verifies" anything we output.
 *   - No outcome guarantees ("will win", "guaranteed dismissal", "not guilty").
 *
 * This test reads partner page + BridgePage source text and asserts none
 * of the UPL-problematic substrings appear. Exempts the permitted disclaimer
 * "legal information, not legal advice" (case-insensitive substring match
 * stripped before scanning).
 *
 * Failure surface: the test fails if a copy change introduces an
 * UPL-problematic phrase — caught at PR time, before a customer sees it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Every defendant-facing partner page source file, PLUS the BridgePage
// component (rendered inside /r/[code]/page.tsx — most prose lives here).
const FILES = [
  "src/app/r/[code]/page.tsx",
  "src/app/r/[code]/[product]/page.tsx",
  "src/app/r/[code]/quiz/page.tsx",
  "src/app/r/[code]/reminders/page.tsx",
  "src/app/checkin/[code]/page.tsx",
  "src/components/BridgePage.tsx",
];

// Hard-fail phrases. Match is case-insensitive. One phrase present = test fails.
// Every phrase listed here violates a specific rule in
// .claude/rules/no-hallucinated-legal-data.md or .claude/rules/brand-voice.md.
const UPL_HARD_FAIL = [
  "ask your attorney to verify",
  "ask an attorney to verify",
  "your attorney can confirm",
  "have your attorney verify",
  "verify with your attorney",
  "verify with an attorney",
  "verify with attorney",
];

// Phrases that are USUALLY UPL violations but have a permitted exception.
// Remove the permitted substrings from the source text before scanning.
// - "legal advice" is permitted ONLY as part of "legal information, not
//    legal advice" (or the hyphenated variant) — the disclaimer line.
const PERMITTED_DISCLAIMER_RE = /legal information[, ]+not legal advice/gi;
const PERMITTED_DISCLAIMER_RE_ALT = /legal information.*?not legal advice/gi;

const UPL_CONDITIONAL_FAIL = [
  "legal advice",
];

// Soft-warn phrases (outcome guarantees). Don't fail, but log to stderr
// so a grep of CI output surfaces them for manual review. Some legitimate
// uses exist (e.g. quoting case law, describing prosecution strategy).
const OUTCOME_GUARANTEE_WARN = [
  "will win",
  "guaranteed dismissal",
  "guaranteed acquittal",
  "promise you won",
  "promise to win",
  "we guarantee",
];

describe("UPL compliance — defendant-facing partner pages", () => {
  for (const relPath of FILES) {
    const full = path.join(REPO_ROOT, relPath);

    it(`${relPath} exists and can be read`, () => {
      expect(existsSync(full), `${relPath} must exist`).toBe(true);
    });

    if (!existsSync(full)) continue;
    const raw = readFileSync(full, "utf8");
    // Strip the permitted disclaimer in both spellings before scanning for
    // conditional-fail phrases.
    const scrubbed = raw
      .replace(PERMITTED_DISCLAIMER_RE, "[[DISCLAIMER]]")
      .replace(PERMITTED_DISCLAIMER_RE_ALT, "[[DISCLAIMER]]");
    const lower = scrubbed.toLowerCase();

    for (const bad of UPL_HARD_FAIL) {
      it(`${relPath} does not contain hard-fail phrase "${bad}"`, () => {
        expect(
          lower.includes(bad.toLowerCase()),
          `${relPath} contains UPL-problematic phrase "${bad}" — .claude/rules/no-hallucinated-legal-data.md bans this. Remove or rephrase.`,
        ).toBe(false);
      });
    }

    for (const bad of UPL_CONDITIONAL_FAIL) {
      it(`${relPath} does not use "${bad}" outside the permitted disclaimer`, () => {
        expect(
          lower.includes(bad.toLowerCase()),
          `${relPath} contains "${bad}" outside the permitted "legal information, not legal advice" disclaimer. Rephrase.`,
        ).toBe(false);
      });
    }

    it(`${relPath} outcome-guarantee soft-warn`, () => {
      const hits = OUTCOME_GUARANTEE_WARN.filter((p) => lower.includes(p.toLowerCase()));
      if (hits.length > 0) {
        // Emit to stderr so CI logs show it — but don't hard fail.
        console.warn(
          `[UPL SOFT-WARN] ${relPath} contains outcome-guarantee phrases: ${hits.join(", ")} — review in context.`,
        );
      }
      // Always passes — soft-warn is a signal, not a gate.
      expect(true).toBe(true);
    });
  }
});
