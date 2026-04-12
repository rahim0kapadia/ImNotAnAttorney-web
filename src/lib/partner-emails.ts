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

const dashboardUrl = `${SITE_URL}/partners/dashboard`;

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

      <h2 style="${h2Style}">Your Dashboard</h2>
      <p style="${pStyle}">Track referrals, commissions, and payouts in real time:</p>
      <p style="margin: 20px 0; text-align: center;">
        <a href="${escapeHtml(magicLinkUrl)}" style="${btnStyle}">Open My Dashboard</a>
      </p>

      <h2 style="${h2Style}">Your First Message</h2>
      <p style="${pStyle}">Copy-paste this to your next client:</p>
      <div style="${copyBoxStyle}">
        <em>"I work with a research service that helps defendants hold their attorneys accountable. Use code <strong>${safeCode}</strong> at imnotanattorney.com for 10% off. They generate specific questions you can bring to your attorney — it's not legal advice, it's legal information that puts you in control."</em>
      </div>

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
  referralUrl: string
): { subject: string; html: string } {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(promoCode);
  const safeUrl = escapeHtml(referralUrl);

  return {
    subject: "Send This to Your Next Client (30 Seconds)",
    html: `
      <h1 style="${h1Style}">One message. That's it.</h1>
      <p style="${pStyle}">${safeName}, the partners who earn the most do one thing consistently: they share their code before the defendant leaves the building.</p>

      <h2 style="${h2Style}">Text This Right Now</h2>
      <div style="${copyBoxStyle}">
        <em>"Hey — I set you up with a research service that'll help you stay on top of your case. Go to ${safeUrl} and use code <strong>${safeCode}</strong> for 10% off. They'll generate questions you can bring to your attorney."</em>
      </div>
      <p style="${pStyle}">Takes 30 seconds. The defendant gets help. You earn commission. Everyone wins.</p>

      <h2 style="${h2Style}">Pro Tip: QR Code</h2>
      <p style="${pStyle}">Print your referral URL as a QR code on your business card. Defendants scan it on the spot — no typing, no forgotten codes.</p>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">Check My Dashboard</a>
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

  // Build commission table from TIER_CORE
  const earningsRows = [
    { slug: "dui-first-offense" as const, label: "Defense Playbook" },
    { slug: "case-decoder" as const, label: "Case Decoder" },
    { slug: "intelligence-brief" as const, label: "Intelligence Brief" },
    { slug: "x-ray" as const, label: "The X-Ray" },
    { slug: "war-room" as const, label: "The War Room" },
  ];

  const tierRows = COMMISSION_TIERS_CONFIG.map((tier) => {
    const rows = earningsRows
      .map((p) => {
        const price = TIER_CORE[p.slug].price;
        const commission = Math.floor((price * tier.rate) / 100);
        return `<tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #27272A; color: ${ZINC};">${p.label}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #27272A; color: ${ZINC};">${TIER_CORE[p.slug].priceDisplay}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #27272A; ${moneyStyle}">${dollars(commission)}</td>
        </tr>`;
      })
      .join("");

    return `
      <h2 style="${h2Style}">${tier.label} (${tier.rate}% commission)</h2>
      ${tier.threshold > 0 ? `<p style="color: #71717A; font-size: 13px; margin: 0 0 8px;">Unlocked at ${tier.threshold}+ referrals</p>` : ""}
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr style="background: #1C1917;">
          <th style="padding: 8px 12px; text-align: left; color: ${AMBER}; font-size: 13px;">Product</th>
          <th style="padding: 8px 12px; text-align: left; color: ${AMBER}; font-size: 13px;">Price</th>
          <th style="padding: 8px 12px; text-align: left; color: ${AMBER}; font-size: 13px;">You Earn</th>
        </tr>
        ${rows}
      </table>
    `;
  });

  // Highlight math: 5 X-Ray referrals at Gold tier
  const xRayPrice = TIER_CORE["x-ray"].price;
  const xRayGoldCommission = Math.floor((xRayPrice * 20) / 100);
  const fiveXRay = xRayGoldCommission * 5;

  return {
    subject: "The Math: What 5 Referrals Actually Earns You",
    html: `
      <h1 style="${h1Style}">Let's do the math, ${safeName}.</h1>
      <p style="${pStyle}">Every referral earns commission. The more you refer, the higher your rate climbs.</p>

      ${tierRows.join("")}

      <div style="background: #1C1917; border-left: 4px solid ${GREEN}; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="color: white; font-size: 18px; margin: 0 0 8px; font-weight: 700;">Quick Math</p>
        <p style="${pStyle}">5 X-Ray referrals at Gold tier = <span style="${moneyStyle}; font-size: 20px;">${dollars(fiveXRay)}</span></p>
        <p style="color: #71717A; font-size: 13px; margin: 0;">That's passive income from defendants you're already talking to.</p>
      </div>

      <p style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="${btnStyle}">Track My Earnings</a>
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
// 8. TIER UPGRADE — Real-time
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
