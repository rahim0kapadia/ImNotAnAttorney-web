# Pipeline Runner Shell-Injection Fix — 2026-04-26

## Worry / Source

Audit Angle 3 (`docs/plans/2026-04-26-german-audit-angle-3-duplication.md`)
finding **F-3 Family C**: `scripts/pipeline-runner.mjs:89` uses `execSync`
with shell-interpolated message string. Parent's `blog-pipeline/scripts/
quora-auto.mjs:912` already migrated to `spawnSync` (array form, shell:false,
timeout, length cap, windowsHide:true). Backport not propagated to web.

## Architectural Invariants Touched

ARCHITECTURE.md inventory of 14 invariants — none violated by either the bug
or the fix. The fix is a defense-in-depth hardening on a shell-quoting hole
that pre-dated the invariant list. Adding it raises the floor.

## Subsystem context (scripts/CONTEXT.md)

`pipeline-runner.mjs` is in the "Tier 9 Data Pipeline" cluster of scripts
that chain bulk extractors. Calling pattern: invoked manually or via cron,
sequentially runs hardcoded `STAGES` array, sends a Telegram summary at end.
Fix preserves that calling pattern.

## Files to Modify

`scripts/pipeline-runner.mjs` (single file, three localized edits):
- Line 12: import — add `spawnSync` to existing `child_process` import
- Lines 89-98: `sendTelegram` — replace execSync with spawnSync array-form
- Lines 121-125: `runStage` — add `windowsHide: true` to options

## Files to Create

None.

## Tasks

1. Edit import line (1 line change)
2. Replace `sendTelegram` body (~10 lines)
3. Add `windowsHide: true` to `runStage` execSync options
4. Smoke-test: `node scripts/pipeline-runner.mjs --dry-run`
5. Commit + push to `fix/pipeline-runner-shell-injection`
6. Open PR

## Out of Scope

- The `runStage` execSync(stage.cmd) shell-mode call — `stage.cmd` is
  hardcoded in STAGES array (lines 58-83), no user input flows in.
- The other 9 sendTelegram copies elsewhere in web (cron routes use the
  inline-fetch pattern, separate fix at F-3 Family A in audit findings).
- Re-architecting pipeline-runner.mjs into a stage-runner abstraction.

## Success Criteria

- `git diff` shows changes only in `scripts/pipeline-runner.mjs`
- `node scripts/pipeline-runner.mjs --dry-run` runs without error
- New `sendTelegram` cannot be exploited by message contents (verifiable by
  reading the code: array form with `shell: false`, no string interpolation)
- `windowsHide: true` present in both subprocess calls
- PR opens cleanly off `master`

## Cited Source

- Parent canonical implementation: `C:/Users/email/projects/ImNotAnAttorney/blog-pipeline/scripts/quora-auto.mjs:912-925`
- Rule: `~/.claude/rules/drafts/enforce-windowshide.md`
- Audit finding: `~/projects/ImNotAnAttorney/docs/plans/2026-04-26-german-audit-angle-3-duplication.md` F-3 Family C
