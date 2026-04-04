/**
 * @fileoverview Drip email templates for nurture and post-purchase sequences.
 *
 * This file defines multiple email sequences:
 *
 * 1. **Nurture sequence** (NURTURE_EMAILS) — sent to free subscribers on a
 *    schedule of day 1, 3, 5, 7, 10, 14 after subscribing. Goal: demonstrate
 *    expertise with real case examples, build trust, convert to Case Decoder.
 *
 * 2. **DUI 72-hour crisis sequence** (DUI_72_HOUR_EMAILS) — tighter cadence
 *    for subscribers who entered via the "First 72 Hours" lead magnet
 *    (source: "dui-72-hours"). Day 2, 4, 7 after subscribing. Goal: address
 *    DMV deadline urgency, bridge to $97 DUI Playbook purchase. After Day 7,
 *    subscribers join standard nurture at Day 10+.
 *
 * 3. **Score-based sequences** (SCORE_CRISIS_EMAILS, SCORE_ADEQUATE_EMAILS,
 *    SCORE_REENGAGE_EMAILS) — for subscribers from the Case Progress Score page.
 *
 * 4. **Post-purchase sequences** (POST_PURCHASE_EMAILS) — tier-specific emails
 *    triggered after a purchase. Each tier has its own sequence:
 *      - Case Decoder: intake reminder → delivery → meeting prep → story harvest → upsell → referral
 *      - Intelligence Brief: phase2 reminder → delivery → meeting prep → story harvest → upsell → referral
 *      - X-Ray: intake reminder → delivery → upload reminder → meeting prep → story harvest → upsell → referral → status update
 *      - War Room: intake reminder → delivery → meeting prep → story harvest → status update → referral
 *      - Situation Room: intake reminder → delivery → meeting prep → story harvest → status update → referral
 *      - Witness Pack: delivery → upload reminder → status update → story harvest → upsell
 *      - Extra Witness: delivery
 *
 * 5. **Abandoned score sequence** (ABANDONED_SCORE_EMAILS) — for subscribers who
 *    started the /score quiz but didn't complete (source: "score-abandoned").
 *    Day 1, 2, 5 — re-engage to finish the quiz, then fall through to nurture.
 *
 * 6. **Score re-engagement extended** (SCORE_REENGAGE_EMAILS) — Day 7, 14, 21, 30
 *    for all score subscribers after band-specific emails complete. Builds case
 *    for Case Decoder purchase with free questions and social proof.
 *
 * 7. **Win-back sequence** (WINBACK_EMAILS) — for 60-day cold subscribers who
 *    exhausted all other sequences without purchasing. Day 75, 78, 82, 89, 96.
 *    Value-first re-engagement with case study, social proof, and sunset emails.
 *
 * CRISIS BUYER PSYCHOLOGY (NON-NEGOTIABLE):
 *
 * Defendants are CRISIS BUYERS with a 7-day decision window, NOT newsletter
 * subscribers. By day 14, they've bought or moved on. Their case resolves in
 * 3-12 months — after that, they never want to hear from us again.
 *
 * - Pre-purchase: Convert in 7 days or lose them. Crisis drip (Day 2/4/7) is
 *   the right model. Long nurture (Day 14+) converts near zero for crisis buyers.
 * - Post-purchase: Follow-up DOES work (active case, 30-90 day window) — meeting
 *   prep, story harvest, upsell to next tier.
 * - Email capture is for FOLLOW-UP during the decision window, not list-building.
 * - This is NOT a recurring revenue business. Each defendant is a one-time buyer.
 * - Different charge types have different windows: DUI 7d, Drug 48h, Federal 24h.
 *
 * KEY DESIGN DECISIONS:
 *
 * - `relativeToDelivery` flag: When true, the `delayDays` is measured from
 *   `cases.delivered_at` (when the report was actually delivered to the customer),
 *   NOT from the purchase date. This ensures story-harvest emails arrive ~5 days
 *   after the customer receives their report, not 5 days after payment (which
 *   could be before delivery for higher tiers with longer turnaround).
 *
 * - Day-0 emails (delayDays: 0) are sent by the delivery/webhook endpoints
 *   at the moment of purchase or delivery, NOT by the drip cron job. The cron
 *   skips them because delayDays === 0 means "send immediately" and the cron
 *   runs on a schedule, not in real-time.
 *
 * - `getSiteUrl()` reads the env var at call time, not module load time. This
 *   matters because in serverless environments, the module may be loaded once
 *   and reused across requests with different env configurations (e.g., preview
 *   deploys vs production).
 *
 * PRICING: All dollar amounts in email copy are derived from TIER_CORE
 * (src/lib/tiers.ts) via upgradePrice() and upgradeCostBetween() helpers.
 * Upgrade costs are computed automatically — no manual math needed.
 *
 * Style: dark bg (#0C0A09), zinc text (#D4D4D8), amber accent (#F59E0B).
 * CAN-SPAM footer is added by sendEmail() in lib/email.ts — not here.
 */

import { TIER_CORE, upgradePrice, upgradeCostBetween } from "@/lib/tiers";
import { getChargeLabel } from "@/lib/score";
import { escapeHtml } from "@/lib/email";

// ============================================================
// TYPES
// ============================================================

/**
 * A single drip email template with scheduling metadata.
 *
 * The cron job uses `delayDays`, `tier`, `relativeToDelivery`, and `key`
 * to determine which email to send and when. The `html` is the inner content
 * that gets wrapped in the branded template by sendEmail().
 */
export interface DripEmail {
  key: string;
  delayDays: number;
  subject: string;
  html: string;
  /** If set, this email is for a specific purchase tier, not the nurture sequence */
  tier?: string;
  /** If true, delay is relative to attorney_meeting_date, not subscribe/purchase date */
  relativeToMeeting?: boolean;
  /** If true, delay is relative to cases.delivered_at, not subscribe/purchase date */
  relativeToDelivery?: boolean;
  /** If true, delay is relative to cases.updated_at when status became 'submitted' */
  relativeToSubmission?: boolean;
  /** Score band filter — if set, this email only applies to subscribers with this band */
  scoreBand?: "Critical" | "Concerning" | "Adequate" | "Excellent";
}

// ============================================================
// TEMPLATE HELPERS
// ============================================================

/**
 * Returns the site URL for constructing email links.
 *
 * Reads from the env var at call time (not module load time) so that
 * serverless function reuse across preview vs production deploys gets the
 * correct URL. Falls back to the production domain.
 *
 * @returns The site base URL without trailing slash.
 */
function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
}

/**
 * Generates a styled CTA button as an HTML anchor tag.
 *
 * @param text - Button label text.
 * @param href - Path appended to the site URL (e.g., "/checkout?tier=case-decoder").
 * @returns An HTML string for an amber call-to-action button.
 */
function cta(text: string, href: string): string {
  return `<a href="${getSiteUrl()}${href}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">${text}</a>`;
}

/**
 * Generates a styled inline text link.
 *
 * @param text - Link display text.
 * @param href - Path appended to the site URL.
 * @returns An HTML string for an amber underlined link.
 */
function link(text: string, href: string): string {
  return `<a href="${getSiteUrl()}${href}" style="color: #F59E0B; text-decoration: underline;">${text}</a>`;
}

/**
 * Interpolates score-specific template variables in email subject and HTML.
 *
 * Replaces:
 * - {{SCORE}} with numeric score (e.g., "42")
 * - {{CHARGE_LABEL}} with human-readable charge label (e.g., "DUI/DWI")
 * - charge-variant divs: shows matching variant, strips others
 *
 * If scoreValue is null, {{SCORE}} becomes "your score".
 * If chargeType is null, {{CHARGE_LABEL}} becomes "criminal"
 * and all charge-variant divs are stripped.
 */
export function interpolateScoreVars(
  email: DripEmail,
  scoreValue: number | null,
  chargeType: string | null
): DripEmail {
  const scoreStr = scoreValue != null ? String(scoreValue) : "your score";
  const chargeLabel = chargeType ? getChargeLabel(chargeType) : "criminal";

  const subject = email.subject
    .split("{{SCORE}}").join(scoreStr)
    .split("{{CHARGE_LABEL}}").join(chargeLabel);

  let html = email.html
    .split("{{SCORE}}").join(scoreStr)
    .split("{{CHARGE_LABEL}}").join(chargeLabel);

  // Show matching charge-variant div, strip others
  const variants = ["dui", "drug", "white-collar", "felony", "misdemeanor"];
  const matchSlug = chargeType === "other-felony" ? "felony"
    : chargeType === "other-misdemeanor" ? "misdemeanor"
    : chargeType;

  for (const v of variants) {
    if (v === matchSlug) {
      // Show: remove display:none
      html = html.split(`class="charge-variant-${v}" style="display:none;"`).join(`class="charge-variant-${v}"`);
    } else {
      // Strip: remove entire div block
      const openTag = `<div class="charge-variant-${v}" style="display:none;">`;
      const closeTag = `</div>`;
      let idx = html.indexOf(openTag);
      while (idx !== -1) {
        const endIdx = html.indexOf(closeTag, idx);
        if (endIdx === -1) break;
        html = html.slice(0, idx) + html.slice(endIdx + closeTag.length);
        idx = html.indexOf(openTag);
      }
    }
  }

  return { ...email, subject, html };
}

// ============================================================
// NURTURE SEQUENCE (free subscribers)
// Schedule: day 1, 3, 5, 7, 10, 14 after subscribing.
// Goal: build trust with real case examples, convert to Case Decoder ($197).
// Each email provides genuine standalone value before the CTA.
// ============================================================

export const NURTURE_EMAILS: DripEmail[] = [
  {
    key: "nurture_day1",
    delayDays: 1,
    subject: "3 things your attorney should have done by now",
    html: `
      <h1 style="color: #F59E0B;">3 Things Your Attorney Should Have Done By Now</h1>
      <p>If you're past arraignment, your attorney should have done three things by now:</p>
      <p><strong style="color: white;">1. Reviewed ALL discovery with you</strong> — not summarized it. Reviewed every page and explained what matters.</p>
      <p><strong style="color: white;">2. Identified at least one issue</strong> — weight discrepancies, witness contradictions, procedural errors. Every case has them.</p>
      <p><strong style="color: white;">3. Filed or discussed motions</strong> — suppression, dismissal, compelling discovery. If none have been discussed, ask why.</p>
      <p>If all three are done, those are positive signs of active representation.</p>
      <p>If even one is missing, some defendants ask: <em>"Why hasn't this been done yet?"</em></p>
      ${cta("See what informed defendants find →", "/sample")}
    `,
  },
  {
    key: "nurture_day3",
    delayDays: 3,
    subject: "What 500 pages of discovery actually means",
    html: `
      <h1 style="color: #F59E0B;">What 500 Pages of Discovery Actually Means</h1>
      <p>500 pages of discovery is not 500 pages of reading.</p>
      <p>It's police reports in cop shorthand. Lab results with methodology codes. Witness statements that contradict each other in ways you can't see unless you read them side by side.</p>
      <p>Your attorney read it. Probably. But <strong style="color: white;">reading and analyzing are different things.</strong></p>
      <p>Analyzing means catching that the inventory weight doesn't match the lab weight. That the field test date is after the arrest date. That the CI's phone number appears in two different people's records.</p>
      <p>The defendants who know what to look for walk into attorney meetings with leverage.</p>
      ${cta("Re-download the Discovery Checklist →", "/resources")}
    `,
  },
  {
    key: "nurture_day5",
    delayDays: 5,
    subject: "We found 68.3g of missing evidence. The attorney never mentioned it.",
    html: `
      <h1 style="color: #F59E0B;">68.3 Grams of Missing Evidence</h1>
      <p>A real trafficking case. Mandatory minimum: 3 years.</p>
      <p>The police inventory said <strong style="color: white;">93.9 grams</strong>. The lab report said <strong style="color: white;">25.59 grams</strong>. That's 68.3 grams missing — <strong style="color: #EF4444;">73% of the evidence weight</strong>.</p>
      <p>The charging document said "amphetamine." The lab confirmed MDMA/MDA — a completely different substance.</p>
      <p>21 latent fingerprints. Zero matched the defendant.</p>
      <p><strong style="color: white;">The attorney had raised none of these issues.</strong></p>
      <p>We found all of them in the discovery documents. We generated 15 specific questions — each traced to a documented winning method from attorneys like elite defense attorneys who've won landmark acquittals.</p>
      ${cta("See the full sample report →", "/sample")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">DUI charges?</strong> Get the ${TIER_CORE["dui-first-offense"].name} — ${TIER_CORE["dui-first-offense"].priceDisplay}, instant download. 26 questions that change how your next attorney meeting goes + breathalyzer checklist + attorney scorecard. ${link("Get the Playbook →", "/playbook/dui-first-offense")}
      </p>
    `,
  },
  {
    key: "nurture_day7",
    delayDays: 7,
    subject: `15 questions, ${TIER_CORE["case-decoder"].priceDisplay}, 48 hours — here's exactly what you get`,
    html: `
      <h1 style="color: #F59E0B;">Here's What a Case Decoder Includes</h1>
      <ul style="padding-left: 20px;">
        <li>Your charges explained in plain English — with what the prosecution must prove</li>
        <li>15 calibrated questions for your attorney (6-part format with follow-up probes)</li>
        <li>Ready-to-send email template + phone script for your attorney</li>
        <li>Where Things Stand — 4-area diagnostic of your case</li>
        <li>Your Next 7 Days — one action per day with Meeting Ready Sheet</li>
        <li>Included: Scripts for when the conversation gets difficult</li>
      </ul>
      <p>Every question generated using tactics from elite defense attorneys — elite defense attorneys with decades of trial experience.</p>
      <p>Delivered within 48 hours with 15 calibrated questions + communication tools — or your money back.</p>
      <p>Not the right fit? 100% credit toward any higher tier within 30 days.</p>
      <p><strong style="color: white;">${TIER_CORE["case-decoder"].priceDisplay}.</strong> Less than one hour of your attorney's time.</p>
      ${cta(`Find What's in My Case — ${TIER_CORE["case-decoder"].priceDisplay} →`, "/checkout?tier=case-decoder")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Not ready for case-specific?</strong> The ${TIER_CORE["dui-first-offense"].name} (${TIER_CORE["dui-first-offense"].priceDisplay}) gives you 26 general DUI questions instantly. Full credit toward Case Decoder within 30 days. ${link("Get the Playbook →", "/playbook/dui-first-offense")}
      </p>
    `,
  },
  {
    key: "nurture_day10",
    delayDays: 10,
    subject: "Did you ask your attorney question #4?",
    html: `
      <h1 style="color: #F59E0B;">Question #4: CI Reliability</h1>
      <p>From the Discovery Checklist: <em>"If a CI is involved, has their reliability been challenged?"</em></p>
      <p>Most defendants don't know a confidential informant was used in their case. The ones who do rarely ask about the CI's track record.</p>
      <p>In the real case we reviewed, the CI's phone number appeared in <strong style="color: white;">both the informant's file AND the defendant's records</strong>. Same detective. Same report. That's a Franks v. Delaware issue.</p>
      <p>One question. Asked at the right time. Can change everything.</p>
      ${cta("Re-download the Discovery Checklist →", "/resources")}
    `,
  },
  {
    key: "nurture_day14",
    delayDays: 14,
    subject: "Motion deadlines don't wait — and your attorney might not remind you",
    html: `
      <h1 style="color: #F59E0B;">Motion Deadlines Don't Wait</h1>
      <p>Motion deadlines are real. Once they pass, arguments that could have changed your entire case are <strong style="color: #EF4444;">gone forever</strong>.</p>
      <p>A motion to suppress that could have thrown out evidence. A Franks hearing that could have invalidated the warrant. A motion to dismiss based on a charging error.</p>
      <p>In the real case we reviewed, <strong style="color: white;">zero motions had been filed</strong>. The substance variance alone was grounds for a motion to dismiss.</p>
      <p>The Case Decoder includes a motion deadline awareness section specific to your charges. It tells you what to ASK about — so nothing slips through the cracks.</p>
      <p><strong style="color: white;">${TIER_CORE["case-decoder"].priceDisplay}. ${TIER_CORE["case-decoder"].delivery}.</strong> The cost of not knowing is higher.</p>
      ${cta(`Find What's in My Case — ${TIER_CORE["case-decoder"].priceDisplay} →`, "/checkout?tier=case-decoder")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">DUI charges?</strong> Start with the ${TIER_CORE["dui-first-offense"].name} — ${TIER_CORE["dui-first-offense"].priceDisplay} instant download. 26 questions + attorney scorecard. The ${TIER_CORE["dui-first-offense"].priceDisplay} counts toward any service tier within 30 days — you never pay it twice. ${link("Get the Playbook", "/playbook/dui-first-offense")}
      </p>
    `,
  },
];

// ============================================================
// SCORE-BASED CRISIS EMAILS (Critical/Concerning subscribers)
// Sent to subscribers who came from the score page with a low band.
// Day 0 (score_artifact) is sent by subscribe/route.ts immediately.
// Days 1, 2, 5 are sent by the cron based on score_band.
// After the transition email (Day 5), subscriber joins standard
// nurture at Day 7+ (skipping Days 1-5 of generic nurture).
// ============================================================

export const SCORE_CRISIS_EMAILS: DripEmail[] = [
  // Day 0: Score Artifact — sent immediately by subscribe/route.ts, not cron
  // Recorded as score_artifact for dedup. Contains full score, band, observations.

  // Day 1: Ask your attorney exactly this
  {
    key: "score_crisis_day1",
    delayDays: 1,
    subject: "Ask your attorney exactly this",
    html: `
      <h1 style="color: #F59E0B;">One Question. Ask It Today.</h1>
      <p>Your Defense Milestone Score flagged gaps in your case. Before anything else — before any product, any purchase, any next step — ask your attorney this one question:</p>
      <div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">
        <p style="color: white; font-weight: bold; margin: 0;">"What motions have been filed in my case, and what is the timeline for any remaining filing deadlines?"</p>
      </div>
      <p><strong style="color: white;">What to listen for:</strong></p>
      <ol>
        <li><strong style="color: white;">Specifics vs. generalities</strong> — a solid answer names motions by type and gives dates. A vague answer says "we're working on it."</li>
        <li><strong style="color: white;">Past deadlines</strong> — if a filing window already closed and your attorney doesn't mention it, that's information.</li>
        <li><strong style="color: white;">Reasoning</strong> — there may be good strategic reasons for not filing. But "we don't need motions" without explanation is a red flag.</li>
        <li><strong style="color: white;">Next steps</strong> — a good answer ends with what happens next and when. A weak answer ends with "we'll see."</li>
      </ol>
      <p style="margin-top: 20px;">Whether the answer is reassuring or concerning — the Case Decoder translates it into plain language and tells you whether it adds up.</p>
      ${cta(`See What's in My Case — ${TIER_CORE["case-decoder"].priceDisplay}`, "/checkout?tier=case-decoder")}
    `,
  },

  // Day 2: Did your attorney respond?
  {
    key: "score_crisis_day2",
    delayDays: 2,
    subject: "Did your attorney respond?",
    html: `
      <h1 style="color: #F59E0B;">Did Your Attorney Respond?</h1>
      <p><strong style="color: white;">If they responded:</strong></p>
      <p>That's a positive sign. But knowing whether the answer is <em>good enough</em> requires context — what motions apply to your charge type, what deadlines exist in your jurisdiction, and what the answer means for your case stage.</p>
      <p>The Case Decoder generates 15 questions specific to your charges and case stage. Each one includes what a solid answer sounds like — and what a red flag sounds like. So the next conversation isn't guesswork.</p>

      <p style="margin-top: 24px;"><strong style="color: white;">If they didn't respond:</strong></p>
      <p>Silence is not a strategy. It's a pattern — and it's the number one reason defendants come to us.</p>
      <p>The Case Decoder includes a pre-written email template and phone script. You don't have to figure out what to say. The questions are already written. The email is already drafted. Copy, paste, send.</p>

      ${cta(`Get My Case Decoder — ${TIER_CORE["case-decoder"].priceDisplay}`, "/checkout?tier=case-decoder")}

      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Already have a Playbook?</strong> Your full purchase price applies as credit toward the Case Decoder within 30 days. You only pay the difference.
      </p>
    `,
  },

  // Day 3: Charge-specific — how cases like yours usually play out.
  // {{CHARGE_LABEL}} and {{SCORE}} are interpolated at send time by
  // interpolateScoreVars() in drip-nurture.ts.
  {
    key: "score_crisis_day3",
    delayDays: 3,
    subject: "How {{CHARGE_LABEL}} cases with your score usually play out",
    html: `
      <h1 style="color: #F59E0B;">How {{CHARGE_LABEL}} Cases Like Yours Play Out</h1>
      <p>You scored <strong style="color: white;">{{SCORE}}/100</strong> on your Defense Milestone Score. Here's what that typically means for {{CHARGE_LABEL}} cases:</p>

      <div class="charge-variant-dui" style="display:none;">
        <p><strong style="color: white;">DUI/DWI defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">DMV hearing not requested</strong> — the administrative hearing is separate from the criminal case and has its own deadline (usually 7-10 days from arrest). Miss it and your license gets suspended regardless of the criminal outcome.</li>
          <li><strong style="color: white;">Breathalyzer calibration records not requested</strong> — every breath test machine has calibration logs. If the machine wasn't calibrated within the required window, the BAC number can be challenged. Most attorneys don't request these unless asked.</li>
          <li><strong style="color: white;">Field sobriety test conditions not documented</strong> — lighting, surface, weather, and the officer's training records all affect whether the FST results hold up. If your attorney hasn't documented these, ask why.</li>
        </ul>
      </div>

      <div class="charge-variant-drug" style="display:none;">
        <p><strong style="color: white;">Drug offense defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Lab report not independently reviewed</strong> — the substance and weight in the police report don't always match the lab results. A 68.3g field weight that comes back as 52.1g in the lab can change the charge entirely.</li>
          <li><strong style="color: white;">Search and seizure not challenged</strong> — if the evidence was found during a traffic stop, a consent search, or a warrant execution, each has specific constitutional requirements. An invalid search can suppress all downstream evidence.</li>
          <li><strong style="color: white;">Chain of custody gaps</strong> — evidence that changed hands without proper documentation, or was stored improperly, creates reasonable doubt about what was actually seized.</li>
        </ul>
      </div>

      <div class="charge-variant-white-collar" style="display:none;">
        <p><strong style="color: white;">White collar defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Intent not adequately challenged</strong> — white collar charges almost always require proving intent. Your attorney should be building a narrative around legitimate business purpose, good-faith reliance on advisors, or lack of knowledge.</li>
          <li><strong style="color: white;">Document volume used against you</strong> — prosecutors cherry-pick from thousands of pages. Your attorney should be identifying the documents that show the full context, not just the ones the prosecution highlighted.</li>
          <li><strong style="color: white;">Restitution strategy not started</strong> — voluntary restitution before sentencing dramatically affects outcomes. If your attorney hasn't discussed this, ask about the timeline.</li>
        </ul>
      </div>

      <div class="charge-variant-felony" style="display:none;">
        <p><strong style="color: white;">Felony defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Preliminary hearing strategy unclear</strong> — the preliminary hearing is your first real opportunity to test the prosecution's case. Your attorney should have a specific plan for what to challenge and which witnesses to cross-examine.</li>
          <li><strong style="color: white;">Discovery incomplete or unreviewed</strong> — felony cases generate significant discovery. If your attorney summarized it rather than walking you through it page by page, important details may have been missed.</li>
          <li><strong style="color: white;">Sentencing exposure not mapped</strong> — the minimum, maximum, and guideline range for each charge should be on the table, including how enhancements or prior record affect the math.</li>
        </ul>
      </div>

      <div class="charge-variant-misdemeanor" style="display:none;">
        <p><strong style="color: white;">Misdemeanor defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Diversion or deferred adjudication not explored</strong> — many misdemeanor charges qualify for programs that can result in dismissal. If your attorney hasn't discussed these options, ask specifically about eligibility.</li>
          <li><strong style="color: white;">Collateral consequences not addressed</strong> — a misdemeanor conviction can affect employment, housing, professional licenses, and immigration status. Your attorney should be considering these beyond just the criminal penalty.</li>
          <li><strong style="color: white;">Witness statements not obtained</strong> — misdemeanor cases often rely heavily on one or two witnesses. Your attorney should be getting statements or depositions before memories fade or witnesses become unavailable.</li>
        </ul>
      </div>

      <p>The Case Decoder maps every vulnerability specific to your charges, jurisdiction, and case stage — then generates the exact questions to close each gap.</p>
      ${cta("Get My Case Decoder \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
    `,
  },

  // Day 5: Transition — closes crisis sequence, sets expectations
  {
    key: "score_crisis_transition",
    delayDays: 5,
    subject: "Still here",
    html: `
      <h1 style="color: #F59E0B;">Still Here</h1>
      <p>You scored your defense recently. We sent you a question to ask your attorney and followed up once.</p>
      <p>That's the end of the urgent sequence. From here, you'll hear from us once a week or less — practical information about defense milestones, real case examples, and the questions defendants wish they'd asked sooner.</p>
      <p>If your situation has changed since you scored — new charges, new information, a court date approaching — the Case Decoder is built for exactly that moment.</p>
      ${cta(`Case Decoder — ${TIER_CORE["case-decoder"].priceDisplay}`, "/checkout?tier=case-decoder")}
      <p style="margin-top: 20px; color: #A1A1AA;">One click to unsubscribe, always. No questions.</p>
    `,
  },
];

// ============================================================
// SCORE-BASED ADEQUATE EMAILS (Adequate/Excellent subscribers)
// One email on Day 1, then join standard nurture at Day 3+.
// ============================================================

export const SCORE_ADEQUATE_EMAILS: DripEmail[] = [
  {
    key: "score_adequate_day1",
    delayDays: 1,
    subject: "Your score means something specific",
    html: `
      <h1 style="color: #F59E0B;">Your Score Means Something Specific</h1>
      <p>An Adequate or Excellent score means your attorney is clearing the milestones we can measure from 10 questions. That's a real signal — most defendants who take this score don't get that result.</p>
      <p>What it doesn't tell you is whether the <em>charge-specific</em> vulnerabilities in your case have been addressed. The 10 questions measure general defense milestones. The Case Decoder measures the vulnerabilities specific to your charges, your jurisdiction, and your case stage.</p>
      <p>This isn't because you're in trouble. It's because informed defendants get different conversations with their attorneys — conversations where they ask the questions instead of waiting for answers.</p>
      ${cta(`Verify My Defense Is on Track — ${TIER_CORE["case-decoder"].priceDisplay}`, "/checkout?tier=case-decoder")}
      <p style="margin-top: 20px; color: #A1A1AA;">From here: practical information about your case stage, once a week or less. Unsubscribe any time.</p>
    `,
  },
];

// ============================================================
// RE-ENGAGEMENT EMAILS (Day 7, 14, 21, 30 for score subscribers)
// Sent after band-specific emails complete. These provide free
// value (questions, education, social proof) while building the
// case for a Case Decoder purchase. Unique keys for cron dedup.
// ============================================================

export const SCORE_REENGAGE_EMAILS: DripEmail[] = [
  {
    key: "score_reengage_day7",
    delayDays: 7,
    subject: "Your defense score was {{SCORE}}. Here's what changed since then.",
    html: `
      <h1 style="color: #F59E0B;">7 Days Since Your Score</h1>
      <p>A week ago, you scored your defense. Three things matter right now:</p>
      <ul style="padding-left: 20px;">
        <li>Has your attorney called you back?</li>
        <li>Have any motions been filed?</li>
        <li>Has anyone reviewed your discovery with you?</li>
      </ul>
      <p>If the answer to all three is <strong style="color: white;">yes</strong> — those are positive signs. If even one is <strong style="color: white;">no</strong> — these two questions can help you find out why:</p>
      <div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">
        <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Question 1: Discovery Status</p>
        <p style="color: white; margin: 0;">"Has all discovery been received, and have you reviewed it for inconsistencies — weight discrepancies, date conflicts, or missing items?"</p>
      </div>
      <div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">
        <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Question 2: Motion Strategy</p>
        <p style="color: white; margin: 0;">"What motions are you planning to file, and what are the deadlines for each one?"</p>
      </div>
      <p>Those two questions are a start. The Case Decoder generates <strong style="color: white;">15 questions</strong> specific to your charges, jurisdiction, and case stage — with pre-written email templates and phone scripts.</p>
      ${cta("Get 15 Questions for My Case \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
    `,
  },
  {
    key: "score_reengage_day14",
    delayDays: 14,
    subject: "The one thing {{CHARGE_LABEL}} defendants always miss",
    html: `
      <h1 style="color: #F59E0B;">The One Thing {{CHARGE_LABEL}} Defendants Always Miss</h1>
      <p>Motions have deadlines. And once a deadline passes, arguments that could have changed your case are <strong style="color: #EF4444;">gone forever</strong>.</p>

      <div class="charge-variant-dui" style="display:none;">
        <p>For DUI/DWI cases, the motion most often missed is a <strong style="color: white;">motion to suppress the breath or blood test results</strong>. If the breathalyzer wasn't calibrated within the required window, or if the blood draw didn't follow proper chain-of-custody protocol, the BAC number — the prosecution's strongest evidence — can be excluded entirely. But only if the motion is filed before the deadline.</p>
      </div>

      <div class="charge-variant-drug" style="display:none;">
        <p>For drug offense cases, the motion most often missed is a <strong style="color: white;">motion to suppress evidence based on an unlawful search</strong>. Whether it was a traffic stop, a consent search, or a warrant execution, each has specific constitutional requirements. The prosecution needs that evidence — if it was obtained improperly and your attorney files in time, it can be excluded.</p>
      </div>

      <div class="charge-variant-white-collar" style="display:none;">
        <p>For white collar cases, the motion most often missed is a <strong style="color: white;">motion to compel discovery of exculpatory documents</strong>. Prosecutors are required to disclose evidence favorable to the defense (Brady material), but they don't always do it proactively. Your attorney should be filing motions to ensure the full picture — including documents that support your defense — is on the table.</p>
      </div>

      <div class="charge-variant-felony" style="display:none;">
        <p>For felony cases, the motion most often missed is a <strong style="color: white;">motion to reduce charges at the preliminary hearing stage</strong>. If the prosecution's evidence doesn't support the highest charge, a well-timed motion can force a reduction before trial. But it requires preparation — your attorney needs to identify the weakness and file before the window closes.</p>
      </div>

      <div class="charge-variant-misdemeanor" style="display:none;">
        <p>For misdemeanor cases, the opportunity most often missed is a <strong style="color: white;">motion for diversion or deferred adjudication</strong>. Many jurisdictions offer programs that can result in complete dismissal — but they have eligibility windows and filing requirements. If your attorney hasn't explored this, ask specifically about your eligibility before the next court date.</p>
      </div>

      <p>Understanding what motions apply to your case — and when they need to be filed — is one of the most important things you can do right now.</p>
      <p>${link("Read the Full Guide: What Motions Should Your Attorney Be Filing?", "/blog/what-motions-should-your-attorney-be-filing")}</p>
      <p style="margin-top: 24px;">Want the motion analysis specific to <strong style="color: white;">your</strong> charges and jurisdiction? The Case Decoder maps out what applies to your case.</p>
      ${cta("Get My Case Decoder \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
    `,
  },
  {
    key: "score_reengage_day21",
    delayDays: 21,
    subject: "You scored {{SCORE}}. Another defendant scored the same. Only one asked questions.",
    html: `
      <h1 style="color: #F59E0B;">Same Score. Different Outcome.</h1>
      <p><strong style="color: white;">Defendant A</strong> scored their defense, read the results, and waited for their attorney to handle things. Trusted the process. Didn't follow up.</p>
      <p><strong style="color: white;">Defendant B</strong> scored their defense, then asked their attorney two specific questions. The attorney checked the file, realized a motion window was still open, and filed two motions that had been overlooked.</p>
      <p>Same score. Same starting point. The only difference was <strong style="color: white;">the questions</strong>.</p>
      <p>Here are two more you can ask right now:</p>
      <div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">
        <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Question: Evidence Chain</p>
        <p style="color: white; margin: 0;">"Can you walk me through the chain of custody for the key evidence in my case — who handled it, when, and whether there are any gaps?"</p>
      </div>
      <div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">
        <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Question: Prosecution Burden</p>
        <p style="color: white; margin: 0;">"What specific elements does the prosecution have to prove for each charge, and which ones are weakest based on the evidence?"</p>
      </div>
      <p>Four free questions over the last three weeks. The Case Decoder generates <strong style="color: white;">15 more</strong> — calibrated to your specific situation.</p>
      ${cta("Get 15 Questions for My Case \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
    `,
  },
  {
    key: "score_reengage_day30",
    delayDays: 30,
    subject: "30 days since your {{CHARGE_LABEL}} score. One more shot.",
    html: `
      <h1 style="color: #F59E0B;">30 Days Since Your Score</h1>
      <p>It's been a month. In that time, filing deadlines have been running. Discovery windows may have closed. Your attorney has been busy — but the question is whether they've been busy on <strong style="color: white;">your</strong> case.</p>
      <p>Here's what the Case Decoder gives you for ${TIER_CORE["case-decoder"].priceDisplay}:</p>
      <div style="margin: 20px 0; padding: 16px; border: 1px solid #27272A; border-radius: 8px; background: #1C1917;">
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 Your charges explained in plain English</p>
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 What the prosecution must prove (element by element)</p>
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 15 calibrated questions for your attorney</p>
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 Pre-written email template + phone script</p>
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 Where Things Stand — 4-area diagnostic</p>
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 Your Next 7 Days — one action per day</p>
        <p style="margin: 4px 0; color: #D4D4D8;">\u2713 Meeting Ready Sheet to print and bring</p>
      </div>
      <p><strong style="color: white;">Delivered within 48 hours.</strong> Less than one hour of your attorney's time.</p>
      ${cta("Get My Case Decoder \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
      <p style="margin-top: 24px; color: #A1A1AA;">This is the last email in this sequence. After this, you'll hear from us only with free content — guides, case studies, and practical information. One click to unsubscribe, always.</p>
    `,
  },
];

// ============================================================
// DUI 72-HOUR CHECKLIST SEQUENCE (dui-72-hours source subscribers)
// CRISIS BUYER CADENCE — compress urgency into the 7-day decision window.
// These subscribers are in active crisis (arrested in the last 48 hours).
//
// Day 0: Checklist delivery + Playbook offer on thank-you page (not cron)
// Day 1: DMV deadline urgency — the real, time-sensitive hook
// Day 3: Two types of DUI — education that builds Playbook desire
// Day 5: Attorney consultation prep — 6 questions, Playbook close
// Day 7: Last call — bridge to Case Decoder, then STOP
//
// After Day 7: SILENCE. No standard nurture fallthrough for crisis
// segments. They've bought or they're gone. Sending Day 10/14 to a
// DUI defendant who hasn't bought by Day 7 burns sender reputation
// for near-zero conversion.
// ============================================================

export const DUI_72_HOUR_EMAILS: DripEmail[] = [
  // Day 1: DMV deadline urgency — lead with the real, irreversible consequence
  {
    key: "dui_72h_day1",
    delayDays: 1,
    subject: "Have you requested your DMV hearing yet?",
    html: `
      <h1 style="color: #F59E0B;">The DMV Deadline Is Real. And It's Closing.</h1>
      <p>If you downloaded the 72-hour checklist, item #1 was the DMV hearing request. This is the most time-sensitive action in your entire case.</p>
      <p><strong style="color: white;">Miss this deadline and your license gets automatically suspended</strong> — regardless of what happens to the criminal charge. There is no extension. There is no "I didn't know" exception.</p>
      <p>In most states, the window is <strong style="color: white;">7 to 10 days from arrest.</strong> If you were arrested 2 days ago, you may have 5 days left.</p>
      <p><strong style="color: white;">What to do right now:</strong></p>
      <ol>
        <li>Call your attorney and ask: <strong style="color: white;">"Have you requested my DMV hearing?"</strong></li>
        <li>If they look confused or say "we'll get to it" — that's a red flag. The deadline doesn't wait.</li>
        <li>If you don't have an attorney yet — call your state DMV/DOR directly and request the hearing yourself. You can always have your attorney take over later.</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">The DUI Defense Playbook</strong> includes the full DMV hearing strategy — not just how to request it, but how to use it as a free deposition of the arresting officer. 26 questions total. ${TIER_CORE["dui-first-offense"].priceDisplay}, instant download.
      </p>
      ${cta("Get the DUI Defense Playbook \u2014 " + TIER_CORE["dui-first-offense"].priceDisplay, "/playbook/dui-first-offense")}
    `,
  },
  // Day 3: Two types of DUI — education that creates Playbook desire
  {
    key: "dui_72h_day3",
    delayDays: 3,
    subject: "The two types of DUI — and why it matters for your defense",
    html: `
      <h1 style="color: #F59E0B;">Two Types of DUI. Your Defense Depends on Which One.</h1>
      <p>Most people don't know this: there are two completely different ways the prosecution can charge a DUI.</p>
      <p><strong style="color: white;">Per se DUI:</strong> Your BAC was over the legal limit. Period. They don't need to prove you were impaired — just that the number was over .08.</p>
      <p><strong style="color: white;">Impairment DUI:</strong> They claim you were impaired regardless of BAC. This is where field sobriety tests, officer observations, and dashcam footage matter.</p>
      <p>Each one has different defense angles. Different weaknesses. Different questions to ask your attorney.</p>
      <p>The per se charge has a hidden vulnerability: <strong style="color: white;">breathalyzer calibration records.</strong> If the machine wasn't calibrated correctly, the number can be challenged. Most attorneys don't request these records unless you ask.</p>
      <p>The DUI Defense Playbook covers both types — which questions to ask for each, what a good answer sounds like, and how to tell if your attorney is actually building a defense or just waiting for the plea offer.</p>
      ${cta("Get the DUI Defense Playbook \u2014 " + TIER_CORE["dui-first-offense"].priceDisplay, "/playbook/dui-first-offense")}
    `,
  },
  // Day 5: Attorney consultation prep — 6 questions, hard Playbook close
  {
    key: "dui_72h_day5",
    delayDays: 5,
    subject: "6 questions to bring to your attorney meeting",
    html: `
      <h1 style="color: #F59E0B;">Your Attorney Meeting Is Coming Up</h1>
      <p>If you haven't had your first real attorney meeting yet, it's coming. Here's how to make it count:</p>
      <p><strong style="color: white;">Ask these 6 questions:</strong></p>
      <ol>
        <li><strong style="color: white;">"Have you requested my DMV hearing?"</strong> — If they look confused, that's a red flag.</li>
        <li><strong style="color: white;">"What is your theory of defense?"</strong> — "We'll see what the state offers" means they don't have one.</li>
        <li><strong style="color: white;">"Have you reviewed the dashcam footage?"</strong> — This is often the most important evidence.</li>
        <li><strong style="color: white;">"Were the field sobriety tests administered correctly?"</strong> — NHTSA has strict protocols. Deviations matter.</li>
        <li><strong style="color: white;">"What's your plan for the breathalyzer evidence?"</strong> — Calibration records, operator certification, observation period.</li>
        <li><strong style="color: white;">"What's the realistic best and worst outcome?"</strong> — Vague optimism is worse than honest assessment.</li>
      </ol>
      <p>Those 6 questions are a start. The DUI Defense Playbook has <strong style="color: white;">26 questions</strong> — each with examples of what a good answer sounds like and what a red flag sounds like. Plus a one-page cheat sheet you can print and bring to the meeting.</p>
      <p><strong style="color: white;">${TIER_CORE["dui-first-offense"].priceDisplay}. Instant download.</strong> Less than one hour of your attorney's time.</p>
      ${cta("Get the DUI Defense Playbook \u2014 " + TIER_CORE["dui-first-offense"].priceDisplay, "/playbook/dui-first-offense")}
    `,
  },
  // Day 7: Last call — bridge to Case Decoder, then STOP
  {
    key: "dui_72h_day7",
    delayDays: 7,
    subject: "One week in. Where do you stand?",
    html: `
      <h1 style="color: #F59E0B;">One Week In</h1>
      <p>It's been a week since your arrest. By now, one of three things has happened:</p>
      <p><strong style="color: white;">1. You've met with your attorney</strong> and the conversation went well. You know the defense theory, the DMV hearing is filed, motions are being discussed. That's a positive sign.</p>
      <p><strong style="color: white;">2. You've met with your attorney</strong> and the answers were vague. "We're working on it." "Let's see what they offer." No specifics. That's information — and the DUI Defense Playbook (${TIER_CORE["dui-first-offense"].priceDisplay}) gives you 26 ways to get specifics.</p>
      <p><strong style="color: white;">3. You haven't met with your attorney yet.</strong> If your attorney hasn't made time for you in a week, that's a pattern worth noting.</p>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">You have already paid ${TIER_CORE["dui-first-offense"].priceDisplay}. The ${TIER_CORE["case-decoder"].name} costs ${upgradeCostBetween("dui-first-offense", "case-decoder")}.</strong> 15 questions specific to YOUR charges, YOUR jurisdiction, and YOUR case stage — with a pre-written email template for your attorney. Delivered within 48 hours.
      </p>
      ${cta("Get Case-Specific Questions \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
      <p style="margin-top: 16px; color: #A1A1AA;">This is the last email in this sequence. If you ever need us, reply to any email — we read every response.</p>
    `,
  },
];

// ============================================================
// ABANDONED SCORE EMAILS (quiz non-completers)
// For subscribers with source === "score-abandoned" — started
// the /score quiz but didn't finish. Goal: re-engage to complete
// the quiz, then fall through to standard nurture at Day 7.
// ============================================================

export const ABANDONED_SCORE_EMAILS: DripEmail[] = [
  {
    key: "abandoned_score_day1",
    delayDays: 1,
    subject: "You left something unfinished",
    html: `
      <h1 style="color: #F59E0B;">You Left Something Unfinished</h1>
      <p>Yesterday you started scoring your defense — but didn't finish.</p>
      <p>That's fine. It takes 60 seconds. 10 questions. No payment, no signup beyond the email you already gave us.</p>
      <p>But here's what you're missing: <strong style="color: white;">a baseline</strong>. Without knowing where your defense stands right now, you can't tell if it's improving or slipping. Motion deadlines pass quietly. Discovery sits unreviewed. Conversations with your attorney feel one-sided because you don't know what questions to ask.</p>
      <p>The score gives you a starting point. A number. Something concrete to work with instead of guessing.</p>
      ${cta("Finish My Score \u2014 60 Seconds", "/score")}
      <p style="margin-top: 20px; color: #A1A1AA;">P.S. Defendants who take the score are often surprised by their result.</p>
    `,
  },
  {
    key: "abandoned_score_day2",
    delayDays: 2,
    subject: "The #1 thing defendants don't check (but should)",
    html: `
      <h1 style="color: #F59E0B;">The #1 Thing Defendants Don't Check</h1>
      <p>Most defendants assume their attorney is handling everything. They trust the process. They wait for updates.</p>
      <p>But there's one thing most attorneys <strong style="color: white;">won't proactively tell you about</strong>: motion filing deadlines.</p>
      <p>Motions are time-sensitive. A motion to suppress evidence, a motion to dismiss based on a charging error, a Franks hearing to challenge a warrant — each one has a filing window. Once that window closes, the argument is gone. No extensions. No exceptions.</p>
      <p>Here's one question you can ask your attorney today:</p>
      <div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">
        <p style="color: white; font-weight: bold; margin: 0;">"What motion filing deadlines apply to my case, and have any already passed?"</p>
      </div>
      <p>The Case Progress Score measures 10 defense milestones — including motion activity. 60 seconds tells you where you stand.</p>
      ${cta("Take the Score \u2014 See Where You Stand", "/score")}
    `,
  },
  {
    key: "abandoned_score_day5",
    delayDays: 5,
    subject: "The cost of not knowing",
    html: `
      <h1 style="color: #F59E0B;">The Cost of Not Knowing</h1>
      <p>Every day your case moves forward — with or without your input. Discovery deadlines run. Motion windows close. Plea offers come and go.</p>
      <p>The defendants who get better outcomes aren't smarter. They aren't richer. They aren't luckier. They just <strong style="color: white;">know where they stand</strong> — and they ask the right questions at the right time.</p>
      <p>The Case Progress Score takes 60 seconds. It measures 10 defense milestones and tells you which ones your attorney has hit — and which ones are missing.</p>
      <p>This is the last email about it. After this, free content only — guides, case studies, and practical information.</p>
      ${cta("Take the Defense Milestone Score", "/score")}
      <p style="margin-top: 16px;">Or skip the score and go straight to case-specific questions: ${link("Get 15 calibrated questions for " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}</p>
    `,
  },
];

// ============================================================
// WIN-BACK EMAILS (cold subscribers, 60+ days since any activity)
// For subscribers who exhausted all other sequences without
// purchasing. Timing: Day 75, 78, 82, 89, 96 after subscribe.
// (~14 days nurture + ~30 days re-engagement + 30 days cold).
// Value-first re-engagement, social proof, then sunset emails.
// Suppressed for subscribers who have purchased (checked in cron).
// ============================================================

export const WINBACK_EMAILS: DripEmail[] = [
  {
    key: "winback_1",
    delayDays: 75,
    subject: "Still fighting?",
    html: `
      <h1 style="color: #F59E0B;">Still Fighting?</h1>
      <p>It's been a while since we've heard from you. That could mean a lot of things — your case is progressing, your attorney is handling it, or you've moved on.</p>
      <p>If you're still in it — if there's still a court date on your calendar, a plea offer on the table, or a question you haven't been able to get answered — we're still here.</p>
      <p>One thing you can do right now, for free, in 60 seconds:</p>
      ${cta("Check My Defense Score \u2014 Free, 60 Seconds", "/score")}
      <p style="margin-top: 20px; color: #A1A1AA;">The score measures 10 defense milestones. If things have changed since you last checked, your score will reflect it.</p>
    `,
  },
  {
    key: "winback_2",
    delayDays: 78,
    subject: "What 500 pages of drug trafficking discovery actually contained",
    html: `
      <h1 style="color: #F59E0B;">What 500 Pages of Discovery Actually Contained</h1>
      <p>This is a real case. Real numbers. Real gaps in the evidence.</p>
      <div style="margin: 20px 0; padding: 16px; border: 1px solid #27272A; border-radius: 8px; background: #1C1917;">
        <p style="margin: 4px 0; color: #D4D4D8;"><strong style="color: white;">Police inventory:</strong> 93.9 grams</p>
        <p style="margin: 4px 0; color: #D4D4D8;"><strong style="color: white;">Lab report:</strong> 25.59 grams</p>
        <p style="margin: 4px 0; color: #D4D4D8;"><strong style="color: #EF4444;">Missing:</strong> 68.3 grams — 73% of the evidence weight</p>
        <p style="margin: 12px 0 4px; color: #D4D4D8;"><strong style="color: white;">Charging document:</strong> "amphetamine"</p>
        <p style="margin: 4px 0; color: #D4D4D8;"><strong style="color: white;">Lab confirmation:</strong> MDMA/MDA — completely different substance</p>
        <p style="margin: 12px 0 4px; color: #D4D4D8;"><strong style="color: white;">Latent fingerprints recovered:</strong> 21</p>
        <p style="margin: 4px 0; color: #D4D4D8;"><strong style="color: white;">Fingerprints matching defendant:</strong> 0</p>
      </div>
      <p>None of these issues had been raised by the attorney. All of them were in the discovery documents — waiting to be found.</p>
      ${cta("Read the Full Case Study", "/blog/what-500-pages-of-drug-trafficking-discovery-contained")}
      <p style="margin-top: 16px; color: #A1A1AA;">P.S. ${link("See what a full Case Decoder report looks like", "/sample")}</p>
    `,
  },
  {
    key: "winback_3",
    delayDays: 82,
    subject: "The most common question defendants ask us",
    html: `
      <h1 style="color: #F59E0B;">The Most Common Question We Hear</h1>
      <p>"Is my attorney actually doing everything they should be doing?"</p>
      <p>The most common question we hear from defendants is whether they're actually prepared for what's ahead.</p>
      <p>Most don't know what they don't know — motion deadlines, discovery gaps, plea pressure they can't evaluate. The Defense Milestone Score takes 3 minutes and shows you exactly where your case stands.</p>
      ${cta("Take the Defense Milestone Score \u2014 3 Minutes", "/score")}
      <p style="margin-top: 16px;">Ready to go further? ${link("Case Decoder \u2014 " + TIER_CORE["case-decoder"].priceDisplay + ", delivered in 48 hours", "/checkout?tier=case-decoder")}</p>
    `,
  },
  {
    key: "winback_4",
    delayDays: 89,
    subject: "Do you want us to stop emailing you?",
    html: `
      <h1 style="color: #F59E0B;">Do You Want Us to Stop Emailing You?</h1>
      <p>We've sent you case studies, free questions, and practical information for the last few months. If that's been useful, we'd like to keep going.</p>
      <p>If it hasn't — or if your case is resolved and you don't need this anymore — we completely understand.</p>
      <p>Click below to stay on the list. If we don't hear from you, we'll send one more email next week — and then stop.</p>
      <a href="%%RESUBSCRIBE_URL%%" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Yes, Keep Sending Me Updates</a>
      <p style="margin-top: 20px; color: #A1A1AA;">You can always unsubscribe with one click from any email. No questions asked.</p>
    `,
  },
  {
    key: "winback_5",
    delayDays: 96,
    subject: "Goodbye (unless you say otherwise)",
    html: `
      <h1 style="color: #F59E0B;">Goodbye (Unless You Say Otherwise)</h1>
      <p>This is the last email in this sequence. We're going to stop sending you emails after this — unless you tell us to keep going.</p>
      <p>If your case is still active and you want to stay connected:</p>
      <a href="%%RESUBSCRIBE_URL%%" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Keep Me on the List</a>
      <p>If not — no hard feelings. These free resources are always available:</p>
      <ul style="padding-left: 20px;">
        <li>${link("Case Progress Score", "/score")} — free, 60 seconds, no payment required</li>
        <li>${link("Discovery Checklist", "/resources")} — 7 evidence problems to look for</li>
        <li>${link("Blog", "/blog")} — case studies, defense guides, and practical information</li>
      </ul>
      <p style="margin-top: 20px; color: #A1A1AA;">If you ever need us again, we're at ${link("imnotanattorney.com", "/")}. Every defendant deserves to know what's in their case.</p>
    `,
  },
];

// ============================================================
// POST-PURCHASE SEQUENCES (buyers)
// Organized by tier. Each tier has: delivery (day 0), story harvest
// (day 5 relative to delivery), upsell, and optionally referral.
//
// Day-0 emails are sent by delivery/webhook endpoints, not the cron.
// Story-harvest emails use relativeToDelivery: true so the delay
// is measured from cases.delivered_at, not the purchase date.
// ============================================================

export const POST_PURCHASE_EMAILS: DripEmail[] = [
  // --- Case Decoder ($197) ---

  // CD #23: Post-purchase reassurance email — fills the 48-hour anxiety gap
  // between intake submission and report delivery. Fires day 1 after purchase
  // (during the generating period). Reduces buyer's remorse and sets expectations.
  {
    key: "cd_generating_reassurance",
    delayDays: 1,
    tier: "case-decoder",
    subject: "Your Case Decoder is being built — here's what to expect",
    html: `
      <h1 style="color: #F59E0B;">Your Case Decoder Is Being Built</h1>
      <p>Your case details are in. Right now, your report is being generated using methods from elite defense attorneys — calibrated to your specific charges, jurisdiction, and case stage.</p>
      <p><strong style="color: white;">Here's what happens next:</strong></p>
      <ol>
        <li><strong style="color: white;">Analysis (happening now)</strong> — your charges, jurisdiction patterns, and case stage are being analyzed to generate 15 calibrated questions for your attorney</li>
        <li><strong style="color: white;">Review</strong> — every report is reviewed before delivery to ensure accuracy</li>
        <li><strong style="color: white;">Delivery (within 48 hours of intake)</strong> — you'll receive an email with your report link</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">One thing you can do right now:</strong> Write down everything you remember about your case while it's fresh — the arrest, what was said, what happened, any details your attorney may not know. This becomes your personal case journal. Even if it doesn't go into this report, it's invaluable for your next attorney meeting.
      </p>
      <p style="color: #A1A1AA; margin-top: 16px;">Questions? Reply to this email — we read every response.</p>
    `,
  },

  {
    key: "post_case_decoder_intake_reminder",
    delayDays: 2,
    tier: "case-decoder",
    subject: "Your Case Decoder report is waiting for you",
    html: `
      <h1 style="color: #F59E0B;">Your Report Is Waiting for You</h1>
      <p>You purchased the Case Decoder — but we can't generate your report until we have your case details.</p>
      <p><strong style="color: white;">It takes about 3 minutes.</strong> We need your charges, jurisdiction, and a few details about your situation. That's it.</p>
      ${cta("Complete Your Case Details →", "/intake")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">48-hour delivery guarantee</strong> starts when you submit your case details. The sooner you complete intake, the sooner you get your report.
      </p>
    `,
  },
  {
    key: "post_case_decoder_delivery",
    delayDays: 0,
    tier: "case-decoder",
    subject: "Your Attorney Meeting Prep Kit is ready",
    html: `
      <h1 style="color: #F59E0B;">Your Attorney Meeting Prep Kit Is Ready</h1>
      <p>Your Case Decoder report has been delivered — check your inbox for the report link. Here's how to use it:</p>
      <ol>
        <li><strong style="color: white;">Start with "Where Things Stand"</strong> — see exactly where your case is right now</li>
        <li><strong style="color: white;">Read "Questions for Your Attorney"</strong> — pick your top 5, start with the Golden Question</li>
        <li><strong style="color: white;">Send the email from "Exactly What to Say"</strong> — it's already written, just copy-paste</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        After your next attorney meeting, reply to this email and tell me: <strong style="color: white;">which question got the most reaction?</strong> Real cases make this service better for every defendant who comes after you.
      </p>
    `,
  },
  {
    key: "post_case_decoder_meeting_prep",
    delayDays: 3,
    tier: "case-decoder",
    relativeToDelivery: true,
    subject: "How to prepare for your attorney meeting",
    html: `
      <h1 style="color: #F59E0B;">How to Prepare for Your Attorney Meeting</h1>
      <p>Your Case Decoder report includes a <strong style="color: white;">Meeting Ready Sheet</strong> and an <strong style="color: white;">email template</strong> you can send before your meeting. Here's how to use them:</p>
      <ol>
        <li><strong style="color: white;">Print the Meeting Ready Sheet</strong> — it's in the "Your Next 7 Days" section of your report. Bring it to the meeting.</li>
        <li><strong style="color: white;">Pick your top 5 questions</strong> — start with the Golden Question (the one that matters most for YOUR case).</li>
        <li><strong style="color: white;">Read them out loud once</strong> — hearing yourself say the question makes it easier to say in the room.</li>
        <li><strong style="color: white;">Send the pre-meeting email</strong> — the template is ready to copy-paste. Your attorney will come prepared.</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Need to find your report?</strong> <a href="{{REPORT_URL}}" style="color: #F59E0B; text-decoration: underline;">View your Case Decoder report here</a>
      </p>
    `,
  },
  {
    key: "post_case_decoder_discovery_question",
    delayDays: 4,
    tier: "case-decoder",
    relativeToDelivery: true,
    subject: "Your questions are good — but there's context they're missing",
    html: `
      <h1 style="color: #F59E0B;">Your Questions Are Good — But There's Context They're Missing</h1>
      <p>Your Case Decoder gave you 15 questions built from what you told us. The Intelligence Brief adds what you <em>can't</em> tell us — your jurisdiction's actual patterns, your prosecutor's track record, and jurisdiction-specific leverage points.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["case-decoder"].priceDisplay}. The Intelligence Brief costs ${upgradeCostBetween("case-decoder", "intelligence-brief")} — credit applies within 12 months.</strong></p>
      ${cta("Get the Intelligence Brief", "/checkout?tier=intelligence-brief")}
    `,
  },
  {
    key: "post_case_decoder_story_harvest",
    delayDays: 5,
    tier: "case-decoder",
    relativeToDelivery: true,
    subject: "Whether or not you've met with your attorney yet — one quick question",
    html: `
      <h1 style="color: #F59E0B;">One Quick Question</h1>
      <p>Whether you've already met with your attorney or you're still preparing — I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which part of your report has been most useful so far?</strong></p>
      <p>Was it the questions? The email template? Understanding what the prosecution has to prove? The 7-day action plan?</p>
      <p>Just reply to this email. One sentence is fine. Your experience helps us build better reports for every defendant who comes after you.</p>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Need to find your report?</strong> <a href="{{REPORT_URL}}" style="color: #F59E0B; text-decoration: underline;">View your Case Decoder report here</a>
      </p>
    `,
  },
  {
    key: "post_case_decoder_upsell",
    delayDays: 7,
    tier: "case-decoder",
    subject: "There are questions your Case Decoder can't answer",
    html: `
      <h1 style="color: #F59E0B;">There Are Questions Your Case Decoder Can't Answer</h1>
      <p>Your report identified areas that need your jurisdiction's actual patterns and your prosecutor's track record to answer properly. Your Case Decoder can't provide that — it was built from what you told us, not from jurisdiction data.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["case-decoder"].priceDisplay}. The Intelligence Brief costs ${upgradeCostBetween("case-decoder", "intelligence-brief")} — credit applies within 12 months.</strong></p>
      ${cta("Get the Intelligence Brief", "/checkout?tier=intelligence-brief")}
      <p style="margin-top: 16px; color: #A1A1AA;">Motion deadlines, evidence preservation windows, and plea negotiation leverage all erode with time.</p>
      <p style="margin-top: 16px; color: #71717A;">If budget is a factor and you want the full picture later, you can always upgrade from the Intelligence Brief to the X-Ray — your payment applies as credit. ${link("Compare tiers", "/services")}</p>
    `,
  },

  {
    key: "post_case_decoder_referral",
    delayDays: 14,
    tier: "case-decoder",
    subject: "Know someone facing charges?",
    html: `
      <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
      <p>If your Case Decoder helped you ask better questions, it can help someone else too.</p>
      <p>Share this with anyone facing charges who needs clarity about their case:</p>
      ${cta("Share ImNotAnAttorney →", "/?ref=friend")}
      <p style="color: #71717A;">Every defendant deserves to know what's in their case.</p>
    `,
  },

  // --- CD Discovery Check-In (30 days after delivery) ---
  // Educational email — primes defendant for Day 45 conversion email.
  // No urgency line. Soft CTA only.
  {
    key: "post_case_decoder_discovery_checkin",
    delayDays: 30,
    tier: "case-decoder",
    relativeToDelivery: true,
    subject: "Most defendants receive their case documents around now",
    html: `
      <h1 style="color: #F59E0B;">Most Defendants Receive Their Case Documents Around Now</h1>
      <p>If you're thirty days past arraignment and your case feels like it has gone quiet — that's normal. Criminal cases move in bursts: the arrest, the arraignment, then a long period where hearings are scheduled, discovery is compiled, and attorneys file initial motions. The silence feels like nothing is happening. Usually, the opposite is true.</p>
      <p>Somewhere in the next 30-60 days, your attorney should receive your discovery package — the police reports, lab results, witness statements, body camera logs, and phone records that make up the prosecution's case file. Some attorneys walk clients through every document. Most summarize it. A few don't mention it at all. When yours arrives, one question defendants often ask at this stage: <em>"Can I see a copy of the discovery?"</em> Defendants generally have a right to review the evidence compiled against them.</p>
      <p>Your Case Decoder gave you questions to ask before discovery. Those questions get sharper once you can see the actual documents. When your case file arrives, there's a way to have every page read systematically — contradictions flagged, chain-of-custody gaps documented, rights violations identified. That analysis is available when you're ready.</p>
      ${cta("Learn what discovery analysis finds", "/services#x-ray")}
    `,
  },

  // --- CD Discovery-Arrival Conversion (45 days after delivery, CD -> X-Ray) ---
  // Peak conversion email. Credit-as-hero. Real case example.
  // NO budget note — Day 45 is peak conversion, no escape hatch (Covello audit).
  {
    key: "post_case_decoder_discovery_arrival",
    delayDays: 45,
    tier: "case-decoder",
    relativeToDelivery: true,
    subject: "When your case documents land, this is the hour that matters",
    html: `
      <h1 style="color: #F59E0B;">When Your Case Documents Land, This Is the Hour That Matters</h1>
      <p>If your discovery package just arrived — or your attorney told you it is being compiled — that moment changes the texture of your case. For the first time, you can see what the prosecution actually has. That should feel like relief. For most defendants, it feels like the opposite: hundreds of pages of reports written in law enforcement shorthand, lab results with methodology codes nobody explains, witness statements that seem straightforward until you realize two of them describe the same event in ways that cannot both be true.</p>
      <p>In a real trafficking case we analyzed: the police inventory showed 93.9 grams seized. The lab report showed 25.59 grams tested — a 68.3-gram discrepancy that the defendant's attorney had not raised. The charging document said "amphetamine." The lab confirmed MDMA. 21 fingerprints collected at the scene. Zero matched the defendant. None of these were flagged before the case was researched page by page. Discovery errors like these do not announce themselves. They are visible only if someone reads the documents with a specific methodology looking for them.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["case-decoder"].priceDisplay}. The X-Ray costs ${upgradeCostBetween("case-decoder", "x-ray")} — credit applies within 12 months.</strong> That covers every page of your discovery — contradictions flagged with page citations, chain-of-custody gaps documented, constitutional issues identified, 35-50 questions for your attorney based on what the documents actually show. Not patterns. Not jurisdiction estimates. Your specific documents.</p>
      ${cta(`Get the X-Ray — ${upgradeCostBetween("case-decoder", "x-ray")} after credit`, "/checkout?tier=x-ray")}
      <p style="margin-top: 16px; padding: 12px 16px; background: #1C1917; border-left: 3px solid #F59E0B; color: #F59E0B; font-weight: bold;">Motion deadlines and evidence preservation windows are calculated from arrest and arraignment dates — not from when you read your discovery. Some of those windows may already be closing. Analysis completed now preserves options that will not exist in 30 days.</p>
    `,
  },

  // --- Included Case Decoder (delivered as part of IB+ package) ---
  // When a customer buys IB or higher, a CD is auto-generated and delivered
  // within 48 hours. This drip is for that included delivery — no upsell
  // since the customer already bought the higher tier.
  {
    key: "included_case_decoder_delivery",
    delayDays: 0,
    tier: "case-decoder",
    subject: "Part 1 of your package is ready — Your Case Decoder Report",
    html: `
      <h1 style="color: #F59E0B;">Part 1: Your Case Decoder Report Is Ready</h1>
      <p>Your Case Decoder report has been delivered — this is the first part of your package. Here's how to use it:</p>
      <ol>
        <li><strong style="color: white;">Start with "Where Things Stand"</strong> — see exactly where your case is right now</li>
        <li><strong style="color: white;">Read "Questions for Your Attorney"</strong> — pick your top 5, start with the Golden Question</li>
        <li><strong style="color: white;">Send the email from "Exactly What to Say"</strong> — it's already written, just copy-paste</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">What's next:</strong> Check your email for details on completing your full Intelligence Brief intake — a few more questions so we can build your complete report with jurisdiction intelligence, motion landscape, and more.
      </p>
    `,
  },

  // --- Intelligence Brief ($997) ---
  {
    key: "post_intelligence_brief_delivery",
    delayDays: 0,
    tier: "intelligence-brief",
    subject: "Your Intelligence Brief is ready — here's how to use it in your next meeting",
    html: `
      <h1 style="color: #F59E0B;">Your Intelligence Brief Is Ready</h1>
      <p>Your full Intelligence Brief has been delivered — check your inbox for the report link. Here's how to use it:</p>
      <ol>
        <li><strong style="color: white;">Start with the 48-Hour Priority List</strong> — your three most urgent actions right now</li>
        <li><strong style="color: white;">Read the Case Progress Score in Section 2</strong> — see where your representation stands</li>
        <li><strong style="color: white;">Review the 10-15 questions in Appendix D — pick your top 5</strong> for your next attorney meeting</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        After your next attorney meeting, reply to this email and tell me: <strong style="color: white;">which question got the most reaction?</strong> Real cases make this service better for every defendant who comes after you.
      </p>
    `,
  },
  // --- IB Phase 2 Intake Reminder (5 days after purchase) ---
  // IB customers receive their CD report first (~48h), then need to submit a
  // Phase 2 intake to trigger Phase A generation. 5 days from purchase gives
  // ~3 days after CD delivery. Uses purchase-relative timing because the IB
  // case itself hasn't been delivered yet at this point.
  // Cron guard: skipped if IB case already has Phase 2 intake (status != "intake").
  {
    key: "post_intelligence_brief_phase2_reminder",
    delayDays: 5,
    tier: "intelligence-brief",
    subject: "Complete your Intelligence Brief intake — your Case Decoder is ready",
    html: `
      <h1 style="color: #F59E0B;">Your Case Decoder Is Ready — Next Step Inside</h1>
      <p>Your Case Decoder report has been delivered. To generate your full Intelligence Brief, we need a few more details about your judge, jurisdiction, and case stage.</p>
      <p><strong style="color: white;">It takes about 5 minutes.</strong> Once you submit, your Intelligence Brief will be generated within 72 hours — including jurisdiction intelligence, prosecution patterns, and your priority questions.</p>
      ${cta("Complete Intelligence Brief Details →", "/intake/intelligence-brief")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Your Case Decoder gave you the foundation.</strong> The Intelligence Brief goes deeper — your jurisdiction's actual patterns, defense theories specific to your charge, and a 14-day action plan with scripts for difficult conversations.
      </p>
    `,
  },
  // --- IB Meeting Prep (3 days after IB delivery) ---
  // Guides IB customers on how to use their 9-section report in an attorney meeting.
  {
    key: "post_intelligence_brief_meeting_prep",
    delayDays: 3,
    tier: "intelligence-brief",
    relativeToDelivery: true,
    subject: "How to use your Intelligence Brief in your next meeting",
    html: `
      <h1 style="color: #F59E0B;">How to Use Your Intelligence Brief</h1>
      <p>Your Intelligence Brief has everything you need for your next attorney meeting. Here's how to make the most of it:</p>
      <ol>
        <li><strong style="color: white;">Start with the 48-Hour Priority List</strong> — three actions, in order. Priority 1 first.</li>
        <li><strong style="color: white;">Print the Jurisdiction Intelligence Summary (Appendix F)</strong> — one page, designed for the meeting. Bring it.</li>
        <li><strong style="color: white;">Pick your top 5 questions from Appendix D</strong> — the Golden Question is marked. Start there.</li>
        <li><strong style="color: white;">Review the Plea Decision Checklist (Appendix G)</strong> — if a plea is on the table, this is your pre-signing checklist.</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Pro tip:</strong> Don't share the full report with your attorney. Share your <em>questions</em>, not the analysis. The Meeting Ready Sheet in Section 6 is designed to be safe if your attorney sees it. Let them read the full report on their own time — if you choose to share it at all.
      </p>
    `,
  },
  {
    key: "post_intelligence_brief_story_harvest",
    delayDays: 5,
    tier: "intelligence-brief",
    relativeToDelivery: true,
    subject: "Whether or not you've met with your attorney yet — one quick question",
    html: `
      <h1 style="color: #F59E0B;">One Quick Question</h1>
      <p>Whether you've already met with your attorney or you're still preparing — I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which part of your Intelligence Brief has been most useful so far?</strong></p>
      <p>Was it the jurisdiction intelligence? The priority questions? The 14-day action plan? The difficult conversation scripts?</p>
      <p>Just reply to this email. One sentence is fine. Your experience helps us build better reports for every defendant who comes after you.</p>
    `,
  },
  // --- IB Referral (14 days after delivery) ---
  {
    key: "post_intelligence_brief_referral",
    delayDays: 14,
    tier: "intelligence-brief",
    relativeToDelivery: true,
    subject: "Know someone facing charges?",
    html: `
      <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
      <p>If your Intelligence Brief helped you ask better questions, it can help someone else too.</p>
      <p>Every defendant deserves to walk into their attorney's office knowing what's in their case — not guessing.</p>
      ${cta("Share ImNotAnAttorney →", "/?ref=friend")}
      <p style="color: #71717A;">Every defendant deserves to know what's in their case.</p>
    `,
  },

  // --- IB Discovery-Arrival (30 days after delivery, IB -> X-Ray) ---
  // Bridges IB patterns to discovery evidence. Credit-as-hero.
  {
    key: "post_intelligence_brief_discovery_arrival",
    delayDays: 30,
    tier: "intelligence-brief",
    relativeToDelivery: true,
    subject: "Your Intelligence Brief identified patterns. Your discovery has the evidence.",
    html: `
      <h1 style="color: #F59E0B;">Your Intelligence Brief Identified Patterns. Your Discovery Has the Evidence.</h1>
      <p>Your Intelligence Brief identified areas where jurisdiction patterns suggest your case may deviate from the norm. That analysis was built from how your court, your judge, and your prosecution team typically operate. It gave you questions your attorney was not expecting. But patterns are predictions — and predictions are only as useful as the evidence they are tested against.</p>
      <p>Your case documents — the police reports, lab results, and witness statements the prosecution compiled — are either in your attorney's hands or arriving soon. Those documents are where prediction meets reality. The X-Ray reads every page and tests whether the patterns your Intelligence Brief identified hold up against what actually happened in your case. Contradictions between what should have happened and what the documents show are where the strongest questions live.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["intelligence-brief"].priceDisplay}. The X-Ray costs ${upgradeCostBetween("intelligence-brief", "x-ray")}.</strong> Every page of your discovery analyzed — contradictions, missing evidence, rights violations — plus the Judge Intelligence Profile and Prosecutor Research Profile. Your Intelligence Brief becomes the foundation. The X-Ray builds the case-specific layer on top.</p>
      ${cta(`Get the X-Ray — ${upgradeCostBetween("intelligence-brief", "x-ray")} after credit`, "/checkout?tier=x-ray")}
      <p style="margin-top: 16px; color: #A1A1AA;">Motion windows are calculated from arrest and arraignment dates. If your discovery has arrived, analysis completed now preserves options that may not exist at your next hearing.</p>
    `,
  },

  // --- IB Upsell Rewrite (loss framing, credit-as-hero, Covello CCO) ---
  {
    key: "post_intelligence_brief_upsell",
    delayDays: 10,
    tier: "intelligence-brief",
    relativeToDelivery: true,
    subject: "There are questions your Intelligence Brief can't answer",
    html: `
      <h1 style="color: #F59E0B;">There Are Questions Your Intelligence Brief Can&rsquo;t Answer</h1>
      <p>Your Intelligence Brief gave you jurisdiction patterns, prosecution tendencies, and a picture of your judge. That intelligence is real. It changed the quality of your attorney conversations. But it was built from patterns — what typically happens in courts like yours, with charges like yours.</p>
      <p>The questions it cannot answer are the ones that depend on your actual case documents: What does the police report say happened versus what the lab report shows? Where do the witness statements contradict each other? Is the evidence chain intact, or are there custody gaps your attorney hasn&rsquo;t flagged? Those answers are in your discovery — and they are different for every defendant, in ways that jurisdiction patterns cannot predict.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["intelligence-brief"].priceDisplay}. The X-Ray costs ${upgradeCostBetween("intelligence-brief", "x-ray")}.</strong> Every page of your discovery analyzed — contradictions flagged with page citations, chain-of-custody gaps documented, constitutional issues identified, 35-50 questions for your attorney based on what the documents actually show. Plus the Judge Intelligence Profile and Prosecutor Research Profile.</p>
      <p style="color: #F59E0B; font-weight: bold;">Motion deadlines, evidence preservation windows, and witness memories erode with time. The sooner analysis begins, the more options remain.</p>
      ${cta(`Get the X-Ray — ${upgradeCostBetween("intelligence-brief", "x-ray")} after credit`, "/checkout?tier=x-ray")}
      <p style="color: #71717A; margin-top: 12px;">Discovery documents are typically received 30-90 days after arraignment.</p>
    `,
  },

  // --- X-Ray ($2,497) ---
  // Intake reminder (2 days after purchase, skipped if intake already submitted)
  {
    key: "post_x_ray_intake_reminder",
    delayDays: 2,
    tier: "x-ray",
    subject: "Complete your case details to start your X-Ray analysis",
    html: `
      <h1 style="color: #F59E0B;">Your X-Ray Analysis Is Waiting</h1>
      <p>You purchased The X-Ray — your included Case Decoder and Intelligence Brief are generated first, then your full discovery analysis. Complete your case details to get the process started.</p>
      <p><strong style="color: white;">It takes about 3 minutes.</strong> We need your charges, jurisdiction, and a few details about your situation.</p>
      ${cta("Complete Your Case Details →", "/intake")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Your included reports start generating</strong> as soon as we have your case details. The sooner you complete intake, the sooner analysis begins.
      </p>
    `,
  },
  {
    key: "post_x_ray_delivery",
    delayDays: 0,
    tier: "x-ray",
    subject: "Your X-Ray analysis is ready — here's how to use it",
    html: `
      <h1 style="color: #F59E0B;">Your X-Ray Analysis Is Ready</h1>
      <p>Your full discovery analysis has been delivered — check your inbox for the report link.</p>
      <ol>
        <li><strong style="color: white;">Start with the Discrepancy Report</strong> — these are the findings that matter most</li>
        <li><strong style="color: white;">Review the timeline</strong> — look for date conflicts and gaps</li>
        <li><strong style="color: white;">Use the Red Flags summary</strong> as your meeting agenda</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        After your next attorney meeting, reply to this email and tell me: <strong style="color: white;">which finding got the biggest reaction?</strong> Real cases make this service better for every defendant who comes after you.
      </p>
    `,
  },
  {
    key: "post_x_ray_upload_reminder",
    delayDays: 2,
    tier: "x-ray",
    subject: "Reminder: Upload your discovery documents to begin analysis",
    html: `
      <h1 style="color: #F59E0B;">Upload Reminder</h1>
      <p>We're ready to start your X-Ray analysis — but we need your discovery documents first.</p>
      <p>If you've already uploaded them, ignore this email. If not:</p>
      ${cta("Upload Discovery Documents →", "/upload?case={{CASE_ID}}&email={{EMAIL}}")}
      <p style="color: #71717A;">Not sure what to upload? Send everything your attorney gave you — police reports, lab results, witness statements, photos, any documents labeled "discovery."</p>
    `,
  },
  {
    key: "post_x_ray_story_harvest",
    delayDays: 5,
    tier: "x-ray",
    relativeToDelivery: true,
    subject: "You met with your attorney — what was the first finding they hadn't seen?",
    html: `
      <h1 style="color: #F59E0B;">How Did It Go?</h1>
      <p>You walked into that meeting with a full discovery analysis. I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which finding surprised your attorney?</strong></p>
      <p>Just reply to this email. Your experience makes every future analysis better.</p>
      <p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #333;">
        <strong style="color: white;">Did your attorney ask about any of the witnesses?</strong> If they want deeper investigation — backgrounds, testimony history, credibility challenges — that's exactly what <a href="${getSiteUrl()}/services#war-room" style="color: #F59E0B;">The War Room</a> provides. You have already paid ${TIER_CORE["x-ray"].priceDisplay}. The War Room costs ${upgradePrice("x-ray")}.
      </p>
    `,
  },

  // --- X-Ray Meeting Prep (3 days after delivery) ---
  {
    key: "post_x_ray_meeting_prep",
    delayDays: 3,
    tier: "x-ray",
    relativeToDelivery: true,
    subject: "How to use your X-Ray analysis in your next meeting",
    html: `
      <h1 style="color: #F59E0B;">How to Use Your X-Ray Analysis</h1>
      <p>Your X-Ray has everything you need for your next attorney meeting. Here's how to make the most of it:</p>
      <ol>
        <li><strong style="color: white;">Lead with the Discrepancy Report</strong> — these are the findings that matter most. Weight differences, date conflicts, contradictions between documents.</li>
        <li><strong style="color: white;">Use the Red Flags summary as your meeting agenda</strong> — each flag is a topic to explore with your attorney.</li>
        <li><strong style="color: white;">Review the timeline</strong> — look for date conflicts and gaps that your attorney may want to investigate.</li>
        <li><strong style="color: white;">Pick your top 10 from the 35+ questions</strong> — start with the ones connected to discrepancies.</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Pro tip:</strong> Your attorney may not have seen these patterns — the questions frame them as topics to explore together, not accusations. Let the findings speak for themselves.
      </p>
    `,
  },
  // --- X-Ray Upsell Rewrite (loss framing, credit-as-hero, Witness Pack alt, Covello CCO) ---
  {
    key: "post_x_ray_upsell",
    delayDays: 10,
    tier: "x-ray",
    relativeToDelivery: true,
    subject: "Your X-Ray found the gaps. Someone still has to exploit them.",
    html: `
      <h1 style="color: #F59E0B;">Your X-Ray Found the Gaps. Someone Still Has to Exploit Them.</h1>
      <p>Your X-Ray analysis is documented. The contradictions are on paper. The evidence gaps are named. The questions for your attorney are specific. You walked into that meeting with more information about your own case than most defendants ever see. That matters.</p>
      <p>What the X-Ray cannot do is turn those findings into pressure. It cannot tell you whether the witnesses behind those contradictions have credibility problems that a competent cross-examination would expose. It cannot tell you whether your judge grants the type of suppression motions your chain-of-custody gaps might support — or whether they routinely deny them. Those questions require a different kind of research — specific, ongoing, and built around what your documents actually showed.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["x-ray"].priceDisplay}. The War Room costs ${upgradeCostBetween("x-ray", "war-room")}.</strong> That covers witness dossiers on up to 8 witnesses, a full judge intelligence dossier, prosecution team profiles, a motion landscape analysis, and weekly updates as your case evolves. Witnesses&rsquo; memories fade. Motion windows close. Discovery findings have a shelf life.</p>
      ${cta(`Get the War Room — ${upgradeCostBetween("x-ray", "war-room")} after credit`, "/checkout?tier=war-room")}
      <p style="color: #71717A; margin-top: 12px;">The Witness Pack is a different product for a different question — targeted witness credibility research only (up to 3 witnesses, ${TIER_CORE["witness-pack"].priceDisplay}, 3-5 business days). It does not include motion analysis, evidence chain review, or weekly case updates. One option if witness credibility is the most time-sensitive piece and your next hearing is soon. <a href="${getSiteUrl()}/checkout?tier=witness-pack" style="color: #A1A1AA;">Learn more</a></p>
    `,
  },
  // --- X-Ray Referral (14 days after delivery) ---
  {
    key: "post_x_ray_referral",
    delayDays: 14,
    tier: "x-ray",
    relativeToDelivery: true,
    subject: "Know someone facing charges?",
    html: `
      <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
      <p>If your discovery analysis revealed what your attorney missed, imagine what it could find in someone else's case.</p>
      <p>Share this with anyone facing charges who needs clarity about their evidence:</p>
      ${cta("Share ImNotAnAttorney →", "/?ref=friend")}
      <p style="color: #71717A;">Every defendant deserves to know what's in their discovery.</p>
    `,
  },

  // --- X-Ray Active-Wait Emails (relative to document submission, not purchase) ---
  // These fill the silence between doc submission and report delivery (7-10 days).
  {
    key: "post_x_ray_analysis_started",
    delayDays: 1,
    tier: "x-ray",
    relativeToSubmission: true,
    subject: "Your discovery analysis has begun — here's what's happening",
    html: `
      <h1 style="color: #F59E0B;">We're Inside Your Discovery</h1>
      <p>We received your {{DOCUMENT_COUNT}} documents and our analysis is underway.</p>
      <p>Here's what we're doing right now:</p>
      <ol>
        <li><strong style="color: white;">Document inventory</strong> — cataloging every document, page, and author</li>
        <li><strong style="color: white;">Timeline reconstruction</strong> — building a chronological map of events from all documents</li>
        <li><strong style="color: white;">Evidence chain analysis</strong> — tracking every piece of evidence from seizure to present</li>
        <li><strong style="color: white;">Cross-document comparison</strong> — looking for contradictions between documents</li>
        <li><strong style="color: white;">Pattern detection</strong> — running forensic detection patterns used by elite defense teams</li>
      </ol>
      <p>This is not a quick scan — it's a systematic, document-by-document analysis that takes 4-5 hours of focused work.</p>
      <p style="color: #71717A;">You don't need to do anything right now. We'll reach out if we need clarification on any documents.</p>
    `,
  },
  {
    key: "post_x_ray_midpoint",
    delayDays: 5,
    tier: "x-ray",
    relativeToSubmission: true,
    subject: "Midpoint update: We've found things worth discussing",
    html: `
      <h1 style="color: #F59E0B;">Midpoint Check</h1>
      <p>We're about halfway through your analysis.</p>
      <p>Without revealing specific findings yet (those come in the full report), here's what we can tell you:</p>
      <ul>
        <li>We've cataloged <strong style="color: white;">{{DOCUMENT_COUNT}} documents</strong></li>
        <li>We're running cross-document analysis now — comparing what different documents say about the same events</li>
        <li>We've started generating targeted questions for your attorney meeting</li>
      </ul>
      <p><strong style="color: white;">One thing you can do now:</strong> Start thinking about when you can schedule an attorney meeting for the week after you receive your report. The findings are most valuable when discussed while they're fresh.</p>
      <p style="color: #71717A;">Your report is on track for delivery within the next 5 business days.</p>
    `,
  },
  {
    key: "post_x_ray_almost_ready",
    delayDays: 8,
    tier: "x-ray",
    relativeToSubmission: true,
    subject: "Your X-Ray report is almost ready — here's how to prepare",
    html: `
      <h1 style="color: #F59E0B;">Your Report Is Almost Ready</h1>
      <p>Your X-Ray analysis is in final review. You'll receive the full report within the next 2 business days.</p>
      <p><strong style="color: white;">How to prepare:</strong></p>
      <ol>
        <li><strong style="color: white;">Schedule an attorney meeting</strong> for within 7 days of receiving the report</li>
        <li><strong style="color: white;">Block 30 minutes</strong> to read the report when it arrives — start with the Executive Summary and Top 3 Findings</li>
        <li><strong style="color: white;">Have a notebook ready</strong> — you'll want to note which questions are most important to you</li>
        <li><strong style="color: white;">If a family member is helping:</strong> Plan to review the Family Guide section together</li>
      </ol>
      <p>When the report arrives, it will include a one-page summary you can hand directly to your attorney.</p>
      <p style="color: #71717A;">Almost there.</p>
    `,
  },
  // --- X-Ray Meeting Followup (7 days after delivery) ---
  {
    key: "post_x_ray_meeting_followup",
    delayDays: 7,
    tier: "x-ray",
    relativeToDelivery: true,
    subject: "How did your attorney meeting go?",
    html: `
      <h1 style="color: #F59E0B;">How Did It Go?</h1>
      <p>You've had about a week with your X-Ray report. If you've met with your attorney, we'd like to know:</p>
      <ul>
        <li>Did they already know about the findings in the report?</li>
        <li>Were there findings that surprised them?</li>
        <li>Did they commit to specific next steps?</li>
      </ul>
      <p>If you haven't met with your attorney yet — <strong style="color: white;">schedule that meeting this week.</strong> The findings are most actionable while they're current.</p>
      <p>If your attorney was dismissive of the findings, or if they haven't reviewed discovery yet — that's information worth noting. Document the date and their response.</p>
      <p style="color: #71717A;">Reply to this email if you want to share how it went. We read every response.</p>
    `,
  },

  // --- War Room ($4,997) ---
  // Intake reminder (2 days after purchase, skipped if intake already submitted)
  {
    key: "post_war_room_intake_reminder",
    delayDays: 2,
    tier: "war-room",
    subject: "Complete your case details to begin your War Room engagement",
    html: `
      <h1 style="color: #F59E0B;">Your War Room Engagement Is Waiting</h1>
      <p>You purchased The War Room — your included reports (Case Decoder, Intelligence Brief, X-Ray) are delivered first while we prepare your full intelligence operation. Complete your case details to get started.</p>
      <p><strong style="color: white;">It takes about 3 minutes.</strong> We need your charges, jurisdiction, and a few details about your situation.</p>
      ${cta("Complete Your Case Details →", "/intake")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Your included reports start generating</strong> as soon as we have your case details. The full War Room operation begins in parallel.
      </p>
    `,
  },
  {
    key: "post_war_room_delivery",
    delayDays: 0,
    tier: "war-room",
    subject: "Your War Room package is being assembled",
    html: `
      <h1 style="color: #F59E0B;">Your War Room Package Is Being Assembled</h1>
      <p>Your War Room engagement has begun. Here's what happens next:</p>
      <ol>
        <li><strong style="color: white;">Days 1-7:</strong> Full case analysis — charges, judge intel, discovery deep dive</li>
        <li><strong style="color: white;">Days 7-21:</strong> Witness dossiers (up to 8), prosecution analysis, motion landscape</li>
        <li><strong style="color: white;">Days 21-28:</strong> Final package assembly — attorney delivery package, case law references, strategy questions</li>
      </ol>
      <p>After the initial package, you'll receive <strong style="color: white;">weekly updates for the duration of your case</strong>.</p>
      <p>If you haven't uploaded your discovery documents yet:</p>
      ${cta("Upload Discovery Documents →", "/upload")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Timeline: 25-28 business days</strong> for initial package. Weekly updates begin immediately after delivery.
      </p>
    `,
  },
  {
    key: "post_war_room_referral",
    delayDays: 14,
    tier: "war-room",
    relativeToDelivery: true,
    subject: "Know someone facing charges?",
    html: `
      <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
      <p>You know what it's like to face the system without enough information. If someone you know is in the same position, you can help them skip the confusion.</p>
      <p style="font-size: 18px; color: white;"><strong>Send them to ${link("imnotanattorney.com", "/")}</strong></p>
      <p>They can start with a free Case Progress Score — no payment, no commitment. Just clarity on where they stand.</p>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        Every defendant deserves to walk into their attorney's office with the right questions. You did it. They can too.
      </p>
    `,
  },

  // --- War Room Meeting Prep (3 days after delivery) ---
  {
    key: "post_war_room_meeting_prep",
    delayDays: 3,
    tier: "war-room",
    relativeToDelivery: true,
    subject: "How to use your War Room package with your attorney",
    html: `
      <h1 style="color: #F59E0B;">How to Use Your War Room Package</h1>
      <p>Your War Room package is comprehensive. Here's how to make the most of it in your next attorney meeting:</p>
      <ol>
        <li><strong style="color: white;">Start with the 3 most critical findings</strong> — don't hand over the whole package at once. Let your attorney absorb the key points first.</li>
        <li><strong style="color: white;">Lead with the witness dossiers</strong> — inconsistencies in witness statements are the most actionable findings.</li>
        <li><strong style="color: white;">Reference the prosecution analysis</strong> — knowing what the other side is building helps your attorney prepare.</li>
        <li><strong style="color: white;">Save the case law package for follow-up</strong> — offer the full file after the meeting. Let your attorney review it on their own time.</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Pro tip:</strong> Start with the 3 most critical findings — don't hand over the whole package at once. Let your attorney absorb the key points, then offer the full file.
      </p>
    `,
  },
  // --- War Room Story Harvest (7 days after delivery — longer because bigger package) ---
  {
    key: "post_war_room_story_harvest",
    delayDays: 7,
    tier: "war-room",
    relativeToDelivery: true,
    subject: "Whether or not you've met with your attorney yet — one quick question",
    html: `
      <h1 style="color: #F59E0B;">One Quick Question</h1>
      <p>Whether you've already met with your attorney or you're still reviewing the package — I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which part of your War Room package has been most useful so far?</strong></p>
      <p>Was it the witness dossiers? The prosecution analysis? The motion landscape? The case law references?</p>
      <p>Just reply to this email. One sentence is fine. Your experience at this level helps us build better intelligence for every defendant who comes after you.</p>
    `,
  },

  // MANUAL TRIGGER ONLY — delayDays:9999 prevents cron auto-send.
  // Send via operator action when trial date is confirmed. Do NOT reduce delayDays.
  {
    key: "post_war_room_trial_confirmed",
    delayDays: 9999,
    tier: "war-room",
    subject: "Trial is set. The intelligence you need is different now.",
    html: `
      <h1 style="color: #F59E0B;">Trial Is Set. The Intelligence You Need Is Different Now.</h1>
      <p>A trial date is a different kind of news than every other milestone in a criminal case. It is the point where preparation stops being theoretical. The witnesses your War Room analyzed become people who will testify under oath. The contradictions in your discovery become arguments your attorney has to make in a room where the outcome is binding. The weight of that is real.</p>
      <p>Your War Room built the intelligence foundation: witness dossiers, judge patterns, prosecution profiles, motion landscape, weekly updates. What it does not build is trial weaponry. Cross-examination scripts that document the contradictions in the witnesses' own statements. A voir dire strategy for selecting jurors who respond to reasonable doubt as a concept. An opening framework. JOA motion framework covering the relevant standards for your charge type. Daily trial briefings.</p>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["war-room"].priceDisplay}. The Situation Room costs ${upgradeCostBetween("war-room", "situation-room")}.</strong> Full trial preparation package plus priority response line (2-hour during prep, 4-hour during trial) and daily Trial Intelligence Operations from opening through verdict.</p>
      ${cta(`Get the Situation Room — ${upgradeCostBetween("war-room", "situation-room")} after credit`, "/checkout?tier=situation-room")}
      <p style="margin-top: 16px; color: #A1A1AA;"><strong style="color: white;">Trial preparation has a lead time.</strong> Cross-examination scripts require War Room dossiers as foundation — cannot be rushed without losing precision.</p>
    `,
  },

  // --- Situation Room ($9,997) ---
  // Intake reminder (2 days after purchase, skipped if intake already submitted)
  {
    key: "post_situation_room_intake_reminder",
    delayDays: 2,
    tier: "situation-room",
    subject: "Complete your case details — your Situation Room engagement is active",
    html: `
      <h1 style="color: #F59E0B;">Your Situation Room Is Active</h1>
      <p>You purchased The Situation Room — priority analysis begins as soon as we have your case details. Complete intake now so your included reports can start generating on our priority timeline.</p>
      <p><strong style="color: white;">It takes about 3 minutes.</strong> We need your charges, jurisdiction, and a few details about your situation.</p>
      ${cta("Complete Your Case Details →", "/intake")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Priority timeline:</strong> Your case moves to the front of the queue. The sooner you complete intake, the sooner we begin.
      </p>
    `,
  },
  {
    key: "post_situation_room_delivery",
    delayDays: 0,
    tier: "situation-room",
    subject: "Your Situation Room engagement begins now",
    html: `
      <h1 style="color: #F59E0B;">Your Situation Room Engagement Begins Now</h1>
      <p>Welcome to the highest level of case intelligence we offer. Here's what's happening:</p>
      <ol>
        <li><strong style="color: white;">Priority Analysis (24-48 hours per stage)</strong> — your case moves to the front of the queue</li>
        <li><strong style="color: white;">Trial Intelligence Operations</strong> — when trial begins, you get an evening debrief + morning prep brief every trial day</li>
        <li><strong style="color: white;">Priority Response Line</strong> — 2-hour response during trial prep, 4-hour during trial</li>
      </ol>
      <p>Your dedicated communication channel is now active. Use it for urgent questions at any time.</p>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">What to expect:</strong> Full War Room deliverables on a priority timeline, plus complete trial preparation — research-based questions about JOA standards, witness background research for your attorney, and daily trial support.
      </p>
    `,
  },
  {
    key: "post_situation_room_story_harvest",
    delayDays: 5,
    tier: "situation-room",
    relativeToDelivery: true,
    subject: "How's the case progressing?",
    html: `
      <h1 style="color: #F59E0B;">How's the Case Progressing?</h1>
      <p>You're in the Situation Room — the most comprehensive intelligence package available. I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>What's made the biggest difference so far?</strong></p>
      <p>Just reply to this email. Your experience at this level is invaluable for refining every aspect of what we deliver.</p>
    `,
  },

  // --- Situation Room Meeting Prep (3 days after delivery) ---
  {
    key: "post_situation_room_meeting_prep",
    delayDays: 3,
    tier: "situation-room",
    relativeToDelivery: true,
    subject: "How to use your Situation Room intelligence with your attorney",
    html: `
      <h1 style="color: #F59E0B;">How to Use Your Situation Room Intelligence</h1>
      <p>Your Situation Room package is the most comprehensive intelligence available. Here's how to use it with your attorney:</p>
      <ol>
        <li><strong style="color: white;">Start with the 3 most critical findings</strong> — same approach as any meeting. Key points first, full file after.</li>
        <li><strong style="color: white;">Focus on trial prep materials</strong> — JOA research questions, witness background research, and prosecution strategy analysis.</li>
        <li><strong style="color: white;">Review the daily debrief schedule</strong> — when trial begins, you get an evening debrief + morning prep brief every trial day.</li>
        <li><strong style="color: white;">Use your priority response line</strong> — 2-hour response during trial prep, 4-hour during trial. Use it when new information comes in.</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Your priority response line is active</strong> — use it when new information comes in during trial prep. Don't wait for the next scheduled update.
      </p>
    `,
  },
  // --- Situation Room Referral (21 days after delivery — longer relationship) ---
  {
    key: "post_situation_room_referral",
    delayDays: 21,
    tier: "situation-room",
    relativeToDelivery: true,
    subject: "Know someone facing charges?",
    html: `
      <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
      <p>You know what it's like to face the system without enough information. If someone you know is in the same position, you can help them skip the confusion.</p>
      <p>They don't need the Situation Room to start. A free Case Progress Score gives them clarity on where they stand — no payment, no commitment.</p>
      ${cta("Share ImNotAnAttorney →", "/?ref=friend")}
      <p style="color: #71717A;">Every defendant deserves to walk into their attorney's office with the right questions.</p>
    `,
  },

  // --- DUI Defense Playbook ($97) ---
  // Digital product: no case table, no relativeToDelivery.
  // All delays relative to paid_at (delivery is instant via webhook).
  // Day 0 delivery email is sent by the webhook, not the cron.
  {
    key: "post_dui_playbook_dmv_deadline",
    delayDays: 1,
    tier: "dui-first-offense",
    subject: "The 10-day DMV deadline — have you handled it?",
    html: `
      <h1 style="color: #F59E0B;">The 10-Day DMV Deadline</h1>
      <p>The DMV administrative hearing is separate from your criminal case. Most defendants don't know this until it's too late.</p>
      <p>In most states, you have <strong style="color: white;">10 days from your arrest</strong> to request a hearing to fight the automatic license suspension. If your attorney hasn't requested it, that window may already be closing.</p>
      <p>Open your Playbook to the <strong style="color: white;">Case Stage Roadmap</strong> section. The DMV deadline is the first item. If you haven't acted on it yet, today is the day.</p>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">You have already paid ${TIER_CORE["dui-first-offense"].priceDisplay}. The ${TIER_CORE["case-decoder"].name} costs ${upgradeCostBetween("dui-first-offense", "case-decoder")}.</strong> We research YOUR charges, YOUR jurisdiction, and generate 15 questions specific to your case.
      </p>
      ${cta(`Get the ${TIER_CORE["case-decoder"].name} — ${upgradeCostBetween("dui-first-offense", "case-decoder")}`, "/checkout?tier=case-decoder")}
    `,
  },
  {
    key: "post_dui_playbook_story_harvest",
    delayDays: 3,
    tier: "dui-first-offense",
    subject: "Which question surprised you the most?",
    html: `
      <h1 style="color: #F59E0B;">Which Question Surprised You?</h1>
      <p>You've had a few days with the Playbook. Which of the 26 questions surprised you most?</p>
      <p>Was it the breathalyzer calibration question? The 15-minute observation period? The FST conditions?</p>
      <p><strong style="color: white;">Reply to this email and tell me.</strong> Real feedback from real defendants makes this better for everyone who comes after you. Your reply is confidential.</p>
    `,
  },
  {
    key: "post_dui_playbook_upsell",
    delayDays: 5,
    tier: "dui-first-offense",
    subject: "Generic questions are a start. Case-specific ones change the conversation.",
    html: `
      <h1 style="color: #F59E0B;">Generic vs. Case-Specific</h1>
      <p>The Playbook gives you 26 questions that apply to DUI cases generally. The <strong style="color: white;">Case Decoder</strong> gives you 15 questions built from YOUR charges, YOUR state, YOUR stage, YOUR attorney situation.</p>
      <p>Generic questions open the conversation. <strong style="color: white;">Case-specific questions change it.</strong></p>
      <p>The difference: when your attorney hears a question from the Playbook, they know the answer. When they hear a question from your Case Decoder, they have to actually check the file.</p>
      <p><strong style="color: white;">That's the meeting that changes everything.</strong></p>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">You have already paid ${TIER_CORE["dui-first-offense"].priceDisplay}. The ${TIER_CORE["case-decoder"].name} costs ${upgradeCostBetween("dui-first-offense", "case-decoder")}.</strong> ${TIER_CORE["case-decoder"].delivery} delivery.
      </p>
      ${cta(`Get the ${TIER_CORE["case-decoder"].name} — ${upgradeCostBetween("dui-first-offense", "case-decoder")}`, "/checkout?tier=case-decoder")}
    `,
  },
  {
    key: "post_dui_playbook_referral",
    delayDays: 10,
    tier: "dui-first-offense",
    subject: "Know someone facing a DUI?",
    html: `
      <h1 style="color: #F59E0B;">Know Someone Facing a DUI?</h1>
      <p>If someone you know just got pulled over — or is about to go to court — forward them this email.</p>
      <p>The DUI Defense Playbook is the thing I wish existed when I was in their position. 26 questions, a case stage roadmap, a red flag checklist, and an attorney scorecard. ${TIER_CORE["dui-first-offense"].priceDisplay}, instant download.</p>
      ${cta("Share the DUI Defense Playbook →", "/playbook/dui-first-offense")}
    `,
  },

  // --- Discovery Status Update (X-Ray, War Room, Situation Room) ---
  // Sent 3 days after upload finalization to reassure the customer their
  // documents are being analyzed. Only for discovery tiers where the
  // analysis takes 10+ business days.
  {
    key: "post_x_ray_status_update",
    delayDays: 3,
    tier: "x-ray",
    subject: "Your discovery documents are being analyzed",
    html: `
      <h1 style="color: #F59E0B;">Your Documents Are Being Analyzed</h1>
      <p>We received your discovery documents and analysis is underway. Here's what's happening:</p>
      <ul style="padding-left: 20px;">
        <li><strong style="color: white;">Document inventory</strong> — cataloging every page, every exhibit</li>
        <li><strong style="color: white;">Timeline reconstruction</strong> — mapping events from all documents</li>
        <li><strong style="color: white;">Cross-reference analysis</strong> — identifying contradictions between documents</li>
        <li><strong style="color: white;">Red flag identification</strong> — flagging issues your attorney may want to explore</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Expected delivery: within 10 business days of upload.</strong> We'll email you as soon as your X-Ray report is ready.
      </p>
      <p style="color: #A1A1AA;">Have additional documents to upload? You can add them anytime at ${link("the upload page", "/upload")}.</p>
    `,
  },
  {
    key: "post_war_room_status_update",
    delayDays: 3,
    tier: "war-room",
    subject: "Your War Room analysis is in progress",
    html: `
      <h1 style="color: #F59E0B;">Your War Room Analysis Is In Progress</h1>
      <p>We received your discovery documents and your War Room intelligence operation has begun:</p>
      <ul style="padding-left: 20px;">
        <li><strong style="color: white;">Week 1:</strong> Full case analysis — charges, discovery deep dive, timeline</li>
        <li><strong style="color: white;">Weeks 2-3:</strong> Witness dossiers, prosecution analysis, motion landscape</li>
        <li><strong style="color: white;">Week 4:</strong> Final package assembly — strategy questions, case law</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Expected delivery: 25-28 business days.</strong> Weekly updates begin after initial delivery.
      </p>
      <p style="color: #A1A1AA;">Have additional documents? Upload anytime at ${link("the upload page", "/upload")}.</p>
    `,
  },
  {
    key: "post_situation_room_status_update",
    delayDays: 3,
    tier: "situation-room",
    subject: "Your Situation Room engagement is active — analysis underway",
    html: `
      <h1 style="color: #F59E0B;">Your Situation Room Analysis Is Underway</h1>
      <p>Your documents are being analyzed on a priority timeline. Your Situation Room engagement includes:</p>
      <ul style="padding-left: 20px;">
        <li><strong style="color: white;">Priority analysis</strong> — 24-48 hour turnaround per stage</li>
        <li><strong style="color: white;">All War Room deliverables</strong> on an accelerated schedule</li>
        <li><strong style="color: white;">Trial Intelligence Operations</strong> — evening debrief + morning prep (when trial begins)</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Your priority communication channel is active.</strong> Use it anytime for urgent questions.
      </p>
      <p style="color: #A1A1AA;">Have additional documents? Upload anytime at ${link("the upload page", "/upload")}.</p>
    `,
  },

  // --- Witness Pack ($297) ---
  {
    key: "post_witness_pack_delivery",
    delayDays: 0,
    tier: "witness-pack",
    subject: "Your Witness Pack order is confirmed — upload discovery to begin",
    html: `
      <h1 style="color: #F59E0B;">Your Witness Pack Order Is Confirmed</h1>
      <p>We're ready to analyze up to 3 witnesses — but we need your discovery documents first.</p>
      <p><strong style="color: white;">Upload your documents now so we can start immediately:</strong></p>
      ${cta("Upload Discovery Documents →", "/upload")}
      <p style="margin-top: 24px;">Here's what you'll receive once analysis begins:</p>
      <ul style="padding-left: 20px;">
        <li>Statement analysis for each witness — inconsistencies, gaps, and patterns</li>
        <li>Inconsistency report — where witness statements conflict with evidence or each other</li>
        <li>Cross-examination questions per witness — specific, sourced, ready for your attorney</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Delivery: 3-5 business days from when we receive your documents.</strong>
      </p>
    `,
  },
  {
    key: "post_witness_pack_upsell",
    delayDays: 7,
    tier: "witness-pack",
    subject: "Your witnesses revealed something interesting",
    html: `
      <h1 style="color: #F59E0B;">Your Witnesses Revealed Something Interesting</h1>
      <p>Witness analysis often uncovers patterns that go beyond individual testimony — contradictions that connect to the broader case, gaps that suggest missing evidence, statements that don't match the physical evidence.</p>
      <p>If your witness analysis raised more questions than it answered, a deeper dive might be worth it:</p>
      <p><strong style="color: white;">${TIER_CORE["x-ray"].name} (${TIER_CORE["x-ray"].priceDisplay})</strong> — full discovery analysis:</p>
      <ul style="padding-left: 20px;">
        <li>Every document indexed, timeline reconstructed from the evidence</li>
        <li>Contradictions, missing evidence, and constitutional issues documented</li>
        <li>35-50 targeted questions for your attorney meeting</li>
        <li>Discovery Strength Rating + Prosecution Case Weakness Analysis</li>
      </ul>
      <p><strong style="color: white;">You have already paid ${TIER_CORE["witness-pack"].priceDisplay}. The X-Ray costs ${upgradeCostBetween("witness-pack", "x-ray")}.</strong></p>
      ${cta(`Get the X-Ray — ${upgradeCostBetween("witness-pack", "x-ray")}`, "/checkout?tier=x-ray")}
      <p style="margin-top: 16px;">Or go deeper with <strong style="color: white;">${TIER_CORE["war-room"].name} (${TIER_CORE["war-room"].priceDisplay})</strong> — full intelligence operation with weekly updates. You have already paid ${TIER_CORE["witness-pack"].priceDisplay}. ${link("Learn more", "/services")}</p>
    `,
  },

  // --- Witness Pack Upload Reminder (2 days after purchase) ---
  {
    key: "post_witness_pack_upload_reminder",
    delayDays: 2,
    tier: "witness-pack",
    subject: "Reminder: Upload your discovery documents to begin witness analysis",
    html: `
      <h1 style="color: #F59E0B;">Upload Reminder</h1>
      <p>We're ready to analyze up to 3 witnesses — but we need your discovery documents first.</p>
      <p>If you've already uploaded them, ignore this email. If not:</p>
      ${cta("Upload Discovery Documents →", "/upload?case={{CASE_ID}}&email={{EMAIL}}")}
      <p style="color: #71717A;">Not sure what to upload? Send everything your attorney gave you — witness statements, police reports, any documents mentioning your witnesses.</p>
    `,
  },
  // --- Witness Pack Status Update (3 days after purchase) ---
  {
    key: "post_witness_pack_status_update",
    delayDays: 3,
    tier: "witness-pack",
    subject: "Your witness analysis is in progress",
    html: `
      <h1 style="color: #F59E0B;">Your Witness Analysis Is In Progress</h1>
      <p>We received your discovery documents and witness analysis is underway:</p>
      <ul style="padding-left: 20px;">
        <li><strong style="color: white;">Statement analysis</strong> — reviewing each witness's statements for inconsistencies</li>
        <li><strong style="color: white;">Inconsistency identification</strong> — cross-referencing statements against physical evidence and each other</li>
        <li><strong style="color: white;">Cross-examination questions</strong> — building targeted questions per witness for your attorney</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Expected delivery: 3-5 business days from upload.</strong> We'll email you as soon as your witness analysis is ready.
      </p>
    `,
  },
  // --- Witness Pack Story Harvest (5 days after delivery) ---
  {
    key: "post_witness_pack_story_harvest",
    delayDays: 5,
    tier: "witness-pack",
    relativeToDelivery: true,
    subject: "Whether or not you've met with your attorney yet — one quick question",
    html: `
      <h1 style="color: #F59E0B;">One Quick Question</h1>
      <p>Whether you've already met with your attorney or you're still reviewing — I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which part of your witness analysis has been most useful so far?</strong></p>
      <p>Was it the statement inconsistencies? The cross-examination questions? The behavioral patterns?</p>
      <p>Just reply to this email. One sentence is fine. Your experience helps us build better analysis for every defendant who comes after you.</p>
    `,
  },

  // --- Extra Witness ($149) ---
  {
    key: "post_extra_witness_delivery",
    delayDays: 0,
    tier: "extra-witness",
    subject: "Extra witness analysis added to your case",
    html: `
      <h1 style="color: #F59E0B;">Extra Witness Analysis Added</h1>
      <p>Your additional witness analysis has been added to your case. The dossier will be included in your next War Room or Situation Room update.</p>
      <p>What you'll receive for this witness:</p>
      <ul style="padding-left: 20px;">
        <li>Full witness intelligence dossier</li>
        <li>Statement analysis with inconsistencies flagged</li>
        <li>Cross-examination questions specific to this witness</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Delivery:</strong> Included in your next scheduled update.
      </p>
    `,
  },
];

// ============================================================
// ACCESSOR FUNCTIONS
// ============================================================

/**
 * Returns all nurture sequence emails (for free subscribers).
 *
 * @returns The full array of nurture drip email templates.
 */
export function getNurtureEmails(): DripEmail[] {
  return NURTURE_EMAILS;
}

/**
 * Returns post-purchase emails filtered to a specific product tier.
 *
 * @param tier - The tier slug (e.g., "case-decoder", "x-ray", "war-room").
 * @returns Only the drip emails matching that tier.
 */
export function getPostPurchaseEmails(tier: string): DripEmail[] {
  return POST_PURCHASE_EMAILS.filter((e) => e.tier === tier);
}

/**
 * Determines the next nurture email to send for a subscriber.
 *
 * Iterates through NURTURE_EMAILS in order and returns the first email
 * whose `delayDays` has been reached AND whose `key` has not already
 * been recorded as sent. Returns null when the sequence is complete.
 *
 * @param daysSinceSubscribe - Calendar days since the subscriber signed up.
 * @param sentKeys - Set of email keys already sent to this subscriber.
 * @returns The next email to send, or null if none remain.
 */
export function getNextNurtureEmail(
  daysSinceSubscribe: number,
  sentKeys: Set<string>
): DripEmail | null {
  for (const email of NURTURE_EMAILS) {
    if (daysSinceSubscribe >= email.delayDays && !sentKeys.has(email.key)) {
      return email;
    }
  }
  return null;
}

/**
 * Determines the next score-based email for a subscriber based on their band.
 *
 * Crisis subscribers (Critical/Concerning): score_crisis_day1, day2, transition (Day 5).
 * Adequate/Excellent subscribers: score_adequate_day1.
 * Re-engagement (all score subscribers): Day 7, 14, 21, 30.
 *
 * After all score-specific emails are exhausted, returns null so the cron can
 * fall through to standard nurture with an appropriate day offset.
 *
 * @param daysSinceSubscribe - Calendar days since the subscriber signed up.
 * @param sentKeys - Set of email keys already sent to this subscriber.
 * @param scoreBand - The subscriber's score band (Critical, Concerning, Adequate, Excellent).
 * @returns The next score-specific email to send, or null if none remain.
 */
export function getNextScoreEmail(
  daysSinceSubscribe: number,
  sentKeys: Set<string>,
  scoreBand: string
): DripEmail | null {
  const isCrisis = scoreBand === "Critical" || scoreBand === "Concerning";
  const sequenceEmails = isCrisis ? SCORE_CRISIS_EMAILS : SCORE_ADEQUATE_EMAILS;

  // Check sequence-specific emails first
  for (const email of sequenceEmails) {
    if (daysSinceSubscribe >= email.delayDays && !sentKeys.has(email.key)) {
      return email;
    }
  }

  // Check re-engagement emails (apply to all score subscribers)
  for (const email of SCORE_REENGAGE_EMAILS) {
    if (daysSinceSubscribe >= email.delayDays && !sentKeys.has(email.key)) {
      return email;
    }
  }

  // All score emails sent — return null so cron falls through to standard nurture
  return null;
}

/**
 * Returns the day offset at which a score subscriber should join standard nurture.
 * Crisis (Critical/Concerning): join at Day 7 (skipping Days 1-5 of generic).
 * Adequate/Excellent: join at Day 3.
 */
export function getScoreNurtureOffset(scoreBand: string): number {
  return scoreBand === "Critical" || scoreBand === "Concerning" ? 7 : 3;
}

/**
 * Determines the next DUI 72-hour sequence email for a subscriber.
 *
 * DUI 72-hour subscribers (source: "dui-72-hours") get crisis-compressed
 * cadence (Day 1, 3, 5, 7) focused on DMV deadline urgency and Playbook
 * conversion. After Day 7: SILENCE. No standard nurture fallthrough —
 * crisis buyers have bought or moved on by then.
 *
 * @param daysSinceSubscribe - Calendar days since the subscriber signed up.
 * @param sentKeys - Set of email keys already sent to this subscriber.
 * @returns The next DUI-specific email to send, or null if none remain.
 */
export function getNextDui72hEmail(
  daysSinceSubscribe: number,
  sentKeys: Set<string>
): DripEmail | null {
  for (const email of DUI_72_HOUR_EMAILS) {
    if (daysSinceSubscribe >= email.delayDays && !sentKeys.has(email.key)) {
      return email;
    }
  }
  return null;
}

/**
 * Returns the day offset for DUI 72-hour nurture fallthrough.
 * Returns -1 to signal NO FALLTHROUGH — crisis buyers who haven't
 * converted by Day 7 are gone. Sending Day 10/14 generic nurture
 * to resolved crisis buyers burns sender reputation for zero conversion.
 */
export function getDui72hNurtureOffset(): number {
  return -1;
}

/**
 * Determines the next abandoned-score email for a subscriber.
 *
 * For subscribers who started the /score quiz but didn't finish
 * (source: "score-abandoned"). Day 1, 2, 5 re-engagement to complete
 * the quiz. After Day 5: falls through to standard nurture at Day 7.
 *
 * @param daysSinceSubscribe - Calendar days since the subscriber signed up.
 * @param sentKeys - Set of email keys already sent to this subscriber.
 * @returns The next abandoned-score email, or null if none remain.
 */
export function getNextAbandonedScoreEmail(
  daysSinceSubscribe: number,
  sentKeys: Set<string>
): DripEmail | null {
  for (const email of ABANDONED_SCORE_EMAILS) {
    if (daysSinceSubscribe >= email.delayDays && !sentKeys.has(email.key)) {
      return email;
    }
  }
  return null;
}

/**
 * Determines the next win-back email for a cold subscriber.
 *
 * For subscribers who exhausted all other sequences (nurture, score,
 * re-engagement) without purchasing. Day 75, 78, 82, 89, 96 after
 * subscribe. Includes sunset emails (Day 89, 96) with resubscribe
 * links. Suppressed for subscribers who have purchased (checked in cron).
 *
 * @param daysSinceSubscribe - Calendar days since the subscriber signed up.
 * @param sentKeys - Set of email keys already sent to this subscriber.
 * @returns The next win-back email, or null if none remain.
 */
export function getNextWinbackEmail(
  daysSinceSubscribe: number,
  sentKeys: Set<string>
): DripEmail | null {
  for (const email of WINBACK_EMAILS) {
    if (daysSinceSubscribe >= email.delayDays && !sentKeys.has(email.key)) {
      return email;
    }
  }
  return null;
}

// ============================================================
// PERSONALIZATION (Chaperon — conditional blocks at gating decisions only)
// ============================================================

/** Intake fields used for drip email personalization */
export interface DripPersonalizationData {
  filled_out_by?: string | null;
  case_stage?: string | null;
  employment_industry?: string | null;
  first_name?: string | null;
}

/**
 * Styled callout box matching existing email design (amber border, dark bg).
 * Used to append personalized content blocks without touching base templates.
 */
function calloutBox(html: string): string {
  return `<div style="margin: 20px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; border-radius: 4px;">${html}</div>`;
}

/**
 * Append personalized content blocks to post-purchase drip emails based on
 * intake data. Only 10 emails get personalization (Chaperon: gating decision
 * points only). Base templates stay untouched — blocks are appended.
 *
 * @param html - The base email HTML
 * @param emailKey - The drip email key (e.g. "post_case_decoder_delivery")
 * @param intake - Subset of intake fields needed for personalization
 * @returns The email HTML with personalized blocks appended (or unchanged)
 */
export function personalizeEmailHtml(
  html: string,
  emailKey: string,
  intake: DripPersonalizationData
): string {
  const isFamilyBuyer = intake.filled_out_by === "family" || intake.filled_out_by === "friend";
  const name = intake.first_name ? escapeHtml(intake.first_name) : "the defendant";
  const stage = intake.case_stage || "";
  const industry = intake.employment_industry || "";

  // Only personalize known email keys — return unchanged for all others
  switch (emailKey) {
    // ── Case Decoder emails ──

    case "post_case_decoder_delivery":
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">For Support Persons</p>
          <p style="color: #D4D4D8; margin: 0;">You ordered this for ${name} — here's how to help them use it:
          Start with the "Questions for Your Attorney" section and pick the top 5 together.
          The email template in "Exactly What to Say" is written for ${name} to send — help them copy and customize it.</p>
        `);
      }
      return html;

    case "post_case_decoder_meeting_prep":
      if (isFamilyBuyer) {
        let block = `<p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">For Support Persons</p>
          <p style="color: #D4D4D8; margin: 0;">You can prepare alongside ${name}: review the Meeting Ready Sheet together and rehearse the questions out loud. Two people remembering the answers is better than one.</p>`;
        if (stage === "sentencing") {
          block += `<p style="color: #D4D4D8; margin: 8px 0 0;">At the sentencing stage, character letters matter. Start gathering letters from people who can speak to ${name}'s character — employers, community members, family.</p>`;
        } else if (stage === "post-conviction") {
          block += `<p style="color: #D4D4D8; margin: 8px 0 0;">Post-conviction cases have strict appeal deadlines. Confirm the appeal filing deadline with the attorney before this meeting.</p>`;
        }
        return html + calloutBox(block);
      }
      if (stage === "sentencing") {
        return html + calloutBox(`<p style="color: #D4D4D8; margin: 0;">At the sentencing stage, character letters can make a real difference. Start gathering letters from employers, community members, and family before your meeting.</p>`);
      }
      if (stage === "post-conviction") {
        return html + calloutBox(`<p style="color: #D4D4D8; margin: 0;">Post-conviction cases have strict appeal deadlines. Confirm the appeal filing deadline with your attorney before this meeting.</p>`);
      }
      return html;

    case "post_case_decoder_upsell":
      if (isFamilyBuyer && industry) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You did the research for ${name}. The X-Ray reads every page of the discovery — including how these charges could affect ${escapeHtml(industry)} licensing. You have already paid ${TIER_CORE["case-decoder"].priceDisplay}.</p>
        `);
      }
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You did the research for ${name}. The X-Ray picks up where the Case Decoder left off — reading the actual discovery documents for contradictions, missing evidence, and defense angles. You have already paid ${TIER_CORE["case-decoder"].priceDisplay}.</p>
        `);
      }
      if (industry) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">The X-Ray includes career-specific analysis — how your discovery evidence relates to ${escapeHtml(industry)} licensing exposure and what questions to raise with your attorney. You have already paid ${TIER_CORE["case-decoder"].priceDisplay}.</p>
        `);
      }
      return html;

    case "post_case_decoder_story_harvest":
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">Which part of the report helped YOUR role as a support person the most? Did it change how you're thinking about the next steps for ${name}?</p>
        `);
      }
      return html;

    case "post_case_decoder_referral":
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You showed up for ${name} when it mattered. If you know someone else going through this — another family member, a friend — they deserve the same clarity you got.</p>
        `);
      }
      return html;

    // ── Intelligence Brief emails ──

    case "post_intelligence_brief_delivery":
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">For Support Persons</p>
          <p style="color: #D4D4D8; margin: 0;">Priority 1 in the 48-Hour Priority List is something you can do today — it takes under 5 minutes. Start there. Then review the 14-day plan together with ${name}.</p>
        `);
      }
      return html;

    case "post_intelligence_brief_phase2_reminder":
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You can fill out the second form for ${name} too — it asks about the judge, attorney details, and case specifics. If ${name} has the case paperwork, you can pull most of it from there.</p>
        `);
      }
      return html;

    case "post_intelligence_brief_meeting_prep":
      if (isFamilyBuyer) {
        let block = `<p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">For Support Persons</p>
          <p style="color: #D4D4D8; margin: 0;">Review the Meeting Ready Sheet with ${name} and rehearse the 5 questions out loud. If you're going to the meeting, bring a notebook — write down every answer.</p>`;
        if (stage === "sentencing") {
          block += `<p style="color: #D4D4D8; margin: 8px 0 0;">At the sentencing stage, the mitigation package is critical. Review Section 6's character letter guidance together.</p>`;
        }
        return html + calloutBox(block);
      }
      if (stage === "sentencing") {
        return html + calloutBox(`<p style="color: #D4D4D8; margin: 0;">At the sentencing stage, the mitigation package is critical. Review Section 6's character letter guidance before your meeting.</p>`);
      }
      return html;

    case "post_intelligence_brief_upsell":
      if (stage === "discovery" || stage === "Discovery review") {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You're in the discovery phase — this is exactly when The X-Ray delivers the most value. It analyzes your actual discovery evidence, not just what you've told us. You have already paid ${TIER_CORE["intelligence-brief"].priceDisplay}. The X-Ray costs ${upgradePrice("intelligence-brief")}.</p>
        `);
      }
      return html;

    case "post_intelligence_brief_referral":
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You showed up for ${name} when it mattered. If you know someone else going through this — another family member, a friend — they deserve the same clarity you got.</p>
        `);
      }
      return html;

    default:
      return html;
  }
}
