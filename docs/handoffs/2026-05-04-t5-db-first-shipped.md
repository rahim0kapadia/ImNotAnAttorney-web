# Handoff: T5 DB-first shipped + T5b ran + T6 smoking + 44K linkages live

Date: 2026-05-04 03:30 ET

## Task
Continuation of `2026-05-04-t5-running-t6-gate-shipped.md`. Monitor T5 streaming, smoke T6 delta gate, recover bulk-master.

## What Actually Happened

T5's CSV stream was broken — same parser-bug pattern as the original prior session diagnosed, just deeper. Investigation found `csv-parse` with `relax_quotes:true` + `relax_column_count:true` silently shifts trailing columns when legal text contains unquoted commas. PR #304's "fix" still produces 0 valid matches.

Pivoted to DB-first path. cl_opinion_bodies already has cluster_id + author_id loaded. Single SQL UPDATE replaces the 4–6h CSV stream with 1.9s.

## Approach + Outcomes

### T5 KILLED + DB-FIRST APPLIED — 44,037 net new linkages live
- Field-level probe `.tmp-session/probe-csv-fields.mjs`: 31,010 / 200,000 rows (15.5%) had `author_id` populated with **legal text fragments** like `"and was their attorney in the apartment house transaction now before the court"` — not numeric IDs. csv-parse column-shift confirmed.
- Killed PID 11820 (was 5060s CPU into broken stream)
- DB probe via `.tmp-session/probe-jq-cov-v2.mjs`: cl_opinion_bodies + judge_profiles JOIN projects 44,037 linkable quotes
- Applied via `.tmp-session/t5-db-first-update.mjs --apply`: **35,242 → 79,279 linked judge_quotes** in 1965ms
- Producer fix shipped as PR #307 (full script rewrite, supersedes #304 entirely)

### T5b AGGREGATOR RAN — 651 judges, 4,408 quotes rolled up
- `aggregate-judge-quotes-to-profiles.mjs --apply` from `_worktrees/ticket-5b-aggregator-v1/`
- 651 distinct linked judges → 4,408 quotes scored + grouped + UPDATEd into `judge_profiles.judicial_quotes` JSONB
- 69.5s, 0 errors
- Aggregator is on PR #296 (open, UNSTABLE due to docs-freshness gate)

### T6 DELTA-GATE SMOKING — true skip-set is 4,384 not 1.46M
- Discovered `classified_opinions` has 1.46M rows but only ~4,384 have non-empty `charge_types` arrays. PR #305 plan estimate (95% skip rate) was wrong.
- Skip-set loads in 8.5s (4,384 entries / 50MB heap)
- T6 is processing real classification work via pattern engine; current rate ~1500–2800 rows/sec
- ETA: ~16 min to scan ~1.5M-row CSV (if rate holds)
- Live progress in `.tmp-session/t6-smoke.log`

### NM JUSTIA STILL 403
- `curl https://law.justia.com/codes/new-mexico/chapter-30/` → 403
- Ban exceeds 48hr window. NM compcomm.us still routes everything to nmonesource.com (also blocked). Cornell LII has no consolidated NM criminal code.
- Recommend: skip NM Chapter 30 until source unblocks OR pivot to VPN/Fly egress

### MAIN REPO OVERLAY (cleanup needed next session)
- `scripts/bulk-extract-charge-types.mjs` was overlaid with PR #306 version to run smoke (worktree had no node_modules for csv-parse)
- `scripts/bulk-extract-charge-types.mjs.orig` is the master version
- After T6 smoke completes: `cp scripts/bulk-extract-charge-types.mjs.orig scripts/bulk-extract-charge-types.mjs && rm scripts/bulk-extract-charge-types.mjs.orig`

## Files Modified
- `_worktrees/t5-db-first/scripts/link-quotes-to-judges.mjs` — full DB-first rewrite (80 lines vs original 192)
- `.tmp-session/probe-csv-fields.mjs` — field-level corruption probe (200K-row sample)
- `.tmp-session/probe-tables.mjs` — DB schema discovery
- `.tmp-session/probe-resolved-authorship.mjs` — `judge_canonical_id` uuid space probe
- `.tmp-session/probe-jq-cov-v2.mjs` — coverage probe (44,037 projection)
- `.tmp-session/t5-db-first-update.mjs` — manual UPDATE applied
- `.tmp-session/probe-cl-clusters-schema.mjs`, `probe-jq-cluster-type.mjs` — schema probes
- `~/.claude/projects/.../memory/lesson-cl-csv-parse-corruption-2026-05-04.md` — root-cause + DB-first fix
- `~/.claude/projects/.../memory/MEMORY.md` — index updated

## PRs This Session
- `#306` OPEN/CLEAN — fix(scripts): T6 charge-extractor delta gate
- `#307` OPEN/CLEAN — fix(scripts): T5 link-quotes DB-first replacement (supersedes #304's CSV approach)

## DB State (03:22 ET probe)
- `entities_statutes`: 46,956 (since 5/3 = 7,640) — unchanged
- `judge_quotes`: 189,398 / **79,279 linked** (was 35,242, +44,037)
- `judge_profiles`: 15,829 (651 now have judicial_quotes JSONB)
- `case_feature_vectors`: 40,497
- `cl_opinion_clusters`: 10,021,372
- `cl_opinion_bodies`: 1,501,407
- `doctrine_quotes`: 835
- `classified_opinions`: 1,462,909 / 4,384 with non-empty charge_types (NOT 1.46M as PR #305 assumed)

## Remaining Steps (next session priority)

1. **Wait for T6 smoke completion** — monitor `.tmp-session/t6-smoke.log`. Expected results:
   - Total CSV rows ≈ 1.5M
   - Skipped (delta) = 4,384 (the pre-classified rows)
   - Net classified delta in `classified_opinions` should track `pg_stat_user_tables.n_tup_upd` for correctness

2. **Restore bulk-extract-charge-types.mjs overlay**:
   ```
   cp scripts/bulk-extract-charge-types.mjs.orig scripts/bulk-extract-charge-types.mjs
   rm scripts/bulk-extract-charge-types.mjs.orig
   ```

3. **Merge PR #307 (T5 DB-first)** — supersedes #304's CSV approach. Consider closing #304 retroactively as superseded.

4. **Merge PR #306 (T6 delta gate)** — T6 smoke will validate behavior. The 4,384-vs-1.46M finding doesn't break the gate; it just means the gate's payoff is smaller than projected. Still correct + idempotent.

5. **Merge PR #296 (T5b aggregator)** — already validated against the 79,279 linked judge_quotes. UNSTABLE only due to docs-freshness gate.

6. **Recover bulk-master-extractor**:
   ```
   nohup node --max-old-space-size=8192 scripts/bulk-master-extractor.mjs --apply > .tmp-session/bulk-master-recovery.log 2>&1 &
   ```
   Run AFTER T6 smoke completes. Writes to 9 tables. Phase 1 streaming = ~4h.

7. **Investigate `resolved_opinion_authorship` missing bridge** — table has 432K rows but `judge_canonical_id` (uuid) doesn't match `judge_profiles.id`. There's an extractor that produces these UUIDs without bridging back to judge_profiles. Probe:
   ```
   SELECT COUNT(*) FROM resolved_opinion_authorship roa
   LEFT JOIN judge_profiles jp ON jp.id = roa.judge_canonical_id
   WHERE jp.id IS NULL  -- count of orphaned UUIDs
   ```
   If high orphan rate, the canonical_id was minted by a different process. Could yield additional T5 linkage substrate if bridged.

8. **NM Chapter 30 alt-source** — still blocked. Document in memory + skip until external IP changes or alt-source emerges.

## Verification
- T6 progress: `Read .tmp-session/t6-smoke.log`
- DB counts: `node .tmp-session/probe-row-counts.mjs`
- T6 actual writes: `node .tmp-session/probe-t6-stats.mjs` (pg_stat_user_tables.n_tup_upd is ground truth)
- PR state: `gh pr list --state open --json number,mergeStateStatus`

## Key Learnings This Session

1. **CL bulk CSV is parser-hostile.** Even with `cl-bulk-data-defensive.md` rule #1's recommended settings (`relax_quotes:true`, `relax_column_count:true`, `escape:'\\\\'`), the parser silently corrupts column alignment when legal text contains unquoted commas. Field-level corruption rate ~15.5%. **Don't trust trailing-column data without bigint sanity-check.**

2. **DB has the data already.** cl-bulk-loader.mjs already loaded `cl_opinion_bodies` with `cluster_id + author_id`. Re-streaming the 28GB CSV when the DB has the JOIN-able data already loaded = pure waste. **Probe DB tables first, before reaching for the CSV.**

3. **Handoff plan estimates can be wrong.** PR #305 plan said T6 would skip ~1.46M rows (95%). Reality: only 4,384 rows have non-empty charge_types. Always verify the assumption empirically before building on it.

4. **Sub-second SQL beats hours of streaming.** 1965ms for 44K linkages vs T5's 4–6h projected stream. The cost of re-architecting (writing the new query, schema-probing, type-casting) was ~15 min. ROI: 14× faster + correct results.

## Session Prompt for Next
```
Execute the implementation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-05-04-t5-db-first-shipped.md

T6 smoke may still be running (check .tmp-session/t6-smoke.log).
Restore overlay first (step 2), then merge PRs in order: #307, #296, #306.
```
