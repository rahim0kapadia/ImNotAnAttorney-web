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
          <span className="text-white font-semibold">One retained client covers the next ten years of ink.</span>{" "}
          Average bond exposure on a single client is $10k+. A prevented no-show is a bond you don&apos;t forfeit.
        </li>
        <li>
          <span className="text-white font-semibold">15&ndash;20% industry FTA rate, cut to 8%.</span>{" "}
          Court reminders drop FTAs by about 7 points. Math is in the dashboard FTA calculator.
        </li>
        <li>
          <span className="text-white font-semibold">Costs you nothing.</span>{" "}
          No subscription, no per-message fee, no pricing tier. You print. We work.
        </li>
        <li>
          <span className="text-white font-semibold">Every bail packet is another funnel entry.</span>{" "}
          Clients who sign up now earn you commission whether they buy today, next week, or at sentencing.
        </li>
      </ul>
    </aside>
  );
}
