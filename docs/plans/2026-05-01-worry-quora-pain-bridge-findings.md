# Findings — Worry: Quora Pain-Point Bridge

Companion file. Tracks findings across all rounds (R0 plan-review through Rn pristine).

| Round | Reviewer | Severity | File:Line | Finding | Status |
|---|---|---|---|---|---|
| R0 | security-auditor | CRITICAL | T13 | C1 stats callback lacks anti-replay/spoof protection — `CRON_SECRET` reuse + no `run_id` validation lets attacker forge `cookies_age_hours: 1` to suppress stale-cookie alert | open |
| R0 | security-auditor | CRITICAL | T16 | C2 `posted_body_md` filesystem ingestion — path-traversal/symlink/size/schema-validation gaps create RCE-on-Quora vector | open |
| R0 | security-auditor | CRITICAL | T20+T22 | C3 operator dashboard XSS via `posted_body_md` + `operator_tasks.payload` jsonb; missing CSP, URL-scheme allowlist, `rel=noopener` | open |
| R0 | security-auditor | CRITICAL | T20+SC-19 | C4 admin gating depends on "verify or add" middleware matcher; Server Actions in T21 not explicitly admin-gated | open |
| R0 | security-auditor | CRITICAL | T11+R2 | C5 cookie hygiene — `.quora-cookies.json` not deleted post-run on long-lived runner; no rotation procedure beyond Telegram alert | open |
| R0 | security-auditor | WARNING | T12 | W1 `GITHUB_DISPATCH_TOKEN` PAT scope (`actions:write`) too broad + no expiry; switch to fine-grained 90-day or GitHub App | open |
| R0 | security-auditor | WARNING | T9 | W2 `bridge_promote_one` SECURITY DEFINER missing `SET search_path` + missing `REVOKE EXECUTE FROM PUBLIC` before GRANT | open |
| R0 | security-auditor | WARNING | T8/T12/T13 | W3 `requireCron` shape unverified; per-route distinct secrets recommended | open |
| R0 | security-auditor | WARNING | T13+T14 | W4 stats callback `errors[]` no size cap + secrets-in-stack-trace leak risk; Telegram alert no debounce | open |
| R0 | security-auditor | WARNING | T14+T17 | W5 RLS-enabled-no-policies depends on default-deny; add explicit REVOKE from anon+authenticated; SHA-256 operator-email | open |
| R0 | security-auditor | WARNING | T19+R4 | W6 no env-var kill-switch separate from feature_flag DB lookup; conditional CHECK on `source='quora' → review_status='pending_review'` | open |
| R0 | security-auditor | WARNING | T11 | W7 self-hosted runner long-lived registration token; verify private repo; ephemeral runner; least-privilege `permissions:` | open |
| R0 | security-auditor | WARNING | T16 | W8 attribution drift via "most-recent qualifying" lookup; use `promoted_to_gap_id` from T2 as deterministic key | open |
| R0 | security-auditor | WARNING | T12 | W9 GitHub REST URL must be hardcoded literal, no env interpolation; use Octokit SDK over raw fetch | open |
| R0 | security-auditor | WARNING | T3+T16 | W10 migration ordering window — same-deploy coupling required; conditional default `'pending_review'` for `source='quora'` | open |
| R0 | security-auditor | SUGGESTION | T16 | S1 `posted_body_md` size cap (CHECK `length <= 32768`) | open |
| R0 | security-auditor | SUGGESTION | T13 | S2 Telegram via Bot API fetch, not `~/.claude/` shell-exec (Vercel can't reach user-home) | open |
| R0 | security-auditor | SUGGESTION | T6 | S3 trigger WHEN clause add `OLD.promoted_to_gap_at IS NULL` short-circuit | open |
| R0 | security-auditor | SUGGESTION | T14 | S4 cron_run_stats retention 180-day weekly purge | open |
| R0 | security-auditor | SUGGESTION | T19 | S5 verify `feature_flags` table is service_role-only | open |
| R0 | security-auditor | SUGGESTION | T8/T12 | S6 force-override flag for cron lock with `requireAdmin` audit | open |
| R0 | security-auditor | SUGGESTION | T1-T17 | S7 reserve migration letters c-i via early Glob check before write | open |
