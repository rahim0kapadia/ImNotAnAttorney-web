# Worry: Statute coverage Phase 3 — next-cohort states (TX, GA, MI, IL, NJ, MA)

Date: 2026-05-01
Slug: statute-phase3-next-cohort
Parent worry: 2026-04-30-worry-statute-phase2.md (Out-of-Scope clause)

## CASCADE
- us (INAA): 6 more states covered by mechanical citations; IB reports stop showing `[VERIFY]` for ~40% additional buyer surface (TX alone ~10% of INAA crisis-search volume)
- direct counterparty (defendants in 6 new states): get up-to-date statute citations with HTTPS source URLs
- downstream (defense attorneys in those states): trustable IB output, can verify in 30s
- ecosystem (state-leg sites, OpenStates): new scrapers raise floor for civic-tech defendant tools
- future-us (Phase 4): per-state class pattern compounds — 6 more states ported to the same shape unlocks 50-state target by ~Q3
- adjacent players (other defendant-tools): pattern publishable

No node loses. Cascade-positive.

## Worry

Phase 2 (NC + AZ + WA + OH-extended) shipped 2026-04-30. `entities_statutes` now covers 7 jurisdictions: FL (470), VA (595), OH (433 — extended from 247), USC (36), NC (3,342), WA (606), AZ (~236 pending ingest). Total ~5,718 verified rows.

The next-cohort buyer demand outside this set: **TX, GA, MI, IL, NJ, MA**. These were explicitly deferred per Phase 2 plan Out-of-Scope clause. Defendants in those states still see `[VERIFY]` in IB output for state-statute citations.

Phase 3 closes the gap.

## Demand ranking (informs T1-T6 order)

Per INAA crisis-search volume + bondsman partner concentration:
1. **TX** — highest single-state demand outside FL/CA. ~10% of INAA volume. Texas Penal Code Title 5 (Offenses Against the Person), Title 7 (Property), Title 6 (Health & Safety = drug code), Title 9 (Public Order), Transportation Code Ch 49 (DUI).
2. **GA** — Atlanta metro + state-wide. O.C.G.A. Title 16 (Crimes & Offenses) main; Title 40 (Motor Vehicles & Traffic) for DUI.
3. **MI** — Detroit metro. MCL Chapter 750 (Penal Code). Vehicle Code 257.
4. **IL** — Chicago + downstate. ILCS 720 (Criminal Code). 625 ILCS (Vehicle Code).
5. **NJ** — Northeast corridor. NJSA Title 2C (Code of Criminal Justice). Title 39 (Motor Vehicles).
6. **MA** — Boston metro. M.G.L. Ch 265 (Crimes Against the Person), 266 (Crimes Against Property), 269 (Public Peace), 90 (Motor Vehicles incl. OUI).

## Expert Lens

**Primary**: openstates-team (cached at `~/.claude/experts/openstates-team.md`) — same as Phase 2.

**Pattern**: Phase 2 per-state-class architecture is now proven across 5 jurisdictions (FL, VA, OH, NC, WA, plus AZ on engine). Phase 3 mechanically ports the pattern to 6 more states.

## Numbered Tasks

T0 — Per-state coverage research (mirror Phase 2 T0): WebFetch each state's official code root + robots.txt, identify HTTPS host, enumerate criminal chapters per INAA charge taxonomy, document rate-limit posture, capture Content-Type-verified marker. Write 6 coverage matrices under `docs/ingest/coverage/<state>-statutes-coverage.md`.

T1-T6 — Per-state ingest scripts (one per state, in demand order):
- T1 TX (Texas Statutes via statutes.capitol.texas.gov — likely Vercel cron OK if crawl-delay <60s)
- T2 GA (Georgia Code via lexis.com/hottopics/gacode/ — verify host)
- T3 MI (Michigan Compiled Laws via legislature.mi.gov)
- T4 IL (Illinois Compiled Statutes via ilga.gov)
- T5 NJ (New Jersey Statutes Annotated — official source TBD by T0)
- T6 MA (Massachusetts General Laws via malegislature.gov)

Each task = port `seed-statutes-va.mjs` template (358 lines) with state-specific:
- `<STATE>_CHAPTERS` map (T0-resolved)
- Host-pin Set (T0-resolved hostname)
- StatuteRowSchema with state regex + jurisdiction literal
- URL builders matching state's URL patterns
- Live-curl fixture capture (≥3 sections per state) BEFORE parser write (SC-8b live-source-first)
- Tests + entity-whitelist tests

T7 — Per-state weekly refresh cron registration (mirror Phase 2 T5):
- 6 new routes under `apps/web/src/app/api/cron/statutes-refresh-{tx,ga,mi,il,nj,ma}/`
- Concurrency-5 parallel hash-diff
- 6 cron-job.org jobs registered (one per state, staggered Mon-Sat 17:00 UTC)
- If any state's largest chapter exceeds 5min at concurrency-5, split per-chapter form (matches Phase 2 NC contingency)

## Out of Scope

- 50-state expansion: Phase 4 (next worry).
- Federal Code expansion beyond current USC seed (PR #115 + #119 + #124).
- Cross-state case-law work.
- Phase 3-specific cron auth-token isolation (covered by Phase-3-already-filed worry at `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md`).

## Success Criteria (binary)

- SC-1 to SC-6: each state has ≥150 rows in `entities_statutes` with valid HTTPS source_urls, valid SHA-256 text_hash, non-empty section_text ≥50 chars
- SC-7: anti-hallucination audit returns 0 across all 6 states (`null_src=0, non_https=0, bad_hash=0, thin_body=0`)
- SC-8: 6 cron-job.org jobs registered with HTTPS-only URLs and Bearer auth headers
- SC-9: SC-15-equivalent IB smoke test for each state — IB output for charge X in state Y contains state's citation regex match, no `[VERIFY]` substring

## Trigger to start

- Phase 2 fully closed: NC + WA + OH live ✅, AZ ingest complete (currently ~8h wall in flight 2026-04-30 evening)
- Phase 2 T5 routes deployed + soaking: 1 week of clean weekly refresh runs (NC Mon, WA Wed, OH Thu) starting 2026-05-04
- Phase-3 token-rotation worry shipped (already filed: `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md`)
- Earliest Phase 3 start: 2026-05-11 (Phase 2 + 1 week soak)

## Status

DRAFT. Ready for swarm-review when Phase 2 closes + 1 week soak passes.
