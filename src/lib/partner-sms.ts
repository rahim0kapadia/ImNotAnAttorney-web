/**
 * Partner SMS message builders.
 *
 * Single source of truth for all partner SMS copy.
 * Every function returns a string guaranteed <= 160 chars via capSMS().
 * All strings use GSM-7 safe characters only (no em-dashes, curly quotes).
 */

import { capSMS } from "./sms";
import { COMMISSION_TIERS_CONFIG, getNextTier } from "./partner-data";

const MILESTONES: { count: number; message: string }[] = [
  { count: 3, message: "3 referrals! Momentum building." },
  { count: 10, message: "10 referrals! Top-tier INAA partner." },
  { count: 25, message: "25 referrals! Helping more defendants than most attorneys." },
  { count: 50, message: "50 referrals. Legend status." },
];

/** Returns milestone message if count matches, null otherwise. */
export function getMilestoneMessage(totalReferrals: number): string | null {
  const m = MILESTONES.find((ms) => ms.count === totalReferrals);
  return m ? m.message : null;
}

/** Builds "[3/5 to Silver Partner - 15%]" or "[Gold Partner - 20%]" for max tier. */
export function buildTierProgress(totalReferrals: number, commissionTier: string): string {
  const next = getNextTier(commissionTier);
  if (!next) {
    const current = COMMISSION_TIERS_CONFIG.find((t) => t.key === commissionTier) ?? COMMISSION_TIERS_CONFIG[COMMISSION_TIERS_CONFIG.length - 1];
    return `[${current.label} - ${current.rate}%]`;
  }
  return `[${totalReferrals}/${next.threshold} to ${next.label} - ${next.rate}%]`;
}

interface CommissionSMSOpts {
  amountCents: number;
  tierName: string;
  totalReferrals: number;
  commissionTier: string;
  promoCode: string;
  holdbackDate: string;
}

/**
 * Builds the commission-earned SMS.
 * Handles first-sale, milestone, and standard progress variants.
 */
export function buildCommissionSMS(opts: CommissionSMSOpts): string {
  const amount = (opts.amountCents / 100).toFixed(2);

  // First sale -- distinct celebration message
  if (opts.totalReferrals === 1) {
    return capSMS(
      `INAA: Your FIRST referral just purchased a ${opts.tierName}! You earned $${amount}. Code ${opts.promoCode} is working -- keep those cards in the bail packets.`
    );
  }

  // Check milestone
  const milestone = getMilestoneMessage(opts.totalReferrals);
  const suffix = milestone ?? buildTierProgress(opts.totalReferrals, opts.commissionTier);

  return capSMS(
    `INAA: You earned $${amount} from a referral! Confirms ${opts.holdbackDate}. ${suffix}`
  );
}

interface MonthlySummarySMSOpts {
  monthName: string;
  monthEarningsCents: number;
  totalBalanceCents: number;
}

/** Builds the monthly summary SMS. */
export function buildMonthlySummarySMS(opts: MonthlySummarySMSOpts): string {
  const earnings = (opts.monthEarningsCents / 100).toFixed(2);
  const balance = (opts.totalBalanceCents / 100).toFixed(2);
  return capSMS(
    `INAA Monthly: You earned $${earnings} in ${opts.monthName}. Balance: $${balance}. Payout processes this week.`
  );
}
