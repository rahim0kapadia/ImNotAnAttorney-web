// supabase/functions/generate-report/lib/banned-phrases.ts
//
// T3.2 + T3.2b (worry-attorney-discipline-wire v2.4) — CANONICAL banned-phrase
// list for the IB UPL gate. Extracted from
//   src/lib/intelligence-brief/prompts.ts:34
// (the BANNED_PHRASES_BLOCK template literal). Only the QUOTED phrases inside
// that prose block are banned; the substitution suggestions are NOT.
//
// Mirrored on the Node side at
//   src/lib/intelligence-brief/banned-phrases.ts
// Parity asserted by
//   src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts (T3.2a)
//
// Used by:
//   - The deterministic UPL regex panel (T3.1) at
//     supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts
//   - The disclaimer-string assertion (Success Criterion 13) — verifies the
//     attorney-discipline section's footer disclaimer contains zero banned
//     phrases.
//
// Match strategy: case-insensitive substring (`html.toLowerCase().includes(p)`).
// Phrases are stored lowercase. Multi-character phrasings are precise enough
// that case-insensitive substring is the right granularity (no word-boundary
// over-/under-match).

export const BANNED_PHRASES_BLOCK: readonly string[] = Object.freeze([
  // Direct prescriptive language — banned per UPL.
  "you should",
  "should file",
  "should pursue",
  "should review",
  "should consult",
  "could or should",
  "you need to",
  "you must",
  "you have to",

  // Recommendation language — banned per UPL.
  "we recommend",
  "we advise",
  "i recommend",
  "i advise",

  // Best-option claims — banned per UPL.
  "your best option",
  "the best strategy",
  "the best option",

  // Threat/judgment framing — banned (interpretive label about attorney
  // conduct or case posture).
  "red flag",
  "warning sign",
  "escalation ladder",

  // Bare imperatives to the defendant — banned per UPL ("Most defense
  // attorneys advise against..." is the approved reframe).
  "do not discuss your case",
]) as readonly string[];
