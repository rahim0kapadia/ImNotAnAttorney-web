/**
 * About Page (/about)
 *
 * Founding team story page using an "epiphany bridge" narrative, the copywriting
 * technique where you share the personal experience that led to creating the
 * product. This builds trust by demonstrating lived experience as defendants.
 *
 * User journey position:
 *   Nav / footer -> THIS PAGE -> /services (primary CTA) or /blog (secondary CTA)
 *
 * Narrative structure (epiphany bridge):
 *   1. Hero, "Built by defendants. For defendants." (identity statement)
 *   2. The Setup, One founder facing trafficking charges, paid thousands for attorney,
 *      got silence and inaction for months
 *   3. The Epiphany, Opened the discovery himself, found 4 critical issues
 *      in one week that the attorney never mentioned:
 *        - 73% weight discrepancy (93.9g -> 25.59g = 68.3g missing)
 *        - CI phone dual attribution
 *        - Drug type mismatch (amphetamine charged, MDMA/MDA found)
 *        - 21 fingerprints, zero match
 *   4. The Mission, Built a research system from 40+ elite defense attorneys'
 *      published methodologies. Now available to any defendant.
 *   5. How We Do It, Three differentiators (deep research, real case experience,
 *      plain English translation)
 *   6. What We're NOT, UPL compliance section. Five explicit disclaimers:
 *      not a law firm, no legal advice, no court representation, no attorney
 *      replacement, no outcome guarantees. "Know What They Know." tagline.
 *   7. CTA, Services page + blog links
 *   8. Lead capture, Email opt-in fallback
 *
 * Conversion role: This page handles the "who are these people?" objection.
 * Team-as-defendants credibility is the strongest trust signal for the
 * target audience (defendants who feel their attorney is failing them).
 */
import { LeadCapture } from "@/components/LeadCapture";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About, Built by Defendants, for Defendants",
  description:
    "ImNotAnAttorney was built by defendants, for defendants. We provide legal research and questions, not legal advice.",
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
  openGraph: {
    title: "About, Built by Defendants, for Defendants",
    description:
      "ImNotAnAttorney was built by defendants, for defendants. We provide legal research and questions, not legal advice.",
    url: `${SITE_URL}/about`,
  },
};

export default function AboutPage() {
  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "About" },
            ],
          }),
        }}
      />
      {/* Organization JSON-LD for about page (Barnard: entity establishment) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "ImNotAnAttorney",
            url: SITE_URL,
            description: "Built by defendants who experienced the criminal justice system firsthand. We research what's in your case file so you can ask the right questions.",
            foundingDate: "2026",
          }),
        }}
      />
      <div className="mx-auto max-w-3xl">
        {/* HERO, Identity statement that immediately establishes credibility */}
        <FadeInUp>
        <h1 className="font-display text-3xl font-bold text-white md:text-5xl">
          Built by defendants.
          <br />
          <span className="text-amber-400">For defendants.</span>
        </h1>
        </FadeInUp>
        <FadeInUp delay={0.1}>
        <p className="mt-6 text-lg leading-relaxed text-zinc-400">
          One of our founders was facing drug trafficking charges in
          Florida. Mandatory minimum: 3 years in state prison.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-zinc-400">
          He paid thousands for an attorney. The attorney told him to trust the process.
          So he trusted. For months. No motions filed. No calls returned. No
          explanation of what was in his own discovery.
        </p>
        </FadeInUp>

        <FadeInUp delay={0.15}>
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Why we stay masked
          </p>
          <p className="mt-3 text-lg font-semibold text-white">
            We stay masked because our files aren&apos;t closed &mdash; and that&apos;s exactly why we can read yours.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-300">
            Some of our founders have active cases right now: trial prep, discovery fights, motion deadlines. Using our names would hand the same legal system that already has files on us more ammunition.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-300">
            Every courtroom is a closed ecosystem. The judge, the prosecutor, the defense attorney know each other by face. They work together next week on a different case. Your attorney doesn&apos;t want to be the one who showed up with &ldquo;the INAA questions.&rdquo; The prosecutor doesn&apos;t want their witnesses cross-examined using our framework. The judge doesn&apos;t want our methodology in the record.
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-300">
            So we don&apos;t give them a face to remember. We give you the questions they can&apos;t trace back to anyone they can lean on. When our files close, we&apos;ll still be here. Still masked. Because the next defendant coming through deserves the same cover we had.
          </p>
          <p className="mt-4 text-sm italic text-amber-400">
            &mdash; Researchers. Defendants, still fighting.
          </p>
        </div>
        </FadeInUp>

        {/* THE STORY, Epiphany bridge: the night one of our founders opened his own */}
        {/* discovery and found four issues the attorney had never raised.   */}
        {/* This is the emotional core of the brand narrative.               */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">The day everything changed</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              One night he opened the discovery himself. 500 pages of police
              reports, lab results, and witness statements.
            </p>
            <p>
              Within a week, he found four issues his attorney had never
              mentioned: A 73% weight discrepancy, 93.9 grams on the scene,
              25.59 grams at the lab. 68.3 grams missing. A CI (confidential informant) phone number
              attributed to both the informant and him in the same report.
              Officers wrote &quot;amphetamine&quot;, the lab confirmed
              MDMA/MDA. A completely different substance. 21 latent
              fingerprints. Zero matched him.
            </p>
            <p>
              His attorney had filed nothing on any of it.
            </p>
          </div>
        </section>
        </FadeInUp>

        <FadeInUp>
        <section className="mt-12">
          <div className="space-y-4 text-zinc-400 leading-relaxed">
            <p>
              Another one of us was facing a second DUI. License, job,
              custody, all on the line. The attorney&apos;s advice: take the
              deal, the BAC is too high to fight.
            </p>
            <p>
              We pulled the breathalyzer maintenance records ourselves. The
              device was 19 days past its calibration window. The manufacturer
              requires recalibration every 7 days. The attorney hadn&apos;t
              requested those records.
            </p>
          </div>
        </section>
        </FadeInUp>

        <FadeInUp>
        <section className="mt-12">
          <div className="space-y-4 text-zinc-400 leading-relaxed">
            <p>
              A third member of our team received a federal grand jury target
              letter for wire fraud. The attorney said cooperate.
            </p>
            <p>
              We read the discovery ourselves. Three of the transactions in
              the indictment pre-dated the business relationship the government
              claimed created the fraudulent intent. The timeline was wrong,
              and it wasn&apos;t a detail, it was the case. The attorney had
              never mapped the transaction dates against the contract records.
            </p>
          </div>
        </section>
        </FadeInUp>

        <FadeInUp>
        <section className="mt-12">
          <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
            <p className="text-zinc-300 leading-relaxed">
              The attorneys in our stories weren&apos;t all bad lawyers. Some were overworked. Some were under-resourced. What was missing in every case wasn&apos;t effort, it was information. The right questions, asked at the right time.
            </p>
          </div>
        </section>
        </FadeInUp>

        {/* WHAT WE BUILT, Transition from personal story to product.       */}
        {/* Shows how the personal epiphany became a service for others.     */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">What we built after that</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              We started reading everything the best defense attorneys ever
              published. Their chain of custody protocols, who handled the evidence and when. Informant defense
              methodologies. Investigation patterns. 40+ legendary attorneys.
            </p>
            <p>
              We built a system that does what we did, more thoroughly, with documented methodology behind every finding, and available to any defendant who refuses to sit in the dark about their own case.
            </p>
            <p>
              We don&apos;t give legal advice. We give your attorney the questions they need to be answering, documented, sourced, and ready for your next meeting.
            </p>
          </div>
        </section>
        </FadeInUp>

        {/* HOW WE DO IT, Three differentiators: deep research, real case   */}
        {/* experience, and plain English.                                   */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">How we do it</h2>
          <StaggerContainer className="mt-6 space-y-6">
            {[
              {
                title: "Deep Case Research",
                desc: "Our system analyzes cases using tactics from 40+ elite criminal defense attorneys. We know what good defense looks like, and we can spot when it's missing.",
              },
              {
                title: "Real case experience",
                desc: "This isn't theoretical. Our analysis framework was built from real cases, our founders' cases. We found weight discrepancies the attorney missed. We found CI attribution errors, when police listed the same informant's details for two different people, in the warrant. We found officer statement conflicts that became trial ammunition.",
              },
              {
                title: "Plain English",
                desc: "Legal documents are written for attorneys, not defendants. We translate everything into language that makes your next conversation with your attorney concrete instead of confusing.",
              },
            ].map((item) => (
              <StaggerItem
                key={item.title}
                className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>
        </FadeInUp>

        {/* WHAT WE'RE NOT, UPL (Unauthorized Practice of Law) compliance.  */}
        {/* Five explicit disclaimers plus the "Know What They Know."        */}
        {/* tagline that defines the legal boundary of our services.         */}
        {/* This section is legally important, do not remove or soften.     */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">
            What we are <span className="text-amber-400">not</span>
          </h2>
          <ul className="mt-4 space-y-3 text-zinc-400">
            {[
              "We are not a law firm",
              "We do not provide legal advice",
              "We do not represent you in court",
              "We do not replace your attorney",
              "We do not guarantee case outcomes",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 text-red-400">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-400">
              Know What They Know.
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              We provide legal information, not legal advice. Not representation. Not outcomes. Information is the equalizer.
            </p>
            <p className="mt-3 text-sm text-zinc-400">In every criminal case, the judge, the prosecutor, and your defense attorney already know each other. They work in the same building. They&apos;ve seen hundreds of cases like yours. You are the only person in that room who doesn&apos;t know how this works. We close that gap.</p>
          </div>
        </section>
        </FadeInUp>

        {/* CTA, Routes to services (primary) and blog (secondary) */}
        <FadeInUp>
        <section className="mt-16 text-center">
          <h2 className="font-display text-2xl font-bold text-white">
            Defendants who fight back{" "}
            <span className="text-amber-400">start here.</span>
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            We found 4 issues in one case. Let us look at yours.
          </p>
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/checkout?tier=case-decoder"
              className="rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
            >
              Get Your Case Analysis, {TIER_CORE["case-decoder"].priceDisplay} &rarr;
            </Link>
            <Link
              href="/blog"
              className="rounded-lg border border-zinc-700 px-8 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:border-zinc-500"
            >
              Read the Blog
            </Link>
          </div>
        </section>
        </FadeInUp>

        {/* RELATED READING, Specific blog posts that reinforce the About page narrative */}
        <section className="mt-16">
          <h2 className="font-display text-xl font-bold text-white mb-4">Recommended Reading</h2>
          <div className="space-y-3">
            <Link href="/blog/trafficking-charges-constructive-possession" className="block rounded-lg border border-zinc-500 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
              <p className="text-sm font-semibold text-amber-400">Drug Trafficking & Constructive Possession</p>
              <p className="mt-1 text-xs text-zinc-400">The defense strategy that could apply to your case.</p>
            </Link>
            <Link href="/blog/how-your-attorney-makes-money" className="block rounded-lg border border-zinc-500 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
              <p className="text-sm font-semibold text-amber-400">How Your Attorney Makes Money</p>
              <p className="mt-1 text-xs text-zinc-400">The economics of criminal defense, what every defendant should understand before their first meeting.</p>
            </Link>
            <Link href="/blog/attorney-not-returning-calls" className="block rounded-lg border border-zinc-500 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
              <p className="text-sm font-semibold text-amber-400">Your Attorney Won&apos;t Return Your Calls</p>
              <p className="mt-1 text-xs text-zinc-400">The exact problem that started all of this, and what you can do about it.</p>
            </Link>
          </div>
        </section>

        {/* FOR ATTORNEYS, Referral signal. Opens the referral channel      */}
        {/* without requiring a full page. Addresses segment 2 (double-     */}
        {/* checkers with decent attorneys) and positions product as         */}
        {/* complementary, not competitive.                                 */}
        <FadeInUp>
        <section className="mt-16 rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
          <h2 className="font-display text-lg font-bold text-white">
            For defense attorneys
          </h2>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Your clients who show up prepared ask better questions and get better outcomes. We provide case-specific research that helps defendants understand their situation, so when they sit down with you, the conversation is productive from the first minute.
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Questions?{" "}
            <a href="mailto:help@imnotanattorney.com" className="text-amber-400 underline decoration-amber-400/50 hover:text-amber-300">
              help@imnotanattorney.com
            </a>
          </p>
        </section>
        </FadeInUp>

        {/* LEAD CAPTURE, Email opt-in fallback for visitors not ready to buy */}
        <div className="mt-16">
          <LeadCapture ungated />
        </div>
      </div>
    </div>
  );
}
