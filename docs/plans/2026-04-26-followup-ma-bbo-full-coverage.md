# Follow-up: MA BBO Full Coverage (Per-Attorney Records)

## Scope

Current MA coverage: 25 events (PR #161 merged 2026-04-26). Source = `bbopublic.massbbo.org/web/f/fyXXXX.pdf` admin-only annual reports (statistics + outreach summaries; per-attorney detail thin).

BBO has held discipline records since 1974. Full historical coverage = ~5,000-10,000 events. Currently 25 / 5,000 = 0.5% coverage.

## Why current scrape gave only 25

- `decisions.massbbo.org` — primary per-attorney discipline portal — CAPTCHA-blocked on automated access.
- `bbopublic.massbbo.org/web/f/fyXX.pdf` — admin annual reports (NOT per-attorney records). PR #161 scrapes these; surfaces only the small subset of cases mentioned in admin narrative.

## Candidate alternate sources

1. **`https://www.mass.gov/info-details/bar-docket-and-attorney-discipline`** — SJC Clerk's Office bar docket. Likely the canonical per-attorney source. Format unknown — needs investigation.
2. **`https://www.massbbo.org/s/decisions`** — BBO Salesforce-rendered SPA. CSS-error on direct WebFetch but may work via Playwright with longer waits (Salesforce typically has high JS load time).
3. **CourtListener integration** — many MA discipline orders end up in `case_law` / `classified_opinions` already (1.46M opinions). Cross-reference attorneys from those rows with `attorney_discipline_events` schema.
4. **Boston Bar Journal** discipline columns — text-rich monthly publication.

## Approach when picking up

- 1-2 day estimate
- Try source #2 first (Playwright + 30s SPA wait, see if Salesforce decisions render)
- Source #3 in parallel — query existing `classified_opinions` for MA disbarment/suspension orders and lift attorney names + dates
- Fall back to #1 if BBO sources stay blocked

## Acceptance criteria

- MA events ≥ 1,000 rows in `attorney_discipline_events`
- Per-attorney granularity (name + BBO# + date + sanction)
- All rows source_url populated, HTTPS, 200-OK at scrape-time

## Constraint reminder

- No hallucinations: cannot write BBO# or sanction without source. If alt-source provides only attorney name + sanction (no BBO#), use synthesized key `MA:<sha1(full_name+order_date)>::8` like MD does.
- CAPTCHA: do not attempt to bypass. If `decisions.massbbo.org` requires it, route around via #1 or #3.

## Out of scope

- Backfilling historical IB reports already delivered with thin MA section.
- Pre-1974 records: BBO didn't exist.
