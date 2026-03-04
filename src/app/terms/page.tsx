/**
 * terms/page.tsx -- Terms of Service page.
 *
 * Comprehensive Terms of Service covering: acceptance, service description,
 * legal information disclaimer (UPL protection), AI processing disclosure,
 * payment terms, user responsibilities, intellectual property, limitation
 * of liability, document handling, indemnification, dispute resolution,
 * electronic communications, force majeure, severability, modifications,
 * governing law, and contact info.
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
          Last updated: March 3, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-400">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using ImNotAnAttorney (&quot;we,&quot;
              &quot;us,&quot; or &quot;our&quot;) at imnotanattorney.com
              (&quot;the Site&quot;), or by purchasing any of our services, you
              agree to be bound by these Terms of Service (&quot;Terms&quot;). If
              you do not agree to these Terms, do not access or use our
              services. These Terms constitute a legally binding agreement
              between you and ImNotAnAttorney.
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
              effectively with your attorney. We offer multiple service tiers
              ranging from automated case analysis to comprehensive discovery
              review and trial intelligence.
            </p>
            <p className="mt-2">
              Our services are designed to supplement — not replace — the
              professional judgment of a licensed attorney. We provide you with
              information and questions; your attorney provides the legal
              strategy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              3. Not Legal Advice — Important Disclaimer
            </h2>
            <p>
              <strong className="text-amber-400">
                ImNotAnAttorney is NOT a law firm and does NOT practice law.
              </strong>{" "}
              None of our employees, contractors, or AI systems are licensed
              attorneys, and no one at ImNotAnAttorney is authorized to provide
              legal advice, legal opinions, or legal representation in any
              jurisdiction.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">What we provide:</strong> Legal
              information, factual analysis of case documents, publicly documented
              legal frameworks and procedures, and specific questions you can
              bring to your attorney. Our reports identify patterns, potential
              issues, and areas worth exploring — they do not tell you what to
              do.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">What we do NOT provide:</strong>{" "}
              Legal advice, legal opinions, legal strategy recommendations,
              attorney competency evaluations, predictions of case outcomes, or
              direction to take any specific legal action. We do not tell you
              whether to accept or reject a plea deal, which motions to file, or
              how to handle any specific aspect of your case.
            </p>
            <p className="mt-2">
              No communication with ImNotAnAttorney — including submitting case
              details, purchasing services, receiving reports, or exchanging
              emails — creates an attorney-client relationship, establishes any
              privilege of confidentiality associated with such a relationship,
              or creates any fiduciary duty between you and ImNotAnAttorney.
            </p>
            <p className="mt-2">
              The information we provide is not a substitute for the advice of a
              licensed attorney who knows the full facts of your case. You are
              solely responsible for all decisions regarding your legal matter.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. Artificial Intelligence Disclosure
            </h2>
            <p>
              Our analysis services use artificial intelligence (AI) technology,
              including large language models provided by Anthropic (Claude), to
              process case information and generate reports. By using our
              services, you acknowledge and consent to the following:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Your case information and uploaded documents may be processed by
                third-party AI systems to generate your report
              </li>
              <li>
                AI-generated analysis may contain errors, omissions, or
                inaccuracies — you should verify all information with your
                attorney
              </li>
              <li>
                AI systems do not have the professional judgment, ethical
                obligations, or situational awareness of a licensed attorney
              </li>
              <li>
                We review AI outputs for quality and compliance, but the
                presence of AI in the process means our reports should be
                treated as informational research, not professional legal work
                product
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. Payment Terms
            </h2>
            <p>
              All payments are processed securely through Stripe. Prices are
              listed in US dollars. By purchasing a service, you agree to pay the
              listed price for your selected tier. All sales are final except as
              described below.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Delivery guarantee:</strong>{" "}
                Each service tier includes a specific delivery timeframe stated
                at the time of purchase. If we fail to deliver your report
                within the guaranteed timeframe, you are entitled to a full
                refund of the amount paid for that tier. To claim a delivery
                guarantee refund, contact us within 7 days of the missed
                delivery deadline.
              </li>
              <li>
                <strong className="text-zinc-300">Upgrade credits:</strong> 100%
                of any prior purchase is credited toward a higher service tier,
                provided the upgrade is purchased within 12 months of the
                original purchase date. Upgrade credits are non-transferable and
                have no cash value. Refunded purchases forfeit any associated
                upgrade credit.
              </li>
              <li>
                <strong className="text-zinc-300">Refunds:</strong> Outside of
                delivery guarantee violations, all sales are final. If you
                believe there is an error with your order, contact us within 30
                days of purchase.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              6. User Responsibilities
            </h2>
            <p>By using our services, you represent and agree that:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                You are at least 18 years of age and have the legal capacity to
                enter into these Terms
              </li>
              <li>
                All information you provide is accurate, complete, and relates
                to your own legal matter or a matter you are legally authorized
                to act on behalf of
              </li>
              <li>
                You will use our services only for lawful purposes related to
                your own legal matters
              </li>
              <li>
                You will not share your upload links, report access tokens, or
                case access credentials with unauthorized third parties
              </li>
              <li>
                You understand that our reports are informational tools and will
                not use them as a substitute for licensed legal counsel
              </li>
              <li>
                You will not reproduce, redistribute, or resell our reports or
                deliverables except to share them with your own attorney
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              7. Intellectual Property
            </h2>
            <p>
              All content on this website — including blog posts, guides,
              analysis templates, report formats, scoring methodologies, and
              question frameworks — is the intellectual property of
              ImNotAnAttorney and is protected by applicable copyright and
              intellectual property laws. You may not reproduce, distribute,
              modify, or resell our content without prior written permission.
            </p>
            <p className="mt-2">
              Reports generated for your case are licensed for your personal use
              only. You may share your report with your attorney for the purpose
              of discussing your case. You may not publish, post online,
              distribute, or use our reports for any commercial purpose.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              8. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, ImNotAnAttorney
              and its owners, employees, agents, and contractors shall not be
              liable for any indirect, incidental, special, consequential,
              exemplary, or punitive damages, including but not limited to
              damages for loss of profits, goodwill, data, or other intangible
              losses, arising from or related to your use of (or inability to
              use) our services, regardless of the theory of liability.
            </p>
            <p className="mt-2">
              Our total aggregate liability for any and all claims arising from
              or related to these Terms or your use of our services shall not
              exceed the amount you actually paid to ImNotAnAttorney for the
              specific service giving rise to the claim during the twelve (12)
              months preceding the claim.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">
                No guarantee of legal outcomes.
              </strong>{" "}
              We do not and cannot guarantee any particular legal outcome. Our
              analysis is informational — not predictive. Case outcomes depend
              on many factors outside our control, including your attorney&apos;s
              strategy, the judge, the jury, and the specific facts of your
              case. You acknowledge that no representation has been made
              regarding the likely outcome of your legal matter.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">
                By using our site or purchasing our services, you agree not to
                hold us liable for the outcome of your case in any way.
              </strong>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              9. Document Handling
            </h2>
            <p>
              Discovery documents and case files you upload are stored securely
              and used solely for the purpose of providing your purchased
              service. We do not share your documents with third parties except
              as necessary to process your order (e.g., AI processing as
              described in Section 4). See our{" "}
              <a href="/privacy" className="text-amber-400 underline">
                Privacy Policy
              </a>{" "}
              for full details on data handling, retention periods, and deletion
              procedures.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              10. Indemnification
            </h2>
            <p>
              You agree to indemnify, defend, and hold harmless ImNotAnAttorney
              and its owners, employees, agents, and contractors from and
              against any claims, damages, losses, liabilities, costs, and
              expenses (including reasonable attorneys&apos; fees) arising out of
              or related to: (a) your use of our services; (b) your violation
              of these Terms; (c) your violation of any applicable law or
              regulation; or (d) any decision you make or action you take based
              on information provided by our services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              11. Dispute Resolution
            </h2>
            <p>
              <strong className="text-zinc-300">Informal resolution first.</strong>{" "}
              Before filing any formal proceeding, you agree to contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-amber-400 underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              and attempt to resolve the dispute informally for at least thirty
              (30) days.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">Binding arbitration.</strong> If
              we cannot resolve the dispute informally, you and ImNotAnAttorney
              agree that any dispute, claim, or controversy arising out of or
              relating to these Terms or our services shall be resolved by
              binding arbitration administered by the American Arbitration
              Association (&quot;AAA&quot;) under its Consumer Arbitration
              Rules. The arbitration shall take place in Pinellas County,
              Florida, or at a location mutually agreed upon. The
              arbitrator&apos;s decision shall be final and binding and may be
              entered as a judgment in any court of competent jurisdiction.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">Class action waiver.</strong>{" "}
              You agree that any arbitration or court proceeding shall be
              conducted only on an individual basis and not as a class action or
              other representative proceeding. You waive the right to
              participate in a class action lawsuit or class-wide arbitration.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">Exceptions.</strong> Either
              party may bring a claim in small claims court if the claim
              qualifies. Nothing in this section prevents either party from
              seeking injunctive or equitable relief in court for matters
              relating to intellectual property or unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              12. Electronic Communications Consent
            </h2>
            <p>
              By using our services, you consent to receive electronic
              communications from us, including: order confirmations, report
              delivery notifications, intake reminders, and service updates. You
              may also receive marketing emails if you subscribe to our email
              list. All marketing emails include an unsubscribe link, and you
              may opt out at any time. You agree that all agreements, notices,
              disclosures, and other communications provided electronically
              satisfy any legal requirement that such communications be in
              writing.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              13. Force Majeure
            </h2>
            <p>
              ImNotAnAttorney shall not be liable for any failure or delay in
              performing our obligations where such failure or delay results
              from circumstances beyond our reasonable control, including but
              not limited to: natural disasters, acts of government, internet or
              telecommunications failures, third-party service outages (e.g.,
              Stripe, Supabase, Anthropic), power failures, or cyberattacks. In
              such events, our delivery guarantee timeframes will be extended by
              the duration of the force majeure event.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              14. Severability
            </h2>
            <p>
              If any provision of these Terms is found to be invalid,
              unenforceable, or illegal by a court of competent jurisdiction,
              the remaining provisions shall continue in full force and effect.
              The invalid provision shall be modified to the minimum extent
              necessary to make it valid and enforceable while preserving its
              original intent.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              15. Modifications
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. Material
              changes will be posted on this page with an updated &quot;Last
              updated&quot; date. If you have an active order, we will notify
              you of material changes by email. Continued use of our services
              after changes are posted constitutes your acceptance of the
              modified Terms. If you do not agree to the modified Terms, you
              must stop using our services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              16. Governing Law
            </h2>
            <p>
              These Terms of Service are governed by and construed in accordance
              with the laws of the State of Florida, without regard to its
              conflict of law principles. Subject to the arbitration provision
              in Section 11, any legal proceedings shall be brought exclusively
              in the state or federal courts located in Pinellas County,
              Florida, and you consent to the personal jurisdiction of such
              courts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              17. Entire Agreement
            </h2>
            <p>
              These Terms, together with our{" "}
              <a href="/privacy" className="text-amber-400 underline">
                Privacy Policy
              </a>
              , constitute the entire agreement between you and ImNotAnAttorney
              regarding your use of our services. These Terms supersede all
              prior agreements, communications, and understandings, whether
              written or oral, regarding the subject matter herein.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              18. Contact
            </h2>
            <p>
              Questions about these Terms? Contact us at{" "}
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
