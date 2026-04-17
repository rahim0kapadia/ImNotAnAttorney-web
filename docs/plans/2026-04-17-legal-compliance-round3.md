# Plan: Round-3 Legal Compliance Fixes (Post-Truth-Audit)

**Date:** 2026-04-17
**Scope:** FEATURE (multi-file copy fixes, UPL-critical)
**Trigger:** Legal Compliance Checker third-pass flagged 2 MEDIUM items after truth audit.

## MEDIUM Findings
1. **Testimonial outcomes imply case-result causation** (`page.tsx:290-311`). "Charges reduced," "Case dismissed," "Charges dropped" paired with INAA-attributed quotes = implied outcome guarantee. FTC + state bar risk. Fix: change `outcome` field to attorney-BEHAVIOR changes (defensible).
2. **"Attorney can't ignore"** (`HomepageHero.tsx:67`). Unenforceable — attorneys legally can ignore client questions. Fix: "will have to answer on the record" (matches existing defensible phrasing in How-it-works Step 3).

## Files Modified
- `src/components/HomepageHero.tsx` — L67 wording.
- `src/app/page.tsx` — testimonial outcomes (3 of 4 change: Marcus "reduced" → "new suppression motion"; Sarah "dismissed" → "re-opened discovery review"; Michelle "dropped" → "re-opened fraud timeline"). Maria G. already attorney-behavior, keep.

## Tasks
1. Hero line 67 word swap.
2. Testimonial outcomes (3 entries).
3. tsc + push.

User authorized autonomous execution — no approval gate.
