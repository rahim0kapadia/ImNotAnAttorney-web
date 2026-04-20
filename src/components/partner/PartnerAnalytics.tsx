"use client";
/**
 * Partner Analytics, CSS bar chart for monthly earnings + per-tier breakdown.
 * No chart library, pure CSS width bars.
 */

import { formatCents } from "@/lib/format";

interface MonthlyData {
  month: string;
  commission: number;
  count: number;
}

interface TierData {
  tier: string;
  commission: number;
  count: number;
}

export interface AnalyticsData {
  monthly: MonthlyData[];
  by_tier: TierData[];
  total_referrals: number;
}

interface PartnerAnalyticsProps {
  analytics: AnalyticsData;
}

export function PartnerAnalytics({ analytics }: PartnerAnalyticsProps) {
  const { monthly, by_tier, total_referrals } = analytics;
  const maxMonthly = Math.max(...monthly.map((m) => m.commission), 1);

  if (monthly.length === 0 && by_tier.length === 0) {
    return (
      <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
        <h2 className="text-xl font-bold mb-4">What&apos;s working</h2>
        <p className="text-zinc-400">
          Numbers show up here after your first client uses the code.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-500 p-6">
      <h2 className="text-xl font-bold mb-4">What&apos;s working</h2>

      <div className="mb-2 text-sm text-zinc-400">
        Clients sent: <span className="text-white font-medium">{total_referrals}</span>
      </div>

      {/* Monthly Earnings Bar Chart */}
      {monthly.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Month by month
          </h3>
          <div className="space-y-2">
            {monthly.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-20 shrink-0 text-right">
                  {m.month}
                </span>
                <div
                  role="meter"
                  aria-valuenow={m.commission}
                  aria-valuemin={0}
                  aria-valuemax={maxMonthly}
                  aria-label={`${m.month}: $${(m.commission / 100).toFixed(2)}, ${m.count} sale${m.count !== 1 ? "s" : ""}`}
                  className="flex-1 h-6 bg-zinc-800 rounded-full overflow-hidden"
                >
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max(8, (m.commission / maxMonthly) * 100)}%`,
                    }}
                  >
                    {m.commission > 0 && (
                      <span className="text-[10px] font-medium text-black whitespace-nowrap">
                        {formatCents(m.commission)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-zinc-400 w-12 shrink-0">
                  {m.count} sale{m.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Tier Breakdown */}
      {by_tier.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Which product paid you
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Commission breakdown by product tier</caption>
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-500">
                  <th scope="col" className="text-left py-2 pr-4">Tier</th>
                  <th scope="col" className="text-right py-2 pr-4">Sales</th>
                  <th scope="col" className="text-right py-2">Commission</th>
                </tr>
              </thead>
              <tbody>
                {by_tier.map((t) => (
                  <tr key={t.tier} className="border-b border-zinc-500/50">
                    <td className="py-2 pr-4 capitalize">{t.tier.replace(/-/g, " ")}</td>
                    <td className="py-2 pr-4 text-right">{t.count}</td>
                    <td className="py-2 text-right text-green-400">
                      {formatCents(t.commission)}
                    </td>
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
