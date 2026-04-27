# Bar-Discipline Batch 2 (MO/WI/LA) — Outcome

**Date:** 2026-04-27
**Status:** PRISTINE — PR #181 MERGED
**Branch:** `feat/bar-discipline-mo-wi-la` (squash-merged into master at `cf0108fa`)

## Result

3/3 states shipped. **+1,062 events / +3 jurisdictions** to `attorney_discipline_events`.

| State | Rows | Range | Source | URL pattern |
|---|---|---|---|---|
| MO | 912 | 2006-01-11 → 2026-04-21 | Missouri Supreme Court (courts.mo.gov) | `https://www.courts.mo.gov/page.jsp?id=109856` |
| WI | 82  | 2022-02-22 → 2026-04-15 | Office of Lawyer Regulation (wicourts.gov) | `https://www.wicourts.gov/services/public/lawyerreg/statuspublic.htm` |
| LA | 68  | 2024-01-29 → 2026-04-21 | Louisiana Attorney Disciplinary Board | `https://www.ladb.org/DR/` |

Global counter: `attorney_discipline_events` total advanced from 22,998 events / 19 jurisdictions (post-PR-batch-1, 2026-04-26) to **24,499 events / 22 jurisdictions** (other 439 added by intervening cron refreshes of pre-existing scrapers).

## Files shipped

- `scripts/ingest/scrape-mobar-discipline.mjs`
- `scripts/ingest/scrape-wibar-discipline.mjs`
- `scripts/ingest/scrape-labar-discipline.mjs`
- `scripts/ingest/__fixtures__/{mo,wi,la}-sample.html` — live-extracted snippets
- `scripts/ingest/__tests__/scrape-{mo,wi,la}bar-discipline.test.mjs` — 49 unit tests across 14 suites, all green
- `scripts/diag-bar-disc-batch2-audit.mjs` — re-runnable anti-hallucination check

## Anti-TN-bug protocol followed

1. Live `curl` of each source on 2026-04-26 with browser UA + saved HTML.
2. `Read` and `Grep` against the saved HTML to locate the row pattern.
3. Wrote parsers based on the verified live structure (NOT assumptions).
4. Dry-run printed sample names that I cross-checked against the live HTML before invoking `--apply`.
5. Tests use literal fixture snippets pulled from the live HTML — no synthesized fixtures.

## Anti-hallucination audit — PRISTINE

```
MO: total=912  null_src=0  non_https=0  non_https_order=0  distinct_attorneys=912  → OK
WI: total=82   null_src=0  non_https=0  non_https_order=0  distinct_attorneys=82   → OK
LA: total=68   null_src=0  non_https=0  non_https_order=0  distinct_attorneys=68   → OK
ALL CLEAR
```

100% HTTPS source_url + order_url. 0 NULL across all 1,062 new rows.

## Implementation notes (worth carrying forward)

### MO
- 1,379 entries on a single page (no pagination), including 467 reinstatement / no-discipline rows we filter out (912 net).
- `courts.mo.gov` rate-limits non-browser User-Agents — first attempt usually 403s. Hardened `fetchListing` with browser headers (Accept / Accept-Language / Referer / Cache-Control / Upgrade-Insecure-Requests) + 3-attempt retry per UA with exponential backoff. Detail pages (e.g. `/page.jsp?id=NNNN`) stay 403-blocked from curl — `order_url` is recorded but only resolvable via a real browser. `source_url` is the listing page (verified HTTPS, public).
- Discipline TYPE is exposed in the listing — full normalization map applied.

### WI
- Listing is a snapshot of *currently disciplined* lawyers (~82 entries). It does NOT carry the discipline TYPE — only name + date + case#.
- Recorded `discipline_type='unknown'` with case# preserved in `discipline_raw` so a future enrichment pass can fetch order PDFs to refine. Refused to fabricate a label per `no-hallucinated-legal-data`.
- Two URL flavors observed — `/sc/opinion/DisplayDocument.pdf?content=pdf&seqNo=N` (SC direct) and `/services/public/lawyerreg/statuspublic/<lastname>.pdf` (OLR).

### LA
- Three collapsible panels on `/DR/`: Supreme Court / Disciplinary Board / Hearing Committee. Each is a `<ul class="list-group">` with chronological items.
- PDF resolved via `https://www.ladb.org/handler.document.aspx?DocID=<NNNNN>` (extracted from `LIB/LADB-dr.js`'s `openHandler`). Confirmed live.
- Same TYPE-not-exposed limitation as WI; `discipline_type='unknown'` + `discipline_raw` preserves panel + case#.

### Synthetic bar numbers
None of MO/WI/LA publish bar numbers in their listings. Used the established MD pattern: `<STATE>:<sha1(name|order_date)::8>`. Stable across re-runs; future enrichment can reconcile to real bar numbers.

## CI

- `verify` (Docs Freshness) — SUCCESS
- `Vercel Preview Comments` — SUCCESS
- `Vercel` deploy — PENDING (preview build, non-blocking; no src/ changes)

PR was MERGEABLE / UNSTABLE on the Vercel preview only; merged via `--squash --delete-branch`. Local branch deletion error is harmless (worktree owns the ref).

## Worktree

`C:/Users/email/projects/_worktrees/bar-disc-batch2` — branch `feat/bar-discipline-mo-wi-la` still tracking remote-deleted branch. Safe to remove with `git worktree remove`. Junctioned `node_modules` does not need cleanup.

## Master plan progress

`docs/plans/2026-04-27-data-completeness-master.md` G1a items closed: **MO, WI, LA**.

Remaining G1a top-10: NC, AL, SC, KY, OR, OK, CT (likely shipped or in flight via batches 1/3).

## Cost / time

- WebSearch + WebFetch + live curl probes for source structure: ~10 min
- Three scrapers + tests + fixtures: ~25 min (single agent, sequential)
- Live --apply + audit + PR + merge: ~5 min
- **Total: ~40 min**, $0 paid services
