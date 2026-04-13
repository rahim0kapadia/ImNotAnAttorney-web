/**
 * @fileoverview Court reminders shared types, constants, and content.
 *
 * COURT_PREP_CONTENT provides charge-type-specific court logistics
 * (what to expect, what to bring, what to wear). This is general legal
 * education — the kind available on any court website or legal blog.
 *
 * NO attorney questions. NO case-specific analysis. Those are paid products.
 */

// ── Types ───────────────────────────────────────────────────
export interface CourtReminder {
  id: string;
  token: string;
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  recommended_tier: string | null;
  partner_promo_code: string | null;
  status: "active" | "completed" | "unsubscribed";
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  order_id: string | null;
  indemnitor_name?: string | null;
  indemnitor_email?: string | null;
  last_name?: string | null;
}

// ── Reminder intervals (days before court date) ─────────────
export const REMINDER_INTERVALS = [
  { key: "reminder_14d", daysBefore: 14 },
  { key: "reminder_7d", daysBefore: 7 },
  { key: "reminder_3d", daysBefore: 3 },
  { key: "reminder_1d", daysBefore: 1 },
] as const;

/** Post-court follow-up (1 day AFTER). Handled separately from pre-court. */
export const POST_COURT_KEY = "post_court";

// ── Prep page expiration: 30 days after court date ──────────
export const PREP_PAGE_EXPIRY_DAYS = 30;

// ── Court prep content per charge type ──────────────────────
export interface CourtPrepContent {
  whatToExpect: string;
  whatToBring: string[];
  whatToWear: string;
  arrivalTips: string;
  /** Teaser copy — describes what the paid product covers, NOT actual questions */
  paidProductTeaser: string;
}

const GENERIC_CONTENT: CourtPrepContent = {
  whatToExpect:
    "At your hearing, a judge will review the charges against you. The prosecutor will present their position, and your attorney will respond on your behalf. You may or may not be asked to speak — follow your attorney's guidance. Hearings typically last 10-30 minutes.",
  whatToBring: [
    "Government-issued photo ID",
    "Your bond paperwork",
    "Any documents your attorney asked you to bring",
    "A pen and notepad for notes",
  ],
  whatToWear:
    "Business casual or better. No hats, sunglasses, shorts, or tank tops. Courts take appearance seriously — dress like you take your case seriously.",
  arrivalTips:
    "Arrive 30 minutes early. Go through security (no phones in some courtrooms — check your county's rules). Find the correct courtroom number from the docket board in the lobby. Sit quietly until your case is called.",
  paidProductTeaser:
    "Your case has specific angles an attorney should investigate — charge-specific weaknesses, procedural requirements, and evidence standards. Our analysis identifies them and gives you the exact questions.",
};

const DUI_CONTENT: CourtPrepContent = {
  whatToExpect:
    "DUI hearings often involve a review of the traffic stop, field sobriety tests, and chemical test results. The prosecutor will present the officer's report. Your attorney may challenge the stop, the testing procedures, or the chain of custody for samples.",
  whatToBring: [
    ...GENERIC_CONTENT.whatToBring,
    "Any receipts or records from the night of the arrest (if available)",
  ],
  whatToWear: GENERIC_CONTENT.whatToWear,
  arrivalTips: GENERIC_CONTENT.arrivalTips,
  paidProductTeaser:
    "DUI cases have specific procedural requirements — calibration records, observation periods, rising blood alcohol timelines. Our analysis identifies the angles specific to YOUR stop and YOUR test results.",
};

const DRUG_CONTENT: CourtPrepContent = {
  whatToExpect:
    "Drug possession hearings focus on the circumstances of the search, the chain of custody for the substance, and lab testing procedures. Your attorney may challenge whether the search was lawful or whether the substance was properly identified.",
  whatToBring: GENERIC_CONTENT.whatToBring,
  whatToWear: GENERIC_CONTENT.whatToWear,
  arrivalTips: GENERIC_CONTENT.arrivalTips,
  paidProductTeaser:
    "Drug cases hinge on search legality and evidence handling. Our analysis identifies the specific procedural questions that apply to YOUR arrest circumstances.",
};

const THEFT_CONTENT: CourtPrepContent = {
  whatToExpect:
    "Theft hearings examine the evidence of intent, the value of the property, and any surveillance or witness testimony. The distinction between misdemeanor and felony theft depends on value thresholds that vary by state.",
  whatToBring: GENERIC_CONTENT.whatToBring,
  whatToWear: GENERIC_CONTENT.whatToWear,
  arrivalTips: GENERIC_CONTENT.arrivalTips,
  paidProductTeaser:
    "Theft charges have value thresholds, intent requirements, and restitution opportunities that vary by jurisdiction. Our analysis maps the specific angles for YOUR charge.",
};

export const COURT_PREP_CONTENT: Record<string, CourtPrepContent> = {
  "dui-first-offense": DUI_CONTENT,
  "drug-possession": DRUG_CONTENT,
  "drug-trafficking": DRUG_CONTENT,
  "white-collar": THEFT_CONTENT,
  "federal-criminal": GENERIC_CONTENT,
  "probation-violation": GENERIC_CONTENT,
  "sex-offense": GENERIC_CONTENT,
  "self-defense": GENERIC_CONTENT,
  other: GENERIC_CONTENT,
};

/** Get prep content for a charge type, always returns content (never undefined). */
export function getPrepContent(chargeSlug: string): CourtPrepContent {
  return COURT_PREP_CONTENT[chargeSlug] || GENERIC_CONTENT;
}

// ── Charge type display names ───────────────────────────────
export const CHARGE_DISPLAY_NAMES: Record<string, string> = {
  "dui-first-offense": "DUI / DWI",
  "drug-possession": "Drug Possession",
  "drug-trafficking": "Drug Trafficking",
  "white-collar": "White Collar",
  "federal-criminal": "Federal Charges",
  "probation-violation": "Probation Violation",
  "sex-offense": "Sex Offense",
  "self-defense": "Self-Defense Claim",
  other: "Criminal Charges",
};
