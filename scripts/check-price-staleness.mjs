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
 * Design note: no file-level regex, uses indexOf loops and string methods
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
 * Parse a dollar string like "$1,432" or "$197" into an integer (cents * 100 not needed,
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
    // This isn't perfect but doesn't need to be, slug resets on next slug line anyway
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

    // Detect `valueStack: {`, the next totalValue belongs to this slug
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
      // Unknown slug, warn but don't fail (might be intentional)
      console.warn(`  WARN: ${path.relative(ROOT, fp)}:${lineNum}, anchor:${slug}, slug not found in tiers.ts`);
      continue;
    }

    const anchorDollars = parseDollar(valueStr);
    const productDollars = parseDollar(productPrice);

    if (isNaN(anchorDollars) || isNaN(productDollars)) {
      failures.push(
        `  ${path.relative(ROOT, fp)}:${lineNum}, anchor:${slug} value ${valueStr} unparseable (product price: ${productPrice})`
      );
      continue;
    }

    if (anchorDollars < productDollars) {
      failures.push(
        `  ${path.relative(ROOT, fp)}:${lineNum}, anchor:${slug} value ${valueStr} < product price ${productPrice} FAIL`
      );
    }
  }
}

// ── Layer 1 raw-hardcode scan (tsx files) ────────────────────────────────────
// Scans .tsx files for raw "$NNN" / "$N,NNN" literals that match one of our
// tier priceDisplay values. These are Layer 1 violations per
// src/lib/PRICING-ARCHITECTURE.md — should read from TIER_CORE dynamically.
//
// Allowlist (lines are skipped):
//   - Line is a comment (trimmed starts with //, *, or the whole line is
//     inside /* ... */ block).
//   - Line contains `// anchor:SLUG` (Layer 2 anchor).
//   - Line contains `// layer3-competitor` (e.g., "attorneys charge $200").
//   - Line contains `// layer3-testimonial` (verbatim customer quote,
//     frozen at time of quote).
//   - Line contains `// layer3-prose-stakes` (Layer 3 stakes() function
//     receiving price param — value is for a different product than OUR
//     tier, or is the product's own price reinterpolated elsewhere).

const ALLOWLIST_MARKERS = [
  "// anchor:",
  "// layer3-competitor",
  "// layer3-testimonial",
  "// layer3-prose-stakes",
];

function isCommentLine(line) {
  const t = line.trim();
  // JS/TS line + block comments
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return true;
  // JSX comments: entire line is a {/* ... */} block
  if (t.startsWith("{/*") && (t.endsWith("*/}") || t.indexOf("*/}") !== -1)) return true;
  return false;
}

function scanFileForRawHardcodes(text, filePath, tierDollarSet) {
  const findings = [];
  const lines = text.split("\n");
  let inBlockComment = false;
  let inJsxComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track /* ... */ block comments
    if (inBlockComment) {
      if (trimmed.indexOf("*/") !== -1) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*") && trimmed.indexOf("*/") === -1) {
      inBlockComment = true;
      continue;
    }

    // Track {/* ... */} multi-line JSX comments
    if (inJsxComment) {
      if (line.indexOf("*/}") !== -1) inJsxComment = false;
      continue;
    }
    if (trimmed.startsWith("{/*") && line.indexOf("*/}") === -1) {
      inJsxComment = true;
      continue;
    }

    if (isCommentLine(line)) continue;

    // Skip if any allowlist marker is on this line OR any preceding
    // non-blank line (common pattern: comment marker on line above the
    // long string literal; formatters may insert blank lines between).
    let allowlisted = false;
    for (const marker of ALLOWLIST_MARKERS) {
      if (line.indexOf(marker) !== -1) {
        allowlisted = true;
        break;
      }
      // Walk backward past blank lines, look at the first non-blank line
      // above. Stop if we hit a code line that isn't blank and isn't
      // purely a comment — that means no marker attaches to this line.
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      if (j >= 0 && lines[j].indexOf(marker) !== -1) {
        allowlisted = true;
        break;
      }
    }
    if (allowlisted) continue;

    // Find all "$<digits>" occurrences on the line
    let scan = 0;
    while (scan < line.length) {
      const dollarIdx = line.indexOf("$", scan);
      if (dollarIdx === -1) break;

      // Skip if preceded by `\`` (template string) AND the char before the
      // backtick is `{` — this is a template-literal `${...}` interpolation,
      // not a price literal.
      if (
        dollarIdx + 1 < line.length &&
        line[dollarIdx + 1] === "{"
      ) {
        scan = dollarIdx + 2;
        continue;
      }

      // Parse the dollar amount
      let valueEnd = dollarIdx + 1;
      while (valueEnd < line.length) {
        const ch = line[valueEnd];
        if ((ch >= "0" && ch <= "9") || ch === ",") {
          valueEnd++;
        } else {
          break;
        }
      }
      const valueStr = line.slice(dollarIdx, valueEnd);
      if (valueStr.length <= 1) {
        scan = dollarIdx + 1;
        continue;
      }

      // Only flag if value matches one of OUR tier priceDisplay values
      // (ignore competitor anchors like "$10K" or "$200-400 attorney fees"
      // that use different numbers).
      if (tierDollarSet.has(valueStr)) {
        findings.push({
          filePath,
          lineNum: i + 1,
          valueStr,
          lineText: trimmed.slice(0, 100),
        });
      }

      scan = valueEnd;
    }
  }

  return findings;
}

const tierDollarSet = new Set(tierPrices.values());

const rawHardcodeFailures = [];
const SCAN_DIRS = [path.join(SRC, "app"), path.join(SRC, "components")];
for (const dir of SCAN_DIRS) {
  const files = collectTsFiles(dir).filter((f) => f.endsWith(".tsx"));
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    const findings = scanFileForRawHardcodes(text, filePath, tierDollarSet);
    for (const f of findings) {
      rawHardcodeFailures.push(
        `  ${path.relative(ROOT, f.filePath)}:${f.lineNum} — raw ${f.valueStr} matches a TIER_CORE priceDisplay; use dynamic lookup or mark with // layer3-competitor / // layer3-testimonial / // layer3-prose-stakes. Context: ${f.lineText}`
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
    sumFailures.push(`  playbook ${slug}, no anchor values found`);
    continue;
  }
  if (!totalValueStr) {
    sumFailures.push(`  playbook ${slug}, no totalValue found`);
    continue;
  }

  const totalValueDollars = parseDollar(totalValueStr);
  if (isNaN(totalValueDollars)) {
    sumFailures.push(`  playbook ${slug}, totalValue ${totalValueStr} unparseable`);
    continue;
  }

  if (anchorSum !== totalValueDollars) {
    sumFailures.push(
      `  playbook ${slug}, totalValue ${totalValueStr} ($${totalValueDollars}) != anchor sum $${anchorSum} FAIL`
    );
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

const allFailures = [...failures, ...sumFailures, ...rawHardcodeFailures];

if (allFailures.length > 0) {
  console.log("FAILURES:");
  for (const f of allFailures) {
    console.log(f);
  }
  console.log(
    `RESULT: ${totalMarkers} anchor markers + ${rawHardcodeFailures.length === 0 ? "0" : rawHardcodeFailures.length} Layer-1 hardcodes, ${allFailures.length} total mismatches`
  );
  process.exit(1);
} else {
  console.log(
    `RESULT: ${totalMarkers} anchor markers checked, 0 Layer-1 hardcodes, 0 mismatches`
  );
  process.exit(0);
}
