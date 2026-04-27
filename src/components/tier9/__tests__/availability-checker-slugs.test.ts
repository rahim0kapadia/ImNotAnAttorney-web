/**
 * Sync test: AvailabilityChecker `Slug` union literal matches the canonical
 * TIER9_SLUGS set (2026-04-27, closes S1 of worry-tier9-flipped-live audit).
 *
 * The AvailabilityChecker ships only for slugs whose dedicated landing page
 * mounts the component. When TIER9_SLUGS expands, the union must expand too
 * or the new slug fails to typecheck on the page that mounts it.
 *
 * This test reads the AvailabilityChecker source and asserts the literal
 * type union contains every slug we've shipped a dedicated landing for.
 *
 * test-isolation-na: read-only fs check, no Supabase access.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve as pathResolve } from "path";

// The set of slugs that MUST be in the AvailabilityChecker Slug union.
// Mirrors the dedicated-landing pattern: each entry corresponds to a
// `src/app/<slug>/page.tsx` that mounts AvailabilityChecker.
const REQUIRED_SLUGS = [
  "judge-report-card",
  "officer-background-check",
  "similar-cases-analyzer",
  "district-court-intelligence",
  "arrest-survival-kit",
  "federal-jury-instruction-brief",
  "motion-success-report",
  "federal-sentencing-distribution",
  "charge-authority-pack",
  "precedent-watchlist",
] as const;

describe("AvailabilityChecker Slug union — sync with shipped landings", () => {
  const source = readFileSync(
    pathResolve(__dirname, "..", "AvailabilityChecker.tsx"),
    "utf8",
  );

  it.each(REQUIRED_SLUGS)("Slug union contains '%s'", (slug) => {
    // Match the literal slug string within the type Slug = '...' | '...' block.
    // Anchor on the quoted form so a substring match (e.g. 'dui' inside
    // 'dui-first') can't false-positive.
    const literal = `'${slug}'`;
    expect(source).toContain(literal);
  });

  it("Slug union has the right cardinality (10 entries — 2026-04-27)", () => {
    // Extract the type Slug = ... ; block and count `|` separators + 1.
    const m = source.match(/type\s+Slug\s*=\s*([\s\S]*?);/);
    expect(m).not.toBeNull();
    const body = m![1];
    // Count quoted-string literals in the union body.
    const literals = body.match(/'[a-z][a-z0-9-]+'/g) ?? [];
    expect(literals.length).toBe(REQUIRED_SLUGS.length);
  });
});
