/**
 * Landing Page (/)
 *
 * Primary conversion entry point for the entire site. This page is designed to
 * take a cold visitor (typically arriving from Reddit, Google, or a blog post)
 * and move them toward purchasing the Case Decoder ($197) or entering the free
 * Defense Milestone Score funnel.
 *
 * User journey position:
 *   Traffic source -> THIS PAGE -> /checkout?tier=case-decoder (primary CTA)
 *                                -> /score (free lead magnet CTA)
 *                                -> /sample (proof / objection handling)
 *
 * Page structure (conversion-optimized order):
 *   1. Hero — H1 with VoC emotional hook (attorney won't call back) + dual CTA
 *   2. Proof — Real case findings (weight, CI phone, drug type) with attorney attributions
 *   3. Urgency bar — Motion deadline scarcity
 *   4. Pain points — Four defendant frustrations that validate the visitor's situation
 *   5. Bridge — Identity statement ("people like us read the discovery ourselves")
 *   6. How it works — 3-step process (tell us, we research, you ask)
 *   7. Attorneys behind your questions — Credibility via 40+ named attorneys
 *   8. Value anchor — Stakes comparison ($10K-$100K attorney vs {TIER_CORE["case-decoder"].priceDisplay}-{TIER_CORE["situation-room"].priceDisplay} service)
 *   9. Guarantee — Tiered guarantee (delivery + satisfaction)
 *  10. Pricing — PricingTable component (first 3 tiers shown on landing page)
 *  11. Lead capture — Email opt-in for non-buyers
 *  12. FAQ — Schema-marked FAQ accordion (7 questions, SEO + objection handling)
 *  13. Final CTA — Urgency close with deadline framing
 *
 * SEO: FAQ schema markup (FAQPage JSON-LD) injected for rich snippets.
 * OG/meta: Title uses VoC emotional hook for social sharing.
 */
import { LeadCapture } from "@/components/LeadCapture";
import { PricingTable } from "@/components/PricingTable";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { AnimatedCounter } from "@/components/motion/AnimatedCounter";
import { TrustBadges } from "@/components/TrustBadges";
import { TestimonialSection } from "@/components/TestimonialSection";
import { RecentPurchaseNotification } from "@/components/RecentPurchaseNotification";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { DiscoveryReveal } from "@/components/motion/DiscoveryReveal";
import { ChargeTypeSelector } from "@/components/ChargeTypeSelector";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE, upgradePrice } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

/** Page-level metadata. Title uses VoC emotional hook for SEO + social click-through. */
export const metadata: Metadata = {
  title: "ImNotAnAttorney — Your Case File Has Answers. We Find Them.",
  description:
    `Your case file has answers your attorney hasn't mentioned. We research your charges and hand you the exact questions — starting at ${TIER_CORE["case-decoder"].priceDisplay}.`,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Your Case File Has Answers Your Attorney Hasn't Mentioned. We Find Them. You Ask.",
    description:
      "Built by a defendant who found 68.3g of missing evidence his attorney never mentioned. We research your charges and give you the exact questions that hold your attorney accountable.",
  },
};

/**
 * FAQ items for the landing page accordion.
 * These are chosen to handle the top purchase objections:
 *   - "Will this upset my attorney?" (relationship fear)
 *   - "Is this legal advice?" (UPL compliance)
 *   - "What if I don't have discovery?" (tier gating)
 *   - "Do you work on federal cases?" (scope)
 *   - "How fast?" (delivery timeline)
 *   - "What about upgrade credit?" (commitment reduction)
 *   - "Can I get a refund?" (risk reversal)
 *
 * Also used to generate FAQPage schema markup for Google rich snippets.
 */
const homeFaqs = [
  {
    question: "Is this legal? Am I allowed to do this?",
    answer:
      "Absolutely. You have a constitutional right to understand your own case. INA provides legal research and questions — the same information available in any law library. We do not provide legal advice. Your attorney provides legal advice. We research. You ask.",
  },
  {
    question: "Will asking these questions upset my attorney?",
    answer:
      "The right attorneys welcome informed clients. The questions give you a way to find out which one you have. Defendants who come to meetings with specific, documented questions get more attorney time, more motions filed, and more thorough defense work. The questions don\u2019t create conflict — they create accountability.",
  },
  {
    question: "What if my attorney retaliates or drops my case?",
    answer:
      "Under ABA Model Rules of Professional Conduct, an attorney\u2019s ability to withdraw is constrained to specific grounds listed in Rule 1.16 \u2014 asking informed questions is not among them. Your state bar\u2019s rules may vary. Your questions are documented \u2014 they become part of the record of your defense.",
  },
  {
    question: "What if I don't have my discovery documents yet?",
    answer:
      `That's fine — our ${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay}) and ${TIER_CORE["intelligence-brief"].name} (${TIER_CORE["intelligence-brief"].priceDisplay}) don't require discovery. We can analyze your charges, research your judge, and generate targeted questions with just your case information. When you get discovery, upgrade to The X-Ray with full credit.`,
  },
  {
    question: "How fast do I get my report?",
    answer:
      `${TIER_CORE["case-decoder"].name}: ${TIER_CORE["case-decoder"].delivery}. ${TIER_CORE["intelligence-brief"].name}: ${TIER_CORE["intelligence-brief"].delivery}. ${TIER_CORE["x-ray"].name}: ${TIER_CORE["x-ray"].delivery}. ${TIER_CORE["war-room"].name}: ${TIER_CORE["war-room"].delivery.split(" +")[0]} initial + weekly updates. ${TIER_CORE["situation-room"].name}: ${TIER_CORE["situation-room"].delivery} with Trial Intelligence Operations.`,
  },
  {
    question: "Can I get a refund?",
    answer:
      `Find It or It's Free. If we don't identify at least one gap your attorney hasn't raised, full refund — no forms, no arguments. If we miss the delivery deadline, full refund AND you keep the report. Every dollar you spend is credited toward the next tier. Credits valid for 12 months.`,
  },
  {
    question: "What if my case is already too far along?",
    answer:
      "It's almost never too late. Most of what we find — discovery gaps, officer inconsistencies, missed motions — can be raised at any stage before sentencing. Even at the plea stage, strong questions give your attorney leverage to negotiate better terms. We've found critical issues in cases that were months into the process.",
  },
  {
    question: "What's the Defense Playbook?",
    answer:
      `The ${TIER_CORE["dui-first-offense"].name} (${TIER_CORE["dui-first-offense"].priceDisplay}) is an instant-download PDF with 26 questions your DUI attorney hopes you never ask, a breathalyzer calibration checklist, a case stage roadmap, 12 red flags, and a Case Progress Scorecard. No intake form, no wait — built from 40+ elite defense attorneys' documented strategies. Your ${TIER_CORE["dui-first-offense"].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} within 30 days.`,
  },
  {
    question: "What if I already bought a lower tier?",
    answer:
      `100% of what you paid is credited toward the next tier. Buy the ${TIER_CORE["case-decoder"].name} for ${TIER_CORE["case-decoder"].priceDisplay}, then upgrade to the ${TIER_CORE["intelligence-brief"].name} for just ${upgradePrice("case-decoder")}. No money wasted. Credits are valid for 12 months.`,
  },
];

/** FAQPage JSON-LD schema for Google rich snippets. Renders as a <script> tag in the page head. */
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: homeFaqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function Home() {
  return (
    <>
      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* LegalService Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LegalService",
            name: "ImNotAnAttorney",
            serviceType: "Legal Information Research",
            description:
              "Case-specific research and accountability questions for criminal defendants",
            provider: { "@type": "Organization", "@id": `${SITE_URL}/#organization` },
            areaServed: { "@type": "Country", name: "United States" },
            hasOfferCatalog: {
              "@type": "OfferCatalog",
              name: "Defense Intelligence Tiers",
              itemListElement: [
                {
                  "@type": "Offer",
                  name: "Case Decoder",
                  description: "Charge analysis + 10-15 targeted questions for your attorney",
                  price: "197.00",
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "Case Intelligence Brief",
                  description: "Judge intel + accountability research + 15-25 questions",
                  price: "997.00",
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "The X-Ray",
                  description: "Full discovery analysis + 35-50 questions + Discovery Strength Rating",
                  price: "2497.00",
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "The War Room",
                  description: "Ongoing intelligence operation with weekly updates",
                  price: "4997.00",
                  priceCurrency: "USD",
                },
              ],
            },
          }),
        }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* HERO SECTION                                                      */}
      {/* H1 leads with the #1 defendant pain (attorney won't call back)   */}
      {/* per VoC research — verbatim from r/legaladvice and Avvo.         */}
      {/* Subheadline mirrors emotional vocabulary: scared, confused,       */}
      {/* nobody's explaining. Fear → empowerment transition (Wolf).        */}
      {/*   Primary: CTA -> /checkout                                      */}
      {/*   Secondary: "See What We Found" -> /sample (proof before buy)   */}
      {/* Below CTAs: free score link (/score) as low-commitment fallback. */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 pb-20 pt-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-amber-500">
              Built by a defendant who read his own 500-page discovery file.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
              Your Case File Has Answers Your Attorney Hasn&apos;t Mentioned.
              <br />
              <span className="text-amber-400">We Find Them. You Ask the Questions.</span>
            </h1>
          </FadeInUp>
          <FadeInUp delay={0.2}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
              Most defendants tell us the same thing: &ldquo;My attorney won&apos;t call me back.&rdquo;
              We built this for that moment. 68.3 grams of missing evidence in one real
              case. A CI phone attributed to two different people. A drug that didn&apos;t
              match the charge. Your attorney may have missed something too.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.25}>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400">
              We research your charges using the documented tactics of 40+ elite
              defense attorneys — the ones who win landmark cases. We&apos;re not lawyers.
              We&apos;re researchers. And we catch what gets missed.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.28}>
            <ChargeTypeSelector />
          </FadeInUp>
          <FadeInUp delay={0.3}>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/checkout?tier=case-decoder"
                className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Get Your Case Decoder — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>
              <Link
                href="/sample"
                className="rounded-lg border border-zinc-700 px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:border-zinc-500 hover:shadow-lg"
              >
                See What We Found in a Real Case &rarr;
              </Link>
            </div>
            <p className="mt-4 text-sm text-zinc-300">
              Find It or It&apos;s Free &mdash; if we don&apos;t find something your attorney hasn&apos;t raised, full refund. No forms. No arguments.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.35}>
            <p className="mt-3 text-sm font-semibold text-amber-500">
              Built by Rahim — a trafficking defendant who found 68.3g of missing
              evidence his attorney never mentioned. &middot; We Research. You Ask.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.4}>
            <p className="mt-4 text-sm text-zinc-400">
              <Link
                href="/dui-checklist"
                className="text-zinc-400 underline decoration-zinc-600 hover:text-amber-400 hover:decoration-amber-400/50"
              >
                Arrested for DUI? Your DMV hearing deadline may be 7 days away.
              </Link>
            </p>
          </FadeInUp>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PROOF SECTION — PCSO-Authentic Discovery Document Reveal          */}
      {/* Pixel-accurate replica of a real PCSO supplement report with      */}
      {/* three findings highlighted on scroll. Replaces static proof cards.*/}
      {/* ------------------------------------------------------------------ */}
      <DiscoveryReveal />

      {/* WHAT WE ARE NOT — UPL clarity + DoNotPay disarmament (Brunson)     */}
      <section className="px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                Clear on what we are
              </p>
              <p className="mt-3 text-zinc-300">
                We are not a law firm. We do not give legal advice. We do not
                replace your attorney. We do not tell you what to do.
              </p>
              <p className="mt-2 text-zinc-300">
                We research your charge type and give you the questions your
                attorney needs to hear from you. That&apos;s it. That&apos;s all we do.
                And we do it better than anyone.
              </p>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* URGENCY BAR — Motion deadline scarcity. Creates time pressure      */}
      {/* without being manipulative (suppression motions genuinely expire). */}
      <section className="border-y border-amber-500/20 bg-amber-500/5 px-4 py-4">
        <p className="text-center text-sm text-amber-400">
          Motion deadlines don&apos;t wait. Some suppression motions must be
          filed within 30 days — and once the window closes, it&apos;s gone
          forever.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PAIN POINTS — Four defendant frustrations (VoC verbatim)         */}
      {/* Titles are near-exact quotes from defendant forums (Avvo, Quora, */}
      {/* r/legaladvice). Per Wiebe: use their exact words, not ours.      */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              Sound familiar?{" "}
              <span className="text-amber-400">You&apos;re not alone.</span>
            </h2>
          </FadeInUp>
          <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              {
                title: "\u201CMy lawyer won\u2019t return my calls. My court date is Monday.\u201D",
                desc: "Three voicemails. Two emails. Nothing. Your next hearing is in days and you have no idea what\u2019s happening with your own case. The lucky ones get five minutes of their attorney\u2019s time.",
              },
              {
                title: "\u201CNobody explained anything to me.\u201D",
                desc: "They handed you a stack of discovery and said \u201Creview this.\u201D Review what? Police reports, lab results, witness statements \u2014 written in a language designed to confuse you.",
              },
              {
                title: "\u201CMy lawyer just wants me to plead guilty.\u201D",
                desc: "No motions filed. No investigation. No fight. Just \u201Ctake the deal\u201D on repeat. You don\u2019t even know if it\u2019s a good deal because nobody will explain what the alternative looks like.",
              },
              {
                title: "\u201CI paid $10K and he did nothing.\u201D",
                desc: "You scraped that retainer together \u2014 borrowed from family, drained savings. Now you can\u2019t even get a status update on your own case. That\u2019s not frustrating. That\u2019s money spent on silence.",
              },
              {
                title: "\u201CI\u2019m not the one facing charges \u2014 but I\u2019m the one doing all the research.\u201D",
                desc: "Your husband, your son, your brother is facing charges. His attorney won\u2019t return YOUR calls either. Nobody will explain what\u2019s happening. You\u2019re the one up at 2am trying to understand what \u201Cdiscovery\u201D even means. We built this for you too.",
              },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                  <h3 className="font-bold text-amber-400">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {item.desc}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          {/* Inline testimonials after pain points (Kenyon placement #1) */}
          <div className="mt-12">
            <TestimonialSection
              variant="inline"
              testimonials={[
                {
                  quote: "I didn't even know my attorney was supposed to file motions. The questions alone changed everything.",
                  name: "Marcus T.",
                  charge: "Drug Possession",
                  outcome: "Charges reduced",
                },
                {
                  quote: "My lawyer hadn't even looked at the discovery. I walked in with 15 questions and suddenly he was actually working.",
                  name: "Sarah K.",
                  charge: "DUI",
                  outcome: "Case dismissed",
                },
              ]}
            />
            <p className="mt-4 text-center text-xs text-zinc-600">
              *Based on real defendant experiences. Names changed for privacy. Jurisdictions, timelines, and specific findings vary by case.
            </p>
          </div>
          <div className="mt-8 text-center">
            <p className="text-sm text-zinc-400">
              Not ready to commit?{" "}
              <Link
                href="/score"
                className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
              >
                Check your attorney&apos;s score — free, no email required &rarr;
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* BRIDGE — Identity statement. Transitions from pain to action by    */}
      {/* creating an in-group ("people like us") before the how-it-works.  */}
      <section className="border-t border-zinc-800 px-4 py-10">
        <p className="text-center text-lg font-semibold text-white">
          People like us don&apos;t just trust the system.{" "}
          <span className="text-amber-400">
            People like us ask questions until we get answers.
          </span>
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* HOW IT WORKS — 3-step simplification                              */}
      {/*   Step 01: Tell us about your case (10 min intake form)           */}
      {/*   Step 02: We research everything (40+ attorney methodologies)    */}
      {/*   Step 03: You ask the questions (bring report to attorney)       */}
      {/* Anchor id="how-it-works" for in-page linking from nav.           */}
      {/* ------------------------------------------------------------------ */}
      <section id="how-it-works" className="border-t border-zinc-800 px-4 py-20 section-alt">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              How it works
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Three steps. Ten minutes. Questions your attorney won&apos;t expect.
          </p>
          <StaggerContainer className="relative mt-12 grid gap-8 md:grid-cols-3">
            {/* Connecting line between step circles on desktop */}
            <div className="pointer-events-none absolute left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] top-[24px] hidden h-px bg-zinc-700 md:block" aria-hidden="true" />
            {[
              {
                step: "01",
                title: "Submit your charges",
                desc: "Your charges, your stage, what your attorney has or hasn\u2019t done. 10 minutes.",
                badge: null,
                border: "border-l-2 border-zinc-700",
              },
              {
                step: "02",
                title: "We research overnight",
                desc: "Your case analyzed through 40+ elite defense methodologies. Chain of custody. Informant credibility. Constitutional frameworks. Every angle your attorney should be covering.",
                badge: "48 hours",
                border: "border-l-2 border-amber-500/50",
              },
              {
                step: "03",
                title: "You walk in armed",
                desc: "A custom report with pointed, case-specific questions. Bring them to your next meeting. Your attorney now knows you\u2019re paying attention.",
                badge: "10-15 questions",
                border: "border-l-2 border-amber-400",
              },
            ].map((item) => (
              <StaggerItem key={item.step} className={`text-center ${item.border} pl-4 md:border-l-0 md:pl-0`}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-lg font-bold text-amber-400">
                  {item.step}
                </div>
                <h3 className="mt-4 font-bold text-white">{item.title}</h3>
                {item.badge && (
                  <span className="mt-2 inline-block rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                    {item.badge}
                  </span>
                )}
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* ATTORNEY CREDIBILITY SECTION                                      */}
      {/* Names 6 elite defense attorneys whose documented methods power     */}
      {/* our question generation. This is the core differentiator:         */}
      {/* we don't generate generic questions — each traces to a specific   */}
      {/* attorney's winning methodology. Social proof via real names       */}
      {/* and real case wins (OJ, El Chapo, Gotti Jr, etc).                */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              The Methodologies Behind Your Questions
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Every question we generate traces to a documented winning method.
          </p>
          <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: "Chain of Custody Analysis",
                record: "375+ exonerations, landmark DNA defense cases",
                method: "Every piece of evidence traced from collection to courtroom. Gaps in custody = gaps in reliability.",
              },
              {
                name: "Informant Credibility",
                record: "Proven in high-profile federal defense cases",
                method: "Every cooperator's history, motives, and handler relationship scrutinized.",
              },
              {
                name: "Investigation Patterns",
                record: "Methodology from attorneys who never lost",
                method: "Find the one fact that destroys the prosecution's narrative.",
              },
              {
                name: "Cross-Examination Design",
                record: "Techniques from landmark acquittals and retrials",
                method: "Witness examination questions that expose procedural failures.",
              },
              {
                name: "Constitutional Framework",
                record: "Applied in landmark appellate reversals",
                method: "Constitutional hooks built into every motion and appeal.",
              },
              {
                name: "Drug Forensics",
                record: "Federal drug defense methodology",
                method: "Weight discrepancy and substance variance protocols for every drug case.",
              },
            ].map((attorney) => (
              <StaggerItem key={attorney.name}>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 h-full">
                  <h3 className="font-bold text-amber-400">{attorney.name}</h3>
                  <p className="mt-1 text-xs text-zinc-400">{attorney.record}</p>
                  <p className="mt-3 text-sm text-zinc-300">{attorney.method}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <p className="mt-8 text-center text-sm text-zinc-400">
            Plus 34 more elite defense attorneys whose documented tactics inform every question we generate.
          </p>
        </div>
      </section>

      {/* VALUE ANCHOR — Stakes comparison. Frames our pricing against the   */}
      {/* attorney retainer already paid ($10K-$100K) and potential          */}
      {/* conviction cost (1-20 years). Makes $197-$9,997 feel small.       */}
      <section className="border-t border-zinc-800 px-4 py-16 section-alt">
        <div className="mx-auto max-w-3xl text-center">
          <FadeInUp>
            <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
              What&apos;s at stake?
            </h2>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <div className="mt-4 mx-auto max-w-lg rounded-xl border-l-4 border-amber-500/50 bg-zinc-900/50 p-6 text-left">
              <p className="text-sm leading-relaxed text-zinc-300 italic">
                &ldquo;For $197 I got more useful information than from the $15,000 I paid my attorney. That&apos;s not an exaggeration.&rdquo;
              </p>
              <div className="mt-3">
                <p className="text-sm font-semibold text-white">Michelle P.</p>
                <p className="text-xs text-zinc-500">White Collar Fraud, New York &middot; Charges dropped</p>
              </div>
            </div>
          </FadeInUp>
          <p className="mt-4 text-sm text-zinc-400">
            Every year, defendants spend $10,000+ and still don&apos;t know whether their attorney has everything they need to fight for them.
          </p>
          <StaggerContainer className="mt-8 grid gap-4 md:grid-cols-3">
            <StaggerItem>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="text-2xl font-bold text-red-400">Less than one hour</div>
                <p className="mt-1 text-xs font-semibold text-zinc-500">of your attorney&apos;s billing rate ($250-$500/hr).</p>
                <p className="mt-2 text-sm text-zinc-400">
                  For a full case analysis with 10-15 targeted questions.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="text-2xl font-bold text-red-400">$10K-$100K+</div>
                <p className="mt-1 text-xs font-semibold text-zinc-500">What you already paid your attorney.</p>
                <p className="mt-2 text-sm text-zinc-400">
                  INA makes sure that money does what you paid for.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
                <div className="text-2xl font-bold text-amber-400">{TIER_CORE["case-decoder"].priceDisplay}</div>
                <p className="mt-1 text-xs font-semibold text-zinc-500">Case Decoder. 48 hours.</p>
                <p className="mt-2 text-sm text-zinc-400">
                  The questions your attorney needs to hear — whether they want to or not.
                </p>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* Grid testimonials before pricing (Kenyon placement #2) */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display mb-8 text-center text-2xl font-bold text-white md:text-3xl">
              Defendants who fought back
            </h2>
          </FadeInUp>
          <TestimonialSection
            variant="grid"
            testimonials={[
              {
                quote: "The questions alone saved my case. My attorney had no idea I knew about the Brady violation.",
                name: "David R.",
                charge: "Federal Drug Conspiracy, Southern District",
                outcome: "Charges reduced to misdemeanor — 4 months from report to resolution",
              },
              {
                quote: "I was about to take a plea for 5 years. The report found a chain of custody break my public defender missed. Got 18 months probation instead.",
                name: "James M.",
                charge: "Drug Trafficking, Florida",
                outcome: "Plea reduced to probation — evidence gap identified in lab transfer records",
              },
              {
                quote: "Worth every penny. My attorney started filing motions the same week I brought in the questions.",
                name: "Angela W.",
                charge: "Probation Violation, Texas",
                outcome: "Violation dismissed — 3 procedural issues flagged in report",
              },
              {
                quote: "I didn't know I could ask for the calibration records on the breathalyzer. That one question changed everything.",
                name: "Robert C.",
                charge: "DUI, California",
                outcome: "Case dismissed — breathalyzer maintenance records showed overdue calibration",
              },
            ]}
          />
          <p className="mt-4 text-center text-xs text-zinc-600">
            *Based on real defendant experiences. Names changed for privacy. Jurisdictions, timelines, and specific findings vary by case. Past results do not guarantee future outcomes.
          </p>
        </div>
      </section>

      {/* GUARANTEE SECTION — Named guarantee, cash refund first.             */}
      <section className="border-t border-zinc-800 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <FadeInUp>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <svg className="h-6 w-6 text-amber-400" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-bold text-white">
              Find It or It&apos;s Free
            </h2>
            <div className="mt-6 space-y-4 text-left">
              <div>
                <p className="text-sm font-semibold text-amber-400">The Discovery Guarantee</p>
                <p className="mt-1 text-sm text-zinc-300">
                  We will identify at least one gap, missed question, or unexamined area
                  in your case that your attorney has not raised — or we refund every
                  dollar. No forms. No arguments. One email to help@imnotanattorney.com.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-400">The Speed Guarantee</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Your {TIER_CORE["case-decoder"].name} in 48 hours. Your {TIER_CORE["intelligence-brief"].name} in 72
                  hours. If we miss the deadline, full refund AND you keep the report
                  when it arrives.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-400">100% Upgrade Credit</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Every dollar you spend counts toward the next tier. Buy the {TIER_CORE["case-decoder"].name} for {TIER_CORE["case-decoder"].priceDisplay},
                  upgrade to the {TIER_CORE["intelligence-brief"].name} for just {upgradePrice("case-decoder")}.
                  Credits valid for 12 months.
                </p>
              </div>
            </div>
          </div>
          </FadeInUp>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PRICING SECTION                                                   */}
      {/* Shows the first 3 tiers via PricingTable component (maxTiers=3).  */}
      {/* Landing page intentionally hides War Room and Situation Room to   */}
      {/* reduce decision fatigue. Full 5-tier display is on /services.     */}
      {/* Anchor id="pricing" for direct linking from nav + CTAs.          */}
      {/* Upgrade credit messaging reinforces "start small, grow later."   */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing" className="border-t border-zinc-800 px-4 py-20 section-alt">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              Pick your level of defense intelligence
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Every tier draws from the same intelligence base: 40+ elite defense
            attorneys, their documented tactics, their proven frameworks. The
            tier determines how deep we go.
          </p>
          <p className="mt-2 text-center text-sm text-zinc-400">
            Defendants who fight back with research choose their tier. Start at
            {TIER_CORE["case-decoder"].priceDisplay} — upgrade anytime with full credit.
          </p>
          <FadeInUp>
            <div className="mt-12">
              <PricingTable maxTiers={3} />
            </div>
          </FadeInUp>
          <TrustBadges variant="pricing" />
        </div>
      </section>

      {/* LEAD CAPTURE — Email opt-in for visitors not ready to buy.         */}
      {/* Falls back to free score link for zero-friction engagement.       */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-2xl">
          <LeadCapture
            successUpsellHref="/checkout?tier=case-decoder"
            successUpsellLabel={`Ready to go deeper? Get Your Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`}
            successUpsellDescription="You're already doing the work most defendants never do. The Case Decoder takes it further."
          />
          <p className="mt-6 text-center text-sm text-zinc-400">
            Want a quick answer?{" "}
            <Link
              href="/score"
              className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
            >
              Check your Defense Milestone Score — free, no email required.
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ — Renders the homeFaqs array via FAQAccordion component.       */}
      {/* Handles remaining objections. Schema markup is injected above     */}
      {/* via faqSchema JSON-LD for Google rich snippet eligibility.        */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <h2 className="font-display mb-8 text-center text-2xl font-bold text-white md:text-3xl">
              Common Questions
            </h2>
          </FadeInUp>
          <FAQAccordion items={homeFaqs} />
        </div>
      </section>

      {/* FINAL CTA — Fear → empowerment close (Wolf). Opens with their     */}
      {/* 2am emotional state, closes with empowered identity.             */}
      <section className="border-t border-zinc-800 px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <FadeInUp>
            <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
              You&apos;re up at 2am because nobody will explain your case.
              <br />
              <span className="text-amber-400">You&apos;ve called. You&apos;ve emailed. You&apos;ve waited. Now stop waiting. Start asking.</span>
            </h2>
            <p className="mt-4 text-zinc-400">
              Motions expire. Evidence disappears. Witnesses forget.
              But the defendant who walks in with the right questions?
              Their attorney starts filing motions that week.
              What happens next is between you and your attorney.
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              Be the defendant your attorney wasn&apos;t expecting.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/checkout?tier=case-decoder"
                className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Get Your Case Decoder — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>
              <Link
                href="/sample"
                className="rounded-lg border border-zinc-700 px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:border-zinc-500 hover:shadow-lg"
              >
                See What We Found in a Real Case &rarr;
              </Link>
            </div>
          </FadeInUp>
          <TrustBadges variant="compact" />
        </div>
      </section>

      {/* Global components */}
      <RecentPurchaseNotification />
      <StickyMobileCTA />
    </>
  );
}
