# Follow-up: MA BBO Full Coverage (Per-Attorney Records) — SHIPPED 2026-04-29

## Status: COMPLETE

## Outcome
- **MA discipline events: 464 → 3779** (+3315 new from BBO Salesforce SPA).
- **Year coverage: 1997-2026** (50-180 events/year, granular per-attorney).
- **Plan goal ≥1000 events** → **378% over goal**.
- **All rows: HTTPS source_url, 0 NULL** (anti-hallucination audit clean — see
  `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/pattern-anti-hallucination-audit-query.md`).
- **Per-decision granularity**: each row points to the actual order PDF on `massbbo.org`.

## What changed
- New scraper: `scripts/ingest/scrape-mabbo-discipline.mjs` (Playwright + Apex-JSON capture).
- Tests: `scripts/ingest/__tests__/scrape-mabbo-discipline.test.mjs` (28 tests, all pass).
- Live fixture: `scripts/ingest/__fixtures__/ma-bbo-sample.json` (captured 2026-04-29 from production Apex response).

## Source architecture
- URL: `https://www.massbbo.org/s/decisions` (Salesforce Lightning SPA).
- Mechanism: Page issues a single `aura?...ApexAction.execute=1` POST that returns
  ALL discipline records (~864KB JSON, 3337 entries) in one shot. No pagination,
  no auth, no CAPTCHA. Playwright captures the response body via `page.on('response')`.
- bar_number convention: `MABBO:<salesforceId>` (15-18 char Salesforce object ID).
  Coexists with legacy `MASJC:<docket>` keys from CourtListener-derived
  `scrape-mabar-discipline.mjs` and `MAFED:<docket>` from federal scraper.

## Discipline-type classification
- Filename prefix decoded:
  - `pr*.pdf` → `public_reprimand` (530 events)
  - `ad*.pdf` → `admonition` (16 events)
  - `bd*.pdf` / other → `unknown` (2816 events) — BBO publishes broad-prefix files;
    sanction not derivable from filename alone. **Future enhancement**: fetch each
    PDF + classify via keyword scan (separate phase).
- Reinstatement filenames (`reinst*.pdf`) explicitly dropped (not discipline events).
- Non-individual matter labels rejected (`Two Attorneys`, `Application for Criminal Complaint`, etc.).

## Anti-hallucination audit (post-ingest)
```
attorney_discipline_events  35929 rows  null_src=0
case_law                     3407 rows  null_src=0
classified_opinions       1462909 rows  null_src=0
entities_statutes            3589 rows  null_src=0
jurisdiction_statutes_active 4764 rows  null_src=0
MA: 3779 total / 3779 HTTPS / 0 http_only / 0 null
```

## Out of scope (future work)
- PDF body classification: upgrade `bd*` rows from `unknown` → specific sanction
  by fetching the order PDF and pattern-matching keywords. Estimated ~2800 PDFs.
- Backfill historical IB reports already delivered with thin MA section.
- Pre-1997 BBO records: only 1 record predates 1997 in this dataset (1985 placeholder).
