# Plan: CLAUDE.md Deploy-Scope Callout (-web Ecosystem Section)

**Date:** 2026-04-28
**Author:** Atlas (continuation of `docs/handoffs/2026-04-28-archetype-validation-followups.md`)
**Triage:** FEATURE (auto-upgraded from QUICK_FIX after edit count crossed 2)
**Approval:** Rahim said "do it" in chat re: recommendation #1 ("CLAUDE.md ecosystem fix").

## Why

Today's PR #219 silently shipped to nowhere because Vercel's `imnotanattorney` project was relinked to `ImNotAnAttorney/apps/web/` during cutover, but `-web/CLAUDE.md`'s ecosystem table still presents `-web` as "Next.js customer-facing site (THIS REPO)" with no annotation that it's read-only-for-deploys. A future session reading just the ecosystem table will assume "this repo deploys" and merge a fix to nowhere again.

Cascade test:
- Us / future-us: prevents repeat of today's silent-deploy class across every session.
- Rahim: zero re-debug overhead next time.
- Sibling sessions: see the deploy reality immediately.
- Ecosystem (other Claude Code teams running monorepo cutovers): publishable pattern.
- No node loses.

## Files to modify

| Path | Change |
|---|---|
| `C:\Users\email\projects\ImNotAnAttorney-web\CLAUDE.md` | Insert one paragraph between the "Default boundary" line and "How repos connect:" — calls out: (a) Vercel project ID + monorepo `apps/web` rootDirectory, (b) what STILL belongs in -web (blog drafts, Twitter queue, cron registration, docs), (c) verify-link-state curl command, (d) memory pointer to `gotcha-vercel-project-cutover-silent-abandon.md`. |

## Files to create

None.

## Tasks

1. Edit `-web/CLAUDE.md` insertion point per the file table above. Use the bold `⚠ DEPLOY SCOPE` callout text already drafted in the chat exchange immediately preceding this plan.
2. Verify the insertion lands (file diff readable, no other lines drift).

## Out of scope

- Mirroring the callout into `ImNotAnAttorney/CLAUDE.md` and `ImNotAnAttorney/apps/web/CLAUDE.md` — those already document the deploy reality clearly (lines 9, 33, 64-66 of root; lines 44, 70-74 of apps/web). Adding here would be duplicate noise.
- Writing a hook to enforce "don't push to -web/master" — the gotcha memory + this CLAUDE.md callout cover the human path. A hook is over-engineering for a one-time cutover whose end-state is "-web fully retired".
- Retiring `-web` entirely — separate, larger decision.

## Verification

After edit:
- `git diff CLAUDE.md` shows ONE inserted block, zero unrelated changes.
- The ecosystem table renders unchanged.
- The new paragraph appears between the "Default boundary" line and "How repos connect:".
