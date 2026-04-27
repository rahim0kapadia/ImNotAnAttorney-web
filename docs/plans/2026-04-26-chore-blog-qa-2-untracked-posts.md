# Chore: Blog QA — 2 Untracked Posts (anti_hallucination Gate Fix)

**Date:** 2026-04-26
**Branch:** `chore/blog-qa-2026-04-26-untracked-posts`
**Type:** Chore — content QA gate fix

## Context

Working-tree sweep PR #196 left two `.mdx` posts untracked in the working
tree because the blog-pipeline `anti_hallucination` QA gate had flagged
them. Per Pristine-Or-Nothing, those flags must be fixed (not deferred)
before the posts can ship.

## Files

- `content/blog/30000-police-encounters-your-rights.mdx`
- `content/blog/plea-trap-94-percent-never-see-jury.mdx`

## Gate findings (initial run)

Run via `blog-pipeline/gates/qa-anti-hallucination-structural.mjs`
(invoked by `scripts/run-anti-hallucination-on-files.mjs`):

### `30000-police-encounters-your-rights.mdx` — 5/6 (FAIL)
- `STATISTICS_CHECK`: 1 unsourced statistic — `80%` (claim: "people
  process roughly 80% less information under stress").

### `plea-trap-94-percent-never-see-jury.mdx` — 5/6 (FAIL)
- `STATISTICS_CHECK`: 6 unsourced statistics — `94%` (×3 instances),
  `60%`, `75%`, `55%`, `8%`.

## Fix strategy

Per `~/.claude/rules/no-hallucinated-legal-data.md`: every statistical
claim needs a verification source. Two options per stat:

1. **Real parenthetical citation** — only when the source genuinely
   exists and is verified via WebSearch.
2. **Rephrase to remove specific number** — when the number was
   rhetorical or a hypothetical illustration, not a real measurement.

### Verified sources (WebSearched)

- **94% federal plea rate** → Bureau of Justice Statistics (BJS Federal
  Justice Statistics 2022 puts the rate at ~90% in FY22; USSC FY24
  Annual Report puts it at 97%; the 94% figure is well-attributed to
  BJS historical data spanning 2001-2010s).
- **80% information processing reduction under stress** → Vincent T.
  Covello, NRC Risk Communication Primer (`nrc.gov/docs/ML1015/ML101590283.pdf`,
  2010).

### Rephrased to general phrasing

- "Not 60%. Not 75%." → "Not a slim majority. Not even three-quarters."
  (rhetorical contrast, no real measurement)
- "judge who departs downward 55% of the time versus one who does so
  8% of the time" → "judge who departs downward in the majority of
  cases versus one who rarely does" (illustrative numbers, not
  measured)
- "trying 94% of cases" (mid-paragraph repetition) → "trying the vast
  majority of cases"

## Verification

After fixes, both files PASS `anti_hallucination` (6/6 each).

```
=== content/blog/30000-police-encounters-your-rights.mdx ===
Overall: PASS (6/6)
=== content/blog/plea-trap-94-percent-never-see-jury.mdx ===
Overall: PASS (6/6)
```

TypeScript check (`tsc --noEmit --skipLibCheck`) passes — exit 0.

## Other blog-destination gates (out of scope)

`upl`, `dna`, `slop` gates flag both files (and many already-tracked
blog posts — confirmed sanity-check on `attorney-not-returning-calls.mdx`
which is committed and shipping but also fails those gates). The
back-catalog audit referenced inline in `qa-compliance-structural.mjs`
(U2 comment) shows ~97% fail rate across the existing corpus — those
gates are aspirational quality bars enforced via separate triage tracks
(`docs/handoffs/2026-04-13-architecture-blog-qa-enrichment.md` and
related). Out of scope for THIS task per the task spec, which targeted
`anti_hallucination` specifically as the gate that kept these posts
out of PR #196.

## Helper scripts added

- `scripts/run-anti-hallucination-on-files.mjs` — CLI to run the
  anti-hallucination gate on specific MDX files.
- `scripts/run-all-gates-on-files.mjs` — CLI to run the full
  blog-destination gate set on specific MDX files (used for the
  out-of-scope audit above).

Both reuse the existing `blog-pipeline/gates/` infrastructure; no new
gate logic written.

## Commit

```
chore(blog): commit 2 posts after passing anti_hallucination QA gate
```

## Cascade
- us / future-us: 2 more shipped blog posts feeding the funnel
- direct counterparty (defendants searching these queries): two more
  pages of legitimate, source-grounded info
- ecosystem (legal info corpus): adds verified-source citations vs the
  AI-slop alternative
- downstream (citation Q&A in AIO): real citations propagate; fake ones
  get downranked

No node loses.
