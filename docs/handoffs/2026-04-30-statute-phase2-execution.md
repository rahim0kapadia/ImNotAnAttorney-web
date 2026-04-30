# Handoff — Statute Phase 2 (NC/AZ/WA/OH-extended) Phase 5 execution

Date: 2026-04-30
Slug: statute-phase2
Parent worry: `docs/plans/2026-04-30-worry-ib-launch-quality-gaps.md` (GAP 4 of 4)
Plan: `docs/plans/2026-04-30-worry-statute-phase2.md`

## Status at handoff

worry-to-pristine Phases 1-4 complete on the GAP 4 child plan:

- **Phase 1 (Capture)**: worry text in plan §Worry.
- **Phase 2 (Triangulate Expert)**: cached `~/.claude/experts/openstates-team.md`.
- **Phase 3 (Draft Plan)**: T0-T5 written, 22 SC criteria.
- **Phase 3.5 (Spec-Gradeability Gate)**: spec-critic PASS on retry (round 1) after introducing BLOCKED-UNTIL-T0 placeholders + SC-17.
- **Phase 4 (Swarm-Review the Plan)**: round 0 dispatched 3 reviewers
  (openstates-team domain expert, security-auditor, code-reviewer);
  21 findings folded into plan via surgical edits; audit log appended at
  `## Round-0 Review Resolution`.

Phase 5 (Execute Plan) is next. T0 is the only research step; T1-T4 are
parallelizable across sessions, T5 wires up cron.

## Other gaps (siblings of GAP 4)

- **GAP 1 (Next.js export violations)**: 3 sibling routes still have
  non-handler exports (`checkout/verify`, `cron/precedent-watchlist-emails`,
  `cron/statutes-refresh-fl/[chapter]`). Build tolerates today. Deferred —
  open as a separate refactor worry when Statute Phase 2 ships.
- **GAP 2 (Section 5b fabricated state-statute citations)**: post-gen regex
  strip shipped this session in `supabase/functions/generate-report/index.ts`
  (`stripFabricatedStateStatuteCitations`). NICCC-style structured ingest is
  blocked at $0 budget — no public collateral-consequences DB exists.
  Deferred to Phase 3 worry once a free DB surfaces.
- **GAP 3 (CA discipline order_date 96.3% NULL)**: Source-column
  auto-suppression shipped in `render-attorney-discipline.ts`; 100% of CA
  attorneys (1076/1076) hit suppression. Date-from-prose repair (regex
  extract from `violation_summary`) deferred.

All band-aids are documented in the umbrella worry doc.

## Copy-paste prompt for next session

```
Execute the worry-to-pristine Phase 5 (executing-plans) on
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-statute-phase2.md

Context:
- Phase 4 (round 0 swarm-review) closed pristine 2026-04-30; audit log in
  the plan's `## Round-0 Review Resolution` section.
- Start at T0 (per-state source research + chapter coverage matrix). T0
  produces 4 docs at docs/ingest/coverage/<state>-statutes-coverage.md
  that mechanically fill the BLOCKED-UNTIL-T0 placeholders in SC-9, SC-12,
  SC-15, SC-17.
- T1-T4 are parallelizable but recommended order is demand ranking:
  NC → AZ → WA → OH-extended.
- T5 (cron registration) runs once any of T1-T4 ships.
- HARD RULES auto-loaded:
  - no-hallucinated-legal-data (HTTPS source_urls required, anti-
    hallucination audit after every seed run per
    pattern-anti-hallucination-audit-query.md)
  - cl-bulk-data-defensive #18 (COPY > INSERT for any bulk write),
    #20 (codebook != raw — verify before encoding)
  - gotcha-self-generated-fixture-passes-buggy-parser (validate fixtures
    against live source before relying on tests)
  - DEPLOY SCOPE: app code (`src/`, `supabase/functions/`,
    `scripts/` runtime) must land in
    C:\Users\email\projects\ImNotAnAttorney\apps\web\, not
    ImNotAnAttorney-web. Statute seed scripts under
    scripts/ingest/ are runtime (deploy via parent repo). Tests and
    coverage docs under docs/ingest/ stay in -web.
- Pristine-or-nothing applies to round 1+ swarm-reviews after each task
  completes. Loop runs until pristine-judge returns {pristine:true}.

Use Sonnet for mechanical port work (T1 → T2/T3 are file-by-file ports
of the same shape — clear path = Sonnet per agent-model-tier rule).
Use Opus only for T0 (decision: which chapters to scope per state) and
for any swarm-review reviewer dispatch that requires triangulation.

Begin with T0.
```

## Files touched this session (for next-session diff baseline)

Plan + handoff edits only:
- `docs/plans/2026-04-30-worry-statute-phase2.md` (621 lines, 21 findings folded)
- `docs/plans/2026-04-30-worry-ib-launch-quality-gaps.md` (umbrella status filled)
- `docs/handoffs/2026-04-30-statute-phase2-execution.md` (this file)

Session-prior shipped band-aids (already committed in earlier sessions):
- `supabase/functions/generate-report/index.ts` (Section 5b regex strip)
- `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (Source-column suppression)
- `src/lib/report-renderer.ts` (`<li>→<ul>` wrap)
- `src/lib/intelligence-brief/prompts.ts` (months_since_arrest verbatim rule)
- `supabase/migrations/20260429a_remove_attorney_discipline_test_fixtures.sql`
- `supabase/migrations/20260429b_remove_legacy_e2e_test_orphans.sql`

## Health-gate state

No G1-G8 trips during Phase 4. Spec-critic round 1 PASS after BLOCKED-UNTIL-T0
pattern adopted. Round 0 produced 21 findings; all folded; round 1 begins
after T0 completes (Phase 5 executes T0 then triggers round 1 against the
T0-resolved plan + early T1 code).
