interface CommissionRow {
  tier: string;
  price: string;
  clientPays: string;
  commission: string;
}

export function PartnerCommissionTable({ rows }: { rows: CommissionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm md:text-base">
        <thead>
          <tr className="text-zinc-400 border-b border-zinc-800">
            <th className="text-left py-3 pr-4">Service</th>
            <th className="text-right py-3 pr-4">Price</th>
            <th className="text-right py-3 pr-4">Client Pays</th>
            <th className="text-right py-3 font-bold text-amber-400">You Earn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tier} className="border-b border-zinc-800/50">
              <td className="py-3 pr-4 font-medium">{row.tier}</td>
              <td className="py-3 pr-4 text-right text-zinc-400">{row.price}</td>
              <td className="py-3 pr-4 text-right">{row.clientPays}</td>
              <td className="py-3 text-right text-amber-400 font-bold">{row.commission}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
