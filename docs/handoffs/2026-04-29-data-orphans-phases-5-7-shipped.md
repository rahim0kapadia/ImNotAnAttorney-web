# Handoff: data-orphans Phases 5-7 shipped

Date: 2026-04-29 23:55 UTC

## Task

Execute Phase 5 → 6 → 7 of plan
`C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps.md`
on monorepo `apps/web` (Strangler Fig retarget — `-web` is read-only-for-deploys
since the 2026-04-28 cutover; new code goes only to `apps/web`).

Path-2 scope: T0 / T0.5 / T0.7 / T1 / T2 / T12. T3-T11 deferred to follow-up
worry `worry-data-orphans-tier-b-c`.

## Approach

- Worktree off `origin/master` of `ImNotAnAttorney` monorepo per
  `pattern-worktree-per-pr-from-master`. Branch `feat/data-orphans-product-gaps`
  rooted at `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans`.
- Single commit (`50c3affe`) bundling all 6 tasks + R2 swarm fixes — clean
  series for review, no fix-up amends.
- 3-reviewer parallel swarm (code-reviewer + security-auditor + april-dunford)
  on the diff after Phase 5 ship; all CRIT/WARN/SUGG findings absorbed inline
  per Pristine-or-nothing.

## Files Modified

All paths under `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans\apps\web\`:

- `.gitignore` — added `data/audit/`
- `package.json` — added `test:audit-orphans` script
- `scripts/diag-data-orphans-schema.mjs` — NEW (T0)
- `scripts/audit-data-product-wiring.mjs` — NEW (T12)
- `src/lib/util/escape-postgrest-filter.ts` + `__tests__/` — NEW (T0.5)
- `src/lib/tier/require-tier.ts` + `__tests__/` — NEW (T0.7)
- `src/lib/tiers.ts` — exported `SERVICE_UPGRADE_PATH`
- `src/lib/war-room/pairing-matrix.ts` — NEW (T1 query + matrix builder)
- `src/lib/war-room/render-pairing-matrix.tsx` — NEW (T1 render)
- `src/lib/war-room/weekly-digest.ts` — NEW (T1 digest body builder)
- `src/lib/officers/single-officer-query.ts` — NEW (T2 shared query path)
- `src/lib/xray-sections/officer-cross-case.ts` — NEW (T2)
- `src/lib/xray-sections/render-officer-cross-case.ts` — NEW (T2)
- `src/lib/xray-sections/__tests__/officer-cross-case.test.ts` — NEW (T2 shape tests)
- `src/app/api/cron/war-room-weekly-digest/route.ts` — NEW (T1 cron)
- `src/app/my-case/[token]/page.tsx` — wired pairing matrix section + tier
  gate; UPL fix on Motion Recommendations card; WR-specific "What to Do Next"
- `src/middleware.ts` — added `/my-case/:path*` to matcher (CSP-nonce only;
  no auth/rate-limit added — comment explicit)

R2 swarm fixes absorbed inline (highlights):
- code-reviewer CRIT/W: page-size saturation alarm, snapshot fail-closed,
  per-send 30s timeout, cell-key `\x1f` separator collision fix, drop
  redundant `cases` roundtrip (intake_id added to caseSelect), conditional
  jurisdiction filter, tightened audit `.from("<table>")` matcher,
  table-name allowlist on diag, dropped unused customerEmail param
- security-auditor: HTTPS-only filter on rendered source URLs, middleware
  matcher comment clarifies no auth, digest hard-blocks when no temporal
  column, adversarial officer-name fixture in escape test
- april-dunford: distinct amber-accent matrix section, X-Ray single-officer
  copy names the capability, callouts locked to informational, ongoing-
  operation framing in WR portal

## What Didn't Work

- **Edit tool failed on template-literal strings** — `${...}` patterns matched
  by Read/Grep but not by Edit. Worked around by rewriting whole files via
  Write. Likely encoding/line-ending sensitivity in Edit's literal matcher.
- **Initial test mock counter** — per-builder `pulledIdx = 0` reset each
  `from()` call. Fixed with module-scope `callCounters` Map.
- **Audit script CI guard self-trigger** — own `// queryOfficerBackground`
  comment hits the SC-3c grep guard. Rephrased comments to avoid the literal.
- **`SERVICE_UPGRADE_PATH` not exported** — plan claimed verified, but it
  was `const` not `export const`. Added `export` in `tiers.ts`.
- **pnpm install required in worktree** — fresh worktree has no
  `node_modules`; `pnpm install --frozen-lockfile` at monorepo root.
- **`.env.local` missing in worktree** — copied from main `apps/web/` for
  build verification.

## Remaining Steps

1. **Push branch + open PR** (visible-action; user-confirmed):
   ```
   cd C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans
   git push -u origin feat/data-orphans-product-gaps
   gh pr create --title "feat(data-orphans): War Room pairing matrix + X-Ray officer cross-case" --body "..."
   ```
2. **Cron registration** — register `/api/cron/war-room-weekly-digest` on
   cron-job.org (Mon 13:00 UTC, `0 13 * * 1`) once env vars set:
   - `RESEND_FROM_EMAIL_UPDATES` (must be set; route fails closed if unset)
   - `CRON_AUTH_TOKEN` (existing)
3. **Engine-side wiring** (Out of Scope §1) — `ImNotAnAttorney-engine`
   integration of pairing matrix into the discovery-tier report builder.
4. **Marketing copy update** (Out of Scope §11) — refresh `product-tiers.md`
   War Room blurb to name the defendant-portal pairing matrix.
5. **Follow-up worry `worry-data-orphans-tier-b-c`** — T3-T11 (judge_conflict
   _of_interest, judge_demographic_sentencing routing to War Room, classified_
   opinions deep slice, case_law_references feature flag, etc.)
6. **Order→case linkage** — known limitation in cron route (mirrors existing
   warroom-monthly-precedent-delta precedent). Track in
   `docs/plans/<future>-orders-case-link.md`.
7. **`/my-case/*` rate limiting** — middleware matcher entry exists but no
   rate-limit code wired. Track in `docs/plans/<future>-my-case-rate-limit.md`.

## Verification

Run from `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans\apps\web\`:

- `npm run build` — exits 0 (Next 16 + Turbopack).
- `npx vitest run src/lib/util/__tests__/escape-postgrest-filter.test.ts src/lib/tier/__tests__/require-tier.test.ts src/lib/xray-sections/__tests__/officer-cross-case.test.ts` — 22 tests pass.
- `node scripts/audit-data-product-wiring.mjs --check-promises` — exits 0;
  reports table reads + SC-3c clean.
- `node scripts/diag-data-orphans-schema.mjs` — writes
  `data/audit/data-orphans-schema-2026-04-29.json` with all three tables;
  confirms `judge_prosecutor_pairings` HAS temporal column.

Pre-existing 46 `npm test` failures are stub `node:test` files in
`scripts/ingest/__tests__/scrape-*-discipline.test.mjs` and `seed-statutes-*`
that vitest can't pick up. Out of scope (different runner).

## Known Quirks

- Rate-limit middleware matcher entry for `/my-case/:path*` is CSP-only — page
  auth is inside `page.tsx` via `report_token_hash`. Comment in middleware
  makes this explicit so future audits don't false-positive.
- The cron route's case-resolution by `email + paid_at` window matches
  existing project precedent (`warroom-monthly-precedent-delta`). A customer
  with multiple WR purchases could theoretically attach to the wrong case;
  in-line comment + tracked follow-up.
