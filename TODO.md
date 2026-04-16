# ImNotAnAttorney-Web, TODO

## Completed

### Content
- [x] 17 blog posts published (DUI, drug cases, discovery, motions, plea deals, etc.)
- [x] Twitter content bank: 3 threads + 5 singles + posting calendar
- [x] PDF lead magnet: "10 Questions Your Attorney Hopes You Never Ask"

### Pricing & Services
- [x] 5-tier pricing: $197 Case Decoder → $4,997 Situation Room
- [x] Witness add-ons: $149/extra witness, $297 standalone pack
- [x] Upgrade credits: 100% toward next tier, 12-month expiration
- [x] PricingTable, Services page, Landing page, Footer all aligned
- [x] All CTAs point to /checkout?tier=<tier-slug>

### SEO
- [x] Full schema markup (FAQ, Service, Organization, Article)
- [x] Dynamic OG images (site-wide + per blog post)
- [x] Twitter cards, canonical URLs, sitemap, custom 404

### Infrastructure
- [x] Supabase: 4 tables (subscribers, intakes, orders, cases) + storage bucket
- [x] Stripe: test mode, 7 products configured, webhook active
- [x] Resend: email delivery via raw fetch API
- [x] Vercel: deployed, env vars configured, production live

### Checkout Flow
- [x] Checkout page → Stripe hosted checkout → success page
- [x] Discovery upload page for $997+ tiers
- [x] End-to-end payment flow tested

### Product Templates
- [x] Case Decoder ($197), intake, prompt, report, SOP
- [x] Intelligence Brief ($997), intake, 4 prompts, report, SOP

### Integration Audit Fixes (Feb 19, 2026)
- [x] Fixed services page tier slugs (3 tiers had wrong checkout URLs, $8,991 blocked)
- [x] Webhook creates cases record for discovery tiers ($997+)
- [x] Webhook sends upload link in payment confirmation email
- [x] Webhook sends operator notification email on every order
- [x] Upload route: fixed double file extension bug
- [x] Upload route: added auth (validates caseId in cases table)
- [x] Upload route: stores private storage paths (not public URLs)
- [x] Upload route: sends receipt email on each upload
- [x] Subscribe route: sends welcome email with PDF guide link
- [x] Intake route: sends confirmation email with next steps
- [x] Footer: added Situation Room ($4,997), was listing only 4 of 5 tiers
- [x] Success page: changed contact email from nonexistent help@ to rahim0kapadia@gmail.com
- [x] Created favicon (amber "IA" on dark background via ImageResponse)
- [x] Resources page: removed 3 fake downloadable resources
- [x] Deleted dead code: TestimonialCard, EmbeddableBadge, supabase/client.ts, supabase/server.ts
- [x] Removed dead export: getPostsByCategory from blog.ts
- [x] Removed dead config: priceId fields from TIERS (checkout uses inline price_data)
- [x] Uninstalled unused packages: resend, @supabase/ssr

## Blocked (Needs Rahim)

- [ ] **UPL legal review**, Consult attorney on service boundaries (BLOCKER for live payments)
- [ ] **Terms of Service**, Required before accepting real payments
- [ ] **Privacy Policy**, Required, collecting PII
- [ ] **Stripe live mode**, LAST STEP. Switch test to live keys only after full e2e verification. Rahim initiates.
- [x] **Resend domain verification**, Domain verified, inbound webhook for admin emails
- [ ] **Domain email**, Set up help@imnotanattorney.com (Cloudflare email routing)
- [ ] **Twitter account**, Create @ImNotAnAttorney

## Backlog

### High Priority
- [ ] $997+ delivery templates (X-Ray, War Room, Situation Room)
- [ ] ImNotAnAttorney-engine project (automated report generation)
- [ ] Terms of Service page (/terms)
- [ ] Privacy Policy page (/privacy)
- [ ] Domain email setup (help@imnotanattorney.com)

### Medium Priority
- [ ] Upgrade credit system backend (UI promises 100% credit, no backend tracking)
- [ ] Add-on purchase flow ($149/$297, products exist, no checkout links)
- [ ] Consolidate tier data into single source (currently in 5 places, drift risk)
- [ ] Admin dashboard (view orders/intakes/subscribers)
- [ ] Create real PDFs for resources page (attorney tracker, discovery checklist, motion deadlines)
- [ ] Analytics setup (Vercel Analytics)
- [ ] Reddit engagement plan execution

### Low Priority
- [ ] Success page Stripe session verification (anyone can fabricate URL)
- [ ] Rate limiting on API routes
- [ ] Organization schema social links (empty until Twitter created)
- [ ] Email nurture sequence after lead capture
- [ ] A/B testing headlines/CTAs
- [ ] Accessibility audit
- [ ] Partnership outreach (bail bondsmen, legal forums)

---

## Deployment Info

**Repo:** github.com/rahim0kapadia/ImNotAnAttorney-web
**Branch:** master
**Production:** https://imnotanattorney.com
**Vercel:** rahim-kapadias-projects/imnotanattorney
**Supabase:** Kapadia Labs > imnotanattorney
**Stripe:** Test mode, webhook at production URL
**Architecture:** See ../ImNotAnAttorney/ARCHITECTURE.md
**Last updated:** Feb 19, 2026
