/**
 * Mechanical Opinion Extractor
 *
 * All classification is deterministic. No LLM calls.
 * Extracts: charge_types, motion_types, defense_theories, motion_outcomes,
 * holding_text from opinion text using keyword matching + lookup tables.
 *
 * Depends on:
 *   - charge_defense_theories table (loaded once, passed in)
 *   - jurisdiction_statutes table (loaded once, passed in)
 *   - MOTION_SIGNALS from bulk-extract-motion-legal-issues.mjs
 *   - Negation window (Section 3.4 of spec)
 */

// ── Motion type signals ─────────────────────────────────────────────────────
// Each entry: [canonical_name, ...phrases to match in lowercased text]
// Sourced from scripts/bulk-extract-motion-legal-issues.mjs (18 types)
// Extended with additional types from the engine's 53-type taxonomy
export const MOTION_SIGNALS = [
  ["suppress_motion", "motion to suppress", "suppression motion", "motion for suppression", "suppression hearing"],
  ["dismiss_motion", "motion to dismiss", "motion for dismissal", "dismiss the charge", "dismiss the case", "dismiss the indictment"],
  ["in_limine_motion", "motion in limine", "in limine"],
  ["new_trial_motion", "motion for new trial", "motion for a new trial"],
  ["mistrial_motion", "motion for mistrial", "motion for a mistrial", "declared a mistrial"],
  ["continuance_motion", "motion for continuance", "motion to continue"],
  ["severance_motion", "motion for severance", "motion to sever"],
  ["change_of_venue_motion", "motion for change of venue", "change of venue"],
  ["discovery_motion", "motion for discovery", "motion to compel discovery", "discovery motion", "motion to compel"],
  ["franks_motion", "franks hearing", "franks motion"],
  ["speedy_trial_motion", "motion for speedy trial", "speedy trial motion", "speedy trial violation"],
  ["competency_motion", "motion for competency", "competency hearing", "competency to stand trial"],
  ["recusal_motion", "motion to recuse", "motion for recusal", "motion for disqualification"],
  ["bill_of_particulars", "bill of particulars", "motion for bill of particulars"],
  ["pretrial_release_motion", "motion for pretrial release", "motion for bond reduction", "motion to modify bond"],
  ["judgment_acquittal_motion", "motion for judgment of acquittal", "judgment of acquittal", "rule 29 motion", "rule 29"],
  ["arrest_judgment_motion", "motion in arrest of judgment"],
  ["withdraw_plea_motion", "motion to withdraw plea", "motion to withdraw guilty plea"],
  ["reconsideration_motion", "motion for reconsideration", "motion to reconsider"],
  ["sentence_reduction_motion", "motion for reduction of sentence", "motion to reduce sentence", "rule 35 motion"],
  ["habeas_corpus", "habeas corpus", "writ of habeas corpus", "petition for habeas corpus"],
  ["post_conviction_motion", "post-conviction", "postconviction", "rule 3.850", "section 2255"],
];

// ── Negation terms for negation window (Section 3.4) ─────────────────────
const NEGATION_TERMS = [
  "not", "no", "never", "failed to", "did not",
  "without", "absence of", "lack of", "unlike",
];

// ── Outcome keywords ─────────────────────────────────────────────────────────
const OUTCOME_GRANTED = ["granted", "grant the motion", "motion is granted", "motion granted", "we grant"];
const OUTCOME_DENIED = ["denied", "deny the motion", "motion is denied", "motion denied", "we deny"];
const OUTCOME_DISMISSED = ["dismissed", "case dismissed", "charges dismissed", "dismissal"];
const OUTCOME_AFFIRMED = ["affirmed", "we affirm", "is affirmed", "judgment affirmed"];
const OUTCOME_REVERSED = ["reversed", "we reverse", "is reversed", "judgment reversed"];

// ── Holding keywords ─────────────────────────────────────────────────────────
const HOLDING_KEYWORDS = [
  "hold that", "find that", "conclude that", "conclude,",
  "it is ordered", "it is hereby ordered",
  "we hold", "we find", "we conclude",
  "the court finds", "the court holds", "the court concludes",
  "we grant", "we deny", "we affirm", "we reverse",
];

/**
 * Check for negation in a window of N words before a keyword match position.
 * Returns true if a negation term is found within the window.
 *
 * @param {string} lowerText — lowercased full text
 * @param {number} matchPos — position of the keyword match
 * @param {number} windowChars — number of characters to look back (default: ~5 words = 40 chars)
 * @returns {boolean}
 */
export function hasNegation(lowerText, matchPos, windowChars = 40) {
  const windowStart = Math.max(0, matchPos - windowChars);
  const window = lowerText.slice(windowStart, matchPos);
  for (const neg of NEGATION_TERMS) {
    if (window.indexOf(neg) >= 0) return true;
  }
  return false;
}

/**
 * Extract motion types from opinion text.
 * Keyword matching against MOTION_SIGNALS with negation window.
 *
 * @param {string} text — opinion text (plain text, not HTML)
 * @returns {string[]} — array of canonical motion type names
 */
export function extractMotionTypes(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = [];

  for (const [canonical, ...phrases] of MOTION_SIGNALS) {
    for (const phrase of phrases) {
      const pos = lower.indexOf(phrase);
      if (pos >= 0 && !hasNegation(lower, pos)) {
        found.push(canonical);
        break; // Found this motion type, move to next
      }
    }
  }

  return found;
}

/**
 * Extract statute citations from opinion text.
 * Uses indexOf-based scanning to find common statute citation patterns:
 *   - "§ 123.45" or "section 123.45"
 *   - "U.S.C. § 123" or "U.S.C. section 123"
 *   - State code patterns like "Fla. Stat. § 123"
 *
 * Returns raw citation strings for matching against jurisdiction_statutes.
 *
 * @param {string} text — opinion text
 * @returns {Array<{citation: string, position: number, isPrimary: boolean}>}
 */
export function extractStatuteCitations(text) {
  if (!text) return [];
  const citations = [];
  const textLen = text.length;
  const fifteenPct = Math.floor(textLen * 0.15);

  // Scan for § symbol
  let searchStart = 0;
  while (searchStart < textLen) {
    const secPos = text.indexOf("\u00A7", searchStart); // § character
    if (secPos < 0) break;

    // Extract the citation number following §
    const numStr = extractNumberAfterPosition(text, secPos + 1);
    if (numStr) {
      citations.push({
        citation: numStr.trim(),
        position: secPos,
        isPrimary: secPos < fifteenPct,
      });
    }
    searchStart = secPos + 1;
  }

  // Scan for "section " followed by a number
  searchStart = 0;
  const lower = text.toLowerCase();
  while (searchStart < textLen) {
    const secPos = lower.indexOf("section ", searchStart);
    if (secPos < 0) break;

    const afterSection = secPos + 8;
    // Check that the character after "section " is a digit
    if (afterSection < textLen) {
      const ch = text.charCodeAt(afterSection);
      if (ch >= 48 && ch <= 57) { // '0'-'9'
        const numStr = extractNumberAfterPosition(text, afterSection);
        if (numStr) {
          citations.push({
            citation: numStr.trim(),
            position: secPos,
            isPrimary: secPos < fifteenPct,
          });
        }
      }
    }
    searchStart = secPos + 1;
  }

  return citations;
}

/**
 * Extract a statute number string starting at a given position.
 * Reads digits, dots, hyphens, and parenthetical subsection markers.
 *
 * @param {string} text
 * @param {number} start
 * @returns {string|null}
 */
function extractNumberAfterPosition(text, start) {
  // Skip whitespace
  let pos = start;
  while (pos < text.length) {
    const ch = text.charCodeAt(pos);
    if (ch !== 32 && ch !== 9) break; // skip spaces/tabs
    pos++;
  }

  let result = "";
  let parenDepth = 0;
  while (pos < text.length) {
    const ch = text.charCodeAt(pos);
    // Digits: 48-57
    if (ch >= 48 && ch <= 57) { result += text[pos]; pos++; continue; }
    // Period: 46
    if (ch === 46) { result += "."; pos++; continue; }
    // Hyphen: 45
    if (ch === 45) { result += "-"; pos++; continue; }
    // Open paren: 40
    if (ch === 40) { parenDepth++; result += "("; pos++; continue; }
    // Close paren: 41
    if (ch === 41 && parenDepth > 0) { parenDepth--; result += ")"; pos++; continue; }
    // Lowercase letters (for subsection markers like 'a', 'b'): 97-122
    if (ch >= 97 && ch <= 122 && parenDepth > 0) { result += text[pos]; pos++; continue; }
    // Uppercase letters in specific contexts (e.g., "316.193(1)(a)"): 65-90
    if (ch >= 65 && ch <= 90 && parenDepth > 0) { result += text[pos]; pos++; continue; }
    break;
  }

  // Must have at least 2 chars and contain a digit
  if (result.length < 2) return null;
  let hasDigit = false;
  for (let i = 0; i < result.length; i++) {
    const c = result.charCodeAt(i);
    if (c >= 48 && c <= 57) { hasDigit = true; break; }
  }
  return hasDigit ? result : null;
}

/**
 * Match extracted statute citations against jurisdiction_statutes table.
 *
 * @param {Array<{citation: string, position: number, isPrimary: boolean}>} citations
 * @param {string} jurisdiction — two-letter state code from CL court metadata
 * @param {Map<string, {charge_slug: string, statute_number: string}>} statuteMap — keyed by "jurisdiction:statute_number" (lowercased)
 * @returns {Array<{charge_slug: string, isPrimary: boolean}>}
 */
export function matchStatutesToCharges(citations, jurisdiction, statuteMap) {
  if (!citations || citations.length === 0) return [];
  const matches = [];
  const seenSlugs = new Set();

  for (const cite of citations) {
    // Try exact match with jurisdiction scoping
    const key = (jurisdiction + ":" + cite.citation).toLowerCase();
    const match = statuteMap.get(key);
    if (match && !seenSlugs.has(match.charge_slug)) {
      seenSlugs.add(match.charge_slug);
      matches.push({
        charge_slug: match.charge_slug,
        isPrimary: cite.isPrimary,
      });
    }

    // Try matching without subsection (strip trailing parentheticals)
    const baseStatute = stripSubsection(cite.citation);
    if (baseStatute !== cite.citation) {
      const baseKey = (jurisdiction + ":" + baseStatute).toLowerCase();
      const baseMatch = statuteMap.get(baseKey);
      if (baseMatch && !seenSlugs.has(baseMatch.charge_slug)) {
        seenSlugs.add(baseMatch.charge_slug);
        matches.push({
          charge_slug: baseMatch.charge_slug,
          isPrimary: cite.isPrimary,
        });
      }
    }
  }

  // Sort: primary first
  matches.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  return matches;
}

/**
 * Strip trailing parenthetical subsection markers from a statute number.
 * "316.193(1)(a)" → "316.193"
 */
function stripSubsection(statuteNum) {
  const parenIdx = statuteNum.indexOf("(");
  if (parenIdx > 0) return statuteNum.slice(0, parenIdx);
  return statuteNum;
}

/**
 * Derive defense theories from charge_types + motion_types using
 * the charge_defense_theories constrained mapping.
 * Also checks for keyword presence with negation window.
 *
 * @param {string[]} chargeTypes — charge_slug values
 * @param {string[]} motionTypes — motion type canonical names
 * @param {string} text — opinion text (for keyword check)
 * @param {Map<string, Array<{theory_name: string, theory_keywords: string[], motion_types: string[]}>>} theoryMap — keyed by charge_slug
 * @returns {string[]} — defense theory names
 */
export function deriveDefenseTheories(chargeTypes, motionTypes, text, theoryMap) {
  if (!chargeTypes || chargeTypes.length === 0) return [];
  const lower = text ? text.toLowerCase() : "";
  const motionSet = new Set(motionTypes);
  const theories = new Set();

  for (const chargeSlug of chargeTypes) {
    const chargeTheories = theoryMap.get(chargeSlug);
    if (!chargeTheories) continue;

    for (const theory of chargeTheories) {
      // Check 1: Does any of the theory's motion_types appear in the opinion's motion_types?
      let motionMatch = false;
      for (const mt of theory.motion_types) {
        if (motionSet.has(mt)) { motionMatch = true; break; }
      }

      // Check 2: Do any theory keywords appear in the text (with negation window)?
      let keywordMatch = false;
      for (const kw of theory.theory_keywords) {
        const pos = lower.indexOf(kw);
        if (pos >= 0 && !hasNegation(lower, pos)) {
          keywordMatch = true;
          break;
        }
      }

      // Cross-validation: constrained mapping (independent) AND keyword (same-source)
      // Per spec Section 3: constrained mapping counts as independent signal
      if (motionMatch && keywordMatch) {
        theories.add(theory.theory_name);
      }
    }
  }

  return Array.from(theories);
}

/**
 * Extract per-motion outcomes from the last 20-40% of opinion text.
 * Outcome keywords: GRANTED/DENIED/DISMISSED in positional window.
 * Negation window NOT applied to outcome keywords (Section 3.4).
 *
 * @param {string[]} motionTypes — motion types found in this opinion
 * @param {string} text — full opinion text
 * @returns {Array<{motion_type: string, outcome: string|null}>}
 */
export function extractMotionOutcomes(motionTypes, text) {
  if (!motionTypes || motionTypes.length === 0) return [];
  if (!text) return motionTypes.map(mt => ({ motion_type: mt, outcome: null }));

  const lower = text.toLowerCase();
  const textLen = lower.length;

  // Check last 20% first, then expand to 40%
  const last20Start = Math.floor(textLen * 0.8);
  const last40Start = Math.floor(textLen * 0.6);

  function findOutcomeInWindow(windowText) {
    let grantedCount = 0;
    let deniedCount = 0;
    let dismissedCount = 0;
    let affirmedCount = 0;
    let reversedCount = 0;

    for (const phrase of OUTCOME_GRANTED) {
      if (windowText.indexOf(phrase) >= 0) grantedCount++;
    }
    for (const phrase of OUTCOME_DENIED) {
      if (windowText.indexOf(phrase) >= 0) deniedCount++;
    }
    for (const phrase of OUTCOME_DISMISSED) {
      if (windowText.indexOf(phrase) >= 0) dismissedCount++;
    }
    for (const phrase of OUTCOME_AFFIRMED) {
      if (windowText.indexOf(phrase) >= 0) affirmedCount++;
    }
    for (const phrase of OUTCOME_REVERSED) {
      if (windowText.indexOf(phrase) >= 0) reversedCount++;
    }

    // Most frequent outcome wins
    const outcomes = [
      { name: "granted", count: grantedCount },
      { name: "denied", count: deniedCount },
      { name: "dismissed", count: dismissedCount },
      { name: "affirmed", count: affirmedCount },
      { name: "reversed", count: reversedCount },
    ];
    outcomes.sort((a, b) => b.count - a.count);
    if (outcomes[0].count > 0) return outcomes[0].name;
    return null;
  }

  // Try last 20%
  let outcome = findOutcomeInWindow(lower.slice(last20Start));

  // If nothing found, try last 40%
  if (!outcome) {
    outcome = findOutcomeInWindow(lower.slice(last40Start));
  }

  // For each motion, use the single outcome (we don't have per-motion
  // docket data to differentiate — that's a Phase 2 enhancement).
  return motionTypes.map(mt => ({ motion_type: mt, outcome }));
}

/**
 * Extract holding text from the last 20% of opinion.
 * Finds sentences containing ruling keywords.
 * Strips quoted text before scanning for ruling keywords.
 *
 * @param {string} text — full opinion text
 * @returns {string|null} — extracted holding sentences joined, or null
 */
export function extractHoldingText(text) {
  if (!text) return null;

  const textLen = text.length;
  const last20Start = Math.floor(textLen * 0.8);
  const tail = text.slice(last20Start);

  // Strip quoted text (text within double quotes)
  let stripped = "";
  let inQuote = false;
  for (let i = 0; i < tail.length; i++) {
    const ch = tail.charCodeAt(i);
    if (ch === 34) { // double quote
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote) stripped += tail[i];
  }

  const lower = stripped.toLowerCase();

  // Find sentences containing ruling keywords
  // Split into sentences at period + space or period + newline
  const sentences = [];
  let sentStart = 0;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped.charCodeAt(i);
    if (ch === 46) { // period
      const nextCh = i + 1 < stripped.length ? stripped.charCodeAt(i + 1) : 0;
      if (nextCh === 32 || nextCh === 10 || nextCh === 13 || i === stripped.length - 1) {
        sentences.push({
          text: stripped.slice(sentStart, i + 1).trim(),
          lowerText: lower.slice(sentStart, i + 1).trim(),
        });
        sentStart = i + 1;
      }
    }
  }
  // Add remaining text as last sentence
  if (sentStart < stripped.length) {
    sentences.push({
      text: stripped.slice(sentStart).trim(),
      lowerText: lower.slice(sentStart).trim(),
    });
  }

  // Filter to sentences containing ruling keywords
  const holdingSentences = [];
  for (const sent of sentences) {
    if (sent.text.length < 20) continue; // Skip very short fragments
    for (const kw of HOLDING_KEYWORDS) {
      if (sent.lowerText.indexOf(kw) >= 0) {
        holdingSentences.push(sent.text);
        break;
      }
    }
  }

  if (holdingSentences.length === 0) return null;
  return holdingSentences.join(" ");
}

/**
 * Compute motion favorability scores.
 * Per-motion: 0-100 from outcome + ruling language.
 *
 * @param {Array<{motion_type: string, outcome: string|null}>} motionOutcomes
 * @returns {Array<{motion_type: string, favorability: number}>}
 */
export function computeMotionFavorability(motionOutcomes) {
  return motionOutcomes
    .filter(mo => mo.outcome !== null)
    .map(mo => {
      let score = 50; // neutral baseline
      switch (mo.outcome) {
        case "granted": score = 85; break;
        case "reversed": score = 80; break;
        case "dismissed": score = 90; break;
        case "denied": score = 20; break;
        case "affirmed": score = 30; break; // affirmed = trial court upheld (could be either)
      }
      return { motion_type: mo.motion_type, favorability: score };
    });
}

/**
 * Compute overall case favorability score.
 * 0-100 from case outcome (granted/dismissed vs denied/affirmed).
 *
 * @param {Array<{motion_type: string, outcome: string|null}>} motionOutcomes
 * @param {boolean|null} isGoodLaw — CL citation treatment
 * @returns {number|null}
 */
export function computeCaseFavorability(motionOutcomes, isGoodLaw) {
  if (!motionOutcomes || motionOutcomes.length === 0) return null;

  // Count favorable vs unfavorable outcomes
  let favorable = 0;
  let unfavorable = 0;
  for (const mo of motionOutcomes) {
    if (mo.outcome === "granted" || mo.outcome === "reversed" || mo.outcome === "dismissed") favorable++;
    else if (mo.outcome === "denied" || mo.outcome === "affirmed") unfavorable++;
  }

  const total = favorable + unfavorable;
  if (total === 0) return null;

  // Base score from outcomes
  let score = Math.round((favorable / total) * 80); // max 80 from outcomes

  // Bonus for good law status (CL external signal)
  if (isGoodLaw === true) score += 10;
  if (isGoodLaw === false) score = Math.max(score - 20, 0);

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Full mechanical extraction pipeline for a single opinion.
 *
 * @param {object} params
 * @param {string} params.text — plain text of opinion
 * @param {string} params.jurisdiction — two-letter state code
 * @param {string} params.opinionType — from classifyOpinionType
 * @param {object} params.extractionSteps — from getExtractionSteps
 * @param {Map} params.statuteMap — jurisdiction:statute_number → charge info
 * @param {Map} params.theoryMap — charge_slug → theory definitions
 * @param {boolean|null} params.isGoodLaw — CL is_good_law status
 * @returns {object} — classified fields
 */
export function extractAll(params) {
  const { text, jurisdiction, opinionType, extractionSteps, statuteMap, theoryMap, isGoodLaw } = params;

  const result = {
    charge_types: [],
    motion_types: [],
    defense_theories: [],
    motion_outcomes: null,
    motion_favorability: null,
    case_favorability: null,
    holding_text: null,
  };

  // 1. Extract charge types (always runs)
  if (extractionSteps.extractCharges) {
    const citations = extractStatuteCitations(text);
    const matches = matchStatutesToCharges(citations, jurisdiction, statuteMap);
    result.charge_types = matches.map(m => m.charge_slug);
  }

  // 2. Extract motion types
  if (extractionSteps.extractMotions) {
    result.motion_types = extractMotionTypes(text);
  }

  // 3. Derive defense theories
  if (extractionSteps.extractTheories) {
    result.defense_theories = deriveDefenseTheories(
      result.charge_types, result.motion_types, text, theoryMap
    );
  }

  // 4. Extract outcomes
  if (extractionSteps.extractOutcomes) {
    // For PCA: outcome is always "affirmed"
    if (opinionType === "pca") {
      result.motion_outcomes = [{ motion_type: "case_disposition", outcome: "affirmed" }];
    } else {
      result.motion_outcomes = extractMotionOutcomes(result.motion_types, text);
    }
    result.motion_favorability = computeMotionFavorability(result.motion_outcomes);
    result.case_favorability = computeCaseFavorability(result.motion_outcomes, isGoodLaw);
  }

  // 5. Extract holding text
  if (extractionSteps.extractHolding) {
    result.holding_text = extractHoldingText(text);
  }

  return result;
}
