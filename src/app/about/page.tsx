/**
 * About Page (/about)
 *
 * Founder story page using an "epiphany bridge" narrative — the copywriting
 * technique where you share the personal experience that led to creating the
 * product. This builds trust by demonstrating lived experience as a defendant.
 *
 * User journey position:
 *   Nav / footer -> THIS PAGE -> /services (primary CTA) or /blog (secondary CTA)
 *
 * Narrative structure (epiphany bridge):
 *   1. Hero — "Built by a defendant. For defendants." (identity statement)
 *   2. The Setup — Rahim facing trafficking charges, paid thousands for attorney,
 *      got silence and inaction for months
 *   3. The Epiphany — Opened the discovery himself, found 4 critical issues
 *      in one week that the attorney never mentioned:
 *        - 73% weight discrepancy (93.9g -> 25.59g = 68.3g missing)
 *        - CI phone dual attribution
 *        - Drug type mismatch (amphetamine charged, MDMA/MDA found)
 *        - 21 fingerprints, zero match
 *   4. The Mission — Built a research system from 40+ elite defense attorneys'
 *      published methodologies. Now available to any defendant.
 *   5. How We Do It — Three differentiators (deep research, real case experience,
 *      plain English translation)
 *   6. What We're NOT — UPL compliance section. Five explicit disclaimers:
 *      not a law firm, no legal advice, no court representation, no attorney
 *      replacement, no outcome guarantees. "We Research. You Ask." tagline.
 *   7. CTA — Services page + blog links
 *   8. Lead capture — Email opt-in fallback
 *
 * Conversion role: This page handles the "who are these people?" objection.
 * Founder-as-defendant credibility is the strongest trust signal for the
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
  title: "About — Built by a Defendant, for Defendants",
  description:
    "ImNotAnAttorney was built by a defendant, for defendants. We provide legal research and questions — not legal advice.",
  alternates: {
    canonical: `${SITE_URL}/about`,
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
      <div className="mx-auto max-w-3xl">
        {/* HERO — Identity statement that immediately establishes credibility */}
        <FadeInUp>
        <h1 className="font-display text-3xl font-bold text-white md:text-5xl">
          Built by a defendant.
          <br />
          <span className="text-amber-400">For defendants.</span>
        </h1>
        </FadeInUp>
        <FadeInUp delay={0.1}>
        <p className="mt-6 text-lg leading-relaxed text-zinc-400">
          I&apos;m Rahim Kapadia. In 2023, I was facing drug trafficking
          charges in St. Petersburg, Florida. Mandatory minimum: 3 years.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-zinc-400">
          I paid thousands for an attorney. He told me to trust the process.
          So I trusted. For months. No motions filed. No calls returned. No
          explanation of what was in my own discovery.
        </p>
        </FadeInUp>

        {/* THE STORY — Epiphany bridge: the night Rahim opened his own      */}
        {/* discovery and found four issues the attorney had never raised.   */}
        {/* This is the emotional core of the brand narrative.               */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">The day everything changed</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              One night I opened the discovery myself. 500 pages of police
              reports, lab results, and witness statements.
            </p>
            <p>
              Within a week, I found four issues my attorney had never
              mentioned: A 73% weight discrepancy — 93.9 grams on the scene,
              25.59 grams at the lab. 68.3 grams missing. A CI phone number
              attributed to both the informant and me in the same report.
              Officers wrote &quot;amphetamine&quot; — the lab confirmed
              MDMA/MDA. A completely different substance. 21 latent
              fingerprints. Zero matched me.
            </p>
            <p>
              My attorney had filed nothing on any of it.
            </p>
          </div>
        </section>
        </FadeInUp>

        {/* WHAT WE BUILT — Transition from personal story to product.       */}
        {/* Shows how the personal epiphany became a service for others.     */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">What I built after that day</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              I started reading everything the best defense attorneys ever
              published. Their chain of custody protocols. Informant defense
              methodologies. Investigation patterns. 40+ legendary attorneys.
            </p>
            <p>
              I built a system that does what I did — but faster, deeper, and
              available to any defendant who refuses to sit in the dark about
              their own case.
            </p>
            <p>
              We don&apos;t give legal advice. We give you the questions your
              attorney should be answering. What you do with them is between you
              and your attorney.
            </p>
          </div>
        </section>
        </FadeInUp>

        {/* HOW WE DO IT — Three differentiators: deep research, real case   */}
        {/* experience, and plain English. AI-powered positioning without    */}
        {/* over-promising.                                                  */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">How we do it</h2>
          <StaggerContainer className="mt-6 space-y-6">
            {[
              {
                title: "Deep Case Research",
                desc: "Our system analyzes cases using tactics from 40+ elite criminal defense attorneys. We know what good defense looks like — and we can spot when it's missing.",
              },
              {
                title: "Real case experience",
                desc: "This isn't theoretical. Our analysis framework was built from Rahim's real case. We found weight discrepancies the attorney missed. We found CI attribution errors in the warrant. We found officer statement conflicts that became trial ammunition.",
              },
              {
                title: "Plain English",
                desc: "Legal jargon is a weapon used to keep you confused. We translate everything into language you can actually understand — and act on.",
              },
            ].map((item) => (
              <StaggerItem
                key={item.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>
        </FadeInUp>

        {/* WHAT WE'RE NOT — UPL (Unauthorized Practice of Law) compliance.  */}
        {/* Five explicit disclaimers plus the "We Research. You Ask."       */}
        {/* tagline that defines the legal boundary of our services.         */}
        {/* This section is legally important — do not remove or soften.     */}
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
              We Research. You Ask.
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              That&apos;s the line. We stay on our side of it.
            </p>
          </div>
        </section>
        </FadeInUp>

        {/* CTA — Routes to services (primary) and blog (secondary) */}
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
              className="rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
            >
              Get Your Questions — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
            </Link>
            <Link
              href="/blog"
              className="rounded-lg border border-zinc-700 px-8 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:border-zinc-500"
            >
              Read the Blog
            </Link>
          </div>
        </section>
        </FadeInUp>

        {/* RELATED READING — Specific blog posts that reinforce the About page narrative */}
        <section className="mt-16">
          <h2 className="font-display text-xl font-bold text-white mb-4">Recommended Reading</h2>
          <div className="space-y-3">
            <Link href="/blog/trafficking-charges-constructive-possession" className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
              <p className="text-sm font-semibold text-amber-400">Drug Trafficking & Constructive Possession</p>
              <p className="mt-1 text-xs text-zinc-400">The defense strategy that applies to the founder&apos;s case — and might apply to yours.</p>
            </Link>
            <Link href="/blog/how-your-attorney-makes-money" className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
              <p className="text-sm font-semibold text-amber-400">How Your Attorney Makes Money</p>
              <p className="mt-1 text-xs text-zinc-400">Understanding the business model explains why some attorneys push pleas over motions.</p>
            </Link>
            <Link href="/blog/attorney-not-returning-calls" className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
              <p className="text-sm font-semibold text-amber-400">Your Attorney Won&apos;t Return Your Calls</p>
              <p className="mt-1 text-xs text-zinc-400">The exact problem that started all of this — and what you can do about it.</p>
            </Link>
          </div>
        </section>

        {/* LEAD CAPTURE — Email opt-in fallback for visitors not ready to buy */}
        <div className="mt-16">
          <LeadCapture />
        </div>
      </div>
    </div>
  );
}
