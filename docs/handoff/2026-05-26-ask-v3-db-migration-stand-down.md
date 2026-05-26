# ASK v3 — Supabase DB Migration Stand-Down

**Date:** 2026-05-26  
**Evaluator:** follow-up agent (post-PR #221)  
**Decision:** Stand down — do NOT migrate state-arrest-procedure to Supabase at this time.

---

## What Was Evaluated

Per the post-ship brief for Arrest Survival Kit v3, this evaluation checked whether the
per-state procedural data in `data/state-arrest-procedure/<code>.json` (50 files) should
be migrated to a Supabase table. Migration was conditional on at least one of three triggers
having fired since 2026-04-28.

---

## Trigger Check

### Trigger 1 — Admin-editing demand
Signal: an operator needed to fix a state's data without going through a PR (open issues,
Telegram alerts, in-repo memos, or hand-edited JSON commits).

**Result: NOT FIRED.**

- `git log --since=2026-04-28 -- data/state-arrest-procedure/` → zero commits on master.
- `mcp:search_issues` for "state-arrest-procedure", "arrest survival", "state procedure",
  "state data stale" → 0 results.
- No in-repo memos or plans referencing operator friction with the JSON files.
- Additional context: PR #221 (`feat/arrest-survival-kit-v3`) is still **open and unmerged**
  as of 2026-05-26. The JSON files and disk loader do not yet exist on master, so no
  operator has had any chance to encounter edit friction with them.

### Trigger 2 — Disk reads feel stale
Signal: blog posts, support tickets, or memo files referencing stale state data or
build-time-only data being insufficient for runtime needs.

**Result: NOT FIRED.**

- No support-ticket memos referencing stale procedural data.
- No blog posts or runtime-freshness complaints found in `docs/`.
- Again: the loader (`src/lib/state-arrest-procedure/load.ts`) doesn't exist on master
  yet — the disk-read path hasn't shipped to prod, so no freshness signal is possible.

### Trigger 3 — Public-records refresh source we want to cron against
Signal: a research memo, expert profile, or `docs/plans/` file recommending automated
state-law refresh for arrest-procedure data.

**Result: NOT FIRED.**

- `docs/plans/2026-04-30-worry-statute-phase2.md` and related statute-phase plans are
  scoped entirely to `jurisdiction_statutes` (criminal code statutes for IB/research
  pipeline) — not to the procedural ASK data (first-appearance windows, bail types, etc.).
- No expert profile in `~/.claude/experts/` recommends a cron-refresh source for this
  dataset.
- No `docs/plans/`, `docs/research/`, or `docs/specs/` file references automated refresh
  for `state-arrest-procedure`.

---

## Critical Context: PR #221 Not Yet Merged

The task brief assumed PR #221 was merged ~2026-04-28. It is **open**, not merged.

- PR state: `open`, `merged: false`
- Branch: `feat/arrest-survival-kit-v3`
- Created: 2026-04-28T17:12:23Z, never merged

This means `data/state-arrest-procedure/`, `src/lib/state-arrest-procedure/{types,load}.ts`,
and `tests/state-arrest-procedure-load.test.ts` **do not exist on master**. The entire
migration question is premature until #221 lands.

---

## Recommendation

1. **Merge PR #221** — get the JSON files and disk loader onto master first.
2. **Re-evaluate migration triggers after #221 has been live for 30+ days.** Only then
   will there be operator feedback, runtime freshness signals, or refresh-source research
   to act on.
3. If triggers fire post-merge: the migration SQL schema is already specified in the task
   brief and can be executed quickly. The JSON files remaining as canonical source-of-truth
   (per the non-negotiable rule) makes rollback trivial — drop the table, loader falls
   back to disk.

---

## Signals Checked

| Signal type | Where looked | Found? |
|-------------|--------------|--------|
| Open GitHub issues | mcp:search_issues | No |
| Recent JSON file commits | git log since 2026-04-28 | No (0 results) |
| In-repo memos referencing operator friction | grep docs/ | No |
| Stale-data support memos | grep docs/ | No |
| Plans referencing automated state-law refresh | docs/plans/ grep | No |
| Expert profiles recommending refresh source | ~/.claude/experts/ | No |
| PR #221 merge status | mcp:pull_request_read | NOT merged |
