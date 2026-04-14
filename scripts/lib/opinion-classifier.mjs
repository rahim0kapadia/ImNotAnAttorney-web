/**
 * Structural Opinion Classifier
 *
 * Classifies opinions into one of 4 types based on word count and structural
 * markers. Determines which extraction steps run and weighting in aggregates.
 *
 * Types:
 *   'full'        — >1000 words with analysis section (weight: 1.0)
 *   'memorandum'  — 500-1000 words (weight: 0.8)
 *   'pca'         — <500 words OR 'PER CURIAM' + 'Affirmed' (weight: 0.3)
 *   'order'       — <200 words (weight: 0.5)
 */

export const OPINION_TYPE_WEIGHTS = {
  full: 1.0,
  memorandum: 0.8,
  order: 0.5,
  pca: 0.3,
};

/**
 * Count words in text without regex (hook-enforced: no regex on file contents).
 * Uses charCodeAt to detect word boundaries (space, tab, newline).
 */
function countWords(text) {
  if (!text || text.length === 0) return 0;
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    // space=32, tab=9, newline=10, carriage-return=13
    const isWhitespace = (ch === 32 || ch === 9 || ch === 10 || ch === 13);
    if (!isWhitespace) {
      if (!inWord) { count++; inWord = true; }
    } else {
      inWord = false;
    }
  }
  return count;
}

/**
 * Check if text contains a substring (case-insensitive).
 * Uses indexOf on lowered text. No regex.
 */
function containsCI(text, needle) {
  return text.indexOf(needle) >= 0;
}

/**
 * Classify an opinion's structure.
 *
 * @param {string} text — plain text of the opinion (HTML already stripped)
 * @returns {{ type: string, wordCount: number, confidence: string }}
 */
export function classifyOpinionType(text) {
  if (!text) return { type: "order", wordCount: 0, confidence: "high" };

  const wordCount = countWords(text);
  const lower = text.toLowerCase();

  // PCA detection: "per curiam" + affirm/affirmed in short opinions
  const hasPerCuriam = containsCI(lower, "per curiam");
  const hasAffirmed = containsCI(lower, "affirmed") || containsCI(lower, "affirm");

  // Order: <200 words
  if (wordCount < 200) {
    return { type: "order", wordCount, confidence: "high" };
  }

  // PCA: <500 words OR per curiam + affirmed with no substantial analysis
  if (wordCount < 500) {
    if (hasPerCuriam && hasAffirmed) {
      return { type: "pca", wordCount, confidence: "high" };
    }
    // Short but not PCA — still classify as PCA if very short, order if ambiguous
    if (hasPerCuriam) {
      return { type: "pca", wordCount, confidence: "medium" };
    }
    return { type: "pca", wordCount, confidence: "medium" };
  }

  // Check for PCA markers even in longer opinions (unusual but happens)
  if (hasPerCuriam && hasAffirmed && wordCount < 800) {
    // Short-ish per curiam with affirmed — classify as PCA
    return { type: "pca", wordCount, confidence: "medium" };
  }

  // Memorandum: 500-1000 words
  if (wordCount < 1000) {
    return { type: "memorandum", wordCount, confidence: "high" };
  }

  // Full opinion: >1000 words
  // Additional confidence check: look for analysis markers
  const hasAnalysis =
    containsCI(lower, "we hold") ||
    containsCI(lower, "we find") ||
    containsCI(lower, "we conclude") ||
    containsCI(lower, "analysis") ||
    containsCI(lower, "discussion") ||
    containsCI(lower, "we reverse") ||
    containsCI(lower, "we affirm") ||
    containsCI(lower, "standard of review");

  return {
    type: "full",
    wordCount,
    confidence: hasAnalysis ? "high" : "medium",
  };
}

/**
 * Determine which extraction steps to run based on opinion type.
 *
 * @param {string} opinionType — 'full', 'memorandum', 'pca', 'order'
 * @returns {{ extractCharges: boolean, extractMotions: boolean, extractTheories: boolean, extractOutcomes: boolean, extractHolding: boolean }}
 */
export function getExtractionSteps(opinionType) {
  switch (opinionType) {
    case "full":
      return { extractCharges: true, extractMotions: true, extractTheories: true, extractOutcomes: true, extractHolding: true };
    case "memorandum":
      return { extractCharges: true, extractMotions: true, extractTheories: true, extractOutcomes: true, extractHolding: true };
    case "pca":
      // PCA: outcome only (affirmed). Skip motion/theory/holding.
      return { extractCharges: true, extractMotions: false, extractTheories: false, extractOutcomes: true, extractHolding: false };
    case "order":
      // Order: outcome from ORDER language only.
      return { extractCharges: true, extractMotions: true, extractTheories: false, extractOutcomes: true, extractHolding: false };
    default:
      return { extractCharges: true, extractMotions: true, extractTheories: true, extractOutcomes: true, extractHolding: true };
  }
}
