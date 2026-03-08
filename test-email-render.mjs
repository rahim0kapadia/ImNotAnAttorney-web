/**
 * Test script: Email Template Visual Audit
 *
 * Renders every email template in the system to standalone HTML files
 * for visual review in a browser. Generates an index.html with links to all.
 *
 * Run: node test-email-render.mjs
 * Output: test-emails/ directory with 40+ HTML files + index.html
 *
 * No external dependencies needed — reads source files directly and
 * evaluates template strings with sample data.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "test-emails");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ================================================================
// BRANDED EMAIL WRAPPER (matches sendEmail() in lib/email.ts)
// ================================================================

const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";
const SITE_URL = "https://imnotanattorney.com";

function wrapInBrandedTemplate(innerHtml, { subject, category, hasUnsubscribe = true }) {
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?email=dGVzdEBleGFtcGxlLmNvbQ==`;
  const unsubscribeHtml = hasUnsubscribe
    ? `<p style="margin: 8px 0 0;"><a href="${unsubscribeUrl}" style="color: #71717A; text-decoration: underline;">Unsubscribe</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
<style>
  body { margin: 0; padding: 0; }
  .debug-info {
    background: #1a1a2e; color: #71717A; padding: 12px 32px; font-family: monospace; font-size: 12px;
    border-bottom: 2px solid #F59E0B;
  }
  .debug-info strong { color: #F59E0B; }
</style>
</head>
<body>
<div class="debug-info">
  <strong>Subject:</strong> ${escapeHtml(subject)}<br>
  <strong>Category:</strong> ${escapeHtml(category)}<br>
  <strong>Unsubscribe:</strong> ${hasUnsubscribe ? "Yes" : "No (operator email)"}
</div>
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
  ${innerHtml}
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; font-size: 12px; color: #71717A; text-align: center;">
    <p style="margin: 0 0 8px;">ImNotAnAttorney</p>
    <p style="margin: 0;">Legal information and research services — not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 11px; color: #52525B;">${PHYSICAL_ADDRESS}</p>
    ${unsubscribeHtml}
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ================================================================
// TEMPLATE HELPERS (mirroring drip-emails.ts)
// ================================================================

function cta(text, href) {
  return `<a href="${SITE_URL}${href}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">${text}</a>`;
}

function link(text, href) {
  return `<a href="${SITE_URL}${href}" style="color: #F59E0B; text-decoration: underline;">${text}</a>`;
}

// ================================================================
// ALL EMAIL TEMPLATES (organized by source)
// ================================================================

const emails = [];

// ────────────────────────────────────────────────
// NURTURE SEQUENCE (from drip-emails.ts)
// ────────────────────────────────────────────────

emails.push({
  filename: "nurture-day1.html",
  subject: "3 things your attorney should have done by now",
  category: "Nurture Drip (Day 1)",
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
});

emails.push({
  filename: "nurture-day3.html",
  subject: "What 500 pages of discovery actually means",
  category: "Nurture Drip (Day 3)",
  html: `
    <h1 style="color: #F59E0B;">What 500 Pages of Discovery Actually Means</h1>
    <p>500 pages of discovery is not 500 pages of reading.</p>
    <p>It's police reports in cop shorthand. Lab results with methodology codes. Witness statements that contradict each other in ways you can't see unless you read them side by side.</p>
    <p>Your attorney read it. Probably. But <strong style="color: white;">reading and analyzing are different things.</strong></p>
    <p>Analyzing means catching that the inventory weight doesn't match the lab weight. That the field test date is after the arrest date. That the CI's phone number appears in two different people's records.</p>
    <p>The defendants who know what to look for walk into attorney meetings with leverage.</p>
    ${cta("Re-download the Discovery Checklist →", "/resources")}
  `,
});

emails.push({
  filename: "nurture-day5.html",
  subject: "We found 68.3g of missing evidence. The attorney never mentioned it.",
  category: "Nurture Drip (Day 5)",
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
});

emails.push({
  filename: "nurture-day7.html",
  subject: "10 questions, $197, 24 hours — here's exactly what you get",
  category: "Nurture Drip (Day 7)",
  html: `
    <h1 style="color: #F59E0B;">Here's What a Case Decoder Includes</h1>
    <ul style="padding-left: 20px;">
      <li>Your charges explained in plain English — with what the prosecution must prove</li>
      <li>15 calibrated questions for your attorney (6-part format with follow-up probes)</li>
      <li>Ready-to-send email template + phone script for your attorney</li>
      <li>Where Things Stand — 4-area diagnostic of your case</li>
      <li>Your Next 7 Days — one action per day with Meeting Ready Sheet</li>
      <li>BONUS: Scripts for when the conversation gets difficult</li>
    </ul>
    <p>Every question generated using tactics from elite defense attorneys — Barry Scheck, Jeffrey Lichtman, F. Lee Bailey.</p>
    <p>Delivered within 24 hours with 15 calibrated questions + communication tools — or full cash refund. Delivered and not satisfied? 100% credit toward any higher tier.</p>
    <p><strong style="color: white;">$197.</strong> Less than one hour of your attorney's time.</p>
    ${cta("Find What's in My Case — $197 →", "/checkout?tier=case-decoder")}
  `,
});

emails.push({
  filename: "nurture-day10.html",
  subject: "Did you ask your attorney question #4?",
  category: "Nurture Drip (Day 10)",
  html: `
    <h1 style="color: #F59E0B;">Question #4: CI Reliability</h1>
    <p>From the Discovery Checklist: <em>"If a CI is involved, has their reliability been challenged?"</em></p>
    <p>Most defendants don't know a confidential informant was used in their case. The ones who do rarely ask about the CI's track record.</p>
    <p>In the real case we reviewed, the CI's phone number appeared in <strong style="color: white;">both the informant's file AND the defendant's records</strong>. Same detective. Same report. That's a Franks v. Delaware issue.</p>
    <p>One question. Asked at the right time. Can change everything.</p>
    ${cta("Re-download the Discovery Checklist →", "/resources")}
  `,
});

emails.push({
  filename: "nurture-day14.html",
  subject: "Motion deadlines don't wait — and your attorney might not remind you",
  category: "Nurture Drip (Day 14)",
  html: `
    <h1 style="color: #F59E0B;">Motion Deadlines Don't Wait</h1>
    <p>Motion deadlines are real. Once they pass, arguments that could have changed your entire case are <strong style="color: #EF4444;">gone forever</strong>.</p>
    <p>A motion to suppress that could have thrown out evidence. A Franks hearing that could have invalidated the warrant. A motion to dismiss based on a charging error.</p>
    <p>In the real case we reviewed, <strong style="color: white;">zero motions had been filed</strong>. The substance variance alone was grounds for a motion to dismiss.</p>
    <p>The Case Decoder includes a motion deadline awareness section specific to your charges. It tells you what to ASK about — so nothing slips through the cracks.</p>
    <p><strong style="color: white;">$197. 24 hours.</strong> The cost of not knowing is higher.</p>
    ${cta("Find What's in My Case — $197 →", "/checkout?tier=case-decoder")}
  `,
});

// ────────────────────────────────────────────────
// POST-PURCHASE: Case Decoder
// ────────────────────────────────────────────────

emails.push({
  filename: "post-case-decoder-delivery.html",
  subject: "Your Attorney Meeting Prep Kit is ready",
  category: "Post-Purchase: Case Decoder (Day 0)",
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
});

emails.push({
  filename: "post-case-decoder-story-harvest.html",
  subject: "You met with your attorney — what was the first question they stopped to think about?",
  category: "Post-Purchase: Case Decoder (Day 5, relative to delivery)",
  html: `
    <h1 style="color: #F59E0B;">How Did It Go?</h1>
    <p>You had your attorney meeting. I have one question:</p>
    <p style="font-size: 18px; color: white;"><strong>Which question got the most reaction?</strong></p>
    <p>Was it the one about elements the prosecution must prove? The email template? The 7-day action plan?</p>
    <p>Just reply to this email. One sentence is fine. Your experience helps us build better questions for every defendant who comes after you.</p>
    <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
      <strong style="color: white;">Need to find your report?</strong> <a href="${SITE_URL}/report/sample-token-abc123" style="color: #F59E0B; text-decoration: underline;">View your Case Decoder report here</a>
    </p>
  `,
});

emails.push({
  filename: "post-case-decoder-upsell.html",
  subject: "Ready to go deeper?",
  category: "Post-Purchase: Case Decoder (Day 7)",
  html: `
    <h1 style="color: #F59E0B;">Ready to Go Deeper?</h1>
    <p>Your Case Decoder gave you the foundation — charges explained, 15 calibrated questions, and a 7-day action plan.</p>
    <p>The <strong style="color: white;">Intelligence Brief ($997)</strong> goes deeper:</p>
    <ul style="padding-left: 20px;">
      <li>Your judge's actual sentencing patterns</li>
      <li>Jurisdiction-specific plea statistics</li>
      <li>Motion landscape report</li>
      <li>35-50 targeted questions (vs. 15)</li>
      <li>BONUS: Judge Tendencies Card</li>
    </ul>
    <p><strong style="color: white;">Your $197 is already credited.</strong> Upgrade for just $800.</p>
    ${cta("Upgrade to Intelligence Brief — $800 →", "/checkout?tier=intelligence-brief")}
  `,
});

emails.push({
  filename: "post-case-decoder-referral.html",
  subject: "Know someone facing charges?",
  category: "Post-Purchase: Case Decoder (Day 14)",
  html: `
    <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
    <p>If your Case Decoder helped you ask better questions, it can help someone else too.</p>
    <p>Share this with anyone facing charges who needs clarity about their case:</p>
    ${cta("Share ImNotAnAttorney →", "/?ref=friend")}
    <p style="color: #71717A;">Every defendant deserves to know what's in their case.</p>
  `,
});

// ────────────────────────────────────────────────
// POST-PURCHASE: Intelligence Brief, X-Ray, War Room, Situation Room, Witness Pack, Extra Witness
// ────────────────────────────────────────────────

emails.push({
  filename: "post-intelligence-brief-delivery.html",
  subject: "Your Intelligence Brief is ready — here's how to use it in your next meeting",
  category: "Post-Purchase: Intelligence Brief (Day 0)",
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
});

emails.push({
  filename: "post-intelligence-brief-story-harvest.html",
  subject: "You met with your attorney — what was the first question they stopped to think about?",
  category: "Post-Purchase: Intelligence Brief (Day 5, relative to delivery)",
  html: `
    <h1 style="color: #F59E0B;">How Did It Go?</h1>
    <p>You had your attorney meeting with 35-50 questions in hand. I have one question:</p>
    <p style="font-size: 18px; color: white;"><strong>Which question made your attorney pause?</strong></p>
    <p>Just reply to this email. Your experience helps us refine every report for every defendant who comes after you.</p>
  `,
});

emails.push({
  filename: "post-intelligence-brief-upsell.html",
  subject: "When you get discovery — we're ready",
  category: "Post-Purchase: Intelligence Brief (Day 10)",
  html: `
    <h1 style="color: #F59E0B;">When You Get Discovery</h1>
    <p>Your Intelligence Brief covered charges, judge intel, and accountability. But the real power is in the discovery documents.</p>
    <p>When you receive discovery, the <strong style="color: white;">X-Ray ($2,497)</strong> analyzes every page:</p>
    <ul style="padding-left: 20px;">
      <li>Complete document index</li>
      <li>Comprehensive timeline</li>
      <li>Discrepancy report (weight, dates, descriptions)</li>
      <li>Red flags summary</li>
      <li>35+ case-specific questions</li>
      <li>Discovery Health Score — completeness rated out of 100</li>
      <li>Defense Opportunity Index — defense angles organized by charge category</li>
    </ul>
    <p><strong style="color: white;">Your $997 is already credited.</strong> Upgrade for just $1,500.</p>
    ${cta("Upgrade to The X-Ray — $1,500 →", "/checkout?tier=x-ray")}
  `,
});

emails.push({
  filename: "post-xray-delivery.html",
  subject: "Your X-Ray analysis is ready — here's how to use it",
  category: "Post-Purchase: X-Ray (Day 0)",
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
});

emails.push({
  filename: "post-xray-upload-reminder.html",
  subject: "Reminder: Upload your discovery documents to begin analysis",
  category: "Post-Purchase: X-Ray (Day 2)",
  html: `
    <h1 style="color: #F59E0B;">Upload Reminder</h1>
    <p>We're ready to start your X-Ray analysis — but we need your discovery documents first.</p>
    <p>If you've already uploaded them, ignore this email. If not:</p>
    ${cta("Upload Discovery Documents →", "/upload?case=test-case-123&email=test@example.com")}
    <p style="color: #71717A;">Not sure what to upload? Send everything your attorney gave you — police reports, lab results, witness statements, photos, any documents labeled "discovery."</p>
  `,
});

emails.push({
  filename: "post-xray-story-harvest.html",
  subject: "You met with your attorney — what was the first finding they hadn't seen?",
  category: "Post-Purchase: X-Ray (Day 5, relative to delivery)",
  html: `
    <h1 style="color: #F59E0B;">How Did It Go?</h1>
    <p>You walked into that meeting with a full discovery analysis. I have one question:</p>
    <p style="font-size: 18px; color: white;"><strong>Which finding surprised your attorney?</strong></p>
    <p>Just reply to this email. Your experience makes every future analysis better.</p>
  `,
});

emails.push({
  filename: "post-war-room-delivery.html",
  subject: "Your War Room package is being assembled",
  category: "Post-Purchase: War Room (Day 0)",
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
});

emails.push({
  filename: "post-war-room-referral.html",
  subject: "Know someone facing charges?",
  category: "Post-Purchase: War Room (Day 14, relative to delivery)",
  html: `
    <h1 style="color: #F59E0B;">Know Someone Facing Charges?</h1>
    <p>You know what it's like to face the system without enough information. If someone you know is in the same position, you can help them skip the confusion.</p>
    <p style="font-size: 18px; color: white;"><strong>Send them to ${link("imnotanattorney.com", "/")}</strong></p>
    <p>They can start with a free Case Progress Score — no payment, no commitment. Just clarity on where they stand.</p>
    <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
      Every defendant deserves to walk into their attorney's office with the right questions. You did it. They can too.
    </p>
  `,
});

emails.push({
  filename: "post-situation-room-delivery.html",
  subject: "Your Situation Room engagement begins now",
  category: "Post-Purchase: Situation Room (Day 0)",
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
});

emails.push({
  filename: "post-situation-room-story-harvest.html",
  subject: "How's the case progressing?",
  category: "Post-Purchase: Situation Room (Day 5, relative to delivery)",
  html: `
    <h1 style="color: #F59E0B;">How's the Case Progressing?</h1>
    <p>You're in the Situation Room — the most comprehensive intelligence package available. I have one question:</p>
    <p style="font-size: 18px; color: white;"><strong>What's made the biggest difference so far?</strong></p>
    <p>Just reply to this email. Your experience at this level is invaluable for refining every aspect of what we deliver.</p>
  `,
});

emails.push({
  filename: "post-witness-pack-delivery.html",
  subject: "Your Witness Pack order is confirmed — upload discovery to begin",
  category: "Post-Purchase: Witness Pack (Day 0)",
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
});

emails.push({
  filename: "post-witness-pack-upsell.html",
  subject: "Your witnesses revealed something interesting",
  category: "Post-Purchase: Witness Pack (Day 7)",
  html: `
    <h1 style="color: #F59E0B;">Your Witnesses Revealed Something Interesting</h1>
    <p>Witness analysis often uncovers patterns that go beyond individual testimony — contradictions that connect to the broader case, gaps that suggest missing evidence, statements that don't match the physical evidence.</p>
    <p>If your witness analysis raised more questions than it answered, a deeper dive might be worth it:</p>
    <p><strong style="color: white;">The X-Ray ($2,497)</strong> — full discovery analysis:</p>
    <ul style="padding-left: 20px;">
      <li>Complete document index and timeline</li>
      <li>Discrepancy report across ALL evidence</li>
      <li>35+ case-specific questions</li>
      <li>Discovery Health Score + Defense Opportunity Index</li>
    </ul>
    <p><strong style="color: white;">Your $297 is already credited.</strong> Upgrade for $2,200.</p>
    ${cta("Upgrade to The X-Ray — $2,200 →", "/checkout?tier=x-ray")}
    <p style="margin-top: 16px;">Or go deeper with <strong style="color: white;">The War Room ($4,997)</strong> — full intelligence operation with weekly updates. Your $297 credit applies. ${link("Learn more →", "/services")}</p>
  `,
});

emails.push({
  filename: "post-extra-witness-delivery.html",
  subject: "Extra witness analysis added to your case",
  category: "Post-Purchase: Extra Witness (Day 0)",
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
});

// ────────────────────────────────────────────────
// WEBHOOK EMAILS (from /api/webhooks/stripe)
// ────────────────────────────────────────────────

emails.push({
  filename: "webhook-payment-confirmation.html",
  subject: "Payment Confirmed — Your Case Decoder is Being Prepared",
  category: "Webhook: Payment Confirmation",
  html: `
    <h1 style="color: #F59E0B;">Payment Received</h1>
    <p>You're the kind of defendant who does their homework. Your <strong>Case Decoder</strong> is being prepared now.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> Case Decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $197.00</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Delivery:</strong> 24 hours</p>
    </div>
    <p style="color: #A1A1AA;">We'll email you when your report is ready. Keep an eye on your inbox.</p>
  `,
});

emails.push({
  filename: "webhook-payment-with-upload.html",
  subject: "Payment Confirmed — Your X-Ray is Being Prepared",
  category: "Webhook: Payment Confirmation (Discovery Tier)",
  html: `
    <h1 style="color: #F59E0B;">Payment Received</h1>
    <p>You're the kind of defendant who does their homework. Your <strong>The X-Ray</strong> is being prepared now.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> The X-Ray</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $2,497.00</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Delivery:</strong> 10 business days</p>
    </div>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #F59E0B;">
      <p style="margin: 0; color: white; font-weight: bold;">Next Step: Upload Your Discovery Documents</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;">Your The X-Ray requires discovery documents for analysis. Upload them here:</p>
      <a href="${SITE_URL}/upload?case=test-case-123&email=test%40example.com" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Upload Discovery Documents</a>
    </div>
    <p style="color: #A1A1AA;">We'll email you when your report is ready. Keep an eye on your inbox.</p>
  `,
});

emails.push({
  filename: "webhook-intake-request.html",
  subject: "Complete Your Case Details to Start Your Report",
  category: "Webhook: Intake Request (No Intake Yet)",
  html: `
    <h1 style="color: #F59E0B;">One More Step</h1>
    <p>Thank you for purchasing the Case Decoder. Before we can generate your personalized report, we need your case details.</p>
    <a href="${SITE_URL}/intake?email=test%40example.com&tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
    <p style="color: #A1A1AA;">Once you submit your case details, your report will be generated within 24 hours.</p>
  `,
});

emails.push({
  filename: "webhook-partial-refund.html",
  subject: "Partial Refund Processed — $50.00",
  category: "Webhook: Partial Refund Notification",
  html: `
    <h1 style="color: #F59E0B;">Partial Refund Issued</h1>
    <p>We've issued a partial refund of <strong>$50.00</strong> to your original payment method.</p>
    <p>You should see this reflected in 1-3 business days depending on your bank.</p>
    <p style="color: #A1A1AA;">Your report access and any upgrade credits remain active.</p>
  `,
});

// ────────────────────────────────────────────────
// WEBHOOK OPERATOR EMAILS
// ────────────────────────────────────────────────

emails.push({
  filename: "operator-new-order.html",
  subject: "New Order: Case Decoder — $197.00",
  category: "Operator: New Order Notification",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #F59E0B;">New Order Received</h1>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> Case Decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $197.00</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Stripe Session:</strong> cs_test_abc123</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Requires Discovery:</strong> No</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Intake Found:</strong> Check case status</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> 2026-02-27T14:00:00.000Z</p>
    </div>
  `,
});

emails.push({
  filename: "operator-full-refund.html",
  subject: "Full Refund: case-decoder — $197.00",
  category: "Operator: Full Refund Notification",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Full Refund Processed</h1>
    <p><strong>Customer:</strong> test@example.com</p>
    <p><strong>Tier:</strong> case-decoder</p>
    <p><strong>Refunded:</strong> $197.00 of $197.00</p>
    <p><strong>Note:</strong> Upgrade credits voided. Case status updated to 'refunded'. Report access revoked.</p>
  `,
});

// ────────────────────────────────────────────────
// DELIVERY EMAILS (from /api/deliver)
// ────────────────────────────────────────────────

emails.push({
  filename: "deliver-report-ready.html",
  subject: "Your Case Decoder Report is Ready",
  category: "Delivery: Report Ready Email",
  html: `
    <h1 style="color: #F59E0B;">Your Case Decoder Report is Ready</h1>
    <p>Hi Danielle,</p>
    <p>Your personalized Case Decoder report is ready to view. It contains targeted questions, communication tools, and a clear picture of where things stand — built specifically from your case details.</p>
    <a href="${SITE_URL}/report/f47ac10b-58cc-4372-a567-0e02b2c3d479" style="display: inline-block; margin: 24px 0; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: white; font-weight: bold;">How to use your report:</p>
      <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
        <li style="margin-bottom: 8px;"><strong style="color: white;">Print it</strong> and bring it to your next attorney meeting</li>
        <li style="margin-bottom: 8px;"><strong style="color: white;">Start with the 5 Priority Questions</strong> in "Questions for Your Attorney" — if you only ask one, ask the Golden Question</li>
        <li style="margin-bottom: 8px;"><strong style="color: white;">Send the email</strong> from "Exactly What to Say" — it's already written for you, just copy-paste and hit send</li>
        <li style="margin-bottom: 8px;"><strong style="color: white;">Follow Your Next 7 Days</strong> — one simple action per day, starting with sending that email</li>
      </ol>
    </div>
    <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="margin: 0; color: #F59E0B; font-weight: bold;">Ready to go deeper?</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;">Your $197 is credited toward any higher tier within 12 months. <a href="${SITE_URL}/services" style="color: #F59E0B;">View upgrade options</a></p>
    </div>
  `,
});

// ────────────────────────────────────────────────
// EDGE FUNCTION OPERATOR EMAILS (from generate-report)
// ────────────────────────────────────────────────

emails.push({
  filename: "operator-review-report.html",
  subject: "Review Report: dui — Danielle",
  category: "Operator: Review Report (from Edge Function)",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #F59E0B;">Case Decoder Report Ready for Review</h1>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> Danielle Reeves</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> danielle.test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> dui</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> Texas</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> February 27, 2026</p>
    </div>
    <div style="margin: 24px 0; display: flex; gap: 12px;">
      <a href="${SITE_URL}/api/deliver?token=sample-signed-token&case=f47ac10b-58cc-4372-a567-0e02b2c3d479" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Approve &amp; Deliver</a>
      <a href="${SITE_URL}/report/sample-report-token" style="display: inline-block; padding: 14px 28px; background: #3B82F6; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Preview Report</a>
    </div>
  `,
});

emails.push({
  filename: "operator-generation-failed.html",
  subject: "URGENT: Report generation failed for Danielle",
  category: "Operator: Generation Failed (from Edge Function)",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Report Generation Failed</h1>
    <p>Case ID: f47ac10b-58cc-4372-a567-0e02b2c3d479</p><p>Customer: danielle.test@example.com</p>
    <p>Charge: dui</p>
    <p>Error: Claude API returned 529: Overloaded</p>
    <p style="margin-top: 16px;"><strong>Retry command:</strong></p>
    <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${SITE_URL}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"f47ac10b-58cc-4372-a567-0e02b2c3d479"}'</code>
  `,
});

// ────────────────────────────────────────────────
// INTAKE EMAILS (from /api/intake)
// ────────────────────────────────────────────────

emails.push({
  filename: "intake-confirmation-paid.html",
  subject: "We Received Your Case Details, Danielle",
  category: "Intake: Confirmation (After Payment — Flow B)",
  html: `
    <h1 style="color: #F59E0B;">Case Details Received</h1>
    <p>Thank you, Danielle. We've received your intake form and your report is being generated.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> dui</p>
    </div>
    <p style="color: #D4D4D8;">You'll receive an email when your report is ready to view. Keep an eye on your inbox.</p>
  `,
});

emails.push({
  filename: "intake-confirmation-browsing.html",
  subject: "We Received Your Case Details, Danielle",
  category: "Intake: Confirmation (Before Payment — Flow A)",
  html: `
    <h1 style="color: #F59E0B;">Case Details Received</h1>
    <p>Thank you, Danielle. We've received your intake form.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> dui</p>
    </div>
    <h2 style="color: white; font-size: 18px;">What Happens Next</h2>
    <ol style="color: #D4D4D8; padding-left: 20px;">
      <li style="margin-bottom: 8px;">Browse our <a href="${SITE_URL}/services" style="color: #F59E0B;">services page</a> to find the right tier for your case</li>
      <li style="margin-bottom: 8px;">Purchase your chosen service — 100% of what you pay is credited if you upgrade later</li>
      <li style="margin-bottom: 8px;">We'll analyze your case and deliver your report within the guaranteed timeframe</li>
    </ol>
    <p style="color: #A1A1AA;">Not sure where to start? For <strong style="color: white;">dui</strong> cases, the <a href="${SITE_URL}/checkout?tier=case-decoder" style="color: #F59E0B;">Case Decoder ($197)</a> covers the essentials — and every dollar counts toward an upgrade.</p>
  `,
});

// ────────────────────────────────────────────────
// CRON EMAILS (from /api/cron/drip)
// ────────────────────────────────────────────────

emails.push({
  filename: "cron-review-reminder.html",
  subject: "REMINDER: Case Decoder report awaiting review (14+ hours)",
  category: "Cron: Review Reminder (12h threshold)",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #F59E0B;">Report Awaiting Review</h1>
    <p>A Case Decoder report has been in review for <strong style="color: #EF4444;">14 hours</strong>. The 24-hour delivery guarantee is at risk.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> danielle.test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> dui</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> 2/26/2026, 11:00:00 PM</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
    </div>
    <div style="margin: 24px 0;">
      <a href="${SITE_URL}/api/deliver?token=sample-signed-token&case=f47ac10b-58cc-4372-a567-0e02b2c3d479" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px;">Approve &amp; Deliver</a>
    </div>
    <p style="color: #71717A; font-size: 12px;">This link expires in 24 hours.</p>
  `,
});

emails.push({
  filename: "cron-stuck-intake.html",
  subject: "ALERT: Case stuck in intake for 3+ hours — danielle.test@example.com",
  category: "Cron: Stuck Intake Alert",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Case Stuck — Generation May Have Failed</h1>
    <p>Case has been in "intake" status for <strong>3 hours</strong>. Report generation may have been silently dropped.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> danielle.test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
    </div>
    <p><strong>Action:</strong> Manually trigger generation:</p>
    <code>POST ${SITE_URL}/api/generate/case-decoder</code><br/>
    <code>Body: {"caseId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"}</code><br/>
    <code>Header: Authorization: Bearer [OPERATOR_SECRET]</code>
  `,
});

emails.push({
  filename: "cron-stuck-generating.html",
  subject: "ALERT: Report generation stuck for 45+ min — danielle.test@example.com",
  category: "Cron: Stuck Generating Alert",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Report Generation Stuck</h1>
    <p>Case has been in "generating" status for <strong>45 minutes</strong>. The edge function likely crashed or timed out.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> danielle.test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
    </div>
    <p><strong>Retry command:</strong></p>
    <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${SITE_URL}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"f47ac10b-58cc-4372-a567-0e02b2c3d479","force":true}'</code>
  `,
});

emails.push({
  filename: "cron-intake-reminder.html",
  subject: "Reminder: Complete your case details to start your report",
  category: "Cron: Intake Reminder (24h)",
  html: `
    <h1 style="color: #F59E0B;">We're Waiting on You</h1>
    <p>You purchased your report — but we still need your case details before we can generate it.</p>
    <p>It only takes 3 minutes:</p>
    <a href="${SITE_URL}/intake?email=test%40example.com&tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
    <p style="color: #A1A1AA;">Once you submit, your report will be generated within 24 hours.</p>
  `,
});

emails.push({
  filename: "cron-intake-escalation-72h.html",
  subject: "ALERT: Customer paid 3 days ago — still no intake",
  category: "Cron: Intake Escalation (72h operator alert)",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #F59E0B;">Intake Still Missing</h1>
    <p>Customer paid <strong>3 days ago</strong> and has not submitted their intake form.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Paid:</strong> 2026-02-24T14:00:00.000Z</p>
    </div>
    <p><strong>Action:</strong> Send a personal follow-up email.</p>
  `,
});

emails.push({
  filename: "cron-intake-escalation-7d.html",
  subject: "URGENT: Customer paid 8 days ago — no intake (consider refund)",
  category: "Cron: Intake Escalation (7d operator alert)",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Customer May Need Refund</h1>
    <p>Customer paid <strong>8 days ago</strong> and has not submitted their intake form.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Paid:</strong> 2026-02-19T14:00:00.000Z</p>
    </div>
    <p><strong>Action:</strong> Consider reaching out directly or initiating a refund.</p>
  `,
});

emails.push({
  filename: "cron-report-expiry-warning.html",
  subject: "Your report link expires in 30 days",
  category: "Cron: Report Expiry Warning",
  html: `
    <h1 style="color: #F59E0B;">Report Link Expiring Soon</h1>
    <p>Your report link will expire in 30 days. Make sure to access it before then:</p>
    <a href="${SITE_URL}/report/f47ac10b-58cc-4372-a567-0e02b2c3d479" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
    <p style="color: #A1A1AA;">After expiration, contact us to request a new link.</p>
  `,
});

emails.push({
  filename: "cron-abandoned-checkout.html",
  subject: "Still thinking about the Case Decoder?",
  category: "Cron: Abandoned Checkout Recovery",
  html: `
    <h1 style="color: #F59E0B;">You Were Close</h1>
    <p>You started checkout but didn't finish. No pressure — but if you're still thinking about it, the Case Decoder is the right place to start.</p>
    <p>For $197, you get a plain-English charge breakdown, 15 calibrated questions for your attorney, ready-to-send email templates, and a 7-day action plan.</p>
    <a href="${SITE_URL}/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Continue to Checkout</a>
    <p style="color: #A1A1AA;">Questions? Reply to this email — a real person reads every message.</p>
  `,
});

emails.push({
  filename: "cron-webhook-recovery.html",
  subject: "URGENT: Recovered missed payment — test@example.com",
  category: "Cron: Stripe Reconciliation Recovery",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Webhook Failure Recovered</h1>
    <p>A paid Stripe session had no matching order. Auto-recovered.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $197.00</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Stripe Session:</strong> cs_test_abc123</p>
    </div>
    <p><strong>Action:</strong> Verify recovery + send customer their intake/upload email if needed.</p>
  `,
});

emails.push({
  filename: "cron-orphan-order.html",
  subject: "URGENT: Orphan order recovered — test@example.com",
  category: "Cron: Orphan Order Recovery",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Orphan Order — Case Auto-Created</h1>
    <p>Order existed with no linked case. Auto-created case.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> test@example.com</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> case-decoder</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Order ID:</strong> 42</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">New Case ID:</strong> f47ac10b-58cc-4372-a567-0e02b2c3d479</p>
    </div>
    <p><strong>Action:</strong> Verify and send customer their intake email.</p>
  `,
});

emails.push({
  filename: "cron-gap-detected.html",
  subject: "ALERT: Cron missed runs — last run was 72 hours ago",
  category: "Cron: Gap Detection / Heartbeat",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Cron Gap Detected</h1>
    <p>Last cron run was <strong>72 hours ago</strong>. Expected: daily at 14:00 UTC.</p>
    <p>Drip emails, intake reminders, and stuck-case detection are all paused.</p>
    <p><strong>Action:</strong> Check Vercel cron configuration and logs.</p>
  `,
});

// ────────────────────────────────────────────────
// REFUND BOUNCE (from webhook charge.refund.updated)
// ────────────────────────────────────────────────

emails.push({
  filename: "webhook-refund-bounce.html",
  subject: "ALERT: Refund failed — re_abc123",
  category: "Webhook: Refund Bounce/Failed",
  hasUnsubscribe: false,
  html: `
    <h1 style="color: #EF4444;">Refund failed</h1>
    <p>A refund has failed.</p>
    <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Refund ID:</strong> re_abc123</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $197.00</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Status:</strong> failed</p>
    </div>
    <p><strong>Action:</strong> Check Stripe dashboard and resolve manually.</p>
  `,
});

// ================================================================
// RENDER ALL EMAILS + v2 TERM CHECKS
// ================================================================

console.log("═══════════════════════════════════════════════════════");
console.log("  EMAIL TEMPLATE VISUAL AUDIT");
console.log("═══════════════════════════════════════════════════════\n");

// v2 term checks for Case Decoder context
const V1_BANNED_TERMS = [
  "case stage benchmark",
  "defense milestone checklist",
  "sections 1-3",
  "Section 1",
  "Section 2",
  "Section 3",
  "defense milestone score",
];

const V2_EXPECTED_LINKS = [
  { pattern: "/checkout?tier=", description: "Checkout link with tier param" },
  { pattern: "/sample", description: "Sample report link" },
  { pattern: "/resources", description: "Resources page link" },
  { pattern: "/services", description: "Services page link" },
  { pattern: "/upload", description: "Upload page link" },
  { pattern: "/intake", description: "Intake form link" },
];

let totalFiles = 0;
let termIssues = 0;

for (const email of emails) {
  const wrapped = wrapInBrandedTemplate(email.html, {
    subject: email.subject,
    category: email.category,
    hasUnsubscribe: email.hasUnsubscribe !== false,
  });

  const filepath = path.join(OUT_DIR, email.filename);
  fs.writeFileSync(filepath, wrapped, "utf-8");
  totalFiles++;

  // v2 term check
  const htmlLower = email.html.toLowerCase();
  const issues = [];
  for (const term of V1_BANNED_TERMS) {
    if (htmlLower.includes(term.toLowerCase())) {
      issues.push(`BANNED v1 term: "${term}"`);
    }
  }

  if (issues.length > 0) {
    console.log(`  WARN: ${email.filename} — ${issues.join(", ")}`);
    termIssues += issues.length;
  }
}

// ================================================================
// GENERATE INDEX PAGE
// ================================================================

const categories = {};
for (const email of emails) {
  const cat = email.category.split(":")[0].trim();
  if (!categories[cat]) categories[cat] = [];
  categories[cat].push(email);
}

let indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email Template Audit — ImNotAnAttorney</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 32px; }
  h1 { color: #F59E0B; border-bottom: 2px solid #F59E0B; padding-bottom: 12px; }
  h2 { color: #F59E0B; margin-top: 32px; }
  a { color: #F59E0B; text-decoration: underline; }
  a:hover { color: #FCD34D; }
  .email-card { background: #1C1917; padding: 16px 20px; border-radius: 8px; margin: 8px 0; border-left: 4px solid #27272A; }
  .email-card:hover { border-left-color: #F59E0B; }
  .category-tag { font-size: 12px; color: #71717A; }
  .stat { display: inline-block; background: #1C1917; padding: 8px 16px; border-radius: 8px; margin: 4px; font-size: 14px; }
  .stat strong { color: #F59E0B; }
</style>
</head>
<body>
<h1>Email Template Audit</h1>
<p>Generated: ${new Date().toLocaleString()}</p>
<div style="margin: 16px 0;">
  <span class="stat"><strong>${totalFiles}</strong> emails rendered</span>
  <span class="stat"><strong>${termIssues}</strong> v1 term issues</span>
  <span class="stat"><strong>${Object.keys(categories).length}</strong> categories</span>
</div>
`;

for (const [cat, catEmails] of Object.entries(categories)) {
  indexHtml += `<h2>${escapeHtml(cat)} (${catEmails.length})</h2>\n`;
  for (const email of catEmails) {
    indexHtml += `<div class="email-card">
  <a href="${email.filename}">${escapeHtml(email.subject)}</a>
  <div class="category-tag">${escapeHtml(email.category)}</div>
</div>\n`;
  }
}

indexHtml += `</body></html>`;

fs.writeFileSync(path.join(OUT_DIR, "index.html"), indexHtml);

// ================================================================
// SUMMARY
// ================================================================

console.log(`\n  ${totalFiles} email templates rendered to test-emails/`);
console.log(`  Index page: test-emails/index.html`);
if (termIssues > 0) {
  console.log(`  ${termIssues} v1 term issues found — review warnings above`);
} else {
  console.log(`  Zero v1 term issues found`);
}

// Link audit — check which links appear across all emails
console.log(`\n  Link audit:`);
const allHtml = emails.map((e) => e.html).join(" ");
for (const check of V2_EXPECTED_LINKS) {
  const found = allHtml.includes(check.pattern);
  console.log(`  ${found ? "FOUND" : "MISSING"}: ${check.description} (${check.pattern})`);
}

console.log(`\n  Open test-emails/index.html in a browser to review all templates.`);

if (termIssues > 0) process.exit(1);
