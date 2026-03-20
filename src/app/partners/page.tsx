"use client";
/**
 * /partners — Public Bondsman Partner Signup Page
 *
 * Landing page for bail bondsmen to learn about the referral program
 * and submit an application. No auth required.
 */

import { useState } from "react";
import Link from "next/link";

const COMMISSION_TABLE = [
  { tier: "DUI Defense Playbook", price: "$97", clientPays: "$87.30", commission: "$8.73" },
  { tier: "Case Decoder", price: "$197", clientPays: "$177.30", commission: "$17.73" },
  { tier: "Intelligence Brief", price: "$997", clientPays: "$897.30", commission: "$89.73" },
  { tier: "The X-Ray", price: "$2,497", clientPays: "$2,247.30", commission: "$224.73" },
  { tier: "The War Room", price: "$4,997", clientPays: "$4,497.30", commission: "$449.73" },
  { tier: "The Situation Room", price: "$9,997", clientPays: "$8,997.30", commission: "$899.73" },
];

const FAQS = [
  {
    q: "What does ImNotAnAttorney do?",
    a: "We research criminal cases and generate specific questions defendants can bring to their attorneys. We provide legal INFORMATION and questions — never legal advice. Think of us as a research team that helps defendants hold their attorneys accountable.",
  },
  {
    q: "How does the referral work?",
    a: "You get a unique promo code. Hand it to defendants when they bond out. They enter the code at checkout for 10% off. You earn 10% commission on every purchase they make. We track it all automatically.",
  },
  {
    q: "When do I get paid?",
    a: "Commissions are tracked in real time. We process payouts monthly via Venmo, Zelle, or check — your choice. You can see your running total and referral history anytime.",
  },
  {
    q: "What do I need to do?",
    a: "Literally just hand out your promo code. We handle everything else — the research, the questions, the delivery. You don't need to explain the product. The defendants are already looking for help.",
  },
  {
    q: "Is this legal?",
    a: "Yes. We provide legal information and generate questions — we do not provide legal advice. This is the same as recommending a book or resource. Your referral is simply introducing defendants to a research service.",
  },
  {
    q: "What if the defendant doesn't buy immediately?",
    a: "The promo code doesn't expire. Defendants typically purchase within 7 days of arrest (the crisis window), but the code works anytime. If they enter your code at checkout — even months later — you get the commission.",
  },
];

export default function PartnersPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, phone, region, message }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg text-amber-400">
            ImNotAnAttorney
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-white"
          >
            Back to main site
          </Link>
        </div>
      </header>

      {/* Hero */}
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

      {/* How It Works */}
      <section className="bg-zinc-900 border-t border-b border-zinc-800 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-500 text-black rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-lg font-bold mb-2">Get Your Code</h3>
              <p className="text-zinc-400">
                Apply below. Once approved, you get a unique promo code
                and a simple one-pager to hand defendants.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-500 text-black rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-lg font-bold mb-2">Share It</h3>
              <p className="text-zinc-400">
                Hand the code to defendants when they bond out.
                They enter it at checkout for 10% off any service.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-500 text-black rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-lg font-bold mb-2">Earn Commission</h3>
              <p className="text-zinc-400">
                Every time someone uses your code, you earn 10% commission.
                Tracked automatically. Paid monthly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Commission Table */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          Commission Per Sale
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm md:text-base">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-800">
                <th className="text-left py-3 pr-4">Service</th>
                <th className="text-right py-3 pr-4">Price</th>
                <th className="text-right py-3 pr-4">Client Pays</th>
                <th className="text-right py-3 font-bold text-amber-400">
                  You Earn
                </th>
              </tr>
            </thead>
            <tbody>
              {COMMISSION_TABLE.map((row) => (
                <tr
                  key={row.tier}
                  className="border-b border-zinc-800/50"
                >
                  <td className="py-3 pr-4 font-medium">{row.tier}</td>
                  <td className="py-3 pr-4 text-right text-zinc-400">
                    {row.price}
                  </td>
                  <td className="py-3 pr-4 text-right">{row.clientPays}</td>
                  <td className="py-3 text-right text-amber-400 font-bold">
                    {row.commission}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-center text-zinc-500 text-sm mt-4">
          One X-Ray referral = $224.73. Five referrals a month = $1,123.65 in passive income.
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
          <div className="grid md:grid-cols-2 gap-6 text-left">
            <div className="bg-zinc-800 rounded-xl p-6">
              <p className="font-bold text-amber-400 mb-2">7-Day Window</p>
              <p className="text-zinc-400">
                Most purchases happen within 7 days of arrest — the exact
                window when you&apos;re handing them your business card.
              </p>
            </div>
            <div className="bg-zinc-800 rounded-xl p-6">
              <p className="font-bold text-amber-400 mb-2">Zero Explanation</p>
              <p className="text-zinc-400">
                Defendants already know they need help. You just hand them
                a card with a code. The website does the selling.
              </p>
            </div>
            <div className="bg-zinc-800 rounded-xl p-6">
              <p className="font-bold text-amber-400 mb-2">Helps Your Client</p>
              <p className="text-zinc-400">
                Better-informed defendants make better decisions. This is
                genuinely useful — not a gimmick.
              </p>
            </div>
            <div className="bg-zinc-800 rounded-xl p-6">
              <p className="font-bold text-amber-400 mb-2">Passive Income</p>
              <p className="text-zinc-400">
                No selling, no follow-up, no tracking. Hand out codes,
                check your dashboard, collect payouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          Questions
        </h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left px-6 py-4 flex items-center justify-between"
              >
                <span className="font-medium">{faq.q}</span>
                <span className="text-zinc-400 text-xl ml-4">
                  {openFaq === i ? "\u2212" : "+"}
                </span>
              </button>
              {openFaq === i && (
                <div className="px-6 pb-4 text-zinc-400">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
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

          {submitted ? (
            <div className="text-center bg-green-900/30 border border-green-700 rounded-xl p-8">
              <p className="text-green-300 text-xl font-bold mb-2">
                Application Submitted
              </p>
              <p className="text-zinc-400">
                We&apos;ll review your application and email you within 24 hours
                with your unique promo code and partner materials.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg">
                  {error}
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Company / Agency
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-zinc-400 mb-1">
                    Region / Service Area
                  </label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g., Maricopa County, AZ"
                    className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-zinc-400 mb-1">
                    Anything else we should know?
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-zinc-500 text-sm">
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
