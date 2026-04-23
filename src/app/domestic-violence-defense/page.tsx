import type { Metadata } from "next";
import Link from "next/link";
import {
  STATE_DV_LAWS,
  allStateDvLawsSlugs,
} from "@/data/state-dv-laws";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "State Domestic Violence Defense, Penalties, and Defense Questions",
  description:
    "Domestic violence charge breakdown by state: penalty ranges, statute numbers, enhancements, and the questions your attorney needs to answer.",
  alternates: { canonical: `${SITE_URL}/domestic-violence-defense` },
};

export default function Page() {
  const slugs = allStateDvLawsSlugs().sort();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
        Domestic Violence Defense by State
      </h1>
      <p className="mt-4 text-zinc-400">
        Domestic violence charges carry state penalties plus collateral federal consequences (including firearms prohibition under Lautenberg). Penalty ranges and enhancements vary significantly by jurisdiction. Pick your state for the specifics.
      </p>
      <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slugs.map((slug) => (
          <Link
            key={slug}
            href={`/domestic-violence-defense/${slug}`}
            className="rounded-lg border border-zinc-500 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300 transition-colors hover:border-amber-500/40 hover:text-white"
          >
            {STATE_DV_LAWS[slug].name}
          </Link>
        ))}
      </div>
    </div>
  );
}
