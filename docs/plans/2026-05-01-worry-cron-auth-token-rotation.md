# Worry: CRON_AUTH_TOKEN rotation cadence + per-route token isolation

Date: 2026-05-01
Slug: cron-auth-token-rotation
Parent worry: 2026-04-30-worry-statute-phase2.md (Out-of-Scope clause)

## Worry

Adding 3 new statute-refresh routes (NC/WA/OH per Statute Phase 2 T5) plus 1 engine-side AZ entry point increases the blast radius of a single `CRON_AUTH_TOKEN` compromise. Today the token is shared across:

- `/api/cron/statutes-refresh-fl/[chapter]` (6 sub-routes per chapter)
- `/api/cron/statutes-refresh-us`
- `/api/cron/statutes-refresh-nc` (Phase 2 T5)
- `/api/cron/statutes-refresh-wa` (Phase 2 T5)
- `/api/cron/statutes-refresh-oh` (Phase 2 T5)
- `ImNotAnAttorney-engine/workers/statutes-az.mjs` process-start auth (Phase 2 T2)
- ~30 other `/api/cron/*` routes (drip, blog-generate, partner-drip, etc.)

A leaked Bearer token gives an attacker write/replay access to all of the above. SC-14b idempotency replay defends against amplification on hash-diff routes (UPDATE WHERE text_hash != $newhash converges to 0-row update on replay), but log spam, Vercel function cost, and DB connection pressure are NOT bounded by idempotency alone.

## Existence gate

Per Phase 2 T5 Out-of-Scope clause (`2026-04-30-worry-statute-phase2.md` line ~530), this file's existence is the gate that releases T5 PR for merge. T5 reviewer rejects the PR if this file is missing — prevents the deferral becoming a silent drop.

## Expert Lens

**Primary**: OWASP Top 10 2021 → A07 Identification and Authentication Failures + A04 Insecure Design (defense-in-depth via per-route tokens).

**Secondary**: HashiCorp Vault rotation cadence guidance (90-day default for Bearer tokens with high blast radius); AWS recommended secret-rotation cadence (60-90 days for service-to-service).

## Cascade Map

- **Us (INAA)**: token compromise no longer cripples all cron paths simultaneously; rotation cadence reduces window of exposure
- **Direct counterparty (cron-job.org)**: stays the same — they store whatever token we give them per-job
- **Their downstream (Vercel routes + engine workers)**: each validates its own scoped token, attacker who compromises one job's secret can't pivot
- **Future-us**: rotation muscle established for the next batch of cron routes (Phase 3 statute coverage, monitoring, etc.)
- **Ecosystem**: pattern publishable; multi-tenant Supabase apps face the same shared-secret-blast-radius problem

## Numbered Tasks

### T1 — Per-route token migration (Vercel routes)

- Each `/api/cron/<name>/route.ts` validates its own env var: `CRON_AUTH_TOKEN_<NAME>` with fallback to `CRON_AUTH_TOKEN` (transition period).
- Update `requireCron` helper at `src/lib/auth/guards.ts` to accept a route-name parameter and check the scoped token first, falling back to global.
- After 30 days of dual-acceptance, rotate `CRON_AUTH_TOKEN` and remove the global-fallback path; only scoped tokens accepted.

### T2 — Engine-side AZ token

- `ImNotAnAttorney-engine/workers/statutes-az.mjs` validates `CRON_AUTH_TOKEN_STATUTES_AZ` at process start (NOT the global token).
- Set the env var on Fly: `fly secrets set CRON_AUTH_TOKEN_STATUTES_AZ=<random> -a inaa-engine`.

### T3 — cron-job.org per-job secret update

- For each existing job (FL chapters × 6, USC weekly, plus Phase 2 NC/WA/OH), update Authorization header to use the scoped token via cron-job.org API:
  ```
  PATCH https://api.cron-job.org/jobs/<jobId>
  Body: { headers: { Authorization: "Bearer <CRON_AUTH_TOKEN_<NAME>>" } }
  ```

### T4 — Rotation cadence

- Quarterly rotation cron (Vercel route `/api/cron/rotate-cron-tokens`) generates new tokens, updates Vercel env vars via Vercel API, updates cron-job.org headers via API.
- 30-day notice in slack/telegram before each rotation so manual processes (Fly secrets, local dev `.env.local`) can be updated.

## Out of Scope

- Migrating to OAuth2 client-credential flow (cron-job.org doesn't support it).
- Replacing cron-job.org with self-hosted scheduler (separate worry).
- Mutual TLS (overengineered for this surface).
- Token rotation for `RESEND_API_KEY`, `STRIPE_SECRET_KEY_LIVE`, etc. — out of scope; those have their own worry.

## Success Criteria (binary PASS/FAIL)

- **SC-1** — `grep -E -c "process\.env\.CRON_AUTH_TOKEN([^_A-Z]|$)" apps/web/src/app/api/cron/**/route.ts` returns 0 (no global-token usage in Vercel routes; all use scoped variants).
- **SC-2** — Each scoped token in Vercel env list (`vercel env ls --environment production`); count >= number of cron routes.
- **SC-3** — `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $CRON_AUTH_TOKEN" https://imnotanattorney.com/api/cron/<name>` returns 401 for any `<name>` (global token rejected post-T1 cutover).
- **SC-4** — `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $CRON_AUTH_TOKEN_<NAME>" https://imnotanattorney.com/api/cron/<name>` returns 200 for the matching route.
- **SC-5** — `fly ssh console -a inaa-engine -C "echo \$CRON_AUTH_TOKEN_STATUTES_AZ"` returns a non-empty string distinct from any Vercel-side token.
- **SC-6** — cron-job.org job list (`curl ... /jobs`) shows scoped Authorization headers on every job; no job uses the global token.
- **SC-7** — Rotation cron registered on cron-job.org with quarterly schedule; first scheduled run produces new tokens visible in Vercel env list.

## Relationship to Phase 2

- This worry MUST exist (file path: `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md` OR variant `2026-05-XX-worry-cron-auth-token-rotation.md`) BEFORE Phase 2 T5 PR merges.
- Phase 2 T5 ships with the global `CRON_AUTH_TOKEN` (transition acceptable per Out-of-Scope clause) — this worry handles the migration to scoped tokens as a follow-up.
- Phase 2 T2 AZ engine entry uses the global token at first ship; T2 in this worry migrates AZ to scoped.

## Trigger to start

- Phase 2 T1+T3+T4 production seeds shipped (so the new routes have data to refresh)
- Phase 2 T5 cron registration shipped (so the new routes exist on cron-job.org)
- Time delay: at least 1 week after T5 ships (lets dust settle on the global-token usage pattern before adding scoped layer)
