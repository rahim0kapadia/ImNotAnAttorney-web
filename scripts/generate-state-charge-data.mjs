// csv-bulk-checked: none-exists — jurisdiction_statutes is curated Supabase data
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const CHARGES = {
  drug: {
    slug: "drug-possession",
    file: "state-drug-laws.ts",
    varName: "STATE_DRUG_LAWS",
    helperPrefix: "StateDrugLaws",
  },
  assault: {
    slug: "simple-assault",
    file: "state-assault-laws.ts",
    varName: "STATE_ASSAULT_LAWS",
    helperPrefix: "StateAssaultLaws",
  },
  dv: {
    slug: "domestic-violence",
    file: "state-dv-laws.ts",
    varName: "STATE_DV_LAWS",
    helperPrefix: "StateDvLaws",
  },
};

const STATE_META = {
  alabama: { name: "Alabama", abbr: "AL" },
  alaska: { name: "Alaska", abbr: "AK" },
  arizona: { name: "Arizona", abbr: "AZ" },
  arkansas: { name: "Arkansas", abbr: "AR" },
  california: { name: "California", abbr: "CA" },
  colorado: { name: "Colorado", abbr: "CO" },
  connecticut: { name: "Connecticut", abbr: "CT" },
  delaware: { name: "Delaware", abbr: "DE" },
  florida: { name: "Florida", abbr: "FL" },
  georgia: { name: "Georgia", abbr: "GA" },
  hawaii: { name: "Hawaii", abbr: "HI" },
  idaho: { name: "Idaho", abbr: "ID" },
  illinois: { name: "Illinois", abbr: "IL" },
  indiana: { name: "Indiana", abbr: "IN" },
  iowa: { name: "Iowa", abbr: "IA" },
  kansas: { name: "Kansas", abbr: "KS" },
  kentucky: { name: "Kentucky", abbr: "KY" },
  louisiana: { name: "Louisiana", abbr: "LA" },
  maine: { name: "Maine", abbr: "ME" },
  maryland: { name: "Maryland", abbr: "MD" },
  massachusetts: { name: "Massachusetts", abbr: "MA" },
  michigan: { name: "Michigan", abbr: "MI" },
  minnesota: { name: "Minnesota", abbr: "MN" },
  mississippi: { name: "Mississippi", abbr: "MS" },
  missouri: { name: "Missouri", abbr: "MO" },
  montana: { name: "Montana", abbr: "MT" },
  nebraska: { name: "Nebraska", abbr: "NE" },
  nevada: { name: "Nevada", abbr: "NV" },
  "new-hampshire": { name: "New Hampshire", abbr: "NH" },
  "new-jersey": { name: "New Jersey", abbr: "NJ" },
  "new-mexico": { name: "New Mexico", abbr: "NM" },
  "new-york": { name: "New York", abbr: "NY" },
  "north-carolina": { name: "North Carolina", abbr: "NC" },
  "north-dakota": { name: "North Dakota", abbr: "ND" },
  ohio: { name: "Ohio", abbr: "OH" },
  oklahoma: { name: "Oklahoma", abbr: "OK" },
  oregon: { name: "Oregon", abbr: "OR" },
  pennsylvania: { name: "Pennsylvania", abbr: "PA" },
  "rhode-island": { name: "Rhode Island", abbr: "RI" },
  "south-carolina": { name: "South Carolina", abbr: "SC" },
  "south-dakota": { name: "South Dakota", abbr: "SD" },
  tennessee: { name: "Tennessee", abbr: "TN" },
  texas: { name: "Texas", abbr: "TX" },
  utah: { name: "Utah", abbr: "UT" },
  vermont: { name: "Vermont", abbr: "VT" },
  virginia: { name: "Virginia", abbr: "VA" },
  washington: { name: "Washington", abbr: "WA" },
  "west-virginia": { name: "West Virginia", abbr: "WV" },
  wisconsin: { name: "Wisconsin", abbr: "WI" },
  wyoming: { name: "Wyoming", abbr: "WY" },
};

const STATE_SLUGS = Object.keys(STATE_META);

function escape(s) {
  if (s === null || s === undefined) return "null";
  return JSON.stringify(String(s));
}
// For fields typed as `string` (not `string | null`), coerce null → empty string
function escapeStr(s) {
  return JSON.stringify(s !== null && s !== undefined ? String(s) : "");
}
function escapeArray(arr) {
  if (!arr || !arr.length) return "[]";
  return `[${arr.map((e) => JSON.stringify(String(e))).join(", ")}]`;
}

async function generateForCharge({ slug, file, varName, helperPrefix }) {
  const { data, error } = await supabase
    .from("jurisdiction_statutes")
    .select("*")
    .eq("common_charge_slug", slug)
    .eq("active", true);
  if (error) throw error;

  const byJurisdiction = new Map();
  for (const row of data) {
    byJurisdiction.set(row.jurisdiction, row);
  }

  const entries = [];
  for (const stateSlug of STATE_SLUGS) {
    const meta = STATE_META[stateSlug];
    const row = byJurisdiction.get(meta.abbr) || byJurisdiction.get(stateSlug) || byJurisdiction.get(meta.name) || null;
    if (!row) {
      console.warn(`  [${slug}] MISSING: ${stateSlug}`);
      continue;
    }
    const note =
      row.notes ||
      `${meta.name} ${slug.replace(/-/g, " ")} penalties reflect current ${meta.name} law. Verify against the statute before relying on this data for any individual case.`;

    entries.push(`  "${stateSlug}": {
    name: ${escapeStr(meta.name)},
    abbr: ${escapeStr(meta.abbr)},
    statuteNumber: ${escapeStr(row.statute_number)},
    statuteTitle: ${escapeStr(row.statute_title)},
    offenseClass: ${escapeStr(row.offense_class)},
    penaltyMin: ${escapeStr(row.penalty_min)},
    penaltyMax: ${escapeStr(row.penalty_max)},
    fineMax: ${escapeStr(row.fine_max)},
    mandatoryMinimum: ${escape(row.mandatory_minimum)},
    enhancements: ${escapeArray(row.enhancements)},
    note: ${escapeStr(note)},
  }`);
  }

  const out = `/**
 * State-specific ${slug} data for US states.
 * Generated from jurisdiction_statutes Supabase table.
 * Regenerate via: node scripts/generate-state-charge-data.mjs
 */
import type { StateChargeData } from "./state-charge-types";

export const ${varName}: Record<string, StateChargeData> = {
${entries.join(",\n")},
};

export function all${helperPrefix}Slugs(): string[] {
  return Object.keys(${varName});
}

export function get${helperPrefix}Data(slug: string): StateChargeData | null {
  return ${varName}[slug] ?? null;
}
`;

  writeFileSync(join("src/data", file), out, "utf8");
  console.log(`  [${slug}] wrote ${entries.length} states → src/data/${file}`);
}

async function main() {
  for (const cfg of Object.values(CHARGES)) {
    console.log(`\nGenerating ${cfg.file} ...`);
    await generateForCharge(cfg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
