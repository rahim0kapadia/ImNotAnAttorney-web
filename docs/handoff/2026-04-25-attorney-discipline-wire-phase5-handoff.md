# Phase 5 Handoff — Attorney-Discipline-Events Wiring (2026-04-25, post-v2.4)

## Where this picks up

Plan went through 4 pristine-loop rounds. v2.4 absorbs all v4 CRITs + WARNs. Phase 5 = write the actual code following the plan.

**Plan path** (read this in full first):
`C:\Users\email\projects\_worktrees\worry-attorney-discipline\docs\plans\2026-04-25-worry-attorney-discipline-wire.md`

**Worktree to work in:**
`C:\Users\email\projects\_worktrees\worry-attorney-discipline` (branch `worry/attorney-discipline-wire` off origin/master @ `725a8a8e` at fork; parent master is now `241198fd` — rebase before push).

## Pre-flight (verify before any code)

1. `cd C:\Users\email\projects\_worktrees\worry-attorney-discipline && git fetch origin && git rebase origin/master` — pull in PR #133 (NYPD CCRB), PR #148 (NJ bar), PR #149 (VA bar) if any are merged.
2. Read `ARCHITECTURE.md` (the hook will block edits otherwise).
3. Pre-execution PR-collision check (Worktree Boundary in plan):
   ```
   gh pr list --state open --json number,headRefName,files --limit 50 \
     | jq '[.[] | select(.files[].path == "supabase/functions/generate-report/index.ts") | {number, headRefName}]'
   ```
   If any PR is returned that touches `supabase/functions/generate-report/index.ts`, surface to Rahim BEFORE Phase 5 (rebase target may need to switch from master to that PR's branch).

## Implementation order (each task = its own commit)

Per plan v2.4 § "Numbered Tasks":

1. **T0a** — `supabase/migrations/20260425a_attorney_discipline_rls.sql` (RLS on both tables).
2. **T0b** — `docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md` (CA Civ. Code § 47 memo). Cite Eugene Volokh if no cached fair-report expert exists yet — run `expert-triangulation` skill first.
3. **T1.1a** — `supabase/migrations/20260425c_attorney_unaccent.sql` (extension + `immutable_unaccent` + expression index + RPC `attorney_match_by_raw_name`). Verify extension namespace post-apply (extensions vs public — see plan).
4. **T1.3** — `supabase/migrations/20260425b_attorney_discipline_test_fixtures.sql` (CLEAN fixtures only, 3 rows; NO hostile rows — Sec v3 CRIT).
5. **Apply migrations a → c → b in this order** via Supabase Management API (`POST /v1/projects/jxjbjmgdukwkoclydqdr/database/query` with the SUPABASE_ACCESS_TOKEN bearer). Migrations apply as `postgres` superuser → bypass RLS for the fixture INSERT.
6. **T1.3a** — `supabase/functions/generate-report/__tests__/fixtures.ts` (constants + escapeRegExp).
7. **T1.2** — `supabase/functions/generate-report/lib/attorney-discipline.ts` (RPC client; `getAttorneyDiscipline` + input contract). NO JS unaccent shim. Pass raw sanitized input to RPC.
8. **T2.1** — `supabase/functions/generate-report/lib/section-anchors.ts` (Deno-side anchors; grep `index.ts` for every existing `<h2 class="section-h2">` literal, pin them all).
9. **T2.1 mirror** — `src/lib/intelligence-brief/section-anchors.ts` (Node-side parity mirror).
10. **T3.2 + T3.2b** — `supabase/functions/generate-report/lib/banned-phrases.ts` (Deno-side canonical) + extraction script reading existing `src/lib/intelligence-brief/prompts.ts:34` template literal.
11. **T3.2 mirror** — `src/lib/intelligence-brief/banned-phrases.ts` (Node mirror; readFileSync + parse pattern, NOT direct import — matches `whitelist-parity.test.ts` precedent).
12. **T3.2a** — `src/lib/intelligence-brief/__tests__/banned-phrases-parity.test.ts`. Add to `vitest.config.ts` include glob explicitly.
13. **T2.2 + T2.3 + T2.3a** — `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (the renderer; `cell()` helper; `safeMdLink`; `formatShortDate`; `JURISDICTION_BAR_NAMES` map). Public symbol = `buildAttorneyDisciplineSection` (the wired one). Internal: `renderAttorneyDisciplineSection`. Tests call `buildAttorneyDisciplineSection` to mirror prod path.
14. **T2.4** — Modify `supabase/functions/generate-report/index.ts`:
    - Insert `await buildAttorneyDisciplineSection({ ... })` between the `sectionOutputs["your-plan"]` array entry and the `buildBradyGiglioChecklist()` call.
    - Heading literal: `## Your Attorney's Public Bar Record`.
    - Niche-domination one-liner (italicized): `*We check this on every IB — before you do.*`
    - Update `prompts.ts` to interpolate `BANNED_PHRASES_BLOCK` from the new module (don't break existing callers).
15. **T1.4** — `supabase/functions/generate-report/__tests__/attorney-discipline.test.ts`. Use built-in `Deno.test`, NOT std/bdd. Cover all 8 cases listed in plan T1.4.
16. **T3.1 + T3.3 + T3.4** — `supabase/functions/generate-report/__tests__/attorney-discipline-upl.test.ts` (deterministic regex panel + interpretive-adjective panel + entity-decode panel).
17. **T4.6** — `supabase/functions/__tests__/rls-attorney-discipline.test.ts` (table SELECT + RPC POST anon-denial; positive-control with service-role).
18. **T4.7** — Live-render smoke: invoke IB renderer with `FIXTURE_DISCIPLINED_BAR_NUMBER` synthetic case; assert `Your Attorney's Public Bar Record` heading + `<tr>` event row + disclaimer verbatim.

## Verification gate (T4)

Run in this order; any failure = stop and fix:
1. `npm run build` exit 0.
2. `deno check` on every Deno-side file (T4.1a list).
3. `npm test` capture vs origin/master baseline (T4.2 npm side).
4. `deno test --reporter=junit` capture vs origin/master baseline (T4.2 Deno side; if `before-deno.xml` missing, treat as 0/0/0).
5. `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` exit 0, no `INNA-H1.*FAIL`.
6. Live IB regen for 1 test case via `/api/admin/regen-ib?caseId=...&key=$ADMIN_PASSWORD` → manually verify the new section renders correctly in the HTML.

## Acceptance criteria (Success Criteria block in plan)

All 17 numbered criteria must pass. Specific gotchas:
- **Criterion 11** uses tolerant regex `/<h2[^>]*>Your Attorney's Public Bar Record<\/h2>/` (md2html injects `class="section-h2"`).
- **Criterion 11(c)** ordering uses `BRADY_GIGLIO_APPENDIX` as upper bound (YOUR_PLAN heading is LLM-generated, may not be deterministic).
- **Criterion 13** asserts `BANNED_PHRASES_BLOCK.length >= 10` (false-green guard).

## PR creation

When all gates green:
```
git push -u origin worry/attorney-discipline-wire
gh pr create --base master --head worry/attorney-discipline-wire --repo rahim0kapadia/ImNotAnAttorney-web \
  --title "feat(ib): attorney bar-discipline section — fair-report privilege, CA-only" \
  --body <generated-from-plan-summary>
```

## Hard constraints (per global rules)

- 100% UPL-safe: every disclaimer string passes the BANNED_PHRASES_BLOCK panel.
- Fair-report privilege memo MUST exist before merge.
- Real bar numbers only — no fabrication.
- All migrations idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).
- Every Deno-side file uses port 5432 if it touches Postgres directly (it doesn't here — RPC via PostgREST).
- Defensive against root-cause-first hook: if a test fails because of a producer-level issue (e.g., md2html behavior), fix the spec/plan/test, NOT the output.

## Out of scope (do NOT do in Phase 5)

- Case Decoder integration (Phase 1.1b — separate plan).
- Multi-state bar discipline rendering (blocked on per-state fair-report memos; v2.4 ships CA-only).
- LLM evaluate-report integration (Phase 1.1c — nightly cron sample, separate plan).
- Backfill of already-delivered reports.
- Fuzzy match / disambiguation prompt.

## Status of related work this session

- **PR #148** — NJ Bar discipline scraper (+4,940 events / 3,131 attorneys). Awaiting Rahim merge.
- **PR #149** — VA Bar discipline scraper (+1,101 events / 1,008 attorneys, gaps 2022-2025 documented). Awaiting Rahim merge.
- **DB state** — `attorney_discipline_events` now at 16,543 events / 11 jurisdictions (CA, FL, GA, IL, MI, NJ, NY, OH, PA, TX, VA).
- **P1 next wave** (state expansion) — handoff list at top of session: WA, AZ, TN, MA, IN, MD, CO, MN. Fresh session can dispatch waves of 2 in parallel via the agent recipe in `docs/handoff/<previous-session-handoff>.md`.

## Ready-to-paste prompt for fresh session

```
Execute Phase 5 of the implementation plan at
  C:\Users\email\projects\_worktrees\worry-attorney-discipline\docs\plans\2026-04-25-worry-attorney-discipline-wire.md

Pre-flight: read the plan in full + read C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-04-25-attorney-discipline-wire-phase5-handoff.md.

Work in worktree at C:\Users\email\projects\_worktrees\worry-attorney-discipline (branch worry/attorney-discipline-wire). Rebase onto origin/master before starting. Implement tasks T0a → T4.7 in the order listed in the handoff. All v4 swarm findings (CRITs + WARNs) are already applied; SUGs deferred. Pristine-Or-Nothing applies — fix every test failure at root cause.

When done: push, gh pr create against master, surface to Rahim for review.
```
