/**
 * /partners/bondsman, Bondsman-Specific Partner Signup Page
 *
 * Targeted version with bondsman-focused copy. Application pre-tags as source: bondsman.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bail Bond Partner Program",
  description: "Partner with ImNotAnAttorney to help your clients prepare for court. Free court reminders, compliance tools, and commission on referrals.",
};
import { xRayEarning, xRayFiveMonthly, BONDSMAN_FAQS, FORFEITURE_RANGE_DISPLAY } from "@/lib/partner-data";
import { PartnerCommissionTable, PartnerHowItWorks, PartnerApplicationForm, PartnerWhyItWorks } from "@/components/partner";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";

const HOW_IT_WORKS_STEPS = [
  {
    title: "Get Your Code",
    description: "Apply below. We review every application; most approvals land the same day.",
  },
  {
    title: "Hand It Out",
    description: "Defendants get 10% off. No selling, no explaining.",
  },
  {
    title: "See What You've Earned (and What You've Prevented)",
    description: "Dashboard shows commission AND FTA-prevention count per client. Monthly payouts, NET-30, your choice of method.",
  },
];

export default function BondsmanPartnersPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
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
          <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-amber-400 mb-4">
            The FTA-prevention layer for independent bail agents.{" "}
            <span className="block md:inline">Free. Commissions optional.</span>
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Every Forfeiture Is a Client
            <br />
            Who Didn&apos;t Show Up to Court.
          </h1>
          <p className="text-xl text-zinc-300 mb-4">
            Free court-date reminders and hearing prep for every defendant you
            bond out. Built to cut your FTA rate &mdash; the one number that decides
            whether this month ends in profit or forfeiture.
          </p>
          <p className="text-zinc-400 text-sm mb-8">
            (You also earn 10&ndash;20% when they buy case prep. But that&apos;s not why
            you&apos;re here.)
          </p>
          <a
            href="#apply"
            className="inline-block px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all cursor-pointer"
          >
            Get My Partner Code
          </a>
        </FadeInUp>
      </section>

      {/* Forfeiture Math */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-zinc-800">
        <h2 className="font-display text-3xl font-bold mb-6 text-center">
          The Math Every Bondsman Already Knows
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-400">{FORFEITURE_RANGE_DISPLAY}</p>
            <p className="text-zinc-400 text-sm mt-2">Average bond forfeiture per event</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-400">15&ndash;20%</p>
            <p className="text-zinc-400 text-sm mt-2">Industry FTA rate</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-400">$0</p>
            <p className="text-zinc-400 text-sm mt-2">Your cost if we prevent ONE forfeiture a year</p>
          </div>
        </div>
        <p className="text-zinc-300 text-center max-w-2xl mx-auto">
          Every defendant you bond out gets automated court-date reminders,
          pre-hearing checklists, and a &ldquo;what to wear / what to bring / where to park&rdquo;
          brief &mdash; for free &mdash; pre-tagged to you. One prevented no-show a year pays
          for the next ten years of this partnership. We don&apos;t charge you. Ever.
        </p>
      </section>

      {/* FTA Guarantee (H3 — adversarial walkthrough 2026-04-20) */}
      <section className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 md:p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400 mb-3">
            The FTA Guarantee
          </p>
          <p className="text-zinc-200 text-lg leading-relaxed">
            Run our reminders for 90 days on every defendant you bond. If your
            FTA rate doesn&apos;t drop at least 20% against your prior 12-month
            baseline, we cut you a check for $500 and you keep every tool.
          </p>
          <p className="text-zinc-500 text-xs mt-3">
            Baseline calculated from your agency&apos;s prior 12-month FTA data
            (you provide). One claim per agency.
          </p>
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

      {/* How It Works */}
      <section className="bg-zinc-900/50 border-t border-b border-zinc-700 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">How It Works</h2>
          </FadeInUp>
          <PartnerHowItWorks steps={HOW_IT_WORKS_STEPS} />
        </div>
      </section>

      {/* Differentiator */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-zinc-800">
        <h2 className="font-display text-3xl font-bold mb-6 text-center">
          Why We&apos;re Not the 10th Referral Program You&apos;ve Been Pitched
        </h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-bold text-amber-400 mb-2">The white-label shell</h3>
            <p className="text-zinc-300">
              Your clients see YOUR logo, not ours, on every page they visit
              after booking. Upload once in the dashboard, done.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold text-amber-400 mb-2">The data nobody else has</h3>
            <p className="text-zinc-300">
              Our reports pull from 595,851 federal sentencing records and 15,386
              judge profiles. The reminder apps are hollow &mdash; scheduled texts and
              nothing else. We give defendants real prep because our system runs
              on real court data.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold text-amber-400 mb-2">The QR-code jail-release flyer</h3>
            <p className="text-zinc-300">
              Print it. Hand it at bonding. Defendant scans, enrolls themselves,
              you never touch a keyboard. You look tech-savvy without doing tech.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold text-amber-400 mb-2">Built around the defendant, not the vendor</h3>
            <p className="text-zinc-300">
              We built this tooling around how defendants actually behave between
              bonding out and their first court date &mdash; not around how reminder-app
              vendors wish they behaved. That&apos;s why the client does the work, not
              you, and why the reminders land when they matter.
            </p>
          </div>
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
              { title: "Free FTA Prevention", desc: "Your clients get court date reminders and hearing prep automatically. Reduce your FTA rate, protect your bottom line." },
              { title: "Client Tracker Dashboard", desc: "See all your clients, their court dates, and reminder status in one place. Free, other companies charge $99/month." },
              { title: "One-Tap Client Entry", desc: "Add a client from your dashboard. We email them their court prep page and handle all reminders automatically." },
              { title: "You Earn 10-20% on Upgrades", desc: "When they're ready for case-specific analysis, your code gets them 10% off and you earn commission." },
              { title: "FTA Savings Calculator", desc: "See how much court reminders save you in prevented forfeitures. Real math, real numbers." },
              { title: "Compliance Kit", desc: "Approved language and FTC disclosure templates. Stay protected." },
              { title: "Surety Audit Report", desc: "One-click printable report for your surety auditor. Per-defendant reminder + check-in log, compliance rate, forfeiture exposure avoided math, flexible date ranges (30d/90d/quarterly including prior-year quarters, or custom from/to), signature lines. Your name on top, our tooling in the footer." },
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

      {/* Commission Table */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <FadeInUp>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-8">Commission Per Sale</h2>
        </FadeInUp>
        <PartnerCommissionTable />
        <p className="text-center text-zinc-400 text-sm mt-4">
          One X-Ray referral = {xRayEarning}. Five referrals a month = {xRayFiveMonthly} in passive income.
        </p>
      </section>

      {/* Why This Works */}
      <section className="bg-zinc-900/50 border-t border-b border-zinc-700 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">Why This Works Where Other Vendors Don&apos;t</h2>
            <p className="text-zinc-300 text-lg mb-4">
              You&apos;ve been pitched reminder apps before. They all have the same
              problem: they need YOU to enter the client, push the notifications,
              chase setup. More unpaid work.
            </p>
            <p className="text-zinc-300 text-lg">
              We flip it. You hand the defendant a QR code at booking. They scan,
              enter their case info, and our system takes over &mdash; court reminders,
              hearing prep, the whole track. You do nothing. Your FTA rate drops
              anyway. That&apos;s the entire pitch.
            </p>
          </FadeInUp>
          <PartnerWhyItWorks />
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <FadeInUp>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-8">Questions</h2>
        </FadeInUp>
        <FAQAccordion items={BONDSMAN_FAQS} />
      </section>

      {/* Application Form */}
      <section id="apply" className="bg-zinc-900/50 border-t border-zinc-700 py-16">
        <div className="max-w-2xl mx-auto px-6">
          <FadeInUp>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-2">Apply Now</h2>
            <p className="text-center text-zinc-400 mb-8">
              Short form. We review every application and reply by email.
            </p>
          </FadeInUp>
          <PartnerApplicationForm source="bondsman" />
          <p className="text-zinc-500 text-sm text-center italic mt-8">
            Built by a research team that works inside open defense files every
            week &mdash; which is why this tooling matches what bonding agencies
            actually need between arraignment and first court date. &mdash; INAA team.
          </p>
        </div>
      </section>

      <footer className="border-t border-zinc-700 py-8">
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
