# Demand Intel Feed Regeneration — 2026-04-26

## Goal
Regenerate `C:\Users\email\projects\ImNotAnAttorney\docs\demand-intel\DEMAND-FEED.md` from latest Supabase data with delta vs prior 2026-04-25 feed.

## Files to create
- `C:/Users/email/projects/ImNotAnAttorney-web/.tmp/query-demand-intel.mjs` — schema-correct snapshot query (already exists)
- `C:/Users/email/projects/ImNotAnAttorney-web/.tmp/schema-check.mjs` — column verifier (already exists)
- `C:/Users/email/projects/ImNotAnAttorney-web/.tmp/check-7d.mjs` — 7d freshness deep-check (optional)

## Files to modify
- `C:/Users/email/projects/ImNotAnAttorney/docs/demand-intel/DEMAND-FEED.md` — overwrite with 2026-04-26 feed

## Tasks
1. Query demand_scores / content_gaps / emerging_topics / discovered_subreddits — snapshot to JSON.
2. Freshness gate: emerging_topics >14d → flag PIPELINE STALE.
3. Compose feed: Top Gap, Gold Mines, Rising Stars, Declining, Emerging, Discovered Subreddits, Δ-vs-prior, Operator Action.
4. Write DEMAND-FEED.md.

## Notes
- demand_scores keyed (dimension_slug, window_label); use latest-row dedup.
- content_gaps `status` reflects historical operator decisions — read demand from `demand_scores.demand_score + content_gap_score`.
- Schema columns confirmed via schema-check.mjs (trend_direction not momentum_label, avg_urgency not urgency_score, etc).
