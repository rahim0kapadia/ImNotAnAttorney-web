# Handoff: Charge Type Extraction Pipeline

**Date:** 2026-04-14
**Status:** Extractor improved + bulk script written. Full run blocked by Postgres timeout.

## What was done

1. **Improved `scripts/lib/mechanical-extractor.mjs`**, Added two new charge extraction methods:
   - `extractChargesFromKeywords()`, 177 phrases across 10 categories (dui, drug-possession, drug-trafficking, assault, theft, robbery, burglary, domestic-violence, murder, sex-offense). Uses contextual phrases like "convicted of murder", "charged with robbery".
   - `extractChargesFromTheoryKeywords()`, aggregates theory keywords from `charge_defense_theories` table, requires 3+ keyword hits per charge for high confidence.
   - Both merge with existing statute-citation extraction in `extractAll()`.

2. **Created `scripts/bulk-extract-charge-types.mjs`**, Focused charge-only pipeline that streams `opinions-criminal.csv` (45GB), runs keyword matching, updates `charge_types` via direct Postgres. Supports `, apply`, `, limit N`, `, resume-from N`.

3. **Tested:** 4.3% hit rate on full opinion text. All 10 charge categories represented. 50K test applied ~2K classifications before Postgres timeout.

## What's blocking

**Postgres idle timeout:** `scripts/lib/db.mjs` creates `pg.Client` without keepalive. Supabase pooler drops the connection after ~30s idle. During long CSV streaming (multi-line HTML fields), there are gaps between DB writes.

**Fix needed in `scripts/lib/db.mjs`:**
```javascript
_client = new pg.Client({
  connectionString: loadDbUrl(),
  ssl: { rejectUnauthorized: false },
  keepAlive: true,                    // ADD THIS
  keepAliveInitialDelayMillis: 10000, // ADD THIS
});
```

## Next steps (in order)

1. **Fix db.mjs keepalive**, 2-line edit, unblocks everything
2. **Run full extraction:** `node scripts/bulk-extract-charge-types.mjs,apply`
   - Expected: ~60K+ opinions classified (15x improvement from 3,985)
   - Runtime: 30-90 min
3. **Populate pattern tables**, Once charge_types are populated, aggregate into `defense_theory_outcomes` and `motion_success_patterns`
4. **Tier 9 standalone SKUs**, Judge Report Card, Officer Background Check, Similar Cases Analyzer need UI + checkout + generation pipeline. Data is ready.

## Key files

| File | What changed |
|------|-------------|
| `scripts/lib/mechanical-extractor.mjs` | Added CHARGE_NAME_KEYWORDS, extractChargesFromKeywords(), extractChargesFromTheoryKeywords(), merged in extractAll() |
| `scripts/bulk-extract-charge-types.mjs` | NEW, focused charge extraction pipeline |
| `scripts/lib/db.mjs` | NEEDS keepalive fix (2 lines) |

## Ready-to-paste prompt for next session

```
Fix the Postgres keepalive bug in scripts/lib/db.mjs (add keepAlive: true, keepAliveInitialDelayMillis: 10000),
then run: node scripts/bulk-extract-charge-types.mjs,apply

Context: Charge extraction pipeline was built and tested in previous session.
Handoff at C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-14-charge-extraction-pipeline.md
```
