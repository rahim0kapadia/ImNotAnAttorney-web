# Viral Loops Design: ImNotAnAttorney

**Created:** 2026-03-11
**Goal:** Design repeatable mechanics that turn every INNA customer and visitor into an acquisition channel for the next customer.

---

## Strategic Context

Criminal defense is inherently viral-adjacent. When someone gets arrested:
- Their family immediately starts researching
- Friends and community members want to help but don't know how
- Defendants talk to other defendants (in jail, in court waiting rooms, in support groups)
- The emotional urgency creates a strong motivation to share helpful resources

INNA's existing share mechanics (SMS, WhatsApp, Email, Twitter, Facebook buttons on every blog post) provide the infrastructure. What's missing: structured incentive systems, viral scoring mechanics, and referral programs that turn organic sharing into measurable growth loops.

---

## Loop 1: Defense Milestone Score Viral Loop

### Current State
The /score page is a 7-question free quiz that gives a 0-100 Defense Milestone Score. Currently:
- No email required
- Results show score + observations
- Optional email capture after results
- CTA to Case Decoder ($197)
- No sharing mechanics on the results page

### Proposed Viral Mechanics

**1a. Share Your Score**

After displaying the score, add a sharing section:

```
"Your Defense Milestone Score: [XX]/100 -- [Band]"

"Know someone facing charges? Send them the score."

[Share buttons: Text | WhatsApp | Email | Twitter | Facebook | Copy Link]
```

Share text templates (pre-filled, user edits):
- **Text/WhatsApp:** "I just checked my Defense Milestone Score -- it's [XX]/100. You should check yours too. Free, no email required: imnotanattorney.com/score"
- **Email subject:** "Check this -- are you getting a real defense?"
- **Email body:** "I used this free tool to check if my attorney is hitting basic defense milestones. My score was [XX]/100. Takes 60 seconds: imnotanattorney.com/score"
- **Twitter:** "Just found out my attorney is [missing/hitting] basic defense milestones. Score: [XX]/100. Free check: imnotanattorney.com/score #criminaldefense"

**Why this works:** Scores are inherently shareable. People share quiz results for the same reason they share personality test results -- it validates their experience and invites comparison. A low score (Critical/Concerning) creates urgency to warn others. A high score (Adequate/Excellent) creates validation to share.

**1b. Dynamic Share Image**

Generate a dynamic OG image for shared score links:

URL structure: `imnotanattorney.com/score/result?s=[XX]&b=[band]`

The image shows:
- Large score number with color-coded band
- "Defense Milestone Score" branding
- "Check yours free at imnotanattorney.com/score"

When shared on social media, the preview image shows the score visually, making it more clickable than a text-only link.

**Technical implementation:**
- New route: `/score/result/opengraph-image.tsx`
- Uses Next.js dynamic OG image generation (same pattern as existing blog OG images)
- Score and band passed as URL parameters
- Image rendered with the score circle, band color, and branding

**1c. Score Comparison**

Add a line below the score: "The average defendant scores 42/100. You scored [XX]/100."

This creates a reference point and makes the score more meaningful. Scores above 42 feel good (shareable for validation). Scores below 42 feel urgent (shareable as a warning).

### Viral Coefficient Estimate
- Assume 100 people take the score quiz
- With share buttons, 15-25% share their result (quiz completion + share intent is high in emotional contexts)
- Each share reaches ~3-5 people on average (text/WhatsApp has high open rates)
- 20% of recipients click through and take the quiz themselves
- **K-factor estimate: 0.09-0.25** (each person taking the quiz generates 0.09-0.25 additional quiz-takers)
- Not viral (K < 1) on its own, but compounds with other loops

---

## Loop 2: Referral Program for Paid Customers

### Mechanics

**Structure:** Double-sided referral with upgrade credit incentives (not cash).

**How it works:**
1. After purchase (on /checkout/success page), customer gets a unique referral link
2. Referral link format: `imnotanattorney.com/?ref=[CODE]`
3. When someone purchases through the link, both parties benefit:
   - **Referrer:** $50 credit toward any upgrade or future purchase
   - **Referred:** $25 off their first purchase ($97 Playbook becomes $72, $197 Case Decoder becomes $172)
4. Credits stack -- refer 4 people, earn $200 toward an Intelligence Brief upgrade

**Why upgrade credits instead of cash:**
- Keeps money in the ecosystem (higher LTV)
- Encourages upgrades along the tier ladder
- Simpler legal compliance (no payout infrastructure needed)
- Aligns with the existing 100% upgrade credit policy
- Credits don't expire for 12 months (matching existing upgrade credit window)

### Implementation Touchpoints

**Checkout Success Page** (src/app/checkout/success/page.tsx):
Add a referral section after the order confirmation:
```
"Know someone facing charges?"

"Share your referral link. They get $25 off. You get $50 toward your next upgrade."

[Your link: imnotanattorney.com/?ref=ABC123]
[Copy] [Text] [WhatsApp] [Email]
```

**Referral Email** (sent 24 hours after purchase):
Subject: "Your friend is facing charges? This helps."
Body includes:
- Referral link
- Pre-written message they can forward
- Credit balance tracker
- Reminder of upgrade path

**Account/Order Page:**
Track referral credits and show balance:
- Credits earned
- Credits applied
- Next upgrade cost minus credits

### Referral Messaging (Pre-Written for Customers)

**Text/WhatsApp template:**
"When I got charged, I found this service that researches your case and gives you questions to ask your attorney. It actually helped. They're giving $25 off through my link: [link]"

**Email template:**
Subject: "This helped me with my case -- might help you too"
Body: "I know you're going through it. I used ImNotAnAttorney to get specific questions for my attorney about my case -- things I never would have known to ask. They have a $97 playbook that's actually useful. Here's $25 off if you want to check it out: [link]"

### Viral Coefficient Estimate
- Assume 100 customers purchase
- 30-40% of criminal defendants know someone else facing charges (or have family who knows someone)
- 15-20% will share their referral link when prompted post-purchase
- Of those reached, 5-10% convert (high intent -- they were already considering)
- **K-factor estimate: 0.075-0.20** per customer

---

## Loop 3: "Share This With Someone Who Needs It" (Blog Enhancement)

### Current State
Every blog post already has share buttons with the framing "Know someone facing charges? Send them this." This includes SMS, WhatsApp, Email, Twitter, and Facebook share links.

### Proposed Enhancements

**3a. Contextual Share Prompts**

Instead of a single generic share CTA, add context-specific prompts based on the blog post topic:

| Blog Topic | Share Prompt |
|------------|-------------|
| attorney-not-returning-calls | "Know someone whose attorney went ghost? Send them this." |
| should-you-take-the-plea-deal | "Someone you know is deciding on a plea? They need to read this first." |
| first-time-felony-what-actually-happens | "Know someone who just got charged? The system won't explain itself. This will." |
| can-dui-be-dismissed | "Someone you care about got a DUI? There are actual defenses. Share this." |
| feels-like-lawyer-working-against-me | "If someone you know feels like their lawyer isn't fighting for them -- they're probably right. Send them this." |
| how-to-read-your-discovery | "Know a defendant who can't make sense of their discovery? This is the guide they need." |
| 10-questions-every-defendant-should-ask | "These 10 questions change the dynamic with any defense attorney. Share with someone who needs them." |

**3b. Mid-Article Share Triggers**

Add a share prompt INSIDE the blog content (not just at the bottom), triggered after a particularly impactful section. Place it after the section that creates the strongest emotional response.

Format:
```
---
This is the part where most defendants realize they're not alone.
If you know someone going through this, they need to see this too.
[Text] [WhatsApp] [Email]
---
```

**3c. Exit-Intent Share Prompt**

When a user scrolls to leave a blog post (or hovers over the back button on desktop), show a lightweight modal:
```
"Before you go -- know someone facing charges?"
"Most defendants don't know they can hold their attorney accountable."
[Share via Text] [Share via WhatsApp] [Maybe Later]
```

This catches visitors who found the content valuable but weren't prompted to share at the right moment.

### Impact Estimate
- Current blog traffic: [unknown -- establish baseline with analytics]
- Adding contextual prompts + mid-article triggers could increase share rate by 2-3x over current generic prompts
- Text and WhatsApp shares have the highest conversion rates for this audience (personal, urgent, one-to-one)

---

## Loop 4: UGC and Defendant Stories

### Concept
Create a structured way for defendants to share their experiences with the criminal justice system. These stories become content, social proof, and organic distribution.

### Implementation: "Defendant Stories" Section

**Submission Flow:**
1. Link on the site: "Share Your Story" (accessible from blog posts, resource page, checkout success)
2. Simple form:
   - What were you charged with? (dropdown)
   - What happened with your attorney? (text area, 500 char max)
   - What did you do about it? (text area, 500 char max)
   - Would you recommend INNA? (optional)
   - First name and state only (privacy)
   - Consent checkbox: "I agree to my story being shared anonymously on imnotanattorney.com"
3. Stories are reviewed before publishing (UPL compliance check)
4. Published stories appear on a /stories page and can be featured in blog posts

**Why This Works:**
- Defendants want to be heard -- the system silences them
- Stories create authentic social proof (more powerful than constructed testimonials)
- Each published story is shared by the person who submitted it (organic distribution)
- Stories provide VoC data for copywriting and product development
- Google indexes story pages (additional SEO surface area)

**Viral Mechanic:**
After story is published, email the submitter:
```
Subject: "Your story is live"
Body: "Your story has been published at imnotanattorney.com/stories/[slug].
Share it with your community -- your experience might help someone else
who's going through the same thing.

[Share via Text] [Share via Email] [Share via Facebook]"
```

The submitter naturally shares their published story with their network, bringing new visitors to the site.

### Moderation Requirements
- Every story must be reviewed before publishing
- Remove any identifying details (full names, case numbers, specific courts)
- Check for UPL issues (no story should imply INNA provided legal advice)
- Add disclaimer: "Stories reflect individual experiences. ImNotAnAttorney provides legal information and research, not legal advice."

---

## Loop 5: Embeddable Badge Viral Distribution

### Current State
INNA already has an EmbeddableBadge component -- a widget that other sites can embed.

### Proposed Enhancement: Bail Bond and Attorney Directory Partnerships

**Target partners for badge placement:**
- Bail bond company websites (they interact with defendants at arrest)
- Attorney directory sites (defendants searching for lawyers)
- Criminal justice reform organizations
- Defendant advocacy groups
- Legal aid society websites
- Court self-help centers (some link to external resources)

**Badge variants:**
1. "Check Your Defense Milestone Score -- Free" (links to /score)
2. "Know Your Rights: Free Criminal Defense Resources" (links to /resources)
3. "Questions Your Attorney Should Be Answering" (links to blog)

**Outreach approach:**
- Identify 50 bail bond companies in top 10 metro areas
- Email: "We built a free tool that helps defendants check if their attorney is meeting basic defense milestones. Would you be interested in adding our widget to your site? It's free, provides value to your clients, and requires no maintenance."
- Bail bond companies benefit because their clients get a useful tool, making the bond company look more helpful

### Viral Coefficient
- Each badge placement on a partner site drives ongoing traffic
- Not a per-user viral loop but a per-partnership distribution amplifier
- 10 badge placements on bail bond sites could drive 500-1000 monthly visitors

---

## Loop 6: Playbook Sampling Loop

### Concept
Allow Playbook buyers to send a free preview chapter to a friend facing similar charges.

**Flow:**
1. After purchasing a $97 Playbook, the customer sees on the success page:
   ```
   "Know someone facing [DUI/drug/etc.] charges?"
   "Send them a free preview of the playbook -- the first 5 questions."
   [Enter their email] [Send Preview]
   ```
2. The friend receives an email with a 5-question preview from the playbook
3. The email includes a CTA: "Get the full playbook with all 26 questions -- $97"
4. The friend also sees the Defense Milestone Score quiz as a free alternative

**Why This Works:**
- The buyer has already validated the product quality
- Sending a preview is a generous act (not sales-y)
- The preview has enough value to be useful but creates desire for the full playbook
- The friend is in the same charge category (DUI, drug, etc.) so the content is directly relevant

### Implementation Notes
- Preview content must be a subset of the playbook (first 5 questions only)
- Email template should be branded but not pushy
- Include the buyer's first name: "Your friend [Name] thought this might help with your case"
- Track conversions: referral_source = "playbook-preview"

---

## Priority Ranking and Implementation Order

| Loop | Effort | Expected Impact | Priority |
|------|--------|----------------|----------|
| 1: Score quiz sharing | Low (add share buttons to existing page) | Medium-High | 1 -- Implement first |
| 3: Blog share enhancements | Low (copy changes + mid-article CTA) | Medium | 2 -- Quick wins |
| 2: Referral program | Medium (referral tracking, credits, emails) | High | 3 -- Implement after first paid customers |
| 6: Playbook sampling | Medium (preview email, tracking) | Medium | 4 -- After playbook sales establish |
| 4: UGC defendant stories | Medium (form, moderation, page) | Medium-Long term | 5 -- After community establishes |
| 5: Embeddable badges | Low-Medium (outreach effort) | Low-Medium per placement, scales | 6 -- Ongoing partnership development |

---

## Compound Effect Model

No single loop will produce K > 1 (true viral growth). The strategy is to layer multiple loops that compound:

```
Visitor -> Score Quiz (Loop 1) -> 15% share -> 0.15 new visitors
Visitor -> Blog Post (Loop 3) -> 5% share -> 0.10 new visitors
Customer -> Referral (Loop 2) -> 15% refer -> 0.08 new customers
Customer -> Playbook Preview (Loop 6) -> 20% send -> 0.04 new customers
Story Submitter -> UGC (Loop 4) -> 80% share published story -> variable
Partner Site -> Badge (Loop 5) -> ongoing traffic -> variable
```

Combined K-factor across all loops: estimated 0.25-0.45

This means for every 100 visitors, the viral loops generate an additional 25-45 visitors. Not self-sustaining viral growth, but a significant multiplier on every dollar spent on paid acquisition and every visitor earned through SEO.

At 0.35 combined K-factor, a paid acquisition spend that brings 1,000 visitors actually generates 1,538 total visitors (1,000 / (1 - 0.35)). That's a 54% reduction in effective CAC.

---

## Metrics to Track

| Metric | Baseline | Target (90 days) |
|--------|----------|-------------------|
| Score quiz completions/month | [establish] | 500+ |
| Score quiz share rate | 0% (no share buttons) | 15-25% |
| Blog share rate | [establish] | 3-5% |
| Referral links generated | 0 | 50+ per month |
| Referral conversions | 0 | 5-10 per month |
| Playbook preview sends | 0 | 20+ per month |
| UGC stories submitted | 0 | 10+ per month |
| Badge partner sites | 0 | 5+ |
| Combined K-factor | ~0 | 0.25-0.45 |
