/**
 * partners/terms/page.tsx -- Partner Terms of Service page.
 *
 * Covers: partner agreement, permitted/prohibited activities,
 * commission structure, payout terms, FTC disclosure requirements,
 * termination, and contact info.
 *
 * SEO: Static metadata with canonical URL at /partners/terms.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Partner Terms of Service | ImNotAnAttorney",
  description:
    "Terms and conditions for the ImNotAnAttorney partner program.",
  alternates: {
    canonical: `${SITE_URL}/partners/terms`,
  },
};

export default function PartnerTermsPage() {
  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/partners" className="text-sm text-amber-400 hover:text-amber-300 mb-8 inline-block">
          &larr; Back to Partner Program
        </Link>
        <h1 className="font-display text-3xl font-bold text-white md:text-4xl">
          Partner Terms of Service
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Last updated: April 12, 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-400">
          {/* ── 1. Partner Agreement ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              1. Partner Agreement
            </h2>
            <p>
              By enrolling in or using the ImNotAnAttorney Partner Program, you
              agree to be bound by these Partner Terms of Service
              (&quot;Terms&quot;). These Terms constitute a legally binding
              agreement between you (&quot;Partner&quot;) and ImNotAnAttorney LLC
              (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            </p>
            <p className="mt-2">
              The partnership is{" "}
              <strong className="text-amber-400">at-will</strong> and may be
              terminated by either party at any time, for any reason, with or
              without notice. These Terms are in addition to our general{" "}
              <Link href="/terms" className="text-amber-400 underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-amber-400 underline">
                Privacy Policy
              </Link>
              , which also apply to your use of our site and services.
            </p>
          </section>

          {/* ── 2. Legal Information, Not Legal Advice ──
              Compressed to two short paragraphs so the commission structure
              (Section 5) sits closer to the top of the page. Behavioral
              boundaries for partners live in Section 4 (#cannot-do). */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              2. Legal Information, Not Legal Advice
            </h2>
            <p>
              ImNotAnAttorney provides{" "}
              <strong className="text-amber-400">information</strong> and
              generates{" "}
              <strong className="text-amber-400">questions</strong>. It is not a
              law firm and does not practice law. No attorney-client relationship
              is created via referral.
            </p>
            <p className="mt-2">
              Partner-behavior boundaries are in{" "}
              <a href="#cannot-do" className="text-amber-400 underline">
                Section 4
              </a>
              .
            </p>
          </section>

          {/* ── 3. What You CAN Do ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              3. What You CAN Do
            </h2>
            <p>As an ImNotAnAttorney partner, you are authorized to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Share your unique promo code and referral link with potential
                clients
              </li>
              <li>
                Use the materials and templates provided in your partner
                dashboard
              </li>
              <li>
                Earn commissions on qualifying purchases made through your
                referral
              </li>
              <li>
                Download and share the partner one-pager and QR code
              </li>
            </ul>
          </section>

          {/* ── 4. What You CANNOT Do ── */}
          <section id="cannot-do">
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. What You CANNOT Do
            </h2>
            <p>
              The following activities are{" "}
              <strong className="text-amber-400">strictly prohibited</strong>.
              Doing any of these puts both of us at legal risk and can end the
              partnership:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Promise or imply specific case outcomes (&quot;they&apos;ll get
                you off&quot;)
              </li>
              <li>
                Provide legal advice or act as a legal representative
              </li>
              <li>
                Claim ImNotAnAttorney is a law firm or imply an attorney-client
                relationship
              </li>
              <li>
                Represent that an INAA report replaces hiring counsel, that
                buying a report is a substitute for legal representation, or
                that a defendant doesn&apos;t need an attorney
              </li>
              <li>
                Use anti-attorney language (&quot;better than a lawyer&quot;)
              </li>
              <li>
                Make false or misleading claims about our services
              </li>
              <li>
                Spam or use unsolicited bulk communications
              </li>
              <li>
                Bid on ImNotAnAttorney brand terms in paid advertising
              </li>
              <li>
                Summarize, paraphrase, or verbally convey specific legal
                strategy from INAA reports to a defendant. Partners share the
                link to the report. Defendants read and interpret it
                themselves, or discuss it with their own attorney.
              </li>
            </ul>
          </section>

          {/* ── 5. Commission Structure ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. Commission Structure
            </h2>
            <p>
              Commission rates are based on your lifetime qualifying sales and
              increase automatically as you reach higher tiers:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Partner</strong> (0 to 4
                lifetime sales),{" "}
                <strong className="text-amber-400">10%</strong> commission
              </li>
              <li>
                <strong className="text-zinc-300">Silver Partner</strong> (5 to
                14 lifetime sales),{" "}
                <strong className="text-amber-400">15%</strong> commission
              </li>
              <li>
                <strong className="text-zinc-300">Gold Partner</strong> (15+
                lifetime sales),{" "}
                <strong className="text-amber-400">20%</strong> commission
              </li>
            </ul>
            <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-zinc-300">
                <strong className="text-amber-400">
                  Your tier never goes backward.
                </strong>{" "}
                Once you reach Silver or Gold, you stay there. A slow month or
                a quiet quarter does not cost you your rate. The progression is
                forward-only, and the tier you earn is the tier you keep for
                life. Tier status is preserved for active partners in good
                standing, suspension or termination under Section 8 ends tier
                benefits.
              </p>
            </div>
            <p className="mt-3">
              Commission is calculated on the post-discount sale amount (after
              any promo code or coupon has been applied).
            </p>
          </section>

          {/* ── 6. Payout Terms ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              6. Payout Terms
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Schedule:</strong> NET-30.
                Payouts are processed on the 1st of each month for commissions
                earned during the previous calendar month.
              </li>
              <li>
                <strong className="text-zinc-300">Minimum payout:</strong> $10.
                Balances below the minimum carry forward to the next month.
              </li>
              <li>
                <strong className="text-zinc-300">Methods:</strong> PayPal,
                Venmo, Zelle, or check. You select your preferred method in
                your partner dashboard.
              </li>
              <li>
                <strong className="text-zinc-300">Refunds:</strong> When a
                client gets a refund, the matching commission on that sale is
                reversed. If that reversal leaves a negative balance, we simply
                apply it against your next month&apos;s earnings. We never pull
                funds out of your account or ask you to pay anything back out
                of pocket.
              </li>
            </ul>
          </section>

          {/* ── 7. FTC Disclosure Requirements ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              7. FTC Disclosure Requirements
            </h2>
            <p>
              Under Federal Trade Commission guidelines, you{" "}
              <strong className="text-amber-400">must</strong> disclose your
              partner relationship in all promotional content. Failure to
              disclose is a violation of these Terms and may violate federal
              law.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Social media:</strong> Include{" "}
                <span className="text-amber-400">#ad</span> or{" "}
                <span className="text-amber-400">#partner</span> in every post
                that promotes ImNotAnAttorney or includes your referral link
              </li>
              <li>
                <strong className="text-zinc-300">Email:</strong> Include a
                clear disclosure statement (e.g., &quot;I earn a commission if
                you purchase through my link&quot;)
              </li>
              <li>
                <strong className="text-zinc-300">Verbal:</strong> Mention your
                commission relationship before or during any recommendation
              </li>
            </ul>
          </section>

          {/* ── 8. Ending the Partnership ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              8. Ending the Partnership
            </h2>
            <p>
              This is an at-will relationship. Either of us can end it at any
              time, for any reason. Here is how that works, cleanly, on both
              sides.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">You leave:</strong> Tell us
                you&apos;re done and we close your account. Any commissions
                you&apos;ve already earned get paid out on the next regular
                payout cycle, as long as they clear the minimum payout
                threshold.
              </li>
              <li>
                <strong className="text-zinc-300">We part ways:</strong> If we
                need to end the partnership on our side, we&apos;ll let you
                know. Earned commissions still get paid out on the next regular
                cycle under the same minimum rules.
              </li>
              <li>
                <strong className="text-zinc-300">
                  If terms are seriously violated:
                </strong>{" "}
                Conduct that puts defendants, clients, or the program at risk
                (UPL violations, fraud, misrepresentation, the items in{" "}
                <a href="#cannot-do" className="text-amber-400 underline">
                  what partners cannot do
                </a>
                ) can result in suspension and forfeiture of unpaid
                commissions. We reserve this for real breaches, not honest
                mistakes. If something&apos;s unclear, ask us first.
              </li>
              <li>
                <strong className="text-zinc-300">After it ends:</strong> Stop
                using ImNotAnAttorney partner materials, referral links, and
                promo codes. Active tier status and future earnings stop at
                that point.
              </li>
            </ul>
          </section>

          {/* ── 9. Contact ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              9. Contact
            </h2>
            <p>
              Questions about the partner program or these Terms? Contact us at{" "}
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
