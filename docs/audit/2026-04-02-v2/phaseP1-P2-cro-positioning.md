# Phase P1-P2: CRO + Positioning & Trust Audit

**Date:** 2026-04-02
**Framework:** Peep Laja (CRO), April Dunford (Positioning), INAA Evaluation Team criteria
**Site:** imnotanattorney.com
**Context:** YMYL legal info site. Crisis buyers at 3AM. $97-$9,997 products. Anonymous brand. Pro-defendant, never anti-attorney.

---

## PART 1: CRO PASS (Peep Laja's 5-Component Framework)

### Page-by-Page Scoring

---

### 1. Homepage (`/`, page.tsx + HomepageHero.tsx)

**Clarity (9/10):** H1 "Your Case File Has Answers. We Find Them. Now You Know." communicates what the product is within 3 seconds. The "Built by a defendant who read his own 500-page discovery file" line anchors the identity. The charge-type selector immediately narrows the buyer's context. Minor deduction: the hero CTA label shifts dynamically based on selection state, which could momentarily confuse first-time visitors.

**Relevance (10/10):** Pain points use VoC verbatim from defendant forums ("My lawyer won't return my calls. My court date is Monday." / "Nobody explained anything to me."). The 5th pain card directly addresses family members doing research at 2am. The charge catalog with 12 categories ensures every visitor sees their situation represented.

**Value (9/10):** Value stack on the PricingTable component shows attorney cost comparisons ($500 consultation, $1,500 second opinion). The "less than one hour of your attorney's billing rate" framing in the stakes section is effective. Guarantee section ("Find It or It's Free") is strong. The 68.3g evidence story in the OG description is a powerful proof point. Minor gap: the hero value proposition "Case-specific research that uncovers what your case file actually contains" runs to 17 words, could be tighter.

**Differentiation (8/10):** "Built by a defendant who read his own 500-page discovery file" is a differentiator no competitor can match. The 40+ attorney methodology framework creates category authority. The DiscoveryReveal component (PCSO document) is a strong artifact proof. The "information gap" framing is clear: everyone in the courtroom knows each other, you're the only stranger. Gap: the homepage does not explicitly name competitors or alternative solutions, the "what would they do instead" competitive frame is implicit rather than stated.

**Friction (7/10):** Multiple CTAs compete: ChargeTypeSelector drives to playbooks/start, hero CTA goes to /start, secondary CTA goes to /playbooks, "See pricing" anchor scrolls, score tool link in lead capture. The page is long (13 sections). For a 3AM crisis buyer with 80% reduced cognitive capacity (Covello), this page presents too many choices before purchase. The /start page handles crisis routing better. Mobile sticky CTA exists (StickyMobileCTA.tsx) and is well-implemented with intersection observer. Email capture form before pricing may intercept buyers who are ready to pay.

---

### 2. Services Page (`/services`, services/page.tsx)

**Clarity (8/10):** "Walk into your next hearing with the right questions" is clear and action-oriented. Five tiers presented with case-stage labels ("First 30 days", "30-90 days in", etc.) give buyers a self-selecting framework. The DiscoveryGate component smartly filters tiers based on whether the buyer has documents. Gap: the page is structurally dense, 3 case-type sections x 5 tiers each = 15 tier cards, plus add-ons, guarantee, FAQ, and lead capture. A deliberate browser can navigate this; a crisis buyer cannot.

**Relevance (8/10):** Per-case-type tier descriptions are tailored (drug cases mention chain of custody; DUI mentions breathalyzer calibration; white collar mentions RICO and AUSA profiling). The DiscoveryGate binary routing ("I have documents" / "I haven't received documents") respects where the buyer is in their case. Gap: the page title "Defense Intelligence Services" reads more B2B than defendant-facing.

**Value (9/10):** Attorney cost comparison grid (Attorney: $10K / Our service: $197-$2,497 / 2-25% of investment) is the strongest value framing on the site. Per-tier value stack with crossed-out consulting prices. X-Ray's 3-layer guarantee stack is exceptional, Discovery Guarantee, Attorney Meeting Guarantee, Delivery Commitment. Each tier has explicit delivery timelines.

**Differentiation (8/10):** "40+ elite defense attorneys' methodology" is repeated throughout. Each case-type section names specific defense approaches (chain of custody protocols, informant credibility methodology, constitutional appellate frameworks). The Case Decoder "View Sample Report" link provides artifact proof. Gap: same as homepage, competitive alternatives are framed implicitly, not explicitly.

**Friction (6/10):** This is the highest-friction page on the site. 15 tier cards across 3 case types, plus 2 add-ons, guarantee section, FAQ, and lead capture. No way to collapse case types the buyer doesn't care about. The DiscoveryGate helps but still leaves 6-10 visible tier cards. For the $4,997+ tiers, no clear "talk to someone" path beyond email. The Situation Room's "By application, requires War Room" badge creates intentional friction but the application path (/intake) is not prominently surfaced.

---

### 3. Playbooks Catalog (`/playbooks`, playbooks/page.tsx)

**Clarity (10/10):** "Defense Playbooks" with "$97 Instant Download" is immediately clear. Card grid with charge-type names (DUI, Drug Possession, etc.) and price visible on every card. "Choose your charge type" instruction is unambiguous.

**Relevance (9/10):** Each card shows a charge-type-specific description pulled from PlaybookConfig. The 6 value props below ("26 Questions", "Case Stage Roadmap", "Red Flag Checklist", etc.) tell the buyer exactly what they get. Minor gap: only playbooks with `live: true` display, if a visitor has a charge type not yet live, they see nothing for their situation (though the DISPLAY_ORDER has 8 slugs, coverage depends on live flags).

**Value (9/10):** $97 price point visible immediately. "Join thousands of defendants who refused to go into court unprepared" is an effective social proof line. Methodology attribution ("Lawrence Taylor's DUI procedural challenge framework and Barry Scheck's forensic evidence methodology") adds credibility. The upgrade path value prop ("Every dollar you spend rolls forward") reduces purchase anxiety.

**Differentiation (8/10):** Named attorney methodology (Taylor, Scheck) is a strong differentiator. "375+ exonerations and thousands of criminal cases" is specific. Gap: the catalog page itself doesn't differentiate from a generic legal forms site, the differentiation lives on the individual playbook sales pages.

**Friction (9/10):** Minimal friction. Cards link directly to `/playbook/{slug}` sales pages. Price visible before click. No email gate, no account required. Excellent for browse-to-buy flow.

---

### 4. PlaybookSalesPage (PlaybookSalesPage.tsx)

**Clarity (9/10):** Hero has eyebrow text, headline, subheadline, price, and CTA above fold. "Two Books Included" badge with Emergency Playbook + Full Defense Playbook split is clear. The Agitate > Proof > Value Stack > Guarantee > Who It's For sequence is a textbook long-form sales page.

**Relevance (10/10):** Every section is driven by PlaybookConfig, so content is charge-type-specific. The "This is for you if..." / "This is NOT for you if..." section self-qualifies the buyer. FAQ items include charge-specific upgrade questions.

**Value (9/10):** Value stack with crossed-out individual prices and "Your price: $97" framing. The 2-payment option ($48.50 x 2) reduces the commitment threshold. Multiple named attorney methodologies in the Proof section. Upgrade path visible: "$97 credited toward Case Decoder within 30 days."

**Differentiation (8/10):** Proof section names specific defense methodologies per charge type. The "Emergency Playbook" (first 72 hours) is a unique artifact competitors don't offer. The 6-part question format (context, question, why it matters, good answer, bad answer, follow-up) is highly differentiated.

**Friction (8/10):** Three CTAs on the page (hero, value stack, final) with consistent messaging. Guarantee visible before final CTA. Money-back guarantee badge with shield icon placed above the CTA button. The LeadCapture exit capture (DUI only, "72-Hour Emergency Checklist") is well-positioned. Minor friction: the page is long, 12 sections. For a $97 impulse purchase from a crisis buyer, the page may over-sell.

---

### 5. Score Page (`/score`, score/page.tsx)

**Clarity (10/10):** "Defense Milestone Score" concept is immediately understood: 10 questions, get a score. Zero email gate, zero paywall. Question labels are in plain English ("What are you charged with?" not "Select your charge type classification"). Loading screen shows personalized progress steps.

**Relevance (10/10):** Questions map directly to defendant concerns (attorney communication, motions filed, discovery received). Score results include charge-type-specific urgency blocks (DUI mentions breathalyzer calibration, drug mentions search warrant challenges). Attorney email templates are charge-specific and UPL-safe ("I'd like to understand...").

**Value (9/10):** Free, zero-friction value delivery. Score result includes observations, free attorney email template (copy-paste ready), charge-specific urgency context, aggregate benchmark data ("X% of defendants who scored had no motions filed"). The email capture after scoring is soft, no gate, optional. Band-specific CTA copy (Hormozi framework) personalizes the conversion message.

**Differentiation (10/10):** No competitor offers a free, anonymous defense scoring tool with charge-specific attorney email templates, shareable results, and aggregate benchmark data. The share functionality creates organic distribution. The band-specific conversion architecture (crisis vs. non-crisis paths) is sophisticated.

**Friction (8/10):** 10 questions with radio buttons, under 60 seconds to complete. Results are immediate. Playbook step-down CTA ("Not ready for the Case Decoder? Start with the Defense Playbook") provides a low-commitment alternative. Minor friction: the ScoreDisplay component is long with many sections, crisis buyers (score 0-50) see urgency block + attorney email + origin story + CTA + email capture + playbook step-down. This is a lot of content after the emotional impact of a low score.

---

### 6. Checkout Page (`/checkout`, checkout/page.tsx)

**Clarity (9/10):** Tier name, price, delivery timeline, and guarantee visible immediately. "What's included" checklist with amber checkmarks. Band-aware hook when arriving from score page ("Your Defense Milestone Score was Critical"). Feltexperience line ("It's 3 AM and you can't sleep") humanizes the transaction.

**Relevance (9/10):** Per-tier story (real case example), whyThisWorks methodology proof, attorney pullquote, all specific to the selected tier. "Buying this for someone you love?" note acknowledges the family-member buyer segment. Band-specific guarantee copy adjusts tone for crisis vs. non-crisis buyers.

**Value (9/10):** Guarantee placed BEFORE features (Brunson principle). "Why This Works" methodology section provides proof at point of purchase. Upgrade nudge shows exact dollar amount saved. Sample report link provides artifact proof. Priority delivery add-on with court date urgency detection is a smart conversion mechanism.

**Differentiation (7/10):** The checkout page is more functional than differentiating. It executes well but doesn't add new differentiation beyond what earlier pages established. The tier story (real case example) is the strongest differentiating element here.

**Friction (7/10):** Form fields are minimal: email (required), court date (optional), priority delivery checkbox, consent checkbox. No registration, no account creation. Stripe redirect handles payment. However: for digital products (Playbooks at $97), the consent checkbox for UPL disclaimer is hidden (`!info.isDigitalProduct`), which is correct, but the email field alone is a friction point for a $97 impulse buy. Some competitors (Gumroad, etc.) allow purchase with just a click. The consent gate for $2,497+ tiers is appropriate given the price point. Payment plan toggle (2 x $48.50) visible for digital products reduces commitment friction.

---

### CRO Criteria Scoring

| ID | Criterion | Score | Evidence |
|----|---------, |-------|----------|
| **CRO1** | Primary CTA visible above fold | **PASS** | Homepage: "Start Your Case Research" button in hero. Playbooks: "View Playbook" cards. Score: 10-question quiz starts immediately. Checkout: tier card with price + CTA. Start: binary routing buttons above fold. |
| **CRO2** | Value prop in <7 words | **PASS** | "Know What They Know." (5 words, tagline). "Your Case File Has Answers." (5 words, H1 first line). "We Find Them. Now You Know." (6 words, H1 second line). |
| **CRO3** | Social proof within 2 scrolls | **PASS** | Homepage: DiscoveryReveal (PCSO document) is first section after hero, followed by backstory quote. Inline testimonials appear after pain points (~2 scrolls). PlaybookSalesPage: Proof section is 2nd section after hero. |
| **CRO4** | Price anchoring present | **PASS** | PricingTable: "Average criminal defense retainer is $5,000-$25,000. A second opinion costs $1,500+. We start at $197." Services: attorney cost comparison grid. PlaybookSalesPage: value stack with crossed-out prices. Checkout: "vs. $500+ for a 1-hour consultation" anchors. |
| **CRO5** | Urgency without manipulation | **PASS** | Homepage urgency bar: "Suppression motions: typically 30 days from arraignment. DMV hearing (DUI): 7-10 days from arrest." These are real legal deadlines, not artificial scarcity. Score: charge-specific urgency blocks cite actual filing windows. PlaybookSalesPage: urgency section uses real deadlines + upgrade credit expiration (30 days). |
| **CRO6** | Guarantee visible before checkout | **PASS** | Homepage: "Find It or It's Free" section with 3 sub-guarantees before pricing. PlaybookSalesPage: guarantee section before final CTA. Checkout: guarantee placed BEFORE features per Brunson. Services: X-Ray 3-layer guarantee stack. |
| **CRO7** | Mobile CTA thumb-reachable | **PASS** | StickyMobileCTA.tsx: fixed bottom bar with `md:hidden`, 44px min-height, full-width button. Appears after hero scrolls out of view. Start page: buttons have `minHeight: "64px"` and full-width. |
| **CRO8** | Form fields minimal | **PASS** | Checkout: email only (required), court date (optional), consent checkbox (non-digital only). No name, no phone, no address. Score: 10 radio-button questions, no form fields until optional email after results. |
| **CRO9** | Trust signals near CTA | **PASS** | Checkout: TrustBadges variant="checkout" below CTA button, "Secure checkout powered by Stripe" with lock icon, "Visa, Mastercard, and Amex accepted." Homepage: TrustBadges near pricing section and final CTA. PlaybookSalesPage: TrustBadges after value stack and final CTA. |
| **CRO10** | Objection handling before CTA | **PASS** | Homepage: 10-item FAQ accordion covers top objections ("Will this upset my attorney?", "Is this legal?", "What if my case is too far along?"). PlaybookSalesPage: dynamic FAQ with upgrade questions. Services: 5-item FAQ. Checkout: "Why This Works" section + attorney pullquote. |
| **CRO11** | Exit intent or sticky CTA | **NEEDS WORK** | StickyMobileCTA exists for mobile (shows after hero scrolls away). No exit-intent popup on desktop. PlaybookSalesPage has LeadCapture exit capture for DUI playbook only, not for other charge types. No sticky desktop CTA on any page. The mobile implementation is solid; desktop is missing. |
| **CRO12** | Cross-sell/upsell path | **PASS** | PlaybookSalesPage: upgrade path section shows next tier with exact upgrade cost. Checkout: nudge card shows next tier with credited upgrade cost. PricingTable: "Upgrade Credits: 100% Applied" banner. Score results: CTA targets Case Decoder with "Defense Playbook" step-down. Services: upgrade credits callout. |
| **CRO13** | Post-purchase next step clear | **NEEDS WORK** | The checkout page POSTs to `/api/checkout` then redirects to Stripe. After Stripe, the buyer goes to `/checkout/success`. I did not review the success page in this audit. The drip email system (22-part dispatcher in cron/drip/route.ts) handles post-purchase nurture, but the immediate post-purchase UX depends on the success page content, which was not in scope. |
| **CRO14** | Email capture non-blocking | **PASS** | Homepage: LeadCapture component is at the bottom, after pricing. Score page: email capture is optional, after score results are shown. PlaybookSalesPage: LeadCapture is below final CTA, positioned as exit capture. The score tool delivers full value (score + observations + attorney email template) before any email ask. |
| **CRO15** | Score tool converts to paid | **PASS** | Score results include band-specific CTA buttons ("Start My Case Analysis" for Critical, "Find the Gaps in My Defense" for Concerning). CTA links to `/checkout?tier=case-decoder` with band and charge params. Step-down to $97 playbook for resistant buyers. Share functionality creates organic reach. Charge-specific attorney email template provides immediate free value that validates the methodology. |
| **CRO16** | Comparison positioning (vs attorney cost) | **PASS** | Services: 3-column comparison grid (Attorney $10K / Ours $197-$2,497 / 2-25%). PricingTable: "Average criminal defense retainer is $5,000-$25,000." Homepage: "less than one hour of your attorney's billing rate ($250-$500/hr)." Checkout: per-tier anchors ("vs. $500+ for a 1-hour consultation", "vs. $3,000+ for a second attorney to review discovery"). |
| **CRO17** | Crisis buyer fast-path exists | **PASS** | /start page with CrisisHero component: activates via `?crisis=true`, `?mode=crisis`, or auto-detected 10PM-6AM local time. Crisis mode: single CTA ("Check Your Defense Position"), single DUI playbook link, "See all options" dismiss. Covello Mental Noise Model enforced: max 3 messages, one CTA, minimal cognitive load. StickyMobileCTA on homepage provides persistent fast-path. |

**CRO Summary:** 15 PASS / 2 NEEDS WORK / 0 FAIL

---

## PART 2: POSITIONING & TRUST (April Dunford's Canvas)

### 5-Component Positioning Canvas

#### 1. Competitive Alternatives, What would defendants do instead?

| Alternative | Why it fails | INAA advantage |
|-------------|-------------|----------------|
| **Ask their attorney** | Attorney won't return calls. 5-minute meetings. "Just take the deal." Defendants already tried this, it's why they're searching at 2am. | INAA is the backup when the primary relationship breaks down. |
| **Hire a second attorney** | $1,500+ for one hour. Most defendants already spent $10K+ on the first one. Financial barrier is prohibitive. | Case Decoder is $197. Full X-Ray is $2,497. Both cheaper than a second-opinion consult. |
| **Google / Reddit research** | Unstructured, generic, overwhelming. YMYL content is mostly SEO content farms. No charge-specific methodology. No accountability framework. | Charge-specific, methodology-backed, delivered as actionable questions. Transforms raw information anxiety into structured attorney meeting prep. |
| **Legal aid / free clinics** | Underfunded, overloaded, months-long waitlists. Available only to qualifying income levels. | Available immediately, 48-hour turnaround, no income requirements. |
| **Do nothing and hope** | This is the real competitor. Inertia driven by fear, confusion, and "my attorney says it's fine." | The score tool and urgency messaging directly combat inertia. The 2am pain points validate the instinct to act. |

**Assessment:** The competitive frame is established implicitly throughout the site through attorney cost comparisons, but never explicitly named. The homepage says "A second opinion from another attorney costs $1,500+" but doesn't say "Here's why defendants typically end up here instead of doing X, Y, Z." This is a design choice, naming alternatives too explicitly could create comparison shopping. The implicit approach works for this market.

#### 2. Unique Attributes, What does INAA have that alternatives don't?

1. **Systematic methodology from 40+ named defense attorneys**, not one attorney's opinion, but documented frameworks from Lawrence Taylor, Barry Scheck, Gerry Spence, and others
2. **Calibrated question format**, 6-part structure (context, question, why it matters, good answer, bad answer, follow-up) that no free resource or second-opinion attorney provides
3. **Anonymous defendant-built brand**, trust from inside the system, not from outside selling into it
4. **Discovery document analysis at scale**, reads every page and cross-references (X-Ray tier), something even most attorneys don't do thoroughly
5. **100% upgrade credit architecture**, every dollar rolls forward, eliminating "wrong tier" purchase anxiety
6. **Crisis-mode interface**, auto-detected 10PM-6AM, Covello Mental Noise Model, binary routing
7. **Free score tool with charge-specific attorney email templates**, immediate free value before any purchase

#### 3. Value, What capability do those attributes enable?

The defendant walks into their next attorney meeting with specific, documented, charge-appropriate questions that their attorney has to answer. This transforms the attorney-client dynamic from passive to accountable. The defendant stops being "the only stranger in the room" and becomes someone their attorney recognizes as informed.

Quantified: "One question from our report can change what motions your attorney files. One motion can change your case."

#### 4. Target Customer, Who cares most about that value?

Three buyer segments (all served):
1. **Distrust buyers**, attorney won't return calls, won't file motions, just wants to plead. These are the 2AM crisis searchers.
2. **Double-check buyers**, attorney says everything is fine, but the defendant wants verification. Score tool serves this segment perfectly.
3. **Communication gap buyers**, attorney is competent but doesn't explain things. The defendant (or their family member) wants to understand.

The 5th pain card ("I'm not the one facing charges, but I'm the one doing all the research") explicitly addresses family-member buyers, expanding TAM.

#### 5. Market Category, What context makes the value obvious?

INAA operates in "defendant preparation intelligence", a category it is defining. The closest existing categories are "legal self-help" (too passive) and "second opinion" (too expensive, too attorney-centric). The tagline "Know What They Know" frames the category around information parity, not legal services.

---

### Positioning Criteria Scoring

| ID | Criterion | Score | Evidence |
|----|---------, |-------|----------|
| **POS1** | Category clear within 5s | **PASS** | "Your Case File Has Answers. We Find Them." + "Built by a defendant who read his own 500-page discovery file" communicates category immediately. The charge-type selector further narrows context within 5 seconds. |
| **POS2** | Competitive frame established | **NEEDS WORK** | Attorney cost comparisons are strong ($197 vs $1,500+ second opinion). But the competitive frame is always "us vs. attorney cost", never "us vs. doing nothing" or "us vs. Reddit research." The real competitor for most visitors is inertia, and only the score tool's urgency messaging addresses this directly. The homepage never explicitly says "Here's what happens if you don't act." |
| **POS3** | Unique differentiation articulated | **PASS** | "40+ elite defense attorney methodologies" + 6-part question format + "375+ exonerations" + named attorneys (Taylor, Scheck, Spence) + DiscoveryReveal artifact proof + 100% upgrade credit. This is articulated on every key page. |
| **POS4** | Target segment identified | **PASS** | Three segments served: distrust ("My lawyer won't return my calls"), double-check ("My attorney says it's fine" handler in score results), communication gap ("Nobody explained anything to me"). Family member segment explicitly addressed. |
| **POS5** | Value metric quantified | **PASS** | "68.3g of missing evidence" in OG description. "73% weight discrepancy" in drug case stories. "10-15 targeted questions" / "35-50 questions" per tier. "$197 vs. $500+ consultation." These are specific, measurable claims. |
| **POS6** | Pro-defendant, never anti-attorney | **PASS** | FAQ: "The right attorneys welcome informed clients." Pain points blame the system/information gap, not attorneys personally. "Your attorney remains the final authority on strategy decisions" (UPL disclaimer). Checkout: "Feed these questions to your attorney" framing. Score: "If your attorney told you everything is fine, that's exactly what this tool is designed to check" (validates, doesn't attack). Nowhere on the site is an attorney called incompetent, lazy, or dishonest. |
| **POS7** | Information gap framing | **PASS** | Tagline: "Know What They Know." Hero: "That's the gap we fill." Bridge statement: "People like us ask questions until we get answers." Services header: "They're never the only stranger in the room." The information gap is the stated enemy, consistently, across every page. |
| **POS8** | Three buyer segments served | **PASS** | Distrust: pain points 1, 3, 4. Double-check: score tool "My attorney says fine" handler. Communication gap: pain point 2. Family members: pain point 5, checkout "Buying this for someone you love?" note, services page "Whether you're the defendant or the person doing the research for someone you love." |
| **POS9** | Methodology over opinion | **PASS** | Every page attributes findings to documented methodology, not subjective analysis. "Built from methods developed by elite defense attorneys across 375+ exonerations." Questions use 6-part format with objective good/bad answer benchmarks. Score uses "defense milestone benchmarks" not subjective ratings. X-Ray: "Every finding comes with page references." The entire product line is framed as systematic, not opinionated. |
| **POS10** | Anonymous brand coherent | **PASS** | No founder name on any page. "ImNotAnAttorney Founder" attribution on backstory quote. "Built by a defendant" framing. Voice is consistent: insider, specific, not-corporate. The anonymity itself is a trust signal for this market, defendants trust anonymous peer experience over named professionals selling to them. |
| **POS11** | Pricing justified against stakes | **PASS** | "What's at stake?" section: $10K-$100K attorney fees, 1-20 years potential incarceration. "The question is not whether $197 is worth it. The question is whether you can afford not to know." Services comparison grid. Checkout anchors per tier. PlaybookSalesPage: total value vs. $97 price. The pricing is justified against both attorney cost (savings frame) and conviction cost (stakes frame). |

**Positioning Summary:** 10 PASS / 1 NEEDS WORK / 0 FAIL

---

### Trust Criteria Scoring

| ID | Criterion | Score | Evidence |
|----|---------, |-------|----------|
| **T1** | Insider voice (lived experience) | **PASS** | "I hired an attorney the same way you did. Paid the retainer. Waited for the plan." Backstory quote reads as genuine first-person narrative. Pain points use VoC defendant language. "You searched for this at 2am. So did I." The voice never breaks into corporate, legal, or marketing register. |
| **T2** | Specificity over warmth | **PASS** | "68.3g of missing evidence." "73% weight discrepancy." "19 days past its maintenance window." "21 unmatched fingerprints." "CI phone number was attributed to both the informant and the defendant in the same report." Every proof point is a specific number or specific finding, not a general reassurance. The guarantee is "Find It or It's Free", a specific bet, not "satisfaction guaranteed." |
| **T3** | Real artifacts (documents, data) | **PASS** | DiscoveryReveal: pixel-accurate PCSO supplement report with highlighted findings. Sample report link (`/sample`) on multiple pages. Score tool aggregate benchmark data ("X% of defendants who scored had no motions filed"). Each case story in checkout references specific documents (breathalyzer calibration records, lab reports, CI phone records, deposition transcripts). |
| **T4** | Tribal identity ("defendants who prepare") | **PASS** | "People like us don't just trust the system. People like us ask questions until we get answers." "Join thousands of defendants who refused to go into court unprepared." "For defendants and the people who love them." Band-specific identity lines ("Your gut was right. Something is wrong."). Score sharing creates tribal signaling. |
| **T5** | Vulnerability coherence | **PASS** | The backstory is a vulnerability narrative: "The calls got shorter. Then they stopped. I decided to read the file myself. I didn't know what I was looking for." This is not polished, it reads as genuine confusion and frustration from someone who went through the system. The "I found three things that changed everything. My attorney never mentioned any of them" is the vulnerability-to-competence arc that builds trust with trust-broken people. |

**Trust Summary:** 5 PASS / 0 NEEDS WORK / 0 FAIL

---

### Anonymous Brand Criteria Scoring

| ID | Criterion | Score | Evidence |
|----|---------, |-------|----------|
| **ANON1** | No personal founder names visible | **PASS** | No personal names anywhere on the site. Attribution is "ImNotAnAttorney Founder", title, not name. Attorney methodology is attributed to named defense attorneys (Taylor, Scheck, Spence) who are public figures, not INAA staff. Testimonials use first name + last initial (Sarah K., Marcus T., etc.). |
| **ANON2** | Brand voice consistent | **PASS** | Every page maintains the same register: direct, specific, insider. The voice never shifts to corporate, academic, or marketing-speak. Pain points, backstory, product descriptions, FAQ answers, and checkout copy all read as the same person writing. The UPL disclaimers are the only sections with institutional tone, which is appropriate and expected. |
| **ANON3** | Trust built through methodology not persona | **PASS** | Trust comes from: (1) 40+ named defense attorney methodologies, (2) specific case findings (68.3g, 73%, 21 fingerprints), (3) 6-part question format, (4) sample report, (5) score tool with aggregate data, (6) tiered guarantee with specific commitments. None of this requires a founder persona. The methodology IS the trust mechanism. |
| **ANON4** | Insider observations authentic | **PASS** | "Everyone in the courtroom knows each other. The judge, the prosecutor, the defense attorney, they work together every week. The defendant is the only stranger in the room." This is an observation that requires lived experience. "The calls got shorter. Then they stopped." This is not something a marketer would write, it's a defendant's experience. "One of us was told 'the BAC is too high to fight.'" Specific insider detail. |
| **ANON5** | "Built by a defendant" framing coherent | **PASS** | "Built by a defendant who read his own 500-page discovery file." This framing appears in the hero sub-text, is reinforced in the backstory quote, and echoes through the voice on every page. The product line's existence (from $97 playbook to $9,997 trial intelligence) is coherent with someone who went through the system and built progressively more sophisticated tools. The 68.3g evidence finding is the origin story artifact that makes the entire brand story believable. |

**Anonymous Brand Summary:** 5 PASS / 0 NEEDS WORK / 0 FAIL

---

## SUMMARY SCORECARD

| Category | Pass | Needs Work | Fail | Total |
|----------|------|------------|------|-------|
| CRO (17 criteria) | 15 | 2 | 0 | 17 |
| Positioning (11 criteria) | 10 | 1 | 0 | 11 |
| Trust (5 criteria) | 5 | 0 | 0 | 5 |
| Anonymous Brand (5 criteria) | 5 | 0 | 0 | 5 |
| **Total** | **35** | **3** | **0** | **38** |

**Overall Score: 92% PASS (35/38)**

---

## NEEDS WORK, Prioritized Fixes

### 1. CRO11: Exit intent or sticky CTA (desktop)

**Current state:** StickyMobileCTA exists and works well (intersection observer, 44px tap target, appears after hero scrolls away). Desktop has no equivalent, no sticky CTA, no exit-intent mechanism.

**Impact:** Desktop visitors who scroll the homepage's 13 sections may lose the CTA context. The homepage is long. A sticky desktop element (not a popup, a subtle fixed bar or side element) would keep the primary conversion path visible.

**Recommendation:** Add a sticky desktop CTA bar (thin, bottom of viewport, `hidden md:block`) that shows after the hero section scrolls out of view. Content: "Start Your Case Research, $197" with link to /start. Same intersection observer pattern as StickyMobileCTA. Do NOT implement as a popup, popups destroy trust with this audience.

### 2. CRO13: Post-purchase next step clear

**Current state:** Checkout redirects to Stripe, then to `/checkout/success`. The drip email system handles post-purchase nurture. This audit did not review the success page or drip sequence.

**Recommendation:** Audit `/checkout/success` page and the first 3 drip emails in a separate pass. For digital products (playbooks), the success page should show immediate download link + "What to do first" (read Emergency Playbook tonight, bring Full Playbook to next meeting). For service tiers (Case Decoder+), the success page should show intake form link + expected delivery timeline + "while you wait" content.

### 3. POS2: Competitive frame, inertia is the real competitor

**Current state:** The site frames INAA against attorney cost (strong) but not against the real competitor: doing nothing. The score tool's urgency messaging partially addresses this, but the homepage and services page don't explicitly name "doing nothing" as the dangerous alternative.

**Recommendation:** Add a single line to the homepage stakes section or FAQ: "The most expensive decision in a criminal case isn't hiring the wrong attorney. It's sitting with the right questions and never asking them." This frames inertia as the enemy without being manipulative. The urgency bar already handles the deadline aspect, this would handle the emotional/decisional aspect.

---

## STRONG POINTS (What to preserve)

1. **Score tool conversion architecture**, Band-specific CTA copy, crisis/non-crisis bifurcation, charge-specific attorney email templates, aggregate benchmark data. This is best-in-class lead magnet design.

2. **"Find It or It's Free" guarantee**, Named, specific, risk-reversing. The X-Ray's 3-layer guarantee stack (Discovery + Attorney Meeting + Delivery) is exceptional for a $2,497 product.

3. **Covello compliance on /start**, Crisis hero with auto-detection, binary routing, single CTA per state. This page respects the 3AM buyer better than any other page on the site.

4. **Pro-defendant voice consistency**, Zero instances of anti-attorney language across 6 pages, 3 components, and hundreds of copy blocks. The "information gap" framing is maintained perfectly.

5. **68.3g origin story**, A single specific number that anchors the entire brand narrative. This is the kind of specificity that Bloomstein's vulnerability coherence framework describes as irreplaceable.

6. **100% upgrade credit architecture**, Mentioned on every pricing surface. Eliminates "wrong tier" purchase anxiety. Creates a natural expansion revenue path.

7. **Family member segment inclusion**, Explicitly acknowledged in pain points, checkout, and services. Expands TAM without diluting the primary defendant audience.
