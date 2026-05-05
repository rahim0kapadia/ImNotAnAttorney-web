# Architecture, ImNotAnAttorney-web

> Living document. Updated: 2026-04-27 (Vercel redeploy nudge). Read this before making any change.
> Subsystem details live in `CONTEXT.md` files next to the code. This file is the system map.
> For column-level DB schema: `supabase/SCHEMA.md`. For state machines: `supabase/CONTEXT.md`. For email sequences: `src/lib/CONTEXT.md`.

## System Overview

Legal empowerment platform for criminal defendants. "We Research. You Ask." Combines a content funnel (70 MDX blog posts as of 2026-04-27, free ungated resources, Plea Analyzer acquisition wedge) with e-commerce (8 playbooks at $127/$147, 5 service tiers at $197–$9,997, 49 standalone products, 35 paid $97–$497, 14 free, across 4 categories) and automated case processing (Claude AI report generation). Live at imnotanattorney.com.

One of three repos in the INAA ecosystem: `ImNotAnAttorney` (business docs/templates), `ImNotAnAttorney-web` (this, customer-facing), `ImNotAnAttorney-engine` (background job workers). All three share the same Supabase database.

## Architectural Invariants

Properties that MUST hold system-wide. Violating any of these is a critical defect.

1. **UPL evaluation gate.** Every generated report must pass UPL compliance evaluation before customer delivery. `evaluate-report` Edge Function (Sonnet, temp 0) checks for legal advice language. Failed eval → operator task, NOT delivery. Never bypass.

2. **Tier-to-Stripe client routing.** All Stripe operations use `stripeForTier(slug)` which selects test/live client from `tiers.ts` live flag. No tier may hardcode a Stripe client. Enforced in `stripe.ts:51-61`.

3. **Cron idempotency.** All cron jobs acquire a distributed lock via `acquireCronLock()` before running. Lock stored in `cron_executions` table. Duplicate requests silently skip. Stale locks auto-recover after 5 minutes.

4. **Service role only for DB access** (with one scoped carve-out). No anon-key Supabase client exists. All DB access uses `createAdminClient()` (service role, bypasses RLS) in server-side code only. RLS provides defense-in-depth, not primary auth. **Exception (added 2026-04-25, SEC-W4):** the auto-poster pipeline (`blog-pipeline/scripts/{youtube,twitter-x,instagram,facebook,tiktok}-auto.mjs`) uses a scoped `platform_post_writer` role — NOLOGIN, SELECT/INSERT/UPDATE on `platform_posts` only — via `SUPABASE_PLATFORM_POSTS_KEY`. Still server-side, still JWT-authenticated, still no anon-key path. Blast-radius reduction for a subsystem that doesn't need full-DB access. Migration: `supabase/migrations/20260425a_platform_post_writer_role.sql`. JWT issuance via Supabase Dashboard → Project Settings → API (role claim). `platform-auto-core.mjs` already prefers `SUPABASE_PLATFORM_POSTS_KEY` over service-role when present.

5. **Timing-safe auth comparisons.** All token comparisons use HMAC-then-compare (no length oracle attacks). Used for admin password, operator secret, cron secret. Enforced in `auth/guards.ts` (Node) and `middleware.ts` (Edge).

6. **Input allowlisting.** All user inputs validated against predefined allowlists. No user-supplied strings used directly in scoring, email rendering, or report generation. Enforced per-endpoint.

7. **Email CAN-SPAM compliance.** All emails include unsubscribe link + physical address footer. Enforced in `email.ts`. PHYSICAL_ADDRESS duplicated in Edge Function (Deno can't import Next.js).

8. **Atomic claim-then-mutate.** Operations risking TOCTOU races atomically update status BEFORE side effects. Uses conditional UPDATE (`.eq("status", "review")`) as mutex. Only first request wins.

9. **No email gatekeeping.** Never gate content or resources behind email capture. All guides, checklists, and templates are free and ungated. The `/score` quiz is the ONLY pre-purchase email capture point, after the defendant has already received value (score, observations, attorney email template). Crisis buyers in a 7-day decision window don't trade emails for help, they bounce. Give first, capture after value delivered.

10. **Trust-crossover rule (white-label).** Partner brand renders on pre-quiz referral surfaces only (`/r/[code]`, `/r/[code]/reminders`). Quiz (`/score`) and every post-quiz surface (checkout, delivery, paid funnel, email) revert to INAA brand. Never blend shells on one page. Partner color must pass WCAG AA (>=4.5:1) on our dark canvas (`#000`) — `partners.brand_contrast_passed` gates rendering; fallback is INAA default. Feature flag `NEXT_PUBLIC_PARTNER_BRANDING_ENABLED=true` in prod. Enforced in `src/components/shells/PartnerBrandedShell.tsx` + `src/app/layout.tsx` (suppresses global chrome via `x-pathname` header from middleware + `isPartnerBrandedRoute()` with canonical `PROMO_CODE_REGEX`).

11. **White-label logo hosting — Supabase Storage only.** Partner `logo_url` must live on `*.supabase.co/storage/v1/object/public/partner-logos/` (CHECK constraint `partners_logo_url_allowlist`, migration 20260420e). Partners onboard via either POST `/api/partner/branding/fetch-website` (server-side scrapes partner's own website — waterfall: JSON-LD Organization.logo → og:image → apple-touch-icon → favicon → Google s2 fallback — downloads bytes, magic-byte sniffs PNG/JPEG/WEBP, uploads to bucket) or POST `/api/partner/branding/upload` (multipart, same bucket). Scraper also mines the page for a color palette (HTML + 2 linked stylesheets, frequency-ranked, WCAG-filtered) returned in `websiteColors[]`. Brandfetch removed 2026-04-20 — was a hotlinking redirect trap when `BRANDFETCH_CLIENT_ID` missing. See `src/lib/partner-branding/{website-scraper,color-extractor,image-probe,file-sniff,url-guard}.ts`.

12. **Phase 2 cite-tag sanitizer (2026-04-22).** Every `<cite data-entity-type data-entity-id>` span in `report_html` must have a matching `v_entity_confidence` row or it is stripped before sanitize-html runs. `src/lib/report/badge-transform.ts` (Node) + `stripInvalidCiteTags` inlined into `supabase/functions/generate-report/index.ts` (Deno) are the two enforcement points — drift locked by `whitelist-parity.test.ts`. `report_format_version` on `cases` gates transform: `=1` pre-2026-04-22 (no transform), `=2` post-2026-04-22 (transform applied).

13. **Verification-URL HARD rule for legal data.** Every case-law citation, statute section, or "good-law" claim stored by the system carries a verification URL in `source_urls[]`. Any claim without a URL is treated as fabricated and cannot pass the Phase 2 whitelist. `formatOrdinal` duplicated Deno/Node by necessity — locked by `format-ordinal-parity.test.ts`.

14. **Cold-email isolation.** Primary brand domains (`imnotanattorney.com`, `inaa.com`, `tastedrop.com`, `cloudculture.com`, `myculture.cloud`) may NEVER be the FROM address of bounce-verification probes, cold outreach, or any batch send with >5% bounce risk. Enforced live via `FORBIDDEN_FROM_DOMAINS` constant in `src/app/api/cron/rising-precedent-alerts/route.ts` (lines 78-89) + `isForbiddenFromAddress()` guard on every send. Source rule: `~/.claude/rules/never-cold-email-from-primary-domain.md`.

## Component Map

| Subsystem | What It Does | Details |
|---------, |-------------|---------|
| **Pages & Routes** | 80+ pages + 120+ API routes (App Router) — added /pji, /pji/[circuit], /pji/[circuit]/[instruction], /assault-defense[/state], /drug-possession-defense[/state], /domestic-violence-defense[/state], /admin/tier-generation, /tools/scotus-case-search, /research/defense-score-data, /district-court-intelligence; Phase C 2026-04-27 added `/api/cron/quora-discovery` (scaffold returns 503 with runbook) + `/api/cron/gsc-query-discovery` (LIVE, weekly Mon 13:00 UTC, jobId 7533529, inlined GSC service-account JWT auth); **2026-05-04 cross-corpus:** `/api/cron/refresh-cross-corpus-matviews` (LIVE, Sunday 02:00 UTC, jobId 7561641, refreshes 3 matviews with REFRESH MATERIALIZED VIEW CONCURRENTLY via direct pg.Client port 5432) | [`src/app/CONTEXT.md`](src/app/CONTEXT.md) |
| **Core Business Logic** | Auth, payments, email, cron, reports, scoring, sanitization, **Phase 2 cite-tag transform + entity whitelist + badge renderer** | [`src/lib/CONTEXT.md`](src/lib/CONTEXT.md) |
| **Standalone Products** | 49 active (59 total, 10 inactive): calculators (incl. Federal Sentencing Distribution $297 + SCOTUS Case Search), content guides, research reports, bundles | `src/lib/products.ts` + `src/lib/bundles.ts` |
| **UI Components** | 80+ components + `ReportVerificationFooter` (live confidence-tier head count from `v_entity_confidence`) + `RelatedStateCharges` (pSEO cross-state linking) | [`src/components/CONTEXT.md`](src/components/CONTEXT.md) |
| **Database** | 90+ tables (post-USSC + PJI + JUSTFAIR + Vera + Marshall + SCOTUS + FARS + DPIC + police_stops + attorney_discipline + 9 tier-ladder derivation tables + 5 judge-fingerprint tables + v_entity_confidence matview), 140+ migrations, `generate-report` Edge Function, storage buckets. **Cross-corpus matviews (feat/cross-corpus-join-skus, 2026-05-04):** `mv_judge_officer_motion_rates` (J3 — officer×judge motion grant rates, 8,134 rows), `mv_judge_bench_fingerprint` (BR-J1 — USSC sentencing fingerprint + CL docket bridge, 11,252 rows), `mv_judge_docket_caseload` (J1 — criminal/civil caseload + jury demand stats, 3,306 rows). Refreshed weekly Sunday 02:00 UTC via cron-job.org jobId 7561641 hitting `/api/cron/refresh-cross-corpus-matviews`. Schema: `supabase/SCHEMA.md` § "Cross-Corpus Materialized Views". | [`supabase/CONTEXT.md`](supabase/CONTEXT.md) |
| **Content** | 60+ MDX blog posts + social content queue + 50-state pSEO pages (dui / drug-possession / assault / domestic-violence) | [`content/CONTEXT.md`](content/CONTEXT.md) |
| **Scripts** | 220+ utilities: cron setup, legal research, Playwright E2E, bulk-loaders (CL / USSC / FJC / Vera / JUSTFAIR / PJI / SCOTUS / open-policing / FARS / DPIC / attorney-discipline), judge-fingerprint v3 builders, Phase 2 matview refresh, tier-ladder retroactive-regen, derivation pipelines, **statute-seeding pipeline** (US/FL/OH/VA/GA via shared `lib/unicourt-harness.mjs`; 1,996 verified rows in `jurisdiction_statutes` as of 2026-05-01; OR + hostile-states bucket Phase 4 in flight via parent monorepo), **cross-corpus bridge (`scripts/build-entities-officers-link.mjs`, 2026-05-04):** JOIN docket_entries_tags → cl_people → entities_officers to populate `entities_officers.cl_person_id`; seeds `officer_reliability` + `motion_rates` for J3 matview | [`scripts/CONTEXT.md`](scripts/CONTEXT.md) |
| **Playbook System** | 8 configurable sales pages (1 component, 8 configs) | [`PLAYBOOK-ARCHITECTURE.md`](PLAYBOOK-ARCHITECTURE.md) |
| **Design System** | Brand tokens: Amber + Navy on black, Playfair + Lato. Phase 2 adds 6 confidence-tier CSS classes (platinum / gold / verified / cross-verified / high / medium + top-tier alias) | [`design-system/brand.md`](design-system/brand.md) |
| **Per-Tier Generation Mode** | **LIVE** — dispatcher in `/api/generate/case-decoder` + `/api/generate/intelligence-brief` reads `tier_generation_config.mode` and routes to `api` (existing Edge Function, Opus), `mechanical` (HTML skeleton only, CD only), or `session` (operator writes by hand via `/api/admin/session-report/<caseId>`). CD + IB + X-Ray + War Room + Situation Room flipped to `session` 2026-04-24 per zero-hallucination mandate. The earlier `hybrid` (Haiku-per-slot) mode was removed same day — Haiku was too small a model to trust at a customer-facing legal-content layer. Stale `hybrid` DB values resolve to `session` via mode-config fallback. Admin UI at `/admin/tier-generation` flips modes. Verified-opus replacement path (mechanical data pull with source_urls → Opus voice around pre-verified facts → operator approves) is queued for a separate rebuild. | [`docs/plans/2026-04-23-per-tier-generation-mode-orphan-resume.md`](docs/plans/2026-04-23-per-tier-generation-mode-orphan-resume.md) |

## E2E Coverage Map

Playwright specs live in `e2e/`. Before writing new specs, check this map — overlap is the most common form of wasted work.

| Spec file | Covers |
|---|---|
| `partner-full-walkthrough.spec.ts` | Full bondsman partner walkthrough: login → dashboard → every section, form, and modal (payment settings, notifications, add-client, FTA calculator, toolkit, compliance, checklist, card) |
| `white-label-walkthrough.spec.ts` | Partner branding flow: logo upload + website scrape + contrast gate + preview |
| `partner-checklist.spec.ts` | Bondsman compliance checklist (QR + print) |
| `bondsman-hardening.spec.ts` | Bondsman-mode invariants (28 tests, production) |
| `checkin-signup.spec.ts` | `/checkin/[code]` enrollment flow |
| `bridge-referral.spec.ts` | `/r/[code]` bridge page |
| `product-deep-link.spec.ts` | `/r/[code]/[product]` deep links |
| `og-preview.spec.ts` | OG image 200/PNG/≥10KB + og:title + og:description + twitter:card + twitter:image + canonical + partner-specific branding for `/r/[code]`, `/checkin/[code]`, and all 6 `/r/[code]/[product]` variants |
| `og-preview-unfurl-bots.spec.ts` | 7 unfurl bot UAs (Facebook, Slack, Twitter/X, LinkedIn, WhatsApp, Telegram, iMessage) × 3 HTML routes + 3 OG image routes = 42 tests. Catches UA-gated 403s that blank unfurls on specific platforms |
| `og-preview-visual.spec.ts` | Byte-accurate snapshot baselines (5% pixel tolerance) for OG images. Catches brand color drift + logo shift. Baselines in `e2e/og-preview-visual.spec.ts-snapshots/` — regenerate with `--update-snapshots` |
| `court-reminders.spec.ts` | Reminder SMS + email flow |
| `a11y-partner-routes.spec.ts` | axe-core WCAG 2.1 AA audit on 5 partner-facing routes (/partner/login, /r/[code], /r/[code]/reminders, /r/[code]/[product], /checkin/[code]). Fails on critical/serious; warns on moderate/minor. Authenticated dashboard routes out of scope (follow-up). |
| `fsd-*.spec.ts`, `ussc-*.spec.ts` | Federal sentencing distribution tools |
| `fsd-federal-sentencing-distribution.spec.ts` | $297 FSD standalone end-to-end: 6 test cases covering intake → Monte Carlo → results |
| `phase2-badges.spec.ts` | Phase 2 per-citation verification badge render against `/report/[token]` (auto-skips without `E2E_TEST_CASE_ID`) |
| `pseo-state-charge.spec.ts` | State-charge pSEO pages: /drug-possession-defense/[state], /assault-defense/[state], /domestic-violence-defense/[state] × sample states |
| `sentencing-calc.spec.ts` | Sentencing calculator standalone |
| `scotus-case-search.spec.ts` | SCOTUS Case Search ($0 free) calculator |
| `checkin-csp-smoke.spec.ts` | CSP header smoke check on /checkin/[code] to guard against inline-script CSP drift |
| `arrest-survival-kit.spec.ts` | $47 Arrest Survival Kit purchase + delivery |

**Fixtures:** `E2EREFE` (referral-mode bondsman), `E2EBOND` (check-in-mode bondsman). Seeded by `scripts/seed-e2e-partners.mjs`. All specs gate on `E2E_SEED_READY=1`.

**Fast CI script:** `npm run test:e2e:og` — runs only the 3 OG specs (cheap, no browser steps, ~60 tests total). Wire into CI for every PR without paying the 5-min full-walkthrough cost.

## Partner System Operational Inventories

Audit snapshot from 2026-04-21 (Phase 3 hardening). Inventory-only — gaps below
each table become follow-up PRs. Re-run the inventory when adding a new
`/api/partner/*` route or partner-system env dependency.

Rate-limit helper: `src/lib/rate-limit.ts` → `checkRateLimit(supabase, key, maxRequests, windowSeconds)`.
Backed by Postgres RPC `check_rate_limit` with in-memory fail-closed fallback
(`MEMORY_MAX_REQUESTS=3` per 60s) when Supabase is unreachable. Middleware
(`src/middleware.ts`) enforces cookie-exists auth on `/api/partner/*` but does
NOT apply any rate limits of its own — all limiting is per-route.

### Rate limits — /api/partner/* + /api/partners/*

| Route | Method | Rate-limited | Key | Limit | Gap notes |
|---|---|---|---|---|---|
| `/api/partners/apply` | POST | Yes | `partner-apply:{ip}` | 3 / hour | OK |
| `/api/partner/magic-link` | POST | Yes (2 keys) | `partner-magic:{email}` + `partner-magic-ip:{ip}` | 3/hr email · 10/hr IP | OK |
| `/api/partner/magic-link/verify` | POST | Yes | `partner-verify:{ip}` | 10 / 5 min | OK |
| `/api/partner/logout` | POST | Yes | `partner-logout:{ip}` | 10 / 5 min | OK |
| `/api/partner/track-event` | POST | Yes (2 keys) | `partner-event-ip:{ip}` + `partner-event:{promo_code}` | 10/min IP · 10/min code | OK |
| `/api/partner/branding/save` | PATCH | Yes | `partner-branding-save:{partner.id}` | 30 / hour | OK |
| `/api/partner/branding/upload` | POST | Yes | `partner-branding-upload:{partner.id}` | 10 / hour | OK |
| `/api/partner/branding/fetch-website` | POST | Yes | `partner-branding-fetch-website:{partner.id}` | 20 / hour | OK |
| `/api/partner/dashboard` | GET | Yes | `partner-dashboard:{partner.id}` | 60 / min | OK (DoS guard added 2026-04-21) |
| `/api/partner/settings` | PATCH | Yes | `partner-settings:{partner.id}` | 20 / hour | OK (added 2026-04-21) |
| `/api/partner/add-client` | POST | Yes | `partner-add-client:{partner.id}` | 30 / hour | OK (added 2026-04-21) |
| `/api/partner/notification-prefs` | GET · PATCH | PATCH yes | `partner-notifs:{partner.id}` | 20 / hour | OK (added 2026-04-21) |
| `/api/partner/clients/[id]/schedule` | PATCH | Yes | `partner-schedule:{partner.id}` | 30 / hour | OK (added 2026-04-21) |
| `/api/partner/compliance-report` | GET | No | — | — | Authenticated read, low-risk. No limit needed. |

**Remaining gaps:**
- [x] 2026-04-21: durable-store fallback ACTIVATED via Upstash Redis. Contract + implementation live at `src/lib/rate-limit-durable/`. Magic-link opted in via `checkRateLimit(..., { durable: true })`. To provision + wire Upstash on prod: `node scripts/setup-durable-rate-limit.mjs` (needs UPSTASH_EMAIL, UPSTASH_API_KEY, VERCEL_TOKEN envs locally). Dormant until `DURABLE_RL_PROVIDER=upstash` is set on Vercel; setup script writes that env.

### Env vars — partner system

Scope legend: **Public** = `NEXT_PUBLIC_*`, ships in client bundle. **Secret** = server-only, must be on Vercel prod never committed. **Runtime** = Node-provided (no Vercel config).

| Env var | Required? | Where read | Scope |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Required | `src/lib/supabase/admin.ts:46`, `src/middleware.ts:92,249` (CSP connect-src), `src/lib/partner-branding/url-guard.ts:307` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | `src/lib/supabase/admin.ts:47` (every partner route via `createAdminClient()`) | Secret |
| `RESEND_API_KEY` | Required | `src/lib/email.ts:50` (magic-link, add-client, schedule, all partner emails) + `src/lib/sms.ts:45` (SMS-via-email-gateway for partner-client reminders) | Secret |
| `RESEND_FROM_EMAIL` | Optional | `src/lib/email.ts:54` (defaults to `noreply@imnotanattorney.com`) | Secret |
| `NEXT_PUBLIC_SITE_URL` | Optional | `src/lib/email.ts:178` (magic-link URLs, partner dashboard links; defaults to `https://imnotanattorney.com`) | Public |
| `OPERATOR_EMAIL` | Optional | `src/app/api/partners/apply/route.ts:25` (apply-notification recipient), `src/lib/email.ts:217,298` (reply-to + admin digests) | Secret |
| `ADMIN_PASSWORD` | Required (admin routes) | `src/middleware.ts:134` — not read by `/api/partner/*` but gates partner-adjacent admin surfaces | Secret |
| `OPERATOR_SECRET` | Required (generate/evaluate) | `src/middleware.ts:154` — not read by `/api/partner/*` but gates report generation used by partner tiers | Secret |
| `CRON_AUTH_TOKEN` | Required (partner crons) | `src/middleware.ts:171` — gates `/api/cron/partner-drip`, `/api/cron/partner-cleanup`, `/api/cron/partner-monthly-summary`, `/api/cron/court-reminders`, `/api/cron/check-in-prompt`, `/api/cron/sms-health-check` | Secret |
| `NEXT_PUBLIC_PARTNER_BRANDING_ENABLED` | Optional (feature flag) | `src/lib/partner-branding/feature-flag.ts:2` — gates white-label branding UI + `/api/partner/branding/*` routes | Public |
| `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED` | Optional (feature flag) | `src/app/partner/dashboard/page.tsx:158`, `src/app/partner/card/page.tsx:69,106`, `src/app/partner/checklist/page.tsx:72,257`, `src/app/r/[code]/page.tsx:99`, `src/app/r/[code]/opengraph-image.tsx:37`, `src/app/checkin/[code]/page.tsx:13,37`, `src/app/checkin/[code]/opengraph-image.tsx:13` — gates bondsman mode toggle + `/checkin/[code]` surface | Public |
| `SMS_HEALTH_TEST_PHONE` | Optional | `src/app/api/cron/sms-health-check/route.ts:20` — if unset, SMS-leg of health probe skipped | Secret |
| `TELEGRAM_BOT_TOKEN_LEGAL` | Optional | `src/app/api/cron/sms-health-check/route.ts:110` — alerting when SMS health probe fails | Secret |
| `TELEGRAM_CHAT_ID` | Optional | `src/app/api/cron/sms-health-check/route.ts:111` — paired with Telegram bot token | Secret |
| `NODE_ENV` | Runtime | `src/middleware.ts:104,117` + `src/app/api/partner/logout/route.ts:33` + `src/app/api/partner/magic-link/verify/route.ts:79` — gates cookie `secure` flag | Runtime |

**Gaps flagged as follow-up (Vercel prod verification needed on project `imnotanattorney` / `prj_zqxNgG9xcM235bnKRoEgP5kBOEEr`):**
- [x] 2026-04-21: `GET /api/admin/env-presence` + `node scripts/check-partner-envs.mjs` report presence of all 15 partner-system env vars in the running deploy. Use before/after deploys to catch drift. Extend `PARTNER_SYSTEM_ENVS` in the route when adding a new env dependency (keep inventory table + endpoint array in lockstep).
- [x] 2026-04-21: `OPERATOR_EMAIL` and `RESEND_FROM_EMAIL` now use `envWithWarn()` — in production, falling back to the hardcoded default emits a `[ENV-MISSING]` console.warn once per process. Grep Vercel logs for `ENV-MISSING` to detect drift. Source: `src/lib/env-check.ts`.
- [ ] Document `TELEGRAM_BOT_TOKEN_LEGAL` + `TELEGRAM_CHAT_ID` in the alerting runbook — without both, SMS health probe failures are silent.

## Data Flow

```
FUNNEL → CAPTURE → PURCHASE → INTAKE → PROCESSING → DELIVERY

Blog/SEO → Free resources (ungated) → Score Quiz (/score, email captured after results)
         → Plea Analyzer (/plea-analyzer, free acquisition wedge → email capture → upsell)
         → Playbook Checkout ($127/$147) → Stripe webhook → download_token → PDF email
         → Service Checkout ($197–$9,997) → Stripe webhook → Case created
           → Intake form → Report generation (Edge Function / Engine workers)
           → Operator review → Delivery email → Post-purchase drip
         → Standalone Product Checkout ($0–$297) → Stripe webhook → Order + intake token
           → Intake form (token-gated) → generate-standalone Edge Function
           → Report uploaded to Storage → Delivery email → /report/standalone/[token]
         → Tier 9 Standalone ($97–$297) → AvailabilityChecker → Stripe (intake in metadata)
           → Webhook detects pre-populated intake → instant generation (no intake email)

STANDALONE PRODUCT SYSTEMS (src/lib/products.ts + bundles.ts):
  1. Calculators (free, 3 active), /tools/[slug] wizard → instant result
     (Good Time Credit, Diversion Eligibility, Veterans Court)
  2. Content Guides (free, 8 active), /guides/[slug] static React components
  3. Instant Research ($97-$297, 24 active), /services/[slug] → checkout → intake
     → generate-standalone Edge Function → Storage → /report/standalone/[token]
  4. Bundles ($97-$197, 3 active), same flow as research, combined intake form
     (mergeFieldSets), combined report prompt (delegates to included product prompts)
```

## Life of a Case

1. **Purchase**, Stripe checkout session created by `/api/checkout` using `tiers.ts` config. Live/test mode per tier via `TIER_CORE[slug].live`.
2. **Webhook**, `/api/webhooks/stripe` receives `checkout.session.completed`, creates `orders` + `cases` rows, triggers initial email.
3. **Intake**, Customer submits `/api/intake` (Case Decoder) or `/api/intake/intelligence-brief` (IB). `charge-taxonomy.ts` drives dynamic questions.
4. **Report generation**, Supabase Edge Function `generate-report` calls Claude Opus (extended thinking, 16K budget). IB runs 5 parallel + 4 sequential phases via `/api/generate/intelligence-brief/*`.
5. **Evaluation**, `evaluate-report` Edge Function checks for UPL violations. Failed eval → operator task, not customer delivery.
6. **Delivery**, Operator approves → `/api/deliver` sends email + sets `delivered_at`. Customer accesses report at `/report/[token]`.
7. **Post-purchase drip**, `src/lib/cron/drip-post-purchase.ts` fires upgrade-path emails at days 3, 7, 14.

## Tier Inclusion Model

Upper-tier purchases create multiple `cases` rows, one primary plus one included deliverable per entry in `includesTiers` (`src/lib/tiers.ts`). Included deliverables are fully-generated reports that ship before the primary deliverable, not previews.

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

- **Phase 1** (standard intake), Collected post-purchase. Used to generate the included Case Decoder.
- **Phase 2** (IB-specific intake), After CD delivery, customer receives email with HMAC-signed link to `/intake/intelligence-brief`. Collects judge, attorney, hearing details.

**Customer Identity:**

- `court_case_number` + `court_state` on the `cases` table (required intake field)
- Checkout page "Returning customer?" section for IB+ tiers

## Tier 9: Data-Driven Defense Intelligence Layer

A purely statistical intelligence layer computed from CourtListener's 10M+ opinion corpus. No AI credits required, all keyword matching and graph analysis. Produces insights no attorney tool offers at any price.

**9 Statistical Angles:**

1. Judge × Prosecutor pairing matrix (`judge_prosecutor_pairings`), motion grant rates per judge-prosecutor pair
2. k-NN similar-case matching (`case_feature_vectors`), feature vectors + nearest neighbors from DB data
3. Sentencing outlier detection (`sentencing_distributions`), sentence length extraction + percentile computation
4. Bench vs jury sentencing divergence (`bench_jury_divergence`), USSC district-level plea/bench/jury sentencing + CL opinion-mined acquittal rates
5. Judge quote library (`judge_quotes`), extracted judicial holding quotes from opinions
6. Officer reliability cross-case patterns (`officer_reliability`), cross-case officer credibility tracking
7. Appeal outcome correlation (`appellate_trends`), appellate reversal/affirmance rates via citation-map
8. Co-defendant divergence analysis (`co_defendant_analysis`), co-defendant outcome comparison
9. Plea discount modeling (`plea_discount_curves`), plea vs trial sentence distributions

**Bulk Extraction Scripts** (all in `scripts/`):

- `bulk-judge-quote-extractor.mjs`, extracts judicial holding quotes from opinions CSV
- `bulk-sentencing-outlier-detector.mjs`, sentence length extraction + percentile computation
- `bulk-officer-reliability-aggregator.mjs`, cross-case officer credibility tracking
- `bulk-judge-prosecutor-pairing.mjs`, motion grant rates by judge-prosecutor pair
- `bulk-bench-jury-divergence.mjs`, bench vs jury outcome classification (CL opinions)
- `ingest-ussc-bench-jury.mjs`, USSC district-level plea/bench/jury sentencing divergence (FY14-24, 739K cases)
- `bulk-appeal-outcome-correlator.mjs`, appellate reversal/affirmance rates via citation-map
- `bulk-similar-case-matcher.mjs`, feature vectors + k-NN from DB data
- `bulk-co-defendant-divergence-analyzer.mjs`, co-defendant outcome comparison
- `bulk-plea-discount-modeler.mjs`, plea vs trial sentence distributions

**Tier Positioning** (additive to existing tier benefits):

- **X-Ray** ($2,497) adds: sentencing outliers, officer reliability
- **War Room** ($4,997) adds: judge-prosecutor pairing, bench/jury divergence, similar-case matching
- **Situation Room** ($9,997) adds: co-defendant divergence, plea discount modeling
- **Baseline upgrades** (all tiers): judge quotes, appeal correlations

**Standalone SKU Pages** (3 landing pages, server components):

- `/judge-report-card`, $197, instant delivery. Sentencing patterns, prosecutor pairing, bench/jury divergence, quote library.
- `/officer-background-check`, $97, instant delivery. Cross-case officer reliability, discreditation history.
- `/similar-cases-analyzer`, $297, instant delivery. k-NN case matching with outcome distribution.

All 3 are in `tiers.ts` (live mode since 2026-04-11), gated by `AvailabilityChecker` (see below), and use Product + BreadcrumbList + FAQPage JSON-LD. No Edge Function needed, on-demand reads from Tier 9 tables.

**Availability Gate** (deployed 2026-04-11):

Pre-purchase data check prevents selling products we can't deliver. Each Tier 9 landing page embeds an `AvailabilityChecker` client component that queries `/api/check-availability/[slug]` before showing the checkout CTA.

Flow: Landing page → AvailabilityChecker (name + state input) → POST /api/check-availability/[slug] → coverage.ts queries Tier 9 tables (count only) → available: coverage preview + CTA (intake params in URL) / unavailable: waitlist form → data_waitlist insert + Telegram alert. Checkout passes intake in Stripe metadata → webhook detects pre-populated intake → instant generation (skips intake email).

Key files:
- `src/components/tier9/AvailabilityChecker.tsx`, client component (6 states: idle/checking/available/unavailable/waitlisted/error)
- `src/app/api/check-availability/[slug]/route.ts`, API endpoint (rate limited 10/min/IP)
- `src/lib/tier9-reports/coverage.ts`, lightweight count queries per product
- `data_waitlist` table, captures demand for uncovered entities (migration `20260411_data_waitlist.sql`)

**IB Prompt Integration** (tasks 15-16):

- `variables.ts`, 9 optional Tier 9 fields on `IBVariables` (tier-gated by caller)
- `prompts.ts`, 5 existing section builders receive `<tier9_data>` blocks when populated; new `buildTier9DataAppendix` (Appendix F) registered in `PHASE_B_BUILDERS`
- `render.ts`, `tier9DataCount`/`tier9SourceUrlCount` in report header metadata; Appendix F slot after Appendix E in section ordering

**CSV Parsing Pattern:** All opinions CSV scripts use `csv-parse` with `escape: "\\"` for CourtListener's backslash-escaped quotes. No hand-rolled parsers.

## Data Sources Priority, ALWAYS Check Bulk Before API

A hard lesson learned in April 2026: 80K CourtListener API calls were made (estimated 32 hours, rate-limit thrashing) to fetch data that was already available in local bulk CSV files. The same work took ~20 minutes from bulk. This section exists to prevent recurrence.

**Rule: Local bulk data is always the primary source. CourtListener API is fallback for data filed AFTER the last quarterly dump.**

### Bulk Files (primary, check first)

All files at `data/bulk-verify/cl-bulk/`. Regenerated quarterly (March 31, June 30, Sept 30, Dec 31).

| File | Size | Contents |
|------|------|----------|
| `opinion-clusters-2026-03-31.csv.bz2` | 2.3GB | Cluster metadata: id, case_name, case_name_full, posture, disposition, headmatter, judges, attorneys |
| `opinions-2026-03-31.csv.bz2` | 51GB | Full opinion text by cluster_id |
| `opinions-filtered.csv` | 1.1GB (8.3M rows) | Pre-filtered opinions, already decompressed, start here |
| `citation-map-2026-03-31.csv.bz2` | 499MB | Citation relationships between clusters |
| `fjc-integrated-database-2026-03-31.csv.bz2` | 267MB | Federal Judicial Center judge/court data |

External datasets at `data/bulk-verify/external-intel/`: BJS felony outcomes, USSC sentencing statistics, exoneration registry.

### JUSTFAIR, Federal Sentencing Intelligence (primary for federal courts)

Source: QSIDE Institute, 595,851 federal sentencing records (FY2001-2023). Downloaded from [osf.io/nseh5](https://osf.io/nseh5/). Local CSV at `data/external-intel/justfair/FinalDataset.csv` (1.3GB, gitignored).

| Table | Contents | Row Count |
|-------|----------|---------, |
| `judge_demographics` | Federal judge background: appointing president/party, ABA rating, law school, gender, race, active years | ~1,126 judges |
| `judge_sentencing_demographics` | Sentencing by defendant race per judge: median sentence, departure rates, sample sizes | ~4,500 rows |
| `outcome_benchmarks` | National plea/trial/dismissal rates by offense type (BJS) | ~10 rows |
| `officer_external_intel` | Agency-level fatal encounter data (Fatal Encounters dataset, 2013+) | ~2,000 rows |

**Integration points:**
- **Judge Report Card**, `queryJustfairJudge()` in `defense-intelligence/query.ts` → demographics + racial disparity sections in `render.ts`
- **Officer Background Check**, agency fatal encounters via `officer_external_intel` → agency alert section in `render.ts`
- **Intelligence Brief**, JUSTFAIR fields injected via `variables.ts` → 3 section builders in `prompts.ts`
- **Case Decoder**, sentencing context from `sentencing_distributions` + `outcome_benchmarks` injected in Edge Function
- **Availability gate**, `coverage.ts` checks `judge_demographics` for federal judge coverage

**Existing bulk scripts:**
- `bulk-master-extractor.mjs`, single-pass 8-table extractor across all bulk files (the canonical entry point)
- `enrich-from-bulk.mjs`, targeted enrichment pass for specific tables/columns

### CourtListener API (fallback only)

Use only for:
- Data filed after March 31, 2026 (not in the quarterly dump)
- Real-time lookups (e.g., verifying a single case during report generation)
- Cluster detail fields not present in the bulk CSV (rare)

Rate limit: ~5 req/sec authenticated. Token: `COURTLISTENER_TOKEN` in `.env.local`.

### Bulk CSV Gotchas (from `~/.claude/rules/cl-bulk-data-defensive.md`)

- CL CSVs quote ALL values, strip surrounding quotes before matching IDs
- Always use `relax_quotes: true`, `relax_column_count: true` in csv-parse
- Run ONE CSV streamer at a time, two concurrent streams = OOM on Windows
- Never use `| head`, `| tail`, `| grep` on background Bash commands (orphan processes, no output)
- Env var parsing: `.split("=").slice(1).join("=")`, JWT keys contain `=` characters

## Cross-Cutting Concerns

Patterns that span multiple subsystems:

- **Rate limiting.** PostgreSQL-based via `check_rate_limit()` RPC, with in-memory Map fallback. Used in: subscribe, score, partner apply, magic link routes. Conservative limits (3/min) compensate for per-isolate Maps on Vercel.
- **Session token hashing.** All auth tokens stored as SHA-256 hashes. Plaintext in cookie/URL only. Used for customer sessions, partner sessions, magic links.
- **Nonce-based CSP.** Middleware generates per-request nonce, attaches to headers. Blocks inline scripts except matching nonce. Forces dynamic rendering for all pages.
- **HTML escaping.** All user strings in email/report HTML pass through `escapeHtml()` before interpolation. Prevents XSS in transactional emails and reports.
- **Fire-and-forget logging.** Email sends, cron results, analytics events logged to DB asynchronously. Failures logged to console but never break the response.
- **Client IP extraction.** Prefers Cloudflare `cf-connecting-ip`, falls back to `x-real-ip`, then `x-forwarded-for` (first entry). Used for rate limiting and analytics.
- **SMS notifications (text.email gateway).** `sms.ts` sends SMS by emailing `{phone}@text.email` via existing Resend API. No additional env vars, uses `RESEND_API_KEY`. Gracefully degrades if send fails. All SMS bodies capped at 160 chars via `capSMS()`. All client SMS gated on consent (`canSendClientSMS`). Twilio kept as backup (10DLC pending, creds in `.env.local`).
- **Notification preferences.** JSONB `notification_prefs` column on `court_reminders` (clients) and `partners` (bondsmen). Stores only overrides; `notification-prefs.ts` merges with defaults (all email). Safety invariant: `court_reminders` channel is never "sms" alone, always "email" or "both". `dispatchNotification` pattern: check prefs → gate email/SMS → `Promise.allSettled` for parallel sends.
- **Commission holdback.** Referral commissions lock after 45 days via `lock-commissions` cron. `referrals.locked_at` tracks confirmation. Refunded orders excluded (`.gt("commission_amount", 0)`).

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
, If 0 rows returned → another request already delivered → return early
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

1. **Trigger**, Admin hits `POST /api/admin/blog-pipeline` or runs local `claude -p` task.
2. **Topic research**, `blog-generation/topic-research.ts` fetches keyword volume + SERP difficulty.
3. **Generation**, `blog-generation/generate-post.ts` calls Claude Sonnet with charge-type expertise prompts.
4. **QA pipeline**, `qa-slop.ts` (removes AI tells) → `qa-humanizer.ts` (validates tone) → `qa-upl.ts` (UPL compliance).
5. **Publish**, `blog-generation/publish.ts` writes MDX to `content/blog/[slug].mdx`.
6. **Deploy**, `git push origin master` → Vercel auto-deploy. Blog listing + sitemap auto-update.

## Life of a Score Assessment (End-to-End)

1. **Quiz**, `/score` page presents 10 questions (charge type, time since arrest, attorney type, motions, discovery, communication, strategy, history, stage, licensed profession).
2. **Submit**, `POST /api/score` validates inputs against `ALLOWED_VALUES` allowlist.
3. **Calculate**, `score.ts` starts at 50, applies weighted adjustments (motions 20%, discovery 15%, communication 15%, time 30%, attorney/strategy 10% each). Clamps to 0-100, assigns band.
4. **Aggregate**, Fire-and-forget: increments anonymous counters (total by charge, band distribution, penalty counters). No individual scores stored.
5. **Share**, `POST /api/score/share` re-calculates score server-side (prevents tampering), generates token, stores in `score_results`, returns shareable URL.
6. **Results**, `/score/results/[token]` renders score band, observations, and upgrade callouts.

## Reddit Monitor Pipeline (End-to-End)

1. **Trigger**, cron-job.org hits `GET /api/cron/reddit-monitor` every 30 minutes.
2. **Fetch**, Fetches 25 newest posts from 5 subreddits (dui, legaladvice, probation, Felons, publicdefenders) via Reddit JSON API. 24-hour age window filters stale posts.
3. **Match**, Each post title+body matched against 10 pre-written comment templates (`content/queue/reddit/pending/01-10*.md`). Zero LLM usage.
4. **Dedup**, Checks `reddit_response_queue` table by `reddit_thread_id`. Skips duplicates.
5. **Store**, Inserts matched draft into `reddit_response_queue` with template ID, blog URL, and customized response text.
6. **Notify**, Sends 2-message Telegram notification: (1) thread link with subreddit + template label + detected state, (2) copy-paste reply draft with embedded blog URL.

> Naming note: "Reddit Monitor" above is the OUTBOUND auto-comment matcher only. Reddit signal *ingestion* (pain points, charge types, demand scoring) lives in the Demand Intel chain below — completely separate code path.

## Demand Intel → Blog Generation (End-to-End)

The data-driven content engine. Pulls pain points and questions from community sources, scores demand, surfaces content gaps, generates blog posts, and tracks outbound community-answer attribution. Two inbound channels (Reddit LIVE, Quora PARTIAL — see "Quora half" note below); shared outbound chain.

### Inbound: signal harvesting

**Reddit signals (LIVE):**
1. **Trigger**, cron-job.org hits `GET /api/cron/demand-fetch` (5-min stale lock; `maxDuration` 300s per `src/app/CONTEXT.md`).
2. **Fetch + classify**, `src/lib/demand/fetch-signals.ts` pulls 25 newest posts from configured subreddits (1.5s delay, `time=week`). `classify-signal.ts` keyword-classifies: `charge_type_slugs[]`, `pain_point_slugs[]`, `urgency_score`, `emotional_tone`, `geographic_mentions[]`, `price_sensitivity`. Optional LLM upgrade via `demand-classify` cron + `classify-llm.ts`.
3. **Store**, Upserts to `demand_signals` (raw posts) + auto-discovers new subreddits to `discovered_subreddits` (operator-promoted).

**Quora abandoned-questions (PARTIAL — scraper LIVE manually, cron BLOCKED):**
1. **Scraper** lives at `C:\Users\email\projects\ImNotAnAttorney\packages\funnel\scripts\discover-quora.mjs` (cross-repo — parent monorepo, NOT this repo's `scripts/`). Playwright-extra + StealthPlugin + cookie-imported profile. Searches charge-type queries, scans each result for defer-to-lawyer patterns (`defer-patterns.md`), inserts rows where `defer_ratio >= 0.5` (= "abandoned by lawyers") into `abandoned_questions`.
2. **Cron route** `src/app/api/cron/quora-discovery/route.ts` is **scaffold only** — returns 503 with runbook. Vercel edge cannot spawn headed Playwright. Decision pending: Fly.io machine (preferred — `inaa-gha-runner` already exists), GitHub Actions with `.quora-cookies.json` artifact, or Quora API (waitlist). Account warmup-blocked until 2026-05-04 per `decision-quora-account-switched-imnotanattorney.md` memory.
3. **Quora half is NOT WIRED to `content_gaps` yet.** `abandoned_questions` rows sit in their own table; the bridge that promotes high-defer-ratio questions into `content_gaps` so blog-generation picks them up is not built. This is the highest-leverage missing wire — every harvested Quora question becomes blog fuel + tweet thread + Mercer short + Quora answer once shipped.

### Aggregate + score

4. **Score**, `GET /api/cron/demand-score` (3-min stale lock; 120s) → `demand/score-demand.ts` aggregates `(dimension_slug, window_label)` rollups into `demand_scores`. `track-performance.ts` stores trend per dimension.
5. **Surface gaps**, `content_gaps` rows opened by score-demand when `demand_score + content_gap_score` exceeds threshold and no published post covers the dimension. Status lifecycle: `open → drafting → published | rejected`. Partial unique index `WHERE status='open'` (migration `20260419a_content_gaps_open_partial_unique.sql`) enforces one open gap per dimension.
6. **Emerging topics**, `emerging_topics` flags net-new pain-point clusters (>14d freshness gate per demand-intel-feed plan). Feeds `DEMAND-FEED.md` regenerated by `scripts/demand-intel-query.mjs`.

### Generate → publish

7. **Queue**, `GET /api/cron/blog-generate-queue` picks highest-scored open gaps + enqueues `blog_pipeline_jobs` rows.
8. **Generate**, `GET /api/cron/blog-generate` calls `scripts/lib/blog-gen/claude-client.mjs` (stdin pipe, no API key — uses CLI subscription auth, $0 marginal). Runs `humanizer.mjs` 14-detector check (compositeScore < 45 for blog-length).
9. **QA + publish**, `GET /api/cron/blog-qa` (UPL + slop + DNA gates) → `GET /api/cron/blog-publish` → MDX written to `content/blog/[slug].mdx` + GitHub commit + IndexNow ping.

### Outbound: community answer + attribution

10. **Quora answer queue** lives at `content/queue/quora/pending/01..35-*.md` (35 answers ready to post; account warmup-blocked until 2026-05-04).
11. **Click tracking**, `posted_answers` table + `src/app/r/q/[id]/route.ts` redirect (LIVE per `project-click-tracking-infra-live.md` memory). Multi-platform tracker `platform_posts` (migration `20260424c`) covers Quora + future TikTok/Twitter/Facebook/Instagram/YouTube via parallel auto-posters (`blog-pipeline/scripts/{youtube,twitter-x,instagram,facebook,tiktok}-auto.mjs`).
12. **Loop closure**, posted answer → click on `/r/q/[id]` → blog post (the same one generated from the harvested pain point) → checkout. The pain point that started in Reddit/Quora ends in revenue, with attribution captured at every hop.

### Admin surface

`/admin/demand` page + `/api/admin/demand/{scores,gaps,emerging,subreddits,performance}` routes. `/api/admin/blog-pipeline` + `/api/admin/blog-pipeline/[id]` for job management.

### Cross-repo gotcha (CRITICAL — read before auditing)

Quora discovery scraper is in the **parent monorepo** (`C:\Users\email\projects\ImNotAnAttorney\packages\funnel\scripts\discover-quora.mjs`), not this repo's `scripts/`. Same for `defer-patterns.md` and `.quora-cookies.json`. This repo's `scripts/` only has the migration appliers (`apply-migration-20260418a.mjs` for `abandoned_questions`, `apply-migration-20260419d/e/20260420a/b.mjs` for `posted_answers`). When auditing the demand-intel chain, **always grep both repos**, not just this one. See Gotcha #15.

## Feature Flags, Priority B Workers

7 feature flags registered via migration `20260411e` (all enabled as of 2026-04-11). Runtime-toggleable via `feature_flags` table and `isFeatureEnabled()` in `src/lib/feature-flags.ts` (5-minute TTL cache, tier-scoped).

| Flag Key | Worker |
|----------|------, |
| `plea_deal_analyzer` | B1: Plea deal analysis |
| `ach_matrix` | B2: Analysis of Competing Hypotheses matrix |
| `adversarial_prosecution_sim` | B3: Multi-round prosecution simulation |
| `sentencing_intelligence` | B4: Quantitative sentencing intelligence |
| `daubert_challenge` | B5: Expert witness Daubert challenge |
| `body_camera_analysis` | B6: Body camera/media analysis |
| `cross_case_aggregator` | B7: Cross-case intelligence aggregator |

## Gotchas

1. **Dual-mode Stripe requires BOTH keys.** When any tier has `live: true`, `STRIPE_SECRET_KEY_LIVE` and `STRIPE_WEBHOOK_SECRET_LIVE` must be set. Not validated at startup, only at first live payment.

2. **CSP nonce disables static optimization.** Root layout reads `headers()` for nonce → all pages render dynamically. ISR `revalidate` controls data freshness, not page caching.

3. **Edge Function 150s timeout vs Opus latency.** Opus report generation can take 250-294s. Backup worker (`scripts/generate-worker.mjs`) picks up timed-out cases within 5 minutes.

4. **Cron stale lock recovery at 5 minutes.** Crashed cron jobs leave locks in `running` state. Auto-recovered after 5 min. Jobs genuinely > 5 min get double-executed.

5. **PHYSICAL_ADDRESS duplicated in two places.** `site.ts` and `supabase/functions/generate-report/`. Deno Edge Functions can't import Next.js modules. Update both when address changes.

6. **Rate limiter is per-Vercel-isolate.** Effective limit = `max_requests × warm_instances`. Conservative value (3/min) compensates.

7. **Advisory locks don't work on Supabase.** Connection pooler shares sessions. Replaced with `cron_executions` table locking (migration 028).

8. **md2html placeholder-table protection (2026-04-23).** Renderers that emit raw `<table>...</table>` HTML are automatically placeholder-protected inside `md2html` before the `<tr>`-sequence wrapper runs. Applies to BOTH the CD renderer (`renderReportHtml` in `generate-report/index.ts`) and the IB inline renderer. Touching the `@@PRESERVED_TABLE_<n>@@` sentinel token breaks round-trip. `renderDefenseMatrix` relies on this behavior.

9. **md2html unescaped-pipe split.** Table row split uses negative lookbehind `(?<!\\)\|`, and cells un-escape `\|` → `|` post-split. Renderers with literal pipes inside cell values (case names, titles) must emit `\\|`.

10. **formatOrdinal cross-runtime duplication.** Deno and Node copies exist in `supabase/functions/generate-report/index.ts:formatOrdinal` and `src/lib/derivations/constants.ts:formatOrdinal`. Parity locked by `src/lib/derivations/__tests__/format-ordinal-parity.test.ts` (regex-extracts Deno copy, `new Function` re-binds, asserts identical output on 0..200).

11. **Rising-precedent alert cadence semantics.** Cron inserts `rising_precedent_alerts_log` row BEFORE Resend send. If the insert fails, no send. If the send fails after insert, the cadence guard prevents retry within the WR 7-day / SR 3-day window — no pending/sent state machine. Retry-on-failure is operator manual. `order_id` FK has `ON DELETE SET NULL` so audit rows survive order purge.

12. **USSC federal-gate must check `intake.jurisdiction_level === 'federal'`.** Every state has federal districts, so gating on "state has a USSC district" renders federal-only data in state-charge IB reports. C4 fix 2026-04-22.

13. **charge_type_top_authorities ILIKE prefix pitfall.** Charge slug `"theft"` ILIKE-prefix-matches `"theft-*"` as well as anything starting with "theft" — over-match risk. Round-1 fix uses explicit slug-equality where possible; ILIKE only when slug has fuzzy-match intent documented.

14. **Supabase migration 20260423d_ prefix collision.** Two different migrations share the `20260423d_` prefix (`tier_ladder_deferred_closures.sql` + `judge_fingerprint_safety_r2.sql`). Both applied to prod. When adding new migrations, NEVER collapse to the shared prefix — always keep a distinct suffix after the `_` so file names don't collide on case-insensitive filesystems.

15. **Demand-intel pipeline spans two repos.** Quora discovery scraper (`discover-quora.mjs`), defer-pattern doc, and `.quora-cookies.json` live in the parent monorepo (`C:\Users\email\projects\ImNotAnAttorney\packages\funnel\`), not this repo's `scripts/`. Reddit signal fetcher (`fetch-signals.ts`) and all cron routes (`/api/cron/{demand-fetch,demand-score,quora-discovery,blog-generate-queue,blog-generate,blog-qa,blog-publish}`) live in this repo. Tables (`demand_signals`, `demand_scores`, `content_gaps`, `emerging_topics`, `discovered_subreddits`, `abandoned_questions`, `posted_answers`, `platform_posts`) are shared via the same Supabase project. Single-repo grep WILL miss half the pipeline. Always grep both `ImNotAnAttorney-web/` AND `ImNotAnAttorney/packages/funnel/` when auditing demand-intel or content-generation flows. Source incident: 2026-05-01 audit missed the Quora half because grep was scoped to this repo.

## Key Decisions

| Decision | Chosen | Why | Status |
|----------|------, |---, |------, |
| Configurable playbook pages | 1 `PlaybookSalesPage` component + 8 `PlaybookConfig` objects | Copy changes don't touch component code; new playbooks = new config | accepted |
| Dual-mode Stripe | `TIER_CORE[slug].live` flag per tier | Launch DUI first, keep others in test mode safely | accepted |
| Magic link auth | No passwords; token in cookie | Criminal defendants won't remember passwords under stress | accepted |
| Crisis buyer psychology | 7-day convert window, urgency + guarantee | Defendant researches right after arrest, not 6 weeks later | accepted |
| Claude AI for reports | Opus (Case Decoder, extended thinking) + Sonnet (IB sections) | Opus needed for case-level reasoning; Sonnet sufficient for structured sections | accepted |
| Orchestrated cron | 22 drip tasks + 4 blog pipeline crons + reddit-monitor via cron-job.org | Isolated error handling per task; no GitHub Actions cron | accepted |
| UPL compliance gate | Every generated report evaluated before delivery | Non-negotiable legal risk mitigation | accepted |
| Three-repo ecosystem | web + engine + business-docs as separate repos | Engine scales independently; business docs stay out of git deploy | accepted |
| Tier 9 availability gate | Pre-purchase data check + waitlist for uncovered entities | Never sell products we can't deliver; capture demand signal for data gaps | accepted |
| Plaintext token 30-min window | `standalone_intake_token` + `standalone_report_token_plaintext` + `plaintext_tokens_expires_at` on `orders`; hourly `/api/cron/scrub-plaintext-tokens` NULLs expired rows | In-page download/intake CTA on success page without forcing customer to switch to email; bounded DB exposure (≤30 min in-flight orders) per immediate-download v2 plan at `docs/plans/2026-04-27-immediate-download-v2.md` | accepted |

## External Dependencies

| Dependency | Purpose | Failure Mode |
|------------|---------|-------------|
| Stripe | Checkout + webhooks + refunds | No purchases; orders in test mode unaffected |
| Supabase | PostgreSQL + Edge Functions + auth | Site up; no case processing or logins |
| Resend | Transactional + drip email | No delivery notifications; drip pauses |
| Claude API | Case Decoder + IB report generation | Reports queue but don't generate |
| cron-job.org | 22 drip tasks + 4 blog pipeline + reddit-monitor + demand crons + hourly `scrub-plaintext-tokens` | Drip stops; operator alerts stop; blog pipeline pauses; reddit monitoring stops; expired plaintext tokens linger past 30-min TTL until `node scripts/scrub-plaintext-tokens.mjs` runs |
| Vercel | Hosting + Edge runtime | Site down |
| Cloudflare | DNS routing | Site unreachable |
| ImNotAnAttorney-engine | Discovery tier job processing ($2,497+) | Discovery cases stuck at `pending` |

## Boundaries

### Allowed
- Read `ImNotAnAttorney/` (business docs, templates, seed data, evaluation criteria)
- Read `ImNotAnAttorney-engine/` when debugging discovery-tier case processing
- Shared skills at `~/.claude/skills/`

### Forbidden
- NEVER give legal advice, always disclaim "information, not legal advice" (UPL compliance)
- NEVER skip the UPL evaluation gate before delivery
- NEVER use `vercel deploy` CLI, deploys via `git push origin master` only
- NEVER run `vercel env pull`, overwrites `.env.local`
- NEVER touch Cloudflare/domain settings, already configured
- NEVER read TasteDrop, Cloud Culture, video-factory, or marketing-hq repos

## Environment Variables

All vars verified present in `src/` via `process.env.*` grep. Common trap: the cron bearer token is `CRON_AUTH_TOKEN`, NOT `CRON_SECRET` (middleware.ts:80, guards.ts:74, all cron routes).

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All API routes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes | Full DB access (bypasses RLS) |
| `STRIPE_SECRET_KEY` | checkout, webhook (test mode) | Stripe API access (test) |
| `STRIPE_SECRET_KEY_LIVE` | checkout, webhook (live mode) | Stripe API access (live), required when any tier has `live: true` |
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
| `CRON_AUTH_TOKEN` | middleware, auth/guards, all cron routes | Bearer auth for cron requests (NOT `CRON_SECRET`, common confusion) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI, scripts | Edge function + migration deployment (from `../ImNotAnAttorney/.env.local`) |
| `CRONJOB_API_KEY` | scripts/setup-cronjob-org.js | cron-job.org job registration |
| `INDEXNOW_KEY` | blog-generation/publish, /api/indexnow | IndexNow search engine ping |
| `GITHUB_TOKEN` | blog-generation/publish | Git commit of generated blog posts |
| `TWILIO_ACCOUNT_SID` | sms.ts (backup) | Twilio SID, backup provider, 10DLC pending |
| `TWILIO_AUTH_TOKEN` | sms.ts (backup) | Twilio auth, backup provider |
| `TWILIO_FROM_NUMBER` | sms.ts (backup) | Twilio sender phone (+16204624622) |
| `NEXT_PUBLIC_GA_ID` | CookieConsent | Google Analytics ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | CookieConsent | Meta (FB) pixel ID |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | CookieConsent | Google Ads ID |
| `INTERNAL_QA_EMAIL` | checkout, qa-checkout, stripe webhook | Email allowlist for free QA checkout |
| `INTERNAL_QA_COUPON_ID` | checkout | 100%-off Stripe coupon ID for QA |
| `ENGINE_DISPATCH_PAT` | cron/generate-backup | GitHub PAT to dispatch engine workflow |
| `VERCEL_TOKEN` | scripts, CLI | Vercel API/CLI auth |

## Shared analytical layer (cross-project)

`public.ussc_codebook_meta` and `public.ussc_matview_meta` are SHARED tables in
the public schema. They're consumed by both INAA's USSC similar-cases stack
and a sister analytical product on the same Supabase project. Do not add
tenant-prefixes to these tables; do not write tenant-prefixed CHECK
constraints. The freshness audit log (`ussc_matview_meta`) currently records
refreshes from the sister project's matview (`ussc_similar_cases`) and will
also record INAA's matview (`ussc_similar_cases_summary`) once Phase 1 of
the shared-USSC plan ships.

INAA's freshness gate reads the latest row across all matview refreshes;
30-day floor matches the sister project's published commitment. Source plan:
`C:\Users\email\projects\bench-recon-web\docs\plans\2026-04-30-shared-ussc-data-layer-cross-project.md`

### Deferred: per-matview refresh RPC for INAA's summary matview

`refresh_ussc_similar_cases_with_lock` (sister project's RPC, READ-ONLY
reference at sister-repo `supabase/migrations/20260430c` — refreshes one
specific matview) will get an INAA equivalent
(`refresh_ussc_similar_cases_summary_with_lock`) when
`ussc_similar_cases_summary` lands in Phase 1 of the shared-USSC plan.
Per plan §Decision 4, parameterization into a single multi-matview RPC
is deferred to Phase 4. Tracking:
`C:\Users\email\projects\bench-recon-web\docs\plans\2026-04-30-shared-ussc-data-layer-cross-project.md` (Phases 1, 4).

## Deployment

- **Trigger:** `git push origin master` → GitHub integration → Vercel auto-deploy
- **Team ID:** `team_UEzHXQJJI46GEPEYeFspl1Pq`
- **Production project:** `imnotanattorney` (prj_zqxNgG9xcM235bnKRoEgP5kBOEEr), this serves `imnotanattorney.com`
- **DO NOT USE:** `imnotanattorney-web` (prj_fgx7OUbudHbS2WrfoaLKb07jJAnB), duplicate project, unlinked from GitHub Apr 4 2026
- **Edge Functions:** Deploy separately via Supabase CLI (`supabase functions deploy`)
- **Env vars:** `vercel env add VAR_NAME production,token $VERCEL_TOKEN` (CLI targets correct project via `.vercel/project.json`)

### Deploy Guardrails

Historical rules, violating any of these has broken production before. Rules 2/6/7 from the original 7 are already covered in Forbidden and Deployment above.

- **NEVER deploy to `tastedrops-projects`**, that is TasteDrop's account, completely separate business.
- **NEVER run `vercel env pull`**, it overwrites `.env.local` with only the vars in Vercel (drops any local-only vars).
- **NEVER delete `.vercel/` directory**, it links the CLI to the correct project (`imnotanattorney`, not `imnotanattorney-web`).
- **NEVER touch domain settings**, `imnotanattorney.com` is routed via Cloudflare A records, already configured.
- **Verify account before any Vercel CLI operation:** `npx vercel whoami` must show `rahim0kapadia-1967`.

## Maintenance Rules

- **On component add/remove:** Update Component Map above
- **On subsystem change:** Update that subsystem's CONTEXT.md, not this file
- **On new external dependency:** Update External Dependencies
- **On architecture decision:** Add row to Key Decisions (never modify, supersede)
- **On boundary change:** Update Boundaries section
- **On invariant change:** Update Architectural Invariants (major event, requires review)
- **On new cross-cutting pattern:** Update Cross-Cutting Concerns
- **New gotcha discovered:** Add to Gotchas (most impactful first)
- **Deep detail needed:** DB schema → `supabase/SCHEMA.md`; case status state machine → `supabase/CONTEXT.md`; email sequences → `src/lib/CONTEXT.md`; env vars → this file
- **On any code change:** `node docs/verify-architecture.js` (automated via CI on pull requests)
- **Verification script:** `docs/verify-architecture.js`, auto-generated, do not edit manually

## Cross-Corpus Query Pattern (2026-05-04)

INAA + BenchRecon share a single Postgres database. Substrate (loaded corpora: CourtListener, USSC, FJC, FARS, NYPD/CPD, NRE exonerations, etc.) lives in `public.*` tables. Aggregations for hot product paths live in `mv_*` materialized views with unique indexes (CONCURRENT refresh).

**Layer separation:**
- **Substrate:** raw + canonicalized + classified rows. ~210 GB across 109 populated tables.
- **Matviews:** pre-aggregated joins for product paths. Refreshed weekly. Sample-size floors per FLP norm.
- **Per-product query modules:** `src/lib/cross-corpus/*.ts` with paired tests. Each query returns a typed result object.
- **Renderers:** `src/lib/<product>-sections/*-section.ts` consume queries and emit markdown bound by UPL guards (banned-phrase scan).

Refresh: weekly via `/api/cron/refresh-cross-corpus-matviews` (Mon 14:00 UTC, cron-job.org jobId 7561803). Cited expert: Lukas Fittl (matview + concurrent-refresh + work_mem-per-session pattern).

**Provenance:** every derived row carries provenance metadata — `entity_extractor_version` on `classified_opinions` extraction columns, `provenance_source + provenance_record_id` on `entities_officers`. Source attribution is auditable end-to-end.

**The DB IS the moat.** Same substrate, different queries, different products. INAA's lens: defendant-facing UPL-cautious. BR's lens: attorney-facing strategic.
- **Last full verification:** 2026-04-14
