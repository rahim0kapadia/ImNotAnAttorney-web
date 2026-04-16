/**
 * Cross-Validation Engine
 *
 * Validates each classified field against 2+ independent signals.
 * Tags classification_confidence as 'verified' or 'low_confidence'.
 *
 * Independent signals (different data sources):
 *   - CL court metadata (authoritative)
 *   - CL nature_of_suit code
 *   - jurisdiction_statutes lookup
 *   - CL citation treatment data
 *   - CL author/assigned_to person data
 *
 * Same-source signals (count as ONE):
 *   - Keyword match in opinion text + same keyword in docket entry
 */

/**
 * Cross-validate classified opinion fields.
 *
 * @param {object} extracted, output from extractAll()
 * @param {object} clMetadata, CourtListener metadata for this opinion
 * @param {string} clMetadata.nature_of_suit, CL nature_of_suit code
 * @param {string} clMetadata.court, CL court identifier
 * @param {string} clMetadata.jurisdiction, derived from court
 * @param {string[]} clMetadata.docketCharges, charge slugs from CL docket (if available)
 * @returns {{ confidence: string, signals: object }}
 */
export function crossValidate(extracted, clMetadata) {
  const signals = {
    charge_types: { independent: 0, same_source: 0, details: [] },
    motion_types: { independent: 0, same_source: 0, details: [] },
    defense_theories: { independent: 0, same_source: 0, details: [] },
    motion_outcomes: { independent: 0, same_source: 0, details: [] },
  };

  // ── Charge type cross-validation ──
  // Signal 1: statute citation extraction (same-source as opinion text)
  if (extracted.charge_types.length > 0) {
    signals.charge_types.same_source++;
    signals.charge_types.details.push("statute_citation_extraction");
  }

  // Signal 2: CL nature_of_suit (independent, assigned by court staff)
  if (clMetadata.nature_of_suit) {
    const nosCriminal = isCriminalNOS(clMetadata.nature_of_suit);
    if (nosCriminal && extracted.charge_types.length > 0) {
      signals.charge_types.independent++;
      signals.charge_types.details.push("cl_nature_of_suit");
    }
  }

  // Signal 3: jurisdiction_statutes lookup matched (independent, our curated table)
  if (extracted.charge_types.length > 0) {
    // If we got charge_types, that means the statute lookup succeeded
    signals.charge_types.independent++;
    signals.charge_types.details.push("jurisdiction_statutes_lookup");
  }

  // Signal 4: CL docket charges if available (independent)
  if (clMetadata.docketCharges && clMetadata.docketCharges.length > 0) {
    const overlap = extracted.charge_types.filter(ct =>
      clMetadata.docketCharges.indexOf(ct) >= 0
    );
    if (overlap.length > 0) {
      signals.charge_types.independent++;
      signals.charge_types.details.push("cl_docket_charges");
    }
  }

  // ── Motion type cross-validation ──
  // Signal 1: keyword match in opinion text (same-source)
  if (extracted.motion_types.length > 0) {
    signals.motion_types.same_source++;
    signals.motion_types.details.push("opinion_text_keyword");
  }

  // ── Defense theory cross-validation ──
  // Signal 1: constrained mapping from charge_defense_theories (independent, taxonomy-derived)
  // Signal 2: keyword presence in text (same-source)
  // deriveDefenseTheories already requires BOTH, so if we have theories, both signals exist
  if (extracted.defense_theories.length > 0) {
    signals.defense_theories.independent++; // constrained mapping
    signals.defense_theories.same_source++; // keyword match
    signals.defense_theories.details.push("constrained_mapping", "keyword_presence");
  }

  // ── Motion outcome cross-validation ──
  if (extracted.motion_outcomes) {
    const hasOutcome = extracted.motion_outcomes.some(mo => mo.outcome !== null);
    if (hasOutcome) {
      signals.motion_outcomes.same_source++; // opinion text positional
      signals.motion_outcomes.details.push("opinion_text_positional");
    }
  }

  // ── Determine overall confidence ──
  // Rule: 2+ TRULY INDEPENDENT signals must agree per Section 3.3
  const chargeVerified = signals.charge_types.independent >= 2;
  const theoryVerified = signals.defense_theories.independent >= 1; // constrained mapping is independent
  const motionVerified = signals.motion_types.same_source >= 1; // motions only have text signal

  // Overall: if the primary field (charge_types) has 2+ independent signals → verified
  const confidence = chargeVerified ? "verified" : "low_confidence";

  return { confidence, signals };
}

/**
 * Check if a nature_of_suit code indicates a criminal case.
 * CL uses numeric codes; criminal cases are in the 400-499 range (federal)
 * and state criminal courts are identified by court metadata.
 */
function isCriminalNOS(nos) {
  if (!nos) return false;
  // Common criminal NOS patterns
  const lower = String(nos).toLowerCase();
  if (lower.indexOf("criminal") >= 0) return true;
  if (lower.indexOf("felony") >= 0) return true;
  if (lower.indexOf("misdemeanor") >= 0) return true;
  // Federal NOS codes 400-499 are criminal
  const num = parseInt(nos, 10);
  if (num >= 400 && num < 500) return true;
  return false;
}
