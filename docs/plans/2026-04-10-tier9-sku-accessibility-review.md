# Accessibility Review: Tier 9 Standalone SKU Pages

**Date:** 2026-04-10
**Reviewer:** accessibility-agents:accessibility-lead
**Status:** Pre-implementation review complete. 2 critical, 3 major, 3 minor findings.
**Applies to:** `/judge-report-card`, `/officer-background-check`, `/similar-cases-analyzer`

## Critical (must resolve before writing code)

### 1. Navy (#1E3A8A) banned as text color
- **WCAG 1.4.3**, Navy on #0a0a0a = 2.1:1 contrast (fails AA for all text sizes)
- **Rule:** Navy is background/accent ONLY, never text. All text must use: #ededed (body), #a1a1aa (muted), #d4d4d8 (emphasis), #fbbf24/#f59e0b (amber accent)
- **Enforcement:** Check every Tailwind class, no `text-blue-*` or `text-[#1E3A8A]`

### 2. Sample report: dual presentation required
- **WCAG 1.1.1**, Screenshot of a data table is an image of structured info. Alt text can't convey tabular data.
- **Rule:** Every sample report section must have BOTH:
  1. `<figure>` with `<img>` + descriptive alt text (1+ sentence describing the data shown)
  2. Accessible HTML `<table>` with 3-4 sample rows, `<caption>`, `<th scope="col">`, `<th scope="row">`
- **Why:** Primary conversion element, blind users can't evaluate the product without the data. Also better for SEO (crawlable structured content).

## Major (built-in requirements)

### 3. Form inputs need full accessibility treatment
- visible `<label>` with `htmlFor` matching input `id`
- `required` + `aria-required="true"` on required fields
- `aria-invalid="true"` when validation fails
- Error messages with unique `id`, linked via `aria-describedby`
- Error announcements via `role="alert"` or `aria-live="polite"`
- `autocomplete="name"` on judge/officer name inputs
- Similar Cases page: `<fieldset>` + `<legend>` for grouped charge+state inputs
- **Pattern to copy:** checkout page lines 112-138

### 4. Heading hierarchy
- One `<h1>` per page (product name in hero)
- `<h2>` for each section: What You Get, Sample Report, Trust, FAQ, CTA
- No skipped levels. Price display is `<p>`, not a heading.

### 5. Section landmarks
- Each major block: `<section aria-labelledby="section-heading-id">`
- NO duplicate `<main>`, layout already provides it
- Page wrapper is a plain `<div>`, not a landmark

## Minor

### 6. Standardize focus styles
- Use `focus-visible:outline` pattern (not `focus:ring`) for new inputs
- Global CSS already provides 2px amber-400 outline (11.2:1 contrast)

### 7. FAQ accordion
- Reuse existing `FAQAccordion` component (already accessible: aria-expanded, aria-controls, region, labelledby)
- Optional: add `inert` to collapsed panels

### 8. Dark-mode selects
- Any new `<select>` elements must use dark background (`bg-zinc-900`) to match dark-mode-only constraint

## Reusable Components (already accessible)

| Component | Source | Why it works |
|---|---|---|
| FAQAccordion | `src/components/FAQAccordion.tsx` | Full ARIA accordion pattern |
| TrustBadges | `src/components/TrustBadges.tsx` | Icons aria-hidden, text accessible |
| FadeInUp | `src/components/motion/FadeInUp.tsx` | Respects prefers-reduced-motion |
| LeadCapture | `src/components/LeadCapture.tsx` | aria-label on input (visible label preferred for new pages) |
| Skip link | `src/app/layout.tsx:112-117` | sr-only until focused |
| Focus-visible | `src/app/globals.css:49-52` | 2px amber-400, 11.2:1 contrast |
| Mobile menu | `src/components/Header.tsx` | Focus trap, Escape, aria-expanded, focus return |

## Patterns to Avoid (existing issues to not replicate)

| Issue | Location | Do instead |
|---|---|---|
| White bg email input | checkout `bg-white` | Use `bg-zinc-950` or `bg-zinc-800` |
| Inconsistent focus styles | checkout mixes `focus:ring` and `focus-visible:outline` | Standardize on `focus-visible:outline` |
| Missing `aria-busy` on submit | checkout main CTA | Always include `aria-busy={loading}` |

## Implementation Checklist (40 items)

### Page Structure
- [ ] Page `<title>` via `generateMetadata` ("Judge Report Card | ImNotAnAttorney")
- [ ] Single `<h1>`, product name in hero
- [ ] H1 > H2 hierarchy, no skipped levels
- [ ] Each section: `<section aria-labelledby="...">`
- [ ] No duplicate `<main>` inside page component
- [ ] BreadcrumbList + FAQPage JSON-LD schema

### Color
- [ ] Navy NOT used as text color
- [ ] All text on #0a0a0a uses passing colors only
- [ ] Price display uses amber-400/500 (8.5:1+)
- [ ] No info conveyed by color alone (use text + color)
- [ ] CTA: black text on amber-500 (8.5:1)
- [ ] Disabled: `opacity-60` + `cursor-not-allowed` + `disabled` attr

### Sample Report
- [ ] `<figure>` with `<img>` + descriptive alt (1+ sentence)
- [ ] HTML `<table>` with sample rows below image
- [ ] `<caption>` on table
- [ ] `<th scope="col">` for column headers
- [ ] `next/image` with explicit width/height
- [ ] `loading="lazy"` (below fold)

### Forms
- [ ] Visible `<label>` + `htmlFor` on every input
- [ ] `required` + `aria-required="true"`
- [ ] `aria-invalid` + `aria-describedby` for errors
- [ ] Error messages via `role="alert"`
- [ ] `autocomplete="name"` on name inputs
- [ ] Default empty `<option>` on selects
- [ ] `<fieldset>` + `<legend>` on Similar Cases grouped inputs
- [ ] Submit button: `aria-busy={loading}` + text change
- [ ] Focus moves to first error on validation failure

### Keyboard & Focus
- [ ] All interactive elements Tab-reachable
- [ ] Tab order matches visual layout
- [ ] No positive `tabindex`
- [ ] Focus indicators visible (global CSS)

### Motion & Performance
- [ ] New animations check `prefers-reduced-motion`
- [ ] No auto-playing media
- [ ] No CLS from late-loading images

### Links
- [ ] CTA describes destination: "Get Your Judge Report Card, $197"
- [ ] External links: `<span class="sr-only">(opens in new tab)</span>`
- [ ] No "Click here" without context

### Live Regions
- [ ] Form success/error via `role="alert"`
- [ ] Loading states via `aria-busy`

### Content
- [ ] UPL disclaimer present
- [ ] Icons `aria-hidden="true"` when adjacent to text
- [ ] Decorative elements: `aria-hidden` or empty `alt=""`
