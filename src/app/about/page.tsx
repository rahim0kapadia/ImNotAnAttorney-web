import { LeadCapture } from "@/components/LeadCapture";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "ImNotAnAttorney was built by a defendant, for defendants. We provide legal research and questions — not legal advice.",
  alternates: {
    canonical: "https://imnotanattorney.com/about",
  },
};

export default function AboutPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <h1 className="text-3xl font-bold text-white md:text-5xl">
          Built by a defendant.
          <br />
          <span className="text-amber-400">For defendants.</span>
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-zinc-400">
          ImNotAnAttorney started the way most ideas start — out of
          frustration. Real frustration. The kind where you&apos;ve paid
          thousands of dollars to someone who won&apos;t return your calls,
          won&apos;t explain your own case to you, and keeps telling you to
          &quot;just trust the process.&quot;
        </p>

        {/* The Story */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">The problem</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              When you&apos;re a criminal defendant, you&apos;re in the most
              vulnerable position of your life. Your freedom is on the line.
              Your money is draining. And the one person who&apos;s supposed to
              fight for you? Sometimes they&apos;re barely paying attention.
            </p>
            <p>
              Not all attorneys are bad. Most are overworked. But the result is
              the same: you&apos;re left in the dark about your own case. You
              don&apos;t understand your discovery. You don&apos;t know what
              motions should be filed. You don&apos;t know if the plea deal is
              fair or a scam.
            </p>
            <p>
              And when you try to ask questions, you get brushed off. Or worse —
              you don&apos;t even know what questions to ask.
            </p>
          </div>
        </section>

        {/* What we do */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">What we do</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              We research your case. We read your discovery. We identify
              inconsistencies, missed motions, and gaps. Then we give you a
              report full of specific, pointed questions to bring to your
              attorney.
            </p>
            <p>
              We don&apos;t tell you what to do. We don&apos;t give legal
              advice. We give you{" "}
              <span className="font-semibold text-white">information</span> and{" "}
              <span className="font-semibold text-white">questions</span>. What
              you do with them is between you and your attorney.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">How we do it</h2>
          <div className="mt-6 space-y-6">
            {[
              {
                title: "AI-powered research",
                desc: "Our system analyzes cases using tactics from 40+ elite criminal defense attorneys. We know what good defense looks like — and we can spot when it's missing.",
              },
              {
                title: "Real case experience",
                desc: "This isn't theoretical. Our analysis framework was built on a real case. We found weight discrepancies the attorney missed. We found CI attribution errors in the warrant. We found officer statement conflicts that became trial ammunition.",
              },
              {
                title: "Plain English",
                desc: "Legal jargon is a weapon used to keep you confused. We translate everything into language you can actually understand — and act on.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What we're NOT */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">
            What we are <span className="text-amber-400">not</span>
          </h2>
          <ul className="mt-4 space-y-3 text-zinc-400">
            {[
              "We are not a law firm",
              "We do not provide legal advice",
              "We do not represent you in court",
              "We do not replace your attorney",
              "We do not guarantee case outcomes",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 text-red-400">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-400">
              We Research. You Ask.
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              That&apos;s the line. We stay on our side of it.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-white">
            Ready to understand your own case?
          </h2>
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/services"
              className="rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              See Our Services
            </Link>
            <Link
              href="/blog"
              className="rounded-lg border border-zinc-700 px-8 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
            >
              Read the Blog
            </Link>
          </div>
        </section>

        {/* Lead Capture */}
        <div className="mt-16">
          <LeadCapture />
        </div>
      </div>
    </div>
  );
}
