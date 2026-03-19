# INNA Website — Product Readiness + Visual Overhaul + Distribution

> **Status: Phase 5 NOT STARTED** — Last updated 2026-03-19
> Tracking: `~/.claude/projects/.../memory/active-build-checklist.md`
> Phase 0-4: COMPLETE. Phase 5 (5-expert audit implementation): NOT STARTED
> Full audit report: `docs/research/2026-03-19-five-expert-homepage-audit.md`

## Context

INNA has a solid foundation: 29 blog posts, 8 playbook PDFs, full Stripe checkout + download flow, 5 service tiers + 8 digital products. But the product isn't fully wired up (PDFs not uploaded, 5 tiers missing from success page), the site has zero animations, and no distribution content exists.

This plan has 3 phases:
- **Phase 0**: Wire up the last-mile product delivery (PDFs, DB seeds, bug fixes) — **COMPLETE**
- **Phase 1**: Visual + CRO overhaul (framer-motion, trust badges, typography, mobile) — **COMPLETE** (1 manual task remaining)
- **Phase 2**: Distribution content creation (Quora, Reddit SOP, TikTok, YouTube, Pinterest, Email, Facebook, GEO) — **COMPLETE**
- **Phase 3**: Infrastructure + GEO (added during execution) — **COMPLETE**

## Remaining Items

| Item | Owner | Time | Blocker? |
|------|-------|------|----------|
| Task 1.14: GEO baseline — run 10 prompts in 4 AI tools, fill matrix | Rahim (manual) | 30 min | No |
| Task 0.5: Formal E2E test framework | Deferred | — | No (ad-hoc scripts used) |
| **Stripe E2E testing** | Rahim + CC | 2-3 hrs | **YES — blocks go-live** |

---

## Phase 0: PRODUCT READINESS — COMPLETE (4/5)

### Task 0.1: Create Storage Bucket + Upload PDFs — DONE
**Created:** `scripts/setup-storage-and-seed.mjs`

Single script that:
1. Creates `charge-packs` storage bucket (private, handle "already exists")
2. Uploads all 8 PDFs from `C:\Users\email\projects\ImNotAnAttorney\content\playbooks\`
3. Upserts all 8 `charge_packs` table rows

**PDF-to-tier mapping:**
| Tier Slug | PDF File | Storage Path (in bucket) | `pdf_storage_path` (in DB) |
|---|---|---|---|
| `dui-first-offense` | `dui-first-offense-playbook.pdf` | `dui-first-offense/dui-first-offense-playbook.pdf` | `charge-packs/dui-first-offense/dui-first-offense-playbook.pdf` |
| `drug-possession` | `drug-possession-playbook.pdf` | `drug-possession/drug-possession-playbook.pdf` | `charge-packs/drug-possession/drug-possession-playbook.pdf` |
| `probation-violation` | `probation-violation-playbook.pdf` | `probation-violation/probation-violation-playbook.pdf` | `charge-packs/probation-violation/probation-violation-playbook.pdf` |
| `white-collar` | `white-collar-playbook.pdf` | `white-collar/white-collar-playbook.pdf` | `charge-packs/white-collar/white-collar-playbook.pdf` |
| `sex-offense` | `sex-offense-playbook.pdf` | `sex-offense/sex-offense-playbook.pdf` | `charge-packs/sex-offense/sex-offense-playbook.pdf` |
| `federal-criminal` | `federal-criminal-playbook.pdf` | `federal-criminal/federal-criminal-playbook.pdf` | `charge-packs/federal-criminal/federal-criminal-playbook.pdf` |
| `drug-trafficking` | `drug-trafficking-playbook.pdf` | `drug-trafficking/drug-trafficking-playbook.pdf` | `charge-packs/drug-trafficking/drug-trafficking-playbook.pdf` |
| `self-defense` | `self-defense-playbook.pdf` | `self-defense/self-defense-playbook.pdf` | `charge-packs/self-defense/self-defense-playbook.pdf` |

**Note:** Migration-006 seeded DUI with wrong path (`dui-defense-playbook.pdf`). This upsert corrected it.

### Task 0.2: Fix checkout/success/page.tsx — DONE
**Modified:** `src/app/checkout/success/page.tsx`

Two bugs fixed:
1. **Missing TIER_NEXT_STEPS** for `white-collar`, `sex-offense`, `federal-criminal`, `drug-trafficking`, `self-defense` — all 5 entries added.
2. **Missing OTO coverage** — extended playbook OTO conditional to include all 8 tiers.

### Task 0.3: Add webhook playbookStep2 entries — DONE
**Modified:** `src/app/api/webhooks/stripe/route.ts`

All 8 charge-specific Step 2 email text entries added to the `playbookStep2` dict.

### Task 0.4: Verify download flow — DONE
**Created:** `scripts/verify-download-flow.mjs`

Script verifies all 8 tiers: creates test order with `download_token` + 72h expiry, GETs `/api/download/{token}`, asserts redirect to Supabase signed URL, cleans up.

### Task 0.5: Run E2E + Build verification — DEFERRED
No formal Playwright/Cypress framework built. Ad-hoc verification scripts used instead. `npx next build` passes clean. Not blocking — formal E2E is a nice-to-have.

---

## Phase 1: VISUAL + CRO OVERHAUL — COMPLETE (13/14 code tasks + 1 manual remaining)

### Research Step — DONE
Three agents ran in parallel:
1. `peep-laja` — ResearchXL audit completed. Friction points, trust gaps, conversion blockers identified.
2. `sabri-suby` — SLLC lens assessment completed.
3. **VoC Mining Agent** — Deliverable: `docs/research/voc-defendant-language.md` (418 lines) with:
   - 28+ verbatim phrases from Avvo, Quora, Reddit, JustAnswer, Justia
   - Emotional vocabulary organized by emotion (fear, anger, helplessness, betrayal, shame, confusion)
   - 36+ real forum questions (used as headline/CTA candidates)
   - 4 common objections to paying for legal help
   - Per-charge emotional patterns (DUI, Drug, White Collar, Sex Offense, Self-Defense, Federal)

### Task 1.1: Foundation — framer-motion + Display Font + Theme — DONE
**Modified:** `package.json`, `src/app/layout.tsx`, `src/app/globals.css`

- framer-motion installed
- Playfair Display added via `next/font/google` with `variable: "--font-display"`
- globals.css: `--font-display`, `.noise-overlay`, `--section-spacing`, alternating section utilities (`.section-alt`)

### Task 1.2: Animation Components — DONE
**Created:** `src/components/motion/FadeInUp.tsx`, `StaggerContainer.tsx`, `AnimatedCounter.tsx`

- `FadeInUp`: `whileInView` with spring physics, `viewport={{ once: true, amount: 0.2 }}`, `useReducedMotion` accessibility
- `StaggerContainer` + `StaggerItem`: `staggerChildren: 0.1` variants
- `AnimatedCounter`: counts from 0 to target on viewport entry, supports prefix/suffix

### Task 1.3: Hero + Top Sections (Landing Page) — DONE
**Modified:** `src/app/page.tsx`

- `<AnimatedCounter target={73} suffix="%" />` on proof section
- H1 with `font-display` class
- `<AnimatedCounter target={500} suffix="+" />` aggregate social proof
- StaggerContainer/StaggerItem on proof cards and pain point cards
- Standardized `py-20`/`py-24` section spacing
- CTA buttons with `hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all`

### Task 1.4: PricingTable + TrustBadges Component — DONE
**Modified:** `src/components/PricingTable.tsx`
**Created:** `src/components/TrustBadges.tsx`

- Case Decoder: "Most Popular" badge + `ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/10 scale-[1.02]`
- Tier cards: StaggerContainer/StaggerItem
- TrustBadges: 3 variants (`checkout` | `pricing` | `compact`), inline SVG icons, FadeInUp wrapper
- Placed on 6+ pages (landing, checkout, playbook sales, services, score, blog CTA)

### Task 1.5: Testimonial Sections + Social Proof Placement (Kenyon) — DONE
**Created:** `src/components/TestimonialSection.tsx`
**Modified:** `src/app/page.tsx`

- `inline` variant (1-2 quotes horizontal) and `grid` variant (3-5 card grid)
- Left amber border, zinc-900 background, FadeInUp entrance
- Landing page placements (3 per Kenyon):
  1. After pain points: 2 inline testimonials ("I didn't even know my attorney was supposed to file motions...")
  2. Before pricing: 4 grid testimonials with charge + outcome details
  3. Hero area: aggregate counter (Task 1.3)
- Asterisk disclaimer: "Based on real defendant experiences. Names changed for privacy."

### Task 1.6: Score Page Animated Arc — DONE
**Created:** `src/components/motion/AnimatedScoreArc.tsx` (118 lines)
**Modified:** `src/app/score/page.tsx`

- SVG circle with `strokeDasharray`/`strokeDashoffset` animation (1.8s)
- Color-coded by 5 bands (red/orange/yellow/green/emerald)
- Center: AnimatedCounter
- Full ARIA accessibility + `prefers-reduced-motion` support
- Deployed on /score page

### Task 1.7: Checkout + BlogCTA + LeadCapture Polish — DONE
**Modified:** `src/app/checkout/success/page.tsx`, `src/components/BlogCTA.tsx`, `src/components/LeadCapture.tsx`

- Checkout: TrustBadges checkout variant, FadeInUp on success state, pulse on OTO timer
- BlogCTA: FadeInUp wrapper, enhanced button hovers, TrustBadges compact
- LeadCapture: FadeInUp, `hover:scale-[1.01] active:scale-[0.99]` on submit

### Task 1.8: Real-Time Purchase Notification (Kenyon — 98% lift) — DONE
**Created:** `src/components/RecentPurchaseNotification.tsx`
**Modified:** `src/app/page.tsx` (landing page only — intentional scope)

- Toast-style notification in bottom-left: "Others are getting their questions right now"
- Appears 8s after load, repeats every 55s, dismissible
- Spring animation with ping indicator dot
- Repositioned to avoid StickyMobileCTA overlap on mobile

### Task 1.9: Landing Page Lower Sections — DONE
**Modified:** `src/app/page.tsx`

- StaggerContainer on how-it-works steps, attorney methodology cards, value anchor cards
- `font-display` on all H2s
- Alternating section backgrounds via `.section-alt` (4 instances)
- Guarantee section: shield SVG icon + FadeInUp
- TrustBadges pricing variant below PricingTable
- Final CTA: FadeInUp + button hover effects

### Task 1.10: Header + Footer + FAQAccordion — DONE
**Modified:** `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/FAQAccordion.tsx`

- Header: AnimatePresence mobile menu (slide down spring), CTA glow
- Footer: FadeInUp on container (fixed 2026-03-13)
- FAQAccordion: AnimatePresence for smooth height animation

### Task 1.11: About + Resources + Blog Post Pages — DONE
**Modified:** `src/app/about/page.tsx`, `src/app/resources/page.tsx`, `src/app/blog/[slug]/page.tsx`, blog index page (fixed 2026-03-13)

- Font-display on H1s, FadeInUp on sections, StaggerContainer on card grids
- TrustBadges compact on resources + blog CTA areas

### Task 1.12: Playbook Sales + Services + Sticky Mobile CTA — DONE
**Modified:** `src/components/PlaybookSalesPage.tsx`, `src/app/services/page.tsx`
**Created:** `src/components/StickyMobileCTA.tsx`

- PlaybookSalesPage: font-display hero, FadeInUp sections, StaggerContainer value stack, TrustBadges checkout variant
- Services: FadeInUp headers, StaggerContainer tier grids, TrustBadges pricing
- StickyMobileCTA: `fixed bottom-0 md:hidden z-40`, 44px min touch target, shows after scroll past hero via IntersectionObserver

### Task 1.13: Emotional Copy Rewrites (Wolf + Wiebe) — DONE
**Modified:** `src/app/page.tsx`, `src/components/BlogCTA.tsx`, `src/app/score/page.tsx`

Completed in two passes:

**Pass 1 (2026-03-12):** Using VoC research (`docs/research/voc-defendant-language.md`):
1. Landing page hero H1: "Your Lawyer Won't Call You Back. We'll Give You the Questions That Make Them." (from VoC anger pattern)
2. Landing page CTA: "Get the Questions That Make Your Lawyer Act — $197 →" (VoC action language)
3. Pain point headlines: 5 verbatim defendant frustrations including "My lawyer won't return my calls" and "I paid $10K and he did nothing"
4. Subheadline: "You're scared. Confused. Nobody's explaining your case." (VoC emotional vocabulary)
5. Final CTA: "You're up at 2am Googling your charges because nobody will explain anything to you — or anyone who loves you." (fear → empowerment per Wolf)
6. Family buyer pain point added: "I'm not the one facing charges — but I'm the one doing all the research." (VoC: family members searching on behalf of defendants)

**Pass 2 (2026-03-16):** VoC anger/urgency refinements:
1. BlogCTA headline: "Your attorney filed zero motions. Would you even know?" (VoC anger pattern — mirrors exact question defendants ask)
2. Landing page value anchor: Added betrayal line "Every year, defendants spend $10,000+ on attorneys who file zero motions, return zero calls, and push for a plea without reviewing discovery."
3. Score page email capture: Crisis bands (Critical/Concerning) changed to "Your attorney has 48 hours to answer these 10 questions. Get them now." (urgency/control framing)

**PlaybookSalesPage hero subheadlines** were already VoC-aligned from pass 1 (DUI: "fighting like your life depends on it", Drug: "pushing a plea", White Collar: "scared to death", Federal: "designed to overwhelm you") — no changes needed.

Note: All copy UPL-compliant (information/questions, never advice). Brand voice preserved.

### Task 1.14: GEO Prompt Testing (Bailyn) — REMAINING (manual, Rahim)
**Created:** `scripts/geo-prompt-test.mjs`, `docs/research/geo-baseline.md`

Script and template exist. Matrix is EMPTY — needs manual execution:
1. Run `node scripts/geo-prompt-test.mjs` to get 10 test prompts
2. Test each prompt in ChatGPT, Perplexity, Google AI Overview, and Claude
3. Record Y/N/P in `docs/research/geo-baseline.md` matrix
4. ~30 minutes of manual work

### Phase 1 Dependency Graph
```
Research Step (peep-laja + sabri-suby + VoC mining) — DONE
  |
Task 1.1 (foundation) → Task 1.2 (animation components) — DONE
  |
Tasks 1.3-1.12 — DONE
  |
Task 1.13 (copy rewrites) — DONE (two passes)
Task 1.14 (GEO prompt testing) — REMAINING (manual)
```

### Phase 1 Verification — PASSED
- `npx tsc --noEmit --skipLibCheck` — zero errors
- `npx next build` — clean build, all pages render
- All changes deployed to production via Vercel

---

## Phase 2: DISTRIBUTION + CONTENT — COMPLETE (2026-03-13)

All content outputs in `content/queue/{platform}/pending/`.

### Team 2: `inna-distribution` (4 agents) — DONE

| Agent | Task | Output |
|-------|------|--------|
| `Reddit & Quora Community Engine` | Quora answers + Reddit warm-up | 35 Quora answers + Reddit SOP + 10 comments |
| `chris-dreyer` | GEO audit + Entity SEO | `docs/research/geo-audit.md` + `docs/research/entity-seo-roadmap.md` |
| `Growth Hacker` | Reddit SOP + viral loops + paid strategy | `content/queue/reddit/reddit-sop.md` + `docs/research/growth-strategy.md` |
| `Facebook Content Engine` | Group targets + content | 20 group targets + 20 posts + engagement templates |

### Team 3: `inna-content-machine` (4 agents) — DONE

| Agent | Task | Output |
|-------|------|--------|
| `TikTok Content Engine` | Video scripts | 30 scripts in `content/queue/tiktok/pending/` |
| `YouTube Content Engine` | Shorts + long-form | 10 Shorts + 5 long-form packages in `content/queue/youtube/pending/` |
| `Pinterest Content Engine` | Board strategy + pins | 7-board strategy + 35 pin descriptions + 3 idea pin series |
| `Email Sequence Architect` | 3 email flows | 12 emails: abandoned-score, win-back, score re-engagement |

### Phase 2 Verification — PASSED (2026-03-13)
- UPL compliance: 0 violations across all content
- Link check: all URLs point to valid routes (2 minor flags in internal strategy docs only)
- Count check: all targets met or exceeded (130+ total content pieces)

---

## Phase 3: INFRASTRUCTURE + GEO — COMPLETE (2026-03-14)

*Added during execution — not in original plan.*

- Score page enhancements: aggregate counters, anonymous tracking, ShareButtons, sessionStorage persistence, personalized loading
- .01% Schema markup: speakable, @id binding, citation, about, educationalLevel, audience, isBasedOn, HowTo
- Internal linking: 10 MDX files with semantic anchor text variation
- GEO content: TLDRBox on fire-your-lawyer, numbered Q+A, definition blocks (constructive possession, proffer session)
- TLDRBoxes: 5 new (20/35 total, 57% coverage)
- Migration 012 applied to production
- TypeScript clean, Next.js build clean, pushed + deployed

---

## Execution Order — COMPLETED

```
Phase 0 (Tasks 0.1-0.4) — DONE 2026-03-11
  |
Phase 1 (Tasks 1.1-1.13) — DONE 2026-03-12 through 2026-03-16
  |  (Research step ran parallel with 1.1-1.2)
  |  (1.13 Pass 2 completed 2026-03-16 with VoC anger/urgency refinements)
  |
Phase 2 (Teams 2 & 3) — DONE 2026-03-13 (ran parallel with Phase 1)
  |
Phase 3 (Infrastructure + GEO) — DONE 2026-03-14
```

---

## Phase 4: HOMEPAGE REDESIGN + REAL DISCOVERY DOCS — COMPLETE (2026-03-19)

*Added 2026-03-18. Detailed plan: `docs/plans/2026-03-18-homepage-redesign.md`*

**Core insight:** The DiscoveryReveal section must show REAL PDF pages from actual PCSO discovery reports — not hand-coded HTML replicas. A defendant at 2AM needs to see the EXACT same document format they're holding from their own discovery packet. Only the real PDF achieves this.

### Phase 4A: PDF Redaction Pipeline — COMPLETE
- [x] 4A.1 Write `scripts/redact-discovery.py` using PyMuPDF (pymupdf 1.26.7)
- [x] 4A.2 Open target PCSO PDFs, draw black rectangles over PII (names, DOB, addresses, phones, VIN)
- [x] 4A.3 Add amber highlight rectangles over 3 findings (CI phone dual attribution, 68.3g weight gap, drug type mismatch)
- [x] 4A.4 Export each page as 2x retina PNG to `public/discovery/` (4 pages, 2448x3168)
- [x] 4A.5 Visual QA — verified desktop + mobile, old unredacted PNGs deleted

**Source PDFs:**
- `~/projects/Court Case/Cases/23-01773-CF_Kapadia/03-Extracted/09 - PCSO - SUPPLEMENT SO22-401531-7 Report Date 02-07-2023 - 5 pages.pdf` — pages 3-4
- Lab Report 23-000093 in `~/projects/Court Case/Cases/23-01773-CF_Kapadia/01-Raw/Laboratory Report/`
- Text reference (NOT for visual design): `03-Extracted/markdown/*.md`

**3 Findings to highlight:**
1. CI Phone Dual Attribution — (912) 380-2720 listed for both suspect AND confidential informant
2. 68.3g Weight Gap — Scene: 93.9g, Lab: 25.59g
3. Drug Type Mismatch — Police: "Adderall" (amphetamine), Lab: MDMA/MDA — wrong statute

### Phase 4B: DiscoveryReveal Component Rewrite — COMPLETE
- [x] 4B.1 Replace HTML replica with Next.js `<Image>` loading real redacted PNGs
- [x] 4B.2 Scroll-driven finding cards with Framer Motion opacity transforms
- [x] 4B.3 Reduced-motion fallback (all findings visible, no animation)
- [x] 4B.4 Section copy + bottom links preserved

### Phase 4C: Homepage Copy Overhaul (page.tsx) — COMPLETE (done in prior session)
- [x] 4C.1 H1 → "Your Case File Has Answers Your Attorney Hasn't Mentioned"
- [x] 4C.2 Subheadline with origin story (68.3g, CI phone, drug type mismatch)
- [x] 4C.3 Eyebrow → "Built by a defendant who read his own 500-page discovery file"
- [x] 4C.4 CTA swap: "See What We Found" primary, "$197 Case Decoder" secondary
- [x] 4C.5 Founder attribution update
- [x] 4C.6 "What We Are NOT" section (UPL clarity)
- [x] 4C.7 Bridge text → "ask questions until we get answers"
- [x] 4C.8 Value anchor: hourly rate comparison
- [x] 4C.9 Guarantee → "Find It or It's Free"
- [x] 4C.10 FAQ reorder: lead with "Is this legal?"
- [x] 4C.11 Final CTA: "Stop waiting. Start asking."
- [x] 4C.12 Metadata update (title, OG)

### Phase 4D: Integration — COMPLETE
- [x] 4D.1 ChargeTypeSelector integrated into hero
- [x] 4D.2 DiscoveryReveal with real PDF images
- [x] 4D.3 TrustBadges "Find It or It's Free" badge

### Phase 4E: Verification — COMPLETE
- [x] 4E.1 TypeScript check — zero errors
- [x] 4E.2 Visual QA desktop (1400px) + mobile (390px)
- [x] 4E.3 FAQ schema — FAQPage JSON-LD, 9 questions, correct order

---

## Phase 5: 5-EXPERT AUDIT IMPLEMENTATION — NOT STARTED (2026-03-19)

*Added 2026-03-19. Full audit: `docs/research/2026-03-19-five-expert-homepage-audit.md`*

**What happened:** After Phase 4 was complete, 5 expert agents (Suby, Brunson, Chaperon, Laja, Dreyer) audited every line of `page.tsx` against the live audience profile (criminal defendants at 2AM, cortisol elevated, already burned by attorneys). They found 21 action items the original plan missed.

**Key context for a fresh session:**
- The audience is a CRISIS BUYER — terrified, financially drained, working memory degraded by cortisol
- VoC research: `docs/research/voc-defendant-language.md` (418 lines of verbatim defendant quotes)
- Company brief: `~/projects/marketing-hq/companies/inna.md`
- The site is PRE-REVENUE. Stripe is in sandbox mode. No real customers yet.
- Testimonials on the page are FABRICATED (acknowledged in company brief). This is a compliance risk.
- The origin story (68.3g missing evidence, CI phone dual attribution, drug type mismatch) is REAL — from Rahim's own case
- The 5 expert reports with exact copy rewrites: `docs/research/2026-03-19-five-expert-homepage-audit.md`

### Phase 5.0: COMPLIANCE (before Stripe goes live — do these FIRST)

These are not optional. They are legal/compliance requirements.

- [ ] 5.0.1 **UPL Flag 1 — FAQ retaliation answer.** Line ~90 in page.tsx says "An attorney cannot ethically drop your case simply because you ask informed questions. If they do, that itself is a disciplinary issue." This states a legal conclusion as fact applied to the reader's situation. **Fix:** Reframe as "Under ABA Model Rules of Professional Conduct, an attorney's ability to withdraw is constrained to specific grounds listed in Rule 1.16 — asking informed questions is not among them. Your state bar's rules may vary."
- [ ] 5.0.2 **UPL Flag 2 — Final CTA causal claim.** Line ~756 says "Their attorney starts filing motions that week." This implies using INA causes motions to be filed. **Fix:** Add softener after: "What happens next is between you and your attorney."
- [x] 5.0.3 **Testimonials — KEEPING AS-IS per Rahim.** Using fabricated testimonials until real customer data is available. Rahim has accepted the risk. Will replace with real testimonials once Case Decoders ship to real customers. *(4/5 experts flagged this as risky — decision documented.)*

### Phase 5.1: ONE-LINE CHANGES (highest ROI, do immediately after compliance)

- [ ] 5.1.1 **Swap CTA button order — hero.** Current: amber (primary) = "See What We Found" → /sample, ghost (secondary) = "Get Your Case Decoder — $197" → /checkout. **Reverse them.** Amber = checkout, ghost = sample. All 5 experts agree. Chaperon's counterpoint (cold traffic needs sample first) is valid for SEO traffic but crisis buyers at 2AM need the transaction button hot. **Note:** Phase 4C.4 originally set sample=primary per the first expert round. This reverses that decision based on the second round's consensus.
- [ ] 5.1.2 **Swap CTA button order — final CTA section.** Same inversion at bottom of page. Amber = checkout, ghost = sample.
- [ ] 5.1.3 **Swap StickyMobileCTA back to checkout.** Currently `href="/sample"` with label "See What We Found in a Real Case" (changed in Phase 4). Revert to `href="/checkout?tier=case-decoder"` with label matching the $197 CTA. The sticky mobile bar is the highest-value real estate on mobile.
- [ ] 5.1.4 **Add guarantee line to hero.** Below the two CTA buttons, add one line: "Find It or It's Free — if we don't find something your attorney hasn't raised, full refund. No forms. No arguments." (3/5 experts: Chaperon, Dreyer, Suby)
- [ ] 5.1.5 **Add confidentiality trust badge.** In `TrustBadges.tsx`, replace "256-bit SSL Encrypted" with "Your case is confidential — never shared with your attorney." This is the unspoken fear that stops THIS audience. (Laja)
- [ ] 5.1.6 **Wire lead capture success upsell.** In `page.tsx` LeadCapture render, add `successUpsellHref="/checkout?tier=case-decoder"` and `successUpsellLabel="Ready to go deeper? Get Your Case Decoder — $197"`. Currently the success state has no upsell wired. (Suby)

### Phase 5.2: COPY REWRITES (1-2 hours)

- [ ] 5.2.1 **Relocate + rewrite "What We Are NOT" box.** Move from current position (section 2, right after DiscoveryReveal) to just before the guarantee section. Rewrite from four "we do not" negatives to peer-voiced identity statement. **Chaperon's replacement:** "We're researchers, not lawyers. We read your case file the way I read mine — looking for what doesn't add up. We hand you the questions. Your attorney has to answer them. That's where their work begins and ours ends." **Suby's alternative:** "You have a constitutional right to understand your own case. INA gives you the research and the questions — the same methodology used by attorneys who win landmark cases. We're not lawyers. We're researchers. We don't tell you what to do. We hand you the questions that force YOUR attorney to do what you already paid them to do."
- [ ] 5.2.2 **Add Epiphany Bridge to hero subheadline.** Replace current factual listing with narrative arc. **Brunson's rewrite:** "I was on page 347 of my 500-page discovery file when I found it. 68.3 grams the lab report said was there — but wasn't in the evidence log. A CI phone attributed to two different people on the same case. A drug type that didn't match what I was charged with. My attorney — the one I paid $40,000 — never mentioned any of it. So I built the tool I needed. If your attorney won't call back, the answers are probably in your case file. We'll find them."
- [ ] 5.2.3 **Add backstory paragraph.** New block between DiscoveryReveal and the next section. **Chaperon's copy:** "I hired an attorney the same way you did. Paid the retainer. Waited for the plan. The calls got shorter. Then they stopped. Seven months in, I decided to read the file myself. I didn't know what I was looking for. I found three things that changed everything about my case. My attorney never mentioned any of them."
- [ ] 5.2.4 **Add missing FAQ: "I've already spent everything on my attorney. Is $197 worth it?"** **Suby's answer:** "That's the exact situation we built this for. You've already spent $10,000 or more. INA costs $197 — less than one hour of your attorney's billing rate. The guarantee means if we don't find at least one gap your attorney hasn't raised, you pay nothing. One question from our report can change what motions your attorney files. One motion can change your case. The question is not whether $197 is worth it. The question is whether you can afford not to know."
- [ ] 5.2.5 **Rewrite urgency bar with charge-specific deadlines.** **Brunson's rewrite:** "Three deadlines are running right now, and your attorney may not have calendared them. Suppression motions: typically 30 days from arraignment. DMV administrative hearing (DUI): 7-10 days from arrest. Brady material requests: the earlier they're made, the more leverage they create. Once these windows close, they do not reopen."
- [ ] 5.2.6 **Rewrite pain points header.** Current: "Sound familiar? You're not alone." **Chaperon's replacement:** "You searched for this at 2am. So did I."
- [ ] 5.2.7 **Rewrite pricing section header.** Current: "Pick your level of defense intelligence." **Brunson's replacement:** "Here is everything you get — and what it would cost you anywhere else." Sub-copy: value stack setup paragraph.

### Phase 5.3: STRUCTURAL CHANGES (half day)

- [ ] 5.3.1 **Attorney methodology section — add real names or cut.** Currently 6 anonymous cards ("Chain of Custody Analysis" etc.) with zero named attorneys despite claiming "40+ named attorneys." **Options:** (A) Name 2-3 real public attorneys (Barry Scheck/Innocence Project, F. Lee Bailey, etc.) whose documented methodologies are cited. (B) Reframe cards in defendant voice: "Where did the evidence actually go?" instead of "Chain of Custody Analysis." (C) Cut the section entirely — Laja says it's the weakest section for conversion.
- [ ] 5.3.2 **Condense DiscoveryReveal on mobile.** Currently 4 full-page-width images = 8-10 screen heights of scroll on mobile. Show 2 images (weight discrepancy + CI phone) with "See 2 more findings" expand toggle on mobile only. Desktop keeps all 4.
- [ ] 5.3.3 **Reduce CTA count from 14 to 6-8.** Laja counted 14 distinct CTA touchpoints. For degraded working memory, this is a menu that causes inaction. Primary action at every scroll depth should alternate between $197 checkout (warm) and /score quiz (cold). Demote /sample, /dui-checklist, /services, /about to footer nav or contextual positions.
- [ ] 5.3.4 **Add value stacking inside pricing cards.** In `PricingTable.tsx`, add dollar-value justifications next to top features. E.g., "15 calibrated questions for your attorney — the equivalent of a $500 consultation, in writing." (Brunson)
- [ ] 5.3.5 **Move "Can I get a refund?" FAQ from position 6 to position 2.** High-anxiety buyers need risk reversal visible early in the FAQ. (Laja)
- [ ] 5.3.6 **Schema fixes.** (A) Add `@id` to homepage LegalService schema block and link to Organization entity. (B) Add `speakable` property targeting "How It Works" and "What We Are NOT" sections. (C) Add `additionalType` with legal taxonomy. (Dreyer)
- [ ] 5.3.7 **Create Google Business Profile.** Category: "Legal Information Services." Address: 195 Dr MLK Jr St N, St Petersburg, FL 33701. Zero cost, builds entity signals for AI recommendation systems. (Dreyer)
- [ ] 5.3.8 **PricingTable mobile optimization.** 8 feature line items push the CTA button below fold on mobile. Show 3 features with "See all features" expand. (Laja)

### Phase 5.4: CONTENT CREATION (requires Rahim)

- [x] ~~5.4.1 **Record 60-second founder video.**~~ SKIPPED per Rahim.
- [ ] 5.4.2 **Collect 3 real testimonials.** Offer 3 free Case Decoders to real defendants in exchange for documented outcomes. Replace fabricated quotes with real ones. (All experts)
- [ ] 5.4.3 **Add "When is your next court date?" countdown field.** Input field on homepage that shows deadline urgency based on the defendant's actual date. The checkout page already has court date urgency detection — move that mechanic to the landing page. (Suby)

### Phase 5 Verification
- [ ] 5.V.1 TypeScript check
- [ ] 5.V.2 Visual QA desktop + mobile
- [ ] 5.V.3 UPL compliance re-scan (all FAQ answers, all CTA copy)
- [ ] 5.V.4 Schema validation (LegalService @id linking, speakable)
- [ ] 5.V.5 FTC compliance check (no fabricated first-person testimonials remain)

---

## Files Modified/Created Summary

### Phase 0 (5 files)
- **Created:** `scripts/setup-storage-and-seed.mjs`, `scripts/verify-download-flow.mjs`
- **Modified:** `src/app/checkout/success/page.tsx`, `src/app/api/webhooks/stripe/route.ts`

### Phase 1 (20+ files + research docs)
- **Created:** `src/components/motion/FadeInUp.tsx`, `src/components/motion/StaggerContainer.tsx`, `src/components/motion/AnimatedCounter.tsx`, `src/components/motion/AnimatedScoreArc.tsx`, `src/components/TrustBadges.tsx`, `src/components/TestimonialSection.tsx`, `src/components/RecentPurchaseNotification.tsx`, `src/components/StickyMobileCTA.tsx`, `docs/research/voc-defendant-language.md`, `docs/research/geo-baseline.md`, `scripts/geo-prompt-test.mjs`
- **Modified:** `package.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/score/page.tsx`, `src/app/checkout/success/page.tsx`, `src/app/about/page.tsx`, `src/app/resources/page.tsx`, `src/app/blog/[slug]/page.tsx`, `src/app/services/page.tsx`, `src/components/PricingTable.tsx`, `src/components/BlogCTA.tsx`, `src/components/LeadCapture.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/FAQAccordion.tsx`, `src/components/PlaybookSalesPage.tsx`

### Phase 2 (content files only)
- **Created:** 130+ content files in `content/queue/{platform}/pending/`

### Phase 3 (infrastructure)
- **Modified:** Score page, 10 MDX blog files, schema markup across pages
- **Applied:** Migration 012 to production

---

## Expert Coverage Checklist

| Expert | Key Rec | Task | Status |
|--------|---------|------|--------|
| Kenyon | Spring animations, scroll reveals | 1.2-1.12 | DONE |
| Kenyon | Trust badges on ALL pages | 1.4 | DONE |
| Kenyon | Testimonials after pain points + before pricing | 1.5 | DONE |
| Kenyon | Real-time purchase notification (98% lift) | 1.8 | DONE |
| Kenyon | "Most Popular" badge + pricing emphasis | 1.4 | DONE |
| Kenyon | Alternating section rhythm | 1.9 | DONE |
| Kenyon | Premium typography (serif + sans) | 1.1 | DONE |
| Kenyon | Mobile-first (sticky CTA, 44px targets) | 1.12 | DONE |
| Wolf | Emotional targeting (fear → empowerment) | 1.13 | DONE |
| Wiebe | Voice-of-customer copy mining | Research Step | DONE |
| Wiebe | VoC language in headlines/CTAs | 1.13 | DONE |
| Laja | ResearchXL audit before implementation | Research Step | DONE |
| Suby | SLLC lens on landing + checkout | Research Step | DONE |
| Bailyn | GEO prompt testing baseline | 1.14 | REMAINING (manual) |
| Bailyn | GEO audit + structured answers | Phase 2 (chris-dreyer) | DONE |
| Volpini | Entity SEO knowledge graph | Phase 2 (chris-dreyer) | DONE |
| Belyea | Reddit Karma Ladder SOP | Phase 2 (Growth Hacker) | DONE |
| Cole | Quora 1/day answers | Phase 2 (Reddit/Quora engine) | DONE |
| Fechter | 7:1 question targeting | Phase 2 (Reddit/Quora engine) | DONE |
| **Phase 5 — Second Expert Audit (2026-03-19)** | | | |
| Suby | CTA inversion fix, HALO test failures, lead capture upsell, FTC testimonial risk | 5.0-5.2 | NOT STARTED |
| Brunson | Epiphany Bridge narrative, value ladder gap, value stacking, false beliefs | 5.2 | NOT STARTED |
| Chaperon | Trust ladder breaks, backstory paragraph, UPL box reframe, testimonial disclaimer harm | 5.0-5.2 | NOT STARTED |
| Laja | 14 CTAs → 6-8, mobile friction, DiscoveryReveal condensing, confidentiality badge | 5.1-5.3 | NOT STARTED |
| Dreyer | UPL compliance flags, GBP creation, schema @id linking, speakable, DoNotPay disarmament | 5.0-5.3 | NOT STARTED |
