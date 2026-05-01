# Worry: Statute coverage Phase 4 — hostile/bespoke states (AL, IL, IN, MD, MI, NJ, NM, OK, OR, PA, ME, NY, TX)

Date: 2026-05-01
Slug: statute-phase4-hostile
Parent worry: 2026-04-30-worry-statute-phase2.md (Phase 2) → 2026-05-01-worry-statute-phase3-next-cohort.md (Phase 3 superseded by overnight session)

## CASCADE
- us (INAA): closes the last 13 states; brings coverage from ~37/51 (post-Phase-3 Wave 3) to 50/51 (full US except DC variant)
- direct counterparty (defendants in those states): freed from `[VERIFY]` placeholder in IB output
- downstream (defense attorneys): trustable IB output for every US state
- ecosystem: pattern publishable for state-leg sites with hostile crawl restrictions
- future-us: closes 50-state coverage so subsequent phases focus on case-law-side enrichment, not statute foundation
- adjacent players: floor rises for civic-tech defendant-tools

No node loses. Cascade-positive.

## Worry

After Phase 3 (UniCourt + Wave 1B + Wave 2 + Wave 3), `entities_statutes` is expected to cover ~37 jurisdictions. Remaining 13 states are Bucket C "hostile" sources or Phase-3-blocked:

| State | Why hostile |
|-------|-------------|
| AL | TBD per survey — bespoke scraper |
| IL | ilga.gov SPA-rendered, JS-required |
| IN | iga.in.gov auth-walled or paywalled |
| MD | mgaleg.maryland.gov dynamic search |
| MI | legislature.mi.gov bespoke template |
| NJ | nj.gov statute index irregular |
| NM | nmonesource paywalled (commercial vendor) |
| OK | oksenate.gov dynamic |
| OR | oregonlegislature.gov XML-feed-claimed-but-not-public |
| PA | pacodeandbulletin.gov spreadsheet/PDF only |
| ME | mainelegislature.org dynamic search |
| NY | API-key-gated (free but requires signup) |
| TX | Angular SPA — every URL returns same shell |

(Verify exact list against Phase 3 closeout DB jurisdictions before starting.)

## Expert Lens

**Primary**: openstates-team for per-state structure. **Secondary**: Playwright/headless-browser patterns for SPA-rendered states (TX, IL).

**Pattern**: 3 sub-buckets:
- C1 — Auth-walled (NY, NM): obtain credentials, use API
- C2 — SPA-rendered (TX, IL, MD, ME, OK): Playwright headless to render JS, scrape DOM
- C3 — Bespoke quirky (AL, IN, MI, NJ, OR, PA): per-state research + custom scraper

## Numbered Tasks

T0 — Per-state research + entry strategy (one coverage doc per state).

T1-T13 — Per-state ingest:
- C1 wave (NY, NM): obtain API keys → ingest
- C2 wave (TX, IL, MD, ME, OK): Playwright → ingest
- C3 wave (AL, IN, MI, NJ, OR, PA): bespoke scraper → ingest

T14 — cron-job.org refresh registration (only for non-headless-browser states; headless-browser states need engine-worker host).

## Out of Scope

- 50-state expansion beyond US states (territories/PR/GU/VI).
- Federal Code further expansion.
- Cross-state case-law work.

## Success Criteria

- SC-1 to SC-13: each state ≥150 rows, audit clean
- SC-14: all hostile-state ingest scripts have working refresh cadence (engine-side for SPA states, Vercel-cron for stable HTML states)

## Trigger to start

After Phase 3 Wave 3 lands AND missing-from-git ingest scripts reconstructed AND NY API key obtained.

## Status

DRAFT. To be replanned after Phase 3 closeout.
