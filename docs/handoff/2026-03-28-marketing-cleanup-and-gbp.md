# Handoff: Marketing Cleanup + GBP Setup
Date: 2026-03-28 14:30

## Task
Full marketing audit and tagline swap across the INAA site. The old tagline "We Research. You Ask." is being replaced with "Know What They Know." everywhere. Additionally, every page needs review through the new marketing lens: quality over speed, science not art, address fear / give control / put at ease, product-adjacent content (never teaser).

## Approach
Swarm execution — dispatch parallel agents to handle tagline replacement + marketing audit of key pages. The brand voice rules and Atti persona have already been updated with the new principles. This is a LARGE_BUILD touching 18+ source files + dozens of content queue files.

## What Was Accomplished This Session

### Code Shipped (pushed to production)
- CTA audit: 14 to 8 CTAs on homepage (removed low-intent distractors)
- Brunson value stacking in PricingTable ($950/$2,400/$3,700 value shown)
- DAI stats API at /api/stats/score-summary (reads anonymous aggregates)
- DAI social proof counter + benchmark insights on score page
- DefinedTermSet glossary schema (8 criminal defense terms)
- ALL tiers flipped to LIVE (IB $997, X-Ray $2,497, War Room $4,997, Situation Room $9,997, add-ons)

### Brand Decisions Made
- Tagline: "Know What They Know." (replaces "We Research. You Ask.")
- Core principle: quality not speed, science not art, methodology not opinion
- Content strategy: product-adjacent (never teaser, never gate, give full value on neighbor topic)
- Positioning: the system works together, we work for the defendant
- The defendant is the only stranger in the courtroom

### GBP Setup (awaiting verification)
- Profile created at business.google.com
- 75 services listed across zero-competition niches
- Description written and finalized (434 chars, "stranger in the room" opening)
- Profile photo: INAA logo (suited silhouette with magnifying glass + case file) saved at public/brand/inaa-logo.png
- Cover photo v2: Research Operations Command Center design at scripts/gbp-cover-v2-1024x576.png
- 8 product photos generated at scripts/gbp-photos/
- Services list saved as product roadmap at docs/gbp-services-list.md

### Files Modified (brand rules)
- C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\brand-voice.md — new tagline, core principles, DO NOT list updated
- C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\atti-persona.md — crisis sales strategist updated (quality not speed), trust engineer updated (specificity not warmth), positioning updated (stranger in the room)
- C:\Users\email\projects\ImNotAnAttorney-web\public\brand\inaa-logo.png — official INAA logo (Gemini-generated)
- C:\Users\email\projects\ImNotAnAttorney-web\docs\gbp-services-list.md — 75 services + product roadmap backlog + score tool QA backlog

### Files Modified (code, already pushed)
- src/app/page.tsx — CTA removal, DefinedTermSet schema injection, catalog expansion
- src/components/motion/DiscoveryReveal.tsx — removed "Read the full story" link
- src/components/PricingTable.tsx — TierCard interface + valueStack arrays + render
- src/app/api/stats/score-summary/route.ts — NEW, DAI stats endpoint
- src/app/score/page.tsx — stats state + social proof counter + benchmark insights
- src/lib/schema.ts — generateDefinedTermSet() function
- src/lib/tiers.ts — all remaining tiers flipped to live: true

## What Didn't Work
- SVG silhouette for GBP profile photo — too crude for a businessman figure, needed AI image generation (Gemini)
- First GBP description middle section sounded like AI robotic slop ("The output is not an opinion. It is a documented set of questions...") — had to go through 5 experts twice to get human voice
- "IA" monogram for favicon/profile — wrong abbreviation (should be INAA), and a monogram means nothing to a scared defendant anyway

## Remaining Steps

### P0: Tagline Swap (18+ files)
Old tagline "We Research. You Ask." appears in these files and must change to "Know What They Know." or be rewritten contextually:

Source files:
1. src/app/layout.tsx:73 — default title
2. src/app/opengraph-image.tsx:18,56 — OG image alt + render
3. src/app/twitter-image.tsx:8,46 — Twitter image alt + render
4. src/app/blog/[slug]/twitter-image.tsx:58
5. src/app/blog/[slug]/opengraph-image.tsx:71
6. src/components/Footer.tsx:49
7. src/components/HomepageHero.tsx:105
8. src/app/about/page.tsx:27,241,265
9. src/app/page.tsx:82 (FAQ answer — contextual rewrite needed, not simple replacement)
10. src/app/sample/page.tsx:129
11. src/app/sample-xray/page.tsx:99
12. src/app/services/page.tsx:219 (FAQ answer — contextual rewrite)
13. src/lib/intelligence-brief/render.ts:358 — report header
14. src/lib/report-renderer.ts:161 — report header

Content queue files (dozens — search content/queue/ for "We Research. You Ask."):
- reddit/reddit-sop.md
- pinterest/pending/board-strategy.md, idea-pin-series.md
- youtube/pending/long-01-*.md
- And more — do a full grep of content/queue/

### P1: Full Marketing Audit
Every page reviewed through the new lens by the marketing expert team:
- Homepage (page.tsx) — does every section sell quality and methodology?
- Services page — does pricing communicate science not art?
- Score page — is it good enough to be the front door of marketing? (P0 backlog item)
- About page — does it build trust with someone who trusts no one?
- Sample report pages — do they demonstrate rigor?
- Blog posts — do they follow product-adjacent strategy?
- Checkout flow — does it address fear and give control?

### P2: Favicon Fix
- src/app/icon.tsx shows "IA" — should be "INAA" or a simplified version of the new logo

### P3: Score Tool QA (from backlog)
- QA the scoring algorithm, questions, bands, observations
- Test across all charge types
- Improve before pushing to front of marketing

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc --noEmit --skipLibCheck` — TypeScript check
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build` — production build
- `grep -r "We Research. You Ask" src/` — should return 0 matches after tagline swap

## Full Backlog (saved to docs/gbp-services-list.md)
- P0: Score tool QA before marketing push
- P1: Private token URLs for score sharing (referral tracking)
- P1: DAI operator dashboard (aggregate trends, per-charge breakdown)
- P2: Content distribution (130+ pieces queued across Twitter, Reddit, Pinterest, YouTube — all need tagline updated first)
- P3: Google Ads $500 match (deferred until funnel proven with organic)

## GBP Description (final, approved)
Everyone in that courtroom knows each other. The judge. The prosecutor. Your defense attorney. They worked together last week. You are the only stranger in the room.

We read what got filed, what got charged, and what gets missed in cases like yours. Charge by charge. Statute by statute. The findings come back as questions. Information you were always allowed to have.

Know What They Know.

## Copy-Paste Prompt for Next Session
```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-28-marketing-cleanup-and-gbp.md

P0: Swap "We Research. You Ask." tagline to "Know What They Know." across 18+ source files. The handoff has the exact file list with line numbers. Some are simple replacements, some (FAQ answers) need contextual rewrites.

P1: Full marketing audit — dispatch expert team (Suby, Godin, Dunford, Chaperon, Hormozi) to review every customer-facing page through the new brand lens: quality over speed, science not art, address fear / give control / put at ease. The brand voice rules at .claude/rules/brand-voice.md and atti-persona.md have already been updated.

Brand rules already updated. Just execute the swap and audit.
```
