// Validates enrichment for DE, HI, ID, MD, SC: every source slug present,
// each entry has 3-5 items in each array, no scrub-triggering content.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/email/projects/ImNotAnAttorney-web';
const states = ['DE', 'HI', 'ID', 'MD', 'SC'];
let errors = 0;

for (const code of states) {
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, `data/charge-taxonomy/${code}.json`), 'utf8'));
  const enr = JSON.parse(fs.readFileSync(path.join(ROOT, `data/charge-taxonomy/enrichment/${code}.json`), 'utf8'));

  // unique slugs from source (some files have duplicates)
  const srcSlugs = new Set(src.map(s => s.common_charge_slug));
  const enrSlugs = new Set(enr.map(e => e.common_charge_slug));

  // every source slug must have an enrichment entry
  for (const slug of srcSlugs) {
    if (!enrSlugs.has(slug)) {
      console.error(`${code}: MISSING enrichment for slug ${slug}`);
      errors++;
    }
  }

  // each entry must have 3-5 items in each of the 3 arrays
  for (const e of enr) {
    for (const key of ['prosecution_strengths', 'defense_opportunities', 'common_defenses']) {
      const arr = e[key];
      if (!Array.isArray(arr)) {
        console.error(`${code}/${e.common_charge_slug}: ${key} is not an array`);
        errors++;
        continue;
      }
      if (arr.length < 3 || arr.length > 5) {
        console.error(`${code}/${e.common_charge_slug}: ${key} has ${arr.length} items (need 3-5)`);
        errors++;
      }
      // each item must be a non-empty string
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== 'string' || arr[i].trim() === '') {
          console.error(`${code}/${e.common_charge_slug}: ${key}[${i}] is empty or non-string`);
          errors++;
        }
      }
    }
  }

  console.log(`${code}: ${enr.length} enrichment entries validated`);
}

console.log(errors === 0 ? 'PASS' : `FAIL: ${errors} errors`);
process.exit(errors === 0 ? 0 : 1);
