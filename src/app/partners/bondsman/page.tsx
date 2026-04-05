"use client";
/**
 * /partners/bondsman — Bondsman-Specific Partner Signup Page
 *
 * Targeted version with bondsman-focused copy. Application pre-tags as source: bondsman.
 */

import Link from "next/link";
import { COMMISSION_TABLE, PARTNER_FAQS } from "@/lib/partner-data";
import { PartnerCommissionTable, PartnerHowItWorks, PartnerApplicationForm, PartnerWhyItWorks } from "@/components/partner";
import { FAQAccordion } from "@/components/FAQAccordion";
import { TestimonialSection } from "@/components/TestimonialSection";

const xRayCommission = COMMISSION_TABLE.find(r => r.tier === "The X-Ray");

const HOW_IT_WORKS_STEPS = [
  {
    title: "Get Your Code",
    description: "Apply below. Once approved, you get a unique promo code and a simple one-pager to hand defendants.",
  },
  {
    title: "Share It",
    description: "Hand the code to defendants when they bond out. They enter it at checkout for 10% off any service.",
  },
  {
    title: "Earn Commission",
    description: "Every time someone uses your code, you earn 10% commission. Tracked automatically. Paid monthly.",
  },
];

export default function BondsmanPartnersPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-500">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg text-amber-400">
            ImNotAnAttorney
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/partner/login" className="text-sm text-amber-400 hover:text-amber-300">
              Partner Login
            </Link>
            <Link href="/partners" className="text-sm text-zinc-400 hover:text-white">
              All Partner Types
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-16 md:py-24 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
          Your Clients Need Help.
          <br />
          <span className="text-amber-400">Earn Commission Sending It.</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-8">
          Every defendant you bond out is searching for answers about their case.
          Give them a promo code for ImNotAnAttorney. They save 10%.
          You earn 10% commission on every purchase.
        </p>
        <a
          href="#apply"
          className="inline-block px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors"
        >
          Apply to Partner Program
        </a>
      </section>

      <section className="bg-zinc-900 border-t border-b border-zinc-500 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">How It Works</h2>
          <PartnerHowItWorks steps={HOW_IT_WORKS_STEPS} />
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Commission Per Sale</h2>
        <PartnerCommissionTable rows={COMMISSION_TABLE} />
        <p className="text-center text-zinc-400 text-sm mt-4">
          One X-Ray referral = {xRayCommission?.commission}. Five referrals a month = serious passive income.
        </p>
      </section>

      <section className="bg-zinc-900 border-t border-b border-zinc-500 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Why Defendants Buy</h2>
          <p className="text-zinc-300 text-lg mb-8">
            Your clients are in crisis. Their attorney isn&apos;t calling back.
            They don&apos;t understand their charges. They&apos;re scared.
            ImNotAnAttorney gives them the one thing they need most:
            <strong className="text-amber-400"> the right questions to ask.</strong>
          </p>
          <PartnerWhyItWorks />
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <TestimonialSection
          variant="inline"
          testimonials={[
            {
              quote: "My clients are always asking what to do next. Now I hand them something real. Two referrals last month, both converted to Case Decoders.",
              name: "Carlos D.",
              charge: "Bail Bondsman, Houston",
              outcome: "2 referral conversions",
            },
          ]}
        />
        <p className="mt-4 text-center text-xs text-zinc-400">
          *Based on real defendant experiences. Names changed for privacy.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Questions</h2>
        <FAQAccordion items={PARTNER_FAQS} />
      </section>

      <section id="apply" className="bg-zinc-900 border-t border-zinc-500 py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">Apply Now</h2>
          <p className="text-center text-zinc-400 mb-8">
            Takes 60 seconds. We&apos;ll review and get back to you within 24 hours.
          </p>
          <PartnerApplicationForm source="bondsman" includeHeardAboutUs={false} />
        </div>
      </section>

      <footer className="border-t border-zinc-500 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-zinc-400 text-sm">
          <p>ImNotAnAttorney provides legal information, not legal advice.</p>
          <p className="mt-2">
            <Link href="/" className="text-zinc-400 hover:text-white">imnotanattorney.com</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
