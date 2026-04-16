# Blog Pipeline Self-Improving Feedback Loop

**Date:** 2026-04-09
**Status:** Draft
**Expert:** Kevin Indig (Shopify/G2/Atlassian organic growth, SEO growth loops where content performance feeds back into content strategy). Validated by Brian Balfour (Reforge, modular loops with independent measurement cadences) and AI-in-the-loop literature (adaptive thresholds, benchmark-correlated modifications).

## Problem

The blog pipeline discovers what to write about (demand signals from Reddit) and enforces quality (5-gate QA), but never learns from results. `content_performance` tracks post attribution weekly but the data feeds nothing, gap scoring, generation prompts, and QA thresholds are all static. The pipeline generates content into a void with no mechanism to improve.

Worse: the attribution layer that would provide signal is broken at every junction. Blog CTAs carry no referral params. The `referral_url` column on `subscribers` was never migrated. Source gets overwritten from `"score-page"` to `"checkout"` on purchase. `track-performance.ts` already reads `referral_url` but gets null every time.

## Audience Context

Criminal defendants are crisis buyers with a 7-day decision window. They Google at 2AM after arrest, find a blog post, and either convert through the score tool within a week or move on. Traditional content marketing metrics (subscriber nurture, email sequence conversions) are secondary. The real funnel is:

```
Blog post (SEO) -> Score tool (60sec, anonymous) -> Email capture (peak engagement) -> Charge-matched CTA -> Checkout
```

Performance signals must match this reality: which posts pull crisis-intent traffic, which charge types convert through the score tool, and which blog-to-score-to-checkout paths produce revenue.

## System Triage (current state as of 2026-04-09)

### What works
- **Signal ingestion:** 1,063 Reddit signals, fetched daily, classified by charge/urgency. Fresh.
- **Demand scoring:** 891 scores across 297 dimensions x 3 windows (7d/30d/90d). DUI dominates GOLD_MINE.
- **Content gap identification:** 621 gaps found (582 identified, 36 queued, 3 in-progress).
- **Cron orchestration:** All 7 daily crons ran today, all completed. Infrastructure healthy.
- **QA gates:** 5-gate system (humanizer, anti-hallucination, slop, UPL, DNA) defined and tested. 59/59 posts pass humanizer.
- **Performance tracker code:** `track-performance.ts` already reads `referral_url` and computes attribution, will work once the column exists.

### What's broken
- **Blog generation dead:** 0 blog drafts ever created. Anthropic credits depleted = no LLM calls.
- **Attribution chain broken end-to-end:**
  - `subscribers` table has no `referral_url` column (migration never written)
  - Blog CTAs (`BlogInlineCapture`, `BlogCTA`, `PlaybookCTA`) don't accept `slug` prop, link to `/score` with no params
  - `blog/[slug]/page.tsx` has `slug` variable but doesn't pass it to any CTA component
  - `ScoreClient.tsx` doesn't read URL params, drops `?ref=` silently
  - `/api/subscribe` doesn't accept or store `referral_url`
  - `/api/checkout` hardcodes `source: "checkout"`, overwrites previous source
- **Content performance all zeros:** 180 rows, every metric at 0. Attribution wiring broken, not "no conversions."
- **Emerging topics untriaged:** 47 detected, 0 promoted, 0 dismissed. Piling up.
- **90d performance window empty.** 7d and 30d have 80 rows; 90d has 0.

### What's missing
- No performance signal feeds into `score-demand.ts` gap_score formula (line 370, purely coverage-based)
- No winning pattern extraction from existing 59 posts
- No adaptive QA threshold, humanizer hardcoded at 45 (line 717 of humanizer.mjs)
- No underperformer flagging or revision mechanism
- No auto-promotion path for emerging topics into the generation queue
- Engine `prompts.mjs` has no "what's working" section, doesn't know what resonates

## Design

Three phases, ordered by dependency. Phases 0 and 1 ship together. Phase 2 ships same session but activates after 30 days of Phase 0 data accumulation.

### Phase 0: Fix Attribution Chain

Fix the broken wiring so conversion data can flow from blog posts through the score tool to purchases.

#### Migration: `subscribers` table

Add two columns:
- `referral_url text`, the blog slug or page that referred the subscriber (e.g., `blog-dui-first-72-hours`)
- `original_source text`, first source that created this subscriber, never overwritten

#### `/api/subscribe` changes (src/app/api/subscribe/route.ts)

- Accept `referral_url` in body (add to allowlist validation)
- On INSERT: set both `source` and `original_source` to the provided source
- On UPDATE (re-subscription): update `source` only, preserve `original_source`
- Store `referral_url` if provided

#### `/api/checkout` changes (src/app/api/checkout/route.ts)

- Accept optional `ref` in body, thread to subscriber upsert as `referral_url`
- Same `original_source` preservation: don't overwrite on re-subscription
- Add `referral_url` to Stripe session metadata for webhook attribution

#### Blog page -> CTA attribution (src/app/blog/[slug]/page.tsx)

- Pass `slug` prop to `BlogInlineCapture`, `BlogCTA`, `PlaybookCTA`
- Update the hardcoded `/score` CTA link to include `?ref=blog-{slug}`

#### CTA component changes

| Component | File | Change |
|---------, |------|------, |
| BlogInlineCapture | src/components/BlogInlineCapture.tsx | Accept `slug` prop, append `?ref=blog-{slug}` to `/score` link |
| BlogCTA | src/components/BlogCTA.tsx | Accept `slug` prop, append `?ref=blog-{slug}` to all outbound links |
| PlaybookCTA | src/components/PlaybookCTA.tsx | Accept `slug` prop, append `?ref=blog-{slug}` to both links |
| LeadCapture | src/components/LeadCapture.tsx | Accept `referralUrl` prop, include in subscribe body |

#### Score tool threading (src/app/score/ScoreClient.tsx)

- Read `ref` from URL search params via `useSearchParams()`
- Pass through to `/api/subscribe` as `referral_url` when user enters email
- This closes the blog -> score -> subscribe attribution chain

#### Checkout threading

- Score CTA links already carry `?charge=...&band=...`, add `&ref=blog-{slug}` from score page
- Checkout page reads `ref` from URL params, includes in checkout API call
- Webhook receives `referral_url` in Stripe metadata, can attribute order to blog post

### Phase 1: Traffic-Based Feedback Loop

Works immediately with structural analysis of existing 59 posts. No attribution data needed.

#### New table: `demand_feedback`

```sql
CREATE TABLE demand_feedback (
  charge_type_slug text PRIMARY KEY,
  performance_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  winning_patterns jsonb NOT NULL DEFAULT '{}',
  qa_humanizer_threshold integer NOT NULL DEFAULT 45,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### New file: `src/lib/demand/feedback-score.ts` (~180 lines)

Weekly cron logic:
1. Read `content_performance` (30d window) grouped by `charge_type_slug`
2. Compute conversion efficiency per charge type: `(orders_attributed + subscriber_signups * 0.3) / blog_post_count`
3. Normalize to a 0.5-2.0 multiplier range (median = 1.0)
4. If no attribution data yet (all zeros), fall back to Vercel Analytics API page view counts, charge types with more traffic get a slight boost (1.0-1.3 range)
5. Upsert to `demand_feedback.performance_multiplier`
6. **Auto-promote emerging topics:** Query `emerging_topics` where `status='detected'`, `post_count >= 5`, `avg_urgency >= 6`. Insert matching `content_gaps` rows with `status='identified'`. Update `emerging_topics.status` to `'auto-promoted'`.

#### New file: `src/lib/demand/feedback-patterns.ts` (~200 lines)

Weekly cron logic:
1. Read all 59 published MDX files from `content/blog/` via filesystem
2. Extract structural features per post (pure TypeScript, no LLM):
   - Word count, paragraph count, avg paragraph length
   - Question density (questions per 1000 words)
   - Opening pattern classification (question / statistic / scenario / direct address)
   - H2 count and heading-to-body ratio
   - List presence (bullet, numbered), bold phrase density
   - First-person vs second-person pronoun ratio
   - TLDRBox length
   - FAQ count
3. If `content_performance` has real data: rank posts by performance, compare top 10 vs bottom 10 structural features
4. If no performance data yet: rank by Vercel Analytics page views (available via API)
5. Compute deltas: "Top performers average 8.2 questions per 1000 words vs 3.1 for bottom performers"
6. Store as JSON in `demand_feedback.winning_patterns`

#### New cron routes

| Route | File | Schedule |
|-------|------|----------|
| `/api/cron/demand-feedback-score` | src/app/api/cron/demand-feedback-score/route.ts | Sun 7:00 AM ET (after demand-performance) |
| `/api/cron/demand-feedback-patterns` | src/app/api/cron/demand-feedback-patterns/route.ts | Sun 8:00 AM ET (after feedback-score) |

#### Modify `score-demand.ts`

Line 370 changes from:
```ts
score.content_gap_score = Math.max(1, 10 - blogCount * 2);
```
To:
```ts
const multiplier = feedbackByCharge[score.dimension_slug]?.performance_multiplier ?? 1.0;
score.content_gap_score = Math.max(1, (10 - blogCount * 2) * multiplier);
```

Where `feedbackByCharge` is loaded from `demand_feedback` table at function start.

#### Inject winning patterns into engine prompts

Engine `prompts.mjs` at line ~256 (between anti-hallucination and voice profile sections):

```
## WHAT'S WORKING (data from top-performing posts)

${winningPatterns || 'No performance data yet, use voice profile defaults.'}
```

The `buildGenerationPrompt` function's `enrichment` parameter gets a new `winningPatterns` field, populated by the blog-generate worker reading `demand_feedback.winning_patterns` for the target charge type.

### Phase 2: Attribution-Powered Closed Loop

Ships in same session. Activates automatically once Phase 0 data accumulates (30+ days with non-zero attribution).

#### New table: `content_revisions`

```sql
CREATE TABLE content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_slug text NOT NULL,
  content_post_id integer REFERENCES content_posts(id),
  reason text NOT NULL, , 'underperformer_30d', 'low_score_completion', etc.
  status text NOT NULL DEFAULT 'flagged', , flagged -> queued -> regenerated -> published
  original_performance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### New file: `src/lib/demand/feedback-revise.ts` (~200 lines)

Weekly cron logic:
1. **Underperformer flagging:** Posts with 30+ days of data, zero subscribers, zero orders, AND `referral_url` attribution data exists for other posts (proves the system is working) -> flag in `content_revisions` with `status='flagged'`
2. **Gate:** Only flag if at least 5 posts have non-zero attribution (prevents false positives during data accumulation)
3. **Cap:** Max 2 revisions flagged per week
4. **Revision queue:** Flagged posts enter the blog-generate pipeline for regeneration: re-enrich topic, regenerate with winning patterns injected, run through QA gates, publish as replacement (same slug, updated MDX)

#### Adaptive QA threshold

In `feedback-revise.ts`:
1. Correlate humanizer composite score vs. 30d `subscriber_signups` across all posts with attribution data
2. If posts in the 35-45 score range outperform posts in the 25-35 range, threshold stays or adjusts down by 5
3. If posts scoring < 30 consistently outperform, adjust down (more human-sounding posts convert better)
4. Store in `demand_feedback.qa_humanizer_threshold`
5. Floor: 25. Ceiling: 55. Max adjustment: +/- 5 per week.

In `scripts/lib/blog-gen/humanizer.mjs`:
- Line 287: `runHumanizerCheck(mdxContent, options = {})` accepts optional `threshold`
- Line 717: `compositeScore < (options.threshold ?? 45)`

In `scripts/qa-existing-post.mjs`:
- Load adaptive threshold from `demand_feedback` table before running gates
- Pass to humanizer via options

#### Voice profile evolution

In `feedback-patterns.ts` (extended):
1. For charge types with 5+ posts and real attribution data: compare winning post language patterns against voice profile DO/DON'T examples
2. If winning posts consistently use patterns not covered by the voice profile, append a `## LEARNED PATTERNS (auto-generated, updated YYYY-MM-DD)` section
3. Clearly marked as auto-generated so manual edits stay clean
4. Git commit via Contents API so changes are tracked
5. Only triggers when pattern delta is statistically significant (>= 3 posts showing the pattern)

#### New cron route

| Route | File | Schedule |
|-------|------|----------|
| `/api/cron/demand-feedback-revise` | src/app/api/cron/demand-feedback-revise/route.ts | Sun 9:00 AM ET (after feedback-patterns) |

## Cron Schedule (complete Sunday pipeline)

| Time (ET) | Job | Existing? |
|---------, |---, |---------, |
| ~2:00 AM | demand-fetch | Yes |
| ~3:00 AM | demand-classify | Yes |
| ~4:00 AM | demand-score | Yes |
| 6:00 AM | demand-performance | Yes (weekly gate) |
| 7:00 AM | demand-feedback-score | NEW |
| 8:00 AM | demand-feedback-patterns | NEW |
| 9:00 AM | demand-feedback-revise | NEW |

All three new crons use 7-day idempotency windows (same as demand-performance).

## File Change Summary

### Phase 0 (attribution fix), 10 files

| File | Action |
|------|------, |
| `supabase/migrations/YYYYMMDD_subscriber_attribution.sql` | NEW, add referral_url + original_source columns |
| `src/app/api/subscribe/route.ts` | EDIT, accept referral_url, preserve original_source |
| `src/app/api/checkout/route.ts` | EDIT, accept ref, thread to subscriber + Stripe metadata |
| `src/app/blog/[slug]/page.tsx` | EDIT, pass slug to all CTA components |
| `src/components/BlogInlineCapture.tsx` | EDIT, accept slug, append ?ref to /score link |
| `src/components/BlogCTA.tsx` | EDIT, accept slug, append ?ref to all outbound links |
| `src/components/PlaybookCTA.tsx` | EDIT, accept slug, append ?ref to links |
| `src/components/LeadCapture.tsx` | EDIT, accept referralUrl prop, include in body |
| `src/app/score/ScoreClient.tsx` | EDIT, read ref from URL params, pass to subscribe |
| `src/app/score/page.tsx` | EDIT, wrap ScoreClient in Suspense for useSearchParams |

### Phase 1 (traffic-based loop), 7 files

| File | Action |
|------|------, |
| `supabase/migrations/YYYYMMDD_demand_feedback.sql` | NEW, demand_feedback table |
| `src/lib/demand/feedback-score.ts` | NEW, performance multiplier + emerging auto-promote |
| `src/lib/demand/feedback-patterns.ts` | NEW, structural pattern extraction |
| `src/app/api/cron/demand-feedback-score/route.ts` | NEW, weekly cron route |
| `src/app/api/cron/demand-feedback-patterns/route.ts` | NEW, weekly cron route |
| `src/lib/demand/score-demand.ts` | EDIT, read multiplier, apply to gap_score (line 370) |
| `scripts/setup-demand-feedback-crons.js` | NEW, register 2 crons with cron-job.org |

### Phase 2 (attribution-powered loop), 7 files

| File | Action |
|------|------, |
| `supabase/migrations/YYYYMMDD_content_revisions.sql` | NEW, content_revisions table |
| `src/lib/demand/feedback-revise.ts` | NEW, underperformer flagging + adaptive QA |
| `src/app/api/cron/demand-feedback-revise/route.ts` | NEW, weekly cron route |
| `scripts/lib/blog-gen/humanizer.mjs` | EDIT, accept threshold option (line 287, 717) |
| `scripts/qa-existing-post.mjs` | EDIT, load adaptive threshold, pass to humanizer |
| Engine: `src/lib/blog-gen/prompts.mjs` | EDIT, inject winning patterns section (line ~256) |
| Engine: `src/workers/blog-generate.mjs` | EDIT, read demand_feedback.winning_patterns, pass to enrichment |

**Total: 24 files (10 new, 14 edited) across 2 repos.**

## Activation Guards

Phase 2 features include safety gates to prevent action on insufficient data:

- **Underperformer flagging:** Only activates when >= 5 posts have non-zero `referral_url` attribution. Prevents flagging everything as underperforming before attribution data accumulates.
- **Adaptive QA threshold:** Only adjusts when >= 10 posts have both humanizer scores and attribution data. Floor 25, ceiling 55, max +/- 5 per week.
- **Voice profile evolution:** Only triggers when >= 5 posts in a charge type show a consistent pattern delta. Appends only, never removes manual content.
- **Performance multiplier:** Falls back to Vercel Analytics page views when attribution data is all zeros. Never multiplies below 0.5 (prevents total suppression of a charge type).

## Cascade Analysis

- **Us:** Pipeline improves automatically. Less manual curation. Better posts.
- **Defendants:** Higher-quality content matched to their charge type. Posts that actually helped others get amplified. Underperformers get rewritten.
- **Attorneys (downstream):** Better-prepared defendants who found more relevant information. Less noise in the content ecosystem.
- **Ecosystem:** Blog content quality floor rises over time. SEO value compounds as posts improve.
- **Future-us:** Foundation for any new content type (guides, tools, calculators) to benefit from the same feedback loop. Attribution layer is reusable.
