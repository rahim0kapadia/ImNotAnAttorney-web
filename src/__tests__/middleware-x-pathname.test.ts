/**
 * Regression guard for the x-pathname request header set by middleware.
 *
 * Consumer: src/app/layout.tsx reads this header to decide whether to
 * render the global chrome skip-link or suppress it (the PartnerBrandedShell
 * on /r/[code]/* routes renders its own skip-link positioned ahead of the
 * partner header). If middleware stops setting x-pathname, partner-branded
 * routes double-render the skip-link and break a11y/tab order.
 *
 * Structural test: we read middleware.ts source and assert the header-set
 * calls exist at both write-sites (referral-cookie branch + page-route fall-through).
 * A prior WIP (see design doc section 3.1) tried to delete both without any
 * local signal.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIDDLEWARE_PATH = path.resolve(__dirname, "..", "middleware.ts");

describe("middleware.ts x-pathname header", () => {
  const source = readFileSync(MIDDLEWARE_PATH, "utf8");

  it("sets x-pathname on request headers (at least twice)", () => {
    // Match requestHeaders.set("x-pathname", ...) calls. Count must be >= 2
    // because there are two write-sites: setReferralCookie + main middleware.
    const matches = source.match(/requestHeaders\.set\("x-pathname"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("documents the layout.tsx consumer near at least one write-site", () => {
    // A coupling comment at the write-site prevents the next refactor from
    // silently deleting the header.
    expect(source).toMatch(/layout\.tsx/);
  });
});
