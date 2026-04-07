/**
 * Resources Page (/resources)
 *
 * Free resources hub — everything ungated. No email required for any content.
 * Email capture happens at /score quiz after value is delivered.
 *
 * User journey:
 *   Nav / footer / blog -> THIS PAGE -> read guides freely
 *                                    -> /score (free quiz, email captured after results)
 *                                    -> /services (paid service CTA)
 *
 * Page structure:
 *   1. Header — "Free Resources" with empowerment framing
 *   2. Guides & Templates — Two free guides (ungated, inline descriptions)
 *   3. DUI 72-Hour Checklist — Key actions shown directly, no email gate
 *   4. Score CTA — free defense quiz
 *   5. Know Your Rights by Charge Type — Three charge categories
 *   6. DUI Playbook paid product CTA
 *   7. Services CTA
 */
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { TrustBadges } from "@/components/TrustBadges";
import { TestimonialSection } from "@/components/TestimonialSection";
import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import { TIER_CORE } from "@/lib/tiers";
import { productsByCategory } from "@/lib/products";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Resources",
  description:
    "Free guides, checklists, and templates for criminal defendants. Know your rights. Hold your attorney accountable.",
  alternates: {
    canonical: `${SITE_URL}/resources`,
  },
  openGraph: {
    title: "Free Resources",
    description:
      "Free guides, checklists, and templates for criminal defendants. Know your rights. Hold your attorney accountable.",
    url: `${SITE_URL}/resources`,
  },
};

/** Free guides — ungated. No email required. */
const resources = [
  {
    title: "The Discovery Checklist: 7 Evidence Problems Real Cases Actually Hide",
    desc: "Based on defense frameworks from attorneys who\u2019ve handled thousands of cases. 7 evidence problems real cases hide, the questions that expose each one, and a printable accountability checklist.",
    type: "Free Guide",
  },
  {
    title: "10 Questions That Change How Your Next Attorney Meeting Goes",
    desc: "The original questions that separate informed defendants from easy clients. Good attorneys welcome these questions \u2014 they show you\u2019re paying attention to your own case.",
    type: "Free Guide",
  },
];

/**
 * Per-charge-type rights guides — NOT email-gated (public information).
 * Builds SEO authority and trust. These are general legal information,
 * not legal advice (disclaimer at bottom of section).
 */
const rightsGuides = [
  {
    charge: "Drug Possession / Trafficking",
    rights: [
      "Right to see all discovery evidence",
      "Right to challenge search warrant (Franks hearing)",
      "Right to independent lab testing",
      "Right to challenge CI reliability",
      "Right to suppress illegally obtained evidence",
    ],
  },
  {
    charge: "DUI / DWI",
    rights: [
      "Right to breathalyzer calibration records",
      "Right to dashcam and bodycam footage",
      "Right to challenge field sobriety tests",
      "Right to DMV hearing (usually 10-day deadline)",
      "Right to officer training records",
    ],
  },
  {
    charge: "White Collar / Federal",
    rights: [
      "Right to review entire discovery production",
      "Right to Brady/Giglio material (exculpatory evidence)",
      "Right to understand sentencing guidelines",
      "Right to proffer protections during cooperation",
      "Right to challenge loss calculations",
    ],
  },
];

export default function ResourcesPage() {
  // Active content guides — drives from products.ts so adding a guide is
  // isActive: true + GUIDE_CONTENT entry in /guides/[slug]/page.tsx.
  const contentGuides = productsByCategory("content");

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
              { "@type": "ListItem", position: 2, name: "Resources" },
            ],
          }),
        }}
      />
      <div className="mx-auto max-w-4xl">
        {/* HEADER — Empowerment framing: "Knowledge is power" */}
        <FadeInUp>
        <h1 className="font-display text-3xl font-bold text-white md:text-4xl">
          Free Resources
        </h1>
        <p className="mt-3 text-zinc-400">
          Knowledge is power — especially when your freedom is on the line.
          These resources are free because everyone deserves to understand their
          rights.
        </p>
        </FadeInUp>

        {/* FREE GUIDES — Ungated, no email required */}
        <FadeInUp>
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold text-white">
            Guides &amp; Templates
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Free. No email required. Read them right now.
          </p>
          <StaggerContainer className="mt-6 grid gap-4 md:grid-cols-2">
            {resources.map((r) => (
              <StaggerItem
                key={r.title}
                className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6"
              >
                <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  {r.type}
                </span>
                <h3 className="mt-3 font-bold text-white">{r.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{r.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>
        </FadeInUp>

        {/* FREE GUIDES — dynamic content guides sourced from products.ts */}
        {contentGuides.length > 0 && (
          <FadeInUp>
          <section className="mt-12" aria-labelledby="free-guides-heading">
            <h2
              id="free-guides-heading"
              className="font-display text-xl font-bold text-white"
            >
              Free Guides
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Walkthroughs for specific moments in your case. No email
              required.
            </p>
            <StaggerContainer className="mt-6 grid gap-4 md:grid-cols-2">
              {contentGuides.map((guide) => (
                <StaggerItem
                  key={guide.slug}
                  className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6"
                >
                  <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                    Free Guide
                  </span>
                  <h3 className="mt-3 font-bold text-white">
                    <Link
                      href={`/guides/${guide.slug}`}
                      className="inline-block rounded-sm py-1 hover:text-amber-400 focus:outline-none focus-visible:text-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                    >
                      {guide.name}
                      <span aria-hidden="true"> &rarr;</span>
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    {guide.description}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>
          </FadeInUp>
        )}

        <FadeInUp>
        <section className="mt-12">
          <TestimonialSection
            variant="inline"
            testimonials={[
              {
                quote: "The discovery checklist helped me organize 200 pages of documents. I found a weight discrepancy my attorney hadn't noticed. That one finding changed my plea negotiation.",
                name: "Maria G.",
                charge: "Drug Possession",
                outcome: "Plea negotiation improved",
              },
            ]}
          />
          <p className="mt-4 text-center text-xs text-zinc-400">
            *Based on real defendant experiences. Names changed for privacy.
          </p>
        </section>
        </FadeInUp>

        {/* DUI 72-HOUR CHECKLIST — Ungated, key actions shown directly */}
        <FadeInUp>
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold text-white">
            Arrested for DUI in the Last 48 Hours?
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            There are three things worth doing immediately before your window closes — one has a deadline as short as 7 days.
          </p>
          <div className="mt-6 space-y-3">
            {[
              { n: "1", title: "Check your state\u2019s DMV hearing deadline", desc: "Some states give you as few as 7 days from arrest. Miss the window and your license is automatically suspended." },
              { n: "2", title: "Document everything while it\u2019s fresh", desc: "What happened before the stop. What the officer said. Whether you were read your rights. Your memory fades — write it down now." },
              { n: "3", title: "Know what to ask before you hire an attorney", desc: "6 questions that help you find a DUI specialist who\u2019s the right fit. Ask these before you sign anything." },
            ].map((item) => (
              <div key={item.n} className="flex items-start gap-4 rounded-lg border border-zinc-500 bg-zinc-900/50 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-400">
                  {item.n}
                </div>
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-zinc-400">
            Already know what you need?{" "}
            <Link href="/playbook/dui-first-offense" className="text-amber-400 underline hover:text-amber-300">
              Get the DUI Defense Playbook — {TIER_CORE["dui-first-offense"].priceDisplay} instant download →
            </Link>
          </p>
        </section>
        </FadeInUp>

        {/* SCORE CTA — Free defense quiz, THE email capture point */}
        <FadeInUp>
        <section className="mt-16 rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-white">
            Want to see how your defense scores?
          </h2>
          <p className="mt-2 text-zinc-400">
            10 questions. 60 seconds. See how your case measures up against
            the milestones that matter — no email required to start.
          </p>
          <Link
            href="/score"
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Take the Defense Milestone Score — Free
          </Link>
        </section>
        </FadeInUp>

        {/* KNOW YOUR RIGHTS — Free (no email required) rights guides per     */}
        {/* charge type. Pure educational value for SEO and trust-building.   */}
        <FadeInUp>
        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold text-white">
            Know Your Rights by Charge Type
          </h2>
          <p className="mt-2 text-zinc-400">
            This is public information that every defendant should know. No
            email required.
          </p>

          <StaggerContainer className="mt-8 space-y-8">
            {rightsGuides.map((guide) => (
              <StaggerItem
                key={guide.charge}
                className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6"
              >
                <h3 className="text-lg font-bold text-amber-400">
                  {guide.charge}
                </h3>
                <ul className="mt-4 space-y-2">
                  {guide.rights.map((right) => (
                    <li
                      key={right}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                      {right}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
          </StaggerContainer>

          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-amber-400">Disclaimer:</span>{" "}
              This is general legal information, not legal advice. Rights vary
              by state and jurisdiction. Your attorney remains the final authority on strategy
              decisions specific to your situation.
            </p>
          </div>
        </section>
        </FadeInUp>

        {/* DUI DEFENSE PLAYBOOK — Paid product, not email-gated */}
        <FadeInUp>
        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">
            DUI Defense Playbook
          </h2>
          <p className="mt-2 text-zinc-400">
            Everything a first-time DUI defendant needs to hold their attorney
            accountable — in one downloadable PDF.
          </p>
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-zinc-900/50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  {TIER_CORE["dui-first-offense"].priceDisplay} &middot; Instant Download
                </span>
                <h3 className="mt-3 text-lg font-bold text-white">
                  26 Questions That Change How Your Next Attorney Meeting Goes
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  The best defense attorneys want informed clients. These
                  questions help you be one.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                    26 attorney-sourced questions with good/bad answer examples
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                    12-point evidence red flag checklist
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                    DUI case stage roadmap (arrest → resolution)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                    Case Progress Scorecard
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                    One-page cheat sheet for your attorney meeting
                  </li>
                </ul>
                <p className="mt-3 text-xs text-zinc-400">
                  {TIER_CORE["dui-first-offense"].priceDisplay} credited toward {TIER_CORE["case-decoder"].name} within 30 days.
                </p>
              </div>
            </div>
            <Link
              href="/playbook/dui-first-offense"
              className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Get the {TIER_CORE["dui-first-offense"].name} — {TIER_CORE["dui-first-offense"].priceDisplay}
            </Link>
          </div>
        </section>
        </FadeInUp>

        {/* CTA — Bridges from free resources to paid case-specific services */}
        <FadeInUp>
        <section className="mt-16 text-center">
          <h2 className="font-display text-xl font-bold text-white">
            Need case-specific analysis?
          </h2>
          <p className="mt-2 text-zinc-400">
            Free resources get you started. Our services go deep into your
            actual case.
          </p>
          <Link
            href="/checkout?tier=case-decoder"
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Get Case-Specific Questions — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
          </Link>
          <div className="mt-6">
            <TrustBadges variant="compact" />
          </div>
        </section>
        </FadeInUp>
      </div>
    </div>
  );
}
