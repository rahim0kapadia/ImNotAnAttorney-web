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
 *      - Case Decoder: delivery → story harvest → upsell → referral
 *      - Intelligence Brief: delivery → story harvest → upsell
 *      - X-Ray: delivery → upload reminder → story harvest
 *      - War Room: delivery → first weekly update → story harvest
 *      - Situation Room: delivery → story harvest
 *      - Witness Pack / Extra Witness: delivery → upsell
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
 * Style: dark bg (#0C0A09), zinc text (#D4D4D8), amber accent (#F59E0B).
 * CAN-SPAM footer is added by sendEmail() in lib/email.ts — not here.
 */

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
    `,
  },
  {
    key: "nurture_day7",
    delayDays: 7,
    subject: "10 questions, $197, 24 hours — here's exactly what you get",
    html: `
      <h1 style="color: #F59E0B;">Here's What a Case Decoder Includes</h1>
      <ul style="padding-left: 20px;">
        <li>Your charges explained in plain English</li>
        <li>A timeline of where your case should be right now</li>
        <li>Defense milestone checklist</li>
        <li>15 targeted questions built from YOUR case details</li>
        <li>Red flags for your specific stage and charges</li>
        <li>Motion types that may apply to your case</li>
        <li>BONUS: Attorney Meeting Prep Guide</li>
        <li>BONUS: Motion Deadline Awareness</li>
      </ul>
      <p>Every question generated using tactics from elite defense attorneys — Barry Scheck, Jeffrey Lichtman, F. Lee Bailey.</p>
      <p>Delivered within 24 hours with 10+ targeted questions — or full cash refund. Delivered and not satisfied? 100% credit toward any higher tier.</p>
      <p><strong style="color: white;">$197.</strong> Less than one hour of your attorney's time.</p>
      ${cta("Find What's in My Case — $197 →", "/checkout?tier=case-decoder")}
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
      <p><strong style="color: white;">$197. 24 hours.</strong> The cost of not knowing is higher.</p>
      ${cta("Find What's in My Case — $197 →", "/checkout?tier=case-decoder")}
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
    key: "post_case_decoder_delivery",
    delayDays: 0,
    tier: "case-decoder",
    subject: "Your Attorney Meeting Prep Kit is ready",
    html: `
      <h1 style="color: #F59E0B;">Your Attorney Meeting Prep Kit Is Ready</h1>
      <p>Your Case Decoder report has been delivered — check your inbox for the report link. Here's how to use it:</p>
      <ol>
        <li><strong style="color: white;">Read sections 1-3 first</strong> — charges, timeline, accountability checklist</li>
        <li><strong style="color: white;">Pick your top 5 questions</strong> from section 4 — start with the ones that surprised you most</li>
        <li><strong style="color: white;">Bring them to your next attorney meeting</strong> — document every answer</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        After your next attorney meeting, reply to this email and tell me: <strong style="color: white;">which question got the most reaction?</strong> Real cases make this service better for every defendant who comes after you.
      </p>
    `,
  },
  {
    key: "post_case_decoder_story_harvest",
    delayDays: 5,
    tier: "case-decoder",
    relativeToDelivery: true,
    subject: "You met with your attorney — what was the first question they stopped to think about?",
    html: `
      <h1 style="color: #F59E0B;">How Did It Go?</h1>
      <p>You had your attorney meeting. I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which question got the most reaction?</strong></p>
      <p>Was it the one about weight discrepancies? The motion deadline? The accountability checklist score?</p>
      <p>Just reply to this email. One sentence is fine. Your experience helps us build better questions for every defendant who comes after you.</p>
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
      <p>Your Case Decoder gave you the foundation — charges explained, milestones measured, and 15 targeted questions.</p>
      <p>The <strong style="color: white;">Intelligence Brief ($797)</strong> goes deeper:</p>
      <ul style="padding-left: 20px;">
        <li>Your judge's actual sentencing patterns</li>
        <li>Jurisdiction-specific plea statistics</li>
        <li>Motion landscape report</li>
        <li>35-50 targeted questions (vs. 15)</li>
        <li>BONUS: Judge Tendencies Card</li>
      </ul>
      <p><strong style="color: white;">Your $197 is already credited.</strong> Upgrade for just $600.</p>
      ${cta("Upgrade to Intelligence Brief — $600 →", "/checkout?tier=intelligence-brief")}
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

  // --- Intelligence Brief ($797) ---
  {
    key: "post_intelligence_brief_delivery",
    delayDays: 0,
    tier: "intelligence-brief",
    subject: "Your Intelligence Brief is ready — here's how to use it in your next meeting",
    html: `
      <h1 style="color: #F59E0B;">Your Intelligence Brief Is Ready</h1>
      <p>Your full Intelligence Brief has been delivered — check your inbox for the report link. Here's how to use it:</p>
      <ol>
        <li><strong style="color: white;">Start with the Judge Tendencies Card</strong> — know your judge before your next hearing</li>
        <li><strong style="color: white;">Review the motion landscape</strong> — which motions apply and what the deadlines look like</li>
        <li><strong style="color: white;">Pick 10 questions from the 35-50 generated</strong> — bring them to your next meeting</li>
      </ol>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        After your next attorney meeting, reply to this email and tell me: <strong style="color: white;">which question got the most reaction?</strong> Real cases make this service better for every defendant who comes after you.
      </p>
    `,
  },
  {
    key: "post_intelligence_brief_story_harvest",
    delayDays: 5,
    tier: "intelligence-brief",
    relativeToDelivery: true,
    subject: "You met with your attorney — what was the first question they stopped to think about?",
    html: `
      <h1 style="color: #F59E0B;">How Did It Go?</h1>
      <p>You had your attorney meeting with 35-50 questions in hand. I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>Which question made your attorney pause?</strong></p>
      <p>Just reply to this email. Your experience helps us refine every report for every defendant who comes after you.</p>
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
      <p>When you receive discovery, the <strong style="color: white;">X-Ray ($1,497)</strong> analyzes every page:</p>
      <ul style="padding-left: 20px;">
        <li>Complete document index</li>
        <li>Comprehensive timeline</li>
        <li>Discrepancy report (weight, dates, descriptions)</li>
        <li>Red flags summary</li>
        <li>35+ case-specific questions</li>
        <li>Discovery Health Score — completeness rated out of 100</li>
        <li>Defense Opportunity Index — defense openings ranked by strength</li>
      </ul>
      <p><strong style="color: white;">Your $797 is already credited.</strong> Upgrade for just $700.</p>
      ${cta("Upgrade to The X-Ray — $700 →", "/checkout?tier=x-ray")}
    `,
  },

  // --- X-Ray+ ($997+) ---
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

  // --- War Room ($3,497) ---
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
    key: "post_war_room_first_update",
    delayDays: 30,
    tier: "war-room",
    subject: "Your first weekly update is ready",
    html: `
      <h1 style="color: #F59E0B;">Your First Weekly Update Is Ready</h1>
      <p>Your War Room weekly update is available. Here's how to use it:</p>
      <ol>
        <li><strong style="color: white;">Check for new developments</strong> — any changes in your case since the initial package</li>
        <li><strong style="color: white;">Review updated questions</strong> — new questions based on case progress</li>
        <li><strong style="color: white;">Share with your attorney</strong> — the attorney delivery section is formatted for them</li>
      </ol>
      <p>These updates continue weekly. If anything changes in your case — new discovery, new hearings, new filings — reply to this email so we can incorporate it.</p>
    `,
  },
  {
    key: "post_war_room_story_harvest",
    delayDays: 5,
    tier: "war-room",
    relativeToDelivery: true,
    subject: "How's your case going?",
    html: `
      <h1 style="color: #F59E0B;">How's Your Case Going?</h1>
      <p>You've had your War Room package for a while now. I have one question:</p>
      <p style="font-size: 18px; color: white;"><strong>What's been the most useful finding so far?</strong></p>
      <p>Was it the witness analysis? The motion landscape? Something your attorney hadn't considered?</p>
      <p>Just reply to this email. Your experience helps us build better intelligence for every defendant who comes after you.</p>
    `,
  },

  // --- Situation Room ($9,997) ---
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

  // --- Witness Pack ($297) ---
  {
    key: "post_witness_pack_delivery",
    delayDays: 0,
    tier: "witness-pack",
    subject: "Your Witness Pack analysis is underway",
    html: `
      <h1 style="color: #F59E0B;">Your Witness Pack Analysis Is Underway</h1>
      <p>We've received your order and are analyzing up to 3 witnesses from your discovery documents.</p>
      <p>Here's what you'll receive:</p>
      <ul style="padding-left: 20px;">
        <li>Statement analysis for each witness — inconsistencies, gaps, and patterns</li>
        <li>Inconsistency report — where witness statements conflict with evidence or each other</li>
        <li>Cross-examination questions per witness — specific, sourced, ready for your attorney</li>
      </ul>
      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
        <strong style="color: white;">Delivery: 3-5 business days.</strong> If you haven't uploaded discovery yet, do it now so we can start immediately.
      </p>
      ${cta("Upload Discovery Documents →", "/upload")}
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
      <p><strong style="color: white;">The X-Ray ($1,497)</strong> — full discovery analysis:</p>
      <ul style="padding-left: 20px;">
        <li>Complete document index and timeline</li>
        <li>Discrepancy report across ALL evidence</li>
        <li>35+ case-specific questions</li>
        <li>Discovery Health Score + Defense Opportunity Index</li>
      </ul>
      <p><strong style="color: white;">Your $297 is already credited.</strong> Upgrade for $1,200.</p>
      ${cta("Upgrade to The X-Ray — $1,200 →", "/checkout?tier=x-ray")}
      <p style="margin-top: 16px;">Or go deeper with <strong style="color: white;">The War Room ($3,497)</strong> — full intelligence operation with weekly updates. Your $297 credit applies. ${link("Learn more →", "/services")}</p>
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
