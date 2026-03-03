/**
 * DUI Defense Playbook Sales Page (/playbook/dui-first-offense)
 *
 * Long-form conversion page for the $97 instant-download DUI Defense Playbook.
 * Follows existing dark theme (bg-stone-950, zinc text, amber accents).
 *
 * Sections: Hero → Agitate → Proof → Value Stack → Guarantee → Who It's For →
 * Methodology → Urgency → FAQ → Final CTA → Upgrade Path
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DUI Defense Playbook — $97 Instant Download | ImNotAnAttorney",
  description:
    "23 questions your DUI attorney hopes you never ask. Breathalyzer checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download. $97.",
  alternates: {
    canonical: "https://imnotanattorney.com/playbook/dui-first-offense",
  },
  openGraph: {
    title: "DUI Defense Playbook — $97 Instant Download",
    description:
      "23 questions your DUI attorney hopes you never ask. Instant PDF. $97.",
    url: "https://imnotanattorney.com/playbook/dui-first-offense",
    type: "website",
  },
};

const FAQ_ITEMS = [
  {
    q: "Is this legal advice?",
    a: "No. We provide legal INFORMATION — not legal ADVICE. The Playbook compiles documented defense strategies from elite DUI attorneys into an information resource. Your attorney gives legal advice. We give you the questions.",
  },
  {
    q: "What if I already have an attorney?",
    a: "That's exactly who this is for. The Playbook makes every conversation with your attorney more productive. Most defendants leave attorney meetings without knowing what to ask. This gives you 23 specific questions.",
  },
  {
    q: "What if I need something more personalized?",
    a: "Your $97 is fully credited toward the Case Decoder ($197) within 30 days. The Case Decoder builds 15 questions from YOUR charges, YOUR state, YOUR stage. The upgrade costs just $100.",
  },
  {
    q: "How is this delivered?",
    a: "Instant PDF download. After payment, you'll receive an email with a download link within 60 seconds. No intake form, no waiting.",
  },
  {
    q: "What's your refund policy?",
    a: "If you read this Playbook and cannot find at least 5 questions you never thought to ask your attorney, send us one email and we'll refund every dollar. No explanation required.",
  },
  {
    q: "Is this just generic information I can find online?",
    a: "Everything here was built from documented defense strategies used by attorneys who have tried 500+ DUI cases. This is not a blog post. It's the prosecution pattern playbook — inverted.",
  },
  {
    q: "What's the Defense Playbook vs the Case Decoder?",
    a: "The Playbook is generic to all DUI first offense cases — 23 questions any DUI defendant should ask. The Case Decoder ($197) is personalized to YOUR specific situation with case-specific questions, email templates, and a 7-day action plan. Your $97 Playbook purchase is credited toward the Case Decoder.",
  },
];

export default function DUIPlaybookPage() {
  const checkoutUrl = "/checkout?tier=dui-first-offense";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* HERO */}
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          DUI Defense Playbook
        </p>
        <h1 className="mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
          The Breathalyzer Reading Is Not the Case.
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          23 questions your DUI attorney hopes you never ask — plus a case stage
          roadmap, red flag checklist, and attorney accountability scorecard.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="text-4xl font-extrabold text-amber-400">$97</span>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            Instant PDF
          </span>
        </div>
        <Link
          href={checkoutUrl}
          className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-colors hover:bg-amber-400"
        >
          Get Instant Access — $97
        </Link>
        <p className="mt-3 text-xs text-zinc-500">
          Download within 60 seconds of purchase. No intake form. No waiting.
        </p>
      </section>

      {/* AGITATE */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          You shouldn&apos;t have to figure this out from Reddit threads.
        </h2>
        <div className="mt-6 space-y-4 text-zinc-400">
          <p>
            The night you got arrested, everything felt abstract. The charge, the
            bail, the court date — you nodded along because you didn&apos;t know
            what else to do.
          </p>
          <p>
            Now you&apos;re home. Maybe it&apos;s 2am. And you&apos;re Googling
            everything. You want to know: how bad is this? What does a DUI First
            Offense actually mean for your license, your job, your life?
          </p>
          <p>
            Is your attorney telling you the truth when they say this is
            manageable?
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "The DMV Deadline",
              text: "You have 10 days to fight your license suspension. Separate from the criminal case. Most defendants don't know until it's too late.",
            },
            {
              title: "BAC ≠ Your Case",
              text: "Between the breathalyzer and the courtroom: calibration records, operator certification, observation period. The number is challengeable.",
            },
            {
              title: '"Trust Me" Isn\'t a Strategy',
              text: "If your attorney's plan is 'wait for the plea offer' — that's not a plan. That's an assembly line.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <p className="text-sm font-semibold text-amber-400">{card.title}</p>
              <p className="mt-2 text-sm text-zinc-400">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROOF — Named attorneys */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          Built from the strategies of elite DUI defense attorneys
        </h2>
        <div className="mt-8 space-y-6">
          {[
            {
              name: "Lawrence Taylor",
              title: 'Author of "Drunk Driving Defense" — the attorney textbook on DUI law',
              insight:
                "Documented dozens of cases where breathalyzer readings were suppressed. His calibration-first methodology is the foundation of Section 4.",
            },
            {
              name: "Barry Scheck",
              title: "Co-founder of the Innocence Project",
              insight:
                "Forensic evidence is only as reliable as the humans who handle it. His chain of custody protocol informs every evidence question in the Playbook.",
            },
            {
              name: "F. Lee Bailey",
              title: "Legendary trial attorney",
              insight:
                "Pioneered the cross-examination techniques that exposed procedural failures in breathalyzer and field sobriety testing.",
            },
          ].map((expert) => (
            <div
              key={expert.name}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6"
            >
              <p className="font-semibold text-white">{expert.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{expert.title}</p>
              <p className="mt-3 text-sm text-zinc-400">{expert.insight}</p>
            </div>
          ))}
        </div>
      </section>

      {/* VALUE STACK */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          What&apos;s inside
        </h2>
        <div className="mt-8 space-y-4">
          {[
            {
              title: "Charge Reality Report",
              desc: "DUI first offense elements explained in plain English — dual-track (DMV + criminal), sentencing ranges, what the prosecution must prove.",
              value: "$297",
            },
            {
              title: "23 Questions Your DUI Attorney Hopes You Never Ask",
              desc: "Derived from 40+ elite defense attorneys' techniques. 6-part format per question with follow-up probes. The research alone took months.",
              value: "$197",
            },
            {
              title: "DUI Case Stage Roadmap",
              desc: "Arrest through resolution timeline with milestones — DMV deadline, arraignment, pre-trial, discovery, resolution. Know what should happen and when.",
              value: "$97",
            },
            {
              title: "Red Flag Checklist",
              desc: "12 specific things that could get evidence thrown out — breathalyzer calibration, FST protocol, 15-minute observation, officer training records.",
              value: "$97",
            },
            {
              title: "Attorney Accountability Scorecard",
              desc: "Rate your attorney on 10 behaviors before it's too late to switch. A $5,000 attorney who challenges evidence beats a $10,000 one who takes the plea.",
              value: "$97",
            },
          ].map((section) => (
            <div
              key={section.title}
              className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div>
                <p className="font-semibold text-white">{section.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{section.desc}</p>
              </div>
              <p className="shrink-0 text-sm text-zinc-500 line-through">
                {section.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <p className="text-sm text-zinc-400">
            Total value: <span className="text-zinc-300 line-through">$785</span>
          </p>
          <p className="mt-2 text-3xl font-extrabold text-amber-400">
            Your price: $97
          </p>
          <Link
            href={checkoutUrl}
            className="mt-4 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-colors hover:bg-amber-400"
          >
            Get Instant Access — $97
          </Link>
        </div>
      </section>

      {/* GUARANTEE */}
      <section className="mt-20">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Our Guarantee
          </p>
          <p className="mt-4 text-lg font-semibold text-white">
            5 questions you never thought to ask — or full refund.
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            If you read this Playbook and cannot find at least 5 questions you
            have never thought to ask your attorney, send us one email and we
            will refund every dollar. No explanation required.
          </p>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="mt-20">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="text-lg font-bold text-amber-400">
              This is for you if...
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "You were arrested for DUI (first offense)",
                "You have an attorney but aren't sure they're doing enough",
                "Your attorney says 'trust me' without specifics",
                "You want to know what questions to ask before your next meeting",
                "You want to understand the DMV deadline and your timeline",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-zinc-400">
                  <span className="mt-0.5 text-amber-400">&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-500">
              This is NOT for you if...
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "You're looking for legal advice (we provide information, not advice)",
                "You want someone to represent you in court",
                "Your case involves a felony DUI (repeat offense)",
                "You've already been sentenced",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-zinc-500">
                  <span className="mt-0.5">&#10007;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* METHODOLOGY DISCLOSURE */}
      <section className="mt-20">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Important
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            This report provides legal INFORMATION — not legal ADVICE. The
            analysis draws on methods developed by elite defense attorneys,
            applied to common DUI first offense patterns. Your attorney remains
            the final authority on strategy decisions.
          </p>
        </div>
      </section>

      {/* URGENCY */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          Time-sensitive deadlines in your DUI case
        </h2>
        <div className="mt-6 space-y-4">
          {[
            {
              deadline: "10 days after arrest",
              what: "DMV administrative hearing deadline. Miss this and your license suspension is automatic.",
            },
            {
              deadline: "Before pre-trial",
              what: "Motion filing windows. Suppression motions, Franks hearings, and dismissal motions must be filed before these close.",
            },
            {
              deadline: "30 days from purchase",
              what: "Your $97 upgrade credit toward the Case Decoder ($197). After 30 days, the credit expires.",
            },
          ].map((item) => (
            <div
              key={item.deadline}
              className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="shrink-0 rounded bg-amber-500/10 px-3 py-1">
                <p className="text-xs font-bold text-amber-400">{item.deadline}</p>
              </div>
              <p className="text-sm text-zinc-400">{item.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          Frequently asked questions
        </h2>
        <div className="mt-8 space-y-4">
          {FAQ_ITEMS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-white">
                {faq.q}
              </summary>
              <p className="px-6 pb-4 text-sm text-zinc-400">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mt-20 text-center">
        <p className="text-sm text-zinc-500">
          A 30-minute attorney consultation costs $150-$250.
        </p>
        <p className="mt-2 text-3xl font-extrabold text-white">
          The DUI Defense Playbook is <span className="text-amber-400">$97</span>.
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Instant PDF. 23 questions. 12 red flags. Case stage roadmap. Attorney
          scorecard.
        </p>
        <Link
          href={checkoutUrl}
          className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-colors hover:bg-amber-400"
        >
          Get Instant Access — $97
        </Link>
        <p className="mt-3 text-xs text-zinc-500">
          5 questions you never thought to ask — or full refund.
        </p>
      </section>

      {/* UPGRADE PATH */}
      <section className="mt-16">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-xs font-semibold text-zinc-400">
            Need case-specific questions?
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            The{" "}
            <Link
              href="/checkout?tier=case-decoder"
              className="font-semibold text-amber-400 underline decoration-amber-400/50"
            >
              Case Decoder ($197)
            </Link>{" "}
            builds 15 personalized questions from YOUR charges, YOUR state, YOUR
            stage — plus email templates, phone scripts, and a 7-day action plan.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Your $97 Playbook purchase is credited toward the Case Decoder.
            Upgrade for $100 within 30 days.
          </p>
        </div>
      </section>

      {/* FAQPage + Product Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "DUI Defense Playbook",
            description:
              "23 questions your DUI attorney hopes you never ask. Breathalyzer checklist, case stage roadmap, red flag checklist, attorney scorecard. Instant PDF download.",
            url: "https://imnotanattorney.com/playbook/dui-first-offense",
            brand: { "@type": "Organization", name: "ImNotAnAttorney" },
            offers: {
              "@type": "Offer",
              price: "97.00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: "https://imnotanattorney.com/checkout?tier=dui-first-offense",
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((faq) => ({
              "@type": "Question",
              name: faq.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.a,
              },
            })),
          }),
        }}
      />
    </div>
  );
}
