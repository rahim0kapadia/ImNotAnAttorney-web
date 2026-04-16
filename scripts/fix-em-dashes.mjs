// fix-em-dashes.mjs — Replace all em dashes in blog MDX files.
//
// Em dashes are a top AI writing tell. This script replaces them all
// with commas. Simple, safe, grammatically correct in every position.
//
// Usage: node scripts/fix-em-dashes.mjs [--dry-run]
//
// Safe: only touches content, never filenames/slugs/URLs.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const BLOG_DIR = join(import.meta.dirname, "..", "content", "blog");
const dryRun = process.argv.includes("--dry-run");

/** Count actual em dashes (Unicode + standalone --), ignoring --- and table separators */
function countEmDashes(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    // Unicode em dash
    if (text[i] === "\u2014") {
      count++;
      continue;
    }
    // Double hyphen: only count if NOT part of --- or longer run of dashes
    if (text[i] === "-" && text[i + 1] === "-" && text[i + 2] !== "-") {
      // Check char before isn't also a dash
      if (i === 0 || text[i - 1] !== "-") {
        count++;
        i++; // skip second dash
      }
    }
  }
  return count;
}

/**
 * Replace all em dashes in text.
 * Preserves --- (YAML frontmatter delimiters and markdown horizontal rules).
 * Replaces both Unicode em dash and double-hyphen.
 */
function replaceEmDashes(text) {
  // Step 1: Protect --- sequences by replacing with a placeholder
  const PLACEHOLDER = "\x00TRIPLE_DASH\x00";
  let result = text.split("---").join(PLACEHOLDER);

  // Step 2: Replace -- (double hyphen) with comma
  // " -- " → ", "
  // "--" (no spaces) → ", "
  result = result.split(" -- ").join(", ");
  result = result.split("--").join(", ");

  // Step 3: Replace Unicode em dash
  // " — " → ", "
  // "—" (no spaces) → ", "
  result = result.split(" \u2014 ").join(", ");
  result = result.split("\u2014").join(", ");

  // Step 4: Restore --- sequences
  result = result.split(PLACEHOLDER).join("---");

  return result;
}

// ── Main ──

const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));
let totalFixed = 0;
let totalDashes = 0;
const results = [];

for (const file of files) {
  const filePath = join(BLOG_DIR, file);
  const content = readFileSync(filePath, "utf8");

  const dashCount =
    countEmDashes(content);

  if (dashCount === 0) continue;

  totalDashes += dashCount;

  const fixed = replaceEmDashes(content);

  // Verify no em dashes remain
  const remaining =
    countEmDashes(fixed);

  if (!dryRun) {
    writeFileSync(filePath, fixed, "utf8");
  }

  totalFixed++;
  results.push({
    file,
    before: dashCount,
    after: remaining,
  });
}

// Summary
console.log(dryRun ? "[DRY RUN]" : "[APPLIED]");
console.log(`Files processed: ${totalFixed}/${files.length}`);
console.log(`Em dashes found: ${totalDashes}`);
console.log("");

const incomplete = results.filter((r) => r.after > 0);
if (incomplete.length > 0) {
  console.log("WARNING, files with remaining em dashes:");
  for (const r of incomplete) {
    console.log(`  ${r.after} remaining\t${r.file}`);
  }
} else {
  console.log("All em dashes removed successfully.");
}
