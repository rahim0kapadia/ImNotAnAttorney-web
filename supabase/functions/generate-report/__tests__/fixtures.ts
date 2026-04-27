// Phase 5 (worry-attorney-discipline-wire v2.4) test fixtures + helpers.
//
// Single source of truth for every constant referenced in:
//   - T1.4 attorney-discipline.test.ts
//   - T3.1 attorney-discipline-upl.test.ts (regex panel + interpretive + entity-decode)
//   - T4.6 rls-attorney-discipline.test.ts
//   - Success Criteria 4-13 in
//     docs/plans/2026-04-25-worry-attorney-discipline-wire.md
//
// MUST mirror the rows seeded by
//   supabase/migrations/20260425b_attorney_discipline_test_fixtures.sql
//
// Hostile values are NOT seeded into the DB (Sec v3 CRITICAL #2). They are
// passed in-memory to renderAttorneyDisciplineSection() in the UPL test.

export const FIXTURE_CLEAN_BAR_NUMBER = "FIXTURE-001";
export const FIXTURE_CLEAN_ATTORNEY_NAME = "Fixture Cleanrecord";

export const FIXTURE_DISCIPLINED_BAR_NUMBER = "FIXTURE-002";
export const FIXTURE_DISCIPLINED_ATTORNEY_NAME = "Fixture Disciplined";
export const FIXTURE_DISCIPLINED_EVENT_COUNT = 2;

// FIXTURE-003 shares full_name with FIXTURE-001 → ambiguous-match probe.
export const FIXTURE_AMBIGUOUS_BAR_NUMBER = "FIXTURE-003";

// In-memory only — never persisted (Sec v3 CRIT #2).
export const FIXTURE_HOSTILE_BAR_NUMBER = "FIXTURE-004";
export const FIXTURE_HOSTILE_ATTORNEY_NAME = "Fixture Hostile";

// CA Bar lookup base URL — used in success criterion #6 (panel check) and
// in the renderer's "Verify yourself" CTA.
export const CA_BAR_LOOKUP_BASE =
  "https://apps.calbar.ca.gov/attorney/Licensee/Detail/";

// Re-export render-side public symbols so tests import once.
export {
  buildAttorneyDisciplineSection,
  renderAttorneyDisciplineSection,
  NO_MATCH_MESSAGE,
  DISCLAIMER_VERBATIM,
  JURISDICTION_BAR_NAMES,
} from "../lib/render-attorney-discipline.ts";

/**
 * Escape a string for safe use inside a regex literal.
 * Pinned here so every test that builds a regex around a fixture constant
 * uses the same single implementation.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
