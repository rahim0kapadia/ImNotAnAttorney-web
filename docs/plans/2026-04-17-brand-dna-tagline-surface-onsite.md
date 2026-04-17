# Plan: Surface Brand DNA Tagline On Homepage + /masked + About

**Date:** 2026-04-17
**Scope:** FEATURE (3 customer-facing files)

## Trigger
Rahim: "what happened to this line and why aren't we using it? *The legal system has a file on you. We help you build one on them.*"

Grep confirmed: the canonical long-form brand DNA tagline lives ONLY in OG metadata (`src/app/opengraph-image.tsx:15`). Not on the homepage itself, not on `/masked`, not on About. That's a miss — this is the thesis of the entire operation.

## Files to Modify
1. `src/components/HomepageHero.tsx` — plant as brand thesis statement between H1 and YMYL byline (prominent typographic treatment).
2. `src/app/masked/page.tsx` — add as epigraph under the H1 headline (it IS the mask manifesto's thesis).
3. `src/app/about/page.tsx` — add directly under "Built by defendants. For defendants." H1.

## Tasks
1. HomepageHero: new Playfair 2xl block, amber highlight on resolution clause.
2. /masked: insert as italic epigraph below H1 before intro paragraph.
3. About: insert as tagline row under hero H1.

## Rollback
Git revert. Three isolated text inserts, low risk.
