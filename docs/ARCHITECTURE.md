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
| **Database** | Supabase (PostgreSQL) | 4 tables, storage bucket, edge functions |
| **Payments** | Stripe (test mode) | Checkout sessions, webhooks, refunds |
| **Email** | Resend API | Transactional emails, CAN-SPAM compliance |
| **AI** | Claude Haiku 4.5 | Report generation (via Supabase Edge Function) |
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
| review_reminder_sent | boolean | Prevents duplicate review reminders |
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

### Database Triggers
- `update_cases_updated_at` — Automatically sets `updated_at = now()` on every cases row update. This ensures stuck-case detection (cron Parts 4 & 5) works even when code paths forget to set updated_at explicitly.

### Indexes
- `idx_orders_stripe_payment_intent` on `orders(stripe_payment_intent_id)` — Used by refund webhook to find the order being refunded.

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
| 1 | Nurture emails | Days since subscribe | Send next unsent email in sequence |
| 2 | Post-purchase emails | Days since purchase/delivery | Send tier-specific follow-ups (skips refunded) |
| 3 | Review reminders | 12 hours in "review" | Alert operator (24h guarantee at risk) |
| 4 | Stuck intake detection | 2 hours in "intake" | Mark intake-stalled, alert operator |
| 5 | Stuck generation detection | 30 minutes in "generating" | Mark generation-failed, alert operator with retry command |

## Email System

- **Provider:** Resend (API key is send-only — can send but not manage domains)
- **From address:** `noreply@imnotanattorney.com` (domain not yet verified — using `onboarding@resend.dev` in dev)
- **CAN-SPAM compliance:** Physical address, unsubscribe link, List-Unsubscribe headers (RFC 8058)
- **Templates:** Inline HTML in route handlers and `drip-emails.ts`
- **Drip dedup:** `drip_emails` table tracks which emails were sent to each subscriber

## Security Headers

Configured in `next.config.ts`:
- `Strict-Transport-Security` — HSTS with preload
- `X-Content-Type-Options: nosniff` — Prevent MIME sniffing
- `X-Frame-Options: DENY` — Prevent clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` — Limit referrer leakage

## Known Code Duplications (Intentional)

1. **`escapeHtml()` + `sendEmail()` + `PHYSICAL_ADDRESS`** — Duplicated in the Supabase Edge Function (`generate-report/index.ts`). This is intentional because the edge function runs in Deno and cannot import from the Next.js codebase.

2. **Tier pricing data** — Exists in 3 places: `stripe.ts` (source of truth for checkout), `PricingTable.tsx` (display), `services/page.tsx` (display). Changes must be synced manually.

## File Organization

```
src/
  app/
    api/
      generate/case-decoder/  ← Report generation dispatcher
      webhooks/stripe/         ← Payment + refund handling
      deliver/                 ← Operator report delivery
      cron/drip/              ← Daily cron (5 parts)
      intake/                 ← Intake form submission
      checkout/               ← Stripe session creation
      subscribe/              ← Email subscription
      unsubscribe/            ← CAN-SPAM unsubscribe
      upload/ + finalize/     ← Discovery document upload
      score/                  ← Attorney Accountability Score
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
supabase/
  functions/
    generate-report/          ← Edge function (Deno, 150s timeout)
  migrations/                 ← SQL migration files
```
