/**
 * E2E: axe-core accessibility audit on every partner-facing route (Phase 4 Task 3).
 *
 * Runs axe-core (WCAG 2.1 AA ruleset) against each route. Fails on critical
 * or serious violations; logs moderate + minor as warnings.
 *
 * Baseline = whatever the current site emits. Violations surfaced by the first
 * run are real follow-up work, NOT Phase 4 fix list. This spec exists so that
 * future regressions (a new component with missing aria-labels, a color that
 * drops below AA contrast) fail the CI gate instead of silently landing.
 *
 * Routes covered:
 *   /partner/login
 *   /r/[code]           (referral mode — requires partner-branded shell)
 *   /r/[code]/reminders
 *   /r/[code]/case-decoder  (one product deep-link representative)
 *   /checkin/[code]     (check-in mode)
 *
 * Note: /partner/dashboard and /partner/dashboard/branding require an
 * authenticated session — out of scope for this basic spec. When
 * partner-full-walkthrough.spec.ts's authentication helper is exposed, a
 * follow-up can add authenticated a11y coverage.
 *
 * Fixtures: E2EREFE (referral mode), E2EBOND (check-in mode).
 * Gated on E2E_SEED_READY=1.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = "https://imnotanattorney.com";
const REFERRAL_CODE = "E2EREFE";
const CHECKIN_CODE = "E2EBOND";

const ROUTES = [
  { label: "/partner/login", path: "/partner/login" },
  { label: "/r/[code]", path: `/r/${REFERRAL_CODE}` },
  { label: "/r/[code]/reminders", path: `/r/${REFERRAL_CODE}/reminders` },
  { label: "/r/[code]/[product]", path: `/r/${REFERRAL_CODE}/case-decoder` },
  { label: "/checkin/[code]", path: `/checkin/${CHECKIN_CODE}` },
] as const;

test.describe("a11y — partner-facing routes", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partners — run scripts/seed-e2e-partners.mjs first",
    );
  });

  for (const route of ROUTES) {
    test(`${route.label} has no critical or serious axe violations`, async ({ page }) => {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const critical = results.violations.filter((v) => v.impact === "critical");
      const serious = results.violations.filter((v) => v.impact === "serious");
      const moderate = results.violations.filter((v) => v.impact === "moderate");
      const minor = results.violations.filter((v) => v.impact === "minor");

      // Warnings (non-failing) — surfaced in test output for triage.
      if (moderate.length > 0 || minor.length > 0) {
        console.warn(
          `[a11y ${route.label}] ${moderate.length} moderate + ${minor.length} minor violations — triage:`,
          [...moderate, ...minor].map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })),
        );
      }

      // Hard assertion — any critical or serious is a failing violation.
      expect(
        critical,
        `${route.label} has ${critical.length} CRITICAL a11y violations: ${critical.map((v) => v.id).join(", ")}`,
      ).toHaveLength(0);
      expect(
        serious,
        `${route.label} has ${serious.length} SERIOUS a11y violations: ${serious.map((v) => v.id).join(", ")}`,
      ).toHaveLength(0);
    });
  }
});
