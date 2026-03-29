# Handoff: Homepage Multi-Charge Redesign — QA Remaining
Date: 2026-03-27 00:15

## Task
Homepage multi-charge redesign is DEPLOYED. 7 commits on master pushed to Vercel. Need visual QA of the live site using Playwright MCP (headless).

## Approach
Subagent-driven development executed the full plan (6 tasks, 3 phases). All code reviewed (spec compliance + code quality) with fixes applied. Production build passed. Now needs live site QA.

## Commits (fdcbb2b → 2bcd842)
- `a19ddcf` — ChargeTypeSelector rewritten: 4→8 charge types + onSelect callback
- `115cf0c` — HomepageHero created: dynamic CTA driven by charge selector
- `520082d` — Fix: `as TierSlug` → `satisfies` per project TS convention
- `2127077` — Fix: removed unused `isPlaybook`, inlined TIER_CORE lookups
- `5e1112e` — Hero swapped to HomepageHero, 6 DUI hardcodes removed, meta updated
- `b3f90fe` — Playbook Catalog grid (8 cards) + `knowsAbout` schema
- `2bcd842` — Testimonials diversified: probation violation + family buyer

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\ChargeTypeSelector.tsx` — rewritten: 8 charges, onSelect, satisfies typing
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\HomepageHero.tsx` — NEW: client component with dynamic CTA
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\page.tsx` — hero swap, 6 DUI hardcodes removed, catalog grid added, schema updated, testimonials diversified

## Config Changes
- Removed `screen-capture-mcp` from `~/.claude/.claude.json` global mcpServers
- Saved feedback memory: use Playwright MCP for browser QA, never puppeteer or screen-capture-mcp

## What Didn't Work
- Puppeteer MCP was used by mistake for QA (auto-installed by marketplace). Corrected to Playwright.
- screen-capture-mcp was also wrong tool. Removed from config.
- Playwright MCP tools weren't available in the session after config change — needs session restart.

## Remaining Steps
1. QA live homepage at https://imnotanattorney.com using Playwright MCP (headless):
   - 8 charge type buttons visible in selector
   - Clicking a charge updates CTA text + href dynamically
   - Deselecting returns to Case Decoder default CTA
   - Playbook Catalog grid shows 8 cards with correct checkout links
   - Testimonials include Linda M. (probation violation) + Maria G. (family buyer)
   - No "DUI Defense Playbook" text in hero, final CTA, value anchor, or lead capture
   - Schema `knowsAbout` has all 8 charge types in page source
2. Fix any visual/functional issues found during QA

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build` — production build (already passed)
- `grep -r "dui-first-offense" src/app/page.tsx` — only 1 match allowed (FAQ answer about Defense Playbook)

## Copy-Paste Prompt for Next Session
```
Homepage multi-charge redesign is DEPLOYED (7 commits on master, pushed to Vercel).

Commits: a19ddcf → 2bcd842
- ChargeTypeSelector: 4→8 charge types + onSelect callback + satisfies fix
- HomepageHero: new client component with dynamic CTA
- page.tsx: hero swapped, 6 DUI hardcodes removed, meta updated to Case Decoder
- Playbook Catalog: 8-card grid + knowsAbout schema
- Testimonials: Linda M. (probation violation) + Maria G. (family buyer) added

QA the live homepage at https://imnotanattorney.com using Playwright MCP (headless). Verify:
1. 8 charge type buttons visible in selector
2. Clicking a charge updates CTA text + href dynamically
3. Playbook Catalog grid shows 8 cards with checkout links
4. Testimonials include probation violation + family buyer
5. No DUI hardcodes in hero, final CTA, value anchor, or lead capture
6. Schema knowsAbout has all 8 charge types
```
