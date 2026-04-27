// src/lib/intelligence-brief/section-anchors.ts
//
// T2.1 mirror (worry-attorney-discipline-wire v2.4) — Node-side parity copy of
// the Deno canonical at
//   supabase/functions/generate-report/lib/section-anchors.ts
//
// Used by Node-side dev tools (scripts/test-ib-pipeline.ts, render-ib-test.mjs)
// and by tests that exercise the IB renderer at the npm/vitest layer.
//
// PARITY: The arrays below are deep-equal-checked against the Deno-side
// canonical in
//   src/lib/intelligence-brief/__tests__/section-anchors-parity.test.ts
// Update both files together; the parity test will fail otherwise.

export const IB_SECTION_ANCHORS = {
  CASE_ROADMAP:        "Section 1: Your Case Roadmap",
  WHATS_WORKING:       "Section 2: What's Working in Your Defense",
  CASE_INTELLIGENCE:   "Section 3: Case Intelligence",
  LEGAL_OPTIONS:       "Section 4: Your Legal Options",
  PROTECTION:          "Section 5: Protecting Yourself",
  YOUR_PLAN:           "Section 6: Your Plan",
  COURT_PREP:          "Appendix B: Court Preparation",
  QUESTIONS:           "Appendix D: Questions for Your Attorney",
  ATTORNEY_DISCIPLINE: "Your Attorney's Public Bar Record",
  TABLE_OF_CONTENTS:        "Table of Contents",
  BRADY_GIGLIO_APPENDIX:    "Appendix A: Brady/Giglio Checklist",
  ATTORNEY_SCRIPT_PACK:     "Appendix C: Attorney Script Pack",
  YOUR_RIGHTS:              "Appendix E: Your Rights During Criminal Proceedings",
  TIER9_DATA_APPENDIX:      "Appendix F: Data-Driven Defense Intelligence",
  MOTION_STRATEGY:          "Appendix G: Motion Strategy",
  LIVE_AUTHORITY_MAP:       "Appendix H: Live Authority Map",
} as const;

export type IbSectionAnchorKey = keyof typeof IB_SECTION_ANCHORS;
