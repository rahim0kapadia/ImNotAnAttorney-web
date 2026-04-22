/**
 * Structural regression guard for GET /api/partner/dashboard.
 *
 * The response body's `partner` object spreads brand fields that power the
 * /partner/dashboard/branding page and the copy-link preview UX. A previous
 * refactor (see docs/plans/2026-04-21-partner-portal-pristine-design.md,
 * section 3.1) attempted to delete these fields from the response with no
 * local test catching it.
 *
 * Full mocking of this route would require stubbing Supabase admin client,
 * requirePartnerAuth, paginatedQuery, batchedInQuery, and three RPCs — a
 * large surface for a narrow guarantee. Instead we assert the source file
 * text contains every brand key. This catches the exact failure mode
 * ("someone deleted a line") that the unit tests in partner-by-code and
 * partner-auth do not cover.
 *
 * If this test fails because the dashboard response was legitimately
 * restructured (e.g., fields moved into a nested object), update BOTH
 * this test and the relevant consumer (/partner/dashboard/branding) in
 * the same commit.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PARTNER_BRAND_COLUMNS } from "@/lib/partner-brand-columns";

const ROUTE_PATH = path.resolve(
  __dirname,
  "..",
  "route.ts"
);

describe("GET /api/partner/dashboard response body", () => {
  const source = readFileSync(ROUTE_PATH, "utf8");

  it("includes every PARTNER_BRAND_COLUMNS key in the source text", () => {
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(
        source,
        `expected dashboard route to include "${col}" in its response body`
      ).toContain(col);
    }
  });

  it("spreads brand fields inside the partner object (keys appear after 'partner: {')", () => {
    const partnerBlockStart = source.indexOf("partner: {");
    expect(partnerBlockStart, "expected response body to contain partner: { ... }").toBeGreaterThan(-1);
    const partnerBlock = source.slice(partnerBlockStart);
    for (const col of PARTNER_BRAND_COLUMNS) {
      expect(
        partnerBlock,
        `expected "${col}" to appear inside the partner response block`
      ).toContain(col);
    }
  });
});
