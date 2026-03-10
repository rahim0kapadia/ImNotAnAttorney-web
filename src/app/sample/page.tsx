/**
 * Sample Report Page (/sample)
 *
 * Redacted sample of a real Case Decoder report (v2 emotional architecture),
 * used as proof of deliverable quality. This is one of the highest-impact
 * conversion pages — visitors who view the sample are significantly more
 * likely to purchase.
 *
 * User journey position:
 *   Landing page ("See What We Found") -> THIS PAGE -> /checkout?tier=case-decoder
 *   /services ("View Sample Report") -> THIS PAGE
 *   /checkout ("Preview what you'll get") -> THIS PAGE
 *
 * Content source: Based on a real DWI case (Sarah M., TX), with names,
 * case numbers, and dates changed. The v2 emotional architecture is shown.
 *
 * Report sections shown (v2 structure):
 *   1. Report header — Client name, charges, jurisdiction (redacted)
 *   2. Methodology note — Names the 3 God Mode experts for this charge type
 *   3. Where Things Stand — 4-area diagnostic table (Communication, Preparation,
 *      Strategy, Filing Activity) with "What to Ask About" column
 *   4. Understanding Your Charges — Elements table with "Question for Your Attorney"
 *      column, penalty range, "What this means" plain English
 *   5. Mid-page CTA — Conversion point
 *   6. Exactly What to Say — Ready-to-send email template (preview)
 *   7. Questions for Your Attorney — 3 of 15 shown in 6-part format
 *   8. Your Next 7 Days — 7-day action plan (preview)
 *   9. End-page CTA — Final conversion point
 *
 * Two inline CTAs strategically placed:
 *   - Mid-page (after charges section) — catches engaged readers
 *   - End-page (after 7-day plan) — catches completionists
 *
 * SEO: Full OG metadata with specific findings in description.
 */
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sample Case Decoder Report — Real Case, Redacted",
  description:
    "See what a Case Decoder report actually looks like. Real DWI case analysis: 15 calibrated attorney questions, ready-to-send email templates, 7-day action plan. Built from elite defense methodology.",
  alternates: {
    canonical: `${SITE_URL}/sample`,
  },
  openGraph: {
    title: "Sample Case Decoder Report — Real Findings from a Real Case",
    description:
      "15 calibrated questions. Ready-to-send email templates. A 7-day action plan. See what a Case Decoder actually delivers.",
  },
};

/** Visual separator between report sections — amber-tinted line. */
function SectionDivider() {
  return <div className="my-8 border-t border-amber-500/20" />;
}

/**
 * InlineCTA — conversion callout placed within the report body.
 * "mid" variant: after the charges section (engagement point).
 * "end" variant: after the 7-day plan (completion point).
 * Both link to /checkout?tier=case-decoder at $197.
 */
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
          ? "Want questions and communication tools built from YOUR case details?"
          : `15 questions. Email templates. A 7-day plan. Starting at ${TIER_CORE["case-decoder"].priceDisplay}.`}
      </p>
      <Link
        href="/checkout?tier=case-decoder"
        className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
      >
        Get Questions My Attorney Can&apos;t Dodge — {TIER_CORE["case-decoder"].priceDisplay} →
      </Link>
    </div>
  );
}

export default function SamplePage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        {/* PAGE HEADER — Sets expectations: real case, redacted, v2 structure */}
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-500">
            Sample Report — Real Case, Redacted
          </p>
          <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">
            What a Case Decoder Actually Looks Like
          </h1>
          <p className="mt-4 text-zinc-400">
            This is from a real DWI case. Names, case numbers, and dates have
            been changed. The questions, communication tools, and action plan are
            real. The attorney hadn&apos;t addressed most of what we found.
          </p>
        </div>

        {/* REPORT CONTAINER — Styled to look like the actual delivered report */}
        <div className="mt-12 rounded-xl border border-amber-500/30 bg-zinc-900 p-6 md:p-10">
          {/* REPORT HEADER — Monospace styled case info block (redacted) */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 font-mono text-sm text-zinc-300">
            <p className="text-center font-bold text-amber-400">
              CASE DECODER REPORT
            </p>
            <p className="mt-1 text-center text-xs text-zinc-400">
              ImNotAnAttorney | We Research. You Ask.
            </p>
            <div className="mt-4 space-y-1 text-xs">
              <p>
                <span className="text-zinc-400">Prepared for:</span> Sarah M.
              </p>
              <p>
                <span className="text-zinc-400">Charge(s):</span> DWI — First
                Offense (Class B Misdemeanor)
              </p>
              <p>
                <span className="text-zinc-400">Jurisdiction:</span> Harris
                County, TX
              </p>
              <p>
                <span className="text-zinc-400">Days Since Arrest:</span> 47
              </p>
            </div>
          </div>

          {/* METHODOLOGY NOTE — Names the 3 God Mode experts for DWI. */}
          <div className="mt-8 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Methodology Note
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Every question and framework in this report traces to documented
              winning methods from elite criminal defense attorneys. Your report
              draws on elite defense methodology — forensic evidence
              analysis, cross-examination frameworks, and DWI suppression
              strategy — selected for DWI cases from 40+ documented attorney
              methodologies.
            </p>
          </div>

          <SectionDivider />

          {/* WHERE THINGS STAND — 4-area diagnostic table (v2 core section) */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Where Things Stand
            </h2>
            <p className="mt-2 text-sm italic text-zinc-400">
              This is not a grade on your attorney or your case. It&apos;s a map
              of what you know and what you don&apos;t know — based on what you
              shared with us.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th className="pb-2 pr-4">Area</th>
                    <th className="pb-2 pr-4">What You Told Us</th>
                    <th className="pb-2 pr-4">What to Ask About</th>
                    <th className="pb-2">Priority Qs</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800">
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Communication
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      You said your attorney hasn&apos;t returned calls in 3
                      weeks. Communication gaps happen — sometimes attorneys are
                      working behind the scenes.
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      &ldquo;What&apos;s been happening with my case since we
                      last spoke?&rdquo;
                    </td>
                    <td className="py-3 text-amber-400">→ Q1, Q2</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Preparation
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      You mentioned you haven&apos;t reviewed any discovery yet. At
                      47 days since arrest, this is worth asking about.
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      &ldquo;Has discovery been requested? When can I review
                      it?&rdquo;
                    </td>
                    <td className="py-3 text-amber-400">→ Q3, Q7</td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Strategy
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      You shared that you don&apos;t know the defense strategy
                      yet. Understanding the full picture will help you make
                      informed decisions.
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      &ldquo;What&apos;s our overall defense strategy, and what
                      are my options?&rdquo;
                    </td>
                    <td className="py-3 text-amber-400">→ Q4, Q5</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-amber-400">
                      Filing Activity
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">
                      You told us no motions have been filed. That&apos;s a
                      common gap — most defendants aren&apos;t told about filings
                      proactively.
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      &ldquo;Have any motions been filed or considered in my
                      case?&rdquo;
                    </td>
                    <td className="py-3 text-amber-400">→ Q6, Q8</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-zinc-400">
              <span className="font-semibold text-zinc-300">
                What this tells you:
              </span>{" "}
              The &ldquo;What to Ask About&rdquo; column is the starting point
              for your next conversation. The questions in Questions for Your
              Attorney go deeper.
            </p>
          </section>

          <SectionDivider />

          {/* UNDERSTANDING YOUR CHARGES — Elements table + penalty range (v2) */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Understanding Your Charges
            </h2>
            <div className="mt-4">
              <h3 className="font-semibold text-amber-400">
                DWI — First Offense (Class B Misdemeanor) — Tex. Penal Code §
                49.04
              </h3>

              <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-sm">
                <p className="text-zinc-300">
                  <span className="font-semibold text-white">
                    Penalty range:
                  </span>{" "}
                  Up to 180 days county jail + $2,000 fine. Driver&apos;s license
                  suspension 90 days – 1 year.
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  These are statutory maximums, not predictions. The questions in
                  this report help you understand the realistic range for YOUR
                  case.
                </p>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-300">
                  What this means:
                </span>{" "}
                A DWI first offense in Texas is a Class B misdemeanor. You were
                stopped, tested, and charged with operating a motor vehicle in a
                public place while intoxicated. &ldquo;Intoxicated&rdquo; means
                either a BAC of 0.08+ or losing normal use of mental or physical
                faculties. The prosecution has to prove both that you were
                driving and that you were intoxicated — those are two separate
                things, and both are worth asking about.
              </p>

              <div className="mt-4 overflow-x-auto">
                <p className="text-sm font-semibold text-zinc-300">
                  What the prosecution must prove (elements):
                </p>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-left text-zinc-400">
                      <th className="pb-2 pr-4">Element</th>
                      <th className="pb-2 pr-4">Plain English</th>
                      <th className="pb-2">Question for Your Attorney</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    <tr className="border-b border-zinc-800">
                      <td className="py-2 pr-4">Operation of motor vehicle</td>
                      <td className="py-2 pr-4 text-zinc-400">
                        You were driving or in physical control of the vehicle
                      </td>
                      <td className="py-2 text-zinc-400">
                        &ldquo;Is there any question about whether I was actually
                        operating the vehicle?&rdquo;
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-800">
                      <td className="py-2 pr-4">In a public place</td>
                      <td className="py-2 pr-4 text-zinc-400">
                        On a road, parking lot, or other publicly accessible area
                      </td>
                      <td className="py-2 text-zinc-400">
                        &ldquo;Where exactly was the stop — does the location
                        matter?&rdquo;
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">While intoxicated</td>
                      <td className="py-2 pr-4 text-zinc-400">
                        BAC 0.08+ or loss of normal mental/physical faculties
                      </td>
                      <td className="py-2 text-zinc-400">
                        &ldquo;What&apos;s the basis for the intoxication
                        determination — the breath test, the field sobriety, or
                        both?&rdquo;
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ALR admin process callout — DWI-specific */}
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-amber-400">
                  Something Your Attorney Can Help With
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Texas DWI cases trigger a separate administrative license
                  revocation (ALR) hearing — there&apos;s a 15-day deadline to
                  request it from arrest. Your attorney may have already handled
                  this. If you&apos;re not sure, Q6 gives you the words to ask.
                  There may still be options.
                </p>
              </div>
            </div>
          </section>

          <InlineCTA variant="mid" />

          <SectionDivider />

          {/* EXACTLY WHAT TO SAY — Email template preview (v2 core section) */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Exactly What to Say
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Copy-paste ready. Personalized from your case details.
            </p>

            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Ready-to-Send Email (Preview)
              </p>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <p>
                  <span className="text-zinc-400">Subject:</span>{" "}
                  <span className="italic">
                    Case Update Request — Sarah M.
                  </span>
                </p>
                <div className="mt-2 rounded border border-zinc-700 bg-zinc-800/50 p-4 text-sm text-zinc-400">
                  <p>Hi [Attorney Name],</p>
                  <p className="mt-2">
                    I want to be well-prepared for our next conversation about my
                    DWI case. I have a few questions I&apos;d like to discuss:
                  </p>
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    <li>
                      What&apos;s the current status of discovery in my case?
                    </li>
                    <li>
                      Has the ALR hearing been requested, and if so, what should
                      I expect?
                    </li>
                    <li>
                      What&apos;s our overall strategy at this point?
                    </li>
                  </ul>
                  <p className="mt-2">
                    I appreciate your work on my behalf and want to make sure
                    I&apos;m doing everything I can on my end.
                  </p>
                  <p className="mt-2">Thank you,</p>
                  <p>Sarah</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Your full report includes a phone script, follow-up template,
                and 8-step communication playbook.
              </p>
            </div>
          </section>

          <SectionDivider />

          {/* QUESTIONS FOR YOUR ATTORNEY — 3 of 15 shown, 6-part format (v2) */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Questions for Your Attorney
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Showing 3 of 15 questions from this report. Each is built from
              actual case details using the 6-part calibrated format.
            </p>

            <div className="mt-6 space-y-6">
              {/* Q1 — Golden Question */}
              <div className="rounded-lg border border-amber-500/30 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q1 — GOLDEN QUESTION (if you only ask one, ask this one)
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;You mentioned that you haven&apos;t heard from your
                  attorney in three weeks. Can you walk me through what&apos;s
                  been happening with my case since our last conversation — any
                  filings, discovery requests, or strategy decisions?&rdquo;
                </p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-300">
                      Why it matters:
                    </span>{" "}
                    Communication gaps are the #1 frustration defendants report.
                    This question gets you a full status update without sounding
                    confrontational.{" "}
                    <span className="italic">
                      (evidence audit methodology)
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      Good answer:
                    </span>{" "}
                    Attorney provides specific dates, filed documents, or
                    pending actions — not just &ldquo;everything&apos;s
                    fine.&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      If the answer is vague:
                    </span>{" "}
                    &ldquo;I appreciate that — could you give me specific dates
                    or next steps so I can follow along?&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      What to listen for:
                    </span>{" "}
                    Does the attorney reference specific actions taken? →
                    Document the response in your notes. Send a summary email
                    after the meeting. (Step 1 of Your Advocacy Steps)
                  </p>
                </div>
              </div>

              {/* Q3 — Discovery */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q3 — DISCOVERY STATUS
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;You told us you haven&apos;t seen any discovery yet.
                  Has discovery been requested in my case? If so, when can I
                  review the breathalyzer calibration records, dash cam footage,
                  and officer&apos;s report?&rdquo;
                </p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-300">
                      Why it matters:
                    </span>{" "}
                    Discovery often contains the strongest defense opportunities.
                    Breathalyzer calibration records and field sobriety video can
                    reveal procedural errors.{" "}
                    <span className="italic">
                      (evidence analysis framework)
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      Good answer:
                    </span>{" "}
                    Discovery has been requested with a specific date, or
                    attorney explains why it hasn&apos;t been requested yet.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      If the answer is vague:
                    </span>{" "}
                    &ldquo;Is there a timeline for when I&apos;ll be able to see
                    the evidence in my case?&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      What to listen for:
                    </span>{" "}
                    Specific evidence types mentioned. → Note them. Include in
                    your summary email. (Step 2 of Your Advocacy Steps)
                  </p>
                </div>
              </div>

              {/* Q5 — Suppression */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5">
                <p className="text-xs font-semibold text-amber-400">
                  Q5 — FIELD SOBRIETY & SUPPRESSION
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
                  &ldquo;You shared that you were asked to do field sobriety
                  tests at the traffic stop. Were the field sobriety tests
                  administered according to NHTSA standards? Is there a basis to
                  challenge any part of the stop or the testing?&rdquo;
                </p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p>
                    <span className="font-semibold text-zinc-300">
                      Why it matters:
                    </span>{" "}
                    NHTSA-noncompliant field sobriety tests can be challenged and
                    potentially excluded. Even partial noncompliance weakens the
                    prosecution&apos;s case.{" "}
                    <span className="italic">
                      (suppression methodology)
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      Good answer:
                    </span>{" "}
                    Attorney has reviewed the dashcam and can identify specific
                    deviations from protocol.
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      If the answer is vague:
                    </span>{" "}
                    &ldquo;Would it be worth reviewing the dashcam to check
                    whether the testing followed standard procedure?&rdquo;
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-300">
                      What to listen for:
                    </span>{" "}
                    References to specific tests (HGN, walk-and-turn, one-leg
                    stand) and whether they were administered on a level surface.
                    → Document the details. (Step 2 of Your Advocacy Steps)
                  </p>
                </div>
              </div>

              <p className="text-center text-sm text-zinc-400">
                + 12 more questions covering breathalyzer calibration, ALR
                hearing strategy, plea options, officer training records,
                probable cause for the stop, and case-specific defense
                opportunities.
              </p>
            </div>
          </section>

          <SectionDivider />

          {/* YOUR NEXT 7 DAYS — 7-day action plan preview (v2 core section) */}
          <section>
            <h2 className="text-xl font-bold text-white">
              Your Next 7 Days
            </h2>

            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-amber-400">
                If you&apos;re feeling overwhelmed, start here:
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                Send the pre-written email from Exactly What to Say. Copy, paste,
                send. 30 seconds. Done. You&apos;ve just done something most
                defendants never do.
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-zinc-400">
                    <th className="pb-2 pr-4">Day</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2">Note</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Day 1
                    </td>
                    <td className="py-2 pr-4">Send the email</td>
                    <td className="py-2 text-zinc-400">
                      Copy-paste from Exactly What to Say. Done.
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Day 2
                    </td>
                    <td className="py-2 pr-4">Review your priority questions</td>
                    <td className="py-2 text-zinc-400">
                      Read the 5 Priority Questions. Highlight what matters most.
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Day 3
                    </td>
                    <td className="py-2 pr-4">Follow up if no response</td>
                    <td className="py-2 text-zinc-400">
                      Send the follow-up template. Step 3 of Your Advocacy Steps.
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Day 4
                    </td>
                    <td className="py-2 pr-4">Gather your materials</td>
                    <td className="py-2 text-zinc-400">
                      Use the What to Bring checklist.
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Day 5
                    </td>
                    <td className="py-2 pr-4">Practice your questions</td>
                    <td className="py-2 text-zinc-400">
                      Read them aloud once. It helps.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-amber-400">
                      Day 6-7
                    </td>
                    <td className="py-2 pr-4">Attend your meeting</td>
                    <td className="py-2 text-zinc-400">
                      Bring your Meeting Ready Sheet. Ask, listen, write.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-sm italic text-zinc-400">
              Your full report includes a pre-filled Meeting Ready Sheet with
              your 5 Priority Questions (Golden Question marked), a What to
              Bring checklist, and What to Expect guidance for your attorney
              type.
            </p>
          </section>

          <InlineCTA variant="end" />
        </div>

        {/* DISCLAIMER — Clarifies redaction and legal positioning */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          Names, case numbers, and dates have been changed. ImNotAnAttorney
          provides legal information and research — not legal advice.
        </p>
      </div>
    </div>
  );
}
