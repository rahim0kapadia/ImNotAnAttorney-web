# ImNotAnAttorney Growth Strategy

**Created:** 2026-03-13
**Status:** Strategy document -- implementation pending
**Budget context:** Bootstrapped, lean. $500-$2,000/month paid budget ceiling initially.

---

## Table of Contents

1. [Growth Model Overview](#1-growth-model-overview)
2. [Score Quiz Viral Loop](#2-score-quiz-viral-loop)
3. [Content Viral Loops](#3-content-viral-loops)
4. [Referral Mechanics](#4-referral-mechanics)
5. [Paid Channel Strategy](#5-paid-channel-strategy)
6. [Organic Growth Flywheel](#6-organic-growth-flywheel)
7. [Content Gap Analysis](#7-content-gap-analysis)
8. [Cross-Platform Distribution](#8-cross-platform-distribution)
9. [Metrics and Benchmarks](#9-metrics-and-benchmarks)
10. [Priority Ranking](#10-priority-ranking)

---

## 1. Growth Model Overview

### North Star Metric

**Defense Milestone Score completions per week.** This is the metric that captures top-of-funnel engagement, correlates with downstream conversion, and is directly improvable through growth tactics. Every growth channel should ultimately drive score completions.

### Funnel Architecture

```
AWARENESS                    ENGAGEMENT              CONVERSION           RETENTION/VIRAL
Blog (SEO) ------>
Reddit/Quora ---->  Score Page (/score)  -->  Email Capture  -->  Case Decoder ($197)  -->  Referral
Social (TikTok) ->  [10 questions,          [band-specific     [charge-specific        [defendant-to-
Facebook Groups ->   zero friction]          copy, free          report + questions]      defendant sharing]
Paid (Google) --->                           checklist]
                         |                       |                      |
                         v                       v                      v
                    Score = 0-50:           Drip nurture:          Post-purchase drip:
                    Crisis buyer path      Day 1, 3, 5, 7,       Intake reminder,
                    (urgency + free        10, 14 emails          delivery, meeting prep,
                    attorney email)                                story harvest, upsell
```

### Unit Economics Target

| Metric | Target | Why |
|--------|--------|-----|
| CAC (organic) | $0-$5 | Content + community investment, no per-acquisition cost |
| CAC (paid) | $50-$100 | Realistic for legal keywords with long-tail strategy |
| LTV (Case Decoder) | $197 | Single purchase, but 100% upgrade credit drives upsells |
| LTV (with upsells) | $350-$500 | 15-20% of Case Decoder buyers should upgrade within 12 months |
| LTV:CAC (organic) | 40:1+ | The power of content marketing |
| LTV:CAC (paid) | 2:1 to 4:1 | Acceptable for initial paid channel testing |
| CAC payback | Immediate | Single transaction covers acquisition cost |

---

## 2. Score Quiz Viral Loop

The Defense Milestone Score at /score is INAA's primary free lead magnet and the highest-leverage viral asset. It has zero friction (no email required, no account, no paywall) and delivers immediate personalized value.

### Current State

- 10-question quiz scoring defense preparedness 0-100
- Color-coded animated score arc (red/orange/yellow/green/emerald)
- Band-specific observations, CTAs, and email capture copy
- Crisis buyer path (score 0-50) with free attorney email template
- Privacy-first: "Your answers are not stored"
- CTA to Case Decoder ($197) with band-specific button copy
- Optional email capture below score results

### Missing: Share Mechanics

The score page currently has NO sharing functionality. This is the single biggest missed opportunity for viral growth. Here is the design for share mechanics:

### A. Share-Your-Score CTA

Add a share section immediately after the score arc display and before the observations. Position it as the FIRST thing the user sees after their score.

**Design:**

```
+--------------------------------------------------+
|  Your score: [72] - Adequate                      |
|                                                   |
|  "Know someone facing charges?                    |
|   Send them this -- 60 seconds, free,             |
|   no email required."                             |
|                                                   |
|  [Text] [WhatsApp] [Email] [Copy Link]            |
+--------------------------------------------------+
```

**Share message templates (pre-populated):**

- **Text/SMS:** "I just scored my criminal defense in 60 seconds -- free, no email. Worth checking if you have a case: imnotanattorney.com/score"
- **WhatsApp:** "This free tool scores how prepared your defense is. Took me 60 seconds. No email required: imnotanattorney.com/score"
- **Email subject:** "Free tool -- scores your criminal defense in 60 seconds"
- **Email body:** "I just used this free tool that checks whether your criminal defense attorney is hitting the right milestones. Takes 60 seconds, no email or account needed. Thought it might help with your case: imnotanattorney.com/score"
- **Copy link:** imnotanattorney.com/score (with UTM: ?utm_source=share&utm_medium=score&utm_campaign=viral)

**Why people share scores:**

1. **Identity signaling:** "I'm the kind of person who takes my defense seriously" (the tribe identity section reinforces this)
2. **Altruism:** Defendants know other defendants. Family members know other family members. The desire to help someone going through the same thing is strong.
3. **Anxiety processing:** Sharing the tool is a way to process the anxiety of the score result -- "if other people do this too, I'm not alone"
4. **Practical value:** The score is genuinely useful. People share useful things.

**What makes people NOT share:**

1. **Stigma:** Criminal charges carry shame. The share message must NEVER reveal the sharer's score or charges. It shares the TOOL, not the result.
2. **Privacy fear:** "Will this be linked to me?" The privacy-first design ("your answers are not stored") addresses this.
3. **Friction:** Every extra tap reduces sharing by 30-50%. The share buttons must be one-tap with pre-populated messages.

### B. Score Comparison / Benchmarking

Add a benchmark context line below the score arc:

- "Your score of [X] is [above/below/at] the average for [charge type] cases we've analyzed."
- Display anonymized aggregate: "Average [charge type] score: [Y]" (computed from API submissions, no PII stored)

**Implementation note:** The /api/score endpoint currently stores NOTHING. To enable benchmarking, add an anonymous aggregate counter to the scoring logic: increment a counter per charge type and add the score to a running average. Store ONLY the aggregate (count + sum), never individual answers.

### C. Social Proof Counter

Add a counter near the top of the score page:

"[X] defendants have scored their defense this month."

This creates urgency (others are doing this), normalizes the behavior (you're not weird for taking this quiz), and provides social proof (this tool is used and trusted).

**Implementation:** Simple Supabase counter table. Increment on each /api/score POST. Display via a lightweight /api/stats/score-count endpoint. No PII involved.

### D. Referral Tracking

Add UTM parameters to all shared links: `?utm_source=share&utm_medium=score&utm_campaign=viral&ref=[anonymousId]`

Generate a short anonymous referral ID (8-char hex) on score completion. If someone arrives via a referral link and later purchases, the referrer gets credit. This enables the referral rewards program (see section 4).

### E. Score-Specific OG Image

Create a dynamic OG image for shared score links that says:

"Defense Milestone Score -- Free, 60 seconds, no email required"

Do NOT include the actual score or band in the OG image (privacy). The image should drive curiosity, not reveal results.

---

## 3. Content Viral Loops

### Current State

Blog posts have share buttons (SMS, WhatsApp, Email, Twitter/X, Facebook) with "Know someone facing charges? Send them this." framing. This is good. Here's how to amplify it.

### A. Share Button Optimization

**Current share message (SMS):** "Read this -- it might help with your case: [URL]"

**Optimized share message:** "I found this article about [topic] -- it covers questions you should be asking your attorney that most people never think of: [URL]"

The optimization adds specificity ("questions you should be asking") and stakes ("that most people never think of"). Generic messages get ignored. Specific ones get opened.

**Per-category share messages:**

- **DUI posts:** "If you or someone you know got a DUI -- this covers the evidence your attorney should be pulling that has time-sensitive deadlines: [URL]"
- **Drug posts:** "This article about drug case discovery is the kind of thing nobody explains to defendants. Worth reading: [URL]"
- **White collar:** "For anyone dealing with a federal case -- this covers the questions that actually matter, from someone who's been through it: [URL]"
- **General:** "This might help with your case. It covers what your attorney should be doing -- and what to ask if they're not: [URL]"

### B. "Know Someone" Framing Deep Dive

The current "Know someone facing charges?" framing is powerful because:

1. It gives the sharer PERMISSION to share without admitting they're a defendant themselves
2. It activates the altruism motivation (helping a friend/family member)
3. It expands the audience beyond direct defendants to their network (spouses, parents, siblings, friends)

**Enhance with specificity:**

- After DUI posts: "Know someone who just got arrested for DUI? The first 10 days are critical -- share this before they miss the DMV deadline."
- After drug posts: "Know someone facing drug charges? This covers the evidence problems their attorney might not be checking."
- After general posts: "Know someone whose lawyer won't return their calls? This is the article I wish I'd found sooner."

### C. Defendant-to-Defendant Sharing Psychology

**The sharing trigger for defendants is NOT "this is interesting content."** It is: "I wish someone had sent me this when I was going through it."

This reframes sharing from content recommendation to personal empathy. The copy should reflect this:

- "Send this to someone who needs it -- you know what it feels like to be in the dark."
- "The best thing someone did for me was send me information I didn't know I needed."
- "If someone you know is going through what you went through -- this might be the thing that helps."

### D. Blog Post Sharing Multiplier

For the 5 highest-traffic blog posts, add an inline share prompt at the most emotionally resonant point in the article (not just at the bottom). Place it after the section that addresses the reader's biggest fear or frustration.

Example placement in "Attorney Not Returning Calls":
- After the section about documenting contact attempts, before the section about filing a bar complaint
- Copy: "If this sounds familiar, someone you know is probably going through the same thing right now. Send them this -- it takes 30 seconds."

---

## 4. Referral Mechanics

### Design Principles for This Niche

Referral programs in legal services must account for:

1. **Sensitivity:** Defendants don't want to broadcast their legal situation. The referral must be private (text, email, WhatsApp) not public (social media posts).
2. **Trust deficit:** Defendants distrust everyone. The referral must come from another defendant, not from the company. Peer-to-peer, not brand-to-consumer.
3. **Timing:** Defendants share with people who are CURRENTLY going through the system. The referral window is narrow -- they need the tool NOW, not in 6 months.
4. **Incentive calibration:** Cash discounts feel transactional and cheap. Value-based rewards (free upgrades, extended access, bonus content) feel like generosity.

### Referral Program Design

**Program name:** "Strength in Numbers" (aligns with the tribe identity: "You just scored your defense in 60 seconds. That's a different kind of defendant.")

**Mechanics:**

| Referrer Action | Referrer Reward | Referee Benefit |
|----------------|-----------------|-----------------|
| Share score link, referee completes score | Free "Top 10 Questions" PDF (normally email-gated) | N/A (score is already free) |
| Share score link, referee purchases Case Decoder | $20 credit toward any INAA product | 10% discount on Case Decoder |
| Share blog post, referee purchases any tier | $20 credit toward any INAA product | 10% discount on first purchase |
| Existing customer refers new customer who purchases | 15% credit toward next tier upgrade | 10% discount on first purchase |

**Implementation:**

1. On score completion, generate a unique referral code (8-char hex, stored in a `referrals` table)
2. Append `?ref=[code]` to all share links
3. When a referred user arrives, store the referral code in a cookie/localStorage
4. On purchase, check for referral code and apply: (a) discount to buyer, (b) credit to referrer
5. Notify referrer via email: "Someone you referred just used INAA. You've earned a $20 credit."

**Credit mechanics:**
- Credits never expire (builds goodwill)
- Credits apply to any product, including upgrades
- Credits stack (refer 5 people = $100 credit)
- Credits are applied as Stripe coupons at checkout

### Family Member Referral Path

Family members (spouses, parents, siblings) are a critical referral channel. They're often the ones searching for help on behalf of the defendant.

**Family-specific share copy:**
- "My [spouse/child/sibling] is facing charges and this tool helped us understand what questions to ask their attorney."
- "If someone in your family is going through the system, this free score tool might help. No email needed."

**Family-specific landing consideration:**
- Consider a `/for-families` page that frames INAA from the family perspective: "Your loved one is facing charges. Here's how to help them hold their attorney accountable."
- This page would link to /score (for the defendant to take) and /resources (for the family member to read)

---

## 5. Paid Channel Strategy

### Budget Scenarios

| Monthly Budget | Primary Channel | Secondary Channel | Expected Leads/Month |
|---------------|-----------------|-------------------|---------------------|
| $500 | Google Ads (long-tail) | None | 15-25 score completions |
| $1,000 | Google Ads (long-tail) | Facebook retargeting | 30-50 score completions |
| $2,000 | Google Ads (long-tail + exact) | Facebook prospecting + retargeting | 60-100 score completions |

### Channel A: Google Ads

**Why Google:** High-intent keywords. When someone searches "what questions to ask my criminal defense attorney," they need help RIGHT NOW. This is the exact moment INAA serves.

**The problem:** Primary criminal defense keywords ($100-$250+ CPC) are unaffordable for a bootstrapped budget. "Criminal defense lawyer near me" is dominated by law firm ad spend.

**The solution: Long-tail informational keywords.**

INAA is NOT competing with law firms for "hire a lawyer" searches. INAA targets the informational layer BELOW that -- defendants who already have a lawyer but need to know if that lawyer is doing their job.

**Target keywords (estimated CPC $2-$15):**

| Keyword | Intent | Landing Page | Est. CPC |
|---------|--------|-------------|----------|
| "what questions to ask criminal defense attorney" | Research | /blog/10-questions-every-defendant-should-ask | $3-$8 |
| "is my public defender working my case" | Frustration | /blog/is-your-attorney-actually-working-your-case | $2-$5 |
| "attorney not returning calls what to do" | Crisis | /blog/attorney-not-returning-calls | $3-$7 |
| "how to read discovery documents" | Education | /blog/how-to-read-your-discovery | $2-$5 |
| "should I take the plea deal" | Decision | /blog/should-you-take-the-plea-deal | $5-$12 |
| "DUI breathalyzer calibration records" | Specific | /blog/breathalyzer-calibration-records | $3-$8 |
| "what motions should my attorney file" | Accountability | /blog/what-motions-should-your-attorney-be-filing | $3-$7 |
| "defense milestone score" | Brand | /score | $0.50-$1 |
| "my lawyer won't fight for me" | Emotional | /blog/feels-like-lawyer-working-against-me | $2-$5 |
| "first time felony what happens" | Fear | /blog/first-time-felony-what-actually-happens | $3-$8 |
| "how often should attorney communicate" | Standard | /blog/how-often-should-attorney-communicate | $2-$5 |
| "should I fire my criminal defense lawyer" | Decision | /blog/should-you-fire-your-lawyer | $5-$10 |
| "10 day DMV deadline DUI" | Urgency | /blog/10-day-dmv-deadline | $3-$8 |
| "field sobriety test accuracy" | Specific | /blog/field-sobriety-test-standards | $2-$5 |
| "drug case discovery rights" | Rights | /blog/discovery-rights-drug-cases | $3-$7 |

**Ad copy strategy:**

Headlines should use VoC language (from docs/research/voc-defendant-language.md):
- "Your Attorney Won't Call Back? | Know What Questions to Ask"
- "Is Your Lawyer Actually Working? | Free 60-Second Score"
- "First Felony Charge? | What Actually Happens Next"
- "Public Defender Not Responding? | Your Rights Explained"

Descriptions should reference the free score tool:
- "Free Defense Milestone Score -- 10 questions, 60 seconds, no email required. See if your attorney is hitting the right milestones."

**Landing page strategy:**
- Blog posts are the primary landing pages (SEO-optimized, high-quality content)
- Each blog post has BlogCTA (Case Decoder), LeadCapture (email), and a prominent link to /score
- The funnel: Google Ad -> Blog Post -> /score -> Email capture -> Drip sequence -> Case Decoder purchase

**Budget allocation ($1,000/month example):**
- $700 on long-tail informational keywords (blog post landing pages)
- $200 on brand defense keywords ("imnotanattorney," "defense milestone score")
- $100 on retargeting (visitors who hit /score but didn't complete, or completed but didn't purchase)

**Quality Score optimization:**
- Blog posts are perfectly aligned with keyword intent (high relevance score)
- Fast page load (Next.js SSG, Vercel edge)
- Mobile-optimized (Tailwind responsive, StickyMobileCTA)
- Clear CTAs on every page

**Expected CAC by keyword tier:**
- Long-tail informational: $30-$60 per score completion, $150-$300 per purchase
- Brand keywords: $5-$10 per score completion
- Retargeting: $20-$40 per score completion, $100-$200 per purchase

### Channel B: Facebook/Instagram Ads

**Why Facebook:** Reach family members and emotional-state targeting. Facebook can't target "defendants" directly (Meta restricts sensitive categories), but it CAN target related interests and behaviors.

**Targeting strategy (indirect):**

| Audience | Interests/Behaviors | Why |
|----------|---------------------|-----|
| Family members | Parenting groups, family support, prison reform advocacy | Spouses/parents searching on behalf of defendants |
| Legal-adjacent | Legal shows (Making a Murderer, etc.), true crime, court TV | People interested in the justice system |
| Lookalike | 1% lookalike of score completions | Algorithmically similar to people who use the tool |
| Retargeting | Visited /score, /blog/*, /services but didn't purchase | Warm audience, highest conversion rate |

**Ad creative strategy:**

Format: Single image or short video (15-30 seconds)

Image ad copy:
- Headline: "Is Your Attorney Actually Working Your Case?"
- Primary text: "Most defendants never ask the right questions. This free tool scores your defense in 60 seconds -- no email, no sign-up."
- CTA button: "Take the Free Score"
- Link: imnotanattorney.com/score?utm_source=facebook&utm_medium=paid

Video ad (15 seconds):
- Frame 1 (0-3s): Text overlay: "Your attorney won't return your calls."
- Frame 2 (3-6s): "Your court date is in 3 weeks."
- Frame 3 (6-9s): "You don't know what's happening with your case."
- Frame 4 (9-12s): "Score your defense in 60 seconds. Free. No email."
- Frame 5 (12-15s): CTA: "imnotanattorney.com/score"

**Budget allocation ($500/month Facebook):**
- $300 on prospecting (interest-based targeting)
- $200 on retargeting (website visitors who didn't convert)

**Expected performance:**
- Prospecting: $1-$3 CPC, 1-2% CTR, $15-$30 per score completion
- Retargeting: $0.50-$1.50 CPC, 3-5% CTR, $5-$15 per score completion
- CAC to purchase: $200-$400 (Facebook is upper-funnel, longer conversion path)

### Channel C: Reddit Ads (Future)

Once the organic Reddit presence is established (Phase 3-4 of the Reddit SOP), consider Reddit ads:

- **Subreddit targeting:** r/legaladvice, r/dui
- **Format:** Promoted posts that look like organic content
- **Budget:** $200-$500/month test
- **Creative:** "Is your criminal defense attorney actually working your case? Free 60-second score -- no email required."
- **Wait until:** Organic Reddit account has 1000+ karma and established presence

### What NOT To Do With Paid Ads

- Do NOT bid on "criminal defense lawyer" or "DUI attorney" keywords (too expensive, wrong intent)
- Do NOT target "arrest" or "incarceration" on Facebook (Meta restricts these)
- Do NOT run ads to the checkout page (cold traffic doesn't buy $197 products directly)
- Do NOT use fear-based ad copy that could be interpreted as exploitative
- Do NOT make outcome guarantees in ad copy ("get your charges dropped")
- Do NOT use images of handcuffs, jail cells, or courtrooms (cliche and potentially policy-violating)

---

## 6. Organic Growth Flywheel

### The Flywheel

```
Blog Posts (35 existing)
    |
    v
SEO Traffic (Google organic)  <---+
    |                              |
    v                              |
Score Page (/score)                |
    |                              |
    v                              |
Email Capture                      |
    |                              |
    v                              |
Drip Nurture Sequence              |
    |                              |
    v                              |
Case Decoder Purchase ($197)       |
    |                              |
    v                              |
Post-Purchase Drip                 |
    |                              |
    v                              |
Story Harvest Email                |
    |                              |
    v                              |
Testimonials + Case Studies -------+
(feed back into blog content,
 social proof, and SEO signals)
```

### How the 35 Blog Posts Should Drive Organic Traffic

**Current blog post topics mapped to search intent:**

| Search Intent Cluster | Blog Posts | Target Keywords |
|----------------------|-----------|-----------------|
| Attorney accountability | attorney-not-returning-calls, is-your-attorney-actually-working-your-case, feels-like-lawyer-working-against-me, how-often-should-attorney-communicate, what-happens-if-attorney-misses-deadline, how-your-attorney-makes-money | "lawyer not returning calls," "is my attorney working my case," "lawyer not fighting for me" |
| Questions to ask | 10-questions-every-defendant-should-ask, 5-questions-dui-attorney, questions-to-ask-before-hiring-criminal-defense-attorney, wire-fraud-defense-questions | "questions to ask criminal defense attorney," "what to ask DUI lawyer" |
| Case process | how-criminal-cases-actually-work, what-happens-at-arraignment, first-time-felony-what-actually-happens, why-is-my-criminal-case-taking-so-long | "what happens at arraignment," "first felony charge," "how long does a criminal case take" |
| DUI specific | complete-dui-defense-guide, can-dui-be-dismissed, what-to-expect-after-dui-arrest, breathalyzer-calibration-records, field-sobriety-test-standards, 10-day-dmv-deadline | "can DUI be dismissed," "DUI defense," "breathalyzer calibration," "10 day DMV deadline" |
| Drug specific | discovery-rights-drug-cases, field-test-vs-lab-test-drug-cases, trafficking-charges-constructive-possession, what-500-pages-of-drug-trafficking-discovery-contained | "drug case discovery rights," "constructive possession," "field test vs lab test" |
| White collar | complete-white-collar-defense-guide, cooperation-agreement-federal-case, federal-investigation-what-to-expect, wire-fraud-defense-questions | "federal investigation what to expect," "cooperation agreement federal case," "wire fraud defense" |
| Decision points | should-you-take-the-plea-deal, should-you-fire-your-lawyer, private-attorney-vs-public-defender, can-criminal-charges-be-dropped | "should I take plea deal," "should I fire my lawyer," "private attorney vs public defender" |
| System knowledge | 7-things-criminal-justice-wont-tell-you, how-to-read-your-discovery, what-motions-should-your-attorney-be-filing, how-to-file-bar-complaint-against-attorney | "how to read discovery," "what motions should attorney file," "how to file bar complaint" |

### SEO Optimization for Existing Posts

Each of the 35 blog posts already has:
- Dynamic OG images for social sharing
- FAQ schema markup for rich snippets
- Canonical URLs
- Category tagging for internal linking
- TLDRBox for AI extractability (GEO optimization)

**Enhancement opportunities:**

1. **Internal linking audit:** Every blog post should link to 2-3 related posts AND to /score. Currently, related posts appear at the bottom, but in-text links to related content should be woven into the body copy.

2. **"People also ask" targeting:** Each blog post's FAQ section should be expanded to cover the "People also ask" questions that appear in Google search results for that topic. This captures featured snippet positions.

3. **Content freshness signals:** Update `lastModified` dates when making substantive changes. Google rewards recently updated content.

4. **Long-form pillar content:** The "complete guides" (complete-dui-defense-guide, complete-white-collar-defense-guide) should serve as pillar pages that link to all related shorter posts. Create a "Complete Drug Defense Guide" and "Complete Criminal Defense Guide" to fill the gap.

---

## 7. Content Gap Analysis

### Missing Topics (High Search Volume, No Current Coverage)

| Topic | Search Intent | Priority | Est. Monthly Searches |
|-------|--------------|----------|----------------------|
| "What happens if I violate probation" | Fear/practical | HIGH | 5,000-10,000 |
| "How to prepare for sentencing" | Preparation | HIGH | 3,000-5,000 |
| "What is a plea bargain vs plea deal" | Education | MEDIUM | 2,000-4,000 |
| "Can I change my plea after pleading guilty" | Regret/reversal | MEDIUM | 2,000-3,000 |
| "What happens at a preliminary hearing" | Process | MEDIUM | 3,000-5,000 |
| "How to find a good criminal defense lawyer" | Hiring | MEDIUM | 5,000-10,000 |
| "What are my rights if I'm pulled over" | Rights | MEDIUM | 5,000-8,000 |
| "How to get charges reduced" | Strategy | HIGH | 5,000-8,000 |
| "What is a grand jury" | Education | LOW | 3,000-5,000 |
| "Difference between felony and misdemeanor" | Education | LOW | 10,000-20,000 |
| "How to expunge a criminal record" | Post-conviction | MEDIUM | 10,000-20,000 |
| "What to wear to court" | Practical | LOW | 5,000-8,000 |
| "Can I represent myself in a criminal case" | Decision | MEDIUM | 2,000-4,000 |
| "What does a criminal defense attorney do" | Education | MEDIUM | 3,000-5,000 |
| "How to help someone in jail" | Family audience | HIGH | 5,000-10,000 |

### Content Priorities

**Immediate (next 5 posts):**
1. "What happens if you violate probation" -- high volume, INAA has a probation playbook
2. "How to prepare for sentencing" -- no current coverage, high stakes moment
3. "How to get charges reduced" -- directly feeds Case Decoder value prop
4. "How to help someone in jail" -- opens the family member audience
5. "Complete drug defense guide" -- pillar page to match DUI and white collar guides

**Near-term (posts 6-10):**
6. "What happens at a preliminary hearing" -- process coverage gap
7. "How to expunge a criminal record" -- post-conviction audience
8. "What are my rights during a traffic stop" -- upstream from DUI content
9. "Can I change my plea after pleading guilty" -- high emotional resonance
10. "How to find a good criminal defense lawyer" -- hiring decision content

---

## 8. Cross-Platform Distribution

### Distribution Calendar (Content Repurposing)

Every blog post should be distributed across 5+ channels:

| Channel | Format | Frequency | Tools |
|---------|--------|-----------|-------|
| Blog (SEO) | Long-form MDX | 2-3 posts/week | Next.js, Vercel |
| Reddit | Comments + occasional posts | Daily (per SOP) | Manual |
| Twitter/X | Thread excerpts, single tweets | 2-3x/day | Content bank |
| Facebook Groups | Adapted posts for support groups | 3-5x/week | Manual |
| Quora | Long-form answers to questions | 1/day | Manual |
| TikTok | 30-60 second scripts from blog content | 3-5x/week | Video production |
| YouTube Shorts | 60-second scripts | 2-3x/week | Video production |
| Pinterest | Infographic pins from blog content | 3-5x/week | Canva |
| Email | Drip sequences + newsletters | Automated | Resend |

### Repurposing Framework

For each blog post:

1. **Headline becomes Twitter single tweet** -- post the headline as a standalone tweet with the blog link
2. **Key insight becomes Twitter thread** -- extract the 5-7 most important points into a numbered thread
3. **TLDRBox becomes TikTok/Shorts script** -- the summary is already structured for short-form video
4. **FAQ section becomes Quora answers** -- each FAQ maps to a Quora question
5. **Statistics/data become Pinterest infographics** -- visual representation of key facts
6. **Full post becomes Facebook group discussion starter** -- adapted for group posting rules
7. **Core argument becomes Reddit comment material** -- internalize, don't copy-paste

---

## 9. Metrics and Benchmarks

### Weekly Dashboard Metrics

| Metric | Current Baseline | 30-Day Target | 90-Day Target |
|--------|-----------------|---------------|---------------|
| Score completions/week | Unknown (need tracking) | 50 | 200 |
| Email captures/week | Unknown (need tracking) | 20 | 75 |
| Blog visits/week | Unknown (need tracking) | 500 | 2,000 |
| Organic search traffic/week | Unknown (need tracking) | 200 | 1,000 |
| Reddit referral visits/week | 0 (not started) | 10 | 50 |
| Case Decoder purchases/month | 0 (sandbox mode) | 5 | 20 |
| Email list size | Unknown | 200 | 1,000 |
| Reddit karma (account) | 0 | 100 | 1,000 |
| Score share rate | 0% (no share buttons) | 5% | 10% |
| Referral-driven score completions | 0 | 5 | 25 |

### Conversion Rate Benchmarks

| Funnel Step | Target Rate | Industry Benchmark |
|-------------|-------------|-------------------|
| Blog visit -> score completion | 15-20% | 10-15% for quiz tools |
| Score completion -> email capture | 20-30% | 15-25% for value-first capture |
| Email capture -> Case Decoder purchase | 3-5% (over 14-day drip) | 1-3% for email sequences |
| Score completion -> direct purchase | 2-4% | 1-3% for quiz-to-purchase |
| Blog visit -> direct purchase | 0.5-1% | 0.3-0.8% for content-to-purchase |
| Referral link -> score completion | 30-40% | 25-35% for referred traffic |

### Key Ratio Tracking

| Ratio | Target | Why It Matters |
|-------|--------|---------------|
| Viral coefficient (K-factor) | 0.3 (initial), 0.5+ (optimized) | Each user generates 0.3-0.5 additional users through sharing |
| Score:Purchase ratio | 25:1 | 1 in 25 score completions converts to a purchase |
| Email:Purchase ratio | 15:1 | 1 in 15 email subscribers purchases within 30 days |
| Blog:Score ratio | 5:1 | 1 in 5 blog visitors takes the score |
| Organic:Paid traffic ratio | 3:1+ | Organic should dominate for sustainable growth |

---

## 10. Priority Ranking

Tactics ranked by effort/impact ratio for a bootstrapped business:

### Tier 1 -- Do This Week (Highest ROI, Lowest Effort)

| Tactic | Effort | Expected Impact | Details |
|--------|--------|-----------------|---------|
| Add share buttons to score page | 2-3 hours dev | 5-10% share rate = viral multiplier | Section 2A |
| Add score counter ("X people scored this month") | 1-2 hours dev | Social proof, +5-10% completion rate | Section 2C |
| Start Reddit account (Phase 1) | 30 min/day | Long-term trust-building | Reddit SOP Phase 1 |
| Set up Vercel Analytics tracking for score/blog | 1 hour | Baseline data for all future decisions | Section 9 |

### Tier 2 -- Do This Month (High ROI, Moderate Effort)

| Tactic | Effort | Expected Impact | Details |
|--------|--------|-----------------|---------|
| Write 5 content gap posts (probation, sentencing, charges reduced, family help, drug guide) | 5-8 hours per post | 500-1000 new organic visits/month each | Section 7 |
| Optimize blog share messages (per-category copy) | 2-3 hours | +20-30% share rate on existing shares | Section 3A |
| Start Google Ads on 5 long-tail keywords ($500 test) | 3-4 hours setup | 15-25 score completions/month | Section 5A |
| Reddit Phase 2 (authority comments in legal subs) | 30 min/day | Foundation for Phase 3 organic mentions | Reddit SOP Phase 2 |
| Create /for-families landing page | 4-6 hours | Opens entire family member audience | Section 4 |

### Tier 3 -- Do This Quarter (Moderate ROI, Higher Effort)

| Tactic | Effort | Expected Impact | Details |
|--------|--------|-----------------|---------|
| Referral program implementation | 8-12 hours dev | 10-15% of new users from referrals | Section 4 |
| Score benchmarking (aggregate averages) | 4-6 hours dev | +10-15% email capture rate | Section 2B |
| Facebook ads test ($500, retargeting first) | 3-4 hours setup | 30-50 score completions/month | Section 5B |
| TikTok content production (30 scripts exist in queue) | 2-3 hours/video | Brand awareness, upstream funnel | Section 8 |
| YouTube Shorts production | 2-3 hours/video | Brand awareness, SEO complement | Section 8 |
| Pinterest board setup + 26 pin descriptions | 4-6 hours | Long-tail visual search traffic | Section 8 |

### Tier 4 -- Do Later (Lower Priority or Dependent on Earlier Tiers)

| Tactic | Effort | Expected Impact | Details |
|--------|--------|-----------------|---------|
| Reddit AMA (requires Phase 4 account status) | 4-6 hours prep + 2 hours live | Brand awareness spike, 50-100 score completions | Reddit SOP Phase 4 |
| Reddit paid ads | $200-500/month + setup | Incremental to organic Reddit | Section 5C |
| Dynamic score OG images | 3-4 hours dev | Better social sharing CTR | Section 2E |
| Email abandoned-cart sequence | 4-6 hours | Recover 5-10% of abandoned checkouts | Requires live Stripe |
| Email win-back sequence | 4-6 hours | Re-engage cold subscribers | Requires email list size |
| Embeddable widget distribution | 4-6 hours outreach | Partnership traffic | Existing widget script |

---

## Implementation Notes

### Dependencies

- Share buttons on score page require NO backend changes (client-side only)
- Score counter requires a simple Supabase table + API endpoint
- Referral tracking requires a `referrals` table in Supabase
- Google Ads requires a Google Ads account and payment method
- Facebook Ads requires a Meta Business account and payment method
- Reddit warm-up requires only a Reddit account and daily time commitment
- Content gap posts require only MDX authoring (existing blog system)

### Stripe Sandbox Constraint

All purchase-dependent metrics (conversion rate, CAC, LTV) cannot be measured until Stripe goes live. The growth strategy should focus on top-of-funnel metrics (score completions, email captures, blog traffic) until then.

### UPL Compliance

Every piece of marketing content, ad copy, Reddit comment, and social post must comply with the UPL rules:
- Legal INFORMATION and QUESTIONS only, never legal ADVICE
- No outcome guarantees
- No attorney-client relationship language
- "We Research. You Ask." positioning

---

## Sources

- Belyea/Karmic Karma Ladder framework for Reddit organic growth
- Demand Curve Growth Newsletter #312 (Reddit marketing)
- Google Ads for Law Firms cost benchmarks (BigDogICT, WebFX, iLawyerMarketing)
- Facebook Ads for Lawyers targeting strategies (Rankings.io, PSM Marketing)
- Legal services referral program design (ReferralRock, Referral Factory)
- Reddit Content Policy and subreddit-specific rules
- INAA VoC research (docs/research/voc-defendant-language.md)
- Quiz lead magnet conversion benchmarks (Marquiz, Kyleads, Outgrow)
