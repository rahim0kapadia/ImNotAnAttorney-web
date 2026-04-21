"use client";

/**
 * Intake form client component for standalone research products.
 *
 * Renders product-specific form fields based on a per-slug FIELD_SETS
 * configuration. Each entry in FIELD_SETS describes the typed inputs the
 * server-side intake API (`/api/intake/standalone/[slug]/route.ts`) and
 * the Edge Function (`generate-standalone/index.ts`) expect for that
 * product. To add a new product:
 *   1. Add an entry to STANDALONE_PRODUCTS in src/lib/products.ts.
 *   2. Add a FIELD_SETS entry here.
 *   3. Extend the route validator allowlists if you introduce new enum
 *      fields, optional fields, or long-form text fields.
 *   4. Add a switch case in the Edge Function buildUserPrompt().
 *
 * Accessibility (audited by accessibility-lead, 2026-04-07):
 *   - All inputs have associated <label> elements
 *   - Required fields marked with aria-required + visible asterisk
 *   - Error summary announced via aria-live region
 *   - Focus moves to error summary on validation failure
 *   - Success state announced to screen readers via role="status"
 *   - Fieldset/legend groups related boolean fields
 *   - Long-form textarea uses aria-describedby pointing to BOTH help and
 *     character counter; counter uses aria-live="polite" + aria-atomic
 *   - Form has aria-label tied to the product name (no cross-file id
 *     coordination needed because the slug is URL-stable)
 *   - Optional fields omit aria-required and use a help hint
 */

import { useState, useRef, useMemo, useEffect } from "react";
import { ALLOWED_CHARGE_TYPES } from "@/lib/charge-types";

const US_STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" }, { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

const EMPLOYER_TYPES = [
  { value: "government-federal", label: "Federal Government" },
  { value: "government-state", label: "State Government" },
  { value: "government-local", label: "Local Government" },
  { value: "private-regulated", label: "Private, Regulated Industry" },
  { value: "private-unregulated", label: "Private, Unregulated Industry" },
  { value: "self-employed", label: "Self-Employed" },
  { value: "unemployed", label: "Unemployed" },
];

// Wave 1 court case port, case stage options for motion-opportunity-scan.
// Server-side allowlist lives in src/app/api/intake/standalone/[slug]/route.ts
// (VALID_CASE_STAGES). Keep both in sync.
const CASE_STAGES = [
  { value: "pre-arraignment", label: "Pre-arraignment (charged but not yet arraigned)" },
  { value: "post-arraignment", label: "Post-arraignment (arraigned, awaiting discovery)" },
  { value: "post-discovery", label: "Post-discovery (discovery received, pre-motion deadline)" },
  { value: "pre-trial", label: "Pre-trial (motions filed, awaiting hearings)" },
  { value: "trial", label: "Trial (in trial or about to start)" },
  { value: "post-trial", label: "Post-trial (verdict reached, sentencing or appeal)" },
];

const LICENSE_TYPES = [
  { value: "nursing", label: "Nursing (RN/LPN)" },
  { value: "cdl", label: "Commercial Driving (CDL)" },
  { value: "teaching", label: "Teaching / Education" },
  { value: "real-estate", label: "Real Estate" },
  { value: "financial-advisor", label: "Financial Advisor / Securities" },
  { value: "attorney", label: "Attorney / Bar" },
  { value: "physician", label: "Physician / DO" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "engineering", label: "Engineering" },
  { value: "accounting", label: "Accounting / CPA" },
  { value: "cosmetology", label: "Cosmetology" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];

const CUSTODY_STATUS = [
  { value: "sole", label: "Sole custody" },
  { value: "joint", label: "Joint custody" },
  { value: "visitation-only", label: "Visitation only" },
  { value: "no-order", label: "No custody order" },
  { value: "pending", label: "Custody case pending" },
];

const IMMIGRATION_STATUS = [
  { value: "citizen", label: "U.S. Citizen" },
  { value: "green-card", label: "Green Card Holder" },
  { value: "visa", label: "Visa Holder" },
  { value: "daca", label: "DACA Recipient" },
  { value: "tps", label: "Temporary Protected Status (TPS)" },
  { value: "pending-petition", label: "Pending Immigration Petition" },
  { value: "undocumented", label: "Undocumented" },
  { value: "other", label: "Other" },
];

const YES_NO_DONTKNOW = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "dont-know", label: "Don't know" },
];

const CLEARANCE_LEVELS = [
  { value: "confidential", label: "Confidential" },
  { value: "secret", label: "Secret" },
  { value: "top-secret", label: "Top Secret" },
  { value: "ts-sci", label: "TS/SCI" },
  { value: "q", label: "Q Clearance (DOE)" },
  { value: "l", label: "L Clearance (DOE)" },
];

const SELF_REPORTED = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not-yet", label: "Not yet" },
  { value: "dont-know", label: "Don't know" },
];

const CONVICTION_METHODS = [
  { value: "plea", label: "Plea deal / Guilty plea" },
  { value: "trial", label: "Trial verdict" },
];

const PRIOR_CONVICTIONS = [
  { value: "none", label: "None" },
  { value: "misdemeanor", label: "Misdemeanor(s)" },
  { value: "felony", label: "Felony" },
  { value: "multiple", label: "Multiple" },
];

const OFFENSE_CLASS = [
  { value: "felony", label: "Felony" },
  { value: "misdemeanor", label: "Misdemeanor" },
];

const CHARGE_INVOLVES = [
  { value: "substances", label: "Substances / Drugs / Alcohol" },
  { value: "fraud", label: "Fraud / Financial" },
  { value: "violence", label: "Violence" },
  { value: "sexual", label: "Sexual Offense" },
  { value: "domestic-violence", label: "Domestic Violence" },
  { value: "child-related", label: "Child-Related" },
  { value: "none", label: "None of these" },
];

const TEST_TYPES = [
  { value: "field-test", label: "Field Test (presumptive)" },
  { value: "lab-analysis", label: "Lab Analysis (confirmatory)" },
  { value: "urinalysis", label: "Urinalysis" },
  { value: "hair", label: "Hair Test" },
  { value: "blood", label: "Blood Test" },
];

const BREATHALYZER_TYPES = [
  { value: "intoxilyzer", label: "Intoxilyzer" },
  { value: "datamaster", label: "DataMaster" },
  { value: "draeger", label: "Draeger / Dräger" },
  { value: "unknown", label: "Don't know / Other" },
];

// FST tests are free-text (testsAdministered), no select options needed.

const APPEAL_DEADLINE_STATUS = [
  { value: "within-deadline", label: "Within deadline" },
  { value: "approaching", label: "Approaching deadline" },
  { value: "expired", label: "Deadline expired" },
  { value: "dont-know", label: "Don't know" },
];

// IAC issues are free-text (issuesIdentified textarea), no select options needed.

const CASE_OUTCOMES = [
  { value: "convicted-trial", label: "Convicted at trial" },
  { value: "pled-guilty", label: "Pled guilty" },
  { value: "charges-not-dismissed", label: "Charges not dismissed" },
];

const COMMUNICATION_FREQUENCY = [
  { value: "weekly", label: "Weekly or more" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "rarely", label: "Rarely (every few months)" },
  { value: "none", label: "Almost never" },
];

const VIOLATION_TYPES = [
  { value: "missed-appointment", label: "Missed appointment with PO" },
  { value: "failed-drug-test", label: "Failed drug test" },
  { value: "new-arrest", label: "New arrest" },
  { value: "travel-violation", label: "Travel violation" },
  { value: "curfew-violation", label: "Curfew violation" },
  { value: "failed-to-pay", label: "Failed to pay fines/restitution" },
  { value: "other", label: "Other" },
];

const CHARGE_TYPE_LABELS: Record<string, string> = {
  "drug-possession": "Drug Possession",
  "drug-trafficking": "Drug Trafficking",
  dui: "DUI / DWI",
  "dui-first": "DUI, First Offense",
  "dui-repeat": "DUI, Repeat Offense",
  assault: "Assault",
  "domestic-violence": "Domestic Violence",
  theft: "Theft / Larceny",
  "sex-offense": "Sex Offense",
  "sex-offense-contact": "Sex Offense, Contact",
  "sex-offense-digital": "Sex Offense, Digital",
  weapons: "Weapons Charge",
  "white-collar": "White Collar / Financial Crime",
  federal: "Federal Charge",
  "probation-violation": "Probation Violation",
  "self-defense": "Self-Defense Claim",
  other: "Other",
};

// Current charge types (exclude legacy values from the select)
const CURRENT_CHARGE_TYPES = ALLOWED_CHARGE_TYPES.filter(
  (ct) => !["drug", "other-felony", "other-misdemeanor", "robbery", "burglary", "fraud"].includes(ct)
);

const CHARGE_TYPE_OPTIONS = CURRENT_CHARGE_TYPES.map((ct) => ({
  value: ct,
  label: CHARGE_TYPE_LABELS[ct] || ct,
}));

// ────────────────────────────────────────────────────────────────────────────
// FIELD CONFIG
// ────────────────────────────────────────────────────────────────────────────
// Per-slug field set declarations. Each FieldConfig entry owns its own
// label, kind, validation hints, and a11y wiring expectations. The render
// loop dispatches to the correct input element based on `kind`.
// ────────────────────────────────────────────────────────────────────────────

type SelectOption = { value: string; label: string };

type FieldConfig =
  | {
      kind: "select";
      name: string;
      label: string;
      required: boolean;
      options: SelectOption[];
      placeholder?: string;
    }
  | {
      kind: "text";
      name: string;
      label: string;
      required: boolean;
      maxLength: number;
      placeholder?: string;
      helpText?: string;
    }
  | {
      kind: "textarea";
      name: string;
      label: string;
      required: boolean;
      maxLength: number;
      rows: number;
      helpText?: string;
    }
  | {
      kind: "checkbox";
      name: string;
      label: string;
    }
  | {
      // Progressive-disclosure wrapper — renders nested fields inside a
      // collapsed <details> so optional fields don't dominate the form.
      kind: "optional-group";
      name: string; // unique key, not submitted as a value
      summary: string;
      helpText?: string;
      fields: FieldConfig[];
    }
  | {
      /** Select whose options depend on another field's current value.
       *  When dependsOn is empty the field renders disabled with emptyDepLabel.
       *  On dependsOn change the form fetches `endpoint(value)` and parses
       *  options via parseOptions. Current value is reset on dep change.
       *  Works at top level or nested inside an optional-group. */
      kind: "cascading-select";
      name: string;
      label: string;
      required: boolean;
      dependsOn: string;
      endpoint: (depValue: string) => string;
      parseOptions: (data: unknown) => SelectOption[];
      placeholder?: string;
      helpText?: string;
      emptyDepLabel: string;
      /** Optional label shown when the fetch returned zero options.
       *  Defaults to a generic "No options for this selection" — override
       *  per-use-case (e.g. "No federal districts for this state"). */
      emptyOptionsLabel?: string;
    };

const FIELD_SETS: Record<string, FieldConfig[]> = {
  "employment-impact": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "occupation",
      label: "Current job title / occupation",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Registered Nurse, CDL Truck Driver, Software Engineer",
    },
    {
      kind: "select",
      name: "employerType",
      label: "Employer type",
      required: true,
      options: EMPLOYER_TYPES,
      placeholder: "Select employer type",
    },
    {
      kind: "checkbox",
      name: "industryRegulated",
      label:
        "My industry is regulated (healthcare, finance, education, transportation, law enforcement)",
    },
    {
      kind: "checkbox",
      name: "hasClearance",
      label: "I hold a security clearance",
    },
  ],
  "judge-profile": [
    {
      kind: "text",
      name: "judgeName",
      label: "Judge name",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hon. Pat Siracusa",
      helpText:
        "Full name as it appears on your court paperwork. Include any title (Hon., Judge, Justice).",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "text",
      name: "caseNumber",
      label: "Case number",
      required: false,
      maxLength: 200,
      placeholder: "Optional",
      helpText:
        "Optional. Format varies by court, paste it as it appears on your paperwork.",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
  ],
  "motion-opportunity-scan": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "select",
      name: "caseStage",
      label: "Current case stage",
      required: true,
      options: CASE_STAGES,
      placeholder: "Select case stage",
    },
    {
      kind: "text",
      name: "judgeName",
      label: "Judge name",
      required: false,
      maxLength: 200,
      placeholder: "Optional",
      helpText:
        "Optional. Helps tailor the scan if known. Leave blank if your judge has not been assigned.",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "Known facts about your case",
      required: true,
      maxLength: 800,
      rows: 6,
      helpText:
        "What happened, what you are charged with, and what stage you are at. Up to 800 characters.",
    },
  ],

  // ─── WAVE 1: $97 PRODUCTS (Reddit-validated) ────────────────────────────────

  "breathalyzer-challenge": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "bacReading",
      label: "BAC reading",
      required: true,
      maxLength: 10,
      placeholder: "e.g., 0.08, 0.12",
    },
    {
      kind: "select",
      name: "breathalyzerType",
      label: "Breathalyzer type",
      required: false,
      options: BREATHALYZER_TYPES,
      placeholder: "Select breathalyzer type",
    },
    {
      kind: "text",
      name: "timeBetweenStopAndTest",
      label: "Time between stop and test",
      required: false,
      maxLength: 50,
      placeholder: "e.g., 20 minutes",
    },
    {
      kind: "checkbox",
      name: "choiceOfTest",
      label: "I was given a choice between blood and breath test",
    },
    {
      kind: "textarea",
      name: "medicalConditions",
      label: "Medical conditions",
      required: false,
      maxLength: 500,
      rows: 3,
      helpText:
        "GERD, diabetes, asthma, or other conditions that may affect breath test accuracy",
    },
  ],
  "fst-review": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "testsAdministered",
      label: "Tests administered",
      required: true,
      maxLength: 300,
      placeholder: "Which tests? e.g., HGN, walk-and-turn, one-leg-stand",
    },
    {
      kind: "textarea",
      name: "surfaceConditions",
      label: "Surface conditions",
      required: false,
      maxLength: 500,
      rows: 3,
      helpText: "Describe: flat/uneven, wet/dry, lit/dark",
    },
    {
      kind: "text",
      name: "weather",
      label: "Weather conditions",
      required: false,
      maxLength: 100,
    },
    {
      kind: "text",
      name: "footwear",
      label: "Footwear",
      required: false,
      maxLength: 100,
    },
    {
      kind: "textarea",
      name: "physicalConditions",
      label: "Physical conditions",
      required: false,
      maxLength: 500,
      rows: 3,
      helpText:
        "Injuries, disability, age 65+, overweight 50+ lbs, or other conditions",
    },
    {
      kind: "checkbox",
      name: "officerDemonstrated",
      label: "The officer demonstrated the tests before I performed them",
    },
  ],
  "plea-consequences": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Original charge",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "pleaOfferCharge",
      label: "Plea offer charge",
      required: true,
      maxLength: 200,
      placeholder: "What charge are you being offered to plead to?",
    },
    {
      kind: "textarea",
      name: "pleaOfferTerms",
      label: "Plea offer terms",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText: "Sentence, probation length, conditions, etc.",
    },
    {
      kind: "text",
      name: "occupation",
      label: "Occupation",
      required: false,
      maxLength: 200,
    },
    {
      kind: "select",
      name: "immigrationStatus",
      label: "Immigration status",
      required: false,
      options: IMMIGRATION_STATUS,
      placeholder: "Select immigration status",
    },
    {
      kind: "checkbox",
      name: "hasLicense",
      label: "I hold a professional license",
    },
  ],
  "drug-test-reliability": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "testType",
      label: "Test type",
      required: false,
      options: TEST_TYPES,
      placeholder: "Select test type",
    },
    {
      kind: "text",
      name: "substanceIdentified",
      label: "Substance identified",
      required: true,
      maxLength: 200,
    },
    {
      kind: "checkbox",
      name: "confirmatoryTest",
      label: "A confirmatory (lab) test was performed",
    },
    {
      kind: "checkbox",
      name: "resultsDocs",
      label: "I received documentation of the test results",
    },
  ],
  "bail-hearing-prep": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "priorConvictions",
      label: "Prior convictions",
      required: false,
      options: PRIOR_CONVICTIONS,
      placeholder: "Select prior convictions",
    },
    {
      kind: "textarea",
      name: "communityTies",
      label: "Community ties",
      required: true,
      maxLength: 500,
      rows: 3,
      helpText:
        "Employment, family in area, how long at current address",
    },
    {
      kind: "textarea",
      name: "flightRiskFactors",
      label: "Flight risk factors",
      required: false,
      maxLength: 500,
      rows: 3,
      helpText:
        "Passport, prior FTAs, out-of-state connections, or 'none'",
    },
    {
      kind: "text",
      name: "currentBailAmount",
      label: "Current bail amount",
      required: false,
      maxLength: 100,
      placeholder: "Current bail amount if already set, or 'not yet set'",
    },
  ],
  "sentencing-prep": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "convictionMethod",
      label: "Conviction method",
      required: false,
      options: CONVICTION_METHODS,
      placeholder: "Select conviction method",
    },
    {
      kind: "text",
      name: "sentencingRange",
      label: "Sentencing range",
      required: false,
      maxLength: 100,
      placeholder: "If known, e.g., '5-15 years' or 'don't know'",
    },
    {
      kind: "select",
      name: "priorConvictions",
      label: "Prior convictions",
      required: false,
      options: PRIOR_CONVICTIONS,
      placeholder: "Select prior convictions",
    },
    {
      kind: "textarea",
      name: "mitigatingFactors",
      label: "Mitigating factors",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText:
        "Employment, family, treatment programs, military service, community involvement, education",
    },
  ],
  "family-case-research": [
    {
      kind: "select",
      name: "state",
      label: "State where the case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "relationshipToDefendant",
      label: "Your relationship to the defendant",
      required: true,
      maxLength: 100,
      placeholder: "e.g., Spouse, Parent, Sibling, Child",
    },
    {
      kind: "checkbox",
      name: "defendantInCustody",
      label: "The defendant is currently in custody",
    },
    {
      kind: "checkbox",
      name: "defendantHasAttorney",
      label: "The defendant has an attorney",
    },
    {
      kind: "select",
      name: "caseStage",
      label: "Current case stage",
      required: false,
      options: CASE_STAGES,
      placeholder: "Select case stage",
    },
  ],
  "arrest-report-review": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "reportDetails",
      label: "Arrest report details",
      required: true,
      maxLength: 800,
      rows: 6,
      helpText:
        "Key details from your arrest report, or paste the text. Include: date, location, officers involved, what happened according to the report.",
    },
  ],

  // ─── WAVE 2: LIFE-IMPACT PRODUCTS (updated with new fields) ─────────────────

  "collateral-consequences": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "offenseClass",
      label: "Offense class",
      required: false,
      options: OFFENSE_CLASS,
      placeholder: "Select offense class",
    },
    {
      kind: "text",
      name: "occupation",
      label: "Current occupation",
      required: false,
      maxLength: 200,
    },
    {
      kind: "checkbox",
      name: "hasLicense",
      label: "I hold a professional license",
    },
    {
      kind: "checkbox",
      name: "hasSecurityClearance",
      label: "I hold a security clearance",
    },
    {
      kind: "select",
      name: "immigrationStatus",
      label: "Immigration status",
      required: false,
      options: IMMIGRATION_STATUS,
      placeholder: "Select immigration status",
    },
    {
      kind: "checkbox",
      name: "hasChildren",
      label: "I have children under 18",
    },
  ],
  "license-risk": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "licenseType",
      label: "License type",
      required: true,
      options: LICENSE_TYPES,
      placeholder: "Select license type",
    },
    {
      kind: "text",
      name: "licensingBoard",
      label: "Licensing board",
      required: false,
      maxLength: 200,
      placeholder: "e.g., Florida Board of Nursing",
    },
    {
      kind: "checkbox",
      name: "priorDiscipline",
      label: "I have prior disciplinary actions on my license",
    },
    {
      kind: "checkbox",
      name: "boardNotified",
      label: "The licensing board has been notified of my charges",
    },
    {
      kind: "select",
      name: "chargeInvolves",
      label: "Charge involves",
      required: false,
      options: CHARGE_INVOLVES,
      placeholder: "Select what the charge involves",
    },
  ],
  "immigration-impact": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "immigrationStatus",
      label: "Immigration status",
      required: true,
      options: IMMIGRATION_STATUS,
      placeholder: "Select immigration status",
    },
    {
      kind: "text",
      name: "yearsInUS",
      label: "Years in the U.S.",
      required: false,
      maxLength: 20,
      placeholder: "e.g., 12 years",
    },
    {
      kind: "checkbox",
      name: "priorImmigrationViolations",
      label: "I have prior immigration violations",
    },
    {
      kind: "checkbox",
      name: "pendingPetition",
      label: "I have a pending immigration petition",
    },
  ],
  "security-clearance": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "clearanceLevel",
      label: "Clearance level",
      required: true,
      options: CLEARANCE_LEVELS,
      placeholder: "Select clearance level",
    },
    {
      kind: "text",
      name: "agency",
      label: "Agency / employer",
      required: false,
      maxLength: 200,
      placeholder: "e.g., DoD, NSA, contractor name",
    },
    {
      kind: "text",
      name: "lastInvestigation",
      label: "Last investigation date",
      required: false,
      maxLength: 50,
      placeholder: "e.g., March 2023",
    },
    {
      kind: "select",
      name: "selfReported",
      label: "Have you self-reported the charge?",
      required: false,
      options: SELF_REPORTED,
      placeholder: "Select ...",
    },
    {
      kind: "select",
      name: "chargeInvolves",
      label: "Charge involves",
      required: false,
      options: CHARGE_INVOLVES,
      placeholder: "Select what the charge involves",
    },
  ],
  "custody-impact": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "custodyStatus",
      label: "Current custody status",
      required: true,
      options: CUSTODY_STATUS,
      placeholder: "Select custody status",
    },
    {
      kind: "checkbox",
      name: "pendingFamilyCase",
      label: "I have a pending family court case",
    },
    {
      kind: "text",
      name: "childrenAges",
      label: "Children's ages",
      required: false,
      maxLength: 100,
      placeholder: "e.g., 3, 7, 12",
    },
    {
      kind: "checkbox",
      name: "otherParentAwareness",
      label: "The other parent is aware of the charges",
    },
    {
      kind: "select",
      name: "chargeInvolves",
      label: "Charge involves",
      required: false,
      options: CHARGE_INVOLVES,
      placeholder: "Select what the charge involves",
    },
  ],

  // ─── WAVE 3: POST-CONVICTION PRODUCTS ───────────────────────────────────────

  "expungement-research": [
    {
      kind: "select",
      name: "state",
      label: "State where the case was resolved",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "convictionOrDismissal",
      label: "Outcome",
      required: true,
      options: [
        { value: "conviction", label: "Conviction" },
        { value: "dismissal", label: "Dismissal" },
      ],
      placeholder: "Select outcome",
    },
    {
      kind: "text",
      name: "convictionDate",
      label: "Conviction / dismissal date",
      required: false,
      maxLength: 50,
      placeholder: "Approximate date, e.g., March 2020",
    },
    {
      kind: "checkbox",
      name: "sentenceCompleted",
      label: "I have completed my sentence",
    },
    {
      kind: "select",
      name: "priorConvictions",
      label: "Prior convictions",
      required: false,
      options: PRIOR_CONVICTIONS,
      placeholder: "Select prior convictions",
    },
    {
      kind: "checkbox",
      name: "probationCompleted",
      label: "I have completed probation/parole",
    },
  ],
  "sentence-reduction": [
    {
      kind: "select",
      name: "state",
      label: "State where you were sentenced",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "sentenceImposed",
      label: "Sentence imposed",
      required: true,
      maxLength: 200,
      placeholder: "e.g., 10 years state prison",
    },
    {
      kind: "text",
      name: "sentencingDate",
      label: "Sentencing date",
      required: false,
      maxLength: 50,
      placeholder: "e.g., January 2022",
    },
    {
      kind: "textarea",
      name: "basisForReduction",
      label: "Basis for reduction",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText:
        "New evidence, cooperation, guideline changes, health, age, rehabilitation",
    },
  ],
  "appeal-viability": [
    {
      kind: "select",
      name: "state",
      label: "State where you were convicted",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "convictionMethod",
      label: "Conviction method",
      required: false,
      options: CONVICTION_METHODS,
      placeholder: "Select conviction method",
    },
    {
      kind: "text",
      name: "appealGrounds",
      label: "Appeal grounds",
      required: true,
      maxLength: 300,
      placeholder: "e.g., ineffective counsel, prosecutorial misconduct, judicial error",
    },
    {
      kind: "select",
      name: "appealDeadlineStatus",
      label: "Appeal deadline status",
      required: false,
      options: APPEAL_DEADLINE_STATUS,
      placeholder: "Select deadline status",
    },
    {
      kind: "textarea",
      name: "trialIssues",
      label: "Trial issues",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "Describe the issues from your trial or plea that you believe were wrong",
    },
  ],
  "ineffective-counsel": [
    {
      kind: "select",
      name: "state",
      label: "State where your case was handled",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "issuesIdentified",
      label: "Issues with your attorney",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "What did your attorney fail to do? Missed deadlines, no communication, no motions filed, coerced plea, etc.",
    },
    {
      kind: "select",
      name: "caseOutcome",
      label: "Case outcome",
      required: false,
      options: CASE_OUTCOMES,
      placeholder: "Select case outcome",
    },
  ],

  // ─── WAVE 4: NET-NEW PRODUCTS (Reddit research) ────────────────────────────

  "attorney-performance-review": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "caseStage",
      label: "Current case stage",
      required: false,
      options: CASE_STAGES,
      placeholder: "Select case stage",
    },
    {
      kind: "textarea",
      name: "issuesIdentified",
      label: "Concerns about your attorney",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "What concerns do you have about your attorney's performance?",
    },
    {
      kind: "select",
      name: "communicationFrequency",
      label: "How often does your attorney communicate with you?",
      required: false,
      options: COMMUNICATION_FREQUENCY,
      placeholder: "Select communication frequency",
    },
  ],
  "probation-violation-response": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Original charge (that led to probation)",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "violationType",
      label: "Violation type",
      required: false,
      options: VIOLATION_TYPES,
      placeholder: "Select violation type",
    },
    {
      kind: "select",
      name: "priorViolations",
      label: "Prior probation violations",
      required: false,
      options: PRIOR_CONVICTIONS,
      placeholder: "Select prior violations",
    },
    {
      kind: "textarea",
      name: "probationConditions",
      label: "Probation conditions",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText:
        "List your probation conditions as you understand them",
    },
  ],
  "discovery-decoder": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "discoveryReceived",
      label: "Have you received discovery from the prosecution?",
      required: false,
      options: YES_NO_DONTKNOW,
      placeholder: "Select ...",
    },
    {
      kind: "textarea",
      name: "discoveryContents",
      label: "Discovery contents",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "What types of documents/evidence did you receive? Police reports, witness statements, lab results, video, etc.",
    },
  ],
  "constructive-possession": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "locationDescription",
      label: "Location description",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText:
        "Where were the items found? Your car, home, a friend's place, etc.",
    },
    {
      kind: "text",
      name: "proximityToContraband",
      label: "Proximity to contraband",
      required: true,
      maxLength: 200,
      placeholder: "How close were you to the items when found?",
    },
    {
      kind: "text",
      name: "ownershipOfLocation",
      label: "Ownership of location",
      required: true,
      maxLength: 200,
      placeholder: "Who owns/rents the location where items were found?",
    },
  ],
  "self-surrender-prep": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "surrenderDate",
      label: "Surrender date",
      required: false,
      maxLength: 50,
      placeholder: "When are you required to surrender? e.g., April 15, 2026",
    },
    {
      kind: "text",
      name: "surrenderLocation",
      label: "Surrender location",
      required: false,
      maxLength: 200,
      placeholder: "Where? e.g., county jail, federal facility",
    },
    {
      kind: "checkbox",
      name: "hasAttorney",
      label: "I have an attorney",
    },
  ],
  "probation-rights": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Original charge",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "probationConditions",
      label: "Current probation conditions",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText: "List your current probation conditions",
    },
    {
      kind: "textarea",
      name: "probationOfficerIssue",
      label: "Probation issue",
      required: true,
      maxLength: 800,
      rows: 4,
      helpText:
        "What specific issue are you having with probation?",
    },
  ],

  // ─── PRIORITY B, Critical 7 Worker Standalone Products ─────
  "plea-analyzer": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "pleaOfferDetails",
      label: "Plea offer details",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "Describe the plea offer, what charge(s) are they offering, what sentence, what conditions?",
    },
    {
      kind: "text",
      name: "originalCharges",
      label: "Original charges",
      required: true,
      maxLength: 200,
      placeholder: "What were you originally charged with?",
    },
    {
      kind: "text",
      name: "offeredCharges",
      label: "Offered charges",
      required: true,
      maxLength: 200,
      placeholder: "What charge(s) does the plea reduce to?",
    },
    {
      kind: "text",
      name: "sentencingExposure",
      label: "Sentencing exposure",
      required: false,
      maxLength: 200,
      placeholder: "Sentencing range if convicted at trial, if known",
    },
  ],
  "ach-matrix": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "knownEvidence",
      label: "Known evidence",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "List the key evidence in your case, physical evidence, witness statements, documents, test results",
    },
    {
      kind: "textarea",
      name: "alternativeExplanations",
      label: "Alternative explanations",
      required: false,
      maxLength: 800,
      rows: 4,
      helpText:
        "Any alternative explanations you or your attorney have discussed",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "Known facts",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "What happened? Include the prosecution's version and your version",
    },
  ],
  "adversarial-prosecution-sim": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "textarea",
      name: "defenseStrategy",
      label: "Defense strategy",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "What defense strategy is your attorney pursuing or considering?",
    },
    {
      kind: "textarea",
      name: "prosecutionTheory",
      label: "Prosecution theory",
      required: false,
      maxLength: 800,
      rows: 4,
      helpText:
        "What is the prosecution's theory of the case, as you understand it?",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "Known facts",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "Key facts of your case, what is disputed and what is not?",
    },
  ],
  "sentencing-intelligence": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "judgeName",
      label: "Judge name",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hon. Pat Siracusa",
      helpText:
        "Full name as it appears on your court paperwork",
    },
    {
      kind: "text",
      name: "county",
      label: "County",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County",
    },
    {
      kind: "select",
      name: "priorConvictions",
      label: "Prior convictions",
      required: false,
      options: PRIOR_CONVICTIONS,
      placeholder: "Select prior convictions",
    },
    {
      kind: "text",
      name: "currentSentencingRange",
      label: "Current sentencing range",
      required: false,
      maxLength: 200,
      placeholder: "If known, e.g., 5-15 years",
    },
  ],
  "daubert-challenge": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "expertName",
      label: "Expert witness name",
      required: true,
      maxLength: 200,
      placeholder: "Name of the prosecution's expert witness",
    },
    {
      kind: "text",
      name: "expertField",
      label: "Expert field",
      required: true,
      maxLength: 200,
      placeholder: "e.g., forensic toxicology, DNA analysis, digital forensics",
    },
    {
      kind: "textarea",
      name: "expertMethodology",
      label: "Expert methodology",
      required: false,
      maxLength: 800,
      rows: 4,
      helpText:
        "What methodology or technique will the expert use? Include any details from discovery",
    },
  ],
  "body-camera-analysis": [
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "mediaType",
      label: "Recording type",
      required: true,
      options: [
        { value: "bodycam", label: "Body Camera" },
        { value: "dashcam", label: "Dashboard Camera" },
        { value: "interview", label: "Interview Recording" },
        { value: "surveillance", label: "Surveillance Video" },
        { value: "other", label: "Other Recording" },
      ],
      placeholder: "Select recording type",
    },
    {
      kind: "textarea",
      name: "incidentDescription",
      label: "Incident description",
      required: true,
      maxLength: 800,
      rows: 5,
      helpText:
        "Describe the incident and what you believe the footage shows",
    },
    {
      kind: "textarea",
      name: "defenseTheory",
      label: "Defense theory",
      required: false,
      maxLength: 800,
      rows: 4,
      helpText:
        "What is the defense angle you want analyzed in the footage?",
    },
  ],

  // ─── COURT CASE PORT, WAVE 2+3 (ship dark via products.ts isActive=false) ──
  // trial-prep-package $1,997, Tier 2 Cross-Exam Library, requires War Room
  // case-law-intelligence $297, Tier 6 Case Law Enrichment
  // expert-witness-challenge $297, Tier 7 Witness Research, Daubert-focused
  // discovery-demand-letter $97, Tier 8B Misc High-Value, pre-discovery SKU

  "trial-prep-package": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "text",
      name: "trialDate",
      label: "Trial date",
      required: false,
      maxLength: 100,
      placeholder: "Optional, e.g., June 17, 2026",
      helpText:
        "Optional. If your trial date is set, include it so the package is sequenced for your timeline.",
    },
    {
      kind: "text",
      name: "caseTheme",
      label: "Case theme",
      required: false,
      maxLength: 200,
      placeholder: "Optional one-line case theme if you already have one",
      helpText:
        "Optional. The theme your defense is building around (e.g., \"the wrong place at the wrong time\"). Leave blank if you do not have one yet.",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "Known facts about your case",
      required: true,
      maxLength: 800,
      rows: 6,
      helpText:
        "Charge details, what the prosecution claims, and any contested facts. Up to 800 characters.",
    },
  ],
  "case-law-intelligence": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "select",
      name: "caseStage",
      label: "Current case stage",
      required: true,
      options: CASE_STAGES,
      placeholder: "Select case stage",
    },
    {
      kind: "text",
      name: "motionFocus",
      label: "Motion focus",
      required: false,
      maxLength: 200,
      placeholder: "Optional, e.g., suppression, dismissal, JOA",
      helpText:
        "Optional. If you want the case law analysis to focus on a specific motion type, name it here.",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "Known facts about your case",
      required: true,
      maxLength: 800,
      rows: 6,
      helpText:
        "Charge details, contested facts, and any case law your attorney has already mentioned. Up to 800 characters.",
    },
  ],
  "expert-witness-challenge": [
    {
      kind: "text",
      name: "expertName",
      label: "Expert witness name",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Dr. Jane Smith",
      helpText:
        "Full name of the expert witness the prosecution has named or is expected to call.",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "text",
      name: "expertField",
      label: "Expert's field",
      required: false,
      maxLength: 200,
      placeholder: "Optional, e.g., toxicology, forensic accounting, DNA",
      helpText:
        "Optional. The discipline or specialty the expert is being called to testify about.",
    },
    {
      kind: "textarea",
      name: "knownFacts",
      label: "What the expert is being called to testify about",
      required: true,
      maxLength: 800,
      rows: 6,
      helpText:
        "Brief description of the expert's expected testimony and what part of the prosecution case it supports.",
    },
  ],
  "discovery-demand-letter": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      required: true,
      options: CHARGE_TYPE_OPTIONS,
      placeholder: "Select charge type",
    },
    {
      kind: "select",
      name: "state",
      label: "State where your case is pending",
      required: true,
      options: US_STATES,
      placeholder: "Select state",
    },
    {
      kind: "text",
      name: "county",
      label: "County (or judicial district / federal district)",
      required: true,
      maxLength: 200,
      placeholder: "e.g., Hillsborough County, Middle District of Florida",
    },
    {
      kind: "text",
      name: "arrestDate",
      label: "Arrest date",
      required: false,
      maxLength: 50,
      placeholder: "Optional, e.g., March 12, 2026",
      helpText:
        "Optional. Helps frame the demand letter relative to your timeline.",
    },
    {
      kind: "textarea",
      name: "discoveryReceivedSoFar",
      label: "Discovery received so far",
      required: false,
      maxLength: 800,
      rows: 5,
      helpText:
        "Optional. List anything your attorney has already received (police reports, lab results, dashcam, witness statements). Leave blank if you have not received anything yet.",
    },
  ],

  // ─── Tier 9 Data-Driven Reports ─────────────────────────────
  "judge-report-card": [
    {
      kind: "text",
      name: "judgeName",
      label: "Judge's full name",
      required: true,
      maxLength: 100,
      placeholder: "e.g., Sarah Martinez",
      helpText:
        "Enter the full name of your assigned judge. We search verified court records for their sentencing patterns, motion rulings, and published opinions.",
    },
    {
      kind: "select",
      name: "state",
      label: "State",
      placeholder: "Select state",
      options: US_STATES,
      required: true,
    },
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      placeholder: "Select charge type",
      options: ALLOWED_CHARGE_TYPES.map((ct) => ({
        value: ct,
        label: ct.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
      required: true,
    },
  ],
  "officer-background-check": [
    {
      kind: "text",
      name: "officerName",
      label: "Officer's full name",
      required: true,
      maxLength: 100,
      placeholder: "e.g., John Smith",
      helpText:
        "Enter the full name of the arresting or testifying officer. We search cross-case court records for their testimony history and credibility challenges.",
    },
    {
      kind: "select",
      name: "state",
      label: "State",
      placeholder: "Select state",
      options: US_STATES,
      required: true,
    },
  ],
  "similar-cases-analyzer": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      placeholder: "Select charge type",
      options: ALLOWED_CHARGE_TYPES.map((ct) => ({
        value: ct,
        label: ct.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
      required: true,
    },
    {
      kind: "select",
      name: "state",
      label: "State",
      placeholder: "Select state",
      options: US_STATES,
      required: true,
    },
    // Optional USSC-matview fields grouped behind a collapsed <details>.
    // State-case users (80%+) don't see them. Federal-case users open the
    // group and answer 3 selects for sharper distribution data. Skipped
    // answers trigger progressive widening in the matview lookup.
    {
      kind: "optional-group",
      name: "ussc-federal-matching",
      summary: "Federal case? Add 3 optional details for sharper sentencing data",
      helpText:
        "If your case is federal (not state), these help match against 690,000 real federal sentences FY2014-FY2024 from the U.S. Sentencing Commission. Leave blank for state cases.",
      fields: [
        {
          kind: "select",
          name: "priorConvictions",
          label: "Prior convictions",
          placeholder: "Skip",
          options: [
            { value: "none", label: "None" },
            { value: "misdemeanor", label: "Misdemeanor(s) only" },
            { value: "felony", label: "One felony" },
            { value: "multiple", label: "Multiple felonies" },
            { value: "dont-know", label: "I don't know" },
          ],
          required: false,
        },
        {
          kind: "select",
          name: "citizenship",
          label: "Citizenship status",
          placeholder: "Skip",
          options: IMMIGRATION_STATUS,
          required: false,
        },
        {
          kind: "select",
          name: "ageBucket",
          label: "Age bracket",
          placeholder: "Skip",
          options: [
            { value: "<25", label: "Under 25" },
            { value: "25-34", label: "25-34" },
            { value: "35-44", label: "35-44" },
            { value: "45-54", label: "45-54" },
            { value: "55+", label: "55 or older" },
            { value: "prefer-not-to-say", label: "Prefer not to say" },
          ],
          required: false,
        },
        // Federal district cascade — options populate from ussc_districts
        // filtered by the top-level `state` field. Optional — skipping it
        // triggers district-agnostic widening in the matview lookup.
        {
          kind: "cascading-select",
          name: "district",
          label: "Federal district (if known)",
          placeholder: "Select district",
          required: false,
          dependsOn: "state",
          emptyDepLabel: "Pick your state above first",
          emptyOptionsLabel: "No federal districts found for this state",
          helpText: "Skip if unsure — leaving blank returns national averages.",
          endpoint: (stateVal: string) =>
            `/api/ussc-districts?state=${encodeURIComponent(stateVal)}`,
          parseOptions: (data: unknown) => {
            if (
              typeof data !== "object" ||
              data === null ||
              !("districts" in data) ||
              !Array.isArray((data as { districts: unknown }).districts)
            ) {
              return [];
            }
            const rows = (data as { districts: Array<{ district_code?: unknown; short_name?: unknown }> }).districts;
            return rows
              .filter(
                (r): r is { district_code: string; short_name: string } =>
                  typeof r.district_code === "string" && typeof r.short_name === "string",
              )
              .map((r) => ({ value: r.district_code, label: r.short_name }));
          },
        },
      ],
    },
  ],
  "federal-sentencing-distribution": [
    {
      kind: "select",
      name: "chargeType",
      label: "Charge type",
      placeholder: "Select charge type",
      options: ALLOWED_CHARGE_TYPES.map((ct) => ({
        value: ct,
        label: ct.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
      required: true,
    },
    {
      kind: "select",
      name: "state",
      label: "State (where case is pending)",
      placeholder: "Select state",
      options: US_STATES,
      required: true,
    },
    {
      kind: "cascading-select",
      name: "district",
      label: "Federal district (if known)",
      placeholder: "Select district",
      required: false,
      dependsOn: "state",
      emptyDepLabel: "Pick your state above first",
      emptyOptionsLabel: "No federal districts found for this state",
      helpText:
        "Skip if unsure — leaving blank returns national averages for your offense.",
      endpoint: (stateVal: string) =>
        `/api/ussc-districts?state=${encodeURIComponent(stateVal)}`,
      parseOptions: (data: unknown) => {
        if (
          typeof data !== "object" ||
          data === null ||
          !("districts" in data) ||
          !Array.isArray((data as { districts: unknown }).districts)
        ) {
          return [];
        }
        const rows = (data as { districts: Array<{ district_code?: unknown; short_name?: unknown }> }).districts;
        return rows
          .filter(
            (r): r is { district_code: string; short_name: string } =>
              typeof r.district_code === "string" && typeof r.short_name === "string",
          )
          .map((r) => ({ value: r.district_code, label: r.short_name }));
      },
    },
    {
      kind: "select",
      name: "priorConvictions",
      label: "Prior convictions",
      placeholder: "Select",
      required: true,
      options: [
        { value: "none", label: "None" },
        { value: "misdemeanor", label: "Misdemeanor(s) only" },
        { value: "felony", label: "One felony" },
        { value: "multiple", label: "Multiple felonies" },
        { value: "dont-know", label: "I don't know" },
      ],
    },
    {
      kind: "select",
      name: "criminalHistoryCategory",
      label: "USSC Criminal History Category (if known)",
      placeholder: "Skip — derive from priors",
      required: false,
      options: [
        { value: "1", label: "Category I (0-1 points)" },
        { value: "2", label: "Category II (2-3 points)" },
        { value: "3", label: "Category III (4-6 points)" },
        { value: "4", label: "Category IV (7-9 points)" },
        { value: "5", label: "Category V (10-12 points)" },
        { value: "6", label: "Category VI (13+ points, career offender)" },
      ],
    },
  ],
};

// ─── Bundle FIELD_SETS, computed from included products ──────
// Deduplicates by field name (first occurrence wins), preserving order.
function mergeFieldSets(...slugs: string[]): FieldConfig[] {
  const seen = new Set<string>();
  const merged: FieldConfig[] = [];
  for (const s of slugs) {
    const fields = FIELD_SETS[s];
    if (!fields) continue;
    for (const field of fields) {
      if (!seen.has(field.name)) {
        seen.add(field.name);
        merged.push(field);
      }
    }
  }
  return merged;
}

FIELD_SETS["first-72-hours"] = mergeFieldSets(
  "arrest-report-review",
  "bail-hearing-prep",
);
FIELD_SETS["defense-preparation"] = mergeFieldSets(
  "breathalyzer-challenge",
  "fst-review",
  "drug-test-reliability",
  "arrest-report-review",
);
FIELD_SETS["pre-plea-package"] = mergeFieldSets(
  "plea-consequences",
  "collateral-consequences",
  "sentencing-prep",
);

interface Props {
  slug: string;
  productName: string;
  token: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";
type FormValue = string | boolean;

/**
 * Recursively flatten FIELD_SETS so that fields nested inside an
 * optional-group still get state initialization + required-field checks.
 */
function flattenLeafFields(configs: FieldConfig[]): FieldConfig[] {
  const out: FieldConfig[] = [];
  for (const f of configs) {
    if (f.kind === "optional-group") {
      out.push(...flattenLeafFields(f.fields));
    } else {
      out.push(f);
    }
  }
  return out;
}

export default function IntakeFormClient({ slug, productName, token }: Props) {
  // Resolve the field set for this slug. If the slug has no config we
  // bail to an empty array, the parent page.tsx already 404s on invalid
  // slugs, so this is purely a defensive default.
  const fields = useMemo<FieldConfig[]>(
    () => FIELD_SETS[slug] || [],
    [slug]
  );

  // Flattened view — includes leaves inside optional-group wrappers.
  const leafFields = useMemo<FieldConfig[]>(
    () => flattenLeafFields(fields),
    [fields]
  );

  // Single record-shaped state initialised from the flattened field config.
  // Checkboxes start false; everything else starts as empty string.
  const [formData, setFormData] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(
      leafFields.map((f) => [f.name, f.kind === "checkbox" ? false : ""])
    )
  );

  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const errorRef = useRef<HTMLDivElement>(null);

  // Cascading-select option cache + loading flags. Keyed by field name so
  // multiple cascading fields on the same form each own their own state.
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, SelectOption[]>>({});
  const [dynamicLoading, setDynamicLoading] = useState<Record<string, boolean>>({});

  function setField(name: string, value: FormValue) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  // Watch every cascading-select field's dep value. On change:
  //   (a) reset the cascading field's own value (stale selection invalid)
  //   (b) clear any prior fetched options
  //   (c) if the new dep value is non-empty, fetch fresh options
  // AbortController prevents late responses from overwriting post-navigate
  // state.
  const cascadingFields = useMemo(
    () =>
      leafFields.filter(
        (f): f is Extract<FieldConfig, { kind: "cascading-select" }> =>
          f.kind === "cascading-select",
      ),
    [leafFields],
  );
  const depSignature = cascadingFields
    .map((f) => `${f.name}:${String(formData[f.dependsOn] ?? "")}`)
    .join("|");
  // Failure surface: when fetch fails (network, non-2xx, parse error) we
  // flip an amber warning state so the customer knows to retry rather than
  // silently rendering "No districts for this state" — which would mislead
  // users into thinking their state has no federal districts.
  const [dynamicError, setDynamicError] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const controllers: AbortController[] = [];
    for (const field of cascadingFields) {
      const depValue = String(formData[field.dependsOn] ?? "");
      // Reset state only when we actually have something to do — skipping
      // empty-dep idle mount-time resets avoids 2 redundant re-renders.
      if (!depValue) {
        if ((formData[field.name] ?? "") !== "") setField(field.name, "");
        setDynamicOptions((prev) => (prev[field.name] ? { ...prev, [field.name]: [] } : prev));
        setDynamicError((prev) => (prev[field.name] ? { ...prev, [field.name]: null } : prev));
        continue;
      }
      // Real dep change — clear stale cascading value + options + error.
      setField(field.name, "");
      setDynamicOptions((prev) => ({ ...prev, [field.name]: [] }));
      setDynamicError((prev) => ({ ...prev, [field.name]: null }));
      const ctl = new AbortController();
      controllers.push(ctl);
      setDynamicLoading((prev) => ({ ...prev, [field.name]: true }));
      fetch(field.endpoint(depValue), { signal: ctl.signal })
        .then(async (res) => {
          // Race-safe: if this fetch was aborted before the response came
          // back, a newer effect run is already in flight — do NOT touch
          // the loading flag or options, the newer run owns them now.
          if (ctl.signal.aborted) return;
          if (!res.ok) {
            setDynamicError((prev) => ({
              ...prev,
              [field.name]: "Couldn't load options. Try selecting your state again.",
            }));
            setDynamicLoading((prev) => ({ ...prev, [field.name]: false }));
            return;
          }
          const data = await res.json();
          const opts = field.parseOptions(data);
          setDynamicOptions((prev) => ({ ...prev, [field.name]: opts }));
          setDynamicLoading((prev) => ({ ...prev, [field.name]: false }));
        })
        .catch((err) => {
          if (ctl.signal.aborted || err?.name === "AbortError") return;
          console.error(`[intake-form] cascading-select fetch failed for ${field.name}:`, err);
          setDynamicError((prev) => ({
            ...prev,
            [field.name]: "Couldn't load options. Check your connection and retry.",
          }));
          setDynamicLoading((prev) => ({ ...prev, [field.name]: false }));
        });
    }
    return () => {
      for (const ctl of controllers) ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depSignature]);

  // Submit-enabled when every required field has a non-empty value.
  // Optional fields are skipped. Booleans are always considered "filled".
  const canSubmit = leafFields.every((f) => {
    if (f.kind === "checkbox") return true;
    if (f.kind === "optional-group") return true;
    if (!f.required) return true;
    const v = formData[f.name];
    return typeof v === "string" && v.trim().length > 0;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/intake/standalone/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...formData }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        // Move focus to error message for screen readers
        setTimeout(() => errorRef.current?.focus(), 100);
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage(
        "Network error. Please check your connection and try again."
      );
      setTimeout(() => errorRef.current?.focus(), 100);
    }
  }

  if (status === "success") {
    return (
      <div
        className="bg-green-950/30 border border-green-800 rounded-lg p-8 text-center"
        role="status"
        aria-live="polite"
      >
        <h2 className="text-xl font-bold text-green-400 mb-3">
          Your {productName} is being generated
        </h2>
        <p className="text-zinc-300">
          You&apos;ll receive an email within 60 seconds with a link to view
          your report.
        </p>
      </div>
    );
  }

  const selectClass =
    "w-full bg-zinc-900 border border-zinc-600 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";

  // Group checkboxes for fieldset/legend rendering. Checkboxes live at the
  // top level only — optional-group wrappers never contain them.
  const checkboxFields = fields.filter((f) => f.kind === "checkbox");
  const nonCheckboxFields = fields.filter((f) => f.kind !== "checkbox");

  /**
   * Render a single leaf field (select/text/textarea). Used both by the
   * top-level render loop and by the optional-group branch.
   */
  function renderLeafField(field: FieldConfig): React.ReactElement | null {
    const id = `intake-${field.name}`;
    const helpId = `${id}-help`;
    const countId = `${id}-count`;

    if (field.kind === "select") {
      return (
        <div key={field.name}>
          <label htmlFor={id} className={labelClass}>
            {field.label}{" "}
            {field.required && (
              <span className="text-red-400" aria-hidden="true">*</span>
            )}
          </label>
          <select
            id={id}
            value={String(formData[field.name] || "")}
            onChange={(e) => setField(field.name, e.target.value)}
            required={field.required}
            aria-required={field.required || undefined}
            className={selectClass}
          >
            <option value="">{field.placeholder || "Select"}</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );
    }
    if (field.kind === "text") {
      return (
        <div key={field.name}>
          <label htmlFor={id} className={labelClass}>
            {field.label}{" "}
            {field.required && (
              <span className="text-red-400" aria-hidden="true">*</span>
            )}
          </label>
          {field.helpText && (
            <p id={helpId} className="text-xs text-zinc-400 mb-1.5">{field.helpText}</p>
          )}
          <input
            id={id}
            type="text"
            value={String(formData[field.name] || "")}
            onChange={(e) => setField(field.name, e.target.value)}
            required={field.required}
            aria-required={field.required || undefined}
            aria-describedby={field.helpText ? helpId : undefined}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            className={selectClass}
          />
        </div>
      );
    }
    if (field.kind === "textarea") {
      const value = String(formData[field.name] || "");
      const remaining = field.maxLength - value.length;
      const overLimit = remaining < 0;
      const nearLimit = remaining <= 50 && remaining >= 0;
      const counterColor = overLimit
        ? "text-red-400"
        : nearLimit
        ? "text-amber-400"
        : "text-zinc-500";
      return (
        <div key={field.name}>
          <label htmlFor={id} className={labelClass}>
            {field.label}{" "}
            {field.required && (
              <span className="text-red-400" aria-hidden="true">*</span>
            )}
          </label>
          {field.helpText && (
            <p id={helpId} className="text-xs text-zinc-400 mb-1.5">{field.helpText}</p>
          )}
          <textarea
            id={id}
            value={value}
            onChange={(e) => setField(field.name, e.target.value)}
            required={field.required}
            aria-required={field.required || undefined}
            aria-describedby={`${field.helpText ? helpId + " " : ""}${countId}`}
            maxLength={field.maxLength + 200}
            rows={field.rows}
            className={selectClass}
          />
          <p id={countId} aria-live="polite" aria-atomic="true" className={`text-xs mt-1 ${counterColor}`}>
            {value.length} / {field.maxLength} characters
            {overLimit ? ` (${-remaining} over limit)` : ""}
          </p>
        </div>
      );
    }
    if (field.kind === "cascading-select") {
      const depValue = String(formData[field.dependsOn] ?? "");
      const opts = dynamicOptions[field.name] ?? [];
      const isLoading = dynamicLoading[field.name] ?? false;
      const fetchError = dynamicError[field.name] ?? null;
      const isDepEmpty = depValue === "";
      // Empty-options label generic fallback: cascading-select may grow
      // non-district uses (county, court, etc.) — swap in future config.
      const emptyOptionsLabel = field.emptyOptionsLabel ?? "No options for this selection";
      const placeholder = isDepEmpty
        ? field.emptyDepLabel
        : isLoading
          ? "Loading…"
          : fetchError
            ? "Failed to load — see error below"
            : opts.length === 0
              ? emptyOptionsLabel
              : field.placeholder || "Select";
      const errorId = `${id}-error`;
      return (
        <div key={field.name}>
          <label htmlFor={id} className={labelClass}>
            {field.label}{" "}
            {field.required && (
              <span className="text-red-400" aria-hidden="true">*</span>
            )}
          </label>
          {field.helpText && (
            <p id={helpId} className="text-xs text-zinc-400 mb-1.5">{field.helpText}</p>
          )}
          <select
            id={id}
            value={String(formData[field.name] || "")}
            onChange={(e) => setField(field.name, e.target.value)}
            required={field.required}
            aria-required={field.required || undefined}
            aria-describedby={[
              field.helpText ? helpId : null,
              fetchError ? errorId : null,
            ].filter(Boolean).join(" ") || undefined}
            aria-busy={isLoading || undefined}
            disabled={isDepEmpty || isLoading || (opts.length === 0 && !fetchError)}
            className={selectClass}
          >
            <option value="">{placeholder}</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {fetchError && (
            <p
              id={errorId}
              className="text-xs text-amber-400 mt-1.5"
              role="alert"
              aria-live="polite"
            >
              {fetchError}
            </p>
          )}
        </div>
      );
    }
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={`Intake form for ${productName}`}
    >
      {/* Error summary, announced to screen readers */}
      {status === "error" && errorMessage && (
        <div
          ref={errorRef}
          className="mb-6 bg-red-950/30 border border-red-800 rounded-lg p-4"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
        >
          <p className="text-red-400 font-medium">{errorMessage}</p>
        </div>
      )}

      <div className="space-y-6">
        {nonCheckboxFields.map((field) => {
          const id = `intake-${field.name}`;
          const helpId = `${id}-help`;
          const countId = `${id}-count`;

          if (field.kind === "optional-group") {
            return (
              <details
                key={field.name}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg"
              >
                <summary className="cursor-pointer p-4 text-sm font-medium text-zinc-300 hover:text-zinc-100 min-h-[44px]">
                  {field.summary}
                </summary>
                <div className="border-t border-zinc-800 p-4 space-y-4">
                  {field.helpText && (
                    <p className="text-xs text-zinc-400">{field.helpText}</p>
                  )}
                  {field.fields.map((nested) => renderLeafField(nested))}
                </div>
              </details>
            );
          }

          if (field.kind === "select") {
            return (
              <div key={field.name}>
                <label htmlFor={id} className={labelClass}>
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>
                <select
                  id={id}
                  value={String(formData[field.name] || "")}
                  onChange={(e) => setField(field.name, e.target.value)}
                  required={field.required}
                  aria-required={field.required || undefined}
                  className={selectClass}
                >
                  <option value="">{field.placeholder || "Select"}</option>
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.kind === "text") {
            return (
              <div key={field.name}>
                <label htmlFor={id} className={labelClass}>
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>
                {field.helpText && (
                  <p id={helpId} className="text-xs text-zinc-400 mb-1.5">
                    {field.helpText}
                  </p>
                )}
                <input
                  id={id}
                  type="text"
                  value={String(formData[field.name] || "")}
                  onChange={(e) => setField(field.name, e.target.value)}
                  required={field.required}
                  aria-required={field.required || undefined}
                  aria-describedby={field.helpText ? helpId : undefined}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  className={selectClass}
                />
              </div>
            );
          }

          if (field.kind === "textarea") {
            const value = String(formData[field.name] || "");
            const remaining = field.maxLength - value.length;
            const overLimit = remaining < 0;
            const nearLimit = remaining <= 50 && remaining >= 0;
            const counterColor = overLimit
              ? "text-red-400"
              : nearLimit
              ? "text-amber-400"
              : "text-zinc-500";

            return (
              <div key={field.name}>
                <label htmlFor={id} className={labelClass}>
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-red-400" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>
                {field.helpText && (
                  <p id={helpId} className="text-xs text-zinc-400 mb-1.5">
                    {field.helpText}
                  </p>
                )}
                <textarea
                  id={id}
                  value={value}
                  onChange={(e) => setField(field.name, e.target.value)}
                  required={field.required}
                  aria-required={field.required || undefined}
                  aria-describedby={
                    field.helpText ? `${helpId} ${countId}` : countId
                  }
                  aria-invalid={overLimit ? "true" : undefined}
                  maxLength={field.maxLength}
                  rows={field.rows}
                  className={`${selectClass} resize-y`}
                />
                <div
                  id={countId}
                  className={`mt-1 text-xs ${counterColor}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {remaining >= 0
                    ? `${remaining} characters remaining`
                    : `${Math.abs(remaining)} characters over limit`}
                </div>
              </div>
            );
          }

          // cascading-select rendering (top-level use case). The nested
          // variant inside optional-group lands via renderLeafField.
          if (field.kind === "cascading-select") {
            return renderLeafField(field);
          }

          return null;
        })}

        {/* Boolean fields grouped in a fieldset (only if any exist) */}
        {checkboxFields.length > 0 && (
          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-zinc-300 mb-2">
              Additional details
            </legend>
            {checkboxFields.map((field) => (
              <label
                key={field.name}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData[field.name])}
                  onChange={(e) => setField(field.name, e.target.checked)}
                  className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-zinc-300">{field.label}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "submitting" || !canSubmit}
        className="mt-8 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors"
        aria-busy={status === "submitting"}
      >
        {status === "submitting"
          ? "Generating your report..."
          : "Generate My Report"}
      </button>

      {/* UPL disclaimer */}
      <p className="mt-4 text-xs text-zinc-400">
        This report provides legal INFORMATION, not legal ADVICE. Your
        attorney remains the final authority on strategy decisions.
      </p>
    </form>
  );
}
