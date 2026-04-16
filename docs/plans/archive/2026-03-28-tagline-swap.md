# Tagline Swap: "We Research. You Ask." → "Know What They Know."

## Context
- Repo: ImNotAnAttorney-web
- Problem: Replace old tagline across all source files
- Key files: layout.tsx, OG/Twitter images, Footer, HomepageHero, sample pages, render engines, about page
- Tech stack: Next.js 15, TypeScript, Tailwind

## Key Decision
The about page UPL compliance box (lines 263-270) uses the old tagline as the boundary statement. The new tagline is a statement of empowerment, not a process description. Updated copy: "Know What They Know." + "We provide legal information, not legal advice. Not representation. Not outcomes. Information is the equalizer."

## Files to Modify

1. `src/app/layout.tsx`, metadata default title
2. `src/app/opengraph-image.tsx`, comment, alt text, rendered text
3. `src/app/twitter-image.tsx`, alt text, rendered text
4. `src/app/blog/[slug]/twitter-image.tsx`, rendered text
5. `src/app/blog/[slug]/opengraph-image.tsx`, rendered text
6. `src/components/Footer.tsx`, rendered text
7. `src/components/HomepageHero.tsx`, rendered text
8. `src/app/sample/page.tsx`, report header subtitle
9. `src/app/sample-xray/page.tsx`, report header subtitle
10. `src/lib/intelligence-brief/render.ts`, HTML report subtitle
11. `src/lib/report-renderer.ts`, HTML report subtitle
12. `src/app/about/page.tsx`, 2 comments + UPL box copy

## Numbered Tasks

1. Update `src/app/layout.tsx` line 73
2. Update `src/app/opengraph-image.tsx` lines 9, 18, 56
3. Update `src/app/twitter-image.tsx` lines 8, 46
4. Update `src/app/blog/[slug]/twitter-image.tsx` line 58
5. Update `src/app/blog/[slug]/opengraph-image.tsx` line 71
6. Update `src/components/Footer.tsx` line 49
7. Update `src/components/HomepageHero.tsx` line 105
8. Update `src/app/sample/page.tsx` line 129
9. Update `src/app/sample-xray/page.tsx` line 99
10. Update `src/lib/intelligence-brief/render.ts` line 358
11. Update `src/lib/report-renderer.ts` line 161
12. Update `src/app/about/page.tsx` lines 27, 241, 265 (with copy adjustment)
13. Run `npx tsc,noEmit,skipLibCheck` to verify
