import Link from "next/link";

export type ChargeSlug =
  | "dui-defense"
  | "drug-possession-defense"
  | "assault-defense"
  | "domestic-violence-defense";

const CHARGE_LABELS: Record<ChargeSlug, string> = {
  "dui-defense": "DUI",
  "drug-possession-defense": "Drug Possession",
  "assault-defense": "Assault",
  "domestic-violence-defense": "Domestic Violence",
};

export function RelatedStateCharges({
  currentCharge,
  stateSlug,
  stateName,
}: {
  currentCharge: ChargeSlug;
  stateSlug: string;
  stateName: string;
}) {
  const related = (Object.keys(CHARGE_LABELS) as ChargeSlug[]).filter(
    (c) => c !== currentCharge,
  );
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold text-white">
        Other {stateName} defense topics
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        Facing a different charge in {stateName}? Penalty ranges, enhancements,
        and defense questions for related crimes:
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {related.map((charge) => (
          <Link
            key={charge}
            href={`/${charge}/${stateSlug}`}
            className="rounded-lg border border-zinc-500 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300 transition-colors hover:border-amber-500/40 hover:text-white"
          >
            {CHARGE_LABELS[charge]} in {stateName}
          </Link>
        ))}
      </div>
    </section>
  );
}
