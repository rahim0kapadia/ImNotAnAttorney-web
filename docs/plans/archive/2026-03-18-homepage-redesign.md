# INA Homepage Redesign — Plan

**Date:** 2026-03-18
**Tier:** FEATURE (5+ files modified/created)
**Status:** COMPLETE (2026-03-19) — All phases done, verified desktop + mobile

## Context Lost Twice — READ THIS FIRST

This plan has run out of context twice. Key decisions that must not be re-litigated:

1. **DiscoveryReveal must use REAL PDF pages, not hand-coded HTML replicas.** The whole conversion play is that a defendant at 2AM sees the EXACT same document format they're holding from their own discovery. Only the real PDF achieves this.
2. **PyMuPDF (pymupdf 1.26.7) is installed** and can open PDFs, draw black redaction rectangles, add amber highlights, and export pages as high-res PNGs.
3. **Source PDFs are in** `~/projects/Court Case/Cases/23-01773-CF_Kapadia/03-Extracted/` (64 reports). Markdown versions in `03-Extracted/markdown/` — useful for text reference but NOT for visual design.
4. **Dev server running** on localhost:3000 (PID 192).

## Approach: Real PDF → Redacted PNG → Website

### Phase A: PDF Redaction Script (NEW — do this first)
A1. Write a Python script using PyMuPDF to:
    - Open the target PCSO PDF pages
    - Draw black rectangles over all PII (names, DOB, addresses, phone numbers, VIN)
    - Add amber highlight rectangles over the 3 findings
    - Export each page as high-res PNG (2x for retina)
A2. Target pages:
    - SO22-401531/7 (Report Date 02/07/2023) — pages 3-4 (CI phone dual attribution + property weight 93.9g)
    - Lab Report 23-000093 — page showing weights (25.59g total) + drug type (MDMA/MDA not amphetamine)
    - Source files: `09 - PCSO - SUPPLEMENT SO22-401531-7 Report Date 02-07-2023 - 5 pages.pdf` and lab report in `01-Raw/Laboratory Report/`
A3. Export redacted PNGs to `public/discovery/` in INAA-web project
A4. Visual QA — verify redaction is complete, no PII leaks

### Phase B: DiscoveryReveal Component Rewrite
B1. Replace hand-coded HTML document replica with `<Image>` components loading the real redacted PNGs
B2. Keep scroll-driven amber highlight overlays (Framer Motion) positioned over the findings
B3. Keep reduced-motion fallback (show all findings visible, no scroll trigger)
B4. Keep the section copy: "What we actually found in a real case" + bottom links

### Phase C: Copy Changes (in page.tsx) — unchanged from original
1. Replace H1 → "Your Case File Has Answers Your Attorney Hasn't Mentioned"
2. Rewrite subheadline with origin story (68.3g, CI phone, drug type mismatch)
3. Update eyebrow text → "Built by a defendant who read his own 500-page discovery file"
4. Swap CTA priority: "See What We Found" = primary, "$197 Case Decoder" = secondary
5. Update founder attribution line below counter
6. Add "What We Are NOT" section (UPL clarity)
7. Update bridge text → "ask questions until we get answers"
8. Reframe value anchor: hourly rate comparison
9. Rewrite guarantee → "Find It or It's Free"
10. Reorder FAQ: lead with "Is this legal?"
11. Rewrite final CTA: "Stop waiting. Start asking."
12. Update metadata (title, OG title, OG description)

### Phase D: Other Components — already done
13. ~~ChargeTypeSelector.tsx~~ ✅ Created
14. ~~TrustBadges.tsx guarantee badge~~ ✅ Added ("Find It or It's Free")
15. Integrate ChargeTypeSelector into hero section
16. Replace proof cards with DiscoveryReveal

### Phase E: Verification
17. TypeScript check: `npx tsc --noEmit --skipLibCheck`
18. Visual QA: Screenshot desktop + mobile
19. FAQ schema validation: Verify JSON-LD structure

## Files to Modify
1. `src/app/page.tsx` — Hero, copy, section order, CTAs, FAQ, metadata
2. `src/components/motion/DiscoveryReveal.tsx` — Rewrite to use real PDF images

## Files to Create
3. `scripts/redact-discovery.py` — PyMuPDF redaction script
4. `public/discovery/*.png` — Redacted report page images

## Already Created (previous session)
5. `src/components/ChargeTypeSelector.tsx` ✅
6. `src/components/TrustBadges.tsx` ✅ (guarantee badge added)
