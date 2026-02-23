import { LeadCapture } from "@/components/LeadCapture";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Built by a Defendant, for Defendants",
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
          I&apos;m Rahim Kapadia. In 2023, I was facing drug trafficking
          charges in St. Petersburg, Florida. Mandatory minimum: 3 years.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-zinc-400">
          I paid thousands for an attorney. He told me to trust the process.
          So I trusted. For months. No motions filed. No calls returned. No
          explanation of what was in my own discovery.
        </p>

        {/* The Story */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">The day everything changed</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              One night I opened the discovery myself. 500 pages of police
              reports, lab results, and witness statements.
            </p>
            <p>
              Within a week, I found four issues my attorney had never
              mentioned: A 73% weight discrepancy — 93.9 grams on the scene,
              25.59 grams at the lab. 68.3 grams missing. A CI phone number
              attributed to both the informant and me in the same report.
              Officers wrote &quot;amphetamine&quot; — the lab confirmed
              MDMA/MDA. A completely different substance. 21 latent
              fingerprints. Zero matched me.
            </p>
            <p>
              My attorney had filed nothing on any of it.
            </p>
          </div>
        </section>

        {/* What we do */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">What I built after that day</h2>
          <div className="mt-4 space-y-4 text-zinc-400 leading-relaxed">
            <p>
              I started reading everything the best defense attorneys ever
              published. Barry Scheck&apos;s chain of custody protocols. Jeffrey
              Lichtman&apos;s CI destruction methodology. Gerry Spence&apos;s
              investigation patterns. 40+ legendary attorneys.
            </p>
            <p>
              I built a system that does what I did — but faster, deeper, and
              available to any defendant who refuses to sit in the dark about
              their own case.
            </p>
            <p>
              We don&apos;t give legal advice. We give you the questions your
              attorney should be answering. What you do with them is between you
              and your attorney.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white">How we do it</h2>
          <div className="mt-6 space-y-6">
            {[
              {
                title: "Deep Case Research",
                desc: "Our system analyzes cases using tactics from 40+ elite criminal defense attorneys. We know what good defense looks like — and we can spot when it's missing.",
              },
              {
                title: "Real case experience",
                desc: "This isn't theoretical. Our analysis framework was built from Rahim's real case. We found weight discrepancies the attorney missed. We found CI attribution errors in the warrant. We found officer statement conflicts that became trial ammunition.",
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
            Defendants who fight back{" "}
            <span className="text-amber-400">start here.</span>
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
