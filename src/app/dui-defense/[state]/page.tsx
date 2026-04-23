/**
 * State-Specific DUI Defense Page (/dui-defense/[state])
 *
 * Programmatic pages targeting "[state] DUI defense" queries.
 * Each page shows state-specific BAC limits, penalties, implied consent
 * details, DMV deadlines, and CTAs to the DUI Playbook and Score Quiz.
 *
 * 50 pages generated at build time via generateStaticParams().
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { allStateSlugs, getStateDuiData } from "@/data/state-dui-laws";
import { TIER_CORE } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { RelatedStateCharges } from "@/components/RelatedStateCharges";

interface PageProps {
  params: Promise<{ state: string }>;
}

export async function generateStaticParams() {
  return allStateSlugs().map((state) => ({ state }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { state } = await params;
  const data = getStateDuiData(state);
  if (!data) return {};

  const title = `${data.name} DUI Defense, BAC Limits, Penalties & What to Do`;
  const description = `${data.name} DUI laws: BAC limit ${data.bac}, first offense penalties up to ${data.firstJail} jail and ${data.firstFine} fine. Know your rights and the questions to ask your attorney.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/dui-defense/${state}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/dui-defense/${state}`,
      type: "website",
    },
  };
}

export default async function StateDuiPage({ params }: PageProps) {
  const { state } = await params;
  const data = getStateDuiData(state);

  if (!data) {
    notFound();
  }

  const duiPlaybook = TIER_CORE["dui-first-offense"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* BREADCRUMB + SCHEMA */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              {
                "@type": "ListItem",
                position: 2,
                name: "DUI Defense",
                item: `${SITE_URL}/dui-defense`,
              },
              { "@type": "ListItem", position: 3, name: data.name },
            ],
          }),
        }}
      />

      {/* HERO */}
      <FadeInUp>
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            {data.name} DUI Laws
          </p>
          <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            {data.name} DUI Defense
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            What you&apos;re facing, what the deadlines are, and the questions
            your attorney needs to answer, specific to {data.name} ({data.abbr}) law.
          </p>
        </section>
      </FadeInUp>

      {/* KEY NUMBERS */}
      <FadeInUp>
        <section className="mt-12">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                BAC Limit
              </p>
              <p className="mt-2 text-3xl font-extrabold text-amber-400">
                {data.bac}
              </p>
              {data.bac === "0.05 (lowest in the US)" && (
                <p className="mt-1 text-xs text-red-400">Lowest in the nation</p>
              )}
            </div>
            <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Enhanced BAC
              </p>
              <p className="mt-2 text-2xl font-extrabold text-white">
                {data.enhancedBac}
              </p>
              <p className="mt-1 text-xs text-zinc-400">Higher penalties above this</p>
            </div>
            <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Lookback Period
              </p>
              <p className="mt-2 text-2xl font-extrabold text-white">
                {data.lookback}
              </p>
              <p className="mt-1 text-xs text-zinc-400">Prior offenses count within</p>
            </div>
          </div>
        </section>
      </FadeInUp>

      {/* DMV DEADLINE ALERT */}
      {data.dmvDeadline && (
        <FadeInUp>
          <section className="mt-8">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg text-red-400">&#9888;</span>
                <div>
                  <p className="font-semibold text-white">
                    {data.dmvDeadline}-Day DMV Hearing Deadline
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    In {data.name}, you have <strong className="text-white">{data.dmvDeadline} days</strong> from
                    your arrest to request an administrative DMV hearing. Miss this
                    deadline and your license suspension goes into effect automatically
                   , even if the criminal case is later dismissed.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </FadeInUp>
      )}

      {/* FIRST OFFENSE PENALTIES */}
      <FadeInUp>
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-white">
            First Offense Penalties in {data.name}
          </h2>
          <div className="mt-6 space-y-3">
            {[
              { label: "Jail Time", value: data.firstJail },
              { label: "Fines", value: data.firstFine },
              { label: "License Suspension", value: data.firstSuspension },
              { label: "Ignition Interlock", value: data.interlock },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-4 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4"
              >
                <span className="text-sm font-semibold text-zinc-300">
                  {item.label}
                </span>
                <span className="text-right text-sm text-zinc-400">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </FadeInUp>

      {/* IMPLIED CONSENT */}
      <FadeInUp>
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-white">
            Implied Consent &amp; Test Refusal
          </h2>
          <p className="mt-4 text-sm text-zinc-400">
            Like all 50 states, {data.name} has an implied consent law, by driving
            on {data.name} roads, you&apos;ve already agreed to submit to a chemical
            test (breath, blood, or urine) if an officer has probable cause to believe
            you&apos;re impaired.
          </p>
          <div className="mt-4 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Refusal Penalty
            </p>
            <p className="mt-2 text-sm text-white">{data.refusalPenalty}</p>
          </div>
        </section>
      </FadeInUp>

      {/* STATE-SPECIFIC NOTE */}
      <FadeInUp>
        <section className="mt-12">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              {data.name}-Specific Detail
            </p>
            <p className="mt-3 text-sm text-zinc-300">{data.note}</p>
          </div>
        </section>
      </FadeInUp>

      {/* CTA, SCORE QUIZ */}
      <FadeInUp>
        <section className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-white">
            Is your {data.name} DUI defense on track?
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            The Masked Researcher’s First Read checks 10 critical defense behaviors
            specific to DUI cases. Takes 2 minutes. Instant results.
          </p>
          <Link
            href="/score?charge=dui"
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Take the Free Defense Score
          </Link>
        </section>
      </FadeInUp>

      {/* CTA, DUI PLAYBOOK */}
      <section className="mt-12">
        <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
          <p className="text-xs font-semibold text-amber-400">
            {duiPlaybook.name} &mdash; {duiPlaybook.priceDisplay}
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            26 questions that change how your next attorney meeting goes, a case stage
            roadmap, red flag checklist, and a case progress scorecard.
            Instant PDF download &mdash; calibrated for {data.name} DUI defendants.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/playbook/dui-first-offense"
              className="inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-all hover:bg-amber-400"
            >
              Get the DUI Playbook &mdash; {duiPlaybook.priceDisplay}
            </Link>
            <Link
              href="/blog/complete-dui-defense-guide"
              className="inline-block rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-500 hover:text-white"
            >
              Read the Free DUI Guide
            </Link>
          </div>
        </div>
      </section>

      <RelatedStateCharges
        currentCharge="dui-defense"
        stateSlug={state}
        stateName={data.name}
      />

      {/* DISCLAIMER */}
      <section className="mt-12">
        <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            <strong>Important:</strong> This page provides general legal information
            about {data.name} DUI laws as of the date of publication. Laws change
            frequently. This is not legal advice. For guidance specific to your case,
            speaking with a {data.name}-licensed attorney is one option, or take the free Masked Researcher’s First Read to see where your case stands.
          </p>
        </div>
      </section>

      {/* FAQ SCHEMA */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `What is the BAC limit for DUI in ${data.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `The per se BAC limit for DUI in ${data.name} is ${data.bac}. Enhanced penalties apply at BAC ${data.enhancedBac}. Commercial vehicle operators are held to a 0.04 limit, and drivers under 21 are subject to zero-tolerance laws.`,
                },
              },
              {
                "@type": "Question",
                name: `What are the penalties for a first-offense DUI in ${data.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `First-offense DUI penalties in ${data.name}: Jail time: ${data.firstJail}. Fines: ${data.firstFine}. License suspension: ${data.firstSuspension}. Ignition interlock: ${data.interlock}.`,
                },
              },
              {
                "@type": "Question",
                name: `What happens if you refuse a breathalyzer in ${data.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `Under ${data.name}'s implied consent law, refusing a chemical test results in: ${data.refusalPenalty}. This administrative penalty applies even if you are not ultimately convicted of DUI.`,
                },
              },
              ...(data.dmvDeadline
                ? [
                    {
                      "@type": "Question",
                      name: `How long do you have to request a DMV hearing after a DUI in ${data.name}?`,
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: `In ${data.name}, you have ${data.dmvDeadline} days from the date of your arrest to request an administrative DMV hearing to challenge your license suspension. Missing this deadline means the suspension takes effect automatically.`,
                      },
                    },
                  ]
                : []),
            ],
          }),
        }}
      />
    </div>
  );
}
