# Batch API + Prompt Caching Migration — Design Spec

Date: 2026-03-27

## Context

- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Claude API costs ~$0.40-0.60 per Case Decoder report (Opus 4.6 + extended thinking). At scale this adds up. The Anthropic Batch API offers 50% off for async processing. Prompt caching offers up to 90% off on repeated system prompts. Current code also uses deprecated `budget_tokens` thinking format.
- **Tech stack:** Next.js 15, Supabase Edge Functions (Deno), Node.js worker scripts, Claude API (raw HTTP fetch, no SDK)
- **Key files:**
  - `scripts/generate-worker.mjs` — backup worker that calls Claude API directly
  - `supabase/functions/generate-report/index.ts` — primary Edge Function (~5000 lines)
  - `src/lib/intelligence-brief/prompts.ts` — 9 IB prompt builders
  - `src/lib/cron/pipeline.ts` — cron safety nets (Parts 5, 12, 15)
- **Key decisions:**
  - Batch API is the primary cost lever (50% off immediately)
  - Prompt caching adds value mainly for Intelligence Brief (5 parallel calls sharing system prompt)
  - Adaptive thinking migration is overdue — `budget_tokens` is deprecated on Opus 4.6
  - Test quality BEFORE migrating production
  - VPS + Max subscription proxy rejected (Anthropic blocked it Jan 2026, ToS risk)
- **Setup/prerequisites:** `.env.local` with ANTHROPIC_API_KEY (needs credit top-up first)

## Current Architecture

### Case Decoder ($197) — 1 Opus call
```
Trigger → Edge Function (150s) OR Backup Worker
  → fetch("https://api.anthropic.com/v1/messages")
  → model: claude-opus-4-6
  → max_tokens: 32000
  → thinking: {type: "enabled", budget_tokens: 16000}  ← DEPRECATED
  → system: "<22-24K char string>"
  → messages: [{role: "user", content: "<2.5-4.5K char prompt>"}]
  → Response: filter text blocks, render to HTML, save to Supabase
```
Cost: ~$0.40-0.60/report. Generation time: 60-294s.

### Intelligence Brief ($997) — 9 Sonnet calls
```
Phase A (5 parallel): case-roadmap, whats-working, legal-options, protection, court-prep
Phase B (4 sequential): case-intelligence, your-plan, questions, 48hr-priorities
  → model: claude-sonnet-4-6
  → temperature: 0.3 (most sections)
  → max_tokens: 2000-5000 per section
  → NO thinking mode
```
Cost: ~$0.12-0.18/report. All Phase A calls share the same system prompt.

### Report Pipeline Consumers (unchanged by migration)
- **Report viewer** (`/report/[token]`) — reads `cases.report_html`
- **Delivery endpoint** (`/api/deliver`) — transitions status, sends email
- **Evaluation engine** (`evaluate-report` Edge Function) — runs UPL + Psych teams
- **Operator dashboard** — displays eval scorecard
- **Drip email sequence** — references report URL in post-purchase emails
- **Cron safety nets** — Parts 5 (stuck detection), 12 (missed evals), 15 (stuck processing)

## Target Architecture

### Case Decoder — Batch API + Adaptive Thinking
```
Trigger → Edge Function (or Worker)
  → POST /v1/messages/batches (1 request)
  → model: claude-opus-4-6
  → max_tokens: 32000
  → thinking: {type: "adaptive"}  ← MIGRATED
  → system: [{type: "text", text: "<prompt>", cache_control: {type: "ephemeral", ttl: "1h"}}]
  → Store batch_id in case record → Exit (async)

Cron Batch Poller (every 5 min)
  → Poll /v1/messages/batches/{batch_id}
  → On completion: fetch results, render HTML, save, trigger eval
```
Cost: ~$0.20-0.30/report (50% off). Latency: 1-60 min (within 48h SLA).

### Intelligence Brief — Batch API + Prompt Caching
```
Phase A: Submit 5-request batch (all share cached system prompt)
  → cache_control on system prompt → calls 2-5 hit cache (90% off input)
  → 50% batch discount on all tokens
Phase B: Submit 4-request batch after Phase A completes
  → Same cache benefits
```
Cost: ~$0.03-0.06/report (from $0.12-0.18). Major savings.

### Evaluation — No change initially
Evaluation calls are cheap and fast (Sonnet, temp 0). Batch adds latency that slows operator workflow. Keep synchronous.

## Components

### 1. Test Script: `scripts/test-batch-generation.mjs`
- Extracts system prompt from Edge Function (same method as generate-worker.mjs)
- Builds user prompt from Danielle test persona
- Submits single-request batch with adaptive thinking + cache control
- Polls for completion (every 30s, max 2h)
- Saves output to `test-reports/batch-test-report.html`
- Logs: generation time, token usage, cache metrics, cost estimate
- Compares section headings to `test-reports/persona-a-dui.html`

### 2. Worker Migration: `scripts/generate-worker.mjs`
- Replace `fetch()` to Messages API with Batch API submission
- Convert system prompt from string to array with `cache_control`
- Migrate thinking to `{type: "adaptive"}`
- Add batch polling loop (every 60s, max 2h)
- Log cache hit metrics
- Retain existing retry logic (3 attempts) for batch submission failures
- Retain existing HTML rendering, UPL validation, and Supabase saving

### 3. Edge Function Migration: `supabase/functions/generate-report/index.ts`
- Submit batch request instead of synchronous Messages API call
- Store `batch_id` in case record (new column: `cases.batch_id`)
- Exit immediately (no longer waits for generation)
- Status stays `generating` until batch poller picks it up

### 4. Cron Batch Poller: New cron part in `src/lib/cron/pipeline.ts`
- Runs every 5 min (same cadence as backup worker)
- Queries `cases WHERE batch_id IS NOT NULL AND status = 'generating'`
- For each: poll Anthropic Batch API
- On `ended`: fetch JSONL results, extract report, render HTML, save
- Transition status: `generating → review`
- Fire-and-forget evaluation trigger
- On `expired` (24h timeout): mark `generation-failed`, notify operator

### 5. Intelligence Brief Batch Optimization
- Modify Phase A to submit 5 requests as a single batch
- All 5 share the same system prompt with `cache_control`
- Phase B submits 4 requests as a second batch after Phase A completes
- Add batch polling between phases

### 6. Database Schema
- Add `batch_id TEXT` column to `cases` table (nullable)
- Used by cron poller to match batch results to cases

## What Does NOT Change

- Report HTML structure and content
- All downstream consumers (viewer, delivery, eval, drip emails, operator dashboard)
- Status state machine (intake → generating → review → delivered)
- Operator workflow
- The system prompt content itself
- Report rendering and post-processing

## Migration Order

1. **Test script** — validate batch + adaptive thinking quality
2. **DB migration** — add `batch_id` column
3. **Worker migration** — backup worker switches to batch (low risk, easy rollback)
4. **Cron batch poller** — new cron part for async result polling
5. **Edge Function migration** — primary generation path switches to batch
6. **IB optimization** — batch Phase A calls together with caching
7. **Adapt cron Part 5** — update stuck detection timing for batch latency

## Cost Savings Projection

| Tier | Current | After Batch | After Batch + Cache | Savings |
|------|---------|-------------|---------------------|---------|
| Case Decoder (1 Opus call) | $0.40-0.60 | $0.20-0.30 | $0.20-0.30* | 50% |
| Intelligence Brief (9 Sonnet calls) | $0.12-0.18 | $0.06-0.09 | $0.03-0.06 | 67-83% |

*Cache doesn't help CD at current volume (1 call per report, cache cold between reports)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Batch quality differs from sync | Low | High | Test script validates before migration |
| Adaptive thinking quality differs | Low | Medium | Compare side-by-side in test |
| Batch latency exceeds 2h | Low | Medium | Fallback to sync API in worker |
| Cache silently not working | Medium | Low | Log cache metrics, verify cache_read > 0 |
| Cron poller misses a batch | Low | High | Existing Part 5 stuck detection catches it |

## Success Criteria

1. Test report matches current quality (same sections, same depth, UPL-clean)
2. Batch generation completes within 2 hours consistently
3. Cache hits observed for IB Phase A calls 2-5
4. 50%+ cost reduction on Case Decoder reports
5. No increase in `generation-failed` rate
