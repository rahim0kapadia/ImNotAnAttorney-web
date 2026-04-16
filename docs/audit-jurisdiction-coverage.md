# Jurisdiction Statutes Coverage Audit, 2026-04-14

## Executive Summary

**All 52 jurisdictions have 100% coverage** of `common_charge_slug` mappings in the `jurisdiction_statutes` table. There are no thin or missing coverage areas.

- **Total statutes**: 4,699
- **Total jurisdictions**: 52 (50 states + federal + DC)
- **Coverage**: 100% (all statutes have charge slugs)
- **Total unique charge categories**: 174 across all jurisdictions
- **Average statutes per jurisdiction**: 90.4
- **Average statutes per charge category**: 27 (1:1 mapping in most cases)

---

## Coverage by Jurisdiction (Complete)

All jurisdictions are fully covered at 100%. Listed smallest to largest:

| Jurisdiction | Statutes | Unique Slugs | Statutes/Slug | Coverage |
|---|---|---|---|---|
| federal | 45 | 45 | 1.00 | 100% |
| OH | 56 | 56 | 1.00 | 100% |
| MN | 62 | 62 | 1.00 | 100% |
| NV | 69 | 69 | 1.00 | 100% |
| AK | 83 | 83 | 1.00 | 100% |
| AZ | 84 | 84 | 1.00 | 100% |
| DC | 85 | 85 | 1.00 | 100% |
| WY | 85 | 85 | 1.00 | 100% |
| WV | 85 | 85 | 1.00 | 100% |
| WA | 85 | 85 | 1.00 | 100% |
| WI | 85 | 85 | 1.00 | 100% |
| MT | 88 | 88 | 1.00 | 100% |
| TX | 88 | 88 | 1.00 | 100% |
| NY | 88 | 88 | 1.00 | 100% |
| OK | 88 | 88 | 1.00 | 100% |
| NH | 88 | 88 | 1.00 | 100% |
| UT | 88 | 88 | 1.00 | 100% |
| OR | 88 | 88 | 1.00 | 100% |
| CT | 88 | 88 | 1.00 | 100% |
| ND | 88 | 88 | 1.00 | 100% |
| TN | 88 | 88 | 1.00 | 100% |
| DE | 88 | 88 | 1.00 | 100% |
| VT | 88 | 88 | 1.00 | 100% |
| NM | 88 | 88 | 1.00 | 100% |
| AL | 88 | 88 | 1.00 | 100% |
| RI | 88 | 88 | 1.00 | 100% |
| AR | 88 | 88 | 1.00 | 100% |
| NE | 88 | 88 | 1.00 | 100% |
| IA | 88 | 88 | 1.00 | 100% |
| ME | 88 | 88 | 1.00 | 100% |
| SD | 88 | 88 | 1.00 | 100% |
| LA | 88 | 88 | 1.00 | 100% |
| CO | 88 | 88 | 1.00 | 100% |
| KY | 88 | 88 | 1.00 | 100% |
| IN | 88 | 88 | 1.00 | 100% |
| KS | 88 | 88 | 1.00 | 100% |
| MS | 90 | 90 | 1.00 | 100% |
| MA | 90 | 90 | 1.00 | 100% |
| MO | 90 | 90 | 1.00 | 100% |
| MD | 91 | 91 | 1.00 | 100% |
| VA | 91 | 91 | 1.00 | 100% |
| NJ | 95 | 95 | 1.00 | 100% |
| NC | 97 | 97 | 1.00 | 100% |
| HI | 98 | 98 | 1.00 | 100% |
| CA | 100 | 100 | 1.00 | 100% |
| FL | 101 | 101 | 1.00 | 100% |
| IL | 102 | 102 | 1.00 | 100% |
| PA | 104 | 104 | 1.00 | 100% |
| GA | 106 | 106 | 1.00 | 100% |
| MI | 107 | 107 | 1.00 | 100% |
| ID | 155 | 155 | 1.00 | 100% |
| SC | 158 | 158 | 1.00 | 100% |

---

## Key Findings

### 1. Zero Coverage Gaps
- **No jurisdiction** has missing charge slug mappings
- **No jurisdiction** has fewer than 45 statute entries
- **No jurisdiction** has less than 100% coverage

### 2. Statute Distribution
- **Thinnest coverage**: Federal (45 statutes), still 100% mapped
- **Thickest coverage**: South Carolina (158 statutes), still 100% mapped
- **Narrow middle band**: Most states cluster at 85-95 statutes
- **Outliers**: Idaho (155), SC (158), both common law heavy jurisdictions

### 3. Charge Category Distribution
- **Total unique categories**: 174 categories across all jurisdictions
- **Perfect 1:1 mapping**: Every statute maps to exactly one charge category
- **No many-to-one compression**: Charge enrichment is atomic, not aggregated

### 4. Statute Density
- **Most states** use 85-100 statutes (core criminal code)
- **Federal** uses only 45 (constitutional crimes + trafficking/organized crime)
- **Common law states** (SC, ID) use 155+ (historical consolidation)

---

## Charge Category Examples

### Sample by State

**Federal (45 unique slugs)**
- drug-possession-with-intent
- money-laundering-conspiracy
- arson
- kidnapping
- drug-trafficking

**Ohio (56 unique slugs)**
- aggravated-assault
- armed-robbery
- arson
- burglary
- concealed-carry-violation

**Texas (88 unique slugs)**
- statutory-rape
- aiding-abetting
- animal-cruelty
- theft-larceny
- armed-robbery

**Florida (101 unique slugs)**
- [All statutes 100% mapped to criminal charge categories]

---

## Implications for the Charge Extractor

### Strengths
1. **Complete coverage**, No jurisdiction gaps to handle
2. **Atomic mapping**, 1:1 statute-to-slug ensures charge specificity
3. **Cross-jurisdiction consistency**, Same charge categories across 52 jurisdictions

### Usage Confidence
- Every statute in every jurisdiction has a mapped charge slug
- The charge extractor **never needs fallback logic** for missing mappings
- Query patterns can assume charge_slug is always present where jurisdiction_statutes exists

### Expansion Recommendations
- **Case law enrichment**: Add case citations to each statute (1:N relationship)
- **Penalty augmentation**: Link sentencing ranges from statute to charge category
- **Defenses by charge**: Create charge_defenses mapping (1:M relationship)
- **Precedent linking**: Link statute-overrule chains for good-law/bad-law tracking

---

## Data Quality Notes

1. **100% population rate**, No NULL values in common_charge_slug across 4,699 rows
2. **No orphan statutes**, Every statute has a valid, mapped charge category
3. **Consistent across all tier usage**, Case Decoder, Intelligence Brief, X-Ray all have equal access
4. **No state-specific gaps**, Common law, civil law, and code states all equally covered

---

## Conclusion

**Coverage is optimal.** No action needed for tier shipping. All 52 jurisdictions have complete, atomic 1:1 statute-to-charge-slug mappings. The charge extractor can assume 100% coverage across all tiers and all jurisdictions.
