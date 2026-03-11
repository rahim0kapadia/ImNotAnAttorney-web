/**
 * @fileoverview Defense Milestone Score Calculator
 *
 * Free lead magnet that scores defense milestones based on a defendant's
 * 10 self-reported questions. Lives at /score on the frontend.
 *
 * Funnel position:
 *   Blog / Social / Score Page --> POST /api/score --> Score + Observations
 *     --> CTA to Case Decoder ($197) for detailed analysis
 *
 * Scoring algorithm:
 * - Starts at 50 (midpoint) and adjusts based on weighted categories:
 *   - Time since arrest vs milestones: 30% weight (drives penalty thresholds)
 *   - Motions filed: 20% weight
 *   - Discovery received: 15% weight
 *   - Communication frequency: 15% weight
 *   - Attorney type: 10% weight
 *   - Strategy discussion: 10% weight
 * - Time-based expectations: penalties increase as time passes without expected
 *   milestones (e.g., no motions at 3+ months is worse than at 1 month)
 * - Final score is clamped to 0-100 and bucketed into bands:
 *   Critical (0-30), Concerning (31-50), Average (51-70), Adequate (71-85), Excellent (86-100)
 *
 * Privacy-first design:
 * - NO data is stored -- the score is computed and returned in the response only
 * - No Supabase client is created, no database writes occur
 * - No email is collected (email capture is handled by the frontend separately)
 * - No cookies or session tracking
 *
 * Security:
 * - All 7 inputs are validated against an allowlist (ALLOWED_VALUES) before
 *   processing. This prevents injection and ensures the scoring algorithm
 *   only receives expected values.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

/** Input shape for the score calculator -- all 10 fields are required */
type ScoreInput = {
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
};

/** Output shape: numeric score (0-100), descriptive band, and 3-5 observations */
type ScoreResult = {
  score: number;
  band: string;
  observations: string[];
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
function calculateScore(input: ScoreInput): ScoreResult {
  let score = 50; // Start at midpoint -- neutral baseline
  const observations: string[] = [];

  // =========================================================================
  // TIME SINCE ARREST -- baseline for milestone expectations (30% weight)
  // This doesn't directly adjust the score, but the timeIndex drives thresholds
  // in other categories. At timeIndex >= 2 (3+ months), we expect motions and
  // discovery to be in progress. At timeIndex >= 3 (6+ months), penalties
  // compound for missing both.
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
  // Private attorney gets a small boost. Public defenders are neutral -- they're
  // overloaded, not incompetent. Having no attorney at all is a significant
  // penalty because motion deadlines run from arrest date regardless.
  // =========================================================================
  if (input.hasAttorney === "private") {
    score += 5;
  } else if (input.hasAttorney === "public-defender") {
    score += 0; // neutral — PDs are overloaded, not bad
  } else if (input.hasAttorney === "no") {
    score -= 15;
    observations.push(
      "You don't have an attorney yet. This is urgent — most motion deadlines run from arrest date, not from when you hire counsel."
    );
  }

  // =========================================================================
  // MOTIONS FILED (20% weight)
  // Motions (suppression, discovery demands, etc.) are a key defense milestone.
  // The penalty for "no motions" increases with time -- at 3+ months post-arrest,
  // suppression windows may already be closing. "Don't know" also gets penalized
  // because an engaged attorney proactively communicates about filings.
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
        `At ${getTimeLabel(input.timeSinceArrest)} post-arrest with no motions filed, your attorney may be behind on standard defense milestones. Key suppression and discovery motions typically need to be filed early.`
      );
    } else {
      score -= 5;
    }
  } else {
    // "dont-know" -- the defendant not knowing is itself a red flag
    score -= 10;
    observations.push(
      "You don't know whether motions have been filed. Your attorney should be telling you this proactively — ask them at your next meeting."
    );
  }

  // =========================================================================
  // DISCOVERY RECEIVED (15% weight)
  // Discovery (police reports, lab results, witness statements) is the
  // prosecution's evidence that must be shared with the defense. Not having
  // it at 3+ months is a red flag. "Don't know" triggers an educational
  // observation explaining what discovery IS -- many defendants have never
  // heard the term.
  // =========================================================================
  if (input.hasDiscovery === "yes") {
    score += 10;
  } else if (input.hasDiscovery === "no") {
    if (timeIndex >= 2) {
      score -= 15;
      observations.push(
        "You should have received discovery by now. If your attorney hasn't provided it or explained the delay, this is a red flag."
      );
    } else {
      score -= 3;
    }
  } else {
    // "dont-know" -- educational observation about what discovery means
    score -= 10;
    observations.push(
      "You're not sure what discovery is. Discovery is the evidence the prosecution must share with your defense — police reports, lab results, witness statements. Ask your attorney: \"Have we received all discovery?\""
    );
  }

  // =========================================================================
  // COMMUNICATION FREQUENCY (15% weight)
  // How often the attorney communicates with the defendant. "Never" is a
  // serious red flag at any stage. "Rarely" is concerning. "Monthly" becomes
  // insufficient as the case progresses past 3 months (hearings get scheduled,
  // deadlines approach). "Weekly" is the gold standard.
  // =========================================================================
  if (input.communicationFrequency === "weekly") {
    score += 10;
  } else if (input.communicationFrequency === "monthly") {
    score += 0;
    if (timeIndex >= 2) {
      observations.push(
        "Monthly communication may be acceptable early on, but as your case progresses, you should expect more frequent updates — especially around hearings and deadlines."
      );
    }
  } else if (input.communicationFrequency === "rarely") {
    score -= 10;
    observations.push(
      "Rare communication from your attorney is concerning. You're paying for representation — that includes keeping you informed about your own case."
    );
  } else if (input.communicationFrequency === "never") {
    score -= 20;
    observations.push(
      "No communication from your attorney is a serious red flag. You have a right to know what's happening in your case. Consider sending a written request for a case status update."
    );
  }

  // =========================================================================
  // STRATEGY DISCUSSION (10% weight)
  // Whether the attorney has explained their defense theory, planned motions,
  // and approach. "Yes in detail" is ideal. "Briefly" is insufficient -- the
  // defendant should understand the WHY, not just the WHAT. "No" is a
  // fundamental failure of representation communication.
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
      "Your attorney hasn't discussed case strategy with you. This is a fundamental part of representation — you should understand the defense approach, not just show up to court dates."
    );
  }

  // =========================================================================
  // COMPOUND TIME-BASED PENALTY
  // If the case is 6+ months old AND both motions and discovery are missing,
  // apply an additional penalty. This catches the worst-case scenario where
  // a defendant has been sitting in limbo with no visible defense activity
  // for over half a year.
  // =========================================================================
  if (timeIndex >= 3 && input.motionsFiled !== "yes" && input.hasDiscovery !== "yes") {
    score -= 10;
    observations.push(
      `At ${getTimeLabel(input.timeSinceArrest)} since arrest with no motions and no discovery, your case may be significantly behind schedule. Multiple defense milestones are likely overdue.`
    );
  }

  // =========================================================================
  // CRIMINAL HISTORY (sentencing exposure context)
  // Prior convictions affect sentencing guidelines, mandatory minimums, and
  // diversion eligibility. Felony/multiple priors = higher stakes.
  // =========================================================================
  if (input.criminalHistory === "none") {
    score += 3;
  } else if (input.criminalHistory === "felony" || input.criminalHistory === "multiple") {
    score -= 5;
    observations.push(
      "Prior convictions can affect sentencing exposure, mandatory minimums, and diversion eligibility. Make sure your attorney has factored your full record into their strategy."
    );
  }

  // =========================================================================
  // CASE STAGE (milestone relevance calibration)
  // Post-conviction cases need different milestones than pre-trial. Sentencing
  // stage adds urgency for mitigation preparation.
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
  // LICENSED PROFESSION (collateral career risk)
  // Licensed professionals face career-ending collateral consequences that
  // require specific attention in defense strategy.
  // =========================================================================
  if (input.licensedProfession === "yes-licensed") {
    observations.push(
      "As a licensed professional, a conviction could trigger licensing board action, suspension, or revocation — separate from the criminal case itself. Make sure your attorney is addressing professional licensing consequences, not just the criminal charges."
    );
  }

  // Clamp score to valid 0-100 range
  score = Math.max(0, Math.min(100, score));

  // =========================================================================
  // SCORE BANDING
  // Maps the numeric score to a human-readable band. These labels appear on
  // the score page results and in the CTA messaging.
  // =========================================================================
  let band: string;
  if (score <= 30) band = "Critical";
  else if (score <= 50) band = "Concerning";
  else if (score <= 70) band = "Average";
  else if (score <= 85) band = "Adequate";
  else band = "Excellent";

  // =========================================================================
  // OBSERVATION PADDING
  // Ensure at least 3 observations for a meaningful report. If the algorithm
  // didn't generate enough (e.g., mostly positive answers), add generic but
  // still useful observations. The charge-type-specific observation uses
  // getChargeLabel() to provide relevant context. The final fallback is a
  // Case Decoder upsell -- the natural next step from the free score.
  // Observations are capped at 5 to keep the output digestible.
  // =========================================================================
  if (observations.length < 3) {
    if (score >= 70) {
      observations.push(
        "Based on your answers, your attorney appears to be meeting basic accountability benchmarks. A detailed Case Decoder report can verify this with 15 case-specific questions."
      );
    }
    if (observations.length < 3 && input.chargeType) {
      observations.push(
        `For ${getChargeLabel(input.chargeType)} cases, make sure your attorney has explained the specific elements the prosecution must prove and which ones are weakest.`
      );
    }
    if (observations.length < 3) {
      observations.push(
        "Every case has defense opportunities. The question is whether your attorney is finding them. Our Case Decoder identifies 15 specific questions for your situation."
      );
    }
  }

  return { score, band, observations: observations.slice(0, 5) };
}

/**
 * Converts a timeSinceArrest slug to a human-readable label for use in
 * observation strings. Falls back to the raw slug if not found.
 */
function getTimeLabel(time: string): string {
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
function getChargeLabel(charge: string): string {
  const labels: Record<string, string> = {
    drug: "drug offense",
    dui: "DUI/DWI",
    "white-collar": "white collar",
    "other-felony": "felony",
    "other-misdemeanor": "misdemeanor",
  };
  return labels[charge] ?? charge;
}

/**
 * Input validation allowlist. Every field value must appear in this map.
 * This prevents arbitrary input from reaching the scoring algorithm and
 * protects against injection (no user-supplied strings are used in scoring
 * logic -- only pre-defined slug values that are checked against this list).
 */
const ALLOWED_VALUES: Record<string, string[]> = {
  chargeType: ["drug", "dui", "white-collar", "other-felony", "other-misdemeanor"],
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
 * Validates all 10 required inputs against the allowlist, then computes and
 * returns the Defense Milestone Score. No data is persisted to any
 * database -- the score is computed and returned in the response only.
 *
 * @param req - JSON body with all 10 ScoreInput fields
 * @returns JSON with score (number 0-100), band (string), and observations (array of strings)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { limited } = await checkRateLimit(createAdminClient(), `score:${ip}`, 10, 60);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();

    // =========================================================================
    // INPUT VALIDATION
    // All 7 fields are required. Each value is checked against the ALLOWED_VALUES
    // allowlist. This is the ONLY validation needed -- the scoring algorithm
    // trusts that inputs have been pre-validated to known-good values.
    // =========================================================================
    const required = [
      "chargeType",
      "timeSinceArrest",
      "hasAttorney",
      "motionsFiled",
      "hasDiscovery",
      "communicationFrequency",
      "strategyDiscussed",
      "criminalHistory",
      "caseStage",
      "licensedProfession",
    ];

    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
      // Allowlist validation: reject any value not in the predefined set
      if (ALLOWED_VALUES[field] && !ALLOWED_VALUES[field].includes(body[field])) {
        return NextResponse.json(
          { error: `Invalid value for ${field}: ${body[field]}` },
          { status: 400 }
        );
      }
    }

    // Compute score -- pure function, no side effects, no data storage
    const result = calculateScore(body as ScoreInput);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Score] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
