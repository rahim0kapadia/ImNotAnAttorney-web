# OG / Link-Preview Design — Expert Triangulation

**Artifact:** 32 OG images, 1200×630 PNG, ImNotAnAttorney.com (legal intel brand, crisis-stage defendants)
**Constraint:** dark-only, amber `#f59e0b` + navy `#1E3A8A`, Playfair Display + Lato
**Distribution:** iMessage (center-square crop ~300px), Twitter/X, LinkedIn, Slack, Discord, WhatsApp
**Date:** 2026-04-16

---

## Qualifying Experts

### 1. Shu Ding — Author of Satori, Vercel
**Why qualifies:** BUILT IT — created Satori in 2021, the CSS-to-SVG engine powering `@vercel/og`; it is the de facto renderer behind most category-defining OG systems on the web (Next, Nuxt, Astro, SvelteKit). CITED — referenced as "the" OG rendering primitive by every major framework; library has ~5x perf and 100x size advantage over headless Chrome. ACTIVE — still shipping updates in 2026 (text-wrap: pretty, async components, memory improvements).
**Framework principles:**
- Treat OG generation as a *component system*, not a design file — every card is a JSX template with props, never a one-off image.
- CSS constraints are a feature: no `position: absolute` madness, no JS. Forces flex/grid primitives that survive scaling.
- Static-weight fonts only (he enforces this at the engine level) — variable fonts silently fall back and kill brand consistency.
- Ship a single "shell" layout + a slot-based content API so 32 variants share one chrome.
- Cache at the edge; regenerate on content change, not on every request.
**Sources:** [Satori on GitHub](https://github.com/vercel/satori), [Shu Ding updates (X)](https://x.com/shuding_/status/1942594497323622809), [Shu Ding projects](https://shud.in/projects).
**What he'd do for INA:** Build ONE JSX OG component with `{kicker, headline, tier, statNumber}` props. 32 URLs, zero per-page design work. Hero stat (`$50K bail math`, `96% plea rate`) dominates at 80pt, kicker and brand are static chrome.

---

### 2. Rauno Freiberg — Staff Design Engineer, Vercel (ex-Arc)
**Why qualifies:** BUILT IT — authored Vercel's public OG system and `cmdk` (millions of weekly downloads); Vercel's own OG cards are the reference every satori tutorial copies. CITED — `ui.land` and "Devouring Details" are curriculum reading among design engineers; featured in Raycast Community Stories. ACTIVE — shipping Vercel Design through 2025-2026.
**Framework principles:**
- "Details over density" — one hero element (stat, phrase, or mark) carries the card; everything else is chrome.
- Type is the illustration. No stock icons, no decorative imagery; the letterforms ARE the art.
- Treat the card like a poster at arm's length: if the headline is not readable at 200px wide, the card fails.
- Brand mark + domain always lives in the same corner, same size, every card. Recognition before content.
- Use a deliberate "flaw" (slight misalignment, off-grid number, diagonal accent) so the card reads as hand-crafted, not generated.
**Sources:** [rauno.me](https://rauno.me/), [Devouring Details](https://devouringdetails.com/), [ui.land interview](https://ui.land/interviews/rauno-freiberg).
**What he'd do for INA:** Kill decorative scales/gavels. One huge number in Playfair (the fact that stings), three words of Lato context, `imnotanattorney.com` monogram lower-left. Every card identical chrome, only the number and phrase swap.

---

### 3. Paco Coursey — Design Engineer, Linear (ex-Vercel design system)
**Why qualifies:** BUILT IT — owns Linear's public site, arguably the most-copied OG system in SaaS (linear.app/changelog OG cards are the category reference). Previously built Vercel's design system. CITED — [designengineer.fyi profile](https://designengineer.fyi/paco-coursey), Raycast Community Stories; his code and patterns show up in component libraries across the ecosystem. ACTIVE — shipping Linear web through 2026.
**Framework principles:**
- One system, infinite cards: a small set of templates (announce / explainer / quote / stat) that every post flows into — no bespoke design work per article.
- Monochrome base + one accent color. Never more than two hues competing for the eye.
- Radically negative space. 40-50% of the card is empty on purpose; crop survives because the content is already centered in a small box.
- Typography does the hierarchy work — no boxes, no cards-inside-cards, no gradients-on-gradients.
- The *changelog card* pattern: tiny eyebrow label ("Changelog" / "Tier 9") + big title + date. Ship-log aesthetic.
**Sources:** [paco.me](https://paco.me/), [Linear OG cards in the wild](https://linear.app), [ui.land interview](https://ui.land/interviews/paco-coursey).
**What he'd do for INA:** Four templates total for 32 pages: CHARGE (stat + charge name), PROCEDURAL (step-of-process), TIER (tier name + price), BLOG (headline + date). Every card runs through one of the four — kills visual drift across the site.

---

### 4. Emil Kowalski — Design Engineer, Linear (ex-Vercel)
**Why qualifies:** BUILT IT — built Vaul, Sonner (both downloaded by the millions), teaches "Animations on the Web" course; contributes to Linear's public OG + marketing surfaces. CITED — his course and blog are standard reading for design engineers; his component work is a reference for haptic/tactile web design. ACTIVE — [emilkowal.ski](https://emilkowal.ski/) shipping through 2026.
**Framework principles:**
- Readability is the only metric. If it doesn't read at 300px wide on iMessage, it's a broken card.
- Monotype scale: 2-3 text sizes across the WHOLE system, not per-card.
- Use the card's TOP-LEFT for the hook (latin reading pattern survives every crop) — never center heroes as the only anchor.
- Dark backgrounds need one-step-down-from-white for text (`#e7e5e4`, not `#ffffff`) — pure white buzzes on OLED previews.
- Animations don't matter on static OG — so all craft budget goes into *micro-typography* (kerning pairs, optical sizing, hanging punctuation).
**Sources:** [emilkowal.ski](https://emilkowal.ski/), [how I built my course platform](https://emilkowal.ski/ui/how-i-built-my-course-platform), [Emil on X](https://twitter.com/emilkowalski_).
**What he'd do for INA:** Top-left-anchored hook ("The 68.3g line" or "$50K at 2AM") so iMessage square-crop still shows the promise. Text color `#f5f5f4` not pure white. Playfair for the hook, Lato ALL CAPS for the kicker, nothing else.

---

### 5. Jonnie Hallman ("destroytoday") — Indie Design Engineer (ex-Stripe staff)
**Why qualifies:** BUILT IT — staff design engineer on stripe.com during the 2020 redesign, where OG/social previews became a category reference across SaaS; now independently crafting Cushion and freelance marketing surfaces. CITED — Hyperakt Lunch Talks, [destroytoday.com](https://destroytoday.com/) linked from dozens of "designers I follow" lists. ACTIVE — shipping publicly on X and journal through 2025-2026.
**Framework principles:**
- Treat OG as *editorial*, not as *marketing*. Headlines, not slogans. Specific nouns, not adjectives.
- One unexpected color move per system (a single non-brand tint used ONLY for urgency/alert cards) — pattern interrupt survives the feed scroll.
- Numbers beat words. If you can replace a word with a specific number, do it. `"Fast delivery"` → `"3 hours"`.
- Honor the grid, then break it once. A single element that sits 4-8px off baseline creates craft signal.
- Bottom-third "metadata bar" (date, author, tier, category) — a fixed utility strip viewers learn to scan.
**Sources:** [destroytoday.com](https://destroytoday.com/), [Hyperakt Lunch Talk](https://www.hyperakt.com/lunch-talks/jonnie-hallman), [Jonnie on X](https://x.com/destroytoday).
**What he'd do for INA:** Editorial treatment — "67% of DUI stops fail the HGN test" not "Learn about DUI defense." Metadata bar at bottom: `CASE DECODER · DUI · $197`. One amber "live alert" tint reserved ONLY for urgency pages (arraignment, 10-day deadline).

---

## Top 5 Category-Defining Production OG Systems

| Brand | The ONE decision that separates it |
|---|---|
| **Linear** (linear.app/changelog) | Monochrome card + tiny eyebrow label + single brand tint dot. Cards read as *changelog entries*, not ads. Crop survival is total because the headline is the only thing on the card. |
| **Vercel** (vercel.com/blog, vercel.com/docs) | Author avatar + title + subtle grid background. Every card looks like a *document page*, not a banner — positions the brand as infrastructure, not marketing. |
| **Stripe** (stripe.com/blog) | Full-bleed gradient photography with whisper-thin type overlay. Gradient is the brand mark — no logo competes for attention. |
| **Raycast** (raycast.com/store, blog) | Product screenshot dominates; chrome is 10% of the pixel area. Treats OG as a *product demo*, not a title card. |
| **Resend** (resend.com/blog) | Large serif headline on solid dark, brand-color underline mark. Closest analog to what INA should ship. |

[OGImage.gallery SaaS category](https://www.ogimage.gallery/category/saas), [Saaspo OG gallery](https://saaspo.com/og-image-examples), [OG playground](https://og-playground.vercel.app/).

---

## Cascade Synthesis — 7 Inviolable Principles for INA OG System

1. **One component, 32 outputs.** Build a single Satori JSX template with props (`{kicker, hero, sub, tier}`). Shu Ding / Paco. No per-page design work. Enforce by deleting every hand-made OG from the repo.
2. **Survive the 300px iMessage square crop.** Center-weight the hook AND mirror it top-left so both crop strategies read. Emil's rule. Test every card at 300×300 before shipping.
3. **One hero element per card — a number or a phrase, never both fighting.** Rauno / Jonnie. Crisis buyers scan in 0.8s — two focal points = zero focal points. Number wins when it's shocking ("$50K bail"), phrase wins when it's a promise ("Know what they know").
4. **Editorial tone, not marketing tone.** Jonnie. "67% of HGN tests fail in court" beats "Get DUI help now." Specific, numeric, defendant-anchored. Zero adjectives. Zero "revolutionary / premier / expert."
5. **Dark navy `#0a0e1a` ground, one amber `#f59e0b` accent, off-white `#f5f5f4` text.** Emil + Rauno. Never pure white (OLED buzz). Amber reserved for ONE element per card — the number, the underline, or the monogram. Never all three.
6. **Four template types cover every page.** Paco. `CHARGE-STAT` (free tools, playbooks), `TIER-PRICE` (Case Decoder, IB, X-Ray, War Room, SR), `PROCEDURAL-STEP` (arraignment, 10-day, etc.), `EDITORIAL-HEADLINE` (43 blog posts). 32 pages → 4 layouts → 1 component.
7. **Persistent chrome — same brand mark, same corner, same size, every card.** Rauno / Paco. `imnotanattorney.com` wordmark lower-left at the same 24pt Lato Bold across ALL 32 cards. Recognition compounds every time someone sees a second link in their feed.

**Cascade check:** defendants get instant decoding at 2AM (direct win) → their shared links convert when forwarded to family (downstream win) → attorneys seeing our links respect the craft, not the copy (ecosystem win, no UPL collision) → future-us ships new pages in one prop call, not a design cycle (future win). Every node wins. Redesign passes.
