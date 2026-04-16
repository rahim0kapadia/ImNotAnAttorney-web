# Blog Pipeline Deploy Fix Plan

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Blog content pipeline code deployed (commit 68f5e4e) but two route errors block operation
- **Tech stack:** Next.js 16 + Supabase + Vercel + cron-job.org

## Root Causes Found

### Issue 1: All cron routes return 401 Unauthorized
- CRON_SECRET in Vercel env vars doesn't match the value in `.env.local` / cron-job.org headers
- All INAA cron jobs on cron-job.org show `lastExecution: 0`, never fired successfully
- The middleware (Edge Runtime) inlines env vars at build time; Vercel may have a stale or auto-generated CRON_SECRET
- **Fix:** Add CRON_SECRET to Vercel env vars matching `.env.local` value, then redeploy

### Issue 2: /api/admin/blog-pipeline returns 500
- **Root cause A (FIXED):** `blog_drafts` table was missing, migration 031 applied via Supabase Management API
- **Root cause B:** PostgREST FK ambiguity, two FKs between blog_drafts and content_gaps (`content_gap_id` + `blog_draft_id`). Supabase `!inner` join fails without explicit FK name.
- **Fix:** Change `content_gaps!inner(...)` → `content_gaps!blog_drafts_content_gap_id_fkey(...)` in 2 files

## Tasks

### Task 1: Fix PostgREST FK ambiguity (2 files)
- `src/app/api/admin/blog-pipeline/route.ts`, already fixed
- `src/app/api/cron/blog-publish/route.ts`, needs fix

### Task 2: Fix CRON_SECRET in Vercel
- Rahim must add/update CRON_SECRET in Vercel dashboard (browser-only task)
- Value: `e471fb5bf863483524cb51c46e171618c8710b2d0f512100279ed92533729a88`
- After setting, trigger a redeploy (env var change in Edge Runtime requires rebuild)

### Task 3: Commit and push fixes
- Push FK disambiguation fix to trigger new Vercel deploy

### Task 4: Register 4 blog pipeline cron jobs
- Run `node scripts/setup-blog-pipeline-crons.js`

### Task 5: E2E verification
- Test all 4 cron routes with Bearer auth
- Test admin dashboard route
- Verify cron-job.org jobs are registered and enabled
