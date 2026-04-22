/**
 * State-Specific Drug Possession Defense Page
 * /drug-possession-defense/[state]
 *
 * 50 pages via generateStaticParams. Mirror of dui-defense/[state]
 * but charge-agnostic: statute, class, penalty, enhancements, no DMV/implied-consent.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getStateDrugLawsData,
  allStateDrugLawsSlugs,
} from "@/data/state-drug-laws";
import { TIER_CORE } from "@/lib/tiers";
import { SITE_URL } from "@/lib/site";
import { FadeInUp } from "@/components/motion/FadeInUp";

interface PageProps {
  params: Promise<{ state: string }>;
}

export async function generateStaticParams() {
  return allStateDrugLawsSlugs().map((state) => ({ state }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { state } = await params;
  const data = getStateDrugLawsData(state);
  if (!data) return {};

  const title = `${data.name} Drug Possession Defense, Penalties & What to Ask`;
  const description = `${data.name} drug possession: ${data.statuteNumber} (${data.offenseClass}). Penalties up to ${data.penaltyMax}. Enhancements, defense questions, and what to do next.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/drug-possession-defense/${state}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/drug-possession-defense/${state}`,
      type: "website",
    },
  };
}

export default async function StateDrugPage({ params }: PageProps) {
  const { state } = await params;
  const data = getStateDrugLawsData(state);

  if (!data) {
    notFound();
  }

  const playbook = TIER_CORE["drug-possession"] ?? TIER_CORE["dui-first-offense"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
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
                name: "Drug Possession Defense",
                item: `${SITE_URL}/drug-possession-defense`,
              },
              { "@type": "ListItem", position: 3, name: data.name },
            ],
          }),
        }}
      />

      <FadeInUp>
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            {data.name} Drug Possession Law
          </p>
          <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            {data.name} Drug Possession Defense
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            What you&apos;re facing under {data.statuteNumber}, how the penalties scale, and the
            questions your attorney needs to answer, specific to {data.name} ({data.abbr}) law.
          </p>
        </section>
      </FadeInUp>

      <FadeInUp>
        <section className="mt-12">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Offense Class</p>
              <p className="mt-2 text-lg font-extrabold text-amber-400">{data.offenseClass}</p>
            </div>
            <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Maximum Penalty</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{data.penaltyMax}</p>
            </div>
            <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Maximum Fine</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{data.fineMax}</p>
            </div>
          </div>
        </section>
      </FadeInUp>

      {data.mandatoryMinimum && (
        <FadeInUp>
          <section className="mt-8">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg text-red-400">&#9888;</span>
                <div>
                  <p className="font-semibold text-white">Mandatory Minimum</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {data.name} imposes a mandatory minimum of{" "}
                    <strong className="text-white">{data.mandatoryMinimum}</strong> for this charge.
                    Charge reductions or alternative sentencing are questions worth raising before the plea is entered.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </FadeInUp>
      )}

      <FadeInUp>
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-white">
            Penalty Range in {data.name}
          </h2>
          <div className="mt-6 space-y-3">
            {[
              { label: "Statute", value: `${data.statuteNumber} — ${data.statuteTitle}` },
              { label: "Minimum Penalty", value: data.penaltyMin },
              { label: "Maximum Penalty", value: data.penaltyMax },
              { label: "Maximum Fine", value: data.fineMax },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-4 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4"
              >
                <span className="text-sm font-semibold text-zinc-300">{item.label}</span>
                <span className="text-right text-sm text-zinc-400">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </FadeInUp>

      {data.enhancements && data.enhancements.length > 0 && (
        <FadeInUp>
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-white">Charge Enhancements</h2>
            <p className="mt-3 text-sm text-zinc-400">
              These factors can elevate the charge or penalty in {data.name}:
            </p>
            <ul className="mt-4 space-y-2">
              {data.enhancements.map((e) => (
                <li
                  key={e}
                  className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-3 text-sm text-zinc-300"
                >
                  {e}
                </li>
              ))}
            </ul>
          </section>
        </FadeInUp>
      )}

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

      <FadeInUp>
        <section className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-white">
            Is your {data.name} drug case defense on track?
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            The free Defense Score checks 10 critical defense behaviors specific to
            drug-possession cases. Takes 2 minutes. Instant results.
          </p>
          <Link
            href="/score?charge=drug-possession"
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Take the Free Defense Score
          </Link>
        </section>
      </FadeInUp>

      {playbook && (
        <section className="mt-12">
          <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
            <p className="text-xs font-semibold text-amber-400">
              {playbook.name} &mdash; {playbook.priceDisplay}
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              26 questions that change how the next attorney meeting goes, a case stage roadmap,
              red flag checklist, and a case progress scorecard. Instant PDF download, relevant to
              {` ${data.name}`} defendants.
            </p>
            <div className="mt-4">
              <Link
                href={`/playbook/${(playbook as { slug?: string }).slug ?? "dui-first-offense"}`}
                className="inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-all hover:bg-amber-400"
              >
                Get the Playbook &mdash; {playbook.priceDisplay}
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="mt-12">
        <div className="rounded-lg border border-zinc-500 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            <strong>Important:</strong> This page provides legal INFORMATION about {data.name} drug
            possession law as of the date of publication. Laws change frequently. This is not legal
            advice. The analysis draws on methods developed by defense attorneys, applied to public
            data. Your attorney remains the final authority on defense direction.
          </p>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `What is the maximum sentence for drug possession in ${data.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `Under ${data.statuteNumber} (${data.offenseClass}), ${data.name} drug possession carries a maximum sentence of ${data.penaltyMax} and a maximum fine of ${data.fineMax}.`,
                },
              },
              {
                "@type": "Question",
                name: `Does ${data.name} have a mandatory minimum for drug possession?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: data.mandatoryMinimum
                    ? `Yes. ${data.name} imposes a mandatory minimum of ${data.mandatoryMinimum} for drug possession. This applies unless an exception or diversion program is available.`
                    : `${data.name} does not impose a blanket mandatory minimum for simple drug possession. Specific charges or enhancements may carry their own minimums.`,
                },
              },
              {
                "@type": "Question",
                name: `What factors enhance a drug possession charge in ${data.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text:
                    data.enhancements.length > 0
                      ? `In ${data.name}, drug possession penalties can be enhanced by: ${data.enhancements.join("; ")}.`
                      : `Enhancement factors vary, but commonly include prior convictions, proximity to a school, and quantity thresholds.`,
                },
              },
            ],
          }),
        }}
      />
    </div>
  );
}
