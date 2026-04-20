/**
 * @fileoverview Court reminder email templates.
 *
 * 5 emails: -14d, -7d, -3d, -1d, +1d post-court.
 * All return { subject: string; html: string } where html is INNER HTML.
 * sendEmail() wraps in branded dark template automatically.
 */

import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/email";
import { CHARGE_DISPLAY_NAMES, getPrepContent } from "@/lib/court-reminders";

const AMBER = "#F59E0B";
const ZINC = "#D4D4D8";
const btnStyle = `display: inline-block; background: ${AMBER}; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;`;
const pStyle = `color: ${ZINC}; font-size: 15px; line-height: 1.6; margin: 0 0 12px;`;

interface ReminderContext {
  firstName: string;
  chargeType: string;
  countyState: string;
  courtDate: string;
  token: string;
  partnerCompany?: string;
}

/**
 * Fallback for the "Unknown County" sentinel written by compact-mode signup
 * flows (see src/app/api/court-reminders/route.ts). Email subjects and bodies
 * should read naturally, not leak the placeholder string into customer inboxes.
 */
function displayCounty(countyState: string): string {
  return countyState && countyState !== "Unknown County" ? countyState : "your county";
}

/**
 * Subject-line safe string (A2). Strips angle brackets + entity-prone chars
 * that render literally in mail clients ("John &amp;" showing up as typed),
 * collapses whitespace, and caps length. Used for ANY user-supplied string
 * that lands in an email subject — names, counties, anything free-text.
 *
 * The HTML body still goes through escapeHtml(); this helper is the subject
 * counterpart since subjects are rendered as plain text.
 */
export function subjectSafe(value: string, max = 40): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|#39|#x27);/gi, (m) => {
      switch (m.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&#39;":
        case "&#x27;":
          return "'";
        default:
          return "";
      }
    })
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function prepUrl(token: string) {
  return `${SITE_URL}/prep/${token}`;
}

function unsubUrl(token: string) {
  return `${SITE_URL}/api/court-reminders/unsubscribe?token=${token}`;
}

function footer(token: string) {
  return `<p style="color: #71717A; font-size: 12px; margin-top: 32px; border-top: 1px solid #27272A; padding-top: 16px;">
    ImNotAnAttorney provides legal information, not legal advice.<br/>
    <a href="${unsubUrl(token)}" style="color: #71717A; text-decoration: underline;">Unsubscribe from reminders</a>
  </p>`;
}

function partnerBranding(company?: string) {
  if (!company) return "";
  return `<p style="color: #71717A; font-size: 13px; margin-top: 24px;">Provided by ${escapeHtml(company)}</p>`;
}

/**
 * Welcome reminder — fires immediately on /api/court-reminders enrollment.
 * Explains what the court date is, what to expect at a hearing of this
 * charge type, what to bring, what to wear, when to arrive, and the
 * upcoming automated reminder cadence. Replaces the prior thin "your prep
 * page is ready" confirmation.
 */
export function welcomeReminder(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  // Subject lines are rendered as PLAIN TEXT by mail clients — HTML entities
  // like `&amp;` would display literally. subjectSafe() strips entity-prone
  // chars and caps length. Keep escapeHtml()'d name for HTML body.
  const subjectName = subjectSafe(ctx.firstName);
  const chargeKnown = CHARGE_DISPLAY_NAMES[ctx.chargeType];
  const subjectTail = chargeKnown
    ? `your ${chargeKnown} court date`
    : "your court date";
  const content = getPrepContent(ctx.chargeType);
  const bringItems = content.whatToBring
    .map((b) => `<li style="color: ${ZINC}; margin: 4px 0;">${escapeHtml(b)}</li>`)
    .join("");
  // courtDate is ISO yyyy-mm-dd. Parsing with a bare "T00:00:00" tail uses the
  // server's local TZ — on Vercel that's UTC, so ET renders as the prior day
  // and the weekday in the subject is wrong. Anchor to UTC noon (safely inside
  // the same ET calendar day year-round, DST or not) and format with an
  // explicit America/New_York zone, matching the pattern in check-in-schedule.ts
  // and ComplianceReportClient.tsx.
  const courtDateHuman = new Date(ctx.courtDate + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return {
    subject: `${subjectName}, ${subjectTail} is ${courtDateHuman}`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">You're set up, ${safeName}.</h1>
      <p style="${pStyle}"><strong style="color:#fff;">Your court date:</strong> ${escapeHtml(courtDateHuman)} &mdash; ${escapeHtml(displayCounty(ctx.countyState))}.</p>
      <p style="${pStyle}"><strong style="color:#fff;">What this hearing is:</strong> ${escapeHtml(content.whatToExpect)}</p>
      <p style="${pStyle}"><strong style="color:#fff;">What to bring:</strong></p>
      <ul style="padding-left: 20px; margin: 0 0 16px;">${bringItems}</ul>
      <p style="${pStyle}"><strong style="color:#fff;">What to wear:</strong> ${escapeHtml(content.whatToWear)}</p>
      <p style="${pStyle}"><strong style="color:#fff;">When to arrive:</strong> ${escapeHtml(content.arrivalTips)}</p>
      <p style="${pStyle}"><strong style="color:#fff;">What's next:</strong> we'll message you automatically at 14, 7, 3, and 1 day before your hearing &mdash; and once the day after to check in. Your prep page below has the full detail and stays live through your case.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">View Your Full Prep Page</a></p>
      <p style="color: #71717A; font-size: 13px;">Bookmark this link &mdash; it's yours. Every reminder we send will include it.</p>
      ${partnerBranding(ctx.partnerCompany)}
      ${footer(ctx.token)}
    `,
  };
}

/**
 * Welcome SMS — single-segment companion to welcomeReminder email. Capped at
 * 160 chars by capSMS() at the call site. Keep this under ~145 chars raw so
 * the URL always fits.
 */
export function welcomeSmsBody(ctx: ReminderContext): string {
  // Cap firstName so a long name cannot push the prep URL past the 160-char
  // single-segment boundary. Template + ISO date + full URL ≈ 115 chars
  // without the name; 20 chars of name headroom keeps capSMS() from
  // truncating the URL and breaking the prep-page link.
  const shortName = ctx.firstName.slice(0, 20);
  return `${shortName}, court ${ctx.courtDate}. Prep: ${prepUrl(ctx.token)}. Reminders fire 14/7/3/1 days before.`;
}

export function reminder14d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  const chargeName = CHARGE_DISPLAY_NAMES[ctx.chargeType] || "your hearing";
  return {
    subject: `Your court date is in 2 weeks, ${subjectSafe(displayCounty(ctx.countyState))}`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">${safeName}, your court date is in 2 weeks.</h1>
      <p style="${pStyle}">We know this is stressful. Here's what helps: being prepared.</p>
      <p style="${pStyle}">Your prep page has everything you need, what to expect at a ${escapeHtml(chargeName)} hearing, what to bring, and how to show up ready.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">View Your Court Prep</a></p>
      ${partnerBranding(ctx.partnerCompany)}
      ${footer(ctx.token)}
    `,
  };
}

export function reminder7d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  return {
    subject: `1 week until your court date, ${subjectSafe(displayCounty(ctx.countyState))}`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">1 week, ${safeName}.</h1>
      <p style="${pStyle}">Your hearing is next week. Now's the time to prepare, review what to expect, plan what to bring, and make sure you know when and where to show up.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">Review Your Court Prep</a></p>
      ${partnerBranding(ctx.partnerCompany)}
      ${footer(ctx.token)}
    `,
  };
}

export function reminder3d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  const content = getPrepContent(ctx.chargeType);
  const items = content.whatToBring.map((b) => `<li style="color: ${ZINC}; margin: 4px 0;">${escapeHtml(b)}</li>`).join("");
  return {
    subject: `3 days, are you prepared?`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">3 days, ${safeName}.</h1>
      <p style="${pStyle}">Quick checklist:</p>
      <ul style="padding-left: 20px; margin: 0 0 16px;">${items}</ul>
      <p style="${pStyle}">${escapeHtml(content.whatToWear)}</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">Full Prep Page</a></p>
      ${partnerBranding(ctx.partnerCompany)}
      ${footer(ctx.token)}
    `,
  };
}

export function reminder1d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  return {
    subject: `Tomorrow: ${subjectSafe(displayCounty(ctx.countyState))} Court`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">Tomorrow, ${safeName}.</h1>
      <p style="${pStyle}">Arrive 30 minutes early. Bring your ID and any documents your attorney asked for. Dress like you take your case seriously.</p>
      <p style="${pStyle}">You've prepared. You're ready.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">Last-Minute Review</a></p>
      ${partnerBranding(ctx.partnerCompany)}
      ${footer(ctx.token)}
    `,
  };
}

export function postCourtEmail(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  return {
    subject: `How did it go?`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">${safeName}, how did your hearing go?</h1>
      <p style="${pStyle}">If your case is ongoing, staying prepared for what comes next makes a real difference.</p>
      <p style="${pStyle}">Your prep page is still available if you need it.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">View Your Prep Page</a></p>
      ${footer(ctx.token)}
    `,
  };
}
