# ImNotAnAttorney-Web — TODO

## Completed (This Session)

### Content
- [x] 13 blog posts published (DUI, drug cases, discovery, motions, plea deals, firing lawyers, attorney accountability, hiring questions, etc.)
- [x] Twitter content bank: 3 threads + 5 singles + posting calendar
- [x] PDF lead magnet: "10 Questions Your Attorney Hopes You Never Ask"

### Offer/Pricing (5-Tier Ladder)
- [x] 5-tier pricing: $97 Case Decoder, $497 Intelligence Brief, $997 X-Ray, $1,997 War Room, $4,997 Situation Room
- [x] Witness add-ons: $149/extra witness, $297 standalone pack (up to 3)
- [x] Upgrade credits: 100% toward next tier, 12-month expiration
- [x] PricingTable component rewritten with all 5 tiers
- [x] Services page restructured by case type (Drug, DUI, White Collar) with 5 tiers each
- [x] Landing page updated: real case findings proof section, updated prices/CTAs
- [x] Footer updated with new tier names and prices
- [x] BlogCTA updated: Question Pack/$49 -> Case Decoder/$97
- [x] Intake page: service interest checkboxes aligned to 5 tiers
- [x] Free guide: price reference updated $49 -> $97
- [x] Value anchoring throughout
- [x] Urgency elements (deadlines bar, "what's at stake" section)
- [x] All CTAs point to /checkout?tier=<tier-slug>

### SEO
- [x] Full schema markup (FAQ, Service, Organization, Article)
- [x] Dynamic OG images (site-wide + per blog post)
- [x] Twitter card meta + canonical URLs
- [x] Intake page metadata + sitemap entry
- [x] Custom 404 page with brand voice

### Growth/Conversion
- [x] Lead capture with PDF download
- [x] BlogCTA upsell component on every post
- [x] Sharing CTA with SMS/WhatsApp/Email/Twitter/Facebook
- [x] "Know someone facing charges?" growth loop framing
- [x] Embeddable widget script for other sites
- [x] Trust signals on intake form

### UX/UI
- [x] Header CTA fixed
- [x] Improved footer with navigation + CTAs
- [x] Intake form trust signals

### Infrastructure
- [x] All commits pushed to GitHub
- [x] All builds pass clean

### Infrastructure (Phase 3)
- [x] Supabase project created (Kapadia Labs org) — schema deployed (4 tables + storage bucket)
- [x] Stripe account configured — test mode, 7 products + prices created via API
- [x] Resend email delivery — API key configured, using `onboarding@resend.dev` test sender
- [x] Supabase client/server/admin libs (`src/lib/supabase/`)
- [x] Stripe lib + tier catalog (`src/lib/stripe.ts`)
- [x] Email lib with branded template (`src/lib/email.ts`)
- [x] Checkout API route (`/api/checkout`)
- [x] Stripe webhook handler (`/api/webhooks/stripe`)
- [x] File upload component + API route (`/api/upload`)
- [x] Intake + subscribe routes migrated from JSON to Supabase

### Product Templates (Phase 4)
- [x] Case Decoder ($97) — intake questionnaire, prompt template, report template, delivery SOP
- [x] Intelligence Brief ($497) — enhanced intake, 4 prompt templates, report template, delivery SOP

### Checkout Flow (Phase 5)
- [x] Checkout page with tier details + Stripe redirect
- [x] Success page with tier-specific next steps
- [x] Discovery upload page for $997+ customers

### Deployment
- [x] Vercel project connected to GitHub repo
- [x] All env vars added to Vercel (Supabase, Stripe, Resend — all environments)
- [x] Stripe webhook endpoint created for production URL
- [x] Production deploy live at https://imnotanattorney.vercel.app

### End-to-End Test Results (Feb 19, 2026)
- [x] Landing page loads
- [x] Checkout page shows tier details
- [x] Stripe payment processes (test card 4242...)
- [x] Redirect to success page with tier info
- [x] Stripe webhook fires and returns 200
- [x] Order created in Supabase (`case-decoder`, $97, paid)
- [x] Email dispatched via Resend (no errors)
- [x] Subscribe API writes to Supabase
- [x] Intake API writes to Supabase

## Blocked (Needs Rahim)

- [ ] **Domain DNS** — Point imnotanattorney.com to Vercel
- [ ] **Resend domain verification** — Verify `imnotanattorney.com` in Resend to send from custom address (currently using `onboarding@resend.dev`)
- [ ] **Stripe live mode** — Switch from test keys (`sk_test_`/`pk_test_`) to live keys when ready to accept real payments
- [ ] **Twitter account** — Create @ImNotAnAttorney account
- [ ] **Twitter Blue** — Enable for checkmark (~$8/mo)

## Backlog

### Content
- [ ] More Twitter threads (5+ ready to write)
- [ ] LinkedIn presence strategy
- [ ] Reddit engagement plan (r/dui validated — see DEMAND-VALIDATION.md)
- [ ] Case studies (anonymized)

### Technical
- [ ] Analytics (Plausible or Vercel)
- [ ] A/B testing headlines/CTAs
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Email nurture sequence after lead capture

### Growth
- [ ] Referral mechanism
- [ ] Partnership outreach (bail bondsmen, legal forums)
- [ ] PR/press strategy

---

## Deployment Info

**Repo:** github.com/rahim0kapadia/ImNotAnAttorney-web
**Branch:** master
**Production URL:** https://imnotanattorney.vercel.app
**Vercel project:** rahim-kapadias-projects/imnotanattorney
**Supabase project:** Kapadia Labs > imnotanattorney (https://jxjbjmgdukwkoclydqdr.supabase.co)
**Stripe:** Test mode — webhook at https://imnotanattorney.vercel.app/api/webhooks/stripe
**Last deploy:** Feb 19, 2026
