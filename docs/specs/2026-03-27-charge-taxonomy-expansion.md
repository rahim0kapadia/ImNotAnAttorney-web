# Design Spec: Comprehensive US Criminal Charge Taxonomy

**Date:** 2026-03-27
**Status:** Draft
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`

## Problem

The current system has 17 charge slugs covering ~7 of the FBI's 38 NIBRS offense categories. Structural issues:

1. **Lumping:** "Theft/Burglary/Robbery" treats shoplifting ($50 misdemeanor), residential burglary (felony), and armed robbery (violent felony with mandatory minimums) as the same charge. A robbery defendant gets the same expert panel as a shoplifter.
2. **Missing categories:** Homicide, kidnapping, arson, stalking, contempt, disorderly conduct, and dozens of other charges hit "Other", no charge-specific questions, no expert panel, generic report.
3. **No statute-level precision:** Reports reference generic charge categories instead of the defendant's actual statute. At every tier, including Case Decoder ($197), the report should reference the defendant's specific statute with elements and penalties. At Situation Room ($9,997), this is critical.
4. **DUI-centric depth:** DUI has the richest charge-specific questions. Other charges were backfilled with less depth.
5. **Missing seed data:** The `charge_types` and `experts` tables exist in the DB schema but have no seed data in the repo. The system falls back to 14 hardcoded blocks in `getChargeContextFallback()`.
6. **Redundant questions:** The intake form asks questions the statute already answers (e.g., severity classification), wasting the defendant's time and undermining trust.

## Solution

A three-layer charge taxonomy covering all US criminal charges across all 52 jurisdictions (50 states + DC + federal), backed by NCIC Uniform Offense Codes as the national standard, with a crisis-optimized intake UX designed for panicked defendants at 2AM.

Statute data (number, elements, penalties) is always included in the charge context block sent to Claude, at every tier, not just upper tiers.

## Expert Basis

| Domain | Expert | Framework Applied |
|---|---|---|
| Crisis Interface UX | Vitaly Friedman (Smashing Magazine, Smart Interface Design Patterns) | 10-30s micro-steps, progressive disclosure, high-priority actions first, built-in safeguards, better defaults |
| Defendant Decision Psychology | Dr. Vincent Covello (Center for Risk Communication) | Mental Noise Model, 80% cognitive reduction under stress, Rule of 3 (max 3 key messages per screen), 4-grade-level-down labels, first/last items stick, negative dominance |
| Legal Form UX | Margaret Hagan (Stanford Legal Design Lab) | Amplify legal capability, glanceable structure, off-ramps near hard questions, users scan/work in bursts/disengage when tired, visual hierarchy over text |
| Charge Taxonomy | Paul Robinson (UPenn Law, *Mapping American Criminal Law*) + NCIC/SEARCH Group | 52 independent US criminal codes with "almost endless diversity," NCIC codes as Rosetta Stone, SEARCH Group's charge table crosswalk methodology |

## Data Model

### Table: `charge_categories`

Top-level groupings. Plain English per Covello (4th grade reading level). Max 12 categories.

```sql
CREATE TABLE charge_categories (
  slug text PRIMARY KEY,
  label text NOT NULL,
  description text,
  icon_name text,                 , Lucide icon identifier for card UI
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

Seed values (12 categories, frequency-sorted per Covello "first and last stick"):

| slug | label | sort_order |
|---|---|---|
| `dui-driving` | DUI & Driving Offenses | 1 |
| `drug-offenses` | Drug Offenses | 2 |
| `violent-crimes` | Violent Crimes | 3 |
| `property-crimes` | Property Crimes | 4 |
| `domestic-family` | Domestic & Family Offenses | 5 |
| `weapons` | Weapons Charges | 6 |
| `fraud-financial` | Fraud & Financial Crimes | 7 |
| `sex-offenses` | Sex Offenses | 8 |
| `public-order` | Public Order & Conduct | 9 |
| `probation-parole` | Probation & Parole Violations | 10 |
| `federal-specific` | Federal Charges | 11 |
| `other` | Other | 12 |

### Table: `common_charges`

The NCIC-backed charge names. ~200 rows. This is what the defendant selects in the intake form.

```sql
CREATE TABLE common_charges (
  slug text PRIMARY KEY,
  label text NOT NULL,            , plain-language name defendant sees
  category_slug text NOT NULL REFERENCES charge_categories(slug),
  ncic_code text,                 , NCIC 4-digit code (internal only, never displayed)
  description text,               , 1-sentence plain English description
  severity_range text,            , "Misdemeanor to Felony" or "Felony"
  is_federal boolean DEFAULT false,
  is_state boolean DEFAULT true,
  legacy_slugs text[],            , maps old ALLOWED_CHARGE_TYPES values for backward compat
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

Legacy slug mapping (backward compatibility with existing intake data):

| Old slug | New common_charge slug |
|---|---|
| `dui` | `dui-dwi` |
| `dui-first` | `dui-first-offense` |
| `dui-repeat` | `dui-repeat-offense` |
| `assault` | `simple-assault` |
| `domestic-violence` | `domestic-violence` |
| `theft` | `theft-larceny` |
| `robbery` | `robbery` |
| `burglary` | `burglary` |
| `fraud` | `fraud-general` |
| `white-collar` | `fraud-general` |
| `drug-possession` | `drug-possession` |
| `drug-trafficking` | `drug-trafficking` |
| `drug` | `drug-possession` |
| `sex-offense` | `sex-offense-contact` |
| `sex-offense-contact` | `sex-offense-contact` |
| `sex-offense-digital` | `sex-offense-digital` |
| `weapons` | `weapons-possession` |
| `federal` | `federal-other` |
| `probation-violation` | `probation-violation` |
| `self-defense` | `self-defense` |
| `other` | `other` |
| `other-felony` | `other` |
| `other-misdemeanor` | `other` |

### Table: `jurisdiction_statutes`

State-specific statute mapping. One row per common_charge x jurisdiction. ~8,000-10,000 rows total.

```sql
CREATE TABLE jurisdiction_statutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  common_charge_slug text NOT NULL REFERENCES common_charges(slug),
  jurisdiction text NOT NULL,     , "FL", "CA", "TX", "DC", "federal"
  statute_number text,            , "784.045", "PC 245(a)(1)", "18 USC 1111"
  statute_title text,             , "Aggravated Battery"
  offense_class text,             , "2nd Degree Felony", "Class A Misdemeanor"
  penalty_min text,               , "0 years" or null
  penalty_max text,               , "15 years"
  fine_max text,                  , "$10,000"
  elements text[],                , prosecution must prove each element
  mandatory_minimum text,         , null or specific (e.g., "3 years")
  enhancements text[],            , e.g., ["10-20-Life if weapon used", "hate crime enhancement"]
  notes text,                     , jurisdiction-specific nuances, wobbler status, etc.
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(common_charge_slug, jurisdiction)
);
```

### Table: `charge_questions`

Replaces the hardcoded `chargeSpecificQuestions` in `src/app/intake/page.tsx`. Questions attach at the `common_charges` level (fact-pattern questions are jurisdiction-agnostic). Only asks what the statute doesn't already tell us.

```sql
CREATE TABLE charge_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  common_charge_slug text NOT NULL REFERENCES common_charges(slug),
  question_id text NOT NULL,      , "selfDefense", "initiator", "bacLevel"
  label text NOT NULL,            , plain-language question text
  options text[] NOT NULL,        , always includes "Don't know" as last option
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(common_charge_slug, question_id)
);
```

### Existing table changes

**`experts`**, Add `common_charge_slugs text[]` column alongside existing `charge_types text[]` (backward compat). Expert panels link at the `common_charges` level.

**`cases`**, Add `common_charge_slug text` and `jurisdiction_statute_id uuid` columns alongside existing `charge_type text`. Existing rows keep their `charge_type` value unchanged.

**`charge_types`**, No changes. Keep as-is for backward compatibility. New system reads from new tables; old tables remain as fallback.

## Intake UX Flow

One decision per screen. Card-based selectors (not dropdowns). Per Friedman/Hagan/Covello.

### Screen 1: Jurisdiction (existing, keep as-is)

```
Federal court  |  State or local court  |  I don't know
```

If state → state dropdown (pre-sorted by IP geolocation if available, otherwise alphabetical). "I don't know" shows all charges without statute-specific data.

Default: "State or local court" (pre-selected, ~95% of criminal cases are state per BJS data). Per Friedman: better defaults.

### Screen 2: Category (NEW, replaces current charge type dropdown)

Visual card grid. Max 8 visible per row (2x4 mobile, 4x3 desktop). Sorted by arrest frequency per FBI UCR data. Per Covello: first and last items stick, so most common categories go first.

Each card: icon + plain-language label + one-line description. Toggle behavior (like existing ChargeTypeSelector). Per Hagan: visual hierarchy over text, glanceable structure.

"Other" always last, Hagan's "off-ramp" for anyone who can't find their category.

If jurisdiction is "Federal" → hide state-only categories, show federal-relevant subset.

### Screen 3: Specific Charge (NEW, filtered by category + jurisdiction)

Filtered list of common charges for the selected category. When a state is selected, each entry shows the state-specific statute number for instant credibility. Max ~15 options per category.

Example for Florida + Violent Crimes:
```
Aggravated Assault / Battery, FL 784.045 (2nd Degree Felony)
Simple Assault / Battery, FL 784.011 (2nd Degree Misdemeanor)
Manslaughter, FL 782.07 (2nd Degree Felony)
Murder (1st Degree), FL 782.04 (Capital/Life Felony)
Murder (2nd Degree), FL 782.04 (1st Degree Felony)
Robbery, FL 812.13 (2nd Degree Felony)
Armed Robbery, FL 812.13(2) (1st Degree Felony)
Kidnapping, FL 787.01 (1st Degree Felony)
Aggravated Stalking, FL 784.048 (3rd Degree Felony)
[My charge isn't listed]
```

Defendant sees their exact statute and classification. Per Hagan: amplifies legal capability.

"My charge isn't listed" → opens free-text field. `resolveChargeSlug()` (enhanced) attempts fuzzy match to a common charge. If unmappable → proceeds with category-level context only.

### Screen 4: Charge-Specific Questions (existing pattern, now DB-driven)

Loaded from `charge_questions` table for the selected `common_charge_slug`. Only shows questions the statute doesn't already answer:
- Statute tells us classification, elements, penalty range → DON'T ask
- Fact-pattern questions remain: "Who initiated contact?", "Was this self-defense?", "BAC level?"
- Never asks questions the user already answered in previous screens

Per Friedman: each question is its own micro-step (10-30 seconds). "Don't know" always available per Hagan's off-ramp principle.

### "I don't know" path (every screen)

- Screen 1: "I don't know" jurisdiction → show all charges without statute data
- Screen 2: "Other" category → free-text description field
- Screen 3: "My charge isn't listed" → free-text field with fuzzy matching
- Screen 4: Every question has "Don't know" option

No dead ends. Per Hagan: the form should never make someone feel stuck or dumb.

## Data Generation Strategy

All 50 states + DC + federal. Complete coverage. No phasing by state.

### Pipeline

1. **Define master prompt**, Takes a jurisdiction code (e.g., "FL") and the full list of ~200 common charge slugs. Returns structured JSON with statute_number, statute_title, offense_class, penalties, elements, enhancements, and notes for each charge that exists in that jurisdiction. Charges that don't exist in the jurisdiction are omitted.

2. **Submit 52 batch requests**, One per jurisdiction (50 states + DC + federal). Use the Anthropic Batch API infrastructure already built in this repo. Free with existing API access.

3. **Generate charge questions**, Separate batch: for each of the ~200 common charges, generate 3-4 fact-pattern questions that the statute doesn't already answer. Reuse existing expert-grounded questions from the current `chargeSpecificQuestions` object where they map to the new common charge slugs.

4. **Validate output**, Automated: check all required fields populated, statute numbers match expected format patterns per state (e.g., FL uses "XXX.XX", CA uses "PC XXX", TX uses "PC XX.XX"). Manual: spot-check 5 high-volume states (CA, TX, FL, NY, IL) against official state code websites.

5. **Insert via migration**, Write a seed migration that inserts all data. Version-controlled and reproducible.

### Estimated data volume

| Table | Row count |
|---|---|
| `charge_categories` | 12 |
| `common_charges` | ~200 |
| `jurisdiction_statutes` | ~8,000-10,000 |
| `charge_questions` | ~600-800 |

## Prompt Integration

### Current flow

```
intake.charge_type
  → resolveChargeSlug()
  → getChargeContext(slug, jurisdiction, chargeSpecificData, ...)
  → expert panel string
  → ${v.charge_specific_data}
  → all 9 prompt templates in prompts.ts
```

### New flow

```
intake.common_charge_slug + intake.jurisdiction
  → resolveChargeSlug() (enhanced, maps legacy slugs via common_charges.legacy_slugs)
  → lookupJurisdictionStatute(common_charge_slug, jurisdiction)
  → buildEnrichedChargeContext(statute, experts, chargeSpecificData)
  → ${v.charge_specific_data}
  → all 9 prompt templates (no changes needed to prompts.ts)
```

### Enriched charge context block (always includes statute at every tier)

```
CHARGE CONTEXT:
- Charge: Aggravated Battery (FL 784.045)
- Classification: 2nd Degree Felony
- Elements: (1) intentional touching or striking, (2) great bodily harm, permanent disability, or permanent disfigurement, OR use of a deadly weapon
- Penalty Range: Up to 15 years imprisonment, $10,000 fine
- Mandatory Minimum: 3 years (if weapon used per 10-20-Life)
- Enhancements: 10-20-Life if firearm used; hate crime enhancement if bias-motivated

EXPERT PANEL:
- Andrew F. Branca (Law of Self Defense), 5 elements of self-defense analysis
- Massad Ayoob (Lethal Force Institute), force continuum, disparity of force
- Don West (criminal trial attorney), cross-examination of use-of-force witnesses

FOCUS AREAS: self-defense viability, weapon enhancement exposure, victim injury documentation, prior history impact on sentencing

INTAKE ANSWERS:
- Self-defense claimed: Yes, defending myself
- Who initiated: The other person attacked me first
- Could have left: No, I was cornered
```

### Fallback chain

1. Query `jurisdiction_statutes` + `common_charges` + `experts` (new tables)
2. If no jurisdiction_statute found → use `common_charges` level context (charge name + expert panel + focus areas, no statute specifics)
3. If no common_charge found → try legacy slug lookup via `common_charges.legacy_slugs`
4. If all else fails → `getChargeContextFallback()` (existing 14 hardcoded blocks, kept as safety net)

## Migration Path

### Phase 1: New tables + data (no UI changes)
- Create new tables via Supabase migration
- Generate and insert all taxonomy data via Batch API + seed migration
- Add `common_charge_slug` and `jurisdiction_statute_id` columns to `cases` table
- Update `getChargeContext()` in generate-report edge function to query new tables first, fall back to old
- Verify existing reports still generate correctly with enriched context

### Phase 2: Intake form update
- Replace hardcoded charge type arrays in `src/app/intake/page.tsx` with DB-driven selectors
- 3-screen progressive narrowing: category → common charge (with statute) → charge questions
- Replace `chargeSpecificQuestions` Record with `charge_questions` table queries
- Keep `ALLOWED_CHARGE_TYPES` array and `isValidChargeType()` for backward compat at API validation level
- Update `/api/intake` route to accept new `common_charge_slug` field alongside legacy `chargeType`

### Phase 3: Homepage + sales pages
- Update `ChargeTypeSelector.tsx` to use `charge_categories` (expand from 8 to 12)
- Update `HomepageHero.tsx` to handle new category-based selection
- Update playbook catalog grid to show all charge categories
- Schema `knowsAbout` updated to reference all categories

### Phase 4: Playbook expansion (future, not in scope)
- New playbook sales pages for uncovered categories
- Playbook configs expanded or moved to DB
- Pricing decisions for new playbooks

## Files Modified

### New files
- `supabase/migrations/028-charge-taxonomy.sql`, new tables DDL
- `supabase/migrations/029-charge-taxonomy-seed.sql`, seed data (generated via Batch API)
- `scripts/generate-charge-taxonomy.ts`, Batch API prompt + submission + validation script
- `src/lib/charge-taxonomy.ts`, query functions for new tables

### Modified files (Phase 1)
- `supabase/functions/generate-report/index.ts`, `getChargeContext()` queries new tables, `resolveChargeSlug()` handles legacy mapping, new `buildEnrichedChargeContext()`
- `src/lib/charge-types.ts`, add legacy slug resolver, keep `ALLOWED_CHARGE_TYPES`

### Modified files (Phase 2)
- `src/app/intake/page.tsx`, charge selection UI rewrite (3-screen progressive narrowing, DB-driven questions)
- `src/app/api/intake/route.ts`, accept `common_charge_slug` field

### Modified files (Phase 3)
- `src/components/ChargeTypeSelector.tsx`, expand to use `charge_categories`
- `src/components/HomepageHero.tsx`, handle category-based selection
- `src/app/page.tsx`, playbook catalog grid update, schema update

### Untouched files
- `src/lib/intelligence-brief/prompts.ts`, no changes, `${v.charge_specific_data}` handles any format
- `src/lib/tiers.ts`, pricing unchanged
- `src/lib/playbook-configs.ts`, unchanged until Phase 4
- All email/drip/cron files, unchanged

## Constraints & Risks

1. **Data accuracy:** Claude-generated statute data must be validated. Wrong statute data in a report is worse than no statute data. Mitigation: automated format validation, spot-check 5 states against official code, `[VERIFY]` flag on uncertain entries.

2. **Statute staleness:** State legislatures amend criminal codes yearly. Mitigation: `updated_at` timestamps, quarterly refresh pipeline via Batch API, notes field for "as of [date]."

3. **Backward compatibility:** Existing cases with old `charge_type` values must continue generating valid reports. Mitigation: `legacy_slugs` mapping, 4-level fallback chain, existing `getChargeContextFallback()` kept.

4. **Intake form steps:** 3-screen progressive narrowing adds steps vs. current single dropdown. Mitigation: per Friedman, each step is 10-30 seconds and reduces cognitive load vs. 200 options on one screen. Progress indicator visible.

5. **Missing charges per state:** Not every common charge exists in every state. Mitigation: `jurisdiction_statutes` allows gaps, missing charges don't appear in Screen 3. "My charge isn't listed" off-ramp catches edge cases.

6. **Expert panel coverage:** Currently 14 charge types have expert panels. Expanding to ~200 means many won't have dedicated experts initially. Mitigation: multiple common charges share expert panels (all assault variants share Branca/Ayoob/West). Generate new expert assignments via Batch API for uncovered charges.
