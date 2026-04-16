/**
 * validate-test-reports.mjs
 *
 * Mirrors the validateReportContent() function from the Supabase Edge Function
 * (supabase/functions/generate-report/index.ts) and runs it against all 3 test
 * report markdown files.
 *
 * Usage: node validate-test-reports.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// ---------------------------------------------------------------------------
// validateReportContent, mirrors edge function logic exactly
// ---------------------------------------------------------------------------
function validateReportContent(markdown) {
  const violations = [];
  const lower = markdown.toLowerCase();

  // 1. Banned phrases (case-insensitive)
  const bannedPhrases = [
    "fire your attorney",
    "publicly available",
    "consult your attorney",
    "you should",
    "you need to",
    "we recommend",
    "we advise",
    "file a complaint",
  ];
  for (const phrase of bannedPhrases) {
    if (lower.includes(phrase)) {
      // Find ALL occurrences with surrounding context
      let idx = 0;
      while ((idx = lower.indexOf(phrase, idx)) !== -1) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(markdown.length, idx + phrase.length + 40);
        const context = markdown.slice(start, end).replace(/\n/g, " ");
        violations.push({
          type: "BANNED_PHRASE",
          detail: `Banned phrase: "${phrase}"`,
          context: `...${context}...`,
        });
        idx += phrase.length;
      }
    }
  }

  // 2. Unsourced collateral claims, sentences mentioning collateral topics
  //    without a statute citation (section, U.S.C., F.S., C.F.R., or case name "v.")
  //    and without "ask your attorney"
  const collateralTopics = [
    "employment",
    "housing",
    "immigration",
    "financial aid",
    "background check",
    "voting",
    "firearms",
  ];
  const sentences = markdown.split(/[.!?]\s+/);
  for (const sentence of sentences) {
    const sentLower = sentence.toLowerCase();
    const matchedTopics = collateralTopics.filter((t) =>
      sentLower.includes(t)
    );
    if (matchedTopics.length > 0) {
      const hasCitation = /§|U\.S\.C\.|F\.S\.|C\.F\.R\.| v\. /.test(sentence);
      const hasAskFrame = sentLower.includes("ask your attorney");
      if (!hasCitation && !hasAskFrame) {
        const preview = sentence.trim().slice(0, 120);
        violations.push({
          type: "UNSOURCED_COLLATERAL",
          detail: `Unsourced collateral claim (topics: ${matchedTopics.join(", ")})`,
          context: `${preview}...`,
        });
      }
    }
  }

  // 3. Pricing errors, $797 should be $800
  if (markdown.includes("$797")) {
    let idx = 0;
    while ((idx = markdown.indexOf("$797", idx)) !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(markdown.length, idx + 40);
      const context = markdown.slice(start, end).replace(/\n/g, " ");
      violations.push({
        type: "PRICING_ERROR",
        detail: `Pricing error: "$797" found (should be "$800 after credit")`,
        context: `...${context}...`,
      });
      idx += 4;
    }
  }

  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Main, run against all 3 test reports
// ---------------------------------------------------------------------------
const testReportsDir = join(
  "C:",
  "Users",
  "email",
  "projects",
  "ImNotAnAttorney-web",
  "test-reports"
);

const reportFiles = [
  "persona-a-dui.md",
  "persona-b-drug.md",
  "persona-c-whitecollar.md",
];

let totalViolations = 0;

console.log("=".repeat(80));
console.log("  REPORT CONTENT VALIDATION");
console.log("  Mirrors validateReportContent() from generate-report edge function");
console.log("=".repeat(80));
console.log();

for (const file of reportFiles) {
  const filePath = join(testReportsDir, file);
  let markdown;
  try {
    markdown = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.log(`  [SKIP] ${file}, file not found or unreadable`);
    console.log();
    continue;
  }

  const { valid, violations } = validateReportContent(markdown);
  totalViolations += violations.length;

  console.log("-".repeat(80));
  console.log(`  FILE: ${file}`);
  console.log(`  SIZE: ${markdown.length.toLocaleString()} chars`);
  console.log(
    `  RESULT: ${valid ? "PASS (0 violations)" : `FAIL (${violations.length} violation${violations.length === 1 ? "" : "s"})`}`
  );
  console.log("-".repeat(80));

  if (!valid) {
    // Group by type for readability
    const grouped = {};
    for (const v of violations) {
      if (!grouped[v.type]) grouped[v.type] = [];
      grouped[v.type].push(v);
    }

    for (const [type, items] of Object.entries(grouped)) {
      const label =
        type === "BANNED_PHRASE"
          ? "Banned Phrases"
          : type === "UNSOURCED_COLLATERAL"
            ? "Unsourced Collateral Claims"
            : type === "PRICING_ERROR"
              ? "Pricing Errors"
              : type;
      console.log();
      console.log(`  [${label}] (${items.length})`);
      for (let i = 0; i < items.length; i++) {
        console.log(`    ${i + 1}. ${items[i].detail}`);
        console.log(`       Context: ${items[i].context}`);
      }
    }
  }

  console.log();
}

console.log("=".repeat(80));
console.log(
  `  TOTAL: ${totalViolations} violation${totalViolations === 1 ? "" : "s"} across ${reportFiles.length} reports`
);
if (totalViolations === 0) {
  console.log("  All reports PASSED validation.");
} else {
  console.log("  Action required: fix violations before shipping.");
}
console.log("=".repeat(80));
