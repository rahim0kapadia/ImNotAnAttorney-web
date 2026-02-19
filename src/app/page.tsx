import { LeadCapture } from "@/components/LeadCapture";
import { PricingTable } from "@/components/PricingTable";
import { FAQAccordion } from "@/components/FAQAccordion";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ImNotAnAttorney — We Research. You Ask.",
  description:
    "Legal empowerment for criminal defendants. We research your case and generate the questions that hold your attorney accountable. Starting at $97.",
  openGraph: {
    title: "ImNotAnAttorney — We Research. You Ask.",
    description:
      "We dig through your discovery, find what your lawyer missed, and hand you the exact questions that make them start working.",
  },
};

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="px-4 pb-20 pt-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-amber-500">
            Tired of being the last to know what&apos;s happening in your own case?
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            Your attorney works for{" "}
            <span className="text-amber-400">you</span>.
            <br />
            Make sure they remember that.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            We hand you the exact questions that make your attorney start
            working. We analyze your case, find what they missed, and
            turn it into ammunition. Starting at $97.
          </p>
          <p className="mt-4 text-sm font-semibold text-amber-500">
            We Research. You Ask.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/checkout?tier=case-decoder"
              className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Get Your Case Decoder — $97 →
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-lg border border-zinc-700 px-8 py-4 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
            >
              See How It Works
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            We&apos;re not attorneys — and that&apos;s the point. We give you the
            research and questions. Your lawyer does the rest.
          </p>
        </div>
      </section>

      {/* Urgency Bar */}
      <section className="border-y border-amber-500/20 bg-amber-500/5 px-4 py-4">
        <p className="text-center text-sm text-amber-400">
          Motion deadlines don&apos;t wait. Some suppression motions must be
          filed within 30 days — and once the window closes, it&apos;s gone
          forever.
        </p>
      </section>

      {/* Pain Points */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            Does this sound familiar?
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              {
                title: "Your attorney never calls you back",
                desc: "You left three voicemails. Two emails. A carrier pigeon. Nothing. Meanwhile, your next court date is in two weeks and you have no idea what's happening.",
              },
              {
                title: "You don't understand your own discovery",
                desc: "They handed you a stack of papers and said \"review this.\" Review what? It's police reports, lab results, and witness statements written in legalese.",
              },
              {
                title: "You feel like you're getting railroaded",
                desc: "Plea deal after plea deal. No motions filed. No investigation. No fight. Just \"take the deal\" on repeat — and no one can explain why.",
              },
              {
                title: "You're paying thousands but getting silence",
                desc: "You scraped together that $10K retainer — borrowed from family, drained savings. Now you can't even get a status update on your own case. That's not frustrating. That's betrayal.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bridge */}
      <section className="border-t border-zinc-800 px-4 py-10">
        <p className="text-center text-lg font-semibold text-white">
          You&apos;re not powerless. You just don&apos;t have the right
          questions yet.
        </p>
      </section>

      {/* Proof — Real case findings */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            What we actually found in a real case
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            This system was built for a real defendant facing real charges. Here&apos;s what the analysis uncovered — issues the attorney hadn&apos;t raised.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">73%</div>
              <p className="mt-1 text-sm font-semibold text-white">Weight Discrepancy</p>
              <p className="mt-2 text-sm text-zinc-400">
                Scene weight: 93.9g. Lab weight: 25.59g. That&apos;s 68.3g missing — enough to change the charge tier entirely. The attorney never flagged it.
              </p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">CI Phone</div>
              <p className="mt-1 text-sm font-semibold text-white">Dual Attribution</p>
              <p className="mt-2 text-sm text-zinc-400">
                Same phone number attributed to BOTH the confidential informant and the defendant. Same detective, same report. A Franks v. Delaware issue hiding in plain sight.
              </p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">Fatal</div>
              <p className="mt-1 text-sm font-semibold text-white">Drug Type Variance</p>
              <p className="mt-2 text-sm text-zinc-400">
                Officers said &ldquo;amphetamine&rdquo; on scene. Lab found MDMA/MDA — a completely different substance. That&apos;s a fatal variance the state had to amend.
              </p>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-zinc-400">
            This is what our analysis finds. These are the questions your attorney should be asking — but isn&apos;t.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Three steps. Ten minutes. Questions your attorney won&apos;t expect.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell us about your case",
                desc: "Share your charges, your stage, and what your attorney has (or hasn't) done. Takes 10 minutes. For deeper tiers, upload your discovery documents.",
              },
              {
                step: "02",
                title: "We research everything",
                desc: "We analyze your case using elite defense frameworks — the same tactics used by legendary attorneys like Shapiro, Dershowitz, and Scheck. AI-powered, human-reviewed.",
              },
              {
                step: "03",
                title: "You ask the questions",
                desc: "We hand you a custom report with pointed, specific questions. You bring them to your next meeting. Suddenly, motions get filed. Calls get returned. Your defense gets real.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-lg font-bold text-amber-400">
                  {item.step}
                </div>
                <h3 className="mt-4 font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Anchor */}
      <section className="border-t border-zinc-800 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            What&apos;s at stake?
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="text-2xl font-bold text-red-400">$10K-$100K+</div>
              <p className="mt-2 text-sm text-zinc-400">
                You already paid your attorney this much
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="text-2xl font-bold text-red-400">1-20 years</div>
              <p className="mt-2 text-sm text-zinc-400">
                What a conviction could cost you
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
              <div className="text-2xl font-bold text-amber-400">$97-$4,997</div>
              <p className="mt-2 text-sm text-zinc-400">
                What it costs to make sure your defense is real
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            Pick your level of defense intelligence
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Every tier includes a custom report based on your actual case. Start
            at $97 — upgrade anytime with full credit.
          </p>
          <div className="mt-12">
            <PricingTable />
          </div>
        </div>
      </section>

      {/* Lead Capture */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-2xl">
          <LeadCapture />
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-white md:text-3xl">
            Common Questions
          </h2>
          <FAQAccordion
            items={[
              {
                question: "Will asking these questions upset my attorney?",
                answer:
                  "Good attorneys welcome informed clients. Asking educated questions isn't adversarial — it's your right. The lawyers who get angry when you push back? They're the reason you're here.",
              },
              {
                question: "Is this legal advice?",
                answer:
                  "No. We provide legal research, case analysis, and questions — not legal advice. Your attorney provides legal advice. We research. You ask.",
              },
              {
                question: "What if I don't have my discovery documents yet?",
                answer:
                  "That's fine — our Case Decoder ($97) and Intelligence Brief ($497) don't require discovery. We can analyze your charges, research your judge, and generate targeted questions with just your case information. When you get discovery, upgrade to The X-Ray with full credit.",
              },
              {
                question: "Do you work on federal cases?",
                answer:
                  "Yes. From misdemeanor DUIs to federal indictments — we research every case type. The more complex your case, the more questions your attorney should be answering.",
              },
              {
                question: "How fast do I get my report?",
                answer:
                  "Case Decoder: 24 hours. Intelligence Brief: 48-72 hours. The X-Ray: 5-7 business days. War Room: 25-28 days initial + weekly updates. Situation Room: 24-48hr priority turnaround.",
              },
              {
                question: "What if I already bought a lower tier?",
                answer:
                  "100% of what you paid is credited toward the next tier. Buy the Case Decoder for $97, then upgrade to the Intelligence Brief for just $400. No money wasted. Credits are valid for 12 months.",
              },
              {
                question: "Can I get a refund?",
                answer:
                  "If we don't deliver the stated question counts and reports within the guaranteed timeframe, you get a full refund. We guarantee the work — every question, every page, on time — or you pay nothing.",
              },
            ]}
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-zinc-800 px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Every day you wait is a day closer to a deadline
            <br />
            <span className="text-amber-400">your attorney might miss.</span>
          </h2>
          <p className="mt-4 text-zinc-400">
            Motions expire. Evidence disappears. Witnesses forget. The only
            thing that doesn&apos;t change is what you&apos;re facing.
          </p>
          <Link
            href="/checkout?tier=case-decoder"
            className="mt-8 inline-block rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Get Your Case Decoder — $97 →
          </Link>
        </div>
      </section>
    </>
  );
}
