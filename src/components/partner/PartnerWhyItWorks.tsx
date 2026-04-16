/**
 * "Why Defendants Buy" section, shared between /partners and /partners/bondsman.
 */

const REASONS = [
  {
    title: "7-Day Window",
    desc: "Most purchases happen within 7 days of arrest \u2014 the exact window when you\u2019re handing them your business card.",
  },
  {
    title: "Zero Explanation",
    desc: "Defendants already know they need help. You just hand them a card with a code. The website does the selling.",
  },
  {
    title: "Helps Your Client",
    desc: "Better-informed defendants make better decisions. This is genuinely useful \u2014 not a gimmick.",
  },
  {
    title: "Passive Income",
    desc: "No selling, no follow-up, no tracking. Hand out codes, check your dashboard, collect payouts.",
  },
];

export function PartnerWhyItWorks() {
  return (
    <div className="grid md:grid-cols-2 gap-6 text-left">
      {REASONS.map((item) => (
        <div key={item.title} className="bg-zinc-900/50 rounded-xl border border-zinc-700 p-6">
          <p className="font-bold text-amber-400 mb-2">{item.title}</p>
          <p className="text-zinc-400">{item.desc}</p>
        </div>
      ))}
    </div>
  );
}
