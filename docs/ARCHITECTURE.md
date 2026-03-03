# ImNotAnAttorney — Architecture

## System Overview

ImNotAnAttorney is a content-driven legal empowerment business for criminal defendants. The tech stack delivers a fully automated pipeline from payment to report delivery for the Case Decoder tier ($197), with manual processing for higher tiers.

```
Customer Journey:
  Landing Page → Score (free lead magnet) → Checkout → Stripe Payment
    → Webhook creates order + case → Intake form (if needed)
    → Report generation (Case Decoder only) → Operator review → Delivery email
    → Post-purchase drip sequence → Upgrade path
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 16 (App Router) | SSR for SEO, React for forms |
| **Hosting** | Vercel (Hobby plan) | Free tier, edge functions, cron |
| **Database** | Supabase (PostgreSQL) | 18 tables, storage bucket, edge functions |
| **Payments** | Stripe (test mode) | Checkout sessions, webhooks, refunds |
| **Email** | Resend API | Transactional emails, CAN-SPAM compliance |
| **AI** | Claude Opus 4.6 | Report generation (Edge Function primary + GitHub Actions backup) |
| **CI/CD** | GitHub Actions | Backup worker cron for timed-out Edge Function runs |
| **DNS** | Cloudflare | CNAME to Vercel (DNS only, no proxy) |
| **Cron** | cron-job.org (external) | Free alternative to Vercel Pro native cron |

## Deployment

- **Production:** https://imnotanattorney.com
- **Vercel project:** rahim-kapadias-projects/imnotanattorney
- **GitHub:** github.com/rahim0kapadia/ImNotAnAttorney-web
- **Supabase project:** jxjbjmgdukwkoclydqdr (Kapadia Labs org)

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All API routes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes | Full DB access (bypasses RLS) |
| `STRIPE_SECRET_KEY` | checkout, webhook | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | webhook | Verify Stripe webhook signatures |
| `RESEND_API_KEY` | email.ts | Send transactional emails |
| `RESEND_FROM_EMAIL` | email.ts | Sender address |
| `OPERATOR_EMAIL` | All alert routes | Where operator notifications go |
| `OPERATOR_SECRET` | generate, deliver | Auth token for operator-only endpoints |
| `NEXT_PUBLIC_SITE_URL` | Email links, redirects | Canonical site URL |
| `ANTHROPIC_API_KEY` | Edge function only | Claude API for report generation |
| `CRON_SECRET` | cron/drip | Authenticate cron requests |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI | Edge function deployment |
| `CRONJOB_API_KEY` | setup script | cron-job.org management |

## Backup Worker (GitHub Actions)

The Supabase Edge Function Free tier has a 150-second hard timeout. Claude Opus 4.6 can take 250-294s on complex charges. A GitHub Actions cron workflow runs every 5 minutes to catch timed-out cases.

**Files:** `scripts/generate-worker.mjs` + `.github/workflows/generate-report.yml`

**Flow:** Checks for cases stuck in `"generating"` status for >3 minutes → generates report with no timeout constraint → saves to Supabase → emails operator for review.

**Minutes budget:** ~1,649/2,000 free monthly minutes (most runs are no-ops that exit in ~10 seconds).

See `docs/PIPELINE-CASE-DECODER.md` Step 4B for full details.

### GitHub Actions Secrets

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access (bypasses RLS) |
| `ANTHROPIC_API_KEY` | Claude API for report generation |
| `RESEND_API_KEY` | Send operator review emails |
| `RESEND_FROM_EMAIL` | Sender address |
| `OPERATOR_EMAIL` | Operator notification recipient |
| `OPERATOR_SECRET` | HMAC signing for approve links |
| `NEXT_PUBLIC_SITE_URL` | Base URL for email links |

## Database Schema

### `orders`
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email | text | Customer email (lowercased) |
| tier | text | Product tier slug |
| amount | integer | Amount in cents |
| status | text | `paid` / `refunded` |
| stripe_session_id | text (unique) | Prevents duplicate webhook processing |
| stripe_payment_intent_id | text (indexed) | For refund matching |
| upgrade_credit_applied | integer | Credits from prior purchases (cents) |
| paid_at | timestamptz | Payment timestamp |
| refunded_at | timestamptz | Refund timestamp (null if not refunded) |
| priority_delivery | boolean | Priority add-on purchased |
| court_date | text | Customer's next court date |
| consent_timestamp | text | Consent for $1,497+ tiers |

### `cases`
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Set by webhook (crypto.randomUUID) |
| order_id | uuid (FK) | Links to orders table |
| email | text | Customer email |
| tier | text | Product tier |
| status | text | See state machine below |
| intake_id | uuid (FK) | Links to intakes table |
| charge_type | text | From intake |
| report_html | text | Generated HTML report |
| report_token | uuid | URL-safe token for report access |
| generated_at | timestamptz | When report was generated |
| delivered_at | timestamptz | When report was delivered |
| reviewed_by | text | Who approved delivery |
| reviewed_at | timestamptz | When approved |
| deliverable_url | text | Full report URL |
| file_urls | text[] | Discovery file storage paths |
| eval_results | jsonb | Evaluation scorecard (UPL + Psych teams) |
| buyer_states | jsonb | Detected buyer states from intake (distrust, double-checking, information-vacuum, etc.) |
| review_reminder_sent | boolean | Prevents duplicate review reminders |
| report_token_expires_at | timestamptz | 12-month report access expiry |
| is_included_deliverable | boolean | `true` for auto-created lower-tier cases in higher-tier orders |
| parent_order_id | uuid (FK) | Links included case back to the order that created it |
| court_case_number | text | Court-assigned case number (e.g. "23-01773-CF") |
| court_state | text | Jurisdiction state for case number matching |
| court_county | text | County within state |
| updated_at | timestamptz | Auto-updated via trigger |

### `intakes`
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email | text | Customer email (lowercased, trimmed) |
| first_name | text | Customer's first name |
| last_name | text | Optional |
| charge_type | text | Primary charge |
| state | text | Jurisdiction state |
| ... | ... | 15+ additional fields (see intake/route.ts) |

### `subscribers`
| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email | text (unique) | Subscriber email |
| source | text | How they subscribed |
| unsubscribed_at | timestamptz | CAN-SPAM: null = active |
| created_at | timestamptz | Subscription date |

### `drip_emails`
| Column | Type | Purpose |
|--------|------|---------|
| subscriber_id | uuid (FK) | Links to subscribers |
| email_key | text | Unique key per email template |
| created_at | timestamptz | When sent |
| **Unique constraint:** | `(subscriber_id, email_key)` | Prevents duplicate sends |

### Reference Data Tables (12 tables — migrated from markdown, Feb 2026)

Source of truth for structured data previously scattered across 10+ markdown files. Seeded via `scripts/seed/run-all-seeds.mjs` in ImNotAnAttorney repo. Migration: `supabase/migrations/004-data-normalization.sql`.

| Table | Rows | Source | Purpose |
|-------|------|--------|---------|
| `experts` | 63 | `system/EXPERT-REFERENCE.md` | .01% expert roster (attorneys, psychology, marketing) |
| `eval_criteria` | 58 | `system/EVALUATION-TEAM.md` | 5-team evaluation criteria with `applicable_tiers` (tier-aware filtering) and `charge_types` columns |
| `pipeline_eval_weights` | 40 | `system/EVALUATION-TEAM.md` | Per-pipeline team weights (GATE/HIGH/MEDIUM/LOW) |
| `buyer_states` | 6 | `system/BUYER-STATES.md` | Why defendants buy (distrust, double-checking, information-vacuum, etc.) |
| `content_pain_points` | 20 | `content/REDDIT-PAIN-POINTS.md` | Reddit/Avvo defendant pain points with SEO data |
| `content_assets` | 15 | `content/READY-TO-POST/` | Ready-to-post content (email teasers, Reddit comments, Twitter threads) |
| `intake_questions` | 40 | `system/templates/case-decoder/intake-questionnaire.md` | Charge-specific intake questions (10 types × 4 questions) |
| `tiers` | 7 | `src/lib/stripe.ts` | Product tiers with pricing, delivery, features |
| `charge_types` | 21 | `checkout/route.ts` + intake questionnaire | Charge type catalog with expert mappings |
| `content_posts` | 23 | `content/CONTENT-FLYWHEEL.md` | Blog post catalog with subreddit targeting |
| `subreddits` | 5 | `content/CONTENT-FLYWHEEL.md` | Subreddit profiles (rules, best post times) |
| `emotional_profiles` | 33 | `system/EMOTIONAL-INTELLIGENCE.md` | Emotional calibration (fears, stances, attorney wounds, banned terms) |

All reference tables have `created_at`, `updated_at` (auto-trigger), and `active` boolean for soft-delete. Markdown files remain as human-readable references with "Source of truth" headers pointing to DB.

### Operational Tables

#### `email_log` (Migration 005)

Tracks all 33 email send calls across 8 API routes. Fire-and-forget logging — insert failures never crash the calling route.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email_type | text | Category (e.g. `payment-confirmation`, `drip-nurture`, `operator-alert`) |
| recipient | text | Email address |
| case_id | uuid | Associated case (nullable) |
| order_id | uuid | Associated order (nullable) |
| tier | text | Product tier (nullable) |
| subject | text | Email subject line |
| status | text | `sent` / `failed` |
| error | text | Error message if failed |
| metadata | jsonb | Extra context (template key, retry count, etc.) |
| route_source | text | Which API route sent it |
| sent_at | timestamptz | Timestamp |

Indexes: `email_type`, `recipient`, `case_id`, `sent_at`.

#### `audit_runs` (Migration 006)

Stores evaluation results from `evaluate-report.mjs` runs.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| report_source | text | Source identifier (file path or persona name) |
| charge_type | text | Charge type evaluated |
| tier | text | Product tier |
| model_used | text | Claude model used (opus, sonnet) |
| team_results | jsonb | Per-team pass/fail/needs_work breakdown |
| total_pass | integer | Total passing criteria |
| total_fail | integer | Total failing criteria |
| total_needs_work | integer | Total needs-work criteria |
| gate_passed | boolean | Whether UPL gate passed |
| created_at | timestamptz | When run completed |

#### `cron_runs` (heartbeat)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| started_at | timestamptz | When cron started |
| completed_at | timestamptz | When cron finished |
| parts_run | integer | How many parts executed |
| errors | text[] | Any errors encountered |

### Database Triggers
- `update_cases_updated_at` — Automatically sets `updated_at = now()` on every cases row update. This ensures stuck-case detection (cron Parts 4 & 5) works even when code paths forget to set updated_at explicitly.
- `update_<table>_updated_at` — All 12 reference data tables have `moddatetime` triggers (via `extensions.moddatetime()`) for automatic `updated_at` management.

### Indexes
- `idx_orders_stripe_payment_intent` on `orders(stripe_payment_intent_id)` — Used by refund webhook to find the order being refunded.
- `idx_cases_court_lookup` on `cases(court_case_number, court_state)` — Used for customer identity matching across emails (upgrade dedup).

## Case Status State Machine

```
                                  ┌──────────────┐
                                  │ awaiting-     │ ← webhook: no intake found
                                  │ intake        │
                                  └──────┬───────┘
                                         │ intake submitted
                                         ▼
  webhook (has intake) ──────────► ┌─────────────┐
                                   │   intake     │ ← ready for generation
                                   └──────┬──────┘
                                          │ dispatcher (atomic guard)
                                          ▼
                                   ┌─────────────┐
                                   │ generating   │ ← edge function running
                                   └──────┬──────┘
                                    ╱            ╲
                              success            failure / timeout
                                ╱                    ╲
                    ┌──────────┐              ┌────────────────┐
                    │  review  │              │ generation-    │
                    │          │              │ failed         │
                    └────┬─────┘              └────────────────┘
                         │ operator approves
                         ▼
                    ┌──────────┐
                    │ delivered │
                    └──────────┘

  (refund webhook)    ──► refunded         (from any status)
  (cron Part 4, 2h)  ──► intake-stalled   (from intake)
  (cron Part 5, 30m) ──► generation-failed (from generating)
  (discovery tiers)  ──► pending → submitted (upload flow)
```

### Status Definitions

| Status | Meaning | Tier(s) | Next Step |
|--------|---------|---------|-----------|
| `awaiting-intake` | Paid but no intake form yet | All | Customer fills intake |
| `intake` | Intake linked, ready for processing | case-decoder | Auto-generates report |
| `generating` | Edge function running Claude API | case-decoder | Wait (30min max) |
| `generation-failed` | Edge function crashed/timed out | case-decoder | Operator retries |
| `review` | Report generated, awaiting operator approval | case-decoder | Operator reviews + delivers |
| `delivered` | Report sent to customer | case-decoder | Drip sequence begins |
| `intake-stalled` | Stuck in "intake" for 2+ hours | case-decoder | Operator investigates |
| `pending` | Discovery tier, waiting for upload | x-ray, war-room, situation-room | Customer uploads files |
| `submitted` | Files uploaded and finalized | x-ray, war-room, situation-room | Manual analysis |
| `refunded` | Full refund processed | All | Report access revoked |

## Multi-Case Order Model (Tier Inclusion)

Higher tiers include lower-tier deliverables. When a customer buys Intelligence Brief ($997), they receive both a Case Decoder report (delivered within 24 hours) AND their Intelligence Brief. Each deliverable gets its own `case` record.

### Inclusion Map

| Purchased Tier | Cases Created | Included Deliverables |
|---|---|---|
| Case Decoder ($197) | 1 case | None |
| Intelligence Brief ($997) | 2 cases | Case Decoder (`is_included_deliverable=true`) |
| X-Ray ($1,497) | 3 cases | Case Decoder + Intelligence Brief |
| War Room ($3,497) | 4 cases | Case Decoder + Intelligence Brief + X-Ray |
| Situation Room ($9,997) | 5 cases | Case Decoder + IB + X-Ray + War Room |

### How It Works

1. **Webhook** creates the primary case AND loops through `tierConfig.includesTiers` to create additional cases with `is_included_deliverable=true` and `parent_order_id` set.
2. **Upgrade dedup**: Before creating an included case, checks if the customer already has a delivered case for that tier (by email OR court case number match). If so, skips creation.
3. **Included CD auto-generates** immediately if intake exists (same fire-and-forget pattern as standalone CD).
4. **CD delivery triggers Phase 2 email**: When an included CD is delivered, the deliver route finds sibling cases still awaiting intake and sends the Phase 2 intake email.
5. **Refund cascade** works unchanged — `cases.eq("order_id")` catches all cases on the order.

### Two-Phase Intake Flow

- **Phase 1 (standard intake)**: Collected post-purchase. Used to generate the included Case Decoder.
- **Phase 2 (IB-specific intake)**: After CD delivery, customer receives email with link to `/intake/intelligence-brief`. Collects judge, attorney, hearing details needed for the full Intelligence Brief.

### Customer Identity

Email-only matching is fragile (different emails = different "customer"). Court case numbers are court-assigned and unique per jurisdiction:
- `court_case_number` + `court_state` on the `cases` table
- Collected in intake form (required field)
- Checkout page has "Returning customer?" section for IB+ tiers to enter case number + state for cross-email upgrade credit

## Shared Constants

Centralized in `src/lib/site.ts`:
- `SITE_URL` — Used for all email links, redirects, canonical URLs
- `CONTACT_EMAIL` — help@imnotanattorney.com
- `PHYSICAL_ADDRESS` — CAN-SPAM required address
- `OPERATOR_EMAIL_FALLBACK` — Fallback when env var missing
- `normalizeEmail()` — Lowercase + trim for consistent DB lookups
- `isValidEmail()` — Regex validation (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)

## Error Handling Strategy

1. **Email failures:** Retry once after 2s. If both fail, notify operator. Never crash.
2. **Supabase errors:** Log + return 500 with generic message. Operator notifications for critical failures (order/case creation).
3. **Stripe webhook duplicates:** Detect via unique constraint violation (code 23505), return 200.
4. **Missing env vars:** Explicit checks with descriptive throw messages (not `!` assertions).
5. **Stuck processing:** Cron detects cases stuck in "intake" (2h) or "generating" (30min), alerts operator.

## Cron Jobs

### `/api/cron/drip` — Daily at 14:00 UTC (9:00 AM EST)

| Part | What | Threshold | Action |
|------|------|-----------|--------|
| 1 | Nurture emails | Days since subscribe | Send next unsent email in sequence (with retry) |
| 2 | Post-purchase emails | Days since purchase/delivery | Send tier-specific follow-ups (skips refunded, with retry) |
| 3 | Review reminders | 12 hours in "review" | Alert operator (24h guarantee at risk) |
| 4 | Stuck intake detection | 2 hours in "intake" | Mark intake-stalled, alert operator |
| 5 | Stuck generation detection | 30 minutes in "generating" | Mark generation-failed, alert operator |
| 6 | Intake reminder | 24 hours no intake | Remind customer to complete intake |
| 7 | Intake escalation | 72 hours / 7 days | Alert operator about abandoned intakes |
| 8 | Old drip_emails cleanup | >90 days | Delete stale send records |
| 9a | Stripe reconciliation | Missed webhooks | Detect orders without cases |
| 9b | Orphan order detection | Order exists, no case | Alert operator |
| 10 | Report expiry warning | 30 days before 12-month expiry | Warn customer |
| 11 | Abandoned checkout recovery | 24-48 hours after email captured | Recovery email |
| 12 | Missed evaluation safety net | 15 minutes in "review" with NULL eval_results | Re-trigger Edge Function (limit 5/run) |

**Heartbeat:** Each run inserts into `cron_runs` table. Staleness check alerts operator if >48h gap between runs.

## Email System

- **Provider:** Resend (API key is send-only — can send but not manage domains)
- **From address:** `noreply@imnotanattorney.com` (domain verified, DKIM + DMARC configured)
- **CAN-SPAM compliance:** Physical address, unsubscribe link, List-Unsubscribe headers (RFC 8058)
- **Templates:** Inline HTML in route handlers and `drip-emails.ts`
- **Drip dedup:** `drip_emails` table tracks which emails were sent to each subscriber
- **Email audit:** `email_log` table tracks all 33 send calls across 8 routes via fire-and-forget `logEmailSend()`

## Evaluation Pipeline

5-team expert evaluation framework for report quality assurance. DB-driven via `eval_criteria` and `pipeline_eval_weights` tables.

| Team | Criteria | Weight | Focus |
|------|----------|--------|-------|
| UPL (Legal Compliance) | U1-U10 | GATE | No legal advice, banned phrases — must pass |
| Psychology | P1-P10 | HIGH | Emotional calibration, buyer state awareness |
| Legal Quality | L1-L10 | HIGH | Accuracy, specificity, actionability |
| Defendant Experience | D1-D11 | MEDIUM | Readability, empowerment, trust |
| Conversion & Brand | C1-C10 | LOW | CTA placement, brand consistency |
| Cross-Pipeline | X1-X7 | — | Multi-report comparison (inactive) |

**Tier-aware filtering:** Criteria with `applicable_tiers` are skipped for tiers they don't apply to. Case Decoder ($197) runs 46/51 criteria; Intelligence Brief+ ($997+) runs all 51.

**CLI:** `node evaluate-report.mjs --file <report> --charge-type "<type>" --tier <tier>`
- `--model sonnet` for budget runs (~$0.25 vs ~$1.25 for Opus)
- `--teams upl,legal` for specific teams only
- `--no-db` for offline mode with hardcoded criteria

## Security Headers

Configured in `next.config.ts`:
- `Strict-Transport-Security` — HSTS with preload
- `X-Content-Type-Options: nosniff` — Prevent MIME sniffing
- `X-Frame-Options: DENY` — Prevent clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` — Limit referrer leakage

## Known Code Duplications (Intentional)

1. **`escapeHtml()` + `sendEmail()` + `PHYSICAL_ADDRESS`** — Duplicated in both Supabase Edge Functions (`generate-report/index.ts` and `evaluate-report/index.ts`). This is intentional because edge functions run in Deno and cannot import from the Next.js codebase.

2. **Tier pricing data** — Canonical source of truth is the `tiers` Supabase table. Code-level copies exist in `stripe.ts` (checkout), `PricingTable.tsx` (display), `services/page.tsx` (display). The `stripe.ts` object must be kept in sync with the DB until the frontend reads from DB directly.

## File Organization

```
src/
  app/
    api/
      generate/case-decoder/  ← Report generation dispatcher
      evaluate/case-decoder/  ← Evaluation dispatcher (fire-and-forget to Edge Function)
      webhooks/stripe/         ← Payment + refund handling
      deliver/                 ← Operator report delivery
      cron/drip/              ← Daily cron (5 parts)
      intake/                 ← Intake form submission
      checkout/               ← Stripe session creation
      subscribe/              ← Email subscription
      unsubscribe/            ← CAN-SPAM unsubscribe
      upload/ + finalize/     ← Discovery document upload
      score/                  ← Defense Milestone Score
    blog/                     ← MDX blog (20 posts)
    checkout/                 ← Checkout + success pages
    report/[token]/           ← Token-gated report viewer
    score/                    ← Free score tool (lead magnet)
    ...                       ← Other pages
  lib/
    email.ts                  ← Resend API wrapper
    stripe.ts                 ← Stripe client + tier config
    drip-emails.ts            ← Email templates + sequences
    blog.ts                   ← MDX blog utilities
    site.ts                   ← Shared constants + helpers
    supabase/admin.ts         ← Supabase admin client
  components/                 ← Shared UI components
scripts/
    generate-worker.mjs       ← Backup worker for timed-out Edge Function runs (GitHub Actions)
supabase/
  functions/
    generate-report/          ← Report generation Edge Function (Opus 4.6, Deno, 150s timeout)
    evaluate-report/          ← Report evaluation Edge Function (Sonnet 4.6, UPL + Psych teams)
  migrations/                 ← SQL migration files
.github/
  workflows/
    generate-report.yml       ← Cron: runs backup worker every 5 min
```
