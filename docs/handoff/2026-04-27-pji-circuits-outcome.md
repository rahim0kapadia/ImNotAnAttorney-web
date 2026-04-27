# PJI 4 Circuits — Outcome Handoff (G2 of Data Completeness Master)

**Date:** 2026-04-27
**Branch:** `feat/pji-circuits-2-4-dc-fed`
**Plan:** `docs/plans/2026-04-27-data-completeness-master.md` G2 section

## Outcome

**2 of 4 missing federal circuits shipped. 2 of 4 documented as research-blocked (free public source does not exist).**

| Circuit | Status | Rows | Source |
|---|---|---|---|
| 2 (Second) | BLOCKED | 0 | docs/plans/2026-04-27-followup-pji-2-blocked.md |
| 4 (Fourth) | LIVE | 285 | https://www.scd.uscourts.gov/pji/PatternJuryInstructions.pdf |
| 12 (DC) | BLOCKED | 0 | docs/plans/2026-04-27-followup-pji-12-dc-blocked.md |
| 13 (Federal) | LIVE | 46 | https://s45968.pcdn.co/wp-content/uploads/public_docs/May-2020-FCBA-Model-Patent-Jury-Instructions.pdf |

`pattern_jury_instructions` total: **2,139 rows across 11 active circuits** (was 1,808 across 9).

Anti-hallucination audit: PRISTINE (0 bad URLs, 0 missing SHAs, all HTTPS, 100% roundtrip-verified, 100% page-anchored on new rows).

## Per-circuit research summary

### Circuit 4 — SHIPPED
- Source: `Pattern Jury Instructions for Federal Criminal Cases, District of South Carolina` (Ruschky & Shealy, 2024 Online Edition).
- Why this is the canonical 4th-Circuit reference: 4th Circuit Court of Appeals does NOT publish circuit-level pattern instructions. The SCD project explicitly states it was created "to fill that void by publishing pattern instructions annotated primarily by reference to Fourth Circuit and Supreme Court cases" (preface verbatim, page xv-xvi of the PDF).
- 285 rows ingested.
- instruction_number convention: `<chapter>-USC-<section>` for statute-headed instructions (e.g. `18-USC-2`, `21-USC-841(a)(1)`); `I-<letter>` for preliminary lettered subsections (e.g. `I-A` Admonishing Attorneys, `I-G` Presumption of Innocence).
- All rows have HTTPS source_url with `#page=N` anchor, sha256 of source PDF, sha256 of body, roundtrip_verified=TRUE.

### Circuit 13 — SHIPPED
- Source: `FCBA Model Patent Jury Instructions, May 2020` (Federal Circuit Bar Association).
- Why this is the canonical Federal-Circuit reference: CAFC itself does not publish pattern instructions. FCBA's free PDF is the standard reference for patent cases under Federal Circuit jurisdiction.
- 46 rows ingested.
- instruction_number convention: `A.1`-`A.5` for preliminary instructions; centered numeric IDs (`2.1`, `2.1a`, `3.1a`, `4.3a-1`, `4.3c(i)`, `5.1`, etc.) for body instructions.
- All rows have HTTPS source_url with `#page=N` anchor, sha256, body sha, roundtrip_verified=TRUE.

### Circuit 2 — BLOCKED (no free source)
- Second Circuit does NOT publish circuit-level pattern criminal jury instructions. Confirmed via `ca2.uscourts.gov` 404, multiple law-library research guides (Marquette, Maryland, Jenkins).
- Standard practitioner reference: `Sand's Modern Federal Jury Instructions` (Leonard B. Sand, ten-volume LexisNexis publication). Commercial / paywalled / copyrighted.
- District-level instructions (SDNY, EDNY, etc.) exist but are not 2nd-Circuit-uniform; combining them would mis-represent "2nd Circuit pattern" and would require schema migration to add a `district` column.
- See `docs/plans/2026-04-27-followup-pji-2-blocked.md` for unblock criteria.

### Circuit 12 (DC) — BLOCKED (no free source for federal DC Circuit)
- DC Circuit Court of Appeals (`cadc.uscourts.gov`) does NOT publish criminal pattern jury instructions. Confirmed via 404 + Catholic University Law Library guide + DOJ Guide to Federal Court Resources.
- The "Redbook" (`Criminal Jury Instructions for the District of Columbia`, Bergman, currently 5th ed.) targets the DC SUPERIOR COURT (state-equivalent), not the federal DC Circuit, and is published commercially via LexisNexis.
- See `docs/plans/2026-04-27-followup-pji-12-dc-blocked.md` for unblock criteria.

## What changed

### New files
- `scripts/ingest/pji-ingest-circuits-4-13.mjs` — ingest script for circuits 4 + 13. Two parsers: `parseScdStatute` (4th Cir SCD format), `parseFcbaCentered` (FCBA centered-number format).
- `docs/plans/2026-04-27-followup-pji-2-blocked.md` — research-finding for why 2nd Cir is not fixable now.
- `docs/plans/2026-04-27-followup-pji-12-dc-blocked.md` — research-finding for why DC Circuit is not fixable now.
- `docs/handoff/2026-04-27-pji-circuits-outcome.md` — this file.

### Modified files
- `src/lib/tier9-reports/federal-jury-instruction-brief.ts` — added `4` and `13` to `PJI_COVERED_CIRCUITS`; added `"13": "Federal Circuit"` to `CIRCUIT_NAMES`; comment block updated to point at the two new blocker plans.
- `scripts/ingest/__tests__/pji-ingest.test.mjs` — extended `BASELINES.per_circuit` to include 4 (270-320) and 13 (40-60); raised `BASELINES.total` to (2050, 2250); extended `instruction_number` format regex with two new circuit-specific patterns.
- `src/lib/tier9-reports/__tests__/fjib-coverage.test.ts` — updated `PJI_COVERED_CIRCUITS` shape assertion to `[1, 3, 4, 5, 6, 7, 8, 9, 13]`; added two new positive-membership tests; rewrote "banner trips" tests to use circuit 2 (still unsupported) instead of circuit 4 (now supported).

## Live database state (post-ingest)

```
circuit |  n
--------+-----
   1    | 72
   3    | 285
   4    | 285  ← G2 added
   5    | 251
   6    | 154
   7    | 68
   8    | 150
   9    | 402
   10   | 153
   11   | 273
   13   | 46   ← G2 added
total   | 2,139
```

Anti-hallucination audit: 0 bad URLs across all 11 circuits.

## Verification

- `node scripts/ingest/__tests__/pji-ingest.test.mjs` → 29 / 29 PASS
- `node ./node_modules/vitest/vitest.mjs run src/lib/xray-sections src/lib/tier9-reports` → 180 / 180 PASS across 12 test files
- `node ./node_modules/typescript/bin/tsc --noEmit` → exit 0 (clean)
- Anti-hallucination audit query (per task spec) → all `bad=0` for all 11 active circuits

## Acceptance check (per original task spec)

- [x] `pattern_jury_instructions` has rows in circuit 4 (285) and 13 (46)
- [x] All HTTPS, all source_url present (audit `bad=0` per circuit)
- [x] 100% pass anti-hallucination audit
- [x] 2nd Circuit + DC Circuit blocker plans documented at `docs/plans/2026-04-27-followup-pji-{2,12-dc}-blocked.md`
- [ ] PR merged with CI green — pending push + merge
