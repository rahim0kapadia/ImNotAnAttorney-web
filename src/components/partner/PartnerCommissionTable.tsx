import { TIER_CORE } from "@/lib/tiers";
import { COMMISSION_TIERS, COMMISSION_TIERS_CONFIG } from "@/lib/partner-data";

/** Tiered commission table showing earnings at Partner / Silver / Gold rates. */
export function PartnerCommissionTable() {
  const tiers = COMMISSION_TIERS_CONFIG;

  const rows = COMMISSION_TIERS.map((slug) => {
    const t = TIER_CORE[slug];
    const price = t.price / 100;
    const clientPays = Math.round(price * 0.9 * 100) / 100;
    const commissions = tiers.map((tier) => Math.round(price * (tier.rate / 100) * 100) / 100);
    return { name: t.name, price: t.priceDisplay, clientPays, commissions };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm md:text-base">
        <thead>
          <tr className="text-zinc-400 border-b border-zinc-700">
            <th className="text-left py-3 pr-4">Service</th>
            <th className="text-right py-3 pr-4">Price</th>
            <th className="text-right py-3 pr-4">Client Pays</th>
            {tiers.map((tier) => (
              <th
                key={tier.key}
                className={`text-right py-3 ${tier.key === "gold" ? "pl-3 pr-3 text-amber-400 border-x border-t border-amber-500/30 bg-amber-500/5 rounded-t-lg" : "pr-4"}`}
              >
                <div className="font-bold">{tier.rate}%</div>
                <div className="text-xs font-normal text-zinc-500">
                  {tier.threshold === 0
                    ? "0\u20134 sales"
                    : tier.threshold === 5
                      ? "5\u201314 sales"
                      : "15+ sales"}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.name} className={`border-b border-zinc-700/50 ${ri === rows.length - 1 ? "" : ""}`}>
              <td className="py-3 pr-4 font-medium">{row.name}</td>
              <td className="py-3 pr-4 text-right text-zinc-400">{row.price}</td>
              <td className="py-3 pr-4 text-right">
                ${row.clientPays.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </td>
              {row.commissions.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-3 text-right font-bold ${
                    ci === tiers.length - 1
                      ? "pl-3 pr-3 text-amber-400 border-x border-amber-500/30 bg-amber-500/5"
                      : ci === 0
                        ? "pr-4 text-zinc-300"
                        : "pr-4 text-zinc-200"
                  }`}
                >
                  ${c.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
