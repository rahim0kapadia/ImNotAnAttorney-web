/**
 * /masked — Anonymous-by-necessity manifesto + entity anchor.
 *
 * Strategic purpose (elite panel consensus 2026-04-17):
 *  - Dreyer: DefinedTerm schema anchor teaches AI engines that
 *    "Anonymous-by-necessity legal research" = INAA (permanent category lock).
 *  - Apex: L1 Strategic Narrative — signed manifesto from "Researchers,
 *    Defendants, still fighting" pinned to footer + nav + email footer.
 *  - Brunson: squeeze page that can later host a /masked video funnel +
 *    Founder's File tripwire.
 *  - Dunford: category identity lock-in — "Built from inside an open case file."
 *  - Godin: the mask is the Purple Cow, gets its own room.
 *  - Chaperon: Tiny Digital World homepage for the Researchers tribe.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TIER_CORE } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Why We Stay Masked | ImNotAnAttorney",
  description:
    "We stay masked because our files aren't closed — and that's exactly why we can read yours. INAA is defendant-built intelligence, anonymous by necessity.",
  alternates: { canonical: `${SITE_URL}/masked` },
  openGraph: {
    title: "We stay masked because our files aren't closed.",
    description:
      "INAA is defendant-built intelligence, anonymous by necessity. We read your case the way we read ours.",
  },
};

const maskFaqs = [
  {
    question: "Why are you anonymous?",
    answer:
      "Because our own case files aren't closed. Some of our founders have active cases right now — trial prep, discovery fights, motion deadlines. Using our real names would hand the same legal system that already has files on us more ammunition. Every courtroom is a closed ecosystem where the judge, prosecutor, and defense attorney know each other by face. We don't give them a face to remember. We give you the questions they can't trace back to anyone they can lean on.",
  },
  {
    question: "Is this legal?",
    answer:
      "Yes. Nothing in law requires a research service to be fronted by a named individual. We comply fully with UPL (Unauthorized Practice of Law) rules — we provide legal INFORMATION, not legal ADVICE. We do not represent defendants in court. We generate case-specific questions for defendants to bring to their own attorneys. Our methodology is documented, sourced, and repeatable.",
  },
  {
    question: "Who's behind this?",
    answer:
      "Researchers. Defendants, still fighting. Our founding researcher found 68.3 grams of missing evidence in his own drug case — evidence his attorney never mentioned. That discovery changed the case and changed how we read every case after. He's still in trial prep for his own charges. That's the point.",
  },
  {
    question: "Why should I trust a masked service with my case?",
    answer:
      "Trust with trust-broken people comes from shared stakes, not credentials. Every other legal-tech founder has already shown their face and filed their LLC under their name. They're selling from outside the system. We're inside it right now. The mask isn't hiding something — it's showing something: the same fight you're in. When our files close, we'll still be here. Still masked. Because the next defendant coming through deserves the same cover we had.",
  },
  {
    question: "Will my case be handled anonymously too?",
    answer:
      "Your intake is confidential. We never share your case with your attorney or any third party. Your identity is yours to disclose — not ours. The report you receive is yours alone. You decide whether and when to use it, and with whom.",
  },
];

const maskFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: maskFaqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

const definedTermSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  "@id": `${SITE_URL}/masked#anonymous-by-necessity`,
  name: "Anonymous by Necessity",
  description:
    "A positioning category where a legal research service stays anonymous because its founding researchers have active, open criminal cases and cannot safely be named publicly. Coined and operationalized by ImNotAnAttorney in 2026.",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "INAA Brand Doctrine",
    url: `${SITE_URL}/masked`,
  },
  termCode: "ABN-001",
};

export default function MaskedPage() {
  return (
    <div className="px-4 py-16 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(maskFaqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSchema) }}
      />

      <article className="mx-auto max-w-3xl">
        <FadeInUp>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">
            Category identity &middot; Anonymous by Necessity
          </p>
        </FadeInUp>
        <FadeInUp delay={0.05}>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl">
            We stay masked because our files aren&apos;t closed
            <span className="text-amber-400"> &mdash; and that&apos;s exactly why we can read yours.</span>
          </h1>
        </FadeInUp>
        <FadeInUp delay={0.08}>
          <p className="mt-6 font-display text-xl leading-snug text-zinc-200 md:text-2xl">
            The legal system has a file on you.
            <br />
            <span className="font-semibold text-amber-400">We help you build one on them.</span>
          </p>
        </FadeInUp>
        <FadeInUp delay={0.1}>
          <p className="mt-8 text-lg leading-relaxed text-zinc-300">
            This is a manifesto. It is also the answer to the questions a scared defendant asks before spending a dollar at 2am: <em>Who built this? Why won&apos;t they show their face? Can I trust them anyway?</em>
          </p>
        </FadeInUp>

        <FadeInUp delay={0.15}>
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-white">The mask is the proof.</h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-300">
              Our founding researcher is a defendant. Today. Not ten years ago. Not &ldquo;a former client.&rdquo; Right now. Trial date on the calendar. Motions being filed against him while you read this page. When he says he knows what it feels like to open a 500-page discovery file at 2am and realize nobody else is going to read it for you &mdash; he means this week.
            </p>
            <p className="mt-4 text-base leading-relaxed text-zinc-300">
              That is a capability no LinkedIn-fronted competitor has. <strong className="text-white">Threat-model fluency</strong> &mdash; knowing what the prosecutor will do with a document, because they&apos;re doing it to us right now. <strong className="text-white">Untraceability</strong> &mdash; the questions we hand you can&apos;t be socially leaned on through the local bar network. <strong className="text-white">Shared stakes</strong> &mdash; we don&apos;t read your case from a consultant&apos;s chair. We read it the way we read ours.
            </p>
          </section>
        </FadeInUp>

        <FadeInUp delay={0.2}>
          <section className="mt-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">The receipt</p>
            <p className="mt-3 text-base leading-relaxed text-zinc-200">
              <span className="font-semibold text-white">68.3 grams</span> of evidence in a drug-trafficking case. Lab weight versus scene weight, 73% discrepancy. Attorney never mentioned it. Confidential-informant phone number attributed to both the informant and the defendant in the same report. 21 latent fingerprints, zero matches. Drug type mismatch between the charging document and the lab report.
            </p>
            <p className="mt-3 text-base leading-relaxed text-zinc-200">
              That is what one defendant found by reading his own file. That is the read we run on yours. That is why we stay masked until his file closes &mdash; and why the mask doesn&apos;t come off when it does.
            </p>
          </section>
        </FadeInUp>

        <FadeInUp delay={0.25}>
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-white">Why the mask stays on.</h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-300">
              Every courtroom in America is a closed ecosystem. The judge, the prosecutor, the defense attorney &mdash; they know each other by face and by first name. They work together next week on a different case. Your attorney doesn&apos;t want to be the one who showed up with &ldquo;the INAA questions.&rdquo; The prosecutor doesn&apos;t want their witnesses cross-examined using our framework. The judge doesn&apos;t want our methodology in the record.
            </p>
            <p className="mt-4 text-base leading-relaxed text-zinc-300">
              So we don&apos;t give them a face to remember. We give you the questions they can&apos;t trace back to anyone they can lean on. When our files close, we&apos;ll still be here. Still masked. Because the next defendant coming through deserves the same cover we had.
            </p>
          </section>
        </FadeInUp>

        <FadeInUp delay={0.3}>
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-white">Common questions about the mask.</h2>
            <div className="mt-6 space-y-6">
              {maskFaqs.map((faq) => (
                <div key={faq.question} className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                  <p className="font-bold text-amber-400">{faq.question}</p>
                  <p className="mt-3 text-base leading-relaxed text-zinc-300">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </FadeInUp>

        <FadeInUp delay={0.35}>
          <section className="mt-14 text-center">
            <p className="font-display text-xl italic text-amber-400 md:text-2xl">
              &mdash; Researchers. Defendants, still fighting.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                href="/checkout?tier=case-decoder"
                className="rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black shadow-lg shadow-amber-500/10 transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-amber-500/30"
              >
                Get Your 15 Questions &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>
              <p className="text-sm text-zinc-400">
                Read by researchers who are still reading their own files.
              </p>
              <Link
                href="/score"
                className="mt-4 text-sm font-semibold text-amber-400 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-300"
              >
                Or start with the free Masked Researcher’s First Read &rarr;
              </Link>
            </div>
          </section>
        </FadeInUp>
      </article>
    </div>
  );
}
