---
source: Case feature vectors
provider: Derived from CL clusters + USSC + state court mappings
url: derived
format: derived
license: Inherits CL + USSC license (both public-domain)
last_refresh: 2026-04-11 (charge_slug backfill)
refresh_cadence: rolling
db_tables:
  - case_feature_vectors
consuming_tiers:
  - Similar Cases Analyzer ($297)
  - X-Ray ($2,497)
---

# Case feature vectors

Per-case k-NN feature vectors used by Similar Cases Analyzer to surface "your case factually resembles N prior cases — here are their outcomes" intelligence.

## Source

Derived layer. No bulk URL. Sources:
- `cl_clusters` (case-level metadata, citation set)
- `ussc_individual_fy*` (federal sentencing distributions)
- per-state court mappings (where state-court features available)

## Schema target

| DB table | Rows | Notes |
|---|---:|---|
| `case_feature_vectors` | ~1,008 with `charge_slug` populated | per-case feature vector + outcome label + charge_slug |

## Ingest pipeline

- **Builder:** `scripts/build-case-feature-vectors.mjs` (verify exact path).
- **`charge_slug` backfill:** Tier 9 Phase 0 backfilled 1,008 rows.
- **Currently sparse:** only CO, AL, AR have meaningful FL DUI case_feature_vectors per Tier 9 readiness memo. FL DUI vectors absent — Similar Cases handles gracefully ("no comparable cases").

## License / fair use

Inherits CL + USSC public-domain license.

## Anti-patterns / known gotchas

- **`charge_slug` NULL** — older rows pre-backfill; default to fallback "no comparable cases" UI.
- **k-NN feature space drift** — adding a feature requires reindex. Track schema version.

## Last refresh + next trigger

- Last refresh: 2026-04-11.
- Next refresh trigger: when full opinion-text classification pass completes (would unlock more state-court vectors).
