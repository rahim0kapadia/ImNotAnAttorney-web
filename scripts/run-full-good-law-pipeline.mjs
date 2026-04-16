/**
 * Run the full good-law pipeline end-to-end.
 * Chains: dump → phase 1 → phase 2 → phase 3 → phase 4 (apply) → reference URLs
 *
 * Run this in a terminal and walk away. No AI session needed.
 *
 * Usage:
 *   node scripts/run-full-good-law-pipeline.mjs              # Full run
 *   node scripts/run-full-good-law-pipeline.mjs --dry-run    # Phase 4 dry-run only
 */

import { execSync } from "child_process";

const dryRun = process.argv.includes("--dry-run");
const phase4Flag = dryRun ? "--phase 4 --dry-run" : "--phase 4 --apply";

const steps = [
  { cmd: "node scripts/bulk-dump-cases.mjs", desc: "Step 1/6: Refresh dump" },
  { cmd: "node scripts/bulk-good-law-from-graph.mjs --phase 1", desc: "Step 2/6: Opinions CSV → cluster→opinion map" },
  { cmd: "node scripts/bulk-good-law-from-graph.mjs --phase 2", desc: "Step 3/6: Citation-map → citing graph" },
  { cmd: "node scripts/bulk-good-law-from-graph.mjs --phase 3", desc: "Step 4/6: Opinions CSV → citing texts" },
  { cmd: `node scripts/bulk-good-law-from-graph.mjs ${phase4Flag}`, desc: "Step 5/6: Scan + apply is_good_law" },
  { cmd: "node scripts/bulk-add-reference-urls.mjs", desc: "Step 6/6: Add reference URLs to new rows" },
];

const startTime = Date.now();

for (let i = 0; i < steps.length; i++) {
  const { cmd, desc } = steps[i];
  const stepStart = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${desc}`);
  console.log(`  Command: ${cmd}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
    const elapsed = ((Date.now() - stepStart) / 1000 / 60).toFixed(1);
    console.log(`\n  Done in ${elapsed} min`);
  } catch (e) {
    console.error(`\n  FAILED (exit code ${e.status})`);
    console.error(`  Fix the issue and re-run from this step:`);
    console.error(`  ${cmd}`);
    process.exit(1);
  }
}

const totalMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log(`\n${"=".repeat(60)}`);
console.log(`  PIPELINE COMPLETE, ${totalMin} min total`);
console.log(`${"=".repeat(60)}`);
