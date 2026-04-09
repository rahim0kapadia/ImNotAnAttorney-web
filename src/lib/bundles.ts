/**
 * @fileoverview Bundle definitions — maps bundle slugs to included products.
 *
 * Bundles flow through the standalone product pipeline (checkout, webhook,
 * intake, Edge Function). The only differences:
 *   - Intake form fields are the union of all included products' fields
 *   - Edge Function generates a combined report from all included prompts
 *   - Landing page shows savings vs a-la-carte pricing
 *
 * Add a new bundle:
 *   1. Add entry here
 *   2. Add product entry in products.ts (category: "bundle")
 *   3. Add FIELD_SETS entry in IntakeFormClient.tsx (use mergeFieldSets)
 *   4. Add OPTIONAL_FIELDS entry in intake route
 *   5. Add case in Edge Function buildUserPrompt
 */

export interface BundleDefinition {
  name: string;
  includedProducts: string[];
  includedGuides: string[];
  savings: string;
}

export const BUNDLES: Record<string, BundleDefinition> = {
  "first-72-hours": {
    name: "First 72 Hours Bundle",
    includedProducts: ["arrest-report-review", "bail-hearing-prep"],
    includedGuides: ["first-court-appearance", "family-action-plan"],
    savings: "Save 50%",
  },
  "defense-preparation": {
    name: "Defense Preparation Bundle",
    includedProducts: [
      "breathalyzer-challenge",
      "fst-review",
      "drug-test-reliability",
      "arrest-report-review",
    ],
    includedGuides: [],
    savings: "Save 49%",
  },
  "pre-plea-package": {
    name: "Pre-Plea Package",
    includedProducts: [
      "plea-consequences",
      "collateral-consequences",
      "sentencing-prep",
    ],
    includedGuides: [],
    savings: "Save 42%",
  },
};

export function isBundle(slug: string): boolean {
  return slug in BUNDLES;
}

export function getBundle(slug: string): BundleDefinition | undefined {
  return BUNDLES[slug];
}
