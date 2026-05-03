---
source: Attorney discipline events (per-state bar scrapes)
provider: 51 state/territorial bars + CourtListener captions
url: per-state — see file
format: multi (HTML / Apex JSON / PDF / Playwright)
license: Public discipline orders are public records by court rule
last_refresh: 2026-04-29
refresh_cadence: per-state quarterly
db_tables:
  - attorney_discipline_events
consuming_tiers:
  - Intelligence Brief ($997)
  - X-Ray ($2,497)
  - War Room ($4,997)
---

# Attorney discipline events

Per-state bar discipline orders (suspensions, disbarments, censures, reinstatements). Used in IB / X-Ray / War Room to surface "your opposing counsel has a disciplinary history" intelligence. Also feeds the Attorney Discipline Wire Phase 5 customer-facing surface.

**Drift note:** older docs sometimes called this `bar_discipline_events`. The production table is `attorney_discipline_events`. Apply this correction in any new query.

## Source

| Aspect | Value |
|---|---|
| Provider | 51 state/territorial bar associations + CourtListener (caption-matched fallback) |
| Bulk URL | per-state — see coverage table below |
| Format | HTML scrape / Salesforce Apex JSON / PDF / Playwright headed-Chrome |
| Refresh | per-state quarterly (state-bar publishing cadence) |
| Total rows | 37,387 across 51 jurisdictions (verified 2026-04-29) |

## Schema target

`attorney_discipline_events` columns include: bar_number (state-prefixed key), full_name, jurisdiction, discipline_type, order_date, violation_summary, source_urls (REQUIRED), order_url (optional CL permalink).

## Per-state coverage status (51 jurisdictions, 100% HTTPS, 0 NULL src)

Top contributors (post-2026-04-29):

| Jurisdiction | Rows | Source pattern |
|---|---:|---|
| MA | 3,779 | `www.massbbo.org/s/decisions` Salesforce Apex JSON (not Lexum subdomain — that's CAPTCHA-gated) |
| MN | 1,560 | `lawyersearch.mncourts.gov` Volterra ADC WAF + headed Chrome |
| CA | 1,194 (deduped from 2,525) | calbar.ca.gov |
| DC | 730 | DC Bar |
| NC, AL, SC | 2,846 combined | per-state HTML / Supreme Court opinions |
| MO, WI, LA | 1,062 combined | live HTML + WAF gotchas + synthetic-bar pattern |

Full per-state rows + scraper paths in `~/.claude/agent-memory/general-purpose/inaa-bar-scrapers.md`.

**Documented blockers (real, plans written):**

- **MN bar 2019/2020/2021** — image-only PDFs need pdfjs + tesseract OCR (PR #174 plan).
- **MA per-attorney depth** — paywalled (PR #175 plan).
- **KY bar discipline** — CL gap; alt-source candidates listed (PR #185 plan).
- **MT bar discipline** — Wix JS-rendered ODC; 2-4h Playwright unblock (PR #195 plan).
- **federal-courts bar discipline** — 1 jurisdiction, separate triage.

## Ingest pipeline

- **Per-state scrapers:** `scripts/ingest/scrape-<state>-discipline.mjs`.
- **CL fallback:** when state HTML returns 403/Cloudflare/Wix-SPA, pivot to `https://www.courtlistener.com/?type=o&court=<id>&q=disciplinary+action+against` (battle-tested across 12 jurisdictions, PR #191 cross-validation pattern).
- **CL permalink enricher:** `scripts/ingest/enrich-mn-courtlistener.mjs` backfills `order_url` with per-decision CL permalinks (992/1560 MN events have click-through links as of 2026-04-29).
- **Cross-validation harness pattern (PR #189):** before `--apply`, run scraper + `buildRecordFromClResult` against live JSON fixture, dump accept/reject for human eyeball. Caught 5 parser bugs at fixture review BEFORE prod hit.

## License / fair use

Public discipline orders are public records by court rule in every state. INAA stores summaries + links to the order; full order PDF stays at the bar's URL.

## Anti-patterns / known gotchas

- **Same vendor, multiple URLs** — MA had `decisions.massbbo.org` (Lexum, 403/CAPTCHA) AND `www.massbbo.org/s/decisions` (Salesforce Community, open). Always probe ALL subdomains.
- **WAF fingerprint = headless Chrome only** — `--disable-blink-features=AutomationControlled` flag + headed Chrome bypasses Volterra. Pure curl blocked.
- **3 parallel headed Chrome processes ≈ 3× throughput** — Volterra rate-limits per-session-cookie, not per-IP. Cheap parallelization for WAF-protected sources.
- **PDF classifier as separate phase** — initial scrape (filename-prefix) + later classifier (full PDF body) decouples ingest from accuracy upgrade. MA classifier achieved 82% `unknown` reduction without re-fetching listing.
- **NULL `order_date` allows duplicates** in composite unique key (NULL != NULL). 2025 CA dedupe surfaced 1,331 dupes (52% of pre-dedupe rows). Consider `COALESCE(order_date, '1900-01-01')` in dedup keys.
- **CL "DISCIPLINARY ACTION AGAINST <Name>" caption pattern** matches MN; CA Supreme Court doesn't use it (CA was probed and rejected as CL-enrichable).

## Last refresh + next trigger

- Last big shipment: 2026-04-29 (MA 3779 + MN 1560).
- Next refresh trigger: per-state quarterly cron (TBD; manual triggers documented in scraper headers).
- Anti-hallucination audit pristine: 0 NULL src, 100% HTTPS.
