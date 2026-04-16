# Phase 2 Distribution, Execution Plan

## Status: CONTENT CREATED, AWAITING POSTING

All content is in `content/queue/{platform}/pending/`. This plan covers the NEXT step: actually posting/publishing it.

## What "Execute" Means Per Platform

| Platform | Action Required | Automation Level |
|----------|----------------|---------------, |
| **Quora** | Copy-paste 35 answers, 1/day | Manual (no API) |
| **Reddit** | Follow 4-phase SOP over 7+ weeks | Manual (account needed) |
| **Facebook** | Join groups, post 20 pieces over 4 weeks | Manual (account needed) |
| **TikTok** | Film 30 scripts, post 1/day | Manual (filming needed) |
| **YouTube** | Film 10 Shorts + 5 long-form | Manual (filming/editing needed) |
| **Pinterest** | Create boards, design pins, schedule | Semi-auto (Tailwind/scheduler) |
| **Email** | Implement 3 flows in drip engine code | Code change (src/lib/drip-emails.ts) |
| **GEO/SEO** | Implement audit recommendations | Code changes (MDX + schema) |
| **Growth** | Execute strategy items by priority tier | Mixed |

## What CC Can Do With An Agent Swarm

### Tier 1: Fully Automatable (CC agents can execute)
1. **Email flows**, Wire the 3 new flows into `src/lib/drip-emails.ts` + add Supabase triggers
2. **GEO fixes**, Add TLDRBoxes to 5 posts, move stats to openings, add definition blocks
3. **Schema fixes**, LegalService schema, fix Organization sameAs, add founder, add HowTo schema
4. **Internal linking**, Add missing hub-spoke links per entity-seo-roadmap.md
5. **Pinterest scheduling**, If Tailwind API or similar is set up

### Tier 2: CC Prepares, Rahim Posts (agent formats, human clicks)
1. **Quora**, CC can open browser via Puppeteer, paste answers (needs Rahim's Quora login)
2. **Facebook**, CC formats posts with optimal timing, Rahim posts to groups

### Tier 3: Requires Rahim (filming, accounts, approvals)
1. **TikTok/YouTube**, Scripts ready, need someone on camera
2. **Reddit**, Account creation + warm-up is a manual process
3. **Paid ads**, Budget approval + account setup

## Swarm Architecture (for when Rahim says "go")

```
/distribute, launches Phase 2 execution swarm

Team 1: Code Changes (sequential, touches same codebase)
  Agent A: Email flow implementation (drip-emails.ts + migrations)
  Agent B: GEO fixes (5 TLDRBoxes + stat repositioning in MDX files)
  Agent C: Schema fixes (layout.tsx + page.tsx + blog/[slug]/page.tsx)
  Agent D: Internal linking pass (MDX cross-references)

Team 2: Scheduling Prep (parallel, independent outputs)
  Agent E: Quora posting calendar (35 answers → 35-day calendar with dates)
  Agent F: Facebook posting calendar (20 posts → 4-week calendar)
  Agent G: Pinterest pin designs (text specs for Canva batch creation)
  Agent H: Content calendar master (cross-platform schedule)
```

## How To Trigger

Tell CC: "Execute Phase 2 distribution, plan at docs/plans/2026-03-13-phase2-distribution-execute.md"

CC will read this plan, triage as LARGE BUILD, and launch the swarm.

Rahim can also scope it down:
- "Just do the email flows" → Agent A only
- "Do all the code changes" → Team 1 only
- "Give me the posting calendars" → Team 2 only
