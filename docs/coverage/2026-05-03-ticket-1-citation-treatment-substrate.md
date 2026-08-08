# TICKET-1 Citation Treatment Badges — Substrate Coverage Report

**Date**: 2026-05-03
**Branch**: `wip/ticket-1-citation-badges-v1`
**Status**: SUBSTRATE-GAP — v1 BLOCKED, probe-only ship
**Pattern**: T4-probe (per ticket fallback clause)

## TL;DR

The customer-facing feature ("warning badges on cited cases — green still good, yellow questioned, red overruled") **cannot ship in v1** because the substrate to differentiate "negative treatment" from "any citation" does not exist. The citation-graph edges (`cl_citation_map`, 76.9M rows) are present and queryable, but every classifier signal that would let us color an edge red/yellow/green is either missing, uniform, or zero.

Shipping a binary "cited / uncited" badge would either:
- Mislead the customer (every cited case would look "good" — same color as uncited cases that genuinely lack edges) — Mercer voice violation, conversion-anti-pattern.
- Or violate Architectural Invariant #13 (verification-URL HARD rule): asserting "good law" without evidence.

This report documents the state of the substrate so the next session can either (a) build the missing classifier or (b) defer TICKET-1 until upstream pipelines populate signals.

## What Was Verified (probe scripts committed)

Two pure-introspection probes, no writes:

- `scripts/probe-citation-treatment-substrate.mjs` — enumerates schema + rowcounts + sample rows for `cl_citation_map`, `case_law`, `classified_opinions`, `v_entity_confidence`, `v_case_law_treatment`.
- `scripts/probe-bridge-keys.mjs` — checks how `case_law` rows link to CL cluster_ids (the citation-graph join key), and surveys distribution of `is_good_law` and `citing_count` on `classified_opinions`.

Both scripts are idempotent reads, safe to re-run.

## Substrate Findings

### Edge data — PRESENT, usable

| Relation | Rows | Schema | Usable for |
|---|---|---|---|
| `cl_citation_map` | ~76.9M | `(id, depth, cited_opinion_id, citing_opinion_id)` | Degree-1 cite-count rollup |

The graph itself is complete. Given any `cluster_id`, we can count later opinions citing it via `WHERE cited_opinion_id = $1`.

### Classifier signals — MISSING, UNIFORM, OR ZERO

| Field | Expected | Actual | Verdict |
|---|---|---|---|
| `classified_opinions.is_good_law` | Mixed true/false | Uniformly `true` (1,462,909 rows) | UNUSABLE |
| `classified_opinions.citing_count` | Distribution 0..N | All `0` (min/max/avg) | UNUSABLE |
| `case_law.negative_treatment` | Free-text or enum | `null` on samples | UNUSABLE on aggregate |
| `case_law.is_good_law` | Mixed | `true` on samples (no `source_urls[]` evidence) | INVARIANT #13 RISK if surfaced |
| `case_law.citing_cases_count` | >0 for old cases | `0` on samples | UNUSABLE |
| `case_law.condemnation_level` | 0-N severity | `0` on samples | UNUSABLE |
| `classified_opinions.holding_text` | Holding language | Present, freeform | NEEDS NLP extraction |
| Holding-class column | One-of `{good, questioned, overruled, distinguished}` | DOES NOT EXIST on any table | MISSING |

### Bridge join — PRESENT (regex extraction needed)

`case_law.source_url` and `case_law.verification_url` both contain
`https://www.courtlistener.com/opinion/<cluster_id>/<slug>/`. A regex
extracts the cluster_id and joins to `cl_citation_map.cited_opinion_id`.

Sample bridge data:

```
case_law.id = 2781b4a4-…  source_url = .../opinion/2789623/people-v-bosca/
                                                ^^^^^^^ → cluster_id 2789623
```

The case-name fuzzy join (`LOWER(case_name)`) returns 3,832 matches between `case_law` (3,407 curated) and `classified_opinions` (1.46M) — but the join is name-only, no cluster_id, and would multi-match common names (`State v. Smith`, `In re T.M.`).

### Phase 2 sanitizer — MATVIEW MISSING

| Relation | Status |
|---|---|
| `v_entity_confidence` | DOES NOT EXIST in current schema |

`src/lib/report/badge-transform.ts` reads from `v_entity_confidence`. This is a separate Phase 2 matview state issue (out of TICKET-1 scope), but means the existing badge pattern can't be threaded by simply joining a sibling view — `v_entity_confidence` itself needs to be present and refreshed before any new treatment-badge logic can integrate into the existing transform path.

## Gap Analysis: What Would Unblock V1

To ship the badge feature without violating Invariant #13, ONE of these must be true:

**Option A — NLP holding-class extraction over `classified_opinions`** (heaviest)
- Run an LLM-or-keyword pipeline over `holding_text` (1.46M rows) to populate a new `treatment_class` column with values `{positive, negative, neutral, distinguished, overruled}`.
- Aggregate per cited cluster_id to compute negative-cite-count.
- Effort: L (multi-day batch pipeline + classifier validation).
- Anti-API rule: per project memory `feedback-no-api-anywhere.md` (HARD RULE 2026-04-27), no Anthropic API for this. Must be keyword/regex pipeline OR session-driven hand-classification.

**Option B — Repopulate `classified_opinions.is_good_law` + `citing_count` via the existing `bulk-appeal-outcome-correlator.mjs`** (medium)
- ARCHITECTURE.md lists `bulk-appeal-outcome-correlator.mjs` as the script that derives "appellate reversal/affirmance rates via citation-map." Its output has either never landed in `classified_opinions` or was overwritten by a later bulk run that defaulted everything to true/0.
- Verify the script exists, run it, confirm it writes back to `classified_opinions`.
- Effort: M (re-run + verify).

**Option C — Curated subset (only `case_law`'s 3,407 rows)** (lightest, narrowest)
- Backfill `case_law.negative_treatment` and `case_law.condemnation_level` for the 3,407 curated rows using a hand-pass or single LLM session (since the row count is small and per-row source_urls already exist).
- Render badges ONLY on case_law-resolvable citations. All other citations get gray "unknown" badges.
- Effort: S-M (one-time backfill).
- Risk: customer-facing reports cite many cases NOT in `case_law` — most badges would be gray, undermining the feature's value prop.

**Option D — Defer TICKET-1 until Tier 9 appellate_trends pipeline is producing data** (zero-build)
- ARCHITECTURE.md Tier 9 § lists `bulk-appeal-outcome-correlator.mjs` and `appellate_trends` table as the planned home for "appellate reversal/affirmance rates via citation-map."
- Wait for `appellate_trends` to be populated, then build the badge view on top of it.
- Effort: zero now; depends on Tier 9 backfill cadence.

## What Was NOT Built (and why)

Per ticket: "If degree-1 rollup not feasible (no holding-class extraction), STOP and report substrate state — ship probe scripts as a coverage doc per the T4-probe pattern (PR #285) instead of failing silently."

Followed exactly. Files NOT written this session:

- `supabase/migrations/<n>_v_case_law_treatment.sql` — would have shipped a green-on-everything view that violates Invariant #13.
- `src/lib/citation-graph/treatment.ts` — no signal source to wrap.
- `src/components/citation/TreatmentBadge.tsx` — premature without classifier.
- Vitest specs — testing badge against null-classifier returns useless coverage.
- Wiring into IB / X-Ray / CAP / PW — would hide the substrate gap behind UI.

## Files Committed This Session

- `scripts/probe-citation-treatment-substrate.mjs` — substrate enumeration probe
- `scripts/probe-bridge-keys.mjs` — bridge-key + signal-distribution probe
- `docs/coverage/2026-05-03-ticket-1-citation-treatment-substrate.md` — this report

## Recommendation

Take Option B first (cheapest path to real signal):

1. Locate `scripts/bulk-appeal-outcome-correlator.mjs`.
2. Verify it writes to `classified_opinions.is_good_law` + `citing_count` (or wherever appellate_trends lands).
3. Run a sample (10K rows, dry-run) and confirm the output column has variance.
4. Re-run substrate probe → if signals are now mixed, re-open TICKET-1.

If Option B is also stale, fall back to Option C (curated subset) for v1 and document the "gray badges everywhere except 3,407 curated cases" UX as an interim state — not a final feature.

## References

- ARCHITECTURE.md Invariant #12 (cite-tag sanitizer) and #13 (verification-URL HARD rule)
- `src/lib/report/badge-transform.ts` — the Phase 2 cite-tag transform path that any future treatment badges must integrate with
- Project memory: `feedback-no-hallucinated-legal-data.md`, `feedback-no-api-anywhere.md`
- Project memory: `project-53pct-bad-law.md` — "53% of case law OVERRULED. Only 5.7% confirmed good." — confirms the signal exists in SOME aggregate, just not in the live `classified_opinions` table this session probed
