/**
 * @fileoverview Drip email templates for nurture and post-purchase sequences.
 *
 * This file defines two distinct email sequences:
 *
 * 1. **Nurture sequence** (NURTURE_EMAILS) — sent to free subscribers on a
 *    schedule of day 1, 3, 5, 7, 10, 14 after subscribing. Goal: demonstrate
 *    expertise with real case examples, build trust, convert to Case Decoder.
 *
 * 2. **Post-purchase sequences** (POST_PURCHASE_EMAILS) — tier-specific emails
 *    triggered after a purchase. Each tier has its own sequence:
 *      - Case Decoder: intake reminder → delivery → meeting prep → story harvest → upsell → referral
 *      - Intelligence Brief: phase2 reminder → delivery → meeting prep → story harvest → upsell → referral
 *      - X-Ray: intake reminder → delivery → upload reminder → meeting prep → story harvest → upsell → referral → status update
 *      - War Room: intake reminder → delivery → meeting prep → story harvest → status update → referral
 *      - Situation Room: intake reminder → delivery → meeting prep → story harvest → status update → referral
 *      - Witness Pack: delivery → upload reminder → status update → story harvest → upsell
 *      - Extra Witness: delivery
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
      <p>We found all of them in the discovery documents. We generated 15 specific questions — each traced to a documented winning method from attorneys like Barry Scheck, Jeffrey Lichtman, and Alan Dershowitz.</p>
      ${cta("See the full sample report →", "/sample")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">DUI charges?</strong> Get the ${TIER_CORE["dui-first-offense"].name} — ${TIER_CORE["dui-first-offense"].priceDisplay}, instant download. 26 questions your attorney hopes you never ask + breathalyzer checklist + attorney scorecard. ${link("Get the Playbook →", "/playbook/dui-first-offense")}
      </p>
    `,
  },
  {
    key: "nurture_day7",
    delayDays: 7,
    subject: "10 questions, $197, 48 hours — here's exactly what you get",
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
      <p>Every question generated using tactics from elite defense attorneys — Barry Scheck, Jeffrey Lichtman, F. Lee Bailey.</p>
      <p>Delivered within 48 hours with 15 calibrated questions + communication tools — or full cash refund. Delivered and not satisfied? 100% credit toward any higher tier.</p>
      <p><strong style="color: white;">${TIER_CORE["case-decoder"].priceDisplay}.</strong> Less than one hour of your attorney's time.</p>
      ${cta(`Find What's in My Case — ${TIER_CORE["case-decoder"].priceDisplay} →`, "/checkout?tier=case-decoder")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Not ready for case-specific?</strong> The ${TIER_CORE["dui-first-offense"].name} (${TIER_CORE["dui-first-offense"].priceDisplay}) gives you 23 general DUI questions instantly. Full credit toward Case Decoder within 30 days. ${link("Get the Playbook →", "/playbook/dui-first-offense")}
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
        <strong style="color: white;">DUI charges?</strong> Start with the ${TIER_CORE["dui-first-offense"].name} — ${TIER_CORE["dui-first-offense"].priceDisplay} instant download. 26 questions + attorney scorecard. Your ${TIER_CORE["dui-first-offense"].priceDisplay} is credited toward any service tier. ${link("Get the Playbook →", "/playbook/dui-first-offense")}
      </p>
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
        <li><strong style="color: white;">Print the Meeting Ready Sheet</strong> — it's in Section 10 of your report. Bring it to the meeting.</li>
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
    subject: "Ready to go deeper?",
    html: `
      <h1 style="color: #F59E0B;">Ready to Go Deeper?</h1>
      <p>Your Case Decoder gave you the foundation — charges explained, 15 calibrated questions, and a 7-day action plan.</p>
      <p>The <strong style="color: white;">${TIER_CORE["intelligence-brief"].name} (${TIER_CORE["intelligence-brief"].priceDisplay})</strong> goes deeper:</p>
      <ul style="padding-left: 20px;">
        <li>Your judge's actual sentencing patterns</li>
        <li>Jurisdiction-specific plea statistics</li>
        <li>Motion landscape report</li>
        <li>10-15 targeted questions</li>
        <li>Judge Intelligence Card — one-page print reference for hearings</li>
        <li>Plea Decision Checklist</li>
      </ul>
      <p><strong style="color: white;">Your ${TIER_CORE["case-decoder"].priceDisplay} is already credited.</strong> Upgrade for just ${upgradePrice("case-decoder")}.</p>
      ${cta(`Upgrade to ${TIER_CORE["intelligence-brief"].name} — ${upgradePrice("case-decoder")} →`, "/checkout?tier=intelligence-brief")}
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
        <strong style="color: white;">What's next:</strong> Check your email for details on completing your full Intelligence Brief intake — a few more questions so we can build your complete report with judge intelligence, motion landscape, and more.
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
      <p><strong style="color: white;">It takes about 5 minutes.</strong> Once you submit, your Intelligence Brief will be generated within 72 hours — including judge intelligence, motion landscape, and your priority questions.</p>
      ${cta("Complete Intelligence Brief Details →", "/intake/intelligence-brief")}
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Your Case Decoder gave you the foundation.</strong> The Intelligence Brief goes deeper — your judge's actual patterns, defense theories specific to your charge, and a 14-day action plan with scripts for difficult conversations.
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
        <li><strong style="color: white;">Print the Judge Intelligence Card (Appendix F)</strong> — one page, designed for the meeting. Bring it.</li>
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
      <p>Was it the judge intelligence? The priority questions? The 14-day action plan? The difficult conversation scripts?</p>
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
  {
    key: "post_intelligence_brief_upsell",
    delayDays: 10,
    tier: "intelligence-brief",
    subject: "When you get discovery — we're ready",
    html: `
      <h1 style="color: #F59E0B;">When You Get Discovery</h1>
      <p>Your Intelligence Brief covered charges, judge intel, and accountability. But the real power is in the discovery documents.</p>
      <p>When you receive discovery, the <strong style="color: white;">${TIER_CORE["x-ray"].name} (${TIER_CORE["x-ray"].priceDisplay})</strong> analyzes every page:</p>
      <ul style="padding-left: 20px;">
        <li>Complete document index</li>
        <li>Comprehensive timeline</li>
        <li>Discrepancy report (weight, dates, descriptions)</li>
        <li>Red flags summary</li>
        <li>35+ case-specific questions</li>
        <li>Discovery Health Score — completeness rated out of 100</li>
        <li>Defense Opportunity Index — defense angles organized by charge category</li>
      </ul>
      <p><strong style="color: white;">Your ${TIER_CORE["intelligence-brief"].priceDisplay} is already credited.</strong> Upgrade for just ${upgradePrice("intelligence-brief")}.</p>
      ${cta(`Upgrade to ${TIER_CORE["x-ray"].name} — ${upgradePrice("intelligence-brief")} →`, "/checkout?tier=x-ray")}
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
  // --- X-Ray Upsell to War Room (10 days after delivery) ---
  {
    key: "post_x_ray_upsell",
    delayDays: 10,
    tier: "x-ray",
    relativeToDelivery: true,
    subject: "Your discovery revealed patterns — here's how to go deeper",
    html: `
      <h1 style="color: #F59E0B;">Your Discovery Revealed Patterns</h1>
      <p>Your X-Ray analyzed every document. But some of those patterns — witness contradictions, evidence gaps, timeline conflicts — deserve a deeper investigation.</p>
      <p>The <strong style="color: white;">${TIER_CORE["war-room"].name} (${TIER_CORE["war-room"].priceDisplay})</strong> turns those findings into a full intelligence operation:</p>
      <ul style="padding-left: 20px;">
        <li>Witness dossiers (up to 8) — full background, statement analysis, cross-examination questions</li>
        <li>Prosecution strategy analysis — what they're building and where it's weak</li>
        <li>Case law package — relevant precedents organized by issue</li>
        <li>Motion landscape — every applicable motion with strategic assessment</li>
        <li>Weekly updates for the duration of your case</li>
      </ul>
      <p><strong style="color: white;">Your ${TIER_CORE["x-ray"].priceDisplay} is already credited.</strong> Upgrade for just ${upgradePrice("x-ray")}.</p>
      ${cta(`Upgrade to ${TIER_CORE["war-room"].name} — ${upgradePrice("x-ray")} →`, "/checkout?tier=war-room")}
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
        <strong style="color: white;">Want case-specific research?</strong> Your ${TIER_CORE["dui-first-offense"].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay}). We'll research YOUR judge, YOUR jurisdiction, and generate 15 questions specific to your case.
      </p>
      ${cta(`Upgrade to ${TIER_CORE["case-decoder"].name} — ${upgradePrice("dui-first-offense")} →`, "/checkout?tier=case-decoder")}
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
        Your ${TIER_CORE["dui-first-offense"].priceDisplay} is fully credited. Upgrade for ${upgradePrice("dui-first-offense")}. ${TIER_CORE["case-decoder"].delivery} delivery.
      </p>
      ${cta(`Get Your ${TIER_CORE["case-decoder"].name} — ${upgradePrice("dui-first-offense")} →`, "/checkout?tier=case-decoder")}
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
      <p style="margin-top: 16px; color: #71717A;">If they buy through your link, send me a receipt and I'll credit you $20 toward any of our services.</p>
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
        <li>Complete document index and timeline</li>
        <li>Discrepancy report across ALL evidence</li>
        <li>35+ case-specific questions</li>
        <li>Discovery Health Score + Defense Opportunity Index</li>
      </ul>
      <p><strong style="color: white;">Your ${TIER_CORE["witness-pack"].priceDisplay} is already credited.</strong> Upgrade for ${upgradeCostBetween("witness-pack", "x-ray")}.</p>
      ${cta(`Upgrade to ${TIER_CORE["x-ray"].name} — ${upgradeCostBetween("witness-pack", "x-ray")} →`, "/checkout?tier=x-ray")}
      <p style="margin-top: 16px;">Or go deeper with <strong style="color: white;">${TIER_CORE["war-room"].name} (${TIER_CORE["war-room"].priceDisplay})</strong> — full intelligence operation with weekly updates. Your ${TIER_CORE["witness-pack"].priceDisplay} credit applies. ${link("Learn more →", "/services")}</p>
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
          <p style="color: #D4D4D8; margin: 0;">You did the research for ${name}. The Intelligence Brief ($997) goes deeper — including how these charges could affect ${escapeHtml(industry)} licensing and what protective steps to take now. Your $197 is fully credited.</p>
        `);
      }
      if (isFamilyBuyer) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">You did the research for ${name}. The Intelligence Brief ($997) builds on everything in the Case Decoder with a full outcome map, defense theories, and a 14-day action plan. Your $197 is fully credited.</p>
        `);
      }
      if (industry) {
        return html + calloutBox(`
          <p style="color: #D4D4D8; margin: 0;">The Intelligence Brief ($997) includes career-specific analysis — how these charges could affect ${escapeHtml(industry)} licensing and what protective steps to consider now. Your $197 is fully credited.</p>
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
          <p style="color: #D4D4D8; margin: 0;">You're in the discovery phase — this is exactly when The X-Ray ($2,497) delivers the most value. It analyzes your actual discovery evidence, not just what you've told us. Your $997 is fully credited, so it's $1,500.</p>
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
