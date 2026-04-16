/**
 * Fix orphan slugs across all jurisdiction JSON files.
 * Remaps non-standard charge slug names to canonical COMMON_CHARGES slugs.
 * One-time script, delete after use.
 *
 * Usage: node scripts/fix-orphan-slugs.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data", "charge-taxonomy");

// Build valid slugs from generate-charge-taxonomy.ts
const tsContent = fs.readFileSync(path.resolve(__dirname, "generate-charge-taxonomy.ts"), "utf8");
const validSlugs = new Set();
const lines = tsContent.split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('slug: "')) {
    const slug = trimmed.split('"')[1];
    if (slug) validSlugs.add(slug);
  }
}
console.log("Valid COMMON_CHARGES slugs:", validSlugs.size);

// Remap table: orphan → canonical (null = skip/remove)
const REMAP = {
  "felony-dui": "dui-felony-injury",
  "dui-felony": "dui-felony-injury",
  "dui-manslaughter": "vehicular-manslaughter",
  "dui-causing-death": "vehicular-homicide",
  "dui-boating": null,
  "drug-sale-distribution": "drug-distribution",
  "drug-sale-second-degree": "drug-distribution",
  "drug-sale-third-degree": "drug-distribution",
  "drug-sale-fourth-degree": "drug-distribution",
  "drug-sale": "drug-distribution",
  "drug-trafficking-marijuana": "drug-trafficking",
  "drug-dui-schedule-i-ii": "dui-drugs",
  "assault-simple": "simple-assault",
  "assault": "simple-assault",
  "assault-fourth-degree": "simple-assault",
  "assault-felony": "aggravated-assault",
  "assault-first-degree": "aggravated-assault",
  "assault-third-degree": "aggravated-assault",
  "negligent-assault": "simple-assault",
  "felonious-assault": "aggravated-assault",
  "domestic-assault": "domestic-violence",
  "domestic-assault-strangulation": "domestic-battery",
  "battery-domestic-violence": "domestic-battery",
  "domestic-violence-strangulation": "domestic-battery",
  "murder-third-degree": "murder-second-degree",
  "murder": "murder-first-degree",
  "aggravated-murder": "murder-first-degree",
  "manslaughter-first-degree": "voluntary-manslaughter",
  "manslaughter-second-degree": "involuntary-manslaughter",
  "aggravated-robbery": "armed-robbery",
  "aggravated-burglary": "residential-burglary",
  "burglary-first-degree": "residential-burglary",
  "burglary-second-degree": "burglary",
  "burglary-third-degree": "commercial-burglary",
  "breaking-and-entering": "burglary",
  "theft": "theft-larceny",
  "grand-larceny": "grand-theft",
  "petit-larceny": "petty-theft",
  "theft-identity": "identity-theft",
  "fraud-financial": "fraud-general",
  "check-fraud": "bad-checks",
  "passing-bad-checks": "bad-checks",
  "misuse-of-credit-card": "credit-card-fraud",
  "fraud-credit-card": "credit-card-fraud",
  "criminal-sexual-conduct-first": "csc-first-degree",
  "criminal-sexual-conduct-third": "csc-third-degree",
  "criminal-sexual-conduct-fifth": "sex-offense-contact",
  "gross-sexual-imposition": "sex-offense-contact",
  "statutory-sexual-seduction": "statutory-rape",
  "lewdness-with-child": "child-exploitation",
  "open-or-gross-lewdness": "indecent-exposure",
  "solicitation-of-minor": "sex-offense-digital",
  "weapons-felon-in-possession": "felon-in-possession",
  "felon-in-possession-firearm": "felon-in-possession",
  "weapons-carry-without-permit": "concealed-carry-violation",
  "carrying-concealed-weapon": "concealed-carry-violation",
  "weapons-drive-by-shooting": "illegal-discharge",
  "weapons-under-disability": "felon-in-possession",
  "reckless-discharge-firearm": "illegal-discharge",
  "discharging-firearm": "illegal-discharge",
  "improperly-handling-firearm-vehicle": "unlawful-carry",
  "arson-first-degree": "arson",
  "arson-second-degree": "arson",
  "arson-third-degree": "arson",
  "aggravated-arson": "arson",
  "trespass": "trespassing",
  "fleeing-police": "fleeing-eluding",
  "eluding-police-foot": "fleeing-eluding",
  "evading-police": "fleeing-eluding",
  "fleeing-and-eluding": "fleeing-eluding",
  "criminal-damage-property": "criminal-mischief",
  "criminal-damaging": "criminal-mischief",
  "destruction-of-property": "vandalism",
  "violation-ofp": "violation-protective-order",
  "violation-protection-order": "violation-protective-order",
  "false-imprisonment": "unlawful-imprisonment",
  "child-abuse-neglect": "child-abuse",
  "endangering-children": "child-endangerment",
  "contributing-to-delinquency": null,
  "riot": "disorderly-conduct",
  "inducing-panic": "disorderly-conduct",
  "possession-of-burglary-tools": null,
  "financial-exploitation-vulnerable-adult": "financial-exploitation-elder",
  "methamphetamine-manufacturing": "drug-manufacturing",
  "interference-with-911": null,
  "criminal-vehicular-operation": "vehicular-homicide",
  "ovi-dui": "dui-dwi",
  "ovi-high-test": "dui-dwi",
  "ovi-refusal": "refusing-breath-test",
  "aggravated-vehicular-homicide": "vehicular-homicide",
  "vehicular-assault": "dui-felony-injury",
  "menacing": "criminal-threat",
  "aggravated-menacing": "criminal-threat",
  "menacing-by-stalking": "stalking",
  "abduction": "kidnapping",
  "kidnapping-second-degree": "kidnapping",
  "marijuana-possession": "drug-possession-marijuana",
  "aggravated-drug-possession": "drug-possession",
  "aggravated-trafficking-drugs": "drug-trafficking",
  "making-threats": "criminal-threat",
  "coercion": "extortion",
  "leaving-scene-accident": "hit-and-run",
  "habitual-criminal": null,
  "bail-jumping": "failure-to-appear",
  "battery-officer": "assault-police-officer",
  "possession-stolen-property": "receiving-stolen-property",
  "sex-offender-registration-violation": "failure-to-register",
  "failure-to-comply": "resisting-arrest",
  "obstructing-official-business": "obstruction-justice",
  "falsification": "false-report",
  "telecommunication-harassment": "harassment",
  "tampering-with-evidence": "obstruction-justice",
  "intimidation-of-witness": "witness-tampering",
  "soliciting": "solicitation-prostitution",
  "possessing-criminal-tools": null,
  "operating-without-license": "driving-on-suspended",
  "escape": "escape-custody",
  "escape-from-custody": "escape-custody",
  "interference-with-custody": null,
  "nonsupport-of-dependents": null,
  "unauthorized-use-of-vehicle": "motor-vehicle-theft",
  "failure-to-register-sex-offender": "failure-to-register",
  // Additional common remaps from other states
  "owi": "dui-dwi",
  "dwi": "dui-dwi",
  "oui": "dui-dwi",
  "duii": "dui-dwi",
  "aggravated-dui": "dui-felony-injury",
  "vehicular-assault-dui": "dui-felony-injury",
  "larceny": "theft-larceny",
  "petit-theft": "petty-theft",
  "petty-larceny": "petty-theft",
  "motor-vehicle-theft-unauthorized": "motor-vehicle-theft",
  "domestic-assault-by-strangulation": "domestic-battery",
  "violation-of-protective-order": "violation-protective-order",
  "violating-protective-order": "violation-protective-order",
  "driving-suspended-license": "driving-on-suspended",
  "driving-on-suspended-license": "driving-on-suspended",
  "eluding-police": "fleeing-eluding",
  "evading-arrest": "fleeing-eluding",
  "assault-deadly-weapon": "assault-with-deadly-weapon",
  "possession-marijuana": "drug-possession-marijuana",
  "possession-controlled-substance": "drug-possession",
  "possession-with-intent-distribute": "drug-possession-with-intent",
  "manslaughter-voluntary": "voluntary-manslaughter",
  "manslaughter-involuntary": "involuntary-manslaughter",
  "firearm-felon-in-possession": "felon-in-possession",
  "fraud-identity-theft": "identity-theft",
  "fraud-insurance": "insurance-fraud",
  "fraud-credit-card": "credit-card-fraud",
  "fraud-mortgage": "mortgage-fraud",
  "false-police-report": "false-report",
  "drunk-in-public": "public-intoxication",
  "dui-vehicular-homicide": "vehicular-homicide",
};

// Process all JSON files
const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && f !== "questions.json");
let totalFixed = 0;
let totalRemoved = 0;

for (const file of files) {
  const filepath = path.join(DATA_DIR, file);
  const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const seen = new Set();
  const cleaned = [];
  let fixed = 0;
  let removed = 0;

  for (const s of data) {
    let slug = s.common_charge_slug;

    if (!validSlugs.has(slug)) {
      if (slug in REMAP) {
        if (REMAP[slug] === null) {
          removed++;
          continue; // skip this entry
        }
        slug = REMAP[slug];
        s.common_charge_slug = slug;
        fixed++;
      } else {
        // Unknown orphan, skip
        console.log("  " + file + ": UNKNOWN orphan '" + slug + "', removed");
        removed++;
        continue;
      }
    }

    // Deduplicate
    if (seen.has(slug)) {
      removed++;
      continue;
    }
    seen.add(slug);
    cleaned.push(s);
  }

  if (fixed > 0 || removed > 0) {
    fs.writeFileSync(filepath, JSON.stringify(cleaned, null, 2));
    console.log(file + ": " + fixed + " remapped, " + removed + " removed, " + cleaned.length + " total");
    totalFixed += fixed;
    totalRemoved += removed;
  }
}

console.log("\nDone. " + totalFixed + " remapped, " + totalRemoved + " removed across " + files.length + " files.");
