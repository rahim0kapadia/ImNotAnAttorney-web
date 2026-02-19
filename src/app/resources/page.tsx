import { LeadCapture } from "@/components/LeadCapture";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Resources",
  description:
    "Free guides, checklists, and templates for criminal defendants. Know your rights. Hold your attorney accountable.",
};

const resources = [
  {
    title: "10 Questions Your Attorney Hopes You Never Ask",
    desc: "The questions that separate informed defendants from easy clients. These force accountability.",
    type: "PDF Guide",
    gated: true,
  },
];

const rightsGuides = [
  {
    charge: "Drug Possession / Trafficking",
    rights: [
      "Right to see all discovery evidence",
      "Right to challenge search warrant (Franks hearing)",
      "Right to independent lab testing",
      "Right to challenge CI reliability",
      "Right to suppress illegally obtained evidence",
    ],
  },
  {
    charge: "DUI / DWI",
    rights: [
      "Right to breathalyzer calibration records",
      "Right to dashcam and bodycam footage",
      "Right to challenge field sobriety tests",
      "Right to DMV hearing (usually 10-day deadline)",
      "Right to officer training records",
    ],
  },
  {
    charge: "White Collar / Federal",
    rights: [
      "Right to review entire discovery production",
      "Right to Brady/Giglio material (exculpatory evidence)",
      "Right to understand sentencing guidelines",
      "Right to proffer protections during cooperation",
      "Right to challenge loss calculations",
    ],
  },
];

export default function ResourcesPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Free Resources
        </h1>
        <p className="mt-3 text-zinc-400">
          Knowledge is power — especially when your freedom is on the line.
          These resources are free because everyone deserves to understand their
          rights.
        </p>

        {/* Downloadable Guides */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">
            Guides &amp; Templates
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Enter your email to access. No spam. No selling your data.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {resources.map((r) => (
              <div
                key={r.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  {r.type}
                </span>
                <h3 className="mt-3 font-bold text-white">{r.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{r.desc}</p>
              </div>
            ))}
          </div>

          {/* Lead capture for downloads */}
          <div className="mt-8">
            <LeadCapture />
          </div>
        </section>

        {/* Know Your Rights */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold text-white">
            Know Your Rights by Charge Type
          </h2>
          <p className="mt-2 text-zinc-400">
            This is public information that every defendant should know. No
            email required.
          </p>

          <div className="mt-8 space-y-8">
            {rightsGuides.map((guide) => (
              <div
                key={guide.charge}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="text-lg font-bold text-amber-400">
                  {guide.charge}
                </h3>
                <ul className="mt-4 space-y-2">
                  {guide.rights.map((right) => (
                    <li
                      key={right}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <span className="mt-0.5 text-amber-400">&#10003;</span>
                      {right}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-amber-400">Disclaimer:</span>{" "}
              This is general legal information, not legal advice. Rights vary
              by state and jurisdiction. Consult your attorney for specifics
              about your case.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-16 text-center">
          <h2 className="text-xl font-bold text-white">
            Need case-specific analysis?
          </h2>
          <p className="mt-2 text-zinc-400">
            Free resources get you started. Our services go deep into your
            actual case.
          </p>
          <Link
            href="/services"
            className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            See Our Services
          </Link>
        </section>
      </div>
    </div>
  );
}
