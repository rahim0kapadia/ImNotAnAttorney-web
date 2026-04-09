# Tier 9 Frontend Integration Blueprint

**Date:** 2026-04-09
**Status:** Blueprint — ready for execution once Tier 9 data pipelines complete.
**Prerequisite:** `bulk-master-extractor.mjs --apply` has populated the 9 Tier 9 tables + `bulk-similar-case-matcher.mjs --apply` has been re-run with motion data.

## Purpose

This doc is the execution packet for Tasks 15-21 of the Data-Driven Defense Intelligence plan. It defines exactly what to change in `prompts.ts`, `render.ts`, `tiers.ts`, and what new pages to build. It is **pre-implementation** — no UI code yet — so that the accessibility-lead can review the plan before any customer-facing surface is touched.

## What Tier 9 produces (data layer — already built)

| Table | Populated by | Queried by tier |
|---|---|---|
| `judge_quotes` | bulk-master-extractor | IB, X-Ray, WR, SR, Judge Report Card |
| `sentencing_distributions` | bulk-master-extractor | X-Ray, WR, SR, Judge Report Card |
| `officer_reliability` | bulk-master-extractor | X-Ray, WR, SR, Officer Background Check |
| `judge_prosecutor_pairings` | bulk-master-extractor | WR, SR |
| `bench_jury_divergence` | bulk-master-extractor | WR, SR, Judge Report Card |
| `co_defendant_analysis` | bulk-master-extractor | SR |
| `plea_discount_curves` | bulk-master-extractor | SR |
| `appellate_trends` | bulk-appeal-outcome-correlator | IB, X-Ray, WR, SR |
| `case_feature_vectors` | bulk-similar-case-matcher | X-Ray, WR, SR, Similar Cases Analyzer |

## The tier inclusion rule (additive, not replacing)

Per `.claude/rules/product-tiers.md`: each tier **extends** what the tier below already delivers. Tier 9 data additions follow the same rule:

- **Intelligence Brief ($997)** — adds `judge_quote_library` (3-5 quotes from the assigned judge on topics matching the case), `appellate_trends` (prosecution overreach rate for the charge type in the circuit). Does NOT get sentencing outliers, officer reliability, or pairing matrix — those stay premium.
- **X-Ray ($2,497)** — everything in IB, plus `sentencing_outlier_flags` (does this judge depart upward/downward on this charge), `officer_reliability_cross_case` (has the arresting officer been discredited in other cases).
- **War Room ($4,997)** — everything in X-Ray, plus `judge_prosecutor_pairing_matrix` (how this judge rules on this prosecutor's motions), `bench_vs_jury_divergence` (does this judge acquit more at bench trial than jury trial for this charge), `similar_case_match` (k-NN lookup with outcome probabilities).
- **Situation Room ($9,997)** — everything in WR, plus `co_defendant_divergence` (historical outcome gaps between co-defendants in multi-party cases), `plea_discount_curve` (how much does the plea discount shrink as trial approaches).
- **All paid tiers** — the `judge_quote_library` and `appellate_trends` are the floor.

## Task 15 — `src/lib/intelligence-brief/prompts.ts`

### 15a. Extend `IBVariables` interface (type additions, not replacements)

Add these fields to the interface (declared at top of file, used by every `buildX()` function):

```ts
// Tier 9 — Judge Intel (IB and above)
judge_quote_library?: string;        // XML block: <quotes><quote topic="search" source_url="...">...</quote></quotes>
appellate_trends_summary?: string;   // narrative: "In the 11th Circuit, DUI convictions are reversed at 4.2% vs 2.1% baseline..."

// Tier 9 — X-Ray and above
sentencing_outlier_flags?: string;   // narrative: "Judge X sentences 1.3σ above median for DUI 1st offenses..."
officer_reliability_crosscase?: string; // XML: <officers><officer name="..." discredited_in="3 cases" source_urls="...">...</officer></officers>

// Tier 9 — War Room and above
pairing_matrix_summary?: string;     // narrative + table
bench_jury_divergence_summary?: string;
similar_case_matches?: string;       // XML: <similar_cases><case outcome="acquittal" distance="0.18" source_url="...">...</case></similar_cases>

// Tier 9 — Situation Room
codefendant_divergence_summary?: string;
plea_discount_curve_summary?: string;
```

### 15b. Extend existing section builders, do NOT add new sections

Tier 9 data threads into the existing 10 sections — this preserves report flow and narrative voice:

| Section builder | Tier 9 injection |
|---|---|
| `buildCaseIntelligence` (§3 — Judge Intelligence subsection 3e) | Inject `{judge_quote_library}` and `{appellate_trends_summary}` into the existing Jurisdiction Intelligence Summary |
| `buildWhatsWorking` (§2) | Inject `{similar_case_matches}` — "cases like yours that resulted in acquittal" (WR+ only) |
| `buildLegalOptions` (§4) | Inject `{pairing_matrix_summary}` — motion grant rates for your judge×prosecutor combo (WR+ only) |
| `buildProtection` (§5) | Inject `{sentencing_outlier_flags}` — sentencing risk with real data (X-Ray+ only) |
| `buildCaseRoadmap` (§1) | Inject `{bench_jury_divergence_summary}` — informs bench vs jury election timing (WR+ only) |

### 15c. Add 1 new Phase-B builder: `buildTier9DataAppendix`

A dedicated appendix that presents ALL Tier 9 data as a forensic fact sheet (not narrative). This satisfies the "science, not opinion" rule from `brand-voice.md` — every data point has a `source_url`. Goes in Appendix F.

```ts
export function buildTier9DataAppendix(v: IBVariables): PromptConfig {
  // Low temperature (0.1), structured table output only, no narrative.
  // Tier-gated: only render sections for the data the buyer's tier unlocks.
}
```

Register in `PROMPT_BUILDERS` at line 1052. Add to `PHASE_B_BUILDERS` at line 1043.

## Task 16 — `src/lib/intelligence-brief/render.ts`

### 16a. Section ordering (additive)

In `renderIntelligenceBriefHtml` (line 302), insert one new entry at the end of the sections array (before the static appendices):

```ts
// Appendix F: Tier 9 Forensic Data Sheet (new)
sectionOutputs["tier9-data-appendix"] || "",
```

### 16b. Sidebar metadata

Add to `IBReportMeta` interface:
```ts
tier9DataCount?: number;   // e.g., "Based on 347 verified data points"
tier9SourceUrlCount?: number;
```

Render in the header-block metadata row. This is the "turn art into science" signal from `atti-persona.md` — the defendant sees a verified data count on page 1.

## Task 17 — `src/lib/tiers.ts` — 3 new standalone SKUs

Insert these into `TIER_CORE` (line 30) **before** `witness-pack` (line 244):

```ts
"judge-report-card": {
  name: "Judge Report Card",
  price: 19700,
  priceDisplay: "$197",
  delivery: "Instant",
  deliveryDetail: "Your Judge Report Card is generated on demand within 60 seconds of purchase.",
  requiresDiscovery: false,
  isAddon: false,
  isDigitalProduct: true,
  requiresWarRoom: false,
  priorityPrice: null,
  priorityDelivery: null,
  includesTiers: [] as readonly string[],
  live: false as boolean,  // test mode — flip after E2E verification
},
"officer-background-check": {
  name: "Officer Background Check",
  price: 9700,
  priceDisplay: "$97",
  delivery: "Instant",
  deliveryDetail: "Your Officer Background Check is generated on demand within 60 seconds of purchase.",
  requiresDiscovery: false,
  isAddon: false,
  isDigitalProduct: true,
  requiresWarRoom: false,
  priorityPrice: null,
  priorityDelivery: null,
  includesTiers: [] as readonly string[],
  live: false as boolean,
},
"similar-cases-analyzer": {
  name: "Similar Cases Analyzer",
  price: 29700,
  priceDisplay: "$297",
  delivery: "Instant",
  deliveryDetail: "Your Similar Cases Analyzer report is generated on demand within 60 seconds of purchase.",
  requiresDiscovery: false,
  isAddon: false,
  isDigitalProduct: true,
  requiresWarRoom: false,
  priorityPrice: null,
  priorityDelivery: null,
  includesTiers: [] as readonly string[],
  live: false as boolean,
},
```

These 3 SKUs are **standalone data products** — no discovery required, no charge-slug dependency, no prerequisite tier. They generate from Tier 9 tables alone using the judge_id, officer_name, or charge_slug the buyer enters at checkout intake.

### 17a. Update `PLAYBOOK_SLUGS` (line 318)
No change — Tier 9 SKUs are not playbooks.

### 17b. Update `SERVICE_UPGRADE_PATH` (line 330)
No change — Tier 9 SKUs are standalone and do NOT feed into the CD → IB → XR → WR → SR ladder. They're lateral additions.

### 17c. Post-change verification
```bash
node scripts/check-tiers.mjs
```
Per the header comment on tiers.ts, also update:
- `CLAUDE.md` Products & Pricing table
- `docs/PRD.md` Section 5
- `system/DELIVERABLES-BY-TIER.md`

## Tasks 18-20 — 3 standalone SKU pages (**accessibility-lead gate**)

### Routes
- `src/app/judge-report-card/page.tsx`
- `src/app/officer-background-check/page.tsx`
- `src/app/similar-cases-analyzer/page.tsx`

### Shared structure (each page)
1. Hero — charge-specific trust marker ("Based on 15,613 verified judges"), price, CTA
2. "What you get" — 5-7 bullet points, each pointing to a real data source
3. Sample report screenshot — forensic table, not narrative
4. Trust block — "Every data point has a source URL. Click any row to verify against CourtListener."
5. FAQ — UPL-safe (must pass existing UPL gate)
6. CTA — `/checkout?tier={slug}`

### Accessibility requirements (NON-NEGOTIABLE — accessibility-lead enforces)

**Before any .tsx file is written**, delegate to `accessibility-agents:accessibility-lead` with:
- Design-system reference: `design-system/brand.md` (dark mode only, amber #f59e0b + navy #1E3A8A)
- Required WCAG level: AA (the rest of the site is already AA)
- Target patterns to validate: hero + pricing table + checkout CTA, FAQ accordion (if used), sample report screenshot with alt text strategy
- The charge-selector input component used on existing landing pages (reuse, don't rebuild)
- Form-associated intake fields: judge_name (Judge Report Card), officer_name (Officer Background Check), charge_slug + state (Similar Cases Analyzer)

### Data wiring (server components)
Each page's `generateMetadata` and server component reads from:
- `judge-report-card` — `judges` + `judge_quotes` + `sentencing_distributions` + `bench_jury_divergence`
- `officer-background-check` — `officer_reliability` + `case_law` cross-reference
- `similar-cases-analyzer` — `case_feature_vectors` + `statute_case_law`

No Edge Function needed — these are on-demand reads from the already-populated Tier 9 tables. The generation happens in a Next.js Server Action triggered by Stripe webhook.

## Task 21 — `src/lib/playbook-configs.ts`

No change required for Tier 9 — playbooks are per-charge, Tier 9 data is per-judge/officer/case. The three new SKUs do not use playbook-configs.

## Execution order (after data pipelines are populated)

1. **Task 17 first** — add 3 tier entries in test mode. Run `check-tiers.mjs`. No UI yet.
2. **Task 15 + 16** — prompts + render. These are backend prompt engineering, no a11y review needed. Gate: full IB generation roundtrip test in test mode.
3. **Dispatch accessibility-lead** — hand them this doc plus the 3 target routes. Wait for blueprint approval.
4. **Tasks 18-20** — write the 3 pages per accessibility-lead guidance.
5. **Stripe product creation** — separate step, requires explicit approval from Rahim before touching Stripe API.
6. **Flip `live: false` → `live: true`** — one SKU at a time, verify E2E after each.

## What this doc does NOT do
- Does not write any TypeScript or TSX.
- Does not commit Stripe products.
- Does not modify docs/PRD.md or CLAUDE.md.
- Does not pre-empt accessibility-lead review of the 3 new pages.

Everything here is a **design decision** made in one session so the next implementation session has zero ambiguity. Ready to execute the moment `bulk-master-extractor.mjs --apply` completes.
