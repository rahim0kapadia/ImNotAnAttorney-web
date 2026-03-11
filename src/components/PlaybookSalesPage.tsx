/**
 * Shared playbook sales page layout.
 *
 * Renders a full long-form conversion page from a PlaybookConfig object.
 * Used by the dynamic route at /playbook/[slug].
 *
 * Sections: Hero → Agitate → Proof → Value Stack → Guarantee → Who It's For →
 * Methodology → Urgency → FAQ → Final CTA → Upgrade Path → Schema
 */
import Link from "next/link";
import { TIER_CORE, upgradePrice, nextTierSlug } from "@/lib/tiers";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { TrustBadges } from "@/components/TrustBadges";
import type { PlaybookConfig } from "@/lib/playbook-configs";
import type { TierSlug } from "@/lib/tiers";

interface Props {
  config: PlaybookConfig;
}

export default function PlaybookSalesPage({ config }: Props) {
  const tier = TIER_CORE[config.slug];
  const checkoutUrl = `/checkout?tier=${config.slug}`;
  const nextSlug = nextTierSlug(config.slug);
  const nextTier = nextSlug ? TIER_CORE[nextSlug] : null;
  const upgrade = upgradePrice(config.slug);

  // Build the upgrade-credit deadline urgency item dynamically
  const urgencyItems = [
    ...config.urgency.items,
    ...(nextTier && upgrade
      ? [
          {
            deadline: "30 days from purchase",
            what: `Your ${tier.priceDisplay} upgrade credit toward the ${nextTier.name} (${nextTier.priceDisplay}). After 30 days, the credit expires.`,
          },
        ]
      : []),
  ];

  // Inject upgrade FAQ items dynamically
  const faqItems = [
    ...config.faq,
    ...(nextTier && upgrade
      ? [
          {
            q: "What if I need something more personalized?",
            a: `Your ${tier.priceDisplay} is fully credited toward the ${nextTier.name} (${nextTier.priceDisplay}) within 30 days. The upgrade costs just ${upgrade}.`,
          },
          {
            q: `What\u2019s the ${tier.name} vs the ${nextTier.name}?`,
            a: `The ${tier.name} is generic to all cases of this charge type. The ${nextTier.name} (${nextTier.priceDisplay}) is personalized to YOUR specific situation with case-specific questions, email templates, and a 7-day action plan. Your ${tier.priceDisplay} purchase is credited toward the ${nextTier.name}.`,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* HERO */}
      <FadeInUp>
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          {config.hero.eyebrow}
        </p>
        <h1 className="font-display mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
          {config.hero.headline}
        </h1>
        <p className="mt-4 text-lg text-zinc-400">{config.hero.subheadline}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="text-4xl font-extrabold text-amber-400">
            {tier.priceDisplay}
          </span>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            Instant PDF
          </span>
        </div>
        <Link
          href={checkoutUrl}
          className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
        >
          Get Instant Access &mdash; {tier.priceDisplay}
        </Link>
        <p className="mt-3 text-xs text-zinc-500">
          Download within 60 seconds of purchase. No intake form. No waiting.
        </p>
      </section>
      </FadeInUp>

      {/* AGITATE */}
      <FadeInUp>
      <section className="mt-20">
        <h2 className="font-display text-2xl font-bold text-white">
          {config.agitate.headline}
        </h2>
        <div className="mt-6 space-y-4 text-zinc-400">
          {config.agitate.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <StaggerContainer className="mt-8 grid gap-4 sm:grid-cols-3">
          {config.agitate.cards.map((card) => (
            <StaggerItem
              key={card.title}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <p className="text-sm font-semibold text-amber-400">
                {card.title}
              </p>
              <p className="mt-2 text-sm text-zinc-400">{card.text}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>
      </FadeInUp>

      {/* PROOF */}
      <FadeInUp>
      <section className="mt-20">
        <h2 className="font-display text-2xl font-bold text-white">
          {config.proof.headline}
        </h2>
        <StaggerContainer className="mt-8 space-y-6">
          {config.proof.methods.map((method) => (
            <StaggerItem
              key={method.name}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6"
            >
              <p className="font-semibold text-white">{method.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{method.title}</p>
              <p className="mt-3 text-sm text-zinc-400">{method.insight}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>
      </FadeInUp>

      {/* VALUE STACK */}
      <FadeInUp>
      <section className="mt-20">
        <h2 className="font-display text-2xl font-bold text-white">What&apos;s inside</h2>
        <StaggerContainer className="mt-8 space-y-4">
          {config.valueStack.sections.map((section) => (
            <StaggerItem
              key={section.title}
              className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div>
                <p className="font-semibold text-white">{section.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{section.desc}</p>
              </div>
              <p className="shrink-0 text-sm text-zinc-500 line-through">
                {section.value}
              </p>
            </StaggerItem>
          ))}
        </StaggerContainer>
        <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <p className="text-sm text-zinc-400">
            Total value:{" "}
            <span className="text-zinc-300 line-through">
              {config.valueStack.totalValue}
            </span>
          </p>
          <p className="mt-2 text-3xl font-extrabold text-amber-400">
            Your price: {tier.priceDisplay}
          </p>
          <Link
            href={checkoutUrl}
            className="mt-4 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            Get Instant Access &mdash; {tier.priceDisplay}
          </Link>
        </div>
        <div className="mt-6">
          <TrustBadges variant="checkout" />
        </div>
      </section>
      </FadeInUp>

      {/* GUARANTEE */}
      <FadeInUp>
      <section className="mt-20">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Our Guarantee
          </p>
          <p className="mt-4 text-lg font-semibold text-white">
            {config.guarantee.headline}
          </p>
          <p className="mt-3 text-sm text-zinc-400">{config.guarantee.body}</p>
        </div>
      </section>
      </FadeInUp>

      {/* WHO IT'S FOR */}
      <FadeInUp>
      <section className="mt-20">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="text-lg font-bold text-amber-400">
              This is for you if...
            </h3>
            <ul className="mt-4 space-y-3">
              {config.audience.forYou.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-zinc-400"
                >
                  <span className="mt-0.5 text-amber-400">&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-500">
              This is NOT for you if...
            </h3>
            <ul className="mt-4 space-y-3">
              {config.audience.notForYou.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-zinc-500"
                >
                  <span className="mt-0.5">&#10007;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      </FadeInUp>

      {/* METHODOLOGY DISCLOSURE */}
      <section className="mt-20">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Important
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            {config.methodologyText}
          </p>
        </div>
      </section>

      {/* URGENCY */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          {config.urgency.headline}
        </h2>
        <div className="mt-6 space-y-4">
          {urgencyItems.map((item) => (
            <div
              key={item.deadline}
              className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="shrink-0 rounded bg-amber-500/10 px-3 py-1">
                <p className="text-xs font-bold text-amber-400">
                  {item.deadline}
                </p>
              </div>
              <p className="text-sm text-zinc-400">{item.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-20">
        <h2 className="text-2xl font-bold text-white">
          Frequently asked questions
        </h2>
        <div className="mt-8 space-y-4">
          {faqItems.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-white">
                {faq.q}
              </summary>
              <p className="px-6 pb-4 text-sm text-zinc-400">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <FadeInUp>
      <section className="mt-20 text-center">
        <p className="text-sm text-zinc-500">{config.comparisonLine}</p>
        <p className="mt-2 text-3xl font-extrabold text-white">
          The {tier.name} is{" "}
          <span className="text-amber-400">{tier.priceDisplay}</span>.
        </p>
        <p className="mt-2 text-sm text-zinc-400">{config.summaryLine}</p>
        <Link
          href={checkoutUrl}
          className="mt-6 inline-block rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
        >
          Get Instant Access &mdash; {tier.priceDisplay}
        </Link>
        <p className="mt-3 text-xs text-zinc-500">
          {config.guarantee.headline}
        </p>
        <div className="mt-4">
          <TrustBadges variant="compact" />
        </div>
      </section>
      </FadeInUp>

      {/* UPGRADE PATH */}
      {nextTier && upgrade && (
        <section className="mt-16">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <p className="text-xs font-semibold text-zinc-400">
              Need case-specific questions?
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              The{" "}
              <Link
                href={`/checkout?tier=${nextSlug}`}
                className="font-semibold text-amber-400 underline decoration-amber-400/50"
              >
                {nextTier.name} ({nextTier.priceDisplay})
              </Link>{" "}
              builds 15 personalized questions from YOUR charges, YOUR state,
              YOUR stage &mdash; plus email templates, phone scripts, and a
              7-day action plan.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Your {tier.priceDisplay} {tier.name} purchase is credited toward
              the {nextTier.name}. Upgrade for {upgrade} within 30 days.
            </p>
          </div>
        </section>
      )}

      {/* Product + FAQPage Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: tier.name,
            description: config.seoDescription,
            url: `https://imnotanattorney.com/playbook/${config.slug}`,
            brand: { "@type": "Organization", name: "ImNotAnAttorney" },
            offers: {
              "@type": "Offer",
              price: String(tier.price / 100) + ".00",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              url: `https://imnotanattorney.com/checkout?tier=${config.slug}`,
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqItems.map((faq) => ({
              "@type": "Question",
              name: faq.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.a,
              },
            })),
          }),
        }}
      />
    </div>
  );
}
