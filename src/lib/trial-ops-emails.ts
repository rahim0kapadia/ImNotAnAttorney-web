/**
 * @fileoverview Trial Intelligence Operations email templates.
 *
 * These are operator-triggered emails sent during an active Situation Room
 * trial engagement — NOT scheduled drip emails. The operator (or future
 * automation) calls these template functions to generate email HTML for
 * the daily trial cycle:
 *
 *   Evening: trialInputSolicitation() → defendant reports what happened
 *   Evening: eveningDebriefDelivery() → delivers the evening debrief analysis
 *   Morning: morningBriefDelivery() → delivers morning brief + cheat sheet
 *
 * All templates use the same branded HTML as other INNA emails (dark theme,
 * amber accent, CAN-SPAM compliant via sendEmail wrapper).
 *
 * Usage:
 *   import { trialInputSolicitation } from "@/lib/trial-ops-emails";
 *   import { sendEmail } from "@/lib/email";
 *   await sendEmail({
 *     to: customerEmail,
 *     subject: trialInputSolicitation.subject(dayNumber, date),
 *     html: trialInputSolicitation.html({ firstName, dayNumber, ... }),
 *   });
 */

import { escapeHtml } from "@/lib/email";

// ============================================================
// TRIAL INPUT SOLICITATION
// Sent each evening after court adjourns. Asks the defendant
// (or family member) to report what happened today.
// ============================================================

export const trialInputSolicitation = {
  subject: (dayNumber: number, date: string) =>
    `Trial Day ${dayNumber} — Tell us what happened today (${date})`,

  html: (vars: {
    firstName: string;
    dayNumber: number;
    todayDate: string;
    expectedWitnesses?: string;
  }) => {
    const { firstName, dayNumber, todayDate, expectedWitnesses } = vars;
    return `
      <h1 style="color: #F59E0B;">Trial Day ${dayNumber} — What Happened Today?</h1>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Court is done for the day. Take a few minutes to tell us what happened — your evening debrief depends on your report.</p>

      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: white;"><strong>Reply to this email with:</strong></p>
        <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
          <li><strong style="color: white;">Who testified today?</strong> Names and roles (officer, witness, expert, etc.)</li>
          <li><strong style="color: white;">What did they say?</strong> The parts that stood out — key statements, surprises, anything that felt important</li>
          <li><strong style="color: white;">What did the judge do?</strong> Any rulings, instructions to the jury, or comments from the bench</li>
          <li><strong style="color: white;">How did your attorney's cross-examination go?</strong> Did it feel effective? Any moments that stood out?</li>
          <li><strong style="color: white;">Jury observations:</strong> Did any jurors seem particularly engaged, skeptical, or sympathetic during specific testimony?</li>
          <li><strong style="color: white;">Anything surprising?</strong> Anything you didn't expect to happen today</li>
          <li><strong style="color: white;">How are you feeling?</strong> One sentence is fine</li>
        </ol>
      </div>

      ${expectedWitnesses ? `<p style="color: #A1A1AA;">Today's expected witnesses were: ${escapeHtml(expectedWitnesses)}. Let us know if different witnesses appeared or the schedule changed.</p>` : ""}

      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #22C55E; background: #1C1917;">
        <strong style="color: #22C55E;">Your evening debrief will be ready within 3 hours of your reply.</strong>
        Your morning brief for Day ${dayNumber + 1} will arrive by 7 AM.
      </p>

      <p style="color: #71717A; font-size: 13px;">Don't worry about getting every detail right. Your impressions and observations are valuable — we combine them with our case research to give you the full picture.</p>
    `;
  },
};

// ============================================================
// EVENING DEBRIEF DELIVERY
// Delivers the evening debrief analysis after the operator
// generates it from the defendant's daily report.
// ============================================================

export const eveningDebriefDelivery = {
  subject: (dayNumber: number, date: string) =>
    `Evening Debrief — Trial Day ${dayNumber} (${date})`,

  html: (vars: {
    firstName: string;
    dayNumber: number;
    todayDate: string;
    debriefHtml: string;
    nextDayWitnesses?: string;
  }) => {
    const { firstName, dayNumber, todayDate, debriefHtml, nextDayWitnesses } = vars;
    return `
      <h1 style="color: #F59E0B;">Evening Debrief — Trial Day ${dayNumber}</h1>
      <p style="color: #A1A1AA; margin-bottom: 24px;">${escapeHtml(todayDate)} | Case Intelligence for ${escapeHtml(firstName)}</p>

      <div style="margin: 24px 0;">
        ${debriefHtml}
      </div>

      ${nextDayWitnesses ? `
      <div style="background: #1C1917; padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0;"><strong style="color: white;">Tomorrow's expected witnesses:</strong></p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">${escapeHtml(nextDayWitnesses)}</p>
      </div>` : ""}

      <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #22C55E; background: #1C1917;">
        <strong style="color: #22C55E;">Your morning brief for Day ${dayNumber + 1} will arrive by 7:00 AM.</strong>
        It will include witness preparation, questions for your attorney, and your daily cheat sheet.
      </p>

      <p style="color: #71717A; font-size: 13px;">If you have additional details to add about today, reply to this email and we'll incorporate them into tomorrow's preparation.</p>
    `;
  },
};

// ============================================================
// MORNING BRIEF DELIVERY
// Delivers the morning brief + cheat sheet before court.
// ============================================================

export const morningBriefDelivery = {
  subject: (dayNumber: number, date: string) =>
    `Morning Brief — Trial Day ${dayNumber} (${date})`,

  html: (vars: {
    firstName: string;
    dayNumber: number;
    todayDate: string;
    briefHtml: string;
    cheatSheetHtml: string;
    courtTime: string;
  }) => {
    const { firstName, dayNumber, todayDate, briefHtml, cheatSheetHtml, courtTime } = vars;
    return `
      <h1 style="color: #F59E0B;">Morning Brief — Trial Day ${dayNumber}</h1>
      <p style="color: #A1A1AA; margin-bottom: 8px;">${escapeHtml(todayDate)} | ${escapeHtml(firstName)}</p>
      <p style="color: white; font-size: 16px; margin-bottom: 24px;"><strong>Court time: ${escapeHtml(courtTime)}</strong></p>

      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 0 0 32px 0; border: 2px solid #F59E0B;">
        <h2 style="color: #F59E0B; margin: 0 0 16px 0; font-size: 18px;">TODAY'S CHEAT SHEET</h2>
        <p style="color: #A1A1AA; margin: 0 0 16px 0; font-size: 13px;">Print this or keep it on your phone. 2-minute read.</p>
        ${cheatSheetHtml}
      </div>

      <h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">FULL MORNING BRIEF</h2>

      <div style="margin: 24px 0;">
        ${briefHtml}
      </div>

      <div style="margin-top: 32px; padding: 20px; background: #1C1917; border-radius: 12px; border-left: 4px solid #F59E0B;">
        <p style="margin: 0;"><strong style="color: white;">After court today:</strong></p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">Reply to the evening solicitation email with what happened today. Your evening debrief will be ready within 3 hours.</p>
      </div>

      <p style="color: #71717A; font-size: 13px; margin-top: 16px;">Questions before court? Reply to this email — priority response during trial.</p>
    `;
  },
};
