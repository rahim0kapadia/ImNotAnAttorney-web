---
source: Pattern Jury Instructions (federal circuits)
provider: Per-circuit court (Free Law Project mirror where available)
url: per-circuit — see file
format: multi (pdf + curated text)
license: Federal court PJI public-domain; some commercial publishers (Sand's, Bergman's) gate 2nd / DC Cir
last_refresh: 2026-04-27 (4th + Federal Cir added PR #182)
refresh_cadence: annual (circuit issues amendments)
db_tables:
  - pattern_jury_instructions
consuming_tiers:
  - Intelligence Brief ($997)
  - X-Ray ($2,497)
  - Federal Jury Instructions Brief (FJIB standalone)
---

# Pattern Jury Instructions (PJI) — federal circuits

Per-circuit pattern jury instructions used at federal trial. INAA renders these in IB / X-Ray / FJIB to surface "your circuit's instruction for [crime] reads X — here's the elements they must prove" intelligence.

## Source

| Aspect | Value |
|---|---|
| Provider | Per-circuit court (FLP mirror where available) |
| Bulk URL | per-circuit; varies — see coverage table |
| Format | PDF (per-circuit publication) + curated text extraction |
| Refresh | annual (circuit publishes amendments) |
| Approx rows | 2,139 across 11 of 13 circuits (post-2026-04-27) |

## Per-circuit coverage status

| Circuit | Status | Source |
|---|---|---|
| 1st | covered | per-circuit court PDF |
| 3rd, 5th, 6th, 7th, 8th, 9th, 10th, 11th | covered | per-circuit court PDF |
| 4th | added 2026-04-27 PR #182 (+285 instructions) | per-circuit court PDF |
| Federal | added 2026-04-27 PR #182 (+46 instructions) | per-circuit court PDF |
| 2nd | **BLOCKED** — paywalled (Sand's *Modern Federal Jury Instructions*) | commercial only |
| DC | **BLOCKED** — paywalled (Bergman's) | commercial only |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| per-circuit PDF (parsed) | `pattern_jury_instructions` | circuit, instruction number, title, body, last-amended date |

## Ingest pipeline

- **Per-circuit parsers:** `scripts/ingest/pji-<circuit>.mjs`.
- **PDF parsing:** pdfjs-dist or pdf-parse (depends on circuit's PDF formatter).

## License / fair use

Federal pattern jury instructions are uncopyrightable as primary law (per *Banks v. Manchester* line of cases + *Georgia v. PRO* extension). 2nd / DC Cir blocked because the only published version is a copyrighted commercial treatise (Sand, Bergman) layered on top of court-issued elements.

## Anti-patterns / known gotchas

- **Don't ingest commercial-publisher copyrighted content** for 2nd / DC Cir — wait for free public-domain alternative.
- **Per-circuit numbering schemes differ** — keep `circuit` + `instruction_number` as composite key.

## Last refresh + next trigger

- Last refresh: 2026-04-27 (4th + Federal added).
- Next refresh trigger: per-circuit annual amendment publish.
