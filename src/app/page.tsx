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
 *   1. Hero — H1 with the 73% weight discrepancy hook + dual CTA (buy / sample)
 *   2. Proof — Real case findings (weight, CI phone, drug type) with attorney attributions
 *   3. Urgency bar — Motion deadline scarcity
 *   4. Pain points — Four defendant frustrations that validate the visitor's situation
 *   5. Bridge — Identity statement ("people like us read the discovery ourselves")
 *   6. How it works — 3-step process (tell us, we research, you ask)
 *   7. Attorneys behind your questions — Credibility via 40+ named attorneys
 *   8. Value anchor — Stakes comparison ($10K-$100K attorney vs $197-$9,997 service)
 *   9. Guarantee — Tiered guarantee (delivery + satisfaction)
 *  10. Pricing — PricingTable component (first 3 tiers shown on landing page)
 *  11. Lead capture — Email opt-in for non-buyers
 *  12. FAQ — Schema-marked FAQ accordion (7 questions, SEO + objection handling)
 *  13. Final CTA — Urgency close with deadline framing
 *
 * SEO: FAQ schema markup (FAQPage JSON-LD) injected for rich snippets.
 * OG/meta: Title uses the 73% weight discrepancy hook for social sharing.
 */
import { LeadCapture } from "@/components/LeadCapture";
import { PricingTable } from "@/components/PricingTable";
import { FAQAccordion } from "@/components/FAQAccordion";
import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import type { Metadata } from "next";

/** Page-level metadata. Title uses the real case hook for SEO + social click-through. */
export const metadata: Metadata = {
  title: "ImNotAnAttorney — We Found a 73% Weight Discrepancy Your Attorney Missed",
  description:
    "Legal empowerment for criminal defendants. We research your case and generate the questions that hold your attorney accountable. Starting at $197.",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "ImNotAnAttorney — We Found a 73% Weight Discrepancy Your Attorney Missed",
    description:
      "We dig through your discovery, find what your lawyer missed, and hand you the exact questions that make them start working.",
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
      "That's fine — our Case Decoder ($197) and Intelligence Brief ($997) don't require discovery. We can analyze your charges, research your judge, and generate targeted questions with just your case information. When you get discovery, upgrade to The X-Ray with full credit.",
  },
  {
    question: "Do you work on federal cases?",
    answer:
      "Yes. From misdemeanor DUIs to federal indictments — we research every case type. The more complex your case, the more questions your attorney should be answering.",
  },
  {
    question: "How fast do I get my report?",
    answer:
      "Case Decoder: 24 hours. Intelligence Brief: 48-72 hours. The X-Ray: 10 business days. War Room: 25-28 days initial + weekly updates. Situation Room: 24-48hr priority turnaround with Trial Intelligence Operations.",
  },
  {
    question: "What if I already bought a lower tier?",
    answer:
      "100% of what you paid is credited toward the next tier. Buy the Case Decoder for $197, then upgrade to the Intelligence Brief for just $800. No money wasted. Credits are valid for 12 months.",
  },
  {
    question: "Can I get a refund?",
    answer:
      "Two guarantees. Delivery: if we miss the stated deadline or question count, full cash refund — no questions asked. Satisfaction: if your delivered report doesn't help, contact us within 30 days for 100% credit toward any higher tier. Upgrade credits apply to purchases you keep.",
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

      {/* ------------------------------------------------------------------ */}
      {/* HERO SECTION                                                      */}
      {/* The H1 leads with the 73% weight discrepancy — a real, specific   */}
      {/* finding that immediately differentiates us from generic legal      */}
      {/* services. Subtext adds CI phone, drug type, and fingerprint       */}
      {/* findings for credibility. Two CTAs:                               */}
      {/*   Primary: "Find What's in My Case — $197" -> /checkout           */}
      {/*   Secondary: "See What We Found" -> /sample (proof before buy)    */}
      {/* Below CTAs: free score link (/score) as low-commitment fallback.  */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 pb-20 pt-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-amber-500">
            Built on a real trafficking case. Powered by 40+ elite defense attorneys.
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            We Found a 73% Weight Discrepancy.
            <br />
            <span className="text-amber-400">The Attorney Found Zero.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            CI phone number attributed to both informant and defendant. Drug
            type misidentified. 21 fingerprints — zero matching. We found it
            all in the discovery. We can do the same for yours.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400">
            Our research is built on the tactics of Gerry Spence (never lost a
            criminal case), Barry Scheck (Innocence Project, OJ Simpson DNA
            defense), Jeffrey Lichtman (El Chapo, John Gotti Jr.), and 37 more
            of the most dangerous defense attorneys who ever practiced.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/checkout?tier=case-decoder"
              className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Find What&apos;s in My Case — $197 →
            </Link>
            <Link
              href="/sample"
              className="rounded-lg border border-zinc-700 px-8 py-4 text-sm font-semibold text-white transition-colors hover:border-zinc-500"
            >
              See What We Found in a Real Case →
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            We&apos;re not attorneys. We&apos;re researchers — and that&apos;s
            exactly why we find what they miss.
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            Or{" "}
            <Link
              href="/score"
              className="font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
            >
              check your attorney&apos;s score — free →
            </Link>
          </p>
          <p className="mt-2 text-sm font-semibold text-amber-500">
            We Read the Discovery. You Ask the Questions.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PROOF SECTION — Real Case Findings                                */}
      {/* Shows three specific findings from Rahim's actual trafficking     */}
      {/* case (23-01773-CF). Placed high on page (above pain points)       */}
      {/* because specificity converts better than empathy alone.           */}
      {/*   - 73% weight discrepancy (93.9g scene vs 25.59g lab = 68.3g)   */}
      {/*   - CI phone dual attribution (Franks v. Delaware issue)          */}
      {/*   - Drug type variance (amphetamine charged, MDMA/MDA found)     */}
      {/* Each card attributes the finding to a named attorney's method.    */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            What we actually found in a real case
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            This system was built by Rahim Kapadia — a real defendant facing drug trafficking charges in St. Petersburg, Florida. Here&apos;s what the analysis uncovered — issues his attorney hadn&apos;t raised.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">73%</div>
              <p className="mt-1 text-sm font-semibold text-white">Weight Discrepancy</p>
              <p className="mt-2 text-sm text-zinc-400">
                Scene weight: 93.9g. Lab weight: 25.59g. That&apos;s 68.3g missing — enough to change the charge tier entirely. The attorney never flagged it.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Identified using Barry Scheck&apos;s chain of custody protocol — the same methodology used in the OJ Simpson DNA defense.
              </p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">CI Phone</div>
              <p className="mt-1 text-sm font-semibold text-white">Dual Attribution</p>
              <p className="mt-2 text-sm text-zinc-400">
                Same phone number attributed to BOTH the confidential informant and the defendant. Same detective, same report. A Franks v. Delaware issue hiding in plain sight.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Flagged using Jeffrey Lichtman&apos;s investigation pattern framework — Lichtman&apos;s informant destruction method won 3 mistrials for John Gotti Jr. and led El Chapo&apos;s defense.
              </p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/50 p-6">
              <div className="text-3xl font-bold text-red-400">Fatal</div>
              <p className="mt-1 text-sm font-semibold text-white">Drug Type Variance</p>
              <p className="mt-2 text-sm text-zinc-400">
                Officers said &ldquo;amphetamine&rdquo; on scene. Lab found MDMA/MDA — a completely different substance. That&apos;s a fatal variance the state had to amend.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Identified via Ron Chapman II&apos;s substance identification protocol — Chapman exploits prosecutorial complacency in federal cases.
              </p>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-zinc-400">
            This is what our analysis finds. These are the questions your attorney should be asking — but isn&apos;t.
          </p>
          <div className="mt-6 text-center">
            <Link
              href="/sample"
              className="text-sm font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
            >
              See the full sample report from this case →
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
      {/* PAIN POINTS — Four defendant frustrations                         */}
      {/* Validates the visitor's situation by naming exact feelings:        */}
      {/*   - Attorney never calls back                                     */}
      {/*   - Can't understand discovery                                    */}
      {/*   - Feels like getting railroaded                                 */}
      {/*   - Paying thousands for silence                                  */}
      {/* These map directly to Reddit/forum posts from r/legaladvice.      */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            Some defendants take what they get.{" "}
            <span className="text-amber-400">You&apos;re not one of them.</span>
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              {
                title: "Your attorney never calls you back",
                desc: "You left three voicemails. Two emails. A carrier pigeon. Nothing. Meanwhile, your next court date is in two weeks and you have no idea what's happening.",
              },
              {
                title: "You don't understand your own discovery",
                desc: "They handed you a stack of papers and said \"review this.\" Review what? It's police reports, lab results, and witness statements written in legalese.",
              },
              {
                title: "You feel like you're getting railroaded",
                desc: "Plea deal after plea deal. No motions filed. No investigation. No fight. Just \"take the deal\" on repeat — and no one can explain why.",
              },
              {
                title: "You're paying thousands but getting silence",
                desc: "You scraped together that $10K retainer — borrowed from family, drained savings. Now you can't even get a status update on your own case. That's not frustrating. That's betrayal.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {item.desc}
                </p>
              </div>
            ))}
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
      <section id="how-it-works" className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Three steps. Ten minutes. Questions your attorney won&apos;t expect.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Tell us about your case",
                desc: "Share your charges, your stage, and what your attorney has (or hasn't) done. Takes 10 minutes. For deeper tiers, upload your discovery documents.",
              },
              {
                step: "02",
                title: "We research everything",
                desc: "We run your case through a research system built on 40+ elite defense attorneys — their documented tactics, their specific playbooks, their winning frameworks. Barry Scheck's chain of custody protocol (OJ, 375+ Innocence Project exonerations). Jeffrey Lichtman's confidential informant destruction playbook (El Chapo, Gotti Jr.). Alan Dershowitz's constitutional appellate framework. Gerry Spence's investigation patterns (never lost a criminal case). We generate the questions they would ask if they were reading your file.",
              },
              {
                step: "03",
                title: "You ask the questions",
                desc: "We hand you a custom report with pointed, specific questions. You bring them to your next meeting. Suddenly, motions get filed. Calls get returned. Your defense gets real.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-lg font-bold text-amber-400">
                  {item.step}
                </div>
                <h3 className="mt-4 font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
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
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            The Attorneys Behind Your Questions
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Every question we generate traces to a documented winning method.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: "Barry Scheck",
                record: "Innocence Project (375+ exonerations), OJ Simpson DNA defense",
                method: "Chain of custody protocol applied to every discovery review.",
              },
              {
                name: "Jeffrey Lichtman",
                record: "Gotti Jr. (charges dismissed), El Chapo lead counsel",
                method: "7-pillar CI destruction playbook for every CI/cooperator question.",
              },
              {
                name: "Gerry Spence",
                record: "Never lost a criminal case",
                method: "Investigation pattern analysis — find the one fact that destroys everything.",
              },
              {
                name: "F. Lee Bailey",
                record: "Sam Sheppard retrial acquittal, OJ defense team",
                method: "5-phase trap sequence for witness examination questions.",
              },
              {
                name: "Alan Dershowitz",
                record: "Harvard Law youngest full professor, Von Bulow reversal",
                method: "Constitutional hooks for motion/appellate issues.",
              },
              {
                name: "Ron Chapman II",
                record: "Federal drug defense specialist, former prosecutor",
                method: "Weight discrepancy and substance variance protocols for drug cases.",
              },
            ].map((attorney) => (
              <div
                key={attorney.name}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
              >
                <h3 className="font-bold text-amber-400">{attorney.name}</h3>
                <p className="mt-1 text-xs text-zinc-400">{attorney.record}</p>
                <p className="mt-3 text-sm text-zinc-300">{attorney.method}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-zinc-400">
            Plus: Johnnie Cochran. Jose Baez. Alan Jackson (Karen Read, 2025).
            Roy Black. Benjamin Brafman. Mark Geragos. Barry Berke. Robert
            Shapiro. Tom Mesereau. And 28 more.
          </p>
        </div>
      </section>

      {/* VALUE ANCHOR — Stakes comparison. Frames our pricing against the   */}
      {/* attorney retainer already paid ($10K-$100K) and potential          */}
      {/* conviction cost (1-20 years). Makes $197-$9,997 feel small.       */}
      <section className="border-t border-zinc-800 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            What&apos;s at stake?
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="text-2xl font-bold text-red-400">$10K-$100K+</div>
              <p className="mt-2 text-sm text-zinc-400">
                You already paid your attorney this much
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="text-2xl font-bold text-red-400">1-20 years</div>
              <p className="mt-2 text-sm text-zinc-400">
                What a conviction could cost you
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
              <div className="text-2xl font-bold text-amber-400">$197-$9,997</div>
              <p className="mt-2 text-sm text-zinc-400">
                What it costs to make sure your defense is real
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* GUARANTEE SECTION — Tiered guarantees to reduce purchase risk.     */}
      {/* Lower tiers ($197/$997): Full cash refund if delivery or question */}
      {/* count missed + 100% credit toward upgrade within 30 days.         */}
      {/* Higher tiers ($1,497+): Delivery guarantee only (custom research  */}
      {/* begins on intake, non-refundable once delivered).                  */}
      <section className="border-t border-zinc-800 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8">
            <h2 className="text-2xl font-bold text-white">
              Our Guarantee
            </h2>
            <div className="mt-6 space-y-4 text-left">
              <div>
                <p className="text-sm font-semibold text-amber-400">Case Decoder ($197) &amp; Intelligence Brief ($997)</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Delivered within the stated timeframe with the guaranteed question
                  count — or a full cash refund. Not satisfied? 100% credit toward
                  any higher tier within 30 days.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-400">The X-Ray ($1,497), War Room ($3,497) &amp; Situation Room ($9,997)</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Delivery guarantee — every deliverable completed on schedule, or a
                  full refund. These services involve substantial custom research
                  that begins upon intake. Work performed and delivered is
                  non-refundable.
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              Upgrade credits apply to purchases you keep.
            </p>
          </div>
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
      <section id="pricing" className="border-t border-zinc-800 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">
            Pick your level of defense intelligence
          </h2>
          <p className="mt-3 text-center text-zinc-400">
            Every tier draws from the same intelligence base: 40+ elite defense
            attorneys, their documented tactics, their proven frameworks. The
            tier determines how deep we go.
          </p>
          <p className="mt-2 text-center text-sm text-zinc-400">
            Defendants who fight back with research choose their tier. Start at
            $197 — upgrade anytime with full credit.
          </p>
          <div className="mt-12">
            <PricingTable maxTiers={3} />
          </div>
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
          <h2 className="mb-8 text-center text-2xl font-bold text-white md:text-3xl">
            Common Questions
          </h2>
          <FAQAccordion items={homeFaqs} />
        </div>
      </section>

      {/* FINAL CTA — Urgency close. Frames inaction as the risk            */}
      {/* ("motions expire, evidence disappears, witnesses forget").        */}
      {/* Single CTA to Case Decoder at $197 — lowest commitment action.   */}
      <section className="border-t border-zinc-800 px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Every day you wait is a day closer to a deadline
            <br />
            <span className="text-amber-400">your attorney might miss.</span>
          </h2>
          <p className="mt-4 text-zinc-400">
            Motions expire. Evidence disappears. Witnesses forget. The only
            thing that doesn&apos;t change is what you&apos;re facing.
          </p>
          <p className="mt-3 text-sm font-semibold text-zinc-300">
            Informed defendants don&apos;t wait to find out what their attorney
            missed.
          </p>
          <Link
            href="/checkout?tier=case-decoder"
            className="mt-8 inline-block rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Find What&apos;s in My Case — $197 →
          </Link>
        </div>
      </section>
    </>
  );
}
