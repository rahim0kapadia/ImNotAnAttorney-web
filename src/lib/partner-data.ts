/**
 * Shared partner page data, commission table, FAQs, computed values, constants.
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

/**
 * Typical per-no-show forfeiture range for bail bondsmen — common misdemeanor /
 * low-felony bond face values. Shown on /partners/bondsman, compliance reports,
 * and dashboard exposure math. Single source of truth.
 */
export const FORFEITURE_RANGE_LOW_USD = 5000;
export const FORFEITURE_RANGE_HIGH_USD = 10000;
export const FORFEITURE_RANGE_DISPLAY = "$5,000 to $10,000";
export const FORFEITURE_RANGE_SHORT = "$5K–$10K";

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

/** Shared partner shape, used by dashboard page and auth helpers. */
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
  source: string | null;
  city: string | null;
  check_in_enabled: boolean;
  flip_at: string | null;
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

/**
 * Bondsman-specific FAQ. Answers the skeptical-jail-desk objection set:
 * money/catch, surety/blame, proof, effort, competitive. Every claim here is
 * verified against actual system behavior (see src/lib/court-reminders.ts,
 * src/app/api/cron/court-reminders/route.ts, src/components/partner/*). Do
 * not edit numbers/claims without re-verifying the behavior they describe.
 */
export const BONDSMAN_FAQS = [
  // ── MONEY / CATCH ──
  {
    question: "What's the catch? Why is this free?",
    answer:
      "No catch. Defendants who use your code get free court-date reminders and prep whether they ever buy anything. Our revenue comes from the subset who upgrade to a case-specific research report — you keep 10-20% of that. Your FTA rate drops either way.",
  },
  {
    question: "How are you making money then?",
    answer:
      "Case-prep research reports ($197 / $997 / $2,497). Defendants buy them because the window right after arrest is the highest-intent research moment they'll ever have. Free reminders exist because a defendant who actually shows up to court is a defendant who's still around to buy help for their case.",
  },
  {
    question: "Can I cancel whenever?",
    answer:
      "Yes. Email support and we'll deactivate your code. No contracts, no minimums, no clawback on commissions you've already earned. Clients already enrolled keep getting their reminders — we don't punish them for your business decision.",
  },

  // ── LIABILITY / REGULATORY ──
  {
    question: "Is referring clients to you a UPL or agent-licensing problem for me?",
    answer:
      "No. We provide legal information and generate questions — we do not provide legal advice. You're recommending a research service, same regulatory category as recommending a court-prep class or a book. Your dashboard includes a Compliance Kit with FTC-safe disclosure templates and language your surety can review if they ask.",
  },
  {
    question: "Does your reminder count as official court notice?",
    answer:
      "No, and we say so on the sign-up and inside every reminder. Official notice is the court's job. We're supplemental — the \"your hearing is Tuesday at 8:30, wear long sleeves, here's where to park\" layer their lawyer should've sent and didn't.",
  },
  {
    question: "Cover the forfeiture if they skip?",
    answer:
      "No. You're the surety, we're not. We reduce FTA probability; we don't insure it. Our job is making sure the reason they missed court isn't \"I forgot\" or \"I didn't know where to go.\" Everything else stays on your side of the line.",
  },

  // ── SURETY / BLAME ──
  {
    question: "Does my surety or underwriter need to sign off?",
    answer:
      "No. You're recommending a free defendant service and collecting a referral fee on a separate research product. It doesn't touch your bond authority, your capital requirements, or your carrier's risk exposure. If your carrier asks, the Compliance Kit in your dashboard is written for that exact conversation.",
  },
  {
    question: "What if a defendant complains to me about the texts?",
    answer:
      "Every reminder email has a one-click unsubscribe link. SMS runs through a carrier-compliant gateway that honors STOP per 10DLC rules. If a complaint comes to you instead of us, forward the phone number or email — we suppress it immediately and it won't get contacted again from our side.",
  },
  {
    question: "What happens if your system goes down on my client's court date?",
    answer:
      "Each enrolled client gets four pre-court reminders fired in separate time windows — 14 days, 7 days, 3 days, and 1 day out. Every SMS reminder also ships as an email in parallel so there's a paper trail. One outage can't take out all four. If a miss ever did cause an FTA traced back to us, we'd own it directly with you and post the root cause.",
  },

  // ── EFFORT / OPS ──
  {
    question: "Do I have to enter clients, push notifications, chase setup?",
    answer:
      "No. You hand the defendant a QR code or your partner link at bonding. They scan, enter their own case info, our system takes over. If you'd rather add a client yourself, the dashboard has a one-tap \"Add Client\" form — but nothing requires it.",
  },
  {
    question: "What if my client has no phone or email?",
    answer:
      "Email is required, phone is optional. If the defendant doesn't want to use their own contact, the indemnitor (co-signer — usually family) can be listed and gets a copy of every reminder. If nobody in the circle has email or phone, you're in a rare edge case where the service doesn't help — but it still costs you nothing.",
  },
  {
    question: "How fast from QR scan to enrolled?",
    answer:
      "About 2 minutes. Five fields — name, court date, county/state, email, phone (optional). The moment they submit, three things happen: their prep page is live, a welcome email lands in their inbox explaining what the hearing is, what to bring, what to wear, when to arrive, and the reminder schedule — and if they gave a phone, a welcome SMS with the same prep-page link. Then automated reminders fire at 14, 7, 3, and 1 day before court.",
  },

  // ── PROOF / BRAND ──
  {
    question: "How do I know the reminders actually cut FTA?",
    answer:
      "Industry FTA sits around 15-20%. Independent studies have measured the lift from SMS reminders directly: ideas42 and the University of Chicago Crime Lab ran a randomized trial in NYC that reduced FTAs by 26%. Uptrust, a similar reminder system used by public defenders, reports 50%+ FTA reduction in several jurisdictions. Your partner dashboard tracks reminders delivered and court dates cleared for YOUR book — so you see the number on your own clients, not our marketing number.",
  },
  {
    question: "Can my clients see my logo instead of yours?",
    answer:
      "Yes. Upload your logo once in the dashboard and every page your defendants visit — reminders, prep pages, dashboard links — wears your brand. Our name appears only in the fine print required for legal compliance. You look tech-forward to your book; we stay in the back room.",
  },

  // ── COMPETITIVE ──
  {
    question: "What stops you from launching your own bail product and eating my lunch?",
    answer:
      "We can't write bonds. It's a regulated surety business with state capital requirements and insurance backing we don't have and won't pursue. We're a research company, you're the bondsman — the categories don't overlap. The partnership only works if your book stays yours.",
  },
  {
    question: "Do you share my client list with anyone, ever?",
    answer:
      "No. Not marketers, not other bondsmen, not data brokers, not law firms. Your book is your book. The only exception is if a court issues a valid subpoena for a specific record — same rule as your own files.",
  },
];

export const PARTNER_FAQS = [
  {
    question: "What does ImNotAnAttorney do?",
    answer: "We research criminal cases and generate specific questions defendants can bring to their attorneys. We provide legal INFORMATION and questions, never legal advice. Think of us as a research team that helps defendants hold their attorneys accountable.",
  },
  {
    question: "What does the defendant get from my link?",
    answer: "Two things, free whether they buy anything or not. Court-date reminders at 7 days, 3 days, and day-of through the case, and a walkthrough of what to expect at their hearing. If they buy a Case Decoder report, the guarantee is at least 15 case-specific questions their attorney hasn't raised or full refund, no argument.",
  },
  {
    question: "How do I earn commission?",
    answer: "Your promo code tags every case-prep purchase that traces back to your link. You earn 10% on the first 4 sales, 15% from sale 5, and 20% from sale 15 onward. Commissions are tracked automatically; you see them live in your partner dashboard.",
  },
  {
    question: "When do I get paid?",
    answer: "Commissions are tracked in real time. Payouts are processed on the 1st of each month (NET-30) via PayPal, Venmo, Zelle, or check, your choice. You can see your running total and referral history anytime in your partner dashboard.",
  },
  {
    question: "What do I need to do?",
    answer: "Literally just hand out your promo code. We handle everything else, the research, the questions, the delivery. You don't need to explain the product. The defendants are already looking for help.",
  },
  {
    question: "Is this legal?",
    answer: "Yes. We provide legal information and generate questions, we do not provide legal advice. This is the same as recommending a book or resource. Your referral is simply introducing defendants to a research service.",
  },
  {
    question: "What if the defendant doesn't buy immediately?",
    answer: "The promo code doesn't expire. Defendants typically purchase within 7 days of arrest (the crisis window), but the code works anytime. If they enter your code at checkout, even months later, you get the commission.",
  },
];

/**
 * Four named partner segments rendered on /partners. Each one is a category
 * that already sits next to defendants between arrest and arraignment. Copy
 * lives here (not in JSX) so marketing can revise without touching components.
 */
export interface PartnerSegment {
  slug: string;
  title: string;
  tag: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  primary?: boolean;
}

export const PARTNER_SEGMENTS: PartnerSegment[] = [
  {
    slug: "bondsman",
    title: "Bail Bondsmen",
    tag: "Primary segment. Most built-out program.",
    description:
      "Every forfeiture is a check you write because a client didn’t show. Free court-date reminders and hearing prep for every defendant you bond out cut that rate directly.",
    ctaLabel: "See the bondsman program",
    ctaHref: "/partners/bondsman",
    primary: true,
  },
  {
    slug: "paralegal",
    title: "Paralegals & Legal Assistants",
    tag: "For clients outside your firm’s bandwidth.",
    description:
      "When your firm can’t take a case or the client can’t afford the retainer, hand them a research service instead of turning them away. We generate the questions they should be asking.",
    ctaLabel: "Apply as a paralegal",
    ctaHref: "#apply",
  },
  {
    slug: "creator",
    title: "Content Creators",
    tag: "For the criminal-justice audience you already have.",
    description:
      "If your audience is defendants, families, or criminal-justice-curious, your promo code gives them a research service that actually helps. No upsell scripts.",
    ctaLabel: "Apply as a creator",
    ctaHref: "#apply",
  },
  {
    slug: "advocate",
    title: "Community Advocates & Reentry Orgs",
    tag: "For the people who get the phone calls at 2am.",
    description:
      "Nonprofits, reentry coordinators, family-support orgs. Defendants you serve get a free court-reminder system and a refund-backed research service when your code is at checkout.",
    ctaLabel: "Apply as an advocate",
    ctaHref: "#apply",
  },
];
