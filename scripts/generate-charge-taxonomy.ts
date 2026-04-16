/**
 * Charge Taxonomy Data Generation Script
 *
 * Generates the master charge list, submits API requests for all 52 jurisdictions,
 * generates charge questions, and validates output.
 *
 * Commands:
 *   npx tsx scripts/generate-charge-taxonomy.ts --all                        # All 52 jurisdictions + questions
 *   npx tsx scripts/generate-charge-taxonomy.ts --jurisdiction FL            # Single jurisdiction
 *   npx tsx scripts/generate-charge-taxonomy.ts --questions                  # Generate questions only
 *   npx tsx scripts/generate-charge-taxonomy.ts --validate                   # Validate output
 *   npx tsx scripts/generate-charge-taxonomy.ts --dry-run --jurisdiction FL  # Print prompt, no API call
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// Claude Code session wrapper, runs under local `claude -p` CLI, no API credits.
import { callClaude } from "./lib/blog-gen/claude-client.mjs";

// ── Setup ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "charge-taxonomy");

// Load .env.local / .env
function loadEnvFile(filepath: string): void {
  if (!fs.existsSync(filepath)) return;
  const lines = fs.readFileSync(filepath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));
loadEnvFile(path.join(PROJECT_ROOT, ".env"));

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommonChargeDefinition {
  slug: string;
  label: string;
  categorySlug: string;
  ncicCode: string | null;
  description: string;
  severityRange: string;
  isFederal: boolean;
  isState: boolean;
  legacySlugs: string[];
  sortOrder: number;
}

interface JurisdictionStatute {
  common_charge_slug: string;
  statute_number: string;
  statute_title: string;
  offense_class: string;
  penalty_min: string | null;
  penalty_max: string;
  fine_max: string | null;
  elements: string[];
  mandatory_minimum: string | null;
  enhancements: string[];
  notes: string | null;
}

interface ChargeQuestion {
  slug: string;
  question_key: string;
  question_text: string;
  answer_type: "single" | "multi" | "text" | "boolean";
  options: Array<{ value: string; label: string }> | null;
  sort_order: number;
}

// ── Jurisdiction List ─────────────────────────────────────────────────────────

const JURISDICTIONS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" },
  { code: "federal", name: "Federal (United States)" },
] as const;

// ── Common Charges ────────────────────────────────────────────────────────────

export const COMMON_CHARGES: readonly CommonChargeDefinition[] = [
  // ── DUI & Driving (dui-driving) ──────────────────────────────────────────
  {
    slug: "dui-dwi",
    label: "DUI / DWI",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "Driving under the influence of alcohol or drugs",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["dui"],
    sortOrder: 100,
  },
  {
    slug: "dui-first-offense",
    label: "DUI, First Offense",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "First-time DUI/DWI with no prior convictions",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: ["dui-first"],
    sortOrder: 101,
  },
  {
    slug: "dui-repeat-offense",
    label: "DUI, Repeat Offense",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "DUI/DWI with prior DUI conviction(s)",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["dui-repeat"],
    sortOrder: 102,
  },
  {
    slug: "dui-drugs",
    label: "DUI, Drugs (DUID)",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "Driving under the influence of controlled substances",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 103,
  },
  {
    slug: "reckless-driving",
    label: "Reckless Driving",
    categorySlug: "dui-driving",
    ncicCode: "5408",
    description: "Operating a vehicle with willful disregard for safety",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 104,
  },
  {
    slug: "hit-and-run",
    label: "Hit and Run",
    categorySlug: "dui-driving",
    ncicCode: "5407",
    description: "Leaving the scene of an accident without stopping",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 105,
  },
  {
    slug: "vehicular-homicide",
    label: "Vehicular Homicide",
    categorySlug: "dui-driving",
    ncicCode: "0910",
    description: "Causing death of another while operating a vehicle",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 106,
  },
  {
    slug: "vehicular-manslaughter",
    label: "Vehicular Manslaughter",
    categorySlug: "dui-driving",
    ncicCode: "0910",
    description: "Negligent or grossly negligent homicide by vehicle",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 107,
  },
  {
    slug: "driving-on-suspended",
    label: "Driving on Suspended License",
    categorySlug: "dui-driving",
    ncicCode: "5412",
    description: "Operating a vehicle with a suspended or revoked license",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 108,
  },
  {
    slug: "fleeing-eluding",
    label: "Fleeing / Eluding Police",
    categorySlug: "dui-driving",
    ncicCode: "5406",
    description: "Fleeing or attempting to elude law enforcement",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 109,
  },
  {
    slug: "racing-speed-contest",
    label: "Racing / Speed Contest",
    categorySlug: "dui-driving",
    ncicCode: "5410",
    description: "Engaging in a speed contest or drag racing on public roads",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 110,
  },
  {
    slug: "open-container",
    label: "Open Container",
    categorySlug: "dui-driving",
    ncicCode: "5414",
    description: "Possessing an open container of alcohol in a vehicle",
    severityRange: "Infraction to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 111,
  },
  {
    slug: "refusing-breath-test",
    label: "Refusing Breath / Chemical Test",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "Refusal to submit to a lawfully requested chemical test",
    severityRange: "Civil to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 112,
  },

  // ── Drug Offenses (drug-offenses) ─────────────────────────────────────────
  {
    slug: "drug-possession",
    label: "Drug Possession",
    categorySlug: "drug-offenses",
    ncicCode: "3599",
    description: "Unlawful possession of a controlled substance",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["drug", "drug-possession"],
    sortOrder: 200,
  },
  {
    slug: "drug-possession-marijuana",
    label: "Drug Possession, Marijuana",
    categorySlug: "drug-offenses",
    ncicCode: "3562",
    description: "Unlawful possession of marijuana/cannabis",
    severityRange: "Infraction to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 201,
  },
  {
    slug: "drug-possession-cocaine",
    label: "Drug Possession, Cocaine",
    categorySlug: "drug-offenses",
    ncicCode: "3563",
    description: "Unlawful possession of cocaine or crack cocaine",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 202,
  },
  {
    slug: "drug-possession-meth",
    label: "Drug Possession, Methamphetamine",
    categorySlug: "drug-offenses",
    ncicCode: "3564",
    description: "Unlawful possession of methamphetamine",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 203,
  },
  {
    slug: "drug-possession-opioids",
    label: "Drug Possession, Opioids",
    categorySlug: "drug-offenses",
    ncicCode: "3565",
    description: "Unlawful possession of heroin, fentanyl, or other opioids",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 204,
  },
  {
    slug: "drug-possession-prescription",
    label: "Drug Possession, Prescription (Without Rx)",
    categorySlug: "drug-offenses",
    ncicCode: "3566",
    description: "Possession of prescription drugs without a valid prescription",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 205,
  },
  {
    slug: "drug-trafficking",
    label: "Drug Trafficking",
    categorySlug: "drug-offenses",
    ncicCode: "3570",
    description: "Trafficking in controlled substances at threshold quantities",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: ["drug-trafficking"],
    sortOrder: 206,
  },
  {
    slug: "drug-distribution",
    label: "Drug Distribution / Sale",
    categorySlug: "drug-offenses",
    ncicCode: "3571",
    description: "Sale or distribution of controlled substances",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 207,
  },
  {
    slug: "drug-manufacturing",
    label: "Drug Manufacturing",
    categorySlug: "drug-offenses",
    ncicCode: "3572",
    description: "Manufacturing or producing controlled substances",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 208,
  },
  {
    slug: "drug-paraphernalia",
    label: "Drug Paraphernalia",
    categorySlug: "drug-offenses",
    ncicCode: "3573",
    description: "Possession of drug paraphernalia",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 209,
  },
  {
    slug: "prescription-fraud",
    label: "Prescription Fraud",
    categorySlug: "drug-offenses",
    ncicCode: "3574",
    description: "Fraudulent procurement or alteration of a prescription",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 210,
  },
  {
    slug: "drug-possession-with-intent",
    label: "Drug Possession With Intent to Distribute",
    categorySlug: "drug-offenses",
    ncicCode: "3575",
    description: "Possession of controlled substances with intent to sell or distribute",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 211,
  },

  // ── Violent Crimes (violent-crimes) ───────────────────────────────────────
  {
    slug: "murder-first-degree",
    label: "Murder, First Degree",
    categorySlug: "violent-crimes",
    ncicCode: "0902",
    description: "Premeditated and deliberate killing of another person",
    severityRange: "Felony (Capital)",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 300,
  },
  {
    slug: "murder-second-degree",
    label: "Murder, Second Degree",
    categorySlug: "violent-crimes",
    ncicCode: "0903",
    description: "Non-premeditated intentional killing of another person",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 301,
  },
  {
    slug: "voluntary-manslaughter",
    label: "Voluntary Manslaughter",
    categorySlug: "violent-crimes",
    ncicCode: "0904",
    description: "Intentional killing in the heat of passion without premeditation",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 302,
  },
  {
    slug: "involuntary-manslaughter",
    label: "Involuntary Manslaughter",
    categorySlug: "violent-crimes",
    ncicCode: "0905",
    description: "Unintentional killing resulting from recklessness or negligence",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 303,
  },
  {
    slug: "aggravated-assault",
    label: "Aggravated Assault",
    categorySlug: "violent-crimes",
    ncicCode: "1302",
    description: "Assault with a deadly weapon or with intent to cause serious injury",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 304,
  },
  {
    slug: "simple-assault",
    label: "Simple Assault",
    categorySlug: "violent-crimes",
    ncicCode: "1301",
    description: "Intentional act causing apprehension of harmful or offensive contact",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: ["assault"],
    sortOrder: 305,
  },
  {
    slug: "battery",
    label: "Battery",
    categorySlug: "violent-crimes",
    ncicCode: "1303",
    description: "Unlawful physical contact with another person",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 306,
  },
  {
    slug: "aggravated-battery",
    label: "Aggravated Battery",
    categorySlug: "violent-crimes",
    ncicCode: "1304",
    description: "Battery causing great bodily harm or committed with a weapon",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 307,
  },
  {
    slug: "robbery",
    label: "Robbery",
    categorySlug: "violent-crimes",
    ncicCode: "1201",
    description: "Taking property from a person by force or threat of force",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["robbery"],
    sortOrder: 308,
  },
  {
    slug: "armed-robbery",
    label: "Armed Robbery",
    categorySlug: "violent-crimes",
    ncicCode: "1202",
    description: "Robbery committed while armed with a deadly weapon",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 309,
  },
  {
    slug: "kidnapping",
    label: "Kidnapping",
    categorySlug: "violent-crimes",
    ncicCode: "1001",
    description: "Unlawful confinement or movement of a person against their will",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 310,
  },
  {
    slug: "arson",
    label: "Arson",
    categorySlug: "violent-crimes",
    ncicCode: "2001",
    description: "Intentional or malicious burning of property or structure",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 311,
  },
  {
    slug: "attempted-murder",
    label: "Attempted Murder",
    categorySlug: "violent-crimes",
    ncicCode: "0906",
    description: "Attempting to kill another person with premeditation",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 312,
  },
  {
    slug: "assault-with-deadly-weapon",
    label: "Assault With a Deadly Weapon",
    categorySlug: "violent-crimes",
    ncicCode: "1305",
    description: "Assault committed with a deadly weapon or instrument",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 313,
  },

  // ── Property Crimes (property-crimes) ─────────────────────────────────────
  {
    slug: "theft-larceny",
    label: "Theft / Larceny",
    categorySlug: "property-crimes",
    ncicCode: "2399",
    description: "Unlawful taking or carrying away of another's property",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["theft"],
    sortOrder: 400,
  },
  {
    slug: "grand-theft",
    label: "Grand Theft",
    categorySlug: "property-crimes",
    ncicCode: "2304",
    description: "Theft of property exceeding the statutory felony threshold",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 401,
  },
  {
    slug: "petty-theft",
    label: "Petty Theft",
    categorySlug: "property-crimes",
    ncicCode: "2303",
    description: "Theft of property below the statutory felony threshold",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 402,
  },
  {
    slug: "shoplifting",
    label: "Shoplifting",
    categorySlug: "property-crimes",
    ncicCode: "2305",
    description: "Theft of merchandise from a retail establishment",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 403,
  },
  {
    slug: "burglary",
    label: "Burglary",
    categorySlug: "property-crimes",
    ncicCode: "2201",
    description: "Unlawful entry into a structure with intent to commit a crime",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["burglary"],
    sortOrder: 404,
  },
  {
    slug: "residential-burglary",
    label: "Residential Burglary",
    categorySlug: "property-crimes",
    ncicCode: "2202",
    description: "Burglary of a dwelling, home, or inhabited structure",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 405,
  },
  {
    slug: "commercial-burglary",
    label: "Commercial Burglary",
    categorySlug: "property-crimes",
    ncicCode: "2203",
    description: "Burglary of a commercial building or business",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 406,
  },
  {
    slug: "motor-vehicle-theft",
    label: "Motor Vehicle Theft",
    categorySlug: "property-crimes",
    ncicCode: "2401",
    description: "Theft or unauthorized taking of a motor vehicle",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 407,
  },
  {
    slug: "receiving-stolen-property",
    label: "Receiving Stolen Property",
    categorySlug: "property-crimes",
    ncicCode: "2801",
    description: "Knowingly receiving, buying, or possessing stolen property",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 408,
  },
  {
    slug: "vandalism",
    label: "Vandalism / Criminal Damage",
    categorySlug: "property-crimes",
    ncicCode: "2901",
    description: "Intentional destruction or defacement of another's property",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 409,
  },
  {
    slug: "trespassing",
    label: "Trespassing",
    categorySlug: "property-crimes",
    ncicCode: "2902",
    description: "Entering or remaining on another's property without permission",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 410,
  },
  {
    slug: "criminal-mischief",
    label: "Criminal Mischief",
    categorySlug: "property-crimes",
    ncicCode: "2903",
    description: "Willful damage or destruction of property",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 411,
  },

  // ── Domestic & Family (domestic-family) ───────────────────────────────────
  {
    slug: "domestic-violence",
    label: "Domestic Violence",
    categorySlug: "domestic-family",
    ncicCode: "1399",
    description: "Violence or abuse against a current or former intimate partner",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["domestic-violence"],
    sortOrder: 500,
  },
  {
    slug: "domestic-battery",
    label: "Domestic Battery",
    categorySlug: "domestic-family",
    ncicCode: "1398",
    description: "Battery committed against a household or family member",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 501,
  },
  {
    slug: "child-endangerment",
    label: "Child Endangerment",
    categorySlug: "domestic-family",
    ncicCode: "1399",
    description: "Placing a child in a situation that endangers their health or safety",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 502,
  },
  {
    slug: "child-abuse",
    label: "Child Abuse",
    categorySlug: "domestic-family",
    ncicCode: "1397",
    description: "Physical, emotional, or sexual abuse of a child",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 503,
  },
  {
    slug: "violation-protective-order",
    label: "Violation of Protective / Restraining Order",
    categorySlug: "domestic-family",
    ncicCode: "4899",
    description: "Violating the terms of a court-issued protective or restraining order",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 504,
  },
  {
    slug: "stalking",
    label: "Stalking",
    categorySlug: "domestic-family",
    ncicCode: "1396",
    description: "Repeated following, harassment, or threatening of another person",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 505,
  },
  {
    slug: "harassment",
    label: "Harassment",
    categorySlug: "domestic-family",
    ncicCode: "1395",
    description: "Repeated unwanted contact or communication intended to annoy or alarm",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 506,
  },
  {
    slug: "elder-abuse",
    label: "Elder Abuse",
    categorySlug: "domestic-family",
    ncicCode: "1394",
    description: "Physical, financial, or emotional abuse of an elderly person",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 507,
  },

  // ── Weapons (weapons) ─────────────────────────────────────────────────────
  {
    slug: "weapons-possession",
    label: "Weapons Possession",
    categorySlug: "weapons",
    ncicCode: "5201",
    description: "Unlawful possession of a firearm or other weapon",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["weapons"],
    sortOrder: 600,
  },
  {
    slug: "felon-in-possession",
    label: "Felon in Possession of a Firearm",
    categorySlug: "weapons",
    ncicCode: "5202",
    description: "Possession of a firearm by a convicted felon",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 601,
  },
  {
    slug: "concealed-carry-violation",
    label: "Concealed Carry Violation",
    categorySlug: "weapons",
    ncicCode: "5203",
    description: "Carrying a concealed weapon without a valid permit",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 602,
  },
  {
    slug: "illegal-discharge",
    label: "Illegal Discharge of a Firearm",
    categorySlug: "weapons",
    ncicCode: "5204",
    description: "Unlawful firing of a weapon in a prohibited area",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 603,
  },
  {
    slug: "weapons-trafficking",
    label: "Weapons Trafficking",
    categorySlug: "weapons",
    ncicCode: "5205",
    description: "Illegal sale, transfer, or trafficking of firearms",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 604,
  },
  {
    slug: "possession-prohibited-weapon",
    label: "Possession of a Prohibited Weapon",
    categorySlug: "weapons",
    ncicCode: "5206",
    description: "Possession of an illegal weapon (e.g., sawed-off shotgun, machine gun)",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 605,
  },
  {
    slug: "unlawful-carry",
    label: "Unlawful Carrying of a Weapon",
    categorySlug: "weapons",
    ncicCode: "5207",
    description: "Carrying a weapon in an unauthorized manner or location",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 606,
  },

  // ── Fraud & Financial (fraud-financial) ───────────────────────────────────
  {
    slug: "wire-fraud",
    label: "Wire Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2699",
    description: "Fraud conducted using electronic communications",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 700,
  },
  {
    slug: "identity-theft",
    label: "Identity Theft",
    categorySlug: "fraud-financial",
    ncicCode: "2602",
    description: "Fraudulent use of another person's identifying information",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 701,
  },
  {
    slug: "embezzlement",
    label: "Embezzlement",
    categorySlug: "fraud-financial",
    ncicCode: "2701",
    description: "Misappropriation of funds or assets entrusted to one's care",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 702,
  },
  {
    slug: "forgery",
    label: "Forgery",
    categorySlug: "fraud-financial",
    ncicCode: "2601",
    description: "Fraudulent making or altering of a written document",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 703,
  },
  {
    slug: "counterfeiting",
    label: "Counterfeiting",
    categorySlug: "fraud-financial",
    ncicCode: "2604",
    description: "Making or using a fraudulent copy of currency or instruments",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 704,
  },
  {
    slug: "bad-checks",
    label: "Bad Checks / Check Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2605",
    description: "Issuing a check with insufficient funds or fraudulent intent",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 705,
  },
  {
    slug: "tax-fraud",
    label: "Tax Fraud / Tax Evasion",
    categorySlug: "fraud-financial",
    ncicCode: "2606",
    description: "Willful failure to pay taxes or fraudulent tax filing",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 706,
  },
  {
    slug: "insurance-fraud",
    label: "Insurance Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2607",
    description: "Filing a fraudulent insurance claim or misrepresenting facts",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 707,
  },
  {
    slug: "credit-card-fraud",
    label: "Credit Card Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2608",
    description: "Unauthorized use of another's credit or debit card information",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 708,
  },
  {
    slug: "money-laundering",
    label: "Money Laundering",
    categorySlug: "fraud-financial",
    ncicCode: "2609",
    description: "Concealing the origins of illegally obtained funds",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 709,
  },
  {
    slug: "fraud-general",
    label: "Fraud (General)",
    categorySlug: "fraud-financial",
    ncicCode: "2699",
    description: "Deceptive scheme to unlawfully obtain money or property",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["white-collar", "fraud"],
    sortOrder: 710,
  },
  {
    slug: "bank-fraud",
    label: "Bank Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2610",
    description: "Fraud committed against a bank or financial institution",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 711,
  },
  {
    slug: "securities-fraud",
    label: "Securities Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2611",
    description: "Deceptive practices in the stock or commodities markets",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 712,
  },

  // ── Sex Offenses (sex-offenses) ────────────────────────────────────────────
  {
    slug: "sex-offense-contact",
    label: "Sexual Offense, Contact",
    categorySlug: "sex-offenses",
    ncicCode: "1101",
    description: "Unlawful physical sexual contact without consent",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["sex-offense", "sex-offense-contact"],
    sortOrder: 800,
  },
  {
    slug: "sexual-assault",
    label: "Sexual Assault",
    categorySlug: "sex-offenses",
    ncicCode: "1102",
    description: "Unlawful sexual act committed without consent",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 801,
  },
  {
    slug: "rape",
    label: "Rape",
    categorySlug: "sex-offenses",
    ncicCode: "1103",
    description: "Non-consensual sexual intercourse by force or coercion",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 802,
  },
  {
    slug: "indecent-exposure",
    label: "Indecent Exposure",
    categorySlug: "sex-offenses",
    ncicCode: "1104",
    description: "Willful public exposure of genitals to cause alarm or for gratification",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 803,
  },
  {
    slug: "solicitation-prostitution",
    label: "Solicitation / Prostitution",
    categorySlug: "sex-offenses",
    ncicCode: "4001",
    description: "Exchanging or offering to exchange sexual acts for money or goods",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 804,
  },
  {
    slug: "sex-offense-digital",
    label: "Sexual Offense, Digital / Online",
    categorySlug: "sex-offenses",
    ncicCode: "1105",
    description: "Online sexual offense including solicitation or distribution of sexual content",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: ["sex-offense-digital"],
    sortOrder: 805,
  },
  {
    slug: "child-exploitation",
    label: "Child Exploitation / Child Pornography",
    categorySlug: "sex-offenses",
    ncicCode: "1106",
    description: "Production, distribution, or possession of child sexual abuse material",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 806,
  },
  {
    slug: "failure-to-register",
    label: "Failure to Register as Sex Offender",
    categorySlug: "sex-offenses",
    ncicCode: "1107",
    description: "Failure to comply with sex offender registration requirements",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 807,
  },
  {
    slug: "statutory-rape",
    label: "Statutory Rape",
    categorySlug: "sex-offenses",
    ncicCode: "1108",
    description: "Sexual intercourse with a person below the age of consent",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 808,
  },
  {
    slug: "sexual-battery",
    label: "Sexual Battery",
    categorySlug: "sex-offenses",
    ncicCode: "1109",
    description: "Non-consensual sexual touching of an intimate body part",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 809,
  },

  // ── Public Order (public-order) ────────────────────────────────────────────
  {
    slug: "disorderly-conduct",
    label: "Disorderly Conduct",
    categorySlug: "public-order",
    ncicCode: "5404",
    description: "Behavior that disturbs the public peace or order",
    severityRange: "Infraction to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 900,
  },
  {
    slug: "resisting-arrest",
    label: "Resisting Arrest",
    categorySlug: "public-order",
    ncicCode: "4801",
    description: "Opposing or obstructing a lawful arrest",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 901,
  },
  {
    slug: "obstruction-justice",
    label: "Obstruction of Justice",
    categorySlug: "public-order",
    ncicCode: "4802",
    description: "Interfering with or impeding the administration of justice",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 902,
  },
  {
    slug: "contempt-of-court",
    label: "Contempt of Court",
    categorySlug: "public-order",
    ncicCode: "4803",
    description: "Willful disobedience of a court order or disrespect of court authority",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 903,
  },
  {
    slug: "public-intoxication",
    label: "Public Intoxication",
    categorySlug: "public-order",
    ncicCode: "5406",
    description: "Being intoxicated in a public place to a degree causing a disturbance",
    severityRange: "Infraction to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 904,
  },
  {
    slug: "loitering",
    label: "Loitering",
    categorySlug: "public-order",
    ncicCode: "5411",
    description: "Remaining in a public place with no apparent purpose in a suspicious manner",
    severityRange: "Infraction to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 905,
  },
  {
    slug: "disturbing-peace",
    label: "Disturbing the Peace",
    categorySlug: "public-order",
    ncicCode: "5407",
    description: "Conduct that unreasonably disturbs the public peace",
    severityRange: "Infraction to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 906,
  },
  {
    slug: "failure-to-appear",
    label: "Failure to Appear",
    categorySlug: "public-order",
    ncicCode: "4804",
    description: "Failing to appear in court as required by summons or bail conditions",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 907,
  },
  {
    slug: "false-report",
    label: "Filing a False Police Report",
    categorySlug: "public-order",
    ncicCode: "4805",
    description: "Knowingly making a false report to law enforcement",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 908,
  },
  {
    slug: "criminal-threat",
    label: "Criminal Threat",
    categorySlug: "public-order",
    ncicCode: "1306",
    description: "Threatening to commit a crime resulting in death or great bodily injury",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 909,
  },

  // ── Probation & Parole (probation-parole) ─────────────────────────────────
  {
    slug: "probation-violation",
    label: "Probation Violation",
    categorySlug: "probation-parole",
    ncicCode: "4899",
    description: "Violation of any condition of probation supervision",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: ["probation-violation"],
    sortOrder: 1000,
  },
  {
    slug: "probation-violation-technical",
    label: "Probation Violation, Technical",
    categorySlug: "probation-parole",
    ncicCode: "4899",
    description: "Non-criminal violation of probation conditions (e.g., missed check-in)",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 1001,
  },
  {
    slug: "probation-violation-substantive",
    label: "Probation Violation, Substantive (New Crime)",
    categorySlug: "probation-parole",
    ncicCode: "4899",
    description: "Probation violation resulting from commission of a new criminal offense",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 1002,
  },
  {
    slug: "supervised-release-violation",
    label: "Supervised Release Violation",
    categorySlug: "probation-parole",
    ncicCode: "4898",
    description: "Violation of federal supervised release conditions post-incarceration",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1003,
  },
  {
    slug: "parole-violation",
    label: "Parole Violation",
    categorySlug: "probation-parole",
    ncicCode: "4897",
    description: "Violation of conditions of parole supervision",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 1004,
  },
  {
    slug: "community-control-violation",
    label: "Community Control Violation",
    categorySlug: "probation-parole",
    ncicCode: "4896",
    description: "Violation of community control / house arrest conditions",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 1005,
  },

  // ── Federal Specific (federal-specific) ───────────────────────────────────
  {
    slug: "conspiracy",
    label: "Conspiracy",
    categorySlug: "federal-specific",
    ncicCode: "4899",
    description: "Agreement between two or more persons to commit a criminal offense",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 1100,
  },
  {
    slug: "rico",
    label: "RICO, Racketeering",
    categorySlug: "federal-specific",
    ncicCode: "4898",
    description: "Organized crime prosecution under the Racketeer Influenced and Corrupt Organizations Act",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1101,
  },
  {
    slug: "federal-drug-trafficking",
    label: "Federal Drug Trafficking",
    categorySlug: "federal-specific",
    ncicCode: "3570",
    description: "Drug trafficking charges prosecuted under federal law",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1102,
  },
  {
    slug: "federal-firearms",
    label: "Federal Firearms Offenses",
    categorySlug: "federal-specific",
    ncicCode: "5201",
    description: "Firearms violations prosecuted under federal law (e.g., 18 USC 922)",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1103,
  },
  {
    slug: "tax-evasion",
    label: "Tax Evasion",
    categorySlug: "federal-specific",
    ncicCode: "2606",
    description: "Willful failure to pay federal taxes owed (26 USC 7201)",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1104,
  },
  {
    slug: "immigration-offense",
    label: "Immigration Offense",
    categorySlug: "federal-specific",
    ncicCode: "4801",
    description: "Federal immigration law violations including unlawful entry or reentry",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1105,
  },
  {
    slug: "mail-fraud",
    label: "Mail Fraud",
    categorySlug: "federal-specific",
    ncicCode: "2699",
    description: "Fraud conducted through the US Postal Service or mail carriers",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1106,
  },
  {
    slug: "federal-other",
    label: "Other Federal Offense",
    categorySlug: "federal-specific",
    ncicCode: null,
    description: "Federal criminal offense not covered by a specific category",
    severityRange: "Varies",
    isFederal: true,
    isState: false,
    legacySlugs: ["federal"],
    sortOrder: 1107,
  },

  // ── Other ─────────────────────────────────────────────────────────────────
  {
    slug: "self-defense",
    label: "Self-Defense (Affirmative Defense)",
    categorySlug: "other",
    ncicCode: null,
    description: "Claim of lawful use of force in self-protection",
    severityRange: "Varies",
    isFederal: false,
    isState: true,
    legacySlugs: ["self-defense"],
    sortOrder: 1200,
  },
  {
    slug: "other",
    label: "Other Charge",
    categorySlug: "other",
    ncicCode: null,
    description: "Criminal charge not covered by any specific category",
    severityRange: "Varies",
    isFederal: false,
    isState: true,
    legacySlugs: ["other", "other-felony", "other-misdemeanor"],
    sortOrder: 1201,
  },
  {
    slug: "aiding-abetting",
    label: "Aiding and Abetting",
    categorySlug: "other",
    ncicCode: null,
    description: "Assisting or encouraging another person to commit a crime",
    severityRange: "Varies",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 1202,
  },
  {
    slug: "attempt",
    label: "Attempt (Inchoate Offense)",
    categorySlug: "other",
    ncicCode: null,
    description: "Taking substantial steps toward committing a crime without completing it",
    severityRange: "Varies",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 1203,
  },

  // ── Expansion: DUI & Driving variants ─────────────────────────────────────
  {
    slug: "dui-second-offense",
    label: "DUI, Second Offense",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "Second DUI/DWI conviction with enhanced penalties",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 113,
  },
  {
    slug: "dui-third-offense",
    label: "DUI, Third Offense",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "Third or subsequent DUI/DWI with felony-level penalties",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 114,
  },
  {
    slug: "dui-felony-injury",
    label: "DUI With Injury",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "DUI/DWI resulting in bodily injury to another person",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 115,
  },
  {
    slug: "hit-run-injury",
    label: "Hit and Run With Injury",
    categorySlug: "dui-driving",
    ncicCode: "5407",
    description: "Leaving the scene of an accident involving bodily injury",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 116,
  },
  {
    slug: "owi-minor-in-vehicle",
    label: "OWI With Minor in Vehicle",
    categorySlug: "dui-driving",
    ncicCode: "5404",
    description: "Operating while intoxicated with a child passenger",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 117,
  },

  // ── Expansion: Drug Offenses ──────────────────────────────────────────────
  {
    slug: "drug-conspiracy",
    label: "Drug Conspiracy",
    categorySlug: "drug-offenses",
    ncicCode: "3576",
    description: "Conspiracy to manufacture, distribute, or possess controlled substances",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 212,
  },
  {
    slug: "drug-import-export",
    label: "Drug Import / Export",
    categorySlug: "drug-offenses",
    ncicCode: "3577",
    description: "Importing or exporting controlled substances across borders",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 213,
  },

  // ── Expansion: Violent Crimes ─────────────────────────────────────────────
  {
    slug: "carjacking",
    label: "Carjacking",
    categorySlug: "violent-crimes",
    ncicCode: "1203",
    description: "Taking a motor vehicle from a person by force or intimidation",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 314,
  },
  {
    slug: "assault-firearm",
    label: "Assault With a Firearm",
    categorySlug: "violent-crimes",
    ncicCode: "1306",
    description: "Assault committed using a firearm",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 315,
  },
  {
    slug: "assault-police-officer",
    label: "Assault on a Police Officer",
    categorySlug: "violent-crimes",
    ncicCode: "1307",
    description: "Assault committed against a law enforcement officer",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 316,
  },
  {
    slug: "terroristic-threats",
    label: "Terroristic Threats",
    categorySlug: "violent-crimes",
    ncicCode: "1308",
    description: "Threatening violence to terrorize or cause public alarm",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 317,
  },
  {
    slug: "unlawful-imprisonment",
    label: "Unlawful Imprisonment",
    categorySlug: "violent-crimes",
    ncicCode: "1002",
    description: "Restraining a person without lawful authority",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 318,
  },
  {
    slug: "home-invasion",
    label: "Home Invasion",
    categorySlug: "violent-crimes",
    ncicCode: "2204",
    description: "Forcible entry into an occupied dwelling with intent to commit a crime",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 319,
  },
  {
    slug: "extortion",
    label: "Extortion",
    categorySlug: "violent-crimes",
    ncicCode: "2103",
    description: "Obtaining property or compliance through threats or coercion",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 320,
  },

  // ── Expansion: Property Crimes ────────────────────────────────────────────
  {
    slug: "retail-fraud",
    label: "Retail Fraud",
    categorySlug: "property-crimes",
    ncicCode: "2306",
    description: "Theft from a retail establishment including price tag switching",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 412,
  },

  // ── Expansion: Domestic & Family ──────────────────────────────────────────
  {
    slug: "child-neglect",
    label: "Child Neglect",
    categorySlug: "domestic-family",
    ncicCode: "1396",
    description: "Failure to provide necessary care, supervision, or support for a child",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 508,
  },
  {
    slug: "aggravated-stalking",
    label: "Aggravated Stalking",
    categorySlug: "domestic-family",
    ncicCode: "1396",
    description: "Stalking with credible threats, violation of protective order, or weapon involvement",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 509,
  },
  {
    slug: "stalking-cyber",
    label: "Cyberstalking",
    categorySlug: "domestic-family",
    ncicCode: "1396",
    description: "Using electronic communications to repeatedly harass or threaten",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 510,
  },
  {
    slug: "financial-exploitation-elder",
    label: "Financial Exploitation of the Elderly",
    categorySlug: "domestic-family",
    ncicCode: "1393",
    description: "Misusing an elderly person's funds, property, or assets",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 511,
  },

  // ── Expansion: Weapons ────────────────────────────────────────────────────
  {
    slug: "felony-firearm",
    label: "Felony Firearm",
    categorySlug: "weapons",
    ncicCode: "5208",
    description: "Possessing a firearm during the commission of a felony",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 607,
  },
  {
    slug: "weapons-carrying-prohibited",
    label: "Carrying a Weapon in a Prohibited Place",
    categorySlug: "weapons",
    ncicCode: "5209",
    description: "Possessing a weapon in a restricted location (courthouse, school, airport)",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 608,
  },
  {
    slug: "weapons-school-zone",
    label: "Weapon in a School Zone",
    categorySlug: "weapons",
    ncicCode: "5210",
    description: "Possessing a weapon within a designated school safety zone",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 609,
  },
  {
    slug: "possession-explosives",
    label: "Possession of Explosives",
    categorySlug: "weapons",
    ncicCode: "5211",
    description: "Unlawful possession of explosive devices or materials",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 610,
  },

  // ── Expansion: Fraud & Financial ──────────────────────────────────────────
  {
    slug: "healthcare-fraud",
    label: "Healthcare Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2612",
    description: "Fraudulent billing or claims against healthcare programs",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 713,
  },
  {
    slug: "mortgage-fraud",
    label: "Mortgage Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2613",
    description: "Material misrepresentation in a mortgage loan application",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 714,
  },
  {
    slug: "fraud-welfare",
    label: "Welfare Fraud",
    categorySlug: "fraud-financial",
    ncicCode: "2614",
    description: "Fraudulently obtaining public assistance or benefit payments",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 715,
  },
  {
    slug: "cybercrime",
    label: "Computer Crime / Hacking",
    categorySlug: "fraud-financial",
    ncicCode: "2615",
    description: "Unauthorized access to computers, networks, or electronic data",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 716,
  },
  {
    slug: "money-laundering-conspiracy",
    label: "Money Laundering Conspiracy",
    categorySlug: "fraud-financial",
    ncicCode: "2616",
    description: "Conspiracy to conceal origins of illegally obtained funds",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 717,
  },

  // ── Expansion: Sex Offenses ───────────────────────────────────────────────
  {
    slug: "csc-first-degree",
    label: "Criminal Sexual Conduct, 1st Degree",
    categorySlug: "sex-offenses",
    ncicCode: "1110",
    description: "Most serious sexual offense involving penetration with aggravating factors",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 810,
  },
  {
    slug: "csc-second-degree",
    label: "Criminal Sexual Conduct, 2nd Degree",
    categorySlug: "sex-offenses",
    ncicCode: "1111",
    description: "Sexual contact with aggravating factors (no penetration)",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 811,
  },
  {
    slug: "csc-third-degree",
    label: "Criminal Sexual Conduct, 3rd Degree",
    categorySlug: "sex-offenses",
    ncicCode: "1112",
    description: "Sexual penetration under circumstances without highest aggravating factors",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 812,
  },
  {
    slug: "csc-fourth-degree",
    label: "Criminal Sexual Conduct, 4th Degree",
    categorySlug: "sex-offenses",
    ncicCode: "1113",
    description: "Sexual contact under circumstances without highest aggravating factors",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 813,
  },
  {
    slug: "sex-trafficking",
    label: "Sex Trafficking",
    categorySlug: "sex-offenses",
    ncicCode: "1114",
    description: "Recruiting, harboring, or transporting persons for commercial sex acts",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 814,
  },
  {
    slug: "possession-child-pornography",
    label: "Possession of Child Pornography",
    categorySlug: "sex-offenses",
    ncicCode: "1115",
    description: "Possessing visual depictions of minors engaged in sexual conduct",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 815,
  },
  {
    slug: "production-child-pornography",
    label: "Production of Child Pornography",
    categorySlug: "sex-offenses",
    ncicCode: "1116",
    description: "Creating or producing visual depictions of minors engaged in sexual conduct",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 816,
  },
  {
    slug: "prostitution",
    label: "Prostitution",
    categorySlug: "sex-offenses",
    ncicCode: "4002",
    description: "Engaging in sexual activity in exchange for compensation",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 817,
  },
  {
    slug: "pandering",
    label: "Pandering / Promoting Prostitution",
    categorySlug: "sex-offenses",
    ncicCode: "4003",
    description: "Facilitating, promoting, or profiting from another's prostitution",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 818,
  },

  // ── Expansion: Public Order ───────────────────────────────────────────────
  {
    slug: "perjury",
    label: "Perjury",
    categorySlug: "public-order",
    ncicCode: "4806",
    description: "Knowingly making a false statement under oath",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 910,
  },
  {
    slug: "bribery",
    label: "Bribery",
    categorySlug: "public-order",
    ncicCode: "4807",
    description: "Offering or accepting something of value to influence an official act",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 911,
  },
  {
    slug: "witness-tampering",
    label: "Witness Tampering",
    categorySlug: "public-order",
    ncicCode: "4808",
    description: "Intimidating, threatening, or corruptly persuading a witness",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 912,
  },
  {
    slug: "jury-tampering",
    label: "Jury Tampering",
    categorySlug: "public-order",
    ncicCode: "4809",
    description: "Attempting to influence a juror through improper communication",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 913,
  },
  {
    slug: "escape-custody",
    label: "Escape From Custody",
    categorySlug: "public-order",
    ncicCode: "4810",
    description: "Unauthorized departure from lawful custody or confinement",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 914,
  },
  {
    slug: "criminal-contempt",
    label: "Criminal Contempt",
    categorySlug: "public-order",
    ncicCode: "4811",
    description: "Willful defiance of court authority beyond civil contempt",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 915,
  },
  {
    slug: "impersonating-officer",
    label: "Impersonating a Law Enforcement Officer",
    categorySlug: "public-order",
    ncicCode: "4812",
    description: "Falsely representing oneself as a police officer or government official",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 916,
  },
  {
    slug: "hate-crime",
    label: "Hate Crime Enhancement",
    categorySlug: "public-order",
    ncicCode: "4813",
    description: "Criminal offense motivated by bias against a protected characteristic",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 917,
  },
  {
    slug: "gang-participation",
    label: "Criminal Gang Participation",
    categorySlug: "public-order",
    ncicCode: "4814",
    description: "Participating in or benefiting from criminal street gang activity",
    severityRange: "Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 918,
  },
  {
    slug: "cyberbullying",
    label: "Cyberbullying / Online Harassment",
    categorySlug: "public-order",
    ncicCode: "4815",
    description: "Using electronic communications to bully, harass, or intimidate",
    severityRange: "Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 919,
  },
  {
    slug: "animal-cruelty",
    label: "Animal Cruelty",
    categorySlug: "public-order",
    ncicCode: "4816",
    description: "Intentional abuse, neglect, or killing of an animal",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 920,
  },
  {
    slug: "bomb-threat",
    label: "Bomb Threat",
    categorySlug: "public-order",
    ncicCode: "4817",
    description: "Threatening use of explosive or destructive device",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 921,
  },
  {
    slug: "hazing",
    label: "Hazing",
    categorySlug: "public-order",
    ncicCode: "4818",
    description: "Subjecting another to physical or psychological abuse as initiation",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 922,
  },
  {
    slug: "noise-ordinance",
    label: "Noise Ordinance Violation",
    categorySlug: "public-order",
    ncicCode: "5413",
    description: "Violating local noise level regulations",
    severityRange: "Infraction to Misdemeanor",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 923,
  },
  {
    slug: "illegal-dumping",
    label: "Illegal Dumping",
    categorySlug: "public-order",
    ncicCode: "4819",
    description: "Disposing of waste or materials in prohibited locations",
    severityRange: "Misdemeanor to Felony",
    isFederal: false,
    isState: true,
    legacySlugs: [],
    sortOrder: 924,
  },

  // ── Expansion: Federal Specific ───────────────────────────────────────────
  {
    slug: "false-statement",
    label: "False Statement to Federal Agent",
    categorySlug: "federal-specific",
    ncicCode: "4820",
    description: "Making a materially false statement to a federal agent (18 USC 1001)",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1108,
  },
  {
    slug: "human-trafficking",
    label: "Human Trafficking",
    categorySlug: "federal-specific",
    ncicCode: "4821",
    description: "Recruiting, harboring, or transporting persons through force, fraud, or coercion",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 1109,
  },
  {
    slug: "public-corruption",
    label: "Public Corruption",
    categorySlug: "federal-specific",
    ncicCode: "4822",
    description: "Official misconduct by government employees including bribery and kickbacks",
    severityRange: "Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 1110,
  },
  {
    slug: "environmental-crime",
    label: "Environmental Crime",
    categorySlug: "federal-specific",
    ncicCode: "4823",
    description: "Violations of environmental protection laws and regulations",
    severityRange: "Misdemeanor to Felony",
    isFederal: true,
    isState: true,
    legacySlugs: [],
    sortOrder: 1111,
  },
  {
    slug: "criminal-enterprise",
    label: "Criminal Enterprise / Continuing Criminal Enterprise",
    categorySlug: "federal-specific",
    ncicCode: "4824",
    description: "Operating or managing a continuing criminal enterprise (21 USC 848)",
    severityRange: "Felony",
    isFederal: true,
    isState: false,
    legacySlugs: [],
    sortOrder: 1112,
  },
] as const satisfies CommonChargeDefinition[];

// ── Existing Questions (preserved from intake form) ───────────────────────────

const EXISTING_QUESTIONS: Readonly<Record<string, ChargeQuestion[]>> = {
  "dui-dwi": [
    {
      slug: "dui-dwi",
      question_key: "bacLevel",
      question_text: "What was your BAC (blood alcohol content) level, if known?",
      answer_type: "single",
      options: [
        { value: "unknown", label: "I don't know" },
        { value: "under-08", label: "Under 0.08%" },
        { value: "08-15", label: "0.08% – 0.15%" },
        { value: "over-15", label: "Over 0.15%" },
        { value: "refused", label: "I refused testing" },
      ],
      sort_order: 0,
    },
    {
      slug: "dui-dwi",
      question_key: "testType",
      question_text: "What type of chemical test was administered?",
      answer_type: "single",
      options: [
        { value: "breath", label: "Breathalyzer (roadside or station)" },
        { value: "blood", label: "Blood draw" },
        { value: "urine", label: "Urine test" },
        { value: "none", label: "No test was given" },
        { value: "refused", label: "I refused to take any test" },
      ],
      sort_order: 1,
    },
    {
      slug: "dui-dwi",
      question_key: "fieldSobriety",
      question_text: "Were you asked to perform field sobriety tests?",
      answer_type: "single",
      options: [
        { value: "yes-passed", label: "Yes, and I passed" },
        { value: "yes-failed", label: "Yes, and I failed (per the officer)" },
        { value: "yes-partial", label: "Yes, I completed some but refused others" },
        { value: "no", label: "No field tests were requested" },
        { value: "refused-all", label: "I refused all field tests" },
      ],
      sort_order: 2,
    },
    {
      slug: "dui-dwi",
      question_key: "priorDUI",
      question_text: "Do you have any prior DUI or DWI convictions?",
      answer_type: "single",
      options: [
        { value: "none", label: "No prior DUI/DWI convictions" },
        { value: "one", label: "One prior conviction" },
        { value: "two", label: "Two prior convictions" },
        { value: "three-plus", label: "Three or more prior convictions" },
      ],
      sort_order: 3,
    },
  ],
  "sex-offense-contact": [
    {
      slug: "sex-offense-contact",
      question_key: "relationship",
      question_text: "What was your relationship to the alleged victim?",
      answer_type: "single",
      options: [
        { value: "stranger", label: "Stranger" },
        { value: "acquaintance", label: "Acquaintance or coworker" },
        { value: "friend", label: "Friend" },
        { value: "partner", label: "Romantic partner or ex-partner" },
        { value: "family", label: "Family member" },
      ],
      sort_order: 0,
    },
    {
      slug: "sex-offense-contact",
      question_key: "reportTiming",
      question_text: "How long after the alleged incident was the report made to police?",
      answer_type: "single",
      options: [
        { value: "same-day", label: "Same day" },
        { value: "days", label: "Within a few days" },
        { value: "weeks", label: "Weeks later" },
        { value: "months", label: "Months later" },
        { value: "years", label: "More than a year later" },
      ],
      sort_order: 1,
    },
    {
      slug: "sex-offense-contact",
      question_key: "saneKit",
      question_text: "Was a SANE (sexual assault nurse examiner) kit or rape kit completed?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unknown", label: "I don't know" },
      ],
      sort_order: 2,
    },
    {
      slug: "sex-offense-contact",
      question_key: "substanceInvolvement",
      question_text: "Was alcohol or drugs involved at the time of the alleged incident?",
      answer_type: "single",
      options: [
        { value: "none", label: "No substances involved" },
        { value: "victim-only", label: "Alleged victim had consumed substances" },
        { value: "both", label: "Both parties had consumed substances" },
        { value: "me-only", label: "I had consumed substances" },
        { value: "unknown", label: "Unknown" },
      ],
      sort_order: 3,
    },
  ],
  "sex-offense-digital": [
    {
      slug: "sex-offense-digital",
      question_key: "offenseType",
      question_text: "What type of digital offense is alleged?",
      answer_type: "single",
      options: [
        { value: "solicitation-minor", label: "Online solicitation of a minor" },
        { value: "distribution-csam", label: "Distribution of child sexual abuse material" },
        { value: "possession-csam", label: "Possession of child sexual abuse material" },
        { value: "sextortion", label: "Sextortion or coerced images" },
        { value: "other", label: "Other digital offense" },
      ],
      sort_order: 0,
    },
    {
      slug: "sex-offense-digital",
      question_key: "investigationOrigin",
      question_text: "How did the investigation begin?",
      answer_type: "single",
      options: [
        { value: "tip", label: "Anonymous tip or report" },
        { value: "cyber-tips", label: "CyberTipline / NCMEC report" },
        { value: "sting", label: "Undercover sting operation" },
        { value: "isp-referral", label: "ISP or platform referral" },
        { value: "unknown", label: "I don't know how it started" },
      ],
      sort_order: 1,
    },
    {
      slug: "sex-offense-digital",
      question_key: "devicesSeized",
      question_text: "Were any of your electronic devices seized by law enforcement?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "some", label: "Some devices were taken, not all" },
      ],
      sort_order: 2,
    },
    {
      slug: "sex-offense-digital",
      question_key: "stingOperation",
      question_text: "Was an undercover officer involved posing as a minor or other person?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unsure", label: "I'm not sure" },
      ],
      sort_order: 3,
    },
  ],
  "domestic-violence": [
    {
      slug: "domestic-violence",
      question_key: "relationship",
      question_text: "What is your relationship to the alleged victim?",
      answer_type: "single",
      options: [
        { value: "spouse", label: "Spouse or domestic partner" },
        { value: "ex-spouse", label: "Ex-spouse or former partner" },
        { value: "dating", label: "Dating or romantic partner" },
        { value: "ex-dating", label: "Former dating partner" },
        { value: "coparent", label: "Co-parent (no romantic relationship)" },
        { value: "family", label: "Family member (parent, sibling, etc.)" },
        { value: "roommate", label: "Roommate or housemate" },
      ],
      sort_order: 0,
    },
    {
      slug: "domestic-violence",
      question_key: "initiator",
      question_text: "Who initiated physical contact during the incident?",
      answer_type: "single",
      options: [
        { value: "me", label: "I did" },
        { value: "them", label: "The alleged victim did" },
        { value: "mutual", label: "It was mutual" },
        { value: "unclear", label: "It's unclear" },
      ],
      sort_order: 1,
    },
    {
      slug: "domestic-violence",
      question_key: "protectiveOrder",
      question_text: "Is there a protective or restraining order currently in place?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "pending", label: "One has been applied for but not yet issued" },
        { value: "expired", label: "A prior order has expired" },
      ],
      sort_order: 2,
    },
    {
      slug: "domestic-violence",
      question_key: "motive",
      question_text: "Were there any underlying factors that contributed to the incident?",
      answer_type: "single",
      options: [
        { value: "self-defense", label: "I was defending myself" },
        { value: "alcohol", label: "Alcohol was involved" },
        { value: "mental-health", label: "Mental health crisis" },
        { value: "children-dispute", label: "Dispute involving children" },
        { value: "financial", label: "Financial dispute" },
        { value: "none", label: "No specific factor I'm aware of" },
      ],
      sort_order: 3,
    },
  ],
  "weapons-possession": [
    {
      slug: "weapons-possession",
      question_key: "discoveryMethod",
      question_text: "How did law enforcement discover the weapon?",
      answer_type: "single",
      options: [
        { value: "traffic-stop", label: "During a traffic stop" },
        { value: "search-warrant", label: "Search warrant execution" },
        { value: "stop-frisk", label: "Stop and frisk" },
        { value: "arrest", label: "Incident to an arrest for another charge" },
        { value: "consent-search", label: "I consented to a search" },
        { value: "visible", label: "Weapon was in plain view" },
      ],
      sort_order: 0,
    },
    {
      slug: "weapons-possession",
      question_key: "weaponLocation",
      question_text: "Where was the weapon located when found?",
      answer_type: "single",
      options: [
        { value: "on-person", label: "On my person" },
        { value: "vehicle", label: "In my vehicle" },
        { value: "home", label: "In my home or residence" },
        { value: "other-location", label: "At another location" },
      ],
      sort_order: 1,
    },
    {
      slug: "weapons-possession",
      question_key: "carryPermit",
      question_text: "Do you have a valid carry permit or license?",
      answer_type: "single",
      options: [
        { value: "yes-valid", label: "Yes, and it was valid at the time" },
        { value: "yes-expired", label: "Yes, but it had expired" },
        { value: "no", label: "No permit" },
        { value: "other-state", label: "I have an out-of-state permit" },
      ],
      sort_order: 2,
    },
    {
      slug: "weapons-possession",
      question_key: "prohibitedStatus",
      question_text: "Are you legally prohibited from possessing firearms?",
      answer_type: "single",
      options: [
        { value: "no", label: "No, I have no restrictions" },
        { value: "felony", label: "Yes, prior felony conviction" },
        { value: "dv", label: "Yes, domestic violence conviction or order" },
        { value: "mental", label: "Yes, mental health adjudication" },
        { value: "unsure", label: "I'm not sure of my status" },
      ],
      sort_order: 3,
    },
  ],
  "simple-assault": [
    {
      slug: "simple-assault",
      question_key: "selfDefense",
      question_text: "Were you acting in self-defense?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes, I was defending myself" },
        { value: "yes-other", label: "Yes, I was defending someone else" },
        { value: "no", label: "No" },
        { value: "partial", label: "Partially, the situation was mutual" },
      ],
      sort_order: 0,
    },
    {
      slug: "simple-assault",
      question_key: "initiator",
      question_text: "Who initiated the confrontation?",
      answer_type: "single",
      options: [
        { value: "me", label: "I did" },
        { value: "them", label: "The alleged victim did" },
        { value: "mutual", label: "It escalated mutually" },
        { value: "unclear", label: "It's unclear" },
      ],
      sort_order: 1,
    },
    {
      slug: "simple-assault",
      question_key: "forceLevel",
      question_text: "What level of force was used?",
      answer_type: "single",
      options: [
        { value: "verbal", label: "Verbal only, no physical contact" },
        { value: "minor", label: "Minor physical contact (push, grab)" },
        { value: "significant", label: "Significant physical contact" },
        { value: "weapon", label: "A weapon was involved" },
      ],
      sort_order: 2,
    },
    {
      slug: "simple-assault",
      question_key: "couldLeave",
      question_text: "Were you able to safely leave the situation before it escalated?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes, I could have left" },
        { value: "no", label: "No, I was unable to safely leave" },
        { value: "blocked", label: "The other party was blocking my exit" },
      ],
      sort_order: 3,
    },
  ],
  "fraud-general": [
    {
      slug: "fraud-general",
      question_key: "investigationDiscovery",
      question_text: "How did the investigation begin?",
      answer_type: "single",
      options: [
        { value: "audit", label: "Financial audit or tax review" },
        { value: "complaint", label: "Complaint from a victim or business" },
        { value: "tip", label: "Anonymous tip" },
        { value: "routine", label: "Routine regulatory review" },
        { value: "unknown", label: "I don't know how it started" },
      ],
      sort_order: 0,
    },
    {
      slug: "fraud-general",
      question_key: "professionalAdvice",
      question_text: "Were you acting on advice from a professional (accountant, attorney, advisor)?",
      answer_type: "single",
      options: [
        { value: "yes-documented", label: "Yes, and I have documentation" },
        { value: "yes-verbal", label: "Yes, but only verbally" },
        { value: "no", label: "No" },
        { value: "partial", label: "Partially" },
      ],
      sort_order: 1,
    },
    {
      slug: "fraud-general",
      question_key: "lossAmount",
      question_text: "What is the alleged loss amount?",
      answer_type: "single",
      options: [
        { value: "under-1k", label: "Under $1,000" },
        { value: "1k-10k", label: "$1,000 – $10,000" },
        { value: "10k-100k", label: "$10,000 – $100,000" },
        { value: "100k-1m", label: "$100,000 – $1 million" },
        { value: "over-1m", label: "Over $1 million" },
        { value: "unknown", label: "Unknown or disputed" },
      ],
      sort_order: 2,
    },
    {
      slug: "fraud-general",
      question_key: "assetsSeized",
      question_text: "Have any of your assets or accounts been frozen or seized?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "partial", label: "Some accounts have been affected" },
      ],
      sort_order: 3,
    },
  ],
  "federal-other": [
    {
      slug: "federal-other",
      question_key: "mandatoryMinimum",
      question_text: "Does your charge carry a mandatory minimum sentence?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unknown", label: "I don't know" },
      ],
      sort_order: 0,
    },
    {
      slug: "federal-other",
      question_key: "cooperation",
      question_text: "Has the government offered or discussed a cooperation agreement?",
      answer_type: "single",
      options: [
        { value: "yes-accepted", label: "Yes, and I accepted" },
        { value: "yes-declined", label: "Yes, but I declined" },
        { value: "offered", label: "It was mentioned but not formally offered" },
        { value: "no", label: "No" },
      ],
      sort_order: 1,
    },
    {
      slug: "federal-other",
      question_key: "chargingMethod",
      question_text: "How were the charges filed?",
      answer_type: "single",
      options: [
        { value: "indictment", label: "Grand jury indictment" },
        { value: "information", label: "Criminal information (no grand jury)" },
        { value: "complaint", label: "Criminal complaint" },
        { value: "unknown", label: "I don't know" },
      ],
      sort_order: 2,
    },
    {
      slug: "federal-other",
      question_key: "mitigating",
      question_text: "Are there any significant mitigating factors?",
      answer_type: "single",
      options: [
        { value: "minor-role", label: "I played a minor role in the alleged conduct" },
        { value: "coerced", label: "I was coerced or under duress" },
        { value: "mental-health", label: "Mental health or addiction issues" },
        { value: "restitution", label: "I've already made restitution" },
        { value: "none", label: "None that I'm aware of" },
      ],
      sort_order: 3,
    },
  ],
  "theft-larceny": [
    {
      slug: "theft-larceny",
      question_key: "identification",
      question_text: "How were you identified as a suspect?",
      answer_type: "single",
      options: [
        { value: "caught-scene", label: "Caught at the scene" },
        { value: "camera", label: "Security camera footage" },
        { value: "witness", label: "Witness identification" },
        { value: "evidence", label: "Physical evidence" },
        { value: "unknown", label: "I'm not sure" },
      ],
      sort_order: 0,
    },
    {
      slug: "theft-larceny",
      question_key: "weaponAlleged",
      question_text: "Was a weapon alleged to be involved in any way?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      sort_order: 1,
    },
    {
      slug: "theft-larceny",
      question_key: "propertyValue",
      question_text: "What is the alleged value of the property?",
      answer_type: "single",
      options: [
        { value: "under-100", label: "Under $100" },
        { value: "100-500", label: "$100 – $500" },
        { value: "500-1k", label: "$500 – $1,000" },
        { value: "1k-10k", label: "$1,000 – $10,000" },
        { value: "over-10k", label: "Over $10,000" },
        { value: "disputed", label: "The value is disputed" },
      ],
      sort_order: 2,
    },
    {
      slug: "theft-larceny",
      question_key: "alibi",
      question_text: "Do you have an alibi or witnesses who can confirm your whereabouts?",
      answer_type: "single",
      options: [
        { value: "yes-strong", label: "Yes, with multiple witnesses or documentation" },
        { value: "yes-weak", label: "Yes, but it's hard to verify" },
        { value: "no", label: "No alibi" },
      ],
      sort_order: 3,
    },
  ],
  "drug-possession": [
    {
      slug: "drug-possession",
      question_key: "substanceType",
      question_text: "What type of controlled substance is alleged?",
      answer_type: "single",
      options: [
        { value: "marijuana", label: "Marijuana / Cannabis" },
        { value: "cocaine", label: "Cocaine or Crack Cocaine" },
        { value: "meth", label: "Methamphetamine" },
        { value: "opioids", label: "Heroin, Fentanyl, or other opioids" },
        { value: "prescription", label: "Prescription medication (without Rx)" },
        { value: "mdma", label: "MDMA / Ecstasy" },
        { value: "other", label: "Other controlled substance" },
      ],
      sort_order: 0,
    },
    {
      slug: "drug-possession",
      question_key: "allegedAmount",
      question_text: "What is the alleged quantity?",
      answer_type: "single",
      options: [
        { value: "trace", label: "Trace amount (residue only)" },
        { value: "personal-use", label: "Personal use amount" },
        { value: "ambiguous", label: "Ambiguous, could be personal use or distribution" },
        { value: "distribution", label: "Distribution-level quantity" },
        { value: "unknown", label: "Unknown or disputed" },
      ],
      sort_order: 1,
    },
    {
      slug: "drug-possession",
      question_key: "evidenceFound",
      question_text: "How was the evidence discovered?",
      answer_type: "single",
      options: [
        { value: "traffic-stop", label: "Traffic stop" },
        { value: "search-warrant", label: "Search warrant" },
        { value: "consent-search", label: "Consent to search" },
        { value: "stop-frisk", label: "Stop and frisk" },
        { value: "plain-view", label: "Plain view" },
        { value: "arrest", label: "Incident to another arrest" },
      ],
      sort_order: 2,
    },
    {
      slug: "drug-possession",
      question_key: "ciInvolved",
      question_text: "Was a confidential informant (CI) involved in the investigation?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes, I believe so" },
        { value: "no", label: "No" },
        { value: "unknown", label: "I don't know" },
      ],
      sort_order: 3,
    },
  ],
  "drug-trafficking": [
    {
      slug: "drug-trafficking",
      question_key: "substanceType",
      question_text: "What controlled substance is alleged in the trafficking charge?",
      answer_type: "single",
      options: [
        { value: "marijuana", label: "Marijuana / Cannabis" },
        { value: "cocaine", label: "Cocaine or Crack Cocaine" },
        { value: "meth", label: "Methamphetamine" },
        { value: "opioids", label: "Heroin, Fentanyl, or other opioids" },
        { value: "mdma", label: "MDMA / Ecstasy" },
        { value: "other", label: "Other controlled substance" },
      ],
      sort_order: 0,
    },
    {
      slug: "drug-trafficking",
      question_key: "allegedAmount",
      question_text: "What is the alleged quantity triggering the trafficking charge?",
      answer_type: "single",
      options: [
        { value: "at-threshold", label: "Right at the statutory threshold" },
        { value: "moderately-over", label: "Moderately over threshold" },
        { value: "significantly-over", label: "Significantly over threshold" },
        { value: "unknown", label: "Amount is disputed or unknown" },
      ],
      sort_order: 1,
    },
    {
      slug: "drug-trafficking",
      question_key: "evidenceFound",
      question_text: "How was the evidence discovered?",
      answer_type: "single",
      options: [
        { value: "traffic-stop", label: "Traffic stop" },
        { value: "search-warrant", label: "Search warrant" },
        { value: "sting", label: "Undercover sting operation" },
        { value: "wiretap", label: "Wiretap or surveillance" },
        { value: "other", label: "Other method" },
      ],
      sort_order: 2,
    },
    {
      slug: "drug-trafficking",
      question_key: "ciInvolved",
      question_text: "Was a confidential informant (CI) used?",
      answer_type: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unknown", label: "I don't know" },
      ],
      sort_order: 3,
    },
  ],
  "probation-violation": [
    {
      slug: "probation-violation",
      question_key: "violationType",
      question_text: "What type of probation violation is alleged?",
      answer_type: "single",
      options: [
        { value: "missed-checkin", label: "Missed check-in with probation officer" },
        { value: "failed-test", label: "Failed drug or alcohol test" },
        { value: "new-arrest", label: "New arrest or criminal charge" },
        { value: "travel", label: "Unauthorized travel" },
        { value: "contact", label: "Unauthorized contact (protective order)" },
        { value: "employment", label: "Failed to maintain employment or program" },
        { value: "other", label: "Other technical violation" },
      ],
      sort_order: 0,
    },
    {
      slug: "probation-violation",
      question_key: "originalCharge",
      question_text: "What was the original offense you were placed on probation for?",
      answer_type: "single",
      options: [
        { value: "dui", label: "DUI / DWI" },
        { value: "drug", label: "Drug offense" },
        { value: "theft", label: "Theft or property crime" },
        { value: "assault", label: "Assault or violent crime" },
        { value: "dv", label: "Domestic violence" },
        { value: "other", label: "Other offense" },
      ],
      sort_order: 1,
    },
    {
      slug: "probation-violation",
      question_key: "poRelationship",
      question_text: "How is your relationship with your probation officer?",
      answer_type: "single",
      options: [
        { value: "good", label: "Good, no prior issues" },
        { value: "neutral", label: "Neutral" },
        { value: "strained", label: "Strained, previous warnings" },
        { value: "adversarial", label: "Adversarial" },
      ],
      sort_order: 2,
    },
    {
      slug: "probation-violation",
      question_key: "complianceStatus",
      question_text: "How long had you been compliant before this alleged violation?",
      answer_type: "single",
      options: [
        { value: "just-started", label: "Just started probation (under 3 months)" },
        { value: "short", label: "3–12 months" },
        { value: "long", label: "Over 1 year" },
        { value: "near-end", label: "Near the end of my probation term" },
      ],
      sort_order: 3,
    },
  ],
  "self-defense": [
    {
      slug: "self-defense",
      question_key: "incidentLocation",
      question_text: "Where did the incident occur?",
      answer_type: "single",
      options: [
        { value: "home", label: "In my home or on my property" },
        { value: "vehicle", label: "In my vehicle" },
        { value: "public", label: "In a public place" },
        { value: "work", label: "At my workplace" },
        { value: "other-home", label: "At someone else's home" },
      ],
      sort_order: 0,
    },
    {
      slug: "self-defense",
      question_key: "weaponUsed",
      question_text: "Was a weapon used during the incident?",
      answer_type: "single",
      options: [
        { value: "firearm", label: "Yes, firearm" },
        { value: "other-weapon", label: "Yes, other weapon (knife, bat, etc.)" },
        { value: "no", label: "No weapon, hands only" },
      ],
      sort_order: 1,
    },
    {
      slug: "self-defense",
      question_key: "otherPartyOutcome",
      question_text: "What was the outcome for the other party?",
      answer_type: "single",
      options: [
        { value: "no-injury", label: "No injury" },
        { value: "minor-injury", label: "Minor injury" },
        { value: "serious-injury", label: "Serious injury requiring hospitalization" },
        { value: "deceased", label: "Deceased" },
      ],
      sort_order: 2,
    },
    {
      slug: "self-defense",
      question_key: "relationship",
      question_text: "What was your relationship to the other party?",
      answer_type: "single",
      options: [
        { value: "stranger", label: "Stranger" },
        { value: "acquaintance", label: "Acquaintance" },
        { value: "family", label: "Family member" },
        { value: "partner", label: "Intimate partner or ex-partner" },
      ],
      sort_order: 3,
    },
    {
      slug: "self-defense",
      question_key: "whoCalled911",
      question_text: "Who called 911?",
      answer_type: "single",
      options: [
        { value: "me", label: "I did" },
        { value: "other-party", label: "The other party" },
        { value: "witness", label: "A third-party witness" },
        { value: "no-call", label: "No one called 911" },
      ],
      sort_order: 4,
    },
  ],
};

// Alias map: slug → primary slug that has questions
const ALIAS_MAP: Readonly<Record<string, string>> = {
  "dui-first-offense": "dui-dwi",
  "dui-repeat-offense": "dui-dwi",
  "sexual-assault": "sex-offense-contact",
  rape: "sex-offense-contact",
  "sexual-battery": "sex-offense-contact",
  "child-exploitation": "sex-offense-digital",
  "domestic-battery": "domestic-violence",
  "felon-in-possession": "weapons-possession",
  "concealed-carry-violation": "weapons-possession",
  "aggravated-assault": "simple-assault",
  battery: "simple-assault",
  "aggravated-battery": "simple-assault",
  "wire-fraud": "fraud-general",
  embezzlement: "fraud-general",
  conspiracy: "federal-other",
  rico: "federal-other",
  "grand-theft": "theft-larceny",
  "petty-theft": "theft-larceny",
  shoplifting: "theft-larceny",
  "drug-possession-marijuana": "drug-possession",
  "drug-possession-cocaine": "drug-possession",
  "drug-possession-meth": "drug-possession",
  "drug-possession-opioids": "drug-possession",
  "drug-possession-prescription": "drug-possession",
  "drug-distribution": "drug-trafficking",
  "probation-violation-technical": "probation-violation",
  "probation-violation-substantive": "probation-violation",
};

function getQuestionsForSlug(slug: string): ChargeQuestion[] {
  const direct = EXISTING_QUESTIONS[slug];
  if (direct && direct.length > 0) return direct;
  const primary = ALIAS_MAP[slug];
  if (primary) {
    const base = EXISTING_QUESTIONS[primary];
    if (base && base.length > 0) return base.map((q) => ({ ...q, slug }));
  }
  return [];
}

// Build covered set (slugs that already resolve to questions)
const COVERED_SLUGS = new Set<string>(
  COMMON_CHARGES.map((c) => c.slug).filter(
    (slug) => getQuestionsForSlug(slug).length > 0
  )
);

// ── Claude Code session (replaces direct Anthropic API) ────────────────────
// Uses callClaude subprocess wrapper: spawns `claude -p` under the local
// Claude Code session. Zero Anthropic API credits consumed.

async function callAnthropicAPI(prompt: string): Promise<string> {
  const result = await callClaude({ userPrompt: prompt });
  if (!result?.text) throw new Error("No text returned from claude -p");
  return result.text as string;
}

function stripMarkdownFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    const firstNewline = s.indexOf("\n");
    const lastFence = s.lastIndexOf("```");
    if (firstNewline !== -1 && lastFence > firstNewline) {
      s = s.slice(firstNewline + 1, lastFence).trim();
    }
  }
  return s;
}

// ── Prompt Builders ───────────────────────────────────────────────────────────

function buildJurisdictionPrompt(code: string, name: string): string {
  const chargeList = COMMON_CHARGES.map(
    (c) => `- ${c.slug}: ${c.label}`
  ).join("\n");

  return `You are a legal research assistant creating a criminal charge taxonomy database. For the jurisdiction of ${name} (${code}), provide the statute-specific information for each of the following common criminal charges.

For each charge, return a JSON object with:
- common_charge_slug: the slug from the list below
- statute_number: the specific statute number (e.g., "784.045" for FL, "PC 245(a)(1)" for CA)
- statute_title: official title of the statute
- offense_class: classification (e.g., "2nd Degree Felony", "Class A Misdemeanor")
- penalty_min: minimum penalty (e.g., "0 years" or null)
- penalty_max: maximum penalty (e.g., "15 years")
- fine_max: maximum fine (e.g., "$10,000")
- elements: array of prosecution elements (what must be proved)
- mandatory_minimum: specific mandatory minimum or null
- enhancements: array of applicable enhancements
- notes: jurisdiction-specific nuances (wobbler status, diversion eligibility, etc.)

OMIT any charge that does not exist as a distinct offense in this jurisdiction.

Return ONLY valid JSON, an array of objects. No markdown, no explanation.

Common charges to map:
${chargeList}`;
}

function buildQuestionsPrompt(uncoveredSlugs: string[]): string {
  const chargeDescriptions = uncoveredSlugs
    .map((slug) => {
      const charge = COMMON_CHARGES.find((c) => c.slug === slug);
      return charge
        ? `- ${slug}: ${charge.label}, ${charge.description}`
        : `- ${slug}`;
    })
    .join("\n");

  return `You are building a criminal defense intake form. For each charge below, generate 3-4 fact-pattern questions that help a criminal defense attorney understand the key facts of the case.

Requirements for each question:
- question_key: camelCase identifier (unique within the charge)
- question_text: clear, plain-language question (under 15 words)
- answer_type: "single" (radio button)
- options: 3-6 options with value (camelCase) and label (human-readable)
- sort_order: 0-indexed

Focus on facts that affect defenses, sentencing exposure, or case strategy. Avoid anything that could be construed as legal advice.

Return ONLY valid JSON in this exact structure:
{
  "charge_slug": [
    {
      "question_key": "...",
      "question_text": "...",
      "answer_type": "single",
      "options": [{"value": "...", "label": "..."}, ...],
      "sort_order": 0
    }
  ]
}

Charges to generate questions for:
${chargeDescriptions}`;
}

// ── File I/O ──────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function jurisdictionFilePath(code: string): string {
  return path.join(DATA_DIR, `${code}.json`);
}

function saveJSON(filepath: string, data: unknown): void {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

function loadJSON<T>(filepath: string): T {
  return JSON.parse(fs.readFileSync(filepath, "utf-8")) as T;
}

// ── Generation ────────────────────────────────────────────────────────────────

async function generateJurisdiction(
  code: string,
  name: string,
  index: number,
  total: number,
  dryRun: boolean
): Promise<void> {
  console.log(`Generating ${code}... (${index}/${total})`);

  const prompt = buildJurisdictionPrompt(code, name);

  if (dryRun) {
    console.log("\n--- DRY RUN: Prompt Preview ---");
    const preview =
      prompt.length > 2000
        ? prompt.slice(0, 2000) + `\n... [${prompt.length - 2000} more chars]`
        : prompt;
    console.log(preview);
    console.log(`\nTotal charges in prompt: ${COMMON_CHARGES.length}`);
    console.log("--- End of Prompt ---\n");
    return;
  }

  try {
    const raw = await callAnthropicAPI(prompt);
    const jsonStr = stripMarkdownFences(raw);
    const parsed = JSON.parse(jsonStr) as JurisdictionStatute[];
    saveJSON(jurisdictionFilePath(code), parsed);
    console.log(`  Saved ${parsed.length} statutes for ${code}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ERROR generating ${code}: ${message}`);
  }
}

async function generateAllJurisdictions(dryRun: boolean): Promise<void> {
  ensureDataDir();
  const toGenerate = JURISDICTIONS.filter(({ code }) => {
    const filepath = jurisdictionFilePath(code);
    if (fs.existsSync(filepath)) {
      console.log(`Skipping ${code}, JSON already exists`);
      return false;
    }
    return true;
  });
  console.log(`${toGenerate.length} jurisdictions to generate (${JURISDICTIONS.length - toGenerate.length} skipped)`);
  for (let i = 0; i < toGenerate.length; i++) {
    const { code, name } = toGenerate[i];
    await generateJurisdiction(code, name, i + 1, toGenerate.length, dryRun);
    if (!dryRun && i < toGenerate.length - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }
  }
  console.log("\nAll jurisdictions complete.");
}

async function generateSingleJurisdiction(
  code: string,
  dryRun: boolean
): Promise<void> {
  const upper = code.toUpperCase();
  const jur =
    JURISDICTIONS.find((j) => j.code === upper) ??
    JURISDICTIONS.find((j) => j.code.toLowerCase() === code.toLowerCase());

  if (!jur) {
    console.error(`Unknown jurisdiction: ${code}`);
    console.error(`Valid codes: ${JURISDICTIONS.map((j) => j.code).join(", ")}`);
    process.exit(1);
  }

  ensureDataDir();
  await generateJurisdiction(jur.code, jur.name, 1, 1, dryRun);
}

async function generateQuestions(dryRun: boolean): Promise<void> {
  ensureDataDir();
  const questionsPath = path.join(DATA_DIR, "questions.json");

  const allSlugs = COMMON_CHARGES.map((c) => c.slug);
  const uncoveredSlugs = allSlugs.filter((slug) => !COVERED_SLUGS.has(slug));

  // Seed output with existing + aliased questions
  const output: Record<string, ChargeQuestion[]> = {};
  for (const slug of allSlugs) {
    const qs = getQuestionsForSlug(slug);
    if (qs.length > 0) output[slug] = qs;
  }

  console.log(
    `Existing/aliased questions cover ${Object.keys(output).length}/${allSlugs.length} charges.`
  );
  console.log(
    `Generating API questions for ${uncoveredSlugs.length} uncovered charges...`
  );
  if (uncoveredSlugs.length > 0) {
    console.log(`  Uncovered slugs: ${uncoveredSlugs.join(", ")}`);
  }

  if (uncoveredSlugs.length > 0) {
    const prompt = buildQuestionsPrompt(uncoveredSlugs);

    if (dryRun) {
      console.log("\n--- DRY RUN: Questions Prompt Preview ---");
      const preview =
        prompt.length > 1500
          ? prompt.slice(0, 1500) + `\n... [${prompt.length - 1500} more chars]`
          : prompt;
      console.log(preview);
      console.log("--- End of Prompt ---\n");
    } else {
      try {
        const raw = await callAnthropicAPI(prompt);
        const jsonStr = stripMarkdownFences(raw);
        const parsed = JSON.parse(jsonStr) as Record<
          string,
          Array<Omit<ChargeQuestion, "slug">>
        >;
        for (const [slug, questions] of Object.entries(parsed)) {
          output[slug] = questions.map((q) => ({ ...q, slug }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`ERROR generating questions: ${message}`);
      }
    }
  }

  if (!dryRun) {
    saveJSON(questionsPath, output);
    console.log(`\nQuestions saved to ${questionsPath}`);
    console.log(`Total charges with questions: ${Object.keys(output).length}`);
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateOutput(): void {
  const REQUIRED_FIELDS: ReadonlyArray<keyof JurisdictionStatute> = [
    "statute_number",
    "statute_title",
    "offense_class",
    "penalty_max",
    "elements",
  ];

  let totalStatutes = 0;
  let totalErrors = 0;
  const missingFiles: string[] = [];
  const coverageMap: Record<string, number> = {};

  for (const { code } of JURISDICTIONS) {
    const filepath = jurisdictionFilePath(code);
    if (!fs.existsSync(filepath)) {
      missingFiles.push(code);
      continue;
    }

    let statutes: JurisdictionStatute[];
    try {
      statutes = loadJSON<JurisdictionStatute[]>(filepath);
    } catch {
      console.error(`  ${code}: INVALID JSON`);
      totalErrors++;
      continue;
    }

    if (!Array.isArray(statutes)) {
      console.error(`  ${code}: Not an array`);
      totalErrors++;
      continue;
    }

    coverageMap[code] = statutes.length;
    totalStatutes += statutes.length;

    const slugsSeen = new Set<string>();
    for (const statute of statutes) {
      if (slugsSeen.has(statute.common_charge_slug)) {
        console.error(`  ${code}: Duplicate slug, ${statute.common_charge_slug}`);
        totalErrors++;
      }
      slugsSeen.add(statute.common_charge_slug);

      for (const field of REQUIRED_FIELDS) {
        const val = statute[field];
        if (
          val === null ||
          val === undefined ||
          val === "" ||
          (Array.isArray(val) && val.length === 0)
        ) {
          console.error(
            `  ${code}/${statute.common_charge_slug}: Missing required field, ${field}`
          );
          totalErrors++;
        }
      }
    }
  }

  console.log("\n=== Validation Summary ===");
  console.log(`Jurisdictions checked : ${JURISDICTIONS.length}`);
  console.log(`Missing files         : ${missingFiles.length}`);
  if (missingFiles.length > 0) console.log(`  ${missingFiles.join(", ")}`);
  console.log(`Total statutes        : ${totalStatutes}`);
  console.log(`Total errors          : ${totalErrors}`);

  console.log("\n=== Coverage Per Jurisdiction ===");
  for (const { code } of JURISDICTIONS) {
    const count = coverageMap[code];
    if (count !== undefined) {
      const pct = Math.round((count / COMMON_CHARGES.length) * 100);
      const bar = "#".repeat(Math.round(pct / 5)).padEnd(20);
      console.log(
        `  ${code.padEnd(8)} ${String(count).padStart(3)} statutes  [${bar}] ${pct}%`
      );
    } else {
      console.log(`  ${code.padEnd(8)} MISSING`);
    }
  }

  if (totalErrors > 0 || missingFiles.length > 0) process.exit(1);
}

// ── CLI ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const hasFlag = (flag: string): boolean => args.includes(flag);
  const getFlagValue = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? (args[idx + 1] ?? null) : null;
  };

  const dryRun = hasFlag("--dry-run");

  if (hasFlag("--validate")) {
    validateOutput();
    return;
  }

  if (hasFlag("--questions")) {
    await generateQuestions(dryRun);
    return;
  }

  const jurisdictionCode = getFlagValue("--jurisdiction");
  if (jurisdictionCode) {
    await generateSingleJurisdiction(jurisdictionCode, dryRun);
    return;
  }

  if (hasFlag("--all")) {
    await generateAllJurisdictions(dryRun);
    await generateQuestions(dryRun);
    return;
  }

  // Default: usage
  console.log(`
Charge Taxonomy Data Generator
===============================
Usage:
  npx tsx scripts/generate-charge-taxonomy.ts --all
    Generate all ${JURISDICTIONS.length} jurisdictions + questions (Task 3, do NOT run here)

  npx tsx scripts/generate-charge-taxonomy.ts --jurisdiction FL
    Generate a single jurisdiction

  npx tsx scripts/generate-charge-taxonomy.ts --dry-run --jurisdiction FL
    Print prompt without calling the API

  npx tsx scripts/generate-charge-taxonomy.ts --questions
    Generate questions for uncovered charges only

  npx tsx scripts/generate-charge-taxonomy.ts --validate
    Validate all generated output in data/charge-taxonomy/

Stats:
  Charges defined  : ${COMMON_CHARGES.length}
  Jurisdictions    : ${JURISDICTIONS.length}
  Output directory : ${DATA_DIR}
`);
}

// Only run main() when this file is the entry point (not when imported)
const isEntryPoint =
  process.argv[1] &&
  (process.argv[1].endsWith("generate-charge-taxonomy.ts") ||
    process.argv[1].endsWith("generate-charge-taxonomy.js"));

if (isEntryPoint) {
  main().catch((err: unknown) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
