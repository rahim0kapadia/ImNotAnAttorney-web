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
    "Your charges, decoded. 10-15 questions built from your charge set.",
  "intelligence-brief":
    "A briefing on your judge, your prosecutor, and your file.",
  "x-ray":
    "Every discovery document cross-referenced. 35-50 questions built from your record.",
  "war-room":
    "Ongoing intelligence operation through your case.",
  "situation-room":
    "Full-team defense coordination across your entire matter.",
};

// Category-setter line placed between headline and stakes. Tells the reader
// in 3 seconds what this IS (per Dunford 5C positioning — category frame
// drives relevance + value layers). "Not advice. Not AI guesses." anaphora
// pre-answers the two loudest silent objections a crisis buyer has.
const SUBHEADLINES: Partial<Record<TierSlug, string>> = {
  "case-decoder":
    "A charge breakdown you hand your attorney — plain-language decode plus the questions we find they haven't been asked. Not advice. Not AI guesses. A documented checklist.",
  "intelligence-brief":
    "A prep file you hand your attorney before the next meeting — built from your judge, your prosecutor, and the facts in your file. Not advice. Not AI guesses. A documented briefing.",
  "x-ray":
    "A discovery review you hand your attorney — every document cross-referenced, every weak point flagged. Not advice. Not AI guesses. A forensic record.",
  "war-room":
    "An ongoing intelligence file that moves with your case — new developments analyzed as they arrive. Not advice. Not AI guesses. A working operation.",
  "situation-room":
    "Full-stakes coordination for the hardest cases — every deliverable priority, every stage covered. Not advice. Not AI guesses. A documented team operation.",
};

// "No attorney yet" reassurance — crisis buyers often haven't been assigned
// a public defender and haven't hired counsel. Without this line they read
// the whole deliverable set as "not for me." UPL-safe: information framing,
// no legal advice, no outcome claim. Positioned below deliverables so it
// answers the silent objection at the moment it surfaces.
// Adversarial-walkthrough skeptical-buyer R1/R2/R4: flagged "every bullet
// assumes YOUR ATTORNEY" as a close-the-tab signal for the 60%+ of criminal
// defendants whose public defender isn't assigned until arraignment.
// Tiers whose value prop includes judge-level intelligence. Coverage-check
// link only renders for these — case-decoder focuses on charge decode and
// does not depend on the 15,386-judge index. Ships as Phase 4 Option A per
// docs/plans/2026-04-22-coverage-lookup.md: link-out to /judge-report-card
// (which already embeds AvailabilityChecker) before committing to an inline
// coverage form on the deep-link page itself.
const TIERS_WITH_JUDGE_COVERAGE: ReadonlySet<TierSlug> = new Set<TierSlug>([
  "intelligence-brief",
  "x-ray",
  "war-room",
  "situation-room",
]);

// Tier-gated proof strip. Default (IB+) anchors on the judge/opinion corpus;
// case-decoder's value prop is charge decode, so its proof anchors on
// statute/charge accuracy instead. AWT Round 1 sibling-surfaces-sweep
// (2026-04-22): Laja broke Value-layer on CD because the judge/opinion
// claim overshot the $177 deliverable.
const DEFAULT_PROOF_ITEMS: readonly string[] = [
  "15,386 judges indexed",
  "33,000+ opinions classified",
  "Every citation verified to source",
];
const TIER_PROOF_ITEMS: Partial<Record<TierSlug, readonly string[]>> = {
  "case-decoder": [
    "Every charge decoded to statute",
    "Prosecution patterns documented",
    "Every citation verified to source",
  ],
};

// Tier-gated stakes paragraph. Default paragraph cites 33,000+ classified
// opinions — correct for judge-intel tiers (IB/X-Ray/WR/SR), wrong for CD
// because CD doesn't deliver judge rulings. AWT R1 fix: CD gets a
// charge-pattern-focused scene that keeps the same competitive alternatives
// (attorney overload / Google / ChatGPT) without promising judge corpus.
const TIER_STAKES: Partial<Record<TierSlug, string>> = {
  "case-decoder":
    "Your attorney is juggling dozens of other files this week. Your prosecutor has already built a playbook for charges like yours. Google pulls the wrong statutes. ChatGPT invents penalties that don't apply. This reads the actual prosecution pattern against your actual charges — in plain language.",
};

const NO_ATTORNEY_YET: Partial<Record<TierSlug, string>> = {
  "case-decoder":
    "No attorney yet? The decode still works — it's the first file your public defender sees at intake, or the one you hand to whoever you hire.",
  "intelligence-brief":
    "No attorney yet? The briefing still works — same packet, whether you hand it to a public defender at intake or to whoever you hire.",
  "x-ray":
    "No attorney yet? The review still works — it's the discovery file ready for your public defender at intake, or whoever you hire.",
  "war-room":
    "No attorney yet? The operation still works — it's an intel file that follows you from public defender to private counsel without losing context.",
  "situation-room":
    "No attorney yet? The coordination still works — the defense file is built to stay useful through whichever counsel you end up with, at every stage.",
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
    "Full Case Decoder included — charge decode + first question set",
    "A briefing on the judge assigned to your case: published sentencing patterns, bench rulings, documented opinions",
    "A briefing on the prosecutor's office: charging patterns and plea-disposition record",
    "Your venue, not the state: local rules, standing orders, and charging-unit patterns",
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
  // OG image URL + alt auto-injected by sibling opengraph-image.tsx via
  // generateImageMetadata. Do not override openGraph.images here.

  return {
    title: `${title} | ImNotAnAttorney`,
    description,
    alternates: { canonical: `/r/${code.toLowerCase()}/${product.toLowerCase()}` },
    openGraph: { title, description, type: "website" as const },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function DeepLinkProductPage({ params, searchParams }: PageProps) {
  const { code, product } = await params;
  const { sub } = await searchParams;

  // resolveReferralProduct lowercases internally.
  const mappedSlug = resolveReferralProduct(product);
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
            metadata: { attempted_slug: product, sub: sanitizedSub },
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
  const subheadline = SUBHEADLINES[tierSlug] ?? null;
  const deliverables = DELIVERABLES[tierSlug] ?? [
    `Full ${tier.name} delivered to your inbox`,
    "A documented methodology applied to your case facts",
    "Questions built for your attorney, not generic legal information",
  ];
  const noAttorneyYet = NO_ATTORNEY_YET[tierSlug] ?? null;
  const proofItems = TIER_PROOF_ITEMS[tierSlug] ?? DEFAULT_PROOF_ITEMS;
  const stakesParagraph = TIER_STAKES[tierSlug] ?? null;
  // Stay in cents until the final display to avoid float drift for larger
  // tiers (e.g. War Room 499700 cents). Display rule: >=$100 renders whole
  // dollars (cents on a $897 crisis product read as haggling per
  // adversarial-walkthrough skeptical-buyer R1+R4); sub-$100 SKUs keep
  // .toFixed(2) so playbook-tier pricing stays honest.
  const formatPrice = (cents: number): string => {
    const dollars = cents / 100;
    return dollars >= 100 ? String(Math.round(dollars)) : dollars.toFixed(2);
  };
  const originalPrice = formatPrice(tier.price);
  const discountedPrice = formatPrice(Math.round(tier.price * 0.9));
  // Case Decoder anchor used in the "Not sure yet?" nudge below. Imported
  // from TIER_CORE per src/lib/PRICING-ARCHITECTURE.md — no hardcoded prices.
  const caseDecoderDiscounted = formatPrice(Math.round(TIER_CORE["case-decoder"].price * 0.9));

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

        {/* Category-setter: what this IS, in 3 seconds. Pre-answers the two
            loudest silent objections ("is this legal advice?" / "is this AI
            slop?") — information-framed, UPL-safe. Adversarial-walkthrough
            2026-04-21: Dunford + Laja + Suby all flagged category ambiguity
            as the weakest layer; this line collapses their fix into one. */}
        {subheadline && (
          <p className="text-zinc-200 text-lg leading-relaxed mb-6 font-medium">
            {subheadline}
          </p>
        )}

        {/* Proof strip — lifted ABOVE stakes/deliverables so specific trust
            anchors (15,386 judges / 33K opinions / every citation verified)
            hit the reader before any claim does. Same walkthrough flagged
            the prior position as hidden behind the cookie banner on mobile. */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-2">
          {proofItems.map((item, idx) => (
            <span key={idx} className="contents">
              {idx > 0 && <span>&bull;</span>}
              <span>{item}</span>
            </span>
          ))}
        </div>

        {/* Coverage-check link. Answers the silent "is MY judge in the 15,386?"
            objection before the buyer commits $897+. Links to the free
            Judge Report Card availability checker (AvailabilityChecker
            component already in prod). Gated to judge-intel tiers only —
            case-decoder value prop doesn't depend on the judge index.
            Phase 4 Option A per docs/plans/2026-04-22-coverage-lookup.md. */}
        {TIERS_WITH_JUDGE_COVERAGE.has(tierSlug) && (
          <p className="text-center text-xs text-zinc-500 mb-8">
            <Link
              href="/judge-report-card#availability"
              className="text-zinc-400 underline decoration-zinc-600 hover:text-amber-400 hover:decoration-amber-400"
            >
              Check if your judge is covered
            </Link>{" "}
            &mdash; free, before you commit.
          </p>
        )}

        {/* Scene + competitive alternatives. Adversarial-walkthrough R2
            (2026-04-21) flagged the prior "commonly measured in years of
            custody" line as the explicit close-the-tab trigger for the
            crisis persona — unsourced outcome math reads as fear-close and
            UPL borderline. Replaced with a concrete scene (Suby rewrite)
            that names the three real competitive alternatives (Dunford)
            without claiming sentencing outcomes. UPL-safe: information
            framing, no guarantees. */}
        <p className="text-zinc-300 text-lg leading-relaxed mb-10">
          {stakesParagraph ?? (
            <>
              Your attorney is juggling dozens of other files this week. Your
              prosecutor has already read yours. Your judge has ruled on cases
              like yours — the patterns are in 33,000+ classified opinions, not
              in a Google search. Google doesn&apos;t pull them. ChatGPT makes
              up the citations. This does.
            </>
          )}
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
          {/* Answers the silent "I don't have a lawyer yet" objection at the
              moment it surfaces — right after deliverables that every read as
              "for your attorney". UPL-safe: information framing, no advice. */}
          {noAttorneyYet && (
            <p className="mt-5 text-zinc-400 text-sm italic leading-relaxed">
              {noAttorneyYet}
            </p>
          )}
        </section>

        {/* Partner benefit block */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 mb-8 text-center">
          <p className="text-zinc-300 text-sm">
            <span className="text-white font-semibold">
              {partnerDisplayName}
            </span>{" "}
            clients get: {tier.name} + free court-date reminders through your case.
          </p>
        </div>

        {/* Urgency anchor tied to the buyer's real clock (next hearing) —
            no invented deadline, no countdown. Suby R5 scored urgency 2.5/5
            without this; line describes what the product IS built to do,
            not a promise about outcome. UPL-safe. */}
        <p className="text-center text-zinc-400 text-sm mb-4 leading-relaxed">
          Your next hearing is on the calendar &mdash; the file is built to
          be in your hands before it, not after.
        </p>

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
              ${discountedPrice}
            </span>
            <span className="text-amber-400 text-sm font-medium">
              via {partnerDisplayName}
            </span>
          </div>

          <ul className="text-zinc-300 text-sm space-y-2 mb-6 border-l-2 border-zinc-700 pl-4">
            <li>Full {tier.name} delivered to your inbox</li>
            <li>Free court-date reminders through your case (partner benefit)</li>
            <li>
              If the first deliverable doesn&apos;t surface questions you
              hadn&apos;t yet considered, one email and we refund. No
              argument, no retention call.
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
            &mdash; already applied.
          </p>
        </div>

        {/* UPL footer */}
        <p className="text-center text-zinc-500 text-xs mt-10 leading-relaxed">
          ImNotAnAttorney provides legal information, not legal advice.
          Deliverables are information and questions for your attorney &mdash;
          not case predictions, legal strategy, or representation.
        </p>

        {/* Not-sure nudge toward Case Decoder (skip if already viewing CD).
            Placed BELOW the UPL disclaimer, not adjacent to the primary CTA:
            adversarial-walkthrough Laja R1 flagged inline downsell as
            distraction at commitment moment. Below-UPL position preserves
            a recovery path for fence-sitters without competing with the
            main conversion decision. */}
        {tierSlug !== "case-decoder" && (
          <p className="text-center text-zinc-400 text-sm mt-6">
            Not sure yet? Start with the{" "}
            <Link
              href={`/r/${promoCode}/case-decoder${sanitizedSub ? `?sub=${sanitizedSub}` : ""}`}
              className="text-zinc-300 underline hover:text-amber-400"
            >
              Case Decoder
            </Link>{" "}
            for ${caseDecoderDiscounted} &mdash; same refund rule: doesn&apos;t surface new questions, money back.
          </p>
        )}

        {/* Hidden for screen-readers only: preserves partner name for bots
            in case the truncated header fails to convey context. */}
        <span className="sr-only">Referred by {partnerName}.</span>
      </div>
    </main>
  );
}
