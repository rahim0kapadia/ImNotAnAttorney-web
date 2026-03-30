# Blog Generate: Migrate from Anthropic API to Local claude -p

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** blog-generate cron route calls Anthropic API directly from Vercel, requiring paid API credits. Should use `claude -p` via Rahim's Max subscription (unlimited, already paid for). Same pattern as Telegram bots and cron-dispatch.js.
- **Key files:**
  - `src/app/api/cron/blog-generate/route.ts` — current Vercel route (to be gutted)
  - `src/lib/blog-generation/generate-post.ts` — core generation logic (Anthropic SDK call)
  - `src/lib/blog-generation/topic-research.ts` — topic enrichment (keep as-is, runs on Vercel)
  - `src/lib/blog-generation/prompts.ts` — prompt builder (extract for local use)
  - `C:\Users\email\.claude\scripts\telegram\cron-dispatch.js` — existing pattern for local claude -p dispatch
  - `C:\Users\email\.claude\scripts\telegram\prompts\` — existing cron prompt files
- **Tech stack:** Next.js 16 + Supabase + Windows Scheduled Tasks + claude -p
- **Key decisions:**
  - Queue (step 1), QA (step 3), Publish (step 4) stay on Vercel — lightweight DB operations
  - Only Generate (step 2) moves local — it's the only step that needs LLM
  - Use `claude -p` with `--append-system-prompt` for INAA project context + brand voice
  - Write draft to Supabase `blog_drafts` table (same schema, same downstream)

## Architecture: Before vs After

### Before (broken — needs API credits)
```
cron-job.org → Vercel /api/cron/blog-generate → Anthropic API ($$) → blog_drafts table
```

### After (uses Max subscription)
```
Windows Scheduled Task → cron-dispatch.js → claude -p (Max, free) → Supabase blog_drafts table
cron-job.org → Vercel /api/cron/blog-generate → reads blog_drafts, validates → no LLM call
```

## Tasks

### Task 1: Create local generation prompt file
- Create `C:\Users\email\.claude\scripts\telegram\prompts\blog-generate.md`
- Include: brand voice rules from `.claude/rules/brand-voice.md`, MDX format requirements, frontmatter schema, TLDRBox requirement, word count (1500-3000), FAQ minimum (5), question_count field
- Prompt must instruct Claude to query Supabase for the queued gap data, enrich with Reddit signals, generate the MDX, and insert into blog_drafts table
- Reference `src/lib/blog-generation/prompts.ts` for the current prompt — extract and adapt

### Task 2: Create local generation script
- Create `C:\Users\email\.claude\scripts\blog-generate-local.js`
- Pattern: same as `cron-dispatch.js` but specific to blog generation
- Steps:
  1. Query Supabase for one queued content_gap (highest gap_score)
  2. Mark it in-progress
  3. Run `claude -p` with the prompt file + gap context as input
  4. Claude generates MDX, inserts into blog_drafts via Supabase MCP or direct API
  5. On success: mark gap status updated
  6. On failure: mark gap back to queued, log error
- Must pass gap data (charge_type_slug, pain_point_slug, suggested_title, suggested_keywords) to the claude -p prompt

### Task 3: Register Windows Scheduled Task
- Schedule: daily at 10:30 UTC (matches current cron-job.org timing)
- Command: `node C:\Users\email\.claude\scripts\blog-generate-local.js`
- Add to watchdog if needed

### Task 4: Gut the Vercel blog-generate route
- Remove Anthropic SDK import and API call from `src/app/api/cron/blog-generate/route.ts`
- Route becomes a status check: returns count of queued/in-progress/draft gaps
- OR: remove the route entirely and delete the cron-job.org job for blog-generate
- Keep blog-generate-queue, blog-qa, blog-publish on Vercel (no LLM needed)

### Task 5: Remove Anthropic SDK dependency if unused elsewhere
- Check if `@anthropic-ai/sdk` is used by any other route
- If only used by blog-generate, remove from package.json to reduce bundle

### Task 6: Delete cron-job.org job for blog-generate
- The 10:30 UTC cron-job.org job (ID: 7425842) should be deleted since generation now runs locally
- Use cron-job.org API: `DELETE https://api.cron-job.org/jobs/7425842`

### Task 7: Update plan docs and handoff
- Update `docs/plans/2026-03-28-blog-content-pipeline.md` to reflect the architecture change
- Note: steps 1/3/4 are Vercel cron, step 2 is local scheduled task

## Verification
- Run `node C:\Users\email\.claude\scripts\blog-generate-local.js` manually
- Check blog_drafts table has a new row with status 'draft'
- Trigger blog-qa via cron-job.org to verify downstream still works
- Trigger blog-publish to verify full chain
