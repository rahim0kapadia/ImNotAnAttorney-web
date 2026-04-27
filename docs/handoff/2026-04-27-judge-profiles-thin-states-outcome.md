# Handoff — judge_profiles thin-state backfill (G8) — BLOCKED at source

**Date:** 2026-04-27
**Branch:** `feat/judge-profiles-thin-states` (worktree, no PR)
**Plan reference:** docs/plans/2026-04-27-data-completeness-master.md (G8) — file did not exist in this session
**Master plan task:** Every state ≥50 judge_profiles

## Outcome — STRUCTURAL BLOCKER, NO PR

**No code shipped. No data changed. The backfill premise is invalid as stated.**

Diagnostic queries proved that every CourtListener-derived judge for the thin
states is **already in judge_profiles**. This is not a missed extraction — it
is a CL source-data coverage ceiling. Hand-scraping per-state judiciary
directories is the only path forward and is materially out of scope for a
"data backfill from already-loaded sources" task.

## Current state (verified 2026-04-27)

```
judge_profiles total: 15,613
States <50:
  AK 45 | ND 44 | WY 42 | PR 26 | VI 8 | MILITARY 6 | GU 4
States 50-99:
  VT 55 | NH 53 | SD 51 | OR 91 | NM 93 | RI 82 | ME 82 | ID 76
  NV 75 | WV 74 | MT 73 | HI 73 | UT 70 | NE 68 | DE 60
(null) jurisdiction bucket: 227
```

## Why the backfill cannot run

### Step 1: cl_people / cl_positions / cl_courts ARE loaded
- `cl_people`: 16,191 rows
- `cl_positions`: 51,291 rows
- `cl_courts`: 3,360 rows
- All three live in Supabase `public` schema, populated.

### Step 2: cl_courts.jurisdiction is NOT a state code
It stores court-type codes (ST=state-court, F=federal, FD=federal-district,
FB=federal-bankruptcy, SA=state-appellate, …). Filtering by jurisdiction
won't isolate state.

The state code is recoverable two other ways:
1. `cl_courts.id` prefix + `data/tmp-cl-court-state-map.json` (3,359 entries,
   already used by `scripts/backfill-judge-jurisdiction.mjs`).
2. `cl_positions.location_state` 2-letter code.

### Step 3: gap analysis vs judge_profiles — every thin state has zero new candidates

Per-state count of cl_people who have a cl_positions row in that state's
`location_state` AND are not already in judge_profiles (matched on
`cl_person_id`):

```
AK: total=11  already=11  new=0
ND: total=20  already=20  new=0
WY: total=15  already=15  new=0
PR: total=13  already=13  new=0
VI: total=3   already=3   new=0
GU: total=1   already=1   new=0
NV: total=34  already=34  new=0
NH: total=28  already=28  new=0
UT: total=27  already=27  new=0
NE: total=35  already=35  new=0
DE: total=32  already=32  new=0
VT: total=28  already=28  new=0
SD: total=20  already=20  new=0
HI: total=17  already=17  new=0
WV: total=38  already=38  new=0
MT: total=26  already=26  new=0
ID: total=16  already=16  new=0
ME: total=32  already=32  new=0
RI: total=27  already=27  new=0
OR: total=42  already=42  new=0
NM: total=26  already=26  new=0
```

Every column is zero. CourtListener's coverage IS the ceiling we have already
hit.

(Note: judge_profiles state counts are HIGHER than the cl_positions
location_state totals because judge_profiles.jurisdiction was assigned via
court_id prefix using the court-state map — so a judge whose
location_state is blank but whose court_id is `alaska*` was correctly
classified AK. The mapping is already comprehensive.)

### Step 4: 227 (null)-jurisdiction judges — zero recoverable

For the 227 judge_profiles rows with `jurisdiction IS NULL`, parsed every
`positions[]` JSONB entry, looked up each `court_id` in
`data/tmp-cl-court-state-map.json`:

```
mappable to a state: 0
federal-only:        0
truly unknown:       227
```

These judges have no `positions[]` court_ids that exist in the court-state
map. They cannot be assigned a jurisdiction without a richer source. They
will not contribute to thin-state coverage.

## Diagnostic scripts (in worktree, not shipped)

Located at `C:\Users\email\projects\_worktrees\judge-profiles-backfill\scripts\`:

- `diag-judge-thin-states.mjs` — schema dump + per-jurisdiction count
- `diag-cl-people-coverage.mjs` — confirm cl_people / cl_positions / cl_courts loaded
- `diag-cl-courts-jurisdictions.mjs` — column-distribution analysis
- `diag-cl-thin-state-gap.mjs` — `new=0` proof for 21 thin states
- `diag-null-jurisdiction-recoverable.mjs` — 227 (null) bucket non-recoverable

These are read-only and worth keeping as a reference appendix; they can be
re-run any time CourtListener publishes a new bulk drop to detect new
candidates without a fresh scripting session.

## What WOULD actually move the needle (open follow-up plan)

Hand-scraping or direct ingestion from per-state judiciary directories.
Examples (free / public, $0 budget):

- **AK**: https://courts.alaska.gov/main/judges.htm  (state supreme/appellate/superior/district)
- **ND**: https://www.ndcourts.gov/supreme-court/justices , https://www.ndcourts.gov/district-courts
- **WY**: https://www.courts.state.wy.us/supreme-court/justices/
- **PR**: https://poderjudicial.pr/  (Spanish-language, requires translation pass)
- **VI**: https://www.visupremecourt.org/
- **GU**: https://www.guamsupremecourt.com/
- **NV / NH / UT / NE / DE / VT / SD / HI / WV / MT / ID / ME / RI / OR / NM**: each has a state-judiciary directory page with judge names, courts served, sometimes appointment dates and bio links.

Each scrape would:
1. Pull names + court served + (optional) appointment year + bio link
2. Match against existing `judge_profiles` by `(name_last, name_first, jurisdiction)` to avoid duplicates
3. INSERT new rows with `cl_person_id = NULL`, `bio_url = <state-judiciary-page>`, `jurisdiction = <state-code>`, `intelligence_status = 'pending'`
4. Anti-hallucination requirement: `bio_url` MUST be the actual state judiciary directory URL (HTTPS), verified-200 before INSERT

This is its own ~1-2 day plan and merits a dedicated G-tier worry-to-pristine
rather than being shoehorned into a "backfill from CL bulk" session.

## Recommendation

1. **Close G8 as ACCEPTED-WITH-DOCUMENTED-CEILING.** All CL-derived judges
   for thin states are already loaded. There is no work left to do against
   the source originally specified.
2. **Open G8b**: per-state judiciary directory scrape for the 7 states/
   territories below 50 (AK, ND, WY, PR, VI, GU, MILITARY) and optionally
   the 3 states between 50-55 (VT, NH, SD). Acceptance: each <50 jurisdiction
   reaches ≥50 OR has a documented state-judiciary-page coverage ceiling.

## Worktree cleanup

Worktree at `C:\Users\email\projects\_worktrees\judge-profiles-backfill\` and
branch `feat/judge-profiles-thin-states` should be removed:

```
git worktree remove C:/Users/email/projects/_worktrees/judge-profiles-backfill
git branch -D feat/judge-profiles-thin-states
```

No commits, no remote, no PR. Diagnostic scripts above are self-contained
references — copy any that are useful into `scripts/` proper if the G8b
follow-up wants them.
