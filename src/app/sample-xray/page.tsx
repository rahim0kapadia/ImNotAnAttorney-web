/**
 * Sample X-Ray Report Page (/sample-xray)
 *
 * Redacted sample of a real X-Ray discovery analysis report for a drug
 * possession case in Pinellas County, FL. Shows prospects what a $2,497
 * X-Ray report looks like before they buy.
 *
 * User journey position:
 *   /services ("See what an X-Ray report looks like") -> THIS PAGE -> /checkout?tier=x-ray
 *   Landing page / Blog CTAs -> THIS PAGE
 *
 * Page structure (11 blocks, 4 CTAs):
 *   1. Pre-flight trust signal — real case badge + context
 *   2. Case snapshot card — monospace styled case info
 *   3. First CTA — "Get My X-Ray"
 *   4. Red Flags section — 1 full CRITICAL + 1 partial SIGNIFICANT + count
 *   5. Second CTA — upgrade credit nudge
 *   6. Witness Contradiction Matrix — 2 visible rows + count
 *   7. Sample questions — 3 full format + grayed list
 *   8. Discovery Strength Rating — score visual + categories
 *   9. Process transparency — methodology overview
 *  10. Friction reduction — 4 objections handled
 *  11. Final CTA — guarantee stack + button
 *
 * SEO: Full OG metadata with specific findings in description.
 */
import { FadeInUp } from "@/components/motion/FadeInUp";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE, upgradePrice } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sample X-Ray Report — Discovery Analysis",
  description:
    "See a real X-Ray report excerpt — drug possession case, Pinellas County FL. 4 critical red flags found including a 73% weight discrepancy. 43 attorney questions generated. $2,497.",
  alternates: {
    canonical: `${SITE_URL}/sample-xray`,
  },
  openGraph: {
    title: "Sample X-Ray Report — What We Find in Your Discovery",
    description:
      "Real case, real findings. 14 red flags. 43 questions for your attorney. See what an X-Ray report looks like before you buy.",
  },
};

/** Visual separator between report sections. */
function SectionDivider() {
  return <div className="my-8 border-t border-amber-500/20" />;
}

export default function SampleXRayPage() {
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
              { "@type": "ListItem", position: 2, name: "Services", item: `${SITE_URL}/services` },
              { "@type": "ListItem", position: 3, name: "Sample X-Ray Report" },
            ],
          }),
        }}
      />
      <div className="mx-auto max-w-4xl">
        {/* ============================================================
            BLOCK 1: PRE-FLIGHT TRUST SIGNAL
            ============================================================ */}
        <FadeInUp>
          <div className="text-center">
            <span className="inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              Real Case — Redacted
            </span>
            <h1 className="mt-6 text-3xl font-bold text-white md:text-4xl">
              What an X-Ray Report Actually Looks Like
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
              This is from an actual X-Ray report — a drug possession case in
              Florida. The defendant&apos;s name and case number have been changed.
              Everything else — the documents, the contradictions, the findings —
              is real.
            </p>
          </div>
        </FadeInUp>

        {/* ============================================================
            BLOCK 2: CASE SNAPSHOT CARD
            ============================================================ */}
        <FadeInUp>
          <div className="mt-12 rounded-xl border border-amber-500/30 bg-zinc-900 p-6 font-mono text-sm md:p-8">
            <p className="text-center font-bold text-amber-400">
              X-RAY DISCOVERY ANALYSIS
            </p>
            <p className="mt-1 text-center text-xs text-zinc-400">
              ImNotAnAttorney | Know What They Know.
            </p>
            <div className="mt-6 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <span className="text-zinc-400">Charge(s):</span>{" "}
                <span className="text-zinc-300">
                  Possession of Controlled Substance, 3rd Degree Felony
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Jurisdiction:</span>{" "}
                <span className="text-zinc-300">Pinellas County, FL</span>
              </div>
              <div>
                <span className="text-zinc-400">Documents Analyzed:</span>{" "}
                <span className="text-zinc-300">47 documents, 312 pages</span>
              </div>
              <div>
                <span className="text-zinc-400">Red Flags Identified:</span>{" "}
                <span className="text-zinc-300">
                  14{" "}
                  <span className="text-zinc-400">
                    (Critical: <span className="text-red-400">4</span> /
                    Significant: <span className="text-amber-400">6</span> /
                    Notable: <span className="text-zinc-400">4</span>)
                  </span>
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Discovery Strength Rating:</span>{" "}
                <span className="text-amber-400 font-semibold">62/100</span>{" "}
                <span className="text-zinc-400">— Grade:</span>{" "}
                <span className="text-amber-400 font-semibold">C</span>
              </div>
              <div>
                <span className="text-zinc-400">Targeted Questions Generated:</span>{" "}
                <span className="text-zinc-300">43</span>
              </div>
            </div>
          </div>
        </FadeInUp>

        {/* ============================================================
            BLOCK 3: FIRST CTA
            ============================================================ */}
        <FadeInUp>
          <div className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
            <p className="text-sm font-semibold text-amber-400">
              Every set of discovery documents contains findings. The question is whether someone has looked.
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              See what&apos;s in yours.
            </p>
            <Link
              href="/checkout?tier=x-ray"
              className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Get My X-Ray — {TIER_CORE["x-ray"].priceDisplay}
            </Link>
          </div>
        </FadeInUp>

        {/* ============================================================
            BLOCK 4: RED FLAGS SECTION
            ============================================================ */}
        <FadeInUp>
          <section className="mt-16">
            <h2 className="text-2xl font-bold text-white">Red Flags</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Every finding includes the specific document, the specific page, and the
              specific question to ask your attorney.
            </p>

            {/* CRITICAL Red Flag #3 — Full verbatim */}
            <div className="mt-6 rounded-xl border border-red-500/30 bg-zinc-900 p-6">
              <div className="flex items-center gap-2">
                <span className="inline-block rounded bg-red-500/20 px-2 py-0.5 text-xs font-bold uppercase text-red-400">
                  Critical
                </span>
                <span className="text-sm font-semibold text-zinc-300">
                  Red Flag #3
                </span>
              </div>
              <h3 className="mt-3 text-lg font-bold text-white">
                Weight Discrepancy Between Field and Lab
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                  <p className="text-zinc-400">
                    <span className="font-semibold text-zinc-300">
                      Field Report (Officer Martinez, pg 4):
                    </span>{" "}
                    &ldquo;White powder substance, approximately 28.3 grams&rdquo;
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                  <p className="text-zinc-400">
                    <span className="font-semibold text-zinc-300">
                      Lab Report (Forensic Sciences, Report #FSL-2023-4471, pg 2):
                    </span>{" "}
                    &ldquo;Off-white powder substance, net weight 7.2 grams&rdquo;
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                  <p className="text-zinc-400">
                    <span className="font-semibold text-zinc-300">
                      Cross-Reference: Evidence Room Intake Log (pg 1):
                    </span>{" "}
                    &ldquo;White crystalline substance, 24.1 grams&rdquo;
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                Three documents. Three different weights. A 73% discrepancy between
                the highest (28.3g) and lowest (7.2g) measurement.
              </p>

              <div className="mt-4 rounded-lg border border-zinc-500 bg-zinc-800/30 p-4">
                <p className="text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">Framework:</span>{" "}
                  Chapman II Drug Forensic Analysis — weight discrepancies between
                  field and lab exceeding 5% indicate potential evidence integrity
                  issues. This discrepancy exceeds 73%.
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-400">
                  Question for attorney:
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  &ldquo;The field weight was 28.3g, the evidence room logged 24.1g,
                  and the lab tested 7.2g. What happened to 21.1 grams between
                  seizure and testing? Was packaging weighed separately at each
                  stage? Were calibration records for each scale preserved?&rdquo;
                </p>
              </div>
            </div>

            {/* SIGNIFICANT Red Flag #7 — Partially redacted */}
            <div className="mt-6 rounded-xl border border-amber-500/30 bg-zinc-900 p-6">
              <div className="flex items-center gap-2">
                <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold uppercase text-amber-400">
                  Significant
                </span>
                <span className="text-sm font-semibold text-zinc-300">
                  Red Flag #7
                </span>
              </div>
              <h3 className="mt-3 text-lg font-bold text-white">
                Miranda Timing Inconsistency
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                  <p className="text-zinc-400">
                    <span className="font-semibold text-zinc-300">
                      Arrest Report (pg 2):
                    </span>{" "}
                    &ldquo;Miranda rights administered at 14:32&rdquo;
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                  <p className="text-zinc-400">
                    <span className="font-semibold text-zinc-300">
                      Booking Record (pg 1):
                    </span>{" "}
                    &ldquo;Defendant made voluntary statements at 14:15&rdquo;
                  </p>
                </div>
              </div>

              {/* Redacted block */}
              <div className="mt-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 p-4 text-center">
                <p className="text-sm text-zinc-400">
                  [REDACTED — Attorney questions for this finding included in your report]
                </p>
              </div>
            </div>

            {/* Remaining count */}
            <p className="mt-6 text-center text-sm text-zinc-400">
              12 more red flags identified —{" "}
              <span className="text-red-400">2 CRITICAL</span>,{" "}
              <span className="text-amber-400">4 SIGNIFICANT</span>,{" "}
              <span className="text-zinc-300">4 NOTABLE</span> — all with
              specific document citations and attorney questions.
            </p>
          </section>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 5: SECOND CTA
            ============================================================ */}
        <FadeInUp>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
            <p className="text-sm text-zinc-300">
              This is one finding from one case. Yours will be different — but the
              process is the same. Every document reviewed. Every discrepancy
              documented. Every question calibrated to your case.
            </p>
            <Link
              href="/checkout?tier=x-ray"
              className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Get My X-Ray — {TIER_CORE["x-ray"].priceDisplay}
            </Link>
            <p className="mt-2 text-xs text-zinc-400">
              Previously purchased Case Decoder or Intelligence Brief? You owe only
              the difference.
            </p>
          </div>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 6: WITNESS CONTRADICTION MATRIX
            ============================================================ */}
        <FadeInUp>
          <section>
            <h2 className="text-2xl font-bold text-white">
              Witness Contradiction Matrix
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Cross-referenced statements from officers, witnesses, and reports.
            </p>

            {/* Desktop table */}
            <div className="mt-6 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Witness contradiction matrix comparing statements and discrepancies</caption>
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th scope="col" className="pb-2 pr-4">Witness A</th>
                    <th scope="col" className="pb-2 pr-4">Says</th>
                    <th scope="col" className="pb-2 pr-4">Witness B</th>
                    <th scope="col" className="pb-2 pr-4">Says</th>
                    <th scope="col" className="pb-2">Discrepancy</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-500">
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Officer Martinez
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      &ldquo;Suspect was combative, resisted being placed in
                      handcuffs&rdquo;
                    </td>
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Officer Davis (backup report, pg 3)
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      &ldquo;Suspect was cooperative, placed hands behind back when
                      instructed&rdquo;
                    </td>
                    <td className="py-3 text-zinc-300">
                      Same arrest, opposite descriptions of defendant behavior
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Lab Analyst Chen
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      &ldquo;Substance tested positive for cocaine
                      hydrochloride&rdquo;
                    </td>
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Field Test (Officer Martinez, pg 5)
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      &ldquo;Substance tested presumptive positive for
                      methamphetamine&rdquo;
                    </td>
                    <td className="py-3 text-zinc-300">
                      Different substance identified by field test vs. lab
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="mt-6 space-y-4 md:hidden">
              <div className="rounded-lg border border-zinc-500 bg-zinc-900 p-4">
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-semibold text-amber-400">Officer Martinez:</span>{" "}
                    <span className="text-zinc-400">
                      &ldquo;Suspect was combative, resisted being placed in handcuffs&rdquo;
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-amber-400">Officer Davis (backup report, pg 3):</span>{" "}
                    <span className="text-zinc-400">
                      &ldquo;Suspect was cooperative, placed hands behind back when instructed&rdquo;
                    </span>
                  </p>
                  <p className="text-xs text-zinc-300">
                    Same arrest, opposite descriptions of defendant behavior
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-500 bg-zinc-900 p-4">
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-semibold text-amber-400">Lab Analyst Chen:</span>{" "}
                    <span className="text-zinc-400">
                      &ldquo;Substance tested positive for cocaine hydrochloride&rdquo;
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-amber-400">Field Test (Officer Martinez, pg 5):</span>{" "}
                    <span className="text-zinc-400">
                      &ldquo;Substance tested presumptive positive for methamphetamine&rdquo;
                    </span>
                  </p>
                  <p className="text-xs text-zinc-300">
                    Different substance identified by field test vs. lab
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-sm text-zinc-400">
              +6 more witness contradictions identified and mapped in your report.
            </p>
          </section>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 7: SAMPLE QUESTIONS
            ============================================================ */}
        <FadeInUp>
          <section>
            <h2 className="text-2xl font-bold text-white">
              Targeted Questions for Your Attorney
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Showing 3 of 43 questions from this report. Each includes what a solid
              answer looks like — and what a red flag answer looks like.
            </p>

            <div className="mt-6 space-y-6">
              {/* Q1 — Evidence */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6">
                <p className="text-xs font-semibold text-amber-400">
                  Q1 — EVIDENCE
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;The field weight was 28.3 grams. The lab weight was 7.2
                  grams. What accounts for this 73% discrepancy?&rdquo;
                </p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-300">Basis:</span>{" "}
                    Weight Discrepancy Analysis (Red Flag #3)
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">Framework:</span>{" "}
                    Chapman II Drug Forensic Analysis
                  </p>
                  <p>
                    <span className="font-semibold text-green-400">
                      A solid answer:
                    </span>{" "}
                    &ldquo;The field weight included packaging. The lab weighs the
                    net substance only. Here are the packaging weights documented at
                    each stage.&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-red-400">
                      A red flag answer:
                    </span>{" "}
                    &ldquo;That&apos;s just how it works&rdquo; or &ldquo;The lab is
                    what matters&rdquo; without explaining the discrepancy.
                  </p>
                </div>
              </div>

              {/* Q2 — Chain of Custody */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6">
                <p className="text-xs font-semibold text-amber-400">
                  Q2 — CHAIN OF CUSTODY
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;Evidence was checked out of the property room for 96 hours
                  with no documented purpose. Who had custody during this
                  period?&rdquo;
                </p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-300">Basis:</span>{" "}
                    Chain of Custody Break (Red Flag #5)
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">Framework:</span>{" "}
                    Scheck Evidence Integrity Protocol
                  </p>
                  <p>
                    <span className="font-semibold text-green-400">
                      A solid answer:
                    </span>{" "}
                    &ldquo;The evidence was sent to an external lab for confirmation
                    testing. Here is the transfer documentation.&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-red-400">
                      A red flag answer:
                    </span>{" "}
                    &ldquo;I&apos;d have to look into that&rdquo; or &ldquo;The
                    property room logs should show it.&rdquo;
                  </p>
                </div>
              </div>

              {/* Q3 — Constitutional */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6">
                <p className="text-xs font-semibold text-amber-400">
                  Q3 — CONSTITUTIONAL
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;I made statements at 14:15. The arrest report shows Miranda
                  wasn&apos;t read until 14:32. Does that timing create a suppression
                  argument?&rdquo;
                </p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-300">Basis:</span>{" "}
                    Miranda Timing Inconsistency (Red Flag #7)
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">Framework:</span>{" "}
                    MacCarthy Suppression Methodology
                  </p>
                  <p>
                    <span className="font-semibold text-green-400">
                      A solid answer:
                    </span>{" "}
                    &ldquo;Yes, I&apos;ve already drafted a motion to suppress.
                    Here&apos;s our argument.&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-red-400">
                      A red flag answer:
                    </span>{" "}
                    &ldquo;Miranda doesn&apos;t apply here&rdquo; without citing the
                    specific exception.
                  </p>
                </div>
              </div>
            </div>

            {/* Grayed remaining questions */}
            <div className="mt-6 space-y-2 text-sm text-zinc-400">
              <p>Q4: Lab analyst certification and training records...</p>
              <p>Q5: Field test reagent lot number and expiration...</p>
              <p>Q6: Evidence room temperature and humidity controls...</p>
              <p className="text-zinc-400">
                ... and 37 more, specific to your case details and documents
              </p>
            </div>
          </section>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 8: DISCOVERY STRENGTH RATING
            ============================================================ */}
        <FadeInUp>
          <section>
            <h2 className="text-2xl font-bold text-white">
              Discovery Strength Rating
            </h2>

            <div className="mt-6 rounded-xl border border-zinc-500 bg-zinc-900 p-6">
              {/* Score display */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
                <div className="text-center">
                  <p className="text-5xl font-bold text-amber-400">62</p>
                  <p className="text-sm text-zinc-400">/100</p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-2xl font-bold text-white">
                    Grade: <span className="text-amber-400">C</span>
                  </p>
                </div>
              </div>

              {/* Category rows */}
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Discovery health grades by document category</caption>
                  <thead>
                    <tr className="border-b border-zinc-700 text-left text-zinc-400">
                      <th scope="col" className="pb-2 pr-4">Category</th>
                      <th scope="col" className="pb-2 pr-4">Grade</th>
                      <th scope="col" className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    <tr className="border-b border-zinc-500">
                      <td className="py-3 pr-4">Police/Arrest Reports</td>
                      <td className="py-3 pr-4 font-semibold text-green-400">B</td>
                      <td className="py-3 text-zinc-400">Mostly complete</td>
                    </tr>
                    <tr className="border-b border-zinc-500">
                      <td className="py-3 pr-4">Lab/Forensic Reports</td>
                      <td className="py-3 pr-4 font-semibold text-red-400">D</td>
                      <td className="py-3 text-zinc-400">Significant gaps</td>
                    </tr>
                    <tr className="border-b border-zinc-500">
                      <td className="py-3 pr-4 text-zinc-400" colSpan={3}>
                        [In your report]
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-500">
                      <td className="py-3 pr-4 text-zinc-400" colSpan={3}>
                        [In your report]
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-500">
                      <td className="py-3 pr-4 text-zinc-400" colSpan={3}>
                        [In your report]
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 text-zinc-400" colSpan={3}>
                        [In your report]
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-lg border border-zinc-500 bg-zinc-800/30 p-4">
                <p className="text-sm text-zinc-300">
                  <span className="font-semibold text-white">
                    What a C means:
                  </span>{" "}
                  Your discovery has enough documentation to identify issues, but
                  significant gaps exist — particularly in forensic documentation.
                  These gaps are themselves findings.
                </p>
              </div>
            </div>
          </section>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 9: PROCESS TRANSPARENCY
            ============================================================ */}
        <FadeInUp>
          <section className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-bold text-white">How Every X-Ray Is Built</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Every X-Ray is built the same way: document-by-document analysis using
              defense methodologies including Scheck evidence integrity protocols,
              Chapman II drug forensic analysis, and MacCarthy suppression methodology —
              plus 15 forensic detection patterns. Every report is reviewed by the
              operator before delivery. No finding ships without a specific document
              citation.
            </p>
          </section>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 10: FRICTION REDUCTION — 4 OBJECTIONS
            ============================================================ */}
        <FadeInUp>
          <section>
            <h2 className="text-2xl font-bold text-white">
              Common Questions
            </h2>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                <p className="font-semibold text-white">
                  &ldquo;{TIER_CORE["x-ray"].priceDisplay} is a lot of money.&rdquo;
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  A single pretrial motion from a private attorney costs
                  $2,500-$5,000. This analysis covers your entire discovery — every
                  document, every contradiction, every question — for less than one
                  motion. And your {TIER_CORE["x-ray"].priceDisplay} is fully credited if you
                  upgrade to {TIER_CORE["war-room"].name}.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                <p className="font-semibold text-white">
                  &ldquo;I don&apos;t have all my discovery yet.&rdquo;
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  That&apos;s fine — and it&apos;s actually useful information. An
                  incomplete discovery set is itself a finding. We document
                  what&apos;s missing and generate questions about why it hasn&apos;t
                  been provided.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                <p className="font-semibold text-white">
                  &ldquo;My attorney already reviewed my discovery.&rdquo;
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  The question is whether that review produced specific, documented
                  findings with page citations — and whether you saw them. If your
                  attorney found a 73% weight discrepancy, they should be able to show
                  you where.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                <p className="font-semibold text-white">
                  &ldquo;Is this legal advice?&rdquo;
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  No. This is legal information and research — document analysis with
                  specific questions. Your attorney makes strategy decisions. We make
                  sure you have the information to ask the right questions.
                </p>
              </div>
            </div>
          </section>
        </FadeInUp>

        <SectionDivider />

        {/* ============================================================
            BLOCK 11: FINAL CTA
            ============================================================ */}
        <FadeInUp>
          <section className="rounded-xl border border-amber-500/30 bg-zinc-900 p-8 text-center">
            <h2 className="text-2xl font-bold text-white">
              Your documents contain information about your case.
            </h2>
            <p className="mt-1 text-lg text-amber-400">
              The X-Ray finds it.
            </p>

            {/* Guarantee stack */}
            <div className="mx-auto mt-8 max-w-2xl space-y-3 text-left">
              <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                <p className="text-sm font-semibold text-white">
                  The Discovery Guarantee
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  If we analyze your discovery and don&apos;t identify at least one
                  concrete issue your attorney can act on — a contradiction, a chain
                  of custody gap, a constitutional question — you get every dollar
                  back. No forms. No phone calls.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                <p className="text-sm font-semibold text-white">
                  The Attorney Meeting Guarantee
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Every X-Ray includes a formatted Attorney Delivery Package your
                  attorney can read in 10 minutes, sourced back to specific pages. If
                  your attorney says there&apos;s nothing there, send us their
                  response — second round of analysis at no charge.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-500 bg-zinc-950/50 p-4">
                <p className="text-sm font-semibold text-white">
                  The Delivery Commitment
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Delivered within 10 business days of document receipt or 20%
                  automatic refund. Past 15 business days: full refund. Your case
                  moves on a schedule. So do we.
                </p>
              </div>
            </div>

            <Link
              href="/checkout?tier=x-ray"
              className="mt-8 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-colors hover:bg-amber-400"
            >
              Get My X-Ray — {TIER_CORE["x-ray"].priceDisplay}
            </Link>
          </section>
        </FadeInUp>

        {/* DISCLAIMER */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          Names, case numbers, and dates have been changed. ImNotAnAttorney
          provides legal information and research — not legal advice.
        </p>
      </div>
    </div>
  );
}
