# Handoff: NY Bar Discipline — Round 3 Alt-Identifier Extension

**Date**: 2026-04-25
**Branch**: `feat/ny-bar-r3-alt-identifiers`
**Worktree**: `C:\Users\email\projects\ny-bar-r3-work`
**Plan**: `docs/plans/2026-04-25-ny-bar-r3-alt-identifiers.md`

## Summary

Round 3 extends `scripts/ingest/process-nybar-discipline.mjs` with 6
additional bar-number identifier regexes covering 1st Dept and 3rd Dept
opinion formats that the round-2 extractor missed. DB-only enrichment —
no new scraping. NY discipline events grew from **711 → 795** events,
attorneys from **670 → 738**, with **100% source_url coverage** and
**3/3 spot-checked bar numbers** valid in the public NY OCA registry.

## Before / After

| Metric                        | Before (r2) | After (r3) | Delta |
|-------------------------------|-------------|-----------:|------:|
| NY discipline events          |         711 |        795 |   +84 |
| Distinct NY attorneys         |         670 |        738 |   +68 |
| `source_url` coverage         |    711/711  |    795/795 |  100% |
| Date range (`order_date`)     | 2014-08 — 2026-03 | 2014-08 — 2026-03 | unchanged |
| Discipline-type breakdown     | (round-2 baseline) | disbarment 566, public_reprimand 120, suspension 107, interim_suspension 1, resignation_with_charges 1 | — |

Dry-run records-parsed: **874** (from 711 baseline of effectively-792 after
in-batch dedup). 84 of those 874 cleared the existing-row dedup gate and
landed as net-new events.

Exit criteria: NY events **>800** target → 795 (5 short, see Residual
section). All other criteria satisfied.

## Bar-Number Pattern Table

Patterns are tried in declared order. First match wins. All capture digits
in group 1.

| # | Name                       | Regex                                                              | Hits | Source / Examples |
|---|----------------------------|--------------------------------------------------------------------|-----:|-------------------|
| 1 | `oca-atty-reg-no`          | `/OCA\s+Atty\.?\s+Reg\.?\s+No\.?\s*(\d{5,10})/i`                   |  278 | r2 canonical, widened r3 (no-space variant) |
| 2 | `attorney-registration-no` | `/Attorney\s+Registration\s+No\.?\s*(\d{5,10})/i`                  |  515 | r2 long form, widened r3 to no-space (3rd Dept "(Attorney Registration No.NNN)") |
| 3 | `oca-atty-registration-no` | `/OCA\s+Atty\.?\s+Registration\s+No\.?\s*(\d{5,10})/i`             |   12 | r3 — Giuliani, Iannuzzi, Heller, Schneider, Greenblum, Roussin, Schlossberg |
| 4 | `oca-atty-reg-no-comma`    | `/OCA\s+Atty\.?\s+Reg\.?\s+No,\s*(\d{5,10})/i`                     |    1 | r3 — Karambelas (comma after `No`) |
| 5 | `attorney-reg-no`          | `/Attorney\s+Reg\.\s+No\.?\s*(\d{5,10})/i`                         |    3 | r3 — Jacobs, Gainsburg, Deem (post-2024 1st Dept short form) |
| 6 | `oca-comma-atty-reg-no`    | `/OCA,\s+Atty\.?\s+Reg\.?\s+No\.?\s*(\d{5,10})/i`                  |    2 | r3 — Harper (comma after `OCA`) |
| 7 | `oca-att-reg`              | `/OCA\s+Att(?:y)?\.?\s+Reg\.?\s+(?:No\.?\s*)?(\d{5,10})/i`         |   60 | r3 — Asher, Malig, Hantman, Mertz, Edwards (no `No.` between `Reg.` and digits) |
| 8 | `oca-reg-no`               | `/OCA\s+Reg\.?\s+No\.?\s*(\d{5,10})/i`                             |    3 | r3 — Baumgarten, Schneiderman (no `Atty`/`Att`) |

Round-2 only patterns: 1, 2 (in their narrow form). Round-3 added/widened: all 8.

## Net-new contribution per pattern

(dry-run record count when each pattern was added to the rolling set)

| Pattern added                     | Records before | Records after | Net new |
|-----------------------------------|---------------:|--------------:|--------:|
| r2 baseline (patterns 1+2 narrow) |              — |          ~782 |       — |
| `attorney-reg-no`                 |           ~782 |          ~785 |      +3 |
| `oca-comma-atty-reg-no`           |           ~785 |          ~787 |      +2 |
| `oca-att-reg` (initial: `Att.` only) |       ~787 |          ~789 |      +2 |
| `oca-att-reg` (extended: `Att(?:y)?` covers `Atty Reg.` no-No.) | ~789 | ~847 | +58 |
| `oca-reg-no`                      |           ~847 |          ~850 |      +3 |
| `attorney-registration-no` widened (no-space) | ~850 | ~861 |    +11 |
| `oca-atty-registration-no`        |           ~861 |          ~873 |     +12 |
| `oca-atty-reg-no-comma`           |           ~873 |          ~874 |      +1 |
| **Total round-3 net-new**         |              — |             — |    +92  |

Of those 92 dry-run record additions, 84 cleared the
`(jurisdiction, bar_number, order_date, discipline_type)` dedup gate when
applied. 8 were duplicates of existing events for the same attorney.

## Residual category — why 795 < 800-target

The unmatched universe is **1,700 bodies** ("(skipped: 7 no-body, 1700
no-bar-no, 0 no-name, 1450 no-discipline)" from the dry-run). Sample
analysis revealed three sub-categories:

### A. Genuine attorney discipline opinions WITHOUT a bar number (~50% of unmatched)

The dominant residual. Mostly **4th Dept** "MATTER OF X NAME, AN ATTORNEY,
RESIGNOR" / "RESPONDENT" memos with `MEMORANDUM AND ORDER` boilerplate.

Examples:
- `Matter of Stutzman` — "MATTER OF GARY LARUE STUTZMAN, AN ATTORNEY, RESIGNOR. MEMORANDUM AND ORDER. Application to resign for non-disciplinary reasons accepted and name removed from roll of attorneys."
- `Matter of Nitti` — "MATTER OF GINO M. NITTI, AN ATTORNEY, RESPONDENT. GRIEVANCE COMMITTEE OF THE SEVENTH JUDICIAL DISTRICT, PETITIONER. MEMORANDUM AND ORDER. Order of interim suspension entered pursuant to 22 NYCRR 1240.9."
- `Matter of Barnes` (4th Dept, 2025) — "MATTER OF MARK STEVEN BARNES, AN ATTORNEY, RESPONDENT. ... MEMORANDUM AND ORDER. Order of suspension entered."

These are unequivocally attorney discipline events but the body
**physically does not contain a bar registration number**. The 4th Dept
short-form opinion structure does not include one. Per the task
constraint:

> DO NOT fabricate bar numbers. If a body has no extractable number, skip — never invent.

…they are skipped. **NOT a regex coverage gap — a source-data gap.**

**Future round-4 approach (out of scope for r3)**: synthetic deterministic
bar_number derived from `(jurisdiction, full_name, admission_year)` would
yield ~200-400 additional events. The FL Bar scraper already uses this
pattern (`fl-name-<md5(name)[:12]>`, see
`scripts/ingest/scrape-flbar-discipline.mjs`). Promotion to r4 would
require an explicit Rahim approval — the constraint in this task was
literal "skip — never invent."

### B. Probate / family / juvenile / surrogate opinions (false positives caught by `^Matter of [Surname]$` case_name regex)

Sub-categories:
- Probate/decedent estates — `Matter of Bejjani, Deceased`, `Matter of Lowinger, deceased`, `Matter of Chen`, `Matter of Hattala`, `Matter of Perrenod`, `Matter of Dibble`, `Matter of Walker`, `Matter of Reich`, `Matter of Pearce`, `Matter of Hanlon`, `Matter of Bates`, `Matter of Damiano`, `Matter of Oglesby`
- Juvenile delinquency — `Matter of J.M.`, `Matter of K.P.`, `Matter of J.D.`, `Matter of A.I.`, `Matter of I.C.D`, `Matter of C.C.`, `Matter of S.C.`, `Matter of J.W.`, `Matter of J.S.G.`
- Guardianship — `Matter of Francois` (guardian for incapacitated person)

The case_name regex (`^Matter of [A-Z][a-zA-Z.''-]+$`) intentionally does
not catch initials patterns (`Matter of J.M.`) but does pull in single-
surname probate cases. The bar-number presence-check (which now requires
ANY of the 8 BAR_NUMBER_PATTERNS) is what discriminates discipline from
probate.

### C. Reinstatement / sanction / vacatur opinions where the discipline normalizer returns `unknown` (1450 no-discipline)

These bodies HAD a bar number extracted but the order section did not
match any of `DISCIPLINE_PATTERNS`. Examples:
- "Order entered terminating suspension and granting application for reinstatement to the practice of law." (Matter of Getman)
- "Order entered denying application for reinstatement to the practice of law." (Matter of Alderman)
- Procedural orders, vacaturs, name-change applications, etc.

The discipline normalization is intentionally narrow — only events that
are unambiguously a sanction action are recorded. Reinstatement events
are valuable signal but a different schema concept (`status_change`, not
`discipline_event`); out of scope for r3.

### Spot-checks (NY OCA registry, https://data.ny.gov/resource/eqw2-r5nb)

| bar_number | DB full_name                                          | Registry full_name           | Registry status | Pass |
|------------|-------------------------------------------------------|------------------------------|-----------------|:----:|
| 1080498    | Rudolph W. Giuliani (Admitted as Rudolph William Giuliani) | Rudolph William Giuliani | Disbarred       | ✅ |
| 4157012    | Aaron M. Schlossberg (admitted as Aaron Morris Schlossberg) | Aaron Morris Schlossberg | Currently registered | ✅ |
| 2605061    | JOSEPH ANTHONY FERRIERO                               | Joseph Anthony Ferriero      | Disbarred       | ✅ |

3/3 valid. ✅

## Files

- `scripts/ingest/process-nybar-discipline.mjs` — modified
  (BAR_NUMBER_PATTERNS array + per-pattern hit counters)
- `scripts/ingest/lib/_investigate-ny-r3.mjs` — added (initial pattern
  frequency scan + 40-body sample dump)
- `scripts/ingest/lib/_investigate-ny-r3-numeric.mjs` — added (7-digit
  context dump for unmatched bodies)
- `scripts/ingest/lib/_investigate-ny-r3-broader.mjs` — added
  (broader candidate scan against bodies still unmatched after r3 v1)
- `scripts/ingest/lib/_investigate-ny-r3-final.mjs` — added (50-body
  sample dump for "attorney + 7-digit" heuristic — found the 3rd Dept
  no-space pattern that drove the +11 event delta)
- `docs/plans/2026-04-25-ny-bar-r3-alt-identifiers.md` — added (plan)
- `docs/handoff/2026-04-24-ny-bar-r3-alt-identifiers.md` — this file

Tmp files (gitignored, not committed): `.tmp-ny-r3-*.txt`.

## Idempotency / Safety

- ON CONFLICT DO NOTHING on `(jurisdiction, bar_number, order_date,
  discipline_type)` — re-running is safe; verified during r3 (a re-apply
  with the same patterns inserted 0 net-new events).
- `bulkCopyRows` (COPY FROM STDIN) used per `cl-bulk-data-defensive.md`
  rule #18; per-row INSERT pattern not present.
- No new scraping; CL token unused by this script (DB-only).

## Open work / next steps

1. **Round 4 (synthetic bar numbers)** — optional, requires Rahim
   approval. Would target the 4th Dept "MATTER OF X, AN ATTORNEY,
   RESIGNOR" sub-category (~200-400 additional events) using the FL Bar
   `fl-name-<md5(name)[:12]>` pattern adapted to NY (`ny-name-<hash>`).
   Constraint to lift first: "DO NOT fabricate bar numbers."

2. **Reinstatement event schema** — separate concept from discipline;
   ~1,450 bodies have order section but no current sanction. Worth
   adding a `attorney_status_change_events` table for downstream
   warroom/IB tier signals.

3. **Historical pre-2014 backfill** — out of scope for r3, would need
   a separate `--start-date 2010-01-01` run plus body-fetch loops; CL
   coverage of nyappdiv pre-2014 unknown.

## Branch / commit

- Branch: `feat/ny-bar-r3-alt-identifiers` (worktree-only, not pushed
  per task constraint)
- Commit: see `git log --oneline` on the branch
- DO NOT push or open a PR (task constraint)
