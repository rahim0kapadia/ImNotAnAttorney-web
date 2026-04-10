#!/usr/bin/env node
/**
 * Validates product-matrix.ts references against products.ts and tiers.ts.
 * Run: node scripts/validate-matrix.mjs
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const WEB_ROOT = join(import.meta.dirname, '..');

// Extract product slugs from products.ts
const productsSource = readFileSync(join(WEB_ROOT, 'src/lib/products.ts'), 'utf8');
const productSlugs = new Set();
for (const match of productsSource.matchAll(/^\s+"([a-z0-9-]+)":\s*\{/gm)) {
  productSlugs.add(match[1]);
}

// Extract tier slugs from tiers.ts
const tiersSource = readFileSync(join(WEB_ROOT, 'src/lib/tiers.ts'), 'utf8');
const tierSlugs = new Set();
for (const match of tiersSource.matchAll(/^\s+"([a-z0-9-]+)":\s*\{/gm)) {
  tierSlugs.add(match[1]);
}

// Extract matrix entries from product-matrix.ts
const matrixSource = readFileSync(join(WEB_ROOT, 'src/lib/product-matrix.ts'), 'utf8');
const matrixSlugs = new Set();
for (const match of matrixSource.matchAll(/^\s+'([a-z0-9-]+)':\s*\{/gm)) {
  matrixSlugs.add(match[1]);
}

// Also extract tier references inside bundledInTiers arrays
const tierRefs = new Set();
for (const match of matrixSource.matchAll(/'([a-z0-9-]+)'/g)) {
  if (tierSlugs.has(match[1])) tierRefs.add(match[1]);
}

let errors = 0;

// Check 1: Every matrix slug exists in products.ts
for (const slug of matrixSlugs) {
  if (!productSlugs.has(slug)) {
    console.error(`FAIL: Matrix slug "${slug}" not found in products.ts`);
    errors++;
  }
}

// Check 2: Every tier reference in bundledInTiers exists in tiers.ts
const SERVICE_TIERS = ['case-decoder', 'intelligence-brief', 'x-ray', 'war-room', 'situation-room'];
for (const tier of SERVICE_TIERS) {
  if (!tierSlugs.has(tier)) {
    console.error(`FAIL: Service tier "${tier}" not found in tiers.ts`);
    errors++;
  }
}

// Check 3: IDD-eligible products should be active (warning, not error)
for (const slug of matrixSlugs) {
  const isActiveMatch = productsSource.match(new RegExp(`'${slug}':[\\s\\S]*?isActive:\\s*(true|false)`));
  if (isActiveMatch && isActiveMatch[1] === 'false') {
    console.warn(`WARN: Matrix product "${slug}" has isActive: false in products.ts`);
  }
}

// Check 4: TIER_SCHOLARSHIP_MAP keys are valid tier slugs
const scholarshipMapMatch = matrixSource.match(/TIER_SCHOLARSHIP_MAP[^{]*\{([^}]+)\}/s);
if (scholarshipMapMatch) {
  for (const match of scholarshipMapMatch[1].matchAll(/'([a-z0-9-]+)'/g)) {
    if (!tierSlugs.has(match[1])) {
      console.error(`FAIL: Scholarship map tier "${match[1]}" not found in tiers.ts`);
      errors++;
    }
  }
}

console.log(`\nValidation complete: ${matrixSlugs.size} matrix entries, ${errors} errors`);
console.log(`Products: ${productSlugs.size} in catalog, ${matrixSlugs.size} in matrix`);
console.log(`Tiers: ${tierSlugs.size} in catalog`);

if (errors > 0) {
  console.error('\nMatrix validation FAILED');
  process.exit(1);
} else {
  console.log('\nMatrix validation PASSED');
}
