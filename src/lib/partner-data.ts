/**
 * Shared partner page data — commission table, FAQs, computed values, constants.
 * Used by both /partners and /partners/bondsman pages, and partner API routes.
 */

import { TIER_CORE, type TierSlug } from "@/lib/tiers";

/** Valid payment methods accepted for partner payouts. */
export const VALID_PAYMENT_METHODS = ["zelle", "venmo", "check", "paypal"] as const;

/** Computes unpaid commission from partner totals. */
export function computeUnpaidCommission(partner: { total_commission?: number; total_paid_out?: number }): number {
  return (partner.total_commission || 0) - (partner.total_paid_out || 0);
}

/** Canonical partner status values. */
export const VALID_STATUSES = ["pending", "approved", "suspended"] as const;
export type PartnerStatus = (typeof VALID_STATUSES)[number];

/** Commission tier definitions. */
export const COMMISSION_TIERS_CONFIG = [
  { key: "partner", label: "Partner", threshold: 0, rate: 10 },
  { key: "silver", label: "Silver Partner", threshold: 5, rate: 15 },
  { key: "gold", label: "Gold Partner", threshold: 15, rate: 20 },
] as const;

export type CommissionTierKey = (typeof COMMISSION_TIERS_CONFIG)[number]["key"];

/** Get tier info for a partner's current tier key. */
export function getTierInfo(tierKey: string) {
  return COMMISSION_TIERS_CONFIG.find((t) => t.key === tierKey) ?? COMMISSION_TIERS_CONFIG[0];
}

/** Get the next tier a partner can achieve, or null if at Gold. */
export function getNextTier(tierKey: string) {
  const idx = COMMISSION_TIERS_CONFIG.findIndex((t) => t.key === tierKey);
  return idx < COMMISSION_TIERS_CONFIG.length - 1 ? COMMISSION_TIERS_CONFIG[idx + 1] : null;
}

/** Shared partner shape — used by dashboard page and auth helpers. */
export interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  promo_code: string | null;
  commission_rate: number;
  commission_tier: string;
  preferred_payment_method: string | null;
  payment_zelle: string | null;
  payment_venmo: string | null;
  payment_check_address: string | null;
  payment_paypal: string | null;
  notification_prefs: Partial<import("./notification-prefs").PartnerNotificationPrefs> | null;
}

export const COMMISSION_TIERS: TierSlug[] = [
  "dui-first-offense", "case-decoder", "intelligence-brief", "x-ray", "war-room", "situation-room",
];

export const COMMISSION_TABLE = COMMISSION_TIERS.map((slug) => {
  const t = TIER_CORE[slug];
  const price = t.price / 100;
  const clientPays = Math.round(price * 0.9 * 100) / 100;
  const commission = Math.round(price * 0.1 * 100) / 100;
  return {
    tier: t.name,
    price: t.priceDisplay,
    clientPays: `$${clientPays.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    commission: `$${commission.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    commissionCents: Math.round(t.price * 0.1),
  };
});

const xRayRow = COMMISSION_TABLE.find(r => r.tier === "The X-Ray");
export const xRayEarning = xRayRow?.commission || "$224.73";
export const xRayFiveMonthly = xRayRow
  ? `$${((xRayRow.commissionCents * 5) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
  : "$1,123.65";

export const PARTNER_FAQS = [
  {
    question: "What does ImNotAnAttorney do?",
    answer: "We research criminal cases and generate specific questions defendants can bring to their attorneys. We provide legal INFORMATION and questions — never legal advice. Think of us as a research team that helps defendants hold their attorneys accountable.",
  },
  {
    question: "How does the referral work?",
    answer: "You get a unique promo code. Hand it to defendants when they bond out. They enter the code at checkout for 10% off. You earn 10-20% commission on every purchase (starting at 10%, increasing to 15% at 5 sales and 20% at 15 sales). We track it all automatically.",
  },
  {
    question: "When do I get paid?",
    answer: "Commissions are tracked in real time. Payouts are processed on the 1st of each month (NET-30) via PayPal, Venmo, Zelle, or check — your choice. You can see your running total and referral history anytime in your partner dashboard.",
  },
  {
    question: "What do I need to do?",
    answer: "Literally just hand out your promo code. We handle everything else — the research, the questions, the delivery. You don't need to explain the product. The defendants are already looking for help.",
  },
  {
    question: "Is this legal?",
    answer: "Yes. We provide legal information and generate questions — we do not provide legal advice. This is the same as recommending a book or resource. Your referral is simply introducing defendants to a research service.",
  },
  {
    question: "What if the defendant doesn't buy immediately?",
    answer: "The promo code doesn't expire. Defendants typically purchase within 7 days of arrest (the crisis window), but the code works anytime. If they enter your code at checkout — even months later — you get the commission.",
  },
];
