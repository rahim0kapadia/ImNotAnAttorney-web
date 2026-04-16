# Core Business Logic, src/lib/

> 59 modules. This is where all business rules live: auth, payments, email, cron orchestration, AI report generation, scoring, and demand intelligence.

## Module Table

### Authentication
| File | Purpose |
|------|---------|
| `customer-auth.ts` | Magic link generation + verification + session cookie for customers |
| `partner-auth.ts` | Magic link for partner portal |
| `auth/guards.ts` | `requireAdmin()`, `requireCustomer()`, throw 401 if session invalid |

### Payments
| File | Purpose |
|------|---------|
| `stripe.ts` | Stripe SDK init + dual-mode selector (test vs live per `TIER_CORE[slug].live`) |
| `tiers.ts` | **SINGLE SOURCE OF TRUTH (tiered products)**, all pricing, Stripe price IDs, tier slugs, live flags |
| `products.ts` | **SINGLE SOURCE OF TRUTH (standalone products)**, 44 products across 4 categories (3 calculators, 8 content guides, 24 research reports, 3 bundles + 6 inactive dark SKUs). 38 active / 6 inactive as of 2026-04-09. Parallels tiers.ts. Prices in cents. Checkout uses inline `price_data` (no Stripe Price IDs). |
| `bundles.ts` | Bundle definitions, maps bundle slugs to included product slugs. 3 bundles: first-72-hours ($97), defense-preparation ($197), pre-plea-package ($197). Bundles piggyback on standalone product flow (same checkout, webhook, intake). |

### Standalone Product Support
| File | Purpose |
|------|---------|
| `sanitize.ts` | `sanitizeReportHtml()`, allowlist-based HTML sanitizer for Claude-generated reports (used by standalone report viewer). Allows semantic tags + ARIA attributes, strips scripts/iframes/event handlers. |
| `calculator.ts` | Calculator computation logic (good-time credit, diversion eligibility, veterans court). Reads state rules from JSON data files at `system-data/`. 3 calculators: `calculateGoodTime`, `calculateDiversion` (6 FL program evaluators), `calculateVeteransCourt` (10 states, 250+ courts). |

### Email
| File | Purpose |
|------|---------|
| `email.ts` | Resend integration: send transactional email + CAN-SPAM unsubscribe footer |
| `drip-emails.ts` | 7 email sequence definitions (templates, timing, triggers) |

### Cron Orchestration (26 daily tasks)
| File | Purpose |
|------|---------|
| `cron/drip-nurture.ts` | Nurture sequence emails (days 1, 3, 5, 7, 14, 30) for non-purchasers |
| `cron/drip-post-purchase.ts` | Post-purchase drip (upgrade path emails at days 3, 7, 14) |
| `cron/customer-lifecycle.ts` | Lifecycle triggers: overdue cases, stale intakes, trial expirations |
| `cron/operator-alerts.ts` | Stuck case detection → operator notification |
| `cron/monitoring.ts` | SLA checks + engine heartbeat ping |
| `cron/pipeline.ts` | Job retry promotions + completion checks |
| `cron/reconciliation.ts` | Stripe sync: verify orders match webhook records |
| `cron/batch-poller.ts` | Poll pending file upload batch jobs |
| `cron/compliance.ts` | GDPR cleanup: purge expired tokens, unsubscribed data |
| `cron/types.ts` | `CronContext` + `CronTaskResult` types shared across all cron modules |
| `cron-idempotency.ts` | Prevent duplicate cron runs (idempotency key in DB) |

### Report Generation (AI)
| File | Purpose |
|------|---------|
| `intelligence-brief/prompts.ts` | 9 prompt builders for IB sections (Phase A: 5 parallel, Phase B: 4 sequential) |
| `intelligence-brief/render.ts` | HTML/email rendering for IB delivery |
| `intelligence-brief/variables.ts` | Template variable extraction from case data |
| `report-renderer.ts` | PDF/HTML report assembly for Case Decoder |

### Blog Generation Pipeline
| File | Purpose |
|------|---------|
| `blog-generation/generate-post.ts` | Claude-powered post drafting |
| `blog-generation/publish.ts` | Write MDX to `content/blog/`, commit |
| `blog-generation/qa-humanizer.ts` | Strip AI tells from draft |
| `blog-generation/qa-slop.ts` | Anti-slop patterns audit |
| `blog-generation/qa-upl.ts` | UPL compliance check on post content |
| `blog-generation/topic-research.ts` | Keyword + demand research |
| `blog-generation/prompts.ts` | Blog generation prompt builders |
| `blog-generation/index.ts` | Barrel export, re-exports `generatePost`, `buildGenerationPrompt`, `enrichTopic`, `runHumanizerCheck`, `runSlopAudit`, `runUPLCheck`, `publishDraft` |

### Scoring
| File | Purpose |
|------|---------|
| `score.ts` | Defense Strength Score algorithm (0–100, based on charge type + case facts) |

### Demand Intelligence
| File | Purpose |
|------|---------|
| `demand/fetch-signals.ts` | Pull demand signals from Reddit, search, etc. |
| `demand/classify-signal.ts` | Classify signal type (question, complaint, urgency) |
| `demand/classify-llm.ts` | Claude-powered signal classification |
| `demand/score-demand.ts` | Aggregate demand score per charge type |
| `demand/track-performance.ts` | Store + trend demand scores over time |

### Supporting Modules
| File | Purpose |
|------|---------|
| `blog.ts` | MDX parser: `getAllPosts()`, `getPostBySlug()`, `getRelatedPosts()` |
| `charge-taxonomy.ts` | Charge category tree + intake question definitions |
| `charge-types.ts` | Charge categorization helpers |
| `customer-helpers.ts` | Customer portal helpers (case access checks) |
| `partner-data.ts` | Partner portal DB queries |
| `partner-helpers.ts` | Commission calculation |
| `referral.ts` | Referral system logic |
| `feature-flags.ts` | Feature toggle: read/write from `feature_flags` table |
| `schema.ts` | JSON-LD structured data builders (Article, Service, FAQ, HowTo, BreadcrumbList) |
| `site.ts` | Site constants: `SITE_URL`, `SITE_NAME`, `OG_IMAGE` |
| `rate-limit.ts` | API rate limiting (Supabase RPC primary, in-memory fallback) |
| `batch-api.ts` | Batch processing wrapper for document pipeline |
| `format.ts` | String formatting helpers (dates, currency, case IDs) |
| `request.ts` | HTTP fetch wrapper with retry + error normalization |
| `sms.ts` | SMS via text.email gateway (court reminders, magic links, partner notifications) |
| `notification-prefs.ts` | Channel preference types, defaults, merge logic, consent guards |
| `clipboard.ts` | Client-side clipboard utilities |
| `supabase/admin.ts` | Supabase admin client (service role key, bypasses RLS) |
| `types/blog-pipeline.ts` | TypeScript interfaces for blog pipeline |
| `types/operator.ts` | TypeScript interfaces for operator dashboard |
| `playbook-configs.ts` | **SINGLE SOURCE OF TRUTH**, 8 PlaybookConfig objects (all copy per charge type) |

## Key Patterns

### Dual-Mode Stripe
`tiers.ts` exports `TIER_CORE`, each tier has a `live: boolean` flag. `stripe.ts` selects test vs live key based on this flag. DUI is `live: true`; all others `live: false` (test mode). Never hard-code Stripe keys.

### Magic Link Auth
No passwords. Flow: `POST /api/customer/magic-link` → token stored in `magic_link_tokens` table (15-min TTL) → email sent via Resend → customer clicks → `POST /api/customer/magic-link/verify` exchanges token for `customer_session` cookie (HttpOnly, 7-day expiry).

### Orchestrated Cron (22 tasks)
`GET /api/cron/drip` is the orchestrator. It runs all 22 task functions from `src/lib/cron/` sequentially. Each task returns a `CronTaskResult`. A failed task is logged but does NOT stop the chain, isolated error handling. Authenticated by `Authorization: Bearer CRON_SECRET` header.

### Claude AI Reports
- **Case Decoder:** Supabase Edge Function `generate-report` calls Claude Opus with extended thinking (16K token budget). One call per case.
- **Intelligence Brief:** 9 sections via `intelligence-brief/prompts.ts`. Phase A (5 sections) runs in parallel via concurrent `/api/generate/intelligence-brief/*` calls. Phase B (4 sections) runs sequentially, each using Phase A output as context.
- **UPL gate:** All generated content goes through `evaluate-report` Edge Function before delivery. Failed eval creates operator task; report NOT delivered until operator resolves.

### Feature Flags
`src/lib/feature-flags.ts` reads from `feature_flags` table. Use for gradual rollouts. No code deploy needed to toggle. Operator toggles via `/api/admin/feature-flags`.

## How To

- **Add a lib module:** Create `src/lib/your-module.ts`. Export named functions. For DB access, import `supabase/admin.ts`. For email, import `email.ts`. Never import from `src/app/`, lib is pure business logic.
- **Modify an email sequence:** Edit `src/lib/drip-emails.ts`. Each sequence is a `DripSequence` object with `id`, `trigger`, and array of `DripEmail` steps (each has `dayOffset`, `subject`, `template`). Templates are inline HTML strings. Test with Resend test mode.
- **Add a cron task:** (1) Create task function in `src/lib/cron/your-task.ts` returning `CronTaskResult`. (2) Add to the orchestrator array in `/api/cron/drip/route.ts`. (3) Register on cron-job.org if it needs its own schedule (otherwise it runs as part of the daily orchestrated batch).
- **Add a new charge type:** (1) Add to `charge-taxonomy.ts` (category + questions). (2) Add `PlaybookConfig` to `playbook-configs.ts`. (3) Add tier to `tiers.ts`. (4) Run `node scripts/check-tiers.mjs` to verify sync.
- **Debug a stuck case:** Check `processing_jobs` table for `status = 'failed'` rows. Check `operator_tasks` for operator-flagged items. Check `/operator/cases/[id]` UI for state machine position. Engine logs at `ImNotAnAttorney-engine/`.

## Key Constants

| Constant | Value | File:Line |
|----------|-------|---------, |
| **Pricing** | | |
| DUI First Offense | $97, `live: true` | `tiers.ts:33-45` |
| Case Decoder | $197, priority $97 (4h) | `tiers.ts:153-165` |
| Intelligence Brief | $997, priority $297 (24h) | `tiers.ts:168-180` |
| X-Ray | $2,497, priority $497 (5 days) | `tiers.ts:181-195` |
| War Room | $4,997, priority $997 (20 days) | `tiers.ts:196-210` |
| Situation Room | $9,997 | `tiers.ts:213-225` |
| Witness Pack | $297 add-on | `tiers.ts:243-255` |
| **Scoring** | | |
| Base score | 50 (neutral midpoint) | `score.ts:77` |
| Score bands | Critical 0-30, Concerning 31-50, Average 51-70, Adequate 71-85, Excellent 86-100 | `score.ts:300-304` |
| Motions weight | 20% | `score.ts:118` |
| Discovery weight | 15% | `score.ts:145` |
| Communication weight | 15% | `score.ts:167` |
| Attorney type weight | 10% | `score.ts:93` |
| Strategy weight | 10% | `score.ts:191` |
| Time modifier weight | 30% | `score.ts:81` |
| **Rate Limiting** | | |
| Memory window | 60 seconds | `rate-limit.ts:27` |
| Memory max requests | 3 per window | `rate-limit.ts:28` |
| Memory max keys | 10,000 | `rate-limit.ts:29` |
| **Site** | | |
| SITE_URL | `https://imnotanattorney.com` | `site.ts:49` |
| CONTACT_EMAIL | `help@imnotanattorney.com` | `site.ts:55` |
| PHYSICAL_ADDRESS | 195 Dr MLK Jr St N, St Petersburg, FL 33701 | `site.ts:66` |
| OPERATOR_TOKEN_TTL | 24 * 60 * 60 = 86,400s (24h) | `site.ts:129` |
| PHASE2_TOKEN_TTL | 2,592,000s (30 days) | `site.ts:132` |
| **Email** | | |
| FROM_EMAIL | `noreply@imnotanattorney.com` | `email.ts:53-54` |
| Nurture days | 1, 3, 5, 7, 10, 14 | `drip-emails.ts:7` |
| DUI crisis days | 2, 4, 7 | `drip-emails.ts:11-14` |
| Win-back days | 75, 78, 82, 89, 96 | `drip-emails.ts:38` |
| **Auth** | | |
| Magic link TTL | 15 minutes | `customer-auth.ts:28` |
| Session TTL | 30 days | `customer-auth.ts:29` |
| **Cron** | | |
| Stale lock threshold | 5 min (default); 6 min demand-fetch, 3 min demand-score | `cron-idempotency.ts:96` |
| Recommended job interval | 23 hours (convention for daily jobs) | `cron-idempotency.ts:58` |
| **Feature Flags** | | |
| Cache TTL | 5 minutes | `feature-flags.ts:12` |
| **Referral** | | |
| Master coupon ID | `bondsman-referral-10pct` | `referral.ts:17` |
| Coupon discount | 10% off | `referral.ts:31-33` |
| **Batch API** | | |
| API base URL | `https://api.anthropic.com` | `batch-api.ts:87` |
| API version | `2023-06-01` | `batch-api.ts:94` |

## Data Flow

```
PURCHASE: Customer → tiers.ts → stripe.ts (live/test) → Stripe Checkout
          → webhook → order + case rows → email.ts (confirmation)

REPORT:   intake → intelligence-brief/variables.ts → prompts.ts (9 builders)
          → Phase A (5 parallel) → Phase B (4 sequential, uses A output)
          → render.ts → evaluate-report (UPL gate) → deliver

DRIP:     subscriber created → cron-idempotency (acquire lock)
          → drip-nurture.ts (match sequence by source/score/age)
          → drip-emails.ts (interpolate {{SCORE}}, {{CHARGE_LABEL}})
          → email.ts (send + log) → release lock

SCORE:    10 quiz fields → score.ts (validate → calculate 0-100 → band + observations)
          → fire-and-forget: counter increments in DB

DEMAND:   fetch-signals.ts (Reddit/search) → classify-signal.ts → classify-llm.ts
          → score-demand.ts (aggregate) → track-performance.ts (store + trend)
```

## Integration Points

**Imports from (external packages):**
- `@supabase/supabase-js`, all DB operations
- `stripe`, payment SDK
- `resend`, email delivery
- `@anthropic-ai/sdk`, Claude API (IB prompts, demand classify-llm, batch API)
- `crypto`, token hashing (customer-auth, partner-auth, site.ts)

**Exports to (consumers):**
- `src/app/api/` routes, all API endpoints
- `src/app/(pages)/`, pages import blog.ts, playbook-configs.ts, schema.ts, tiers.ts
- `src/components/`, PricingTable imports tiers.ts, ShareButtons imports site.ts
- `supabase/functions/`, Edge Functions import intelligence-brief/ modules
- `scripts/`, check-tiers.mjs validates tiers.ts

**Shared state (DB tables, env vars):**
- Key tables: `orders`, `cases`, `subscribers`, `drip_state`, `cron_executions`, `processing_jobs`, `feature_flags`, `partners`
- Key env vars: `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_LIVE`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPERATOR_SECRET`, `CRON_AUTH_TOKEN`

## Gotchas

1. **Dual-mode Stripe is the #1 complexity source.** `stripeForTier()` selects test/live client per tier's `live` flag. If `STRIPE_SECRET_KEY_LIVE` is unset but a tier is `live: true`, it throws. Webhook must verify BOTH secrets.

2. **Rate limiter is per-Vercel-isolate.** In-memory Map resets per cold start. Under load with N warm instances, effective limit is `MEMORY_MAX_REQUESTS × N`. Conservative value (3/min) compensates.

3. **Cron stale lock at 5 minutes.** If a job crashes, its lock stays `running` for up to 5 min before auto-recovery. Jobs genuinely taking 5+ min get double-executed.

4. **PHYSICAL_ADDRESS is duplicated.** Defined in `site.ts` AND `supabase/functions/generate-report/`. Deno Edge Functions can't import Next.js modules. Update both when address changes.

5. **Email interpolation fails silently.** `interpolateScoreVars()` replaces `{{SCORE}}`, `{{CHARGE_LABEL}}`. If a charge type doesn't match any variant div, the content silently strips. Test new charge types against drip-emails.test.ts.

6. **Feature flag cache serves stale data for up to 5 min.** Toggle propagation is not instant. `clearFeatureFlagCache()` exists but must be called explicitly.

7. **Magic link tokens accumulate.** 15-min TTL is checked at verification, not cleaned up proactively. `cron/compliance.ts` does daily cleanup.

8. **Batch API results are JSONL, not JSON.** Each line must be parsed individually. A malformed line breaks the entire stream.

## Maintenance Triggers

- **Tier price/config change** → Update Key Constants table
- **New drip email sequence** → Update Data Flow + drip-emails section in Module Table
- **New cron task** → Add to cron/ Module Table, register in orchestrator
- **New lib module** → Add to Module Table, update Integration Points if public
- **New env var** → Add to Integration Points shared state
- **Score algorithm change** → Update Key Constants (weights, bands)
- **Auth TTL change** → Update Key Constants

---

## Intelligence Brief, Full Detail

Source of truth: `src/lib/intelligence-brief/prompts.ts`. The IB has 9 sections generated in two phases, Phase A runs 5 sections in parallel, Phase B runs 4 sections sequentially using Phase A output as context.

### Phase A (5 parallel sections)
| Section | Key | Emotion | Output |
|---------|---, |---------|------, |
| Case Roadmap | `case-roadmap` | Orientation | Timeline table + stages + two paths (plea/trial) |
| What's Working | `whats-working` | Grounding | Good news + attorney decoded + gaps as CLARIFY + Case Progress Score |
| Legal Options | `legal-options` | Empowerment | Motion landscape + deadline calendar + plea framework |
| Protection | `protection` | Security | Collateral consequences + life impact map |
| Court Prep | `court-prep` | Readiness | Static appendix template |

### Phase B (4 sequential sections)
| Section | Key | Depends On | Output |
|---------|---, |---------, |------, |
| Case Intelligence | `case-intelligence` | Sections 1-2 gaps | Outcome map + defense theories + judge profile + prosecution preview |
| Your Plan | `your-plan` | Sections 1-2 + motions | Email template + phone script + 14-day plan with daily actions |
| Questions | `questions` | All Phase A | 10-15 targeted questions based on gaps (v3 quality-over-quantity; v1 generated 35-50) |
| 48hr Priorities | `48hr-priorities` | All sections | Top 3 actions ranked by urgency |

### Case Progress Score (internal to Section 2 "What's Working")
0-100 score with 6 weighted dimensions:
| Dimension | Weight |
|---------, |------, |
| Communication | 25% |
| Case Review | 15% |
| Discovery | 20% |
| Motion Activity | 15% |
| Strategy | 15% |
| Court Prep | 10% |

### IB Variables (`IBVariables` interface, 65 fields in 9 categories)
| Category | Examples |
|----------|---------|
| Core Identity | first_name, charges, state, county, jurisdiction_level, case_number |
| Timeline | case_stage, arrest_date, months_since_arrest, next_court_date, motion_deadlines |
| Attorney Context | attorney_type (derived), attorney_name, attorney_firm, last_communication |
| Case Details | discovery_status, plea_status, plea_terms, charge_specific_data |
| Personal Context | frustration, biggest_concern, employment, family_situation, has_children, immigration_status |
| Computed (Phase A→B) | gaps_from_section_2, progress_score, applicable_motions, urgent_deadlines |
| Section Outputs | case_roadmap_output, whats_working_output, case_intelligence_output (for 48hr-priorities) |

---

## Drip Sequences, Full Detail

Source of truth: `src/lib/drip-emails.ts`. Exports 9 top-level email arrays (one per sequence category). Each email has `key`, `delayDays`, `subject`, `template`, and optional `tier`/`relativeToDelivery` flags.

### Sequence Categories
| Category | Export | Typical Cadence | Trigger |
|----------|------, |---------------, |---------|
| Nurture | `NURTURE_EMAILS` | Days 1, 3, 5, 7, 10, 14 | Days since subscribe (non-purchaser baseline) |
| Score Crisis | `SCORE_CRISIS_EMAILS` | Days 1, 2, 3 (+ transition) | Critical/Concerning score band, urgency messaging |
| Score Adequate | `SCORE_ADEQUATE_EMAILS` | Day 1 | Adequate/Excellent band, validation messaging |
| Score Re-engage | `SCORE_REENGAGE_EMAILS` | Days 7, 14, 21, 30 | Score-captured subscribers who didn't purchase |
| DUI 72-hour crisis | `DUI_72_HOUR_EMAILS` | Days 1, 3, 5, 7 | Source `dui-72-hours`, tight crisis cadence; falls to standard nurture at Day 10+ |
| Abandoned Score | `ABANDONED_SCORE_EMAILS` | Days 1, 2, 5 | Score taken, no purchase follow-up |
| Win-back | `WINBACK_EMAILS` | Days 75, 78, 82, 89, 96 | Long-dormant purchasers |
| Post-purchase | `POST_PURCHASE_EMAILS` | Varies by tier | CD/IB/X-Ray/War Room/SR/Playbook/Witness, tier-specific chains (intake → delivery → meeting_prep → story_harvest → upsell → referral) |
| Abandoned checkout | (part of post-purchase set) | 24-48h | Email captured at checkout with no purchase |

### Timing Models
| Model | Measured From | Used By |
|-------|------------, |---------|
| Standard (default) | `orders.paid_at` | Most post-purchase emails |
| `relativeToDelivery` | `cases.delivered_at` | Post-delivery follow-ups (meeting prep, story harvest, upsell) |
| `relativeToSubmission` | Case status → "submitted" | Active-wait discovery emails (X-Ray/War Room status updates) |

### Design Decisions
- **Day-0 emails** (`delayDays=0`) sent synchronously by webhook/delivery endpoint, NOT cron. Cron skips day-0 to prevent duplicates.
- **Dedup** via `drip_emails` table (`subscriber_id` + `email_key` unique constraint).
- **Placeholder resolution:** `{{CASE_ID}}`, `{{EMAIL}}`, `{{REPORT_URL}}`, `{{DOCUMENT_COUNT}}` interpolated at send time.
- **Personalization** via intake data (family_buyer, stage_aware, career_aware variant blocks).
- **Email threading:** `caseThreadId(caseId)` generates RFC 2822 Message-ID so replies thread.
- **CAN-SPAM:** Physical address + unsubscribe link + List-Unsubscribe headers (RFC 8058).
- **Manual-trigger pattern:** `delayDays: 9999` prevents cron auto-send (operator manually releases, e.g., war_room_trial_confirmed).
- **Email styling:** dark bg (#0C0A09), zinc text (#D4D4D8), amber accent (#F59E0B).

---

## Cron Drip Orchestrator, Task Breakdown

Source of truth: `src/app/api/cron/drip/route.ts`. The orchestrator runs a `TASKS` array sequentially with isolated error handling. Currently **26 task functions** split across 6 groups (comments annotate them as Parts 1-20, with several tasks sharing a part number, e.g., Parts 3-5c, 6-7).

| Part | Task (function) | Threshold / Target | Action |
|------|---------------, |-------------------|------, |
| 1 | `sendNurtureEmails` | Days since subscribe | Send next unsent email (DUI-72h routing → score-band routing → standard nurture) |
| 2 | `sendPostPurchaseEmails` | Days since purchase/delivery/submission | Tier-specific follow-ups (3 timing models, status guards) |
| 3 | `sendReviewReminders` | 12h in "review" | Alert operator (48h guarantee at risk) |
| 4 | `detectStuckIntakes` | 2h in "intake" (CD, non-included) | Mark intake-stalled, alert operator |
| 5 | `detectStuckGenerating` | 30min in "generating" | Mark generation-failed, alert operator |
| 5a | `detectStuckIBGeneration` | auto-generating >30min, compiling >30min, researching >24h | Re-trigger Phase A/B, 72h escalation |
| 5b | `sendPhase2IntakeReminders` | 48h in "intake" (IB, phase2_data NULL) | Customer reminder, 7-day operator escalation |
| 5c | `sendAwaitingIntakeReminders` | 24h in "awaiting-intake" | Customer reminder email |
| 5d | `escalateStuckIntakes` | 72h / 7 days no intake | Operator alert, consider refund |
| 5e | `detectStuckStandaloneReports` | Standalone report generation stalled | Mark failed, operator alert |
| 6 | `cleanupAbandonedIntakes` | >90 days, no case | Purge orphaned intakes |
| 7 | `cleanupRateLimits` | >1 hour old | Remove expired rate_limit rows |
| 9 | `reconcileStripePayments` | Paid sessions, no order | Auto-create missing order + case, alert operator |
| 10 | `detectOrphanOrders` | Order exists, no case | Auto-create case, alert operator |
| 11 | `sendReportExpiryWarnings` | 30-31 days before 12-month expiry | Warn customer |
| 11b | `sendAbandonedCheckoutEmails` | 24-48h, source="checkout", no purchase | Recovery email |
| 12 | `retriggerMissedEvaluations` | 15min in "review", eval_results NULL | Re-trigger evaluation (limit 5/run) |
| 13 | `cleanupDripEmailLogs` | >90 days | Delete stale send records (Privacy Policy §6) |
| 14 | `cleanupDiscoveryDocuments` | 90 days post-delivery | Delete from Storage + clear file_urls (Privacy Policy §4) |
| 14b | `cleanupCronExecutions` | Old cron_executions rows | Retention cleanup |
| 15 | `detectStuckJobs` | processing_jobs >30min in "processing" | Mark failed, create HIGH priority operator task |
| 16 | `checkPipelineCompletion` | All jobs done for a case | Transition case to "review", email operator with scores |
| 17 | `detectSLABreaches` | delivery_due_at passed, not delivered/refunded | Create URGENT operator task (deduped) |
| 18 | `sendWeeklyProgressEmails` | War Room + Situation Room active cases | Weekly customer update (week-number dedup) |
| 19 | `checkEngineHeartbeat` | processing_jobs "queued" >1 hour | URGENT operator task, engine may be down (daily dedup) |
| 20 | `escalateGuarantees` | Guarantee windows approaching breach | Operator escalation chain |

**Drift note (Apr 7, 2026):** Prior doc referenced "19 parts + 3 sub-parts = 22". Current code imports 26 task functions. The comment annotations in `route.ts` still number through Part 20 (some tasks share a numeric group). Trust the code, count task entries in the `TASKS` array for the true number.

**Idempotency guard:** `acquireCronLock("drip", 23 * 60 * 60 * 1000)` via `cron_executions` table prevents double-runs within a 23h window across serverless instances (replaces unreliable `pg_try_advisory_lock`).

---

## Score Algorithm, Category Detail

Source of truth: `src/lib/score.ts`. Algorithm starts at 50 (neutral midpoint) and applies weighted adjustments across 10 categories, clamped to 0-100.

| Category | Weight | Scoring Logic |
|----------|------, |------------, |
| Time Since Arrest | 30% | Drives `timeIndex` (0-4) used by other categories as severity multiplier |
| Motions Filed | 20% | Yes +15; No: -20 if timeIndex≥2, -5 if <2; Don't Know -10 |
| Discovery Received | 15% | Yes +10; No: -15 if timeIndex≥2, -3 if <2; Don't Know -10 |
| Communication Frequency | 15% | Weekly +10, Monthly 0, Rarely -10, Never -20 |
| Attorney Type | 10% | Private +5, Public Defender 0, No Attorney -15, Not Sure -10 |
| Strategy Discussion | 10% | Yes in Detail +10, Briefly +2, No -12 |
| Criminal History |, | -2 to -5 (misdemeanor vs felony/multiple) |
| Case Stage |, | Contextual observations + stage-specific penalties |
| Licensed Profession |, | Collateral consequence warnings (no score impact) |
| Charge Type |, | Mandatory charge-specific observation (always included) |

**Compound penalty:** If `timeIndex ≥ 3` AND no motions AND no discovery → additional -10.

**Time Index:** <1mo=0, 1-3mo=1, 3-6mo=2, 6-12mo=3, 12+mo=4.

**Final clamp:** `Math.max(0, Math.min(100, score))`, see `score.ts:294`.

**Verified weights** (Apr 7, 2026): Motions 20% / Discovery 15% / Communication 15% / Attorney 10% / Strategy 10% / Time 30% match `src/lib/score.ts` header comments (lines 8-13) and existing Key Constants table above.
