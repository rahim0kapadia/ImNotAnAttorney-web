# Adversarial Walkthrough — 2026-04-20

URLs audited: `/partners/bondsman`, `/r/E2EREFE`, `/partners`, `/`
Panel: skeptical-buyer, Peep Laja (CRO), Sabri Suby (direct-response), UPL legal, copy-critic. Dunford (positioning) abandoned — agent hung.

## CRITICAL — fix same session

### C1. Confidentiality implication on `/r/[code]` + `/`
- UPL agent: HIGH (implies attorney-client privilege INAA doesn't have)
- Copy agent: sev 5 (reads "we'll hide this from your lawyer")
- Current: `"Your case is confidential — never shared with your attorney"`
- Fix: `"Your intake is private to us. We don't contact your attorney unless you ask."`
- Files: `src/components/BridgePage.tsx`, `src/app/page.tsx`

### C2. "Visit Test Bondsman Co" links to stripe.com on `/r/E2EREFE`
- Test seed data leaked to prod UX
- Fix: clear `website_url` on E2EREFE partner row OR set to a realistic test bondsman domain
- Not a code bug — DB-state fix

### C3. UPL: "your attorney's track record" on `/r/[code]`
- UPL agent: HIGH-adjacent (implied individualized legal judgment)
- Current: `"We research your specific charges, your judge, and your attorney's track record"`
- Fix: `"Your charges. Your judge. Publicly-documented defense methods. You walk in with the questions that close the gap."`
- File: `src/components/BridgePage.tsx`

### C4. Offer invisibility on `/r/[code]`
- Sabri: Offer 1/5
- Current: hero has no price, no product name, no guarantee
- Fix (Sabri's 80-word block):
  > Your first court date decides your leverage. The prosecutor walks in with a file built from your arrest report, your priors, and three prior cases with your exact charge. You walk in with whatever your attorney had time to skim between other clients.
  > **Case Decoder — $197.** We read your charge, your jurisdiction, and your judge's last 500 rulings. You get 15 charge-specific questions to hand your attorney before your first hearing — the ones the prosecutor is already expecting them to miss.
  > **If those 15 questions don't surface something your attorney hasn't considered, email us for a full refund. No forms, no argument.**
- File: `src/components/BridgePage.tsx`

## PATTERN — fix once, touches many places

### P1. Speed-selling across pages (5+ instances)
- Copy agent + Sabri flagged
- Violates brand-voice.md "quality is the selling point"
- Current: "Get Your Code in 60 Seconds", "Instant approval", "2 minutes"
- Fix: kill at shared CTA component. Replace with value-framed copy ("Get Your Code. Takes about a minute.")
- Files: `/partners/bondsman`, `/partners`, and any shared CTA component

### P2. Defensive hedge (string-identical on 2 pages)
- Current: `"Better-informed defendants make better decisions. This is genuinely useful — not a gimmick."`
- Fix: `"Defendants who know what's coming show up. That's the whole product."`
- Fix once in shared component

## HIGH — fix this week

### H1. Anonymity + FL address contradiction (tab-close #1 for skeptical bondsman)
- Skeptical-buyer: "We're still fighting our own cases. That's why we stay anonymous" → immediate tab-close
- Combined with footer address `195 Dr MLK Jr St N, St Petersburg` — "pick one"
- Fix options: (a) reframe anonymity as operational (not personal), (b) drop anonymity narrative on bondsman page (bondsmen are a B2B audience; defendant anonymity pitch doesn't land)

### H2. `/partners` H1 hedge
- Copy worst-line: `"Your Clients Skip Court. We Help Cut That. You Earn 10–20%."`
- Fix: `"Your Clients Skip Court. We Cut Your FTA Rate. You Earn 10–20%."`
- Drop "help" — it hedges the only claim bondsmen care about

### H3. `/partners/bondsman` missing hard guarantee
- Sabri: Risk-reversal 1/5
- Add after Forfeiture Math section:
  > **The FTA Guarantee.** Run our reminders for 90 days on every defendant you bond. If your FTA rate doesn't drop at least 20% against your prior 12-month baseline, we'll cut you a check for $500 and you keep every tool.

### H4. `/r/[code]` "They've watched thousands of defendants…"
- Copy sev 4: unfulfilled promise on a partner referral page (Test Bondsman Co didn't watch thousands)
- Fix: partner-specific or drop

### H5. `/r/[code]` "The second group does better. Every time."
- Copy sev 4: absolutism, unprovable
- Fix: `"The second group walks in with leverage."`

### H6. `/r/[code]` badge soup
- "Delivery Guarantee / Stripe Secure Checkout / Documented Methodology Guarantee"
- Copy sev 2: spell each out or drop
- "Documented Methodology Guarantee" means nothing to a scared defendant

### H7. `/partners/bondsman` form friction
- Peep Laja: form at bottom after 7 sections, hero CTA anchor-jumps past everything
- Fix: inline 3-field quick-apply in hero (name/email/company); full form remains at `#apply`
- Estimated delta: +15-25% form-start rate

## MEDIUM — UPL watch-list

| finding | category | fix |
|---|---|---|
| `"Find It or It's Free — Guaranteed"` hero badge | Guaranteed-outcome | → `"Find It or It's Free — Refund Guarantee"` |
| `"One question from our report can change what motions your attorney files. One motion can change your case."` | Outcome-prediction | Soften to "Defendants report specific questions have prompted attorneys to file additional motions." |
| `"Your questions are now on the record. Your attorney has to answer them."` | Legal-advice / outcome | Replace with "Written specific questions tend to get different responses than open-ended ones." |
| `"Under ABA Model Rules… not among them."` | Legal-advice | Add: "General information only. State rules vary — consult your attorney or state bar." |
| `"Attorney-grade, built from your exact charges"` | Implied-licensing | → "Research-grade" or "defense-methodology-grade" |
| `"15 calibrated questions… $200+ if scripted by a paralegal"` | Implied-licensing | Drop the paralegal anchor |

## Positive findings — preserve

- All 3 pages carry "Not legal advice / Not representation" — disclaimer infrastructure is strong
- `/r/[code]` accountability strip `"Research and report by ImNotAnAttorney. Not legal advice."` — exemplary
- `"We give you questions. We don't give you advice. Your attorney does that."` — gold-standard framing
- Fallback copy on invalid promo: `"This link expired. Your case didn't."` — strong
- Footer disclaimers + CAN-SPAM address complete

## Dunford — positioning (returned late; 5-component canvas)

### `/partners/bondsman`

| Component | Score | Note |
|---|---|---|
| Competitive alternatives | 4/5 | Misses the real alternative: "do nothing, FTA is just the cost of doing business" |
| Unique attributes | 4/5 | Strong data cites. "Built by defendants" is story, not attribute |
| Value (attr → value) | 3/5 | "595,851 records" is orphaned — proves we're serious but doesn't answer "so what does that do for MY bond book?" |
| Who cares most | 5/5 | Written squarely for the 1-3 person shop |
| **Market-category frame** | **2/5 (weakest)** | Hero pitches FTA-prevention; toolkit pitches referral/commission; data section pitches legal-intel. **3 categories competing.** In 3 seconds a bondsman can't tell what this is. |

### H8 (new) — `/partners/bondsman` category reframe (Dunford biggest move)
- Current: "Bail Bond Partner Program" header + "Every Forfeiture Is a Client Who Didn't Show Up" H1 + data-depth + commissions + toolkit = 3 competing frames
- Fix: single category declaration in hero: `"The FTA-prevention layer for independent bail agents. (Free. Commissions optional.)"`
- Then data depth + commission table become supporting proof, not competing pitches

### `/r/[code]` (bridge)

| Component | Score | Note |
|---|---|---|
| Competitive alternatives | 2/5 | Misses real alt: Google at 2AM / ask bondsman for referral |
| Unique attributes | 2/5 | Metadata is generic reminder-app language, no proof at the door |
| Value | 2/5 | "What to expect at your hearing" is a feature, not a value |
| Who cares most | 3/5 | Partner-name personalization works, but copy doesn't speak to 3AM panic |
| **Market-category frame** | **2/5 (weakest, tied with alts)** | Title swings between "Know what they know" / "Court date reminders" / "Set up your court check-in" — defendant can't tell what this IS |

### C5 (upgrade, was C4-adjacent) — `/r/[code]` category reframe (Dunford)
- Merges with C4 (offer invisibility) — same root cause, deeper framing
- Current: 3 competing titles depending on feature flags + partner state
- Fix: pick ONE category frame and commit. Dunford proposes:
  `"What happens next in your case — from the bondsman who bonded you out."`
- Category = **case-prep briefing** (not reminders, not tagline-brand)
- Sabri's 80-word rewrite (C4) is the downstream copy that inherits this framing
- Implementation: collapse the 3 metadata-title branches to one; hero copy reframes around "what's about to happen in your case"

## Metadata
- Agents consulted: 6 of 6 (Dunford returned after 2h delay — findings folded in above)
- Skill file: `.claude/skills/adversarial-walkthrough/SKILL.md`
- Re-run command: `/adversarial-walkthrough` after fixes land
