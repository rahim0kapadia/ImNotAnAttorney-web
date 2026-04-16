# Deferred Items: Site Quality and Product Completeness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete all deferred items from Phase 5 expert audit, ship DAI display, add DefinedTermSet glossary schema, and flip remaining service tiers to live.

**Architecture:** 9 tasks across homepage CRO fixes, score page DAI features, schema markup, and Stripe tier activation. Tasks 1-5 are independent (parallel safe). Tasks 6-9 are sequential (same file).

**Tech Stack:** Next.js 15, Tailwind CSS, Supabase RPCs, Stripe dual-mode, Schema.org JSON-LD

**Context:**
- Repo: C:\Users\email\projects\ImNotAnAttorney-web
- Deploy: git push origin master (Vercel auto-deploys)
- Stripe: dual-mode (live flag per tier in src/lib/tiers.ts)
- Score API already increments counters and score_aggregates tables. DAI UI just reads them.
- Phase 5.3 already done: 5.3.1, 5.3.2, 5.3.5, 5.3.6, 5.3.8
- Phase 5.3 remaining: 5.3.3 (CTA audit), 5.3.4 (value stacking), 5.3.7 (Google Business Profile - manual, Rahim)

## Files to Modify

- src/app/page.tsx (T1: remove mid-page score CTA, T5: inject glossary schema)
- src/components/motion/DiscoveryReveal.tsx (T1: remove about link)
- src/components/PricingTable.tsx (T2: add value stacking)
- src/app/score/page.tsx (T4: DAI social proof + benchmarks)
- src/lib/schema.ts (T5: generateDefinedTermSet function)
- src/lib/tiers.ts (T6-T9: flip live flags)

## Files to Create

- src/app/api/stats/score-summary/route.ts (T3: DAI stats API)

## Tasks

### Task 1: CTA Audit (Phase 5.3.3) - Reduce Homepage CTAs

Laja flagged 14 distinct CTA touchpoints creating decision paralysis for crisis-state users with degraded working memory (Covello). Remove 2 low-intent distractors to get to 8.

Files: src/components/motion/DiscoveryReveal.tsx, src/app/page.tsx

- [ ] In DiscoveryReveal.tsx, remove the "Read the full story" Link to /about (lines 168-173). Change the parent div from flex-col with gap-2 to just text-center with the single remaining sample report link.
- [ ] In page.tsx, remove the "Not ready to commit? Check your attorney's score" block after inline testimonials (lines 343-353).
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: fix(cro): reduce homepage CTAs from 14 to 8

### Task 2: Value Stacking in PricingTable (Phase 5.3.4)

Brunson's stack approach shows ROI context. Current pricing cards have single-line anchor text. Full value stack makes $197 feel trivial against $1,000+ in equivalent services.

Files: src/components/PricingTable.tsx

- [ ] Add TierCard interface with optional valueStack: ReadonlyArray<{ item: string; value: string }>
- [ ] Add valueStack arrays to first 3 tiers:
  - Case Decoder: consultation $500, question set $200, diagnostic $150, playbook $100
  - Intelligence Brief: second-opinion review $1,500, judge research $300, motion analysis $400, prosecution assessment $200
  - X-Ray: discovery review $2,000, evidence audit $500, constitutional analysis $800, witness prep $400
- [ ] Render value stack in tier cards between bestFor and features list: left-aligned items with strikethrough prices, total value sum at bottom with amber highlight
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat(cro): add Brunson value stacking to pricing cards

### Task 3: DAI Stats API Endpoint

Score API already increments counters and score_aggregates tables via Supabase RPCs. This endpoint reads them for the score page to display social proof and benchmarks.

Files: Create src/app/api/stats/score-summary/route.ts

- [ ] Create GET endpoint that queries counters table (score_completions) and score_aggregates table (all rows)
- [ ] Calculate percentage metrics: pctNoMotions, pctNeverDiscovery, pctNoComm from aggregates
- [ ] Return JSON with totalCompletions and insights object
- [ ] Use Next.js ISR with revalidate = 300 (5-minute cache)
- [ ] No auth required (public aggregate data, no PII)
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat: add DAI stats endpoint

### Task 4: DAI Display on Score Page

Social proof counter normalizes behavior and creates urgency. Benchmark data validates the score findings with aggregate insights from all defendants who have used the tool.

Files: src/app/score/page.tsx

- [ ] Add stats state (totalCompletions + insights) and useEffect to fetch /api/stats/score-summary on mount (silent fail)
- [ ] Add social proof counter above quiz form: "X defendants have scored their defense" (only shows when 50+ completions exist)
- [ ] Add benchmark insights after score result display: "What our data shows" section with pctNoMotions, pctNeverDiscovery, pctNoComm percentages (only shows non-zero values)
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat: add DAI social proof + benchmark insights to score page

### Task 5: DefinedTermSet Glossary Schema

DefinedTermSet schema improves AI citation rates and entity signals for YMYL criminal defense terms. Google Knowledge Graph and LLM search engines use these for entity association.

Files: src/lib/schema.ts, src/app/page.tsx

- [ ] Add generateDefinedTermSet() function to schema.ts returning DefinedTermSet with 8 criminal defense terms: Brady Material, Chain of Custody, Constructive Possession, Suppression Motion, Discovery, Field Sobriety Test, Plea Bargain, Sentencing Guidelines. Each term has name, description (2-3 sentences in defendant voice), and url linking to relevant blog post.
- [ ] In page.tsx, import generateDefinedTermSet and add a script type="application/ld+json" block after the LegalService schema block.
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat(seo): add DefinedTermSet glossary schema - 8 criminal defense terms

### Task 6: Flip Intelligence Brief to LIVE ($997)

Files: src/lib/tiers.ts

- [ ] Find intelligence-brief tier, change live: false to live: true
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat(stripe): flip Intelligence Brief ($997) to live payments

### Task 7: Flip X-Ray to LIVE ($2,497)

Files: src/lib/tiers.ts

- [ ] Find x-ray tier, change live: false to live: true
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat(stripe): flip X-Ray ($2,497) to live payments

### Task 8: Flip War Room to LIVE ($4,997)

Files: src/lib/tiers.ts

- [ ] Find war-room tier, change live: false to live: true
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat(stripe): flip War Room ($4,997) to live payments

### Task 9: Flip Situation Room to LIVE ($9,997)

Files: src/lib/tiers.ts

- [ ] Find situation-room tier, change live: false to live: true
- [ ] Run: npx tsc,noEmit,skipLibCheck
- [ ] Commit: feat(stripe): flip Situation Room ($9,997) to live payments
- [ ] Push all: git push origin master

## Manual Task (Rahim)

Google Business Profile (Phase 5.3.7): Create at business.google.com. Zero cost, builds entity signals. Browser-only task.

## Execution Order

Parallel batch 1 (Tasks 1-5): CTA audit, value stacking, DAI API, DAI display, glossary schema. All independent files.

Sequential batch 2 (Tasks 6-9): Tier flips in tiers.ts. One at a time, push after T9.

Final: git push origin master deploys everything.
