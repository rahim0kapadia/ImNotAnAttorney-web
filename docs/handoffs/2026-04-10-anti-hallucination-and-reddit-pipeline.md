# Handoff: Anti-Hallucination Fixes + Reddit Response Pipeline Plan
Date: 2026-04-10 21:30

## Task
1. Push engine repo (blog pipeline V2 + prompt consolidation)
2. Execute blog virality retrofit plan (already done — confirmed)
3. Fix all anti_hallucination gate failures across blog posts
4. Plan Reddit response pipeline for monitoring + responding to defendants

## Approach
- Anti-hallucination fixes: surgical text edits — source unsourced stats, generalize numbers, add jurisdiction qualifiers, remove named experts, remove unverified bill numbers. No rewrites.
- Discovered `ANTHROPIC_API_KEY` from `.env.local` was leaking into `claude -p` spawn, causing it to hit the depleted API instead of CLI subscription. Fixed by stripping the key from spawn env.
- Reddit pipeline: designed as cron-based monitoring system using Reddit JSON API (no auth needed), Telegram notifications with copy-paste drafts, human posting from Rahim's 4-year-old aged account.

## Files Modified

### Committed + pushed (2 commits)

**Commit `2f8a62c` — anti_hallucination round 1 (13 posts):**
- `content/blog/complete-dui-defense-guide.mdx` — "The 77% Problem" → "The Accuracy Problem"
- `content/blog/how-criminal-cases-actually-work.mdx` — unsourced "3-10%" generalized, heading/table/SOCIAL_SPINE
- `content/blog/how-your-attorney-makes-money.mdx` — "Two-thirds of lawyers" → bar complaint reference
- `content/blog/private-attorney-vs-public-defender.mdx` — "$50K-$100K" → "tens of thousands"
- `content/blog/questions-to-ask-public-defender.mdx` — "200-400+ cases" → "hundreds of cases"
- `content/blog/sex-offense-what-every-defendant-needs-to-know.mdx` — HB 1028 removed, Elizabeth Loftus removed, "45 states" → "majority", 6x jurisdiction qualifiers added
- `content/blog/technical-probation-violation-missed-appointment.mdx` — BJS source added to first occurrence
- `content/blog/trafficking-charges-constructive-possession.mdx` — "(INAA case analysis)" added to unsourced case numbers
- `content/blog/what-happens-if-attorney-misses-deadline.mdx` — "30 days" → "typically 30 days, varies by jurisdiction"
- `content/blog/what-happens-if-you-violate-probation.mdx` — SB 105 → "recent probation reform legislation"
- `content/blog/what-to-expect-after-dui-arrest.mdx` — "In most states" added to DMV deadline FAQ
- `content/blog/will-criminal-charge-cost-you-your-job.mdx` — NELP source added to FAQ + GROUP_ANSWER
- `content/blog/wire-fraud-defense-questions.mdx` — "triggers" → "can trigger"

**Commit `abab725` — round 2 fixes + sidecars + API key fix:**
- `content/blog/how-criminal-cases-actually-work.mdx` — "In most jurisdictions" added, sentencing timeline generalized
- `content/blog/how-your-attorney-makes-money.mdx` — "300-500" → "far exceeding limit (ABA)", complaint category softened
- `content/blog/sex-offense-what-every-defendant-needs-to-know.mdx` — $50K removed, "20%" generalized, registration claims qualified
- `content/blog/what-happens-if-you-violate-probation.mdx` — "30-180 days" removed from shock jail
- `content/blog/.qa-state/*.json` — all 59 sidecars refreshed
- `scripts/lib/blog-gen/claude-client.mjs` — strip ANTHROPIC_API_KEY from spawn env

### Created (not committed)
- `docs/plans/reddit-response-pipeline.md` — full plan with Ross Simmonds expert review baked in
- `content/queue/reddit/pending/03-comment-dui-arrest-panic.md` — fixed unsourced stats
- `content/queue/reddit/pending/07-comment-drug-charge-weight.md` — fixed unsourced 73% claim

### Memory updated
- `MEMORY.md` — corrected gotcha-anthropic-credits index entry (Blog QA uses CLI, not API)

## What Didn't Work
- Parallel agents blocked by CPU threshold hook (100% CPU)
- First sidecar re-grade run failed: `ANTHROPIC_API_KEY` from `.env.local` leaked into `claude -p` subprocess → hit depleted API → "Credit balance is too low". Fixed by stripping the key from spawn env.
- LLM non-determinism: ~20% flip rate on anti_hallucination gate. 4 posts needed a second round of fixes after new issues surfaced on re-grade.
- Triage hook blocked edits mid-session — auto-upgraded from QUICK_FIX to FEATURE after 3 files.

## Remaining Steps

### Priority 1: Execute Reddit Response Pipeline
```
Execute the Reddit Response Pipeline plan at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\reddit-response-pipeline.md

Context: Rahim has a 4-year-old personal Reddit account. The plan builds
an automated monitoring system that watches r/dui, r/legaladvice, r/probation
for new posts matching 10 pre-written comment templates. When a match is found,
it customizes the template and sends a Telegram notification with the thread URL
+ ready-to-paste draft response. Rahim edits and posts manually from his phone.

Ross Simmonds expert review baked into the plan:
  - Draft is a starting point, NOT copy-paste (Reddit flags paste-and-post)
  - No blog link in initial comment (earn it first, link in follow-up reply)
  - 2-week warmup: value-only comments, zero links
  - One account only, forever

Key infrastructure already built:
  - fetchRedditSignals() in src/lib/demand/fetch-signals.ts
  - Telegram @BorisLegalBot notifications
  - 10 comment templates in content/queue/reddit/pending/
  - 59 blog posts (59/59 safety gates pass) mapped to templates
  - cron-job.org registration pattern in scripts/cronjob-org-ids.json

Budget: $0. No Playwright needed. Reddit JSON API is unauthenticated for
public subreddit reads.
```

### Priority 2: Commit remaining uncommitted files
- `docs/plans/reddit-response-pipeline.md`
- `content/queue/reddit/pending/03-comment-dui-arrest-panic.md`
- `content/queue/reddit/pending/07-comment-drug-charge-weight.md`

## Key Decisions
- **claude-client.mjs API key strip:** Root cause of all "credits depleted" blog QA failures. The `.env.local` ANTHROPIC_API_KEY was being inherited by `claude -p` subprocess. Fix: `delete cleanEnv.ANTHROPIC_API_KEY` before spawn. This permanently fixes the issue for all future QA runs.
- **Reddit pipeline uses JSON API, not OAuth API:** No auth needed for reading public subreddits. `reddit.com/r/dui/new.json` works unauthenticated.
- **Human posting, not bot posting:** Rahim's 4-year-old account. Templates are drafts, not copy-paste. Ross Simmonds confirms paste-and-post triggers AI review.
- **No blog link in initial comment:** Per Simmonds — post value first, link only in follow-up reply 30+ min later or if asked.

## Verification
- `node -e "..."` safety gate tally → `{ total: 59, safety_passed: 59 }` (confirmed)
- `npx tsc --noEmit --skipLibCheck` → clean (confirmed)
- `git log --oneline -3` → 2f8a62c + abab725 pushed to master
