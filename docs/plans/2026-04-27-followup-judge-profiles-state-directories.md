# Follow-up Plan: Judge Profiles via Per-State Judiciary Directories (G8b)

**Status:** OPEN — blocked on per-state scrape implementation
**Parent:** docs/plans/2026-04-27-data-completeness-master.md (G8) — file does
not exist in repo as of this session; this follow-up is the actionable
descendant.
**Source incident:** `docs/handoff/2026-04-27-judge-profiles-thin-states-outcome.md` —
proved CourtListener bulk path cannot produce any new rows for thin states.

## Why CL bulk is exhausted

Diagnostic queries against the live `cl_people` (16,191), `cl_positions`
(51,291), and `cl_courts` (3,360) tables proved every CL-derived judge whose
position is in a thin state's `location_state` is already populated in
`judge_profiles`. The 227 (null)-jurisdiction rows have no court_ids that
exist in `data/tmp-cl-court-state-map.json`, so they cannot be repaired
either. CourtListener IS the ceiling.

## Goal

Every US jurisdiction in `judge_profiles` reaches ≥50 rows, or has a
documented coverage-ceiling (state has fewer than 50 sitting judges of
record per its judiciary website — e.g., GU/VI which are physically small).

## Thin states (verified 2026-04-27)

Below 50 — backfill targets:
- AK 45 — 5 needed
- ND 44 — 6 needed
- WY 42 — 8 needed
- PR 26 — 24 needed
- VI 8 — 42 needed (real ceiling: VI has only ~10 judges total)
- MILITARY 6 — coverage ceiling, military court judges are limited
- GU 4 — real ceiling (GU has ~5 judges)

Between 50 and 60 (low priority — already meeting goal):
- VT 55, NH 53, SD 51, DE 60

## Per-state source URLs (free / public)

| State | URL |
|-------|-----|
| AK | https://courts.alaska.gov/main/judges.htm |
| ND | https://www.ndcourts.gov/supreme-court , https://www.ndcourts.gov/district-courts |
| WY | https://www.courts.state.wy.us/supreme-court/justices/ , https://www.courts.state.wy.us/district-courts/ |
| PR | https://poderjudicial.pr/jueces-y-juezas/ (Spanish) |
| VI | https://www.visupremecourt.org/ |
| GU | https://www.guamsupremecourt.com/ , https://www.guamcourts.gov/ |

## Approach

For each state:
1. Playwright fetch of judiciary directory page (HTTPS, follow redirects).
2. Extract: full_name, court served, appointment date if present, bio link.
3. Anti-hallucination requirement: `bio_url` MUST be the verified-200 state
   judiciary URL (or sub-page link if directory is a list-then-detail layout).
4. De-dup against existing `judge_profiles` by `(LOWER(full_name), jurisdiction)`.
5. INSERT new rows with `cl_person_id = NULL`, `bio_url = <verified URL>`,
   `jurisdiction = <state code>`, `intelligence_status = 'pending'`.
6. After load, run anti-hallucination audit query: every new row has
   bio_url IS NOT NULL AND bio_url LIKE 'https://%'. Zero exceptions.

## Operating rules (inherited)

- $0 budget, free public sources only
- Use direct Postgres via `scripts/lib/db.mjs` (port 5432 session mode)
- COPY FROM STDIN if any state contributes >1000 rows (won't happen here, but
  reuse `bulkCopyRows` helper from `scripts/lib/pg-bulk-defaults.mjs` if so)
- Per-state Playwright runs may be slow — accept this; bulk insert at end

## Acceptance

- AK, ND, WY, PR each reach ≥50, OR
- Documented in this plan that the state has fewer than 50 sitting judges
  per its judiciary directory (verified by directly counting names on the
  source page, with the date of the count and the page URL).
- VI, GU, MILITARY: documented coverage ceiling sufficient.

## Out of scope

- Building bench-jury / sentencing / quote layers for new judges (downstream
  pipeline work, not blocked by judge_profiles count).
- Federal Article III judges (the `FEDERAL` bucket has 1,354 already; FJC
  IDB ingest is separate plan).

## Estimated effort

- 4-6 hours including per-site Playwright tuning, dedup, anti-hallucination
  audit.
- One PR. One worktree. No migrations needed (column shape unchanged).
