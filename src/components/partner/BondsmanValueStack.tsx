/**
 * Bondsman value-stack side panel for printed collateral (card + checklist).
 *
 * Screen-only (print:hidden) sibling to the existing "what this does" aside.
 * Addresses the bondsman directly in dollars and forfeiture, not features.
 * Voice: bondsman-native, not SaaS-generic.
 *
 * No props. Copy is static and shared across card + checklist so the value
 * story matches on both surfaces.
 */

export function BondsmanValueStack() {
  return (
    <aside
      aria-labelledby="bondsman-value-stack-heading"
      className="bg-zinc-900 border border-amber-500/30 rounded-xl p-6"
    >
      <h2
        id="bondsman-value-stack-heading"
        className="text-amber-400 font-bold mb-3 text-sm uppercase tracking-wider"
      >
        What this is worth to you
      </h2>
      <ul className="text-zinc-300 text-sm space-y-3 list-disc pl-5">
        <li>
          <span className="text-white font-semibold">One bond kept off forfeiture pays for years of ink.</span>{" "}
          Average bond exposure per client runs $10k+ (FTA calculator default;
          adjust to your book). The math doesn&apos;t have to attribute outcomes to call the stakes.
        </li>
        <li>
          <span className="text-white font-semibold">Court reminders can reduce FTAs.</span>{" "}
          Industry FTA sits at 15&ndash;20% (Pretrial Justice Institute);
          structured reminders are associated with multi-point reductions.
          Your mileage depends on your book &ndash; use the FTA calculator below to model yours.
        </li>
        <li>
          <span className="text-white font-semibold">Costs you nothing.</span>{" "}
          No subscription, no per-message fee, no pricing tier. You print. We work.
        </li>
        <li>
          <span className="text-white font-semibold">Every bail packet is another funnel entry.</span>{" "}
          Clients who sign up now earn you commission when they buy &ndash;
          within the attribution window documented in your Partner Terms.
        </li>
      </ul>
    </aside>
  );
}
