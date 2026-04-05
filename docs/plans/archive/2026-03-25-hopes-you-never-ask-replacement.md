# Plan: Replace "hopes you never ask" with empowerment framing

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** ~40 instances of "hopes you never ask" remain across 10 source files. This adversarial framing (what the attorney fears) needs to be replaced with empowerment framing (what the defendant gains): "that change how your next attorney meeting goes".
- **Key files:** checkout/page.tsx, playbook-configs.ts, page.tsx (homepage), services/page.tsx, score/page.tsx, drip-emails.ts, PlaybookCTA.tsx, BlogCTA.tsx, resources/page.tsx, dui-defense/[state]/page.tsx
- **Tech stack:** Next.js/TypeScript/JSX
- **Key decisions:** Match case of surrounding text (Title Case in titles, lowercase in body). "10 Questions" variant uses same replacement pattern.
- **Setup:** grep already done, all instances inventoried

## Files & Instance Count

| File | Instances | Context |
|------|-----------|---------|
| `src/lib/playbook-configs.ts` | ~22 | seoTitle, seoDescription, valueStack titles |
| `src/app/checkout/page.tsx` | 8 | feature list items for each playbook |
| `src/app/page.tsx` | 4 | hero body, FAQ answer, pricing card, LeadCapture |
| `src/app/score/page.tsx` | 3 | email headlines, email capture fallback, playbook CTA |
| `src/app/resources/page.tsx` | 2 | comment + resource title |
| `src/app/services/page.tsx` | 1 | playbook description |
| `src/components/PlaybookCTA.tsx` | 1 | heading |
| `src/components/BlogCTA.tsx` | 1 | body copy |
| `src/lib/drip-emails.ts` | 1 | email HTML body |
| `src/app/dui-defense/[state]/page.tsx` | 1 | description paragraph |

## Replacement Rules

1. **Title Case contexts** (headings, valueStack titles, feature lists, resource titles):
   - "Hopes You Never Ask" -> "That Change How Your Next Attorney Meeting Goes"
2. **Lowercase contexts** (body copy, descriptions, SEO strings, email HTML):
   - "hopes you never ask" -> "that change how your next attorney meeting goes"
3. **"10 Questions" variant** (resources page, score page):
   - Same pattern: "hopes you never ask" -> "that change how your next attorney meeting goes"
4. **Preserve:** All surrounding formatting, JSX, quotes, template literals

## Execution

Single-pass: edit each file, then run final grep to confirm zero remaining instances.
