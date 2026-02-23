"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";

const TIER_NEXT_STEPS: Record<
  string,
  { name: string; delivery: string; action: string; showUpload: boolean }
> = {
  "case-decoder": {
    name: "Case Decoder",
    delivery: "24 hours",
    action:
      "Check your email — we'll send your Case Decoder report within 24 hours.",
    showUpload: false,
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    delivery: "48-72 hours",
    action:
      "Check your email — we'll send your Intelligence Brief within 72 hours.",
    showUpload: false,
  },
  "x-ray": {
    name: "The X-Ray",
    delivery: "10 business days",
    action:
      "Upload your discovery documents so we can begin analysis. You'll receive a link via email.",
    showUpload: true,
  },
  "war-room": {
    name: "The War Room",
    delivery: "25-28 days",
    action:
      "Upload your discovery documents and we'll begin your full intelligence operation. Expect your first update within 7 days.",
    showUpload: true,
  },
  "situation-room": {
    name: "The Situation Room",
    delivery: "24-48 hours per stage",
    action:
      "Upload your discovery documents to begin. We'll contact you within 24 hours to schedule your priority onboarding.",
    showUpload: true,
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    delivery: "Next update cycle",
    action:
      "Your extra witness analysis will be included in your next scheduled case update.",
    showUpload: false,
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    delivery: "3-5 business days",
    action:
      "Upload your discovery documents so we can begin your witness analysis. You'll receive a link via email.",
    showUpload: true,
  },
};

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  // Determine tier from session (in production, verify with Stripe API)
  // For now, show generic success with all possible next steps
  const tier = searchParams.get("tier");
  const info = tier ? TIER_NEXT_STEPS[tier] : null;

  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!tier || !sessionId) return;
    const key = `oto_${tier}_${sessionId}`;
    let endTime = localStorage.getItem(key);
    if (!endTime) {
      endTime = String(Date.now() + 24 * 60 * 60 * 1000);
      localStorage.setItem(key, endTime);
    }
    const end = Number(endTime);

    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) { setTimeLeft("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tier, sessionId]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl text-amber-400">
          &#10003;
        </div>

        <h1 className="text-2xl font-bold text-white">
          Payment Confirmed
        </h1>

        {info ? (
          <>
            <p className="mt-3 text-lg text-amber-400">{info.name}</p>
            <p className="mt-4 text-zinc-400">{info.action}</p>
            <p className="mt-2 text-sm text-zinc-400">
              Delivery: {info.delivery}
            </p>

            {info.showUpload && (
              <div className="mt-8">
                <Link
                  href="/upload"
                  className="inline-block rounded-lg bg-amber-500 px-8 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Upload Your Documents Now &rarr;
                </Link>
              </div>
            )}

            {/* Upsell — tier-specific with urgency */}
            {timeLeft && timeLeft !== "Expired" && tier === "case-decoder" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — {timeLeft} remaining
                </p>
                <p className="text-sm font-semibold text-amber-400">
                  Upgrade to Intelligence Brief
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Your $197 is already credited. Get judge intelligence, jurisdiction profile, and 35-50 questions instead of 10-15.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adds: judge sentencing patterns, motion landscape report, attorney accountability timeline.
                </p>
                <Link
                  href="/checkout?tier=intelligence-brief"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Claim Your Upgrade Credit — $600 &rarr;
                </Link>
              </div>
            )}
            {timeLeft && timeLeft !== "Expired" && tier === "intelligence-brief" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — {timeLeft} remaining
                </p>
                <p className="text-sm font-semibold text-amber-400">
                  Upgrade to The X-Ray
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Your $797 is already credited. Get full discovery analysis — every page, every discrepancy, every red flag mapped.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adds: discovery document index, comprehensive timeline, discrepancy report, 35+ case-specific questions.
                </p>
                <Link
                  href="/checkout?tier=x-ray"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Claim Your Upgrade Credit — $700 &rarr;
                </Link>
              </div>
            )}
            {timeLeft && timeLeft !== "Expired" && tier === "x-ray" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — {timeLeft} remaining
                </p>
                <p className="text-sm font-semibold text-amber-400">
                  Upgrade to The War Room
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Your $1,497 is already credited. Get judge and prosecution dossiers, witness analysis, case law package, and weekly updates through resolution.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adds: witness analysis (up to 8), officer dossiers, motion wave strategy, weekly intelligence updates.
                </p>
                <Link
                  href="/checkout?tier=war-room"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Claim Your Upgrade Credit — $2,000 &rarr;
                </Link>
              </div>
            )}
            {timeLeft && timeLeft !== "Expired" && tier === "war-room" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — {timeLeft} remaining
                </p>
                <p className="text-sm font-semibold text-amber-400">
                  Upgrade to The Situation Room
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Your $3,497 is already credited. Get Trial Intelligence Operations — evening debrief + morning prep brief every trial day. All witnesses researched, JOA research brief, Priority Response Line.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adds: Trial Intelligence Operations, attack intelligence packages, Priority Response Line (2hr trial prep, 4hr trial), direct access channel.
                </p>
                <Link
                  href="/checkout?tier=situation-room"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Claim Your Upgrade Credit — $6,500 &rarr;
                </Link>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-zinc-400">
            Thank you for your purchase. Check your email for confirmation and
            next steps.
          </p>
        )}

        {sessionId && (
          <p className="mt-4 text-xs text-zinc-400">
            Session: {sessionId.slice(0, 20)}...
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            Back to Home
          </Link>
          <Link
            href="/blog"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
          >
            Read Our Blog
          </Link>
        </div>

        <p className="mt-8 text-xs text-zinc-400">
          ImNotAnAttorney provides legal information and research — not legal advice. No attorney-client relationship is created.
        </p>
        <p className="mt-4 text-sm text-zinc-400">
          Questions? Email us at{" "}
          <a
            href="mailto:help@imnotanattorney.com"
            className="text-amber-400 underline decoration-amber-400/50"
          >
            help@imnotanattorney.com
          </a>
        </p>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
