/**
 * terms/page.tsx -- Terms of Service page.
 *
 * WARNING: NEEDS ATTORNEY REVIEW -- This content is PLACEHOLDER copy drafted without
 * legal counsel. It MUST be reviewed and approved by a licensed attorney before Stripe
 * live mode is enabled or real customers are charged. Key areas requiring review:
 *   - Section 3 (Not Legal Advice disclaimer) -- UPL risk language
 *   - Section 4 (Payment Terms) -- refund and guarantee obligations
 *   - Section 7 (Limitation of Liability) -- liability cap and exclusions
 *   - Section 10 (Governing Law) -- Florida jurisdiction clause
 *
 * Covers: Acceptance of terms, service description, legal advice disclaimer,
 * payment terms (delivery guarantee, upgrade credits, refunds), user responsibilities,
 * intellectual property, limitation of liability, document handling, modifications,
 * governing law (Florida/Pinellas County), and contact info.
 *
 * The "Not Legal Advice" section (3) is the most critical for UPL protection.
 *
 * SEO: Static metadata with canonical URL at /terms.
 */
import type { Metadata } from "next";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for ImNotAnAttorney — legal information and research services.",
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
};

export default function TermsPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-white md:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Last updated: February 19, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-400">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using ImNotAnAttorney (&quot;we,&quot;
              &quot;us,&quot; or &quot;our&quot;) at imnotanattorney.com, you
              agree to be bound by these Terms of Service. If you do not agree
              to these terms, do not use our services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              2. Description of Services
            </h2>
            <p>
              ImNotAnAttorney provides legal information, research, and case
              analysis services for criminal defendants. Our services include
              case analysis reports, discovery document reviews, and
              question-generation tools designed to help you communicate more
              effectively with your attorney.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              3. Not Legal Advice — Important Disclaimer
            </h2>
            <p>
              <strong className="text-amber-400">
                ImNotAnAttorney is NOT a law firm.
              </strong>{" "}
              We do not provide legal advice, legal representation, or create an
              attorney-client relationship. Our services provide legal
              information and research only. You should always consult with a
              licensed attorney for legal advice specific to your situation.
            </p>
            <p className="mt-2">
              No communication with ImNotAnAttorney — including submitting case
              details, purchasing services, or receiving reports — creates an
              attorney-client relationship or any privilege of confidentiality
              associated with such a relationship.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. Payment Terms
            </h2>
            <p>
              All payments are processed securely through Stripe. Prices are
              listed in US dollars. By purchasing a service, you agree to pay the
              listed price for that tier.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Delivery guarantee:</strong>{" "}
                Each tier includes a specific delivery timeframe. If we fail to
                deliver within the guaranteed timeframe, you are entitled to a
                full refund.
              </li>
              <li>
                <strong className="text-zinc-300">Upgrade credits:</strong> 100%
                of any prior purchase is credited toward a higher tier within 12
                months of the original purchase date.
              </li>
              <li>
                <strong className="text-zinc-300">Refunds:</strong> Outside of
                delivery guarantee violations, refunds are handled on a
                case-by-case basis. Contact us to discuss your situation.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. User Responsibilities
            </h2>
            <p>You agree to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Provide accurate information when using our services</li>
              <li>
                Use our services only for lawful purposes related to your own
                legal matters
              </li>
              <li>Not share your upload links or case access with others</li>
              <li>
                Not use our reports as a substitute for licensed legal counsel
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              6. Intellectual Property
            </h2>
            <p>
              All content on this website — including blog posts, guides,
              reports, and analysis templates — is the intellectual property of
              ImNotAnAttorney. You may not reproduce, distribute, or resell our
              content without written permission.
            </p>
            <p className="mt-2">
              Reports generated for your case are licensed for your personal use
              and may be shared with your attorney.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              7. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, ImNotAnAttorney shall not
              be liable for any indirect, incidental, special, consequential, or
              punitive damages arising from your use of our services. Our total
              liability for any claim shall not exceed the amount you paid for
              the specific service giving rise to the claim.
            </p>
            <p className="mt-2">
              We do not guarantee any particular legal outcome. Our research and
              analysis are informational tools — not predictions of case results.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              8. Document Handling
            </h2>
            <p>
              Discovery documents you upload are stored securely and used solely
              for the purpose of your case analysis. We do not share your
              documents with third parties. See our{" "}
              <a href="/privacy" className="text-amber-400 underline">
                Privacy Policy
              </a>{" "}
              for full details on data handling.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              9. Modifications
            </h2>
            <p>
              We reserve the right to modify these terms at any time. Changes
              will be posted on this page with an updated date. Continued use of
              our services after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              10. Governing Law
            </h2>
            <p>
              These Terms of Service are governed by the laws of the State of
              Florida. Any disputes arising from these terms shall be resolved in
              the courts of Pinellas County, Florida.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              11. Contact
            </h2>
            <p>
              Questions about these terms? Contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
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
