# Task 8: Stuck Detection Adaptation + QA Fixes

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Batch API migration increased generation latency from minutes to up to 2 hours. Stuck detection thresholds (30 min) will false-alarm. Also 3 QA copy bugs found.
- **Key files:** `src/lib/cron/operator-alerts.ts`, `src/app/checkout/page.tsx`, `src/app/sample/page.tsx`, `src/lib/drip-emails.ts`
- **Tech stack:** Next.js 15, TypeScript, Supabase
- **Key decisions:** 30 min threshold -> 2 hours for all stuck detection. Add `batch_id` to stuck queries. Fix copy bugs C1/H1/H2.

## Tasks

### 1. Part 5 stuck detection threshold 30m -> 2h (operator-alerts.ts)
- [x] Update `detectStuckGenerating`: `thirtyMinAgo` -> `twoHoursAgo`, setHours(-2), add `batch_id` to select
- [x] Update comment to note Batch API latency

### 2. Part 5b IB stuck detection threshold 30m -> 2h (operator-alerts.ts)
- [x] Update `detectStuckIBGeneration`: same changes for auto-generating and compiling queries

### 3. Fix C1: "8-step" -> "5-step" (checkout/page.tsx, sample/page.tsx)
- [ ] checkout/page.tsx line 389
- [ ] sample/page.tsx line 416

### 4. Fix H1: Drip Days 4-7 push Intelligence Brief not X-Ray (drip-emails.ts)
- [ ] `post_case_decoder_discovery_question` (Day 4): X-Ray -> Intelligence Brief
- [ ] `post_case_decoder_upsell` (Day 7): X-Ray -> Intelligence Brief

### 5. Fix H2: "Section 10" -> "Your Next 7 Days" section (drip-emails.ts)
- [ ] `post_case_decoder_meeting_prep` (Day 3): fix report section reference

### 6. Build check + commit
