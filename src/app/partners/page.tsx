/**
 * /partners, Public Partner Signup Page (Generic)
 *
 * Landing page for all partner types, bondsmen, paralegals, content creators,
 * community advocates, anyone. Commission table derived from TIER_CORE.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Become a Partner",
  description: "Join the ImNotAnAttorney partner program. Earn commission on every referral while helping defendants get the legal information they need.",
};
import { xRayEarning, xRayFiveMonthly, PARTNER_FAQS, PARTNER_SEGMENTS } from "@/lib/partner-data";
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
    description:
      "Defendants get a refund-backed research service. You earn 10–20% on every case-prep purchase. No selling, no explaining.",
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
          <Link href="/partner/login" className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors">
            Partner Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-24 text-center">
        <FadeInUp>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Your Clients Skip Court.
            <br />
            <span className="text-amber-400">We Help Cut That. You Earn 10&ndash;20%.</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-8">
            You already sit next to defendants between arrest and trial
            &mdash; bondsmen, paralegals, content creators, community
            advocates. We add court-date reminders, pre-hearing information
            for your clients, and 10&ndash;20% commission on every case-prep
            purchase.
          </p>

          {/* Primary CTA: Bail bondsmen (named first, forfeiture-prevention is the most built-out segment) */}
          <div className="flex flex-col items-center gap-3 mb-4">
            <Link
              href="/partners/bondsman"
              className="inline-block min-h-[44px] px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all cursor-pointer"
            >
              Bail bondsman? See the forfeiture-prevention program &rarr;
            </Link>
            <p className="text-xs text-zinc-400">
              Free court-date reminders for every client you bond out. Designed
              to cut down on the forfeiture checks you&apos;re writing now.
            </p>
          </div>

          {/* Secondary CTA: everyone else */}
          <div className="mt-6">
            <a
              href="#segments"
              className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 border border-zinc-600 text-zinc-200 rounded-xl hover:border-amber-500 hover:text-amber-400 transition-colors"
            >
              Paralegal, content creator, or community advocate? &darr;
            </a>
          </div>
        </FadeInUp>
      </section>

      {/* 4 Named Segments */}
      <section
        id="segments"
        aria-labelledby="segments-heading"
        className="bg-zinc-900/50 border-t border-b border-zinc-700 py-16"
      >
        <div className="max-w-5xl mx-auto px-6">
          <FadeInUp>
            <h2
              id="segments-heading"
              className="font-display text-2xl md:text-3xl font-bold text-center mb-3"
            >
              Built for Four Specific Roles
            </h2>
            <p className="text-center text-zinc-400 max-w-2xl mx-auto mb-12">
              Not &ldquo;anyone with a link.&rdquo; These are the four roles that already
              sit next to defendants in the window between arrest and arraignment.
            </p>
          </FadeInUp>
          <StaggerContainer className="grid md:grid-cols-2 gap-6">
            {PARTNER_SEGMENTS.map((seg) => (
              <StaggerItem key={seg.slug}>
                <div className="h-full flex flex-col bg-zinc-900/70 rounded-xl border border-zinc-700 p-6 text-left">
                  <h3 className="font-display text-xl font-bold text-white mb-1">
                    {seg.title}
                  </h3>
                  <p className="text-xs text-amber-400 font-semibold mb-3 uppercase tracking-wide">
                    {seg.tag}
                  </p>
                  <p className="text-sm text-zinc-300 mb-5 flex-1">
                    {seg.description}
                  </p>
                  <Link
                    href={seg.ctaHref}
                    className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 border border-amber-500 text-amber-400 rounded-lg text-sm font-semibold hover:bg-amber-500/10 transition-colors self-start"
                  >
                    {seg.ctaLabel}
                    <span aria-hidden="true"> &rarr;</span>
                  </Link>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
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
      </section>

      {/* What Your Referrals Actually Get */}
      <section className="bg-zinc-900/50 border-t border-b border-zinc-700 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">
              What Your Referrals Actually Get
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

      {/* Data Depth, Trust Signal */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">
              Backed by Real Data
            </h2>
            <p className="text-zinc-300 text-lg mb-8">
              Our reports draw from{" "}
              <strong className="text-amber-400">595,851 federal sentencing records</strong>,{" "}
              <strong className="text-amber-400">15,386 judge profiles</strong>,{" "}
              officer employment histories across 3 states, and 30,000+ police
              encounter records. Every finding links to a verified source.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { stat: "595,851", label: "Federal sentencing records" },
                { stat: "15,386", label: "Judge profiles" },
                { stat: "52", label: "Jurisdictions covered" },
                { stat: "4,699", label: "Statutes verified" },
              ].map((item) => (
                <div key={item.label} className="bg-zinc-900/50 rounded-lg border border-zinc-700 p-4">
                  <div className="font-display text-2xl font-bold text-amber-400">{item.stat}</div>
                  <div className="text-xs text-zinc-400 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Partner Toolkit (replaces testimonials) */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <FadeInUp>
            <h2 className="font-display text-3xl font-bold mb-4">Your Partner Toolkit</h2>
            <p className="text-zinc-400 mb-12">Everything you need to start earning, no selling required</p>
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
              Takes 60 seconds. Instant approval, check your email.
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
