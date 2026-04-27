// src/lib/intelligence-brief/banned-phrases.ts
//
// T3.2 mirror (worry-attorney-discipline-wire v2.4) — Node-side parity copy of
// the Deno canonical at
//   supabase/functions/generate-report/lib/banned-phrases.ts
//
// Parity asserted by
//   src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts
// using readFileSync + parse (NOT direct import — matches existing
// whitelist-parity.test.ts pattern; the npm/Vite side cannot resolve a
// supabase/functions/ path through normal module resolution).
//
// Imported by src/lib/intelligence-brief/prompts.ts:34 to interpolate into
// the existing BANNED_PHRASES_BLOCK template literal so that Node-side
// generation prompts use the same canonical list as Deno-side audit/render.

export const BANNED_PHRASES_BLOCK: readonly string[] = Object.freeze([
  "you should",
  "should file",
  "should pursue",
  "should review",
  "should consult",
  "could or should",
  "you need to",
  "you must",
  "you have to",
  "we recommend",
  "we advise",
  "i recommend",
  "i advise",
  "your best option",
  "the best strategy",
  "the best option",
  "red flag",
  "warning sign",
  "escalation ladder",
  "do not discuss your case",
]) as readonly string[];
