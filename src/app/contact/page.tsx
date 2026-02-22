import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with ImNotAnAttorney. Email us at help@imnotanattorney.com for questions about our legal research services.",
  alternates: {
    canonical: "https://imnotanattorney.com/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Contact Us
        </h1>
        <p className="mt-3 text-zinc-400">
          Have questions about our services or need help choosing the right tier?
          We&apos;re here to help.
        </p>

        <div className="mt-10 space-y-8">
          {/* Email */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Email</h2>
            <a
              href="mailto:help@imnotanattorney.com"
              className="mt-2 block text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
            >
              help@imnotanattorney.com
            </a>
            <p className="mt-2 text-sm text-zinc-400">
              We respond within 24 hours on business days.
            </p>
          </div>

          {/* Response Time */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Response Time</h2>
            <p className="mt-2 text-sm text-zinc-400">
              We respond to all emails within 24 hours on business days.
            </p>
          </div>

          {/* Address */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Mailing Address</h2>
            <p className="mt-2 text-sm text-zinc-400">
              ImNotAnAttorney
              <br />
              195 Dr MLK Jr St N
              <br />
              St Petersburg, FL 33701
            </p>
          </div>

          {/* CTA */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
            <p className="text-sm font-semibold text-amber-400">
              Ready to get started?
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Fill out our intake form and we&apos;ll help you choose the right
              service for your case.
            </p>
            <Link
              href="/intake"
              className="mt-4 inline-block rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Start Your Case Review &rarr;
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-400">
            ImNotAnAttorney provides legal information and research — not legal
            advice. We are not a law firm and do not create an attorney-client
            relationship. Communications are not protected by attorney-client
            privilege.
          </p>
        </div>
      </div>
    </div>
  );
}
