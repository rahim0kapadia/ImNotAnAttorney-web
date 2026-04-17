# OG Image Production Audit — Elite Brand Patterns

**Date:** 2026-04-16
**Purpose:** Extract visual patterns from elite production OG cards to rebuild INAA's OG template (current attempt: sloppy word placement, weak composition).
**Method:** Fetched `og:image` meta tag from each site's live HTML, downloaded PNG/JPG, visually inspected at 1200x630.

---

## Raw Inventory (14 cards across 10 brands)

| Brand | Page | OG URL Pattern | Type |
|---|---|---|---|
| Linear | / | `linear.app/static/og/homepage.jpg` | Static (brand mark card) |
| Linear | /pricing | `/api/og/generic?title=Pricing` | Dynamic (templated) |
| Linear | /changelog/post | `webassets.linear.app/...1200x600.png` | Custom-illustrated per post |
| Vercel | / | Contentful CDN, static | Brand hero + tagline |
| Vercel | /docs/deployments | `/api/docs-og?title=...&category=...` | Dynamic docs template |
| Raycast | / | `/opengraph-image-pwu6ef.png` | Product screenshot composite |
| Stripe | / | `stripeassets.com/...Stripe.jpg` | Pure brand gradient + wordmark |
| Stripe | /blog/post | Contentful (`Social_image.png`) | Custom illustration per post |
| Resend | / | `/static/cover.png` | Product screenshot (code block) |
| Resend | /blog/custom-tracking | `cdn.resend.com/posts/*.jpg` | B-movie poster parody |
| Framer | / | `framerusercontent.com/...jpg` | Site-gallery mosaic |
| Notion | / | `/front-static/meta/custom-agents-og.png` | Illustrated + product name |
| Attio | / | `a.storyblok.com/...attio-og-image.jpg` | Split layout, headline + motif |
| Arc | / | `/og.png` | Bare logo mark on flat color |

---

## Per-Card Analysis

### 1. Linear — Home (`linear.app/static/og/homepage.jpg`)
- **Layout:** Centered. Mark + wordmark only. Subtle radial gradient top-right → center.
- **Type:** "Linear" at ~120px, single weight, no tagline.
- **Color:** 2 colors — near-black (#0a0a0a → #1a1a1a vignette) + white mark/text.
- **Focal:** Logo mark alone carries it. Gradient is a whisper, not decoration.
- **Density:** ~90% empty. Breathing room is the design.
- **Mobile:** Survives perfectly — one word, giant.
- **The ONE decision:** Total confidence. No tagline. The wordmark IS the message. Only a brand with established recognition earns this.

### 2. Linear — Pricing (`/api/og/generic?title=Pricing`)
- **Layout:** Centered. `[mark] | [page title]` horizontal, vertical divider rule between.
- **Type:** "Pricing" same scale as homepage wordmark. Thin vertical bar (1px) as separator.
- **Color:** Identical stack to homepage. Zero variation.
- **Focal:** The divider. It's 1px. It carries the entire sub-page concept.
- **Density:** Same as home — empty.
- **Mobile:** Title survives. "Pricing" legible at 300px crop.
- **The ONE decision:** The templating system is a function of the homepage. Same spacing, same color, same type — just swap the word. Consistency IS the asset.

### 3. Linear — Changelog Post (Microsoft Teams)
- **Layout:** Two rounded-square app icons + arrow glyphs between. NO TEXT.
- **Type:** Zero characters of copy.
- **Color:** Same black. 2 icons, 1 set of chevron arrows.
- **Focal:** Icon pair tells the integration story without words.
- **Density:** Sparse.
- **Mobile:** Icons at 300px still legible (large, centered).
- **The ONE decision:** For integrations, pictograms beat headlines. A defendant would find the equivalent move: use charge-icon + jurisdiction-mark rather than typing a headline.

### 4. Vercel — Home
- **Layout:** Top-left triangle logo. Bottom-left headline "What will you ship?"
- **Type:** Big sans, single-line question. Weight ~semibold.
- **Color:** Off-white base + prismatic gradient burst bottom-right (orange→pink→green→blue).
- **Focal:** The gradient bleed is the brand. Headline is tenant on borrowed land.
- **Density:** Logo top-left anchors, headline bottom-left anchors, color bottom-right — triangulated composition.
- **Mobile:** Headline survives because it's bottom-left, not centered.
- **The ONE decision:** Ask a question. "What will you ship?" is category-defining — it reframes Vercel from "deploys" to "momentum."

### 5. Vercel — Docs Page (dynamic)
- **Layout:** Logo top-left. Title + category pill bottom-left. Pure white bg.
- **Type:** "Deploying to Vercel" huge, thin pill underneath "DOCS | BUILD & DEPLOY."
- **Color:** Black + white + hairline pill border.
- **Focal:** The title. Pill is breadcrumb orientation only.
- **Density:** 70% whitespace — intentional.
- **Mobile:** Title wraps gracefully because left-aligned.
- **The ONE decision:** Left-align everything, no center gravity. Title is reading-order anchored, not logo-subordinated.

### 6. Raycast — Home
- **Layout:** Logo+wordmark top-center. Headline below. Product screenshot fills bottom 60%.
- **Type:** "Your shortcut to everything." mid-weight sans, ~70px.
- **Color:** Deep black bg + crimson radial halos + product UI chrome.
- **Focal:** The product window. The screenshot IS the pitch.
- **Density:** Packed — but composed: 30% headline zone / 70% product zone.
- **Mobile:** Headline + wordmark zone survives the top 1/3 crop.
- **The ONE decision:** Show the product, not a metaphor. At 1200x630 you can fit a readable UI.

### 7. Stripe — Home
- **Layout:** Centered wordmark only.
- **Type:** "stripe" at massive scale, custom bespoke letterforms.
- **Color:** Signature multi-color volumetric gradient (orange→pink→blue→purple).
- **Focal:** The gradient. Wordmark is a cutout in it.
- **Density:** Sparse — it's gradient + word.
- **Mobile:** Survives beautifully — the gradient is recognizable even cropped.
- **The ONE decision:** The gradient is a brand asset, not a decoration. Six years of consistent use means any rectangle of Stripe's color tells you who it is before you read a word.

### 8. Stripe — Blog Post
- **Layout:** Full-bleed illustrated globe with route-line connectors and icon pins (cart, bag, truck). No logo. No title text.
- **Type:** None. Illustration carries meaning.
- **Color:** Monochrome purple gradient + white line work.
- **Focal:** Globe hemisphere, slightly off-center.
- **Density:** Medium, but unified by single-color treatment.
- **Mobile:** Illustration readable because one dominant motif.
- **The ONE decision:** Blog posts get bespoke editorial illustration, not templated OG. A headline text layer would be redundant — the article title renders in the iMessage card below.

### 9. Resend — Home
- **Layout:** Logo top-center. Headline middle. Code editor screenshot bottom 60%.
- **Type:** "Email for Developers" serif (!), large, centered. Contrast with the ui mono in the code block.
- **Color:** Black + white text + subtle dev-env screenshot chrome.
- **Focal:** The code snippet. Implicit proof: "this is what you'll write."
- **Density:** Packed bottom-weighted.
- **Mobile:** "Email for Developers" survives; code unreadable but visually signals "tech."
- **The ONE decision:** Serif headline + code block. Two typographic registers = this isn't generic SaaS.

### 10. Resend — Blog Post (Custom Tracking Domain)
- **Layout:** Full-bleed B-movie poster parody. Hot pink field. Yellow slab display type. Fake film-company cartouches in corners.
- **Type:** Custom 3D cinematic lettering, the headline IS illustration.
- **Color:** 3 colors — hot pink / yellow / forest green. Loud.
- **Focal:** The title treatment.
- **Density:** Packed but themed — every element obeys the "1980s B-movie" conceit.
- **Mobile:** Titles readable at thumbnail because they're shaped, not typeset.
- **The ONE decision:** Commit to a thematic conceit per post. Generic text-over-gradient = invisible. A title that "is" a visual object = shareable.

### 11. Framer — Home
- **Layout:** 5-column mosaic of site thumbnails, center tile is the Framer logo on black.
- **Type:** None (titles appear inside the thumbnail sites themselves).
- **Color:** Every color — but framed by the black center tile.
- **Focal:** Center logo pulls the eye from chaos.
- **Density:** Maximum. Mosaic = "look at all the sites built here."
- **Mobile:** Center logo survives; outer tiles blur into texture.
- **The ONE decision:** Proof via density. You cannot argue with 11 sites on one card.

### 12. Notion — Home (Custom Agents campaign)
- **Layout:** Centered headline + logo. Four cartoon "agent" characters on cables in each corner — spotlight treatment.
- **Type:** "Your 24/7 AI team" + "Notion" logo. ~90px headline, ~50px mark.
- **Color:** Midnight navy + white text + ~4 accent colors from characters. Disciplined.
- **Focal:** Headline. Characters are supporting cast.
- **Density:** High but symmetrical (2 top corners, 2 bottom corners).
- **Mobile:** Headline survives. Characters become decorative confetti at thumb crop.
- **The ONE decision:** Corner anchors. Four characters create a visual frame without competing with the headline.

### 13. Attio — Home
- **Layout:** Left-aligned bottom headline, top-right chevron hexagon motif, bottom-right logo.
- **Type:** "Customer / Relationship / Magic." stacked, two weights (black for "Customer", grey for "Relationship Magic"). Period terminates.
- **Color:** Near-white bg + 2 shades of black/grey + hairline grid ghost in background.
- **Focal:** The word "Customer." Everything else supports.
- **Density:** Engineered — every element sits on an invisible grid.
- **Mobile:** Top word survives, period anchors closure.
- **The ONE decision:** Weight contrast (black vs grey) inside ONE headline replaces needing a separate subtitle. Two typographic voices, one block.

### 14. Arc — Home
- **Layout:** Centered logo. No text.
- **Type:** None.
- **Color:** Solid dusty rose + blue/red logo mark.
- **Focal:** Logo mark in soft halo.
- **Density:** Minimal.
- **Mobile:** Perfect.
- **The ONE decision:** Color alone is the brand. Dusty rose = Arc. No one else uses it.

---

## Common Patterns (What Elite OG Cards Do)

1. **One brand element earns ~70% of the visual weight.** Either the wordmark (Linear, Stripe, Arc), the headline (Vercel, Attio), or the product (Raycast, Resend). There is no "logo + headline + subtitle + CTA + stat + pattern" stack. One hero.

2. **Anchored left OR centered — never floating mid-space.** Vercel/Attio left-align. Linear/Stripe/Arc/Notion center. No card has title at 32% from top or 41% from left. Composition sits on a grid.

3. **Weight contrast replaces subtitles.** Attio shows this best: "Customer" (black) vs "Relationship Magic" (grey) = hierarchy without adding a separate subtitle line. Two weights, one block.

4. **Color stack is 2–3 colors max (or one big gradient treated as a single asset).** Stripe's gradient counts as one color because it's unified. Notion uses 4 accents but they're confined to corners. NO card uses 5+ competing colors in the hero zone.

5. **Whitespace > information density.** Every elite card could pack more in. None do. Linear, Arc, Vercel-docs are ~70–90% empty.

6. **Mobile-crop survival is engineered.** The title/mark/motif lives in the center-crop-safe zone (approximately 630x630 centered on the 1200x630 canvas). Nothing critical sits in the outer 285px on either side.

7. **Templated cards for sub-pages swap ONE variable, nothing else.** Linear's `/api/og/generic?title=X` changes only the word. Vercel's docs-og changes only title + category pill. Sub-pages don't redesign the card — they're instances of the same function.

---

## Anti-Patterns (What Elite Cards Avoid — What INAA's Current Card Likely Does)

- **Multi-line headlines with mid-size subtitles.** Kills visual hierarchy. If you need to say two things, use weight contrast within ONE line (Attio) or one line + small orientation pill (Vercel docs).
- **Logo + headline + tagline + CTA + stat + pattern overlay.** Too many elements = none are hero.
- **Centered text over full-bleed background pattern.** Pattern competes with text; both lose. Either pattern (Stripe) OR text (Linear) wins.
- **Accent color used 4+ places.** Elite cards put the accent in ONE place: wordmark glow, pill border, or tiny motif. Amber should appear 1–2 times max.
- **Floating elements without grid anchoring.** "Centered-ish" reads as sloppy. Either dead-center or hard-left-aligned.
- **Body-text-sized copy.** If a word needs to be smaller than ~60px to fit, cut it. Anything under 40px is invisible at iMessage thumbnail.
- **Gradient borders + drop shadows + glows stacked.** Pick one: gradient OR shadow OR glow. Elite cards almost never stack effects.

---

## Category-Defining at 300px Thumbnail Scale

At a 300px iMessage preview crop, only three things can survive:

1. **A single word or 2–3 word phrase in giant type.** Linear "Pricing", Vercel "Deploying to Vercel", Attio "Customer."
2. **A recognizable color/gradient.** Stripe gradient, Arc dusty rose.
3. **A single centered logo mark.** Linear home, Arc, Notion.

If your card fails at 300px, it fails. Test early.

---

## Specific Direction for ImNotAnAttorney

**Brand constraints:** Dark mode, amber (#f59e0b) + navy (#1E3A8A) on black, Playfair Display (display) + Lato (body). Crisis-stage criminal defendant audience. Needs to feel authoritative, calm, and NOT like a lawyer ad. Most OG impressions happen when someone shares a blog post in iMessage at 2 AM.

### Template Spec

**Canvas:** 1200x630, background `#0a0a0a` (not pure black — Linear's move; a single degree of warmth prevents JPEG compression banding).

**Layout:** Left-aligned, Vercel-docs-style. Reading-order primary. No centering.

- **Top-left, 80px from edges:** INAA wordmark in Playfair Display, 48px, color `#f5f5f5` (off-white, not pure). Small amber underline rule 2px × 48px wide immediately beneath the wordmark — this is the ONLY place amber appears on generic cards.
- **Bottom-left, 80px from left edge, 100px from bottom:** Page title in Playfair Display Black/900, 88px for 1-line titles, 72px for 2-line titles, max 2 lines. Color `#ffffff`.
- **Below title, 24px gap:** Orientation pill (Vercel style), 1px hairline border `#2a2a2a`, uppercase Lato 14px, color `#a3a3a3`, text = section label ("PLAYBOOK" / "CASE DECODER" / "BLOG" / "INTELLIGENCE BRIEF" / "X-RAY").
- **Right side:** Left empty except for ONE of two motifs (rotate per card type):
  - *Blog posts:* A single hairline rule drawn from upper-right into the mid-right, with a 1px amber terminator dot — the "trap-and-track" visual metaphor, abstracted.
  - *Product pages:* A faint navy→black radial gradient in the lower-right quadrant, ~30% opacity. Whisper only.
- **Never:** Stat lines. Lists. Multi-paragraph descriptions. Photos of gavels/courts. Multiple weights of amber.

### Type Stack

| Element | Family | Weight | Size | Color |
|---|---|---|---|---|
| Wordmark | Playfair Display | Regular 400 | 48px | `#f5f5f5` |
| Title (1-line) | Playfair Display | Black 900 | 88px | `#ffffff` |
| Title (2-line) | Playfair Display | Black 900 | 72px | `#ffffff` |
| Section pill | Lato | Bold 700 uppercase, tracking 0.1em | 14px | `#a3a3a3` |

Weight contrast for subtitles (Attio move): if the title needs a qualifier, render it in Playfair Display **Regular 400 italic** at same size, grey (`#737373`). One stacked block, two voices, no extra line.

### Color Stack (disciplined)

- Background `#0a0a0a`
- Primary text `#ffffff`
- Secondary text `#a3a3a3`
- Accent amber `#f59e0b` — **exactly one use per card**: the 2px rule under the wordmark OR the single amber terminator dot on the motif rule, never both.
- Navy `#1E3A8A` — reserved for the lower-right radial gradient whisper on product cards only.

### Should the card include a stat line?

**No.** Stats belong on the page, not on the card. Elite cards do not put "33,000+ cases analyzed" on the OG. The card exists to earn the click; the stat earns trust after the click. The only exception: a single custom-illustrated card for a hero page where the stat IS the headline ("53% of cited case law is bad law" in 88px type = the card).

### Full-bleed vs. contained?

**Contained.** Full-bleed backgrounds (Stripe, Resend-blog) work for brands where the color IS the brand. INAA doesn't have that earned equity yet. Contained layout with deep black field reads as "serious, technical, not a lawyer ad" — which is exactly the position.

### Should we use the brand mark?

**Yes, but small.** Top-left at 48px. Never centered, never the hero. You aren't Linear or Arc. The mark earns back its size after product recognition does.

### Wireframe

```
+---------------------------------------------------------------+
|  [Playfair 48px]                                              |
|  ImNotAnAttorney                                              |
|  ████ (2px amber, 48px wide)                                  |
|                                                               |
|                                                               |
|                                     •——————————————           |
|                                    (hairline + amber dot)     |
|                                                               |
|                                                               |
|  [Playfair Black 88px]                                        |
|  Know What They Know                                          |
|                                                               |
|  [ BLOG ]  <- 14px pill, hairline border, uppercase           |
|                                                               |
+---------------------------------------------------------------+
```

For a 2-line title (e.g. "Your attorney forgot / to file that motion"):

```
+---------------------------------------------------------------+
|  ImNotAnAttorney                                              |
|  ████                                                         |
|                                                               |
|                                     •————————                 |
|                                                               |
|                                                               |
|  [72px]                                                       |
|  Your attorney forgot                                         |
|  to file that motion                                          |
|                                                               |
|  [ PLAYBOOK ]                                                 |
|                                                               |
+---------------------------------------------------------------+
```

### Dynamic Template Implementation

Build **one** `/api/og` route that takes `?title=X&section=Y` and renders this layout via Satori (or Vercel OG). Every page's OG is a call to this route with different params. Never hand-author cards except for 2–3 flagship "custom illustration" pieces (hero blog posts, pricing page).

This matches Linear's `/api/og/generic?title=Pricing&v=3` and Vercel's `/api/docs-og?title=X`. One function, infinite instances, zero drift.

---

## References (for designer)

Raw OG images cached at `C:\Users\email\AppData\Local\Temp\og-audit\` during audit:
- `linear.jpg`, `linear-pricing.png`, `linear-post.png`
- `vercel.png`, `vercel-doc.png`
- `raycast.png`
- `stripe.jpg`, `stripe-post.png`
- `resend.png`, `resend-post.jpg`
- `framer.jpg`, `notion.png`, `attio.jpg`, `arc.png`

---

**Bottom line:** the "sloppy" feedback on INAA's current card almost certainly traces to competing elements without a single hero. Fix = left-align everything, pick ONE hero (the page title), limit amber to exactly one stroke, drop the card into a templated route so every future page inherits the discipline automatically.
