#!/usr/bin/env node
/**
 * check-price-staleness.mjs
 *
 * Validates that every `// anchor:SLUG` marker in src/ TypeScript files
 * references a dollar value >= the canonical product price from tiers.ts.
 *
 * Also checks that playbook totalValue sums match the sum of their
 * component anchor values.
 *
 * Exit 0 on success, 1 on failure.
 *
 * Usage:
 *   node scripts/check-price-staleness.mjs
 *
 * Design note: no file-level regex — uses indexOf loops and string methods
 * to comply with the no-regex-on-files hook.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// ── Resolve project root ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// ── Playbook slugs to check totalValue sums for ───────────────────────────────

const PLAYBOOK_SLUGS = [
  "dui-first-offense",
  "drug-possession",
  "probation-violation",
  "white-collar",
  "sex-offense",
  "federal-criminal",
  "drug-trafficking",
  "self-defense",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts and .tsx files under a directory.
 */
function collectTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Parse a dollar string like "$1,432" or "$197" into an integer (cents * 100 not needed —
 * we compare display strings, so just parse to whole dollars).
 * Returns NaN if unparseable.
 */
function parseDollar(str) {
  // Remove $ and commas, parse as integer
  const cleaned = str.replace("$", "").replace(/,/g, "").trim();
  return parseInt(cleaned, 10);
}

/**
 * Extract price-display mappings from tiers.ts text.
 * Parses the TIER_CORE object looking for slug keys and their priceDisplay values.
 * Returns Map<slug, priceDisplay string> e.g. "dui-first-offense" -> "$127"
 */
function parseTierPrices(tiersText) {
  const prices = new Map();
  const lines = tiersText.split("\n");

  let currentSlug = null;
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect slug line: `"some-slug": {`
    // Look for pattern: starts with quote, contains hyphen, ends with `: {`
    if (trimmed.startsWith('"') && trimmed.indexOf('": {') !== -1) {
      const closeQuote = trimmed.indexOf('"', 1);
      if (closeQuote > 1) {
        const candidate = trimmed.slice(1, closeQuote);
        // Must contain a hyphen to be a slug (filters out property names like "name")
        if (candidate.indexOf("-") !== -1) {
          currentSlug = candidate;
        }
      }
    }

    // Detect priceDisplay line within a slug block
    if (currentSlug !== null && trimmed.indexOf("priceDisplay:") !== -1) {
      // Extract quoted value after priceDisplay:
      const colonIdx = trimmed.indexOf("priceDisplay:");
      const afterColon = trimmed.slice(colonIdx + "priceDisplay:".length).trim();
      if (afterColon.startsWith('"')) {
        const closeQuote = afterColon.indexOf('"', 1);
        if (closeQuote > 1) {
          const display = afterColon.slice(1, closeQuote);
          if (!prices.has(currentSlug)) {
            prices.set(currentSlug, display);
          }
        }
      }
      currentSlug = null; // reset after capturing
    }

    // Reset slug tracking when we hit the closing brace of a tier block
    // (heuristic: a line that is just `},` at the root level)
    // This isn't perfect but doesn't need to be — slug resets on next slug line anyway
  }

  return prices;
}

/**
 * Scan a file's text for `// anchor:SLUG` markers.
 * Returns array of { lineNum, slug, valueStr } for each match found.
 *
 * The anchor pattern is: `value: "$NNN", // anchor:SLUG`
 * or more generally: any line containing `// anchor:SLUG` with a dollar amount.
 */
function extractAnchors(text, filePath) {
  const anchors = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const anchorToken = "// anchor:";
    const anchorIdx = line.indexOf(anchorToken);
    if (anchorIdx === -1) continue;

    // Extract slug: everything after "// anchor:" to end of line (trimmed)
    const slugRaw = line.slice(anchorIdx + anchorToken.length).trim();
    if (!slugRaw) continue;

    // Extract dollar value from the same line
    // Look for first "$" on the line
    const dollarIdx = line.indexOf("$");
    if (dollarIdx === -1) continue;

    // Extract the dollar amount: from "$" to the next non-digit/non-comma/non-period char
    let valueEnd = dollarIdx + 1;
    while (valueEnd < line.length) {
      const ch = line[valueEnd];
      if (ch >= "0" && ch <= "9") {
        valueEnd++;
      } else if (ch === ",") {
        valueEnd++;
      } else {
        break;
      }
    }
    const valueStr = line.slice(dollarIdx, valueEnd).trim();
    if (!valueStr || valueStr === "$") continue;

    anchors.push({
      lineNum: i + 1,
      slug: slugRaw,
      valueStr,
      filePath,
    });
  }

  return anchors;
}

/**
 * For each PLAYBOOK_SLUG, extract anchor values from the file text and sum them.
 * Also extract the totalValue for comparison.
 * Returns Map<slug, { anchorSum: number, totalValueStr: string }>
 */
function extractPlaybookTotals(text) {
  const lines = text.split("\n");
  const slugSums = new Map(); // slug -> sum of anchor dollar values
  const totalValues = new Map(); // slug -> totalValue string

  // Build per-slug anchor sums
  for (const line of lines) {
    const anchorToken = "// anchor:";
    const anchorIdx = line.indexOf(anchorToken);
    if (anchorIdx === -1) continue;

    const slug = line.slice(anchorIdx + anchorToken.length).trim();
    if (!slug) continue;

    const dollarIdx = line.indexOf("$");
    if (dollarIdx === -1) continue;

    let valueEnd = dollarIdx + 1;
    while (valueEnd < line.length) {
      const ch = line[valueEnd];
      if (ch >= "0" && ch <= "9") {
        valueEnd++;
      } else if (ch === ",") {
        valueEnd++;
      } else {
        break;
      }
    }
    const valueStr = line.slice(dollarIdx, valueEnd);
    const dollars = parseDollar(valueStr);
    if (isNaN(dollars)) continue;

    slugSums.set(slug, (slugSums.get(slug) || 0) + dollars);
  }

  // Extract totalValue lines: `    totalValue: "$1,432",`
  // We need to correlate them with slugs. Walk the file to find each playbook block.
  // Strategy: find slug assignment lines and the next totalValue line.
  let inSlug = null;
  let afterValueStack = false;
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect `slug: "some-slug",`
    if (trimmed.startsWith("slug:")) {
      const afterColon = trimmed.slice("slug:".length).trim();
      if (afterColon.startsWith('"')) {
        const closeQuote = afterColon.indexOf('"', 1);
        if (closeQuote > 1) {
          inSlug = afterColon.slice(1, closeQuote);
          afterValueStack = false;
        }
      }
    }

    // Detect `valueStack: {` — the next totalValue belongs to this slug
    if (inSlug && trimmed === "valueStack: {") {
      afterValueStack = true;
    }

    // Detect `totalValue: "$X,XXX",`
    if (inSlug && afterValueStack && trimmed.indexOf("totalValue:") !== -1) {
      const afterColon = trimmed.slice(trimmed.indexOf("totalValue:") + "totalValue:".length).trim();
      if (afterColon.startsWith('"')) {
        const closeQuote = afterColon.indexOf('"', 1);
        if (closeQuote > 1) {
          totalValues.set(inSlug, afterColon.slice(1, closeQuote));
          afterValueStack = false;
        }
      }
    }
  }

  return { slugSums, totalValues };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const tiersPath = path.join(SRC, "lib", "tiers.ts");
const tiersText = readFileSync(tiersPath, "utf8");
const tierPrices = parseTierPrices(tiersText);

// Scan all .ts/.tsx files under src/ for anchor markers
const allTsFiles = collectTsFiles(SRC);

const failures = [];
let totalMarkers = 0;

for (const filePath of allTsFiles) {
  const text = readFileSync(filePath, "utf8");
  const anchors = extractAnchors(text, filePath);
  if (anchors.length === 0) continue;

  totalMarkers += anchors.length;

  for (const { lineNum, slug, valueStr, filePath: fp } of anchors) {
    const productPrice = tierPrices.get(slug);
    if (!productPrice) {
      // Unknown slug — warn but don't fail (might be intentional)
      console.warn(`  WARN: ${path.relative(ROOT, fp)}:${lineNum} — anchor:${slug} — slug not found in tiers.ts`);
      continue;
    }

    const anchorDollars = parseDollar(valueStr);
    const productDollars = parseDollar(productPrice);

    if (isNaN(anchorDollars) || isNaN(productDollars)) {
      failures.push(
        `  ${path.relative(ROOT, fp)}:${lineNum} — anchor:${slug} value ${valueStr} unparseable (product price: ${productPrice})`
      );
      continue;
    }

    if (anchorDollars < productDollars) {
      failures.push(
        `  ${path.relative(ROOT, fp)}:${lineNum} — anchor:${slug} value ${valueStr} < product price ${productPrice} FAIL`
      );
    }
  }
}

// ── Playbook totalValue sum check ─────────────────────────────────────────────

const playbookConfigsPath = path.join(SRC, "lib", "playbook-configs.ts");
const playbookText = readFileSync(playbookConfigsPath, "utf8");
const { slugSums, totalValues } = extractPlaybookTotals(playbookText);

const sumFailures = [];
for (const slug of PLAYBOOK_SLUGS) {
  const anchorSum = slugSums.get(slug);
  const totalValueStr = totalValues.get(slug);

  if (anchorSum === undefined) {
    sumFailures.push(`  playbook ${slug} — no anchor values found`);
    continue;
  }
  if (!totalValueStr) {
    sumFailures.push(`  playbook ${slug} — no totalValue found`);
    continue;
  }

  const totalValueDollars = parseDollar(totalValueStr);
  if (isNaN(totalValueDollars)) {
    sumFailures.push(`  playbook ${slug} — totalValue ${totalValueStr} unparseable`);
    continue;
  }

  if (anchorSum !== totalValueDollars) {
    sumFailures.push(
      `  playbook ${slug} — totalValue ${totalValueStr} ($${totalValueDollars}) != anchor sum $${anchorSum} FAIL`
    );
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

const allFailures = [...failures, ...sumFailures];

if (allFailures.length > 0) {
  console.log("FAILURES:");
  for (const f of allFailures) {
    console.log(f);
  }
  console.log(`RESULT: ${totalMarkers} markers checked, ${allFailures.length} mismatches`);
  process.exit(1);
} else {
  console.log(`RESULT: ${totalMarkers} markers checked, 0 mismatches`);
  process.exit(0);
}
