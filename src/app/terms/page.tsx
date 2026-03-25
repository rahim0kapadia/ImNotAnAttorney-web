/**
 * terms/page.tsx -- Terms of Service page.
 *
 * Comprehensive Terms of Service covering: acceptance, service description,
 * legal information disclaimer (UPL protection), technology processing disclosure,
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
          Last updated: March 6, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-400">
          {/* Human intro — before the legal language starts */}
          <p className="text-base text-zinc-300">
            We built this business because we&apos;ve been where you are. We know
            what it feels like when the system stops communicating and nobody
            explains what&apos;s happening with your case. These terms explain
            what we commit to you and what we ask in return. If anything here is
            unclear, email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-amber-400 underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using ImNotAnAttorney, a business operated by
              ImNotAnAttorney LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
              at imnotanattorney.com (&quot;the Site&quot;), or by purchasing any
              of our services, you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). These Terms constitute a legally binding
              agreement between you and ImNotAnAttorney. We encourage you to read
              them in full — and if anything doesn&apos;t make sense, reach out
              before purchasing.
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
              3. What We Do — And What We Don&apos;t
            </h2>
            <p>
              <strong className="text-amber-400">
                ImNotAnAttorney is NOT a law firm and does NOT practice law.
              </strong>{" "}
              None of our employees, contractors, or team members are licensed
              attorneys, and no one at ImNotAnAttorney is authorized to provide
              legal advice, legal opinions, or legal representation in any
              jurisdiction.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">What we provide:</strong> Legal
              information, factual analysis of case documents, established legal
              frameworks and procedures, and specific questions you can bring to
              your attorney. Our reports identify patterns, potential issues, and
              areas worth exploring — they do not tell you what to do.
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
              <strong className="text-zinc-300">How it works best:</strong>{" "}
              Your attorney makes the legal decisions. We make sure you
              understand what decisions are being made, and why. Our reports are
              designed to work best when brought into a conversation with your
              attorney — giving you the context and questions to have a
              productive discussion.
            </p>
            <p className="mt-2">
              No communication with ImNotAnAttorney — including submitting case
              details, purchasing services, receiving reports, or exchanging
              emails — creates an attorney-client relationship, establishes any
              privilege of confidentiality associated with such a relationship,
              or creates any fiduciary duty between you and ImNotAnAttorney.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">
                Limitations on accuracy.
              </strong>{" "}
              While we strive for thoroughness, our analysis is based on the
              information you provide. We don&apos;t have access to sealed court
              records, private conversations between attorneys and judges, or
              real-time courtroom dynamics — which means there are things your
              attorney knows that we can&apos;t account for. All content is
              reviewed for quality before delivery but is not verified by a
              licensed attorney.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. Technology &amp; Automated Processing Disclosure
            </h2>
            <p>
              Our reports are generated using proprietary analysis technology
              combined with legal research frameworks developed from the
              published work of 40+ criminal defense attorneys. Your case data
              is not used to improve or train our analysis systems, and every
              report goes through a quality review before delivery. Like any
              analytical tool, our technology has limitations — it can miss
              nuance or produce errors, which is why our reports are designed as
              a starting point for conversations with your attorney, not a
              replacement for one. See our{" "}
              <a href="/privacy" className="text-amber-400 underline">
                Privacy Policy
              </a>{" "}
              Section 3 for full technical details on how your data is processed.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. Payment Terms
            </h2>
            <p>
              All payments are processed securely through Stripe. Prices are
              listed in US dollars. By purchasing a service, you agree to pay the
              listed price for your selected tier.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Delivery guarantee:</strong>{" "}
                Each service tier includes a specific delivery timeframe stated
                at the time of purchase. If we fail to deliver your report
                within the guaranteed timeframe, you are entitled to a full
                cash refund — no questions asked. To claim a delivery
                guarantee refund, contact us within 7 days of the missed
                delivery deadline.
              </li>
              <li>
                <strong className="text-zinc-300">
                  Satisfaction guarantee:
                </strong>{" "}
                If you&apos;re not satisfied with your report after delivery,
                contact us within 30 days. We&apos;ll apply 100% of your
                purchase as a credit toward any higher service tier.
                Satisfaction credits are non-transferable and have no cash
                value. This is a credit, not a cash refund — the delivery
                guarantee above is the cash refund. Satisfaction credits do
                not trigger deletion of your documents or revocation of
                report access — only cash refunds (delivery guarantee) and
                chargebacks do.
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
                <strong className="text-zinc-300">Disputes:</strong> If
                you&apos;re unsatisfied or believe there&apos;s a billing error,
                please contact us at{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-amber-400 underline"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                before filing a dispute with your bank. We respond within 24
                hours. Unresolved chargebacks may result in suspension of your
                account and forfeiture of any remaining service access or
                upgrade credits.
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
              We deliver our services as described on our website at the time of
              your purchase — no hidden fees, no bait-and-switch. Beyond that,
              we provide our services &quot;as is&quot; and &quot;as
              available&quot; without additional warranties, express or implied,
              including implied warranties of merchantability or fitness for a
              particular purpose.
            </p>
            <p className="mt-2">
              We&apos;re a research partner, not a guarantor. Legal outcomes
              depend on facts, attorneys, judges, and circumstances we
              can&apos;t control. What we can control — and do — is the quality
              of the information and questions we put in your hands.
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
              as necessary to process your order (e.g., automated processing as
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
              Both you and ImNotAnAttorney benefit from clear expectations. You
              agree to indemnify, defend, and hold harmless ImNotAnAttorney and
              its owners, employees, agents, and contractors from and against
              any claims, damages, losses, liabilities, costs, and expenses
              (including reasonable attorneys&apos; fees) arising out of or
              related to: (a) your violation of these Terms; (b) your violation
              of any applicable law or regulation; or (c) any materially
              inaccurate information you submit to us.
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
              telecommunications failures, third-party service outages, power
              failures, or cyberattacks. In such events, our delivery guarantee
              timeframes will be extended by the duration of the force majeure
              event.
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
            <p className="mt-2">
              <strong className="text-zinc-300">Waiver.</strong> Our failure
              to enforce any provision of these Terms does not constitute a
              waiver of our right to enforce that provision or any other
              provision in the future.
            </p>
            <p className="mt-2">
              <strong className="text-zinc-300">Assignment.</strong> We may
              assign these Terms or any rights under them without your consent
              (for example, in connection with a merger or acquisition). You
              may not assign your rights or obligations under these Terms
              without our prior written consent.
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
              you of material changes by email. Material changes will never
              affect services you&apos;ve already purchased under a prior
              version of these Terms. Continued use of our services after
              changes are posted constitutes your acceptance of the modified
              Terms.
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
              written or oral, regarding the subject matter herein. Section
              headings are for convenience only and do not affect
              interpretation. These Terms do not create any rights for third
              parties.
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
              ImNotAnAttorney LLC
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
