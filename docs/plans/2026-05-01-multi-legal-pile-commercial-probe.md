# Multi_Legal_Pile_Commercial — Probe Result

**Status:** RESEARCH-COMPLETE — VERDICT: **SKIP / BLOCKED**. Live `load_dataset` probe 2026-05-01 confirmed dataset is published as a loading script (`Multi_Legal_Pile_Commercial.py`); HuggingFace `datasets>=3.0` dropped `trust_remote_code` support entirely. All 4 candidate configs (`en_legislation`, `en-legislation`, `us_legislation`, `en_state_codes`) returned `RuntimeError: Dataset scripts are no longer supported`. Cannot inspect rows without dataset author converting to Parquet (out of our control). Capstoned 2026-05-01.

**Date:** 2026-05-01  
**Source:** https://huggingface.co/datasets/joelniklaus/Multi_Legal_Pile_Commercial  
**Research:** WebFetch + WebSearch (15 min time-box) + live `load_dataset` probe (`scripts/probe-mlpc.py`, 2026-05-01)

---

## Kill Check

### 1. License: ✅ USABLE
- **Declared**: CC-BY-SA-4.0 (Commercial version, no NC clause)
- **Verdict**: Permissively licensed for commercial use. USABLE.
- **Caveat**: Full MultiLegalPile includes subset "legal_mc4" (less permissive), but Commercial version excludes it. Verify load_dataset config excludes legal_mc4 before use.

### 2. Source URL Field: ⚠ UNKNOWN
- **Known**: Dataset README lists source jurisdiction + license per config (e.g., Germany → openlegaldata.io, UK → Zenodo, US → CourtListener). Sources appear authoritative by project name.
- **Unknown**: Whether per-row JSONL documents include a `source_url` field pointing to the authoritative state-leg domain (e.g., `leg.colorado.gov/...`), or if source URLs exist only at the dataset-config level (jurisdiction-wide), not per row.
- **Blocker if True**: If source URLs are config-level only (one URL per entire state code bucket), granularity fails INAA's "verify with stored URL per entity" requirement.
- **Verdict**: BLOCKED UNTIL VERIFIED.

### 3. Granularity: ⚠ UNKNOWN
- **Known**: Dataset is stored as JSONL (one JSON object per row). Paper mentions "average words per document" varies by source (495–1.3M tokens). Pile of Law (which Multi_Legal_Pile inherits) is known to store one-row-per-entire-statute-code (the blocker that killed Pile of Law for INAA).
- **Unknown**: Whether Multi_Legal_Pile_Commercial re-granularized the state codes to section-level (each row = one § section), or kept the coarse jurisdiction-level bundling.
- **Verdict**: BLOCKED UNTIL VERIFIED.

---

## Data Access & Verification Blocker

The Hugging Face dataset viewer is **disabled** for this dataset due to custom loading script execution requirements. Cannot visually inspect sample rows without:
1. Running `load_dataset("joelniklaus/Multi_Legal_Pile_Commercial", "en_legislation")` locally
2. Checking first 10 rows for fields: `source_url`, `text` (length), `jurisdiction`, `title`
3. Confirming per-row granularity via token/character count + text content sample

---

## Verdict

### ⛔ SKIP (unless verified)

**Why**: Two critical unknowns prevent use:

1. **No per-row source URLs visible in public docs** — cannot satisfy INAA's non-negotiable "verification URL stored per entity" requirement without inspecting actual JSONL.
2. **Granularity unknown** — likely coarse (jurisdiction-level) if inherited from Pile of Law, same blocker that killed PoL for INAA.

Same failure mode as Pile of Law: high-quality dataset, wrong granularity + source tracking for criminal-defense use case where every statute claim must have an audit trail.

---

## Path Forward (If Resources Available)

If INAA wants to unblock Multi_Legal_Pile_Commercial:

**Local Verification (30 min)**:
```bash
python3 << 'EOF'
from datasets import load_dataset
ds = load_dataset("joelniklaus/Multi_Legal_Pile_Commercial", "en_legislation", split="train", streaming=True)
sample = next(iter(ds))
print("Fields:", sample.keys())
print("Keys sample:", {k: type(v).__name__ for k, v in sample.items()})
print("First row (first 500 chars):")
print(str(sample)[:500])
EOF
```

**Kill-check questions**:
1. Does `source_url` field exist? Points to state-leg domain or generic bucket URL?
2. What is `len(sample['text'])` in tokens? State code (30K+) or section (2K–5K)?
3. Is there a `title` field that disambiguates section vs. full code (e.g., "§ 13-3401" vs. "Arizona Revised Statutes Title 13")?

If all three return green, Multi_Legal_Pile_Commercial is **USABLE** as a parallel ingest path (alongside current bucket-A bulk feeds) with conditional schema mapping.

---

## Alternative Path (No Verification Required)

Stick with current state-by-state bulk-feed pattern:
- **Bucket A**: Per-state official legislature sites (FL Online Sunshine, Cornell LII, etc.) — section-granular, authoritative source URLs
- **Bucket B**: Generic coarse sources (Multi_Legal_Pile, Pile of Law) for LLM pre-training only, not customer-facing lookups

**Status quo**: Bucket A covers NC/AZ/WA/OH (Phase 2). Expand via OPP + state-judiciary scrapers (G8). Multi_Legal_Pile_Commercial remains a research asset, not a production ingest source.

---

## References
- [Multi_Legal_Pile_Commercial on Hugging Face](https://huggingface.co/datasets/joelniklaus/Multi_Legal_Pile_Commercial)
- [MultiLegalPile: A 689GB Multilingual Legal Corpus (arXiv 2306.02069)](https://arxiv.org/abs/2306.02069)
- [MultiLegalPile HTML Version](https://arxiv.org/html/2306.02069v3)
