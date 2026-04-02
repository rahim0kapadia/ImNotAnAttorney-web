"use client";
/**
 * /partners — Public Partner Signup Page (Generic)
 *
 * Landing page for all partner types — bondsmen, paralegals, content creators,
 * community advocates, anyone. Commission table derived from TIER_CORE.
 */

import Link from "next/link";
import { COMMISSION_TABLE, xRayEarning, xRayFiveMonthly, PARTNER_FAQS } from "@/lib/partner-data";
import { PartnerCommissionTable, PartnerHowItWorks, PartnerApplicationForm, PartnerWhyItWorks } from "@/components/partner";
import { FAQAccordion } from "@/components/FAQAccordion";
import { TestimonialSection } from "@/components/TestimonialSection";

const HOW_IT_WORKS_STEPS = [
  {
    title: "Get Your Code",
    description: "Apply below. Once approved, you get a unique promo code, referral link, QR code, and ready-to-send messages.",
  },
  {
    title: "Share It",
    description: "Share your link or code with anyone facing criminal charges. They get 10% off any service.",
  },
  {
    title: "Earn Commission",
    description: "Every time someone uses your code, you earn 10% commission. Tracked automatically. Paid monthly.",
  },
];

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg text-amber-400">
            ImNotAnAttorney
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/partner/login" className="text-sm text-amber-400 hover:text-amber-300">
              Partner Login
            </Link>
            <Link href="/" className="text-sm text-zinc-400 hover:text-white">
              Back to main site
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-24 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
          Know Someone Facing Charges?
          <br />
          <span className="text-amber-400">Earn Commission Helping Them.</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-8">
          Defendants are searching for answers about their case.
          Share your referral link. They save 10%.
          You earn 10% commission on every purchase.
        </p>
        <a
          href="#apply"
          className="inline-block px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors"
        >
          Apply to Partner Program
        </a>
      </section>

      {/* How It Works */}
      <section className="bg-zinc-900 border-t border-b border-zinc-800 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            How It Works
          </h2>
          <PartnerHowItWorks steps={HOW_IT_WORKS_STEPS} />
        </div>
      </section>

      {/* Who's This For */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          Who Partners With Us
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "Bail Bondsmen", desc: "Hand out codes when defendants bond out. They're already looking for help." },
            { title: "Paralegals & Legal Staff", desc: "Recommend a resource that helps clients show up prepared." },
            { title: "Content Creators", desc: "Share with your audience. Legal content converts at high rates." },
            { title: "Community Advocates", desc: "Help people in your network navigate the justice system." },
            { title: "Court Reporters", desc: "You see defendants every day. Give them a tool that helps." },
            { title: "Anyone", desc: "Know someone facing charges? That's all it takes." },
          ].map((item) => (
            <div key={item.title} className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <p className="font-bold text-amber-400 mb-1">{item.title}</p>
              <p className="text-zinc-400 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-center mt-6">
          <Link href="/partners/bondsman" className="text-amber-400 hover:text-amber-300 text-sm">
            Bail bondsman? See our bondsman-specific page &rarr;
          </Link>
        </p>
      </section>

      {/* Commission Table */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          Commission Per Sale
        </h2>
        <PartnerCommissionTable rows={COMMISSION_TABLE} />
        <p className="text-center text-zinc-400 text-sm mt-4">
          One X-Ray referral = {xRayEarning}. Five referrals a month = {xRayFiveMonthly} in passive income.
        </p>
      </section>

      {/* Why This Works */}
      <section className="bg-zinc-900 border-t border-b border-zinc-800 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">
            Why Defendants Buy
          </h2>
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
              quote: "I started handing the card to every client at release. Three of them bought the playbook within 24 hours. One told me the questions got his case dismissed. I've earned more in referral commissions than I expected.",
              name: "Mike R.",
              charge: "Bail Bondsman, Tampa",
              outcome: "Multiple referral conversions",
            },
          ]}
        />
        <p className="mt-4 text-center text-xs text-zinc-400">
          *Based on real defendant experiences. Names changed for privacy.
        </p>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          Questions
        </h2>
        <FAQAccordion items={PARTNER_FAQS} />
      </section>

      {/* Application Form */}
      <section
        id="apply"
        className="bg-zinc-900 border-t border-zinc-800 py-16"
      >
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">
            Apply Now
          </h2>
          <p className="text-center text-zinc-400 mb-8">
            Takes 60 seconds. We&apos;ll review and get back to you within 24 hours.
          </p>
          <PartnerApplicationForm source="generic" />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-zinc-400 text-sm">
          <p>
            ImNotAnAttorney provides legal information, not legal advice.
          </p>
          <p className="mt-2">
            <Link href="/" className="text-zinc-400 hover:text-white">
              imnotanattorney.com
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
