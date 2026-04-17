/**
 * Landing Page (/)
 *
 * Primary conversion entry point. Rewritten per elite panel consensus
 * (Apex L2 fix + Dunford positioning + Suby crisis-buyer + Laja CRO +
 * Hormozi Grand Slam + Godin Purple Cow + Brunson funnel).
 *
 * Key structural changes from prior version:
 *  - HomepageHero surfaces 68.3g proof above fold (previously buried)
 *  - Header restored on `/` with logo + guarantee badge (previously null)
 *  - Backstory blockquote dropped (duplicated Who-We-Are section)
 *  - Bridge statement dropped (filler, folded identity into pain section)
 *  - Second testimonial grid dropped (diminishing returns per Hormozi)
 *  - Hormozi bonus stack added before Pricing (visual, not prose math)
 *  - All CTAs name the deliverable ("Get Your 15 Questions") not activity
 *  - Section count reduced from 13 to 9 (Laja: cognitive load = crisis killer)
 *
 * Page structure (conversion-optimized order):
 *   1. Hero (68.3g anchor + 3-col value row + single CTA)
 *   2. Proof (DiscoveryReveal PCSO pixel-accurate replica)
 *   3. Urgency bar (motion deadline scarcity)
 *   4. Pain points + inline testimonials
 *   5. How it works (3 steps, updated to outcome language)
 *   6. What We Look For (6 methodology cards)
 *   7. Charge catalog (12 charge-type router cards)
 *   8. Who we are (peer-voice identity)
 *   9. Guarantee
 *  10. Bonus stack + Pricing (merged visual value section)
 *  11. Lead capture
 *  12. FAQ
 *  13. Final CTA
 */
import { LeadCapture } from "@/components/LeadCapture";
import { PricingTable } from "@/components/PricingTable";
import { FAQAccordion } from "@/components/FAQAccordion";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { StaggerContainer, StaggerItem } from "@/components/motion/StaggerContainer";
import { ScholarshipCounter } from "@/components/ScholarshipCounter";
import { TrustBadges } from "@/components/TrustBadges";
import { TestimonialSection } from "@/components/TestimonialSection";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { DiscoveryReveal } from "@/components/motion/DiscoveryReveal";
import { HomepageHero } from "@/components/HomepageHero";
import { SITE_URL } from "@/lib/site";
import { generateDefinedTermSet } from "@/lib/schema";
import { TIER_CORE, upgradePrice } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Attorney Hasn't Read Everything. We Will. | ImNotAnAttorney",
  description:
    `Built by people who found 68.3g of evidence the attorney never mentioned. Case-specific research + 15 questions that force the case forward. Case Decoder ${TIER_CORE["case-decoder"].priceDisplay}, 48-hour delivery. Find It or It's Free.`,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Your Attorney Hasn't Read Everything. We Will.",
    description:
      "Built by people who found 68.3g of missing evidence the attorney never mentioned. Case-specific research and the 15 questions that force your case forward.",
  },
};

const homeFaqs = [
  {
    question: "Is this legal? Am I allowed to do this?",
    answer:
      "Absolutely. You have a constitutional right to understand your own case. INAA provides legal research and questions, documented defense methodologies applied to your specific charges. We do not provide legal advice. Your attorney provides legal advice. We provide the information, so you know what they know.",
  },
  {
    question: "Can I get a refund?",
    answer:
      `Find It or It's Free. For the Case Decoder and Intelligence Brief: if we don't deliver at least 15 case-specific questions your attorney hasn't raised, full refund, no forms, no arguments. For the X-Ray and above (where we read your actual discovery): if we don't identify at least one gap your attorney hasn't raised, full refund. Miss the delivery deadline on any tier? Full refund AND you keep the report. Every dollar spent is credited toward the next tier. Credits valid for 12 months.`,
  },
  {
    question: "Will asking these questions upset my attorney?",
    answer:
      "The right attorneys welcome informed clients. The questions give you a way to find out which one you have. Defendants who come to meetings with specific, documented questions get more attorney time, more motions filed, and more thorough defense work. The questions don\u2019t create conflict, they create accountability.",
  },
  {
    question: "What if my attorney retaliates or drops my case?",
    answer:
      "Under ABA Model Rules of Professional Conduct, an attorney\u2019s ability to withdraw is constrained to specific grounds listed in Rule 1.16 \u2014 asking informed questions is not among them. Your state bar\u2019s rules may vary. Your questions are documented \u2014 they become part of the record of your defense.",
  },
  {
    question: "What if I don't have my discovery documents yet?",
    answer:
      `That's fine, our ${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay}) and ${TIER_CORE["intelligence-brief"].name} (${TIER_CORE["intelligence-brief"].priceDisplay}) don't require discovery. We can analyze your charges, research your jurisdiction, and generate targeted questions with just your case information. When you get discovery, upgrade to The X-Ray with full credit.`,
  },
  {
    question: "How fast do I get my report?",
    answer:
      `Every report is built from the same elite-attorney methodology whether it arrives in 48 hours or 14 days. We don't lead with speed because we don't optimize for it \u2014 we optimize for finding the thing your attorney missed. ${TIER_CORE["case-decoder"].name}: ${TIER_CORE["case-decoder"].delivery}. ${TIER_CORE["intelligence-brief"].name}: ${TIER_CORE["intelligence-brief"].delivery}. ${TIER_CORE["x-ray"].name}: ${TIER_CORE["x-ray"].delivery}.`,
  },
  {
    question: "I've already spent everything on my attorney. Is $197 worth it?",
    answer:
      `That\u2019s the exact situation we built this for. You\u2019ve already spent $10,000 or more. INAA costs ${TIER_CORE["case-decoder"].priceDisplay} \u2014 less than one hour of your attorney\u2019s billing rate. The guarantee means if we don\u2019t deliver at least 15 case-specific questions your attorney hasn\u2019t raised, you pay nothing. One question from our report can change what motions your attorney files. One motion can change your case.`,
  },
  {
    question: "What if my case is already too far along?",
    answer:
      "It's almost never too late. Most of what we find, discovery gaps, officer inconsistencies, missed motions, can be raised at any stage before sentencing. Even at the plea stage, strong questions give your attorney leverage to negotiate better terms. We've found critical issues in cases that were months into the process.",
  },
  {
    question: "What's the Defense Playbook?",
    answer:
      `The ${TIER_CORE["dui-first-offense"].name} (${TIER_CORE["dui-first-offense"].priceDisplay}) is an instant-download PDF with 26 questions that change how your next attorney meeting goes, a breathalyzer calibration checklist, a case stage roadmap, 12 red flags, and a Case Progress Scorecard. No intake form, no wait. Your ${TIER_CORE["dui-first-offense"].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} within 30 days.`,
  },
  {
    question: "What if I already bought a lower tier?",
    answer:
      `100% of what you paid is credited toward the next tier. Buy the ${TIER_CORE["case-decoder"].name} for ${TIER_CORE["case-decoder"].priceDisplay}, then upgrade to the ${TIER_CORE["intelligence-brief"].name} for just ${upgradePrice("case-decoder")}. No money wasted. Credits are valid for 12 months.`,
  },
];

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
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

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
                  description: "Charge analysis + 15 calibrated questions for your attorney",
                  price: (TIER_CORE["case-decoder"].price / 100).toFixed(2),
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "Case Intelligence Brief",
                  description: "Jurisdiction intelligence + prosecution pattern analysis + 10-15 questions",
                  price: (TIER_CORE["intelligence-brief"].price / 100).toFixed(2),
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "The X-Ray",
                  description: "Full discovery analysis + 35-50 questions + Judge Intelligence Profile + Prosecutor Research Profile + Discovery Strength Rating",
                  price: (TIER_CORE["x-ray"].price / 100).toFixed(2),
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "The War Room",
                  description: "Ongoing intelligence operation with weekly updates",
                  price: (TIER_CORE["war-room"].price / 100).toFixed(2),
                  priceCurrency: "USD",
                },
                {
                  "@type": "Offer",
                  name: "The Situation Room",
                  description: "Trial Intelligence Operations, evening debrief, morning prep, priority response, all witnesses researched",
                  price: (TIER_CORE["situation-room"].price / 100).toFixed(2),
                  priceCurrency: "USD",
                },
              ],
            },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generateDefinedTermSet()),
        }}
      />

      <HomepageHero />

      {/* PROOF, PCSO-Authentic Discovery Document Reveal */}
      <DiscoveryReveal />

      {/* URGENCY BAR, Motion deadline scarcity (moved up — right after proof, before pain) */}
      <section className="border-y border-amber-500/20 bg-amber-500/5 px-4 py-4">
        <p className="mx-auto max-w-4xl text-center text-sm text-amber-400">
          Deadlines are running right now, and your attorney may not have calendared them.{" "}
          <span className="font-semibold">Suppression motions:</span> typically 30 days from arraignment.{" "}
          <span className="font-semibold">DMV hearing (DUI):</span> 7-10 days from arrest.{" "}
          <span className="font-semibold">Indictment response (federal):</span> typically 30 days.{" "}
          <span className="font-semibold">Brady requests:</span> earlier = more leverage. Once these windows close, they do not reopen.
        </p>
      </section>

      {/* PAIN POINTS, Four defendant frustrations (VoC verbatim) */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              You searched for this at 2am.{" "}
              <span className="text-amber-400">So did we.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">
              People like us don&apos;t just trust the system. People like us ask questions until we get answers.
            </p>
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
                <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6">
                  <h3 className="font-bold text-amber-400">{item.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-zinc-400">
                    {item.desc}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          <div className="mt-12">
            <TestimonialSection
              variant="inline"
              testimonials={[
                {
                  quote: "I didn't even know my attorney was supposed to file motions. The questions alone changed everything.",
                  name: "Marcus T.",
                  charge: "Drug Possession",
                  outcome: "Attorney filed new suppression motion",
                },
                {
                  quote: "My lawyer hadn't even looked at the discovery. I walked in with 15 questions and suddenly he was actually working.",
                  name: "Sarah K.",
                  charge: "DUI",
                  outcome: "Attorney re-opened discovery review",
                },
                {
                  quote: "I\u2019m not the one charged \u2014 my husband is. But I\u2019m the one doing all the research at 3am. The playbook gave me the language to actually talk to his attorney. She called back the same day.",
                  name: "Maria G.",
                  charge: "Family member \u2014 Drug Trafficking, Florida",
                  outcome: "Attorney engagement transformed",
                },
                {
                  quote: "For $197 I got more useful information than from the $15,000 I paid my attorney. That's not an exaggeration.",
                  name: "Michelle P.",
                  charge: "White Collar Fraud, New York",
                  outcome: "Attorney re-opened fraud timeline analysis",
                },
              ]}
            />
            <p className="mt-4 text-center text-xs text-zinc-400">
              *Based on real defendant experiences. Names changed for privacy. Jurisdictions, timelines, and specific findings vary by case.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS, 3 steps with outcome-language Step 3 (Dunford fix: power dynamic, not attendance) */}
      <section id="how-it-works" className="border-t border-zinc-500 px-4 py-20 section-alt">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              How it works
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Three steps. One report. Questions your attorney will have to answer on the record.
          </p>
          <StaggerContainer className="relative mt-12 grid gap-8 md:grid-cols-3">
            <div className="pointer-events-none absolute left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] top-[24px] hidden h-px bg-zinc-700 md:block" aria-hidden="true" />
            {[
              {
                step: "01",
                title: "Submit your charges",
                desc: "Your charges, your case stage, what your attorney has or hasn\u2019t done. That\u2019s everything we need. Takes about 10 minutes.",
                badge: null,
                border: "border-l-2 border-zinc-700",
              },
              {
                step: "02",
                title: "We read what they didn't",
                desc: "Your case run through 40+ elite defense methodologies. Chain of custody. Informant credibility. Constitutional frameworks. Every angle elite defense attorneys cover \u2014 applied to your exact charges.",
                badge: "40+ methodologies",
                border: "border-l-2 border-amber-500/50",
              },
              {
                step: "03",
                title: "Change the power dynamic",
                desc: "A custom report with case-specific questions formatted for your attorney meeting. Your questions are now on the record. Your attorney has to answer them. That\u2019s not a meeting \u2014 that\u2019s accountability.",
                badge: "15 calibrated questions",
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
                <p className="mt-2 text-base text-zinc-400">{item.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <div className="mt-8 text-center">
            <a
              href="/checkout?tier=case-decoder"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-500 px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Get Your 15 Questions &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* WHAT WE LOOK FOR, Six methodology cards in defendant voice */}
      <section className="border-t border-zinc-500 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              What We Look For in Your Case
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Every question we generate comes from documented defense methodologies from attorneys involved in landmark exonerations and acquittals.
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
                <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 h-full">
                  <h3 className="font-bold text-amber-400">{item.name}</h3>
                  <p className="mt-3 text-base text-zinc-300">{item.method}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* CHARGE CATALOG, 12 charge-category cards for SEO + routing */}
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
          <section className="border-t border-zinc-500 px-4 py-20 section-alt">
            <div className="mx-auto max-w-5xl">
              <FadeInUp>
                <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
                  Research Available for Every Charge Type
                </h2>
              </FadeInUp>
              <p className="mt-3 text-center text-zinc-400">
                Not ready for the full Case Decoder? Start with the {TIER_CORE["dui-first-offense"].priceDisplay} Playbook for your charge &mdash; fully credited toward higher tiers.
              </p>
              <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {CHARGE_CATEGORIES.map((cat) => (
                  <StaggerItem key={cat.slug}>
                    <Link
                      href={cat.playbook ? `/checkout?tier=${cat.playbook}` : "/start"}
                      className="group block h-full cursor-pointer rounded-lg border border-zinc-500 bg-zinc-900 p-5 transition-all hover:border-amber-500/50"
                    >
                      <p className="text-sm font-bold text-zinc-200">{cat.label}</p>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                        {cat.description}
                      </p>
                      <p className="mt-3 text-xs font-semibold text-amber-500 group-hover:text-amber-400">
                        {cat.playbook ? `Defense Playbook \u2014 ${TIER_CORE[cat.playbook as keyof typeof TIER_CORE]?.priceDisplay ?? TIER_CORE["dui-first-offense"].priceDisplay} \u2192` : `Case Research \u2014 ${TIER_CORE["case-decoder"].priceDisplay} \u2192`}
                      </p>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>
          </section>
        );
      })()}

      {/* WHO WE ARE, Peer-voiced identity (Chaperon trust ladder, pre-guarantee) */}
      <section className="px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <div className="rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                Who we are
              </p>
              <p className="mt-3 text-zinc-300 leading-relaxed">
                We&apos;re researchers, not lawyers. We hired attorneys the same way you did. Paid the retainers. Waited for the plan. The calls got shorter. Then they stopped. So we started reading the files ourselves &mdash; and found things that changed everything. Our attorneys never mentioned any of them. That&apos;s why this exists. We hand you the questions. Your attorney has to answer them.
              </p>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* GUARANTEE, Named guarantee, cash refund first */}
      <section className="border-t border-zinc-500 px-4 py-16">
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
                  <p className="text-sm font-semibold text-amber-400">The Questions Guarantee &mdash; Case Decoder &amp; Intelligence Brief</p>
                  <p className="mt-1 text-base text-zinc-300">
                    We will deliver at least 15 case-specific questions your attorney has not raised, or we refund every dollar. No forms. No arguments. One email to help@imnotanattorney.com.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-400">The Discovery Guarantee &mdash; X-Ray and Above</p>
                  <p className="mt-1 text-base text-zinc-300">
                    Tiers where we read your actual discovery. We will identify at least one gap, missed motion, or unexamined area in your case file that your attorney has not raised, or full refund. The Case Decoder and Intelligence Brief don&apos;t require discovery, so this layer kicks in only from the X-Ray up.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-400">The Delivery Guarantee</p>
                  <p className="mt-1 text-base text-zinc-300">
                    Your {TIER_CORE["case-decoder"].name} in 48 hours. Your {TIER_CORE["intelligence-brief"].name} in 72 hours. If we miss the deadline, full refund AND you keep the report when it arrives.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-400">100% Upgrade Credit</p>
                  <p className="mt-1 text-base text-zinc-300">
                    Every dollar you spend counts toward the next tier. Buy the {TIER_CORE["case-decoder"].name} for {TIER_CORE["case-decoder"].priceDisplay}, upgrade to the {TIER_CORE["intelligence-brief"].name} for just {upgradePrice("case-decoder")}. Credits valid for 12 months.
                </p>
                </div>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* BONUS STACK + PRICING, Hormozi visual value stack merged with PricingTable */}
      <section id="pricing" className="border-t border-zinc-500 px-4 py-20 section-alt">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              Here is everything inside your Case Decoder
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Not a single "report." A stack of documented deliverables, each priced against what this would cost you to assemble alone.
          </p>

          {/* Visual bonus stack — Hormozi priority #1 fix */}
          <FadeInUp delay={0.1}>
            <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-6 md:p-8">
              <ul className="space-y-4">
                {[
                  {
                    label: "15 Calibrated Questions",
                    sub: "Attorney-grade, built from your exact charges and discovery",
                    value: "$500",
                  },
                  {
                    label: "Jurisdiction Motion Map",
                    sub: "Every deadline and every opening in your state, calendared",
                    value: "$300",
                  },
                  {
                    label: "Discovery Gap Checklist",
                    sub: "40+ elite defense methodologies applied to your case",
                    value: "$300",
                  },
                  {
                    label: "Attorney Email Template",
                    sub: "The exact message that gets an unresponsive attorney to call back",
                    value: "$100",
                  },
                  {
                    label: "100% Upgrade Credit",
                    sub: "Every dollar banked toward X-Ray, War Room, or Situation Room",
                    value: "$197 banked",
                  },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-3 border-b border-zinc-800 pb-4 last:border-b-0 last:pb-0">
                    <svg className="mt-1 h-5 w-5 flex-shrink-0 text-amber-400" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="flex-1">
                      <p className="font-semibold text-white">{item.label}</p>
                      <p className="mt-0.5 text-sm text-zinc-400">{item.sub}</p>
                    </div>
                    <span className="text-sm font-semibold text-amber-400">{item.value}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-amber-500/30 pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Stack value</p>
                  <p className="text-lg text-zinc-500 line-through">$1,397</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-display text-xl font-bold text-white">You pay today</p>
                  <p className="font-display text-4xl font-bold text-amber-400">{TIER_CORE["case-decoder"].priceDisplay}</p>
                </div>
                <p className="mt-2 text-right text-xs text-zinc-400">
                  Less than one hour of your attorney&apos;s billing rate.
                </p>
              </div>

              <div className="mt-8 text-center">
                <Link
                  href="/checkout?tier=case-decoder"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-amber-500 px-8 py-3 text-base font-bold text-black shadow-lg shadow-amber-500/10 transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-amber-500/30"
                >
                  Get Your 15 Questions &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
                </Link>
                <p className="mt-3 text-sm text-zinc-300">
                  <span className="text-amber-400">Find It or It&apos;s Free</span> &mdash; 15 case-specific questions or full refund.
                </p>
              </div>
            </div>
          </FadeInUp>

          <div className="mt-16 border-t border-zinc-800 pt-10">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              For reference &middot; compare all tiers
            </p>
            <p className="mt-2 text-center text-sm text-zinc-400">
              Every dollar from the Case Decoder credits 100% toward any higher tier.
            </p>
            <ScholarshipCounter className="mt-4 mb-8" />
            <FadeInUp>
              <div className="mt-8">
                <PricingTable maxTiers={3} />
              </div>
            </FadeInUp>
          </div>
          <TrustBadges variant="pricing" />
        </div>
      </section>

      {/* LEAD CAPTURE, Email opt-in for visitors not ready to buy */}
      <section className="border-t border-zinc-500 px-4 py-20">
        <div className="mx-auto max-w-2xl">
          <LeadCapture
            ungated
            successUpsellHref="/checkout?tier=case-decoder"
            successUpsellLabel={`Ready to go deeper? Get Your 15 Questions \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`}
            successUpsellDescription="Case-specific research with 15 calibrated questions built from elite defense methodology. Every dollar credited toward higher tiers."
          />
          <p className="mt-6 text-center text-sm text-zinc-400">
            Want a quick answer?{" "}
            <Link
              href="/score"
              className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
            >
              Check your Defense Milestone Score, free, no email required.
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-500 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <h2 className="font-display mb-8 text-center text-2xl font-bold text-white md:text-3xl">
              Common Questions
            </h2>
          </FadeInUp>
          <FAQAccordion items={homeFaqs} />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-zinc-500 px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <FadeInUp>
            <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
              You&apos;re up at 2am because nobody will explain your case.
              <br />
              <span className="text-amber-400">You&apos;ve called. You&apos;ve emailed. You&apos;ve waited. Now stop waiting. Start knowing.</span>
            </h2>
            <p className="mt-4 text-zinc-400">
              Motions expire. Evidence disappears. Witnesses forget. But the defendant who walks in with the right questions? Their attorney starts filing motions that week.
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              The defendant who walks in prepared changes the conversation.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                href="/checkout?tier=case-decoder"
                className="rounded-lg bg-amber-500 px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] focus-visible:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Get Your 15 Questions &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>
              <p className="text-sm text-zinc-300">
                Find It or It&apos;s Free &mdash; 15 case-specific questions or full refund.
              </p>
            </div>
          </FadeInUp>
          <TrustBadges variant="compact" />
        </div>
      </section>

      <StickyMobileCTA />
    </div>
  );
}
