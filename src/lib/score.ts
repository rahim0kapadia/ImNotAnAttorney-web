/**
 * @fileoverview Defense Milestone Score Calculator, pure scoring logic.
 *
 * Extracted from src/app/api/score/route.ts so the algorithm can be
 * unit-tested without Next.js request plumbing or Supabase dependencies.
 *
 * Scoring algorithm:
 * - Starts at 50 (midpoint) and adjusts based on weighted categories:
 *   - Motions filed: 20% weight
 *   - Discovery received: 15% weight
 *   - Communication frequency: 15% weight
 *   - Attorney type: 10% weight
 *   - Strategy discussion: 10% weight
 * - Time since arrest is a MODIFIER, not a direct scorer, it scales penalties
 *   for motions, discovery, and compound checks. No points added/subtracted
 *   for time alone; it determines how harshly missing milestones are penalized.
 * - Time-based expectations: penalties increase as time passes without expected
 *   milestones (e.g., no motions at 3+ months is worse than at 1 month)
 * - Final score is clamped to 0-100 and bucketed into bands:
 *   Critical (0-30), Concerning (31-50), Average (51-70), Adequate (71-85), Excellent (86-100)
 *
 * Voice (Chaperon permission-asset audit 2026-04-19):
 *   Observation strings are written in third-person dossier voice so they read
 *   like researcher notes on a file rather than a coach talking at the
 *   defendant. Direct imperative questioning has been moved downstream into
 *   the attorney-email-template block where second-person is appropriate.
 *   Question hooks still appear where informationally useful — they are
 *   framed as "Question to surface:" / "Question on file:" so the dossier
 *   frame holds.
 *
 * UPL safety (Legal Compliance audit 2026-04-19):
 *   Observation strings name informational patterns, never case-specific
 *   legal conclusions. Charge-specific observations reference evidence
 *   categories and filing windows, not individual case facts. Anything
 *   borrowing lawyer-review vocabulary ("Cleared...", "opinion") lives in
 *   the wrapper (InternalMemo.tsx) not the data.
 */

/** Input shape for the score calculator -- all 10 fields are required */
export interface ScoreInput {
  chargeType: string;
  timeSinceArrest: string;
  hasAttorney: string;
  motionsFiled: string;
  hasDiscovery: string;
  communicationFrequency: string;
  strategyDiscussed: string;
  criminalHistory: string;
  caseStage: string;
  licensedProfession: string;
}

/** Output shape: numeric score (0-100), descriptive band, and 3-5 observations */
export interface ScoreResult {
  score: number;
  band: string;
  observations: string[];
  /**
   * Count of observations produced by the core scoring branches BEFORE the
   * min-3-observations padding kicks in (the three `observations.length < 3`
   * branches at the tail of `calculateScore`). Consumers that need a truthful
   * "flagged milestones" count (e.g. `bandIdentity.Critical`) must use this
   * field, NOT `observations.length` — the latter is inflated by padding for
   * high-scoring results with only 1-2 genuine observations.
   *
   * Invariant: `0 <= genuineObservationCount <= observations.length <= 5`.
   */
  genuineObservationCount: number;
}

/**
 * Input validation allowlist. Every field value must appear in this map.
 * This prevents arbitrary input from reaching the scoring algorithm and
 * protects against injection (no user-supplied strings are used in scoring
 * logic -- only pre-defined slug values that are checked against this list).
 */
export const ALLOWED_VALUES: Record<string, string[]> = {
  chargeType: ["drug", "drug-possession", "drug-trafficking", "dui", "probation-violation", "white-collar", "sex-offense", "federal-criminal", "self-defense", "other-felony", "other-misdemeanor"],
  timeSinceArrest: ["less-than-1-month", "1-3-months", "3-6-months", "6-12-months", "12-plus-months"],
  hasAttorney: ["private", "public-defender", "no", "not-sure"],
  motionsFiled: ["yes", "no", "dont-know"],
  hasDiscovery: ["yes", "no", "dont-know"],
  communicationFrequency: ["weekly", "monthly", "rarely", "never"],
  strategyDiscussed: ["yes-detail", "briefly", "no"],
  criminalHistory: ["none", "misdemeanor", "felony", "multiple"],
  caseStage: ["pre-arrest", "arrested", "arraigned", "pre-trial", "trial-prep", "sentencing", "post-conviction"],
  licensedProfession: ["yes-licensed", "yes-other", "no", "student"],
};

/**
 * Core scoring algorithm. Starts at 50 (neutral midpoint) and applies weighted
 * adjustments for each category. The `timeIndex` variable (derived from
 * timeSinceArrest) acts as a penalty multiplier -- the longer since arrest,
 * the harsher the penalties for missing milestones like motions and discovery.
 *
 * Observations are human-readable sentences that explain WHY the score moved
 * in each direction. Voice: third-person dossier (see file header).
 *
 * @param input - Validated score inputs (all fields from ALLOWED_VALUES)
 * @returns Score (0-100), band label, and 3-5 contextual observations
 */
export function calculateScore(input: ScoreInput): ScoreResult {
  let score = 50; // Start at midpoint -- neutral baseline
  const observations: string[] = [];

  // =========================================================================
  // TIME SINCE ARREST -- baseline for milestone expectations (30% weight)
  // =========================================================================
  const timeMap: Record<string, number> = {
    "less-than-1-month": 0,
    "1-3-months": 1,
    "3-6-months": 2,
    "6-12-months": 3,
    "12-plus-months": 4,
  };
  const timeIndex = timeMap[input.timeSinceArrest] ?? 0;

  // =========================================================================
  // ATTORNEY TYPE (10% weight)
  // =========================================================================
  if (input.hasAttorney === "private") {
    score += 5;
  } else if (input.hasAttorney === "public-defender") {
    score += 0; // neutral, PDs are overloaded, not bad
    observations.push(
      "File shows public defender representation. Pattern note: Public defender caseload averages 3-5x the recommended limit in most jurisdictions. Question to surface: \"How many open cases is my attorney currently managing?\""
    );
  } else if (input.hasAttorney === "no") {
    score -= 15;
    observations.push(
      "Subject reports they don't have an attorney. Motion deadlines run from arrest date, not from retention; the active file window is shrinking with each day of unrepresented status."
    );
  } else if (input.hasAttorney === "not-sure") {
    score -= 10;
    observations.push(
      "Representation status unclear on file. Confirm whether you have active counsel on record — court dates and filing deadlines run regardless of retention status. Question to surface: \"Do I have active counsel on record for this case, and who are they?\""
    );
  }

  // CHARGE-SPECIFIC OBSERVATION (mandatory, fires for every result)
  observations.push(getChargeSpecificObservation(input.chargeType, timeIndex, input.hasAttorney));

  // =========================================================================
  // MOTIONS FILED (20% weight)
  // =========================================================================
  if (input.motionsFiled === "yes") {
    score += 15;
    if (timeIndex >= 2) {
      observations.push(
        "File notes: attorney has filed motions. Active case management signal — pattern consistent with files that reach favorable resolution."
      );
    }
  } else if (input.motionsFiled === "no") {
    if (timeIndex >= 2) {
      score -= 20;
      observations.push(
        `File shows ${getTimeLabel(input.timeSinceArrest)} post-arrest with no motions filed. Late suppression motions are frequently time-barred in this pattern — challengeable evidence remains in the prosecution's case.`
      );
    } else {
      score -= 5;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "Motion status not on file — if you don't know, nothing may have been filed. Question to surface: \"What motions have been filed or are planned in my case?\""
    );
  }

  // =========================================================================
  // DISCOVERY RECEIVED (15% weight)
  // =========================================================================
  if (input.hasDiscovery === "yes") {
    score += 10;
  } else if (input.hasDiscovery === "no") {
    if (timeIndex >= 2) {
      score -= 15;
      observations.push(
        "At this stage, discovery is typically in the defense file. File without it is being built blind — challengeable evidence cannot be identified from material the defense has not reviewed. Question to surface: \"Have we received all discovery materials?\""
      );
    } else {
      score -= 3;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "Discovery status not on file. Reference: Discovery is evidence the prosecution must share — police reports, lab results, witness statements. Question to surface: \"Have we received all discovery?\""
    );
  }

  // =========================================================================
  // COMMUNICATION FREQUENCY (15% weight)
  // =========================================================================
  if (input.communicationFrequency === "weekly") {
    score += 10;
  } else if (input.communicationFrequency === "monthly") {
    score += 0;
    if (timeIndex >= 2) {
      observations.push(
        "Monthly communication cadence on file. Pattern: Monthly communication may be acceptable early on, but files at this stage typically show weekly touchpoints around hearings and filing deadlines."
      );
    }
  } else if (input.communicationFrequency === "rarely") {
    score -= 10;
    observations.push(
      "Rare communication cadence on file. Pattern: Rare communication leaves defendants unaware of developments, deadlines, and plea windows that close without notice."
    );
  } else if (input.communicationFrequency === "never") {
    score -= 20;
    observations.push(
      "Zero-communication state on file — a serious red flag pattern. Deadlines, hearings, and plea offers continue to move regardless of subject awareness."
    );
  }

  // =========================================================================
  // STRATEGY DISCUSSION (10% weight)
  // =========================================================================
  if (input.strategyDiscussed === "yes-detail") {
    score += 10;
  } else if (input.strategyDiscussed === "briefly") {
    score += 2;
    observations.push(
      "Strategy briefly outlined; depth unclear from file. Question to surface with counsel: \"What is the theory of defense, which motions are planned, and why?\""
    );
  } else if (input.strategyDiscussed === "no") {
    score -= 12;
    observations.push(
      "No strategy discussion on file — defense theory hasn't been explained to subject. Question to surface: \"What is your theory of defense, and how does it address the prosecution's strongest evidence?\""
    );
  }

  // =========================================================================
  // COMPOUND TIME-BASED PENALTY
  // =========================================================================
  if (timeIndex >= 3 && input.motionsFiled !== "yes" && input.hasDiscovery !== "yes") {
    score -= 10;
    const motionStatus = input.motionsFiled === "dont-know" ? "unknown motion status" : "no motions";
    const discoveryStatus = input.hasDiscovery === "dont-know" ? "unknown discovery status" : "no discovery";
    observations.push(
      `File state at ${getTimeLabel(input.timeSinceArrest)} since arrest: ${motionStatus}, ${discoveryStatus}. Pattern shows multiple defense windows already closed; remaining options compress further with each additional week.`
    );
  }

  // =========================================================================
  // CRIMINAL HISTORY (sentencing exposure context)
  // =========================================================================
  if (input.criminalHistory === "none") {
    score += 3;
  } else if (input.criminalHistory === "misdemeanor") {
    score -= 2;
    observations.push(
      "Prior misdemeanor(s) on record. Pattern: priors of this class affect plea negotiations and diversion eligibility. Question to surface with counsel: \"How are priors affecting options for diversion or reduced charges?\""
    );
  } else if (input.criminalHistory === "felony" || input.criminalHistory === "multiple") {
    score -= 5;
    observations.push(
      "Prior felony/multiple priors on record. Pattern: enhancements, mandatory minimums, and loss of diversion eligibility commonly apply. Question to surface: \"How is my record factored into defense strategy and sentencing exposure?\""
    );
  }

  // =========================================================================
  // CASE STAGE (milestone relevance calibration)
  // =========================================================================
  if (input.caseStage === "sentencing") {
    observations.push(
      "Case stage: sentencing. File priority becomes mitigation preparation — character letters, treatment documentation, sentencing memorandum. Question to surface with counsel: \"What mitigation materials are being prepared?\""
    );
  } else if (input.caseStage === "post-conviction") {
    observations.push(
      "Case stage: post-conviction. Strict appeal deadlines govern every remaining option. Question to surface: \"Have all available remedies been identified — direct appeal, PCR, habeas — and what are their filing deadlines?\""
    );
  } else if (input.caseStage === "pre-arrest") {
    score += 3;
    observations.push(
      "Pre-arrest posture. Files where subjects engage proactive counsel before charges file show better outcomes; pre-arrest intervention occasionally prevents charges entirely."
    );
  }

  // =========================================================================
  // CASE STAGE × MILESTONE INTERACTIONS
  // =========================================================================
  if (input.caseStage === "pre-trial" && input.motionsFiled !== "yes") {
    score -= 5;
    observations.push(
      "Pre-trial phase on file with no motions filed. Suppression and discovery motions are the expected filings at this stage. Question to surface: \"What motions are being filed before trial?\""
    );
  }
  if (input.caseStage === "trial-prep" && input.strategyDiscussed !== "yes-detail") {
    score -= 5;
    observations.push(
      "Trial-prep phase without detailed strategy discussion on file. At this stage the defense theory, witness list, and key evidence should be walked through with subject."
    );
  }
  if (input.caseStage === "arraigned" && input.hasDiscovery !== "yes" && timeIndex >= 1) {
    score -= 3;
    observations.push(
      "Arraigned but no discovery on file. Post-arraignment, defense attorneys typically request prosecution's evidence promptly. Question to surface: \"Has discovery been requested, and when do we expect to receive it?\""
    );
  }

  // =========================================================================
  // LICENSED PROFESSION (collateral career risk)
  // =========================================================================
  if (input.licensedProfession === "yes-licensed") {
    observations.push(
      "Subject holds a professional license. Conviction may trigger licensing board action, suspension, or revocation — a separate track from the criminal case. Licensing consequences belong on the defense risk register as a distinct issue."
    );
  } else if (input.licensedProfession === "yes-other") {
    observations.push(
      "Subject employed (non-licensed). Conviction affects background checks, security clearances, and professional opportunities even without a license at stake. Collateral-employment exposure on file."
    );
  } else if (input.licensedProfession === "student") {
    observations.push(
      "Subject is a student. Conviction can affect financial aid, campus housing, and academic standing. For drug offenses, federal law ties FAFSA eligibility to conviction status — collateral education exposure on file."
    );
  }
  // Note (FIX-F, 2026-04-24 R1): the three REPHRASE observations identified
  // in the C3.1 audit originally carried "Question to surface: ..." clauses
  // that read as imperatives in context. Question prompts were moved into
  // ATTORNEY_EMAIL_TEMPLATES in ScoreClient.tsx so the live observations
  // remain pure INFORMATION-statements of file state, and the attorney-email
  // template carries the questions-to-surface as an explicit output surface.

  // Clamp score to valid 0-100 range
  score = Math.max(0, Math.min(100, score));

  // =========================================================================
  // SCORE BANDING
  // =========================================================================
  let band: string;
  if (score <= 30) band = "Critical";
  else if (score <= 50) band = "Concerning";
  else if (score <= 70) band = "Average";
  else if (score <= 85) band = "Adequate";
  else band = "Excellent";

  // Capture the genuine observation count BEFORE padding. Consumers that need
  // a truthful "flagged milestones" count must use `genuineObservationCount`,
  // not `observations.length` (the latter is inflated by the padding branches
  // below for high-scoring results with only 1-2 real flags).
  const genuineObservationCount = observations.length;

  // Guarantee at least 3 observations. Pad with general advice if needed.
  if (observations.length < 3 && score >= 70) {
    observations.push(
      "No major red flags in the measured dimensions. File does not capture charge-specific elements or jurisdiction patterns — the Case Decoder covers those."
    );
  }
  if (observations.length < 3) {
    observations.push(
      "Ten-question files do not capture everything. Factors outside this scope — judge tendencies, prosecutor patterns, jurisdiction-specific deadlines — often decide outcomes."
    );
  }
  if (observations.length < 3) {
    observations.push(
      "Ten-question files are a starting point. Every case has jurisdiction-specific deadlines, procedural requirements, and strategic considerations this scope does not reach."
    );
  }

  return {
    score,
    band,
    observations: observations.slice(0, 5),
    genuineObservationCount: Math.min(genuineObservationCount, 5),
  };
}

/**
 * Converts a timeSinceArrest slug to a human-readable label for use in
 * observation strings. Falls back to the raw slug if not found.
 */
export function getTimeLabel(time: string): string {
  const labels: Record<string, string> = {
    "less-than-1-month": "less than 1 month",
    "1-3-months": "1-3 months",
    "3-6-months": "3-6 months",
    "6-12-months": "6-12 months",
    "12-plus-months": "12+ months",
  };
  return labels[time] ?? time;
}

/**
 * Converts a chargeType slug to a human-readable label for use in
 * observation strings. Falls back to the raw slug if not found.
 */
export function getChargeLabel(charge: string): string {
  const labels: Record<string, string> = {
    drug: "drug offense",
    "drug-possession": "drug possession",
    "drug-trafficking": "drug trafficking",
    dui: "DUI/DWI",
    "probation-violation": "probation violation",
    "white-collar": "white collar",
    "sex-offense": "sex offense",
    "federal-criminal": "federal criminal",
    "self-defense": "self-defense",
    "other-felony": "felony",
    "other-misdemeanor": "misdemeanor",
  };
  return labels[charge] ?? charge;
}

/**
 * Returns a charge-specific observation tailored to the defendant's charge type
 * and time since arrest. This fires for EVERY result, it's not padding.
 * Voice: third-person dossier (see file header).
 */
export function getChargeSpecificObservation(chargeType: string, timeIndex: number, hasAttorney: string): string {
  const noAttorney = hasAttorney === "no" || hasAttorney === "not-sure";

  switch (chargeType) {
    case "dui":
      if (noAttorney) {
        return "DUI defense starts with breathalyzer calibration records, dash/body cam footage, and officer sobriety certification. File currently without counsel — first-ask list when subject retains.";
      }
      return timeIndex >= 2
        ? "DUI case, mid-window. Breathalyzer calibration records and officer sobriety certification are key file artifacts at this stage. Question to surface: \"Have we received the maintenance logs?\""
        : "DUI case, early window. Dash/body cam footage and breathalyzer calibration records are the priority retrieval items. Question to surface: \"Have these been requested?\"";
    case "drug":
    case "drug-possession":
      if (noAttorney) {
        return "Drug possession file without counsel. Defense of this class examines how evidence was obtained — warrant validity, informant reliability, chain of custody, lab accuracy. First-ask list when counsel is retained.";
      }
      return timeIndex >= 2
        ? "Drug possession file, mid-window. Lab report review drives this class — weight errors and chain-of-custody gaps are where reductions come from. Question to surface: \"Have you reviewed the lab report?\""
        : "Drug possession file, early window. Defense examines how evidence was obtained — warrant validity, informant reliability, chain of custody. Question to surface: \"What's the plan for challenging evidence?\"";
    case "drug-trafficking":
      if (noAttorney) {
        return "Trafficking file without counsel. This class turns on quantity thresholds vs. distribution evidence, CI testimony, and wiretap authorization. Mandatory minimums make the retention window a priority.";
      }
      return timeIndex >= 2
        ? "Trafficking file, mid-window. Wiretap authorizations, CI reliability, and co-defendant statements are the review priorities. Question to surface: \"Has the quantity basis been challenged?\""
        : "Trafficking file, early window. Quantity-based thresholds vs. distribution evidence, plus conspiracy exposure, drive the defense. Question to surface: \"Am I exposed to mandatory minimums?\"";
    case "probation-violation":
      if (noAttorney) {
        return "Violation file without counsel. Hearings of this class use preponderance of evidence, not beyond reasonable doubt. Key file split: technical vs. substantive violation, plus alternative sanctions.";
      }
      return timeIndex >= 2
        ? "Violation file, hearing window. Mitigating evidence, compliance records, and alternative sanctions are the prep priorities. Question to surface: \"What are we presenting, and have we explored alternatives?\""
        : "Violation file, pre-hearing. Technical vs. substantive violation split matters — technical commonly have alternatives to revocation. Question to surface: \"What type is this, and what alternatives exist?\"";
    case "white-collar":
      if (noAttorney) {
        return "White collar cases file without counsel. This class often runs parallel civil or regulatory exposure. First-ask list when counsel retained: is there civil liability connected to these charges?";
      }
      return "White collar cases file. This class often runs parallel civil or regulatory exposure. Question to surface: \"Is there civil liability connected to these charges?\"";
    case "sex-offense":
      if (noAttorney) {
        return "Sex-offense file without counsel. Pattern: collateral consequences — SORNA registry, residency restrictions, employment limits — attach on conviction. Competent counsel examines forensic procedures, digital evidence, and Brady material first.";
      }
      return timeIndex >= 2
        ? "Sex-offense file, review window. Forensic reports, evidence handling, and Brady material are the priority review items. Question to surface: \"Have issues been found with evidence collection, and what's the defense theory?\""
        : "Sex-offense file, early window. Defense of this class scrutinizes forensic evidence collection, digital preservation, and interview procedures. Question to surface: \"What are registration consequences, and what's the strategy?\"";
    case "federal-criminal":
      if (noAttorney) {
        return "Federal file without counsel. Federal cases move faster and sentence longer. Sentencing guidelines, mandatory minimums, and cooperation agreements make counsel retention the priority step.";
      }
      return timeIndex >= 2
        ? "Federal file, mid-window. Pre-trial motions, Rule 16 discovery, and sentencing strategy are the priority tracks. Question to surface: \"Have we received all discovery, and what's our guideline exposure?\""
        : "Federal file, early window. Defense calculates the sentencing-guideline range and reviews grand jury materials early. Question to surface: \"What's my estimated guideline range?\"";
    case "self-defense":
      if (noAttorney) {
        return "Self-defense file without counsel. This class admits the act but argues justification. Key split: stand-your-ground vs. duty to retreat, force proportionality, timeline. Witness evidence has a retention window.";
      }
      return timeIndex >= 2
        ? "Self-defense file, mid-window. Clear justification theory and preserved evidence are the priority items. Question to surface: \"What's the justification theory, and has all threat evidence been preserved?\""
        : "Self-defense file, early window. Threat-evidence preservation is the priority — witness statements, surveillance, medical records, 911 recordings. Question to surface: \"Has all threat evidence been preserved?\"";
    case "other-felony":
      if (noAttorney) {
        return "Felony file without counsel. Defense of this class starts by identifying which elements of the charge are weakest. First-ask list when counsel retained.";
      }
      return timeIndex >= 2
        ? "Felony file, mid-window. A clear defense theory and evidentiary-hearing prep are the priorities. Question to surface: \"What's our defense theory and what motions are we filing?\""
        : "Felony file, early window. Building a defense theory by identifying the weakest elements of the charge is the first step. Question to surface: \"What is the theory?\"";
    case "other-misdemeanor":
      if (noAttorney) {
        return "Misdemeanor file without counsel. Even misdemeanor convictions create permanent records affecting employment, housing, and licensing; many qualify for diversion or deferred adjudication. First-ask when counsel retained: eligibility screen.";
      }
      return timeIndex >= 2
        ? "Misdemeanor file, mid-window. Conviction creates a permanent record; diversion and deferred adjudication are the priority alternatives to explore. Question to surface: \"Have we explored every alternative to conviction?\""
        : "Misdemeanor file, early window. Misdemeanor convictions create permanent records affecting employment, housing, and licensing. Priority alternatives: diversion or deferred adjudication that can result in dismissal.";
    default:
      return `File class: ${getChargeLabel(chargeType)}. Identifying which elements the prosecution must prove — and which ones are weakest — is the first step. Question to surface with counsel.`;
  }
}
