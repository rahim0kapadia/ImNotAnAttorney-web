# Working Tree Sweep — 2026-04-26

## Context

`C:/Users/email/projects/ImNotAnAttorney-web` master HEAD `4195b7c6` (post-merge of #190 + #193). Working tree carries 117 untracked items accumulated from concurrent sibling Claude sessions over 2026-04-16 through 2026-04-27. Sweep on branch `chore/working-tree-sweep`.

Two stale stashes: `stash@{0}` WIP on fix/apex-ib-defensive-moat, `stash@{1}` On fix/dt4-arrest-survival-kit-ship: dt3-precedent-watchlist-stash.

## Goal

Reduce `git status` to clean. Keep all real work. Drop all sibling-session stomp shadows. No tracked file outside scope is touched.

## Categories

- A. `(1).<ext>` shadow files — 56 detected. Diff vs canonical, delete duplicates, surface only if unique content.
- B. Plans + handoffs — commit (single docs commit).
- C. Ingest scripts under `scripts/ingest/` + `scripts/avatar/` + `scripts/demand-intel-query.mjs` — commit.
- D. Operational logs / scratch / pycache — gitignore + delete.
- E. Public brand assets (`public/brand/*.png`) — commit.
- F. New blog posts — commit (per blog-pipeline conventions).
- G. Sidelined test (`tests/lib/officer-render (1).test.ts.tmp-sidelined`) — restore or delete.
- H. New cron route directory (`src/app/api/cron/security-scan/`) — verify on master, commit if real.
- I. Migration `supabase/migrations/20260420a_security_scan_history.sql` — commit if real, delete if shadow.
- J. `scripts/hooks/pre-push (1)` shadow — delete.
- K. Bulk-verify SQL output `(1).sql` files — delete.
- L. Bondsman v2 diffs `(1).md` — restore or delete.
- M. Twitter posted queue (`content/queue/twitter/posted/*.md`) — commit (real send logs).
- N. `_de_summary.txt`, `_ri_summary.txt` — scratch, delete.

## Strategy

1. Write this plan (gate satisfied).
2. Categorize every entry with diff-against-canonical for `(1)` shadows.
3. Update `.gitignore` for category D.
4. Delete operational scratch + shadow duplicates.
5. Commit in clean batches:
   - `chore(.gitignore): ignore session scratch`
   - `chore(sweep): delete sibling-session stomp shadows`
   - `docs: add backlog of plans + handoffs from sibling sessions`
   - `feat(ingest): add ingest scripts from sibling sessions`
   - `chore(brand): add reddit + x banner assets`
   - `content(blog): two posts from sibling sessions`
   - other category-specific commits as needed
6. Drop stale stashes after verifying content is captured elsewhere.
7. Push branch + PR.

## Hard Constraints

- DO NOT delete files with unique content.
- DO NOT touch tracked files outside cleanup scope.
- All commits use Conventional Commits + Co-Authored-By footer.
- Verify tsc clean before final push (after `rm -rf .next/types`).

## Out of Scope

- Tracked-file refactors. This is a sweep, not a refactor.
- Stash recovery into source files. If a stash carries unique work, surface but do not auto-extract.

## Verification

- `git status --porcelain` empty post-cleanup.
- `git stash list` matches plan (stale stashes dropped if content confirmed redundant).
- `tsc --noEmit --skipLibCheck` passes.
- PR opened, single PR with all sweep commits.

## Cascade

- us: clean tree, no more sibling-stomp confusion.
- direct counterparty (next session in this repo): instant productive start, no triage tax.
- Rahim: zero recovery debt, no manual review of 117-item list.
- ecosystem (other Claude users on Windows): pattern reusable for any post-stomp recovery.
- future-us: branch-stomp + working-tree-stomp draft hooks land on top of a clean tree.
- No node loses.
