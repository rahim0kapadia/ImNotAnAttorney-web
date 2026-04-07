# Architecture — ImNotAnAttorney-web

> Living document. Updated: 2026-03-31. Read this before making any change.
> Subsystem details live in `CONTEXT.md` files next to the code. This file is the system map.
> For deep detail (DB schema, env vars, state machines, email sequences): see `docs/ARCHITECTURE.md`.

## System Overview

Legal empowerment platform for criminal defendants. "We Research. You Ask." Combines a content funnel (35+ MDX blog posts, free ungated resources) with e-commerce (8 playbooks at $97, 5 service tiers at $197–$9,997) and automated case processing (Claude AI report generation). Live at imnotanattorney.com.

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
| **Standalone Products** | Calculators, content guides, research reports (3 delivery systems) | `src/lib/products.ts` (source of truth) |
| **UI Components** | 45+ components (layout, sales, intake, motion) | [`src/components/CONTEXT.md`](src/components/CONTEXT.md) |
| **Database** | 50+ tables, 41 migrations, 3 Edge Functions, 3 storage buckets | [`supabase/CONTEXT.md`](supabase/CONTEXT.md) |
| **Content** | 35+ MDX blog posts + social content queue | [`content/CONTEXT.md`](content/CONTEXT.md) |
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

STANDALONE PRODUCT SYSTEMS (src/lib/products.ts is source of truth):
  1. Calculators (free) — /tools/[slug] wizard → instant result (Good Time Credit live)
  2. Content Guides (free) — /guides/[slug] static pages (First Court Appearance live)
  3. Instant Research ($197+) — /services/[slug] → checkout → intake → Claude → Storage
     → /report/standalone/[token] (Employment Impact Assessment live)
```

## Life of a Case

1. **Purchase** — Stripe checkout session created by `/api/checkout` using `tiers.ts` config. Live/test mode per tier via `TIER_CORE[slug].live`.
2. **Webhook** — `/api/webhooks/stripe` receives `checkout.session.completed`, creates `orders` + `cases` rows, triggers initial email.
3. **Intake** — Customer submits `/api/intake` (Case Decoder) or `/api/intake/intelligence-brief` (IB). `charge-taxonomy.ts` drives dynamic questions.
4. **Report generation** — Supabase Edge Function `generate-report` calls Claude Opus (extended thinking, 16K budget). IB runs 5 parallel + 4 sequential phases via `/api/generate/intelligence-brief/*`.
5. **Evaluation** — `evaluate-report` Edge Function checks for UPL violations. Failed eval → operator task, not customer delivery.
6. **Delivery** — Operator approves → `/api/deliver` sends email + sets `delivered_at`. Customer accesses report at `/report/[token]`.
7. **Post-purchase drip** — `src/lib/cron/drip-post-purchase.ts` fires upgrade-path emails at days 3, 7, 14.

## Cross-Cutting Concerns

Patterns that span multiple subsystems:

- **Rate limiting.** PostgreSQL-based via `check_rate_limit()` RPC, with in-memory Map fallback. Used in: subscribe, score, partner apply, magic link routes. Conservative limits (3/min) compensate for per-isolate Maps on Vercel.
- **Session token hashing.** All auth tokens stored as SHA-256 hashes. Plaintext in cookie/URL only. Used for customer sessions, partner sessions, magic links.
- **Nonce-based CSP.** Middleware generates per-request nonce, attaches to headers. Blocks inline scripts except matching nonce. Forces dynamic rendering for all pages.
- **HTML escaping.** All user strings in email/report HTML pass through `escapeHtml()` before interpolation. Prevents XSS in transactional emails and reports.
- **Fire-and-forget logging.** Email sends, cron results, analytics events logged to DB asynchronously. Failures logged to console but never break the response.
- **Client IP extraction.** Prefers Cloudflare `cf-connecting-ip`, falls back to `x-real-ip`, then `x-forwarded-for` (first entry). Used for rate limiting and analytics.

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

## Deployment

- **Trigger:** `git push origin master` → GitHub integration → Vercel auto-deploy
- **Team ID:** `team_UEzHXQJJI46GEPEYeFspl1Pq`
- **Production project:** `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr) — this serves `imnotanattorney.com`
- **DO NOT USE:** `imnotanattorney-web` (prj_fgx7OUbudHbS2WrfoaLKb07jJAnB) — duplicate project, unlinked from GitHub Apr 4 2026
- **Edge Functions:** Deploy separately via Supabase CLI (`supabase functions deploy`)
- **Env vars:** `vercel env add VAR_NAME production --token $VERCEL_TOKEN` (CLI targets correct project via `.vercel/project.json`)

## Maintenance Rules

- **On component add/remove:** Update Component Map above
- **On subsystem change:** Update that subsystem's CONTEXT.md, not this file
- **On new external dependency:** Update External Dependencies
- **On architecture decision:** Add row to Key Decisions (never modify — supersede)
- **On boundary change:** Update Boundaries section
- **On invariant change:** Update Architectural Invariants (major event — requires review)
- **On new cross-cutting pattern:** Update Cross-Cutting Concerns
- **New gotcha discovered:** Add to Gotchas (most impactful first)
- **Deep detail needed:** See `docs/ARCHITECTURE.md` (DB schema, state machines, env vars, email sequences)
- **On any code change:** `node docs/verify-architecture.js` (automated via CI on pull requests)
- **Verification script:** `docs/verify-architecture.js` — auto-generated, do not edit manually
- **Last full verification:** 2026-04-01
