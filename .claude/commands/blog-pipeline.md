---
name: blog-pipeline
description: Session-native blog pipeline — generates, QA-gates, fixes, publishes, and captures flywheel patterns. Use when running blog QA, generating new posts, or processing the blog backlog. Requires Opus session. No API calls, no subprocesses.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Agent, WebSearch, WebFetch
model: opus
argument-hint: "[qa <slug> | generate | regrade | editorial]"
---

# Blog Pipeline — Session-Native Execution

## Model Gate

**YOU ARE THE LLM.** If you are not on Opus, STOP:

> BLOCKED: Blog pipeline requires Opus. Anti-hallucination evaluation on sub-Opus is unsafe.

## Iron Law — No API, No Subprocess

- NEVER call `api.anthropic.com` or import `@anthropic-ai/sdk`
- NEVER spawn `claude -p` subprocesses
- NEVER run `node scripts/qa-existing-post.mjs` with LLM gates
- The session reads the rubric, reads the MDX, evaluates inline, writes the result
- Humanizer is the ONE exception — pure JS, run via `node --input-type=module`

## Commitment

Print at start: `[blog-pipeline] Mode: {mode} | Model: Opus | Session-native execution`

## Invocation Modes

| Command | Behavior |
|---------|----------|
| `/blog-pipeline` | Full: editorial capture -> regrade stale -> generate new |
| `/blog-pipeline qa <slug>` | QA + fix loop on single post |
| `/blog-pipeline generate` | Generate from content_gaps only |
| `/blog-pipeline regrade` | Regrade stale/failing posts only |
| `/blog-pipeline editorial` | Editorial capture only |

Batch defaults: `BLOG_PIPELINE_GENERATE_BATCH` (1), `BLOG_PIPELINE_REGRADE_BATCH` (5).

## Stage Execution

Read each stage's reference file BEFORE executing that stage. Print checkpoint after each.

**1. PATHS** — Read `blog-pipeline/paths.md`. Set WEB_ROOT.

**2. SELECT** — Read `blog-pipeline/select.md`.
- Full mode: run 1A (editorial) -> 1B (regrade) -> 1C (generate). Each independent — failure in one MUST NOT block others.
- `generate` mode: 1C only.
- `regrade` mode: 1B only.
- `editorial` mode: 1A only.
- `qa <slug>` mode: skip SELECT, use provided slug.
- Print: `[Stage 1: SELECT complete — {n} editorial, {n} regrade, {n} generate]`

**3. GENERATE** — Read `blog-pipeline/generate.md`. For each selected content gap.
- Print: `[Stage 2: GENERATE complete — {slug} written ({n} words)]`

**4. QA GATES** — Read `blog-pipeline/qa-gates.md`. Run 5 gates per post.
- Print: `[Stage 3: QA complete — {results summary}]`

**5. FIX LOOP** — Read `blog-pipeline/fix-loop.md`. Only if gates failed.
- Print: `[Stage 4: FIX complete — cycle {n}, {outcome}]`

**6. PUBLISH + FLYWHEEL** — Read `blog-pipeline/publish-and-flywheel.md`.
- Print: `[Stage 5+6: PUBLISH complete — committed {hash}, {n} flywheel patterns]`

## Batch Context Management

For batch runs processing 3+ posts: after each post completes all stages, print full post summary. If context exceeds 60%, print warning:
> Context is above 60%. Remaining posts may experience adherence degradation. Consider completing current batch and running `/blog-pipeline` again for remaining posts.

## Rationalization Table

| If you're thinking... | Reality |
|-----------------------|---------|
| "I'll call the API for just this one gate" | Rule #1 exists because inline eval is MORE accurate — you have full conversation context. API calls lose that. |
| "The rubric is too long, I'll summarize the checks" | Summarizing rubrics causes missed checks. Read the full rubric. It's only 30-45 lines. |
| "I'll skip the humanizer, it always passes" | Humanizer is instant (pure JS). Skipping saves zero time and misses regression detection. |
| "I can evaluate all 5 gates at once without reading each rubric" | Each rubric has specific check IDs and thresholds. Evaluating from memory produces hallucinated check results. |
| "This fix is small, I don't need to re-run anti-hallucination" | Any edit can introduce a fabricated claim. Anti-hallucination re-check is inline and nearly free. ALWAYS re-run it. |
| "I'll just publish without the QA — it looks fine" | "Looks fine" is not evidence. Gates exist because human judgment misses UPL violations and hallucinated statistics. |

## Red Flags

If you catch yourself doing any of these, STOP and re-read the Iron Law:
- Opening a browser or fetching `api.anthropic.com`
- Writing `import Anthropic` or `import { callClaude }`
- Running `claude -p` in a Bash command
- Skipping a gate because the previous post passed it
- Writing a sidecar without running all 5 gates
- Publishing without computing `published_hash`

## Error Handling

- Supabase query fails -> log error, skip that post, continue with remaining
- Humanizer JS crashes -> log error, mark gate as "error", continue with LLM gates
- No voice profile for category -> fall back to `default.md`
- `.flywheel/` files don't exist -> create them (empty JSONL)
- IndexNow fails -> log warning, don't block publish

## Summary Output

After all posts processed:
```
Blog Pipeline Complete
---------------------
Editorial captures: {n} patterns extracted
Re-graded: {n} posts ({passed} passed, {fixed} fixed, {declined} declined)
Generated: {n} new posts ({passed} passed, {fixed} fixed, {declined} declined)
Published: {n} posts
Flywheel: {n} QA patterns, {n} editorial patterns total
```
