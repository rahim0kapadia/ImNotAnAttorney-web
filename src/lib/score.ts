/**
 * @fileoverview Defense Milestone Score Calculator — pure scoring logic.
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
 * - Time since arrest is a MODIFIER, not a direct scorer — it scales penalties
 *   for motions, discovery, and compound checks. No points added/subtracted
 *   for time alone; it determines how harshly missing milestones are penalized.
 * - Time-based expectations: penalties increase as time passes without expected
 *   milestones (e.g., no motions at 3+ months is worse than at 1 month)
 * - Final score is clamped to 0-100 and bucketed into bands:
 *   Critical (0-30), Concerning (31-50), Average (51-70), Adequate (71-85), Excellent (86-100)
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
 * in each direction. They are tailored to the defendant's specific situation
 * and serve as a preview of the kind of analysis the Case Decoder provides.
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
    score += 0; // neutral — PDs are overloaded, not bad
    observations.push(
      "Public defenders carry 2-4x recommended caseloads. Being proactive can help — confirm deadlines, request written updates, and ask about motions and discovery status."
    );
  } else if (input.hasAttorney === "no") {
    score -= 15;
    observations.push(
      "You don't have an attorney yet. This is urgent — most motion deadlines run from arrest date, not from when you hire counsel."
    );
  } else if (input.hasAttorney === "not-sure") {
    score -= 10;
    observations.push(
      "Confirm whether you have active counsel and who they are — your next court date may already be scheduled."
    );
  }

  // CHARGE-SPECIFIC OBSERVATION (mandatory — fires for every result)
  observations.push(getChargeSpecificObservation(input.chargeType, timeIndex, input.hasAttorney));

  // =========================================================================
  // MOTIONS FILED (20% weight)
  // =========================================================================
  if (input.motionsFiled === "yes") {
    score += 15;
    if (timeIndex >= 2) {
      observations.push(
        "Your attorney has filed motions — that's a positive sign of active case management."
      );
    }
  } else if (input.motionsFiled === "no") {
    if (timeIndex >= 2) {
      score -= 20;
      observations.push(
        `At ${getTimeLabel(input.timeSinceArrest)} post-arrest with no motions filed, key defense windows may be closing. Late suppression motions are often rejected — challengeable evidence stays in.`
      );
    } else {
      score -= 5;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "An engaged attorney communicates about filings proactively. If you don't know, nothing may have been filed. Ask: \"What motions have you filed, and what is still pending?\""
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
        "At this stage, discovery is typically part of the defense file. Without it, the defense is being built blind — and you can't challenge evidence you haven't reviewed. Worth asking: \"Have we received all discovery materials?\""
      );
    } else {
      score -= 3;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "Discovery is evidence the prosecution must share — police reports, lab results, witness statements. A key question: \"Have we received all discovery?\""
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
        "Monthly communication may be acceptable early on, but as your case progresses, more frequent updates become the norm — especially around hearings and deadlines."
      );
    }
  } else if (input.communicationFrequency === "rarely") {
    score -= 10;
    observations.push(
      "Rare communication is concerning. No contact often means no work — attorneys bill by the hour, and silence frequently means your file hasn't been touched."
    );
  } else if (input.communicationFrequency === "never") {
    score -= 20;
    observations.push(
      "Zero communication is a serious red flag. Deadlines, hearings, and plea offers move forward whether you know or not. Send a written status request for the record."
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
      "A brief strategy discussion isn't enough. Key questions worth asking: \"What is the theory of defense, which motions are planned, and why?\""
    );
  } else if (input.strategyDiscussed === "no") {
    score -= 12;
    observations.push(
      "If your defense theory hasn't been explained, that's a question worth asking: \"What is your theory of defense, and how does it address the prosecution's strongest evidence?\""
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
      `At ${getTimeLabel(input.timeSinceArrest)} since arrest with ${motionStatus} and ${discoveryStatus}, multiple defense windows may have closed. The longer this continues, the fewer options remain.`
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
      "Prior misdemeanor convictions can affect plea negotiations and diversion eligibility. Worth asking: \"How are priors affecting options for diversion or reduced charges?\""
    );
  } else if (input.criminalHistory === "felony" || input.criminalHistory === "multiple") {
    score -= 5;
    observations.push(
      "Prior convictions can trigger sentencing enhancements, mandatory minimums, and loss of diversion eligibility. Ask: \"How is my record factored into defense strategy and sentencing exposure?\""
    );
  }

  // =========================================================================
  // CASE STAGE (milestone relevance calibration)
  // =========================================================================
  if (input.caseStage === "sentencing") {
    observations.push(
      "At the sentencing stage, mitigation preparation is critical — character letters, treatment documentation, and a sentencing memorandum. Worth asking: \"What mitigation materials are being prepared?\""
    );
  } else if (input.caseStage === "post-conviction") {
    observations.push(
      "Post-conviction cases have strict appeal deadlines. One question worth exploring: \"Have all available remedies been identified — direct appeal, PCR, habeas — and what are their filing deadlines?\""
    );
  } else if (input.caseStage === "pre-arrest") {
    score += 3;
    observations.push(
      "Being proactive before an arrest gives you a strategic advantage. If you expect charges, consider retaining an attorney now — pre-arrest intervention can sometimes prevent charges entirely."
    );
  }

  // =========================================================================
  // CASE STAGE × MILESTONE INTERACTIONS
  // =========================================================================
  if (input.caseStage === "pre-trial" && input.motionsFiled !== "yes") {
    score -= 5;
    observations.push(
      "Pre-trial phase with no motions filed. This is when suppression and discovery motions are typically expected. Worth asking: \"What motions are being filed before trial?\""
    );
  }
  if (input.caseStage === "trial-prep" && input.strategyDiscussed !== "yes-detail") {
    score -= 5;
    observations.push(
      "Preparing for trial without a detailed strategy discussion. At this stage, the defense theory, witness list, and key evidence should all have been walked through with you."
    );
  }
  if (input.caseStage === "arraigned" && input.hasDiscovery !== "yes" && timeIndex >= 1) {
    score -= 3;
    observations.push(
      "Arraigned but no discovery yet. After arraignment, defense attorneys typically request the prosecution's evidence promptly. A question worth asking: \"Has discovery been requested, and when do we expect to receive it?\""
    );
  }

  // =========================================================================
  // LICENSED PROFESSION (collateral career risk)
  // =========================================================================
  if (input.licensedProfession === "yes-licensed") {
    observations.push(
      "A conviction could trigger licensing board action, suspension, or revocation — separate from the criminal case. Licensing consequences are worth raising as a distinct issue in your defense."
    );
  } else if (input.licensedProfession === "yes-other") {
    observations.push(
      "A conviction affects background checks, security clearances, and professional opportunities — even without a license at stake. Collateral employment consequences are worth discussing with your attorney."
    );
  } else if (input.licensedProfession === "student") {
    observations.push(
      "A conviction can affect financial aid, campus housing, and academic standing. For drug offenses, federal law ties FAFSA eligibility to conviction status. Worth raising with your attorney."
    );
  }

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

  // Guarantee at least 3 observations. Pad with general advice if needed.
  if (observations.length < 3 && score >= 70) {
    observations.push(
      "Your case shows no major red flags in the areas we measure. The Case Decoder goes deeper into charge-specific elements and jurisdiction patterns."
    );
  }
  if (observations.length < 3) {
    observations.push(
      "No milestone assessment captures everything. The factors we can't measure from 10 questions — judge tendencies, prosecutor patterns, jurisdiction-specific deadlines — often matter most."
    );
  }
  if (observations.length < 3) {
    observations.push(
      "The questions above are a starting point. Every case has jurisdiction-specific deadlines, procedural requirements, and strategic considerations that a 10-question assessment can't capture."
    );
  }

  return { score, band, observations: observations.slice(0, 5) };
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
 * and time since arrest. This fires for EVERY result — it's not padding.
 */
export function getChargeSpecificObservation(chargeType: string, timeIndex: number, hasAttorney: string): string {
  const noAttorney = hasAttorney === "no" || hasAttorney === "not-sure";

  switch (chargeType) {
    case "dui":
      if (noAttorney) {
        return "For DUI cases, the right attorney will immediately request breathalyzer calibration records, dash/body cam footage, and the arresting officer's field sobriety certification. These are the first questions to ask when you retain counsel.";
      }
      return timeIndex >= 2
        ? "In DUI cases at this stage, defense attorneys typically have already requested breathalyzer calibration records and the arresting officer's field sobriety certification. Ask: \"Have we received the breathalyzer maintenance logs?\""
        : "For DUI cases, early priorities include requesting the dash/body cam footage and the breathalyzer calibration records. A question worth asking: \"Have these been requested?\"";
    case "drug":
    case "drug-possession":
      if (noAttorney) {
        return "For drug possession cases, the right attorney will examine how the evidence was obtained — search warrant validity, informant reliability, chain of custody, and lab report accuracy. These are the first questions to ask when you retain counsel.";
      }
      return timeIndex >= 2
        ? "For drug possession cases at this stage, lab report review is critical — weight calculation errors and chain-of-custody gaps have led to charge reductions. Ask: \"Have you reviewed the lab report for accuracy?\""
        : "For drug possession cases, defense attorneys typically examine how the evidence was obtained — search warrant validity, informant reliability, and chain of custody. Ask: \"What is the plan for challenging the evidence?\"";
    case "drug-trafficking":
      if (noAttorney) {
        return "For trafficking charges, the right attorney will examine whether you're charged based on quantity thresholds or actual distribution evidence, whether confidential informant testimony is involved, and whether wiretap evidence was properly authorized. Mandatory minimums make early intervention critical.";
      }
      return timeIndex >= 2
        ? "For trafficking cases at this stage, defense attorneys typically review all wiretap authorizations, CI reliability records, and co-defendant statements. Conspiracy charges can extend liability to others' actions. Ask: \"Have the CI's reliability and the basis for the quantity calculation been challenged?\""
        : "For trafficking cases, key questions include the basis for the charge — quantity-based thresholds vs. actual distribution evidence, and whether conspiracy exposure applies. Ask: \"Am I exposed to mandatory minimums, and what is the quantity at issue?\"";
    case "probation-violation":
      if (noAttorney) {
        return "Probation violation hearings use a lower standard of proof — preponderance of evidence, not beyond reasonable doubt. The right attorney will determine whether this is a technical or substantive violation and whether graduated sanctions or alternatives to revocation are available.";
      }
      return timeIndex >= 2
        ? "For probation violations at this stage, defense attorneys typically prepare a clear strategy for the revocation hearing — including mitigating evidence, compliance documentation, and alternative sanctions. Ask: \"What evidence are we presenting at the hearing, and have we explored graduated sanctions?\""
        : "For probation violations, the distinction between technical and substantive violations matters — technical violations often have alternatives to revocation. A question worth asking: \"Is this a technical or substantive violation, and what alternatives to jail time exist?\"";
    case "white-collar":
      if (noAttorney) {
        return "White collar cases often have parallel civil or regulatory exposure on a separate timeline. When you retain an attorney, one of the first questions to ask is whether there is civil liability connected to the charges.";
      }
      return "White collar cases often have parallel civil or regulatory exposure on a separate timeline. Ask: \"Is there any civil liability connected to these charges, and are we addressing it?\"";
    case "sex-offense":
      if (noAttorney) {
        return "Sex offense cases carry severe collateral consequences beyond the criminal sentence — mandatory registry under SORNA, residency restrictions, and employment limitations that can last decades. The right attorney will scrutinize forensic evidence procedures, digital evidence handling, and Brady material before anything else.";
      }
      return timeIndex >= 2
        ? "For sex offense cases at this stage, defense attorneys typically review all forensic reports, challenge evidence handling procedures, and assess Brady material. Registry consequences make every decision high-stakes. Ask: \"Have any issues been identified with how the evidence was collected, and what is the defense theory?\""
        : "For sex offense cases, defense attorneys typically scrutinize forensic evidence collection, digital evidence preservation, and interview procedures. Ask: \"What are the registration requirements if convicted, and what is the strategy to avoid them?\"";
    case "federal-criminal":
      if (noAttorney) {
        return "Federal cases move faster and carry harsher penalties than state cases. Federal sentencing guidelines, mandatory minimums, and cooperation agreements make early attorney involvement critical. The right attorney will immediately assess your exposure under the USSG and explore pre-indictment intervention.";
      }
      return timeIndex >= 2
        ? "For federal cases at this stage, defense attorneys typically file all pre-trial motions, obtain Rule 16 discovery, and develop a clear sentencing strategy. Ask: \"Have we received all Rule 16 discovery, and what is our sentencing exposure under the guidelines?\""
        : "For federal cases, defense attorneys typically calculate the sentencing guideline range and examine grand jury materials early. Ask: \"What is my estimated guideline range, and what has been discussed with the AUSA?\"";
    case "self-defense":
      if (noAttorney) {
        return "Self-defense is an affirmative defense — you're admitting the act but arguing it was justified. The right attorney will examine whether your jurisdiction follows 'stand your ground' or 'duty to retreat,' the proportionality of force used, and the timeline of events. Witness statements and surveillance footage are time-critical.";
      }
      return timeIndex >= 2
        ? "For self-defense cases at this stage, defense attorneys typically have a clear theory of justification, preserved all surveillance and witness evidence, and prepared for force proportionality arguments. Ask: \"What is the theory of justification, and has all evidence of the threat been preserved?\""
        : "For self-defense cases, preserving all evidence of the threat is critical — witness statements, surveillance footage, medical records, and 911 recordings. Ask: \"What evidence supports a reasonable belief of imminent harm, and has it been preserved?\"";
    case "other-felony":
      if (noAttorney) {
        return "For felony cases, the right attorney will build a defense theory by identifying which elements of the charge are weakest. This is typically one of the first conversations when retaining counsel.";
      }
      return timeIndex >= 2
        ? "For felony cases at this stage, defense attorneys typically have a clear theory of defense and are preparing for key evidentiary hearings. Ask: \"What is our defense theory and what motions are we filing?\""
        : `For felony cases, building a defense theory and identifying which elements of the charge are weakest is a key early step. Ask: "What is the theory of defense?"`;
    case "other-misdemeanor":
      if (noAttorney) {
        return "Even for misdemeanor charges, a conviction creates a permanent record that can affect employment, housing, and professional licensing. Many misdemeanor charges qualify for diversion or deferred adjudication — programs that can result in dismissal. When you retain an attorney, ask specifically about eligibility.";
      }
      return timeIndex >= 2
        ? "Even for misdemeanor charges, a conviction creates a permanent record. At this stage, diversion or deferred adjudication options are worth exploring. Ask: \"Have we explored every alternative to a conviction on my record?\""
        : "Even for misdemeanor charges, a conviction creates a permanent record that can affect employment, housing, and professional licensing. A question worth asking: are diversion or deferred adjudication programs available — options that can result in dismissal instead of conviction?";
    default:
      return `For ${getChargeLabel(chargeType)} cases, understanding which elements the prosecution must prove — and which ones are weakest — is a key question worth exploring.`;
  }
}
