---
Context:
  Repo: ImNotAnAttorney-web
  Problem: Shared /score/results/[token] URLs need a dynamic OG image for social previews
  Key files:
    - src/app/score/results/[token]/opengraph-image.tsx (CREATE)
    - src/app/opengraph-image.tsx (REFERENCE, established pattern)
    - src/lib/supabase/admin.ts (READ, admin client for DB lookup)
  Tech stack: Next.js 15 App Router, ImageResponse (next/og), Supabase, Edge runtime
  Key decisions:
    - Single file, colocated with page.tsx per Next.js App Router convention
    - Edge runtime for fast generation, no external fonts
    - Falls back to score=50/band="Average" if token missing or expired
    - Score color: red≤20, orange≤40, yellow≤60, green≤80, emerald>80
---

# Plan: Dynamic OG Image for Shared Score Results

## Task 1, Create opengraph-image.tsx
File: `src/app/score/results/[token]/opengraph-image.tsx`

- Export runtime="edge", size 1200x630, contentType="image/png"
- Fetch score_value + score_band from score_results where token matches and expires_at >= now
- Render: label "DEFENSE MILESTONE SCORE" / large score number in band color / band name / CTA / brand line
- Graceful fallback to score=50, band="Average" on any DB error

## Task 2, TypeScript verification
Run: `npx tsc,noEmit,skipLibCheck`

## Task 3, Commit
`git add src/app/score/results/[token]/opengraph-image.tsx`
`git commit -m "feat(score): add dynamic OG image for shared score results"`
