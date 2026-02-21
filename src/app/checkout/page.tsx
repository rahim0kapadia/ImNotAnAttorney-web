"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";

const TIER_INFO: Record<
  string,
  {
    name: string;
    price: string;
    priceNum: number;
    delivery: string;
    requiresDiscovery: boolean;
    features: string[];
    guarantee: string;
  }
> = {
  "case-decoder": {
    name: "Case Decoder",
    price: "$97",
    priceNum: 97,
    delivery: "24 hours",
    requiresDiscovery: false,
    features: [
      "Plain-English charge breakdown",
      "Case stage benchmark",
      "Attorney accountability checklist",
      "10-15 targeted questions for your attorney",
      "Red flags for your stage",
      "Common motion types for your charge category",
    ],
    guarantee:
      "Delivered within 24 hours with 10+ targeted questions — or your money back.",
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    price: "$497",
    priceNum: 497,
    delivery: "48-72 hours",
    requiresDiscovery: false,
    features: [
      "Everything in Case Decoder",
      "Charge exposure map",
      "Judge intelligence profile",
      "Jurisdiction profile",
      "Attorney accountability timeline",
      "Motion landscape report",
      "Pre-discovery red flags",
      "35-50 targeted questions",
    ],
    guarantee:
      "Delivered within 72 hours with 35+ targeted questions — or your money back.",
  },
  "x-ray": {
    name: "The X-Ray",
    price: "$997",
    priceNum: 997,
    delivery: "5-7 business days",
    requiresDiscovery: true,
    features: [
      "Everything in Intelligence Brief",
      "Discovery document index",
      "Comprehensive timeline",
      "Discrepancy report",
      "Red flags summary",
      "20+ case-specific questions",
    ],
    guarantee:
      "Delivered within 7 business days with 20+ case-specific questions — or your money back.",
  },
  "war-room": {
    name: "The War Room",
    price: "$1,997",
    priceNum: 1997,
    delivery: "25-28 days + weekly updates",
    requiresDiscovery: true,
    features: [
      "Everything in The X-Ray",
      "Judge & prosecution dossiers",
      "Witness analysis (up to 8)",
      "Questions about motion timing for your attorney",
      "Case law reference package",
      "Research-based questions about case strategy for your attorney",
      "Attorney delivery package",
      "Weekly updates for duration of case",
    ],
    guarantee:
      "Initial package within 28 business days. Weekly updates every 7 days thereafter.",
  },
  "situation-room": {
    name: "The Situation Room",
    price: "$4,997",
    priceNum: 4997,
    delivery: "24-48hr priority turnaround",
    requiresDiscovery: true,
    features: [
      "Everything in The War Room",
      "Research on all witness backgrounds and credibility questions for your attorney",
      "Research summaries your attorney can use when drafting reply briefs",
      "Attack intelligence packages",
      "Research-based questions about jury selection and trial strategy for your attorney",
      "Research and questions about JOA standards for your case type",
      "Trial morning cheat sheets",
      "Real-time trial support",
      "Direct access channel",
    ],
    guarantee:
      "Priority 24-48hr turnaround per stage. Trial-ready intelligence.",
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    price: "$149",
    priceNum: 149,
    delivery: "Next update cycle",
    requiresDiscovery: false,
    features: [
      "Individual witness background report",
      "Credibility and background question set",
      "Added to your existing case file",
    ],
    guarantee: "Delivered in your next scheduled update cycle.",
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    price: "$297",
    priceNum: 297,
    delivery: "3-5 business days",
    requiresDiscovery: true,
    features: [
      "Comprehensive witness analysis",
      "Background and credibility report",
      "Credibility and background questions",
      "Impeachment opportunities",
    ],
    guarantee: "Delivered within 5 business days.",
  },
};

function CheckoutContent() {
  const searchParams = useSearchParams();
  const tier = searchParams.get("tier") || "case-decoder";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = TIER_INFO[tier];

  if (!info) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">
            Invalid tier selected
          </h1>
          <Link
            href="/#pricing"
            className="mt-4 inline-block text-amber-400 underline"
          >
            View pricing options
          </Link>
        </div>
      </div>
    );
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Could not connect to payment service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/#pricing"
          className="mb-8 inline-block text-sm text-zinc-400 hover:text-white"
        >
          &larr; Back to pricing
        </Link>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="text-2xl font-bold text-white">{info.name}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-amber-400">
              {info.price}
            </span>
            <span className="text-sm text-zinc-400">one-time</span>
          </div>

          <div className="mt-2 rounded-lg bg-zinc-800/50 px-3 py-1 inline-block">
            <span className="text-xs text-zinc-400">
              Delivery: {info.delivery}
            </span>
          </div>

          {/* What's included */}
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-300">
              What&apos;s included
            </h2>
            <ul className="mt-3 space-y-2">
              {info.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-zinc-400"
                >
                  <span className="mt-0.5 text-amber-400" aria-hidden="true">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Discovery notice */}
          {info.requiresDiscovery && (
            <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
              <p className="text-sm text-zinc-400">
                This tier requires discovery documents. You&apos;ll receive a
                link to upload them after payment.
              </p>
            </div>
          )}

          {/* Guarantee */}
          <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold text-amber-400">
              Deliverable Guarantee
            </p>
            <p className="mt-1 text-sm text-zinc-400">{info.guarantee}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Disclaimer (C7) */}
          <p className="mt-6 text-xs text-zinc-400">
            ImNotAnAttorney provides legal information and research — not legal advice. No attorney-client relationship is created.
          </p>

          {/* CTA */}
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Redirecting to payment...
              </span>
            ) : `Pay ${info.price} — Secure Checkout`}
          </button>

          <p className="mt-3 text-center text-sm text-zinc-300">
            <svg className="mr-1 inline-block h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Secure checkout powered by Stripe
          </p>
          <p className="mt-1 text-center text-xs text-zinc-400">
            Visa, Mastercard, and Amex accepted
          </p>
        </div>

        {/* Upgrade credits */}
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <p className="text-sm font-semibold text-amber-400">
            100% Upgrade Credit
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Every dollar you spend is credited toward higher tiers. Upgrade
            anytime within 12 months — no money wasted.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
