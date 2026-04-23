# State Statutes Seed Pipeline — Scaling Plan (50 states)

**Date:** 2026-04-22 (planned) → execute 2026-04-23+
**Status:** PLAN — not yet implemented
**Reason deferred:** Full-state scraping pipeline requires ≥3h for FL alone + web research on FL Online Sunshine structure + verification-URL rule enforcement + unit tests. Task E (CI drift fix) prioritized to unblock master.

## Context

`entities_statutes` is 100% federal (`jurisdiction='US'`) as of 2026-04-22. The whitelist builder falls back to federal statutes when no state rows exist, keeping the whitelist non-empty but missing state-specific signal.

INAA traffic heavily skews to state cases (DUI, drug possession, assault, domestic violence × 50 states via pSEO). Populating state statutes meaningfully improves report accuracy for the dominant customer segment.

## Non-negotiable rule

**Every row MUST have `source_urls[]` populated with the actual verification URL we fetched.** This is the hard rule from `~/.claude/rules/no-hallucinated-legal-data.md`. Criminal defendants will act on this data. Fabricated or unverifiable rows = prohibited.

## Strategy

### Phase 1 — FL only (proof of pattern)
- **Source:** Florida Online Sunshine (`http://www.leg.state.fl.us/Statutes/`) — official, free, structured.
- **Fallback:** Cornell LII (`https://www.law.cornell.edu/wex/table_statute` + state pages) — always quotes original.
- **Target chapters:** Chapter 316 (traffic / DUI), Chapter 775 (penalties), Chapter 784 (assault), Chapter 810 (burglary), Chapter 812 (theft), Chapter 893 (drug abuse prevention). These 6 chapters cover ~80% of INAA's FL intake coverage.
- **Row shape:** `(canonical_id UUID, jurisdiction='FL', title=<chapter num>, section=<section>, title_text, body_text, is_current=true, source_urls=['http://www.leg.state.fl.us/Statutes/...'])`.
- **Script:** `scripts/ingest/seed-statutes-fl.mjs` — single-state seed, rate-limited to 1 rps, outputs to stdout + `data/statutes-fl-<timestamp>.jsonl`, inserts via COPY FROM STDIN after preview.
- **Tests:** `scripts/ingest/__tests__/seed-statutes-fl.test.mjs` — mock Online Sunshine HTML, assert parse yields `source_urls`, assert no row ships without `source_urls`.

### Phase 2 — Clone to 13 states (80/20 coverage)
States ranked by INAA intake volume (proxy: pSEO page hit rates):
`FL, TX, CA, NY, GA, IL, PA, OH, NC, MI, VA, AZ, WA`.

Each state has its own legislature structure. Approach:
- Where LII has clean Wex pages → use LII as primary, state site as secondary.
- Where Justia has the full statute text → use Justia (`https://law.justia.com/codes/<state>/<year>/`).
- Where only the state legislature serves structured data → scrape that directly.

Per-state script variants share a common library (`scripts/ingest/lib/statute-scraper.mjs`) for HTTP, rate limiting, and verification-URL injection.

### Phase 3 — Remaining 37 states
Long tail. Lower volume, so lower per-state ROI. Consider:
- Bulk LII download (if still feasible in 2026) for all 50 states at once.
- Accept lower coverage for low-volume states (top 3 chapters only).

## Open risks

1. **Rate-limit bans from state sites.** Mitigation: 1 rps cap, User-Agent identifying INAA research, retry-after honored.
2. **Parse drift when legislatures redesign their sites.** Mitigation: loose regex + fallback to plain-text extraction; schema-validate every row before insert.
3. **Supabase statement_timeout on bulk inserts.** Mitigation: COPY FROM STDIN via `scripts/lib/pg-bulk-defaults.mjs` (per cl-bulk-data-defensive.md rule #18).
4. **"is_current" gets stale.** Mitigation: monthly refresh cron; track `last_verified_at` per row.

## Acceptance criteria (Phase 1)

- FL gets at least 120 rows across the 6 target chapters.
- Every row has `source_urls[]` with at least 1 URL pointing to FL Online Sunshine.
- Whitelist builder returns FL statutes when `jurisdiction='FL'` is passed (validated via integration test).
- Report deliverables reference FL statutes instead of falling back to federal.

## Expert

`~/.claude/experts/` — will triangulate "state statute scraping best practices 2026" before write. Likely lands on Eric Mill (govtrack.us alum) or the Cornell LII engineering blog.

## Why not this session

- Minimum 3h+ to write and test correctly with the verification-URL rule enforced.
- Task E (CI drift fix) and Task C (T101 authority wiring) were in scope and landable within the session budget.
- Quality-over-shipped for legal data: rather than ship a partial pipeline that risks UPL/accuracy violations, ship the plan.

## Branch when executed
`feat/state-statutes-fl-seed` (from origin/master).
