# Handoff: AL/AK/AZ/AR Enrichment Generation

**Date:** 2026-04-07
**Status:** NOT STARTED, research and pattern identification only
**Reason for handoff:** Earlier session attempted to generate enrichment + case law for these jurisdictions but ran into the no-hallucinated-legal-data rule late in the process. Switched to canonical pattern documentation rather than ship a non-canonical generator.

## Request

Generate enrichment data for AL, AK, AZ, AR jurisdictions following the canonical project pattern.

**DO NOT generate case-law JSON files for these jurisdictions.** Per project directive (memory: `reference-enrichment-caselaw-format.md`): "case law explicitly forbidden in those tasks, directive was 'case law comes from CourtListener only'." This applies to all jurisdictions added in the 2026-04 expansion (SD/TN/TX/UT/MO/MT/NE/NV are documented as enrichment-only). AL/AK/AZ/AR follow the same rule.

## Canonical Pattern

Reference: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\generate-charge-enrichment-il-in-ia-ks.mjs`

This is the most recent (Apr 2026) canonical generator. It:
- Defines a `CONTEXT` table per state with `name`, `statePrefix`, `courts.{supreme,appellate}`, `selfDefenseCite`, `necessityCite`, `constArt`, `fourthAm`, `supervision`, and a `note`
- Defines `BUILDERS[slug] = (code, stat) => ({prosecution_strengths, defense_opportunities, common_defenses})` per common charge slug
- Each builder takes the state code and the actual statute number from the taxonomy file, and interpolates them into 4-5 items per array
- Items reference real well-known SCOTUS cases (Birchfield v. North Dakota, Missouri v. McNeely, Terry v. Ohio) by name, those are implicitly verified
- Items reference the actual statute number passed in via `${stat}`, that number is from the verified taxonomy file, so it's safe to cite

## State Context for AL/AK/AZ/AR

Build a CONTEXT entry for each:

```js
const CONTEXT = {
  AL: {
    name: 'Alabama',
    statePrefix: 'Ala.',
    courts: { supreme: 'Alabama Supreme Court', appellate: 'Alabama Court of Criminal Appeals' },
    selfDefenseCite: 'Ala. Code § 13A-3-23',  // Stand Your Ground
    necessityCite: 'Ala. Code § 13A-3-22',     // Choice of evils
    constArt: 'Ala. Const. Art. I § 5',
    fourthAm: 'Ala. Const. Art. I § 5',
    supervision: 'Ala. Code § 15-22-50',       // Probation
    note: 'Alabama uses DUI under § 32-5A-191. 5-year DUI lookback. Stand Your Ground state. Permitless carry as of 2023. Death penalty state.'
  },
  AK: {
    name: 'Alaska',
    statePrefix: 'AS',
    courts: { supreme: 'Alaska Supreme Court', appellate: 'Alaska Court of Appeals' },
    selfDefenseCite: 'AS 11.81.330',           // Justification - use of nondeadly force
    necessityCite: 'AS 11.81.320',             // Justification of necessity
    constArt: 'Alaska Const. Art. I § 14',
    fourthAm: 'Alaska Const. Art. I § 14',
    supervision: 'AS 12.55.080',               // Suspended imposition
    note: 'Alaska uses OUI (operating under the influence) under AS 28.35.030. 15-year DUI lookback (longest in nation). Recreational marijuana legal since 2014. Constitutional carry. Death penalty abolished 1957. State constitution provides ENHANCED privacy protection (Ravin v. State).'
  },
  AZ: {
    name: 'Arizona',
    statePrefix: 'A.R.S.',
    courts: { supreme: 'Arizona Supreme Court', appellate: 'Arizona Court of Appeals' },
    selfDefenseCite: 'A.R.S. § 13-404',
    necessityCite: 'A.R.S. § 13-417',
    constArt: 'Ariz. Const. Art. 2 § 8',
    fourthAm: 'Ariz. Const. Art. 2 § 8',
    supervision: 'A.R.S. § 13-901',            // Probation
    note: 'Arizona uses DUI under A.R.S. § 28-1381. "Impaired to slightest degree" standard, strictest DUI threshold. 84-month (7-year) lookback. Extreme DUI .15+, Super Extreme .20+. Aggravated DUI = Class 4 Felony. Recreational marijuana legal since Prop 207 (2020). Constitutional carry. Death penalty state. Mandatory ignition interlock all DUI convictions.'
  },
  AR: {
    name: 'Arkansas',
    statePrefix: 'Ark. Code Ann.',
    courts: { supreme: 'Arkansas Supreme Court', appellate: 'Arkansas Court of Appeals' },
    selfDefenseCite: 'Ark. Code Ann. § 5-2-606',
    necessityCite: 'Ark. Code Ann. § 5-2-604',
    constArt: 'Ark. Const. Art. 2 § 15',
    fourthAm: 'Ark. Const. Art. 2 § 15',
    supervision: 'Ark. Code Ann. § 16-93-301', // Suspended imposition
    note: 'Arkansas uses DWI (not DUI) under § 5-65-103. 5-year DWI lookback. 4th DWI within 5 years = Class D Felony, 5th = Class B, 6th+ = Class A. Class Y Felony is most serious non-capital offense. Permitless carry as of 2023. Death penalty state. Medical marijuana legal (Amend 98), recreational not.'
  }
};
```

## Process

1. Read all 4 taxonomy files: `data/charge-taxonomy/{AL,AK,AZ,AR}.json`. Each has 83-88 charges.
2. Common charge slugs (shared across jurisdictions): dui-dwi, dui-first-offense, dui-repeat-offense, dui-drugs, reckless-driving, hit-and-run, vehicular-homicide, vehicular-manslaughter, driving-on-suspended, fleeing-eluding, drug-possession (and 4 sub-variants), drug-trafficking, drug-distribution, drug-manufacturing, drug-paraphernalia, drug-possession-with-intent, murder-first-degree, murder-second-degree, voluntary-manslaughter, involuntary-manslaughter, aggravated-assault, simple-assault, battery (AL/AR only), robbery, armed-robbery, kidnapping, arson, attempted-murder, assault-with-deadly-weapon, theft-larceny, grand-theft, petty-theft, shoplifting, burglary, residential-burglary, motor-vehicle-theft, receiving-stolen-property, vandalism, trespassing, criminal-mischief, domestic-violence, domestic-battery, child-endangerment, child-abuse, violation-protective-order, stalking, harassment, elder-abuse (AL/AZ/AR only), weapons-possession, felon-in-possession, concealed-carry-violation, illegal-discharge, identity-theft, embezzlement, forgery, counterfeiting (AL/AR only), bad-checks, insurance-fraud (AL/AR only), credit-card-fraud, money-laundering (AL/AZ/AR only), fraud-general, sexual-assault, rape, indecent-exposure, solicitation-prostitution, child-exploitation, failure-to-register, statutory-rape, disorderly-conduct, resisting-arrest, obstruction-justice, contempt-of-court, public-intoxication (AL/AR only), failure-to-appear, false-report, criminal-threat, perjury, bribery, escape-custody, animal-cruelty, probation-violation, parole-violation, aiding-abetting, attempt, conspiracy.
3. Build BUILDERS[slug] for every slug, using `(code, stat) => {...}` signature with state-specific text
4. Write each enrichment file at `data/charge-taxonomy/enrichment/{CODE}.json`
5. After writing, run `node scripts/scrub-enrichment-citations.mjs,dry-run` to verify nothing gets scrubbed
6. **Important AK gotcha:** Existing `data/charge-taxonomy/enrichment/AK.json` already contains `"Alaska's implied consent law (AS 28.35.031)..."`, this slipped past the scrubber because PINPOINT_PREFIXES at lines 59-114 of `scrub-enrichment-citations.mjs` does NOT include `"as "`. Either: (a) add `"as "` to the prefix list and re-run scrubber, or (b) confirm `AS XX.XX.XXX` references are actually allowed when they reference the charge's own statute number.
7. Run validation: every taxonomy slug has an enrichment entry with 3-5 items in each of the 3 arrays.

## Validation Snippet

```bash
node -e "
const fs = require('fs');
['AL','AK','AZ','AR'].forEach(s => {
  const tax = JSON.parse(fs.readFileSync('data/charge-taxonomy/'+s+'.json','utf8'));
  const enr = JSON.parse(fs.readFileSync('data/charge-taxonomy/enrichment/'+s+'.json','utf8'));
  const taxSlugs = new Set(tax.map(t => t.common_charge_slug));
  const enrSlugs = new Set(enr.map(e => e.common_charge_slug));
  const missing = [...taxSlugs].filter(t => !enrSlugs.has(t));
  const bad = enr.filter(e => e.prosecution_strengths.length < 3 || e.defense_opportunities.length < 3 || e.common_defenses.length < 3);
  console.log(s+': '+enr.length+' entries, missing='+missing.length+', bad='+bad.length);
  if (missing.length) console.log('  missing: '+missing.join(','));
  if (bad.length) console.log('  bad: '+bad.map(x=>x.common_charge_slug).join(','));
});
"
```

## DO NOT

- Generate case-law JSON files for these jurisdictions
- Fabricate case names, holdings, or unverified citations
- Use generic copy-paste phrasing across states (silent dedup will remove items, see `gotcha-enrichment-silent-dedup.md`)
- Skip the validation step
- Reference statute numbers that aren't in the source taxonomy file

## Read Before Starting

- `.claude/rules/no-hallucinated-legal-data.md` (the safety rule)
- `.claude/agent-memory/general-purpose/reference-enrichment-caselaw-format.md`
- `.claude/agent-memory/general-purpose/gotcha-enrichment-silent-dedup.md`
- `.claude/agent-memory/general-purpose/feedback-no-fabricated-legal-data.md`
- `scripts/generate-charge-enrichment-il-in-ia-ks.mjs` (canonical pattern to copy)
- `scripts/scrub-enrichment-citations.mjs` (defensive scrubber that runs after)
