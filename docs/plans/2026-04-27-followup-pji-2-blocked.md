# PJI Circuit 2 (Second Circuit) — Blocked

**Date:** 2026-04-27
**Status:** RESEARCH FINDING — no free public PJI exists; not a defer, not a triage backlog item.

## Context

Plan G2 (`docs/plans/2026-04-27-data-completeness-master.md`) targets the four federal circuits not yet in `pattern_jury_instructions`: 2, 4, 12 (DC), and 13 (Federal Circuit). PR feat/pji-circuits-2-4-dc-fed shipped circuits 4 and 13. Circuit 2 was researched and found to be structurally unavailable for free ingestion.

## What we found

WebSearch query (`"Second Circuit" model jury instructions PDF Sand "modern federal" official court site`, 2026-04-27):
- The Second Circuit Court of Appeals (`ca2.uscourts.gov`) **does not publish circuit-level pattern criminal jury instructions**. Multiple library research guides (Marquette, Maryland, Jenkins) confirm this.
- The de facto "Second Circuit" reference is **Sand's "Modern Federal Jury Instructions"** (Leonard B. Sand, ten-volume LexisNexis publication). **Commercial / paywalled / copyrighted**. No free official PDF.
- District-level model instructions exist within the Second Circuit (e.g., SDNY local conventions) but are not published as a downloadable corpus the way SCD's are for the 4th Circuit.

Direct WebFetch attempt to `https://ww3.ca2.uscourts.gov/clerk/case_filing/forms/jury_instructions.html` → **HTTP 404**. There is no jury-instructions page on the 2nd Circuit's site.

## Why this isn't fixable today

Bootstrap Mode HARD RULE (`~/.claude/rules/atlas-identity.md` → "Bootstrap Mode — Universal"):
> public / free APIs first... Pay only when free path is provably insufficient.

Sand's Modern Federal is the LexisNexis private-API path. Adopting it would:
1. Cost $$$ for licensing (multi-volume, multi-seat).
2. Likely require copyright clearance to redistribute via INAA's customer-facing FJIB ($97 SKU). Quoting Sand verbatim in a paid product without license is a hard legal block.
3. Burn one of the SKU-economics constraints the FJIB tier was designed around (zero per-customer marginal cost).

District-level instructions (SDNY, EDNY) are also out-of-scope because:
1. They are not actually 2nd-Circuit-uniform — each district publishes its own; combining them would mis-represent "2nd Circuit pattern."
2. The PJI table schema is `(circuit, instruction_number, effective_date)` keyed — there's no district column. A district-keyed alternative would need a new table and a new SKU framing.

## What the FJIB SKU does today for 2nd Circuit users

`src/lib/tier9-reports/federal-jury-instruction-brief.ts`:
- `STATE_TO_CIRCUIT` maps NY/CT/VT to "2"
- `PJI_COVERED_CIRCUITS` does **not** include 2
- `queryFederalJuryBrief` falls back to the closest sibling circuit (today: 1st or 3rd) and adds a `limitations[]` note
- `checkFJIBCoverage` (in `coverage.ts`) sets `supported: 0` and emits a yellow info-banner pre-purchase

This is graceful degradation. No customer is broken; they just get a sibling-circuit fallback with explicit disclosure.

## Unblock criteria (what would let us ship 2nd Cir)

Any ONE of:
1. **Sand license:** INAA acquires a commercial license to redistribute Sand's Modern Federal Jury Instructions text. (Paid path; scope this when revenue justifies.)
2. **Public free alternative emerges:** An open-source / freely-licensed compendium of 2nd Circuit jury instructions appears (Justia, FCBA-style nonprofit, university law clinic project). Track via periodic WebSearch (every 6 months).
3. **District-by-district approach:** Refactor PJI table to include `district` column; aggregate SDNY/EDNY/NDNY/WDNY/D.Conn/D.Vt model instructions where each district publishes them. Requires schema migration and new SKU framing ("Federal District Jury Instructions" vs "Federal Circuit Pattern"). Scope as a separate plan; not auto-doable.

## Tracking

- `pattern_jury_instructions` will continue to have `circuit=2` row count = 0
- `federal-jury-instruction-brief.ts` `PJI_COVERED_CIRCUITS` will continue to omit 2
- `coverage.ts` will continue to surface "fallback to closest sibling" for NY/CT/VT
- This file is the durable record of WHY

Not a backlog item to revisit on cadence. Revisit only when the unblock criteria are met.
