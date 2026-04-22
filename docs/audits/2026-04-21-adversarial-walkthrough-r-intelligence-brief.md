# Adversarial Walkthrough — /r/E2EREFE/intelligence-brief — 2026-04-21

Panel: skeptical-buyer persona (2AM post-arrest), april-dunford (positioning), peep-laja (conversion), sabri-suby (direct response), copy-critic (anti-slop), UPL investigator, visual first-5-seconds (375px + 1280px).

Persona: 29M, bonded out 2:17 AM on drug possession, $2,400 out of pocket, 14% battery, cracked iPhone in Uber home. Bondsman texted link 20 min ago. Reading for any reason to close the tab.

---

## CRITICAL (5) — fix before next partner referral lands

### C1. "Test Bondsman Co" leaks into production copy
**Flagged by:** skeptical-buyer (THIS is the close-tab line), copy-critic, visual (visible in header + benefit block on both 375px + 1280px).
**Evidence:** Header reads "Introduced by Test Bondsman Co". Benefit block: "Test Bondsman Co clients get: full tier + free court-date reminders through your case."
**Root cause:** partner seed used `company = "Test Bondsman Co"` in E2EREFE; this partner gets referrals like any other.
**Fix:** Seed E2EREFE with a plausible company name (e.g. "Clearwater Bail Bonds"), OR gate E2E-only partners from rendering at all in prod. Producer: `scripts/seed-e2e-partners.mjs` + seed SQL.
**Why CRITICAL:** Real prospective buyers CAN hit this URL (a bondsman testing their own link, a QA pass from a new partner). One screenshot kills trust.

### C2. Cookie banner buries the entire proof layer on mobile
**Flagged by:** visual (375px screenshot).
**Evidence:** The "15,386 judges indexed • 33,000+ opinions classified • Every citation verified to source" band sits BEHIND the cookie-consent modal on first paint. Buyer sees headline → stakes → bullets → cookie wall → price card. Proof layer hidden.
**Fix:** Move proof strip ABOVE the fold, directly under headline — or move cookie banner to bottom-right compact pill. Producer: `src/app/r/[code]/[product]/page.tsx` hero block + `src/components/CookieConsent.tsx` (verify path).
**Why CRITICAL:** Peep Laja + Dunford + Suby all independently flagged that the proof stats are the ONE piece of specific-attribute trust on the page. If the banner hides them until tap-accept, we lose the only objective anchor against "this is AI slop."

### C3. Market category unclear in 3 seconds (Dunford weakest-of-5)
**Flagged by:** dunford, peep-laja (most-broken layer = Relevance), suby (story 2/5).
**Evidence:** At 3 seconds the reader does not know if this is a legal-AI tool, research service, or something their attorney should be doing. Headline is a noun phrase ("A briefing on..."), not a scene.
**Fix:** Insert category-setter line between headline and stakes: *"A pre-meeting prep file you hand your attorney — built from your judge, your prosecutor, and your charges. Not advice. Not AI guesses. A documented briefing."* Producer: `src/app/r/[code]/[product]/page.tsx` HEADLINES / subheadlines map.
**Why CRITICAL:** Category failure poisons every downstream layer (value, CTA, refund). Highest-ROI single change across 3 separate agents.

### C4. "Years of custody" claim has no source
**Flagged by:** skeptical-buyer ("no citation, no judge quote"), copy-critic ("commonly measured" = hedging), UPL (implicit outcome prediction on a personalized page).
**Evidence:** "The gap between a prepared defense and an under-prepared one at sentencing is commonly measured in years of custody, not months."
**Fix:** Attach a source (USSC matview, citation page, or a specific stat from JUSTFAIR). Replace "commonly measured" (hedge) with a documented number. Producer: hero anchor paragraph on `/r/[code]/[product]/page.tsx` + `src/lib/schema.ts` citation entry if adding linked source.
**Why CRITICAL:** The skeptical buyer specifically flagged this as "the exact kind of claim I'd come here to verify." Unsourced stakes-math invites the "legal-AI-slop" dismissal AND creates UPL implied-outcome exposure.

### C5. Product assumes the buyer already has an attorney
**Flagged by:** skeptical-buyer (3 times across the session), dunford (target reader), peep-laja (relevance).
**Evidence:** Every deliverable is framed as "questions FOR YOUR ATTORNEY" — but the 2AM crisis buyer often does not yet have one (public defender not yet assigned, can't afford private). The page has no path for this reader.
**Fix:** Add a single line below deliverables: *"No attorney yet? The briefing still works — it's the packet your public defender will thank you for at intake, or the file you hand to the attorney you eventually hire."* Producer: `src/app/r/[code]/[product]/page.tsx` deliverables block trailer.
**Why CRITICAL:** 60%+ of criminal defendants use public defenders. The current copy writes them out of the product frame entirely.

---

## WARNING (6) — next pass

### W1. Decimals on a 4-figure crisis product read as haggling
**Flagged by:** skeptical-buyer, peep-laja.
**Evidence:** `$897.30` strikethrough + `$177.30` in downsell link. Decimals communicate "we're adding tax" not "we're saving you money."
**Fix:** Render with `Math.round(discountedPrice)` when ≥ $100 — whole dollars. Keep `.toFixed(2)` only for sub-$100 playbook products where cents matter visually. File: `src/app/r/[code]/[product]/page.tsx:201,275,314`.

### W2. Downsell nudge competes with primary CTA at emotional peak
**Flagged by:** peep-laja (distraction layer).
**Evidence:** "Not sure yet? Start with the Case Decoder for $177.30" sits directly below "Start My Case Intelligence Brief" CTA. Second decision at the moment of commitment.
**Fix:** Move downsell below UPL footer OR gate behind exit-intent. File: `src/app/r/[code]/[product]/page.tsx:305-316`.

### W3. "YOUR judge, YOUR prosecutor, YOUR case facts" — shouty-caps anaphora = AI tell
**Flagged by:** copy-critic.
**Evidence:** Three consecutive ALL-CAPS YOURs is the Ahrefs-blog-post cadence — emphasis by shouting, not earned.
**Fix:** *"A briefing on the judge sitting on your case, the prosecutor charging it, and the facts in your file."* File: HEADLINES map `case-intelligence-brief` key.

### W4. CTA commands instead of invites
**Flagged by:** copy-critic.
**Evidence:** "Start My Case Intelligence Brief" — generic SaaS imperative.
**Fix:** Brand-voice aligned invite: *"See what they have on me."* File: primary CTA label.

### W5. "Questions your attorney can't easily answer" = hedge
**Flagged by:** copy-critic (refund bullet), UPL (Category 1 borderline).
**Evidence:** "Easily" is a squishy bar. Concrete replacement: *"If your attorney can answer every question in the brief off the top of their head, full refund."* File: price card refund bullet.

### W6. Jurisdiction coverage unverifiable before purchase
**Flagged by:** skeptical-buyer ("is MY judge in the 15,386?").
**Evidence:** Proof stats assert 15,386 judges indexed but no pre-purchase lookup. Buyer can't confirm THEIR judge is covered before paying $897.
**Fix:** Add a `/r/[code]/intelligence-brief?judge=<name>&county=<>` coverage-check affordance, OR add a "check your judge first (free)" link near proof band. Producer: new route + coverage API, or link to existing `/judge-report-card` free tool. Scope check required.

---

## SUGGESTION (4) — polish

### S1. "15-25 questions" range = uncertainty (Suby + copy-critic)
Ranges communicate "we don't know what we're shipping." Commit to a floor: "15+ questions, every one tied to a specific pattern in this judge's record or this prosecutor's charging history."

### S2. "Jurisdiction-level intelligence for your venue — not a generic overview" (copy-critic)
Defining by what you're NOT is Dunford-weak. *"Your actual courthouse — not the state."*

### S3. No payment plan visible (skeptical-buyer)
Crisis buyer already $2,400 out. $897 is another brick. Split-pay / ACH / Stripe installments would move conversion. Scope: a Stripe payment-plan integration (3-pay). Defer.

### S4. "ImNotAnAttorney" wordmark on desktop loses brand amber emphasis (visual, 1280px)
Desktop header renders wordmark flat white; mobile header uses just the logomark. The signature "Im**Not**AnAttorney" amber emphasis only appears in OG image + footer brand mark. Producer: `src/components/BrandedHeader.tsx` or layout header component.

---

## Top 3 Highest-ROI Changes

1. **Fix C1 "Test Bondsman Co" leak** — one seed edit, kills the "am I on a real page?" trust break that loses an entire class of visitors.
2. **Fix C2 cookie banner + move proof above fold** — the 15,386/33K/verified stats are the ONLY specific trust anchors on the page; hiding them on first paint is a self-inflicted wound.
3. **Fix C3 add category-setter line** (single sentence under headline) — collapses Dunford + Laja + Suby weakest-dimension flags into one edit.

## Compliant Anchors To Preserve (UPL)

Do NOT edit these — they are the page's UPL shield and an investigator flagged them as protective:
- "ImNotAnAttorney provides legal information, not legal advice."
- "Deliverables are information and questions for your attorney — not case predictions, legal strategy, or representation."
- "We are not a law firm and do not create an attorney-client relationship."
- "Your attorney remains the final authority on strategy decisions specific to your situation."

If C3 (category-setter) or any other hero edit lands, ensure at least two of the four remain above-the-fold.

---

## Re-run

After C1–C5 + W1–W6 land, re-run the full 7-panel against the same URL. Exit condition: skeptical-buyer persona returns with no "close the tab" flag.

CRITICAL remaining as of 2026-04-21: 5
WARNING remaining: 6
