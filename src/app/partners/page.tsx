/**
 * /partners — Public Partner Signup Page (Generic)
 *
 * Landing page for all partner types — bondsmen, paralegals, content creators,
 * community advocates, anyone. Commission table derived from TIER_CORE.
 */

import Link from "next/link";
import { xRayEarning, xRayFiveMonthly, PARTNER_FAQS } from "@/lib/partner-data";
import { PartnerCommissionTable, PartnerHowItWorks, PartnerApplicationForm, PartnerWhyItWorks } from "@/components/partner";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";

const HOW_IT_WORKS_STEPS = [
  {
    title: "Get Your Code in 60 Seconds",
    description: "Apply below. Instant approval.",
  },
  {
    title: "Hand It Out",
    description: "Defendants get 10% off. No selling, no explaining.",
  },
  {
    title: "Watch Commissions Roll In",
    description: "Real-time dashboard. Monthly payouts.",
  },
];

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg text-amber-400">
            ImNotAnAttorney
          </Link>
          <Link href="/partner/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Partner Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-24 text-center">
        <FadeInUp>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Earn {xRayEarning} Every Time a
            <br />
            <span className="text-amber-400">Defendant Uses Your Code</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-4">
            Your referrals get free court prep — date reminders and hearing guidance.
            You earn 10-20% on every product they purchase. No selling required.
          </p>
          <p className="text-sm text-zinc-500 mb-8">
            Bondsmen, paralegals, content creators, advocates — anyone can partner.
          </p>
          <a
            href="#apply"
            className="inline-block px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all cursor-pointer"
          >
            Get My Partner Code
          </a>
        </FadeInUp>
      </section>

      {/* How It Works */}
      <section className="bg-zinc-900/50 border-t border-b border-zinc-700 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">
              How It Works
            </h2>
          </FadeInUp>
          <PartnerHowItWorks steps={HOW_IT_WORKS_STEPS} />
        </div>
      </section>

      {/* Commission Table */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <FadeInUp>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-8">
            Commission Per Sale
          </h2>
        </FadeInUp>
        <PartnerCommissionTable />
        <p className="text-center text-zinc-400 text-sm mt-4">
          One X-Ray referral = {xRayEarning}. Five referrals a month = {xRayFiveMonthly} in passive income.
        </p>
        <p className="text-center mt-4">
          <Link href="/partners/bondsman" className="text-amber-400 hover:text-amber-300 text-sm">
            Bail bondsman? See our bondsman-specific page &rarr;
          </Link>
        </p>
      </section>

      {/* Why This Works */}
      <section className="bg-zinc-900/50 border-t border-b border-zinc-700 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">
              Why Defendants Buy
            </h2>
            <p className="text-zinc-300 text-lg mb-8">
              Your clients are in crisis. Their attorney isn&apos;t calling back.
              They don&apos;t understand their charges. They&apos;re scared.
              ImNotAnAttorney gives them the one thing they need most:
              <strong className="text-amber-400"> the right questions to ask.</strong>
            </p>
          </FadeInUp>
          <PartnerWhyItWorks />
        </div>
      </section>

      {/* Partner Toolkit (replaces testimonials) */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <FadeInUp>
            <h2 className="font-display text-3xl font-bold mb-4">Your Partner Toolkit</h2>
            <p className="text-zinc-400 mb-12">Everything you need to start earning — no selling required</p>
          </FadeInUp>
          <StaggerContainer className="grid md:grid-cols-3 gap-6">
            {[
              { title: "Unique Promo Code", desc: "Your personal code gives clients 10% off. Tracked automatically." },
              { title: "Referral Link + QR Code", desc: "Share a link or print a QR code. Clients scan and buy." },
              { title: "Copy-Paste Messages", desc: "Ready-to-send texts and emails. Just copy, paste, send." },
              { title: "Real-Time Dashboard", desc: "See every referral, commission, and payout in real time." },
              { title: "Monthly Payouts", desc: "NET-30 via PayPal, Venmo, Zelle, or check. Your choice." },
              { title: "Compliance Kit", desc: "Approved language and FTC disclosure templates. Stay protected." },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div className="bg-zinc-900/50 rounded-xl border border-zinc-700 p-6 text-left">
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-zinc-400">{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <FadeInUp>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-8">
            Questions
          </h2>
        </FadeInUp>
        <FAQAccordion items={PARTNER_FAQS} />
      </section>

      {/* Application Form */}
      <section
        id="apply"
        className="bg-zinc-900/50 border-t border-zinc-700 py-16"
      >
        <div className="max-w-2xl mx-auto px-6">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-2">
              Apply Now
            </h2>
            <p className="text-center text-zinc-400 mb-8">
              Takes 60 seconds. Instant approval — check your email.
            </p>
          </FadeInUp>
          <PartnerApplicationForm source="generic" />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-700 py-8">
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
