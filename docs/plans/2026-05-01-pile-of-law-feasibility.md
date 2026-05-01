# Pile of Law state_codes Feasibility

**Status:** RESEARCH-COMPLETE — VERDICT: **BLOCKED** (CC-BY-NC-SA-4.0 NonCommercial clause + one-row-per-entire-state-code granularity). Capstoned 2026-05-01. No further action; do NOT ingest.

Date: 2026-05-01
Source: https://huggingface.co/datasets/pile-of-law/pile-of-law
Downloaded to: C:/Users/email/projects/ImNotAnAttorney-engine/scripts/ingest/pile-of-law/

## License (CRITICAL — BLOCKER)

License: CC-BY-NC-SA-4.0 (Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International)

Exact quote from README: "CreativeCommons Attribution-NonCommercial-ShareAlike 4.0 International. But individual sources may have other licenses."

**Verdict for INAA: BLOCKED — commercial use prohibited.**

The NC clause explicitly prohibits commercial use. INAA is a commercial product ($97–$9,997 paid tiers). Deriving rows from this dataset and shipping them in our `entities_statutes` table would violate the license. The SA (ShareAlike) clause compounds this: any derivative must carry the same NC restriction, which would infect our entire schema.

This is a hard stop independent of all other findings below.

---

## Dataset Shape

- Train file: `data/train.state_code.jsonl.xz`
  - Compressed: 704.97 MB
  - Decompressed: 5,019 MB (per README)
- Validation file: `data/validation.state_code.jsonl.xz`
  - Compressed: 371.76 MB
  - Decompressed: 2,678 MB (per README)
- Total: 1,077 MB compressed / ~7,697 MB decompressed
- Estimated row count: ~503 total (train ~328 + validation ~175)
  - Derived from: 8MB compressed = 61MB decompressed = 4 rows → ~15.3 MB/row avg

**Note:** The HuggingFace dataset card claims 217 documents (via Multi_Legal_Pile_Commercial mirror). Our estimate of ~503 rows may reflect multiple scraped versions of the same state code over different years (created_timestamp varies: 2009, 2010, 2014, 2016).

The file is NOT gated — HTTP 206 range requests succeed without authentication. Download would be feasible if license were not a blocker.

### Sample rows inspected (4 rows from first 8MB compressed)

```json
{
  "url": "https://drive.google.com/drive/folders/1pwCK380GHW-0d6C5k-CF1YdGgYXu32Hj?usp=sharing",
  "text": "Title 1 - STATE AFFAIRS AND GOVERNMENT\n\nChapter 01 - State Sovereignty...",
  "created_timestamp": "2014",
  "downloaded_timestamp": "10-24-2021"
}
```

---

## Schema Fields

| Field | Type | Example | INAA mapping |
|-------|------|---------|--------------|
| `text` | string | 7,829 KB–22,581 KB of raw code text | `section_text` — BUT see granularity issue |
| `url` | string | `https://drive.google.com/drive/folders/1pwCK380GHW-0d6C5k-CF1YdGgYXu32Hj?usp=sharing` | `source_urls[0]` — FATAL, see below |
| `created_timestamp` | string | `"2014"`, `"2009"`, `"2010"` | `effective_date` partial — year only |
| `downloaded_timestamp` | string | `"10-24-2021"` | metadata only |

**There is no `state`, `jurisdiction`, `section`, or `title` field.**

---

## Critical Finding 1: Granularity — One Row = Entire State Code

Each row is the COMPLETE statutory code for one state, not a section or chapter. Text sizes in our 4-row sample:

| Row | State (inferred) | Text size |
|-----|-----------------|-----------|
| 0 | South Dakota (SL XXXX citation pattern) | 7,829 KB |
| 1 | New Mexico (NMSA 1978) | 1,330 KB |
| 2 | Nevada (NRS prefix) | 22,581 KB |
| 3 | Tennessee (Tennessee code commission) | 3,990 KB |

To map a row to `entities_statutes`, we would need to:
1. Parse the entire state code blob to identify chapter/section boundaries
2. Split into individual sections
3. Extract section numbers via regex
4. Assign jurisdiction from text content (no explicit field)

State identification must be done by parsing internal cues (citation format, code name abbreviations). This is non-trivial and error-prone:
- SD: "SL XXXX, ch XXX" pattern
- NM: "NMSA 1978" prefix
- NV: "NRS X.XXX" prefix
- TN: "Tennessee code commission", "T.C.A." pattern

---

## Critical Finding 2: Source URLs — All Point to Google Drive

**Every row in our sample shares the identical URL:**
```
https://drive.google.com/drive/folders/1pwCK380GHW-0d6C5k-CF1YdGgYXu32Hj?usp=sharing
```

This is a Google Drive folder link, NOT an authoritative state legislature URL. This is fatal for INAA under the `no-hallucinated-legal-data` rule:

> "ALL legal data MUST come from VERIFIED SOURCES with stored URLs... source_urls[] MUST be populated for any row claiming verification status."

A Google Drive folder link:
- Does not point to the canonical state legislature source
- Cannot be verified as authoritative
- Will not survive freshness checking (Drive links expire or go private)
- Does not satisfy our schema's `source_urls[]` requirement

Even if the license were permissive, this alone would block ingestion.

---

## Coverage by State

From our 4-row sample, we confirmed 4 states: SD, NM, NV, TN. We cannot enumerate all states without downloading the full ~7.7 GB. The README for Multi_Legal_Pile_Commercial (which mirrors this data) lists:

- Type: legislation, Jurisdiction: US, Source: state_codes — **217 documents**

With ~50 US states + DC + territories, 217 documents suggests approximately 4–5 versions per state over time (years 2009–2021 range in our sample). Not all states may be present — the dataset was scraped opportunistically.

| State | Row count estimate | Has criminal code | Source URL constructible |
|-------|-------------------|-------------------|--------------------------|
| (4 confirmed) | ~1 per state per year | Unknown without full ingest | NO — all Google Drive |
| All others | Estimated ~50 states × 4–5 versions | Unknown | NO — same Google Drive |

---

## Granularity Summary

One row = one state's entire statutory code (multiple titles, hundreds of chapters, thousands of sections). Splitting to section-level would require:

1. State-specific section number regex (pattern differs per state: `§ X-X-X` vs `NRS X.XXX` vs `NMSA X-XX-X`)
2. Title/chapter boundary detection
3. State identification from text patterns
4. Deduplication across multiple year-versions of the same state

**Estimate: 2–4 days of parsing engineering per state × ~50 states = not worthwhile given the license and URL blockers.**

---

## Source URL Story

**NO per-state authoritative URL is derivable from this dataset.** The `url` field is a static Google Drive folder shared by the dataset authors, not a legislature.gov URL. We cannot reconstruct `leg.state.XX.us` or equivalent URLs from the data.

---

## Verdict: SKIP

Three independent blockers, any one of which is fatal:

1. **LICENSE (FATAL):** CC-BY-NC-SA-4.0 prohibits commercial use. INAA is commercial. Non-negotiable.

2. **SOURCE_URLS (FATAL):** All rows share a Google Drive URL that is not an authoritative legislature source. Violates `no-hallucinated-legal-data` rule — `source_urls[]` would be unfillable.

3. **GRANULARITY (FATAL):** One row = entire state code (7–23MB). Not section-level. Splitting to `entities_statutes` row level requires state-specific parsers — massive engineering cost for data we can't legally use anyway.

---

## Alternative Paths

### Path A (RECOMMENDED): joelniklaus/Multi_Legal_Pile_Commercial
- URL: https://huggingface.co/datasets/joelniklaus/Multi_Legal_Pile_Commercial
- License: CC-BY-SA-4.0 — **commercial use PERMITTED** (no NC clause)
- Contains: US state_codes subset, 18,066 MB, 217 documents
- Caveat: This appears to be the SAME underlying data (the Pile of Law state_codes files) re-published under a permissive license. The source URL problem and granularity problem likely persist. **Verify schema before investing engineering time.**
- Action: Download 8MB sample, inspect URLs — if still Google Drive, same problems.

### Path B: Direct state legislature bulk downloads
- Most states publish their full statutory code as XML or plain text
- Examples: leg.state.XX.us, legislature.state.XX.us, official state code sites
- License: US state government works = public domain in most states
- Source URLs = authoritative by definition
- This is the path already being used for FL/OH/VA/USC in our existing pipeline
- **This is the right path — continue extending the existing per-state ingestion scripts.**

### Path C: OpenStates bulk data (state legislative data)
- URL: https://openstates.org/data/
- License: CC0 / public domain
- Covers: all 50 states + DC
- Content: Bills, amendments, votes — NOT compiled statute codes
- Verdict: SKIP for statute text ingestion; useful for legislative tracking only.

### Path D: Cornell LII / Justia state code pages
- Already used for our existing verified pipeline
- Requires per-section HTTP fetches (no bulk dump)
- Source URLs authoritative (e.g., law.justia.com/codes/XX/XXXX/section-XXXX)
- Compliant with no-hallucinated-legal-data rule
- Verdict: Continue existing pattern — already proven for FL/OH/VA/USC.

---

## Files Left on Disk

- `C:\Users\email\projects\ImNotAnAttorney-engine\scripts\ingest\pile-of-law\sample.xz` — 512KB partial compressed
- `C:\Users\email\projects\ImNotAnAttorney-engine\scripts\ingest\pile-of-law\sample8mb.xz` — 8MB partial compressed
- `C:\Users\email\projects\ImNotAnAttorney-engine\scripts\ingest\pile-of-law\sample_rows.json` — first 10 rows as parsed JSON

These can be deleted — no ingest will proceed from this dataset.
