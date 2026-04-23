#!/usr/bin/env node
/**
 * @fileoverview One-shot UPL drift sweep — replaces the "Your attorney remains
 * the final authority" family of phrases (banned by
 * ~/.claude/rules/no-hallucinated-legal-data.md) with a crisis-buyer-safe
 * replacement that owns the decision moment.
 *
 * Split + join substitution only (no regex on contents per project rule).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPLACEMENT = "Decisions about how to use this information stay with you.";

const EDITS = [
  { file: "src/app/resources/page.tsx", replacements: [
    ["Your attorney remains the final authority on strategy\n              decisions specific to your situation.", REPLACEMENT],
  ]},
  { file: "src/app/score/results/[token]/page.tsx", replacements: [
    ["Your attorney remains the final authority\n          on strategy decisions specific to your situation.", REPLACEMENT],
  ]},
  { file: "src/app/dui-defense/page.tsx", replacements: [
    ["Your attorney remains the\n            final authority on strategy decisions specific to your situation.", REPLACEMENT],
  ]},
  { file: "src/app/score/ScoreClient.tsx", replacements: [
    ["Your attorney remains the final authority on strategy decisions\n            specific to your situation.", REPLACEMENT],
  ]},
  { file: "src/app/arrest-survival-kit/page.tsx", replacements: [
    ["Your attorney remains the final authority on how to use this information in your defense.", REPLACEMENT],
    ["Your attorney remains the final authority on\n            your defense strategy.", REPLACEMENT],
  ]},
  { file: "src/app/officer-background-check/page.tsx", replacements: [
    ["Your attorney remains the final authority on how to use this information in your defense.", REPLACEMENT],
    ["Your attorney remains the final authority on\n            your defense strategy.", REPLACEMENT],
  ]},
  { file: "src/app/district-court-intelligence/page.tsx", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
    ["Your attorney remains the final authority on your defense\n            strategy.", REPLACEMENT],
  ]},
  { file: "src/app/arrested/page.tsx", replacements: [
    ["An attorney familiar with your jurisdiction and the specific facts of\n        your case remains the final authority on strategy decisions.",
      "Decisions about what to do with this information stay with you. If you have counsel, talk it over with them."],
  ]},
  { file: "src/app/intake/standalone/[slug]/IntakeFormClient.tsx", replacements: [
    ["Your\n        attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/guides/[slug]/page.tsx", replacements: [
    ["Your attorney\n        remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/plea-analyzer/page.tsx", replacements: [
    ["Your attorney\n          remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/playbooks/page.tsx", replacements: [
    ["Your attorney remains the\n            final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/report/standalone/[token]/page.tsx", replacements: [
    ["Your attorney remains the final\n          authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/services/[slug]/page.tsx", replacements: [
    ["Your\n          attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/checkout/page.tsx", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/judge-report-card/page.tsx", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/similar-cases-analyzer/page.tsx", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/lib/intelligence-brief/render.ts", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/lib/intelligence-brief/prompts.ts", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/lib/report-renderer.ts", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/lib/tier9-reports/render.ts", replacements: [
    ["Your attorney remains the final authority\n      on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/lib/playbook-configs.ts", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
  { file: "src/app/api/tools/sentencing-calculator/route.ts", replacements: [
    ["Your attorney remains the final authority on strategy decisions.", REPLACEMENT],
  ]},
];

let totalReplacements = 0;
const report = [];

for (const { file, replacements } of EDITS) {
  const abs = resolve(process.cwd(), file);
  let content;
  try {
    content = readFileSync(abs, "utf8");
  } catch (err) {
    report.push(`[MISS] ${file} — ${err.message}`);
    continue;
  }
  let fileChanges = 0;
  for (const [from, to] of replacements) {
    const parts = content.split(from);
    if (parts.length === 1) {
      report.push(`[NOTFOUND] ${file} :: "${from.slice(0, 60)}..."`);
      continue;
    }
    const hits = parts.length - 1;
    content = parts.join(to);
    fileChanges += hits;
    totalReplacements += hits;
  }
  if (fileChanges > 0) {
    writeFileSync(abs, content);
    report.push(`[OK] ${file} — ${fileChanges} replaced`);
  } else {
    report.push(`[SKIP] ${file} — no matches`);
  }
}

console.log(report.join("\n"));
console.log(`\nTotal replacements: ${totalReplacements}`);
