import Link from "next/link";

const tiers = [
  {
    name: "Question Pack",
    price: "$49",
    anchor: null,
    description: "Start asking the right questions today",
    features: [
      "75+ case-specific questions for your attorney",
      "Organized by topic (discovery, motions, strategy)",
      "Delivered via email within 24 hours",
      "Works for any criminal charge",
    ],
    cta: "Get Your Questions",
    featured: false,
  },
  {
    name: "Case Audit",
    price: "$497",
    anchor: "vs. $1,500+ for a second-opinion attorney",
    description: "Full discovery review + custom question report",
    features: [
      "Everything in Question Pack",
      "Full discovery document analysis",
      "Identify missed motions & deadlines",
      "Prosecution weakness assessment",
      "Custom 15-30 page case report",
      "Delivered within 72 hours",
      "One follow-up revision included",
    ],
    cta: "Get Your Audit",
    featured: true,
  },
  {
    name: "War Room",
    price: "$1,997",
    anchor: "Less than 10% of most retainers",
    description: "Ongoing case monitoring until resolution. Limited to 10 active clients.",
    features: [
      "Everything in Case Audit",
      "Weekly case status reviews",
      "Updated question reports before every court date",
      "Motion deadline tracking & alerts",
      "Plea deal analysis & comparison",
      "Direct email access to research team",
      "Court date preparation briefs",
      "Unlimited revisions until case closes",
    ],
    cta: "Enter the War Room",
    featured: false,
  },
];

export function PricingTable() {
  return (
    <div>
      {/* Anchor */}
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-400">
          The average criminal defense retainer is{" "}
          <span className="font-bold text-white">$5,000–$25,000</span>. A
          second opinion from another attorney costs{" "}
          <span className="font-bold text-white">$1,500+</span> for one hour.
        </p>
        <p className="mt-2 text-sm text-amber-400 font-semibold">
          We start at $49. Your freedom is worth asking the right questions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
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
              <span className="text-3xl font-bold text-white">{tier.price}</span>
            </div>
            {tier.anchor && (
              <p className="mt-1 text-xs text-amber-400/70">{tier.anchor}</p>
            )}
            <p className="mt-2 text-sm text-zinc-400">{tier.description}</p>
            <ul className="mt-6 flex-1 space-y-3">
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

      {/* Guarantee */}
      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-lg font-bold text-white">
          Deliverable Guarantee
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Every question, every page, on time — or you pay nothing. We
          can&apos;t guarantee your attorney will change. We guarantee
          you&apos;ll have every tool to make them.
        </p>
      </div>
    </div>
  );
}
