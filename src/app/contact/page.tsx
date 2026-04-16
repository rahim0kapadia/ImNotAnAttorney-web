/**
 * Contact Page (/contact)
 *
 * Simple contact information page with email, response time, mailing address,
 * and a CTA to the intake form. Required for CAN-SPAM compliance (physical
 * address) and general trust-building.
 *
 * User journey position:
 *   Nav / footer -> THIS PAGE -> /intake (primary CTA)
 *                              -> mailto:help@imnotanattorney.com (email)
 *
 * Page structure:
 *   1. Email card, help@imnotanattorney.com with 24-hour response time
 *   2. Response time card, 24 hours on business days
 *   3. Mailing address card, 195 Dr MLK Jr St N, St Petersburg, FL 33701
 *      (required by CAN-SPAM for all commercial email senders)
 *   4. CTA card, "Ready to get started?" with link to /services
 *   5. Legal disclaimer, not a law firm, no attorney-client relationship,
 *      communications not privileged
 *
 * Note: The mailing address and legal disclaimer are legally required.
 * Do not remove them without attorney consultation.
 */
import type { Metadata } from "next";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with ImNotAnAttorney. Email us at help@imnotanattorney.com for questions about our legal research services.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
  openGraph: {
    title: "Contact Us",
    description:
      "Get in touch with ImNotAnAttorney. Email us at help@imnotanattorney.com for questions about our legal research services.",
    url: `${SITE_URL}/contact`,
  },
};

export default function ContactPage() {
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
              { "@type": "ListItem", position: 2, name: "Contact" },
            ],
          }),
        }}
      />
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Contact Us
        </h1>
        <p className="mt-3 text-zinc-400">
          We know what it&apos;s like to have questions at 3 AM and nobody to ask. We&apos;re here.
        </p>
        <p className="mt-2 text-zinc-400">
          Have questions about our services or need help choosing the right tier?
        </p>

        <div className="mt-10 space-y-8">
          {/* EMAIL, Primary contact method (includes response time) */}
          <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Email</h2>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-2 block text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
            >
              {CONTACT_EMAIL}
            </a>
            <p className="mt-2 text-sm text-zinc-400">
              We respond within 4 hours.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Can&apos;t Wait?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Take the free{" "}
              <Link
                href="/score"
                className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:decoration-amber-400"
              >
                Defense Milestone Score
              </Link>
              {" "}for immediate insight into your case &mdash; no sign-up required, results in 2 minutes.
            </p>
          </div>

          {/* ADDRESS, Physical mailing address (CAN-SPAM compliance requirement) */}
          <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Mailing Address</h2>
            <p className="mt-2 text-sm text-zinc-400">
              ImNotAnAttorney
              <br />
              195 Dr MLK Jr St N
              <br />
              St Petersburg, FL 33701
            </p>
          </div>

          {/* CTA, Routes to intake form for case-specific engagement */}
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

        {/* CONFIDENTIALITY + LEGAL DISCLAIMER, Do not remove without attorney review. */}
        <div className="mt-8 rounded-lg border border-zinc-500 bg-zinc-900/50 p-4 space-y-3">
          <p className="text-xs text-zinc-400">
            Your name, email address, and any information you share with us is
            kept strictly confidential and will never be shared with prosecutors,
            law enforcement, or sold to marketers. We use essential processors
            (payments, email, hosting) to deliver our service, see our{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-300">
              Privacy Policy
            </Link>{" "}
            for the full list.
          </p>
          <p className="text-xs text-zinc-400">
            ImNotAnAttorney provides legal information and research, not legal
            advice. We are not a law firm and do not create an attorney-client
            relationship. Communications are not protected by attorney-client
            privilege.
          </p>
        </div>
      </div>
    </div>
  );
}
