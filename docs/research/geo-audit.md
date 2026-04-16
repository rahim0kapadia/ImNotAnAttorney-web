# GEO Audit, ImNotAnAttorney, All 35 Blog Posts

**Date:** 2026-03-13
**Auditor:** Chris Dreyer framework (Evan Bailyn GEO methodology)
**Domain:** imnotanattorney.com
**Posts audited:** 35 (complete corpus)
**Prior audit:** `docs/research/geo-entity-seo-audit.md` (2026-03-11, 29 posts)

---

## What Changed Since March 11

The March 11 audit covered 29 posts and surfaced a list of high-impact fixes. Status of those fixes as of March 13:

**Implemented:**
- TLDRBox component: Live. Used in `attorney-not-returning-calls`, `should-you-take-the-plea-deal`, `can-dui-be-dismissed`, `trafficking-charges-constructive-possession`, `what-happens-at-arraignment`, `how-to-file-bar-complaint-against-attorney`, `complete-white-collar-defense-guide`, `what-500-pages-of-drug-trafficking-discovery-contained`
- FAQPage schema: All 35 posts have `faqs` frontmatter array; `blog/[slug]/page.tsx` renders FAQPage JSON-LD when present
- Article schema `mentions` Person entities: Live, ATTORNEYS from SourceIntelligence component
- Article schema `keywords` and `articleSection`: Both present in blog post page
- BreadcrumbList: Present on every blog post
- `attorney-not-returning-calls.mdx`: Expanded from 67 lines to 289 lines with TLDRBox, full process content, FAQ schema

**6 new posts added (2026-03-11):**
- `complete-dui-defense-guide`
- `complete-white-collar-defense-guide`
- `federal-investigation-what-to-expect`
- `cooperation-agreement-federal-case`
- `wire-fraud-defense-questions`
- `what-500-pages-of-drug-trafficking-discovery-contained`

---

## Scoring Methodology

Each post scored on five dimensions (1–10):

1. **AI Extractability (AIX):** Is the answer to the implied query in the first 100 words? Score 9-10 = direct answer immediately. Score 1-3 = answer buried 300+ words into narrative.
2. **Structured Answer Presence (SAP):** Numbered lists, comparison tables, step-by-step processes, definition blocks that AI can pull as discrete units.
3. **Question-Answer Format (QAF):** Questions explicitly asked and answered in scannable format (H2 as question, direct answer below). FAQ schema matching body content.
4. **Citation Worthiness (CW):** Original data, named expert citations, specific statistics, proprietary frameworks. Highest-leverage differentiator for AI citation.
5. **Overall GEO Score (GEO):** Composite 1-10. Posts scoring 8+ have high probability of AI assistant citation.

---

## Full 35-Post GEO Audit Table

| # | Slug | AIX | SAP | QAF | CW | GEO | Priority |
|---|------|---, |---, |---, |----|----|----------|
| 1 | `10-day-dmv-deadline` | 7 | 8 | 9 | 7 | 8 | Maintain |
| 2 | `10-questions-every-defendant-should-ask` | 6 | 9 | 9 | 5 | 7 | Medium |
| 3 | `5-questions-dui-attorney` | 8 | 8 | 8 | 5 | 7 | Maintain |
| 4 | `7-things-criminal-justice-wont-tell-you` | 5 | 7 | 8 | 7 | 7 | Medium |
| 5 | `attorney-not-returning-calls` | 7 | 8 | 9 | 5 | 7 | Maintain |
| 6 | `breathalyzer-calibration-records` | 7 | 8 | 8 | 8 | 8 | Maintain |
| 7 | `can-criminal-charges-be-dropped` | 7 | 7 | 9 | 6 | 7 | Medium |
| 8 | `can-dui-be-dismissed` | 8 | 9 | 9 | 6 | 8 | Top |
| 9 | `complete-dui-defense-guide` | 7 | 9 | 9 | 8 | 9 | Top |
| 10 | `complete-white-collar-defense-guide` | 7 | 9 | 9 | 7 | 8 | Top |
| 11 | `cooperation-agreement-federal-case` | 6 | 8 | 9 | 8 | 8 | Top |
| 12 | `discovery-rights-drug-cases` | 6 | 8 | 8 | 5 | 7 | Medium |
| 13 | `federal-investigation-what-to-expect` | 7 | 8 | 9 | 7 | 8 | Top |
| 14 | `feels-like-lawyer-working-against-me` | 6 | 6 | 8 | 4 | 6 | Upgrade |
| 15 | `field-sobriety-test-standards` | 6 | 9 | 8 | 9 | 8 | Top |
| 16 | `field-test-vs-lab-test-drug-cases` | 7 | 7 | 8 | 7 | 7 | Medium |
| 17 | `first-time-felony-what-actually-happens` | 6 | 9 | 9 | 7 | 8 | Top |
| 18 | `how-criminal-cases-actually-work` | 7 | 9 | 9 | 8 | 9 | Top |
| 19 | `how-often-should-attorney-communicate` | 7 | 7 | 9 | 5 | 7 | Medium |
| 20 | `how-to-file-bar-complaint-against-attorney` | 8 | 8 | 9 | 5 | 8 | Maintain |
| 21 | `how-to-read-your-discovery` | 6 | 9 | 8 | 5 | 7 | Medium |
| 22 | `how-your-attorney-makes-money` | 5 | 7 | 8 | 6 | 7 | Medium |
| 23 | `is-your-attorney-actually-working-your-case` | 7 | 8 | 9 | 5 | 7 | Maintain |
| 24 | `private-attorney-vs-public-defender` | 7 | 9 | 8 | 7 | 8 | Top |
| 25 | `questions-to-ask-before-hiring-criminal-defense-attorney` | 6 | 7 | 9 | 4 | 6 | Upgrade |
| 26 | `should-you-fire-your-lawyer` | 6 | 8 | 8 | 4 | 6 | Upgrade |
| 27 | `should-you-take-the-plea-deal` | 7 | 8 | 9 | 8 | 8 | Top |
| 28 | `trafficking-charges-constructive-possession` | 8 | 8 | 9 | 9 | 9 | Top |
| 29 | `what-500-pages-of-drug-trafficking-discovery-contained` | 8 | 8 | 8 | 10 | 9 | Top |
| 30 | `what-happens-at-arraignment` | 8 | 8 | 9 | 5 | 8 | Top |
| 31 | `what-happens-if-attorney-misses-deadline` | 6 | 7 | 9 | 5 | 7 | Medium |
| 32 | `what-motions-should-your-attorney-be-filing` | 6 | 9 | 9 | 6 | 8 | Top |
| 33 | `what-to-expect-after-dui-arrest` | 6 | 7 | 7 | 5 | 6 | Upgrade |
| 34 | `why-is-my-criminal-case-taking-so-long` | 6 | 7 | 8 | 5 | 7 | Medium |
| 35 | `wire-fraud-defense-questions` | 6 | 9 | 9 | 7 | 8 | Top |

**Priority key:** Top = protect and extend; Maintain = small improvements available; Medium = meaningful improvements possible; Upgrade = significant gaps, high ROI fixes.

---

## Top 10 Highest-Impact GEO Improvements

### 1. `what-500-pages-of-drug-trafficking-discovery-contained`, GEO 9 → Citation Machine

**The single most important citation asset on the site.** The 73% weight discrepancy (scene: 93.9g, lab: 25.59g, missing: 68.3g) is original research that no other consumer legal site has. AI assistants will cite this if it is properly surfaced.

**Current state:** TLDRBox present, four findings are named, but the specific numbers are spread through prose rather than consolidated in an extractable block.

**Fix:** Add a "Key Findings at a Glance" table immediately after the TLDRBox:

| Finding | What Was Found | Defense Implication |
|---------|---------------|---------------------|
| Weight discrepancy | 93.9g at scene → 25.59g at lab (73% gap) | Charging weight may be wrong; affects mandatory minimum |
| CI phone dual attribution | Same number attributed to CI and defendant in same report | Undermines entire investigation narrative |
| Drug type mismatch | Charged with amphetamine; lab found MDMA/MDA | Charge doesn't match confirmed substance |
| Fingerprint evidence | 21 latent prints collected; zero matched defendant | No physical connection to the evidence |

This table will be extracted verbatim by Perplexity and Google AI Overviews answering "what do drug trafficking discovery documents contain" and "what to look for in drug case evidence."

### 2. `complete-dui-defense-guide`, GEO 9 → Authoritative DUI Hub

**The 7 Common DUI Defenses Summary Table is excellent.** It is the exact format AI extracts. The timeline section is another strong extraction point. The gap is the opening, "You got pulled over" narrative before any structured answer.

**Fix:** Add TLDRBox before "How to Use This Guide":

> A DUI defense has 7 potential challenge points: (1) illegal traffic stop, (2) improper field sobriety tests, (3) breathalyzer calibration failure, (4) observation period violation, (5) blood test chain of custody, (6) rising blood alcohol, (7) no probable cause for arrest. This guide covers every stage from arrest through resolution.

This becomes the extracted answer for "what are DUI defenses" across all AI platforms.

### 3. `how-criminal-cases-actually-work`, GEO 9 → Criminal Process Authority

**Two extraction gold assets:** the "Where Cases Are Actually Won and Lost" table and the case timeline table by type. Both correctly structured. FAQ schema covers the three most-searched questions. Gap: opening paragraph is narrative rather than definitional.

**Fix:** Add TLDRBox at the top:

> A criminal case moves through nine stages: arrest, first appearance, arraignment, discovery, motions, plea negotiations, trial (for 3-10% of cases), sentencing, and appeals. 90-97% of cases resolve at the plea negotiation stage. Cases are most often won or lost during the discovery and motions stages, not at trial.

**Also:** Add an explicit "Quick Answer" H2 as the first section heading. This is the highest-converting structure for Google AI Overviews.

### 4. `field-sobriety-test-standards`, GEO 8, Highest CW Score in Audit

**Government-sourced accuracy data that most content sites don't have.** NHTSA validation statistics (HGN 77%, Walk-and-Turn 68%, One-Leg Stand 65%, all three combined 82%) are exact figures AI pulls when answering "are field sobriety tests accurate." Already in the post, buried in the "The 77% Problem" section.

**Fix:** Move the data to the opening paragraph. First sentence of the post should be: "NHTSA's own validation studies show field sobriety tests misidentify sober drivers as impaired 18% of the time, even when administered perfectly. The one-leg stand alone is wrong more than a third of the time. Officers rarely administer them perfectly."

Then the narrative. This change alone moves the post from GEO 8 to a likely AI citation target for "field sobriety test accuracy" queries.

### 5. `cooperation-agreement-federal-case`, GEO 8 → Federal Defense Reference Post

**Best-in-class depth on the proffer/cooperation/5K1.1 distinction.** No other consumer-facing site covers this at this level for defendants. The "Safety Valve vs. Cooperation" comparison section is an extraction target. Gap: opens with AUSA narrative rather than definitional structure.

**Fix:** Add TLDRBox:

> Federal cooperation involves three distinct legal mechanisms: (1) the proffer session ("queen for a day"), limited immunity for your statements; (2) the cooperation agreement, a binding contract requiring complete truthfulness, testimony, and possible undercover participation; and (3) the 5K1.1 motion, the government asks the judge to sentence below guidelines, filed only if the government deems cooperation "satisfactory." Each mechanism has different protections and different risks.

**Also:** Ensure the "Safety Valve vs. Cooperation" section has a proper comparison table (it currently uses prose). A 5-row comparison table extracts cleanly in AI responses.

### 6. `trafficking-charges-constructive-possession`, GEO 9 → One Precision Fix

**TLDRBox present and correct.** 73% discrepancy cited. Q&A questions section is AI-extractable. One remaining gap: the constructive possession definition is in prose rather than a structured definition block.

**Fix:** Before the "Actual Possession vs. Constructive Possession" section, add a bolded definition block:

> **Constructive possession** (legal definition): A form of possession established without the substance being found directly on the defendant's body. To prove constructive possession, the prosecution must prove two elements beyond reasonable doubt: (1) the defendant knew the controlled substance was present; and (2) the defendant had the ability to exercise dominion and control over it. Mere proximity, being in the same room, car, or building, is legally insufficient.

This becomes the AI-cited legal definition for "what is constructive possession in a drug case."

### 7. `should-you-take-the-plea-deal`, GEO 8 → Stat Surfacing

**The 97%/94% plea rate statistic is the citation anchor.** TLDRBox is present. The 10-question list is AI-extractable. Gap: the key statistic appears deep in the narrative (paragraph 8) rather than in the TLDRBox or opening.

**Fix:** Move the statistic into the TLDRBox update: "Over 97% of federal criminal cases and 94% of state cases are resolved through plea bargains. Most defendants make the plea decision with incomplete information. Only accept a plea after: all discovery reviewed, motions considered, collateral consequences explained, realistic trial exposure assessed."

**Also:** Add explicit H2: "Should I take the plea deal?" as the first section heading, with the direct answer as the first paragraph. This matches the exact query people ask AI assistants.

### 8. `wire-fraud-defense-questions`, GEO 8 → Add TLDRBox + Statute

**Fifteen-question numbered format is exactly what AI extracts for "questions to ask wire fraud attorney."** Statute citations (18 U.S.C. § 1343, 20-30 years per count) give citation authority. No TLDRBox currently.

**Fix:** Add TLDRBox:

> Wire fraud (18 U.S.C. § 1343) requires the government to prove four elements: (1) a scheme to defraud; (2) specific intent to defraud; (3) use of interstate wire communications in furtherance of the scheme; (4) the scheme sought to obtain money or property. Maximum: 20 years per count (30 years if a financial institution is affected). Your attorney must be able to answer all 15 questions in this post before your next court date.

### 9. `feels-like-lawyer-working-against-me`, GEO 6 → Upgrade to 8

**High emotional-intensity query with currently weak structure.** FAQ schema present but body lacks diagnostic framework that AI can extract.

**Fix:** Add TLDRBox with a binary diagnostic framework:

> Signs your attorney may be functionally working against your interests: (1) pushes a plea without reviewing discovery; (2) cannot explain what motions have been filed or why none were; (3) becomes adversarial when you ask case questions; (4) has no independent investigation or trial plan; (5) communication stops unless you initiate it. This is different from an attorney who gives you bad news or disagrees with your strategy, that is expected. The test is whether they can explain their reasoning specifically.

Then restructure body sections around this 5-point framework rather than narrative vignettes. Projected GEO improvement: 6 → 8.

### 10. `should-you-fire-your-lawyer` and `questions-to-ask-before-hiring-criminal-defense-attorney`, GEO 6 → Paired Upgrade

**Both address high-volume queries with currently thin extractable structure.**

**Fix for `should-you-fire-your-lawyer`:** Add TLDRBox with yes/no decision framework:

> Fire your attorney if: (1) documented non-communication spanning 2+ weeks despite attempts; (2) no motions filed and no specific explanation; (3) plea pressure without discovery review; (4) they don't know basic case facts; (5) a deadline was missed. Do not fire your attorney if: (1) they told you hard truths you don't want to hear; (2) one bad interaction in a functioning relationship; (3) you're within 2-3 weeks of trial without an alternative lined up.

**Fix for `questions-to-ask-before-hiring`:** Reformat as numbered question list with a one-sentence answer under each question. Current format embeds questions in narrative paragraphs. Numbered-plus-answer is the format AI extracts for "questions to ask criminal defense attorney before hiring."

---

## Persistent Structural Gaps Across the 35-Post Corpus

**1. Opening-paragraph answer gap:** 18 of 35 posts still open with emotional or narrative prose before answerable content. AI extractors prioritize the first 100-200 words. "You got pulled over..." and "You're lying awake at 2 AM..." resonate with human readers but score below average for AI extraction.

**2. Missing "Quick Answer" H2:** Zero posts use an explicit "Quick Answer" or "Short Answer" H2 as the first section heading. This format, a H2 that says "Quick Answer," then 2-3 direct sentences, then the full post, is the highest-converting structure for Google AI Overviews. Perplexity explicitly extracts from sections named this way.

**3. Stat surfacing problem:** INAA has three proprietary statistics that no other site has:
- 73% weight discrepancy (93.9g vs. 25.59g), in `what-500-pages`
- NHTSA accuracy rates (82% combined, 65% one-leg stand), in `field-sobriety-test-standards`
- Trial penalty data (federal sentences 3-6x longer for trial vs. plea), in `7-things-criminal-justice-wont-tell-you` and `how-criminal-cases-actually-work`

All three are buried in body text rather than leading the pages they appear on. Each should be in the opening paragraph of its primary post AND cross-referenced in at least 3 other related posts. These statistics are citation anchors.

**4. Missing definition blocks:** Constructive possession, proffer agreement, 5K1.1 motion, Brady material, chain of custody, all defined in prose paragraphs. AI assistants extract structured definitions. Each of these terms should have a bolded definition block: "**[Term]** (legal definition): [2-3 sentences]." This format is directly extractable.

**5. No PAA-targeting in H2s:** None of the posts structure H2 headings to match the exact "People Also Ask" clusters that appear on Google for criminal defense queries. The PAA clusters for "how does a criminal case work" include exact questions that are answered in `how-criminal-cases-actually-work` but not surfaced as explicit H2 headings.

---

## GEO Priority Action Plan

### Week 1-2 (Highest ROI)

- Add TLDRBoxes to posts still missing them: `complete-dui-defense-guide`, `how-criminal-cases-actually-work`, `cooperation-agreement-federal-case`, `wire-fraud-defense-questions`, `feels-like-lawyer-working-against-me`
- Add "Key Findings at a Glance" table to `what-500-pages-of-drug-trafficking-discovery-contained` immediately after existing TLDRBox
- Move NHTSA accuracy stats to opening paragraph of `field-sobriety-test-standards`
- Move 97%/94% plea rate stat into TLDRBox of `should-you-take-the-plea-deal`
- Add constructive possession definition block to `trafficking-charges-constructive-possession`
- Add proffer session definition block to `cooperation-agreement-federal-case`

### Week 3-4

- Reformat `should-you-fire-your-lawyer` with yes/no TLDRBox decision framework
- Reformat `questions-to-ask-before-hiring-criminal-defense-attorney` as numbered question + one-sentence answer format
- Add "Quick Answer" H2 to the 10 highest-volume posts
- Add 73% discrepancy cross-links to `discovery-rights-drug-cases` and `how-to-read-your-discovery`

### Month 2

- PAA cluster analysis for each of the four topic categories; restructure H2 headings to match exact PAA phrasing for top 10 posts
- Add "Frequently Asked Questions" section using exact FAQ frontmatter questions as H3 headers within body content, gives AI a second extraction point beyond schema
- Build `complete-drug-defense-guide` hub post (drug defense cluster currently has no hub)
- Consider a dedicated `federal-defense-hub` post to match DUI hub structure

---

*Re-run geo-baseline.md prompt test 30 days after Week 1-2 implementation. Record results. Target: 20-25% appearance rate (8-10 of 40 prompt-platform combinations) within 90 days.*