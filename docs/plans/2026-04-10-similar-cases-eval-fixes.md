# Similar Cases Analyzer — Eval-Driven Fixes

**Date:** 2026-04-10
**Scope:** Single file — `src/app/similar-cases-analyzer/page.tsx`
**Type:** FEATURE (auto-promoted from QUICK_FIX due to session edit count)

## Context

Eval feedback identified 7 gaps in the Similar Cases Analyzer landing page:
T1/T5 (felt-experience), CRO11/ANON5 (contact info), CRO7 (placeholder removal),
ANON3 (methodology attribution), POS3 (attorney anxiety FAQ), CRO8 (price anchoring),
T2/POS7 (tribe signal + competitive alternative), plus sample table source label fix.

All changes are prescriptive copy provided by the eval reviewer. Single file, no architectural impact.

## Files to Modify

1. `src/app/similar-cases-analyzer/page.tsx` — all 7 fixes below

## Tasks

1. **Fix 1 — T1+T5:** Add felt-experience paragraph before `<h1>` in hero section
2. **Fix 2 — CRO11+ANON5:** Add contact email paragraph after UPL disclaimer in final CTA
3. **Fix 3 — CRO7:** Remove `<figure>` placeholder ("screenshot pending") from sample report section
4. **Fix 4 — ANON3:** Add methodology attribution paragraph after trust paragraph
5. **Fix 5 — POS3:** Add attorney-anxiety FAQ item as last entry in faqItems array
6. **Fix 6 — CRO8:** Add price-to-stakes anchoring paragraph after price display
7. **Fix 7 — T2+POS7:** Replace final CTA paragraph with tribe signal copy
8. **Fix 7b:** Update sample table Source column header and cell values

## Verification

- Visual inspection of rendered page (no build errors)
- All additions are defendant-facing copy, no logic changes
