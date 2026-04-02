# Phase 13 + 21 Audit: Readability & Social/OG Metadata
**Date:** 2026-04-02
**Auditor:** Atlas (Atticus persona)
**Scope:** Customer-facing page readability + OG/social metadata coverage
**Files audited:**
- Readability: `page.tsx`, `start/page.tsx`, `services/page.tsx`, `score/page.tsx`, `playbooks/page.tsx`, `dui-checklist/page.tsx`, `src/lib/score.ts`, `src/lib/drip-emails.ts`
- Social/OG: /, /about, /blog, /services, /playbooks, /score, /start, /checkout, /sample, /sample-xray, /dui-checklist, /resources, /family, /playbook/[slug], /research/defense-score-data

---

## PART 1: CONTENT READABILITY (Layer 13)

### Methodology
- Flesch-Kincaid grade level estimated from actual visible copy (headlines, body, CTA labels, bullets)
- Average sentence length counted from primary copy blocks (not legal disclaimers)
- Key message word count per Covello Mental Noise Model (target ≤ 27 words)
- Jargon flagged = legal terms a stressed defendant at 3AM would not immediately understand

### Grading Key
| FK Grade | Assessment |
|----------|------------|
| 6–8 | PASS — crisis-appropriate |
| 9–10 | MARGINAL — acceptable for informed section, flag for review |
| 11+ | FAIL — too high for crisis copy |

---

### Page: / (Homepage)

**FK Grade: ~9**
Primary copy is two distinct registers: the hero/pain points read at grade 8, but the urgency bar, FAQ answers, and attorney attribution section push to grade 10–11.

**Average sentence length:**
- Hero/pain points: 12–14 words — PASS
- Urgency bar: 21 words per clause — MARGINAL (complex run-on with semicolons)
- FAQ answers: 18–22 words per sentence — MARGINAL

**Key message word count (above-fold):**
- H1: "Your attorney hasn't called back. Your court date is approaching. We research your charges and hand you the exact questions." — 3 messages, each under 12 words — PASS
- DiscoveryReveal callout copy: rendered by component, assumed acceptable based on established 68.3g hook

**Jargon findings:**
| Term | Location | Issue |
|------|----------|-------|
| "suppression motions" | Urgency bar | Legal term — no inline definition |
| "Brady material requests" | Urgency bar | High jargon — no explanation for a 3AM reader |
| "Indictment response (federal)" | Urgency bar | Legal jargon — unexplained |
| "arraignment" | Urgency bar | Familiar to defendants but still legal jargon |
| "ABA Model Rules of Professional Conduct" | FAQ | Bureaucratic — reads as attorney copy |
| "Rule 1.16" | FAQ | Zero context for a 3AM defendant |
| "PCR" (Post-Conviction Relief) | FAQ | Acronym with no expansion in context |

**Assessment:** The homepage has two audiences — 3AM crisis visitors (hero/pain) and deliberate researchers (FAQ/urgency bar). The hero/pain sections are well-calibrated. The urgency bar reads like it was written for attorneys, not defendants. The FAQ answers are generally good but several contain unexplained legal terms. The pain point copy is near-perfect — verbatim VoC, short sentences, no jargon.

**Priority fixes:**
1. Urgency bar: Replace "Brady material requests," "Indictment response (federal)," and "Rule 1.16" with plain-language equivalents. The bar's purpose is to create urgency, not to educate on procedure.
2. FAQ: "ABA Model Rules of Professional Conduct, Rule 1.16" — cut to one plain sentence or bracket as "under bar rules."

---

### Page: /start

**FK Grade: ~7**
This is the best-performing page in the audit. Covello constraints are explicitly implemented and visible in both the code comments and the copy.

**Average sentence length:**
- Crisis hero: 4–8 words per line — PASS
- Standard view: 10–13 words — PASS
- Product cards (bullets): 8–12 words — PASS

**Key message word count:**
- Crisis H1: "You were just arrested. Here's what to do right now." — 12 words — PASS
- Standard H1: "You have an attorney. You don't understand your case. That's the gap we fill." — 19 words — PASS
- Subtext: "40+ elite defense attorneys' methodology. Applied to your specific charges." — 10 words — PASS

**Jargon findings:**
| Term | Location | Issue |
|------|----------|-------|
| "police reports / case documents" | Button label | Clear — good choice over "discovery" |
| "credited toward deeper intelligence" | X-Ray upgrade credit | "Deeper intelligence" is abstract |

**Assessment:** Textbook Covello execution. Binary routing, no competing CTAs, price visible before features, plain-English button labels. The one weak phrase is "credited toward deeper intelligence" — feels abstract at the purchase moment.

**Priority fixes:**
1. Replace "credited toward deeper intelligence" with "100% applied to your next upgrade."

---

### Page: /services

**FK Grade: ~10**
The page covers a lot of ground — 3 case types × 5 tiers each. The tier description copy is dense.

**Average sentence length:**
- Section headers: 5–8 words — PASS
- Tier descriptions: 18–28 words per sentence — MARGINAL to FAIL
- FAQ answers: 15–20 words — PASS

**Key message word count:**
- Page subheader: "Five tiers of defense research — from charge analysis to full trial intelligence." — 14 words — PASS
- X-Ray first sentence: "We read every page of your discovery looking for what doesn't add up — documents that contradict each other, evidence that's missing, rights that may have been violated." — 32 words — FAIL (over Covello 27-word limit)
- War Room desc: 72-word sentence spanning officer dossiers, evidence chain audit, witness reliability rankings — FAIL

**Jargon findings:**
| Term | Location | Issue |
|------|----------|-------|
| "chain of custody protocols" | Drug Cases section | Defined in passing — acceptable |
| "AUSA profile" | White Collar Intel Brief | "AUSA" not expanded |
| "RICO dismantling approaches" | White Collar section | Defendants may not know what RICO means |
| "constitutional appellate frameworks" | White Collar header | High jargon |
| "JOA research brief" | Situation Room | "JOA" (Judgment of Acquittal) — undefined acronym |
| "sentencing guidelines deep dive" | War Room | "Guidelines" may be unclear |

**Assessment:** The case-type intros (Drug, DUI, White Collar) read well. The tier descriptions at War Room and Situation Room are too long and contain undefined acronyms. These are high-ticket products where a defendant is already researching — slightly higher reading level is defensible. But JOA is undefined and AUSA should expand on first use.

**Priority fixes:**
1. Situation Room: Replace "JOA research brief" with "Judgment of Acquittal research brief (JOA)."
2. White Collar: Replace "AUSA profile" with "federal prosecutor (AUSA) profile" on first use.
3. X-Ray first sentence: Break at the em dash into two sentences.

---

### Page: /score

**FK Grade: ~8 (quiz interface)**
The question labels are the primary visible copy. Short, declarative, well-calibrated.

**Average sentence length:**
- Question labels: 6–11 words — PASS
- Answer options: 3–8 words — PASS
- Score observations (from score.ts): 20–49 words — MARGINAL to FAIL

**Key message word count:**
- All question labels: under 12 words — PASS
- Score observation example (public defender): "Public defenders handle high caseloads — often 2-4x the recommended maximum. This doesn't mean yours is doing a bad job, but it means you need to be proactive: confirm deadlines, request updates in writing, and ask specifically about motions and discovery status." — 49 words — FAIL (nearly 2× Covello limit)

**Jargon findings in score.ts observations:**
| Term | Observation trigger | Issue |
|------|---------------------|-------|
| "suppression motions" | motionsFiled: no, timeIndex >= 2 | Legal term — partially self-explaining in context |
| "direct appeal, PCR, habeas" | post-conviction stage | "habeas" unexplained |
| "mitigation preparation" | sentencing stage | Legal term — unclear to general audience |
| "sentencing memorandum" | sentencing stage | Jargon |
| "FAFSA eligibility" | student observation | Acronym — most students know it, acceptable |

**Assessment:** The quiz interface is near-perfect. The score observations are where readability drops. Several observations exceed 40 words. The Covello 27-word limit is explicitly enforced on /start but not on the score observations — which are the first substantive thing a defendant reads after completing the quiz.

**Priority fixes (score.ts):**
1. Public defender observation (49w): Cut to ≤27 words. Suggested: "Public defenders carry 2-4x recommended caseloads. Confirm your deadlines in writing and ask about motions status."
2. Sentencing stage: Replace "mitigation preparation" with "building your case before sentencing." Replace "sentencing memorandum" with "a written argument to reduce your sentence."
3. Post-conviction: Expand "habeas" — "habeas corpus (emergency appeal to federal court)."
4. Compound time penalty observation (38w): Split into two shorter observations.

---

### Page: /playbooks

**FK Grade: ~8**
Clean, sparse page. Card grid with short descriptions. Value props section is the main copy to assess.

**Average sentence length:**
- Hero desc: 25 words — MARGINAL (one sentence, just over limit)
- Value prop descriptions: 12–18 words — PASS
- Footer disclaimer: 29 words — MARGINAL

**Key message word count:**
- Hero desc as a single message: "Choose your charge type. Get 26 questions that change how your next attorney meeting goes, a case stage roadmap, red flag checklist, attorney scorecard, and emergency guide — delivered instantly." — 39 words — FAIL (as a single message block)

**Jargon findings:**
| Term | Location | Issue |
|------|----------|-------|
| "forensic evidence methodology" | Value props — Barry Scheck attribution | Jargon, but anchored by name |
| "Lawrence Taylor's DUI procedural challenge framework" | Value props | Dense — serves as credibility signal |

**Assessment:** Good page overall. The hero description is slightly over Covello limit as a single message but reads well because of the list structure. Value props are the highlight — icon + title + 1-sentence desc is exactly right for stressed readers.

**Priority fixes:**
1. Hero sub-desc: Break into two sentences. "Choose your charge type. Get 26 questions that change your next attorney meeting — plus a case stage roadmap, red flag checklist, attorney scorecard, and emergency guide. Instant download."

---

### Page: /dui-checklist

**FK Grade: ~7**
Excellent readability. Clearly written with 3AM in mind.

**Average sentence length:**
- H1: 10 words — PASS
- Subhead: 20 words — PASS
- Item titles: 8–12 words — PASS
- Item descriptions: 20–40 words — PASS to MARGINAL

**Key message word count:**
- H1: "You Were Just Arrested for DUI. Here's What to Do in the Next 72 Hours." — 18 words — PASS
- Urgency statement: "Your DMV hearing deadline may be as short as 7 days from arrest. Miss it and you lose your license automatically — no hearing, no appeal." — 26 words — PASS

**Jargon findings:**
| Term | Location | Issue |
|------|----------|-------|
| "Lawrence Taylor's DUI defense methodology" | Item 3 desc | "methodology" abstract but paired with the name |
| "your jurisdiction" | Item 1 desc | Legal term — clear in context |
| "DMV hearing" | Throughout | Slightly formal but widely understood for DUI |

**Assessment:** The best readability on the site. The DMV deadline hook lands. Item 1 description is 40 words — the only notable overage.

**Priority fixes:**
1. Item 1 description: Trim to ≤27 words. Suggested: "Some states give 7 days from arrest. Miss it and your license is suspended — even before your court date. Check your state's deadline tonight."

---

### Score Observations — src/lib/score.ts

Assessed separately because these are post-quiz output shown to high-intent users at the moment of maximum engagement.

**Observations exceeding Covello 27-word limit:**

| Observation trigger | Word count | Verdict |
|---------------------|------------|---------|
| Public defender (hasAttorney: public-defender) | 49w | FAIL |
| Compound time penalty (timeIndex >= 3, no motions, no discovery) | 38w | FAIL |
| Pre-trial + no motions interaction | 33w | FAIL |
| Strategy briefly discussed | 31w | FAIL |
| No communication (never) | 31w | FAIL |
| Sentencing stage | 31w | FAIL |
| No attorney observation | 28w | MARGINAL |

Target: ≤27 words per Covello. 7 of ~20 observations exceed this. These observations are the core value delivery of the score tool and must be the tightest copy on the site.

---

### Drip Emails — src/lib/drip-emails.ts

**Subject lines — all PASS:**
- "3 things your attorney should have done by now" — 9 words
- "What 500 pages of discovery actually means" — 7 words
- "We found 68.3g of missing evidence. The attorney never mentioned it." — 11 words
- "Motion deadlines don't wait — and your attorney might not remind you" — 12 words
- "Ask your attorney exactly this" — 5 words

**Body copy readability:**
- Nurture Day 1: Short paragraphs, 1–2 sentences, bold structure — PASS (FK ~7)
- Nurture Day 3: "500 pages of discovery is not 500 pages of reading" — best sentence on the site — PASS
- Nurture Day 5: Numbers make it scannable (93.9g, 25.59g, 68.3g) — PASS
- Score Crisis Day 1: "What to listen for" sub-text runs 25–35 words per item — MARGINAL

**Jargon in email templates (ATTORNEY_EMAIL_TEMPLATES in score.ts):**
| Term | Template | Issue |
|------|----------|-------|
| "Franks v. Delaware" | nurture_day10 | Unexplained case citation — high jargon |
| "CI" | nurture_day10 | First use without expansion |
| "Brady material" | score.ts drug templates | "Brady" not explained |
| "minimization compliance" | score.ts drug-trafficking | High jargon |
| "SORNA" | score.ts sex-offense template | Acronym not expanded |
| "USSG" | score.ts federal template | "United States Sentencing Guidelines" not spelled out |
| "Rule 16 discovery" | score.ts federal template | Legal citation — no context |

**Assessment:** Main NURTURE_EMAILS sequence is solid — conversational, defendant-voice, short paragraphs. The attorney email templates are deliberately written to sound professional (defendants sending to their attorney), so slightly higher register is appropriate. However, SORNA, USSG, and Rule 16 should expand on first use — defendants need to understand what they're sending.

---

## PART 1 SUMMARY TABLE

| Page | FK Grade | Avg Sentence | Key Message | Jargon Issues | Status |
|------|----------|-------------|-------------|----------------|--------|
| / (Homepage) | ~9 | 15w hero / 21w urgency | PASS | Brady, Rule 1.16, ABA Rule, PCR | MARGINAL |
| /start | ~7 | 10–13w | PASS | None critical | PASS |
| /services | ~10 | 18–28w | FAIL (X-Ray, War Room) | JOA, AUSA, RICO | MARGINAL |
| /score (questions) | ~8 | 6–11w | PASS | — | PASS |
| score.ts observations | ~10 | 25–49w | FAIL (7 observations) | suppression, habeas, mitigation | FAIL |
| /playbooks | ~8 | 12–25w | MARGINAL | Minimal | PASS |
| /dui-checklist | ~7 | 10–20w | PASS | Minimal | PASS |
| drip emails (NURTURE) | ~7–8 | 12–18w | PASS | Franks, SORNA, USSG, Rule 16 | PASS (templates MARGINAL) |

---

## PART 2: SOCIAL / OG METADATA (Layer 21)

### Global Defaults (layout.tsx)

The root layout defines:
- `metadataBase`: `https://imnotanattorney.com` — PRESENT
- `title.template`: `"%s | ImNotAnAttorney"` — PRESENT
- `openGraph.type`: `"website"` — PRESENT
- `openGraph.locale`: `"en_US"` — PRESENT
- `openGraph.siteName`: `"ImNotAnAttorney"` — PRESENT
- `twitter.card`: `"summary_large_image"` — PRESENT
- `twitter.site`: `"@ImNotAnAttorney"` — PRESENT

**Inheritance behavior:** Pages without explicit `openGraph` fields inherit the global `siteName` and `type` but pull title/description from the page-level metadata. Pages that are `"use client"` (score, start, checkout) cannot export `metadata` — they require a sibling `layout.tsx`. The /score page correctly uses `src/app/score/layout.tsx`. The /start and /checkout pages do not.

---

### Page-by-Page OG Audit

#### / (Homepage)
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "ImNotAnAttorney — Your Case File Has Answers. We Find Them." | 59 | PASS |
| meta description | "Your attorney hasn't called back...Case Decoder $197, 48-hour delivery." | 165 | MARGINAL (+5) |
| og:title | "Your Case File Has Answers Your Attorney Hasn't Mentioned. Know What They Know." | 81 | PASS for OG (≤95) |
| og:description | "Built by a defendant who found 68.3g of missing evidence his attorney never mentioned..." | 193 | FAIL (>160) |
| og:url | `SITE_URL` via metadataBase | — | PASS |
| twitter:card | Inherited: `summary_large_image` | — | PASS |

**Fixes:** Trim og:description to ≤160 — cut after "never mentioned." Trim meta description by removing "48-hour delivery."

---

#### /about
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "About — Built by Defendants, for Defendants" | 44 | PASS |
| meta description | "ImNotAnAttorney was built by defendants, for defendants. We provide legal research and questions — not legal advice." | 115 | PASS |
| og:title | Not set — inherits via template | ~62 | MARGINAL |
| og:description | Not set — inherits description | — | PASS (text is good) |

**Fixes:** Add explicit `openGraph` block. This is the trust page — high share value. Suggested og:title: "We Were Defendants Too. That's Why We Built This." Suggested og:description: "One founder found 68.3g of missing evidence his attorney never raised. We built a research system so every defendant can close that gap."

---

#### /blog
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Criminal Defense Blog — What Defendants Need to Know Before Court" | 65 | MARGINAL (+5) |
| meta description | "In-depth legal research and defense strategies for criminal defendants — the information that closes the gap between what you know and what everyone else in the courtroom knows." | 176 | FAIL (+16) |
| og:title | Not set — inherits | — | — |
| og:description | Not set — inherits FAIL description | — | FAIL |

**Fixes:** Trim description to ≤155. Add explicit OG block. Suggested description: "In-depth legal research for criminal defendants — what closes the gap between what you know and what everyone else in the courtroom knows."

---

#### /services
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Defense Intelligence Services — Understand Your Case, Ask Better Questions" | 74 | FAIL (+14) |
| meta description | Dynamic with tier prices — ~165 chars | ~165 | MARGINAL |
| og:title | Not set — inherits via template | ~95 total | FAIL |
| og:description | Not set — inherits description | — | — |

**Fixes:** Trim title to ≤55 chars. Suggested: "Defense Intelligence Services — From $197 to Full Trial Prep." Add explicit OG block — services is the primary conversion page for deliberate researchers.

---

#### /playbooks
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Defense Playbooks — $97 Instant Download for Every Charge Type \| ImNotAnAttorney" | 81 | FAIL (+21) |
| meta description | "Choose your charge type and get an instant-download defense playbook: 26 questions..." | 216 | FAIL (+56) |
| og:title | "Defense Playbooks — $97 Instant Download" | 41 | PASS |
| og:description | "Choose your charge type. Get 26 questions...Instant PDF download." | 177 | FAIL (+17) |

**Fixes:** Trim meta title (remove " for Every Charge Type"). Trim meta description to ≤155. Trim og:description — cut after "attorney scorecard." — gets to ~135 chars.

---

#### /score
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Is Your Attorney Working Your Case? \| Free Defense Score" | 57 | PASS |
| meta description | "Answer 10 questions. Find out if your criminal defense attorney is meeting the milestones that matter — in 60 seconds, free, no email required." | 143 | PASS |
| og:title | Same as meta title | 57 | PASS |
| og:description | Same as meta description | 143 | PASS |
| og:url | `SITE_URL/score` | — | PASS |

**Issues:** None. Best-configured page in the audit. All fields set, within limits, og fields distinct from template fallback.

---

#### /start
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | MISSING — falls back to layout default | — | FAIL |
| meta description | MISSING | — | FAIL |
| og:title | MISSING | — | FAIL |
| og:description | MISSING | — | FAIL |

**Note:** /start is `"use client"` — metadata must be in a parent `layout.tsx`. No `src/app/start/layout.tsx` exists. Page renders with root defaults: "ImNotAnAttorney — Know What They Know." and generic site description.

**Fix — add `src/app/start/layout.tsx`:**
```ts
export const metadata = {
  title: "You Have an Attorney. You Don't Understand Your Case. | ImNotAnAttorney",
  description: "Tell us what documents you have. Get the exact questions that change your next attorney meeting. Free. Anonymous.",
  openGraph: {
    title: "You Have an Attorney. You Don't Understand Your Case.",
    description: "The gap between what you know and what your attorney knows. We close it.",
    url: "https://imnotanattorney.com/start",
  },
};
```

---

#### /checkout
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | MISSING — `"use client"` page, no layout.tsx | — | FAIL |
| meta description | MISSING | — | FAIL |
| robots | Not explicitly noindex'd | — | FLAG |

**Note:** Checkout pages are typically noindex. This one isn't. Low priority since it's behind a query param, but someone sharing a checkout URL will get the generic OG card.

**Fix — add `src/app/checkout/layout.tsx`:**
```ts
export const metadata = {
  title: "Checkout | ImNotAnAttorney",
  description: "Complete your order.",
  robots: { index: false, follow: false },
};
```

---

#### /sample
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Sample Case Decoder Report — Real Case, Redacted" | 49 | PASS |
| meta description | "See what a Case Decoder report actually looks like...Built from elite defense methodology." | 197 | FAIL (+37) |
| og:title | "Sample Case Decoder Report — Real Findings from a Real Case" | 60 | PASS |
| og:description | "15 calibrated questions. Ready-to-send email templates. A 7-day action plan. See what a Case Decoder actually delivers." | 119 | PASS |

**Fix:** Sync meta description to the og:description (119 chars) — it's better and shorter.

---

#### /sample-xray
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Sample X-Ray Report — Discovery Analysis \| ImNotAnAttorney" | 59 | PASS |
| meta description | "...4 critical red flags found including a 73% weight discrepancy. 43 attorney questions generated. $2,497." | 179 | FAIL (+19) |
| og:title | "Sample X-Ray Report — What We Find in Your Discovery" | 53 | PASS |
| og:description | "Real case, real findings. 14 red flags. 43 questions for your attorney..." | 122 | PASS |

**RED FLAG — factual inconsistency:** meta description says "4 critical red flags," og:description says "14 red flags." One is wrong. Verify the actual count in the sample-xray page content and correct both to match.

**Fix:** Trim meta description and resolve the red flag count discrepancy.

---

#### /dui-checklist
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "What to Do After a DUI Arrest — Free 72-Hour Checklist" | 55 | PASS |
| meta description | "You were just arrested for DUI. Here are the 3 things...Free checklist." | 155 | PASS |
| og:title | "You Were Just Arrested for DUI. Here's What to Do Next." | 56 | PASS |
| og:description | "3 things to do in the next 72 hours...Free checklist — no signup required to preview." | 132 | PASS |

**Issues:** None. All fields set and within limits.

---

#### /resources
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Free Resources" | 15 | FAIL — too generic |
| meta description | "Free guides, checklists, and templates for criminal defendants. Know your rights. Hold your attorney accountable." | 113 | PASS |
| og:title | Not set — inherits "Free Resources \| ImNotAnAttorney" | 32 | PASS (but generic) |
| og:description | Not set — inherits description | — | PASS |

**Fix:** Upgrade title. Suggested: "Free Defense Resources — Checklists & Guides for Defendants." No explicit OG block needed if description is good, but add one for share control.

---

#### /family
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Your Family Member Was Arrested — Here's How You Can Help" | 57 | PASS |
| meta description | "When someone you love faces criminal charges, you feel helpless...— in 2 minutes." | 169 | FAIL (+9) |
| og:title | "Your Family Member Was Arrested — Here's How You Can Help" | 57 | PASS |
| og:description | "Take the free Defense Milestone Score on their behalf. Find the gaps in their defense in 2 minutes." | 100 | PASS |

**Fix:** Trim meta description — cut "in 2 minutes" (it's in the og:description already). Gets to ~156 chars.

---

#### /playbook/[slug]
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | Dynamic: `${tier.name} — $97 Instant Download \| ImNotAnAttorney` | ~65–75 | MARGINAL-FAIL |
| meta description | Dynamic: `config.seoDescription` | Not audited | Needs check |
| og:title | `${tier.name} — $97 Instant Download` | ~40–55 | PASS |
| og:description | `config.seoDescription` | Not audited | Needs check |
| og:url | `SITE_URL/playbook/${slug}` | — | PASS |

**Issues:** The full title with template will render ~70–75 chars for longer tier names (e.g., "DUI First Offense Defense Playbook — $97 Instant Download | ImNotAnAttorney"). Over the 60-char limit. Recommend auditing `src/lib/playbook-configs.ts` for all 8 `seoDescription` fields in a separate pass.

---

#### /research/defense-score-data
| Field | Value | Chars | Status |
|-------|-------|-------|--------|
| meta title | "Defense Milestone Score Data — What Defendants Reveal About Attorney Gaps" | 72 | FAIL (+12) |
| meta description | "Original research from anonymous Defense Milestone Score data...broken down by charge type." | 189 | FAIL (+29) |
| og:title | Not set — inherits via template | ~93 total | FAIL |
| og:description | Not set — inherits FAIL description | — | FAIL |

**Fixes:** Trim title to ≤55. Suggested: "Defense Milestone Score Research — Attorney Gap Data by Charge Type." Trim description to ≤155. Add explicit OG block — this is shareable research content.

---

## PART 2 SUMMARY TABLE

| Page | meta title | meta desc | og:title | og:desc | Status |
|------|-----------|-----------|---------|---------|--------|
| / | PASS (59) | MARGINAL (165) | PASS (OG field, 81) | FAIL (193) | MARGINAL |
| /about | PASS (44) | PASS (115) | MISSING | MISSING | FAIL |
| /blog | MARGINAL (65) | FAIL (176) | MISSING | MISSING | FAIL |
| /services | FAIL (74) | MARGINAL (165) | MISSING | MISSING | FAIL |
| /playbooks | FAIL (81) | FAIL (216) | PASS (41) | FAIL (177) | FAIL |
| /score | PASS (57) | PASS (143) | PASS (57) | PASS (143) | PASS |
| /start | MISSING | MISSING | MISSING | MISSING | FAIL |
| /checkout | MISSING | MISSING | MISSING | — | FAIL |
| /sample | PASS (49) | FAIL (197) | PASS (60) | PASS (119) | MARGINAL |
| /sample-xray | PASS (59) | FAIL (179) | PASS (53) | PASS (122) | MARGINAL + FACTUAL CONFLICT |
| /dui-checklist | PASS (55) | PASS (155) | PASS (56) | PASS (132) | PASS |
| /resources | FAIL (weak) | PASS (113) | Inherited | Inherited | MARGINAL |
| /family | PASS (57) | FAIL (169) | PASS (57) | PASS (100) | MARGINAL |
| /playbook/[slug] | MARGINAL | Not checked | PASS | Not checked | MARGINAL |
| /research/score-data | FAIL (72) | FAIL (189) | MISSING | MISSING | FAIL |

---

## CONSOLIDATED PRIORITY FIXES

### P0 — Critical (factual error or complete miss on high-intent page)

1. **`/sample-xray` — factual inconsistency.** meta description says "4 critical red flags," og:description says "14 red flags." Verify the correct count against the page content and correct both fields.

2. **`/start` — metadata entirely missing.** This is the highest-intent entry page (crisis buyers, social campaign destination). Add `src/app/start/layout.tsx` with title, description, and openGraph block (see fix above).

3. **`score.ts` observations — 7 exceed Covello 27-word limit.** The observations are the core value delivery of the score tool. Fix the longest offenders first: public defender (49w → target ≤27w), compound penalty (38w), pre-trial/no motions (33w).

### P1 — High Impact (affects SEO rankings and social click-through)

4. **`/blog` description:** 176 chars → ≤155. Add explicit OG block.
5. **`/playbooks` meta description:** 216 chars → ≤155. Trim og:description from 177 to ≤160.
6. **`/services` meta title:** 74 chars → ≤55. Add explicit OG block.
7. **`/research/defense-score-data` title + description:** Both over limit. Add explicit OG block.
8. **`/resources` title:** "Free Resources" → "Free Defense Resources — Checklists & Guides for Defendants."
9. **Homepage og:description:** 193 chars → ≤160. Cut after "never mentioned."

### P2 — Polish (readability + minor metadata)

10. **Homepage urgency bar:** Replace "Brady material requests," "Indictment response," and "Rule 1.16" with plain-language equivalents.
11. **`/services` Situation Room:** "JOA research brief" → "Judgment of Acquittal research brief (JOA)."
12. **`/services` White Collar:** "AUSA profile" → "federal prosecutor (AUSA) profile" on first use.
13. **`/about`:** Add explicit OG block — founder story copy makes this the highest share-value page without one.
14. **`/start` product cards:** "credited toward deeper intelligence" → "100% applied to your next upgrade."
15. **`/checkout`:** Add `layout.tsx` with `robots: { index: false }`.
16. **Drip email templates:** Expand SORNA, USSG, Rule 16 on first use.

---

*End of Phase 13 + 21 Audit*
