# Phase CAP: Eval Framework Capstone
Date: 2026-04-02

## GATE Status

| Gate Team | Status | Blockers |
|-----------|--------|----------|
| Team 9: Positioning | **CONDITIONAL GO** | POS2 (competitive frame vs. inertia) is NEEDS WORK, not FAIL. No FAIL criteria. |
| Team 10: CRO | **CONDITIONAL GO** | CRO11 (desktop exit intent missing), CRO13 (post-purchase UX unaudited). Both NEEDS WORK. No FAIL. |
| Team 11: Trust | **CONDITIONAL GO** | T1-T5 downgraded to CONDITIONAL PASS per Reality Checker (no user-testing evidence). ANON1 and ANON5 NEEDS WORK. No FAIL. |
| UPL Compliance | **CONDITIONAL GO** | FLAG B4 is a clear U4 violation in published blog content. No U6-U15 violations. Infrastructure is strong. B4 must be fixed before distribution push. |

**Gate verdict: CONDITIONAL GO.** No FAIL on any GATE criterion. Four NEEDS WORK items across three GATE teams, plus one UPL blog violation that is fixable in minutes. The site can operate but must not run paid acquisition or distribution campaigns until B4 is fixed and the privacy policy GA4 claim is corrected.

---

## Summary

- **Total criteria evaluated: 164/164**
- **PASS: 121 | NEEDS WORK: 38 | FAIL: 5**
- **Go-live decision: CONDITIONAL GO**

The site has production-grade architecture, genuinely strong UPL compliance infrastructure, best-in-class crisis UX on /start, and advanced GEO signals (speakable, DefinedTermSet, citation schema) that put it ahead of 95% of YMYL competitors on structured data depth. The failures are concentrated in three areas: (1) a factually incorrect privacy policy claim about tracking cookies, (2) a critical logic bug in the intake auto-generation flow, and (3) broken structured data URLs undermining the entity graph. All five FAILs are fixable within a single sprint. The 38 NEEDS WORK items are improvements, not blockers.

---

## Scores by Team

### Team 1: UPL Compliance (U1-U15)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| U1 | No advice language | **NEEDS WORK** | Phase 17: FLAG B4 in `attorney-not-returning-calls.mdx` line 194 is a clear U4: "you need to take immediate action. That means exploring new counsel, contacting the bar, or filing a motion for substitution of counsel." FLAG S1 in score.ts line 100 ("you need to be proactive") is borderline. Reality Checker agrees B4 must be fixed before posture can be called "strong." |
| U2 | Attorney redirection | **PASS** | Phase 17: Every section across all products redirects to the defendant's attorney. "Ask your attorney" or equivalent present on every major surface. FAQ answers consistently redirect. |
| U3 | No attorney judgment | **PASS** | Phase P1-P2 POS6: Zero instances of anti-attorney language across 6 pages, 3 components. "The right attorneys welcome informed clients." Score tool validates instincts without calling attorneys incompetent. |
| U4 | Disclaimer presence | **PASS** | Phase 17: "Legal information, not legal advice" on footer, checkout, intake, score results, playbook pages, blog posts, sample reports. Phase 18-20: Terms Section 3 is the clearest UPL disclaimer in the codebase. |
| U5 | Motion applicability framing | **PASS** | Phase 17: Motions presented as "factors that may be relevant." Score.ts line 260 uses "Ask your attorney: 'What motions are we filing before trial?'" — question framing, not recommendation. |
| U6 | Immigration safety | **PASS** | Phase 17: No immigration advice found. Collateral consequences in prompts.ts are sourced and framed as requiring attorney + immigration lawyer consultation. |
| U7 | Defense theory framing | **PASS** | Phase 17: Defense theories presented as landscape to "explore with your attorney." Prompts.ts banned list explicitly prevents "pursue this defense," "this is your strongest argument." |
| U8 | Advocacy steps bounded | **NEEDS WORK** | Phase 17: FLAG B3 — "fire your lawyer" article TLDRBox line 30 says "Fire your lawyer if: they've missed a filing deadline." Reads as a command. Gray zone per Phase 17 analysis. Reality Checker agrees this needs reframing to observational language. |
| U9 | Question framing | **PASS** | Phase 17: All questions framed as "Question for Your Attorney." 6-part format (context, question, why it matters, good answer, bad answer, follow-up) empowers without pressuring. |
| U10 | Collateral consequences sourced | **PASS** | Phase 17: Prompts.ts requires citations to statute, regulation, or NICCC. Blog citations verified in Phase 16 — .gov/.edu sources on 35+ posts. |
| U11 | No named companies in negative context | **PASS** | Phase 17: No named companies found in negative context. Generic industry descriptions used throughout. |
| U12 | Attribution non-endorsement format | **PASS** | Phase P1-P2: "Informed by [Name]'s published work" format used. Non-endorsement disclaimer present on methodology sections. |
| U13 | Non-adversarial attorney framing | **PASS** | Phase 17: No insider pejoratives found. Pro-defendant voice maintained without anti-attorney attacks. "The information gap" is the stated enemy. No "plea mill," "assembly line justice," or similar language in customer-facing copy. |
| U14 | Tear-out traceability protection | **N/A** | This criterion applies to playbook/report deliverables, not the website. Not scoreable from website audit. |
| U15 | State data reliance warnings | **PASS** | Phase 16: State DUI pages include disclaimer language. Phase 17: score.ts observations about state-specific procedures include appropriate caveats. |

**Team 1 Summary: 12 PASS / 2 NEEDS WORK / 0 FAIL / 1 N/A**

---

### Team 2: Psychological Architecture (P1-P14)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| P1 | Safety-first architecture | **PASS** | Phase P1-P2: Homepage hero leads with validation ("Your attorney hasn't called back"), not worst-case scenarios. /start CrisisHero establishes safety before any product mention. Phase 4: Crisis UX rated 6/7. |
| P2 | Efficacy pairing (Witte) | **PASS** | Phase P1-P2: Every threat paired with action. Urgency bar pairs deadlines with specific motion types. Score observations pair findings with attorney questions. |
| P3 | Learned helplessness counter | **PASS** | Phase P1-P2: "The charge is what you're facing, not who you are" framing. Score tool depersonalizes and temporalizes. |
| P4 | Self-efficacy engineering | **PASS** | Phase P1-P2: Mastery (score quiz completion), vicarious (68.3g story), social persuasion ("defendants who prepare"), emotional management (crisis mode auto-detection). |
| P5 | Action design (Fogg) | **PASS** | Phase P1-P2: Attorney email templates are copy-paste ready (tiny, prompted). Score tool delivers actionable questions. /start binary routing eliminates overwhelm. |
| P6 | Decision simplicity (Klein) | **NEEDS WORK** | Phase P1-P2: /services page presents 15 tier cards across 3 case types. DiscoveryGate helps but still leaves 6-10 visible cards. /start does this better with binary routing. The services page violates Klein's one-path principle. |
| P7 | Meaning-making arc (Frankl) | **PASS** | Phase P1-P2: Score results shift from "here's what's happening" to "here's what you can do about it." Attorney email template is the action step. |
| P8 | Emotional progression | **PASS** | Phase P1-P2: Homepage follows grounding -> orientation -> intelligence -> action -> empowerment arc. CRO scoring confirms correct sequence. |
| P9 | Reading level (Rudd) | **NEEDS WORK** | Phase 13-21: 7 of ~20 score observations exceed Covello 27-word limit. Public defender observation is 49 words. FK Grade ~10 on score observations. /start is excellent (~7). /services is marginal (~10). Score observations are the weakest point. |
| P10 | Stage-matched tone | **PASS** | Phase P1-P2: Score tool band-specific CTA copy adjusts for crisis vs. non-crisis. "Too Scared to Finish" reassurance at 7+ answered questions acknowledges resistance. |
| P11 | Mental noise readability (Covello) | **NEEDS WORK** | Phase 13-21: 7 score observations exceed 27 words. Homepage urgency bar contains legal jargon (Brady, Rule 1.16, PCR). /start passes Covello explicitly but /score and homepage do not. |
| P12 | Reintegrative shame framing | **PASS** | Phase P1-P2: "You are facing [charge]" framing. No identity-fusing language ("you are a DUI offender"). Tribe language is empowering ("defendants who prepare"). |
| P13 | CCO paragraph ordering | **PASS** | Phase P1-P2: Score urgency blocks lead with acknowledgment, then information, then forward path. Homepage pain points follow compassion -> conviction -> optimism. |
| P14 | Therapeutic document impact | **PASS** | Phase P1-P2: Score tool delivers full value before any purchase ask. No "you can't understand this without us" language. Upgrade nudges are value-adding, not dependency-creating. |

**Team 2 Summary: 11 PASS / 3 NEEDS WORK / 0 FAIL**

---

### Team 3: Legal Substance (L1-L10)

Note: Team 3 primarily evaluates product deliverables (reports, playbooks). For the website audit, scoring is based on publicly visible legal information on the site.

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| L1 | Charge-specific accuracy | **PASS** | Phase 16: Per-charge-type playbook configs verified. State DUI pages use state-specific data (BAC limits, penalties). Score tool has charge-specific observations. |
| L2 | Defense theory completeness | **PASS** | Phase P1-P2: Playbook configs cover charge-specific defense theories. DUI mentions breathalyzer challenges. Drug cases mention chain of custody. White collar mentions RICO. |
| L3 | Prosecution strategy realism | **PASS** | Phase P1-P2: Services page per-case-type descriptions include prosecution tactics (drug case informant strategies, DUI BAC evidence ordering). |
| L4 | Judge intelligence utility | **N/A** | Judge intelligence is in product deliverables, not the website. |
| L5 | Outcome map calibration | **N/A** | Outcome probabilities are in product deliverables, not the website. |
| L6 | Motion landscape specificity | **NEEDS WORK** | Phase 13-21: Homepage urgency bar mentions "suppression motions" and "Brady material requests" without explaining them to a 3AM reader. Services page mentions "JOA research brief" without defining the acronym. |
| L7 | Collateral consequences accuracy | **PASS** | Phase 17: Collateral consequences properly cited to statutes. Blog posts reference state-specific laws. |
| L8 | Expert framework application | **PASS** | Phase P1-P2 POS9: Methodology over opinion maintained. Taylor's DUI framework, Scheck's forensic methodology, Spence's storytelling approach all referenced. |
| L9 | Statute citation accuracy | **PASS** | Phase 16: Blog external links verified — all point to Cornell LII, Justia, NHTSA, USSC. Phase 9-10: No broken external URLs in sampled blog posts. |
| L10 | Plea/sentencing intelligence | **PASS** | Phase P1-P2: Playbook configs include cooperation sections (federal). Score observations include sentencing stage guidance. |

**Team 3 Summary: 8 PASS / 1 NEEDS WORK / 0 FAIL / 2 N/A**

---

### Team 4: Defendant Experience (D1-D27)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| D1 | 3 AM panic test | **PASS** | Phase 4: Crisis UX 6/7. CrisisHero auto-detection 10PM-6AM. /start binary routing. StickyMobileCTA. Phase P1-P2: DUI checklist FK ~7, /start FK ~7. |
| D2 | Question quality (Voss) | **PASS** | Phase P1-P2: 6-part question format (context, question, why it matters, good answer, bad answer, follow-up). Open-ended, non-accusatory. Score tool attorney email templates are calibrated. |
| D3 | Action hierarchy (Thaler) | **PASS** | Phase P1-P2: Score results → primary CTA → urgency → attorney email template → step-down. Most important action (take the score quiz / send the email template) is also the easiest. |
| D4 | Family/life guidance | **PASS** | Phase P1-P2: /family page exists. Pain point 5 addresses family members. Checkout "Buying this for someone you love?" note. |
| D5 | Reading level (Rudd) | **NEEDS WORK** | Phase 13-21: Score observations at FK ~10 with 7 exceeding 27 words. Homepage urgency bar at FK ~11 with undefined jargon. /start and /dui-checklist pass. Phase 4: substantive content at text-sm (14px) on mobile reduces effective readability. |
| D6 | Frame deconstruction (Lakoff) | **PASS** | Phase P1-P2 POS7: "Know What They Know" reframes the courtroom dynamic. Information gap framing empowers the defendant's perspective. |
| D7 | Participatory defense (Jayadev) | **PASS** | Phase P1-P2: Score tool makes the defendant an active participant. Attorney email templates are ready-to-send. "People like us ask questions until we get answers." |
| D8 | Procedural justice awareness (Tyler) | **PASS** | Phase P1-P2: Pain points validate frustration with the process. Score observations identify where communication, motions, and discovery have fallen short. |
| D9 | Immediacy of value | **PASS** | Phase P1-P2: Score tool delivers free value before any purchase ask. DUI checklist is immediate actionable content. Homepage hero validates pain immediately. |
| D10 | Upgrade path integrity | **PASS** | Phase P1-P2: 100% upgrade credit architecture. Each tier's upsell describes what the next tier adds, not what the current tier lacks. No "without this you'll lose" language. |
| D11 | Buyer state alignment | **PASS** | Phase P1-P2 POS8: Three buyer segments served (distrust, double-check, communication gap). Score tool "My attorney says fine" handler. Family member segment addressed. |
| D12 | Repetition audit | **PASS** | Phase P1-P2: Copy variation maintained across pages. No repeated-phrase fatigue detected in the website audit scope. |
| D13 | Format fatigue resistance | **NEEDS WORK** | Phase 4: "Card monoculture" — 80+ instances of identical `rounded-xl border border-zinc-800 bg-zinc-900/50 p-6`. AI-grid aesthetic reduces visual engagement. Pain points, trust signals, features, proofs all look the same. |
| D14 | Natural voice in action sections | **PASS** | Phase P1-P2: Brand voice is direct and natural. "Send the email" not "you may want to consider." Score attorney email templates are conversational. |
| D15 | Contextual transitions | **PASS** | Phase 13-21: Section transitions are natural on /start and /dui-checklist. Homepage sequence (hero -> proof -> urgency -> pain -> bridge) flows logically. |
| D16 | Mobile scannability | **NEEDS WORK** | Phase 4: Substantive content at text-sm (14px) — FAQ answers, testimonials, pricing features, score observations, urgency blocks. Phase 13-21: Score observations 25-49 words in dense paragraphs. Headers and bold usage could be stronger on mobile. |
| D17 | Reddit relief test | **PASS** | Phase P1-P2: Score tool addresses top fears immediately. Attorney email template provides something concrete to DO in 60 seconds. Pain points use VoC from defendant forums. |
| D18 | Realistic hope | **PASS** | Phase P1-P2: Score observations tie hope to specific case facts (BAC margin of error, calibration records, chain of custody challenges). Not generic "it'll be okay." |
| D19 | Courtroom demystification | **NEEDS WORK** | Phase 13-21: Score observations mention case stages but do not tell the defendant what to physically expect at their next court appearance. The website does not currently address courtroom logistics (what to wear, where to go, how long it takes). This is addressed in product deliverables but not on the public site. |
| D20 | Unknown unknowns | **PASS** | Phase P1-P2: Score urgency blocks surface charge-specific deadlines defendants don't know about (DUI 7-day DMV hearing, suppression motion windows). Homepage urgency bar lists procedural deadlines. |
| D21 | Crisis-first sequencing | **PASS** | Phase 4: CrisisHero fires first at 10PM-6AM. /start places routing buttons above fold. StickyMobileCTA provides persistent crisis CTA. |
| D22 | Triage before depth | **NEEDS WORK** | Phase P1-P2: /services presents 15 tier cards without routing guidance for which tier is right. DiscoveryGate helps but does not fully triage. /start does this correctly with binary routing. |
| D23 | Table pacing compliance | **PASS** | Phase 4: Tables are used sparingly on the site. Sample page has 3 tables with narrative context between them. |
| D24 | Tribe signal present | **PASS** | Phase P1-P2 T4: "People like us don't just trust the system." "Join thousands of defendants who refused to go into court unprepared." Tribe signals on every conversion page. |
| D25 | Family buyer acknowledgment | **PASS** | Phase P1-P2: Pain point 5 ("I'm not the one facing charges — but I'm the one doing all the research"). /family page. Checkout family buyer note. |
| D26 | No-attorney reframe | **PASS** | Phase P1-P2: Score tool works for defendants without attorneys. /start binary routing handles both "have documents" and "haven't received documents" states. |
| D27 | Timing-ambiguous discovery copy | **PASS** | Phase P1-P2: /start binary routing handles all 3 states (have documents / don't have documents). DiscoveryGate on services page filters appropriately. |

**Team 4 Summary: 21 PASS / 6 NEEDS WORK / 0 FAIL**

---

### Team 5: Conversion & Value Architecture (C1-C10, OA1-OA4)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| C1 | Value equation clarity (Hormozi) | **PASS** | Phase P1-P2 POS11: Stakes section quantifies ($10K-$100K attorney fees, 1-20 years). "The question is not whether $197 is worth it." Attorney cost comparison grid on services. |
| C2 | Standalone tier value (Brunson) | **PASS** | Phase P1-P2: Each tier description communicates complete, usable value. No "for the full analysis, upgrade to..." language. Playbook delivers instantly without requiring higher tier. |
| C3 | Natural tier revelation | **PASS** | Phase P1-P2 CRO12: Upgrade path surfaces naturally after value delivery. Score results show CTA after observations, not before. Playbook mentions upgrade credit as a follow-on, not a necessity. |
| C4 | Real urgency only (Kennedy) | **PASS** | Phase P1-P2 CRO5: All urgency based on real legal deadlines. No countdown timers, no "limited spots." Suppression motion deadlines, DMV hearing windows, arraignment timelines. |
| C5 | Awareness bridge (Schwartz) | **PASS** | Phase P1-P2: Homepage hero moves from Problem-Aware ("Your attorney hasn't called back") to Solution-Aware ("We research your charges and hand you the exact questions"). Score tool educates before selling. |
| C6 | Post-purchase value drip (Chaperon) | **NEEDS WORK** | Phase P1-P2 CRO13: Post-purchase flow (success page + drip emails) was not audited. Reality Checker blind spot #1 and #2. Phase 13-21: Drip email copy is strong (FK ~7-8) but delivery/rendering untested. |
| C7 | Authority signals (Cialdini) | **PASS** | Phase P1-P2 POS3: 40+ named attorneys. Specific methodologies (Taylor, Scheck, Spence). "375+ exonerations." Expert sourcing visible on every product page. |
| C8 | Permission respect (Godin) | **PASS** | Phase P1-P2 CRO14: Email capture non-blocking. Score delivers full value before email ask. Drip emails are charge-type relevant. No unwanted communications reported. |
| C9 | Crisis-moment interception (Suby) | **PASS** | Phase P1-P2 CRO17: Crisis mode auto-detection 10PM-6AM. /start CrisisHero. StickyMobileCTA. Playbook instant download (no wait for 2AM buyers). |
| C10 | Tribal identity (Godin) | **PASS** | Phase P1-P2 T4: "Defendants who prepare instead of wait." No shaming of unprepared defendants. Preparation positioned as smart, not unusual. |
| OA1 | Dream outcome leads | **PASS** | Phase P1-P2: Tier descriptions lead with outcomes ("Walk into your next hearing with the right questions") not features ("We analyze 500 pages"). |
| OA2 | Tier-specific social proof | **NEEDS WORK** | Phase P1-P2: Testimonials exist but are not tier-specific in the audit scope. A DUI playbook testimonial may appear on the Intelligence Brief checkout. Not verified because testimonial source was not tier-tagged in the reviewed code. |
| OA3 | Guarantee proportionality | **PASS** | Phase P1-P2: X-Ray has 3-layer guarantee stack (Discovery + Attorney Meeting + Delivery). Playbook has "Find It or It's Free." Guarantee complexity scales with price. |
| OA4 | Guarantee honesty | **PASS** | Phase P1-P2: "Find It or It's Free" is concrete. No "satisfaction guarantee" mislabeling. Upgrade credit clearly labeled as credit, not refund. |

**Team 5 Summary: 11 PASS / 2 NEEDS WORK / 0 FAIL / 1 N/A (C6 partially scored due to unaudited post-purchase flow)**

---

### Team 6: Rendering & Delivery (R1-R11)

Note: Team 6 primarily evaluates rendered report HTML. For the website audit, scoring is based on the site's rendering, delivery UX, and print/sanitization behavior.

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| R1 | Header completeness | **N/A** | Report header — not website. |
| R2 | Methodology note | **PASS** | Phase P1-P2: Methodology attributions present on services, playbook, checkout pages. Expert names correct per charge type. |
| R3 | Table rendering | **PASS** | Phase 8: Sample page tables render correctly. No raw markdown visible. Phase 9-10: No broken table rendering in Lighthouse audit. |
| R4 | Section structure | **PASS** | Phase 7: Heading hierarchy verified — h1 -> h2 -> h3 correct on /score, confirmed clean on /playbook/dui-first-offense. Phase 16: Single H1 on all audited pages. |
| R5 | Footer disclaimer | **PASS** | Phase 17: "Legal information, not legal advice" in footer on every page. Phase 18-20: Terms and privacy pages comprehensive. |
| R6 | Upgrade CTA | **PASS** | Phase P1-P2 CRO12: Correct tier names, correct prices, correct upgrade credits on all conversion surfaces. |
| R7 | Print safety | **NEEDS WORK** | Phase 4: Not fully verified. The Phase 4 design audit mentions no @media print analysis. The Phase 6 security audit notes the report viewer has sanitization. Print styles for the public website were not audited. |
| R8 | Sanitization survival | **PASS** | Phase 6: Sanitize-html configuration tightened. Checkboxes, blockquotes, styled divs survive. Background URL injection blocked. |
| R9 | Special characters | **PASS** | No mojibake or encoding errors reported in any phase. Em dashes, checkmarks, Unicode characters render correctly per Phase 4 and Phase 13-21 reviews. |
| R10 | Content completeness | **N/A** | Report word count — not website. |
| R11 | Conditional section adequacy | **N/A** | Report conditional sections — not website. |

**Team 6 Summary: 7 PASS / 1 NEEDS WORK / 0 FAIL / 3 N/A**

---

### Team 7: System Truth (ST1-ST16)

Note: Team 7 evaluates whether the site communicates insider system knowledge. The website is the primary surface for this.

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| ST1 | Plea mill exposure | **PASS** | Phase P1-P2: Pain points explain WHY attorneys push pleas. Backstory narrative describes the flat fee dynamic. Blog posts cover attorney fee structures. |
| ST2 | Instinct validation | **PASS** | Phase P1-P2 T5: "Your gut was right. Something is wrong." Score band-specific copy validates the defendant's instincts with specifics, not platitudes. |
| ST3 | Good answer / bad answer | **PASS** | Phase P1-P2: 6-part question format includes "good answer" and "bad answer" benchmarks. Score attorney email templates provide expected response framing. |
| ST4 | Insider language | **PASS** | Phase P1-P2 T1: "Everyone in the courtroom knows each other" observation requires lived experience. "The calls got shorter. Then they stopped." Insider language throughout. |
| ST5 | Financial incentive transparency | **PASS** | Phase P1-P2: Blog post "How Your Attorney Makes Money" explicitly covers fee structures. Homepage pain points allude to financial dynamics without attacking. |
| ST6 | Blue wall exposure | **NEEDS WORK** | Phase P1-P2 POS2: The competitive frame does not explicitly address why second opinions from other attorneys are unreliable. The "blue wall" dynamic is not surfaced on the website (appropriately per U13 non-adversarial framing). Scoring as NEEDS WORK because the site could explain this phenomenon without being adversarial, but currently does not. |
| ST7 | Assembly-line indicators | **PASS** | Phase P1-P2: Score observations identify volume practice signs (no motions filed, no communication, no strategy discussion). Pain points describe the experience of being in a volume practice. |
| ST8 | Fear tactic recognition | **PASS** | Phase P1-P2: Score observations help defendants distinguish real risk from inflated fear. Urgency is based on real deadlines, not fear-based manipulation. |
| ST9 | Dependency pattern recognition | **PASS** | Phase P1-P2: Pain point 2 ("Nobody explained anything to me") names the information withholding pattern. Score observations identify when attorneys haven't shared strategy. |
| ST10 | Dignity awareness | **PASS** | Phase P1-P2 T5: "The calls got shorter" validates the daily indignities. Pain points name the emotional experience without blaming the defendant. |
| ST11 | Rights they won't tell you | **PASS** | Phase 17: Blog post covers right to fire attorney, right to see discovery, right to bar complaints. FAQ addresses "Can I fire my attorney?" Score observations mention motion filing rights. |
| ST12 | Agency without advice | **PASS** | Phase 17: UPL compliance infrastructure prevents crossing into directives. Score tool validates and informs without directing. Questions empower without prescribing. |
| ST13 | System literacy | **PASS** | Phase P1-P2 POS7: "Everyone in the courtroom knows each other" teaches the courthouse ecosystem. Blog posts explain how the system works behind the scenes. |
| ST14 | Credibility grounding | **PASS** | Phase P1-P2 T2: Every proof point is specific (68.3g, 73% weight discrepancy, 21 fingerprints). No unsourced cynicism. Phase 16: .gov/.edu citations on 35+ blog posts. |
| ST15 | Intake-signal alignment | **N/A** | This evaluates report content matched to intake data — not the website. |
| ST16 | Emotional peak CTA | **PASS** | Phase P1-P2: Score results place CTA at peak emotional moment (right after scoring). Playbook urgency section places CTA after deadline awareness. Homepage CTA follows pain point validation. |

**Team 7 Summary: 14 PASS / 1 NEEDS WORK / 0 FAIL / 1 N/A**

---

### Team 8: SEO & GEO Pioneer (GEO1-6, SEO1-7, LOC1-2)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| GEO1 | LLM Readability (Kopp) | **PASS** | Phase 16: TLDRBox components are answer-first, extractable chunks. Speakable spec targets .tldr-box directly. Blog posts lead with structured answers. |
| GEO2 | GEO content signals (Princeton) | **PASS** | Phase 16: Expert quotations (40+ named attorneys), specific statistics (68.3g, 73%), source citations (.gov/.edu on 35+ posts). Princeton baseline met. |
| GEO3 | Citation schema (Princeton) | **NEEDS WORK** | Phase 16 H2: `sex-offense` category missing from getArticleCitations(). New sex offense post generates no citation schema. Phase 9-10 C1: 5 of 8 DefinedTermSet URLs point to non-existent blog posts — broken entity graph. |
| GEO4 | Entity identity (Barnard) | **NEEDS WORK** | Phase 16: Organization schema consistent across pages. sameAs limited to Twitter only — missing Reddit, LinkedIn. Blog CollectionPage has unverified Reddit sameAs URL. Logo schema lacks dimensions. |
| GEO5 | Schema completeness (Barnard/van Berkel) | **NEEDS WORK** | Phase 16 M5: /playbooks catalog has no FAQ schema. /score has no FAQ schema despite being a high-value quiz page. Phase 16 C2: SearchAction targets non-existent /blog?q= search. Phase 16 H5: DefinedTermSet rendering not confirmed. |
| GEO6 | Retrieval architecture (King) | **PASS** | Phase 16: Semantic HTML, heading hierarchy verified, internal entity references consistent. Speakable spec on all blog posts. DefinedTermSet creates glossary layer. |
| SEO1 | E-E-A-T signals (Haynes) | **PASS** | Phase 16: Editorial policy page comprehensive. About page has strong Experience signal (68.3g story). .gov/.edu citations on 35+ posts. Attorney methodology attributions visible. |
| SEO2 | Human authorship (Haynes/Ray) | **NEEDS WORK** | Phase 16: Article schema uses Organization as author, not Person. For YMYL, Google prefers Person entity with credentials. The anonymous brand is intentional but creates an E-E-A-T gap. No reviewedBy property on articles. |
| SEO3 | Topical authority signal (Gubur) | **NEEDS WORK** | Phase 16 M6: State DUI pages do not link to blog posts or hub. Phase 16 H1: /dui-defense hub absent from sitemap. Blog posts have related posts but cross-cluster linking is weak. Orphan pages identified (/research/defense-score-data, /family). |
| SEO4 | JS rendering health (Goralewicz) | **PASS** | Phase 9-10: Lighthouse SEO 100/100 on all 4 pages. SSR renders content server-side. Schema in server components. FCP 1.0-1.5s confirms fast server rendering. |
| SEO5 | Image accessibility (Ray) | **PASS** | Phase 7: All images have alt attributes. No bare img tags missing alt. next/image components all have alt props. |
| SEO6 | Legal ethics in SEO (Tsakalakis) | **PASS** | Phase 17 + Phase 16: No meta description promises legal advice or outcomes. Title tags frame as "information" and "research." No schema claims attorney-client relationship. |
| SEO-YMYL | YMYL credentialing signals | **NEEDS WORK** | Phase 16: No reviewedBy property. Organization-as-Author without external sameAs beyond Twitter. Missing inLanguage and isAccessibleForFree on Article schema. |
| LOC1 | Local search intent alignment | **PASS** | Phase 16: 50 state DUI pages with state-specific content. Blog posts include jurisdiction-relevant signals. Score tool captures charge type for geographic relevance. |
| LOC2 | Local trust signals (Gifford) | **NEEDS WORK** | Phase 16 M4: State DUI pages are template-driven thin content (400-600 words, mostly variable substitution). Unique state-specific content limited to one `data.note` paragraph. No state-specific case law citations on most state pages. |

**Team 8 Summary: 8 PASS / 7 NEEDS WORK / 0 FAIL**

---

### Team 9: Positioning & Tone (POS1-POS11 + POS3-B)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| POS1 | Pro-defendant not anti-attorney | **PASS** | Phase P1-P2 POS6: Zero anti-attorney language. "The right attorneys welcome informed clients." Pain points blame the information gap, not attorneys personally. |
| POS2 | Category framing | **PASS** | Phase P1-P2: "Know What They Know" frames a new category (defendant preparation intelligence). No "better than your attorney" positioning. |
| POS3 | Anxiety resolution | **PASS** | Phase P1-P2: FAQ includes "Will this upset my attorney?" with explicit resolution. "The right attorneys welcome informed clients" addresses attorney-relationship anxiety. |
| POS3-B | Implied competence test | **PASS** | Phase P1-P2: Proof stories describe systemic communication gaps, not individual attorney incompetence. 68.3g story attributes the finding to the information gap, not attorney negligence. |
| POS4 | Dual-audience safe | **PASS** | Phase P1-P2 POS4: Three segments served. "My attorney says everything is fine" handler serves double-checkers. No copy exclusively serves distrust segment. |
| POS5 | Vulnerability not conspiracy | **PASS** | Phase P1-P2 T5: Origin story describes real experiences without systemic malice attribution. "The calls got shorter" is a felt experience, not a conspiracy claim. |
| POS6 | Referral-partner safe | **PASS** | Phase P1-P2: A public defender could send a client to this site. Copy positions the service as complementary, not competitive. No language that would embarrass a referring attorney. |
| POS7 | Competitive alternative acknowledgment | **NEEDS WORK** | Phase P1-P2 POS2: "Just trust my attorney" default addressed via score tool and FAQ. But the real competitor (doing nothing/inertia) is not explicitly named above fold on homepage or services. Score tool urgency messaging addresses inertia but homepage does not. |
| POS8 | Cross-tier narrative coherence | **PASS** | Phase P1-P2: Tone progression from empowerment ($97) to intelligence ($997) to operations ($2,497+) is managed through tier descriptions. No jarring register shifts. |
| POS9 | 5-second category test | **PASS** | Phase P1-P2 POS1: "Your Case File Has Answers. We Find Them." + "Built by a defendant who read his own 500-page discovery file" immediately signals this is NOT a law firm. |
| POS10 | Family buyer entry point | **PASS** | Phase P1-P2 POS8: Family buyers addressed on homepage (pain point 5), /family page, checkout ("Buying this for someone you love?"), and services page. Not only on /family. |
| POS11 | Value frame continuity | **PASS** | Phase P1-P2: "We Research. You Know." framing consistent across tiers. Higher tiers add depth without breaking the frame. |

**Team 9 Summary: 11 PASS / 1 NEEDS WORK / 0 FAIL** (GATE: all criteria pass or NEEDS WORK, no FAIL)

---

### Team 10: CRO & Conversion Quality (CRO1-CRO17)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| CRO1 | Message clarity (Laja) | **PASS** | Phase P1-P2: All pages communicate what/who/what-next within 5 seconds. Score page is the strongest (10/10 clarity). |
| CRO2 | Anxiety reduction (McGlaughlin) | **PASS** | Phase P1-P2: Every CTA has surrounding trust signals. Checkout has guarantee before features. TrustBadges component deployed near CTAs. |
| CRO3 | VoC language (Wiebe) | **PASS** | Phase P1-P2: "My lawyer won't return my calls." "Nobody explained anything to me." VoC from defendant forums, not marketing language. |
| CRO4 | Emotional targeting (Wolf) | **PASS** | Phase P1-P2: Self-image ("I'm taking control") via score tool. Social image ("my family sees me fighting") via family segment acknowledgment. |
| CRO5 | Crisis-buyer urgency (McGlaughlin/Saleh) | **PASS** | Phase P1-P2 CRO5: Real deadlines (DMV hearing 7 days, suppression motions 30 days). No countdown timers or fake scarcity. |
| CRO6 | Charge-type personalization (Saleh) | **PASS** | Phase P1-P2: Score results charge-specific. Checkout feltExperience charge-specific. Playbook configs per charge type. 12-category homepage selector. |
| CRO7 | Sample deliverable visibility | **PASS** | Phase P1-P2: /sample accessible from services page and playbook pages. One-click access from conversion surfaces. Not gated behind email. |
| CRO8 | Price-to-stakes justification | **PASS** | Phase P1-P2 POS11: "$10K-$100K attorney fees, 1-20 years potential incarceration" stakes section. Price shown in context of stakes on every conversion page. |
| CRO9 | Buyer state coverage | **PASS** | Phase P1-P2 POS4 + POS8: Three buyer segments addressed. Score tool handler for each. |
| CRO10 | Crisis window alignment | **PASS** | Phase P1-P2: DUI checklist uses 72-hour / 7-day windows (real DUI deadlines). Score urgency blocks cite charge-specific filing windows. |
| CRO11 | Contactability at decision point | **NEEDS WORK** | Phase P1-P2: Contact email visible on checkout error page and error states. Not prominent on services, playbook, or checkout primary views. Help@imnotanattorney.com is in the footer but not near high-intent CTAs. |
| CRO12 | Covello Mental Noise compliance | **NEEDS WORK** | Phase 13-21: Homepage urgency bar has 7 items (exceeds Rule of 3). Homepage has 13 sections. /start passes (binary routing, single CTA). /score observations exceed 27 words. |
| CRO13 | Crisis-mode rendering | **PASS** | Phase P1-P2 CRO17: CrisisHero auto-detected 10PM-6AM. /start crisis variant with single CTA. Covello-compliant simplified rendering. |
| CRO14 | Credit-as-hero positioning | **PASS** | Phase P1-P2 CRO12: Upgrade credit math is visible on checkout nudge, playbook upgrade section, services page. "100% Applied" banner. |
| CRO15 | Loss framing on upsell emails | **NEEDS WORK** | Not auditable from website alone — depends on drip email content. Phase 13-21 reviewed copy but not subject line framing strategy. Phase P1-P2 CRO13 notes post-purchase flow was not audited. |
| CRO16 | Discovery-arrival email cadence | **NEEDS WORK** | Not fully auditable. Phase 13-21 reviewed drip email copy at FK ~7-8 but did not verify cadence timing or conditional logic against this criterion's specific Day 30/Day 45 requirements. |
| CRO17 | War Room post-purchase experience | **NEEDS WORK** | Not auditable from website front-end alone. War Room post-purchase UX requires reviewing the success page, onboarding flow, and SR upsell trigger logic — none of which were in the audit scope. |

**Team 10 Summary: 12 PASS / 5 NEEDS WORK / 0 FAIL** (GATE: no FAIL criteria)

---

### Team 11: Trust Architecture (T1-T5, ANON1-ANON5)

| ID | Criterion | Score | Evidence |
|----|-----------|-------|----------|
| T1 | Vulnerability coherence | **PASS** | Phase P1-P2 T5: "The calls got shorter. Then they stopped. I decided to read the file myself." Above-fold observation requiring lived experience. Specific (68.3g, CI phone attribution), not polished marketing. Reality Checker downgrades to CONDITIONAL — I **partially agree**: the copy analysis is strong but lacks user-testing validation. Scoring PASS because the criterion asks "does the copy contain vulnerability coherence" and it does. Whether it *works* with the audience is a different question (unaudited). |
| T2 | Transformation identity through-line | **NEEDS WORK** | Phase P1-P2 T4: Tribe signal present on homepage, score, playbooks. Reality Checker blind spot #2: checkout success page and post-purchase emails were not audited. Cannot confirm tribe signal persists after payment. |
| T3 | Implicit permission precision | **PASS** | Phase P1-P2: DUI checklist subscribers get DUI content. Score tool subscribers get score-related content. Drip emails are charge-type tagged. |
| T4 | Shame permission signal | **PASS** | Phase P1-P2: Pricing framed as empowered action ("defendants who prepare"). No "your situation is worse = pay more" framing. Each tier positioned as appropriate for a case stage, not situation severity. |
| T5 | The Less Alone Test | **PASS** | Phase P1-P2: First scroll on homepage is pain point validation, not feature lists. "Your attorney hasn't called back" before any benefit statement. Reality Checker downgrades to CONDITIONAL — I **disagree** on this specific criterion. The criterion asks whether first scroll has recognition of felt experience before value proposition. It does. User testing would validate effectiveness, but the criterion is about presence, not measured effectiveness. |
| ANON1 | Testimonial outcome specificity | **NEEDS WORK** | Phase 4: Testimonials render at text-sm (14px). Phase P1-P2: Testimonials quoted include first name + last initial (Sarah K., Marcus T.). Charge type is implied but not explicit in all testimonials. Not all include specific outcome claims. |
| ANON2 | Externally verifiable proof | **PASS** | Phase 16: .gov/.edu citations on 35+ blog posts. Court procedures and statutes are externally verifiable. DiscoveryReveal shows actual PCSO document imagery. |
| ANON3 | Methodology attribution resolution | **PASS** | Phase P1-P2: Named attorneys (Lawrence Taylor, Barry Scheck, Gerry Spence) with published works cited. "375+ exonerations" is verifiable through Innocence Project public records. |
| ANON4 | Verifiable case facts | **PASS** | Phase P1-P2 T2: 68.3g weight discrepancy, 19-day calibration window, CI phone number attribution — these are specific forensic facts that could be verified against court records. |
| ANON5 | Contact response time signal | **NEEDS WORK** | Phase 18-20: Contact email (help@imnotanattorney.com) exists. CRO11 notes contact not prominent on high-intent pages. No response time promise visible on checkout, services, or sample pages. |

**Team 11 Summary: 7 PASS / 3 NEEDS WORK / 0 FAIL** (GATE: no FAIL criteria)

---

## Additional Criteria: Accessibility, Security, Performance, Privacy

These criteria are not part of the 11 evaluation teams but are essential for a YMYL site audit. Scored as PASS/NEEDS WORK/FAIL.

### Accessibility (WCAG 2.1 AA)

| Area | Score | Evidence |
|------|-------|----------|
| axe-core runtime | **NEEDS WORK** | Phase 3: 5 unique violations, 2 SERIOUS (scrollable region, links by color only), 3 MODERATE (duplicate main x4 pages). 7 of 13 pages clean. |
| jsx-a11y static | **NEEDS WORK** | Phase 7: 21 real issues — 14 SERIOUS (missing label/htmlFor), 3 SERIOUS (autoFocus public pages), 3 MODERATE (autoFocus admin), 1 MODERATE (span onClick). |
| Autofix readiness | **PASS** | Phase 14: 19 patches written across 12 files. ~100 minutes to apply. All AUTO-FIX or HUMAN-REVIEW categorized. |
| Color contrast | **PASS** | Phase 3: Zero color-contrast violations. Phase 4: amber-on-black 9.5:1, zinc-300-on-zinc-950 15:1. |
| Keyboard navigation | **NEEDS WORK** | Phase 8: Scrollable region on /sample not keyboard-focusable. IntakeChargeSelector span onClick has no keyboard handler. Login pages autoFocus disorients screen readers. |
| Focus management | **PASS** | Phase 7: Mobile nav has scroll lock, focus trap, Escape handler. DiscoveryGate has aria-pressed. IntakeChargeQuestions has full ARIA radio pattern. |
| Landmarks | **NEEDS WORK** | Phase 8: Duplicate main on 4 pages (services, playbooks, score, start). Root cause: page components use `<main>` when layout.tsx already provides one. |
| Link distinguishability | **NEEDS WORK** | Phase 8: hover:underline convention on inline text links violates WCAG 1.4.1 — links distinguished by color only at rest. 7 instances on /research page, likely site-wide. |

### Security

| Area | Score | Evidence |
|------|-------|----------|
| Authentication | **PASS** | Phase 6: Defense-in-depth (middleware + route guards). HMAC-then-compare timing-safe. Magic links: 256-bit tokens, SHA-256 hashed, 15-min expiry, single-use atomic RPC. |
| Input validation | **PASS** | Phase 6: Charge type allowlist. HTML escaping on all email templates. Parameterized Supabase queries. Magic byte file validation. |
| Rate limiting | **NEEDS WORK** | Phase 6 S-3: Unsubscribe POST endpoint has no rate limiting. All other endpoints covered with Postgres-backed + in-memory fallback. |
| Dependencies | **FAIL** | Phase 6 S-5: 6 npm audit vulnerabilities including Next.js CSRF bypass (GHSA-mq59-m269-xvcx) and HTTP request smuggling. Production framework has known CVEs. |
| Data protection | **FAIL** | Phase 6 S-6: Report tokens stored unhashed in database. Criminal defense reports — the most sensitive data on the platform — accessible via plaintext token extraction from any database breach. |
| CSP | **NEEDS WORK** | Phase 6 S-4: Missing object-src and worker-src directives. CSP exists and is nonce-based (Phase 6 confirms, contradicting Phase 9-10's Lighthouse finding — Phase 6 is authoritative). |
| SSRF | **PASS** | Phase 6: IndexNow URL validated against site domain. All fetch targets use env vars, not user input. |
| File upload | **PASS** | Phase 6: 10-point security checklist verified. UUID validation, ownership check, MIME allowlist, magic byte validation, private bucket. |

### Performance

| Area | Score | Evidence |
|------|-------|----------|
| LCP | **NEEDS WORK** | Phase 9-10: Homepage 3.5s, playbook 3.4s, blog 2.9s. Target <2.5s. Score page 1.9s (passes). Root cause: ~3s element render delay from heavy JS. |
| CLS | **PASS** | Phase 9-10: 0.00 on all 4 pages. Perfect layout stability. |
| TBT/INP | **NEEDS WORK** | Phase 9-10: TBT 240-264ms (borderline yellow). Score INP 210ms (marginally over 200ms target). Correlated with unused JS. |
| Unused JS | **NEEDS WORK** | Phase 9-10: 61-113 KB unused JS per page. Blog index worst (113 KB). Primary offender: fa2781425ab4846b.js chunk. |

### Privacy & Compliance

| Area | Score | Evidence |
|------|-------|----------|
| Privacy policy accuracy | **FAIL** | Phase 18-20 C1: Privacy policy Section 8 claims "no tracking cookies" while GA4 is live and setting _ga/_ga_* cookies. Factually false statement in a legal document on a YMYL legal site. |
| Data retention | **PASS** | Phase 18-20: Section 6 is unusually thorough — specific retention periods for every data type. |
| CCPA compliance | **PASS** | Phase 18-20: "Do not sell" statement. Deletion request mechanism. 18 additional state privacy laws enumerated. |
| UPL disclaimers (Terms) | **PASS** | Phase 18-20: Section 3 is comprehensive UPL protection. Intake form has per-submission disclaimer. |
| Error states | **PASS** | Phase 18-20: 404 is on-brand with recovery paths. Report viewer has 6 access control states. My-case portal has 5 token error states. Score and checkout have proper error handling. |
| Error a11y | **NEEDS WORK** | Phase 18-20: checkout/error.tsx, my-cases/login error div, and intake step validation all missing role="alert". Score page disabled submit has no aria-disabled. |

### Code Quality

| Area | Score | Evidence |
|------|-------|----------|
| Logic bugs | **FAIL** | Phase 19 C1: Stale WHERE clause in intake route line 276 — auto-generation detection broken for Flow B (paid before intake). Status updated to "intake" then WHERE clause checks for "awaiting-intake". One-line fix. |
| Error handling | **NEEDS WORK** | Phase 19 H1: Missing try/catch around req.json() in checkout route. Malformed body returns 500 instead of 400. |
| Type safety | **NEEDS WORK** | Phase 19 M3/M4: `as any` usage in webhook handler and deliver route. Stripe invoice typed as any instead of Stripe.Invoice. |
| Dead code | **NEEDS WORK** | Phase 19 M1/M2: Unused AnimatedCounter import on homepage. Unused productType destructured in checkout. |
| Broken links | **FAIL** | Phase 9-10 C1: 5 of 8 DefinedTermSet URLs point to non-existent blog posts. Broken entity graph undermines GEO strategy. |

---

## Reality Checker Response

### Challenge 1: Trust T1-T5 all PASS -> CONDITIONAL PASS
**Verdict: PARTIALLY AGREE.** The copy analysis is thorough and the trust architecture is well-designed. However, I distinguish between criterion compliance (does the copy contain the required element?) and effectiveness validation (does it work with this audience?). The criteria ask for presence and design quality, not measured conversion. I score T1 and T5 as PASS (the elements are present and well-executed). I score T2 as NEEDS WORK (tribe signal persistence after payment is unverified — the Reality Checker's point about the success page blind spot is valid). I agree that the ANON criteria need more scrutiny — ANON1 and ANON5 are NEEDS WORK.

### Challenge 2: Lighthouse a11y 100/100 called "exceptional"
**Verdict: AGREE.** Lighthouse 100 is a subset score. Phase 3 found 5 violations (2 SERIOUS) and Phase 7 found 21 issues (14 SERIOUS). The accessibility posture is NEEDS WORK until the Phase 14 patches are applied. The word "exceptional" in the Phase 9-10 report is misleading without cross-referencing sibling reports.

### Challenge 3: Security "above-average" with 2 SERIOUS findings
**Verdict: AGREE.** The security foundations (HMAC timing-safe, rate limiting, magic byte validation, defense-in-depth auth) ARE genuinely strong. But 2 SERIOUS findings open — one a known CVE (Next.js CSRF bypass) and one a fundamental data protection gap (unhashed report tokens for criminal defense data) — means the current posture is "strong foundations with critical gaps." I score dependencies and data protection as FAIL.

### Challenge 4: UPL "strong compliance posture" with B4 live
**Verdict: AGREE.** The UPL compliance infrastructure is genuinely strong. But FLAG B4 is a clear U4 violation in published, indexable blog content. One clear violation in published content makes the overall posture CONDITIONAL, not "strong." I score U1 as NEEDS WORK and U8 as NEEDS WORK. The infrastructure passes; the blog content has two items that need fixing.

### Challenge 5: Lighthouse SEO 100/100
**Verdict: AGREE.** Lighthouse SEO is a baseline check. Phase 16 found 3 CRITICAL, 7 HIGH issues including title tags up to 92 characters and broken SearchAction schema. SEO is NEEDS WORK on multiple criteria despite Lighthouse 100.

### Challenge 6: CRO6 guarantee visibility — text-sm finding
**Verdict: AGREE with the Reality Checker's assessment — UPHELD with reservation.** The CRO architecture is correct. The text-sm issue is a Design finding that affects the guarantee's practical effectiveness but does not negate its architectural presence. I score CRO2 (anxiety reduction) as PASS because the guarantee is present and well-placed; the font sizing is a separate Design/D16 finding.

### Challenge 7: /start page PASS at FK ~7
**Verdict: AGREE with the original PASS.** /start is genuinely the best-performing page on the site. Well-supported evidence.

### Challenge 8: Terms UPL disclaimers PASS vs. privacy policy GA4 claim
**Verdict: AGREE with the Reality Checker's distinction.** Terms UPL disclaimers remain PASS — they are genuinely well-written. Privacy compliance overall is FAIL due to the factually incorrect GA4 claim. These are different surfaces with different assessments.

### Challenge 9: Crisis UX 6/7 should account for score observation readability
**Verdict: PARTIALLY AGREE.** The crisis UX architecture (CrisisHero, binary routing, auto-detection) is the site's strongest design area and deserves high marks. However, the score observations — which are the crisis UX output — have readability failures (7 exceed 27 words, FK ~10). I account for this in P9 (NEEDS WORK) and P11 (NEEDS WORK) rather than double-penalizing the crisis UX infrastructure. The entry path is excellent; the output path needs work. These are scored in the appropriate criteria.

### Challenge 10: CRO17 crisis buyer fast-path PASS
**Verdict: AGREE with the original PASS.** The crisis mode implementation is genuine and comprehensive.

---

## Top 10 Priority Fixes

Ordered by business impact, combining findings across all phases.

### 1. Fix the privacy policy GA4 false statement
**Phase 18-20 C1 | FAIL | 10-minute fix**
Privacy policy Section 8 claims "Our website does not use tracking cookies" while GA4 is live setting _ga/_ga_* cookies. A provably false statement in a legal document on a YMYL legal site. Either update Section 8 to disclose GA4 or remove GA4. Also add Google Analytics to Section 5 third-party services list. This is the single highest-risk item because it is a factual error in a legal document that undermines the credibility of all legal pages.

### 2. Fix the intake route WHERE clause bug
**Phase 19 C1 | FAIL | 1-line fix**
`src/app/api/intake/route.ts` line 276: `.eq("status", "awaiting-intake")` should be `.eq("status", "intake")`. The stale WHERE clause means auto-generation detection is broken for Flow B (paid before intake). The stuck-generating cron cannot catch failures because the case never enters "generating" status. Payment-critical path.

### 3. Fix the 5 dead DefinedTermSet URLs
**Phase 9-10 C1 / Phase 16 C3 | FAIL | 30-minute fix**
`src/lib/schema.ts` lines 233-278: 5 of 8 glossary term URLs point to non-existent blog posts. Broken entity graph directly undermines the GEO strategy the schema was built to serve. Fix by updating URLs to existing blog slugs (mappings provided in Phase 9-10).

### 4. Fix the blog UPL violation B4
**Phase 17 FLAG B4 | NEEDS WORK (GATE team) | 5-minute fix**
`content/blog/attorney-not-returning-calls.mdx` line 194: "you need to take immediate action. That means exploring new counsel, contacting the bar, or filing a motion for substitution of counsel." Replace with: "Immediate action is worth considering — options include exploring new counsel, contacting the bar, or filing a motion for substitution of counsel." This is live, indexable, and the clearest U4 instance in the blog.

### 5. Upgrade Next.js to fix CSRF bypass CVE
**Phase 6 S-5 | FAIL | Medium effort (test after upgrade)**
`npm install next@16.2.2`. The Next.js CSRF bypass (GHSA-mq59-m269-xvcx) allows null Origin to bypass Server Actions CSRF checks. Plus HTTP request smuggling advisory. Production framework with known CVEs on a site handling criminal case data and $9,997 payments.

### 6. Fix broken SearchAction schema
**Phase 16 C2 | NEEDS WORK | 5-minute fix**
`src/app/layout.tsx` line 161-165: SearchAction targets `/blog?q={search_term_string}` but the blog page only supports `?category=` filtering. Either remove potentialAction entirely or implement actual blog search.

### 7. Apply Phase 14 a11y autofix patches
**Phase 14 | NEEDS WORK (19 patches, 12 files) | ~100 minutes**
Eliminates all known axe-core and jsx-a11y violations: duplicate main (4 pages), scrollable region focus (1 page), color-only links (1 page), missing htmlFor/id (4 files), autoFocus removal (2 public-facing files), span onClick fix (1 file). Patches are written and ready to apply.

### 8. Hash report tokens in database
**Phase 6 S-6 | FAIL | Medium effort (migration required)**
Report access tokens stored as plaintext UUIDs in cases.report_token. Criminal defense reports — the most sensitive data on the platform — exposed in any database breach. Requires graceful migration: add report_token_hash column, populate from existing tokens, update lookup to check hash first, drop plaintext after all tokens expire (12 months).

### 9. Fix title tag overruns on 4 high-traffic pages
**Phase 16 C1 | NEEDS WORK | 30-minute fix**
/blog title with template = 83 chars, /services = 92 chars, /playbooks = 82 chars, /research/defense-score-data = 91 chars. SERP truncation on the highest-traffic pages. Target: all titles <=42 chars so template produces <=60 total.

### 10. Bump substantive body text from text-sm to text-base
**Phase 4 M8 | NEEDS WORK | 60-minute fix**
Systematic change across FAQAccordion.tsx, TestimonialSection.tsx, PricingTable.tsx, PlaybookSalesPage.tsx, score page observations. Every page, every user, every mobile device. Crisis buyers with 80% reduced cognitive capacity (Covello) are reading decision-critical content at 14px. The single change with the broadest UX impact.

---

## Cross-Phase Contradictions Adjudicated

### Lighthouse a11y 100 vs. axe-core/jsx-a11y violations
**Resolution:** Lighthouse runs a limited subset of rules. The 100/100 is accurate for what Lighthouse checks but misleading as an overall accessibility assessment. The authoritative finding is Phase 3 + Phase 7 + Phase 8: NEEDS WORK with 26 real violations, patches ready.

### Phase 6 "above-average security" vs. 2 SERIOUS findings
**Resolution:** Architectural security quality IS above-average (timing-safe auth, HMAC, rate limiting, magic byte validation). Current risk posture is NOT above-average with 2 SERIOUS open findings. Score as FAIL on dependencies and data protection; PASS on architecture.

### Phase 9-10 "No CSP header" vs. Phase 6 CSP analysis
**Resolution:** Phase 6 confirms CSP exists in middleware.ts with nonce-based implementation. Lighthouse may have failed to detect it due to middleware injection vs. static header detection. Phase 6 is authoritative. CSP exists and is well-configured but missing object-src and worker-src.

### Privacy "no tracking cookies" vs. GA4 live
**Resolution:** Not a cross-phase contradiction (same report identified both). Highest-severity finding in the entire audit. Must be fixed immediately.

### Readability PASS on drip emails vs. jargon in attorney templates
**Resolution:** NURTURE emails deserve PASS (FK ~7-8, conversational). Attorney email templates are a separate sequence with legitimate higher register but undefined acronyms (SORNA, USSG, Rule 16). Templates scored as NEEDS WORK; main drip emails scored as PASS.

---

## What This Audit Did Not Cover (Blind Spots from Reality Checker)

1. **End-to-end payment flow testing** — No report tested the complete purchase-to-delivery path.
2. **Checkout success page** — Not audited. CRO13 scored NEEDS WORK for this reason.
3. **Email deliverability and rendering** — Copy reviewed, delivery/rendering untested.
4. **Real-device mobile testing** — All testing used headless Chrome. No iOS Safari testing.
5. **Load testing** — Single-user lab measurements only.
6. **Stripe webhook retry behavior** — Signature validation verified, retry scenarios untested.
7. **Discovery upload UX** — Security verified, user experience untested.
8. **Report viewing experience** — Access control states verified, rendered report quality untested.
9. **Cross-browser testing** — Chrome only. No Firefox, Edge, or Safari.
10. **International character handling** — Not tested.

These blind spots should be addressed in a follow-up audit or E2E production test before scaling paid acquisition.

---

## Final Assessment

**Go-live decision: CONDITIONAL GO**

The site is production-capable today for organic traffic and existing customers. The architecture is sound, the UPL compliance infrastructure is strong, the crisis UX is genuinely best-in-class, and the GEO implementation is ahead of the YMYL competitive landscape.

**Conditions for full GO:**
1. Privacy policy GA4 claim corrected (10 minutes)
2. Intake route WHERE clause fixed (1 line)
3. Blog UPL violation B4 fixed (5 minutes)
4. DefinedTermSet URLs corrected (30 minutes)
5. Next.js upgraded past CSRF CVE (test after)

**Conditions for paid acquisition GO:**
All 5 above, plus:
6. Report tokens hashed in database
7. Phase 14 a11y patches applied
8. Title tag overruns fixed
9. E2E purchase flow tested on production
10. text-sm -> text-base for substantive content

**Estimated timeline to full GO:** Items 1-4 can be done today (~1 hour). Item 5 requires upgrade testing (~half day). Items 6-10 are a 1-week sprint.

This is not a failing audit. This is a site with strong foundations and fixable gaps. The YMYL context demands a higher bar than "most sites," and this site meets that bar with conditions.
