---
description: Run a full worry-to-pristine pass on a named subsystem — 4 phased stacked branches, subagent-driven, auto-mode by default.
---

# /worry-to-pristine

Bring a named subsystem from "it works but I worry about it" to pristine. Four phased stacked branches, subagent-driven execution, PRs that merge in order.

**Target subsystem:** $ARGUMENTS

If `$ARGUMENTS` is empty, ask the user which subsystem first. Otherwise proceed autonomously.

---

## Operating mode

**Default is auto-mode.** Don't ping the user between phases. Make judgment calls and document them in commit messages. Only stop for genuine blockers (interactive credential prompt, destructive action outside the scope of one phase, conflicting signals from the codebase that need owner input).

Ping the user only for:
- Interactive secrets (Windows Credential Manager, `gcloud auth login`, etc.)
- Irreversible or cross-repo actions
- A plan that needs owner judgment (e.g., "rate-limit gap X could be 20/hour or per-partner — which?")

Otherwise: keep shipping.

---

## Required sub-skills (in order)

Invoke via the `Skill` tool:

1. **`superpowers:brainstorming`** — scope the pristine pass. Decide which surfaces are in/out. Get user buy-in on the bar ("nothing broken" vs "production hardened" vs "cold-traffic ready" vs all three).
2. **`superpowers:writing-plans`** — expand each phase's outline into an executable TDD plan with bite-sized tasks + exact files + exact commands.
3. **`superpowers:subagent-driven-development`** — dispatch one implementer subagent per task. Fresh context per task. Verify each against spec before moving on.

Do NOT invoke other skills in the middle of a phase unless the subagent requests it. Skills layer; flapping between them pollutes context.

---

## Phase stack (standard 4)

Each phase = one branch off the prior phase's tip. Each ships its own PR. Merge order: 1 → 2 → 3 → 4. If Phase N's design turns out different, rebase or renumber — the structure is a starting point, not a cage.

### Phase 1 — Baseline salvage + regression guardrails
**Branch:** `fix/<subsystem>-wip-salvage` (or `fix/<subsystem>-baseline`)

- Audit any uncommitted WIP, in-flight branches, or unresolved merge markers touching the subsystem.
- Salvage the safe pieces; discard the regressive pieces.
- Add regression tests that make each discarded piece IMPOSSIBLE to re-attempt silently (capture-the-select-arg tests for untyped ORMs, structural source-text tests for coupling edges, inline comments at the coupling write-sites naming the consumers).
- Fix any pre-existing tsc errors inherited from baseline.

**Exit:** branch tsc = 0, vitest green, WIP fully accounted for (salvaged or discarded), each discard has a test guarding it.

### Phase 2 — Coverage gap fill
**Branch:** `chore/<subsystem>-e2e-coverage` (or `chore/<subsystem>-coverage`)

- **Before writing any new spec, audit existing coverage.** In the partner-portal run this shrank the scope from 3 new specs to extending 1 existing spec. Existing coverage is almost always richer than the design doc assumes.
- Fill the real gaps, not the imagined ones.
- If the spec surfaces an engine gap (e.g., missing canonical tag, wrong twitter:card), **fix the engine driven by the spec's contract** — this is `.claude/rules/fix-engine.md` in action.
- Add the coverage map to `ARCHITECTURE.md` so future sessions don't duplicate.

**Exit:** spec files compile, `--list` enumerates expected test count, coverage map documented, any engine gaps uncovered during spec writing fixed in the same PR.

### Phase 3 — Hardening
**Branch:** `fix/<subsystem>-hardening`

Narrow the design doc's audit list to what's **shippable in one session without live-prod access**. Defer everything else with explicit follow-up flags.

Ship:
- zod schemas for the top-risk route(s) (strict mode, length caps, enum refinements).
- Structural auth-boundary audit test (every gated route calls the auth helper; no route accepts identity from request body/query; public-route allowlist documented).
- Rate-limit + env-var inventories in `ARCHITECTURE.md` (document-only, flag gaps as follow-ups).
- Continuous-verification probe script (if observability is in scope).

Defer: full RLS audit (needs Supabase admin), Sentry wiring (needs external config), perf profiling (needs production), complete zod rollout across all routes.

**Exit:** schemas + auth test green, inventories committed, CV probe script compiles.

### Phase 4 — Mechanized polish
**Branch:** `polish/<subsystem>-copy-ux`

Skip what needs live-browser judgment. Ship what mechanizes:
- axe-core WCAG AA audit spec (Playwright + `@axe-core/playwright`) — fails on critical/serious; warns on moderate/minor.
- UPL / brand-voice static scan test — read page source text and assert no banned phrases appear (hard-fail, conditional-fail with permitted disclaimer scrub, soft-warn).

Defer: adversarial walkthrough (needs live URL + screenshot review), brand-voice line edits, 375px mobile pass.

**Exit:** a11y spec enumerates, UPL scan green, any hard-fail surfaced is reported to the user (not auto-fixed — copy changes need owner judgment).

---

## Lessons carried from the partner-portal pristine run (2026-04-21)

These are non-obvious gotchas that will re-bite on the next subsystem unless remembered:

1. **Untyped Supabase client `.select<Query>` parses literal strings at the type level.** Template-literal interpolation of SELECT columns widens to `string` and cascades TS2339 across every consumer. Keep SELECT literals; enforce column presence via runtime capture-the-arg tests, not runtime concatenation.
2. **Existing coverage > new specs.** Inventory `e2e/*.spec.ts` before writing. In the partner run we nearly rebuilt 311 LOC of partner-walkthrough that already shipped.
3. **Hidden middleware→layout header couplings are invisible until broken.** When middleware sets a request header consumed by `layout.tsx` or similar, add an inline comment at the write-site naming the consumer, plus a structural regression test. Neither side references the other by name otherwise.
4. **Concurrent sessions will switch branches under you.** Every subagent prompt must include `git branch --show-current` → re-checkout if wrong, as the first steps. Auto-mode cannot assume branch stickiness.
5. **Windows Credential Manager + `git push` hangs silently in non-interactive shells.** Push must be attempted in the user's interactive shell (via `!` prefix) if the push tasks hang at 0-byte output. Don't retry — escalate.
6. **Google Drive-backed working trees corrupt `npm install` tar extraction.** Packages install as zero-byte stubs. Workaround: `npm pack` + manual `tar -xzf --strip-components=1`. Flag the user to migrate off Drive-synced paths.
7. **Structural source-text tests are the correct tool when the failure mode IS "someone deleted a line."** Don't over-engineer with full route mocks when the guarantee you need is "this string appears in this file." For dashboard response spreads + middleware header sets + UPL phrase scans, text-level is fit-for-purpose.

---

## Reporting

After each phase's PR push, emit a short user-facing summary:
- Branch name + commit count on branch
- Tsc error count, vitest pass count
- PR-creation URL (GitHub prints it on push)
- What shipped (3-5 bullets)
- Follow-ups (if any) flagged in inventories

After Phase 4's push, emit the full pristine-pass report:
- All four branch names + PR URLs in merge order
- Total commits, total new tests
- Known follow-ups categorized by who acts (user-driven / ops-driven / infra-driven)
- Any session-boundary blockers (credential prompts, missing CLIs, etc.)

Do NOT announce mid-phase progress beyond the skill handoffs. Stay silent while subagents work — the TaskList already shows progress.
