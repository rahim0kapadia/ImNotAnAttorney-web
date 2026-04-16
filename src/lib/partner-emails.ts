/**
 * @fileoverview Partner lifecycle email templates.
 *
 * 8 template functions covering the full partner lifecycle:
 * - Day 0: Welcome (sent by apply route)
 * - Day 1: First share nudge
 * - Day 3: Commission math breakdown
 * - Day 7: Social proof / sharing scenarios
 * - Day 14: Check-in with stats
 * - Real-time: Sale notification (ka-ching)
 * - Real-time: Payout processed
 * - Real-time: Tier upgrade congratulations
 *
 * All functions return `{ subject: string; html: string }` where html is
 * INNER HTML only — `sendEmail()` from `@/lib/email` wraps in the branded
 * dark template automatically.
 *
 * Security: All user-supplied strings are escaped via `escapeHtml()`.
 * Dollar amounts are computed from cents with `(cents / 100).toFixed(2)`.
 */

import { TIER_CORE } from "@/lib/tiers";
import { COMMISSION_TIERS_CONFIG } from "@/lib/partner-data";
import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/email";

// ── Shared Styles ────────────────────────────────────────────
const AMBER = "#F59E0B";
const ZINC = "#D4D4D8";
const GREEN = "#22C55E";

const btnStyle = `display: inline-block; background: ${AMBER}; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;`;
const h1Style = `color: ${AMBER}; font-size: 28px; margin: 0 0 16px;`;
const h2Style = `color: ${AMBER}; font-size: 20px; margin: 24px 0 12px;`;
const pStyle = `color: ${ZINC}; font-size: 15px; line-height: 1.6; margin: 0 0 12px;`;
const moneyStyle = `color: ${GREEN}; font-weight: 700;`;
const codeStyle = `display: inline-block; background: #1C1917; border: 2px dashed ${AMBER}; padding: 12px 24px; font-size: 24px; font-weight: 800; letter-spacing: 3px; color: ${AMBER}; border-radius: 8px;`;
const copyBoxStyle = `background: #1C1917; border: 1px solid #27272A; border-radius: 8px; padding: 16px; margin: 12px 0; color: ${ZINC}; font-size: 14px; line-height: 1.5;`;

const dashboardUrl = `${SITE_URL}/partner/dashboard`;

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function dollarsWhole(cents: number): string {
  const val = cents / 100;
  return val >= 1000
    ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `$${val.toFixed(0)}`;
}

// ============================================================
// 1. WELCOME — Day 0 (sent by apply route)
// ============================================================

export function partnerWelcomeEmail(
  name: string,
  promoCode: string,
  magicLinkUrl: string
): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(promoCode);

  return {
    subject: "Welcome to the Partner Program — Your Promo Code is Ready",
    html: `
      <h1 style="${h1Style}">Welcome, ${safeName}.</h1>
      <p style="${pStyle}">You're approved. Here's your promo code:</p>
      <p style="text-align: center; margin: 24px 0;">
        <span style="${codeStyle}">${safeCode}</span>
      </p>
      <p style="${pStyle}">Every defendant who uses this code at checkout gets 10% off. You earn commission on every sale.</p>

      <h2 style="${h2Style}">Send This to Your Next Client</h2>
      <p style="${pStyle}">Copy-paste this message right now — it takes 10 seconds:</p>
      <div style="${copyBoxStyle}">
        <em>"Hey &mdash; I work with a company that researches criminal cases and helps defendants prepare the right questions for their attorney. If you use my code <strong>${safeCode}</strong> at checkout, you get 10% off. Check it out: ${escapeHtml(SITE_URL)}"</em>
      </div>

      <h2 style="${h2Style}">Then Check Your Dashboard</h2>
      <p style="${pStyle}">Track referrals, commissions, and payouts in real time:</p>
      <p style="margin: 20px 0; text-align: center;">
        <a href="${escapeHtml(magicLinkUrl)}" style="${btnStyle}">Open My Dashboard</a>
      </p>

      <p style="${pStyle}">We'll send you a few tips over the next two weeks to help you get the most out of the program. Reply to any email if you have questions.</p>
    `,
  };
}

// ============================================================
// 2. FIRST SHARE — Day 1
// ============================================================

export function partnerFirstShareEmail(
  name: string,
  promoCode: string,
  referralUrl: string,
  source?: string | null
): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(promoCode);
  const safeUrl = escapeHtml(referralUrl);
  const isBondsman = source === "bondsman";

  const messageBlock = isBondsman
    ? `
      <h2 style="${h2Style}">Hand This to Every Client</h2>
      <p style="${pStyle}">Print your Compliance Checklist from the dashboard and hand it to every client at bonding. It covers bail conditions, court dates, and free court reminders — everything they need in one page.</p>
      <p style="${pStyle}">The defendants who sign up for reminders are the ones who show up. That's fewer FTAs for you and better outcomes for them.</p>
    `
    : `
      <h2 style="${h2Style}">Text This Right Now</h2>
      <div style="${copyBoxStyle}">
        <em>"Hey — I set you up with a research service that'll help you stay on top of your case. Go to ${safeUrl} and use code <strong>${safeCode}</strong> for 10% off. They'll generate questions you can bring to your attorney."</em>
      </div>
      <p style="${pStyle}">Takes 30 seconds. The defendant gets help. You earn commission. Everyone wins.</p>

      <h2 style="${h2Style}">Pro Tip: QR Code</h2>
      <p style="${pStyle}">Print your referral URL as a QR code on your business card. Defendants scan it on the spot — no typing, no forgotten codes.</p>
    `;

  return {
    subject: isBondsman
      ? "Print Your Checklist — Hand It to Every Client"
      : "Send This to Your Next Client (30 Seconds)",
    html: `
      <h1 style="${h1Style}">${isBondsman ? "One page. Every client." : "One message. That's it."}</h1>
      <p style="${pStyle}">${safeName}, the partners who earn the most do one thing consistently: they ${isBondsman ? "hand the checklist to every client before they leave the building" : "share their code before the defendant leaves the building"}.</p>

      ${messageBlock}

      <p style="margin: 24px 0; text-align: center;">
        <a href="${isBondsman ? `${SITE_URL}/partner/checklist` : dashboardUrl}" style="${btnStyle}">${isBondsman ? "Print My Checklist" : "Check My Dashboard"}</a>
      </p>
    `,
  };
}

// ============================================================
// 3. THE MATH — Day 3
// ============================================================

export function partnerTheMathEmail(
  name: string
): { subject: string; html: string } {
  const safeName = escapeHtml(name);

  // Single aspirational scenario — Gold tier (20%) on X-Ray ($2,497)
  const goldTier = COMMISSION_TIERS_CONFIG.find((t) => t.key === "gold");
  const goldRate = goldTier?.rate ?? 20;
  const xRayPrice = TIER_CORE["x-ray"].price;
  const monthlyEarnings = Math.floor((xRayPrice * goldRate) / 100) * 5;

  return {
    subject: "The Math: What 5 Referrals Actually Earns You",
    html: `
      <h1 style="${h1Style}">One number, ${safeName}.</h1>

      <div style="background: #1C1917; border-left: 4px solid ${GREEN}; padding: 24px; margin: 24px 0; border-radius: 0 8px 8px 0; text-align: center;">
        <p style="${moneyStyle}; font-size: 36px; margin: 0 0 8px;">${dollarsWhole(monthlyEarnings)}/month</p>
        <p style="color: white; font-size: 16px; margin: 0;">5 X-Ray referrals a month at Gold tier.</p>
      </div>

      <p style="${pStyle}">That's passive income from defendants you're already talking to. The more you refer, the higher your commission rate climbs — and that number grows.</p>

      <p style="${pStyle}">See all commission tiers and earnings in your dashboard:</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">View My Earnings</a>
      </p>
    `,
  };
}

// ============================================================
// 4. SOCIAL PROOF / SHARING SCENARIOS — Day 7
// ============================================================

export function partnerSocialProofEmail(
  name: string
): { subject: string; html: string } {
  const safeName = escapeHtml(name);

  const scenarios = [
    {
      title: "At Bonding",
      icon: "&#x1F3E2;",
      desc: "Hand them your business card with the QR code. They're stressed, processing everything — a card they can look at later is perfect. \"This service helped my last client ask the right questions. Scan that code when you're ready.\"",
    },
    {
      title: "After First Attorney Meeting",
      icon: "&#x1F4F1;",
      desc: "Text them: \"How'd it go with your attorney? If you want help preparing questions for next time, check out imnotanattorney.com — use my code for 10% off. They research your specific case and give you questions to bring.\"",
    },
    {
      title: "Past Clients",
      icon: "&#x1F4E7;",
      desc: "Email anyone with an active case: \"I started working with a service that helps defendants hold their attorneys accountable. If you or anyone you know has a pending case, here's my code — they get 10% off and it's worth every penny.\"",
    },
  ];

  const scenarioHtml = scenarios
    .map(
      (s) => `
      <div style="background: #1C1917; border-radius: 8px; padding: 16px; margin: 12px 0;">
        <p style="color: ${AMBER}; font-weight: 700; font-size: 16px; margin: 0 0 8px;">${s.icon} ${s.title}</p>
        <p style="${pStyle}; margin: 0;">${s.desc}</p>
      </div>
    `
    )
    .join("");

  return {
    subject: "3 Ways Top Partners Share Their Code",
    html: `
      <h1 style="${h1Style}">Real scenarios, ${safeName}.</h1>
      <p style="${pStyle}">No sales pitch needed. You're connecting defendants with a research service that helps them. Here's how partners actually do it:</p>

      ${scenarioHtml}

      <p style="${pStyle}; margin-top: 20px;">The common thread: you're not selling anything. You're pointing someone who's scared and confused toward a service that gives them control. That's it.</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">Check My Dashboard</a>
      </p>
    `,
  };
}

// ============================================================
// 5. CHECK-IN — Day 14
// ============================================================

export function partnerCheckinEmail(
  name: string,
  totalReferrals: number,
  totalEarnedCents: number
): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const earned = dollars(totalEarnedCents);

  const statsHtml =
    totalReferrals > 0
      ? `
      <div style="background: #1C1917; border-radius: 8px; padding: 20px; margin: 16px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 14px; margin: 0 0 4px;">Your Stats So Far</p>
        <p style="font-size: 32px; font-weight: 800; color: white; margin: 0;">${totalReferrals} referral${totalReferrals !== 1 ? "s" : ""}</p>
        <p style="${moneyStyle}; font-size: 24px; margin: 4px 0 0;">${earned} earned</p>
      </div>
    `
      : `
      <div style="background: #1C1917; border-radius: 8px; padding: 20px; margin: 16px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 16px; margin: 0;">No referrals yet — but you're set up and ready.</p>
        <p style="color: #71717A; font-size: 14px; margin: 8px 0 0;">Your next bonding is your first commission.</p>
      </div>
    `;

  return {
    subject: totalReferrals > 0
      ? `Two Weeks In: ${totalReferrals} Referral${totalReferrals !== 1 ? "s" : ""} and ${earned} Earned`
      : "Two Weeks In — Quick Check",
    html: `
      <h1 style="${h1Style}">Two-week check-in, ${safeName}.</h1>
      ${statsHtml}

      <h2 style="${h2Style}">Tips From Top Partners</h2>
      <ul style="color: ${ZINC}; font-size: 15px; line-height: 1.8; padding-left: 20px;">
        <li>Keep cards in your car — you never know when you'll run into someone with a case.</li>
        <li>Mention the code <em>before</em> they leave your office, not after.</li>
        <li>Follow up by text the same day — defendants forget everything in the first 48 hours.</li>
      </ul>

      <p style="${pStyle}">Reply to this email if you have questions or need anything. We read every response.</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">Open My Dashboard</a>
      </p>
    `,
  };
}

// ============================================================
// 6. SALE NOTIFICATION — Real-time
// ============================================================

export function partnerSaleNotificationEmail(
  name: string,
  tierName: string,
  commissionCents: number,
  totalEarnedCents: number
): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const safeTier = escapeHtml(tierName);
  const commission = dollars(commissionCents);
  const total = dollars(totalEarnedCents);

  return {
    subject: `Ka-ching! You earned ${commission} on a ${safeTier} sale`,
    html: `
      <h1 style="${h1Style}">Ka-ching!</h1>
      <div style="background: #1C1917; border-radius: 8px; padding: 24px; margin: 16px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 14px; margin: 0 0 4px;">Commission Earned</p>
        <p style="${moneyStyle}; font-size: 40px; font-weight: 800; margin: 0;">${commission}</p>
        <p style="color: ${ZINC}; font-size: 14px; margin: 8px 0 0;">from a <strong style="color: white;">${safeTier}</strong> purchase</p>
      </div>

      <div style="background: #1C1917; border-radius: 8px; padding: 16px; margin: 12px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 13px; margin: 0 0 4px;">Running Total</p>
        <p style="${moneyStyle}; font-size: 24px; font-weight: 700; margin: 0;">${total}</p>
      </div>

      <p style="${pStyle}; margin-top: 20px;">${safeName}, your referral just helped a defendant take control of their case. That's a win for everyone.</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">View My Dashboard</a>
      </p>
    `,
  };
}

// ============================================================
// 7. PAYOUT NOTIFICATION — Real-time
// ============================================================

export function partnerPayoutNotificationEmail(
  name: string,
  amountCents: number,
  method: string
): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const amount = dollars(amountCents);
  const safeMethod = escapeHtml(method.charAt(0).toUpperCase() + method.slice(1));

  return {
    subject: `Payout Processed: ${amount} via ${safeMethod}`,
    html: `
      <h1 style="${h1Style}">Payout Processed</h1>
      <div style="background: #1C1917; border-radius: 8px; padding: 24px; margin: 16px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 14px; margin: 0 0 4px;">Amount Sent</p>
        <p style="${moneyStyle}; font-size: 40px; font-weight: 800; margin: 0;">${amount}</p>
        <p style="color: ${ZINC}; font-size: 14px; margin: 8px 0 0;">via <strong style="color: white;">${safeMethod}</strong></p>
      </div>

      <p style="${pStyle}">${safeName}, your payout has been processed. Depending on your payment method, funds typically arrive within 1-3 business days.</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">View Payout History</a>
      </p>
    `,
  };
}

// ============================================================
// 8. DAY 30 RE-ENGAGEMENT
// ============================================================

export function partnerDay30Email(
  name: string,
  totalReferrals: number
): { subject: string; html: string } {
  const safeName = escapeHtml(name);

  const statsBlock =
    totalReferrals > 0
      ? `
      <div style="background: #1C1917; border-radius: 8px; padding: 20px; margin: 16px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 14px; margin: 0 0 4px;">Your Referrals So Far</p>
        <p style="font-size: 32px; font-weight: 800; color: white; margin: 0;">${totalReferrals}</p>
      </div>
      <p style="${pStyle}">Keep it going. Every referral helps a defendant take control of their case — and earns you commission.</p>
    `
      : `
      <p style="${pStyle}">Your code is live and ready. The next defendant you talk to is your first commission.</p>
    `;

  return {
    subject: "Your Code Is Still Active",
    html: `
      <h1 style="${h1Style}">30-day check-in, ${safeName}.</h1>
      <p style="${pStyle}">Quick reminder: your promo code is still active. Defendants who use it get 10% off, and you earn commission on every sale.</p>

      ${statsBlock}

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">Open My Dashboard</a>
      </p>
    `,
  };
}

// ============================================================
// 9. DAY 60 RE-ENGAGEMENT
// ============================================================

export function partnerDay60Email(
  name: string
): { subject: string; html: string } {
  const safeName = escapeHtml(name);

  return {
    subject: "Haven't Shared Your Code Yet?",
    html: `
      <h1 style="${h1Style}">Still here, ${safeName}.</h1>
      <p style="${pStyle}">We noticed you haven't shared your code yet — no pressure, but we want to make sure nothing's holding you back.</p>

      <p style="${pStyle}">If you're not sure how to bring it up, or who to share it with, reply to this email. We'll help you figure out the easiest way to get started.</p>

      <p style="${pStyle}">Your code is still active. One message to one defendant is all it takes.</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">Check My Dashboard</a>
      </p>
    `,
  };
}

// ============================================================
// 10. TIER UPGRADE — Real-time
// ============================================================

export function partnerTierUpgradeEmail(
  name: string,
  newTier: string,
  newRate: number
): { subject: string; html: string } {
  const safeName = escapeHtml(name);

  // Map tier key to display name
  const tierDisplay =
    COMMISSION_TIERS_CONFIG.find((t) => t.key === newTier)?.label || newTier;

  // Projected earnings at new rate with X-Ray
  const xRayPrice = TIER_CORE["x-ray"].price;
  const projectedCommission = Math.floor((xRayPrice * newRate) / 100);
  const projected5 = projectedCommission * 5;

  return {
    subject: `Congratulations! You're Now a ${tierDisplay}`,
    html: `
      <h1 style="${h1Style}">You leveled up, ${safeName}.</h1>
      <div style="background: #1C1917; border-radius: 8px; padding: 24px; margin: 16px 0; text-align: center;">
        <p style="color: ${ZINC}; font-size: 14px; margin: 0 0 8px;">New Tier</p>
        <p style="color: ${AMBER}; font-size: 28px; font-weight: 800; margin: 0;">${escapeHtml(tierDisplay)}</p>
        <p style="${moneyStyle}; font-size: 22px; margin: 8px 0 0;">${newRate}% commission on every sale</p>
      </div>

      <p style="${pStyle}">Your commission rate just increased. This applies to <strong style="color: white;">all future referrals</strong> — starting now.</p>

      <div style="background: #1C1917; border-left: 4px solid ${GREEN}; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <p style="color: white; font-size: 16px; margin: 0 0 8px; font-weight: 700;">At Your New Rate</p>
        <p style="${pStyle}; margin: 0;">5 X-Ray referrals = <span style="${moneyStyle}; font-size: 18px;">${dollars(projected5)}</span></p>
      </div>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">View My Dashboard</a>
      </p>
    `,
  };
}
