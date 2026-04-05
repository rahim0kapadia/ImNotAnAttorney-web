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
 *     Intelligence Brief -> X-Ray ($1,500), X-Ray -> War Room ($2,500),
 *     War Room -> Situation Room ($5,000)
 *   - Disappears when timer expires ("Expired")
 *   - Prices reflect 100% upgrade credit from current purchase
 *
 * Wrapped in Suspense for useSearchParams client-side rendering.
 */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import { TIER_CORE, upgradeCostBetween, type TierSlug } from "@/lib/tiers";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TrustBadges } from "@/components/TrustBadges";


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
  { name: string; delivery: string; action: string; showUpload: boolean; noIntakeAction?: string; intakeUrl?: string; isDigitalProduct?: boolean }
> = {
  "dui-first-offense": {
    name: TIER_CORE["dui-first-offense"].name,
    delivery: TIER_CORE["dui-first-offense"].delivery,
    action:
      "Your DUI Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "drug-possession": {
    name: TIER_CORE["drug-possession"].name,
    delivery: TIER_CORE["drug-possession"].delivery,
    action:
      "Your Drug Possession Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "probation-violation": {
    name: TIER_CORE["probation-violation"].name,
    delivery: TIER_CORE["probation-violation"].delivery,
    action:
      "Your Probation Violation Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "white-collar": {
    name: TIER_CORE["white-collar"].name,
    delivery: TIER_CORE["white-collar"].delivery,
    action:
      "Your White Collar Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "sex-offense": {
    name: TIER_CORE["sex-offense"].name,
    delivery: TIER_CORE["sex-offense"].delivery,
    action:
      "Your Sex Offense Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "federal-criminal": {
    name: TIER_CORE["federal-criminal"].name,
    delivery: TIER_CORE["federal-criminal"].delivery,
    action:
      "Your Federal Criminal Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "drug-trafficking": {
    name: TIER_CORE["drug-trafficking"].name,
    delivery: TIER_CORE["drug-trafficking"].delivery,
    action:
      "Your Drug Trafficking Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "self-defense": {
    name: TIER_CORE["self-defense"].name,
    delivery: TIER_CORE["self-defense"].delivery,
    action:
      "Your Self-Defense / Justifiable Force Defense Playbook has been sent to your email. Check your inbox — if you don't see it in 5 minutes, check spam.",
    showUpload: false,
    isDigitalProduct: true,
  },
  "case-decoder": {
    name: TIER_CORE["case-decoder"].name,
    delivery: TIER_CORE["case-decoder"].delivery,
    action: TIER_CORE["case-decoder"].deliveryDetail,
    showUpload: false,
    noIntakeAction:
      "Complete your case details so we can start generating your report.",
    intakeUrl: "/intake?tier=case-decoder",
  },
  "intelligence-brief": {
    name: TIER_CORE["intelligence-brief"].name,
    delivery: TIER_CORE["intelligence-brief"].delivery,
    action:
      "Your package includes a Case Decoder report delivered within 48 hours, followed by your full Intelligence Brief within 72 hours. Complete your case details to get started.",
    showUpload: false,
    noIntakeAction:
      "Complete your case details so we can generate your Case Decoder report within 48 hours.",
    intakeUrl: "/intake?tier=intelligence-brief",
  },
  "x-ray": {
    name: TIER_CORE["x-ray"].name,
    delivery: TIER_CORE["x-ray"].delivery,
    action:
      "Your package includes a Case Decoder (48 hours) and Intelligence Brief (72 hours) delivered first, then your full X-Ray analysis after you upload discovery documents.",
    showUpload: true,
    noIntakeAction:
      "Complete your case details to start receiving your included reports while we prepare for your discovery analysis.",
    intakeUrl: "/intake?tier=x-ray",
  },
  "war-room": {
    name: TIER_CORE["war-room"].name,
    delivery: TIER_CORE["war-room"].delivery,
    action:
      "Your package includes Case Decoder + Intelligence Brief delivered first, then your full War Room intelligence operation after discovery upload. Expect your first update within 7 days of upload.",
    showUpload: true,
    noIntakeAction:
      "Complete your case details to start receiving your included reports.",
    intakeUrl: "/intake?tier=war-room",
  },
  "situation-room": {
    name: TIER_CORE["situation-room"].name,
    delivery: TIER_CORE["situation-room"].delivery,
    action:
      "Your package includes all lower-tier reports delivered progressively. Upload your discovery documents to begin the full Situation Room operation. We'll contact you within 24 hours. Note: The Situation Room builds on War Room deliverables. If you haven't completed the War Room tier, our team will reach out to coordinate your engagement.",
    showUpload: true,
    noIntakeAction:
      "Complete your case details to start receiving your included reports.",
    intakeUrl: "/intake?tier=situation-room",
  },
  "extra-witness": {
    name: TIER_CORE["extra-witness"].name,
    delivery: TIER_CORE["extra-witness"].delivery,
    action:
      "Your extra witness analysis will be included in your next scheduled case update.",
    showUpload: false,
  },
  "witness-pack": {
    name: TIER_CORE["witness-pack"].name,
    delivery: TIER_CORE["witness-pack"].delivery,
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
  const [priorityDelivery, setPriorityDelivery] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [emergencyDownloadUrl, setEmergencyDownloadUrl] = useState<string | null>(null);

  // Verify the Stripe checkout session server-side via /api/checkout/verify.
  // This confirms the payment actually completed (prevents URL spoofing).
  // Also extracts the customer email and download URL(s) (for digital products).
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
        if (data.priorityDelivery) setPriorityDelivery(true);
        if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
        if (data.emergencyDownloadUrl) setEmergencyDownloadUrl(data.emergencyDownloadUrl);
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
      try { localStorage.setItem(key, String(end)); } catch { /* Safari private browsing */ }
    } else {
      // Fallback to localStorage cache while waiting for verify API response
      let cached: string | null = null;
      try { cached = localStorage.getItem(key); } catch { /* Safari private browsing */ }
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
            <p className="mt-3 text-sm text-zinc-400">
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
      <FadeInUp>
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl text-amber-400" aria-label="Success">
          &#10003;
        </div>

        <h1 className="text-2xl font-bold text-white">
          Your Analysis Is Being Built
        </h1>
        <p className="mt-3 text-sm text-zinc-300">
          You&apos;re one of the defendants who prepares instead of waits. That changes how your next attorney meeting goes.
        </p>

        {info ? (
          <>
            <p className="mt-3 text-lg text-amber-400">{info.name}</p>

            {/* DIGITAL PRODUCT — show download buttons if URLs available, else email fallback */}
            {info.isDigitalProduct ? (
              <div className="mt-6">
                {downloadUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
                      <p className="text-sm font-semibold text-red-400">Start Here — Emergency Playbook</p>
                      <p className="mt-1 text-xs text-zinc-400">Your First 72 Hours checklist, 5 Priority Questions, and what to do right now.</p>
                      <a
                        href={emergencyDownloadUrl || downloadUrl}
                        className="mt-3 inline-block rounded-lg bg-red-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-400"
                      >
                        Download Emergency Playbook
                      </a>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                      <p className="text-sm font-semibold text-amber-400">Full Defense Playbook</p>
                      <p className="mt-1 text-xs text-zinc-400">Complete reference — case stage roadmap, red flag checklist, scorecard, all 26 questions.</p>
                      <a
                        href={downloadUrl}
                        className="mt-3 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                      >
                        Download Full Playbook
                      </a>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Download links also sent to {customerEmail}. Links expire in 72 hours.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                    <p className="text-zinc-400">
                      Your playbook download link has been sent to <span className="text-zinc-300">{customerEmail}</span>
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Check your inbox — if you don&apos;t see it in 5 minutes, check spam.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="mt-4 text-zinc-400">{info.action}</p>
                {priorityDelivery && tier && TIER_CORE[tier as keyof typeof TIER_CORE]?.priorityDelivery ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
                    <p className="text-sm font-semibold text-amber-400">
                      Priority Delivery: {TIER_CORE[tier as keyof typeof TIER_CORE].priorityDelivery}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-400">
                    Delivery: {info.delivery}
                  </p>
                )}
              </>
            )}

            {/* INTAKE CTA — Case Decoder customers may not have submitted case  */}
            {/* details yet (intake is separate from checkout). Shows CTA to    */}
            {/* /intake?tier=case-decoder so we can start generating the report.*/}
            {info.noIntakeAction && info.intakeUrl && (
              <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
                <p className="text-sm font-semibold text-amber-400">
                  One step left — tell us about your case
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {info.noIntakeAction}
                </p>
                <Link
                  href={customerEmail ? `${info.intakeUrl}&email=${encodeURIComponent(customerEmail)}` : info.intakeUrl}
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Tell Us About Your Case &rarr;
                </Link>
              </div>
            )}

            {info.showUpload && (
              <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
                <p className="text-sm font-semibold text-amber-400">
                  When you&apos;re ready, upload your discovery documents:
                </p>
                <Link
                  href={customerEmail ? `/upload?email=${encodeURIComponent(customerEmail)}` : "/upload"}
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Upload Discovery Documents &rarr;
                </Link>
                <p className="mt-3 text-xs text-zinc-400">
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
            {timeLeft && timeLeft !== "Expired" && (tier === "dui-first-offense" || tier === "drug-possession" || tier === "probation-violation" || tier === "white-collar" || tier === "sex-offense" || tier === "federal-criminal" || tier === "drug-trafficking" || tier === "self-defense") && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — <span className="animate-pulse">{timeLeft}</span> remaining
                </p>
                <p className="text-sm font-semibold text-amber-400">
                  Get Case-Specific Questions — Case Decoder
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  The Case Decoder is {TIER_CORE["case-decoder"].priceDisplay} — your {TIER_CORE[tier as keyof typeof TIER_CORE]?.priceDisplay ?? "$97"} playbook purchase is fully credited, so you pay just {upgradeCostBetween(tier as TierSlug, "case-decoder")}. Every dollar moves upward. The Playbook gives you general questions — the Case Decoder builds 15 questions from YOUR charges, YOUR state, YOUR stage.
                </p>
                {/* Charge-type-specific loss-aversion copy (Kahneman/Cialdini/Suby) */}
                <p className="mt-2 text-sm text-zinc-300">
                  {tier === "dui-first-offense"
                    ? "DUI cases have time-critical evidence windows — breathalyzer calibration logs and dash cam footage can be deleted at 30 or 90 days. The Case Decoder identifies exactly which suppression questions to ask before those windows close."
                    : tier === "drug-possession" || tier === "drug-trafficking"
                    ? "Drug cases often hinge on search legality and chain-of-custody gaps your attorney may not have checked. The Case Decoder maps the specific suppression opportunities in your case before motion deadlines pass."
                    : tier === "federal-criminal"
                    ? "Federal cases move on a different timeline — grand jury strategy, cooperation pressure, and sentencing guidelines create layers that general questions can't reach. The Case Decoder breaks down the federal-specific questions that change outcomes."
                    : tier === "white-collar"
                    ? "White collar cases are document-heavy — forensic accounting gaps, transaction timelines, and asset protection questions require charge-specific analysis. The Case Decoder identifies the financial evidence questions worth asking in your attorney meeting."
                    : "The Playbook gives you the general framework. The Case Decoder applies it to YOUR specific charges, YOUR jurisdiction, and YOUR attorney's track record."}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Adds: personalized charge breakdown, ready-to-send email templates, phone scripts, 7-day action plan, attorney meeting prep.
                </p>
                <Link
                  href="/checkout?tier=case-decoder"
                  className="mt-4 inline-block rounded-lg border border-amber-500/50 px-6 py-2 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/10"
                >
                  Upgrade for {upgradeCostBetween(tier as TierSlug, "case-decoder")} (your {TIER_CORE[tier as keyof typeof TIER_CORE]?.priceDisplay ?? "$97"} credited) &rarr;
                </Link>
              </div>
            )}
            {/* CD BUYER OTO — Tier-jump capable. Shows both IB and X-Ray.     */}
            {/* Resequenced per Suby: timer > CTA/price > urgency > features. */}
            {/* X-Ray as primary, IB as budget alternative.                   */}
            {timeLeft && timeLeft !== "Expired" && tier === "case-decoder" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  Upgrade offer — <span className="animate-pulse">{timeLeft}</span> remaining
                </p>

                {/* Credit headline — relief first (Covello) */}
                <p className="text-lg font-bold text-white">
                  You have already paid {TIER_CORE["case-decoder"].priceDisplay}.
                </p>

                {/* Primary CTA: X-Ray (before urgency copy per Suby) */}
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-zinc-900/50 p-4">
                  <p className="text-sm font-semibold text-amber-400">
                    The X-Ray — {upgradeCostBetween("case-decoder", "x-ray")} after credit
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Your judge, your prosecutor, your case documents — 35-50 specific questions. Delivered in 10 business days.
                  </p>
                  <Link
                    href="/checkout?tier=x-ray"
                    className="mt-3 inline-block rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                  >
                    Get The X-Ray — {upgradeCostBetween("case-decoder", "x-ray")} &rarr;
                  </Link>
                </div>

                {/* Budget alternative: Intelligence Brief */}
                <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                  <p className="text-sm font-semibold text-zinc-300">
                    Intelligence Brief — {upgradeCostBetween("case-decoder", "intelligence-brief")} after credit
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Jurisdiction intelligence, judge patterns, prosecution tendencies. Delivered in 72 hours.
                  </p>
                  <Link
                    href="/checkout?tier=intelligence-brief"
                    className="mt-3 inline-block rounded-lg border border-zinc-500 px-6 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-400"
                  >
                    Get Intelligence Brief — {upgradeCostBetween("case-decoder", "intelligence-brief")} &rarr;
                  </Link>
                </div>

                {/* Urgency copy (below CTA per Suby "relief before threat") */}
                <p className="mt-4 text-sm text-zinc-300">
                  Your Case Decoder gives you the right questions. The X-Ray shows whether the answers match what is actually in your case documents.
                </p>

                {/* Features below fold */}
                <p className="mt-2 text-xs text-zinc-400">
                  X-Ray adds: full discovery analysis, evidence chain audit, prosecution weakness analysis, 35-50 page-referenced questions, Attorney Delivery Package.
                </p>
              </div>
            )}
            {/* IB BUYER OTO — X-Ray. Credit-as-hero, Suby sequencing, Covello CCO. */}
            {timeLeft && timeLeft !== "Expired" && tier === "intelligence-brief" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-1 text-sm text-zinc-400">
                  Your Intelligence Brief is complete. Here&apos;s what it can&apos;t do on its own.
                </p>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  One-time upgrade — <span className="animate-pulse">{timeLeft}</span> remaining
                </p>

                <p className="text-lg font-bold text-white">
                  You have already paid $997.
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  The X-Ray costs {upgradeCostBetween("intelligence-brief", "x-ray")} more. That&apos;s it.
                </p>

                <Link
                  href="/checkout?tier=x-ray"
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Get The X-Ray — {upgradeCostBetween("intelligence-brief", "x-ray")} &rarr;
                </Link>

                <p className="mt-4 text-sm text-zinc-300">
                  Your Intelligence Brief identifies patterns in how cases like yours are prosecuted. The X-Ray tests whether those patterns hold in your actual case documents — every police report, lab result, and witness statement, page by page.
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  Discovery arrives on a timeline outside your control. When it does, the questions change from &ldquo;what typically happens&rdquo; to &ldquo;what is actually in here.&rdquo; One option is to have that analysis ready before your next attorney meeting.
                </p>

                <p className="mt-3 text-xs text-zinc-400">
                  Adds: full discovery document index, chronological reconstruction, contradiction report, constitutional issues analysis, 35-50 page-referenced questions, Judge Intelligence Profile, Prosecutor Research Profile.
                </p>
              </div>
            )}
            {/* X-RAY BUYER OTO — War Room with single CTA + gray secondary. Covello CCO. */}
            {timeLeft && timeLeft !== "Expired" && tier === "x-ray" && (
              <div className="mt-8 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-6">
                <p className="mb-1 text-sm text-zinc-400">
                  Your X-Ray analysis is complete and documented.
                </p>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                  One-time upgrade — <span className="animate-pulse">{timeLeft}</span> remaining
                </p>

                <p className="text-lg font-bold text-white">
                  You have already paid $2,497.
                </p>

                <p className="mt-2 text-sm text-zinc-300">
                  Discovery findings have a shelf life. Witnesses&apos; memories fade. Motion windows close. The X-Ray maps what&apos;s there — the War Room tracks what changes and builds the case for your attorney while there is still time to act on it.
                </p>

                <div className="mt-4 rounded-lg border border-amber-500/30 bg-zinc-900/50 p-4">
                  <p className="text-sm font-semibold text-amber-400">
                    The War Room — {upgradeCostBetween("x-ray", "war-room")} after credit
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    25-28 days of active intelligence work. Witness dossiers, motion landscape, case law package, weekly updates through resolution.
                  </p>
                  <Link
                    href="/checkout?tier=war-room"
                    className="mt-3 inline-block rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                  >
                    Get The War Room — {upgradeCostBetween("x-ray", "war-room")} &rarr;
                  </Link>
                </div>

                <p className="mt-3 text-sm text-zinc-400">
                  War Room + Priority Delivery is also available at $3,497 after credit for defendants with an upcoming court date.{" "}
                  <Link href="/checkout?tier=war-room&priority=1" className="text-zinc-400 underline decoration-zinc-600 hover:text-zinc-300">
                    Learn more
                  </Link>
                </p>

                <p className="mt-3 text-xs text-zinc-400">
                  War Room adds: witness analysis (up to 8), judge & prosecution dossiers, motion timing analysis, wave strategy overview, case law reference package, evidence chain audit, weekly intelligence updates, attorney delivery package.
                </p>
              </div>
            )}
            {/* WAR ROOM BUYER — Value reinforcement, NO upgrade CTA. */}
            {tier === "war-room" && (
              <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                <p className="text-sm font-semibold text-amber-400">
                  Your War Room engagement begins now.
                </p>
                <p className="mt-3 text-sm text-zinc-300">
                  Here is what happens next, in order:
                </p>
                <ol className="mt-3 space-y-2 text-sm text-zinc-400 text-left list-none">
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-semibold shrink-0">1.</span>
                    <span>Upload your discovery documents when you receive them. Instructions were sent to your email.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-semibold shrink-0">2.</span>
                    <span>Your included Case Decoder and Intelligence Brief reports are delivered first, within 48-72 hours of intake submission.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-semibold shrink-0">3.</span>
                    <span>After discovery upload, the full War Room operation begins — witness dossiers, motion landscape, case law package, and your attorney delivery package.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-semibold shrink-0">4.</span>
                    <span>Weekly intelligence updates begin after initial delivery and continue through resolution.</span>
                  </li>
                </ol>
                <p className="mt-4 text-sm text-zinc-400">
                  Questions about your engagement? Email us — responses within 4 hours.
                </p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="mt-2 inline-block text-sm text-amber-400 underline decoration-amber-400/50"
                >
                  {CONTACT_EMAIL}
                </a>
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

        {/* REFERRAL CTA — Growth loop: share with someone facing charges */}
        <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-sm font-semibold text-amber-400">Know someone facing charges?</p>
          <p className="mt-1 text-xs text-zinc-400">Forward them this link. Most defendants don&apos;t know they can hold their attorney accountable.</p>
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            <a
              href={`sms:?body=${encodeURIComponent(`This helped me with my case — they research your charges and give you the exact questions to ask your attorney: ${SITE_URL}`)}`}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-xs text-white transition-colors hover:bg-zinc-700"
            >
              Text a Friend
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`This helped me with my case — they research your charges and give you the exact questions to ask your attorney: ${SITE_URL}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-xs text-white transition-colors hover:bg-zinc-700"
            >
              WhatsApp
            </a>
          </div>
        </div>

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

        <div className="mt-8">
          <TrustBadges variant="checkout" />
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
      </FadeInUp>
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
