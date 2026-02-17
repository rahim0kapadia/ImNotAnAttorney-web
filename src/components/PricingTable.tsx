import Link from "next/link";

const tiers = [
  {
    name: "Case Audit",
    price: "$497",
    description: "One-time discovery review + question report",
    features: [
      "Full discovery document review",
      "Custom question report for your attorney",
      "Identify missed motions & deadlines",
      "Delivered within 72 hours",
    ],
    cta: "Get Your Audit",
    featured: false,
  },
  {
    name: "Full Package",
    price: "$1,997",
    description: "Ongoing tracking + weekly updates",
    features: [
      "Everything in Case Audit",
      "Weekly case monitoring",
      "Updated question reports",
      "Motion deadline tracking",
      "Email support",
    ],
    cta: "Start Full Package",
    featured: true,
  },
  {
    name: "VIP",
    price: "$4,997",
    description: "Priority access + direct support",
    features: [
      "Everything in Full Package",
      "Priority turnaround (24 hours)",
      "Direct access to research team",
      "Court date preparation briefs",
      "Unlimited question reports",
    ],
    cta: "Go VIP",
    featured: false,
  },
];

export function PricingTable() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={`rounded-xl border p-8 ${
            tier.featured
              ? "border-amber-500 bg-zinc-900"
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
            <span className="text-3xl font-bold text-white">{tier.price}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">{tier.description}</p>
          <ul className="mt-6 space-y-3">
            {tier.features.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-sm text-zinc-300"
              >
                <span className="mt-0.5 text-amber-400">&#10003;</span>
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/intake"
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
  );
}
