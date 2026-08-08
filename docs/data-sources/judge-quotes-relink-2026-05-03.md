# TICKET-5 — Judge Quotes Re-link — BLOCKED 2026-05-03

## Status

BLOCKED. Two compounding blockers; nothing executed against the DB.

## Pre-flight Baselines (live read 2026-05-03 from prod Supabase)

| Metric                                       | Count   |
|----------------------------------------------|---------|
| `judge_quotes` total                         | 189,398 |
| `judge_quotes` with `judge_id` populated     |  35,242 |
| `judge_quotes` orphan (NULL judge_id)        | 154,156 |
| Orphans with non-null `cluster_id`           | 154,156 |
| `judge_profiles` rows with `judicial_quotes` array |   492 |
| `judge_profiles` with `judicial_quotes` length ≥ 5 |   381 |

Source: ad-hoc `_ticket5-preflight.mjs` (cleaned up; not committed) using
service-role Supabase REST count(head) queries. JSONB scan capped at
50,000 rows but 492 < 50,000 so full coverage.

Ticket numbers were stale: ticket said 64,730 total / 15,652 linked
baseline. Current state is 189,398 / 35,242 — one or more linker passes
ran since the ticket was written. Acceptance bar (≥3,000 judges with ≥5
quotes) is still 8x current state (381).

## Blocker 1 — D: drive not mounted (same class as TICKET-6)

`scripts/link-quotes-to-judges.mjs` reads
`data/bulk-verify/cl-bulk/opinions-filtered.csv`. That path is a symlink:

```
data/bulk-verify/cl-bulk -> /d/inaa-bulk/cl-bulk
```

`ls D:/` returns "No such file or directory" — the drive is not mounted
in this session. Same blocker class as TICKET-6 (CL bulk corpus on
external drive). Cannot run the CSV-based linker until D: is mounted OR
the corpus is restaged on C:.

## Blocker 2 — Acceptance criteria mismatch the script's actual writes

TICKET-5 acceptance:

> `judge_profiles.judicial_quotes` populated for ≥3,000 judges (up from 492)
> Each quote carries `cluster_id`, `cite`, `topic`, `score`, `source_url`

But neither existing script writes `judge_profiles.judicial_quotes`:

- `scripts/link-quotes-to-judges.mjs` — only sets `judge_quotes.judge_id`
  (the FK from quote → judge). It does NOT roll quotes up into the
  `judicial_quotes` JSONB array on `judge_profiles`.
- `scripts/link-quotes-via-cl-api.mjs` — same shape; only sets
  `judge_quotes.judge_id` via CL API per cluster. No JSONB rollup.

To meet the acceptance criteria, a SECOND script (or step 5 in the
linker) is required: aggregate linked `judge_quotes` rows per judge into
the `judicial_quotes` JSONB array shape `{cluster_id, cite, topic, score,
source_url}`. That aggregator does not exist in `scripts/`.

`Glob scripts/**/*judicial*` — 0 results.
`Grep judicial_quotes` in scripts — 0 results outside this doc.

## What an alt path would look like

If D: is unavailable:
- `link-quotes-via-cl-api.mjs --apply` could process the 154,156 orphans
  via CL API, but at ~150ms/cluster the wall-clock estimate is ~6.4 hours
  (and CL's 5K/hr cap stretches it to ~30 hours). Still hits acceptance
  bar only if the JSONB rollup script is also written.
- Cleaner path: hold for D: mount + a follow-up ticket that either (a)
  extends one of the linkers with a final aggregation pass, or (b) ships
  a new `scripts/aggregate-judge-quotes-to-profiles.mjs`.

## Files Touched This Session

- `docs/data-sources/judge-quotes-relink-2026-05-03.md` (this file)
- No code changes. No DB writes. No CL API calls.

## Recommendation

Open a follow-up ticket: "TICKET-5 prerequisites — restage CL bulk
corpus to C: AND ship `aggregate-judge-quotes-to-profiles.mjs` JSONB
rollup." Re-attempt TICKET-5 only after both prereqs land.
