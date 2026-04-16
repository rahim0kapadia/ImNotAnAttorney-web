#!/usr/bin/env node
/**
 * check-tiers.mjs, Verifies tier names and prices in markdown docs
 * match the single source of truth in src/lib/tiers.ts.
 *
 * Usage: node scripts/check-tiers.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Parse tiers.ts to extract name/price pairs
const tiersPath = join(process.cwd(), "src/lib/tiers.ts");
if (!existsSync(tiersPath)) {
  console.error("ERROR: src/lib/tiers.ts not found. Run from project root.");
  process.exit(1);
}

const tiersSource = readFileSync(tiersPath, "utf8");

// Extract all priceDisplay values and their tier names
const tiers = [];
const tierRegex = /"([a-z-]+)":\s*\{[^}]*name:\s*"([^"]+)"[^}]*priceDisplay:\s*"(\$[\d,]+)"/g;
let match;
while ((match = tierRegex.exec(tiersSource)) !== null) {
  tiers.push({ slug: match[1], name: match[2], price: match[3] });
}

if (tiers.length === 0) {
  console.error("ERROR: Could not parse any tiers from tiers.ts");
  process.exit(1);
}

console.log(`Found ${tiers.length} tiers in tiers.ts:\n`);
for (const t of tiers) {
  console.log(`  ${t.slug}: ${t.name} @ ${t.price}`);
}
console.log();

// Docs to check (relative to project root or parent repo)
const docsToCheck = [
  { path: "../ImNotAnAttorney/CLAUDE.md", label: "CLAUDE.md" },
  { path: "../ImNotAnAttorney/docs/PRD.md", label: "PRD.md" },
  { path: "../ImNotAnAttorney/docs/SERVICES.md", label: "SERVICES.md" },
  { path: "TODO.md", label: "TODO.md" },
];

let issues = 0;

for (const doc of docsToCheck) {
  const fullPath = join(process.cwd(), doc.path);
  if (!existsSync(fullPath)) {
    console.log(`SKIP: ${doc.label} not found at ${fullPath}`);
    continue;
  }

  const content = readFileSync(fullPath, "utf8");
  const lines = content.split("\n");

  for (const tier of tiers) {
    // Skip tiers that might not be in every doc
    const nameInDoc = content.includes(tier.name);
    if (!nameInDoc) continue;

    // Look for the tier name near a dollar amount
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(tier.name)) continue;

      // Extract dollar amounts from this line
      const dollarMatches = line.match(/\$[\d,]+/g);
      if (!dollarMatches) continue;

      // Check if any dollar amount on this line matches (or doesn't)
      const hasCorrectPrice = dollarMatches.includes(tier.price);
      const hasWrongPrice = dollarMatches.some(
        (d) => d !== tier.price && !isKnownOtherAmount(d, tier.slug)
      );

      if (hasWrongPrice && !hasCorrectPrice) {
        console.log(
          `MISMATCH: ${doc.label}:${i + 1}, "${tier.name}" has ${dollarMatches.join(", ")} but expected ${tier.price}`
        );
        issues++;
      }
    }
  }
}

// Some dollar amounts near tier names are legitimate (upgrade costs, attorney costs, etc.)
function isKnownOtherAmount(amount, slug) {
  const known = [
    "$800", "$1,500", "$2,500", "$5,000", "$100", "$2,200", // upgrade costs
    "$5,000", "$10,000", "$25,000", "$100,000", "$500,000", // attorney costs
    "$10K", "$30K", "$100K", // compressed attorney costs
    "$0", // free tier
  ];
  return known.includes(amount);
}

if (issues === 0) {
  console.log("\nAll tier prices consistent across docs.");
} else {
  console.log(`\n${issues} potential mismatch(es) found.`);
  process.exit(1);
}
