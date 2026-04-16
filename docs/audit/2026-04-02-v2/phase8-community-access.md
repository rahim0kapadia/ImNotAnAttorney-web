# Phase 8, Deep-Dive Accessibility Investigation
**Date:** 2026-04-02
**Scope:** Violation-by-violation source trace from Phase 3 (axe-core), cross-referenced with Phase 7 (jsx-a11y static)
**Standards:** WCAG 2.1 Level AA
**Method:** Source code read, selector reconciliation, cross-report pattern analysis
**Input reports:** `phase3-axe-runtime.md`, `phase7-jsx-a11y-static.md`
**Note:** `phase2-accesslint.md` referenced in the brief does not exist in this audit directory, skipped.

---

## Executive Summary

| Severity | Findings | Source |
|----------|----------|------, |
| Serious  | 1, Scrollable region not keyboard-focusable | axe-core /sample |
| Serious  | 1, Links distinguished by color only (7 nodes) | axe-core /research |
| Serious  | 14, Missing label/htmlFor on form controls | jsx-a11y (4 files) |
| Serious  | 3, autoFocus on public-facing login inputs | jsx-a11y (2 files) |
| Moderate | 1, Duplicate `<main>` landmark (3 violations per page × 4 pages) | axe-core |
| Moderate | 1, Non-interactive `<span>` with onClick | jsx-a11y |
| Moderate | 3, autoFocus on admin/operator inputs | jsx-a11y (3 files) |

**Root-cause pattern:** The duplicate `<main>` is systemic, the same structural error is in 4 page files. The `hover:underline` link pattern is a site-wide convention that violates WCAG 1.4.1. Both are engine-level fixes (shared convention), not per-page patches.

---

## Violation 1, Duplicate `<main>` Landmark
**axe-core rules:** `landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique`
**Severity:** MODERATE
**Pages affected:** /services, /playbooks, /score, /start

### Root Cause

`src/app/layout.tsx` line 173 wraps all page children in `<main id="main-content" className="min-h-screen">`. Four page components additionally return a `<main>` as their root element, producing a nested `<main>` inside a `<main>`.

```tsx
// layout.tsx line 173, the outer main (correct, owns id="main-content")
<main id="main-content" className="min-h-screen">{children}</main>
```

### Per-File Findings

#### `/services`, `src/app/services/page.tsx` line 325
```tsx
// line 325, INNER <main> (wrong, should be <div>)
<main className="px-4 py-16">
```
axe-core target: `.py-16` (the className on this element). The nested `<main>` fires all three rules: `landmark-main-is-top-level` (inner main is not top-level), `landmark-no-duplicate-main` (two mains exist), `landmark-unique` (both mains are unlabeled).

#### `/playbooks`, `src/app/playbooks/page.tsx` line 120
```tsx
// line 120, INNER <main> (wrong, should be <div>)
<main className="min-h-screen bg-zinc-950">
```
axe-core target: `#main-content > main` (the child main directly inside the outer main). Same three rule violations.

#### `/score`, `src/app/score/page.tsx` line 1037
```tsx
// line 1037, INNER <main> (wrong, should be <div>)
<main className="px-4 py-16">
```
axe-core target: `.py-16`. Three rule violations.

#### `/start`, `src/app/start/page.tsx`
Two `<main>` elements in this file: the `CrisisHero` component at **line 44** and the `StartContent` return at **line 119**. The `StartPage` fallback at **line 363** also uses `<main>`. Only one renders at a time, but all are wrong when rendered.
```tsx
// line 44, CrisisHero inner <main>
<main className="min-h-screen bg-zinc-950">

// line 119, StartContent inner <main>
<main className="min-h-screen bg-zinc-950">

// line 363, Suspense fallback inner <main>
<main className="flex min-h-screen items-center justify-center bg-zinc-950">
```
axe-core target: `#main-content > main`. Three rule violations when StartContent renders.

### Fix

Change every inner `<main>` to `<div>` with matching className. The outer `<main id="main-content">` in `layout.tsx` is the correct single landmark, do not touch it.

| File | Line(s) | Change |
|------|---------|------, |
| `src/app/services/page.tsx` | 325, closing tag | `<main` → `<div`, `</main>` → `</div>` |
| `src/app/playbooks/page.tsx` | 120, closing tag | same |
| `src/app/score/page.tsx` | 1037, closing tag | same |
| `src/app/start/page.tsx` | 44, 119, 363 + closing tags | same (all three render sites) |

**Effort:** ~10 minutes across all 4 files.
**Verification:** After fix, `landmark-no-duplicate-main` must not fire on any of these pages in a re-run of axe-core.

---

## Violation 2, Scrollable Region Not Keyboard-Focusable
**axe-core rule:** `scrollable-region-focusable`
**Severity:** SERIOUS (WCAG 2.1.1 Keyboard)
**Page:** /sample
**axe-core target:** `section:nth-child(4) > .overflow-x-auto.mt-4`

### Root Cause

`src/app/sample/page.tsx` line **176**, the "Where Things Stand" section wraps a wide table in a scrollable `<div>`:

```tsx
// line 176, UNFOCUSABLE SCROLLABLE REGION
<div className="mt-4 overflow-x-auto">
  <table className="w-full text-sm">
    ...4-column table (Area / What You Told Us / What to Ask About / Priority Qs)...
  </table>
</div>
```

The table is wide enough to scroll horizontally on narrow viewports. Keyboard users have no way to reach the scrollable container because it has no `tabIndex`. Without `tabIndex={0}`, keyboard users cannot scroll the table with arrow keys, the content is inaccessible.

Two additional `overflow-x-auto` containers exist in the same file at lines 300 and 607. The axe-core selector `section:nth-child(4)` identifies the 4th direct-child element of the report container (line 122). Counting all direct children: the "Where Things Stand" section at line 167 is child 4 after the report-header div (child 1), methodology div (child 2), and first `SectionDivider` div (child 3). **The flagged container is line 176.**

The table containers at lines 300 and 607 may also need the same fix, they contain tables of similar column density. All three should be treated identically.

### Fix

Add `tabIndex={0}`, `role="region"`, and `aria-label` to every `overflow-x-auto` table container in this file:

```tsx
// line 176, FIX
<div
  className="mt-4 overflow-x-auto"
  tabIndex={0}
  role="region"
  aria-label="Case status overview table"
>

// line 300, FIX
<div
  className="mt-4 overflow-x-auto"
  tabIndex={0}
  role="region"
  aria-label="Prosecution elements table"
>

// line 607, FIX
<div
  className="mt-4 overflow-x-auto"
  tabIndex={0}
  role="region"
  aria-label="7-day action plan table"
>
```

**Effort:** ~5 minutes.
**Verification:** After fix, keyboard-tab to each container, confirm it receives focus, confirm arrow keys scroll the table.

---

## Violation 3, Links Distinguished by Color Only
**axe-core rule:** `link-in-text-block`
**Severity:** SERIOUS (WCAG 1.4.1 Use of Color)
**Page:** /research/defense-score-data
**axe-core nodes:** 7

### Root Cause

`src/app/research/defense-score-data/page.tsx`, all inline text links use `className="text-amber-400 hover:underline"`. The `hover:underline` class applies an underline **only on mouse hover**, meaning at rest, the link is distinguished from surrounding text purely by its amber color. This fails WCAG 1.4.1 for users who cannot perceive color differences.

All 7 flagged links are inline `<Link>` elements inside prose `<p>` tags:

| Line | Link text | Context |
|------|---------, |---------|
| 169 | "Defense Milestone Score" | Introductory paragraph, `text-lg mt-4` container |
| 240 | "take the score quiz" | "No data yet" empty state inside overall stats section |
| 318 | "imnotanattorney.com/score" | Methodology section first paragraph |
| 376 | "Learn what motions should be filed in your case." | "What This Data Means", No motions paragraph |
| 389 | "Learn how to read your discovery." | "What This Data Means", Discovery paragraph |
| 402 | "Learn what to do when your attorney won't call back." | "What This Data Means", Communication paragraph |
| 414 | "Learn how to tell if your attorney is working your case." | "What This Data Means", Strategy paragraph |

All 7 share the same class pattern: `className="text-amber-400 hover:underline"`.

### Fix

Change `hover:underline` to `underline` on all 7 inline text links. The underline must be **always visible**, not conditional on hover.

```tsx
// BEFORE (all 7 occurrences)
className="text-amber-400 hover:underline"

// AFTER
className="text-amber-400 underline"
```

**This is a site-wide convention issue**, `hover:underline` on inline text links appears elsewhere in the codebase. Any link that sits inside a paragraph of body text and is distinguished from surroundings only by color must carry a persistent `underline`. Standalone CTAs (buttons styled as links, nav links, footer links) are exempt, context makes them linklike without underline.

**Effort:** ~5 minutes for this page. Run a codebase grep for `hover:underline` before closing, any match inside a `<p>` or prose container needs the same fix.

**Verification:** At rest (no hover), each link must be visibly distinguishable from surrounding zinc-400 text without relying on color. A permanent underline satisfies this.

---

## Cross-Report Pattern Analysis

### Pattern 1, Duplicate `<main>` Is a Convention Failure, Not a Per-Page Bug

The layout contract is clear: `layout.tsx` owns `<main>`. Page components should return `<div>`. Four pages broke this contract independently, suggesting no enforced convention. The fix should include a comment in `layout.tsx` documenting the contract:

```tsx
{/* Page components must NOT use <main>, this is the only <main> on the page. */}
<main id="main-content" className="min-h-screen">{children}</main>
```

Pages that are already clean (`/`, `/checkout`, `/dui-checklist`, `/resources`, `/playbook/dui-first-offense`, `/family`, `/intake`) use `<div>` as their root, they demonstrate the correct pattern.

### Pattern 2, `hover:underline` Is a Site-Wide Link Convention That Violates WCAG 1.4.1

The axe-core violation on `/research` is the only page where runtime scanning caught this, but the grep result on that page shows 7 inline text links all using the same pattern. This is the project's standard for styled links. The fix must address the convention globally, not just this page.

Cross-reference with the jsx-a11y Phase 7 report: jsx-a11y's `link-in-text-block` rule is not in its recommended ruleset, so the static scan did not catch this. axe-core caught it at runtime because it can evaluate the computed visual style.

### Pattern 3, Public-Facing Login Pages Have Two Compounding Issues (jsx-a11y F-01, F-02)

`src/app/my-cases/login/page.tsx` and `src/app/partner/login/page.tsx` each have:
- Missing `htmlFor`/`id` pairing on the email label (F-01, Serious)
- `autoFocus` on the email input (F-02, Serious, disorients screen reader users before page heading is announced)

These two issues compound: the input that gets auto-focused also isn't properly associated with its label. Both files need both fixes simultaneously.

### Pattern 4, Admin Forms Have Systematically Missing Label Associations (jsx-a11y F-01)

`src/app/admin/partners/page.tsx` (7 fields) and `src/app/partner/dashboard/page.tsx` (4 fields) use bare `<label>` tags with no `htmlFor`. These are internal tools so user impact is lower, but the pattern indicates the admin scaffold was built without a11y label hygiene. Any new admin form field should be audited before merging.

### Pattern 5, Intake Checkbox Groups Use `<label>` as Group Headings (jsx-a11y F-01)

`src/app/intake/page.tsx` lines 1091 and 1228 use a bare `<label>` as a visual heading for a group of checkboxes. This is semantically incorrect, `<label>` must associate with a single control. The correct pattern is `<fieldset>` + `<legend>`. The intake form is public-facing and high-priority for screen reader users who may be defendants under stress.

---

## Consolidated Fix Priority

| Priority | Issue | File(s) | Lines | WCAG | Effort |
|----------|-------|---------|-------|------|------, |
| 1 | Duplicate `<main>` | services, playbooks, score, start page.tsx | 325 / 120 / 1037 / 44+119+363 | 1.3.6 | 10 min |
| 2 | hover:underline inline links | research/defense-score-data/page.tsx | 169, 240, 318, 376, 389, 402, 414 | 1.4.1 | 5 min |
| 3 | Scrollable table not focusable | sample/page.tsx | 176, 300, 607 | 2.1.1 | 5 min |
| 4 | Missing htmlFor/id, public login | my-cases/login, partner/login page.tsx | login ~80, ~83 | 1.3.1, 4.1.2 | 10 min |
| 5 | autoFocus, public login | my-cases/login, partner/login page.tsx | ~87, ~90 | 3.2.1 | 5 min |
| 6 | Intake checkbox group labels | intake/page.tsx | 1091, 1228 | 1.3.1 | 20 min |
| 7 | Missing htmlFor/id, admin partners | admin/partners/page.tsx | 452, 464, 475, 487, 496, 508, 520 | 1.3.1, 4.1.2 | 15 min |
| 8 | Missing htmlFor/id, partner dashboard | partner/dashboard/page.tsx | 346, 363, 378, 393 | 1.3.1, 4.1.2 | 10 min |
| 9 | span onClick wrapper | IntakeChargeSelector.tsx | 171 | 2.1.1 | 5 min |
| 10 | autoFocus, admin tools | admin/demand, admin/inbox, OperatorShell.tsx | 266 / 189+391 / 104 | 3.2.1 | 15 min |

**Estimated total:** ~100 minutes for all 10 items.
**Highest-impact quick wins:** Items 1, 2, 3 together take ~20 minutes and eliminate all axe-core runtime violations.

---

## Files With No Violations (Confirmed Clean)

The following pages passed all three axe-core rule sets with zero violations. Their root elements use `<div>` (not `<main>`), confirming the correct structural pattern:

- `src/app/page.tsx` (homepage), 0 violations, 41 passes
- `src/app/checkout/page.tsx`, 0 violations, 42 passes
- `src/app/dui-checklist/page.tsx`, 0 violations, 38 passes
- `src/app/resources/page.tsx`, 0 violations, 40 passes
- `src/app/playbook/[slug]/page.tsx` (dui-first-offense), 0 violations, 43 passes
- `src/app/family/page.tsx`, 0 violations, 36 passes
- `src/app/intake/page.tsx`, 0 axe-core violations (jsx-a11y static issues noted separately)

---

*Phase 8 complete. Phase 3 axe-core + Phase 7 jsx-a11y are the authoritative sources. Phase 2 AccessLint report not found in audit directory, run AccessLint use-of-color skill against the research page and the site-wide hover:underline pattern before closing this audit.*
