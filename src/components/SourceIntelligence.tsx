/**
 * SourceIntelligence — displays the elite defense attorneys whose
 * methodologies inform the content of a blog post.
 * Automatically selects attorneys based on the post's category.
 */

const ATTORNEYS: Record<
  string,
  { name: string; credential: string; method: string }[]
> = {
  "drug-cases": [
    {
      name: "Jeffrey Lichtman",
      credential: "El Chapo lead counsel, Gotti Jr. (charges dismissed)",
      method: "7-pillar CI destruction playbook",
    },
    {
      name: "Barry Scheck",
      credential: "Innocence Project (375+ exonerations), OJ Simpson DNA defense",
      method: "Chain of custody protocol",
    },
    {
      name: "Ron Chapman II",
      credential: "Federal drug defense specialist, former prosecutor",
      method: "Weight discrepancy and substance variance protocols",
    },
  ],
  dui: [
    {
      name: "Barry Scheck",
      credential: "Innocence Project co-founder, forensic evidence pioneer",
      method: "Forensic methodology analysis",
    },
    {
      name: "F. Lee Bailey",
      credential: "Sam Sheppard retrial acquittal, OJ defense team",
      method: "Evidence analysis and witness examination framework",
    },
  ],
  "white-collar": [
    {
      name: "Alan Dershowitz",
      credential: "Harvard Law, Von Bulow reversal",
      method: "Constitutional and appellate framework",
    },
    {
      name: "Benjamin Brafman",
      credential: "DSK, Martin Shkreli defense",
      method: "Jury psychology methodology",
    },
  ],
  "general-defense": [
    {
      name: "Gerry Spence",
      credential: "Never lost a criminal case",
      method: "Investigation pattern analysis",
    },
    {
      name: "Alan Dershowitz",
      credential: "Harvard Law youngest full professor, Von Bulow reversal",
      method: "Constitutional hooks for motion/appellate issues",
    },
    {
      name: "Barry Scheck",
      credential: "Innocence Project (375+ exonerations)",
      method: "Forensic evidence methodology",
    },
  ],
};

export function SourceIntelligence({ category }: { category: string }) {
  const attorneys =
    ATTORNEYS[category] || ATTORNEYS["general-defense"];

  return (
    <div className="not-prose mb-8 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
        Source Intelligence
      </p>
      <p className="mt-2 text-sm text-zinc-400">
        Research in this article is informed by documented methodologies from:
      </p>
      <div className="mt-3 space-y-2">
        {attorneys.map((a) => (
          <div key={a.name} className="text-sm">
            <span className="font-semibold text-white">{a.name}</span>
            <span className="text-zinc-400"> — {a.credential}. </span>
            <span className="text-zinc-500">{a.method}.</span>
          </div>
        ))}
      </div>
    </div>
  );
}
