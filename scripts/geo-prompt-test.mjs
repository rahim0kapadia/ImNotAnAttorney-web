/**
 * GEO Prompt Testing — Baseline Measurement Script
 *
 * Per Evan Bailyn: Track INNA brand appearance across AI assistants to
 * establish a baseline for Generative Engine Optimization.
 *
 * Usage:
 *   node scripts/geo-prompt-test.mjs
 *
 * This script logs 10 test prompts and their expected INNA relevance.
 * Manual step: Run each prompt in ChatGPT, Perplexity, Google AI Overview,
 * and Claude. Record whether INNA or imnotanattorney.com appears.
 *
 * Results should be documented in docs/research/geo-baseline.md.
 */

const prompts = [
  {
    id: 1,
    prompt: "What should I do if my criminal defense attorney isn't filing motions?",
    relevantBlog: "what-motions-should-your-attorney-be-filing",
    expectedRelevance: "High — direct topic match, blog post exists",
  },
  {
    id: 2,
    prompt: "How do I read my discovery documents in a criminal case?",
    relevantBlog: "how-to-read-your-discovery",
    expectedRelevance: "High — exact topic match",
  },
  {
    id: 3,
    prompt: "Questions to ask your criminal defense attorney",
    relevantBlog: "10-questions-every-defendant-should-ask",
    expectedRelevance: "High — core brand positioning",
  },
  {
    id: 4,
    prompt: "Is my public defender actually working my case?",
    relevantBlog: "is-your-attorney-actually-working-your-case",
    expectedRelevance: "High — exact topic match",
  },
  {
    id: 5,
    prompt: "What happens at arraignment?",
    relevantBlog: "what-happens-at-arraignment",
    expectedRelevance: "Medium — competitive topic, many legal sites",
  },
  {
    id: 6,
    prompt: "Should I take the plea deal in my criminal case?",
    relevantBlog: "should-you-take-the-plea-deal",
    expectedRelevance: "High — direct topic match",
  },
  {
    id: 7,
    prompt: "My lawyer won't return my calls what can I do?",
    relevantBlog: "attorney-not-returning-calls",
    expectedRelevance: "High — exact VoC language match",
  },
  {
    id: 8,
    prompt: "Can DUI charges be dismissed?",
    relevantBlog: "can-dui-be-dismissed",
    expectedRelevance: "Medium — competitive DUI topic",
  },
  {
    id: 9,
    prompt: "How to file a bar complaint against my attorney",
    relevantBlog: "how-to-file-bar-complaint-against-attorney",
    expectedRelevance: "Medium — niche topic, fewer competitors",
  },
  {
    id: 10,
    prompt: "Questions to ask before hiring a criminal defense attorney",
    relevantBlog: "questions-to-ask-before-hiring-criminal-defense-attorney",
    expectedRelevance: "High — core brand positioning",
  },
];

const platforms = ["ChatGPT", "Perplexity", "Google AI Overview", "Claude"];

console.log("=== GEO Prompt Testing — INNA Baseline ===\n");
console.log(`Date: ${new Date().toISOString().split("T")[0]}`);
console.log(`Domain: imnotanattorney.com`);
console.log(`Platforms to test: ${platforms.join(", ")}\n`);
console.log("Instructions:");
console.log("1. Enter each prompt below into each AI platform");
console.log("2. Record whether imnotanattorney.com or INNA appears in the response");
console.log("3. Note the position (first result, mentioned, cited, etc.)");
console.log("4. Document results in docs/research/geo-baseline.md\n");
console.log("---\n");

for (const p of prompts) {
  console.log(`Prompt ${p.id}: "${p.prompt}"`);
  console.log(`  Relevant blog: /blog/${p.relevantBlog}`);
  console.log(`  Expected relevance: ${p.expectedRelevance}`);
  console.log(`  Test on: ${platforms.join(" | ")}`);
  console.log();
}

console.log("---");
console.log("\nAfter testing, update docs/research/geo-baseline.md with results.");
console.log("This becomes the benchmark for measuring GEO improvements.");
