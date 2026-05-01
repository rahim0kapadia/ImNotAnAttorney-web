# Handoff: GHA self-hosted runner merged + post-merge state

Date: 2026-04-30 21:40 UTC

## Task

Continuation of `docs/handoffs/2026-04-30-gha-self-hosted-runner-fly.md`. Execute Step 1 (merge PR #34) and Step 7 (post-merge cleanup) from that handoff. PR was MERGEABLE/UNSTABLE (Engine Tests pre-existing fail, Docs Freshness + Vercel SUCCESS). No branch protection on master (private repo, no GitHub Pro).

## Approach

- Verified runner health via `~/.claude/scripts/check-inaa-gha-runner.mjs` — 5/5 probes PASS, runner online (id 22, name `fly-Z5dyK6xaFevNi`), Fly machine state `started`, no exit events in 24h.
- Squash-merged PR #34 with `--delete-branch` per handoff (regular merge, not admin — first non-admin merge self-validates the migration).
- Verified merge: `mergedAt: 2026-04-30T21:35:17Z`, `mergeCommit: 67c320718cbedd8e8bf755555e60d38a560b800f`.
- Confirmed post-merge Engine Tests on master triggered immediately and was picked up by Fly runner (`databaseId: 25190495607`, status `in_progress`) — proves runner is now serving master CI traffic.
- Removed `gha-self-hosted` worktree from monorepo (branch already deleted by `--delete-branch`).
- Updated memory entry + MEMORY.md index with merge state.

## Files Modified

- `C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\project_gha_self_hosted_runner_fly.md` — added merge commit + worktree cleanup, ran runner id 21 → 22 update.
- `C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\MEMORY.md` — index entry refreshed with PR #34 MERGED + commit hash.

Cloud-side (no local file but state mutated):
- GitHub: PR #34 squashed to `master`, branch `chore/gha-self-hosted-runner` deleted.
- Local: `git worktree remove .claude/worktrees/gha-self-hosted` (in monorepo).

## What Didn't Work

Nothing failed this session. One detour: skill-log.js path with backslashes resolved to wrong dir under bash; switched to forward slashes + quotes — `node "C:/Users/email/.claude/hooks/lib/skill-log.js" SKIP worry-to-pristine "..."` worked.

## Remaining Steps

From the original handoff, deferred:

1. **Engine-tests pre-existing failure (separate triage)** — every Engine Tests run on Fly runner fails with `# Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_AUTH_TOKEN, ANTHROPIC_API_KEY` in `test-blog-reingest.mjs` plus IPv6 loopback flake. Fix is workflow env injection (probably `.github/workflows/engine-tests.yml` env block + GH secrets), NOT runner-related. Worth doing because every push to master is currently a red X.
2. **Optional scale fleet** to 3 if PR concurrency hurts (`fly scale count 3 -a inaa-gha-runner`). Skip until queueing observed.
3. **Optional rotate ACCESS_TOKEN** to `repo`-only scope (currently broad `gh auth token`). Defer to next 90-day rotation.
4. **7-day check** auto-fires 2026-05-07 17:20 EDT via Windows Scheduled Task `inaa-gha-runner-7day-check` → Telegram alert if anything regresses.
5. **Push `inaa-gha-runner` scaffold to GitHub** (optional, today the running Fly app is source of truth; local dir is editable config).
6. **Replicate to tastedrop / cloudculture repos** if they hit the same billing block. Not currently blocked.

## Verification

- `gh pr view 34 --repo rahim0kapadia/ImNotAnAttorney --json state,mergedAt,mergeCommit` → state MERGED, commit 67c32071
- `gh run list --repo rahim0kapadia/ImNotAnAttorney --branch master --limit 5 --json workflowName,conclusion,status` → confirms post-merge runs land on Fly runner
- `node ~/.claude/scripts/check-inaa-gha-runner.mjs` → 5/5 PASS
- `gh api repos/rahim0kapadia/ImNotAnAttorney/actions/runners` → ≥1 online
- `flyctl status -a inaa-gha-runner --json` → machine.state == "started"
- `schtasks /Query /TN inaa-gha-runner-7day-check /FO LIST` → 7-day check armed

## Next-session prompt

```
Triage engine-tests env injection on master per
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-30-gha-self-hosted-runner-merged.md
Remaining Steps §1. Workflow .github/workflows/engine-tests.yml needs env block
wired to GH secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_AUTH_TOKEN,
ANTHROPIC_API_KEY) plus IPv6 loopback flake fix in test-blog-reingest.mjs.
```
