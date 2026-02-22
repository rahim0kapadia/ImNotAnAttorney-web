import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sample Case Decoder Report — Real Case, Redacted",
  description:
    "See what a Case Decoder report actually looks like. Real trafficking case analysis: 73% weight discrepancy, fatal substance variance, 21 unmatched fingerprints. Every question traced to elite defense attorney methodology.",
  alternates: {
    canonical: "https://imnotanattorney.com/sample",
  },
  openGraph: {
    title: "Sample Case Decoder Report — Real Findings from a Real Case",
    description:
      "73% of evidence weight missing. Wrong drug charged. 21 fingerprints — zero match. See what our analysis actually finds.",
  },
};

function SectionDivider() {
  return <div className="my-8 border-t border-amber-500/20" />;
}

function InlineCTA({ variant }: { variant: "mid" | "end" }) {
  return (
    <div className="my-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
      <p className="text-sm font-semibold text-amber-400">
        {variant === "mid"
          ? "This is what case-specific research looks like."
          : "Every question above came from one case. Imagine what we'll find in yours."}
      </p>
      <p className="mt-2 text-sm text-zinc-400">
        {variant === "mid"
          ? "Want questions built from YOUR case details?"
          : "15 questions. 5 red flags. 5 potential motions. Starting at $97."}
      </p>
      <Link
        href="/checkout?tier=case-decoder"
        className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
      >
        Find What&apos;s in My Case — $97 →
      </Link>
    </div>
  );
}

export default function SamplePage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        {/* Page header */}
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-500">
            Sample Report — Real Case, Redacted
          </p>
          <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">
            What a Case Decoder Actually Looks Like
          </h1>
          <p className="mt-4 text-zinc-400">
            This is a real report from a real trafficking case. Names, case
            numbers, and dates have been changed. The findings are real. The
            questions are real. The attorney had found none of it.
          </p>
        </div>

        {/* Report container */}
        <div className="mt-12 rounded-xl border border-amber-500/30 bg-zinc-900 p-6 md:p-10">
          {/* Report header */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 font-mono text-sm text-zinc-300">
            <p className="text-center font-bold text-amber-400">
              CASE DECODER REPORT
            </p>
            <p className="mt-1 text-center text-xs text-zinc-400">
              ImNotAnAttorney | We Research. You Ask.
            </p>
            <div className="mt-4 space-y-1 text-xs">
              <p>
                <span className="text-zinc-400">Prepared for:</span> Marcus T.
              </p>
              <p>
                <span className="text-zinc-400">Charge(s):</span> Trafficking
                in Amphetamine (25g+)
              </p>
              <p>
                <span className="text-zinc-400">Jurisdiction:</span> Brevard
                County, FL
              </p>
              <p>
                <span className="text-zinc-400">Case Stage:</span> Pre-Trial
              </p>
            </div>
          </div>

          {/* Methodology note */}
          <div className="mt-8 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Methodology
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Every question in this report traces to a specific documented
              winning method from elite criminal defense attorneys:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-400">
              <li>
                <span className="font-semibold text-white">
                  CI reliability questions
                </span>{" "}
                → Jeffrey Lichtman&apos;s 7-pillar informant destruction protocol
                — the same methodology Lichtman used to win 3 mistrials for John
                Gotti Jr. and lead El Chapo&apos;s defense.
              </li>
              <li>
                <span className="font-semibold text-white">
                  Forensic and evidence questions
                </span>{" "}
                → Barry Scheck&apos;s chain of custody methodology —
                co-founder of the Innocence Project, lead DNA counsel in OJ
                Simpson, responsible for 375+ wrongful conviction exonerations.
              </li>
              <li>
                <span className="font-semibold text-white">
                  Constitutional and suppression issues
                </span>{" "}
                → Alan Dershowitz&apos;s appellate preservation framework —
                youngest full professor at Harvard Law, reversed the Claus von
                Bulow conviction.
              </li>
              <li>
                <span className="font-semibold text-white">
                  Weight and substance analysis
                </span>{" "}
                → Ron Chapman II&apos;s drug forensic protocols — former
                federal prosecutor turned defense specialist.
              </li>
            </ul>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              Each question traces to a specific documented winning method. This
              is not a general checklist.
            </p>
          </div>

          <SectionDivider />

          {/* Section 1: Charges */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Section 1: Your Charges — In Plain English
            </h2>
            <div className="mt-4">
              <h3 className="font-semibold text-amber-400">
                Trafficking in Amphetamine (25g+) — F.S. §
                893.135(1)(f)1
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                The State alleges that Marcus T. knowingly possessed 25 grams or
                more of amphetamine. Under Florida law, trafficking is
                determined solely by weight — not by whether you were actually
                &ldquo;trafficking.&rdquo; Possessing over the threshold weight
                IS trafficking, regardless of intent.
              </p>

              <div className="mt-4 text-sm text-zinc-400">
                <p className="font-semibold text-zinc-300">
                  What the prosecution must prove:
                </p>
                <ol className="ml-5 mt-2 list-decimal space-y-1">
                  <li>Knowing possession or constructive possession of the substance</li>
                  <li>The substance is amphetamine (as defined by Florida statute)</li>
                  <li>The weight meets or exceeds 25 grams</li>
                </ol>
              </div>

              <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-sm">
                <p className="text-zinc-300">
                  <span className="font-semibold text-white">
                    Mandatory minimum:
                  </span>{" "}
                  3 years Florida State Prison + $50,000 fine (25g–199g)
                </p>
                <p className="mt-1 text-zinc-300">
                  <span className="font-semibold text-white">Maximum:</span> 30
                  years + $500,000 fine
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <p className="text-sm font-bold text-red-400">
                  FATAL VARIANCE IDENTIFIED
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  The charging document alleges{" "}
                  <em className="text-white">amphetamine</em>. The FDLE lab
                  confirmed{" "}
                  <em className="text-white">MDMA/MDA</em> — not amphetamine.
                  These are different substances under different statutory
                  provisions. This is a potentially fatal variance between the
                  charge and the evidence.
                </p>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* Section 2: Case Stage */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Section 2: Where Your Case Should Be Right Now
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th className="pb-2 pr-4">Milestone</th>
                    <th className="pb-2 pr-4">Typical Timing</th>
                    <th className="pb-2">Your Status</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4">Arraignment</td>
                    <td className="py-2 pr-4">Within 30 days</td>
                    <td className="py-2 text-green-400">Done</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4">Discovery production</td>
                    <td className="py-2 pr-4">30-60 days</td>
                    <td className="py-2 text-amber-400">
                      Partial — gaps exist
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4">Depositions</td>
                    <td className="py-2 pr-4">60-120 days</td>
                    <td className="py-2 text-red-400">Not scheduled</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4">Motion to suppress</td>
                    <td className="py-2 pr-4">Pre-trial</td>
                    <td className="py-2 text-red-400">No motions filed</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4">Pre-trial conference</td>
                    <td className="py-2 pr-4">90-180 days</td>
                    <td className="py-2 text-amber-400">Pending</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Trial setting</td>
                    <td className="py-2 pr-4">175-day speedy</td>
                    <td className="py-2 text-red-400">Approaching</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-sm font-bold text-red-400">
                Assessment: BEHIND SCHEDULE
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                At this stage, the attorney should have completed discovery
                review, identified the substance variance, flagged the weight
                discrepancy, and filed or discussed motions. None of these steps
                appear to have occurred.
              </p>
            </div>
          </section>

          <SectionDivider />

          {/* Section 3: Attorney Accountability */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Section 3: Attorney Accountability Checklist
            </h2>
            <div className="mt-4 space-y-2">
              {[
                { done: true, text: "Explained charges and penalties" },
                {
                  done: false,
                  text: "Reviewed discovery with client",
                },
                {
                  done: false,
                  text: "Identified substance mismatch (amphetamine vs. MDMA/MDA)",
                },
                {
                  done: false,
                  text: "Flagged 73% weight discrepancy",
                },
                {
                  done: false,
                  text: "Discussed fingerprint results (21 prints, 0 match)",
                },
                {
                  done: false,
                  text: "Discussed CI phone number dual attribution",
                },
                {
                  done: false,
                  text: "Filed or discussed motions to suppress",
                },
                {
                  done: false,
                  text: "Filed or discussed motion to dismiss (fatal variance)",
                },
                { done: true, text: "Communicated at least every 2 weeks" },
                {
                  done: true,
                  text: "Discussed plea vs. trial strategy",
                },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-0.5 ${item.done ? "text-green-400" : "text-red-400"}`}
                  >
                    {item.done ? "✓" : "✕"}
                  </span>
                  <span
                    className={
                      item.done ? "text-zinc-400" : "font-semibold text-zinc-200"
                    }
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-2xl font-bold text-red-400">3 / 10</p>
              <p className="mt-1 text-sm text-zinc-400">
                Significant gaps in attorney engagement on case-specific issues.
                The substance variance, weight discrepancy, and fingerprint
                results should have been raised within 30 days of discovery
                review.
              </p>
            </div>
          </section>

          <InlineCTA variant="mid" />

          <SectionDivider />

          {/* Section 4: Questions (top 5 shown) */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Section 4: 15 Questions to Ask Your Attorney
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Showing 5 of 15 questions from this report. Each is built from
              actual case findings.
            </p>

            <div className="mt-6 space-y-6">
              {/* Q1 */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q1 — WEIGHT DISCREPANCY
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;The police inventory shows 93.9g seized at the scene.
                  The FDLE lab shows 25.59g tested. That&apos;s 68.3 grams —
                  73% of the evidence — unaccounted for. Where is the missing
                  weight?&rdquo;
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    Why this matters:
                  </span>{" "}
                  Weight determines the trafficking tier and mandatory minimum. A
                  73% discrepancy suggests evidence handling problems.
                </p>
                <p className="mt-2 text-xs italic text-zinc-500">
                  SOURCE: Barry Scheck&apos;s chain of custody protocol — used
                  in OJ Simpson and 375+ Innocence Project exonerations.
                </p>
              </div>

              {/* Q2 */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q2 — FATAL SUBSTANCE VARIANCE
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;The charging document says &lsquo;amphetamine.&rsquo;
                  The FDLE lab confirmed MDMA and MDA — not amphetamine. Has a
                  motion to dismiss based on fatal variance been filed? If not,
                  why not?&rdquo;
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    Why this matters:
                  </span>{" "}
                  If the charge doesn&apos;t match the lab evidence, the State
                  may be forced to amend — potentially changing penalties
                  entirely.
                </p>
                <p className="mt-2 text-xs italic text-zinc-500">
                  SOURCE: Ron Chapman II&apos;s substance identification protocol
                  for federal drug cases.
                </p>
              </div>

              {/* Q3 */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q3 — FINGERPRINTS
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;21 latent fingerprints collected. Not a single one
                  matches the defendant. Whose prints are they? Has a motion to
                  compel full comparison results been filed?&rdquo;
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    Why this matters:
                  </span>{" "}
                  In a constructive possession case, the State must prove knowing
                  possession. Zero fingerprint match is powerful reasonable doubt.
                </p>
                <p className="mt-2 text-xs italic text-zinc-500">
                  SOURCE: Barry Scheck&apos;s forensic evidence methodology.
                </p>
              </div>

              {/* Q4 */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q4 — CI PHONE DUAL ATTRIBUTION
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;The same phone number is attributed to both the
                  confidential informant and the defendant in the same
                  detective&apos;s report. Has a Franks v. Delaware motion been
                  considered?&rdquo;
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    Why this matters:
                  </span>{" "}
                  Factual inconsistencies in a sworn affidavit can be grounds to
                  challenge the entire search warrant.
                </p>
                <p className="mt-2 text-xs italic text-zinc-500">
                  SOURCE: Jeffrey Lichtman&apos;s 7-pillar CI destruction
                  playbook — Gotti Jr., El Chapo.
                </p>
              </div>

              {/* Q5 */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q5 — IDENTITY MISMATCH
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;The SUSPECT identification photo shows an individual
                  with a full head of hair. The defendant is bald. Has this
                  discrepancy been documented?&rdquo;
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">
                    Why this matters:
                  </span>{" "}
                  A physical description mismatch raises fundamental identity
                  questions about the investigation&apos;s target.
                </p>
              </div>

              <p className="text-center text-sm text-zinc-400">
                + 10 more questions covering money discrepancies, report timeline
                impossibilities, CI reliability history, chain of custody gaps,
                constructive possession standards, and motion deadlines.
              </p>
            </div>
          </section>

          <SectionDivider />

          {/* Section 5: Red Flags */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Section 5: Red Flags
            </h2>
            <div className="mt-4 space-y-4">
              {[
                {
                  flag: "Attorney Inaction on Foundational Issues",
                  desc: "Substance variance, weight discrepancy, and fingerprint results are foundational issues that should have been raised immediately.",
                },
                {
                  flag: "Fatal Substance Variance Unaddressed",
                  desc: "Being charged with the wrong substance is one of the most powerful defense tools. No motion to dismiss has been filed.",
                },
                {
                  flag: "73% Weight Discrepancy Ignored",
                  desc: "Nearly three-quarters of the alleged evidence weight is unaccounted for between seizure and lab testing.",
                },
                {
                  flag: "Identity Contradiction in Case File",
                  desc: "SUSPECT photo shows hair — defendant is bald. Fundamental investigation target identification issue.",
                },
                {
                  flag: "Impossible Report Dates",
                  desc: "A report dated before the events it describes. Either administrative error or something worse.",
                },
              ].map((item) => (
                <div
                  key={item.flag}
                  className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4"
                >
                  <span className="mt-0.5 text-red-400">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {item.flag}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <SectionDivider />

          {/* Section 6: Motions */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Section 6: Motions That May Apply
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th className="pb-2 pr-4">Motion</th>
                    <th className="pb-2 pr-4">What It Does</th>
                    <th className="pb-2">Deadline?</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Dismiss — Fatal Variance
                    </td>
                    <td className="py-2 pr-4">
                      Charge (amphetamine) doesn&apos;t match evidence (MDMA/MDA)
                    </td>
                    <td className="py-2 text-red-400">Before plea/trial</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Suppress — Franks v. Delaware
                    </td>
                    <td className="py-2 pr-4">
                      Challenge warrant based on CI phone inconsistency
                    </td>
                    <td className="py-2 text-red-400">Pre-trial</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Compel Discovery
                    </td>
                    <td className="py-2 pr-4">
                      Force production of fingerprint analysis, weight docs, CI
                      history
                    </td>
                    <td className="py-2 text-amber-400">File ASAP</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Daubert Challenge
                    </td>
                    <td className="py-2 pr-4">
                      Challenge field test reliability and lab methodology
                    </td>
                    <td className="py-2 text-red-400">Pre-trial</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Suppress — Weight
                    </td>
                    <td className="py-2 pr-4">
                      73% discrepancy makes weight evidence unreliable
                    </td>
                    <td className="py-2 text-red-400">Pre-trial</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <InlineCTA variant="end" />
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          Names, case numbers, and dates have been changed. Findings and
          discrepancy magnitudes are real. ImNotAnAttorney provides legal
          information and research — not legal advice.
        </p>
      </div>
    </div>
  );
}
