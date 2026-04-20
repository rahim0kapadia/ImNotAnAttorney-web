/**
 * /r/[code]/[product] -- Product detail page for a partner deep link.
 *
 * Converts the old redirect-to-checkout into a real A4 product page: headline,
 * value anchor, deliverables, proof strip, partner benefit, price + guarantee,
 * CTA, UPL footer. Partner credit persists in the header.
 *
 * Telemetry (via after(), non-blocking):
 *   - product_page_view   -- valid tier + approved partner
 *   - deep_link_unknown_product -- bad slug caught pre-redirect
 *
 * NOTE: partner_events.event_type has a CHECK constraint; the two new event
 * types above need to be added to the constraint before these inserts land.
 * Until then the after() block is try/catch-wrapped so a CHECK violation is
 * logged but does not break the page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerByCode } from "@/lib/partner-by-code";
import { sanitizeSubId } from "@/lib/referral";
import { truncateName } from "@/lib/truncate-name";
import { TIER_CORE, type TierSlug } from "@/lib/tiers";
import { resolveReferralProduct } from "@/lib/referral-product-map";

// Tier-specific headlines. UPL-safe: information framing, no outcome claims.
const HEADLINES: Partial<Record<TierSlug, string>> = {
  "case-decoder":
    "Your charges, decoded. 10-15 questions your attorney can't easily answer.",
  "intelligence-brief":
    "A briefing on YOUR judge, YOUR prosecutor, YOUR case facts.",
  "x-ray":
    "Every discovery document cross-referenced. 35-50 questions built from your record.",
  "war-room":
    "Ongoing intelligence operation through your case.",
  "situation-room":
    "Full-team defense coordination across your entire matter.",
};

// Short metadata pitches -- UPL-safe, quality-framed, no speed hooks.
const META_DESCRIPTIONS: Partial<Record<TierSlug, string>> = {
  "case-decoder":
    "Your charges decoded, plus 10-15 questions built for your attorney. Legal information, not legal advice.",
  "intelligence-brief":
    "A briefing on your judge, your prosecutor, and your charges. Plus 15-25 questions to force the right conversations.",
  "x-ray":
    "Every discovery document cross-referenced. 35-50 questions built from the facts of your record.",
  "war-room":
    "Ongoing intelligence operation: sentencing outlier flags, judge x prosecutor pairing, weekly updates through your case.",
  "situation-room":
    "Full-team defense coordination, co-defendant divergence, plea discount modeling, priority turnaround across every stage.",
};

// Tier-specific deliverables. QUALITY-framed, no speed/time language.
// TIER_CORE has no structured deliverables[] field, so these are composed
// here from the eval team's definitions in system/DELIVERABLES-BY-TIER.md
// and the copy already shipped in the ReferralQuiz recommendation block.
const DELIVERABLES: Partial<Record<TierSlug, readonly string[]>> = {
  "case-decoder": [
    "A plain-language decode of every charge on your record",
    "The prosecution's typical strategy against charges like yours",
    "10-15 questions built from your charge set that your attorney can't easily answer",
    "A documented methodology -- not opinion, a forensic checklist applied to your case facts",
    "Delivered to your inbox, yours to read before your next meeting",
  ],
  "intelligence-brief": [
    "Full Case Decoder included -- charge decode + first question set",
    "A briefing on your specific judge: sentencing patterns, bench tendencies, what's in the record",
    "A briefing on your prosecutor: charging patterns, plea posture, who they are",
    "Jurisdiction-level intelligence for your venue -- not a generic overview",
    "15-25 questions built from judge + prosecutor + charge facts",
  ],
  "x-ray": [
    "Case Decoder + Intelligence Brief included",
    "Every discovery document cross-referenced against your charges and the typical prosecution playbook",
    "Discovery Strength Rating -- where the prosecution's case is thin, documented",
    "Prosecution Case Weakness Analysis -- inconsistencies, procedural gaps, documented",
    "35-50 questions pulled from the actual facts of your discovery",
  ],
  "war-room": [
    "X-Ray + all lower tiers included",
    "Ongoing intelligence operation -- new developments analyzed as they arrive",
    "Judge x prosecutor pairing matrix for your case",
    "Bench vs jury divergence analysis for your charges in your venue",
    "Similar-case matching and weekly updates through your case",
  ],
  "situation-room": [
    "War Room + all lower tiers included",
    "Full-team defense coordination across every stage of your matter",
    "Co-defendant divergence analysis (where applicable)",
    "Plea discount modeling against comparable historical cases",
    "Priority turnaround on every deliverable, trial intelligence operations on standby",
  ],
};

interface PageProps {
  params: Promise<{ code: string; product: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string; product: string }>;
}): Promise<Metadata> {
  const { code, product } = await params;
  const partner = await getPartnerByCode(code);
  const tierSlug = resolveReferralProduct(product);

  if (!partner || !tierSlug) {
    return {
      title: "ImNotAnAttorney",
      description: "Legal information, not legal advice.",
    };
  }

  const tier = TIER_CORE[tierSlug];
  const referrer = truncateName(partner.company || partner.name);
  const title = `${tier.name} -- via ${referrer}`;
  const description = META_DESCRIPTIONS[tierSlug]
    ?? "Legal information, not legal advice. Questions for your attorney, built from your record.";
  const imageAlt = `${tier.name} via ${referrer} — Defense Intelligence from ImNotAnAttorney`;

  return {
    title: `${title} | ImNotAnAttorney`,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [{ alt: imageAlt }],
    },
  };
}

export default async function DeepLinkProductPage({ params, searchParams }: PageProps) {
  const { code, product } = await params;
  const { sub } = await searchParams;

  const rawSlug = product.toLowerCase();
  const mappedSlug = resolveReferralProduct(rawSlug);
  const sanitizedSub = sub ? sanitizeSubId(sub) : null;

  // Unknown product slug: log the attempt, then fall back to partner bridge.
  if (!mappedSlug) {
    const partnerForLog = await getPartnerByCode(code);
    if (partnerForLog) {
      after(async () => {
        try {
          const sb = createAdminClient();
          await sb.from("partner_events").insert({
            partner_id: partnerForLog.id,
            event_type: "deep_link_unknown_product",
            metadata: { attempted_slug: rawSlug, sub: sanitizedSub },
          });
        } catch (e) {
          console.warn("[PartnerEvents] deep_link_unknown_product insert failed:", e);
        }
      });
    }
    redirect(`/r/${code}`);
  }

  const tierSlug: TierSlug = mappedSlug;

  // Look up partner. If the code isn't tied to an approved partner, fall back
  // to checkout without partner credit (preserves the prior behavior).
  const partner = await getPartnerByCode(code);
  if (!partner) {
    redirect(`/checkout?tier=${tierSlug}`);
  }

  const partnerName = partner.name;
  const partnerDisplayName = truncateName(partner.company || partner.name);
  const promoCode = partner.promo_code!;

  const tier = TIER_CORE[tierSlug];
  const headline = HEADLINES[tierSlug] ?? tier.name;
  const deliverables = DELIVERABLES[tierSlug] ?? [
    `Full ${tier.name} delivered to your inbox`,
    "A documented methodology applied to your case facts",
    "Questions built for your attorney, not generic legal information",
  ];
  const originalPrice = tier.price / 100;
  const discountedPrice = Math.round(originalPrice * 0.9 * 100) / 100;

  // Fire-and-forget product_page_view telemetry. Wrapped so a CHECK
  // constraint violation doesn't break the page render.
  after(async () => {
    try {
      const sb = createAdminClient();
      await sb.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "product_page_view",
        metadata: { product: tierSlug, sub: sanitizedSub },
      });
    } catch (e) {
      console.warn("[PartnerEvents] product_page_view insert failed:", e);
    }
  });

  // Build checkout URL. sub-id is belt-and-suspenders: middleware already
  // wrote ref_sub cookie for this request, but pass-through survives if
  // cookies fail.
  const checkoutParams = new URLSearchParams({ tier: tierSlug, ref: promoCode });
  if (sanitizedSub) checkoutParams.set("sub", sanitizedSub);
  const checkoutHref = `/checkout?${checkoutParams.toString()}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-16">
        {/* Top header bar: INAA left, partner credit right */}
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-8">
          <span>ImNotAnAttorney</span>
          <span>
            Introduced by{" "}
            <span className="text-zinc-300">{partnerDisplayName}</span>
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
          {headline}
        </h1>

        {/* Hormozi value anchor -- same on every tier */}
        <p className="text-zinc-300 text-lg leading-relaxed mb-10">
          The gap between a prepared defense and an under-prepared one at
          sentencing is commonly measured in years of custody, not months.
          Against that, this is rounding error.
        </p>

        {/* What you get */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-amber-400 mb-4">
            What you get
          </h2>
          <ul className="text-zinc-300 text-base space-y-3 border-l-2 border-zinc-700 pl-4">
            {deliverables.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </section>

        {/* Proof strip -- matches ReferralQuiz */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-6">
          <span>15,386 judges indexed</span>
          <span>&bull;</span>
          <span>33,000+ opinions classified</span>
          <span>&bull;</span>
          <span>Every citation verified to source</span>
        </div>

        {/* Partner benefit block */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 mb-8 text-center">
          <p className="text-zinc-300 text-sm">
            <span className="text-white font-semibold">
              {partnerDisplayName}
            </span>{" "}
            clients get: full tier + free court-date reminders through your case.
          </p>
        </div>

        {/* Price card + guarantee -- matches quiz pattern */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-500 p-6 mb-6">
          <h3 className="text-xl font-bold text-amber-400 mb-2">
            {tier.name}
          </h3>

          <div className="flex items-baseline gap-3 mb-4 flex-wrap">
            <span className="text-zinc-400 line-through text-lg">
              ${originalPrice}
            </span>
            <span className="text-3xl font-bold text-white">
              ${discountedPrice.toFixed(2)}
            </span>
            <span className="text-amber-400 text-sm font-medium">
              via {partnerDisplayName}
            </span>
          </div>

          <ul className="text-zinc-300 text-sm space-y-2 mb-6 border-l-2 border-zinc-700 pl-4">
            <li>Full {tier.name} delivered to your inbox</li>
            <li>Free court-date reminders through your case (partner benefit)</li>
            <li>
              If the first deliverable doesn&apos;t give you questions your
              attorney can&apos;t easily answer, refund &mdash; no argument.
            </li>
          </ul>

          <Link
            href={checkoutHref}
            className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 transition-colors"
          >
            Start My {tier.name}
          </Link>

          <p className="text-center text-zinc-500 text-xs mt-4">
            Code <span className="font-mono text-amber-400">{promoCode}</span>{" "}
            applied automatically at checkout.
          </p>
        </div>

        {/* Not-sure nudge toward Case Decoder (skip if already viewing CD) */}
        {tierSlug !== "case-decoder" && (
          <p className="text-center text-zinc-400 text-sm mb-10">
            Not sure yet? Start with the{" "}
            <Link
              href={`/r/${promoCode}/case-decoder${sanitizedSub ? `?sub=${sanitizedSub}` : ""}`}
              className="text-zinc-300 underline hover:text-amber-400"
            >
              Case Decoder
            </Link>{" "}
            for $177 &mdash; refund if it doesn&apos;t help.
          </p>
        )}

        {/* UPL footer */}
        <p className="text-center text-zinc-500 text-xs mt-10 leading-relaxed">
          ImNotAnAttorney provides legal information, not legal advice.
          Deliverables are information and questions for your attorney &mdash;
          not case predictions, legal strategy, or representation.
        </p>

        {/* Hidden for screen-readers only: preserves partner name for bots
            in case the truncated header fails to convey context. */}
        <span className="sr-only">Referred by {partnerName}.</span>
      </div>
    </main>
  );
}
