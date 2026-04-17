# OG Iter3 Full-Set Ship-Readiness Audit

**Date:** 2026-04-16
**Scope:** 32-card OG preview system sharing `src/lib/og-template.tsx` (v3.1)
**Samples evaluated:** 9 representatives + phone crops
**Lens:** Visual (Freiberg / Coursey / Kowalski) + Copy (Suby / Hormozi / Atti) + Positioning (Dunford / Godin / Laja)

---

## 1. Full-set ship verdict

**NEEDS-ONE-PASS.**

The template is production-grade. 7 of 9 samples ship as-is. Two samples (`survival`, `blogpost`) have title-wrap failures that break the set's visual discipline — fixable with copy-only edits, zero template work. No code changes required.

---

## 2. Per-sample verdict

| Sample | Ship? | Reason |
|---|---|---|
| **root** | Y | Two clean lines, hero dominates, subtitle lands the cascade ("file on you / file on them"). Benchmark card. |
| **judge** | Y | Two crisp lines, 4-word subtitle owns the canvas. Coursey-grade restraint. |
| **dui-fl** | Y | "Florida DUI / Defense Guide." two-line lockup, subtitle is a specific fact ("BAC 0.08"), not a tagline. State Briefing category earns its keep. |
| **blog** | Y | 3-line title still optically centered; subtitle defines the franchise ("Investigations into the information gap"). Field Report label works. |
| **partners** | Y | Two parallel sentences, Hormozi-clean offer. Subtitle wraps to 2 lines cleanly — no orphan. |
| **survival** | **N** | "Know Your Rights / Before They Read / Them." — **"Them." is orphaned on line 3**. Breaks hero discipline. |
| **start** | Y | 3 lines but balanced; each line earns its place. "That's the gap we close." is the sharpest subtitle in the set. |
| **family** | Y | Two lines, highest-intent card in the set (crisis-buyer matches Atti's 3AM test perfectly). |
| **blogpost** | **N** | Title truncation-by-wrap: "Might Not Mention" no period; subtitle cuts off mid-word ("suspended aut"). Character-count sizing is wrong for 48-char titles. |

---

## 3. Cascade coherence

**Y.** Posted together: "Know What They Know" (root) → "Who Is Your Judge?" (judge) → "Florida DUI Defense Guide" (state) → "Your Family Member Was Arrested" (family) → "What Your Attorney Won't Have Time to Explain" (blog) → "You Have an Attorney. You Don't Understand Your Case" (start) compounds into a single thesis: *defendants are the only strangers in the courtroom, and we hand them the file everyone else already has*. The 6-category taxonomy (DEFENSE INTELLIGENCE / STATE BRIEFING / FIELD REPORT / PARTNER NETWORK / INSIDE INAA + the implicit DEFENSE PLAYBOOK) reads as a publication masthead, not a SaaS navigation. That's Dunford positioning — the category is the moat.

---

## 4. Title-wrap issues + exact replacements

The `titleSize` logic in `og-template.tsx:68-74` sizes by the **longest line after `\n` splits**, not by total character count. When a caller ships a 2-line title whose longer half exceeds ~22 chars, Satori re-wraps inside the div and a third line appears with a 1-2-word orphan.

| Sample | Current wrap | Fix |
|---|---|---|
| root | Clean 2-line | ship |
| judge | Clean 2-line | ship |
| dui-fl | Clean 2-line | ship |
| blog | `What Your Attorney \n Won't Have Time to Explain.` → "Won't Have Time to / Explain." — "Explain." orphan, but acceptable because line 2 has 3 words. Borderline. **Optional tighten:** `"What Your Attorney Won't\nHave Time to Explain."` |
| partners | Clean 2-line | ship |
| **survival** | `Know Your Rights\nBefore They Read Them.` → wraps to 3 lines, "Them." orphan | **Replace with:** `"Know Your Rights Before\nThey Read Them."` (21 / 15 — stays 2 lines at size 104) |
| start | 3-line, acceptable | ship |
| family | Clean 2-line | ship |
| **blogpost** | Post title "The 10-Day DMV Deadline Your Attorney Might Not Mention" is 55 chars on one logical line, `\n` never inserted by caller → Satori free-wraps to 3 lines AND drops trailing period. Subtitle truncates at 120 chars mid-word. | **Two fixes below.** |

### Blogpost fix (code-level, `src/app/blog/[slug]/opengraph-image.tsx`)

Pass an explicit break + clean subtitle truncation:

```tsx
const title = (post?.title || "ImNotAnAttorney").trim();
// Insert a break near the middle at the nearest space so Satori doesn't orphan.
const mid = Math.floor(title.length / 2);
const breakAt = title.indexOf(" ", mid) > -1 ? title.indexOf(" ", mid) : title.lastIndexOf(" ", mid);
const wrappedTitle = breakAt > 0 && title.length > 32
  ? `${title.slice(0, breakAt)}\n${title.slice(breakAt + 1)}`
  : title;

// End subtitle at last word boundary before 120 chars + append ellipsis if cut.
const raw = (post?.excerpt || "").trim();
const subtitle = raw.length > 120
  ? raw.slice(0, raw.lastIndexOf(" ", 118)) + "…"
  : raw;

return renderOgImage({ title: wrappedTitle, subtitle, category: "Field Report" });
```

---

## 5. Remaining P0s across the set

Ranked:

1. **P0 — blogpost dynamic title wrap logic missing.** Any post title >32 chars without a `\n` will wrap unpredictably and lose punctuation. All 43 blog-post OG cards are exposed to this. Single-file fix.
2. **P0 — survival orphan.** One-word copy edit. Breaks hero discipline in the current set.
3. **P1 — subtitle truncation drops mid-word + no ellipsis.** Caller slices at char 120; `og-template.tsx:193` adds "…" only if `subtitle.length > 140`. Inconsistency guarantees ugly cutoffs between 120-140. Collapse to one source of truth.
4. **P1 — `titleSize` blind to total width.** Formula uses longest-line length after `\n`; ignores that Satori can still re-wrap if the longer line's pixel width exceeds `maxWidth: 1040`. Add a total-chars guard (e.g., if `title.replace("\n"," ").length > 44`, downshift to 88).
5. **P2 — `stat` deprecated but still in interface.** Dead prop. Remove after callers verified clean.

---

## 6. Iter3 prescriptions

Two code-level changes, then ship:

1. **`src/app/blog/[slug]/opengraph-image.tsx`** — apply the wrap-and-truncate logic above. Covers all 43 posts, not just this one.
2. **`src/app/arrest-survival-kit/opengraph-image.tsx`** — change title from `"Know Your Rights\nBefore They Read Them."` to `"Know Your Rights Before\nThey Read Them."`.

Optional follow-up (safe to defer to iter4, not blocking):

3. `og-template.tsx:193` — move the subtitle truncation into the template using `lastIndexOf(" ")` so callers stop slicing raw. Single source of truth.

Everything else: **ship it.**

---

## 7. Copy flags (category-name / feature-name titles)

Only cards where the title sells the page, not the category, belong in the set. Reviewed all 9:

| Card | Title reads as… | Verdict |
|---|---|---|
| root | Brand promise | Keep |
| judge | Defendant question | Keep |
| dui-fl | **Category name** ("Florida DUI Defense Guide") | Acceptable — it's an index page; the category IS the product. State Briefing label reinforces. No rewrite. |
| blog | Defendant fear (what the attorney won't explain) | Keep |
| partners | Offer stack | Keep |
| survival | Defendant fear (Miranda moment) | Keep (after wrap fix) |
| start | Gap articulation | Keep |
| family | Defendant-adjacent fear (crisis buyer) | Keep — strongest in set |
| blogpost | Post-specific fear | Keep (after wrap fix) |

No rewrites needed. The set passes the "fear or dream, never feature" rule.

---

## Ship gate

Apply the two copy/code fixes in section 6. Then the set ships. The template itself is done — Freiberg restraint, Coursey hierarchy, Kowalski composition. Don't touch it again.
