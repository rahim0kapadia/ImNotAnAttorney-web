# Per-Tier Generation-Mode System — Orphan-Recovery Resume Plan

**Date:** 2026-04-23
**Status:** ORPHAN — partially built by an earlier session that crashed before completion. Salvaged work preserved on remote rescue branches; original plan file lost.
**Trigger to resume:** when the case-decoder dispatcher work needs to land OR when session-mode delivery is needed.

## What Was Being Built

A per-tier dispatcher in `src/app/api/generate/case-decoder/route.ts` that reads a `tier_generation_config` table and routes case-decoder generation to one of three execution modes:

1. **`api`** — existing Edge Function path (current default)
2. **`mechanical`** / **`hybrid`** — POST to a new Next.js route that runs a mechanical skeleton + parallel Haiku calls (cheaper, faster than full LLM)
3. **`session`** — write `awaiting-session-generation` status + Telegram-notify Rahim to paste a Claude Code session prompt + manually deliver final HTML

Original plan file: `docs/plans/2026-04-23-per-tier-generation-mode.md` — **lost in crash, not recoverable**. Reconstruct from artifacts below.

## What Landed (preserved on remote)

### Branch: `feat/tier-ladder-deferred-closure` (commit `131e3199`)

3 new API routes — all on the branch, **none on master**, none yet PR'd:

| File | Lines | Purpose |
|---|---|---|
| `src/app/api/admin/session-report/[caseId]/route.ts` | 84 | Admin POST endpoint — operator pastes final HTML for a `session`-mode case; flips status to `delivered`, sends delivery email |
| `src/app/api/cron/notify-session-handoff/route.ts` | 65 | Cron POST endpoint — fires a Telegram message with the exact paste-prompt for a pending `session`-mode case |
| `src/app/api/reports/hybrid/[caseId]/route.ts` | 120 | Operator POST endpoint — runs `renderCaseDecoderHybrid` in `after()`, writes `report_html` + sets `status=review` |

### Stashes (sibling-session WIP, NOT to touch without coordination)

- **`stash@{0}` "pre-rebase-2"** — the case-decoder dispatcher block (~74 LOC) in `src/app/api/generate/case-decoder/route.ts`. Reads `getTierGenerationMode("case-decoder")` and dispatches to `mechanical` / `hybrid` / `session` paths.
- **`stash@{1}` "pre-rebase-unrelated"** — subset of stash@{0} (dispatcher only, without the OPP resumable ingest patch).

## What Is MISSING (must be created before 131e3199 routes can ship)

The 3 routes in `feat/tier-ladder-deferred-closure` import / reference these modules and resources that **do not exist on master**:

| Missing artifact | Required by | Likely shape |
|---|---|---|
| `src/lib/report/mode-config.ts` | dispatcher (stashes) | exports `getTierGenerationMode(tier: string): Promise<"api" \| "mechanical" \| "hybrid" \| "session">` — reads from `tier_generation_config` table |
| `src/lib/report/hybrid/render-case-decoder.ts` | `reports/hybrid/[caseId]/route.ts` | exports `renderCaseDecoderHybrid(intake, apiKey): Promise<{ html: string; costUsd: number }>` |
| `scripts/generate-session-handoff.mjs` | `notify-session-handoff` Telegram message body references it as the operator command | CLI script that reads a case + intake + emits a Claude Code session prompt to stdout |
| `tier_generation_config` table | `getTierGenerationMode` lookup | columns: `tier text PK, mode text NOT NULL CHECK (mode IN ('api','mechanical','hybrid','session')), updated_at timestamptz` |
| Migration for `tier_generation_config` | schema lookup | `supabase/migrations/<date>_tier_generation_config.sql` |
| Admin UI to flip per-tier mode | operator workflow | small admin page or direct DB edit; not blocking |
| `cases.session_generation_payload` jsonb column | `session-report` route reads it; `notify-session-handoff` patches it | migration ADD COLUMN |
| `cases.generator_mode` text column | all 3 routes write it | likely already on master via earlier work — verify |
| `cases` status enum extension: `awaiting-session-generation` | dispatcher writes it; `session-report` reads it | extend status check constraint |

## Resume Sequence (when ready to ship)

1. **Audit existing schema** — `\d cases` to confirm `generator_mode`, `session_generation_payload`, `report_format_version` columns exist; check status enum/CHECK constraint
2. **Write the missing modules** in this order (each can be tested in isolation):
   - `src/lib/report/mode-config.ts` (small, depends only on Supabase admin client + the new table)
   - Migration for `tier_generation_config` table + cases column additions
   - `src/lib/report/hybrid/render-case-decoder.ts` (the largest unknown — references `intake.*` shape, mechanical skeleton + Haiku calls, citation tag stripping)
   - `scripts/generate-session-handoff.mjs` (CLI, reads case + intake → stdout)
3. **Apply stash@{0} or stash@{1}** to wire the dispatcher into `case-decoder/route.ts`
4. **Cherry-pick `131e3199`** from `feat/tier-ladder-deferred-closure` (or rebase the whole branch — drop the 3 superseded commits 64d9ba7a, 5e65c9ae, dca61367 first since their content is on master)
5. **Add tests:**
   - `src/lib/report/__tests__/mode-config.test.ts` — mocks Supabase, asserts each mode value
   - `src/lib/report/hybrid/__tests__/render-case-decoder.test.ts` — fixture intake → assert html shape + cost number
   - integration: dispatcher with each mode → assert correct route POST'd / status set
6. **`npx tsc --noEmit --skipLibCheck && npm run build`** — both must pass
7. **Default `tier_generation_config.case-decoder.mode = 'api'`** at migration time so behavior is identical to today; flip per-tier only when each new path is verified

## Cascade Check

- us: ship a system the previous session paid for; reduce per-CD cost via mechanical/hybrid mode when ready
- buyers (CD tier): faster generation in `hybrid` mode; rich Rahim-curated `session` mode for high-value cases
- operators (Rahim): Telegram-driven workflow for `session` mode; admin UI for mode flips
- future-us: pattern extends to other tiers (intelligence-brief, X-Ray) once proven on case-decoder
- ecosystem: no node loses

## DO NOT

- Do NOT PR `feat/tier-ladder-deferred-closure` as-is — the 3 routes will fail `npm run build` because they import missing modules
- Do NOT drop `stash@{0}` or `stash@{1}` until the dispatcher block is committed to a branch (those stashes are the only copy of that code outside an editor buffer)
- Do NOT touch `tier_generation_config.case-decoder.mode` in prod until all 3 paths verified

## Branch / Stash Inventory

| Resource | Location |
|---|---|
| 3 new routes (`131e3199`) | `feat/tier-ladder-deferred-closure` (local + origin) |
| Dispatcher block | `stash@{0}` / `stash@{1}` (local stash, not on remote) |
| Original plan | LOST — reconstruct from this doc |

## Triangulation

No external expert applies — this is internal Next.js + Supabase wiring. Reference:
- Existing tier-routing pattern: `src/app/api/generate/case-decoder/route.ts` itself (the file the dispatcher modifies)
- `after()` pattern for fire-and-forget: per `pattern-after-for-vercel-fire-and-forget.md` memory
- Telegram bot pattern: `node ~/.claude/scripts/telegram/telegram-send.js` per CLAUDE.md
