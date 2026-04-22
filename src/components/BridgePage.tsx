"use client";
/**
 * Bridge page component, trust transfer from partner to service.
 *
 * Short interstitial following Russell Brunson's bridge page framework.
 * Warm traffic from trusted source = short bridge, one CTA.
 * Per Cialdini's Unity Principle, partner name + company carry through.
 *
 * Task 16 (bondsman-modes v2): mode-aware copy. When the partner has
 * `checkInEnabled=false` (referral-only mode), we surface a line about
 * court-date reminders + hearing walkthrough so the client understands
 * what they're getting from us (not from the bondsman). When
 * `checkInEnabled=true` (default, bondsman is running check-ins), we
 * omit that line to avoid overlap with the bondsman's communication.
 */
import Link from "next/link";
import { TrustBadges } from "@/components/TrustBadges";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TIER_CORE } from "@/lib/tiers";

interface BridgePageProps {
  partnerName: string;
  company: string | null;
  city?: string | null;
  promoCode: string;
  checkInEnabled?: boolean;
}

export function BridgePage({ partnerName, company, city, promoCode, checkInEnabled = true }: BridgePageProps) {
  let displayName = partnerName;
  if (company && city) displayName = `${partnerName} from ${company}, ${city}`;
  else if (company) displayName = `${partnerName} from ${company}`;
  // Clamp length to guard against pathological partner names blowing the hero.
  displayName = displayName.slice(0, 80);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <FadeInUp delay={0}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400 mb-3">
              Pre-court research briefing
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4 leading-tight">
              What happens next in your case —
              <br />
              from <span className="text-amber-400 break-words">{displayName}</span>.
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <div className="text-left text-zinc-200 space-y-4 mb-6">
              <p className="text-base leading-relaxed">
                Your first court date decides your leverage. The prosecutor walks
                in with a file built from your arrest report, your priors, and
                prior cases with your exact charge. You walk in with whatever
                your attorney had time to skim between other clients.
              </p>
              <p className="text-base leading-relaxed">
                <span className="font-bold text-amber-400">Case Decoder — {TIER_CORE["case-decoder"].priceDisplay}.</span>{" "}
                We read your charge, your jurisdiction, and your judge&apos;s recent
                rulings. You get 15 charge-specific questions to hand your
                attorney before your first hearing — the ones the prosecutor
                is already expecting them to miss.
              </p>
              <p className="text-base leading-relaxed font-semibold text-white">
                If those 15 questions don&apos;t surface something your attorney
                hasn&apos;t considered, email us for a full refund. No forms, no
                argument.
              </p>
            </div>
            {!checkInEnabled && (
              <p className="text-sm text-zinc-300 mb-6">
                You&apos;ll also get court-date reminders and a walkthrough of what to expect at your hearing, starting today.
              </p>
            )}
          </FadeInUp>

          <FadeInUp delay={0.15}>
            <p className="text-amber-400 font-bold text-lg mb-2 break-words">
              {displayName} put you on the partner-referral list.
            </p>
            <p className="text-zinc-400 text-sm mb-2">
              That means 10% is already taken off before you see any price.
              Nothing to enter. Nothing to remember.
            </p>
            <p className="text-zinc-400 text-xs mb-6">
              15,386 judges profiled. 33,000+ cases analyzed.
              Your judge is probably in there.
            </p>
            <TrustBadges variant="compact" />
          </FadeInUp>

          <FadeInUp delay={0.2}>
            <div className="mt-8">
              <Link
                href={`/r/${promoCode}/quiz`}
                className="inline-block px-8 py-4 min-h-[44px] bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all"
              >
                Know what they know &rarr;
              </Link>
            </div>
            {/* Secondary — the free reminders path shouldn't be gated on quiz
                completion. Bondsman may have promised "free court-date
                reminders" to the defendant as the hook; this link lets them
                get there without quiz friction. */}
            <div className="mt-4">
              <Link
                href={`/r/${promoCode}/reminders`}
                className="inline-flex min-h-[44px] items-center text-sm text-zinc-300 underline decoration-zinc-500 hover:text-white hover:decoration-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Just want free court-date reminders? Skip the quiz &rarr;
              </Link>
            </div>
            <p className="text-zinc-400 text-sm mt-8">
              We give you questions. We don&apos;t give you advice. Your attorney does that.
            </p>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
