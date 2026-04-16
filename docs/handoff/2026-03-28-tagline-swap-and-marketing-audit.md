# Handoff: Tagline Swap + Marketing Audit Complete
Date: 2026-03-28 16:45

## Task
Full tagline swap ("We Research. You Ask." → "Know What They Know.") across the entire INAA-web codebase, followed by a 4-expert marketing audit of every customer-facing page through the new brand lens (quality over speed, science not art, address fear / give control / put at ease, pro-defendant never anti-attorney).

## What Was Accomplished

### Tagline Swap, COMPLETE (commit fa0d062)
- 87 files changed, 272 insertions, 225 deletions
- Zero occurrences of "We Research. You Ask." remain in any production code
- All content queue files (130+ pieces across YouTube, Pinterest, TikTok, Facebook, Reddit, email) updated
- Edge Function (supabase/functions/generate-report/index.ts), generate-worker, public guides, test scripts, brand.md all updated
- FAQ answer rewritten: "We research. You ask." → "We provide the information, so you know what they know."
- OG title rewritten: "You Ask." → "Know What They Know."
- "INA" abbreviation fixed to "INAA" in FAQ

### Marketing Audit, 48 CRITICAL+HIGH fixes executed (same commit)
4 expert agents audited all pages:
- **Sabri Suby** (direct response): Homepage, 24 findings
- **April Dunford** (positioning): Services + About, 18 findings
- **Peep Laja** (CRO): Score + Checkout + Success, 18 findings
- **Andre Chaperon** (trust): Sample reports + Blog + Footer + Layout, 26 findings

**CRITICAL fixes applied:**
- H1 "You Ask." → "Now You Know." (HomepageHero.tsx)
- "Payment Confirmed" → "Your Analysis Is Being Built" (checkout/success/page.tsx)
- "my client" → first-person defendant voice (sample-xray/page.tsx)
- "hold your attorney accountable" → information-gap framing (layout.tsx, page.tsx OG, MessageTemplates.tsx)
- "Pay $X, Secure Checkout" → "Get My [Tier], $X →" (checkout/page.tsx)
- "Submit Case Details, Start the Clock" → "Tell Us About Your Case" (checkout/success/page.tsx)

**HIGH fixes applied (speed→quality reframing):**
- All tier descriptions in PricingTable.tsx now lead with methodology, not delivery time
- "48 hours" badge → "40+ methodologies" in How It Works step 02
- "The Speed Guarantee" → "The Delivery Guarantee"
- Anti-attorney framing removed from: blog title, about page blog link, services FAQ, global metadata
- Footer: added Sample Report link to Explore column, "We respond within 4 hours" → "Someone who understands your situation responds."
- Score page: removed manufactured 48-hour deadlines from email capture headlines
- Score page: removed "delivered in 48 hours" from all CTAs
- Checkout: removed "Responses within 4 hours" speed claim from email field
- Services: Intelligence Brief descriptions no longer lead with "Fastest"
- Services: Situation Room descriptions lead with trial intelligence, not schedule
- About: "faster, deeper" → "more thoroughly, with documented methodology"
- About: Added "stranger in the courtroom" paragraph after disclaimers
- Sample: Named experts (Lawrence Taylor, Robert Remar, Robert Ramsey) in methodology note

### Favicon, COMPLETE
- src/app/icon.tsx: "IA" → "INAA" (font size 18→13 to fit)

## Files Modified (all in commit fa0d062)

### Source files (production code)
- src/app/layout.tsx, metadata title + description
- src/app/page.tsx, OG, FAQ answers, How It Works, value anchor, charge catalog, pricing intro, guarantee, LeadCapture, final CTA
- src/app/icon.tsx, favicon text
- src/app/opengraph-image.tsx, comment, alt, render
- src/app/twitter-image.tsx, alt, render
- src/app/blog/[slug]/opengraph-image.tsx, render
- src/app/blog/[slug]/twitter-image.tsx, render
- src/app/blog/page.tsx, title, schema, intro copy
- src/app/about/page.tsx, comments, UPL box, differentiators, CTA, stranger-in-courtroom paragraph
- src/app/sample/page.tsx, CTA button, 7-day table, methodology note
- src/app/sample-xray/page.tsx, Q3 voice fix, "may have" hedging fix
- src/app/services/page.tsx, IB descriptions, FAQ, value framing, Situation Room, guarantee, probation
- src/app/score/page.tsx, CTAs, email headlines, methodology line, attorney handler
- src/app/checkout/page.tsx, CTA button, email field
- src/app/checkout/success/page.tsx, headline, intake CTA
- src/components/Footer.tsx, tagline, sample link, speed claim
- src/components/HomepageHero.tsx, H1, subheadline, secondary CTA
- src/components/PricingTable.tsx, tier descriptions, bestFor, War Room, Situation Room
- src/components/StickyMobileCTA.tsx, default label
- src/components/MessageTemplates.tsx, share template
- src/lib/intelligence-brief/render.ts, report header
- src/lib/report-renderer.ts, report header

### Edge Function
- supabase/functions/generate-report/index.ts, 2 header subtitles

### Scripts + test helpers
- scripts/generate-worker.mjs, render-test-report.mjs, render-cd-test.mjs, review-report.mjs, test-pipeline-e2e.mjs, test-report-quality.mjs

### Public guides
- public/guides/dui-first-72-hours-checklist.md
- public/guides/10-questions-your-attorney-hopes-you-never-ask.md

### Design system
- design-system/brand.md

### Content queue (55+ files)
- content/queue/youtube/pending/ (20 files)
- content/queue/tiktok/pending/ (14 files)
- content/queue/pinterest/pending/ (6 files)
- content/queue/facebook/pending/ (4 files)
- content/queue/reddit/reddit-sop.md
- content/queue/email/pending/winback-2.md

## What Didn't Work
- Nothing significant, clean execution. The only catch was finding additional occurrences outside src/ and content/ after the first two swarm agents completed (scripts, Edge Function, public guides). A third agent handled those.

## Remaining Steps

### MEDIUM priority (copy polish, ~30 findings from audit)
Documented in agent output files at:
- C:\Users\email\AppData\Local\Temp\claude\C, Users-email-projects-ImNotAnAttorney-web\130c10e1-af00-4b5f-8747-80e7ba04bac7\tasks\

Key MEDIUM items:
1. Sample page "Your Next 7 Days" table has 2 more burden-language rows to soften
2. Sample-xray "The 10-Day Hard Deadline" → rename to "The Delivery Commitment"
3. Sample-xray Block 9 process overview, name the frameworks (Scheck, Chapman II, MacCarthy)
4. Checkout guarantee for non-crisis tiers, address relevance, not just delivery
5. Score page tribe identity block, connect to CTA
6. Blog post byline "Research Team" → "ImNotAnAttorney"
7. LeadCapture "too busy researching your case" joke, slightly misleading
8. TrustBadges "Content Quality Guarantee" → more specific label

### P3: Score Tool QA (from backlog)
- QA the scoring algorithm, questions, bands, observations
- Test across all charge types
- Improve before pushing to front of marketing

### Content Distribution
- 130+ pieces queued with correct tagline across all platforms
- Need scheduling/posting (Twitter, Reddit, Pinterest, YouTube, TikTok, Facebook)

### Other backlog
- GBP verification pending (profile created, awaiting Google)
- Private token URLs for score sharing (referral tracking)
- DAI operator dashboard (aggregate trends)
- Google Ads $500 match (deferred until funnel proven organic)

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc,noEmit,skipLibCheck`, TypeScript clean
- `grep -r "We Research. You Ask" src/`, 0 matches confirmed
- `grep -r "hold your attorney accountable" src/`, 0 matches confirmed
- `grep -r "You Ask\." src/`, 0 matches confirmed
- Production deploy via git push, commit fa0d062 pushed to master

## Copy-Paste Prompt for Next Session
```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-28-tagline-swap-and-marketing-audit.md

Tagline swap and CRITICAL+HIGH marketing audit fixes are DONE (commit fa0d062, deployed).

Next priorities:
1. Execute ~30 MEDIUM copy polish findings from the marketing audit (listed in Remaining Steps)
2. P3: Score Tool QA, audit the scoring algorithm, questions, bands before marketing push
3. Content distribution, 130+ pieces queued with correct tagline, need scheduling

Brand rules at .claude/rules/brand-voice.md and atti-persona.md are already updated.
```
