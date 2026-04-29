# Handoff: Admin Inbox Redesign — Shipped Pristine
Date: 2026-04-28 (post-21:55, continuation of `2026-04-28-claude-md-callout-mono-idv2-decision-hook-upgrade.md`)

## Task
Triage the in-flight working tree, ship Bucket A (admin inbox redesign), reconcile master.

Triage on resume: FEATURE.

## What was orphaned at session start
- 1,989 LOC modified in `src/app/admin/inbox/page.tsx`
- 3 modified API routes (`emails`, `reply`, `middleware`)
- 3 NEW API surfaces: `img-proxy/route.ts` (HMAC-signed SSRF-defended proxy), `recipients/route.ts`, `lib/admin-img-proxy.ts`
- DDL applied to prod 2026-04-28 (`starred boolean`, `snoozed_until timestamptz`, `labels text[]` + 3 partial indexes on `inbound_emails`); migration file uncommitted
- 3 plan files describing residual work
- Yesterday's handoff + Twitter queue draft + ad-hoc DB probe script

No prior handoff covered this. Likely an earlier 2026-04-28 session did the work and ran out of focus before writing it up.

## Triage finding (the non-obvious one)

**Mono `apps/web/` already had the feature shipped** via 7 prior commits ending at `69487f15` (security: SSRF + sig hardening). All 6 application files were BYTE-IDENTICAL between `-web` working tree and mono `apps/web/`. The orphaned `-web` work was a mostly-complete back-port of work already in mono.

What was missing in mono: just the migration file + 3 plan docs.

Lesson captured in `worry-admin-inbox-redesign-resolved-2026-04-28.md`: when `-web` has an orphaned working tree of app-code, **always diff against mono `apps/web/` first**.

## Approach

1. **Triage + worktree** off `origin/master` (local was on `257edf07` — Rahim's stale 2026-04-27 docs commit, not on origin master). Worktree pattern from yesterday's hook upgrade.
2. **`-web` PR #222**: full back-port (11 files / 2,705+/284-) + migration `20260428b_inbox_features.sql`. tsc clean via pre-commit hook. Build failure in worktree was from junctioned-`node_modules` over-globbing in `security-scan/route.ts:139` — origin/master CI passes (PR #220 merged today), so failure is env-only.
3. **mono PR #24**: history parity — 4 files (`20260428i_inbox_features.sql` because letters a..h are taken by JQB series + 3 plans). Application code already shipped; this PR fills missing repo-history artifacts.
4. **CI handling**: GHA PR-event elasticsearch reindex incident from yesterday is still affecting CI (4-11s runs, empty `steps[]`). Per `gotcha-gha-pr-elasticsearch-reindex.md` + yesterday's PR #22 admin-merge precedent, all 3 PRs admin-merged.
5. **`-web` PR #223**: housekeeping — yesterday's handoff + Twitter queue draft + `check-test-order-v2.mjs` DB probe.
6. **Backup branch**: `backup-257edf07-rahim-smoke-doc` preserves Rahim's local-only docs commit before the hard-reset to origin/master. Findings in that doc are all closed via PR #203/#206/#210/#207, but commit preserved for him to decide.
7. **Cleanup**: deleted stale 0-byte `C:Users…tsc-verify.log` artifact + `.deploy.json` Vercel CLI dump.

## Files Modified

### `-web` PR #222 — `0a654bad`
- `src/middleware.ts` — img-proxy public exception
- `src/app/admin/inbox/page.tsx` — 1,756 LOC redesign (Superhuman-style)
- `src/app/api/admin/emails/route.ts` — views (all/unread/starred/snoozed) + PATCH expansion + DELETE
- `src/app/api/admin/reply/route.ts` — multi-sender + GET allowlist + reply/forward/compose modes + CC
- `src/app/api/admin/img-proxy/route.ts` — NEW HMAC-signed SSRF-defended proxy (5MB cap, 10s timeout, content-type allowlist excl. SVG, 3-hop redirect re-validation)
- `src/app/api/admin/recipients/route.ts` — NEW autocomplete from inbound senders + customer cases
- `src/lib/admin-img-proxy.ts` — NEW HMAC sign/verify lib (Web Crypto, 2h TTL)
- `supabase/migrations/20260428b_inbox_features.sql` — NEW
- `docs/plans/2026-04-28-img-proxy-toctou-residual.md` — NEW
- `docs/plans/2026-04-28-inbox-migration-pending-commit.md` — NEW (resolved by this PR)
- `docs/plans/2026-04-28-session-lock-start-review-followups.md` — NEW

### Mono PR #24 — `72577db7`
- `apps/web/supabase/migrations/20260428i_inbox_features.sql` — NEW (letter `i` because a..h taken by JQB series)
- `apps/web/docs/plans/2026-04-28-img-proxy-toctou-residual.md` — NEW
- `apps/web/docs/plans/2026-04-28-inbox-migration-pending-commit.md` — NEW
- `apps/web/docs/plans/2026-04-28-session-lock-start-review-followups.md` — NEW

### `-web` PR #223 — `af9db1bd`
- `docs/handoffs/2026-04-28-claude-md-callout-mono-idv2-decision-hook-upgrade.md` — yesterday's handoff
- `content/queue/twitter/pending/2026-04-28-how-to-read-your-discovery-9111.md` — Twitter queue
- `scripts/check-test-order-v2.mjs` — ad-hoc DB probe

### Memory layer
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/worry-admin-inbox-redesign-resolved-2026-04-28.md` — new
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/MEMORY.md` — index updated

## What Didn't Work

- **Tried to verify mono `apps/web/` build via `npx tsc --noEmit --skipLibCheck`** — 227 pre-existing TS errors (mostly `Cannot find module '@anthropic-ai/sdk'` / `@supabase/supabase-js` / `implicitly has 'any' type`). Workspace pnpm hoist doesn't expose those to apps/web via the junctioned worktree. Pre-existing, not blocking. Mono has a different verification gate (Next.js build).
- **`vitest` not in worktree's apps/web/node_modules/.bin** — pnpm hoists to root. Worktree's `npm test` failed with "vitest not recognized". Skipped vitest verification for the same reason.
- **Tried to fast-forward pull `-web` master** — diverged because local had `257edf07` (Rahim's docs commit not on origin) AND origin had 16 new commits. Resolved via `backup-` branch + hard-reset.
- **Initial misdiagnosis of orphaned working tree as "from this session"** — the inbox-migration plan said "Action Required (Next Session)" implying an earlier session had been blocked. Did not actually waste time on this.
- **`gh pr checks 24`** failed with exit 1 (rtk wrapper noise). Used `gh api repos/.../check-runs` directly instead.

## Source-Doc Close-Loop (this session)

Procedure docs / scripts updated inline this session:

- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/MEMORY.md` — index for new memory file
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/worry-admin-inbox-redesign-resolved-2026-04-28.md` — captures the "diff mono apps/web FIRST before back-porting -web" lesson
- `docs/plans/2026-04-28-inbox-migration-pending-commit.md` — was the gate; this session resolves it (commit message references)

NOT updated (worth surfacing for future):
- The 3 plan files in mono `apps/web/docs/plans/` were copied verbatim from `-web` and reference `-web` paths (e.g., the migration-pending plan says `20260428b` but mono uses `20260428i`). Future readers see the conflict; the commit message of mono PR #24 documents the rename. Could be tightened in a follow-up.

## Remaining Steps
None for this surface. Items genuinely out of our hands:
- GHA reindex incident (resolves on GitHub's clock)
- 257edf07 backup branch — Rahim to decide whether to push or drop
- 2 residual plan items (img-proxy TOCTOU + session-lock review followups) tracked for future sessions

## Verification

- `gh pr view 222 --repo rahim0kapadia/ImNotAnAttorney-web --json state,mergeCommit` — `MERGED`, `0a654bad`
- `gh pr view 24 --repo rahim0kapadia/ImNotAnAttorney --json state,mergeCommit` — `MERGED`, `72577db7`
- `gh pr view 223 --repo rahim0kapadia/ImNotAnAttorney-web --json state,mergeCommit` — `MERGED`, `af9db1bd`
- `git status` in `C:/Users/email/projects/ImNotAnAttorney-web` — clean, on `master` at `af9db1bd`
- Migration verify (DDL idempotent — no-op re-run is the verification):
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='inbound_emails'
    AND column_name IN ('starred','snoozed_until','labels');
  -- 3 rows expected
  ```

## Context Artifacts

- This handoff: `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-28-admin-inbox-shipped.md`
- Source handoff (continuation from): `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-28-claude-md-callout-mono-idv2-decision-hook-upgrade.md`
- Memory: `C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\worry-admin-inbox-redesign-resolved-2026-04-28.md`
- Backup branch: `backup-257edf07-rahim-smoke-doc` (local only, in `-web` checkout)
- Migration file (-web): `supabase/migrations/20260428b_inbox_features.sql`
- Migration file (mono): `apps/web/supabase/migrations/20260428i_inbox_features.sql`
- Residual plan (img-proxy TOCTOU): `docs/plans/2026-04-28-img-proxy-toctou-residual.md`
- Residual plan (session-lock review): `docs/plans/2026-04-28-session-lock-start-review-followups.md`

## Next-Session Prompt (copy-paste verbatim)

```
Execute the bar-discipline followup plans:

1. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-26-followup-mn-discipline-historical-years.md
2. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-26-followup-ma-bbo-full-coverage.md

Context:
- 8-state bar-discipline batch reached pristine 2026-04-26 — 22,998 events, 19 jurisdictions, 100% HTTPS source URLs, anti-hallucination audit clean. Memory: C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\worry-bar-discipline-pristine-resolved-2026-04-26.md
- IB rendering wire-up (PR #152) shipped 2026-04-27 — events are NOW visible to paying customers via the $997 IB tier. Plans at C:\Users\email\projects\_worktrees\worry-attorney-discipline\docs\plans\2026-04-25-worry-attorney-discipline-wire.md
- MN currently has 102 events but only recent years; plan tries lro.mn.gov first → mnbars.org → OCR last
- MA currently has 25 events; BBO is a Salesforce SPA, plan tries Playwright with 30-60s wait → classified_opinions cross-ref → mass.gov bar docket

Hard rules to enforce:
- C:\Users\email\.claude\rules\no-hallucinated-legal-data.md — every event MUST have a real, HTTPS, 200-OK source_url. Re-run anti-hallucination audit after ingest (pattern at C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\pattern-anti-hallucination-audit-query.md).
- C:\Users\email\projects\.claude\rules\cl-bulk-data-defensive.md — gotcha #18 (COPY > INSERT for bulk) and #20 (codebook display ≠ raw datafile, verify with SELECT DISTINCT before encoding lookups).
- C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory\gotcha-self-generated-fixture-passes-buggy-parser.md — never trust a parser when the agent also wrote the fixture; always validate against live source.
- Deploy scope: this -web repo does NOT deploy. Mirror landing changes to C:\Users\email\projects\ImNotAnAttorney\apps\web\ via the worktree pattern (git worktree add -b <slug> .claude/worktrees/<slug> origin/master). Scrapers + scripts may live in -web; data writes hit shared Supabase regardless.

Pristine-or-nothing applies — fix every reviewer finding (CRITICAL + WARNING + SUGGESTION). No "defer the warnings."

Start: read both plan files, triangulate the .01% expert for state-bar-disciplinary-data scraping (cache likely empty — run expert-triangulation skill if so), pick one state to ship first based on which has the lower-effort source per the plan.
```

Alternative directions if you want to pick a different lane next session — see "Open items" in the chat right before /save-and-clear was invoked: img-proxy TOCTOU upgrade (#2), session-lock review fixes (#3), 257edf07 backup branch decision (#4), INNA-H11 cron-ids restoration (#5).
