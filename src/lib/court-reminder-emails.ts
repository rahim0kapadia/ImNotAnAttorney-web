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

export function reminder14d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  const chargeName = CHARGE_DISPLAY_NAMES[ctx.chargeType] || "your hearing";
  return {
    subject: `Your court date is in 2 weeks, ${ctx.countyState}`,
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
    subject: `1 week until your court date, ${ctx.countyState}`,
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
    subject: `Tomorrow: ${ctx.countyState} Court`,
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
