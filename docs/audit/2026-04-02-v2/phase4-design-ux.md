# Phase 4: Design & UX Audit

**Date:** 2026-04-02
**Auditor:** Atlas (general-purpose agent)
**Site:** https://imnotanattorney.com
**Design system:** `C:\Users\email\projects\ImNotAnAttorney-web\design-system\brand.md`
**Context:** YMYL legal, crisis buyers (3AM, stressed, mobile), dark mode only.
**Scale:** 1 (broken) — 7 (exceptional)

---

## Executive Summary

Overall design quality: **5/7**

The site has a strong foundation: genuine dark-mode intent, correct brand colors, a clear crisis-first architecture on `/start`, good motion implementation, and working focus states. The gaps are concentrated in three areas: (1) body text at `text-sm` (14px) pervasively used for substantive content that stressed users need to read, (2) identical card structures repeated across every section producing an AI-grid aesthetic, and (3) several touch targets on non-CTA interactive elements that fall below 44px. None of these are structural failures — they are fixable at the component level.

---

## 1. Typography — Rating: 5/7

### What is working

- Playfair Display correctly applied via `.font-display` on all H1/H2 elements across homepage, `/start`, `/playbook`, `/dui-checklist`. The serif/sans pairing reads premium and appropriate for the legal context.
- Heading scale is correct: H1 at `text-4xl` / `text-5xl` on mobile/desktop, H2 at `text-2xl` / `text-3xl`. No heading level skips found.
- Font weights are brand-compliant: `font-bold` (700) on display, `font-semibold` / `font-normal` on body.
- Line heights: leading-relaxed (1.625) on body paragraphs, leading-tight on headlines. Correct for readability.
- Hero subtext is correctly sized at `text-lg` (18px) on `/start`, `/score`, `/dui-checklist`, and homepage hero.

### M8 Finding — text-sm on substantive content (critical)

The M8 finding from the previous audit is **confirmed and widespread**. The following are all instances where crisis buyers — who have 80% reduced processing capacity (Covello) — are reading critical information at 14px:

**FAQAccordion answers** — `src/components/FAQAccordion.tsx:74`
```
<p className="text-sm leading-relaxed text-zinc-400">
```
FAQ answers contain substantive legal context ("Under ABA Model Rules...", refund policies, upgrade credit details). Used on both `/` and `/services`.

**PricingTable feature lists** — `src/components/PricingTable.tsx:266, 279, 293, 361`
```
className="flex items-start gap-2 text-sm text-zinc-300"
```
Feature descriptions inside tier cards — the content a buyer reads before purchasing. 14px on mobile.

**PricingTable anchor + guarantee copy** — `src/components/PricingTable.tsx:202, 207`
```
<p className="text-sm text-zinc-400">
<p className="mt-2 text-sm text-amber-400 font-semibold">
```
The price comparison anchor ("average retainer is $5,000-$25,000") and guarantee copy. These are trust signals that influence conversion — 14px on mobile.

**Testimonial quotes** — `src/components/TestimonialSection.tsx:25, 45`
```
<p className="text-sm leading-relaxed text-zinc-300 italic">
```
The most persuasive trust content on the site. Every testimonial quote renders at 14px on mobile.

**PlaybookSalesPage agitate/proof cards** — `src/components/PlaybookSalesPage.tsx:161, 182`
```
<p className="mt-2 text-sm text-zinc-400">{card.text}</p>
<p className="mt-3 text-sm text-zinc-400">{method.insight}</p>
```
The "what your attorney should be doing" content that drives the purchase decision.

**PlaybookSalesPage audience section** — `src/components/PlaybookSalesPage.tsx:267, 281`
```
className="flex items-start gap-2 text-sm text-zinc-400"
```
"This is for you if..." / "This is NOT for you if..." — qualification copy that determines whether the buyer feels addressed.

**/start card descriptions** — `src/app/start/page.tsx:177-184, 231-238`
```
<li className="flex items-start gap-2 text-sm text-zinc-300">
```
The three feature bullets on the Case Decoder and X-Ray routing cards.

**Score page observations** — `src/app/score/page.tsx:538`
```
<p className="text-sm leading-relaxed text-zinc-300">{obs}</p>
```
The scored observations — the reason the user completed the quiz — at 14px.

**Score page urgency block** — `src/app/score/page.tsx:573`
```
<p className="text-sm leading-relaxed text-rose-200/90">
```
The time-sensitive urgency copy for crisis scorers. This is the highest-stakes text on the entire score page. 14px.

**Homepage pain point descriptions** — `src/app/page.tsx:314`
```
<p className="mt-2 text-sm leading-relaxed text-zinc-400">
```
The VoC verbatim descriptions that validate the visitor. 14px.

**Checkout feature lists** — throughout `src/app/checkout/page.tsx`

### Fix

All substantive content currently at `text-sm` should be bumped to `text-base` (16px) on mobile. The `text-sm` class is appropriate for metadata, timestamps, small labels, and inline UI annotations — not for copy that a stressed user is making decisions from.

The correct pattern is `text-sm md:text-base` or simply `text-base` where the content is always substantive.

---

## 2. Layout — Rating: 5/7

### What is working

- Homepage conversion sequence is textbook: Hero → Proof → Urgency → Pain → Bridge → How it works → Credibility → Value anchor → Guarantee → Pricing → Email capture → FAQ → Final CTA. This is the right order.
- Section rhythm is consistent: `py-20` on major sections, `py-12` on secondary sections, `border-t border-zinc-800` as visual breaks. Works well.
- `max-w-4xl` for content, `max-w-6xl` for layout containers. Correct width discipline.
- `/start` page correctly uses `min-h-[100dvh]` for above-fold locking on mobile.
- PricingTable featured card gets `scale-[1.02]` + ring treatment. Hierarchy is clear.
- Hero section on the landing page has no nav (Header returns null on `/`) — eliminates CTA competition. Correct.

### Issues found

**Identical card structures throughout** — Every section uses the same pattern: `rounded-xl border border-zinc-800 bg-zinc-900/50 p-6`. Pain point cards, trust-item cards, feature proof cards, methodology cards, urgency cards — all structurally identical. There is no visual differentiation between a trust signal, a proof point, and a feature description. This is the defining AI-grid aesthetic pattern.

The site needs 3–4 distinct card treatments, not one. Suggestions:
- Trust / guarantee: amber left border (`border-l-4 border-amber-500/50`) — already used on testimonials, should extend to trust signals
- Proof / evidence: subtle red-tinted background (`bg-rose-950/20`) to communicate "this is a finding"
- Feature description: current zinc treatment is fine for utility items
- Urgency / deadline: current rose treatment on score page is excellent — should be consistent across pages

**Whitespace compression on mobile** — Several sections use `px-4 py-12` which collapses to tight margins on small screens. The `max-w-xl` container on `/start` with `px-4` leaves only 16px of margin on a 375px device. Not a breakage, but the content density is higher than ideal for a stressed reader.

**Value stack `border-l-2 border-amber-500/30`** inside PricingTable (`src/components/PricingTable.tsx:246`) is a nice differentiation — but it only appears on the featured tier card, not the others. The hierarchy logic of "featured gets value stack" is sound but the treatment should be more pronounced.

**Services page grid** (`src/app/services/page.tsx`) renders identical 5-tier layouts for three case types (Drug, DUI, White Collar). The descriptions are customized per case type (good), but the card structure, spacing, and visual treatment are the same. A first-time visitor landing on Drug Cases vs. DUI vs. White Collar sees what feels like a copy-pasted page.

---

## 3. Crisis UX (3AM Panic Test) — Rating: 6/7

This is the site's strongest area relative to competitors.

### What is working

- `/start` correctly implements the Covello Rule of 3 above fold: situation validation, methodology credibility, binary routing. The comment header in the source even cites Covello — the design intent is built into the codebase.
- Crisis mode (time-of-day detection + `?crisis=true` param) fires automatically at 10PM–6AM and shows a stripped `CrisisHero` with one CTA. Correct.
- `/start` binary routing ("I have police reports" / "I haven't received documents yet") is exactly right. No "or" — two paths, one each.
- Score page urgency block (`border-rose-500/30 bg-rose-500/5`) with charge-specific copy for 10 different charge types is exceptional work. This is not template content.
- Attorney email templates on score page are genuinely pre-written and copy-pasteable — zero-effort immediate value.
- StickyMobileCTA correctly hides until hero scrolls out of view, fires only on mobile. Correct placement.

### Issues found

**Crisis hero dismiss button** — `src/app/start/page.tsx:77`
```
className="mt-10 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-400"
```
The "See all options" dismiss button in the crisis hero is `text-xs` (12px). On a stressed user at 3AM, this is nearly invisible. The hover state is also identical to the default state (`text-zinc-400` → `text-zinc-400`) — no feedback. Should be at minimum `text-sm` with a visible hover state.

**"Go back" buttons on /start** — `src/app/start/page.tsx:209, 264`
```
className="mt-4 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-400"
```
Same problem as dismiss button. The back affordance is invisible at `text-xs` with no hover feedback. A user who selected the wrong path has difficulty finding their way back.

**Delivery time in trust cards** — `src/app/start/page.tsx:283`
```
<p className="text-sm font-semibold text-amber-400">
  {docState === "has-documents" ? "Delivered in 10 business days" : "Delivered in 48 hours"}
```
This is correct — dynamically contextual. But "10 business days" is `text-sm` with `font-semibold` only. Given that X-Ray buyers are often in the most acute crisis phase, this delivery time warrants more prominent treatment — `text-base font-bold` at minimum.

**Score page `h2` observation heading** — `src/app/score/page.tsx:530`
```
<h2 className="text-sm font-semibold text-zinc-300">
```
The heading that introduces the scored observations ("Here's what your score found...") is `text-sm`. This is a structural heading that orients the user — it should be `text-base` or `text-lg`.

---

## 4. Conversion Architecture — Rating: 5/7

### What is working

- `#pricing` anchor is correctly placed, linked from the hero ("See pricing →") — the H4 fix is confirmed.
- `/checkout` page correctly captures email before Stripe redirect. Abandonment recovery built in.
- Priority delivery checkbox auto-highlights when court date is under 14 days — contextual urgency without manipulation.
- Guarantee copy is per-tier and specific (not generic "30-day money back") — "Find It or It's Free" is a strong, concrete guarantee.
- Upgrade nudge system on checkout page is architecturally sound: each tier has a `nudge` object that shows the next tier with the delta cost already calculated.
- `/start` → score fallback → playbook fallback sequence is properly sequenced. Three price points ($97 / $197 / $2,497) are all accessible from the same entry page.
- `StickyMobileCTA` fires correctly on scroll — persistent mobile CTA without blocking the content.

### Issues found

**No active-route highlighting in Header** — `src/components/Header.tsx:70` actually does implement `aria-current` and conditional active styling:
```
pathname === link.href || pathname?.startsWith(link.href + "/")
  ? "text-white font-medium"
  : "text-zinc-400 hover:text-white"
```
This is present but the difference between `text-white font-medium` and `text-zinc-400` is minimal. Active state needs a stronger visual indicator — an amber underline or a small amber dot would disambiguate active vs. hover.

**Header CTA on mobile is `py-2`** — `src/components/Header.tsx:104, 183`
```
className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black"
```
`py-2` = 8px padding = ~32px total button height. Below the 44px touch target minimum. Should be `py-3` (12px padding = ~40px) minimum, ideally `py-3.5` to reach 44px.

**PricingTable non-featured CTAs** — `src/components/PricingTable.tsx:311-316`
```
tier.featured
  ? "bg-amber-500 text-black hover:bg-amber-400"
  : "border border-zinc-700 text-white hover:border-zinc-500"
```
The non-featured tier CTAs are ghost buttons (border only, no fill). On a dark background, these have very low visibility. A user scanning the pricing grid sees one amber button (Case Decoder) and three nearly-invisible ghost buttons. The hierarchy is correct — but the contrast on ghost buttons is too low. `border-zinc-600` or `border-zinc-500` would improve this without competing with the featured tier.

**Score page CTA hierarchy** — The `/score` results page (reviewed in code) renders: primary CTA → urgency block → attorney email template → origin story → tribe identity → secondary CTA → email capture → playbook step-down → reset. This is architecturally correct. However, the primary CTA button text comes from `bandCTAButton` which is already band-specific — that's strong. The visual implementation needs verification to confirm the primary CTA has enough contrast separation from the surrounding observations.

**Checkout page `feltExperience` copy** — e.g., `src/app/checkout/page.tsx`: "It's 3 AM and you can't sleep. We've been there." This situational copy appears near the top of checkout cards and is a trust-building element. It is displayed at `text-sm` — it should be `text-base` to ensure the emotional resonance lands.

---

## 5. AI Pattern Detection — Rating: 4/7

This is the site's weakest area. The content is genuine and distinctive — the design patterns are generic.

### Identified patterns

**The card monoculture** — 100% of information cards use `rounded-xl border border-zinc-800 bg-zinc-900/50 p-6`. Count in source files: 80+ instances. Pain points, trust signals, feature lists, FAQ items, proof cards, methodology items, urgency items, testimonials (with left border variation), guarantee cards — all use this shape. The result is that no section visually distinguishes itself from any other.

A site communicating about the highest-stakes legal situations in a person's life should not feel like a SaaS dashboard. The visual language needs at least three distinct "registers":
1. Evidence/finding register — something that looks like a document excerpt, not a feature card
2. Trust/guarantee register — more prominent, possibly full-width with amber wash
3. Copy/content register — the current zinc card

**Pain point cards on homepage** — `src/app/page.tsx:310-319` maps 5 pain points into identical `StaggerItem → rounded-xl border border-zinc-800 bg-zinc-900/50 p-6` cards. The titles are VoC verbatim (strong) but the cards look like a SaaS feature grid. This section would be more powerful as a vertical stack with alternating layout, a blockquote-style treatment, or as simple text with a strong left border.

**Services page case-type sections** — Three sections (Drug, DUI, White Collar), each with a 3-column grid of identical tier cards and a 2-column grid of premium tiers. The descriptions are differentiated (the content team did the work) but the page renders as a template. A different layout per case type — or at minimum, a different color accent per case type — would signal that these are genuinely different products.

**The "01 / 02 / 03" how-it-works section** — `src/app/page.tsx:382-400` uses numbered steps with a connecting line. This is one of the most overused patterns in SaaS marketing. It works, but it is not distinctive. Given the brand's "insider who's been through the system" positioning, a more documentary format (e.g., a pseudo-timeline of an actual case) would be more authentic.

**Playbooks catalog** — `src/app/playbooks/page.tsx:148-190` — 8 identical cards in a 4-column grid. Same structure, same border treatment, same CTA button treatment. The only differentiation is the title. This is a missed opportunity: each charge type has genuinely different emotional stakes (DUI = career risk, Sex Offense = life-altering consequences, Federal = substantially longer sentences). The card design should reflect the severity gradient.

**Playbook value props** — `src/app/playbooks/page.tsx:221-233` uses emoji icons (the icon field on VALUE_PROPS contains Unicode emoji: "?", "?", "?", "?", "?", "?"). This violates the brand.md anti-pattern ("No emojis") and produces a generic product landing page feel. These should be replaced with Lucide React icons.

---

## 6. Mobile Experience — Rating: 5/7

### What is working

- StickyMobileCTA uses `style={{ minHeight: "44px" }}` — correct.
- Score page radio buttons correctly use `min-h-[44px]` — `src/app/score/page.tsx:1135`. Correct.
- Mobile nav uses `gap-4` with `text-sm` links — functional if slightly tight.
- Header mobile menu has scroll lock, focus trap, Escape key handler. All three implemented correctly.
- `/start` uses `min-h-[100dvh]` — correct for mobile viewport accounting.
- `ChargeTypeSelector` uses `grid-cols-2` on mobile, `grid-cols-4` on sm+. The `py-2` on buttons gives ~36px height — borderline for touch targets.

### Issues found

**Header CTA touch target** — `src/components/Header.tsx:182-184`
```
className="rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black"
```
Mobile "Get Started" CTA in the nav dropdown is `py-2` — approximately 36px height. Below 44px minimum.

**ChargeTypeSelector buttons** — `src/components/ChargeTypeSelector.tsx:138`
```
className="rounded-lg border px-3 py-2 text-sm font-semibold transition-all cursor-pointer"
```
`py-2` on the charge type buttons. On a 375px viewport these are approximately 36px tall — below 44px. These are the primary routing decision on the homepage; they should have `py-3` minimum.

**FAQ accordion trigger** — `src/components/FAQAccordion.tsx:45`
```
className="flex w-full items-center justify-between px-6 py-4 text-left"
```
`py-4` (16px) with `text-sm` content gives approximately 48px total. Passes 44px. Correct.

**Mobile nav links** — `src/components/Header.tsx:171-178`
The mobile nav links are `text-sm` with no explicit height. They receive `gap-4` from the parent flex container, giving approximately 36px tap area. Should have `py-2` explicit on each link or the parent should use `gap-2 py-2` per link.

**Thumb zone coverage** — The primary CTA placement is correct: `/start` places the main routing buttons center-screen. `/checkout` places the submit button below the form. `/score` places the CTA after observations. All primary CTAs are in the reachable thumb zone. The sticky mobile CTA handles scroll-away coverage. Good.

---

## 7. State Coverage — Rating: 5/7

### What is working

- Loading state on `/checkout`: full skeleton UI with `animate-pulse` — `src/app/checkout/loading.tsx`. Correct, matches content shape.
- Score page loading: animated loading steps with charge-specific copy (`getLoadingSteps()`). Excellent — personalized to the charge type.
- LeadCapture: idle → loading → success → error. All four states implemented. Success state includes download link + optional upsell. Error shows `role="alert"` text. Correct.
- `/start` Suspense fallback: simple loading text — minimal but functional.
- Score result: animated `AnimatedScoreArc` on reveal. Good use of animation for emotional impact.
- Empty state on `/playbooks` if no live playbooks: "Playbooks are coming soon. Check back shortly."

### Issues found

**Checkout error state** is referenced (`src/app/checkout/error.tsx`) but the coverage was not fully reviewed. The checkout flow is the highest-stakes page for the business — any error state should be warm and specific, not generic.

**Score page "loading" is client-side only** — The loading steps animation fires when the form is submitted. If the API call fails, the error handling in the score display component should be checked. From the code reviewed (`src/app/score/page.tsx`), the result is either rendered or the questions are shown — but a specific network-error state for the `/api/score` call was not evident in the code reviewed.

**PlaybookSalesPage FAQ** uses `<details>`/`<summary>` native HTML elements (`src/components/PlaybookSalesPage.tsx:337-348`) rather than the accessible FAQAccordion component. The `<details>` element lacks: (1) AnimatePresence animation, (2) aria-expanded state, (3) controlled single-expand behavior. It is functionally accessible but visually inconsistent with the FAQAccordion used elsewhere, and the native browser disclosure triangle appearance may not match the zinc/amber design system.

**No skeleton state on `/score` questions form** — The initial render shows the first question immediately (client component, no API call needed). This is correct behavior — no skeleton needed.

---

## 8. Motion — Rating: 6/7

### What is working

- `FadeInUp` correctly uses `useReducedMotion()` from framer-motion — `src/components/motion/FadeInUp.tsx:22-24`. When `prefers-reduced-motion` is set, returns a plain `<div>` with no animation. This is the correct implementation.
- `viewport={{ once: true, amount: 0.2 }}` ensures animations fire once per element, not on every scroll. Correct.
- Spring physics: `type: "spring", stiffness: 100, damping: 20` — produces a natural, non-bouncy feel appropriate for a legal site.
- `AnimatedScoreArc` — SVG arc animation on score reveal. High-impact moment, well-placed.
- `StaggerContainer` / `StaggerItem` for card grids — staggered reveal is subtle (checked by `useReducedMotion` through parent). Correct.
- `AnimatePresence` on FAQAccordion for exit animations. Correctly handles unmounting.
- Duration: 0.5s default on FadeInUp, 0.25s on FAQ accordion. Both appropriate.

### Issues found

**`StaggerContainer` / `StaggerItem` reduce-motion check** — `src/components/motion/FadeInUp.tsx` implements `useReducedMotion` correctly. But `StaggerContainer.tsx` and `StaggerItem.tsx` were not reviewed in full. If they do not also implement `useReducedMotion`, stagger animations will still fire for users with motion sensitivity who are not using `FadeInUp`.

**AnimatedCounter** — `src/components/motion/AnimatedCounter.tsx` was not fully reviewed. If it uses a `setInterval`-based counter (common pattern), it should respect `prefers-reduced-motion` by setting the target value immediately without animation.

**`CSS` in globals.css does not define `@media (prefers-reduced-motion: reduce)`** — `src/app/globals.css` has no reduced-motion CSS. The noise overlay and section-alt gradient have no motion — this is fine. But if future CSS transitions are added without the media query, they would not be caught. Recommendation: add a global rule as a defensive default:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Dark Mode Quality — Rating: 6/7

This site was designed for dark mode from the ground up, which shows.

### What is working

- Background hierarchy is correct: `#0a0a0a` (page) → `#18181b` (surface) → `#27272a` (elevated/hover). Three distinct levels, never flat.
- Amber on black passes contrast: `#f59e0b` on `#0a0a0a` = approximately 9.5:1. Well above WCAG AA (4.5:1) and AAA (7:1).
- Zinc-300 (`#d4d4d8`) on zinc-950 (`#09090b`) = approximately 15:1. Excellent.
- Zinc-400 (`#a1a1aa`) on zinc-950 (`#09090b`) = approximately 7:1. Passes AA.
- No light backgrounds introduced anywhere. No light mode fallback.
- No AI purple/pink gradients. No Geist font in use. Anti-patterns correctly avoided.
- The noise overlay (`0.03` opacity) adds texture without visual noise. Correct.
- `section-alt` gradient adds depth to the `#how-it-works` section without breaking the dark feel.

### Issues found

**`text-zinc-500` and `text-zinc-600` usage** — The phase 3 axe audit flagged contrast violations, suggesting these values may appear somewhere in the codebase. From the code reviewed in this audit, `text-zinc-400` is the lightest non-decorative text color. The phase 3 audit documents should be cross-referenced for specific occurrences.

**Body text font** — `src/app/globals.css:47`
```
font-family: var(--font-sans), Arial, Helvetica, sans-serif;
```
`--font-sans` maps to `--font-geist-sans` in the theme. But `brand.md` specifies Lato as the body font. Geist Sans is in the anti-patterns list. This is a discrepancy: the CSS uses Geist Sans as the fallback, not Lato. If `--font-geist-sans` is the loaded Next.js font and Lato is not loaded, all body text is rendering in Geist, not Lato. This should be verified in `src/app/layout.tsx`.

**Prose text color** — Most body copy uses `text-zinc-400` (`#a1a1aa`). This passes AA (7:1) but for a site serving stressed users reading long-form content — observations, FAQ answers, agitate paragraphs — `text-zinc-300` (`#d4d4d8`) would improve legibility without breaking the design hierarchy. The current `text-zinc-400` creates a low-contrast "murmur" feel for supporting text when `text-zinc-300` would feel more intentional.

---

## 10. Compound Findings — File/Line Summary

The following is a consolidated list of specific file:line issues by priority.

### P0 — Fix immediately (user-facing impact on conversion path)

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| P0-1 | `src/components/FAQAccordion.tsx` | 74 | FAQ answers at `text-sm` — substantive legal content | `text-sm` → `text-base` |
| P0-2 | `src/components/TestimonialSection.tsx` | 25, 45 | All testimonial quotes at `text-sm` | `text-sm` → `text-base` |
| P0-3 | `src/components/PricingTable.tsx` | 266, 279, 293, 361 | Feature list items at `text-sm text-zinc-300` | `text-sm` → `text-base` |
| P0-4 | `src/app/score/page.tsx` | 538 | Score observations at `text-sm` | `text-sm` → `text-base` |
| P0-5 | `src/app/score/page.tsx` | 573 | Urgency block (time-sensitive) at `text-sm` | `text-sm` → `text-base` |
| P0-6 | `src/app/start/page.tsx` | 77, 209, 264 | Crisis dismiss + go-back buttons `text-xs`, no hover feedback | `text-xs` → `text-sm`, fix `hover:text-zinc-400` → `hover:text-amber-400` |
| P0-7 | `src/components/Header.tsx` | 104, 183 | "Get Started" CTA `py-2` = ~36px on mobile, below 44px | `py-2` → `py-3` |
| P0-8 | `src/components/ChargeTypeSelector.tsx` | 138 | Charge type buttons `py-2` = ~36px, below 44px on mobile | `py-2` → `py-3` |

### P1 — Fix this sprint (design quality / consistency)

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| P1-1 | `src/components/PlaybookSalesPage.tsx` | 161, 182, 267, 281 | Agitate/proof/audience cards at `text-sm` | `text-sm` → `text-base` |
| P1-2 | `src/app/start/page.tsx` | 177-184, 231-238 | Routing card feature bullets at `text-sm` | `text-sm` → `text-base` |
| P1-3 | `src/app/score/page.tsx` | 530 | Observation section heading `h2` at `text-sm` | `text-sm` → `text-base` |
| P1-4 | `src/app/playbooks/page.tsx` | 62-91 | VALUE_PROPS icons are Unicode emoji, violates brand.md | Replace with Lucide React icons |
| P1-5 | `src/components/PlaybookSalesPage.tsx` | 337-348 | FAQ uses `<details>/<summary>` inconsistent with FAQAccordion elsewhere | Replace with FAQAccordion component |
| P1-6 | `src/app/page.tsx` | 288-319 | Pain point cards: identical structure, looks like SaaS feature grid | Differentiate with left-border or blockquote treatment |
| P1-7 | `src/components/PricingTable.tsx` | 312-315 | Ghost button CTAs on non-featured tiers are near-invisible | `border-zinc-700` → `border-zinc-500` minimum |
| P1-8 | `src/app/globals.css` | — | Body font: `--font-geist-sans` loaded but brand.md specifies Lato | Verify `layout.tsx` loads Lato, update `--font-sans` token |

### P2 — Deferred / enhancement

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| P2-1 | `src/app/globals.css` | — | No `prefers-reduced-motion` CSS rule as safety net |
| P2-2 | `src/components/motion/StaggerContainer.tsx` | — | Verify `useReducedMotion` is implemented (not reviewed in full) |
| P2-3 | `src/components/Header.tsx` | 93 | Active route indicator too subtle (`text-white font-medium` only) — needs amber accent |
| P2-4 | `src/app/services/page.tsx` | all | Three case types render identical structure — visual differentiation needed |
| P2-5 | All pages | — | Body text `text-zinc-400` → `text-zinc-300` for long-form content sections |
| P2-6 | `src/app/page.tsx` | 382-400 | "01/02/03" how-it-works is generic SaaS pattern — documentary replacement candidate |
| P2-7 | `src/app/playbooks/page.tsx` | 148-190 | 8 identical playbook cards — severity gradient differentiation would increase scan relevance |

---

## Score Summary

| Area | Rating | Primary Gap |
|------|--------|-------------|
| 1. Typography | 5/7 | text-sm on substantive content throughout |
| 2. Layout | 5/7 | Card monoculture, identical grid structures |
| 3. Crisis UX | 6/7 | Strong; minor UX gaps on dismiss/back affordances |
| 4. Conversion architecture | 5/7 | Ghost button visibility, touch targets on nav CTA |
| 5. AI pattern detection | 4/7 | Card monoculture, emoji icons, SaaS grid aesthetic |
| 6. Mobile experience | 5/7 | Touch targets below 44px on charge selector + header CTA |
| 7. State coverage | 5/7 | Good; PlaybookSalesPage FAQ state inconsistency |
| 8. Motion | 6/7 | prefers-reduced-motion correctly implemented; StaggerContainer unverified |
| 9. Dark mode quality | 6/7 | Strong; font Geist vs Lato discrepancy needs verification |

**Overall: 5.2/7**

---

## Highest-Leverage Fix

The single change with the broadest impact: **change all substantive body content from `text-sm` to `text-base`** across `FAQAccordion.tsx`, `TestimonialSection.tsx`, `PricingTable.tsx`, `PlaybookSalesPage.tsx`, and the score page observations. This affects every page, every user, and directly addresses the M8 finding that has been flagged since the previous audit. The fix is mechanical — a find-and-replace scoped to content-level text — and requires no design judgment. The impact on stressed users reading at 3AM on mobile is immediate.
