# Plan: Narrative Shift to Plural Peer Voice + System-Speak

**Date:** 2026-04-17
**Scope:** FEATURE (auto-promoted from QUICK_FIX at 3rd file)
**User ask:** Shift hero subhead from founder-singular story to system-speak indexed to scared-defendant fears. "Built by people who've been where you are" (plural peer voice). Apply throughout the whole site.

## Approved direction
User said: "keep going and testing and fixing and doing that loop until it clean and perfect" + "The narrative of the website should be built by guys [people] in your shoes" + "throughout the whole site though."

Decision: WHOLE SITE-FACING narrative converts to plural peer voice. Third-person case-study narratives in blog posts stay (those are legit stories). Internal docs / archived plans / social-media queue scripts NOT in scope.

## Files to modify

### Site metadata + homepage
1. `src/app/page.tsx` — metadata.description + openGraph.description (2 strings, both say "Built by a defendant who found 68.3g of evidence his attorney never mentioned") → "Built by people who found 68.3g..."
2. `src/components/HomepageHero.tsx` — already done earlier this session (hero subhead system-speak, trailing eyebrow pluralized). No further edits.

### Report generation (customer-facing deliverable copy)
3. `src/lib/intelligence-brief/prompts.ts:587` — "founded by a defendant who went through" → "founded by people who went through"
4. `supabase/functions/generate-report/index.ts` — 3 occurrences of "founded by a defendant" variants → plural.

### Downloadable guides
5. `public/guides/dui-first-72-hours-checklist.md:3` — "Built by a defendant. For defendants." → "Built by people who've been where you are. For defendants."

### About page alignment
6. `src/app/about/page.tsx` — already plural-voiced ("One of our founders" / "Another one of us" / "A third member of our team"). Line 201 still says "what he did" — tweak to "what they did" for consistency.

## Files NOT in scope
- `content/blog/*.mdx` — blog case studies use third-person "a defendant did X" as legit narrative. Keep.
- `content/queue/**` — social media scripts, separate pipeline, not rendered on .com.
- `docs/**` — internal docs, audits, archived plans. Historical record.
- `src/app/score/ScoreClient.tsx:600` — code comment only, not rendered.

## Tasks
1. Edit page.tsx metadata (replace_all on unique substring "Built by a defendant who found 68.3g of").
2. Edit intelligence-brief/prompts.ts line 587.
3. Edit generate-report/index.ts 3 occurrences.
4. Edit dui-first-72-hours-checklist.md line 3.
5. Edit about/page.tsx line 201 tweak.
6. tsc verify.
7. Commit.

## Rollback
Git revert if tsc fails or broken. Each edit is isolated string replacement, low risk.
