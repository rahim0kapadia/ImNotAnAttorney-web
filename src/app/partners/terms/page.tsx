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
        <h1 className="text-3xl font-bold text-white md:text-4xl">
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

          {/* ── 2. What You CAN Do ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              2. What You CAN Do
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

          {/* ── 3. What You CANNOT Do ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              3. What You CANNOT Do
            </h2>
            <p>
              The following activities are{" "}
              <strong className="text-amber-400">strictly prohibited</strong>.
              Violation of any item below may result in immediate termination of
              your partnership and forfeiture of unpaid commissions:
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
            </ul>
          </section>

          {/* ── 4. Commission Structure ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              4. Commission Structure
            </h2>
            <p>
              Commission rates are based on your lifetime qualifying sales and
              increase automatically as you reach higher tiers:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-300">Partner</strong> (0&ndash;4
                lifetime sales) &mdash;{" "}
                <strong className="text-amber-400">10%</strong> commission
              </li>
              <li>
                <strong className="text-zinc-300">Silver Partner</strong>{" "}
                (5&ndash;14 lifetime sales) &mdash;{" "}
                <strong className="text-amber-400">15%</strong> commission
              </li>
              <li>
                <strong className="text-zinc-300">Gold Partner</strong> (15+
                lifetime sales) &mdash;{" "}
                <strong className="text-amber-400">20%</strong> commission
              </li>
            </ul>
            <p className="mt-2">
              Tiers are based on lifetime qualifying sales and{" "}
              <strong className="text-amber-400">never downgrade</strong>.
              Commission is calculated on the post-discount sale amount (after
              any promo code or coupon has been applied).
            </p>
          </section>

          {/* ── 5. Payout Terms ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              5. Payout Terms
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
                <strong className="text-zinc-300">Refunds:</strong> If a
                purchase is refunded, the associated commission is reversed. If
                the reversal exceeds your current balance, the negative balance
                carries forward.
              </li>
            </ul>
          </section>

          {/* ── 6. FTC Disclosure Requirements ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              6. FTC Disclosure Requirements
            </h2>
            <p>
              Under Federal Trade Commission guidelines, you{" "}
              <strong className="text-amber-400">must</strong> disclose your
              partner relationship in all promotional content. Failure to
              disclose is a violation of these Terms and may violate federal law.
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

          {/* ── 7. Termination ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              7. Termination
            </h2>
            <p>
              Either party may terminate this partnership at any time, for any
              reason, with or without notice.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Earned but unpaid commissions will be paid out at the next
                regular payout cycle, subject to the minimum payout threshold
              </li>
              <li>
                Violation of these Terms may result in immediate suspension of
                your partner account and forfeiture of unpaid commissions
              </li>
              <li>
                Upon termination, you must stop using all ImNotAnAttorney
                partner materials, referral links, and promo codes
              </li>
            </ul>
          </section>

          {/* ── 8. Contact ── */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              8. Contact
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
