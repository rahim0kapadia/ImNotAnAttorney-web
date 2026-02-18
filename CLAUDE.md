# ImNotAnAttorney-web — Claude Code Instructions

## What This Is

A Next.js content-driven sales funnel for ImNotAnAttorney — a legal empowerment service helping criminal defendants hold their attorneys accountable.

**Tagline:** "We Research. You Ask."
**Legal positioning:** We provide legal INFORMATION and generate QUESTIONS. We do NOT provide legal ADVICE.

## What Has Been Built

### Pages
- `/` — Landing page with pain points, how it works, testimonials, pricing, CTA
- `/about` — Origin story, what we do/what we're NOT
- `/services` — Pricing tiers by case type (Drug, DUI, White Collar)
- `/resources` — Free guides, checklists, rights by charge type
- `/intake` — Multi-step case intake form
- `/blog` — Blog index with category filtering
- `/blog/[slug]` — Individual posts with sharing, CTA, related posts

### Components
- `LeadCapture` — Email capture with PDF download
- `BlogCTA` — Upsell to Question Pack on blog posts
- `BlogCard` — Post preview card
- `PricingTable` — 3-tier pricing display
- `FAQAccordion` — Collapsible FAQ
- `TestimonialCard` — Social proof
- `Header` — Navigation with Get Started CTA
- `Footer` — Navigation, CTAs, sitemap link
- `EmbeddableBadge` — Widget for other sites

### Blog Posts (13 total)
1. 5-questions-dui-attorney
2. attorney-not-returning-calls
3. discovery-rights-drug-cases
4. first-time-felony-what-actually-happens
5. should-you-take-the-plea-deal
6. is-your-attorney-actually-working-your-case
7. 10-questions-every-defendant-should-ask
8. what-motions-should-your-attorney-be-filing
9. how-to-read-your-discovery
10. should-you-fire-your-lawyer
11. what-to-expect-after-dui-arrest
12. feels-like-lawyer-working-against-me
13. questions-to-ask-before-hiring-criminal-defense-attorney

### Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **CMS:** MDX files in `content/blog/`
- **Hosting:** Vercel (pending deploy)
- **Schema:** FAQ, Service, Organization, Article

### SEO
- Dynamic OG images (site-wide + per blog post)
- Twitter card meta + canonical URLs
- Structured data markup on all pages
- Dynamic sitemap with all blog posts
- robots.txt with allow/disallow rules

### Growth Features
- Email capture with PDF lead magnet
- Sharing CTAs on every blog post (SMS, WhatsApp, Email, Twitter, Facebook)
- "Know someone facing charges?" framing
- Embeddable widget script for other sites
- Twitter content bank: 3 threads + 9 singles + posting calendar

## Brand Voice
- Bold, irreverent, slightly provocative
- Speaks like a defendant who's been through the system
- NOT corporate lawyer voice — for regular people
- Example: "Your attorney forgot to file that motion? Cool. Here are 7 questions that'll remind them."

## DO NOT
- Provide actual legal advice in any copy
- Use the word "attorney" to describe our service
- Make guarantees about case outcomes
- Use stock photos of gavels or scales of justice (cliché)

## Important Notes
- All commits pushed to GitHub: github.com/rahim0kapadia/ImNotAnAttorney-web
- Vercel deploy pending (needs Rahim auth)
- Domain imnotanattorney.com not yet pointed
- Twitter account @ImNotAnAttorney not yet created

## Reference
- Business docs: `C:\Users\email\projects\ImNotAnAttorney\`
- Elite skills: `C:\Users\email\.openclaw\workspace\skills\`
