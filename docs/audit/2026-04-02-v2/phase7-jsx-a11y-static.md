# Phase 7 — JSX Accessibility Static Analysis
**Date:** 2026-04-02
**Scan mode:** Static (eslint-plugin-jsx-a11y recommended ruleset + targeted grep verification)
**Standards:** WCAG 2.1 Level AA
**Scope:** All `.tsx` files in `src/` — 71 app files + 42 component files = 113 total
**Tool:** `eslint-plugin-jsx-a11y` v6 flat config + manual grep for 14 pattern categories

---

## Executive Summary

| Severity | Count | Category |
|----------|-------|----------|
| Serious  | 14    | Missing label/htmlFor association (form controls) |
| Serious  | 3     | autoFocus on public-facing login forms |
| Moderate | 3     | autoFocus on internal admin/operator tools |
| Moderate | 1     | Non-interactive `<span>` with onClick (no keyboard handler) |
| **Total real issues** | **21** | — |

**Passing (confirmed clean):**
- `<img>` alt text — all images have alt attributes
- tabIndex > 0 — none found
- `lang` attribute — `<html lang="en">` present in `src/app/layout.tsx`
- `href="#"` anchors — none found
- `aria-hidden` on focusable elements — none found
- Missing button type — all `<button>` elements have explicit `type=`

---

## Specific Verifications

| Check | File | Result |
|-------|------|--------|
| All 7 fields have htmlFor/id pairs | `PartnerApplicationForm.tsx` | PASS — all 7 fields correctly wired |
| fieldset/legend/role/aria-checked | `IntakeChargeQuestions.tsx` | PASS — full ARIA pattern present |
| No `<main>` tag | `src/app/page.tsx` | PASS — root layout provides `<main>`, page.tsx has none |
| Buttons have aria-pressed | `DiscoveryGate.tsx` | PASS — `aria-pressed` on both filter buttons |
| Heading hierarchy h1 → h2 | `src/app/score/page.tsx` | PASS — h1 at line 1053, h2 at line 530 (results section), h3s under h2 |

---

## Findings

---

### F-01 — Missing htmlFor/id on form labels
**Rule:** `jsx-a11y/label-has-associated-control`
**Severity:** Serious (WCAG 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value)
**ESLint errors:** 14 instances across 4 files

Labels wrap or precede inputs but lack the `htmlFor`/`id` pairing that screen readers require to announce which field a label belongs to.

#### `src/app/admin/partners/page.tsx` — 7 labels (lines 452, 464, 475, 487, 496, 508, 520)
Admin "Create New Partner" form. All 7 labels are unwrapped `<label>` tags with no `htmlFor`:
```tsx
// Line 452 — BROKEN
<label className="block text-sm text-zinc-400 mb-1">Name *</label>
<input type="text" value={formName} ... />

// FIX
<label htmlFor="admin-partner-name" className="block text-sm text-zinc-400 mb-1">Name *</label>
<input id="admin-partner-name" type="text" value={formName} ... />
```
Affects fields: Name, Company, Email, Phone, Region, Promo Code, Notes.

#### `src/app/partner/dashboard/page.tsx` — 4 labels (lines 346, 363, 378, 393)
"Payment Settings" form — Preferred Payment Method, Zelle Email, Venmo Handle, Mailing Address:
```tsx
// Line 346 — BROKEN
<label className="block text-sm text-zinc-400 mb-1">Preferred Payment Method</label>
<select value={payMethod} ...>

// FIX
<label htmlFor="pay-method" ...>Preferred Payment Method</label>
<select id="pay-method" value={payMethod} ...>
```

#### `src/app/intake/page.tsx` — 2 labels (lines 1091, 1228)
Intake form step 1. Both are group headings for checkbox lists — the pattern uses `<label className={labelClass}>` as a heading text above a `div` of checkboxes. These are semantic group labels, not single-control labels. Fix: use `<p>` or `<legend>` within a `<fieldset>` instead:
```tsx
// Line 1091 — BROKEN (label not associated to any single control)
<label className={labelClass}>How did law enforcement get involved?</label>
<div className="mt-2 space-y-2">
  {arrestCircumstances.map((circ) => (
    <label key={circ} className="flex items-center gap-3 ...">
      <input type="checkbox" ... />
      {circ}
    </label>
  ))}
</div>

// FIX — use fieldset+legend for checkbox groups
<fieldset className="border-0 p-0 m-0 mt-4">
  <legend className={labelClass}>How did law enforcement get involved?</legend>
  <div className="mt-2 space-y-2">
    {arrestCircumstances.map((circ) => (
      <label key={circ} className="flex items-center gap-3 ...">
        <input type="checkbox" ... />{circ}
      </label>
    ))}
  </div>
</fieldset>
```
Same pattern applies to line 1228 (evidence type checkboxes).

#### `src/app/my-cases/login/page.tsx` — 1 label (line 80)
```tsx
// BROKEN
<label className="block text-sm text-zinc-400 mb-1">Email address</label>
<input type="email" ... autoFocus />

// FIX
<label htmlFor="my-cases-email" ...>Email address</label>
<input id="my-cases-email" type="email" ... />
```

#### `src/app/partner/login/page.tsx` — 1 label (line 83)
Same pattern as my-cases login:
```tsx
// FIX
<label htmlFor="partner-login-email" ...>Email address</label>
<input id="partner-login-email" type="email" ... />
```

---

### F-02 — autoFocus on public-facing login inputs
**Rule:** `jsx-a11y/no-autofocus`
**Severity:** Serious (WCAG 3.2.1 On Focus — screen readers may miss content before the focused element)
**Files:** `src/app/my-cases/login/page.tsx` line 87, `src/app/partner/login/page.tsx` line 90

Both login pages use `autoFocus` on the email input. For public-facing pages this is disorienting for screen reader users — focus jumps to the input before the user has heard the page heading and instructions.

```tsx
// BROKEN — both login pages
<input type="email" ... autoFocus />

// FIX — remove autoFocus; the form is the only content on the page,
// users will tab to it naturally. If UX requires early focus, use useEffect:
const inputRef = useRef<HTMLInputElement>(null);
useEffect(() => { inputRef.current?.focus(); }, []);
// <input ref={inputRef} type="email" ... />
// useEffect focus fires after the screen reader has read the page heading
```

---

### F-03 — autoFocus on admin/operator inputs
**Rule:** `jsx-a11y/no-autofocus`
**Severity:** Moderate (admin-only pages — lower user impact, same technical violation)
**Files:**
- `src/app/admin/demand/page.tsx` line 266 — password gate input
- `src/app/admin/inbox/page.tsx` lines 189, 391 — search/reply inputs
- `src/components/OperatorShell.tsx` line 104 — search input

Admin tools with `autoFocus` are lower priority than public-facing pages. The password gate at `admin/demand` is the most benign case — it is the only control on the screen. The inbox reply field (line 391) is the most disorienting — focus jumps into a textarea mid-page when the reply panel opens.

**Fix for inbox reply (line 391):** Remove `autoFocus`; use `useEffect` + ref triggered by panel-open state so the screen reader announces the panel before focus moves.

---

### F-04 — Non-interactive `<span>` with onClick, no keyboard handler
**Rule:** `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions`
**Severity:** Moderate (WCAG 2.1.1 Keyboard)
**File:** `src/components/IntakeChargeSelector.tsx` line 171

A `<span>` wrapping the free-text input uses `onClick` solely to stop propagation so clicks on the input do not bubble to the parent radio button. The linter flags the `<span>` as a non-interactive element with a click handler.

```tsx
// Line 171 — FLAGGED
<span
  className="mt-2 block"
  onClick={(e) => e.stopPropagation()}
>
  <input ... aria-label="Describe your charge" />
</span>

// FIX — add role="presentation" + onKeyDown to satisfy the rule,
// or replace with a div (equally non-semantic but avoids the violation):
<div
  className="mt-2"
  onClick={(e) => e.stopPropagation()}
  onKeyDown={(e) => e.stopPropagation()}
  role="presentation"
>
  <input ... aria-label="Describe your charge" />
</div>
```
Note: The `<input>` inside already has `aria-label` — the only issue is the wrapper element.

---

### F-05 — Checkout wrapping labels lack accessible text (ESLint false positives)
**Rule:** `jsx-a11y/label-has-associated-control` (variant: "must have accessible text")
**Severity:** None — false positives
**File:** `src/app/checkout/page.tsx` lines 735, 747, 983

Lines 735 and 747 are wrapping `<label>` elements that contain `<input type="radio">` and a `<div>` with a `<span>` for the label text. ESLint's static analysis cannot see inside the child `<div>` — the text is present in the DOM. These are correctly implemented wrapping labels.

Line 983 is a wrapping `<label>` for a checkbox with text in a child `<div>` — same pattern.

**Verdict:** No fix needed for WCAG compliance. Optional ESLint suppression:
```tsx
{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
<label className="flex cursor-pointer items-center gap-3 ...">
```

---

## Passing Checks (Confirmed Clean)

### `<img>` alt text
No bare `<img>` tags missing `alt` found. Next.js `<Image>` components all have `alt` props.

### tabIndex > 0
No positive tabindex values anywhere in the codebase.

### lang attribute
`src/app/layout.tsx` line 107: `<html lang="en" className="dark">` — correct.

### href="#" anchors
None found. All `<a>` tags use real hrefs or Next.js `<Link>`.

### aria-hidden on focusable elements
No instances of `aria-hidden` combined with focusable children.

### Missing button type attribute
All `<button>` elements have explicit `type="button"`, `type="submit"`, or `type="reset"`. No typeless buttons.

### IntakeChargeSelector.tsx keyboard handling
The free-text `<span onClick>` is the only flagged item. The charge buttons at lines 116–154 correctly implement `role="radio"`, `aria-checked`, `tabIndex` roving, and `onKeyDown` — full keyboard navigation is present.

### PartnerApplicationForm.tsx — all 7 fields
All 7 fields (name, company, email, phone, region, heardAboutUs, message) have matching `htmlFor`/`id` pairs. PASS.

### IntakeChargeQuestions.tsx — ARIA radio group pattern
`<fieldset role="radiogroup">`, `<legend>`, `<button role="radio" aria-checked={isSelected}>` — all present. PASS.

### app/page.tsx — no `<main>` tag
Confirmed: `src/app/page.tsx` contains no `<main>` element. Root layout at `src/app/layout.tsx` provides the `<main>` wrapper. PASS.

### DiscoveryGate.tsx — aria-pressed
Lines 49 and 60 both have `aria-pressed={filter === "..."}` on the filter buttons. PASS.

### score/page.tsx — heading hierarchy
- `h1` at line 1053 (page title)
- `h2` at line 530 (results observations heading)
- `h3` at lines 604, 712, 765, 801 (sub-sections under h2)

Hierarchy is h1 → h2 → h3. PASS.

---

## Prioritized Fix Order

| Priority | Finding | Files | Effort |
|----------|---------|-------|--------|
| 1 | F-01 label/htmlFor — public login pages | `my-cases/login/page.tsx`, `partner/login/page.tsx` | 10 min |
| 2 | F-02 autoFocus — public login pages | `my-cases/login/page.tsx`, `partner/login/page.tsx` | 5 min |
| 3 | F-01 label/htmlFor — intake checkbox groups | `intake/page.tsx` (2 groups) | 20 min |
| 4 | F-01 label/htmlFor — admin partner create form | `admin/partners/page.tsx` (7 fields) | 15 min |
| 5 | F-01 label/htmlFor — partner dashboard settings | `partner/dashboard/page.tsx` (4 fields) | 10 min |
| 6 | F-04 span onClick wrapper | `IntakeChargeSelector.tsx` | 5 min |
| 7 | F-03 autoFocus — admin tools | `admin/demand`, `admin/inbox`, `OperatorShell` | 15 min |
| — | F-05 checkout wrapping labels | `checkout/page.tsx` | False positives — no fix needed |

**Estimated total fix time:** ~80 minutes for all real issues (priorities 1–7).

---

## ESLint Run Log

```
Tool:    eslint-plugin-jsx-a11y (recommended flat config)
Config:  eslint.a11y.mjs (temporary file, can be deleted)
Command: npx eslint --config eslint.a11y.mjs src/
Raw output: 29 errors total
  - 2 unrelated (react-hooks/exhaustive-deps, @next/next rules bleeding through)
  - 3 false positives (checkout wrapping labels — F-05)
  - 24 real jsx-a11y violations (mapped to F-01 through F-04 above)
```

---

*Report generated via static grep + eslint-plugin-jsx-a11y scan. A runtime axe-core scan (Phase 7b) would catch additional dynamic issues not visible statically (color contrast, focus order, live region announcements).*
