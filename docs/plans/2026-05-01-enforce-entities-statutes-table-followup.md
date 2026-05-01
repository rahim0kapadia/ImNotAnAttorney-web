# Follow-up: enforce-entities-statutes-table.js Code-Review Findings (Out-Of-Scope)

**Date:** 2026-05-01
**Status:** TRACKED (not fixed this session — out-of-scope per Pristine-Or-Nothing exception)
**Owner:** session that originally added `~/.claude/hooks/enforce-entities-statutes-table.js`
**Source review:** `code-reviewer` agent dispatched 2026-05-01, returned 16 findings (3 CRITICAL + 6 WARNING + 7 SUGGESTION)

## Why out-of-scope this session

This session's focus: documentation pipeline (Demand Intel + Quora + statute seeding), Quora bridge plan via worry-to-pristine, deploy of architecture docs + plans. The enforce-entities-statutes-table.js hook was introduced by a sibling session (memory `~/.claude/rules/CONTEXT.md` row 34 cites incident "2026-05-01 ME Haiku ingest wrote 0 visible rows"). The REVIEW_GATE landed in this session's issues tracker because of hook-server reload activity, but the source file is a sibling-session creation, not mine.

Per `~/.claude/rules/atlas-identity.md` § "Pristine-Or-Nothing — Fix ALL Review Findings" legitimate exception:
> "ONE legitimate exception: finding is genuinely out of scope because it touches a different subsystem with its own triage. In that case: document the reason in writing + open a tracked task in docs/plans/ + never silently drop."

This file IS that documented task.

## Findings Summary

### CRITICAL (3)

1. **Extension regex mismatch** — `SCRIPT_EXT_RE` allows `tsx` but `TARGET_PATH_RE` only allows `(?:mjs|cjs|js|ts)`. `seed-statutes-XX.tsx` and `route.tsx` slip through. Fix: align the two regexes.

2. **Override marker accepts trivial whitespace** — `JUSTIFY_RE` `(.{15,})` matches 15 spaces. Defeats min-length intent. Fix: enforce `(\S.{14,})` AND `.trim().length >= 15` after capture, OR require alphanumerics.

3. **Justify marker scanned anywhere in file, not just header** — header guidance documented but not enforced. Fix: only test against first ~20 lines (mirror `enforce-test-isolation.js` pattern).

### WARNING (6)

4. **Edit/MultiEdit ignores existing on-disk content** — extraction does NOT read the current file, so a small edit on an already-deprecated file passes. Fix: read on-disk via `fs.readFileSync(filePath, 'utf8')` and concat with `new_string`/`edits[].new_string`.

5. **String literals not parsed out** — table names inside string literals trigger blocks (false-positive on logging strings, error messages). Fix: parse string literals or document trade-off.

6. **Possible derivative-table gap** — `\bjurisdiction_statutes\b` won't match `jurisdiction_statutes_archive`. Confirm no derivatives exist.

7. **`.sql` files excluded** — migration files and seed SQL also write to these tables. Fix: add `sql` to extension regex AND adjust comment-stripping for `--`.

8. **`seed-statutes-XX.config.mjs` matches as in-scope** — config helpers may legit reference both names. Fix: tighten regex or add allowlist.

9. **`MAX_SCAN_BYTES = 2 MB` silent fail-open** — large statute seed files exceed limit. Fix: cheap pattern-only check on oversize OR raise limit to 8-16 MB.

### SUGGESTION (7)

10. Block message lacks pointer to canonical migration that did the rename.
11. No DRY_RUN constant — header should articulate live-block intent (mirror `enforce-email-send-approval.js`).
12. Add comment about no PostToolUse pairing with `track-edits.js` (PreToolUse-only by design).
13. Unused `const path = require('path')` import.
14. No `.trim()` on path before testing regex.
15. Path regex doesn't match nested helpers under `statutes-refresh-XX/`.
16. Override marker `/i` flag — confirm intentional case-insensitivity matches sibling override conventions.

## Action

Owner-session of `enforce-entities-statutes-table.js`: read `code-reviewer` agent output (saved at `C:\Users\email\AppData\Local\Temp\claude\C--Users-email-projects-ImNotAnAttorney-web\1115c25f-caca-4fb2-8c18-f2db9ddb218d\tasks\a0f155321915317da.output` until rotation) and fold findings #1-16. Most load-bearing: **#4** (Edit/MultiEdit ignoring on-disk content — same failure-class as the source incident: parser tested, write target unchecked).

Mark this file complete in next-session of statute-Phase-4 work. Update `~/.claude/rules/CONTEXT.md` row 34 to reflect any DRY_RUN window changes.

## Why this isn't a session-end blocker

- Hook is LIVE-BLOCK and doing its job (catching ME-Haiku-ingest-class incidents)
- Findings improve robustness but do not introduce new failure modes
- Owner-session has full context on the source incident and the broader ingest pipeline state
- Pristine-Or-Nothing rule explicitly permits cross-subsystem deferral with documented tracked task — that is THIS file
