# Handoff: GHA self-hosted runner on Fly.io

Date: 2026-04-30 21:30 UTC

## Task

Migrate GitHub Actions CI from GitHub-hosted runners to a self-hosted runner on Fly.io to bypass the chronic billing-block on `rahim0kapadia` GitHub-hosted-runner minutes. Self-hosted runners do not consume hosted minutes — billing state stops being load-bearing for CI.

## Approach

- Fly.io `inaa-gha-runner` app, region `iad`, shared-cpu-1x @ 1GB always-on (~$5.70/mo). Fly free tier ended Oct 2024 — paid tier accepted as bootstrap-acceptable cost vs blocked CI on every PR.
- Image: `myoung34/github-runner:latest` (de-facto community standard, used as long-running, NOT ephemeral).
- Repo-scoped runner (rahim0kapadia is a GitHub User, not Org), `RUNNER_SCOPE=repo`, `REPO_URL=https://github.com/rahim0kapadia/ImNotAnAttorney`.
- `ACCESS_TOKEN` Fly secret = `gh auth token` (classic PAT with `admin:org`, `repo`, `workflow`). Runner self-rotates registration tokens — no 1hr-TTL juggling.
- Single PR (#34) flips all 6 workflows from `runs-on: ubuntu-latest` → `runs-on: [self-hosted, linux]`.
- Worktree-from-master pattern (per `pattern-worktree-per-pr-from-master.md`) avoids stomping sibling-session uncommitted work.

## Files Modified

### New scaffold (separate dir, NOT a git repo yet)

- `C:\Users\email\projects\inaa-gha-runner\Dockerfile` — `FROM myoung34/github-runner:latest`
- `C:\Users\email\projects\inaa-gha-runner\fly.toml` — app config; explicitly does NOT set EPHEMERAL, includes `[[restart]] policy = "always"`
- `C:\Users\email\projects\inaa-gha-runner\.dockerignore`
- `C:\Users\email\projects\inaa-gha-runner\README.md` — deploy/rotate/cost docs
- `C:\Users\email\projects\inaa-gha-runner\.gitignore`

### Monorepo PR #34 (worktree at `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\gha-self-hosted`)

- `.github/workflows/engine-tests.yml` — runs-on flipped
- `.github/workflows/supabase-migrations.yml` — runs-on flipped
- `.github/workflows/docs-freshness.yml` — runs-on flipped
- `.github/workflows/auto-merge-claude-blog.yml` — runs-on flipped
- `.github/workflows/backup.yml` — runs-on flipped
- `.github/workflows/generate-report.yml` — runs-on flipped
- `scripts/verify-workflows.test.js` — node-test ensuring all 6 workflows have `runs-on: [self-hosted, linux]` (6/6 pass)

### Local infrastructure

- `C:\Users\email\.claude\scripts\check-inaa-gha-runner.mjs` — 5-probe health check; Telegrams Rahim via @ClaborBot bot atlas
- Windows Scheduled Task `inaa-gha-runner-7day-check` — fires 2026-05-07 17:20 EDT, one-shot

### Memory

- `C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\project_gha_self_hosted_runner_fly.md` — full project memory entry incl. gotchas + 7-day check
- `C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\MEMORY.md` — index updated

### Cloud-side (no local file, but state persists)

- Fly app `inaa-gha-runner` (org `personal`) created + deployed twice
- GitHub repo runner id 22, name `fly-Z5dyK6xaFevNi`, status `online`
- GitHub PR #34: https://github.com/rahim0kapadia/ImNotAnAttorney/pull/34

## What Didn't Work

- **First deploy with `EPHEMERAL = "false"` in fly.toml.** myoung34's start.sh treats any non-empty EPHEMERAL value as truthy (string "false" included), enabling `--ephemeral` mode. Runner exited cleanly after one job, machine stopped, runner disappeared from GitHub. **Fix**: removed EPHEMERAL env entirely.
- **First deploy without `[[restart]]` policy.** Fly machines do not auto-restart on clean exit (code 0). **Fix**: added `[[restart]] policy = "always"` + `retries = 10`.
- **Initial smoke test of check script used fragile column-position regex** on `flyctl status` text output, captured `2` (VERSION column) instead of `started` (STATE column). Fix: switched to `flyctl status --json` + `Machines[0].state`.
- **Initial log-scan in check script tripped on historical pre-fix exit event.** Fix: replaced log-scan with `flyctl status --json` events filtered to last 24h.
- **Cloud /schedule routine ruled out** — no flyctl, no local Telegram script, no local memory dir access in Anthropic-cloud sandbox. Switched to Windows Scheduled Task (full local toolchain).
- **PowerShell vs Bash for `schtasks`.** Bash mangles `/Create` flag as path. Use PowerShell for schtasks invocations.

## Remaining Steps

1. **Merge PR #34** — first non-admin merge confirms billing-block is gone for CI path. Engine Tests will fail on the merge run (same pre-existing failure that's been hitting every run on github-hosted), but Docs Freshness + the migration itself are clean.
2. **Optional: scale runner fleet** if job queueing hurts under concurrent PRs: `fly scale count 3 -a inaa-gha-runner`. Single runner today; serializes job execution.
3. **Optional: rotate ACCESS_TOKEN to narrow-scope PAT.** Currently uses the broad-scope gh CLI token (`admin:enterprise, admin:org, ...`). Should be replaced with a `repo`-only PAT on next 90-day rotation.
4. **Engine-tests pre-existing failure**: separate triage. Failure mode is `# Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_AUTH_TOKEN, ANTHROPIC_API_KEY` in `test-blog-reingest.mjs` plus IPv6 loopback flake. Fix is workflow env injection, not runner.
5. **7-day check fires automatically** at 2026-05-07 17:20 EDT via Windows scheduled task → Telegram report. No action needed unless it reports FAIL.
6. **Push `inaa-gha-runner` scaffold to GitHub** (optional) for versioned config. Today the running Fly app is the source of truth; the local dir is the editable config.
7. **Cleanup post-merge**: `git worktree remove C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\gha-self-hosted` and `git branch -d chore/gha-self-hosted-runner` (after PR merge).
8. **Out of scope**: replicate same setup on tastedrop / cloudculture repos if they hit the same billing block.

## Verification

- `gh api repos/rahim0kapadia/ImNotAnAttorney/actions/runners` — confirms runner online + count
- `flyctl status -a inaa-gha-runner --json` — confirms machine.state == "started"
- `gh pr view 34 --repo rahim0kapadia/ImNotAnAttorney --json statusCheckRollup` — PR check status
- `gh run list --workflow=docs-freshness.yml --repo rahim0kapadia/ImNotAnAttorney --limit 5 --json conclusion` — confirms recent SUCCESS runs on Fly
- `node ~/.claude/scripts/check-inaa-gha-runner.mjs` — full 5-probe health check; PASS = green, exit 1 + Telegram alert on fail
- `schtasks /Query /TN inaa-gha-runner-7day-check /FO LIST` — confirms scheduled task ready

## Key Decisions

- **Repo-scoped runner over org-scoped** — `rahim0kapadia` is a GitHub User, not an Org. Org-scoped registration unavailable.
- **1GB RAM not 256MB** — engine-tests does pnpm install + tests on monorepo; 256MB would OOM. ~$5.70/mo cost accepted.
- **Single runner not fleet** — start cheap, scale only when queueing hurts.
- **myoung34/github-runner over self-built image** — Steal Before Building. Community-maintained, well-documented.
- **Local Windows Scheduled Task over cloud routine** — cloud sandbox lacks flyctl + local Telegram script + local memory dir; local task has full toolchain.
- **Worktree-per-PR over direct master commit** — sibling session had uncommitted work; per `pattern-worktree-per-pr-from-master.md`.

## Related

- PR: https://github.com/rahim0kapadia/ImNotAnAttorney/pull/34
- Fly dashboard: https://fly.io/apps/inaa-gha-runner/monitoring
- Memory: `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/project_gha_self_hosted_runner_fly.md`
