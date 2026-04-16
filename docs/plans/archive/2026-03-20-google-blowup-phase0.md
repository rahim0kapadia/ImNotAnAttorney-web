## Context
- **Repo:** C:\Users\email\projects\ImNotAnAttorney-web
- **Problem:** ZERO Google indexation, robots.txt blocks `/_next/*` (all CSS/JS/fonts), hero + sticky CTAs point to sandbox product (Case Decoder, live: false), no analytics. Crisis buyers can't find us AND our funnel leaks.
- **Key files to read first:**
  1. `src/app/robots.ts`, the indexation blocker
  2. `src/app/page.tsx`, homepage hero with sandbox CTA
  3. `src/components/StickyMobileCTA.tsx`, sticky CTA with sandbox default
  4. `src/app/layout.tsx`, where GA4 goes
  5. `src/lib/tiers.ts`, product live status
- **Tech stack:** Next.js 16.1.6, React 19, Tailwind v4, Vercel, Stripe
- **Key decisions:** Fix indexation first, route all CTAs to dui-first-offense (only live product), GA4 for measurement
- **Setup/prerequisites:** Rahim creates GA4 property + GSC manually (Tasks 0.4, 0.6)
- **Source plan:** `C:\Users\email\projects\marketing-hq\docs\plans\2026-03-20-inaa-google-blowup-plan.md`

---

# Phase 0: Emergency, Unblock Google Indexation

## Files to Modify
1. `src/app/robots.ts`
2. `src/app/page.tsx`
3. `src/components/StickyMobileCTA.tsx`
4. `src/app/layout.tsx`
5. `package.json` (add @next/third-parties)

## Files to Create
1. `src/lib/analytics.ts` (GA4 custom events)

## Tasks

### Task 1: Fix robots.txt, unblock Googlebot rendering
- **File:** `src/app/robots.ts`
- Change `"/_next/*"` to `"/_next/data/*"` in disallow
- This allows CSS/JS/fonts (`/_next/static/*`) through while still blocking data fetches

### Task 2: Fix hero CTA, route to live product
- **File:** `src/app/page.tsx` (lines ~255-260)
- Primary CTA: `Get Your DUI Defense Playbook, $97` linking to `/checkout?tier=dui-first-offense`
- Add score quiz link below: `Or check your Defense Milestone Score, free` linking to `/score`
- Keep secondary CTA (sample) as-is

### Task 3: Fix StickyMobileCTA defaults
- **File:** `src/components/StickyMobileCTA.tsx`
- Default href: `/checkout?tier=dui-first-offense`
- Default label: `DUI Defense Playbook, $97`

### Task 4: Set up GA4
- **File:** `package.json`, add `@next/third-parties`
- **File:** `src/app/layout.tsx`, import and add `<GoogleAnalytics gaId={...} />`
- **New file:** `src/lib/analytics.ts`, 6 custom event helpers (score_started, score_completed, email_captured, checkout_started, purchase_completed, playbook_downloaded)
- GA4 Measurement ID comes from env var `NEXT_PUBLIC_GA_ID` (Rahim creates GA4 property)

### Manual Tasks (Rahim)
- Task 0.4: Set up Google Search Console (domain verification via Cloudflare DNS TXT record)
- Task 0.6: Set up Bing Webmaster Tools (import from GSC)
