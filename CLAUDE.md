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
- `/sample` — Sample report preview page
- `/sample-xray` — Sample X-Ray discovery analysis preview
- `/score` — Defense Milestone Score (free lead magnet)
- `/upload` — Discovery document upload (for $2,497+ tiers)
- `/checkout` — Checkout page
- `/checkout/success` — Post-checkout confirmation
- `/my-case/[token]` — Customer case portal (report delivery, progress tracking)

### Components
- `LeadCapture` — Email capture with PDF download
- `BlogCTA` — Upsell to Question Pack on blog posts
- `BlogCard` — Post preview card
- `BlogCategoryFilter` — Blog index category filter
- `BlogInlineCapture` — Inline email capture within blog posts
- `FileUpload` — Discovery document upload with drag-and-drop
- `PricingTable` — 3-tier pricing display
- `FAQAccordion` — Collapsible FAQ
- `TestimonialSection` — Social proof section
- `TrustBadges` — Trust/credibility badges
- `Header` — Navigation with Get Started CTA
- `Footer` — Navigation, CTAs, sitemap link
- `StickyMobileCTA` — Fixed mobile call-to-action bar
- `PlaybookSalesPage` — Playbook product sales page
- `PlaybookCTA` — Playbook upsell CTA
- `RecentPurchaseNotification` — Social proof purchase notifications
- `SourceIntelligence` — Source attribution display
- `TLDRBox` — Summary/TLDR display box
- `OperatorShell` — Operator dashboard shell
- `MDXErrorBoundary` — Error boundary for MDX rendering

### Blog Posts (35 total)
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
14. what-happens-if-attorney-misses-deadline
15. why-is-my-criminal-case-taking-so-long
16. how-often-should-attorney-communicate
17. what-happens-at-arraignment
18. how-to-file-bar-complaint-against-attorney
19. can-criminal-charges-be-dropped
20. can-dui-be-dismissed
21. 7-things-criminal-justice-wont-tell-you
22. 10-day-dmv-deadline
23. breathalyzer-calibration-records
24. complete-dui-defense-guide
25. complete-white-collar-defense-guide
26. cooperation-agreement-federal-case
27. federal-investigation-what-to-expect
28. field-sobriety-test-standards
29. field-test-vs-lab-test-drug-cases
30. how-criminal-cases-actually-work
31. how-your-attorney-makes-money
32. private-attorney-vs-public-defender
33. trafficking-charges-constructive-possession
34. what-500-pages-of-drug-trafficking-discovery-contained
35. wire-fraud-defense-questions

### Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **CMS:** MDX files in `content/blog/`
- **Database:** Supabase (cases, orders, drip email tracking, discovery documents)
- **Payments:** Stripe Checkout — SANDBOX MODE until all website pieces are complete (webhook → order creation → drip sequence)
- **Email:** Resend (drip sequences, delivery notifications, admin digests)
- **Hosting:** Vercel (live, auto-deploys on push to master)
- **Schema:** FAQ, Service, Organization, Article

### SEO
- Dynamic OG images (site-wide + per blog post)
- Twitter card meta + canonical URLs
- Structured data markup on all pages
- Dynamic sitemap with all blog posts
- robots.txt with allow/disallow rules

### Growth Features
- Email capture with PDF lead magnet
- Defense Milestone Score — free lead magnet quiz at `/score`
- Post-purchase drip email sequences (per-tier, with upsell logic)
- Submission-relative and delivery-relative email timing
- Sharing CTAs on every blog post (SMS, WhatsApp, Email, Twitter, Facebook)
- "Know someone facing charges?" framing
- Recent purchase notification (social proof)
- Embeddable widget script for other sites
- Twitter content bank: 3 threads + 9 singles + posting calendar

### Product Tiers
- **Case Decoder** ($97) — Charge analysis + 10-15 questions
- **Intelligence Brief** ($497) — Judge intel + accountability research + 15-25 questions
- **X-Ray** ($2,497) — Full discovery analysis + 35-50 questions + Discovery Strength Rating + Prosecution Case Weakness Analysis
- **War Room** ($4,997) — Ongoing intelligence operation with weekly updates
- **Witness Pack** (add-on) — Witness background + credibility analysis
- **Situation Room** (add-on) — Full-team defense coordination

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
- Vercel deploy LIVE (auto-deploys on push to master)
- Domain imnotanattorney.com pointed via Cloudflare DNS to Vercel
- Twitter account @ImNotAnAttorney not yet created


## Continuous Verification (CV)

When Rahim says **"run CV"**, run this command:

```bash
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
```

This project is monitored by the CV engine at `~/projects/continuous-verification/`.

```bash
# Run INNA probes
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only

# Full verification (probes + eval + adversarial)
node ~/projects/continuous-verification/verify.mjs --project inna

# Via Claw inbox
echo '{"type":"run-cv","project":"inna"}' > ~/.openclaw/workspace/claw-inbox.json
```

**Hypotheses monitored:**
- INNA-H1: Every generated report passes UPL gate
- INNA-H2: Cron job runs within every 48h window
- INNA-H3: Site up + checkout API returns valid response
- INNA-H5: Adversarial UPL inputs are rejected by gate
- INNA-H6: Orders table healthy

**INNA-H1:** CLEAN as of 2026-03-13. All NULL eval_results cases resolved (3 batch-cleaned 3/6, 1 test case cleaned 3/13). Zero violations.

**Stripe policy:** Sandbox mode (test keys) until ALL website pieces are complete — Visual+CRO overhaul, E2E testing, distribution content. Do NOT switch to live keys until Rahim explicitly approves.

## Reference
- Business docs: `C:\Users\email\projects\ImNotAnAttorney\`
- Elite skills: `C:\Users\email\.openclaw\workspace\skills\`
