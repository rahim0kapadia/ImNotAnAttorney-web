// supabase/functions/generate-report/lib/section-anchors.ts
//
// T2.1 (worry-attorney-discipline-wire v2.4) — Deno-side canonical IB
// section-heading anchors. Pinned literals so production renderer + Deno-side
// tests share a single source of truth.
//
// Mirror: src/lib/intelligence-brief/section-anchors.ts (Node-side parity).
// A parity check keeps both files in lockstep — see
//   src/lib/intelligence-brief/__tests__/section-anchors-parity.test.ts
//
// HOW THESE STRINGS WERE PINNED
//   - LLM-generated section H2s (case-roadmap, whats-working, case-intelligence,
//     legal-options, protection, your-plan, court-prep, questions): pinned from
//     each section's prompt template in
//     src/lib/intelligence-brief/prompts.ts (the `Output: ## ...` line).
//   - Static-builder H2s (Table of Contents, Appendix A/C/E): pinned from the
//     literal `return \`## ...\`` lines in
//     supabase/functions/generate-report/index.ts:7219-7289.
//   - Tier-9 + Appendix F/G/H: pinned from index.ts:5328 + 6362 + 6648 + the
//     mechanical-renderer call sites.
//   - ATTORNEY_DISCIPLINE: defined here (new in this PR) — used by the
//     renderer at lib/render-attorney-discipline.ts and by the success-criteria
//     ordering tests.
//
// NOTE: LLM-generated headings (your-plan etc.) carry a non-zero risk of
// drift if the prompt template is edited. Tests that depend on order should
// prefer the stable static neighbors as bounds (BRADY_GIGLIO_APPENDIX is the
// reliable lower bound for the discipline section's ordering check).

export const IB_SECTION_ANCHORS = {
  // LLM-generated, ordered as in renderIBReportHtml's sections array.
  CASE_ROADMAP:        "Section 1: Your Case Roadmap",
  WHATS_WORKING:       "Section 2: What's Working in Your Defense",
  CASE_INTELLIGENCE:   "Section 3: Case Intelligence",
  LEGAL_OPTIONS:       "Section 4: Your Legal Options",
  PROTECTION:          "Section 5: Protecting Yourself",
  YOUR_PLAN:           "Section 6: Your Plan",
  COURT_PREP:          "Appendix B: Court Preparation",
  QUESTIONS:           "Appendix D: Questions for Your Attorney",

  // NEW in this PR — wired between YOUR_PLAN and BRADY_GIGLIO_APPENDIX.
  ATTORNEY_DISCIPLINE: "Your Attorney's Public Bar Record",

  // Static builders (deterministic literals).
  TABLE_OF_CONTENTS:        "Table of Contents",
  BRADY_GIGLIO_APPENDIX:    "Appendix A: Brady/Giglio Checklist",
  ATTORNEY_SCRIPT_PACK:     "Appendix C: Attorney Script Pack",
  YOUR_RIGHTS:              "Appendix E: Your Rights During Criminal Proceedings",
  TIER9_DATA_APPENDIX:      "Appendix F: Data-Driven Defense Intelligence",
  MOTION_STRATEGY:          "Appendix G: Motion Strategy",
  LIVE_AUTHORITY_MAP:       "Appendix H: Live Authority Map",
} as const;

export type IbSectionAnchorKey = keyof typeof IB_SECTION_ANCHORS;
