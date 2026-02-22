import Link from "next/link";

const tiers = [
  {
    name: "Case Decoder",
    price: "$97",
    anchor: null,
    description: "24-hour turnaround. No discovery needed.",
    features: [
      "Plain-English charge breakdown",
      "Case stage benchmark",
      "Attorney accountability checklist",
      "10-15 targeted questions for your attorney",
      "Red flags for your stage",
      "Common motion types for your charge category",
      "Attorney Accountability Score — 0-100 rating",
    ],
    cta: "Get Your Case Decoder",
    featured: false,
    tier: "case-decoder",
    bestFor: "Just arrested, need clarity",
  },
  {
    name: "Intelligence Brief",
    price: "$497",
    anchor: "vs. $1,500+ for a second-opinion attorney",
    description:
      "Judge intel + 35-50 questions. No discovery needed.",
    features: [
      "Everything in Case Decoder",
      "Charge exposure map",
      "Judge intelligence profile",
      "Jurisdiction profile",
      "Attorney accountability timeline",
      "Motion landscape report",
      "Pre-discovery red flags",
      "35-50 targeted questions",
      "Attorney Accountability Score",
      "Prosecution Case Strength Map",
    ],
    cta: "Get Your Intelligence Brief",
    featured: true,
    tier: "intelligence-brief",
    bestFor: "Pre-trial, want judge intel + questions",
  },
  {
    name: "The X-Ray",
    price: "$997",
    anchor: null,
    description: "Full discovery analysis. 5-7 business days.",
    features: [
      "Everything in Intelligence Brief",
      "Discovery document index",
      "Comprehensive timeline",
      "Discrepancy report",
      "Red flags summary",
      "35+ case-specific questions",
      "Discovery Health Score",
      "Defense Opportunity Index",
    ],
    cta: "Get The X-Ray",
    featured: false,
    tier: "x-ray",
    bestFor: "Have discovery, need deep analysis",
  },
  {
    name: "The War Room",
    price: "$1,997",
    anchor: "Less than 10% of most retainers",
    description:
      "Full intelligence operation. 25-28 days + weekly updates.",
    features: [
      "Everything in The X-Ray",
      "Judge & prosecution dossiers",
      "Witness analysis (up to 8)",
      "Questions about motion timing for your attorney",
      "Case law reference package",
      "Research-based questions about case strategy for your attorney",
      "Attorney delivery package",
      "Weekly updates for duration of case",
      "Evidence Chain Audit",
      "Witness Reliability Rankings",
    ],
    cta: "Enter The War Room",
    featured: false,
    tier: "war-room",
    bestFor: "Complex case, need ongoing intelligence",
  },
  {
    name: "The Situation Room",
    price: "$9,997",
    anchor: "Trial Intelligence Operations. Requires War Room.",
    description:
      "Evening debrief + morning prep brief every trial day. 24-48hr priority turnaround.",
    features: [
      "Everything in The War Room",
      "Trial Intelligence Operations — daily trial prep cycle",
      "Research on all witness backgrounds and credibility questions for your attorney",
      "Research summaries your attorney can use when drafting reply briefs",
      "Attack intelligence packages",
      "Research-based questions about jury selection and trial strategy for your attorney",
      "JOA research brief — every applicable standard, formatted for your attorney",
      "Trial morning cheat sheets",
      "Priority Response Line — 2hr during trial prep, 4hr during trial",
      "Direct access channel",
      "All scored deliverables from lower tiers",
    ],
    cta: "Enter The Situation Room",
    featured: false,
    tier: "situation-room",
    bestFor: "Headed to trial, need everything",
  },
];

const addons = [
  {
    name: "Extra Witness Intel",
    price: "$149",
    unit: "per witness",
    description: "Additional witness dossier beyond your tier limit",
    availability: "War Room & Situation Room",
  },
  {
    name: "Standalone Witness Pack",
    price: "$297",
    unit: "up to 3 witnesses",
    description: "Witness analysis from your discovery documents",
    availability: "Any tier with discovery",
  },
];

interface PricingTableProps {
  maxTiers?: number;
}

export function PricingTable({ maxTiers }: PricingTableProps) {
  const visibleTiers = maxTiers ? tiers.slice(0, maxTiers) : tiers;
  const hasHiddenTiers = maxTiers ? tiers.length > maxTiers : false;
  return (
    <div>
      {/* Anchor */}
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-400">
          The average criminal defense retainer is{" "}
          <span className="font-bold text-white">$5,000-$25,000</span>. A
          second opinion from another attorney costs{" "}
          <span className="font-bold text-white">$1,500+</span> for one hour.
        </p>
        <p className="mt-2 text-sm text-amber-400 font-semibold">
          We start at $97. Your freedom is worth asking the right questions.
        </p>
      </div>

      {/* Main tiers - first 3 (or maxTiers) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visibleTiers.slice(0, 3).map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col rounded-xl border p-8 ${
              tier.featured
                ? "border-amber-500 bg-zinc-900 relative"
                : "border-zinc-800 bg-zinc-900/50"
            }`}
          >
            {tier.featured && (
              <span className="mb-4 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                Most Popular
              </span>
            )}
            <h3 className="text-xl font-bold text-white">{tier.name}</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white">
                {tier.price}
              </span>
            </div>
            {tier.anchor && (
              <p className="mt-1 text-xs text-amber-400/70">{tier.anchor}</p>
            )}
            <p className="mt-2 text-sm text-zinc-400">{tier.description}</p>
            {tier.bestFor && (
              <p className="mt-2 text-xs text-amber-400/70">Best for: {tier.bestFor}</p>
            )}
            <ul className="mt-6 flex-1 space-y-3">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-zinc-300"
                >
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={`/checkout?tier=${tier.tier}`}
              className={`mt-8 block rounded-lg py-3 text-center text-sm font-semibold transition-colors ${
                tier.featured
                  ? "bg-amber-500 text-black hover:bg-amber-400"
                  : "border border-zinc-700 text-white hover:border-zinc-500"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* "See premium tiers" link when truncated */}
      {hasHiddenTiers && (
        <div className="mt-8 text-center">
          <Link
            href="/services"
            className="inline-block rounded-lg border border-zinc-700 px-8 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            See premium tiers &rarr;
          </Link>
        </div>
      )}

      {/* Premium tiers */}
      {!hasHiddenTiers && <div className="mt-6 grid gap-6 md:grid-cols-2">
        {tiers.slice(3).map((tier) => (
          <div
            key={tier.name}
            className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-8"
          >
            <h3 className="text-xl font-bold text-white">{tier.name}</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white">
                {tier.price}
              </span>
            </div>
            {tier.anchor && (
              <p className="mt-1 text-xs text-amber-400/70">{tier.anchor}</p>
            )}
            <p className="mt-2 text-sm text-zinc-400">{tier.description}</p>
            {tier.bestFor && (
              <p className="mt-2 text-xs text-amber-400/70">Best for: {tier.bestFor}</p>
            )}
            <ul className="mt-6 flex-1 space-y-3">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-zinc-300"
                >
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={`/checkout?tier=${tier.tier}`}
              className="mt-8 block rounded-lg border border-zinc-700 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-zinc-500"
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>}

      {/* Add-ons */}
      {!hasHiddenTiers && <div className="mt-6 grid gap-4 md:grid-cols-2">
        {addons.map((addon) => (
          <div
            key={addon.name}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
          >
            <div className="flex items-baseline justify-between">
              <h4 className="font-semibold text-white">{addon.name}</h4>
              <div className="text-right">
                <span className="text-lg font-bold text-white">
                  {addon.price}
                </span>
                <span className="ml-1 text-xs text-zinc-400">
                  {addon.unit}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{addon.description}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Available for: {addon.availability}
            </p>
          </div>
        ))}
      </div>}

      {/* Upgrade Credits */}
      <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
        <p className="text-sm font-semibold text-amber-400">
          Upgrade Credits: 100% Applied
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Start with the Case Decoder for $97. If you upgrade later, every
          dollar you paid is credited toward the next tier. No money wasted.
          12-month expiration.
        </p>
      </div>

      {/* Guarantee */}
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-lg font-bold text-white">Deliverable Guarantee</p>
        <p className="mt-2 text-sm text-zinc-400">
          Every question, every report, on time — or your money back. We
          can&apos;t guarantee your attorney will change. We guarantee
          you&apos;ll have the intelligence to hold them accountable.
        </p>
      </div>
    </div>
  );
}
