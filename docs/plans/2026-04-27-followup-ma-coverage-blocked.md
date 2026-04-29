# Follow-up: MA Coverage — UNBLOCKED 2026-04-29

**Status:** UNBLOCKED. The "Lexum-only canonical source" assumption from this
plan was wrong. The Massachusetts BBO publishes the FULL discipline register
on a Salesforce Lightning Community site at `https://www.massbbo.org/s/decisions`
(not `decisions.massbbo.org`). The `/s/decisions` URL was never tested in the
prior session. See `docs/plans/2026-04-26-followup-ma-bbo-full-coverage.md`
for the shipping plan + outcome.

## Final state (2026-04-29)

- **MA total: 464 → 3779 events** (+3315 from BBO Salesforce SPA via Apex JSON)
- **Year coverage**: 1997-2026 (50-180 events/year)
- **Plan goal ≥1000 → 378% over**
- **100% HTTPS source_url, 0 NULL** (anti-hallucination audit clean)

## Why this plan was wrong

This plan only investigated `decisions.massbbo.org` (the legacy Lexum endpoint),
which IS 403/CAPTCHA-blocked. It missed that BBO migrated public discipline
listings to a Salesforce Community site at a different host (`www.massbbo.org`)
with a different stack (Lightning + Apex), accessible without auth or CAPTCHA.

A single Apex action POST returns the FULL list (~864KB JSON, 3337 entries)
in one shot. Playwright captures the response body via `page.on('response')`.

## What changed in implementation

- New scraper: `scripts/ingest/scrape-mabbo-discipline.mjs`
- Live fixture: `scripts/ingest/__fixtures__/ma-bbo-sample.json`
- Tests: `scripts/ingest/__tests__/scrape-mabbo-discipline.test.mjs` (28 tests)
- Filename-prefix sanction mapping: `pr*`→`public_reprimand`, `ad*`→`admonition`,
  `bd*`/other→`unknown` (broad prefix; refinable via PDF body classification —
  see "Future enhancement" in the shipping plan).

## Lesson learned

Before accepting a $0-blocked status: check the SAME organization's other URL
paths. BBO had two distinct discipline portals — the legacy Lexum one (closed)
and the new Salesforce Community one (open). Probing only the path the prior
session tried left 7000-attorney coverage on the table.

## Out of scope (separate phase)

- Upgrade 2816 `unknown` rows by fetching the order PDFs and classifying
  sanction via keyword scan. ~45min compute. Tracked as Future Enhancement
  in `docs/plans/2026-04-26-followup-ma-bbo-full-coverage.md`.
