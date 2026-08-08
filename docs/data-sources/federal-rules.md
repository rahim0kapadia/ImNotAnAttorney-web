---
source: Federal Rules (Evidence / Civil Procedure / Criminal Procedure)
provider: Cornell LII
url: https://www.law.cornell.edu/rules/
format: multi (html + curated text)
license: Federal rules public-domain; Cornell LII redistribution permitted with attribution
last_refresh: shipped (verify provenance)
refresh_cadence: annual (rules amendments by Supreme Court)
db_tables:
  - federal_rules
consuming_tiers:
  - Intelligence Brief ($997)
  - X-Ray ($2,497)
  - Blog substrate
---

# Federal Rules of Evidence / Civil Procedure / Criminal Procedure

Per-rule text from Cornell LII for FRE, FRCP, FRCrP, FRAP. Used in IB / X-Ray to surface "your case implicates Rule 404(b) — here's the standard" intelligence and as blog substrate.

## Source

| Aspect | Value |
|---|---|
| Provider | Cornell LII |
| Bulk URL | https://www.law.cornell.edu/rules/ |
| Format | HTML / curated text per rule |
| Refresh | annual (Supreme Court rule amendments) |
| Approx rows | ~1,200 rule sections |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| Cornell LII HTML | `federal_rules` | rule set (FRE/FRCP/FRCrP/FRAP), rule number, body, last-amended date |

## Ingest pipeline

- HTML scrape per rule set + COPY.
- Rule #19 marker required.

## License / fair use

Federal rules are uncopyrightable primary law. Cornell LII redistribution permitted with attribution; cite `https://www.law.cornell.edu/rules/...` per row.

## Anti-patterns / known gotchas

- **Rule numbering changes** when Supreme Court amends — keep `last_amended` date for diff-refresh.
- **Advisory committee notes** are separate from the rule body — handle as nested or separate column.

## Last refresh + next trigger

- Last refresh: shipped (verify exact date).
- Next refresh trigger: Supreme Court rule-amendment cycle (typically Dec 1 effective).
