# Phase 3 ingest order — Bucket A → B → C, not demand-ranked

Date: 2026-05-01
Slug: decision-phase3-bucket-driven-reorder
Supersedes: `docs/plans/2026-05-01-worry-statute-phase3-next-cohort.md` (TX/GA/MI/IL/NJ/MA by demand)
Cites: `docs/plans/2026-05-01-50-state-statute-survey.md` (capstoned 2026-05-01) + `docs/plans/2026-05-01-bulk-source-aggregator-hunt.md` (capstoned 2026-05-01) + `~/.claude/projects/.../memory/feedback-no-soak-windows.md` (HARD RULE 2026-04-30)

## RECONCILIATION 2026-05-01 (post-sibling-session shipping)

Parallel sibling sessions shipped state ingests outside this plan's structure. Reality vs plan:

**Already shipped to monorepo (`apps/web/scripts/ingest/seed-statutes-*.mjs`):**
- FL, NC, OH, USC, VA, WA (Phase 2)
- AZ (Phase 2 engine workers, in flight)
- **OR** (Phase 4, PR #57 mono — was Wave 1B in this plan)
- **GA** (Wave 1A, PR #53 mono pending merge — Lane D this session)

**Sibling-session in flight (per `MEMORY.md` `project-statute-phase4-or-shipped.md`):**
- IL, ME, MI, AL (Phase 4 ingests)
- TX, MD, OK, PA, IN, NJ (6-state validator)

**This plan's remaining scope (post-reconciliation):**
- Wave 1A: ~~GA~~ → **AK, AR, CO, ID, KY, MS, ND, RI, TN, VT (10 states)** still needed
- Wave 1B: ~~OR~~ → **NY API + DC XML + CA + WY (4 states)** still needed
- Wave 1C: DE, ME (sibling in flight on ME — coordinate), OK (sibling validating) — **DE only safe net-new; ME/OK await sibling completion**
- Wave 2 Bucket B: TX/MA/MN/SC/NV/MO/SD/KS/NE/WV/MT/UT/NH/IA/CT/HI/LA/WI/RI — TX is in sibling validator pool; **rest still safe**
- Wave 3 Bucket C: AL/IL/MD/MI/NJ/NM/PA — sibling has AL/IL/MI/MD/NJ/PA/IN in flight; **NM only safe net-new**

**Coordination protocol:** before dispatching new sub-agents, query monorepo for `seed-statutes-{xx}.mjs` existence + check open PRs for `feat(statutes` patterns. Skip any state already covered or in flight.

## CASCADE

- us: coverage from 7→23 jurisdictions in ~3-4 days (Wave 1) instead of 7→13 in ~7 days (demand-ranked). ~4× faster ship rate per day-of-effort.
- counterparty: defendants in 16 new states get HTTPS-source-URL statute citations weeks earlier.
- downstream: defense attorneys in those states get trustable IB output across 23 jurisdictions instead of 13.
- ecosystem: Public.Resource.Org, UniCourt, NY Open Legislation cited with attribution; civic-tech defendant-tool floor rises.
- future-us: harness pattern compounds — one Bucket A loader unlocks 9 states; one Bucket B harness unlocks 19. Demand-rank gave us 6 bespoke ports.
- adjacent players: pattern publishable — "ingest by access-class, not by buyer demand."

No node loses.

## The call

Re-scope Phase 3 around access difficulty (Bucket A → B → C from the 50-state survey), not buyer demand. Demand re-enters as the ORDER WITHIN each bucket — but the bucket is the wave structure.

Drop the soak-week trigger entirely. Per Rahim's HARD RULE 2026-04-30 ("no no soaks. we keep moving forward"), Wave N+1 ships immediately after Wave N merges. Phase 2 → Phase 3 is no exception.

## Why demand-ranking was wrong

The original Phase 3 plan (`2026-05-01-worry-statute-phase3-next-cohort.md`) picked TX/GA/MI/IL/NJ/MA by demand. Cross-referenced against the 50-state survey:

| State | Demand rank | Bucket | Effort |
|---|---|---|---|
| TX | 1 (highest) | B | per-chapter HTML parse, ~71 chapters |
| GA | 2 | **A** | UniCourt cic-code-ga + IA bulk drop, single port |
| MI | 3 | **C** | hostile, per-chapter "Download" buttons (PDFs) |
| IL | 4 | B? | ASP pages with nasty `ChapterID/ActID` params; needs probe |
| NJ | 5 | **C** | NXT engine, opaque URLs, Justia mirror likely |
| MA | 6 | B | clean URL pattern `/Chapter{N}/Section{S}` |

Mixing buckets in one wave forces three different harnesses to land in parallel. Slower per state and higher coordination cost than:

1. Build ONE Bucket A harness → port 9 UniCourt-style states + bonuses (NY API, DC XML, CA, DE/ME/OK/WY PDFs) in 2-3 days.
2. Build ONE Bucket B harness → port 19 templated-HTML states in 5-7 days.
3. Bespoke Bucket C as a separate worry (Phase 4 already drafted).

Demand re-emerges as the ORDER WITHIN each bucket: ship GA before TN within Wave 1A; ship TX before SC within Wave 1B.

## Wave structure (LOCKED)

### Wave 1A — UniCourt + Public.Resource HTML harness (11 states)

States: AK, AR, CO, GA, ID, KY, MS, ND, RI, TN, VT (11 confirmed cic-code-XX repos per survey; VA shipped Phase 2).

**Demand order within wave:** GA → TN → KY → AK → CO → ID → AR → MS → ND → VT → RI

**Sources:**
- Primary: `https://github.com/UniCourt/cic-code-{xx}` (rendered at `unicourt.github.io/cic-code-{xx}/`)
- Cross-reference: `https://archive.org/details/gov.{XX}.code` (Public.Resource.Org RTF/ODT bulk; quarterly cadence)
- Authoritative source URL stored per row: official state-leg site (`leg.state.{xx}.us` or equivalent), not UniCourt or IA

**Effort:** 4 hrs to build harness (port `seed-statutes-va.mjs` shape from PR #130) + 1-2 hrs per state config tuple = 1.5 days for 11 states.

**Risk:** UniCourt repos last updated mid-2022. Add monthly freshness re-verification cron (hash-diff against current state site).

### Wave 1B — Single-source bulk drops (5 jurisdictions)

| State | Source | Format | Effort |
|---|---|---|---|
| NY | `legislation.nysenate.gov/api/3/laws/PEN?full=true` | JSON API (free key) | ~2 hrs |
| DC | `github.com/dccouncil/law-xml` | XML (Akoma-Ntoso style, 580 releases, fresh) | ~2 hrs |
| CA | `law.resource.org/pub/us/code/ca/` (PRO mirror; FTP fallback at `ftp://leginfo.public.ca.gov/pub/`) | text/PDF | ~3 hrs |
| OR | `law.resource.org/pub/us/code/or/` + `oregonlegislature.gov/bills_laws/Archive/{YEAR}ors{N}.pdf` | PDF | ~2-3 hrs |
| WY | `wyoleg.gov/statutes/compress/title{NN}.pdf` (single full-title PDF + DOCX) | PDF/DOCX | ~2-3 hrs |

DC has 580 releases on the GitHub repo — actively maintained. Highest-freshness primary source of any state.

NY API is the cleanest interface of any state — full Penal Law as nested JSON in one call. Build first; reuse pattern.

**Effort:** ~12 hrs across 5 jurisdictions = 1.5 days. Run in parallel with Wave 1A (different harnesses, different worktrees).

### Wave 1C — Single full-title PDFs (3 net-new states)

States: DE, ME, OK (WY listed in 1B; if PDF parser is reused, group all 4 here).

| State | URL | Title |
|---|---|---|
| DE | `delcode.delaware.gov/title11/title11.pdf` | Title 11 (Crimes) |
| ME | `legislature.maine.gov/statutes/17-A/title17-A.pdf` | Title 17-A (Criminal Code) — STATE CLAIMS COPYRIGHT |
| OK | `oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf` | Title 21 (Crimes & Punishments) |

Build ONE PDF-parser harness (pdfminer-six or similar). Per-state config = title number + table-of-contents pattern. ~4 hrs harness + 2 hrs per state = 1.5 days for 3 net-new states.

**Copyright posture:** ME (and VT) explicitly assert copyright on codified text. Public.Resource.Org won *Georgia v. PRO* (2020 SCOTUS) — primary law cannot be copyrighted. Mitigation per survey:
- Cite the official state URL as `source_url` (not our derivative)
- Include any state-mandated attribution notice in IB output
- Link rather than republish where posture is aggressive (ME, VT)

### Wave 1 total

**~16 net-new jurisdictions in ~3-4 days of focused work, parallelizable across worktrees.**

Combined with Phase 2 closeout (FL, OH, VA, NC, WA, USC + AZ in flight), this brings coverage to **~23 jurisdictions** post-Wave 1.

### Wave 2 — Bucket B generic-config harness (19 states)

Single harness, per-state config tuples per the survey shape (`StateStatuteConfig` typed at line 156 of survey doc).

**Demand order within wave:** TX → MA → MN → SC → NV → MO → SD → KS → NE → WV → MT → UT → NH → IA → CT → HI → LA → WI → RI

(RI dropped from 1A if cic-code-ri repo verified absent; routes to Wave 2.)

**Effort:** ~6 hrs to build generic harness (per survey: covers 17 of 19 cleanly; IL+LA need extended `urlParamMap` config) + ~1 hr per state config tuple = ~25 hrs / 19 states = 3-5 days.

**Robots.txt probe required first.** Per `gotcha-az-leg-robots-120s.md`: AZ Title 13 declared 120s crawl-delay, breaking Vercel 300s cron. Before Wave 2 ingest, run a 1-hr robots.txt sweep across all 19 Bucket B states. Any state with `Crawl-delay > 30s` routes to engine workers, not Vercel cron.

### Wave 3 — Bucket C bespoke (Phase 4)

Already drafted: `docs/plans/2026-05-01-worry-statute-phase4-hostile-states.md`. States: AL, IL?, IN?, MD, MI, NJ, NM, OK (already 1C), OR (already 1B), PA. Per-state research + custom scrapers. Save for last.

IL and IN need a 5-min Playwright probe to bucket properly:
- IL: ilga.gov ASP pages — verify if `ilcs2.asp?ChapterID=53` returns clean HTML (B) or SPA (C).
- IN: iga.in.gov returned blank to WebFetch — needs Playwright to confirm SPA (C).

## Trigger to start Wave 1A

**TODAY (2026-05-01).** No soak window.

Pre-conditions verified:
- Phase 2 NC + WA + OH-extended shipped 2026-04-30 (commit 5b4227fe + PR #225 merged)
- AZ ingest in flight on engine workers (per `gotcha-az-leg-robots-120s.md`)
- Phase 2 T5 cron routes deploying via Lane A subagent (in-flight at time of writing)
- Phase 3 token rotation worry filed: `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md`
- Bucket A harness pattern proven 5x in Phase 2 (FL/OH/VA/NC/WA seed scripts)

The "1 week soak before Phase 3" trigger in the original Phase 3 plan violates `feedback-no-soak-windows.md`. Drop it.

## Out of Scope

- 50-state expansion BEYOND US states (territories/PR/GU/VI) — separate worry.
- Federal Code expansion beyond current USC seed — covered by `docs/plans/2026-04-30-statute-phase3-massive-coverage.md`.
- Cross-state case-law work — orthogonal.
- Cron auth token rotation — covered by `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md`.
- Bucket C hostile states — Phase 4 (`docs/plans/2026-05-01-worry-statute-phase4-hostile-states.md`).

## Success Criteria (binary PASS/FAIL)

**Wave 1A (11 UniCourt states):**
- SC-1A-1: each of {AK, AR, CO, GA, ID, KY, MS, ND, RI, TN, VT} has ≥150 rows in `entities_statutes` with HTTPS official-state source_urls (NOT UniCourt or IA URLs as primary)
- SC-1A-2: anti-hallucination audit returns 0 across all 11 (`null_src=0, non_https=0, bad_hash=0, thin_body=0`)
- SC-1A-3: monthly freshness re-verification cron registered with hash-diff against current state site

**Wave 1B (5 single-source bulk):**
- SC-1B-1: NY has ≥150 rows from `legislation.nysenate.gov/api/3/laws/PEN`, DC has ≥150 rows from `dccouncil/law-xml`, CA has ≥150 rows from PRO mirror, OR has ≥150 rows, WY has ≥150 rows
- SC-1B-2: anti-hallucination audit returns 0 across all 5
- SC-1B-3: NY API key rotated quarterly (per Open Legislation T&Cs)

**Wave 1C (3 net-new PDF states):**
- SC-1C-1: DE, ME, OK each have ≥150 rows from single full-title PDF parse
- SC-1C-2: anti-hallucination audit returns 0 across all 3
- SC-1C-3: ME copyright attribution notice present in IB output for ME-citation rows

**Wave 2 (19 Bucket B states):**
- SC-2-1: each Bucket B state has ≥150 rows from generic harness config
- SC-2-2: robots.txt sweep completed; states with Crawl-delay > 30s routed to engine workers
- SC-2-3: anti-hallucination audit returns 0 across all 19
- SC-2-4: weekly refresh cron registered (Vercel cron for stable, engine for slow-crawl)

**Cross-wave:**
- SC-X-1: Wave 1A merges before Wave 1B starts (sequential within Wave 1; parallel within each sub-wave)
- SC-X-2: zero soak windows between Wave 1A→1B→1C→2 (per HARD RULE)
- SC-X-3: IB smoke test for ≥3 charges in ≥3 newly-covered states matches state's citation regex with no `[VERIFY]` substring

## Dispatch shape

Each wave dispatches in parallel worktrees off `origin/master` per `pattern-worktree-per-pr-from-master.md`. One PR per wave (Wave 1A = 1 PR with 11 state configs; Wave 1B = 1 PR with 5 ingest scripts; etc.). Atomic commits within each PR.

Sub-agent model: Sonnet for per-state porting (mechanical execution from harness template). Opus only for harness design + bucket-promotion decisions (IL/IN probe results).

## Status

LOCKED. Wave 1A starts when this file lands on master. No further design work needed before execution.
