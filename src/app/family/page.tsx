/**
 * Family Landing Page (/family)
 *
 * Dedicated landing page for family members of criminal defendants.
 * Conversion-focused — CTAs point to the Defense Milestone Score quiz
 * (family can take it on behalf of the defendant).
 *
 * Target queries: "how to help family member criminal case",
 * "family member arrested what to do", "help loved one criminal charges"
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { TestimonialSection } from "@/components/TestimonialSection";

export const metadata: Metadata = {
  title: "Your Family Member Was Arrested — Here's How You Can Help",
  description:
    "When someone you love faces criminal charges, you feel helpless. Take the free Defense Milestone Score on their behalf to find the gaps in their defense — in 2 minutes.",
  alternates: {
    canonical: `${SITE_URL}/family`,
  },
  openGraph: {
    title: "Your Family Member Was Arrested — Here's How You Can Help",
    description:
      "Take the free Defense Milestone Score on their behalf. Find the gaps in their defense in 2 minutes.",
    url: `${SITE_URL}/family`,
    type: "website",
  },
};

export default function FamilyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* HERO */}
      <FadeInUp>
        <section className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            For Family Members
          </p>
          <h1 className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            Someone you love was arrested.
            <br />
            <span className="text-amber-400">Here&apos;s what you can do.</span>
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            You can&apos;t fight the case for them. But you can make sure nothing
            falls through the cracks. Take the free Defense Milestone Score on
            their behalf &mdash; it takes 2 minutes and flags the gaps their
            attorney might be missing.
          </p>
          <Link
            href="/score?ref=family"
            className="mt-8 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Take the Score on Their Behalf &mdash; Free
          </Link>
          <p className="mt-3 text-xs text-zinc-400">
            No sign-up required. Results are instant and anonymous.
          </p>
        </section>
      </FadeInUp>

      {/* THE PROBLEM */}
      <FadeInUp>
        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold text-white">
            You want to help. You don&apos;t know how.
          </h2>
          <div className="mt-6 space-y-4 text-zinc-400">
            <p>
              Maybe it was a phone call at 2 AM. Maybe you watched it happen.
              Either way, you&apos;re in a fog of disbelief and you need to do
              <em> something</em>.
            </p>
            <p>
              The legal system doesn&apos;t come with instructions for family
              members. Nobody tells you what&apos;s normal, what&apos;s a red
              flag, or when it&apos;s worth asking hard questions about the
              defense strategy.
            </p>
            <p>
              That&apos;s where the Defense Milestone Score comes in. You answer
              questions about where the case stands &mdash; charge type, case
              stage, attorney behavior &mdash; and get an instant score that
              tells you if things are on track or if there are gaps that need
              attention.
            </p>
          </div>
        </section>
      </FadeInUp>

      {/* WHAT YOU CAN DO */}
      <FadeInUp>
        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold text-white">
            5 things family members can do right now
          </h2>
          <StaggerContainer className="mt-8 space-y-4">
            {[
              {
                num: "1",
                title: "Take the Defense Milestone Score",
                text: "Answer questions about the case on their behalf. You'll see immediately if their defense is on track or if critical steps are being missed.",
              },
              {
                num: "2",
                title: "Research and vet attorneys",
                text: "They may be too overwhelmed or incarcerated to research effectively. You can compare attorneys, check bar records, and read reviews for them.",
              },
              {
                num: "3",
                title: "Attend court dates",
                text: "Your presence shows the judge the defendant has community support. Dress appropriately, arrive early, sit quietly. It matters more than you think.",
              },
              {
                num: "4",
                title: "Write character reference letters",
                text: "When sentencing arrives, character letters from family carry weight. Describe their positive qualities, community ties, and support system.",
              },
              {
                num: "5",
                title: "Handle the practical stuff",
                text: "Bills, childcare, employment communication, mail, pets — every practical burden you lift is one less thing pulling their focus from the case.",
              },
            ].map((item) => (
              <StaggerItem
                key={item.num}
                className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-400">
                  {item.num}
                </span>
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">{item.text}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>
      </FadeInUp>

      {/* WHAT NOT TO DO */}
      <FadeInUp>
        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold text-white">
            What NOT to do
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              "Don't discuss the case on social media",
              "Don't contact witnesses or alleged victims",
              "Don't pressure them to accept or reject a plea",
              "Don't talk about the case on jail phone calls — they're recorded",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4"
              >
                <span className="mt-0.5 text-red-400">&#10007;</span>
                <p className="text-sm text-zinc-300">{item}</p>
              </div>
            ))}
          </div>
        </section>
      </FadeInUp>

      <FadeInUp>
        <div className="mt-20">
          <TestimonialSection
            variant="inline"
            testimonials={[
              {
                quote: "I took the score on his behalf at midnight. It flagged that no motions had been filed in 60 days. My son brought the questions to his attorney and they filed a suppression motion the next week. Charges reduced.",
                name: "Linda M.",
                charge: "Son's Drug Possession",
                outcome: "Charges reduced",
              },
            ]}
          />
          <p className="mt-4 text-center text-xs text-zinc-400">
            *Based on real defendant experiences. Names changed for privacy.
          </p>
        </div>
      </FadeInUp>

      {/* CTA */}
      <FadeInUp>
        <section className="mt-20 text-center">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Free &mdash; No sign-up required
            </p>
            <p className="mt-4 text-2xl font-bold text-white">
              Find out if their defense is on track
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              The Defense Milestone Score checks 10 critical defense behaviors
              across any charge type. You can take it on their behalf &mdash;
              just answer based on what you know about the case.
            </p>
            <p className="mt-3 text-xs text-zinc-400">
              Good attorneys welcome a prepared defendant &mdash; and a prepared family.
            </p>
            <Link
              href="/score?ref=family"
              className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
            >
              Take the Defense Milestone Score
            </Link>
            <p className="mt-3 text-xs text-zinc-400">
              2 minutes. Instant results. No email required.
            </p>
          </div>
        </section>
      </FadeInUp>

      {/* DEEPER RESOURCES */}
      <section className="mt-16">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-xs font-semibold text-zinc-400">
            Want the full guide?
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            Our{" "}
            <Link
              href="/blog/how-family-members-can-help-criminal-case"
              className="font-semibold text-amber-400 underline decoration-amber-400/50"
            >
              complete guide for family members
            </Link>{" "}
            covers the first 48 hours, attorney research tactics, courtroom
            etiquette, character letters, and common mistakes that hurt the case.
          </p>
        </div>
      </section>

      {/* Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "How Family Members Can Help With a Criminal Case",
            description:
              "Guide for family members of criminal defendants — what to do, what not to do, and how to take the Defense Milestone Score on their behalf.",
            url: `${SITE_URL}/family`,
            isPartOf: { "@id": `${SITE_URL}/#website` },
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "For Family Members" },
              ],
            },
          }),
        }}
      />
    </div>
  );
}
