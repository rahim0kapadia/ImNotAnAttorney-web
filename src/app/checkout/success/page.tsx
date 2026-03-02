/**
 * Checkout Success Page (/checkout/success?session_id=...&tier=...)
 *
 * Post-payment confirmation page. Stripe redirects here after successful checkout.
 * Verifies the payment via /api/checkout/verify, then displays tier-specific next
 * steps and a time-limited one-time offer (OTO) to upgrade.
 *
 * User journey position:
 *   Stripe checkout (payment complete) -> THIS PAGE -> /intake (case-decoder)
 *                                                   -> /upload (discovery tiers)
 *                                                   -> /checkout?tier=<next> (OTO upgrade)
 *
 * Query parameters:
 *   session_id — Stripe checkout session ID (used for server-side verification)
 *   tier — Product tier slug (determines next steps and OTO offer)
 *
 * Page states:
 *   1. Loading — Spinner while verifying session with /api/checkout/verify
 *   2. Verification failed — Error state with link to /services
 *   3. Verified — Success state with:
 *      a. Tier-specific next steps (action copy + delivery timeline)
 *      b. Case Decoder: "Complete Your Case Details" CTA -> /intake
 *      c. Discovery tiers: "Check your email for upload link" + fallback /upload link
 *      d. OTO countdown timer (24 hours, persisted in localStorage)
 *
 * OTO (One-Time Offer) logic:
 *   - 24-hour countdown timer starts on first page load
 *   - Timer end time persisted in localStorage keyed by `oto_${tier}_${sessionId}`
 *   - Shows tier-specific upgrade: Case Decoder -> Intelligence Brief ($800),
 *     Intelligence Brief -> X-Ray ($500), X-Ray -> War Room ($2,000),
 *     War Room -> Situation Room ($6,500)
 *   - Disappears when timer expires ("Expired")
 *   - Prices reflect 100% upgrade credit from current purchase
 *
 * Wrapped in Suspense for useSearchParams client-side rendering.
 */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";

const CONTACT_EMAIL = "help@imnotanattorney.com";

/**
 * Per-tier next steps configuration.
 * Determines what the customer sees after successful payment:
 *   - name: Display name for the tier
 *   - delivery: Expected delivery timeline
 *   - action: Primary instruction text
 *   - showUpload: Whether to show "check email for upload link" (discovery tiers)
 *   - noIntakeAction: If set, shows a CTA to complete intake (Case Decoder)
 *   - intakeUrl: URL for the intake form CTA
 */
const TIER_NEXT_STEPS: Record<
  string,
  { name: string; delivery: string; action: string; showUpload: boolean; noIntakeAction?: string; intakeUrl?: string }
> = {
  "case-decoder": {
    name: "Case Decoder",
    delivery: "24 hours",
    action:
      "Your Case Decoder report is being prepared. Check your email within 24 hours.",
    showUpload: false,
    noIntakeAction:
      "Complete your case details so we can start generating your report.",
    intakeUrl: "/intake?tier=case-decoder",
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    delivery: "72 hours",
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
    delivery: "25-28 business days",
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

/**
 * SuccessContent — client component that handles session verification,
 * OTO timer management, and conditional next-step rendering.
 */
function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const tier = searchParams.get("tier");
  const info = tier ? TIER_NEXT_STEPS[tier] : null;

  const [verified, setVerified] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [sessionCreated, setSessionCreated] = useState<number | null>(null);

  // Verify the Stripe checkout session server-side via /api/checkout/verify.
  // This confirms the payment actually completed (prevents URL spoofing).
  // Also extracts the customer email for pre-filling the intake form URL.
  useEffect(() => {
    if (!sessionId) {
      setVerified(false);
      return;
    }
    fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setVerified(data.verified === true);
        if (data.email) setCustomerEmail(data.email);
        if (data.sessionCreated) setSessionCreated(data.sessionCreated);
      })
      .catch(() => setVerified(false));
  }, [sessionId]);

  // OTO countdown timer. 24-hour window from Stripe session creation time.
  // Source of truth is sessionCreated (server-side, from Stripe). localStorage
  // is used only as a cache to prevent flicker on initial render before the
  // verify API responds. Private/incognito mode can't game the timer since
  // the server-side timestamp is immutable.
  useEffect(() => {
    if (!tier || !sessionId) return;
    const key = `oto_${tier}_${sessionId}`;

    // Compute end time from server-side session creation timestamp
    let end: number;
    if (sessionCreated) {
      // sessionCreated is Unix seconds from Stripe — convert to ms + 24h
      end = sessionCreated * 1000 + 24 * 60 * 60 * 1000;
      // Cache in localStorage for flicker-free re-renders
      localStorage.setItem(key, String(end));
    } else {
      // Fallback to localStorage cache while waiting for verify API response
      const cached = localStorage.getItem(key);
      if (cached) {
        end = Number(cached);
      } else {
        return; // No server time yet, no cache — wait for verify response
      }
    }

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
  }, [tier, sessionId, sessionCreated]);

  if (verified === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-zinc-400">Confirming your payment...</p>
        </div>
      </div>
    );
  }

  if (verified === false) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-400" aria-label="Error">
            &#10007;
          </div>
          <h1 className="text-2xl font-bold text-white">Payment Not Confirmed</h1>
          <p className="mt-4 text-zinc-400">
            We couldn&apos;t verify this payment. If you completed checkout, check your email for a confirmation — it may take a moment to process.
          </p>
          {sessionId && (
            <p className="mt-3 text-sm text-zinc-500">
              Reference: {sessionId.slice(0, 20)}...
            </p>
          )}
          <p className="mt-3 text-sm text-zinc-400">
            Need help? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}${sessionId ? `?subject=Payment%20issue%20-%20${sessionId.slice(3, 11).toUpperCase()}` : ""}`} className="text-amber-400 underline decoration-amber-400/50">
              {CONTACT_EMAIL}
            </a>
            {sessionId && <> with reference <strong>{sessionId.slice(3, 11).toUpperCase()}</strong></>}
          </p>
          <Link
            href="/services"
            className="mt-6 inline-block rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            View Services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl text-amber-400" aria-label="Success">
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

            {/* INTAKE CTA — Case Decoder customers may not have submitted case  */}
            {/* details yet (intake is separate from checkout). Shows CTA to    */}
            {/* /intake?tier=case-decoder so we can start generating the report.*/}
            {info.noIntakeAction && info.intakeUrl && (
              <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
                <p className="text-sm font-semibold text-amber-400">
                  Haven&apos;t submitted your case details yet?
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {info.noIntakeAction}
                </p>
                <Link
                  href={customerEmail ? `${info.intakeUrl}&email=${encodeURIComponent(customerEmail)}` : info.intakeUrl}
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Complete Your Case Details &rarr;
                </Link>
              </div>
            )}

            {info.showUpload && (
              <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
                <p className="text-sm font-semibold text-amber-400">
                  When you&apos;re ready, upload your discovery documents:
                </p>
                <Link
                  href="/upload"
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Upload Discovery Documents &rarr;
                </Link>
                <p className="mt-3 text-xs text-zinc-500">
                  We also sent upload instructions to your email.
                </p>
              </div>
            )}

            {/* ------------------------------------------------------------ */}
            {/* OTO UPGRADE OFFERS — Tier-specific, time-limited.           */}
            {/* Each block shows: countdown timer, next tier name, what it  */}
            {/* adds, and the upgrade cost (current purchase credited).     */}
            {/* Only visible while timeLeft is active (24h window).         */}
            {/* ------------------------------------------------------------ */}
            {timeLeft && timeLeft !== "Expired" && tier === "case-decoder" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — {timeLeft} remaining
                </p>
                <p className="text-sm font-semibold text-amber-400">
                  Upgrade to Intelligence Brief
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Your $197 is already credited. Get judge intelligence, jurisdiction profile, and 10-15 targeted questions.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adds: judge sentencing patterns, motion landscape report, attorney accountability timeline.
                </p>
                <Link
                  href="/checkout?tier=intelligence-brief"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Claim Your Upgrade Credit — $800 &rarr;
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
                  Your $997 is already credited. Get full discovery analysis — every page, every discrepancy, every red flag mapped.
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adds: discovery document index, comprehensive timeline, discrepancy report, 35+ case-specific questions.
                </p>
                <Link
                  href="/checkout?tier=x-ray"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Claim Your Upgrade Credit — $500 &rarr;
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
                  Adds: witness analysis (up to 8), officer dossiers, motion timing questions for your attorney, weekly intelligence updates.
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
                  Adds: Trial Intelligence Operations, witness impeachment research packages, Priority Response Line (2hr trial prep, 4hr trial), direct access channel.
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
            Confirmation #{sessionId.slice(3, 11).toUpperCase()}
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
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-amber-400 underline decoration-amber-400/50"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}

/** Page export with Suspense boundary for useSearchParams. */
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
