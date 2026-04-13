/**
 * /prep/[token] — Personalized court prep page.
 *
 * Shows court date countdown, what to expect, what to bring,
 * and a product recommendation. Refreshes partner ref cookie
 * on every visit for attribution.
 *
 * Free content = court logistics. Paid = case-specific intelligence.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getPrepContent,
  CHARGE_DISPLAY_NAMES,
  PREP_PAGE_EXPIRY_DAYS,
} from "@/lib/court-reminders";
import { TIER_CORE } from "@/lib/tiers";
import { calculatePartnerDiscount, REFERRAL_COOKIE_MAX_AGE } from "@/lib/referral";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("court_reminders")
    .select("county_state, charge_type, court_date")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return { title: "Court Prep | ImNotAnAttorney" };
  }

  const chargeName = CHARGE_DISPLAY_NAMES[data.charge_type] || "Criminal Charges";
  return {
    title: `Court Prep — ${data.county_state} | ImNotAnAttorney`,
    description: `Your court date is ${data.court_date}. Here's what to expect and how to prepare.`,
    openGraph: {
      title: `Court Prep — ${chargeName}`,
      description: `Your court date is ${data.court_date}. What to expect at your hearing.`,
    },
  };
}

export default async function PrepPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!reminder || reminder.status === "unsubscribed") {
    notFound();
  }

  // Check expiration (30 days past court date)
  const courtDate = new Date(reminder.court_date + "T00:00:00");
  const expiryDate = new Date(courtDate);
  expiryDate.setDate(expiryDate.getDate() + PREP_PAGE_EXPIRY_DAYS);
  const isExpired = new Date() > expiryDate;

  if (isExpired) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">This prep page has expired</h1>
          <p className="text-zinc-400 mb-8">Your court date has passed. If your case is ongoing, explore our services.</p>
          <Link href="/services" className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors">
            Explore Services
          </Link>
        </div>
      </div>
    );
  }

  // Note: ref cookie refresh for /prep/[token] is not handled by middleware
  // (only /r/[code] routes set cookies). Attribution works because the original
  // /r/[code] visit already set the 90-day cookie, and checkout reads it.

  // Calculate countdown
  const now = new Date();
  const diffMs = courtDate.getTime() - now.getTime();
  const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const courtPassed = daysUntil < 0;

  const content = getPrepContent(reminder.charge_type);
  const chargeName = CHARGE_DISPLAY_NAMES[reminder.charge_type] || "Criminal Charges";

  // Product recommendation
  const tier = reminder.recommended_tier ? TIER_CORE[reminder.recommended_tier as keyof typeof TIER_CORE] : null;
  const discount = tier ? calculatePartnerDiscount(tier.price) : null;

  // Checkout URL with reminder token for conversion tracking
  const checkoutUrl = tier
    ? `/checkout?tier=${reminder.recommended_tier}${reminder.partner_promo_code ? `&ref=${reminder.partner_promo_code}` : ""}&reminder_token=${token}`
    : "/services";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Section A: Countdown */}
        <section className="text-center mb-12">
          {courtPassed ? (
            <>
              <p className="text-zinc-400 text-lg mb-2">Your court date was</p>
              <p className="text-2xl font-bold">{courtDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              <p className="text-zinc-400 mt-2">If your case is ongoing, talk to your attorney about next steps.</p>
            </>
          ) : (
            <>
              <p className="text-zinc-400 text-lg mb-2">Your court date is in</p>
              <p className="text-5xl font-bold text-amber-400 mb-2">{daysUntil} day{daysUntil !== 1 ? "s" : ""}</p>
              <p className="text-xl text-zinc-300">
                {courtDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                {" — "}{reminder.county_state}
              </p>
            </>
          )}
        </section>

        {/* Section B: What to Expect */}
        <section className="mb-10">
          <h2 className="font-display text-2xl font-bold text-amber-400 mb-4">
            What to Expect at a {chargeName} Hearing
          </h2>
          <p className="text-zinc-300 leading-relaxed">{content.whatToExpect}</p>
        </section>

        {/* What to Bring */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold mb-3">What to Bring</h2>
          <ul className="space-y-2">
            {content.whatToBring.map((item, i) => (
              <li key={i} className="text-zinc-300 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* What to Wear */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold mb-3">What to Wear</h2>
          <p className="text-zinc-300 leading-relaxed">{content.whatToWear}</p>
        </section>

        {/* Arrival Tips */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold mb-3">Day-Of Tips</h2>
          <p className="text-zinc-300 leading-relaxed">{content.arrivalTips}</p>
        </section>

        {/* Section D: Product Recommendation */}
        {tier && discount && !courtPassed && (
          <section className="mt-12 bg-zinc-900 rounded-xl border border-zinc-700 p-6">
            <h2 className="font-display text-xl font-bold text-amber-400 mb-3">
              Want questions specific to YOUR case?
            </h2>
            <p className="text-zinc-300 mb-4">{content.paidProductTeaser}</p>

            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-zinc-500 line-through text-lg">
                ${(discount.original / 100).toFixed(0)}
              </span>
              <span className="text-3xl font-bold text-white">
                ${(discount.discounted / 100).toFixed(2)}
              </span>
              <span className="text-amber-400 text-sm font-medium">
                Save ${(discount.savings / 100).toFixed(0)}
              </span>
            </div>

            <p className="text-zinc-400 text-sm mb-6">
              {tier.name} — {tier.delivery}
            </p>

            <Link
              href={checkoutUrl}
              className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all"
            >
              Get Questions Specific to Your Case
            </Link>
          </section>
        )}

        {/* Section E: Footer */}
        <footer className="mt-12 pt-8 border-t border-zinc-800 text-center">
          <p className="text-zinc-500 text-sm">
            ImNotAnAttorney provides legal information — not legal advice.
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            Reminders will be sent to {reminder.email} at 14, 7, 3, and 1 day(s) before your court date.
          </p>
          <a
            href={`/api/court-reminders/unsubscribe?token=${token}`}
            className="text-zinc-600 text-xs hover:text-zinc-400 mt-1 inline-block"
          >
            Unsubscribe from reminders
          </a>
        </footer>
      </div>
    </div>
  );
}
