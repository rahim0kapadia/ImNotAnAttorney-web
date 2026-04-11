// humanizer.mjs — Humanizer QA gate. Pure logic, no external API calls.
//
// Ported verbatim from ImNotAnAttorney-web/src/lib/blog-generation/qa-humanizer.ts
// (2026-04-09 blog engine port). Only change: TypeScript annotations and type
// imports removed. All detectors, constants, and scoring thresholds are identical.
//
// Detects AI-generated writing patterns using 14 detectors across vocabulary,
// style, structure, and uniformity dimensions. Returns a composite score;
// content passes when compositeScore < 45.
//
// 2026-04-10: Added Detector 14 (repeated_structural_transition).
//
// NO regex on content — all text processing uses split/includes/indexOf/startsWith.

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

// ── UPL-banned phrases (brand voice + UPL compliance) ──
// These phrases imply a human verification step the reader may never get.
// Any single occurrence adds 50 points, which fails the <45 composite threshold.
const UPL_BANNED_PHRASES = [
  "consult a licensed attorney",
  "consult a licensed criminal defense attorney",
  "consult a licensed criminal-defense attorney",
  "consult with a licensed attorney",
  "consult your attorney",
  "consult with your attorney",
  "consult an attorney",
  "verify with your attorney",
  "verify with a licensed attorney",
  "your attorney can confirm",
  "ask your attorney to verify",
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

// ── Emotional inflation phrases (Detector 12) ──
const EMOTIONAL_INFLATION_PHRASES = [
  "devastating consequences",
  "life-shattering",
  "life shattering",
  "absolutely critical",
  "cannot stress enough",
  "cannot overstate",
  "the stakes couldn't be higher",
  "the stakes could not be higher",
  "unimaginable",
  "catastrophic",
  "utterly devastating",
  "profoundly impactful",
  "truly remarkable",
  "incredibly important",
];

// ── Vague authority phrases (Detector 13) ──
const VAGUE_AUTHORITY_PHRASES = [
  "experts say",
  "experts agree",
  "studies show",
  "studies have shown",
  "research shows",
  "research indicates",
  "research suggests",
  "according to experts",
  "according to studies",
  "professionals recommend",
  "specialists recommend",
  "many experts believe",
  "some experts argue",
  "it is widely believed",
  "it is well known",
];

// ── Opener pattern classes (Detector 11) ──
const OPENER_QUESTION_WORDS = [
  "what", "when", "how", "why", "is", "are", "do", "does",
  "can", "should", "will", "would", "could", "who", "where", "which",
];
const OPENER_GENERIC_TRANSITIONS = [
  "when it comes to",
  "it's important to",
  "it is important to",
  "let's explore",
  "let's dive into",
  "picture this",
  "imagine this",
  "imagine that",
  "first things first",
  "at its core",
  "in essence",
  "simply put",
  "to put it simply",
  "the truth is",
  "the reality is",
];

// ── Repeated structural transition phrases (Detector 14) ──
const STRUCTURAL_TRANSITIONS = [
  "but here's what nobody mentions",
  "so the real question becomes",
  "here's the reality",
  "here's the thing",
];

// ── Sentence-ending characters ──
const SENTENCE_ENDERS = new Set([".", "!", "?"]);

// ── Word-boundary characters (anything non-alphanumeric) ──
const WORD_SEPARATORS = new Set([
  " ", "\t", "\n", "\r", ".", ",", "!", "?", ";", ":", "'", '"',
  "(", ")", "[", "]", "{", "}", "-", "_", "/", "\\", "@", "#",
  "$", "%", "^", "&", "*", "+", "=", "<", ">", "|", "~", "`",
]);

/** Strip YAML/MDX frontmatter (everything between first --- pair). */
function stripFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return content;
  const secondDash = trimmed.indexOf("---", 3);
  if (secondDash === -1) return content;
  return trimmed.slice(secondDash + 3).trimStart();
}

/** Split text into sentences by walking character-by-character. */
function splitSentences(text) {
  const sentences = [];
  let current = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    current += ch;

    if (SENTENCE_ENDERS.has(ch)) {
      let j = i + 1;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j++;
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

/** Split text into lowercase word tokens by walking character-by-character. */
function splitWords(text) {
  const words = [];
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

/** Count non-overlapping occurrences of needle in haystack using indexOf loop. */
function countOccurrences(haystack, needle) {
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
function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Uniformity score (0–100): type-token ratio + sentence-length burstiness.
 * Low TTR + low burstiness = high uniformity = more AI-like = higher score.
 */
function computeUniformityScore(text) {
  const words = splitWords(text);
  const sentences = splitSentences(text);

  if (words.length === 0) return 50;

  const uniqueWords = new Set(words).size;
  const ttr = uniqueWords / words.length;

  const sentenceLengths = sentences.map((s) => splitWords(s).length);
  const burstiness = stdDev(sentenceLengths);

  const ttrScore = Math.max(0, Math.min(100, ((0.55 - ttr) / 0.30) * 100));
  const burstiScore = Math.max(0, Math.min(100, ((8 - burstiness) / 8) * 100));

  return ttrScore * 0.5 + burstiScore * 0.5;
}

/** Check if a line looks like a Markdown list item. */
function isMarkdownListItem(line) {
  if (line.length === 0) return false;

  if (
    (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) &&
    line.length > 2
  ) {
    return true;
  }

  let i = 0;
  while (i < line.length && line[i] >= "0" && line[i] <= "9") i++;
  if (i > 0 && i < line.length && (line[i] === "." || line[i] === ")")) {
    if (i + 1 < line.length && line[i + 1] === " ") return true;
  }

  return false;
}

/** Strip the list prefix from a line ("- ", "* ", "1. ", etc.). */
function stripListPrefix(line) {
  if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
    return line.slice(2);
  }
  let i = 0;
  while (i < line.length && line[i] >= "0" && line[i] <= "9") i++;
  if (i > 0 && i < line.length && (line[i] === "." || line[i] === ")")) {
    return line.slice(i + 2);
  }
  return line;
}

/**
 * Run the humanizer detection suite on the body text of an MDX blog post.
 * Returns { passed, score, details }.
 */
export function runHumanizerCheck(mdxContent, options = {}) {
  const body = stripFrontmatter(mdxContent);
  const bodyLower = body.toLowerCase();
  const words = splitWords(body);
  const sentences = splitSentences(body);
  const wordCount = Math.max(words.length, 1);
  const per1000 = wordCount / 1000;

  let totalPatternPoints = 0;
  const flaggedPatterns = [];

  // ── Detector 1: Tier 1 vocabulary scan ──
  {
    let totalOccurrences = 0;
    const matches = [];
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

  // ── Detector 2: Tier 2 density check ──
  {
    let tier2Count = 0;
    const matches = [];
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

  // ── Detector 3: Sentence length variance ──
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

  // ── Detector 4: Em dash density ──
  {
    const emDashCount =
      countOccurrences(body, "\u2014") +
      countOccurrences(body, "--");
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

  // ── Detector 5: Copula avoidance ──
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

  // ── Detector 6: Generic conclusions ──
  {
    const tail = bodyLower.length > 200 ? bodyLower.slice(bodyLower.length - 200) : bodyLower;
    const matches = [];
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

  // ── Detector 7: Hedging density ──
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

  // ── Detector 8: Filler phrase scan ──
  {
    let fillerPts = 0;
    const matches = [];
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

  // ── Detector 9: Sycophancy markers ──
  {
    let sycoPts = 0;
    const matches = [];
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

  // ── Detector 9b: UPL-banned phrases (hard fail) ──
  {
    let uplPts = 0;
    const matches = [];
    for (const phrase of UPL_BANNED_PHRASES) {
      const hits = countOccurrences(bodyLower, phrase);
      if (hits > 0) {
        uplPts += hits * 50;
        matches.push(`"${phrase}" (x${hits})`);
      }
    }
    if (uplPts > 0) {
      totalPatternPoints += uplPts;
      flaggedPatterns.push({
        detector: "upl_banned_phrases",
        severity: "upl",
        count: matches.length,
        matches,
        points_added: uplPts,
      });
    }
  }

  // ── Detector 10: Rule of three ──
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

  // ── Detector 11: Formulaic openers ──
  {
    const lines = body.split("\n");
    const openerClasses = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed.startsWith("## ")) continue;
      if (trimmed.startsWith("### ")) continue;

      let openerLine = "";
      for (let j = i + 1; j < lines.length; j++) {
        const cand = lines[j].trim();
        if (cand.length === 0) continue;
        if (cand.startsWith("#")) break;
        if (cand.startsWith(">")) continue;
        openerLine = cand;
        break;
      }

      if (openerLine.length === 0) continue;

      const sentencesLocal = splitSentences(openerLine);
      const firstSentence = sentencesLocal.length > 0 ? sentencesLocal[0] : openerLine;
      const lower = firstSentence.toLowerCase();

      let openerClass = "";

      const firstWord = splitWords(firstSentence)[0] ?? "";
      if (firstSentence.endsWith("?")) {
        openerClass = "question";
      } else if (OPENER_QUESTION_WORDS.indexOf(firstWord) !== -1) {
        openerClass = "question";
      }

      if (openerClass === "") {
        for (const phrase of OPENER_GENERIC_TRANSITIONS) {
          if (lower.startsWith(phrase)) {
            openerClass = "generic_transition";
            break;
          }
        }
      }

      if (openerClass === "") {
        const wordsLocal = splitWords(firstSentence);
        if (
          wordsLocal.length >= 2 &&
          (wordsLocal[1] === "is" ||
            wordsLocal[1] === "means" ||
            wordsLocal[1] === "refers" ||
            wordsLocal[1] === "involves")
        ) {
          openerClass = "definition";
        }
      }

      if (openerClass !== "") {
        openerClasses.push(openerClass);
      }
    }

    const classCounts = {};
    for (const c of openerClasses) {
      classCounts[c] = (classCounts[c] ?? 0) + 1;
    }

    const formulaicClasses = [];
    for (const c of Object.keys(classCounts)) {
      if (classCounts[c] >= 3) formulaicClasses.push(c);
    }

    if (formulaicClasses.length > 0) {
      const pts = formulaicClasses.length * 10;
      totalPatternPoints += pts;
      const matches = formulaicClasses.map(
        (c) => `${c} opener (x${classCounts[c]})`
      );
      flaggedPatterns.push({
        detector: "formulaic_openers",
        severity: "style",
        count: formulaicClasses.length,
        matches,
        points_added: pts,
      });
    }
  }

  // ── Detector 12: Emotional inflation ──
  {
    let inflationCount = 0;
    const matches = [];
    for (const phrase of EMOTIONAL_INFLATION_PHRASES) {
      const hits = countOccurrences(bodyLower, phrase);
      if (hits > 0) {
        inflationCount += hits;
        matches.push(`"${phrase}" (x${hits})`);
      }
    }
    const density = inflationCount / per1000;
    if (density > 2) {
      const pts = 15;
      totalPatternPoints += pts;
      flaggedPatterns.push({
        detector: "emotional_inflation",
        severity: "style",
        count: inflationCount,
        matches,
        points_added: pts,
      });
    }
  }

  // ── Detector 13: Vague authority ──
  {
    let vagueCount = 0;
    const matches = [];

    for (const sentence of sentences) {
      const sLower = sentence.toLowerCase();
      for (const phrase of VAGUE_AUTHORITY_PHRASES) {
        if (sLower.indexOf(phrase) === -1) continue;
        if (sentence.indexOf("(") !== -1 && sentence.indexOf(")") !== -1) {
          continue;
        }
        vagueCount++;
        if (matches.length < 5) matches.push(`"${phrase}" (unsourced)`);
        break;
      }
    }

    if (vagueCount > 0) {
      const pts = vagueCount * 10;
      totalPatternPoints += pts;
      flaggedPatterns.push({
        detector: "vague_authority",
        severity: "style",
        count: vagueCount,
        matches,
        points_added: pts,
      });
    }
  }

  // ── Detector 14: Repeated structural transitions ──
  // Density-normalized: flags when a phrase appears more than once per 400 words.
  // A 1,500-word post gets threshold 4 (ceil(1500/400)). A 3,000-word post gets 8.
  // This catches repetition in new short-form posts without regressing on existing long-form.
  {
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const densityThreshold = Math.max(3, Math.ceil(wordCount / 400));
    const transitionCounts = {};
    for (const phrase of STRUCTURAL_TRANSITIONS) {
      const hits = countOccurrences(bodyLower, phrase);
      if (hits >= densityThreshold) {
        transitionCounts[phrase] = hits;
      }
    }

    const repeatedTransitions = Object.keys(transitionCounts);
    if (repeatedTransitions.length > 0) {
      let pts = 0;
      const matches = [];
      for (const phrase of repeatedTransitions) {
        const count = transitionCounts[phrase];
        pts += 15;
        matches.push(`"${phrase}" (x${count}, threshold ${densityThreshold})`);
      }
      totalPatternPoints += pts;
      flaggedPatterns.push({
        detector: "repeated_structural_transition",
        severity: "style",
        count: repeatedTransitions.length,
        matches,
        points_added: pts,
      });
    }
  }

  // ── Composite score ──
  const patternScore = Math.min(100, totalPatternPoints);
  const uniformityScore = computeUniformityScore(body);
  const compositeScore = patternScore * 0.7 + uniformityScore * 0.3;

  const details = {
    composite_score: Math.round(compositeScore * 10) / 10,
    pattern_score: patternScore,
    uniformity_score: Math.round(uniformityScore * 10) / 10,
    flagged_patterns: flaggedPatterns,
  };

  return {
    passed: compositeScore < (options.threshold ?? 45),
    score: details.composite_score,
    details,
  };
}
