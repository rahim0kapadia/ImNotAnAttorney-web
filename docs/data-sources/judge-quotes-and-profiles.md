---
source: Judge quotes + judge profiles
provider: Derived from CourtListener bulk (people + opinions)
url: derived from courtlistener-bulk
format: derived
license: Inherits CL bulk license (public-domain federal/state opinion text)
last_refresh: 2026-04-11 (Tier 9 Phase 1)
refresh_cadence: rolling per CL refresh
db_tables:
  - judge_profiles
  - judge_quotes
  - judicial_quotes
consuming_tiers:
  - Judge Report Card ($197)
  - Intelligence Brief ($997)
  - X-Ray ($2,497)
  - War Room ($4,997)
---

# Judge quotes + judge profiles

Per-judge profile spine (CL `cl_people` + FJC enrichment) plus judicial quotes scraped from opinion text. Powers Judge Report Card + IB jurisdictional intelligence + War Room weekly digest.

## Source

| Aspect | Value |
|---|---|
| Provider (root) | CourtListener bulk (`cl_people`, `cl_opinions`) + FJC judges |
| Bulk URL | derived — see [courtlistener-bulk.md](courtlistener-bulk.md) and [fjc-judges-and-idb.md](fjc-judges-and-idb.md) |
| Format | derived |
| Refresh | rolling per CL refresh |

## Schema target

| DB table | Rows | Notes |
|---|---:|---|
| `judge_profiles` | ~15,613 (15,386 with jurisdiction) | per-judge profile; `jurisdiction` indexed for IB/X-Ray queries |
| `judge_quotes` | ~64,730 (15,652 linked, 5,494 keyword-classified) | per-quote with topic classification |
| `judicial_quotes` (denormalized into `judge_profiles`) | 492 judges with topic-sorted quote arrays | for fast Judge Report Card render |

## Topic classification (keyword-based)

Quotes are topic-tagged using keyword matching: sentencing, constitutional, evidence, procedure, etc. 5,494 quotes classified as of 2026-04-11.

## Ingest pipeline

- **Profile spine:** `scripts/build-judge-profiles.mjs` — joins `cl_people` + `fjc_judges` + court mapping.
- **Quote linking:** `scripts/link-quotes-to-judges.mjs` — needs `opinions-filtered.csv` (filtered subset of 50GB CL bulk).
- **Topic classification:** keyword-based pass over linked quotes.
- **Denormalization:** `judge_profiles.judicial_quotes` JSONB array, topic-sorted, for Tier 9 Judge Report Card render.

## Known gaps

- **108K judge quotes still unlinked** — `link-quotes-to-judges.mjs` ready but needs `opinions-filtered.csv` from next CL bulk pass.
- **Quote quality drift** — many short / generic quotes ("We reverse.") flagged for filter pass.
- **Thin states (AK/ND/WY/PR/VI/GU)** — CL exhausted; need state-judiciary directory scrape (G8b plan, 4-6h).

## License / fair use

Inherits CL bulk license (public-domain federal/state opinion text). Cite CL opinion permalink per quote.

## Anti-patterns / known gotchas

- **`judge_profiles.name` vs `full_name`** — Tier 9 Phase 0 fix renamed; ensure all queries use `full_name`.
- **`positions` JSONB derivation** — `jurisdiction` denormalized for indexed lookups.

## Last refresh + next trigger

- Last refresh: 2026-04-11 (Tier 9 Phase 1).
- Next refresh trigger: when CL bulk re-ingest completes.
