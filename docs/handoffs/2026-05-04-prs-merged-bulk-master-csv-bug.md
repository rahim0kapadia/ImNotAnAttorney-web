# Handoff: 3 PRs merged + bulk-master CSV bug + ROA orphans probed

Date: 2026-05-04 ~08:45 UTC

## Task

Continue from `docs/handoffs/2026-05-04-t5-db-first-shipped.md`.
Verify state, merge queued PRs, audit bulk-master before recovery,
probe ROA orphan bridge.

## What happened

### Merged 3 PRs
- **#307** (T5 link-quotes DB-first) — MERGED 12:34 UTC. Supersedes #304's csv-parse approach.
- **#306** (T6 charge-extractor delta gate) — MERGED 12:34 UTC. Gate code is correct; underlying CSV parser is the broken layer.
- **#296** (T5b aggregator JSONB rollup) — MERGED 12:39 UTC. Required `gh pr update-branch --rebase` to pull master's classify-llm.ts stub (PR #298) which had unblocked the verify-architecture gate.

### bulk-master-extractor.mjs has same csv-parse bug
Per handoff verify-before-assuming probe:
- `scripts/bulk-master-extractor.mjs:1215, 1274` use identical
  `csv-parse` config (`relax_quotes:true, relax_column_count:true, escape:"\\"`)
  that produced 15.5% column-shift corruption in T5 (#307) and zero
  actual writes in T6 smoke.
- Recovering it as queued in step 6 would write corrupted data to 9 tables.
- **Halted recovery.** Plan written for DB-first rewrite covering
  both T6 and bulk-master: `docs/plans/2026-05-04-t6-and-bulk-master-db-first-rewrite.md`.
- Memory: `~/.claude/projects/.../memory/warning-bulk-master-csv-parse-bug-2026-05-04.md`.

### ROA orphan probe — 100% orphan, unusable as-is
`.tmp-session/probe-roa-orphans.mjs`:

| metric | value |
|--------|-------|
| total ROA rows | 432,324 |
| distinct canonical_ids | 8,377 |
| **orphan canonical_ids (no judge_profiles match)** | **8,377 (100%)** |
| distinct cluster_ids covered | 418,048 |
| judge_quotes resolvable via ROA bridge | **0** |

`judge_canonical_id` is its own UUID space (likely minted by an
extractor that never bridged back to `judge_profiles`). Would yield
T5 linkage substrate IF canonicalized, but needs separate name+court
matching pass. Deferred — diminishing returns vs the 79K already linked.
Memory: `~/.claude/projects/.../memory/project-roa-canonicalization-needed-2026-05-04.md`.

### NM Chapter 30 still 403
Justia ban hasn't lifted. `compcomm.us` redirects to nmonesource.com
(also blocked). No change from prior handoff — leave deferred.

## Files modified

- `docs/plans/2026-05-04-t6-and-bulk-master-db-first-rewrite.md` (new)
- `docs/handoffs/2026-05-04-prs-merged-bulk-master-csv-bug.md` (this file)
- `.tmp-session/probe-roa-orphans.mjs` (new)
- `~/.claude/projects/.../memory/warning-bulk-master-csv-parse-bug-2026-05-04.md` (new)
- `~/.claude/projects/.../memory/project-roa-canonicalization-needed-2026-05-04.md` (new)
- `~/.claude/projects/.../memory/MEMORY.md` (index updated)

## DB state (no change from prior handoff)
- `judge_quotes`: 189,398 / 79,279 linked
- `judge_profiles`: 15,829 (651 with judicial_quotes JSONB)
- `entities_statutes`: 46,956
- `case_feature_vectors`: 40,497
- `classified_opinions`: 1,462,909 / 4,384 with non-empty charge_types

## Remaining (next session priority)

1. **Phase 1 of plan: T6 charge-extractor DB-first rewrite.**
   `scripts/bulk-extract-charge-types.mjs` → replace CSV stream with
   chunked SQL JOIN against `cl_opinion_bodies`. Apply existing
   keyword pattern engine to `plain_text`. UPDATE `classified_opinions`.
   Delta gate from #306 still applies. Expected: 5-15 min vs broken hours.

2. **Phase 2: bulk-master-extractor.mjs DB-first.** Audit each of 9
   extractors. T5-shaped already done (#307); charge-classification is
   Phase 1. Other 7 need same architectural fix.

3. **NM Chapter 30** — re-attempt after Justia ban lifts (probe via
   `curl -I https://law.justia.com/codes/new-mexico/chapter-30/`).

4. **ROA canonicalization pass** (optional T5 boost) — fuzzy name+court
   matching of 8,377 canonical_ids → judge_profiles.id. Deferred.

## Verification

- PR state: `gh pr list --state merged --json number,title --jq '.[] | select(.number==296 or .number==306 or .number==307)'`
- DB ground truth: `node .tmp-session/probe-row-counts.mjs`
- bulk-master CSV bug confirmed: `Grep "csv-parse" scripts/bulk-master-extractor.mjs` (lines 45, 1215, 1274)

## Session prompt for next

```
Execute the implementation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-04-t6-and-bulk-master-db-first-rewrite.md

Start at Phase 1 (T6 charge-extractor DB-first rewrite).
DO NOT run bulk-master-extractor.mjs as-is — see
  ~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/warning-bulk-master-csv-parse-bug-2026-05-04.md
```
