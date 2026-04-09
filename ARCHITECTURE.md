# Architecture — ImNotAnAttorney-web

> Living document. Updated: 2026-04-09. Read this before making any change.
> Subsystem details live in `CONTEXT.md` files next to the code. This file is the system map.
> For column-level DB schema: `supabase/SCHEMA.md`. For state machines: `supabase/CONTEXT.md`. For email sequences: `src/lib/CONTEXT.md`.

## System Overview

Legal empowerment platform for criminal defendants. "We Research. You Ask." Combines a content funnel (48+ MDX blog posts, free ungated resources) with e-commerce (8 playbooks at $97, 5 service tiers at $197–$9,997, 38 standalone products across 4 categories) and automated case processing (Claude AI report generation). Live at imnotanattorney.com.

One of three repos in the INAA ecosystem: `ImNotAnAttorney` (business docs/templates), `ImNotAnAttorney-web` (this, customer-facing), `ImNotAnAttorney-engine` (background job workers). All three share the same Supabase database.

## Architectural Invariants

Properties that MUST hold system-wide. Violating any of these is a critical defect.

1. **UPL evaluation gate.** Every generated report must pass UPL compliance evaluation before customer delivery. `evaluate-report` Edge Function (Sonnet, temp 0) checks for legal advice language. Failed eval → operator task, NOT delivery. Never bypass.

2. **Tier-to-Stripe client routing.** All Stripe operations use `stripeForTier(slug)` which selects test/live client from `tiers.ts` live flag. No tier may hardcode a Stripe client. Enforced in `stripe.ts:51-61`.

3. **Cron idempotency.** All cron jobs acquire a distributed lock via `acquireCronLock()` before running. Lock stored in `cron_executions` table. Duplicate requests silently skip. Stale locks auto-recover after 5 minutes.

4. **Service role only for DB access.** No anon-key Supabase client exists. All DB access uses `createAdminClient()` (service role, bypasses RLS) in server-side code only. RLS provides defense-in-depth, not primary auth.

5. **Timing-safe auth comparisons.** All token comparisons use HMAC-then-compare (no length oracle attacks). Used for admin password, operator secret, cron secret. Enforced in `auth/guards.ts` (Node) and `middleware.ts` (Edge).

6. **Input allowlisting.** All user inputs validated against predefined allowlists. No user-supplied strings used directly in scoring, email rendering, or report generation. Enforced per-endpoint.

7. **Email CAN-SPAM compliance.** All emails include unsubscribe link + physical address footer. Enforced in `email.ts`. PHYSICAL_ADDRESS duplicated in Edge Function (Deno can't import Next.js).

8. **Atomic claim-then-mutate.** Operations risking TOCTOU races atomically update status BEFORE side effects. Uses conditional UPDATE (`.eq("status", "review")`) as mutex. Only first request wins.

9. **No email gatekeeping.** Never gate content or resources behind email capture. All guides, checklists, and templates are free and ungated. The `/score` quiz is the ONLY pre-purchase email capture point — after the defendant has already received value (score, observations, attorney email template). Crisis buyers in a 7-day decision window don't trade emails for help — they bounce. Give first, capture after value delivered.

## Component Map

| Subsystem | What It Does | Details |
|-----------|-------------|---------|
| **Pages & Routes** | 55 pages + 70 API routes (App Router) | [`src/app/CONTEXT.md`](src/app/CONTEXT.md) |
| **Core Business Logic** | Auth, payments, email, cron, reports, scoring, sanitization | [`src/lib/CONTEXT.md`](src/lib/CONTEXT.md) |
| **Standalone Products** | 38 active: 3 calculators, 8 content guides, 24 research reports, 3 bundles (4 delivery systems) | `src/lib/products.ts` + `src/lib/bundles.ts` |
| **UI Components** | 45+ components (layout, sales, intake, motion) | [`src/components/CONTEXT.md`](src/components/CONTEXT.md) |
| **Database** | 50+ tables, 41 migrations, 3 Edge Functions, 3 storage buckets | [`supabase/CONTEXT.md`](supabase/CONTEXT.md) |
| **Content** | 48+ MDX blog posts + social content queue | [`content/CONTEXT.md`](content/CONTEXT.md) |
| **Scripts** | 24 utilities: cron setup, legal research, E2E tests | [`scripts/CONTEXT.md`](scripts/CONTEXT.md) |
| **Playbook System** | 8 configurable sales pages (1 component, 8 configs) | [`PLAYBOOK-ARCHITECTURE.md`](PLAYBOOK-ARCHITECTURE.md) |
| **Design System** | Brand tokens: Amber + Navy on black, Playfair + Lato | [`design-system/brand.md`](design-system/brand.md) |

## Data Flow

```
FUNNEL → CAPTURE → PURCHASE → INTAKE → PROCESSING → DELIVERY

Blog/SEO → Free resources (ungated) → Score Quiz (/score, email captured after results)
         → Playbook Checkout ($97) → Stripe webhook → download_token → PDF email
         → Service Checkout ($197–$9,997) → Stripe webhook → Case created
           → Intake form → Report generation (Edge Function / Engine workers)
           → Operator review → Delivery email → Post-purchase drip
         → Standalone Product Checkout ($0–$297) → Stripe webhook → Order + intake token
           → Intake form (token-gated) → generate-standalone Edge Function
           → Report uploaded to Storage → Delivery email → /report/standalone/[token]

STANDALONE PRODUCT SYSTEMS (src/lib/products.ts + bundles.ts):
  1. Calculators (free, 3 active) — /tools/[slug] wizard → instant result
     (Good Time Credit, Diversion Eligibility, Veterans Court)
  2. Content Guides (free, 8 active) — /guides/[slug] static React components
  3. Instant Research ($97-$297, 24 active) — /services/[slug] → checkout → intake
     → generate-standalone Edge Function → Storage → /report/standalone/[token]
  4. Bundles ($97-$197, 3 active) — same flow as research, combined intake form
     (mergeFieldSets), combined report prompt (delegates to included product prompts)
```

## Life of a Case

1. **Purchase** — Stripe checkout session created by `/api/checkout` using `tiers.ts` config. Live/test mode per tier via `TIER_CORE[slug].live`.
2. **Webhook** — `/api/webhooks/stripe` receives `checkout.session.completed`, creates `orders` + `cases` rows, triggers initial email.
3. **Intake** — Customer submits `/api/intake` (Case Decoder) or `/api/intake/intelligence-brief` (IB). `charge-taxonomy.ts` drives dynamic questions.
4. **Report generation** — Supabase Edge Function `generate-report` calls Claude Opus (extended thinking, 16K budget). IB runs 5 parallel + 4 sequential phases via `/api/generate/intelligence-brief/*`.
5. **Evaluation** — `evaluate-report` Edge Function checks for UPL violations. Failed eval → operator task, not customer delivery.
6. **Delivery** — Operator approves → `/api/deliver` sends email + sets `delivered_at`. Customer accesses report at `/report/[token]`.
7. **Post-purchase drip** — `src/lib/cron/drip-post-purchase.ts` fires upgrade-path emails at days 3, 7, 14.

## Tier Inclusion Model

Upper-tier purchases create multiple `cases` rows — one primary plus one included deliverable per entry in `includesTiers` (`src/lib/tiers.ts`). Included deliverables are fully-generated reports that ship before the primary deliverable, not previews.

**Inclusion Map** (verified against `src/lib/tiers.ts`):

| Purchased Tier | Cases Created | Included Deliverables |
|----------------|---------------|----------------------|
| Case Decoder ($197) | 1 case | None |
| Intelligence Brief ($997) | 2 cases | Case Decoder (`is_included_deliverable=true`) |
| X-Ray ($2,497) | 3 cases | Case Decoder + Intelligence Brief |
| War Room ($4,997) | 4 cases | CD + IB + X-Ray |
| Situation Room ($9,997) | 5 cases | CD + IB + X-Ray + War Room |

**How It Works:**

1. Webhook creates the primary case AND loops through `tierConfig.includesTiers` to create additional cases with `is_included_deliverable=true` and `parent_order_id` set.
2. **Upgrade dedup:** Before creating an included case, checks if the customer already has a delivered case for that tier (by email OR court case number match). If so, skips creation.
3. Included CD auto-generates immediately if intake exists (same fire-and-forget pattern as standalone CD).
4. **CD delivery triggers Phase 2 email:** When an included CD is delivered, the deliver route finds sibling cases still awaiting intake and sends the Phase 2 intake email.
5. **Refund cascade:** `cases.eq("order_id")` catches all cases on the order.

**Two-Phase Intake Flow:**

- **Phase 1** (standard intake) — Collected post-purchase. Used to generate the included Case Decoder.
- **Phase 2** (IB-specific intake) — After CD delivery, customer receives email with HMAC-signed link to `/intake/intelligence-brief`. Collects judge, attorney, hearing details.

**Customer Identity:**

- `court_case_number` + `court_state` on the `cases` table (required intake field)
- Checkout page "Returning customer?" section for IB+ tiers

## Cross-Cutting Concerns

Patterns that span multiple subsystems:

- **Rate limiting.** PostgreSQL-based via `check_rate_limit()` RPC, with in-memory Map fallback. Used in: subscribe, score, partner apply, magic link routes. Conservative limits (3/min) compensate for per-isolate Maps on Vercel.
- **Session token hashing.** All auth tokens stored as SHA-256 hashes. Plaintext in cookie/URL only. Used for customer sessions, partner sessions, magic links.
- **Nonce-based CSP.** Middleware generates per-request nonce, attaches to headers. Blocks inline scripts except matching nonce. Forces dynamic rendering for all pages.
- **HTML escaping.** All user strings in email/report HTML pass through `escapeHtml()` before interpolation. Prevents XSS in transactional emails and reports.
- **Fire-and-forget logging.** Email sends, cron results, analytics events logged to DB asynchronously. Failures logged to console but never break the response.
- **Client IP extraction.** Prefers Cloudflare `cf-connecting-ip`, falls back to `x-real-ip`, then `x-forwarded-for` (first entry). Used for rate limiting and analytics.

## Architecture Patterns

Reusable implementation patterns referenced by routes and background jobs. These are the "how" behind the invariants above.

**1. Fire-and-Forget Delegation**
API routes validate + perform atomic state change, then POST to Edge Functions without await. Keeps response time <500ms. The Edge Function runs asynchronously; if it fails, cron Parts 5/5b detect stuck cases. Used by: `generate/case-decoder`, `generate/intelligence-brief`, `evaluate/case-decoder`, webhook generation triggers.

**2. Atomic Claim-Then-Email**
Conditional UPDATE with WHERE clause as database-level mutex. The UPDATE happens BEFORE the email send. Losing request gets zero rows updated, returns early. Prevents duplicate emails from concurrent requests.

```sql
UPDATE cases SET status = 'delivered', delivered_at = now()
WHERE id = $1 AND status = 'review'
RETURNING *;
-- If 0 rows returned → another request already delivered → return early
```

Used by: deliver route, generation triggers, cron parts.

**3. Email Retry with Operator Fallback**
First attempt (rich HTML) → 2s delay → retry (simplified HTML) → operator alert with report URL for manual forwarding. Case status already updated so report URL works even without email. Used by: all email-sending routes via `sendEmailWithRetry()`.

**4. Idempotency via Status Checks + Unique Constraints**
Status-based check first (skip if already processing), then atomic guard (DB-level). Stripe webhook retries return 200 on duplicate `stripe_session_id` (PostgreSQL error code 23505 = unique violation). Used by: webhook handler, cron parts, generation dispatchers.

**5. HMAC Token Signing**
Operator delivery links use `signOperatorToken(caseId)` with 24h TTL. Phase 2 intake links use `signPhase2Token(caseId)` with 30-day TTL. Token format: `"timestamp.hmac_hex"` where payload = `"${caseId}:${timestamp}"`, signed with HMAC-SHA256 using `OPERATOR_SECRET`. Verification uses constant-time comparison. Source: `src/lib/site.ts`.

**6. Score-Band Routing**
Subscribers who complete the Defense Milestone Score get `score_band` stored on their subscriber record. Cron Part 1 routes them to band-specific drip sequences FIRST, then falls through to standard nurture with a day offset. Crisis/Concerning get urgency sequences; Adequate/Excellent get validation.

## Life of a Blog Post (End-to-End)

1. **Trigger** — Admin hits `POST /api/admin/blog-pipeline` or runs local `claude -p` task.
2. **Topic research** — `blog-generation/topic-research.ts` fetches keyword volume + SERP difficulty.
3. **Generation** — `blog-generation/generate-post.ts` calls Claude Sonnet with charge-type expertise prompts.
4. **QA pipeline** — `qa-slop.ts` (removes AI tells) → `qa-humanizer.ts` (validates tone) → `qa-upl.ts` (UPL compliance).
5. **Publish** — `blog-generation/publish.ts` writes MDX to `content/blog/[slug].mdx`.
6. **Deploy** — `git push origin master` → Vercel auto-deploy. Blog listing + sitemap auto-update.

## Life of a Score Assessment (End-to-End)

1. **Quiz** — `/score` page presents 10 questions (charge type, time since arrest, attorney type, motions, discovery, communication, strategy, history, stage, licensed profession).
2. **Submit** — `POST /api/score` validates inputs against `ALLOWED_VALUES` allowlist.
3. **Calculate** — `score.ts` starts at 50, applies weighted adjustments (motions 20%, discovery 15%, communication 15%, time 30%, attorney/strategy 10% each). Clamps to 0-100, assigns band.
4. **Aggregate** — Fire-and-forget: increments anonymous counters (total by charge, band distribution, penalty counters). No individual scores stored.
5. **Share** — `POST /api/score/share` re-calculates score server-side (prevents tampering), generates token, stores in `score_results`, returns shareable URL.
6. **Results** — `/score/results/[token]` renders score band, observations, and upgrade callouts.

## Gotchas

1. **Dual-mode Stripe requires BOTH keys.** When any tier has `live: true`, `STRIPE_SECRET_KEY_LIVE` and `STRIPE_WEBHOOK_SECRET_LIVE` must be set. Not validated at startup — only at first live payment.

2. **CSP nonce disables static optimization.** Root layout reads `headers()` for nonce → all pages render dynamically. ISR `revalidate` controls data freshness, not page caching.

3. **Edge Function 150s timeout vs Opus latency.** Opus report generation can take 250-294s. Backup worker (`scripts/generate-worker.mjs`) picks up timed-out cases within 5 minutes.

4. **Cron stale lock recovery at 5 minutes.** Crashed cron jobs leave locks in `running` state. Auto-recovered after 5 min. Jobs genuinely > 5 min get double-executed.

5. **PHYSICAL_ADDRESS duplicated in two places.** `site.ts` and `supabase/functions/generate-report/`. Deno Edge Functions can't import Next.js modules. Update both when address changes.

6. **Rate limiter is per-Vercel-isolate.** Effective limit = `max_requests × warm_instances`. Conservative value (3/min) compensates.

7. **Advisory locks don't work on Supabase.** Connection pooler shares sessions. Replaced with `cron_executions` table locking (migration 028).

## Key Decisions

| Decision | Chosen | Why | Status |
|----------|--------|-----|--------|
| Configurable playbook pages | 1 `PlaybookSalesPage` component + 8 `PlaybookConfig` objects | Copy changes don't touch component code; new playbooks = new config | accepted |
| Dual-mode Stripe | `TIER_CORE[slug].live` flag per tier | Launch DUI first, keep others in test mode safely | accepted |
| Magic link auth | No passwords; token in cookie | Criminal defendants won't remember passwords under stress | accepted |
| Crisis buyer psychology | 7-day convert window, urgency + guarantee | Defendant researches right after arrest, not 6 weeks later | accepted |
| Claude AI for reports | Opus (Case Decoder, extended thinking) + Sonnet (IB sections) | Opus needed for case-level reasoning; Sonnet sufficient for structured sections | accepted |
| Orchestrated cron | 22 tasks run sequentially via cron-job.org | Isolated error handling per task; no GitHub Actions cron | accepted |
| UPL compliance gate | Every generated report evaluated before delivery | Non-negotiable legal risk mitigation | accepted |
| Three-repo ecosystem | web + engine + business-docs as separate repos | Engine scales independently; business docs stay out of git deploy | accepted |

## External Dependencies

| Dependency | Purpose | Failure Mode |
|------------|---------|-------------|
| Stripe | Checkout + webhooks + refunds | No purchases; orders in test mode unaffected |
| Supabase | PostgreSQL + Edge Functions + auth | Site up; no case processing or logins |
| Resend | Transactional + drip email | No delivery notifications; drip pauses |
| Claude API | Case Decoder + IB report generation | Reports queue but don't generate |
| cron-job.org | 22 daily orchestrated tasks | Drip stops; operator alerts stop; reconciliation stops |
| Vercel | Hosting + Edge runtime | Site down |
| Cloudflare | DNS routing | Site unreachable |
| ImNotAnAttorney-engine | Discovery tier job processing ($2,497+) | Discovery cases stuck at `pending` |

## Boundaries

### Allowed
- Read `ImNotAnAttorney/` (business docs, templates, seed data, evaluation criteria)
- Read `ImNotAnAttorney-engine/` when debugging discovery-tier case processing
- Shared skills at `~/.claude/skills/`

### Forbidden
- NEVER give legal advice — always disclaim "information, not legal advice" (UPL compliance)
- NEVER skip the UPL evaluation gate before delivery
- NEVER use `vercel deploy` CLI — deploys via `git push origin master` only
- NEVER run `vercel env pull` — overwrites `.env.local`
- NEVER touch Cloudflare/domain settings — already configured
- NEVER read TasteDrop, Cloud Culture, video-factory, or marketing-hq repos

## Environment Variables

All vars verified present in `src/` via `process.env.*` grep. Common trap: the cron bearer token is `CRON_AUTH_TOKEN`, NOT `CRON_SECRET` (middleware.ts:80, guards.ts:74, all cron routes).

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All API routes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes | Full DB access (bypasses RLS) |
| `STRIPE_SECRET_KEY` | checkout, webhook (test mode) | Stripe API access (test) |
| `STRIPE_SECRET_KEY_LIVE` | checkout, webhook (live mode) | Stripe API access (live) — required when any tier has `live: true` |
| `STRIPE_WEBHOOK_SECRET` | webhook | Verify Stripe webhook signatures (test) |
| `STRIPE_WEBHOOK_SECRET_LIVE` | webhook | Verify Stripe webhook signatures (live) |
| `RESEND_API_KEY` | email.ts, admin/reply, resend-inbound | Send transactional emails |
| `RESEND_FROM_EMAIL` | email.ts | Sender address (default `noreply@imnotanattorney.com`) |
| `RESEND_INBOUND_WEBHOOK_SECRET` | resend-inbound webhook | Verify inbound email webhook |
| `RESEND_WEBHOOK_SECRET` | resend webhook | Verify delivery/bounce webhook |
| `OPERATOR_EMAIL` | All alert routes | Where operator notifications go (default `rahim0kapadia@gmail.com`) |
| `OPERATOR_SECRET` | generate, deliver, evaluate, qa-checkout | Bearer auth for operator-only endpoints + HMAC signing |
| `ADMIN_PASSWORD` | middleware, auth/guards | Admin password for `/api/admin/*` + `/api/operator/*` (timing-safe compare) |
| `NEXT_PUBLIC_SITE_URL` | Email links, redirects | Canonical site URL (default `https://imnotanattorney.com`) |
| `ANTHROPIC_API_KEY` | Edge Function, blog-generation, demand/classify-llm, batch-api | Claude API for report/content generation |
| `CRON_AUTH_TOKEN` | middleware, auth/guards, all cron routes | Bearer auth for cron requests (NOT `CRON_SECRET` — common confusion) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI, scripts | Edge function + migration deployment (from `../ImNotAnAttorney/.env.local`) |
| `CRONJOB_API_KEY` | scripts/setup-cronjob-org.js | cron-job.org job registration |
| `INDEXNOW_KEY` | blog-generation/publish, /api/indexnow | IndexNow search engine ping |
| `GITHUB_TOKEN` | blog-generation/publish | Git commit of generated blog posts |
| `TWILIO_ACCOUNT_SID` | twilio.ts | Twilio auth for operator SMS alerts |
| `TWILIO_AUTH_TOKEN` | twilio.ts | Twilio auth |
| `TWILIO_PHONE_NUMBER` | twilio.ts | Twilio sender number |
| `NEXT_PUBLIC_GA_ID` | CookieConsent | Google Analytics ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | CookieConsent | Meta (FB) pixel ID |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | CookieConsent | Google Ads ID |
| `INTERNAL_QA_EMAIL` | checkout, qa-checkout, stripe webhook | Email allowlist for free QA checkout |
| `INTERNAL_QA_COUPON_ID` | checkout | 100%-off Stripe coupon ID for QA |
| `ENGINE_DISPATCH_PAT` | cron/generate-backup | GitHub PAT to dispatch engine workflow |
| `VERCEL_TOKEN` | scripts, CLI | Vercel API/CLI auth |

## Deployment

- **Trigger:** `git push origin master` → GitHub integration → Vercel auto-deploy
- **Team ID:** `team_UEzHXQJJI46GEPEYeFspl1Pq`
- **Production project:** `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr) — this serves `imnotanattorney.com`
- **DO NOT USE:** `imnotanattorney-web` (prj_fgx7OUbudHbS2WrfoaLKb07jJAnB) — duplicate project, unlinked from GitHub Apr 4 2026
- **Edge Functions:** Deploy separately via Supabase CLI (`supabase functions deploy`)
- **Env vars:** `vercel env add VAR_NAME production --token $VERCEL_TOKEN` (CLI targets correct project via `.vercel/project.json`)

### Deploy Guardrails

Historical rules — violating any of these has broken production before. Rules 2/6/7 from the original 7 are already covered in Forbidden and Deployment above.

- **NEVER deploy to `tastedrops-projects`** — that is TasteDrop's account, completely separate business.
- **NEVER run `vercel env pull`** — it overwrites `.env.local` with only the vars in Vercel (drops any local-only vars).
- **NEVER delete `.vercel/` directory** — it links the CLI to the correct project (`imnotanattorney`, not `imnotanattorney-web`).
- **NEVER touch domain settings** — `imnotanattorney.com` is routed via Cloudflare A records, already configured.
- **Verify account before any Vercel CLI operation:** `npx vercel whoami` must show `rahim0kapadia-1967`.

## Maintenance Rules

- **On component add/remove:** Update Component Map above
- **On subsystem change:** Update that subsystem's CONTEXT.md, not this file
- **On new external dependency:** Update External Dependencies
- **On architecture decision:** Add row to Key Decisions (never modify — supersede)
- **On boundary change:** Update Boundaries section
- **On invariant change:** Update Architectural Invariants (major event — requires review)
- **On new cross-cutting pattern:** Update Cross-Cutting Concerns
- **New gotcha discovered:** Add to Gotchas (most impactful first)
- **Deep detail needed:** DB schema → `supabase/SCHEMA.md`; case status state machine → `supabase/CONTEXT.md`; email sequences → `src/lib/CONTEXT.md`; env vars → this file
- **On any code change:** `node docs/verify-architecture.js` (automated via CI on pull requests)
- **Verification script:** `docs/verify-architecture.js` — auto-generated, do not edit manually
- **Last full verification:** 2026-04-01
