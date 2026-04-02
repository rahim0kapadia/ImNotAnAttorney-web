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
      "Public defenders handle high caseloads — often 2-4x the recommended maximum. This doesn't mean yours is doing a bad job, but it means you need to be proactive: confirm deadlines, request updates in writing, and ask specifically about motions and discovery status."
    );
  } else if (input.hasAttorney === "no") {
    score -= 15;
    observations.push(
      "You don't have an attorney yet. This is urgent — most motion deadlines run from arrest date, not from when you hire counsel."
    );
  } else if (input.hasAttorney === "not-sure") {
    score -= 10;
    observations.push(
      "You're not certain about your representation status. Before anything else, confirm whether you have active counsel and who they are — your next court date may already be scheduled."
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
        `At ${getTimeLabel(input.timeSinceArrest)} post-arrest with no motions filed, key defense windows may already be closing. Suppression motions filed late are often rejected outright — meaning evidence your attorney could have challenged stays in.`
      );
    } else {
      score -= 5;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "You don't know whether motions have been filed. An engaged attorney communicates about filings proactively — if you don't know, it may mean nothing has been filed. Ask: \"What motions have you filed, and what is still pending?\""
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
        "Discovery should be in your attorney's hands by now. Without it, your attorney is building a defense without seeing the prosecution's evidence — and you can't challenge what you haven't reviewed."
      );
    } else {
      score -= 3;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "You're not sure what discovery is. Discovery is the evidence the prosecution must share with your defense — police reports, lab results, witness statements. Ask your attorney: \"Have we received all discovery?\""
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
      "Rare communication from your attorney is concerning. If your attorney isn't contacting you, there's a real chance they haven't touched your file either — attorneys bill by the hour, and no contact often means no work."
    );
  } else if (input.communicationFrequency === "never") {
    score -= 20;
    observations.push(
      "No communication from your attorney is a serious red flag. Deadlines, hearings, and plea offers can move forward whether you know about them or not. Send a written request for a case status update — email or letter, so there's a record."
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
      "A brief strategy discussion isn't enough. Your attorney should be able to explain their theory of defense, which motions they plan to file, and why."
    );
  } else if (input.strategyDiscussed === "no") {
    score -= 12;
    observations.push(
      "Your attorney hasn't discussed case strategy with you. An attorney who hasn't explained their defense theory either doesn't have one yet, or doesn't think you need to know. Neither is acceptable when your freedom is on the line."
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
      `At ${getTimeLabel(input.timeSinceArrest)} since arrest with ${motionStatus} and ${discoveryStatus}, multiple defense windows may have already closed. The longer this continues, the fewer options remain available.`
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
      "Prior misdemeanor convictions can affect plea negotiations and diversion eligibility. Ask your attorney: \"How are my priors affecting our options for diversion or reduced charges?\""
    );
  } else if (input.criminalHistory === "felony" || input.criminalHistory === "multiple") {
    score -= 5;
    observations.push(
      "Prior convictions can trigger sentencing enhancements, mandatory minimums, and loss of diversion eligibility. Ask your attorney: \"How are you accounting for my record in the defense strategy and sentencing exposure?\""
    );
  }

  // =========================================================================
  // CASE STAGE (milestone relevance calibration)
  // =========================================================================
  if (input.caseStage === "sentencing") {
    observations.push(
      "At the sentencing stage, mitigation preparation is critical — character letters, treatment documentation, and a sentencing memorandum. Ask your attorney what they're preparing."
    );
  } else if (input.caseStage === "post-conviction") {
    observations.push(
      "Post-conviction cases have strict appeal deadlines. Make sure your attorney has identified all available remedies (direct appeal, PCR, habeas) and their filing deadlines."
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
      "You're in the pre-trial phase but no motions have been filed. This is the stage where suppression motions, discovery motions, and other pre-trial motions are expected. Ask your attorney: \"What motions are we filing before trial?\""
    );
  }
  if (input.caseStage === "trial-prep" && input.strategyDiscussed !== "yes-detail") {
    score -= 5;
    observations.push(
      "You're preparing for trial but haven't had a detailed strategy discussion with your attorney. At this stage, the defense theory, witness list, and key evidence should all have been walked through with you."
    );
  }
  if (input.caseStage === "arraigned" && input.hasDiscovery !== "yes" && timeIndex >= 1) {
    score -= 3;
    observations.push(
      "You've been arraigned but haven't received discovery yet. After arraignment, your attorney should be requesting or following up on discovery — the prosecution's evidence that your defense needs to review."
    );
  }

  // =========================================================================
  // LICENSED PROFESSION (collateral career risk)
  // =========================================================================
  if (input.licensedProfession === "yes-licensed") {
    observations.push(
      "As a licensed professional, a conviction could trigger licensing board action, suspension, or revocation — separate from the criminal case itself. Make sure your attorney is addressing professional licensing consequences, not just the criminal charges."
    );
  } else if (input.licensedProfession === "yes-other") {
    observations.push(
      "A conviction can affect employment background checks, security clearances, government positions, and professional opportunities — even without a formal license at stake. Make sure your attorney is considering collateral employment consequences, not just the criminal penalty."
    );
  } else if (input.licensedProfession === "student") {
    observations.push(
      "As a student, a conviction can affect financial aid eligibility, campus housing, and academic standing. For drug offenses specifically, federal law ties FAFSA eligibility to conviction status. Make sure your attorney knows you're a student — the collateral consequences may be as important as the criminal case."
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
        ? "For DUI cases at this stage, your attorney should have already requested breathalyzer calibration records and the arresting officer's field sobriety certification. Ask: \"Have we received the breathalyzer maintenance logs?\""
        : "For DUI cases, early priorities include requesting the dash/body cam footage and the breathalyzer calibration records. Ask your attorney if these have been requested.";
    case "drug":
    case "drug-possession":
      if (noAttorney) {
        return "For drug possession cases, the right attorney will examine how the evidence was obtained — search warrant validity, informant reliability, chain of custody, and lab report accuracy. These are the first questions to ask when you retain counsel.";
      }
      return timeIndex >= 2
        ? "For drug possession cases at this stage, lab report review is critical — weight calculation errors and chain-of-custody gaps have led to charge reductions. Ask: \"Have you reviewed the lab report for accuracy?\""
        : "For drug possession cases, your attorney should be examining how the evidence was obtained — search warrant validity, informant reliability, and chain of custody. Ask what their plan is for challenging the evidence.";
    case "drug-trafficking":
      if (noAttorney) {
        return "For trafficking charges, the right attorney will examine whether you're charged based on quantity thresholds or actual distribution evidence, whether confidential informant testimony is involved, and whether wiretap evidence was properly authorized. Mandatory minimums make early intervention critical.";
      }
      return timeIndex >= 2
        ? "For trafficking cases at this stage, your attorney should have reviewed all wiretap authorizations, CI reliability records, and co-defendant statements. Conspiracy charges can extend liability to others' actions. Ask: \"Have you challenged the CI's reliability and the basis for the quantity calculation?\""
        : "For trafficking cases, your attorney should be examining the basis for the charge — quantity-based thresholds vs. actual distribution evidence, and whether conspiracy exposure applies. Ask: \"Am I exposed to mandatory minimums, and what is the quantity at issue?\"";
    case "probation-violation":
      if (noAttorney) {
        return "Probation violation hearings use a lower standard of proof — preponderance of evidence, not beyond reasonable doubt. The right attorney will determine whether this is a technical or substantive violation and whether graduated sanctions or alternatives to revocation are available.";
      }
      return timeIndex >= 2
        ? "For probation violations at this stage, your attorney should have a clear strategy for the revocation hearing — including mitigating evidence, compliance documentation, and alternative sanctions. Ask: \"What evidence are we presenting at the hearing, and have we explored graduated sanctions?\""
        : "For probation violations, the distinction between technical and substantive violations matters — technical violations often have alternatives to revocation. Ask your attorney: \"Is this a technical or substantive violation, and what alternatives to jail time exist?\"";
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
        ? "For sex offense cases at this stage, your attorney should have reviewed all forensic reports, challenged evidence handling procedures, and assessed Brady material. Registry consequences make every decision high-stakes. Ask: \"Have you identified any issues with how the evidence was collected, and what is our defense theory?\""
        : "For sex offense cases, your attorney should be scrutinizing forensic evidence collection, digital evidence preservation, and interview procedures. Ask: \"What are the registration requirements if convicted, and what is your strategy to avoid them?\"";
    case "federal-criminal":
      if (noAttorney) {
        return "Federal cases move faster and carry harsher penalties than state cases. Federal sentencing guidelines, mandatory minimums, and cooperation agreements make early attorney involvement critical. The right attorney will immediately assess your exposure under the USSG and explore pre-indictment intervention.";
      }
      return timeIndex >= 2
        ? "For federal cases at this stage, your attorney should have filed all pre-trial motions, obtained Rule 16 discovery, and have a clear sentencing strategy. Ask: \"Have we received all Rule 16 discovery, and what is our sentencing exposure under the guidelines?\""
        : "For federal cases, your attorney should be calculating your sentencing guideline range and examining grand jury materials. Ask: \"What is my estimated guideline range, and what has been discussed with the AUSA?\"";
    case "self-defense":
      if (noAttorney) {
        return "Self-defense is an affirmative defense — you're admitting the act but arguing it was justified. The right attorney will examine whether your jurisdiction follows 'stand your ground' or 'duty to retreat,' the proportionality of force used, and the timeline of events. Witness statements and surveillance footage are time-critical.";
      }
      return timeIndex >= 2
        ? "For self-defense cases at this stage, your attorney should have a clear theory of justification, preserved all surveillance and witness evidence, and prepared for force proportionality arguments. Ask: \"What is our theory of justification, and have we preserved all evidence of the threat?\""
        : "For self-defense cases, your attorney should be preserving all evidence of the threat — witness statements, surveillance footage, medical records, and 911 recordings. Ask: \"What evidence supports my reasonable belief of imminent harm, and has it been preserved?\"";
    case "other-felony":
      if (noAttorney) {
        return "For felony cases, the right attorney will build a defense theory by identifying which elements of the charge are weakest. This should be one of the first conversations you have with counsel.";
      }
      return timeIndex >= 2
        ? "For felony cases at this stage, your attorney should have a clear theory of defense and be preparing for key evidentiary hearings. Ask: \"What is our defense theory and what motions are we filing?\""
        : `For felony cases, your attorney should be building a defense theory and identifying which elements of the charge are weakest. Ask: "What is our theory of defense?"`;
    case "other-misdemeanor":
      if (noAttorney) {
        return "Even for misdemeanor charges, a conviction creates a permanent record that can affect employment, housing, and professional licensing. Many misdemeanor charges qualify for diversion or deferred adjudication — programs that can result in dismissal. When you retain an attorney, ask specifically about eligibility.";
      }
      return timeIndex >= 2
        ? "Even for misdemeanor charges, a conviction creates a permanent record. At this stage, your attorney should have explored diversion or deferred adjudication options and be actively preparing for hearings. Ask: \"Have we explored every alternative to a conviction on my record?\""
        : "Even for misdemeanor charges, a conviction creates a permanent record that can affect employment, housing, and professional licensing. Ask your attorney about diversion or deferred adjudication — programs that can result in dismissal instead of conviction.";
    default:
      return `For ${getChargeLabel(chargeType)} cases, make sure your attorney has explained the specific elements the prosecution must prove and which ones are weakest.`;
  }
}
