import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for ImNotAnAttorney — how we collect, use, and protect your data.",
  alternates: {
    canonical: "https://imnotanattorney.com/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Last updated: February 19, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-400">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              1. Information We Collect
            </h2>
            <p>We collect the following types of information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Contact information:</strong>{" "}
                Name, email address, phone number (when you submit the intake
                form or subscribe to our email list)
              </li>
              <li>
                <strong className="text-zinc-300">Case information:</strong>{" "}
                Charge type, state, attorney status, discovery status, and
                situation description (when you submit the intake form)
              </li>
              <li>
                <strong className="text-zinc-300">Discovery documents:</strong>{" "}
                Files you upload for case analysis, including police reports,
                forensic reports, witness statements, and other legal documents
              </li>
              <li>
                <strong className="text-zinc-300">Payment information:</strong>{" "}
                Processed securely by Stripe. We do not store your credit card
                number, CVV, or full card details on our servers
              </li>
              <li>
                <strong className="text-zinc-300">Usage data:</strong> Pages
                visited, collected via Vercel Analytics (anonymized, no cookies)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              2. How We Use Your Information
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                To provide the services you purchase (case analysis, reports,
                question generation)
              </li>
              <li>To communicate with you about your order and deliverables</li>
              <li>
                To send transactional emails (payment confirmation, upload
                receipts, intake confirmation)
              </li>
              <li>
                To send marketing emails if you subscribe (you can unsubscribe
                at any time)
              </li>
              <li>To improve our services and website</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              3. Discovery Document Handling
            </h2>
            <p>
              We understand that discovery documents contain highly sensitive
              legal information. We treat these with the utmost care:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Documents are stored in a private, encrypted storage bucket
                (Supabase Storage)
              </li>
              <li>Documents are accessible only to authorized personnel</li>
              <li>
                Documents are used solely for the purpose of your case analysis
              </li>
              <li>
                Documents are never shared with third parties, sold, or used for
                any purpose other than your requested service
              </li>
              <li>
                Access to uploaded documents requires a unique case identifier
                delivered to your email
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. Third-Party Services
            </h2>
            <p>We use the following third-party services to operate:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Stripe</strong> — Payment
                processing. Subject to{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Stripe&apos;s Privacy Policy
                </a>
              </li>
              <li>
                <strong className="text-zinc-300">Supabase</strong> — Database
                and file storage. Data stored in secure, SOC 2 compliant
                infrastructure
              </li>
              <li>
                <strong className="text-zinc-300">Resend</strong> — Transactional
                email delivery
              </li>
              <li>
                <strong className="text-zinc-300">Vercel</strong> — Website
                hosting and analytics (anonymized, cookieless analytics)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. Data Retention
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Account data</strong> (email,
                name): Retained until you request deletion
              </li>
              <li>
                <strong className="text-zinc-300">Order records:</strong>{" "}
                Retained for accounting and legal compliance purposes
              </li>
              <li>
                <strong className="text-zinc-300">Discovery documents:</strong>{" "}
                Retained for the duration of your case analysis. Contact us to
                request deletion after your report is delivered
              </li>
              <li>
                <strong className="text-zinc-300">
                  Email subscriber data:
                </strong>{" "}
                Retained until you unsubscribe. Unsubscribed records are marked
                as inactive
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              6. Your Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Access</strong> your personal
                data — request a copy of what we have
              </li>
              <li>
                <strong className="text-zinc-300">Correct</strong> inaccurate
                data
              </li>
              <li>
                <strong className="text-zinc-300">Delete</strong> your data
                (subject to legal retention requirements)
              </li>
              <li>
                <strong className="text-zinc-300">Unsubscribe</strong> from
                marketing emails at any time via the unsubscribe link in every
                email
              </li>
              <li>
                <strong className="text-zinc-300">Opt out</strong> of data
                collection (note: this may prevent us from providing services)
              </li>
            </ul>
            <p className="mt-2">
              <strong className="text-zinc-300">
                California residents (CCPA):
              </strong>{" "}
              You have additional rights under the California Consumer Privacy
              Act, including the right to know what personal information we
              collect and the right to request deletion. We do not sell your
              personal information.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              7. Cookies
            </h2>
            <p>
              Our website does not use tracking cookies. Vercel Analytics
              provides anonymized usage data without cookies. Stripe may set
              cookies during the checkout process — see Stripe&apos;s privacy
              policy for details.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              8. Security
            </h2>
            <p>
              We implement appropriate technical and organizational measures to
              protect your personal data, including:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>HTTPS encryption for all data in transit</li>
              <li>Private storage buckets for discovery documents</li>
              <li>
                Row-level security policies on database tables
              </li>
              <li>
                Service-role key access restricted to server-side API routes
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              9. Children&apos;s Privacy
            </h2>
            <p>
              Our services are not intended for individuals under 18 years of
              age. We do not knowingly collect personal information from minors.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              10. Artificial Intelligence Disclosure
            </h2>
            <p>
              Your documents may be processed using artificial intelligence
              systems. We use AI to analyze legal documents and generate
              research questions. Documents may be processed by third-party AI
              providers subject to their data handling policies.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              11. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will
              be posted on this page with an updated date. Continued use of our
              services after changes constitutes acceptance of the updated
              policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              12. Contact
            </h2>
            <p>
              For privacy-related questions or to exercise your rights, contact
              us at{" "}
              <a
                href="mailto:help@imnotanattorney.com"
                className="text-amber-400 underline"
              >
                help@imnotanattorney.com
              </a>
              .
            </p>
            <p className="mt-2">
              ImNotAnAttorney
              <br />
              195 Dr MLK Jr St N
              <br />
              St Petersburg, FL 33701
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}
