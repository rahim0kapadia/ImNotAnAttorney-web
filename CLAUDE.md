# ImNotAnAttorney-web — Claude Code Instructions

## What To Build

A Next.js content-driven sales funnel for ImNotAnAttorney — a legal empowerment service helping criminal defendants hold their attorneys accountable.

**Tagline:** "We Research. You Ask."
**Legal positioning:** We provide legal INFORMATION and generate QUESTIONS. We do NOT provide legal ADVICE.

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Database:** Supabase
- **Payments:** Stripe (later)
- **Hosting:** Vercel
- **CMS for blog:** MDX files (simple, no external CMS needed)

## Brand Voice
- Bold, irreverent, slightly provocative
- Speaks like a defendant who's been through the system
- NOT corporate lawyer voice — this is for regular people
- Example tone: "Your attorney forgot to file that motion? Cool. Here are 7 questions that'll remind them."

## Pages to Build (Priority Order)

### 1. Landing Page (`/`)
- Hero: Pain point headline + CTA
- "Does this sound familiar?" section (3-4 pain points defendants relate to)
- How it works (3 steps)
- Social proof / testimonials (placeholder for now)
- Pricing preview
- Final CTA

### 2. Blog (`/blog`)
- MDX-based blog with frontmatter (title, date, tags, excerpt, author)
- Category pages: DUI, Drug Cases, White Collar, General Defense
- Each post: estimated read time, share buttons, related posts
- **Lead capture** at bottom of every post: "Get our free guide: 10 Questions Your Attorney Hopes You Never Ask"
- SEO optimized: meta tags, Open Graph, schema markup

### 3. Services (`/services`)
- Three tiers with clear differentiation:
  - **Case Audit** ($497) — One-time discovery review + question report
  - **Full Package** ($1,997) — Ongoing tracking + weekly updates
  - **VIP** ($4,997) — Priority + direct access
- FAQ section

### 4. Free Resources (`/resources`)
- Downloadable guides (email-gated)
- "Know Your Rights" quick references by charge type
- Attorney communication templates

### 5. About (`/about`)
- Founded by a defendant, for defendants
- Powered by AI + 40 elite defense attorneys' tactics
- Not a law firm, not legal advice

### 6. Case Intake (`/intake`) — Later
- Multi-step form: charges, attorney info, discovery status
- Document upload
- Payment integration

## Design Direction
- Dark theme (authority, seriousness)
- Accent color: sharp red or amber (urgency)
- Typography: Strong headlines, readable body
- Mobile-first (defendants browse on phones)
- Fast — no heavy animations

## Key Components
- `<LeadCapture />` — Email capture form (appears on blog posts and landing)
- `<PricingTable />` — Three-tier pricing display
- `<BlogCard />` — Post preview card
- `<TestimonialCard />` — Social proof
- `<FAQAccordion />` — Collapsible Q&A

## SEO Requirements
- Dynamic sitemap
- robots.txt
- Schema markup (Article for blog, Service for services)
- Meta description per page
- Open Graph images

## Reference
- Business docs: `C:\Users\email\projects\ImNotAnAttorney\`
- Elite skills (content source): `C:\Users\email\.openclaw\workspace\skills\`

## DO NOT
- Provide actual legal advice in any copy
- Use the word "attorney" to describe our service
- Make guarantees about case outcomes
- Use stock photos of gavels or scales of justice (cliché)

## Start With
1. `npx create-next-app@latest . --typescript --tailwind --app --src-dir`
2. Landing page with lead capture
3. Blog infrastructure (MDX)
4. 3 placeholder blog posts (I'll replace content later)
