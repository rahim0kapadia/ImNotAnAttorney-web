# Worry: Marker file state reconciler (deferred)

Date created: 2026-05-01
Source: schema-cleanup-vestigials R1 swarm — security-auditor `marker-rls-snapshot-drift-no-ci-check` (A05:2021).
Status: DEFERRED — separate CI/infra worry.

## Worry

`apps/web/docs/intentionally-unused-tables.md` records `RLS state (as of YYYY-MM-DD):`
as a point-in-time snapshot. If a future migration drops a service-role-only policy
(e.g., `entities_officers_service_role_only`), the marker file won't auto-update.
No CI check, pre-commit hook, or producer-side reconciler ensures the marker stays
in sync with `pg_policy`.

## Why deferred from schema-cleanup-vestigials

This is CI / cron / hook infrastructure work that cross-cuts the entire data-orphans
worry chain (any table with a marker file faces the same drift). Three approaches:

1. **CI step** parses marker → queries pg_policy via service-role → fails build on
   drift. Requires GHA workflow OR the existing self-hosted runner. Adds DB credential
   surface to CI.
2. **Pre-commit hook** runs the same check locally before commit. Adds local DB
   dependency to dev workflow.
3. **Nightly cron-job.org reconciler** hits an API route that runs the check, emails
   on drift. Same pattern as `/api/cron/security-scan` (auto-security L3 layer).

Path 3 fits existing infrastructure best. Defer to a session that owns cron + email
infrastructure work.

## Trigger to re-open

- Marker file expansion to ≥5 entries (current = 2; small surface, manual review fine
  until threshold).
- Drift incident: a session ships a migration that drops a policy in marker without
  updating the file.
- 2026-07-29 marker re-evaluation.

## Re-evaluation date

2026-07-29 (alongside skeleton tables' marker re-eval).

## Owner

ImNotAnAttorney monorepo / shared-DB hygiene + auto-security L3 cron team.

## Cascade

- Us: invariant enforcement at the producer level.
- Future-us: marker file becomes trustworthy without manual review.
- Ecosystem: reconciler pattern publishable.
- Direct counterparty (anyone reading the marker): can rely on it without re-querying DB.
- No node loses.
