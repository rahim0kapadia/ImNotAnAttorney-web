# Blog SEO, Footer Contact, and Secondary Page Trust Fixes

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Website evaluation found GATE-level SEO failures on blog index, missing contact info on 17/22 pages (systemic footer fix), and minor trust gaps on 5 secondary pages.
- **Key files:** 7 files total, all in `src/app/` and `src/components/`
- **Tech stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Key decisions:** Blog JSON-LD uses CollectionPage with Organization author. Footer gets systemic contact line (fixes 17 pages at once). Secondary pages get minimal targeted text additions.
- **Setup:** All files already read in session. No new components needed.

## Tasks

### Task 1: Blog SEO (blog/page.tsx)
- [x] Add CollectionPage JSON-LD schema with Organization author and sameAs links (reddit, twitter)
- [x] Add introductory paragraph above blog post list with BJS statistic and named attorney methodologies (Taylor, Scheck, Spence)

### Task 2: Footer Contact (components/Footer.tsx)
- [x] Add prominent contact line with email (mailto link) and 4-hour response time promise above the 5-column grid

### Task 3: Family Page Trust (family/page.tsx)
- [x] The "Want the full guide?" section already has a working link, no change needed
- [x] Add attorney-anxiety resolution sentence in CTA section

### Task 4: Contact Page Trust (contact/page.tsx)
- [x] Add vulnerability coherence sentence near top
- [x] Add after-hours resource card pointing to Defense Milestone Score
- [x] Updated response time from 24 hours to 4 hours (consistent with footer)

### Task 5: Start Page Trust (start/page.tsx)
- [x] Add named attorney reference (Taylor, Scheck, Spence) after "40+ elite defense attorneys" claim

### Task 6: Score Page Trust (score/page.tsx)
- [x] Update methodology disclaimer from generic "general defense milestones" to specific "10 critical defense milestones identified across thousands of criminal cases"

### Task 7: Services Page Contact (services/page.tsx)
- [x] Add contact line with email and response time between guarantee section and FAQ

## Rules
- No UPL violations (no "you should", "we recommend", "we advise")
- No AI/technology disclosure
- No emojis, no code comments added
- Match existing voice, formatting, component patterns
- Minimal changes only, fix specific issues, no rewrites
