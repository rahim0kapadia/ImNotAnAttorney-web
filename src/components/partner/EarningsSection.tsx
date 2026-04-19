/**
 * Partner Earnings, commission tier, progress bar, stat cards, payout history.
 * Server-compatible (no hooks), all data passed as props.
 */

import { formatCents, formatDate } from "@/lib/format";
import { getNextTier } from "@/lib/partner-data";

interface Earnings {
  total_earned: number;
  total_paid: number;
  pending_payout: number;
  total_referrals: number;
}

interface Payout {
  id: string;
  amount: number;
  payment_method: string;
  created_at: string;
}

interface EarningsSectionProps {
  partner: {
    commission_tier: string;
    commission_rate: number;
  };
  earnings: Earnings;
  payouts: Payout[];
}

export function EarningsSection({ partner, earnings, payouts }: EarningsSectionProps) {
  const nextTier = getNextTier(partner.commission_tier || "partner");

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
      <h2 className="text-xl font-bold mb-4">What you&apos;ve earned</h2>

      {/* Commission Tier */}
      <div className="mb-4 flex items-center gap-4">
        <span className="text-sm text-zinc-400">Your Tier:</span>
        <span className="font-bold text-amber-400 capitalize">
          {partner.commission_tier || "partner"} Partner
        </span>
        <span className="text-sm text-zinc-400">
          ({partner.commission_rate}% commission)
        </span>
      </div>

      {/* Progress bar to next tier */}
      {nextTier && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>{earnings.total_referrals} referrals</span>
            <span>
              {nextTier.threshold} needed for {nextTier.label}
            </span>
          </div>
          <div
            className="h-2 bg-zinc-800 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={earnings.total_referrals}
            aria-valuemin={0}
            aria-valuemax={nextTier.threshold}
            aria-label={`Progress to ${nextTier.label}: ${earnings.total_referrals} of ${nextTier.threshold} referrals`}
          >
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (earnings.total_referrals / nextTier.threshold) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-zinc-400">Total Earned</p>
          <p className="text-2xl font-bold text-green-400">
            {formatCents(earnings.total_earned)}
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-400">Pending Payout</p>
          <p className="text-2xl font-bold text-amber-400">
            {formatCents(earnings.pending_payout)}
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-400">Total Paid</p>
          <p className="text-2xl font-bold">{formatCents(earnings.total_paid)}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-400">Total Referrals</p>
          <p className="text-2xl font-bold">{earnings.total_referrals}</p>
        </div>
      </div>

      {/* Payout History */}
      {payouts.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Payout History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Payout history with dates, amounts, and payment methods
              </caption>
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-500">
                  <th scope="col" className="text-left py-2 pr-4">Date</th>
                  <th scope="col" className="text-right py-2 pr-4">Amount</th>
                  <th scope="col" className="text-left py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-500/50">
                    <td className="py-2 pr-4">{formatDate(p.created_at)}</td>
                    <td className="py-2 pr-4 text-right text-green-400">
                      {formatCents(p.amount)}
                    </td>
                    <td className="py-2 capitalize">{p.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
