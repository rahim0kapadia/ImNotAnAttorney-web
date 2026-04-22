# Partner Portal Pristine — Phase 3: Hardening

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`

**Parent design:** `docs/plans/2026-04-21-partner-portal-pristine-design.md`

**Base:** `chore/partner-e2e-coverage` (Phase 2) — inherits canonical links, twitter:card fix, products.ts conflict resolution, and E2E coverage map. Phase 3 PR depends on Phase 2 merging first (or rebase if master shifts).

**Goal:** Ship the hardening items that are both valuable and completable without live-prod write access. Narrows the original design doc's audit list to what's achievable in this session; the rest is documented as follow-up.

## Scope — what we're shipping vs. deferring

| Item | Phase 3 action |
|---|---|
| RLS audit (full, every partner table, policy review, doc to SCHEMA.md) | **Defer** — needs Supabase project admin access for a proper audit; out of scope |
| zod schemas for all 8 `/api/partner/*` routes | **Narrow** — ship schemas for 3 top-risk routes (add-client, magic-link, settings) that accept rich user input. Others follow-up. |
| Auth-boundary audit test | **Ship** — structural source-text test asserting every route validates session at top + doesn't accept `partner_id` from body/query |
| Rate-limit audit | **Narrow** — inventory current limits in ARCHITECTURE.md; flag gaps as follow-up rather than fixing in this PR |
| Observability (Sentry + Telegram alerts) | **Defer** — needs external config access |
| Perf (cold-start, N+1 hunting) | **Defer** — needs production profiling, not a pure code change |
| Dead code grep | **Ship** — mechanical, low-risk |
| Env-var audit | **Ship (document only)** — list every env var the partner system reads, flag any missing from Vercel prod as follow-up |
| CSP `img-src` audit for partner logos | **Ship** — static review + doc |
| CV probe INNA-H12 (partner-preview-integrity) | **Narrow** — write the probe script in this repo; wiring it into `~/projects/continuous-verification/verify.mjs` is the user's follow-up |
| ?preview=1 sentinel on /r/[code]/* | **Ship** — feature add, moderate scope |

## Tasks

### Task 1: Plan commit ✅ (this doc)

### Task 2: zod schemas for 3 top-risk partner routes
**Files:** `src/lib/partner-schemas.ts` (new), `src/lib/__tests__/partner-schemas.test.ts` (new), 3 route handlers modified.

Routes in scope:
1. `POST /api/partner/add-client` — bondsman submits defendant data (name, phone, email, court date, charge type, county/state)
2. `POST /api/partner/magic-link` — email lookup + sends magic link
3. `POST /api/partner/settings` — partner updates payment/notification prefs

Each schema:
- Strict (no `.passthrough()` — extra fields rejected)
- Length caps on strings (names, emails, phones)
- Enum for known values (charge_type, payment_method)
- PII fields trimmed + normalized

Wire: at route entry, `const body = await req.json(); const parsed = SCHEMA.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "..." }, { status: 400 });`.

Tests: unit-test each schema with valid + invalid inputs. Cover boundary conditions.

### Task 3: Auth-boundary structural audit test
**Files:** `tests/auth/partner-api-boundary.test.ts` (new).

Read source text for every file in `src/app/api/partner/**/route.ts`. Assert:
- Each file imports and calls `requirePartnerAuth` OR `validatePartnerSession`.
- Auth check appears BEFORE any business logic (heuristic: first function-local statement in `GET`/`POST`/`PUT`/`DELETE` export is the auth check).
- NO file contains `req.json()` destructuring that pulls `partner_id` or `partnerId` from the body (regex guard).
- NO file reads `partner_id` from `req.nextUrl.searchParams`.

### Task 4: Rate-limit inventory (document in ARCHITECTURE.md)
**Files:** `ARCHITECTURE.md` (edit).

Read every `/api/partner/*` route, find calls to `rateLimit` helper (or absence). Produce a table in ARCHITECTURE.md:

| Route | Current limit | Scope key | Gap? |
|---|---|---|---|
| ... | ... | ... | ... |

Don't fix gaps in this PR — each gap becomes a follow-up PR. This doc table is the working list.

### Task 5: Dead code grep
**Files:** Delete as needed; or document none found.

`grep -r` for exported symbols in `src/lib/partner-*.ts` and check `src/` for consumer references. Delete anything unreferenced. Commit only if deletions found.

### Task 6: Env-var audit (document in ARCHITECTURE.md)
**Files:** `ARCHITECTURE.md` (edit).

List every `process.env.X` reference under partner system code. Cross-ref against `.env.example` if present. Document in ARCHITECTURE.md. Flag missing-in-Vercel items as follow-up (we can't verify Vercel from this session).

### Task 7: CSP img-src audit
**Files:** `src/middleware.ts` (review), `ARCHITECTURE.md` (edit, if gap).

Read `buildCsp()`; verify `img-src` allows Supabase Storage (`*.supabase.co`) and partner-scraped domains. Document the current state + any hardening opportunity.

### Task 8: CV probe INNA-H12 partner-preview-integrity (local script only)
**Files:** `scripts/verify-partner-preview-integrity.mjs` (new), `scripts/CONTEXT.md` (edit).

Fetch `/r/[CODE]/opengraph-image` for the top-3 active partner codes. Assert 200 + PNG + ≥10KB. Exit 0 on all pass; non-zero on any fail. User wires into `~/projects/continuous-verification/verify.mjs` separately.

Query "top-3 active partners": `SELECT promo_code FROM partners WHERE status='approved' ORDER BY total_referrals DESC LIMIT 3;`

### Task 9: ?preview=1 sentinel on /r/[code]/*
**Files:** `src/app/r/[code]/page.tsx` (edit), `src/app/r/[code]/[product]/page.tsx` (edit), `src/app/checkin/[code]/page.tsx` (edit), `src/components/PreviewBanner.tsx` (new), `src/components/shells/PartnerBrandedShell.tsx` (edit to accept a preview-mode prop), `src/app/partner/dashboard/page.tsx` (edit to add "Preview my link" affordance), tests.

When `?preview=1` is present on a partner route:
- Skip the `after()` telemetry event (no `partner_events` row inserted).
- Skip referral cookie set in middleware.
- Render a `<PreviewBanner>` at the top of the page: "You're previewing what defendants see. Attribution is paused on this view."

The partner can share the preview URL with teammates or verify the page without polluting analytics.

Tests: unit-test the skip-telemetry behavior + banner render gate.

### Task 10: Push + PR

Standard push. PR body should note Phase 3 depends on Phase 2 merging first.

## Exit criteria

- [ ] `npx tsc --noEmit --skipLibCheck` — clean
- [ ] `npx vitest run` — green (existing + new schema tests + auth-boundary test + preview-sentinel tests)
- [ ] zod schemas cover add-client, magic-link, settings
- [ ] Auth-boundary test passes (proves all 8+ partner API routes gated)
- [ ] Rate-limit inventory + env-var inventory committed to ARCHITECTURE.md
- [ ] CV probe script exists in repo, runnable via `node scripts/verify-partner-preview-integrity.mjs`
- [ ] ?preview=1 behavior works (render test) and skips attribution

Phase 3 PR waits on Phase 2 merge. Phase 4 (copy/UX polish) branches from Phase 3 tip.
