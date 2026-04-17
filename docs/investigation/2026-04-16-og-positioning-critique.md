# 32 OG Cards — Positioning & Category Critique

**Date:** 2026-04-16
**Lens:** Dunford positioning canvas, Godin Purple Cow, Laja 4-layer hierarchy, brand.md + atti-persona.md.
**Scope:** every `opengraph-image.tsx` under `src/app/` + shared `src/lib/og-template.tsx`.

---

## 1. Positioning Diagnosis (Dunford)

Dunford's canvas asks: **what is the unique value only you deliver, for what target customer, in what market category, versus which alternatives?** Reading the cards as a set, INAA's positioning-as-communicated is:

> "Defense intelligence for criminal defendants — close the information gap with the prosecution."

That is on-brand. But **only 7 of 32 cards actually say that**. The rest drift into three competing positions:

- **Generic "legal help / resources"** — `resources` ("Guides, checklists, and templates for criminal defendants"), `blog` ("In-depth legal information and defense strategies"), `contact` ("Questions about your case analysis?"), `services` ("Five tiers of defense analysis"). These are Chamber-of-Commerce wallpaper. They don't separate INAA from LegalZoom, Nolo, any state bar self-help portal.
- **Tool-of-the-week** — `plea-analyzer` ("Is Your Plea Offer Fair?"), `score` ("Is Your Defense on Track?"), `dui-checklist` ("What to Do After a DUI Arrest"). Functional, but a user seeing the card alone has no idea why INAA specifically makes this — could be any defense-adjacent content farm.
- **Service-catalog framing** — the root homepage card says title: "Know,\nWhat They Know." with subtitle "Defense intelligence for criminal defendants. Close the information gap with the prosecution." This is the strongest card in the system. Almost nothing else matches its conviction.

**The drift:** brand.md promises **category creation** ("Defense Intelligence"), but `/blog` category label is literally "Blog", `/resources` is "Free Resources", `/contact` is "Contact", `/start` is "Start Here". Those are navigational categories, not *brand* categories. A prospect who sees 3 INAA cards across different surfaces gets three different value propositions.

**Dunford test failed on:** competitive alternatives and unique attributes. Read as a set, the 32 cards don't tell you what alternative INAA is displacing (a public defender? self-representation? LegalZoom? Nothing?) or what is unique ("defense intelligence" is claimed once, never backed with proof elsewhere — no data volume, no specificity, no methodology tell).

---

## 2. Category-Creation Audit (Dunford)

INAA is betting on **"Defense Intelligence"** as a net-new category. The test: does every surface reinforce it?

**Cards that reinforce the category** (7/32):
- `/` homepage — leads with the brand line
- `/services` — category "Defense Intelligence"
- `/services/[slug]` — category "Defense Intelligence"
- `/judge-report-card` — "Defense Intelligence"
- `/similar-cases-analyzer` — "Defense Intelligence"
- `/officer-background-check` — "Defense Intelligence"
- `/district-court-intelligence` — "Defense Intelligence"

**Cards that default to conventional legal framing** (these actively undermine the bet):
- `/blog` — category "Blog", subtitle "In-depth legal information and defense strategies for criminal defendants." Generic law-blog voice.
- `/blog/[slug]` — category defaults to post.category (whatever the MDX file says) or "Defense Research". Inconsistent. Dozens of category values across 43 posts.
- `/resources` — category "Free Resources"
- `/contact` — category "Contact"
- `/family` — category "Family Support"
- `/idd` — category "Scholarship"
- `/about` — category "About INAA"
- `/partners` — category "Partner Program"
- `/partners/bondsman` — category "For Bondsmen"
- `/partner/login` — category "Partner Portal"
- `/start` — category "Start Here"
- `/playbooks` + `/playbook/[slug]` — category "Playbooks" or whatever `config.hero.eyebrow` returns (e.g., "DUI Defense Playbook")
- `/arrest-survival-kit` — "Survival Kit"
- `/dui-checklist` — "Free Resource"
- `/dui-defense` + `/dui-defense/[state]` — "State Guides" / "Florida Guide"
- `/guides/[slug]` — "Defense Guide"
- `/tools/[slug]` — "Free Tool"
- `/plea-analyzer` — "Free Tool"
- `/score` — "Free Tool"
- `/sample` — "Sample Report"
- `/sample-xray` — "Sample Report"
- `/r/[code]` — "Partner Referral"

**Root problem:** there are **19 distinct category labels** across 32 cards. Dunford's rule: categories are hard to create — you don't get one if you dilute the label 19 ways. A category label earns traction through repetition. INAA has repetition on the brand wordmark and amber underline (visual chrome is coherent — good) but zero repetition on the category pill.

Worse, cards like `/blog` say "In-depth legal information and defense strategies" — the exact language of competitors (Nolo, FindLaw, Avvo). If the blog hub positions like Nolo, the blog IS Nolo in the prospect's head.

---

## 3. Remarkability Test (Godin — Purple Cow)

The 8 most commercially-loaded previews ranked by "would someone screenshot this and send it to a friend":

| Rank | Card | Title | Remarkable? |
|------|------|-------|-------------|
| 1 | `/` | "Know, What They Know." | **Remarkable.** 4-word hook that flips the usual lawyer-speak on its head. Purple Cow. |
| 2 | `/arrest-survival-kit` | "Arrest Survival Kit" | **Remarkable.** Named like a product, not a service. The name does the work. |
| 3 | `/sample` | "Sample Case Decoder Report" | **Mid.** The word "Decoder" is the only interesting thing — everything else is "Sample Report." |
| 4 | `/judge-report-card` | "Judge Report Card" | **Remarkable.** Putting judges on report cards is the Purple Cow. Subtitle blows it with jargon ("bench vs. jury divergence"). |
| 5 | `/officer-background-check` | "Officer Background Check" | **Remarkable if prospect processes it.** Running a background check on the cop who arrested you is the emotional payload. Title buries it. |
| 6 | `/similar-cases-analyzer` | "Similar Cases Analyzer" | **Wallpaper.** Sounds like a SaaS feature. Tells you nothing. |
| 7 | `/district-court-intelligence` | "District Court Intelligence" | **Wallpaper.** Dunford-fail: who is the customer? A defendant doesn't wake up wanting "district court intelligence." |
| 8 | `/plea-analyzer` | "Is Your Plea Offer Fair?" | **Mid.** The question is good (it's the 2AM question). "Analyzer" drags it back to tool-land. |

Godin's test: "would a marketer at one of these cards get fired if they DIDN'T make it?" Cards 1, 2, 4 pass. Cards 6, 7 are the ones every competitor could ship tomorrow.

---

## 4. Hierarchy Coherence (Laja)

Laja's 4 layers: **strategic narrative → positioning → messaging → copywriting**. The narrative is "defendant is the only stranger in the courtroom; we close the gap." Grouping the 32 cards by page type:

| Group | Cards | Narrative coherence | Notes |
|-------|-------|---------------------|-------|
| **Brand/hub** (root, about, start) | 3 | Strong | "Know What They Know" / "Built by Defendants, for Defendants" / "You have an attorney. You don't understand your case." — three different but consistent expressions of the same narrative. **Laja-passing.** |
| **Tier pages** (services, services/[slug], 4 Tier-9 standalones) | 6 | Strong on label ("Defense Intelligence") | Titles are flat ("Similar Cases Analyzer", "District Court Intelligence") — they name the SKU, not the *outcome*. Laja: messaging layer is weak even when positioning label is right. |
| **Playbooks** (playbooks, playbook/[slug]) | 2 | Mid | "Pick your charge type. Get an instant-download defense packet." — descriptive, not narrative. Zero connection to "information gap". Could be Nolo. |
| **Free tools** (score, plea-analyzer, dui-checklist, tools/[slug]) | 4 | Weak | "Is Your Defense on Track?" / "Is Your Plea Offer Fair?" — question format is fine, but the *category pill* says "Free Tool" — that's tactical, not strategic. |
| **Sample reports** (sample, sample-xray) | 2 | Mid | Transparency play is on-brand. Titles say "Sample Report" — file-clerk voice, not insider voice. |
| **Content/education** (blog, blog/[slug], resources, dui-defense, dui-defense/[state], guides/[slug], dui-checklist) | 7 | **Weak — actively drifts** | Generic YMYL legal-content category. Blog hub especially — "In-depth legal information and defense strategies for criminal defendants" is a LegalZoom sentence. |
| **Partners** (partners, partners/bondsman, partner/login, r/[code]) | 4 | Mid | Consistent among themselves but disconnected from the defendant narrative. A bondsman seeing "Bail Bond Partner Program" doesn't know INAA is a category. |
| **Support/utility** (contact, family, idd) | 3 | Mid | `family` is strong ("Your Family Member Was Arrested / Here's how you can actually help, not just wait") — Atti voice. `contact` and `idd` are functional. |
| **Dynamic score preview** (score/results/[token]) | 1 | Off-system | **This card doesn't use og-template at all.** Uses inline ImageResponse with score number, gradient, "ImNotAnAttorney, Know What They Know." signoff. Tagline works, but chrome is different — no amber underline, no Playfair hero, no category pill. **Visual hierarchy contradiction.** |

**Contradictions (flagged):**
- `score/results/[token]` — breaks the shared template entirely. Shipping a viral-share surface with off-system chrome.
- `contact` subtitle: "Questions about your case analysis?" — implies INAA provides case analysis as a service on a *contact page*, before the prospect has bought anything. Mixes channels.
- `blog` subtitle — uses "legal information" language the brand-voice rule explicitly rejects ("NOT corporate lawyer voice").
- `services` subtitle: "Five tiers of defense analysis, from charge decoding to full discovery" — feature list, not outcome. Teams 9 (Positioning), 10 (CRO), 11 (Trust) would fail this at gate level.
- `/blog/[slug]` category defaults to whatever post frontmatter says — 43 posts, no shared category discipline. This is the single biggest coherence leak in the system because blog posts are the primary organic surface.

---

## 5. Concrete Rewrites — 5 Worst-Positioned

Criteria: worst drift from brand narrative × highest traffic/share potential. Each rewrite leads with Dunford differentiator, adds Godin hook, fits Atti voice, fits Playfair at 88–104pt.

### 5.1 `/blog` — current: "Criminal Defense Blog"
**Rewrite title:** "What Your Attorney Won't Explain"
**Subtitle:** "Forty-three investigations into the gap between you and the courtroom."
**Category pill:** "DEFENSE INTELLIGENCE"
**Why:** Dunford — differentiator is the insider-gap frame, not "defense blog." Godin — "won't explain" is polarizing, which is the point. Atti — fits the "closes the gap, doesn't attack attorneys" positioning (the enemy is the info gap, not the attorney).

### 5.2 `/services` — current: "Defense Intelligence Services"
**Rewrite title:** "Know the Case Before They Do."
**Subtitle:** "Five tiers of defense intelligence. From $97 charge decoding to $9,997 trial intelligence."
**Category pill:** "DEFENSE INTELLIGENCE"
**Why:** Dunford — the title names the unique *outcome* (intel asymmetry flipped). Godin — "Before They Do" is the hook a defendant retweets. Keeping the price range satisfies Hormozi's "make the investment trivial against stakes" — visible on the preview.

### 5.3 `/similar-cases-analyzer` — current: "Similar Cases Analyzer"
**Rewrite title:** "Find Your Case in 100,000 Others."
**Subtitle:** "See what really happened to defendants with facts like yours."
**Category pill:** "DEFENSE INTELLIGENCE"
**Why:** "Analyzer" is SaaS-speak. "100,000 others" is a specificity number (Atti: "the 68.3g line works because it proves someone measured"). Godin — a defendant will screenshot this.

### 5.4 `/district-court-intelligence` — current: "District Court Intelligence"
**Rewrite title:** "Your District's Sentencing Map."
**Subtitle:** "How your federal district actually sentences this charge — not the statute, the reality."
**Category pill:** "DEFENSE INTELLIGENCE"
**Why:** "District Court Intelligence" is a vendor's pitch to itself. "Your District's" puts it in the defendant's mouth. "Not the statute, the reality" is the information-gap narrative compressed to 6 words.

### 5.5 `/contact` — current: "Contact Us"
**Rewrite title:** "Stuck on a Report? We Read Every Message."
**Subtitle:** "No phones. No sales. Defendants-first support, answered by the team that built this."
**Category pill:** "SUPPORT"
**Why:** "Contact Us" is not a brand moment. Current subtitle ("case analysis?") confuses the sales step. Rewrite signals scale-but-personal, no-call-center, which is Atti trust-engineer mode.

---

## 6. Category Label Taxonomy

Current state: 19 distinct labels across 32 cards. Target state: **6 labels**, each earning repetition. Mapping below. Capitalization as displayed in the pill.

| Label | When to use | Pages mapped |
|-------|-------------|--------------|
| **DEFENSE INTELLIGENCE** | Anything that IS the category — paid tiers, flagship free tools that showcase the category, the brand hub | `/`, `/services`, `/services/[slug]`, `/judge-report-card`, `/similar-cases-analyzer`, `/officer-background-check`, `/district-court-intelligence`, `/score`, `/plea-analyzer`, `/tools/[slug]`, `/sample`, `/sample-xray` |
| **DEFENSE PLAYBOOK** | Charge-specific instant-download packets | `/playbooks`, `/playbook/[slug]` |
| **STATE BRIEFING** | State-specific legal reference pages | `/dui-defense`, `/dui-defense/[state]`, `/guides/[slug]`, `/dui-checklist`, `/arrest-survival-kit` |
| **FIELD REPORT** | Blog (investigative, documentary — not "blog") | `/blog`, `/blog/[slug]`, `/resources` |
| **PARTNER NETWORK** | Any partner-facing surface | `/partners`, `/partners/bondsman`, `/partner/login`, `/r/[code]` |
| **INSIDE INAA** | Company-voice pages (about, family, scholarship, start, contact) | `/about`, `/family`, `/idd`, `/start`, `/contact` |

**Why 6 and not 1:** Dunford — you *can* have sub-labels if they ladder to the master category. "Defense Playbook" and "State Briefing" both imply they're products *inside* Defense Intelligence; they don't compete with it. "Field Report" positions blog content as investigative (Atti: "documentary, not performative"), which is category-reinforcing instead of category-diluting.

**What this kills:** "Blog", "Free Tool", "Free Resource", "Free Resources", "Contact", "Start Here", "Partner Program", "Partner Portal", "For Bondsmen", "Partner Referral", "Sample Report", "Scholarship", "Family Support", "About INAA", "Survival Kit", "State Guide", "State Guides", "Playbooks", "Defense Guide". All 19 of the current inconsistent labels collapse into 6 that repeat.

---

## 7. The Cascade Question

**Test:** someone sees 3–5 INAA cards in a single feed / iMessage thread / Slack paste. Do they compound?

**Current state — fails.** Example feed: a friend shares `/dui-defense/florida` ("Florida DUI Defense" / "Florida Guide") + `/blog/arrest-survival-72-hours` (category = whatever MDX says) + `/judge-report-card` ("Judge Report Card" / "Defense Intelligence") + `/score` ("Is Your Defense on Track?" / "Free Tool") + `/resources` ("Free Resources" / "Free Resources"). That's **5 different category pills**. The prospect's brain cannot bucket these under one brand — they read as 5 different companies with the same amber underline.

**The fix (cascade-native):**

1. **Collapse categories to the 6-label taxonomy above.** This is the single highest-leverage change. 19→6 means the pill repeats within any 3-card exposure.
2. **Kill the `score/results/[token]` off-system chrome.** Port to shared template. Visual consistency is the second-layer cascade — amber underline + wordmark placement + Playfair hero has to repeat too.
3. **Unify blog/[slug] category.** All 43 posts should surface as "FIELD REPORT" regardless of MDX frontmatter. One pill, repeated 43 times, builds the category. 43 different pills destroys it.
4. **Subtitle discipline.** Banish "legal information and defense strategies" (Nolo-voice), "Questions about your case analysis?" (mixed channel), "Five tiers of defense analysis" (feature-speak). Replace with outcome-voice: *what the reader can do now that they couldn't before*.

**The cascade test after fix:** same 5-card feed becomes *FIELD REPORT* + *FIELD REPORT* + *DEFENSE INTELLIGENCE* + *DEFENSE INTELLIGENCE* + *STATE BRIEFING*, all with the identical amber-underline brand lockup. Prospect's brain: "this company publishes investigations, sells intelligence products, and does state guides." That's a category forming. Cascade wins: defendant (builds trust across exposures), INAA (compounding recognition), partner/referral chain (easier to explain), future-us (less rebrand cost when we add Tier 10 SKUs).

---

## Summary Scorecard

- **Dunford:** 7/32 cards carry the positioning. 25/32 drift.
- **Godin:** 3 remarkable cards (`/`, `/arrest-survival-kit`, `/judge-report-card`). 1 undermined by bad subtitle. 4 wallpaper.
- **Laja:** Brand/hub group coherent. Content/education group actively contradicts the narrative. `score/results/[token]` breaks visual hierarchy.
- **Atti voice:** Scattered. Some cards (`/family`, `/start`) nail it. Most tier/service cards are vendor-voice, not insider-voice.

**Highest-leverage fix:** the category pill. 19 labels → 6 labels + unify `/blog/[slug]`. Second-highest: rewrite `/blog`, `/services`, `/contact`, and the 4 Tier-9 standalone titles to lead with outcomes, not product names.

Files for follow-up: `src/lib/og-template.tsx` (no changes — chrome is right), every file under `src/app/**/opengraph-image.tsx` (title/subtitle/category edits), and `src/app/score/results/[token]/opengraph-image.tsx` (port to shared template — hard blocker on viral-share UX).
