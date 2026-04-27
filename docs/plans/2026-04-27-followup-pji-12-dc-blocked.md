# PJI Circuit 12 (DC Circuit) — Blocked

**Date:** 2026-04-27
**Status:** RESEARCH FINDING — no free public federal-DC-Circuit PJI exists.

## Context

Plan G2 targets 2, 4, 12 (DC), and 13 (Federal Circuit). Shipped 4 and 13 in PR feat/pji-circuits-2-4-dc-fed. DC Circuit researched and found structurally unavailable for free ingestion at the federal-circuit level.

## What we found

WebSearch query (`"DC Circuit" criminal jury instructions free PDF "court of appeals" federal`, 2026-04-27):

1. **The DC Circuit Court of Appeals (`cadc.uscourts.gov`) does not publish criminal pattern jury instructions.** Confirmed by Catholic University of America Law Library guide ("DC Legal Research"), Jenkins Law Library, and the DOJ Guide to Federal Court Resources. WebFetch of `https://www.cadc.uscourts.gov/internet/home.nsf/content/Forms+and+Documents` → HTTP 404 (URL pattern stale; no jury-instructions section discoverable).

2. **The "Redbook" — `Criminal Jury Instructions for the District of Columbia` (Bergman, Bar Association of DC YLS, currently 5th edition)** — is the standard DC criminal jury instruction reference, but:
   - It targets the **DC Superior Court** (DC's local-jurisdiction trial court), not the **federal DC Circuit Court of Appeals**.
   - It is published commercially via LexisNexis. Paid.
   - It is **not the same population** as our `pattern_jury_instructions` table, which holds federal-circuit-level criminal instructions.

3. The `dc.fd.org/motions/juryinst/` path (DC Federal Defender) returned an Aikens motion exemplar — useful as case-specific primary source but not a circuit-level pattern compendium.

## Why this isn't fixable today

Same constraint as circuit 2:
- Bootstrap Mode HARD RULE bans paid sources when free path is unproven.
- The Redbook is paywalled + not actually for the federal DC Circuit.
- The DC Circuit, like the 2nd, doesn't centralize circuit-level criminal jury instructions.

Adding a Superior-Court-Redbook-derived row set would:
1. Require Bergman/LexisNexis license. Same legal block as Sand for circuit 2.
2. Mis-represent the data: rows for DC Superior in a table keyed by `circuit` (the appellate-court taxonomy) would let a federally-charged defendant in the District of Columbia receive Superior Court (state-equivalent) instructions for what is supposed to be a federal-court instruction. That's a UPL-adjacent mis-positioning failure.

## What the FJIB SKU does today for DC users

- `STATE_TO_CIRCUIT["DC"] = "DC"` (string, not numeric — already by design)
- `CIRCUIT_NAMES["DC"]` exists (line 353) so the report can render "D.C. Circuit" gracefully
- `PJI_COVERED_CIRCUITS = new Set([1, 3, 5, 6, 7, 8, 9])` (and now `+4 + 13` post this PR) — still omits 12 / "DC"
- The schema check is `circuit BETWEEN 1 AND 13`; "DC" string is never a valid `pattern_jury_instructions.circuit` value, so the table-level data-integrity guarantee remains intact regardless of customer routing
- `coverage.ts` `checkFJIBCoverage` resolves "DC" to a numeric, gets NaN, falls into the unsupported path → yellow info-banner pre-purchase, sibling-circuit fallback at delivery (closest by sentencing-pattern overlap is typically 4th post this PR)

## Unblock criteria

Any ONE of:
1. The DC Circuit publishes its own criminal pattern jury instructions (treat as ~6-month re-search cadence).
2. INAA licenses Bergman's Redbook AND adds a separate `dc_superior_jury_instructions` table + corresponding tier-9 SKU framing for DC-local-court defendants. (Different SKU, different schema.)
3. An open-source DC criminal jury instructions corpus emerges (currently none known).

## Tracking

- `pattern_jury_instructions` `circuit=12` and `circuit="DC"` will both remain absent (the smallint constraint forbids "DC" as a value anyway).
- `federal-jury-instruction-brief.ts` `STATE_TO_CIRCUIT["DC"]="DC"` continues to surface as fallback in coverage probes.
- This file is the durable record of WHY.

Not a backlog cadence item. Revisit when an unblock criterion is met.
