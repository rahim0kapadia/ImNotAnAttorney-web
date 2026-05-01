# Plan: orders → cases linkage hardening

Date: 2026-04-30
Source: docs/handoffs/2026-04-30-data-orphans-merged-cron-shipped.md Step 6
Related: PR #26 commit message KNOWN LIMITATION block. Mirrors `warroom-monthly-precedent-delta` precedent.

## Problem

War Room weekly digest cron (PR #26 T1) and X-Ray officer-cross-case (T2) match orders→cases via `(email, paid_at window)` heuristic, NOT via `orders.case_id` foreign key. Reasons inherited from `warroom-monthly-precedent-delta`:
- `orders` table predates `cases` foreign key by ~6 months of production data.
- Stripe webhook writes `orders` row before intake completion creates `cases` row.
- Backfill never ran — historical orders have NULL `case_id`.

**Risk:** Buyers with multiple cases (~2% of paid base, ~80 customers est.) receive digest tied to wrong case. Officer cross-case section can show officers from a SIBLING case, not the buyer's actual case.

## Files to Modify

- `supabase/migrations/<next>_orders_case_id_backfill.sql` — backfill `orders.case_id` from `(email, paid_at, intake_id)` triple where unambiguous.
- `src/app/api/stripe/webhook/route.ts` — verify `case_id` written on every new checkout (audit before assuming).
- `src/lib/war-room/weekly-digest.ts` — switch from email+paid_at heuristic to `orders.case_id` once backfill ≥99%.
- `src/lib/xray-sections/officer-cross-case.ts` — same.

## Files to Create

- `scripts/diag-orders-case-linkage-audit.mjs` — audit script: count NULL case_id, ambiguous (email match >1 case), unambiguous fixable.
- `scripts/backfill-orders-case-id.mjs` — idempotent backfill, dry-run first.
- `docs/audits/2026-04-30-orders-linkage-baseline.md` — baseline audit results.

## Tasks

1. Run `diag-orders-case-linkage-audit.mjs` to baseline NULL count + ambiguity buckets.
2. If <5% ambiguous: write backfill script + migration, dry-run + diff, then live.
3. If ≥5% ambiguous: design composite-key resolution (intake_id is best candidate; case_token second).
4. Switch consumers (weekly-digest, officer-cross-case) to FK once backfill ≥99% per audit re-run.
5. Add CI guard: `audit-data-product-wiring.mjs` extension that fails build if any new consumer uses `(email, paid_at)` heuristic instead of `case_id`.

## Out of Scope

- Stripe webhook idempotency rewrite — separate worry.
- `orders.user_id` linkage to auth.users — separate concern.
- Pre-2026-04 historical order purge — Rahim approval gate.

## Tracking

Fold into `worry-data-orphans-tier-b-c` or run as standalone hardening. Backfill is reversible (column was NULL); switch is reversible (toggle behind feature flag).
