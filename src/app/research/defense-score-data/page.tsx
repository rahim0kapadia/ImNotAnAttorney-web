import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 3600; // revalidate every hour

export const metadata: Metadata = {
  title: "Defense Score Data, Attorney Gaps",
  description:
    "Original research from anonymous Defense Milestone Score data. See what defendants report about attorney communication, discovery, motions, and defense strategy, broken down by charge type.",
  alternates: {
    canonical: `${SITE_URL}/research/defense-score-data`,
  },
};

type AggregateRow = {
  charge_type: string;
  metric: string;
  count: number;
};

const CHARGE_LABELS: Record<string, string> = {
  dui: "DUI",
  drug: "Drug Offenses",
  "white-collar": "White Collar",
  "other-felony": "Other Felony",
  "other-misdemeanor": "Other Misdemeanor",
};

const METRIC_LABELS: Record<string, string> = {
  no_motions_filed: "No motions filed by attorney",
  never_seen_discovery: "Never received discovery",
  communication_never: "Zero attorney communication",
  no_strategy_discussion: "No defense strategy discussed",
};

async function getAggregateData() {
  try {
    const supabase = createAdminClient();

    const [aggregatesResult, counterResult] = await Promise.all([
      supabase.from("score_aggregates").select("*"),
      supabase
        .from("counters")
        .select("value")
        .eq("id", "score_completions")
        .single(),
    ]);

    const rows: AggregateRow[] = aggregatesResult.data ?? [];
    const totalCompletions: number = counterResult.data?.value ?? 0;

    const totalsByCharge: Record<string, number> = {};
    const metricsByCharge: Record<string, Record<string, number>> = {};

    for (const row of rows) {
      if (row.metric === "total_by_charge") {
        totalsByCharge[row.charge_type] = row.count;
      } else {
        if (!metricsByCharge[row.charge_type]) {
          metricsByCharge[row.charge_type] = {};
        }
        metricsByCharge[row.charge_type][row.metric] = row.count;
      }
    }

    return { totalsByCharge, metricsByCharge, totalCompletions };
  } catch {
    return { totalsByCharge: {}, metricsByCharge: {}, totalCompletions: 0 };
  }
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "\u2014";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default async function DefenseScoreDataPage() {
  const { totalsByCharge, metricsByCharge, totalCompletions } =
    await getAggregateData();

  const chargeTypes = Object.keys(totalsByCharge).sort(
    (a, b) => (totalsByCharge[b] ?? 0) - (totalsByCharge[a] ?? 0)
  );

  const overallTotal = Object.values(totalsByCharge).reduce(
    (sum, n) => sum + n,
    0
  );
  const overallMetrics: Record<string, number> = {};
  for (const metrics of Object.values(metricsByCharge)) {
    for (const [metric, count] of Object.entries(metrics)) {
      overallMetrics[metric] = (overallMetrics[metric] ?? 0) + count;
    }
  }

  const isPreliminary = totalCompletions < 100;

  return (
    <div className="px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "Defense Milestone Score, Defendant Self-Assessment Data",
            description:
              "Anonymous aggregate data from criminal defendants who completed the Defense Milestone Score quiz. Tracks attorney communication gaps, discovery access, motion filings, and defense strategy discussions by charge type.",
            url: `${SITE_URL}/research/defense-score-data`,
            creator: {
              "@type": "Organization",
              name: "ImNotAnAttorney",
              url: SITE_URL,
            },
            temporalCoverage: "2026/..",
            variableMeasured: [
              "Attorney communication frequency",
              "Discovery document access",
              "Motion filing status",
              "Defense strategy discussion",
            ],
            measurementTechnique:
              "Self-reported anonymous online questionnaire (10 questions, 5-minute completion time)",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Research",
                item: `${SITE_URL}/research`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "Defense Score Data",
              },
            ],
          }),
        }}
      />

      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wider text-amber-400">
          Original Research
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white md:text-4xl">
          What {totalCompletions.toLocaleString()} Defendants Revealed About
          Attorney Communication Gaps
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          Anonymous aggregate data from the{" "}
          <Link href="/score" className="text-amber-400 underline hover:no-underline">
            Defense Milestone Score
          </Link>{" "}
         , a free 10-question self-assessment for criminal defendants. Updated
          hourly.
        </p>

        {isPreliminary && (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <strong>Preliminary data.</strong> These results are based on{" "}
            {totalCompletions} completions. We will publish a full analysis when
            the sample reaches 100+ responses. Percentages may shift
            significantly as more data comes in.
          </div>
        )}

        {/* Key Findings, AI Citation Block */}
        <div className="mt-8 rounded-lg border border-zinc-700 bg-zinc-800/50 p-6">
          <p className="text-sm font-medium uppercase tracking-wider text-zinc-400">
            Key Findings
          </p>
          <p className="mt-3 leading-relaxed text-zinc-300">
            Among {totalCompletions.toLocaleString()} defendants who completed
            the Defense Milestone Score self-assessment,{" "}
            {pct(overallMetrics.no_motions_filed ?? 0, overallTotal)} reported
            that their attorney had filed no motions,{" "}
            {pct(overallMetrics.never_seen_discovery ?? 0, overallTotal)} had
            never received their discovery documents,{" "}
            {pct(overallMetrics.communication_never ?? 0, overallTotal)} reported
            zero communication from their attorney, and{" "}
            {pct(overallMetrics.no_strategy_discussion ?? 0, overallTotal)} said
            no defense strategy had been discussed. These gaps were consistent
            across charge types including DUI, drug offenses, and white-collar
            cases. Data is collected anonymously, no individual answers are
            stored, only aggregate counts by charge type.
          </p>
        </div>

        {/* Overall Stats */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">
            Overall Defense Gaps, All Charge Types
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Based on {overallTotal.toLocaleString()} scored assessments
          </p>

          {overallTotal > 0 ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {Object.entries(METRIC_LABELS).map(([metric, label]) => {
                const count = overallMetrics[metric] ?? 0;
                return (
                  <div
                    key={metric}
                    className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4"
                  >
                    <p className="text-3xl font-bold text-red-400">
                      {pct(count, overallTotal)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{label}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {count.toLocaleString()} of{" "}
                      {overallTotal.toLocaleString()} respondents
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-6 text-zinc-400">
              No data yet. Be the first to{" "}
              <Link href="/score" className="text-amber-400 underline hover:no-underline">
                take the score quiz
              </Link>
              .
            </p>
          )}
        </section>

        {/* Breakdown by Charge Type */}
        {chargeTypes.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-white">
              Breakdown by Charge Type
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Percentage of defendants reporting each defense gap, by charge
              category
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th className="pb-3 pr-4 font-medium">Defense Gap</th>
                    {chargeTypes.map((ct) => (
                      <th
                        key={ct}
                        className="pb-3 px-3 font-medium text-center"
                      >
                        {CHARGE_LABELS[ct] ?? ct}
                        <span className="block text-xs text-zinc-400">
                          n={totalsByCharge[ct]?.toLocaleString()}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {Object.entries(METRIC_LABELS).map(([metric, label]) => (
                    <tr key={metric} className="border-b border-zinc-500">
                      <td className="py-3 pr-4 text-zinc-400">{label}</td>
                      {chargeTypes.map((ct) => {
                        const count = metricsByCharge[ct]?.[metric] ?? 0;
                        const total = totalsByCharge[ct] ?? 0;
                        const percentage =
                          total > 0
                            ? Math.round((count / total) * 100)
                            : 0;
                        return (
                          <td
                            key={ct}
                            className={`py-3 px-3 text-center font-medium ${
                              percentage >= 50
                                ? "text-red-400"
                                : percentage >= 30
                                  ? "text-amber-400"
                                  : "text-zinc-300"
                            }`}
                          >
                            {total > 0 ? `${percentage}%` : "\u2014"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Methodology */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">Methodology</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              The Defense Milestone Score is a free, anonymous 10-question
              self-assessment available at{" "}
              <Link href="/score" className="text-amber-400 underline hover:no-underline">
                imnotanattorney.com/score
              </Link>
              . Respondents answer questions about their charge type, time since
              arrest, attorney type, motion filings, discovery access,
              communication frequency, strategy discussions, criminal history,
              case stage, and professional licensing status.
            </p>
            <p>
              <strong className="text-zinc-300">Data collection:</strong> No
              individual answers are stored. When a respondent completes the
              quiz, aggregate counters are incremented by charge type. This
              design is intentional, it makes re-identification impossible
              because individual-level data does not exist.
            </p>
            <p>
              <strong className="text-zinc-300">Sample:</strong> Respondents are
              self-selected criminal defendants who found the quiz through
              organic search, blog content, or direct referral. This is a
              convenience sample, not a random sample, results reflect the
              experiences of defendants actively seeking information about their
              defense, which may skew toward those who are dissatisfied with
              their representation.
            </p>
            <p>
              <strong className="text-zinc-300">Limitations:</strong> Self-reported
              data may reflect misunderstandings (a defendant may not know
              whether motions have been filed). The sample is not nationally
              representative. Charge type categories are broad. Results should be
              interpreted as indicative of patterns among information-seeking
              defendants, not as population-level statistics.
            </p>
            <p>
              <strong className="text-zinc-300">Update frequency:</strong> This
              page pulls live data from the database and revalidates every hour.
              All figures reflect cumulative data from launch to present.
            </p>
          </div>
        </section>

        {/* What This Means */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">
            What This Data Means for Defendants
          </h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              The four metrics tracked, motions filed, discovery access,
              communication, and strategy discussion, represent the foundational
              milestones of an active criminal defense. When these are missing,
              the defense is not happening.
            </p>
            <p>
              <strong className="text-zinc-300">No motions filed</strong> means
              no one has challenged the legality of the stop, the search, the
              statements, or the evidence.{" "}
              <Link
                href="/blog/what-motions-should-your-attorney-be-filing"
                className="text-amber-400 underline hover:no-underline"
              >
                Learn what motions should be filed in your case.
              </Link>
            </p>
            <p>
              <strong className="text-zinc-300">
                Never received discovery
              </strong>{" "}
              means the defendant has not seen the evidence being used against
              them, a fundamental right.{" "}
              <Link
                href="/blog/how-to-read-your-discovery"
                className="text-amber-400 underline hover:no-underline"
              >
                Learn how to read your discovery.
              </Link>
            </p>
            <p>
              <strong className="text-zinc-300">
                Zero attorney communication
              </strong>{" "}
              is the number one complaint filed with state bar associations
              nationwide.{" "}
              <Link
                href="/blog/attorney-not-returning-calls"
                className="text-amber-400 underline hover:no-underline"
              >
                Learn what to do when your attorney won't call back.
              </Link>
            </p>
            <p>
              <strong className="text-zinc-300">
                No defense strategy discussed
              </strong>{" "}
              means the defendant does not know the plan for their own case.{" "}
              <Link
                href="/blog/is-your-attorney-actually-working-your-case"
                className="text-amber-400 underline hover:no-underline"
              >
                Learn how to tell if your attorney is working your case.
              </Link>
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-12 rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 text-center">
          <h2 className="text-xl font-bold text-white">
            Add Your Data, Take the Score Quiz
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-zinc-400">
            The Defense Milestone Score takes 5 minutes. Your answers are
            anonymous, only aggregate counts are stored. Every completion
            strengthens this dataset and helps future defendants understand what
            to expect.
          </p>
          <Link
            href="/score"
            className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 font-semibold text-black hover:bg-amber-400 transition-colors"
          >
            Take the Defense Milestone Score
          </Link>
        </section>

        {/* Disclaimer */}
        <p className="mt-12 text-xs text-zinc-400">
          This is original research published by ImNotAnAttorney. This data is
          legal information, not legal advice. We are not attorneys and do not
          provide legal representation. If you are facing criminal charges,
          speaking with a licensed attorney in your jurisdiction is worth considering.
        </p>
      </div>
    </div>
  );
}
