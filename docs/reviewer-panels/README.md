# Reviewer Panels

Config files for `scripts/reviewer-fanout.mjs` — the Fateev/Temporal-pattern durable reviewer fan-out that replaced the Anthropic Agent tool for reviewer passes.

## Why this exists

The Agent tool hangs. On 2026-04-19 a 7-parallel reviewer pass on the score-rename batch ended with 4 agents in permanent limbo (no completion notification, `TaskStop` returned "not found"). 30 min of status-theater.

Root cause: no `schedule_to_close_timeout` primitive on the Agent tool. The SDK can't guarantee return.

Fix: Maxim Fateev's durable-execution pattern — shell out to `claude -p` subprocesses, enforce per-reviewer timeout at the OS level, collect partial results, never block.

## Usage

```bash
node scripts/reviewer-fanout.mjs --config docs/reviewer-panels/default.json

# or with a custom output dir
node scripts/reviewer-fanout.mjs --config docs/reviewer-panels/default.json --out docs/reviews/2026-04-19-score-rename

# or with different concurrency (default 4)
node scripts/reviewer-fanout.mjs --config docs/reviewer-panels/default.json --concurrency 2
```

Output lands in `docs/reviews/<ISO-timestamp>/`:

- `<slug>.md` — raw reviewer stdout per reviewer
- `<slug>.meta.json` — status, duration, exit code, bytes
- `_summary.md` — at-a-glance table

## Config shape

JSON array of reviewer specs:

```json
[
  {
    "slug": "correctness",
    "model": "sonnet",
    "timeoutSec": 480,
    "prompt": "Review the diff at {{FILE:.tmp-core-diff.txt}} for bugs..."
  }
]
```

- `slug` — filename prefix, must be unique per panel
- `model` — `sonnet` | `opus` | `haiku` (passed to `claude -p --model`)
- `timeoutSec` — kill deadline in seconds (default 480)
- `prompt` — the review prompt. Supports placeholders:
  - `{{FILE:<path>}}` — inline contents of file (relative to cwd or absolute)
  - `{{CWD}}` — absolute path to current working directory

## Exit codes

- `0` — all reviewers returned within deadline
- `1` — at least one reviewer timed out (partial results still written)
- `2` — usage error / config malformed

## Why 3 reviewers not 7

Process decision (Laja synthesis lesson from 2026-04-19): bundle concerns per agent instead of spawning 7 narrow specialists. Each Claude session can wear multiple expert lenses sequentially. Same coverage, 3× faster wall-clock, synthesis happens inside the agent instead of in the main Claude afterward.

Default panel:

1. **correctness** (sonnet) — code + security + a11y bundle
2. **strategy** (opus) — Dunford + Laja + Suby synthesis
3. **legal** (opus) — UPL + CAN-SPAM

Add panel variants for different review scopes (e.g., `docs/reviewer-panels/pricing-changes.json`, `docs/reviewer-panels/email-templates.json`) rather than cramming everything into default.

## Shared-triage panels — use when cycling starts

`default.json` is stateless — each reviewer sees only the diff. That's fine for round-1 audits but reviewers pull copy toward their own lens and contradict each other on subsequent rounds. Symptom: the same file/line gets rewritten 3+ times with opposite verdicts across rounds.

Fix: run a **shared-triage panel** that injects buyer archetypes + HARD brand rules + locked decisions from prior rounds into every reviewer prompt. Reviewers then synthesize instead of cycle.

Canonical example: `docs/reviewer-panels/inaa-copy.json` — carries (a) 3-tier buyer archetype (crisis defendant / bondsman partner / family), (b) 6 HARD brand rules with source-file citations (e.g., "NEVER sell on speed" with pointer to `brand-voice.md`), (c) locked copy decisions from rounds 1-8, (d) an explicit synthesis protocol that tells reviewers to propose tradeoffs rather than unilaterally reopen.

**When to use which:**
- `default.json` — first audit of a brand-new area. Stateless, neutral.
- `inaa-copy.json` — any round 2+ on INAA copy. Carries the locked-decisions context.

Authoring a shared-triage panel for another scope (emails, pricing, onboarding, etc.): copy `inaa-copy.json`, rewrite the triage block with that scope's buyer + rules + locked decisions. Keep the synthesis-protocol paragraph; that's the anti-cycling mechanism.

## Prerequisites

`claude` CLI on PATH (Claude Code install). Each subprocess spawns its own Claude Code session scoped to `{{CWD}}` so project memory, CLAUDE.md, ARCHITECTURE.md all load automatically.

## Authoring new panels

Steal from `default.json`. Change slugs, prompts, models, timeouts. Save as `docs/reviewer-panels/<scope>.json`. Commit.
