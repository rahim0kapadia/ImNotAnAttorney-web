# D7 — UPL Disclaimer Extraction (single source of truth)

**Date:** 2026-04-26
**Branch:** `fix/d7-upl-disclaimer-extraction`
**Source worry:** `docs/handoff/2026-04-26-product-audit-deferred.md` D7 — extract canonical UPL disclaimers to a single source.

## Worry (verbatim from D7)

UPL disclaimers are duplicated across the codebase. The exact same brand-level
disclaimer ("Legal information, not legal advice.") appears in 11+ files; the
exact same report-level disclaimer ("This report provides legal INFORMATION,
not legal ADVICE. Decisions about how to use this information stay with you.")
appears in 3 files; a sister "brief" variant appears in 1 file. If we ever
need to reword the UPL line (legal review, A/B test, plain-language pass), we
have to chase 14+ files and risk leaving stragglers. Extract to a single
source, leave context-specific variants alone.

## Verified scope (live grep, 2026-04-26 — handoff numbers re-verified)

### Set 1 — `BRAND_UPL_DISCLAIMER` ("Legal information, not legal advice.")
**11 files, 14 occurrences.** Mix of standalone JSX text and substring inside
larger composed strings.

| File | Line | Form |
|------|-----:|------|
| `src/components/Footer.tsx` | 65 | standalone JSX text |
| `src/components/BridgePage.tsx` | 119 | standalone JSX text |
| `src/components/CourtReminderForm.tsx` | 280 | suffix in compound JSX text ("Free. No account needed. ...") |
| `src/app/r/[code]/reminders/page.tsx` | 133 | standalone JSX text |
| `src/app/r/[code]/[product]/page.tsx` | 137, 207, 215 | inside `META_DESCRIPTIONS` map (suffix) + standalone fallback + suffix in compound fallback |
| `src/app/r/[code]/[product]/opengraph-image.tsx` | 80, 95 | standalone subtitle string (two call sites) |
| `src/app/r/[code]/quiz/page.tsx` | 32, 33 | suffix in two compound metadata-description strings |
| `src/app/tools/[slug]/page.tsx` | 65 | suffix in compound sentencing-calc disclaimer |
| `src/app/layout.tsx` | 140 | suffix inside JSON-LD Organization `description` literal |
| `src/lib/report-renderer.ts` | 181 | suffix inside HTML copyright line (template literal) |
| `src/lib/intelligence-brief/render.ts` | 392 | suffix inside HTML copyright line (template literal) |

Migration strategy:
- **Standalone occurrences:** replace literal with `{BRAND_UPL_DISCLAIMER}`
  in JSX or with the imported constant in plain string contexts.
- **Compound strings:** convert to template literal that interpolates the
  constant — runtime string MUST be byte-for-byte identical to the original.

### Set 2 — `REPORT_UPL_DISCLAIMER` ("This report provides legal INFORMATION, not legal ADVICE. Decisions about how to use this information stay with you.")
**3 files, 4 occurrences** (services has two — confirmed via live grep,
handoff said 3 sites total). All standalone JSX text.

| File | Line | Form |
|------|-----:|------|
| `src/app/services/[slug]/page.tsx` | 712, 778 | standalone JSX text (two regions) |
| `src/app/checkout/page.tsx` | 182 | standalone JSX text |
| `src/app/intake/standalone/[slug]/IntakeFormClient.tsx` | 2957 | standalone JSX text |

### Set 3 — DROPPED FROM SCOPE

**Handoff claimed:** sister "This brief provides legal INFORMATION, not legal
ADVICE. Decisions about how to use this information stay with you." in
`src/app/judge-report-card/page.tsx`.

**Live grep result:** zero matches for that exact string.

**What actually exists at line 324:**
```
This brief provides legal INFORMATION &mdash; not legal ADVICE.
```

This is a structurally different sentence (em-dash separator, no second
sentence about decisions). It appears once. Single-occurrence + different
copy = no extraction value — extracting it would be a constant-of-one with no
DRY benefit and would risk changing the rendered HTML if the constant were
ever stored without the entity. **Skip.** Leave the literal in place.

## Files to create

- `src/lib/copy/disclaimers.ts` — exports two named constants:
  - `BRAND_UPL_DISCLAIMER` = `"Legal information, not legal advice."`
  - `REPORT_UPL_DISCLAIMER` = `"This report provides legal INFORMATION, not legal ADVICE. Decisions about how to use this information stay with you."`

## Files to modify

15 file-edits across 14 files (services has two spots in one file):
- `src/components/Footer.tsx`
- `src/components/BridgePage.tsx`
- `src/components/CourtReminderForm.tsx`
- `src/app/r/[code]/reminders/page.tsx`
- `src/app/r/[code]/[product]/page.tsx`
- `src/app/r/[code]/[product]/opengraph-image.tsx`
- `src/app/r/[code]/quiz/page.tsx`
- `src/app/tools/[slug]/page.tsx`
- `src/app/layout.tsx`
- `src/lib/report-renderer.ts`
- `src/lib/intelligence-brief/render.ts`
- `src/app/services/[slug]/page.tsx`
- `src/app/checkout/page.tsx`
- `src/app/intake/standalone/[slug]/IntakeFormClient.tsx`

## Out of scope (explicitly NOT touched — context-specific copy that varies meaningfully)

- Per-state pages ("This page provides legal INFORMATION about [state] [charge]")
- IB render canonical-attorney attribution copy at `intelligence-brief/render.ts:388`
  (different structure — bold "Important:" prefix, methodology phrase)
- Playbook configs per-charge-type variants
- Email templates with brand-frame variants
- Calculator output with state-rule disclaimers (e.g., `tools/[slug]/page.tsx:66` non-sentencing branch)
- Partner data Q&A answers with bondsman-specific framing
- Report renderer's "A note on what this is:" block at `report-renderer.ts:177`
- `judge-report-card/page.tsx:324` — different copy, single occurrence (Set 3 above)

## Success criteria

1. Zero duplication of the two exact extracted strings outside `src/lib/copy/disclaimers.ts`.
2. Constants are byte-for-byte equal to the original literals (pure refactor).
3. `tsc --noEmit --skipLibCheck` clean (no type errors).
4. `vitest run` green.
5. Visual diff of any rendered page that includes the disclaimer shows zero
   change (same characters, same casing, same punctuation, same surrounding
   structure).

## Risk and mitigation

- **Risk:** template-literal interpolation introduces stray whitespace.
  **Mitigation:** every compound-string migration is verified character-level
  in the diff before commit.
- **Risk:** importing `disclaimers.ts` into Edge-Function-bound code breaks
  Deno compatibility. **Mitigation:** `intelligence-brief/render.ts` already
  imports from sibling `../email`; `disclaimers.ts` is a plain
  string-constants module with no external deps — Deno-compatible.
- **Risk:** circular import via existing tier/products imports.
  **Mitigation:** `disclaimers.ts` has zero imports of its own. Leaf module.
