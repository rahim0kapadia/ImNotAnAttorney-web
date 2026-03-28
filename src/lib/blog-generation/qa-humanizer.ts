/**
 * @fileoverview Humanizer QA gate — pure TypeScript, no external API calls.
 *
 * Detects AI-generated writing patterns using 10 detectors across vocabulary,
 * style, structure, and uniformity dimensions. Returns a composite score;
 * content passes when compositeScore < 45.
 *
 * NO regex on content — all text processing uses split/includes/indexOf/startsWith.
 */

import type { HumanizerDetails, HumanizerFlag } from "@/lib/types/blog-pipeline";

// ── Tier 1 vocabulary — hallmarks of AI-generated prose ──
const TIER1_WORDS = [
  "delve", "tapestry", "vibrant", "crucial", "meticulous", "seamless",
  "groundbreaking", "landscape", "paradigm", "synergy", "robust", "leverage",
  "utilize", "streamline", "innovative", "cutting-edge", "game-changer",
  "holistic", "impactful", "actionable",
];

// ── Tier 2 density words — common but suspicious at high density ──
const TIER2_WORDS = [
  "furthermore", "moreover", "additionally", "consequently", "nevertheless",
  "comprehensive", "facilitate", "implement", "optimize", "enhance",
  "significantly",
];

// ── Filler phrases ──
const FILLER_PHRASES = [
  "it's worth noting that",
  "in order to",
  "at the end of the day",
  "when it comes to",
  "in today's",
];

// ── Sycophancy markers ──
const SYCOPHANCY_MARKERS = [
  "great question",
  "absolutely",
  "i hope this helps",
  "feel free to ask",
];

// ── Generic conclusion phrases ──
const GENERIC_CONCLUSIONS = [
  "the future looks bright",
  "in conclusion",
  "time will tell",
  "only time will tell",
  "remains to be seen",
];

// ── Copula avoidance phrases ──
const COPULA_AVOIDANCE = ["serves as", "acts as", "functions as"];
const COPULA_SIMPLE = [" is ", " are ", " was ", " were "];

// ── Hedging words ──
const HEDGING_WORDS = ["could", "might", "possibly", "potentially", "perhaps", "arguably"];

// ── Sentence-ending characters ──
const SENTENCE_ENDERS = new Set([".", "!", "?"]);

// ── Word-boundary characters (anything non-alphanumeric) ──
const WORD_SEPARATORS = new Set([
  " ", "\t", "\n", "\r", ".", ",", "!", "?", ";", ":", "'", '"',
  "(", ")", "[", "]", "{", "}", "-", "_", "/", "\\", "@", "#",
  "$", "%", "^", "&", "*", "+", "=", "<", ">", "|", "~", "`",
]);

/** Strip YAML/MDX frontmatter (everything between first --- pair). */
function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return content;
  const secondDash = trimmed.indexOf("---", 3);
  if (secondDash === -1) return content;
  return trimmed.slice(secondDash + 3).trimStart();
}

/**
 * Split text into sentences by walking character-by-character.
 * Splits after . ! ? when followed by whitespace (no regex on content).
 */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    current += ch;

    if (SENTENCE_ENDERS.has(ch)) {
      // Look ahead for whitespace
      let j = i + 1;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j++;
      // If at end of text, or next char is uppercase/newline, treat as sentence boundary
      if (j >= text.length || text[j] === "\n" || (text[j] >= "A" && text[j] <= "Z")) {
        const trimmed = current.trim();
        if (trimmed.length > 0) sentences.push(trimmed);
        current = "";
        i = j;
        continue;
      }
    }
    i++;
  }

  const remaining = current.trim();
  if (remaining.length > 0) sentences.push(remaining);
  return sentences;
}

/**
 * Split text into lowercase word tokens by walking character-by-character.
 * Avoids regex on content — uses the WORD_SEPARATORS set instead.
 */
function splitWords(text: string): string[] {
  const words: string[] = [];
  let word = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toLowerCase();
    if (WORD_SEPARATORS.has(ch)) {
      if (word.length > 0) {
        words.push(word);
        word = "";
      }
    } else {
      word += ch;
    }
  }
  if (word.length > 0) words.push(word);
  return words;
}

/**
 * Count non-overlapping occurrences of needle in haystack using indexOf loop.
 * Both inputs must already be the same case (caller lowercases before calling).
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + needle.length;
  }
  return count;
}

/** Standard deviation of a number array. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Uniformity score (0–100): measures type-token ratio and sentence-length burstiness.
 * Low TTR + low burstiness = high uniformity = more AI-like = higher score.
 */
function computeUniformityScore(text: string): number {
  const words = splitWords(text);
  const sentences = splitSentences(text);

  if (words.length === 0) return 50;

  // Type-token ratio: unique words / total words. High TTR = more varied = human.
  const uniqueWords = new Set(words).size;
  const ttr = uniqueWords / words.length; // 0..1, higher = more human

  // Sentence-length variance (burstiness): high std dev = more human
  const sentenceLengths = sentences.map((s) => splitWords(s).length);
  const burstiness = stdDev(sentenceLengths);

  // Normalise TTR: human prose ~0.40-0.60, AI ~0.25-0.35
  const ttrScore = Math.max(0, Math.min(100, ((0.55 - ttr) / 0.30) * 100));

  // Normalise burstiness: human prose std_dev ~8-15, AI ~3-6
  const burstiScore = Math.max(0, Math.min(100, ((8 - burstiness) / 8) * 100));

  return ttrScore * 0.5 + burstiScore * 0.5;
}

/**
 * Check if a line looks like a Markdown list item.
 * Accepts: "- text", "* text", "• text", "1. text", "1) text"
 * Uses startsWith + character checks — no regex.
 */
function isMarkdownListItem(line: string): boolean {
  if (line.length === 0) return false;

  // Unordered: starts with "- ", "* ", "• "
  if (
    (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) &&
    line.length > 2
  ) {
    return true;
  }

  // Ordered: starts with digit(s) followed by "." or ")" then space
  let i = 0;
  while (i < line.length && line[i] >= "0" && line[i] <= "9") i++;
  if (i > 0 && i < line.length && (line[i] === "." || line[i] === ")")) {
    if (i + 1 < line.length && line[i + 1] === " ") return true;
  }

  return false;
}

/**
 * Strip the list prefix from a line ("- ", "* ", "1. ", etc.).
 * Uses indexOf/slice — no regex.
 */
function stripListPrefix(line: string): string {
  // Unordered
  if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
    return line.slice(2);
  }
  // Ordered: skip leading digits + "." or ")" + space
  let i = 0;
  while (i < line.length && line[i] >= "0" && line[i] <= "9") i++;
  if (i > 0 && i < line.length && (line[i] === "." || line[i] === ")")) {
    return line.slice(i + 2); // skip separator + space
  }
  return line;
}

/**
 * Run the humanizer detection suite on the body text of an MDX blog post.
 *
 * @param mdxContent - Full MDX source including frontmatter.
 * @returns { passed, score, details }
 */
export function runHumanizerCheck(mdxContent: string): {
  passed: boolean;
  score: number;
  details: HumanizerDetails;
} {
  const body = stripFrontmatter(mdxContent);
  const bodyLower = body.toLowerCase();
  const words = splitWords(body);
  const sentences = splitSentences(body);
  const wordCount = Math.max(words.length, 1);
  const per1000 = wordCount / 1000;

  let totalPatternPoints = 0;
  const flaggedPatterns: HumanizerFlag[] = [];

  // ── Detector 1: Tier 1 vocabulary scan ──────────────────────────────────────
  {
    let totalOccurrences = 0;
    const matches: string[] = [];
    for (const word of TIER1_WORDS) {
      const hits = countOccurrences(bodyLower, word.toLowerCase());
      if (hits > 0) {
        totalOccurrences += hits;
        matches.push(`${word} (x${hits})`);
      }
    }
    if (totalOccurrences > 0) {
      const pts = Math.min(60, totalOccurrences * 15);
      totalPatternPoints += pts;
      flaggedPatterns.push({
        detector: "tier1_vocabulary",
        severity: "tier1",
        count: totalOccurrences,
        matches: matches.slice(0, 10),
        points_added: pts,
      });
    }
  }

  // ── Detector 2: Tier 2 density check ────────────────────────────────────────
  {
    let tier2Count = 0;
    const matches: string[] = [];
    for (const word of TIER2_WORDS) {
      const hits = countOccurrences(bodyLower, word.toLowerCase());
      if (hits > 0) {
        tier2Count += hits;
        matches.push(`${word} (x${hits})`);
      }
    }
    const density = tier2Count / per1000;
    if (density > 3) {
      totalPatternPoints += 10;
      flaggedPatterns.push({
        detector: "tier2_density",
        severity: "tier2",
        count: tier2Count,
        matches,
        points_added: 10,
      });
    }
  }

  // ── Detector 3: Sentence length variance ────────────────────────────────────
  {
    const sentenceLengths = sentences.map((s) => splitWords(s).length);
    const sd = stdDev(sentenceLengths);
    if (sd < 5 && sentences.length >= 5) {
      totalPatternPoints += 15;
      flaggedPatterns.push({
        detector: "sentence_length_variance",
        severity: "style",
        count: sentences.length,
        matches: [`std_dev=${sd.toFixed(2)}`],
        points_added: 15,
      });
    }
  }

  // ── Detector 4: Em dash density ─────────────────────────────────────────────
  {
    const emDashCount =
      countOccurrences(body, "\u2014") + // — (true em dash)
      countOccurrences(body, "--");       // -- (double hyphen stand-in)
    const density = emDashCount / per1000;
    if (density > 3) {
      totalPatternPoints += 10;
      flaggedPatterns.push({
        detector: "em_dash_density",
        severity: "style",
        count: emDashCount,
        matches: [`${emDashCount} em dashes in ${wordCount} words`],
        points_added: 10,
      });
    }
  }

  // ── Detector 5: Copula avoidance ─────────────────────────────────────────────
  {
    let avoidanceCount = 0;
    let simpleCount = 0;
    for (const phrase of COPULA_AVOIDANCE) {
      avoidanceCount += countOccurrences(bodyLower, phrase);
    }
    for (const word of COPULA_SIMPLE) {
      simpleCount += countOccurrences(bodyLower, word);
    }
    const total = avoidanceCount + simpleCount;
    const ratio = total > 0 ? avoidanceCount / total : 0;
    if (ratio > 0.3 && avoidanceCount > 0) {
      totalPatternPoints += 10;
      flaggedPatterns.push({
        detector: "copula_avoidance",
        severity: "style",
        count: avoidanceCount,
        matches: [`avoidance ratio ${(ratio * 100).toFixed(1)}%`],
        points_added: 10,
      });
    }
  }

  // ── Detector 6: Generic conclusions ──────────────────────────────────────────
  {
    // Only scan last 200 characters for conclusion phrases
    const tail = bodyLower.length > 200 ? bodyLower.slice(bodyLower.length - 200) : bodyLower;
    const matches: string[] = [];
    for (const phrase of GENERIC_CONCLUSIONS) {
      if (tail.includes(phrase)) matches.push(phrase);
    }
    if (matches.length > 0) {
      totalPatternPoints += 10;
      flaggedPatterns.push({
        detector: "generic_conclusions",
        severity: "style",
        count: matches.length,
        matches,
        points_added: 10,
      });
    }
  }

  // ── Detector 7: Hedging density ──────────────────────────────────────────────
  {
    if (sentences.length > 0) {
      let hedgedCount = 0;
      for (const sentence of sentences) {
        const sl = sentence.toLowerCase();
        let found = false;
        for (const w of HEDGING_WORDS) {
          if (sl.includes(w)) {
            found = true;
            break;
          }
        }
        if (found) hedgedCount++;
      }
      const hedgePct = hedgedCount / sentences.length;
      if (hedgePct > 0.15) {
        totalPatternPoints += 10;
        flaggedPatterns.push({
          detector: "hedging_density",
          severity: "style",
          count: hedgedCount,
          matches: [`${(hedgePct * 100).toFixed(1)}% of sentences hedged`],
          points_added: 10,
        });
      }
    }
  }

  // ── Detector 8: Filler phrase scan ───────────────────────────────────────────
  {
    let fillerPts = 0;
    const matches: string[] = [];
    for (const phrase of FILLER_PHRASES) {
      const hits = countOccurrences(bodyLower, phrase);
      if (hits > 0) {
        fillerPts += hits * 5;
        matches.push(`"${phrase}" (x${hits})`);
      }
    }
    if (fillerPts > 0) {
      totalPatternPoints += fillerPts;
      flaggedPatterns.push({
        detector: "filler_phrases",
        severity: "filler",
        count: matches.length,
        matches,
        points_added: fillerPts,
      });
    }
  }

  // ── Detector 9: Sycophancy markers ───────────────────────────────────────────
  {
    let sycoPts = 0;
    const matches: string[] = [];
    for (const marker of SYCOPHANCY_MARKERS) {
      const hits = countOccurrences(bodyLower, marker);
      if (hits > 0) {
        sycoPts += hits * 10;
        matches.push(`"${marker}" (x${hits})`);
      }
    }
    if (sycoPts > 0) {
      totalPatternPoints += sycoPts;
      flaggedPatterns.push({
        detector: "sycophancy_markers",
        severity: "sycophancy",
        count: matches.length,
        matches,
        points_added: sycoPts,
      });
    }
  }

  // ── Detector 10: Rule of three ───────────────────────────────────────────────
  // Detect 3+ consecutive list items of similar word length (within 3 words).
  // Uses isMarkdownListItem + stripListPrefix — no regex on content.
  {
    const lines = body.split("\n");
    let ruleOfThreeInstances = 0;
    let runStart = -1;

    for (let i = 0; i <= lines.length; i++) {
      const line = i < lines.length ? lines[i].trim() : "";
      const inList = i < lines.length && isMarkdownListItem(line);

      if (inList) {
        if (runStart === -1) runStart = i;
      } else {
        if (runStart !== -1) {
          const runLen = i - runStart;
          if (runLen >= 3) {
            const runWordCounts = lines
              .slice(runStart, i)
              .map((l) => splitWords(stripListPrefix(l.trim())).length);
            const sd = stdDev(runWordCounts);
            if (sd <= 3) ruleOfThreeInstances++;
          }
          runStart = -1;
        }
      }
    }

    if (ruleOfThreeInstances > 2) {
      totalPatternPoints += 5;
      flaggedPatterns.push({
        detector: "rule_of_three",
        severity: "style",
        count: ruleOfThreeInstances,
        matches: [`${ruleOfThreeInstances} uniform list runs`],
        points_added: 5,
      });
    }
  }

  // ── Composite score ──────────────────────────────────────────────────────────
  const patternScore = Math.min(100, totalPatternPoints);
  const uniformityScore = computeUniformityScore(body);
  const compositeScore = patternScore * 0.7 + uniformityScore * 0.3;

  const details: HumanizerDetails = {
    composite_score: Math.round(compositeScore * 10) / 10,
    pattern_score: patternScore,
    uniformity_score: Math.round(uniformityScore * 10) / 10,
    flagged_patterns: flaggedPatterns,
  };

  return {
    passed: compositeScore < 45,
    score: details.composite_score,
    details,
  };
}
