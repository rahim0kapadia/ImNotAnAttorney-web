# Handoff: Blog Virality Retrofit + Hard-Gate Architecture
Date: 2026-04-09

## Task

Upgrade all 59 blog posts with virality convergence principles, then architect hard QA gates so no post can ship without passing all 5 quality checks. Started as a content retrofit, ended with an architectural gap discovered: the retrofit bypassed the QA pipeline entirely and only applied one layer of upgrades. Next session must build the hard-gate system.

## What Shipped This Session (3 commits)

| Commit | Repo | What |
|---|---|---|
| `fd19414` | engine | Blog pipeline port + virality convergence (V1-V7, D11/D12, SOCIAL_SPINE) — 15 files, 3,573 lines |
| `e6a694c` | web | Cron routes converted to enqueuers, generation logic deleted — 11 files, -2,527 lines |
| `d54e063` | web | All 59 blog posts retrofitted with V1-V7 + D11/D12 + SOCIAL_SPINE — 59 files, +5,016 lines |

## Approach

**Session 1 (content retrofit):**
- Audited 3 sample posts against 7 virality principles — all failed D11 (screenshot sentence), V1 (scenario-first), SOCIAL_SPINE
- Dispatched 12 parallel agents, 5 posts each, to apply V1-V7 + D11/D12 + SOCIAL_SPINE
- All 59 posts retrofitted, zero UPL violations, tsc clean

**Session 2 (gap discovery):**
- User asked where Hormozi formulaization and "for dummies" enhancements were
- Grep showed only 12/59 posts have Variable Map patterns, 1/59 has Contrast Frame
- Realized the retrofit BYPASSED the pipeline — cherry-picked V1-V7 only
- The 5 QA gates (anti-hallucination, humanizer, slop, UPL, DNA) never ran on existing posts
- Hormozi, Witte EPPM, and voice profile calibration were all skipped

**Architectural decision:** Build hard gates so this cannot happen again. Mirror Katie's KDP pipeline — gates in the path, not next to it.

## The Hard-Gate Architecture (NEXT SESSION BUILDS THIS)

### Layer 1: Unified QA Runner Script

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\scripts\qa-existing-post.mjs`

Takes any .mdx file path (or `--all` for every post), runs all 5 gates against it using the engine's gate logic, writes results to a sidecar JSON file. Pure function, no database dependency.

```
Usage:
  node scripts/qa-existing-post.mjs content/blog/foo.mdx
  node scripts/qa-existing-post.mjs --all
  node scripts/qa-existing-post.mjs --all --gate=dna   # single gate
```

The gate logic lives in `ImNotAnAttorney-engine/src/lib/blog-gen/`:
- `qa-anti-hallucination.mjs` — Opus (or skip if credits depleted, log as "unchecked")
- `humanizer.mjs` — pure JS, always runs
- `qa-slop.mjs` — Sonnet
- `qa-upl.mjs` — Sonnet
- `qa-dna.mjs` — Sonnet

Import these directly from the engine repo or copy into web repo as a one-time snapshot. Decision: **copy** — keeps web repo self-contained, doesn't require engine running.

### Layer 2: Sidecar QA State

**Location:** `C:\Users\email\projects\ImNotAnAttorney-web\content\blog\.qa-state\<slug>.json`

```json
{
  "slug": "how-your-attorney-makes-money",
  "last_checked": "2026-04-10T12:34:56Z",
  "all_passed": false,
  "gates": {
    "anti_hallucination": { "passed": true,  "details": "..." },
    "humanizer":          { "passed": true,  "score": 32.1 },
    "slop":               { "passed": false, "failures": ["CITATION_SOURCING"] },
    "upl":                { "passed": true,  "details": "..." },
    "dna":                { "passed": false, "failures": ["D11_SCREENSHOT_SENTENCE"] }
  }
}
```

Gitignored? **No** — committed to repo so CI/build can read it without running LLM calls.

### Layer 3: Build-Time Render Guard

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\blog.ts`

Modify `getAllPosts()` (or equivalent) to:
1. Read `.qa-state/<slug>.json` for each post
2. Filter out any post where `all_passed !== true`
3. Log warnings for filtered posts
4. In development, allow override with `BLOG_QA_BYPASS=1` env var (never in prod)

This is the hard gate — posts don't render on the site until all 5 gates pass.

### Layer 4: Pre-Commit Hook

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\.husky\pre-commit` (or git hook equivalent)

On any staged .mdx file, runs `scripts/qa-existing-post.mjs <file>` and blocks the commit if any gate fails. Updates `.qa-state/<slug>.json` automatically so the staged commit includes the new QA state.

## Files Modified This Session

### Engine repo (commit fd19414):
- `src/lib/blog-gen/prompts.mjs` — added Virality Convergence Block (V1-V7), SOCIAL_SPINE output format
- `src/lib/blog-gen/qa-dna.mjs` — added D11/D12 checks, raised thresholds from 10 to 12 checks
- `src/lib/blog-gen/social-spine.mjs` — NEW parser + validator for SOCIAL_SPINE metadata
- `src/workers/blog-generate.mjs` — integrated spine extraction, stores in frontmatter JSONB
- `content/voice-profiles/*.md` — 4 voice profiles copied from web repo
- 11 other files (workers, lib, humanizer, slop, UPL, anti-halluc, topic-research) ported from web

### Web repo (commit e6a694c):
- `src/app/api/cron/blog-generate/route.ts` — converted to enqueuer (inserts processing_jobs row)
- `src/app/api/cron/blog-qa/route.ts` — converted to enqueuer
- `src/app/api/cron/demand-classify/route.ts` — converted to enqueuer
- Deleted: `src/lib/blog-generation/{generate-post,prompts,qa-humanizer,qa-slop,qa-upl,topic-research}.ts` — ported to engine
- Deleted: `src/lib/demand/classify-llm.ts` — ported to engine

### Web repo (commit d54e063):
- `content/blog/*.mdx` — all 59 posts retrofitted with V1-V7 + D11/D12 + SOCIAL_SPINE

## What Didn't Work

1. **Cherry-picked the retrofit.** Applied V1-V7 + D11/D12 + SOCIAL_SPINE but skipped Hormozi formulaization, Witte EPPM, voice profile calibration, and all 5 QA gates. User caught this. Lesson: if the pipeline has gates, run the gates. Don't shortcut.
2. **CPU throttling on batch dispatch.** 8 agents running maxed CPU at 93%. Had to wait for some to finish before launching the final 4 batches. Next time: start with 4-6 agents max, queue the rest.
3. **One agent dropped a post silently.** `failed-drug-test-on-probation-what-happens.mdx` was in batch 36-40 but the agent only completed 3/5 before summarizing. Had to manually finish it. Verification caught this (58/59 SOCIAL_SPINE instead of 59/59). Lesson: always verify count matches expected.

## Remaining Steps

### Priority 1: Build the hard-gate system (next session)
1. Create `scripts/qa-existing-post.mjs` — copy gate logic from engine, single-file runner
2. Create `content/blog/.qa-state/` directory
3. Run `qa-existing-post.mjs --all` to baseline all 59 posts
4. Review which gates fail — likely Hormozi (via DNA D6_CATALOG_VARIETY or add D13), slop CITATION_SOURCING, possibly humanizer
5. Modify `src/lib/blog.ts` to filter on qa_state
6. Add pre-commit hook

### Priority 2: Fix gate failures (same session or next)
1. For posts failing DNA — run a remediation agent pass
2. For posts failing slop — rewrite flagged sections
3. For posts failing UPL — this should be zero given earlier audits
4. Re-run QA until all 59 pass

### Priority 3: Apply Hormozi + "for dummies" layer
This may be addressed by step 2 above if we add a Hormozi check to the DNA gate. Options:
- Add D13_HORMOZI_FORMULAIZATION to qa-dna.mjs (checks for Named Framework, Variable Map, Contrast Frame patterns)
- Add D14_STEP_BY_STEP (checks for numbered step sequences, bolded labels, visual math)
- Dispatch retrofit agents with Hormozi-specific instructions

Decision deferred to next session.

## Verification

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web

# All 59 posts have SOCIAL_SPINE (should return 59)
# Use Grep tool with pattern=SOCIAL_SPINE path=content/blog output_mode=count

# Zero UPL violations (should return 0)
# Use Grep tool with pattern="consult (a|your|with your|a licensed )attorney" case-insensitive

# TypeScript clean
npx tsc --noEmit --skipLibCheck

# Recent commits
git log --oneline -5
```

## Ready-to-Paste Next Session Prompt

```
Continue from handoff at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-09-blog-virality-retrofit-and-hard-gates.md

Previous session retrofitted all 59 blog posts with V1-V7 virality principles
but skipped Hormozi formulaization and never ran the 5 QA gates. Build the
hard-gate architecture now so content cannot ship without passing all gates.

Priority 1: Build scripts/qa-existing-post.mjs that runs all 5 gates on any
.mdx file and writes results to content/blog/.qa-state/<slug>.json. Copy gate
logic from ImNotAnAttorney-engine/src/lib/blog-gen/ (humanizer, qa-slop,
qa-upl, qa-dna, qa-anti-hallucination).

Priority 2: Run --all to baseline all 59 posts, see which gates fail.

Priority 3: Modify src/lib/blog.ts getAllPosts() to filter posts where
.qa-state/<slug>.json shows all_passed !== true. Hard gate at render time.

Priority 4: Fix posts that fail gates. Likely Hormozi formulaization gap,
possibly slop audit CITATION_SOURCING failures.

Mirror Katie's KDP pipeline: gates in the path, not next to it. You literally
cannot ship content without passing every audit.
```
