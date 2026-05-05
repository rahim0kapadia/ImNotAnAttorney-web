/**
 * /district-court-intelligence/[district]
 *
 * Per-district court intelligence SEO page. Static-rendered at build time
 * (generateStaticParams returns all 94 federal district codes).
 *
 * Data surfaced per district:
 *   - District name + state
 *   - Top 10 judges by total docket count from mv_judge_docket_caseload
 *   - Average criminal_fraction across the district's judges
 *   - Total dockets + judge count
 *   - Booker inflection metric (mean downward_departure_rate from
 *     mv_judge_bench_fingerprint for judges in this district)
 *
 * UPL guardrail: aggregate counts and fractions only — never a prediction
 * about a specific defendant's case outcome.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { allDistrictCodes, getDistrictByCode } from "@/lib/district-court/codes";
import { queryDistrictAggregates } from "@/lib/district-court/query";
import type { DistrictAggregates } from "@/lib/district-court/query";

interface PageProps {
  params: Promise<{ district: string }>;
}

// ─── Static generation ────────────────────────────────────────────────────────

export function generateStaticParams() {
  return allDistrictCodes().map((code) => ({ district: code }));
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { district } = await params;
  const info = getDistrictByCode(district);
  if (!info) return {};

  const title = `${info.name} Court Intelligence — Judge Docket Data & Sentencing Patterns`;
  const description = `Aggregate caseload data, criminal docket fractions, and sentencing departure rates for the ${info.name}. Compiled from verified federal court records (CourtListener × FJC IDB × USSC FY14-23).`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/district-court-intelligence/${district}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/district-court-intelligence/${district}`,
      type: "website",
    },
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function ThinCoverageNotice({ districtName }: { districtName: string }) {
  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
      <strong>Coverage note:</strong> No indexed docket data found for the {districtName} in the current corpus.
      This district may have thin coverage in the CourtListener index. The overview pack for your state may still
      include circuit-level motion data and USSC sentencing aggregates.
    </div>
  );
}

function JudgeTable({ judges }: { judges: DistrictAggregates["topJudges"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Top judges by docket count in this district
        </caption>
        <thead className="border-b border-zinc-700 bg-zinc-900">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold text-zinc-200">Judge</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold text-zinc-200">Total Dockets</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold text-zinc-200">Criminal Dockets</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold text-zinc-200">Criminal Fraction</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {judges.map((j) => (
            <tr key={j.cl_person_id}>
              <th scope="row" className="px-4 py-3 font-medium text-zinc-300">
                {j.full_name}
              </th>
              <td className="px-4 py-3 text-right text-zinc-400">{fmt(j.total_dockets)}</td>
              <td className="px-4 py-3 text-right text-zinc-400">{fmt(j.criminal_dockets)}</td>
              <td className="px-4 py-3 text-right text-zinc-400">{pct(j.criminal_fraction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DistrictPage({ params }: PageProps) {
  const { district } = await params;
  const info = getDistrictByCode(district);

  if (!info) {
    notFound();
  }

  const data = await queryDistrictAggregates(district);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://imnotanattorney.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Courthouse Intelligence Pack",
        item: `${SITE_URL}/district-court-intelligence`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: info.name,
        item: `${SITE_URL}/district-court-intelligence/${district}`,
      },
    ],
  };

  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${info.name} — Federal Docket Caseload Aggregates`,
    description: `Aggregate judge docket counts, criminal docket fractions, and sentencing departure rates for the ${info.name}. Derived from CourtListener federal docket records cross-referenced with the FJC Integrated Database and USSC FY14-23 datafiles.`,
    url: `${SITE_URL}/district-court-intelligence/${district}`,
    creator: {
      "@type": "Organization",
      "@id": "https://imnotanattorney.com/#organization",
    },
    license: "https://imnotanattorney.com/terms",
    isBasedOn: [
      "https://storage.courtlistener.com/bulk-data/",
      "https://www.fjc.gov/research/idb",
      "https://www.ussc.gov/research/datafiles",
    ],
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-zinc-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-amber-400">Home</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/district-court-intelligence" className="hover:text-amber-400">
              Courthouse Intelligence
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-zinc-300" aria-current="page">{info.name}</li>
        </ol>
      </nav>

      {/* Hero */}
      <FadeInUp>
        <section aria-labelledby="hero-heading">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Federal Court — {info.state}
          </p>
          <h1
            id="hero-heading"
            className="font-display mt-3 text-3xl font-extrabold leading-tight text-white sm:text-4xl"
          >
            {info.name}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-zinc-400">
            Aggregate docket intelligence for the {info.name} compiled from
            verified federal court records. Judge caseload counts, criminal docket
            fractions, and sentencing departure rates — never a prediction about
            a specific defendant.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Source: CourtListener &times; FJC IDB &times; USSC FY14-23 &mdash; generated{" "}
            {new Date(data.generatedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </section>
      </FadeInUp>

      {/* Thin coverage notice */}
      {data.judgeCount === 0 && (
        <FadeInUp>
          <div className="mt-10">
            <ThinCoverageNotice districtName={info.name} />
          </div>
        </FadeInUp>
      )}

      {/* Stat cards */}
      {data.judgeCount > 0 && (
        <FadeInUp>
          <section aria-labelledby="stats-heading" className="mt-12">
            <h2
              id="stats-heading"
              className="font-display text-xl font-bold text-white"
            >
              District Aggregate
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Total Dockets"
                value={fmt(data.totalDockets)}
                sub="indexed in corpus"
              />
              <StatCard
                label="Judges Indexed"
                value={fmt(data.judgeCount)}
                sub="with docket data"
              />
              <StatCard
                label="Avg Criminal Fraction"
                value={pct(data.avgCriminalFraction)}
                sub="across district judges"
              />
              <StatCard
                label="Booker Inflection"
                value={pct(data.bookerInflection)}
                sub="mean downward departure"
              />
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Criminal fraction = criminal dockets ÷ total dockets per judge, averaged across the district.
              Booker inflection = mean downward-departure rate for judges in this district per USSC FY14-23.
              Aggregate frequencies only — not a prediction about any specific case.
            </p>
          </section>
        </FadeInUp>
      )}

      {/* Top judges table */}
      {data.topJudges.length > 0 && (
        <FadeInUp>
          <section aria-labelledby="judges-heading" className="mt-16">
            <h2
              id="judges-heading"
              className="font-display text-xl font-bold text-white"
            >
              Top Judges by Docket Volume
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Judges ranked by total indexed docket count. Criminal fraction reflects
              the share of their docket classified as criminal (vs. civil).
            </p>
            <div className="mt-6">
              <JudgeTable judges={data.topJudges} />
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Source: CourtListener &times; FJC IDB via mv_judge_docket_caseload.
              Counts reflect dockets indexed as of corpus build date.
            </p>
          </section>
        </FadeInUp>
      )}

      {/* CTA back to pack */}
      <FadeInUp>
        <section aria-labelledby="cta-heading" className="mt-20 rounded-lg border border-zinc-700 bg-zinc-900 p-6">
          <h2
            id="cta-heading"
            className="font-display text-lg font-bold text-white"
          >
            Get the Full Courthouse Intelligence Pack
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            The full pack adds circuit motion grant rates with national baselines
            and USSC FY14-23 sentencing aggregates for {info.state} federal districts —
            delivered instantly to your email.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/checkout?standaloneProduct=district-court-intelligence"
              className="inline-flex items-center justify-center rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-300"
            >
              Get the Pack — $147
            </Link>
            <Link
              href="/district-court-intelligence"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-600 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-400 hover:text-white"
            >
              Back to Overview
            </Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            This is legal information, not legal advice. Aggregate data from
            verified public court records. Nothing here predicts a specific outcome.
          </p>
        </section>
      </FadeInUp>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }}
      />
    </div>
  );
}
