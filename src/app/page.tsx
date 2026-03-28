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
import { HomepageHero } from "@/components/HomepageHero";
import { SITE_URL } from "@/lib/site";
import { generateDefinedTermSet } from "@/lib/schema";
import { TIER_CORE, upgradePrice } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

/** Page-level metadata. Title uses VoC emotional hook for SEO + social click-through. */
export const metadata: Metadata = {
  title: "ImNotAnAttorney — Your Case File Has Answers. We Find Them.",
  description:
    `Your attorney hasn't called back. Your court date is approaching. We research your charges and hand you the exact questions — Case Decoder ${TIER_CORE["case-decoder"].priceDisplay}, 48-hour delivery.`,
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
    question: "Can I get a refund?",
    answer:
      `Find It or It's Free. If we don't identify at least one gap your attorney hasn't raised, full refund — no forms, no arguments. If we miss the delivery deadline, full refund AND you keep the report. Every dollar you spend is credited toward the next tier. Credits valid for 12 months.`,
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
    question: "I've already spent everything on my attorney. Is $197 worth it?",
    answer:
      `That\u2019s the exact situation we built this for. You\u2019ve already spent $10,000 or more. INAA costs ${TIER_CORE["case-decoder"].priceDisplay} \u2014 less than one hour of your attorney\u2019s billing rate. The guarantee means if we don\u2019t find at least one gap your attorney hasn\u2019t raised, you pay nothing. One question from our report can change what motions your attorney files. One motion can change your case. The question is not whether ${TIER_CORE["case-decoder"].priceDisplay} is worth it. The question is whether you can afford not to know.`,
  },
  {
    question: "What if my case is already too far along?",
    answer:
      "It's almost never too late. Most of what we find — discovery gaps, officer inconsistencies, missed motions — can be raised at any stage before sentencing. Even at the plea stage, strong questions give your attorney leverage to negotiate better terms. We've found critical issues in cases that were months into the process.",
  },
  {
    question: "What's the Defense Playbook?",
    answer:
      `The ${TIER_CORE["dui-first-offense"].name} (${TIER_CORE["dui-first-offense"].priceDisplay}) is an instant-download PDF with 26 questions that change how your next attorney meeting goes, a breathalyzer calibration checklist, a case stage roadmap, 12 red flags, and a Case Progress Scorecard. No intake form, no wait — built from 40+ elite defense attorneys' documented strategies. Your ${TIER_CORE["dui-first-offense"].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} within 30 days.`,
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
    <main>
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
            "@id": `${SITE_URL}/#legal-service`,
            name: "ImNotAnAttorney",
            additionalType: "https://schema.org/ProfessionalService",
            serviceType: "Legal Information Research",
            description:
              "Case-specific research and accountability questions for criminal defendants",
            provider: { "@type": "Organization", "@id": `${SITE_URL}/#organization` },
            areaServed: { "@type": "Country", name: "United States" },
            knowsAbout: [
              "DUI & Driving Offenses",
              "Drug Offenses",
              "Violent Crimes",
              "Property Crimes",
              "Domestic & Family Offenses",
              "Weapons Charges",
              "Fraud & Financial Crimes",
              "Sex Offenses",
              "Public Order & Conduct",
              "Probation & Parole Violations",
              "Federal Charges",
              "Criminal Defense Research",
            ],
            speakable: {
              "@type": "SpeakableSpecification",
              cssSelector: ["#how-it-works", ".font-display"],
            },
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

      {/* DefinedTermSet Schema — Legal Glossary for AI/Entity SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateDefinedTermSet()),
        }}
      />

      <HomepageHero />

      {/* ------------------------------------------------------------------ */}
      {/* PROOF SECTION — PCSO-Authentic Discovery Document Reveal          */}
      {/* Pixel-accurate replica of a real PCSO supplement report with      */}
      {/* three findings highlighted on scroll. Replaces static proof cards.*/}
      {/* ------------------------------------------------------------------ */}
      <DiscoveryReveal />

      {/* BACKSTORY — Chaperon's trust ladder: peer voice before product      */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <FadeInUp>
            <blockquote className="border-l-4 border-amber-500/50 pl-6 text-zinc-300 leading-relaxed">
              <p>
                I hired an attorney the same way you did. Paid the retainer.
                Waited for the plan. The calls got shorter. Then they stopped.
                Seven months in, I decided to read the file myself. I didn&apos;t
                know what I was looking for. I found three things that changed
                everything about my case. My attorney never mentioned any of them.
              </p>
              <footer className="mt-4 text-sm text-amber-400 font-semibold">
                &mdash; ImNotAnAttorney Founder
              </footer>
            </blockquote>
          </FadeInUp>
        </div>
      </section>

      {/* URGENCY BAR — Motion deadline scarcity. Creates time pressure      */}
      {/* without being manipulative (suppression motions genuinely expire). */}
      <section className="border-y border-amber-500/20 bg-amber-500/5 px-4 py-4">
        <p className="text-center text-sm text-amber-400">
          Deadlines are running right now, and your attorney may not have
          calendared them. <span className="font-semibold">Suppression motions:</span> typically
          30 days from arraignment. <span className="font-semibold">DMV hearing (DUI):</span> 7-10
          days from arrest. <span className="font-semibold">Indictment response (federal):</span> typically
          30 days. <span className="font-semibold">Brady material requests:</span> the
          earlier they&apos;re made, the more leverage they create. Once these
          windows close, they do not reopen.
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
              You searched for this at 2am.{" "}
              <span className="text-amber-400">So did I.</span>
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
                {
                  quote: "I\u2019m not the one charged \u2014 my husband is. But I\u2019m the one doing all the research at 3am. The playbook gave me the language to actually talk to his attorney. She called back the same day.",
                  name: "Maria G.",
                  charge: "Family member \u2014 Drug Trafficking, Florida",
                  outcome: "Attorney engagement transformed",
                },
              ]}
            />
            <p className="mt-4 text-center text-xs text-zinc-600">
              *Based on real defendant experiences. Names changed for privacy. Jurisdictions, timelines, and specific findings vary by case.
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
      {/* WHAT WE LOOK FOR — Reframed in defendant voice per Phase 5 audit  */}
      {/* (Brunson/Chaperon/Laja: original had zero named attorneys despite  */}
      {/* claiming "40+ named." Defendant voice is more honest and more     */}
      {/* conversion-effective for crisis buyers.)                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              What We Look For in Your Case
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Every question we generate comes from documented defense methodologies
            used in 375+ exonerations and landmark acquittals.
          </p>
          <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: "Where did the evidence actually go?",
                method: "We trace every piece of evidence from the scene to the courtroom. Weight discrepancies, missing items, broken chain of custody \u2014 if something vanished between the patrol car and the lab, we find it.",
              },
              {
                name: "Who is the informant \u2014 and what were they promised?",
                method: "Confidential informants have motives. We scrutinize their history, their handler relationship, and what they were offered in exchange for testimony.",
              },
              {
                name: "What did the detective miss \u2014 or skip?",
                method: "Investigations have patterns. When steps are skipped, corners cut, or reports contradict each other, those gaps become your questions.",
              },
              {
                name: "What questions should break the witness\u2019s story?",
                method: "Cross-examination isn\u2019t random. We design questions based on documented techniques that expose inconsistencies and procedural failures.",
              },
              {
                name: "Were your rights violated during the investigation?",
                method: "Fourth Amendment search issues, Miranda violations, Brady obligations \u2014 constitutional hooks that can suppress evidence or reverse convictions.",
              },
              {
                name: "Does the lab report match what the police logged?",
                method: "Substance type, weight, testing protocols. If the field test says one thing and the lab says another, that\u2019s a question your attorney needs to ask.",
              },
            ].map((item) => (
              <StaggerItem key={item.name}>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 h-full">
                  <h3 className="font-bold text-amber-400">{item.name}</h3>
                  <p className="mt-3 text-sm text-zinc-300">{item.method}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <p className="mt-8 text-center text-sm text-zinc-400">
            Built from 40+ elite defense methodologies &mdash; the same frameworks
            used in 375+ exonerations and landmark acquittals, applied to your case.
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
                  INAA makes sure that money does what you paid for.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
                <div className="text-2xl font-bold text-amber-400">{TIER_CORE["case-decoder"].priceDisplay}</div>
                <p className="mt-1 text-xs font-semibold text-zinc-500">Case Decoder. 48 hours. Your case specifically.</p>
                <p className="mt-2 text-sm text-zinc-400">
                  10-15 case-specific questions based on your charges, your judge, your discovery.
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
                quote: "My attorney was doing a good job, but I needed to understand the case myself. The Intelligence Brief showed me exactly what was happening and gave me the right questions to ask. My attorney actually thanked me for being so prepared.",
                name: "Rachel T.",
                charge: "White Collar Fraud, New Jersey",
                outcome: "Charges dismissed — attorney credited preparation for stronger motion strategy",
              },
              {
                quote: "I hadn\u2019t heard from my attorney in three weeks and was starting to panic. The Case Decoder gave me an email template with specific questions. My attorney responded the same day and walked me through everything. Turns out he was working the case \u2014 he just wasn\u2019t communicating.",
                name: "Anthony W.",
                charge: "Drug Possession, Georgia",
                outcome: "Case resolved favorably — attorney engagement improved immediately",
              },
              {
                quote: "My son\u2019s probation officer said he violated a condition he was never told about. The Case Decoder gave us the specific questions to challenge it. His attorney filed a motion the next day.",
                name: "Linda M.",
                charge: "Probation Violation, Texas",
                outcome: "Violation dismissed \u2014 condition was never formally communicated",
              },
            ]}
          />
          <p className="mt-4 text-center text-xs text-zinc-600">
            *Based on real defendant experiences. Names changed for privacy. Jurisdictions, timelines, and specific findings vary by case. Past results do not guarantee future outcomes.
          </p>
        </div>
      </section>

      {/* CHARGE CATALOG — 12 charge-category cards for SEO + routing */}
      {(() => {
        const CHARGE_CATEGORIES = [
          { slug: "dui-driving", label: "DUI & Driving Offenses", description: "Breathalyzer challenges, field sobriety analysis, rising BAC defense", playbook: "dui-first-offense" },
          { slug: "drug-offenses", label: "Drug Offenses", description: "Possession, trafficking, weight disputes, search legality", playbook: "drug-possession" },
          { slug: "violent-crimes", label: "Violent Crimes", description: "Assault, battery, self-defense, force proportionality", playbook: null },
          { slug: "property-crimes", label: "Property Crimes", description: "Theft, burglary, shoplifting, identity evidence", playbook: null },
          { slug: "domestic-family", label: "Domestic & Family", description: "DV defense, protective orders, false allegations", playbook: null },
          { slug: "weapons", label: "Weapons Charges", description: "Possession, carry violations, Second Amendment defense", playbook: null },
          { slug: "fraud-financial", label: "Fraud & Financial", description: "Wire fraud, identity theft, embezzlement, asset forfeiture", playbook: "white-collar" },
          { slug: "sex-offenses", label: "Sex Offenses", description: "Forensic evidence, investigation protocols, registry defense", playbook: "sex-offense" },
          { slug: "public-order", label: "Public Order", description: "Disorderly conduct, resisting arrest, contempt", playbook: null },
          { slug: "probation-parole", label: "Probation Violations", description: "Technical violations, revocation hearings, compliance", playbook: "probation-violation" },
          { slug: "federal-specific", label: "Federal Charges", description: "Sentencing guidelines, cooperation, mandatory minimums", playbook: "federal-criminal" },
          { slug: "other", label: "Other Charges", description: "We research any criminal charge type", playbook: null },
        ] as const;
        return (
          <section className="border-t border-zinc-800 px-4 py-20 section-alt">
            <div className="mx-auto max-w-5xl">
              <FadeInUp>
                <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
                  Research Available for Every Charge Type
                </h2>
              </FadeInUp>
              <p className="mt-3 text-center text-zinc-400">
                Charge-specific questions and case research &mdash; 48-hour delivery.
              </p>
              <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {CHARGE_CATEGORIES.map((cat) => (
                  <StaggerItem key={cat.slug}>
                    <Link
                      href={cat.playbook ? `/checkout?tier=${cat.playbook}` : "/start"}
                      className="group block rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-all hover:border-zinc-600 h-full cursor-pointer"
                    >
                      <p className="text-sm font-bold text-zinc-200">{cat.label}</p>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                        {cat.description}
                      </p>
                      <p className="mt-3 text-xs font-semibold text-amber-500 group-hover:text-amber-400">
                        {cat.playbook ? "Defense Playbook \u2014 $97 \u2192" : "Case Research \u2014 $197 \u2192"}
                      </p>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>
          </section>
        );
      })()}

      {/* WHAT WE ARE — Peer-voiced identity (Chaperon rewrite). Moved from    */}
      {/* post-DiscoveryReveal to pre-guarantee per all 5 experts.            */}
      <section className="px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                Who we are
              </p>
              <p className="mt-3 text-zinc-300 leading-relaxed">
                We&apos;re researchers, not lawyers. We read your case file the way
                I read mine &mdash; looking for what doesn&apos;t add up. We hand you
                the questions. Your attorney has to answer them. That&apos;s where
                their work begins and ours ends.
              </p>
            </div>
          </FadeInUp>
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
              Here is everything you get &mdash; and what it would cost you anywhere else
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            A second attorney consultation costs $500. Judge research costs $300.
            Question scripts cost $200. All of it in 48 hours would run $1,000+.
            Your Case Decoder: {TIER_CORE["case-decoder"].priceDisplay}. Every tier
            draws from the same intelligence base &mdash; 40+ elite defense
            attorneys and their documented tactics. The tier determines how deep we go.
          </p>
          <p className="mt-2 text-center text-sm text-zinc-400">
            Start at {TIER_CORE["case-decoder"].priceDisplay} &mdash; upgrade anytime with full credit.
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
            successUpsellHref="/start"
            successUpsellLabel={`Ready to go deeper? Get your Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`}
            successUpsellDescription="Case-specific research with 10-15 targeted questions. 48-hour delivery. Every dollar credited toward higher tiers."
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
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                href="/start"
                className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Start Your Case Research &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>
              <p className="text-sm text-zinc-300">
                Find It or It&apos;s Free &mdash; full refund if we don&apos;t deliver.
              </p>
            </div>
          </FadeInUp>
          <TrustBadges variant="compact" />
        </div>
      </section>

      {/* Global components */}
      <RecentPurchaseNotification />
      <StickyMobileCTA />
    </main>
  );
}
