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
import { SITE_URL } from "@/lib/site";
import { TIER_CORE, upgradePrice } from "@/lib/tiers";
import Link from "next/link";
import type { Metadata } from "next";

/** Page-level metadata. Title uses VoC emotional hook for SEO + social click-through. */
export const metadata: Metadata = {
  title: "ImNotAnAttorney — The Questions Your Attorney Hopes You Never Ask",
  description:
    `Your lawyer won't call you back? We research your case and hand you the exact questions that hold your attorney accountable. Starting at ${TIER_CORE["case-decoder"].priceDisplay}.`,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Your Lawyer Won't Call You Back. We Give You the Questions That Make Them.",
    description:
      "You're scared. Confused. Nobody's explaining your case. We research your charges and hand you the exact questions that hold your attorney accountable.",
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
    question: "Will asking these questions upset my attorney?",
    answer:
      "Good attorneys welcome informed clients. Asking educated questions isn't adversarial — it's your right. The lawyers who get angry when you push back? They're the reason you're here.",
  },
  {
    question: "Is this legal advice?",
    answer:
      "No. We provide legal research, case analysis, and questions — not legal advice. Your attorney provides legal advice. We research. You ask.",
  },
  {
    question: "What if I don't have my discovery documents yet?",
    answer:
      `That's fine — our ${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay}) and ${TIER_CORE["intelligence-brief"].name} (${TIER_CORE["intelligence-brief"].priceDisplay}) don't require discovery. We can analyze your charges, research your judge, and generate targeted questions with just your case information. When you get discovery, upgrade to The X-Ray with full credit.`,
  },
  {
    question: "Do you work on federal cases?",
    answer:
      "Yes. From misdemeanor DUIs to federal indictments — we research every case type. The more complex your case, the more questions your attorney should be answering.",
  },
  {
    question: "How fast do I get my report?",
    answer:
      `${TIER_CORE["case-decoder"].name}: ${TIER_CORE["case-decoder"].delivery}. ${TIER_CORE["intelligence-brief"].name}: ${TIER_CORE["intelligence-brief"].delivery}. ${TIER_CORE["x-ray"].name}: ${TIER_CORE["x-ray"].delivery}. ${TIER_CORE["war-room"].name}: ${TIER_CORE["war-room"].delivery.split(" +")[0]} initial + weekly updates. ${TIER_CORE["situation-room"].name}: ${TIER_CORE["situation-room"].delivery} with Trial Intelligence Operations.`,
  },
  {
    question: "What if I already bought a lower tier?",
    answer:
      `100% of what you paid is credited toward the next tier. Buy the ${TIER_CORE["case-decoder"].name} for ${TIER_CORE["case-decoder"].priceDisplay}, then upgrade to the ${TIER_CORE["intelligence-brief"].name} for just ${upgradePrice("case-decoder")}. No money wasted. Credits are valid for 12 months.`,
  },
  {
    question: "Can I get a refund?",
    answer:
      "Two guarantees. Delivery: if we miss the stated deadline or question count, full cash refund — no questions asked. Satisfaction: if your delivered report doesn't help, contact us within 30 days for 100% credit toward any higher tier. Upgrade credits apply to purchases you keep.",
  },
  {
    question: "What's the Defense Playbook?",
    answer:
      `The ${TIER_CORE["dui-first-offense"].name} (${TIER_CORE["dui-first-offense"].priceDisplay}) is an instant-download PDF with 26 questions your DUI attorney hopes you never ask, a breathalyzer calibration checklist, a case stage roadmap, 12 red flags, and a Case Progress Scorecard. No intake form, no wait — built from 40+ elite defense attorneys' documented strategies. Your ${TIER_CORE["dui-first-offense"].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} within 30 days.`,
  },
  {
    question: "What if my case is already too far along?",
    answer:
      "It's almost never too late. Most of what we find — discovery gaps, officer inconsistencies, missed motions — can be raised at any stage before sentencing. Even at the plea stage, strong questions give your attorney leverage to negotiate better terms. We've found critical issues in cases that were months into the process.",
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
              Built on a real trafficking case. Powered by 40+ elite defense attorneys.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
              Your Lawyer Won&apos;t Call You Back.
              <br />
              <span className="text-amber-400">We&apos;ll Give You the Questions That Make Them.</span>
            </h1>
          </FadeInUp>
          <FadeInUp delay={0.2}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
              You&apos;re scared. Confused. Nobody&apos;s explaining your case.
              We research your charges, find the details that matter, and hand
              you the exact questions that hold your attorney accountable.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.25}>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400">
              Built from the documented tactics of 40+ elite defense attorneys —
              the ones who win landmark cases and set the strategies other
              attorneys follow. We&apos;re not lawyers. We&apos;re researchers —
              and that&apos;s exactly why we catch what they miss.
            </p>
          </FadeInUp>
          <FadeInUp delay={0.3}>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/checkout?tier=case-decoder"
                className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                Get the Questions That Make Your Lawyer Act — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
              </Link>
              <Link
                href="/sample"
                className="rounded-lg border border-zinc-700 px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:border-zinc-500 hover:shadow-lg"
              >
                See What We Found in a Real Case &rarr;
              </Link>
            </div>
          </FadeInUp>
          <FadeInUp delay={0.35}>
            <p className="mt-3 text-sm font-semibold text-amber-500">
              <AnimatedCounter target={500} suffix="+" className="text-amber-400" /> defendants armed with the right questions &middot; We Research. You Ask.
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
      {/* PROOF SECTION — Real Case Findings                                */}
      {/* Shows three specific findings from a real trafficking case.          */}
      {/* Placed high on page (above pain points)                             */}
      {/* because specificity converts better than empathy alone.           */}
      {/*   - 73% weight discrepancy (93.9g scene vs 25.59g lab = 68.3g)   */}
      {/*   - CI phone dual attribution (Franks v. Delaware issue)          */}
      {/*   - Drug type variance (amphetamine charged, MDMA/MDA found)     */}
      {/* Each card attributes the finding to a named attorney's method.    */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-zinc-800 px-4 py-20 section-alt">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              What we actually found in a real case
            </h2>
            <p className="mt-3 text-center text-zinc-400">
              This system was built by defendants — people who faced the same charges you&apos;re facing now. Here&apos;s what the analysis uncovered in one real trafficking case — issues the attorney hadn&apos;t raised.
            </p>
          </FadeInUp>
          <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-3">
            <StaggerItem>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400"><AnimatedCounter target={73} suffix="%" /></div>
              <p className="mt-1 text-sm font-semibold text-white">Weight Discrepancy</p>
              <p className="mt-2 text-sm text-zinc-400">
                Scene weight: 93.9g. Lab weight: 25.59g. That&apos;s 68.3g missing — enough to change the charge tier entirely. The attorney never flagged it.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Identified using chain of custody protocols — tracking every hand that touched the evidence. The same methodology used in landmark DNA exoneration cases.
              </p>
            </div>
            </StaggerItem>
            <StaggerItem>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">CI Phone</div>
              <p className="mt-1 text-sm font-semibold text-white">Dual Attribution</p>
              <p className="mt-2 text-sm text-zinc-400">
                Same phone number attributed to BOTH the confidential informant and the defendant. Same detective, same report. A Franks issue — the officer listed the same phone number for two different people in the warrant — hiding in plain sight.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Flagged using informant investigation methodology — proven in high-profile federal defense cases.
              </p>
            </div>
            </StaggerItem>
            <StaggerItem>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">Fatal</div>
              <p className="mt-1 text-sm font-semibold text-white">Drug Type Variance</p>
              <p className="mt-2 text-sm text-zinc-400">
                Officers said &ldquo;amphetamine&rdquo; on scene. Lab found MDMA/MDA — a completely different substance. That&apos;s a fatal variance the state had to amend.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Identified via substance identification protocol — applied to federal drug cases.
              </p>
            </div>
            </StaggerItem>
          </StaggerContainer>
          <p className="mt-8 text-center text-sm text-zinc-400">
            This is what our analysis finds. These are the questions your attorney should be asking — but isn&apos;t.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Link
              href="/sample"
              className="text-sm font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
            >
              See the full sample report from this case →
            </Link>
            <Link
              href="/about"
              className="text-xs text-zinc-500 underline decoration-zinc-500/50 hover:text-zinc-400"
            >
              Read the full story →
            </Link>
          </div>
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
                desc: "You scraped that retainer together \u2014 borrowed from family, drained savings. Now you can\u2019t even get a status update on your own case. That\u2019s not frustrating. That\u2019s betrayal.",
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
            People like us read the discovery ourselves.
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
          <StaggerContainer className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell us about your case",
                desc: "Share your charges, your stage, and what your attorney has (or hasn't) done. Takes 10 minutes. For deeper tiers, upload your discovery documents.",
              },
              {
                step: "02",
                title: "We research everything",
                desc: "We run your case through a research system built on 40+ elite defense attorneys — their documented tactics, their specific playbooks, their winning frameworks. Chain of custody protocols used in 375+ exonerations. Informant credibility methodologies proven in high-profile federal cases. Constitutional arguments — the rights-based challenges that have overturned convictions. Investigation patterns from attorneys who never lost. We generate the questions they would ask if they were reading your file.",
              },
              {
                step: "03",
                title: "You ask the questions",
                desc: "We hand you a custom report with pointed, specific questions. You bring them to your next meeting. Suddenly, motions get filed. Calls get returned. Your defense gets real.",
              },
            ].map((item) => (
              <StaggerItem key={item.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-lg font-bold text-amber-400">
                  {item.step}
                </div>
                <h3 className="mt-4 font-bold text-white">{item.title}</h3>
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
            Every year, defendants spend $10,000+ on attorneys who file zero motions, return zero calls, and push for a plea without reviewing discovery.
          </p>
          <StaggerContainer className="mt-8 grid gap-4 md:grid-cols-3">
            <StaggerItem>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="text-2xl font-bold text-red-400">$10K-$100K+</div>
                <p className="mt-2 text-sm text-zinc-400">
                  You already paid your attorney this much
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="text-2xl font-bold text-red-400">1-20 years</div>
                <p className="mt-2 text-sm text-zinc-400">
                  What a conviction could cost you
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
                <div className="text-2xl font-bold text-amber-400">{TIER_CORE["case-decoder"].priceDisplay}-{TIER_CORE["situation-room"].priceDisplay}</div>
                <p className="mt-2 text-sm text-zinc-400">
                  What it costs to make sure your defense is real
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
              <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-bold text-white">
              The Questions Work or Your Money Back
            </h2>
            <div className="mt-6 space-y-4 text-left">
              <div>
                <p className="text-sm font-semibold text-amber-400">Full Cash Refund</p>
                <p className="mt-1 text-sm text-zinc-300">
                  If we miss the stated delivery deadline or question count — full cash refund, no questions asked.
                  {" "}{TIER_CORE["case-decoder"].name} ({TIER_CORE["case-decoder"].priceDisplay}) and {TIER_CORE["intelligence-brief"].name} ({TIER_CORE["intelligence-brief"].priceDisplay}) included.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-400">100% Upgrade Credit</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Not satisfied after delivery? 100% credit toward any higher tier within 30 days. Every dollar you spend counts.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-400">Premium Tiers ({TIER_CORE["x-ray"].name}+)</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Delivery guarantee — every deliverable completed on schedule, or a full refund. Custom research begins upon intake.
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
          <LeadCapture />
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
              You&apos;re up at 2am Googling your charges
              <br />
              <span className="text-amber-400">because nobody will explain anything to you &mdash; or anyone who loves you.</span>
            </h2>
            <p className="mt-4 text-zinc-400">
              Motions expire. Evidence disappears. Witnesses forget. But the
              defendant who walks in with the right questions? Their lawyer
              starts filing motions that week.
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-300">
              Be the defendant your attorney wasn&apos;t expecting.
            </p>
            <Link
              href="/checkout?tier=case-decoder"
              className="mt-8 inline-block rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
            >
              Get the Questions That Make Your Lawyer Act — {TIER_CORE["case-decoder"].priceDisplay} &rarr;
            </Link>
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
