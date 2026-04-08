#!/usr/bin/env node
/**
 * Full Pipeline Runner — Load, Verify, Classify
 *
 * Runs the complete charge taxonomy + case law pipeline outside of Claude Code.
 * Zero Claude/Anthropic tokens consumed. Uses only:
 *   - Supabase Management API (SUPABASE_ACCESS_TOKEN from parent repo)
 *   - CourtListener API (COURTLISTENER_TOKEN from .env.local)
 *
 * Usage (run from a regular terminal, NOT Claude Code):
 *   node scripts/run-full-pipeline.mjs              # Run everything
 *   node scripts/run-full-pipeline.mjs --skip-load  # Skip step 1
 *   node scripts/run-full-pipeline.mjs --skip-verify # Skip step 2
 *   node scripts/run-full-pipeline.mjs --classify-limit 500  # Limit step 3
 *
 * Estimated time: 6-12 hours total (rate-limited, respectful to APIs)
 *   Step 1: ~2 minutes (load jurisdiction data)
 *   Step 2: ~2-3 hours (verify statutes + find case law via CourtListener)
 *   Step 3: ~3-6 hours (classify cases + verify good law)
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const skipLoad = args.includes("--skip-load");
const skipVerify = args.includes("--skip-verify");
const limitIdx = args.indexOf("--classify-limit");
const classifyLimit = limitIdx >= 0 ? args[limitIdx + 1] : null;

function run(label, cmd) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log(`\n  OK: ${label} — COMPLETE (${new Date().toISOString()})`);
    return true;
  } catch (err) {
    console.error(`\n  FAIL: ${label} (exit code ${err.status})`);
    console.error(`  Command: ${cmd}`);
    return false;
  }
}

async function main() {
  console.log("============================================================");
  console.log("  INAA Full Pipeline — Load, Verify, Classify");
  console.log("  Zero Claude/Anthropic tokens. CourtListener + Supabase");
  console.log("============================================================");
  console.log(`\nStarted: ${new Date().toISOString()}`);
  console.log(`Skip load: ${skipLoad}, Skip verify: ${skipVerify}`);
  if (classifyLimit) console.log(`Classify limit: ${classifyLimit}`);

  const startTime = Date.now();

  // Step 1: Load jurisdiction data into Supabase
  if (!skipLoad) {
    const ok = run(
      "Step 1/3: Load jurisdiction statute data into Supabase",
      "node scripts/load-jurisdiction-data.mjs --all"
    );
    if (!ok) {
      console.error("\nStep 1 failed. Fix the error and re-run.");
      process.exit(1);
    }
  } else {
    console.log("\n  Skipping Step 1 (--skip-load)");
  }

  // Step 2: Verify statutes + find case law via CourtListener
  if (!skipVerify) {
    const ok = run(
      "Step 2/3: Verify statutes + find real case law (CourtListener)",
      "node scripts/legal-research-all.mjs"
    );
    if (!ok) {
      console.error("\nStep 2 failed. Check COURTLISTENER_TOKEN and retry.");
      console.error("Re-run with: node scripts/run-full-pipeline.mjs --skip-load");
      process.exit(1);
    }
  } else {
    console.log("\n  Skipping Step 2 (--skip-verify)");
  }

  // Step 3: Classify cases + verify good law
  const classifyCmd = classifyLimit
    ? `node scripts/classify-case-law.mjs --limit ${classifyLimit}`
    : "node scripts/classify-case-law.mjs";

  const ok = run(
    "Step 3/3: Classify cases + verify good law (negative treatment check)",
    classifyCmd
  );
  if (!ok) {
    console.error("\nStep 3 failed. Re-run with:");
    console.error("  node scripts/run-full-pipeline.mjs --skip-load --skip-verify");
    process.exit(1);
  }

  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  PIPELINE COMPLETE`);
  console.log(`  Total time: ${elapsed} minutes`);
  console.log(`  Finished: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nVerify results:`);
  console.log(`  node scripts/legal-research-all.mjs --summary`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
