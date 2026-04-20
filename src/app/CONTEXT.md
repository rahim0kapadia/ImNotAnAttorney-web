# Pages & Routes, src/app/

> Next.js App Router: 58 pages and 80 API routes. All routes are server components by default; client components marked `"use client"`.

## Page Map

### Public / Marketing
| Route | File | Purpose |
|-------|------|---------|
| `/` | `page.tsx` | Homepage: hero, value props, pricing table, testimonials |
| `/about` | `about/page.tsx` | Mission, team, credentials |
| `/contact` | `contact/page.tsx` | Contact form |
| `/resources` | `resources/page.tsx` | Legal database links + local org directory |
| `/editorial-policy` | `editorial-policy/page.tsx` | UPL disclaimer + editorial standards |
| `/privacy` | `privacy/page.tsx` | Privacy policy |
| `/terms` | `terms/page.tsx` | Terms of service |
| `/blog` | `blog/page.tsx` | MDX post listing with category filter |
| `/blog/[slug]` | `blog/[slug]/page.tsx` | Individual post + related posts |
| `/playbooks` | `playbooks/page.tsx` | Catalog of live playbooks |
| `/playbook/[slug]` | `playbook/[slug]/page.tsx` | Long-form sales page (configurable via `playbook-configs.ts`) |
| `/score` | `score/page.tsx` | Defense Strength Score quiz |
| `/score/results/[token]` | `score/results/[token]/page.tsx` | Score visualization + lead capture |
| `/dui-defense` | `dui-defense/page.tsx` | DUI defense overview landing page |
| `/dui-defense/[state]` | `dui-defense/[state]/page.tsx` | State-specific DUI content pages |
| `/dui-checklist` | `dui-checklist/page.tsx` | Ungated DUI first-72-hours checklist |
| `/sample` | `sample/page.tsx` | Sample Case Decoder report preview |
| `/sample-xray` | `sample-xray/page.tsx` | Sample X-Ray discovery report preview |
| `/start` | `start/page.tsx` | Entry router, charge-type selector → tier |
| `/family` | `family/page.tsx` | Family/loved-one landing page |
| `/partners` | `partners/page.tsx` | Partner program overview |
| `/partners/bondsman` | `partners/bondsman/page.tsx` | Bondsman referral landing page |
| `/unsubscribe` | `unsubscribe/page.tsx` | Email unsubscribe confirmation |
| `/r/[code]` | `r/[code]/page.tsx` | Short referral link redirect |
| `/r/[code]/quiz` | `r/[code]/quiz/page.tsx` | Referral-tracked score quiz entry |
| `/research/defense-score-data` | `research/defense-score-data/page.tsx` | Aggregate score stats (ISR 1h) |
| `/checkout` | `checkout/page.tsx` | Checkout form with tier selection, email, consent |
| `/idd` | `idd/page.tsx` | IDD (Indigent Defense Diversion) application page |
| `/plea-analyzer` | `plea-analyzer/page.tsx` | Free plea deal analyzer (acquisition wedge → email capture → upsell) |
| `/judge-report-card` | `judge-report-card/page.tsx` | Judge report card product page |
| `/officer-background-check` | `officer-background-check/page.tsx` | Officer background check product page |
| `/similar-cases-analyzer` | `similar-cases-analyzer/page.tsx` | Similar cases analyzer product page |
| `/services` | `services/page.tsx` | Services overview/listing page |

### Standalone Products (catalog: `src/lib/products.ts`, 54 products, 44 active: 32 paid $97–$497, 12 free)
| Route | File | Purpose |
|-------|------|---------|
| `/tools/[slug]` | `tools/[slug]/page.tsx` | Free calculator wizard (Good Time Credit live; SOL and Diversion draft) |
| `/tools/[slug]/results/[token]` | `tools/[slug]/results/[token]/page.tsx` | Saved calculator results, shareable link (noindex) |
| `/guides/[slug]` | `guides/[slug]/page.tsx` | Free content guides (First Court Appearance, Family Action Plan, Arraignment Protocol) |
| `/services/[slug]` | `services/[slug]/page.tsx` | Landing page for paid research products, 26 PRODUCT_COPY entries (employment-impact $197, judge-profile $497, motion-opportunity-scan $497, collateral-consequences $147, license-risk $297, security-clearance $147, + 8 Wave 1 $97 DUI/evidence products + 6 Wave 4 Reddit net-new products). Dynamic route, PRODUCT_COPY map keyed by slug. |
| `/intake/standalone/[slug]` | `intake/standalone/[slug]/page.tsx` | Token-gated intake form for research products. `IntakeFormClient.tsx` has a FIELD_SETS registry with 26 per-slug field configurations, data-driven form, zero code per new product. |
| `/report/standalone/[token]` | `report/standalone/[token]/page.tsx` | Report viewer (Storage-backed, sanitized HTML, noindex) |

**Product stamping sprint (2026-04-08):** 18 new research products + 5 updated existing products added in a single session. Non-destructive architecture, IntakeFormClient.tsx was already generalized from hardcoded employment-impact fields to a data-driven FIELD_SETS registry in the prior court case port session, so Wave 1-4 stamping was pure data additions across 6 files (products.ts, IntakeFormClient.tsx, services/[slug]/page.tsx, generate-standalone/index.ts, intake/standalone/[slug]/route.ts, qa-checkout/route.ts). Zero breaking changes to Employment Impact live flow. See `docs/handoff/2026-04-08-product-stamping-waves-1-4.md` in the ImNotAnAttorney business repo for the per-product breakdown.

### Auth & Checkout
| Route | File | Purpose |
|-------|------|---------|
| `/checkout/success` | `checkout/success/page.tsx` | Post-purchase confirmation |
| `/intake` | `intake/page.tsx` | Case Decoder intake form |
| `/intake/intelligence-brief` | `intake/intelligence-brief/page.tsx` | IB Phase 2 intake |
| `/upload` | `upload/page.tsx` | Discovery document upload (tier-gated) |
| `/my-cases/login` | `my-cases/login/page.tsx` | Customer magic-link login request |
| `/my-cases/login/verify` | `my-cases/login/verify/page.tsx` | Customer magic-link token exchange |
| `/partner/login` | `partner/login/page.tsx` | Partner magic-link login request |
| `/partner/login/verify` | `partner/login/verify/page.tsx` | Partner magic-link token exchange |

### Protected (Customer Portal)
| Route | File | Purpose |
|-------|------|---------|
| `/my-case/[token]` | `my-case/[token]/page.tsx` | Single case access via magic link token |
| `/my-cases` | `my-cases/page.tsx` | All cases for authenticated user |
| `/report/[token]` | `report/[token]/page.tsx` | Case report delivery page |

### Admin / Operator
| Route | File | Purpose |
|-------|------|---------|
| `/operator` | `operator/page.tsx` | Dashboard: active cases, queue, metrics |
| `/operator/cases` | `operator/cases/page.tsx` | Case listing with search and filters |
| `/operator/cases/[id]` | `operator/cases/[id]/page.tsx` | Case detail + status controls |
| `/operator/jobs` | `operator/jobs/page.tsx` | Job queue viewer + retry controls |
| `/operator/metrics` | `operator/metrics/page.tsx` | System metrics dashboard |
| `/admin/demand` | `admin/demand/page.tsx` | Market demand intelligence |
| `/admin/inbox` | `admin/inbox/page.tsx` | Inbound email management |
| `/admin/partners` | `admin/partners/page.tsx` | Partner application review |
| `/partner/dashboard` | `partner/dashboard/page.tsx` | Partner portal dashboard |

## API Route Groups

### Checkout & Payments (3 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/checkout` | Create Stripe session; uses `tiers.ts` + dual-mode live flag |
| POST | `/api/checkout/verify` | Verify session + webhook idempotency |
| GET | `/api/qa-checkout` | Operator-only $0 webhook trigger for E2E testing |

#### Checkout Flow, 10 Steps

Source: `src/app/api/checkout/route.ts`. Runs in order; any step can 4xx out before Stripe is touched.

| Step | Action | Details |
|------|------, |---------|
| 1 | Rate limit | `checkRateLimit(adminClient, "checkout:${ip}", 10, 300)`, 10 requests per 300 seconds per IP. Returns 429 if exceeded |
| 2 | Tier validation | Reject unknown tier slugs against `TIERS` config, 400 |
| 3 | Email validation | Regex + normalize (lowercase + trim via `normalizeEmail`), 400 on invalid format |
| 4 | Email capture | Upsert to `subscribers` with `source="checkout"`, powers abandonment recovery (cron Part 11) |
| 5 | Charge type auto-detect | Lookup most recent intake for this email if `chargeType` not provided in request body |
| 6 | Refund check | Block if a prior refunded order exists for this email (fraud prevention) |
| 7 | Prerequisite gate | Situation Room requires a prior delivered War Room case (soft gate, returns specific error) |
| 8 | Consent validation | Non-digital tiers require `consent=true`; $2,497+ (X-Ray and up) have a stricter consent check |
| 9 | Case number lookup | Cross-email identity matching, if `court_case_number` matches a prior case under ANY email, link the new case for returning customers |
| 10 | Upgrade credit | 100% credit from lower service tiers (12-month expiry), 30-day expiry for playbook→CD. Create a Stripe coupon on the fly and attach to the session |

**Checkout Success OTO (One-Time Offer) system:**
- 24-hour countdown timer, stored in `localStorage` + server session
- Per-tier upgrade offers with credit pre-calculated (`upgradeCostBetween` from `tiers.ts`)
- Tier-specific next steps via `TIER_NEXT_STEPS` config, tells the customer what to expect and when
- Lives at `/checkout/success` page; server component loads the order + tier + computes upgrade options in a single pass

**Dual-mode Stripe keys:** Checkout picks `STRIPE_SECRET_KEY` vs `STRIPE_SECRET_KEY_LIVE` based on the tier's `live: true` flag. If a tier has `live: true` but `STRIPE_SECRET_KEY_LIVE` is missing, checkout crashes at runtime, keep both in sync.

### Webhooks (4 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/webhooks/stripe` | Order + refund processing; creates `orders` + `cases` rows |
| POST | `/api/webhooks/resend` | Delivery tracking + bounce handling |
| POST | `/api/webhooks/resend-inbound` | Email reply parsing → operator inbox |
| POST | `/api/webhooks/engine/delivery` | Engine job completion notifications |

#### Stripe Webhook Handler Flow

Source: `src/app/api/webhooks/stripe/route.ts`. Handles 4 Stripe event types. Dual-mode signature verification tries `STRIPE_WEBHOOK_SECRET` (test) first, then `STRIPE_WEBHOOK_SECRET_LIVE`. Whichever verifies wins, supports gradual go-live where some tiers are live and others are test.

**Event 1: `checkout.session.completed`** (customer just paid):
1. **Extract metadata**, tier, email (normalized via `normalizeEmail`), amount, product_type, priority_delivery, court_date, consent_timestamp, upgrade_credit_applied, existing_case_number/state.
2. **Create order**, insert row with unique constraint on `stripe_session_id`. Postgres error code `23505` (unique violation) returns 200 idempotently, Stripe retries up to 3 times over 72 hours on non-2xx.
3. **Digital product path** (early return), generate `download_token` (UUID) + 72h expiry → send playbook delivery email → show upgrade credit toward CD → operator notification → RETURN. Does not create a case row.
4. **Service tier path**, create case → link intake if one exists for that email → loop `tierConfig.includesTiers` to create additional cases with `is_included_deliverable=true` + `parent_order_id` → trigger generation via `after()` (runs post-response, GC-safe on Vercel) → status-appropriate customer emails.

Status assignments on the new case:
- `"intake"`, intake exists + non-discovery tier → ready for generation
- `"awaiting-intake"`, no intake found → email customer to fill intake form
- `"pending"`, intake exists + discovery tier → waiting for document upload

**Event 2: `charge.refunded`** (full or partial refund):
1. **Full refund path**, order status → `"refunded"`, case status → `"refunded"`, `refunded_at = now()`, report access revoked (download token lookup returns 403).
2. **Partial refund path**, order stays `"paid"`, only `refunded_at` timestamp logged for audit trail.
3. **Commission reversal**, zero out referral commission + decrement partner totals.
4. **Standalone report fields cleared**, `standalone_report_token_hash`, `standalone_report_storage_path`, `standalone_report_token_expires_at` all set to NULL on refund.
5. **Operator notification**, email with refund amount + reason.

**Event 3: `charge.refund.updated`**, refund bounce detection. Alerts operator when refund fails or requires action.

**Event 4: `invoice.payment_failed`**, installment payment failure. Alerts operator when a subscription invoice fails (e.g., second installment on deferred payment plans).

Email normalization is critical: all customer emails lowercased + trimmed before storage/lookup, so cross-email identity matching (upgrade credits, case number lookups) works regardless of how the customer capitalized their address at each touchpoint.

### Customer Auth (5 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/customer/magic-link` | Send magic link email |
| POST | `/api/customer/magic-link/verify` | Exchange token for session cookie |
| POST | `/api/customer/logout` | Clear session cookie |
| GET | `/api/customer/cases` | List user's cases |

### Intake & Case Management (4 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/intake` | Submit intake → create processing jobs |
| POST | `/api/intake/intelligence-brief` | IB-specific intake (Phase 2) |
| POST | `/api/upload` | Begin multipart document upload |
| POST | `/api/upload/finalize` | Complete upload → trigger OCR job |

(Operator case CRUD + status transitions live under "Operator Dashboard" below.)

### Report Generation & Delivery (6 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/generate/case-decoder` | Trigger Case Decoder Edge Function |
| POST | `/api/generate/intelligence-brief/*` | Trigger IB phases (5 parallel + 4 sequential) |
| POST | `/api/generate/intelligence-brief/judge-research` | Targeted judge research sub-phase |
| POST | `/api/generate/standalone` | Operator retry for standalone research products (fires `generate-standalone` Edge Function) |
| POST | `/api/evaluate/case-decoder` | UPL compliance evaluation |
| POST | `/api/deliver` | Email report to customer + set `delivered_at` |
| GET | `/api/download/[token]` | Download token validation |

### Tier 9 Availability Gate (1 route)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/check-availability/[slug]` | Pre-purchase data check for Tier 9 SKUs (judge-report-card, officer-background-check, similar-cases-analyzer). Returns coverage counts + availability boolean. Waitlist capture when `waitlist: true` + `email` in body → `data_waitlist` upsert + Telegram alert. Rate limited: 10/min per IP. |

### Standalone Product Routes (calculators, intake, tools)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/intake/standalone/[slug]` | Token-auth intake submission; validates allowlists, sanitizes, fires Edge Function |
| POST | `/api/tools/save-results` | Save calculator results with email for shareable link |
| GET | `/api/tools/[slug]` | Dynamic calculator compute endpoint |

### Scoring & Free Tools (3 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| GET/POST | `/api/score` | Fetch score by token (GET) + submit quiz responses (POST) |
| POST | `/api/score/share` | Social share lead capture |
| GET | `/api/stats/score-summary` | Aggregate score stats (ISR 5min) |

### Cron Tasks (12 routes, see lib/CONTEXT.md for task list)
All cron routes: `GET /api/cron/*`, authenticated via `CRON_AUTH_TOKEN` header.
Main orchestrator: `/api/cron/drip`, runs all 22 tasks sequentially.
Routes: `drip`, `engine`, `batch-poll`, `generate-backup`, `blog-generate`, `blog-generate-queue`, `blog-qa`, `blog-publish`, `reddit-monitor`, `demand-fetch`, `demand-score`, `demand-classify`, `demand-performance`, `demand-feedback-patterns`, `demand-feedback-revise`, `demand-feedback-score`.

### Admin-Only (12 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| GET/POST | `/api/admin/demand/scores` | Demand score read + regenerate |
| GET/POST | `/api/admin/demand/gaps` | Content gap CRUD |
| GET/POST | `/api/admin/demand/emerging` | Emerging topic tracker |
| GET/POST | `/api/admin/demand/performance` | Content performance metrics |
| GET/POST | `/api/admin/demand/subreddits` | Discovered subreddit list |
| GET | `/api/admin/emails` | Inbound email inbox |
| POST | `/api/admin/reply` | Reply to inbound email via Resend |
| GET/POST | `/api/admin/partners` | Partner application list |
| PATCH | `/api/admin/partners/[id]` | Approve/reject partner application |
| POST | `/api/admin/blog-pipeline` | Trigger blog generation |
| GET | `/api/admin/blog-pipeline/[id]` | Blog pipeline job status |
| POST | `/api/admin/feature-flags` | Toggle feature flags |

### Operator Dashboard (7 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| GET/POST | `/api/operator/cases` | Case list + case CRUD |
| GET | `/api/operator/cases/[id]` | Single case detail |
| PATCH | `/api/operator/cases/[id]/status` | Case status transition (state machine) |
| GET | `/api/operator/jobs` | Processing job queue viewer |
| POST | `/api/operator/jobs/[id]/retry` | Retry a failed job |
| GET | `/api/operator/metrics` | System metrics snapshot |
| GET | `/api/operator/tasks` | Operator task queue |

### Partner Portal (6 routes)
| Method | Route | Purpose |
|------, |-------|---------|
| POST | `/api/partner/magic-link` | Send partner login magic link |
| POST | `/api/partner/magic-link/verify` | Exchange token for partner session |
| POST | `/api/partner/logout` | Clear partner session cookie |
| GET | `/api/partner/dashboard` | Commission stats + referral list |
| PATCH | `/api/partner/settings` | Profile/payout update |
| POST | `/api/partners/apply` | Referral program application (public) |

### Charge Taxonomy (3 routes)
`GET /api/charge-taxonomy/{categories,charges,questions}`, serves `charge-taxonomy.ts` data.

### Miscellaneous (5 routes)
`POST /api/subscribe`, `POST /api/unsubscribe`, `POST /api/indexnow`, `GET /api/health`.

## Auth Middleware

`src/middleware.ts`, Edge middleware runs on every request:
- Injects CSP nonce
- Checks `customer_session` cookie for protected routes (`/my-case`, `/my-cases`, `/report`)
- Checks `operator_session` cookie for admin routes (`/operator`, `/admin`)
- Redirects unauthenticated users to `/`

### Security Headers & CSP

Source: `src/middleware.ts` (CSP, per-request nonce) + `next.config.ts` (static headers).

**Content-Security-Policy** (set on both request and response headers for Next.js SSR nonce parsing):

| Directive | Value |
|---------, |-------|
| `default-src` | `'self'` |
| `script-src` | `'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://vercel.live` |
| `style-src` | `'self' 'unsafe-inline'` (required by Tailwind + inline email styles) |
| `img-src` | `'self' data: https:` |
| `font-src` | `'self'` |
| `connect-src` | `'self' https://api.stripe.com https://vercel.live ${NEXT_PUBLIC_SUPABASE_URL} https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com` |
| `frame-src` | `https://js.stripe.com https://hooks.stripe.com` |
| `frame-ancestors` | `'none'` (reinforces `X-Frame-Options: DENY`) |
| `object-src` | `'none'` |
| `worker-src` | `'self'` |
| `base-uri` | `'self'` |
| `form-action` | `'self' https://checkout.stripe.com` |

The per-request nonce is base64-encoded `crypto.randomUUID()`, written to the `x-nonce` header so `layout.tsx` can read it via `headers()` during SSR. `connect-src` is scoped to the specific Supabase project URL when `NEXT_PUBLIC_SUPABASE_URL` is set; otherwise falls back to `https://*.supabase.co`.

**Static security headers** (applied to ALL routes via `next.config.ts` `headers()`):

| Header | Value | Purpose |
|------, |-------|---------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HSTS for 2 years with preload list opt-in, browsers will never make an HTTP request after first visit |
| `X-Content-Type-Options` | `nosniff` | Block MIME sniffing, mitigates drive-by download attacks |
| `X-Frame-Options` | `DENY` | Block iframe embedding anywhere (clickjacking protection) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URL on same-origin, origin-only on cross-origin, prevents leaking `/report/{token}` paths |
| `Permissions-Policy` | feature disables | Disables browser features not used by the app |

## Data Flow

```mermaid
graph TD
    Browser[Browser / External],> MW[middleware.ts, Edge]
    MW,>|CSP nonce + auth check| Router[App Router]
    Router,> Pages[55 Pages]
    Router,> API[71 API Routes]
    Router,> Special[sitemap.ts / robots.ts / OG images]
    
    API,> Guards[auth/guards.ts]
    Guards,> Lib[src/lib/, Business Logic]
    Lib,> Supa[Supabase DB]
    Lib,> Edge[Edge Functions]
    Lib,> Ext[Stripe / Resend / Claude API]
    
    Pages,> Components[src/components/]
    Pages,> Lib
```

**Middleware auth matrix:**
| Route pattern | Auth mechanism | Checked in |
|---------------|---------------|------------|
| `/api/admin/*` | `x-admin-password` header (HMAC-SHA256) | middleware.ts |
| `/api/generate/*`, `/api/evaluate/*`, `/api/deliver` | Bearer OPERATOR_SECRET | middleware.ts |
| `/api/cron/*` | Bearer CRON_AUTH_TOKEN | middleware.ts |
| `/api/customer/*`, `/my-case/*` | `customer-session` cookie exists (Edge) → full validation in route | middleware.ts + route handler |
| `/api/partner/*`, `/partner/*` | `partner-session` cookie exists (Edge) → full validation in route | middleware.ts + route handler |

## Key Constants

| Constant | Value | File:Line |
|----------|-------|---------, |
| `TIER_CORE` | 14 tiers (pricing + Stripe IDs) | `src/lib/tiers.ts:30-256` |
| `PLAYBOOK_CONFIGS` | 8 charge-type sales pages | `src/lib/playbook-configs.ts` |
| `SITE_URL` | `https://imnotanattorney.com` | `src/lib/site.ts:48-49` |
| `metadataBase` | `new URL(SITE_URL)` | `layout.tsx:74` |
| `title.template` | `"%s \| ImNotAnAttorney"` | `layout.tsx:77` |
| `maxDuration` (cron/demand-fetch) | 300s | `api/cron/demand-fetch/route.ts:19` |
| `maxDuration` (cron/demand-score) | 120s | `api/cron/demand-score/route.ts:21` |
| `maxDuration` (cron/blog-publish) | 60s | `api/cron/blog-publish/route.ts:22` |
| `revalidate` (score-summary) | 300s (5 min ISR) | `api/stats/score-summary/route.ts:9` |
| `revalidate` (defense-score-data) | 3600s (1 hr ISR) | `research/defense-score-data/page.tsx:6` |

## How To

- **Add a new page:** Create `src/app/[route]/page.tsx`. If it's a sales page, add a config to `src/lib/playbook-configs.ts` and use `PlaybookSalesPage`. Update sitemap: `src/app/sitemap.ts`.
- **Add an API route:** Create `src/app/api/[path]/route.ts`. Export named `GET`/`POST`/`PATCH` handlers. For operator-only routes, call `requireAdmin()` from `src/lib/auth/guards.ts` at the top.
- **Add a cron task:** Add task function to `src/lib/cron/`, register it in the main cron orchestrator. See `src/lib/CONTEXT.md` for the task list and pattern.
- **Add a new tier:** Update `src/lib/tiers.ts` (TIER_CORE) first. Then add a `PlaybookConfig` to `playbook-configs.ts`. Run `node scripts/check-tiers.mjs` to verify sync.

## Integration Points

**Imports from lib (highest traffic):**
- `@/lib/tiers`, TIER_CORE, upgradePrice (homepage, checkout, services, about)
- `@/lib/site`, SITE_URL, signOperatorToken, normalizeEmail (all email routes, schema generation)
- `@/lib/supabase/admin`, createAdminClient() (all API routes touching DB)
- `@/lib/email`, sendEmail(), escapeHtml (webhooks, cron, delivery)
- `@/lib/stripe`, stripeForTier() (checkout, webhooks)
- `@/lib/auth/guards`, requireAdmin(), requireCron(), requireCustomerAuth() (all protected routes)
- `@/lib/schema`, JSON-LD generators (pages with structured data)
- `@/lib/blog`, getAllPosts(), getPostBySlug() (blog pages, sitemap)
- `@/lib/playbook-configs`, allPlaybookSlugs(), PLAYBOOK_CONFIGS (playbook pages, sitemap)

**Imports from components (highest traffic):**
- Header, Footer (root layout)
- HomepageHero, ChargeTypeSelector, PricingTable, TrustBadges, TestimonialSection (homepage)
- LeadCapture, BlogCTA, BlogCard (blog pages)
- AdminNav, StatusBadge (operator/admin pages)
- motion/* (FadeInUp, StaggerContainer, used across pages)

**Shared state:**
- `customer-session` cookie, set by customer auth, read by middleware + route handlers
- `partner-session` cookie, set by partner auth, read by middleware + route handlers
- CSP nonce, generated in middleware, read in layout.tsx via `headers()`

**Edge Functions called from API routes:**
- `generate-report` ← `/api/generate/case-decoder` (fire-and-forget POST)
- `evaluate-report` ← `/api/evaluate/case-decoder` (fire-and-forget POST)

## Gotchas

1. **CSP nonce forces dynamic rendering.** Root layout calls `await headers()` for the nonce, disabling static optimization for all pages. ISR `revalidate` values still work for data freshness but pages re-render per request.

2. **Dual-mode Stripe keys.** If a tier has `live: true` but `STRIPE_SECRET_KEY_LIVE` is missing, checkout crashes at runtime. Webhook handler must verify against BOTH test and live webhook secrets.

3. **Middleware auth is Edge-only (no DB calls).** Customer/partner cookie existence is checked in Edge, but full session validation happens in Node route handlers. A valid cookie with an expired DB session returns 401 from the route, not middleware.

4. **Cron routes are fire-and-forget from cron-job.org.** `maxDuration` limits vary (10s–300s). If a job exceeds its limit, Vercel kills it mid-execution. The cron idempotency lock may stay in `running` state for up to 5 minutes before stale recovery.

5. **Blog/playbook slugs are not redirected on rename.** If you rename a blog slug or playbook config, old URLs return 404. Add redirects in `next.config.ts` for renamed content.

6. **Sitemap must be updated manually.** New pages/blog posts are not auto-discovered. Update `sitemap.ts` when adding pages.

7. **OG images use Edge runtime.** Cannot import external images or fonts. Use inline data URLs or hardcoded font files.

## Operator Case Detail, 8 Tabs

`/operator/cases/[id]` runs 13 parallel Supabase queries on mount and surfaces the result through 8 tabs. Header above the tabs shows email, tier, status, phase, dates, order info, intake summary, operator notes, and the report link.

| Tab | Contents |
|---, |----------|
| Overview | MetricCards: discovery health, documents, findings, witnesses, evidence, custody, timeline, citations |
| Documents | Table: name, type, category, size, pages, status, upload date |
| Findings | Grouped by severity (critical / major / minor / info) with verification status |
| Witnesses | Table: name, type, agency, credibility score, threat level, dossier status, cross-exam ready |
| Jobs | Table: job type, status, progress bar, items produced, retries, retry button |
| Tasks | Table: priority badge, title, type, status, due date, SLA breach indicator |
| Timeline | Reconstructed events summary |
| Legal | Citations table (binding / good law) + Motions table (strategic scores) |

Auth is handled by `OperatorShell` component wrapping all operator pages, password in `sessionStorage` (key `admin-password`), verified via `X-Admin-Password` header against `isOperatorAuthorized()` in `src/lib/operator-auth.ts` using timing-safe compare. Sidebar keyboard shortcuts: H (Dashboard), C (Cases), J (Jobs), M (Metrics).

## My-Case Portal, Tier-Gated Architecture

Token-based customer portal at `/my-case` (single case) and `/my-cases` (all cases for authenticated user). No login required for magic-link flow, unguessable UUID token with 12-month expiry. The dashboard surface is tier-gated: each tier unlocks more data panels from the same ~10 parallel Supabase queries (discovery_documents, case_findings, evidence_items, evidence_custody, timeline_events, case_witnesses, case_law_references, motion_recommendations, trial_materials, processing_jobs).

**Non-Discovery Tiers (Case Decoder $197, Intelligence Brief $997):** Simple progress stepper, Purchased → Generating → Under Review → Delivered, plus the report link once delivered.

**X-Ray ($2,497):** Full discovery dashboard:
- Discovery Strength Rating (0-100)
- Defense Opportunity Index (overall score from JSONB)
- Document tracker (Uploaded / Processed / Analyzing)
- Findings severity breakdown (critical / high / major / minor)
- Evidence chain status (items, verified transfers, gaps)
- Timeline event count
- Processing progress bar

**War Room ($4,997):** X-Ray dashboard plus:
- Witnesses (dossier status, credibility, cross-exam readiness)
- Case law citations (binding, good law verification)
- Motion recommendations (strategic scores)

**Situation Room ($9,997):** War Room dashboard plus:
- Attack intelligence (cross-exam / impeachment vectors)
- Trial preparation materials

## Maintenance Triggers

- **New page added** → Add to Page Map + sitemap.ts
- **New API route added** → Add to API Route Groups table
- **Auth guard changed** → Update middleware auth matrix above
- **New maxDuration or revalidate** → Update Key Constants table
- **New lib module imported across 3+ routes** → Add to Integration Points
- **Middleware logic changed** → Update Data Flow diagram + auth matrix
