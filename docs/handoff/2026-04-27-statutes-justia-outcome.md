# Justia Statute Scraper — OH/MN/NV — Outcome

**Date:** 2026-04-27
**Branch:** `feat/statutes-justia-oh-mn-nv`
**Plan:** `docs/plans/2026-04-27-data-completeness-master.md` (G4)

## Result

Acceptance criteria met:

| State | Before | After | Δ | bad source_urls |
|-------|--------|-------|---|-----------------|
| OH    | 56     | 85    | +29 | 0 |
| MN    | 62     | 85    | +23 | 0 |
| NV    | 70     | 85    | +15 | 0 |

100% HTTPS source_urls, 0 NULL on new rows. 67/67 slugs parsed, 0 failures.

## Source Pivot — State-Leg Primary, Justia Attribution Preserved

Justia (law.justia.com) is fronted by Cloudflare bot-detection that returned 403/CF-challenge on every realistic-UA fetch from this network. Per spec (`Justia or state legislature if cleaner`), pivoted to official state legislature publishers:

- **OH** → `codes.ohio.gov` (Ohio Laws / LSC)
- **MN** → `www.revisor.mn.gov` (Office of the Revisor of Statutes)
- **NV** → `www.leg.state.nv.us` (NRS chapter pages, section anchors)

State-leg URLs are arguably more authoritative than Justia copies. Each row's `statute_url` and `source_urls[0]` point to the page actually fetched. Original Justia URLs preserved in `data/charge-taxonomy/_justia-slug-map.json` for reference.

## Files Shipped

| File | Purpose |
|------|---------|
| `scripts/ingest/scrape-statutes-justia.mjs` | Orchestrator + I/O + DB writer |
| `scripts/ingest/lib/justia-html.mjs` | Pure-string HTML parsers (no fs imports — FL pattern) |
| `scripts/ingest/__tests__/scrape-statutes-justia.test.mjs` | 29 vitest cases |
| `scripts/ingest/__fixtures__/*.html` | 6 live-captured state-leg pages (anti-TN-bug rule) |
| `data/charge-taxonomy/_justia-slug-map.json` | 67-slug map: slug → statute_number + Justia URL + title |
| `data/charge-taxonomy/{OH,MN,NV}.json` | Extended seed JSONs |

## Architectural Compliance

- **Invariant #13 (Verification-URL Hard Rule):** every row carries 1 HTTPS `source_urls[]` entry pointing to the page that was actually fetched.
- **No-hallucinated-legal-data rule:** scraper extracts `notes` excerpt directly from official statute text. Penalty/class fields use deliberate regex on parsed body and are NULL when not inline (no fabrication).
- **Bootstrap mode:** $0 budget — no paid APIs, no Anthropic SDK, free state-leg sources only.
- **csv-bulk-checked:** `none-exists — Justia/codes.ohio.gov/revisor.mn.gov/leg.state.nv.us are HTML-only, no bulk CSV` (per cl-bulk-data-defensive #19).
- **No regex on file contents:** all HTML parsing lives in `lib/justia-html.mjs` which imports zero file-IO modules (FL `lib/fl-html.mjs` pattern).
- **Live-fixture tests:** fixtures captured from live state-leg pages BEFORE parsers were written, parsers cross-validated against live before fixture-cement.

## Out of Scope

- AK (83) and AZ (84) accepted at jurisdictional ceiling per blocker review — not touched.
- NV `domestic-violence` slug exists in DB but missing from `NV.json` (pre-existing drift, unrelated to this PR; DB count unaffected).
- Penalty extraction is best-effort regex; many statutes do not state penalties inline (penalties live in separate sentencing sections). NULL fields are acceptable per schema.

## Verification

```bash
# tsc
cd C:/Users/email/projects/_worktrees/statutes-justia-oh-mn-nv
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck   # exit 0

# tests
node node_modules/vitest/vitest.mjs run scripts/ingest/__tests__/scrape-statutes-justia.test.mjs   # 29 passed

# audit
SELECT jurisdiction, COUNT(*) FILTER (WHERE active) AS active_n,
       COUNT(*) FILTER (WHERE active=true AND (source_urls IS NULL OR cardinality(source_urls)=0)) AS bad
  FROM jurisdiction_statutes WHERE jurisdiction IN ('OH','MN','NV') GROUP BY jurisdiction;
# OH=85 MN=85 NV=85, bad=0 each
```
