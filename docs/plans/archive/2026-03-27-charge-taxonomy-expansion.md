# Comprehensive US Criminal Charge Taxonomy, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-layer charge taxonomy (categories → common charges → jurisdiction-specific statutes) covering all 52 US jurisdictions, with a crisis-optimized intake UX and enriched prompt context at every tier.

**Architecture:** Four new database tables (`charge_categories`, `common_charges`, `jurisdiction_statutes`, `charge_questions`) backed by NCIC codes as the national standard. Data generated via Anthropic Batch API for all 50 states + DC + federal. Intake form rewritten as 3-screen progressive narrower. Charge context block enriched with statute number, elements, and penalties at every tier.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL), Anthropic Batch API, TypeScript, Tailwind CSS

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\specs\2026-03-27-charge-taxonomy-expansion.md`

## Context

- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Current system has 17 charge slugs covering ~7 of 38 NIBRS categories. Theft/Burglary/Robbery lumped together. No statute-level precision. Missing categories hit "Other." Intake asks redundant questions. Missing DB seed data forces hardcoded fallback.
- **Key files to read first:**
  - `src/lib/charge-types.ts`, current ALLOWED_CHARGE_TYPES
  - `src/app/intake/page.tsx`, current intake form with hardcoded charge questions
  - `supabase/functions/generate-report/index.ts`, `resolveChargeSlug()`, `getChargeContext()`, `getChargeContextFallback()` (lines 1655-1942)
  - `supabase/migrations/00001_initial_schema.sql`, existing `charge_types` and `experts` table DDL
  - `src/components/ChargeTypeSelector.tsx`, current homepage charge selector (8 types)
- **Tech stack:** Next.js 15 App Router, Supabase PostgreSQL, Anthropic Batch API, Tailwind CSS, TypeScript
- **Key decisions:**
  - Three-layer hierarchy (categories → common charges → jurisdiction statutes) per NCIC/SEARCH methodology
  - All 52 jurisdictions at once, no phasing by state
  - Statute data always included in charge context block at every tier (not just upper tiers)
  - Card-based visual selectors per Friedman/Hagan/Covello, not dropdowns
  - "Don't know" / "My charge isn't listed" off-ramps at every screen
  - Backward compatibility via legacy_slugs mapping + 4-level fallback chain
  - Expert panels link at common_charges level (jurisdiction-agnostic)
- **Setup/prerequisites:** `.env.local` with `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Batch API infrastructure already built in repo.

## Approach Decision

**Chosen:** Three-Layer Hierarchy (Approach B from brainstorming)
**Why:** Clean progressive narrowing UX (never >15 options per screen), statute-level precision for reports, expert/question reuse across states, incremental data loading. Backed by NCIC as national standard and validated by 4 domain experts (Friedman, Covello, Hagan, Robinson).

**Rejected alternatives:**
- **Flat Statute Import (A)**, rejected because no structure for progressive narrowing, overwhelming UX (thousands of statutes per state), no natural grouping for expert panels
- **Search-First with Fallback (C)**, rejected because search UX is hard for panicked 2AM users (typos, legal term confusion), and the fallback path is Approach B anyway

---

## Phase 1: Database + Data Generation (no UI changes)

### Task 1: Create charge taxonomy tables migration

**Files:**
- Create: `supabase/migrations/028-charge-taxonomy.sql`

- [ ] **Step 1: Write the migration DDL**

```sql
, 028-charge-taxonomy.sql
, Three-layer charge taxonomy: categories → common charges → jurisdiction statutes
, Plus charge-specific intake questions (DB-driven, replaces hardcoded)

, Layer 1: Top-level charge categories (12 rows)
CREATE TABLE IF NOT EXISTS charge_categories (
  slug text PRIMARY KEY,
  label text NOT NULL,
  description text,
  icon_name text,
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

, Layer 2: Common charge names (~200 rows, NCIC-backed)
CREATE TABLE IF NOT EXISTS common_charges (
  slug text PRIMARY KEY,
  label text NOT NULL,
  category_slug text NOT NULL REFERENCES charge_categories(slug),
  ncic_code text,
  description text,
  severity_range text,
  is_federal boolean DEFAULT false,
  is_state boolean DEFAULT true,
  legacy_slugs text[],
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

, Layer 3: Jurisdiction-specific statutes (~8,000-10,000 rows)
CREATE TABLE IF NOT EXISTS jurisdiction_statutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  common_charge_slug text NOT NULL REFERENCES common_charges(slug),
  jurisdiction text NOT NULL,
  statute_number text,
  statute_title text,
  offense_class text,
  penalty_min text,
  penalty_max text,
  fine_max text,
  elements text[],
  mandatory_minimum text,
  enhancements text[],
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(common_charge_slug, jurisdiction)
);

, Charge-specific intake questions (~600-800 rows)
CREATE TABLE IF NOT EXISTS charge_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  common_charge_slug text NOT NULL REFERENCES common_charges(slug),
  question_id text NOT NULL,
  label text NOT NULL,
  options text[] NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(common_charge_slug, question_id)
);

, Add columns to existing tables
ALTER TABLE experts ADD COLUMN IF NOT EXISTS common_charge_slugs text[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS common_charge_slug text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS jurisdiction_statute_id uuid;

, Indexes
CREATE INDEX IF NOT EXISTS idx_common_charges_category ON common_charges(category_slug);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_statutes_charge ON jurisdiction_statutes(common_charge_slug);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_statutes_jurisdiction ON jurisdiction_statutes(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_charge_questions_charge ON charge_questions(common_charge_slug);
CREATE INDEX IF NOT EXISTS idx_experts_common_charges ON experts USING GIN (common_charge_slugs);

, Updated_at triggers
CREATE TRIGGER set_updated_at_charge_categories BEFORE UPDATE ON charge_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_common_charges BEFORE UPDATE ON common_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_jurisdiction_statutes BEFORE UPDATE ON jurisdiction_statutes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

, Seed charge_categories (12 rows, frequency-sorted)
INSERT INTO charge_categories (slug, label, description, icon_name, sort_order) VALUES
  ('dui-driving', 'DUI & Driving Offenses', 'Driving under the influence, reckless driving, hit and run, vehicular crimes', 'car', 1),
  ('drug-offenses', 'Drug Offenses', 'Possession, trafficking, distribution, paraphernalia, manufacturing', 'pill', 2),
  ('violent-crimes', 'Violent Crimes', 'Assault, battery, murder, manslaughter, robbery, kidnapping', 'shield-alert', 3),
  ('property-crimes', 'Property Crimes', 'Theft, burglary, shoplifting, arson, vandalism, trespassing', 'home', 4),
  ('domestic-family', 'Domestic & Family Offenses', 'Domestic violence, child endangerment, violation of protective orders', 'users', 5),
  ('weapons', 'Weapons Charges', 'Illegal possession, concealed carry violations, felon in possession', 'crosshair', 6),
  ('fraud-financial', 'Fraud & Financial Crimes', 'Wire fraud, identity theft, embezzlement, forgery, bad checks', 'credit-card', 7),
  ('sex-offenses', 'Sex Offenses', 'Sexual assault, internet crimes, indecent exposure, solicitation', 'shield', 8),
  ('public-order', 'Public Order & Conduct', 'Disorderly conduct, resisting arrest, contempt of court, trespassing', 'megaphone', 9),
  ('probation-parole', 'Probation & Parole Violations', 'Technical violations, new charges while supervised, revocation hearings', 'lock', 10),
  ('federal-specific', 'Federal Charges', 'RICO, conspiracy, immigration offenses, tax evasion, federal firearms', 'landmark', 11),
  ('other', 'Other', 'Charges not listed in other categories', 'help-circle', 12)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply migration via Supabase Management API**

Read `C:\Users\email\.claude\projects\C, Users-email-projects-ImNotAnAttorney-web\memory\reference-supabase-management-api.md` for the migration application method. Run the migration against the production Supabase database.

- [ ] **Step 3: Verify tables created**

Query Supabase to confirm all 4 new tables exist and `charge_categories` has 12 rows:
```sql
SELECT count(*) FROM charge_categories;
, Expected: 12
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/028-charge-taxonomy.sql
git commit -m "feat(db): add charge taxonomy tables, categories, common charges, jurisdiction statutes, charge questions"
```

---

### Task 2: Build data generation script

**Files:**
- Create: `scripts/generate-charge-taxonomy.ts`

This script generates the master prompt, submits batch requests to the Anthropic API for all 52 jurisdictions, and writes the output to JSON files for validation.

- [ ] **Step 1: Read existing Batch API patterns**

Read these files to understand the Batch API infrastructure:
- `src/lib/batch-api.ts`, Batch API utility module (types, poll/fetch helpers)
- `supabase/functions/submit-cd-batch/index.ts`, example batch submission

- [ ] **Step 2: Write the generation script**

Create `scripts/generate-charge-taxonomy.ts`. The script must:

1. Define the full list of ~200 common charge slugs with their categories, NCIC codes, labels, descriptions, severity ranges, and legacy slug mappings. This is the master reference list.
2. For each of the 52 jurisdictions (50 states + DC + federal), build a prompt asking Claude to return structured JSON mapping each common charge to that jurisdiction's specific statute (number, title, offense class, penalties, elements, enhancements, notes). Charges that don't exist in the jurisdiction should be omitted.
3. Submit all 52 prompts as individual Anthropic API requests (or batch if the Batch API supports it from a script context). Save each response as `data/charge-taxonomy/{jurisdiction}.json`.
4. Generate charge questions: for each common charge, generate 3-4 fact-pattern questions. Reuse existing questions from the current `chargeSpecificQuestions` object in `src/app/intake/page.tsx` where they map to the new slugs.
5. Include a validation step that checks: all required fields populated, statute number format matches jurisdiction patterns, no duplicate entries.

The common charges list should be structured as a TypeScript const array. Include all charges identified in the NIBRS gap analysis from the spec:

Categories and example charges to include (not exhaustive, the script defines the full list):
- **DUI & Driving:** DUI/DWI, DUI first offense, DUI repeat, reckless driving, hit and run, vehicular homicide, driving on suspended, fleeing/eluding
- **Drug Offenses:** drug possession, drug trafficking, drug manufacturing, drug paraphernalia, prescription fraud
- **Violent Crimes:** murder 1st degree, murder 2nd degree, voluntary manslaughter, involuntary manslaughter, aggravated assault, simple assault, battery, robbery, armed robbery, kidnapping, arson
- **Property Crimes:** theft/larceny, grand theft, petty theft, shoplifting, burglary, motor vehicle theft, receiving stolen property, vandalism/criminal mischief
- **Domestic & Family:** domestic violence, child endangerment, child abuse, violation of protective order, stalking, harassment
- **Weapons:** weapons possession (felon), concealed carry violation, illegal discharge, weapons trafficking
- **Fraud & Financial:** wire fraud, identity theft, embezzlement, forgery, counterfeiting, bad checks, tax fraud, insurance fraud, credit card fraud
- **Sex Offenses:** sexual assault (contact), sexual assault (digital/internet), indecent exposure, solicitation/prostitution, child exploitation, failure to register
- **Public Order:** disorderly conduct, resisting arrest, obstruction of justice, contempt of court, trespassing, public intoxication, loitering
- **Probation & Parole:** probation violation (technical), probation violation (substantive), supervised release violation, parole violation
- **Federal Specific:** conspiracy, RICO, money laundering, immigration offense, tax evasion, federal firearms, federal drug trafficking

- [ ] **Step 3: Run the script in dry-run mode**

Test with a single jurisdiction (FL) first:
```bash
npx tsx scripts/generate-charge-taxonomy.ts,jurisdiction FL,dry-run
```

Verify the output JSON has the expected structure.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-charge-taxonomy.ts
git commit -m "feat: add charge taxonomy data generation script"
```

---

### Task 3: Generate taxonomy data for all 52 jurisdictions

**Files:**
- Create: `data/charge-taxonomy/*.json` (52 files, one per jurisdiction)

- [ ] **Step 1: Run the generation script for all jurisdictions**

```bash
npx tsx scripts/generate-charge-taxonomy.ts,all
```

This submits 52 API requests. Each response is saved to `data/charge-taxonomy/{jurisdiction}.json`. Monitor for rate limits and errors.

- [ ] **Step 2: Run validation**

```bash
npx tsx scripts/generate-charge-taxonomy.ts,validate
```

Check:
- All 52 jurisdiction files exist
- Each has valid JSON structure
- All required fields populated (statute_number, statute_title, offense_class, penalty_max, elements)
- No duplicate common_charge_slug entries within a jurisdiction
- Statute number formats match expected patterns per state

- [ ] **Step 3: Spot-check 5 high-volume states**

Manually verify statute data for CA, TX, FL, NY, IL against official state code websites:
- Pick 3 charges per state (one violent, one drug, one property)
- Verify statute number, offense class, and penalty range are correct
- Fix any errors in the JSON files

- [ ] **Step 4: Commit data files**

```bash
git add data/charge-taxonomy/
git commit -m "data: generate charge taxonomy data for all 52 US jurisdictions"
```

---

### Task 4: Build seed migration from generated data

**Files:**
- Create: `supabase/migrations/029-charge-taxonomy-seed.sql`
- Create: `scripts/build-seed-migration.ts` (converts JSON → SQL)

- [ ] **Step 1: Write the seed builder script**

Create `scripts/build-seed-migration.ts` that reads all `data/charge-taxonomy/*.json` files plus the common charges list from the generation script, and produces a single SQL migration file with:
1. `INSERT INTO common_charges ...` (~200 rows)
2. `INSERT INTO jurisdiction_statutes ...` (~8,000-10,000 rows)
3. `INSERT INTO charge_questions ...` (~600-800 rows)
4. `UPDATE experts SET common_charge_slugs = ...` (map existing expert panels to new common charge slugs)

All INSERTs should use `ON CONFLICT DO NOTHING` for idempotency.

- [ ] **Step 2: Run the seed builder**

```bash
npx tsx scripts/build-seed-migration.ts > supabase/migrations/029-charge-taxonomy-seed.sql
```

Verify the output SQL file is well-formed.

- [ ] **Step 3: Apply seed migration via Supabase Management API**

Apply `029-charge-taxonomy-seed.sql` to the production database.

- [ ] **Step 4: Verify data in database**

```sql
SELECT count(*) FROM common_charges;          , ~200
SELECT count(*) FROM jurisdiction_statutes;    , ~8,000-10,000
SELECT count(*) FROM charge_questions;         , ~600-800
SELECT count(*) FROM charge_categories;        , 12
SELECT jurisdiction, count(*) FROM jurisdiction_statutes GROUP BY jurisdiction ORDER BY count DESC LIMIT 5;
, Should see top states with ~150-200 statutes each
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-seed-migration.ts supabase/migrations/029-charge-taxonomy-seed.sql
git commit -m "feat(db): seed charge taxonomy, ~200 common charges, ~10K jurisdiction statutes, ~700 questions"
```

---

### Task 5: Create charge taxonomy query library

**Files:**
- Create: `src/lib/charge-taxonomy.ts`

- [ ] **Step 1: Read the existing Supabase query patterns**

Read `supabase/functions/generate-report/index.ts` lines 1703-1760 to see how `getChargeContext()` queries the DB. Note: it uses raw `fetch()` against the Supabase REST API, not the JS client.

- [ ] **Step 2: Write the query library**

Create `src/lib/charge-taxonomy.ts` with these exported functions:

```typescript
// Fetch all active charge categories (sorted by sort_order)
export async function getChargeCategories(supabaseUrl: string, supabaseKey: string): Promise<ChargeCategory[]>

// Fetch common charges for a category, optionally filtered by jurisdiction
// When jurisdiction is provided, only returns charges that have a jurisdiction_statute for that state
export async function getCommonCharges(
  categorySlug: string,
  jurisdiction: string | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<CommonCharge[]>

// Fetch the jurisdiction-specific statute for a common charge + state
export async function getJurisdictionStatute(
  commonChargeSlug: string,
  jurisdiction: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<JurisdictionStatute | null>

// Fetch charge-specific questions for a common charge
export async function getChargeQuestions(
  commonChargeSlug: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ChargeQuestion[]>

// Resolve a legacy charge slug to a common_charge slug
export async function resolveLegacySlug(
  legacySlug: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null>

// Build the enriched charge context block for prompt injection
export function buildEnrichedChargeContext(
  statute: JurisdictionStatute | null,
  commonCharge: CommonCharge,
  experts: Expert[],
  chargeSpecificData: Record<string, string>
): string
```

Define TypeScript interfaces for each table's row type at the top of the file.

The `buildEnrichedChargeContext()` function formats the enriched block per the spec:
```
CHARGE CONTEXT:
- Charge: {label} ({jurisdiction} {statute_number})
- Classification: {offense_class}
- Elements: {elements joined}
- Penalty Range: {penalty_min} to {penalty_max}, fine up to {fine_max}
- Mandatory Minimum: {mandatory_minimum or "None"}
- Enhancements: {enhancements joined}

EXPERT PANEL:
{expert entries}

FOCUS AREAS: {focus areas}

INTAKE ANSWERS:
{charge specific answers}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/charge-taxonomy.ts
git commit -m "feat: add charge taxonomy query library with enriched context builder"
```

---

### Task 6: Integrate enriched charge context into report generation

**Files:**
- Modify: `supabase/functions/generate-report/index.ts` (lines 1655-1942, `resolveChargeSlug()`, `getChargeContext()`, `getChargeContextFallback()`)
- Modify: `src/lib/charge-types.ts`

- [ ] **Step 1: Read the current charge context functions**

Read `supabase/functions/generate-report/index.ts` lines 1655-1942 to understand the full `resolveChargeSlug()` → `getChargeContext()` → `getChargeContextFallback()` chain.

- [ ] **Step 2: Update `resolveChargeSlug()` to handle legacy mapping**

In `supabase/functions/generate-report/index.ts`, update `resolveChargeSlug()`:
- After the existing if/else chain, add a DB lookup via the `common_charges` table's `legacy_slugs` array
- If the raw slug matches a legacy_slug, return the corresponding common_charge slug
- Keep the existing if/else chain as first-pass resolution (it's fast and handles common cases)

- [ ] **Step 3: Update `getChargeContext()` to query new tables first**

In `supabase/functions/generate-report/index.ts`, modify `getChargeContext()`:
1. First, try to resolve via new tables: query `common_charges` for the slug, then `jurisdiction_statutes` for the jurisdiction, then `experts` for the common charge
2. If found, use `buildEnrichedChargeContext()` to format the enriched block (import from charge-taxonomy.ts, note: edge functions may need the function inlined since they can't import from src/lib)
3. If new tables return nothing, fall back to existing `charge_types` + `experts` query
4. If that also fails, fall back to `getChargeContextFallback()`

The enriched block is richer than the old format but goes into the same `${v.charge_specific_data}` slot, no changes needed to prompts.ts.

- [ ] **Step 4: Add legacy slug resolver to `src/lib/charge-types.ts`**

Add a `resolveLegacyChargeSlug()` function that maps old slugs to new common_charge slugs (pure function, no DB needed, uses a hardcoded map derived from the spec's legacy slug table). Keep `ALLOWED_CHARGE_TYPES` and `isValidChargeType()` unchanged.

- [ ] **Step 5: Test with an existing case**

Pick an existing case from the database. Manually trigger report generation and verify:
- The enriched charge context block appears in the report
- If the case has a known charge type (e.g., "dui"), it resolves through the new tables
- The fallback chain works: new tables → old tables → hardcoded fallback
- Report quality is equal or better than before

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-report/index.ts src/lib/charge-types.ts
git commit -m "feat: integrate enriched charge context, statute, elements, penalties in every report"
```

---

## Phase 2: Intake Form Rewrite

### Task 7: Build intake charge category selector component

**Files:**
- Create: `src/components/IntakeChargeCategories.tsx`

- [ ] **Step 1: Read existing ChargeTypeSelector for patterns**

Read `src/components/ChargeTypeSelector.tsx`, note the card grid pattern, radiogroup ARIA, toggle behavior, and Tailwind styling.

- [ ] **Step 2: Read the brand design system**

Read `design-system/brand.md` for colors, fonts, and design constraints.

- [ ] **Step 3: Write the component**

Create `src/components/IntakeChargeCategories.tsx`:
- Client component (`"use client"`)
- Fetches `charge_categories` from Supabase on mount (or accepts as prop from server component)
- Renders visual card grid per spec: icon + label + description per card
- 2-col mobile, 4-col desktop grid
- Toggle behavior: click selects, click again deselects
- `onSelect(categorySlug: string | null)` callback prop
- When jurisdiction is "federal", filters to show only categories with `is_federal` charges
- "Other" card always last
- Uses Lucide icons from `icon_name` field
- Follows brand.md: dark mode, amber accent, Playfair Display headings

- [ ] **Step 4: Commit**

```bash
git add src/components/IntakeChargeCategories.tsx
git commit -m "feat: add IntakeChargeCategories component, card grid with category selection"
```

---

### Task 8: Build intake charge selector component (with statute display)

**Files:**
- Create: `src/components/IntakeChargeSelector.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/IntakeChargeSelector.tsx`:
- Client component
- Props: `categorySlug: string`, `jurisdiction: string | null`, `onSelect(commonChargeSlug: string | null): void`
- Fetches common charges for the given category + jurisdiction from Supabase
- When jurisdiction is a state (e.g., "FL"), fetches jurisdiction_statutes to show statute numbers alongside each charge
- Renders a list of selectable cards/buttons, each showing:
  - Charge label (e.g., "Aggravated Assault / Battery")
  - Statute number + offense class when available (e.g., "FL 784.045, 2nd Degree Felony")
  - No statute info shown when jurisdiction is "unknown"
- "My charge isn't listed" option at bottom → reveals a free-text input field
- Toggle behavior: click selects, click again deselects
- Max 15 visible, sorted by sort_order

- [ ] **Step 2: Commit**

```bash
git add src/components/IntakeChargeSelector.tsx
git commit -m "feat: add IntakeChargeSelector, charge list with statute numbers per jurisdiction"
```

---

### Task 9: Build DB-driven charge questions component

**Files:**
- Create: `src/components/IntakeChargeQuestions.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/IntakeChargeQuestions.tsx`:
- Client component
- Props: `commonChargeSlug: string`, `onChange(answers: Record<string, string>): void`
- Fetches charge questions for the given slug from Supabase
- Renders each question as a labeled select/radio group
- Each question has "Don't know" as the last option
- One question visible at a time (progressive disclosure per Friedman) OR all at once (depending on count, if ≤4 questions, show all; if >4, paginate)
- Stores answers in internal state, calls onChange with all answers on each change

- [ ] **Step 2: Commit**

```bash
git add src/components/IntakeChargeQuestions.tsx
git commit -m "feat: add IntakeChargeQuestions, DB-driven charge-specific questions"
```

---

### Task 10: Rewrite intake form with 3-screen progressive narrowing

**Files:**
- Modify: `src/app/intake/page.tsx`
- Modify: `src/app/api/intake/route.ts`

This is the largest single task. The intake form's Step 1 charge selection (currently a single dropdown) becomes a 3-screen sub-flow within the existing 3-step wizard.

- [ ] **Step 1: Read the full current intake form**

Read `src/app/intake/page.tsx` in its entirety. Note:
- The 3-step wizard structure (Contact & Charges → Your Situation → One More Thing)
- The hardcoded `chargeSpecificQuestions` object (lines 130-430)
- The hardcoded `stateChargeTypes`, `federalChargeTypes`, `allChargeTypes` arrays (lines 71-110)
- The `sexOffenseSubTypes` sub-routing (lines 113-117)
- The form state management and validation gates

- [ ] **Step 2: Replace hardcoded charge arrays with new components**

In Step 1 of the wizard, replace:
- The charge type dropdown (`stateChargeTypes` / `federalChargeTypes` / `allChargeTypes`) with `<IntakeChargeCategories>` → `<IntakeChargeSelector>`
- The `chargeSpecificQuestions` Record with `<IntakeChargeQuestions>`
- The sex offense sub-routing (no longer needed, sex offenses are distinct common charges in the new taxonomy: `sex-offense-contact`, `sex-offense-digital`, `indecent-exposure`, etc.)

The flow within Step 1 becomes:
1. Jurisdiction selection (keep existing)
2. State dropdown (keep existing, shown when "State" selected)
3. `<IntakeChargeCategories>`, category card grid
4. `<IntakeChargeSelector>`, specific charge with statute numbers (shown after category selected)
5. `<IntakeChargeQuestions>`, fact-pattern questions (shown after charge selected)

- [ ] **Step 3: Update form state**

Add these fields to the form state:
- `categorySlug: string`, selected charge category
- `commonChargeSlug: string`, selected common charge
- `jurisdictionStatuteId: string`, resolved statute ID (if available)

Keep `chargeType: string` in the form state for backward compatibility at the API level. Set it from `commonChargeSlug` when the form submits.

- [ ] **Step 4: Update Step 1 validation gate**

Current gate: `firstName + email + chargeType + state + caseNumber + timeSinceArrest + county`
New gate: same, but `chargeType` is now derived from `commonChargeSlug`. If `commonChargeSlug` is set, the gate passes. If user used "My charge isn't listed" free text, map to `"other"`.

- [ ] **Step 5: Read and update the intake API route**

Read `src/app/api/intake/route.ts`. Add support for the new fields:
- Accept `commonChargeSlug`, `categorySlug`, `jurisdictionStatuteId` in the POST body
- Store them alongside existing `chargeType` in the `intakes` table
- If only `commonChargeSlug` is provided (new flow), derive `chargeType` from the common charge's legacy_slugs for backward compat

- [ ] **Step 6: Production build test**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build
```

Verify the build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/intake/page.tsx src/app/api/intake/route.ts
git commit -m "feat(intake): rewrite charge selection, 3-screen progressive narrowing with statute display"
```

---

## Phase 3: Homepage + Sales Pages

### Task 11: Update ChargeTypeSelector for categories

**Files:**
- Modify: `src/components/ChargeTypeSelector.tsx`

- [ ] **Step 1: Read current ChargeTypeSelector**

Read `src/components/ChargeTypeSelector.tsx` (133 lines). Note the 8 hardcoded charge types and the `onSelect` callback.

- [ ] **Step 2: Update to use charge_categories**

Update the component to:
- Fetch `charge_categories` from Supabase (or accept as prop)
- Render 12 categories instead of 8 hardcoded types
- Keep the same visual pattern (card grid, toggle behavior, one-liners)
- Each category shows its `description` as the one-liner
- Map category selections to the most relevant playbook checkout link (for categories that have playbooks) or to `/start` (for categories without playbooks)
- `onSelect` callback now passes `categorySlug` instead of playbook tier slug

- [ ] **Step 3: Commit**

```bash
git add src/components/ChargeTypeSelector.tsx
git commit -m "feat: expand ChargeTypeSelector to 12 charge categories from DB"
```

---

### Task 12: Update HomepageHero for category-based selection

**Files:**
- Modify: `src/components/HomepageHero.tsx`

- [ ] **Step 1: Read current HomepageHero**

Read `src/components/HomepageHero.tsx`. Note the `selectedSlug` state and how CTA text/href changes based on selection.

- [ ] **Step 2: Update for category-based selection**

When a category is selected:
- If the category has a matching playbook (e.g., `dui-driving` → `dui-first-offense`), show "Get Your {playbook}, $97" CTA
- If the category has no playbook (e.g., `violent-crimes`), show "Start Your Case Research, $197" CTA pointing to `/start`
- Secondary CTA always available: "Need deeper analysis? Case Decoder, $197"

When no category selected: default CTAs unchanged (Case Decoder primary, Browse Playbooks secondary).

- [ ] **Step 3: Commit**

```bash
git add src/components/HomepageHero.tsx
git commit -m "feat: update HomepageHero for category-based charge selection"
```

---

### Task 13: Update homepage catalog grid + schema

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read current page.tsx**

Read `src/app/page.tsx`, note the "Defense Playbooks by Charge Type" section (lines ~583-621) and the structured data schema with `knowsAbout`.

- [ ] **Step 2: Update catalog grid**

Replace the 8-playbook grid with a section showing all 12 charge categories. Each card links to either:
- The playbook checkout page (if a playbook exists for that category)
- The `/start` page (if no playbook yet) with a note like "Case Research Available"

- [ ] **Step 3: Update schema knowsAbout**

Update the `knowsAbout` structured data to list all 12 charge categories (currently lists 8).

- [ ] **Step 4: Production build test**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(homepage): expand catalog to 12 charge categories + update schema knowsAbout"
```

---

## Post-Implementation

### Task 14: End-to-end verification

- [ ] **Step 1: Run production build**

```bash
cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build
```

- [ ] **Step 2: Run CV (Continuous Verification)**

```bash
node ~/projects/continuous-verification/verify.mjs,project inna,probe-only,no-trends
```

- [ ] **Step 3: Visual QA via Playwright MCP**

Navigate to `https://imnotanattorney.com` and verify:
1. Homepage shows 12 charge category cards (not 8)
2. Clicking a category updates CTA appropriately
3. Navigate to `/intake`, verify 3-screen charge selection flow:
   - Select jurisdiction → select category → select specific charge (with statute number)
   - Charge-specific questions load dynamically
   - "I don't know" / "My charge isn't listed" paths work
4. Submit a test intake and verify the enriched charge context appears in the generated report

- [ ] **Step 4: Push to deploy**

```bash
git push origin master
```

Vercel auto-deploys. Monitor deployment logs.
