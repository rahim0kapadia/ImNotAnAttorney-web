# ImNotAnAttorney-Web — TODO

## ✅ DONE

### Content
- [x] 10 blog posts published (covering DUI, drug cases, discovery, motions, plea deals, firing lawyers, attorney accountability)
- [x] All pages built: Landing, About, Services, Resources, Intake, Blog

### Hormozi Offer Audit (Feb 18)
- [x] Added $49 entry-level Question Pack (low-ticket door opener)
- [x] Restructured pricing: $49 → $497 → $1,997 (removed $4,997 from landing, kept on services page)
- [x] Added value anchoring ("vs $1,500+ second opinion attorney")
- [x] Added urgency bar ("motion deadlines don't wait")
- [x] Added "What's at stake" section (anchoring to prison time + attorney cost)
- [x] Stronger CTAs throughout (→ /intake, not #pricing)
- [x] Deliverable guarantee with risk reversal

### SEO Audit (Feb 18)
- [x] FAQ schema on services page
- [x] Service schema on services page
- [x] Organization schema in layout
- [x] Intake page metadata (via layout.tsx)
- [x] Intake page added to sitemap
- [x] Article schema on all blog posts (was already there)
- [x] Dynamic sitemap with all blog posts
- [x] robots.txt

### UX Fixes (Feb 18)
- [x] Header "Get Started" → /intake (was #pricing, broken on non-landing pages)

### Infrastructure
- [x] All pushed to GitHub (7 commits)
- [x] Build passes clean

## 🔴 BLOCKED

- [ ] **Vercel deploy** — needs Rahim to: connect GitHub repo in Vercel dashboard, OR provide API token, OR run `npx vercel login`
- [ ] **Domain setup** — imnotanattorney.com DNS not pointed to Vercel

## 📋 TODO

### High Priority
- [ ] Get site live on Vercel (blocked)
- [ ] Point domain (blocked)
- [ ] OG images for social sharing
- [ ] Actual email delivery for lead capture (currently saves to JSON file)

### Content
- [ ] More blog posts targeting long-tail keywords
- [ ] Create the actual "10 Questions" PDF lead magnet
- [ ] Case study content (anonymized)

### Technical
- [ ] Upgrade email storage from JSON to Supabase
- [ ] Stripe payment integration
- [ ] Analytics (Plausible or Vercel Analytics)
- [ ] A/B test pricing page

### Growth
- [ ] Twitter/X account setup (@ImNotAnAttorney)
- [ ] Reddit presence strategy
- [ ] Email nurture sequence after lead capture
- [ ] Referral mechanism (defendants tell other defendants)
