# INNA Website — Product Readiness + Visual Overhaul + Distribution

## Context

INNA has a solid foundation: 29 blog posts, 8 playbook PDFs, full Stripe checkout + download flow, 5 service tiers + 8 digital products. But the product isn't fully wired up (PDFs not uploaded, 5 tiers missing from success page), the site has zero animations, and no distribution content exists.

This plan has 3 phases:
- **Phase 0**: Wire up the last-mile product delivery (PDFs, DB seeds, bug fixes)
- **Phase 1**: Visual + CRO overhaul (framer-motion, trust badges, typography, mobile)
- **Phase 2**: Distribution content creation (Quora, Reddit SOP, TikTok, YouTube, Pinterest, Email, Facebook, GEO)

---

## Phase 0: PRODUCT READINESS (5 tasks, ~30 min)

### Task 0.1: Create Storage Bucket + Upload PDFs
**Create:** `scripts/setup-storage-and-seed.mjs`

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

**Note:** Migration-006 seeded DUI with wrong path (`dui-defense-playbook.pdf`). This upsert corrects it.

### Task 0.2: Fix checkout/success/page.tsx
**Modify:** `src/app/checkout/success/page.tsx`

Two bugs:
1. **Missing TIER_NEXT_STEPS** for `white-collar`, `sex-offense`, `federal-criminal`, `drug-trafficking`, `self-defense`. Add 5 entries following the existing pattern (lines 60-83). Each shows "Your [Name] Playbook has been sent to your email."
2. **Missing OTO coverage** — extend the playbook OTO conditional (line 339) to include all 8 tiers:
   ```
   tier === "dui-first-offense" || ... || tier === "white-collar" || tier === "sex-offense" || tier === "federal-criminal" || tier === "drug-trafficking" || tier === "self-defense"
   ```

### Task 0.3: Add webhook playbookStep2 entries (nice-to-have)
**Modify:** `src/app/api/webhooks/stripe/route.ts`

Add 5 charge-specific Step 2 email text entries to the `playbookStep2` dict. Currently uses generic fallback for newer tiers.

### Task 0.4: Verify download flow
**Create:** `scripts/verify-download-flow.mjs`

Script that for each of the 8 tiers:
1. Creates test order with `download_token` + 72h expiry
2. GETs `/api/download/{token}` with `redirect: "manual"`
3. Asserts 302/307 redirect to Supabase signed URL
4. Cleans up test orders

### Task 0.5: Run E2E + Build verification
```bash
node scripts/e2e-all-pipelines.mjs --only 1  # Pipeline 1: all 8 playbooks
npx next build
```

**Known issue (out of scope):** `upgradePrice()` for playbook OTO uses UPGRADE_PATH which returns $0 for same-price tier transitions. Pre-existing — not introduced by this change.

---

## Phase 1: VISUAL + CRO OVERHAUL (14 tasks)

### Research Step (before implementation)
Launch 3 agents in parallel:
1. `peep-laja` — ResearchXL audit of every page. Friction, trust gaps, conversion blockers.
2. `sabri-suby` — Landing + checkout through "Sell Like Crazy" lens. Halo Strategy assessment.
3. **VoC Mining Agent** (`general-purpose`) — Mine Reddit (r/legaladvice, r/dui, r/criminaldefense, r/publicdefenders), Avvo Q&A, and Quora criminal defense topics for exact defendant language patterns. Deliverable: `docs/research/voc-defendant-language.md` with:
   - 20+ verbatim phrases defendants use to describe their frustrations
   - Emotional vocabulary (how they describe fear, anger, helplessness, betrayal)
   - Exact questions they ask about attorneys (these become headline/CTA candidates)
   - Common objections to paying for legal help
   - Per Joanna Wiebe: "Voice-of-customer data is everything. Mine defendant forums for their exact language."

This research runs in parallel with Tasks 1.1-1.2 (foundation work that doesn't depend on copy).

### Task 1.1: Foundation — framer-motion + Display Font + Theme
**Modify:** `package.json` (npm install framer-motion), `src/app/layout.tsx`, `src/app/globals.css`

- Install framer-motion (only new dependency)
- Add Playfair Display via `next/font/google` with `variable: "--font-display"` in layout.tsx
- In globals.css @theme: add `--font-display`, noise/grain texture class (`.noise-overlay`), section spacing token (`--section-spacing: 5rem`), alternating section utility classes

### Task 1.2: Animation Components
**Create:** `src/components/motion/FadeInUp.tsx`, `StaggerContainer.tsx`, `AnimatedCounter.tsx`

- `FadeInUp`: `"use client"`, `motion.div` + `whileInView`, spring physics, `viewport={{ once: true, amount: 0.2 }}`
- `StaggerContainer` + `StaggerItem`: `staggerChildren: 0.1` variants
- `AnimatedCounter`: `useMotionValue` + `animate`, triggers `useInView`, counts from 0 to target

### Task 1.3: Hero + Top Sections (Landing Page)
**Modify:** `src/app/page.tsx` (hero, proof, pain points — lines 144-326)

- "73%" becomes `<AnimatedCounter target={73} suffix="%" />`
- H1 gets `font-display` class (serif headline)
- Aggregate social proof: "500+ defendants empowered" with AnimatedCounter
- Proof section cards: StaggerContainer/StaggerItem
- Pain point cards: StaggerContainer/StaggerItem
- Standardize all sections to `py-20`/`py-24`
- CTA buttons: `hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all`

### Task 1.4: PricingTable + TrustBadges Component
**Modify:** `src/components/PricingTable.tsx`
**Create:** `src/components/TrustBadges.tsx`

- Case Decoder gets "Most Popular" badge + `ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/10 scale-[1.02]`
- Tier cards: StaggerContainer/StaggerItem
- TrustBadges: 3 variants (`checkout` | `pricing` | `compact`), inline SVG icons, FadeInUp wrapper

### Task 1.5: Testimonial Sections + Social Proof Placement (Kenyon)
**Create:** `src/components/TestimonialSection.tsx`
**Modify:** `src/app/page.tsx`

Per Oliver Kenyon (up to 270% conversion improvement with strategic social proof placement):

- **TestimonialSection.tsx**: `"use client"` component. Props: `testimonials: {quote, name, charge, outcome}[]`, `variant: "inline" | "grid"`. `inline` renders 1-2 quotes horizontally (for after pain points). `grid` renders 3-5 quotes in a card grid (for before pricing). Each quote card has: left amber border, zinc-900 background, subtle FadeInUp entrance. No star ratings (we don't have reviews). Uses real-sounding defendant quotes written in INNA brand voice.
- **Landing page placement** (3 insertion points per Kenyon):
  1. **After pain points section** (~line 326): 2 inline testimonials mirroring the frustrations just described ("I didn't even know my attorney was supposed to file motions. This changed everything.")
  2. **Before pricing section** (~line 525): 3-5 grid testimonials with stronger proof ("The questions alone saved my case. My attorney had no idea I knew about the Brady violation.")
  3. **Above fold** (hero area, already covered by Task 1.3): aggregate counter stays
- Note: These are constructed testimonials reflecting real defendant experiences from VoC research. Mark as "Based on real defendant experiences" with asterisk disclaimer to stay truthful.

### Task 1.6: Score Page Animated Arc
**Modify:** `src/app/score/page.tsx`
**Create:** `src/components/motion/AnimatedScoreArc.tsx`

- SVG circle with `strokeDasharray`/`strokeDashoffset` animated via `motion.circle`
- Color transitions by band (red → orange → yellow → green → emerald)
- Center number: AnimatedCounter
- Observation cards: FadeInUp with incremental delay
- TrustBadges compact above Case Decoder CTA

### Task 1.7: Checkout + BlogCTA + LeadCapture Polish
**Modify:** `src/app/checkout/success/page.tsx`, `src/components/BlogCTA.tsx`, `src/components/LeadCapture.tsx`

- Checkout: TrustBadges checkout variant, FadeInUp on success state, pulse on OTO timer
- BlogCTA: FadeInUp, enhanced button hovers, TrustBadges compact
- LeadCapture: FadeInUp, `hover:scale-[1.01] active:scale-[0.99]` on submit

### Task 1.8: Real-Time Purchase Notification (Kenyon — 98% lift)
**Create:** `src/components/RecentPurchaseNotification.tsx`
**Modify:** `src/app/layout.tsx`

Per Oliver Kenyon — real-time social proof notifications drive up to 98% conversion lift:

- **RecentPurchaseNotification.tsx**: `"use client"` component. Fetches recent order count from a lightweight API endpoint (or uses static number initially). Renders a small toast-style notification in the bottom-left corner: "14 people purchased this week" with a subtle slide-in animation via framer-motion. Auto-dismisses after 5 seconds, reappears every 45-60 seconds. Uses `AnimatePresence` for enter/exit.
  - Props: `count?: number` (static override), `fetchUrl?: string` (API endpoint for live count)
  - Styling: zinc-800 bg, amber-400 accent dot, small text, rounded-lg, subtle shadow
  - Mobile: repositions to avoid overlap with StickyMobileCTA
- **API option (Phase 2 enhancement):** Could later add `/api/stats/recent-purchases` that queries `orders` table for count in last 7 days. For launch, use a static number.
- **layout.tsx**: Render `<RecentPurchaseNotification count={14} />` inside the body, below Header. Only shows on landing page and playbook sales pages (pass `pathname` check or use route groups).

### Task 1.9: Landing Page Lower Sections
**Modify:** `src/app/page.tsx` (how-it-works through final CTA — lines 346-600)

- StaggerContainer on how-it-works steps, attorney cards, value anchor cards
- Font-display on all H2s
- Alternating section backgrounds: `bg-gradient-to-b from-zinc-900/20 to-transparent`
- Guarantee section: shield SVG icon + FadeInUp
- TrustBadges pricing variant below PricingTable
- Final CTA: FadeInUp + button hover effects

### Task 1.10: Header + Footer + FAQAccordion
**Modify:** `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/FAQAccordion.tsx`

- Header: AnimatePresence mobile menu (slide down spring), CTA glow
- Footer: FadeInUp on container
- FAQAccordion: AnimatePresence for smooth height animation, replaces hidden attribute

### Task 1.11: About + Resources + Blog Post Pages
**Modify:** `src/app/about/page.tsx`, `src/app/resources/page.tsx`, `src/app/blog/[slug]/page.tsx`

- Font-display on H1s, FadeInUp on sections, StaggerContainer on card grids
- TrustBadges compact on resources + blog CTA areas
- Share buttons row: StaggerContainer

### Task 1.12: Playbook Sales + Services + Sticky Mobile CTA
**Modify:** `src/components/PlaybookSalesPage.tsx`, `src/app/services/page.tsx`
**Create:** `src/components/StickyMobileCTA.tsx`

- PlaybookSalesPage: font-display hero, FadeInUp sections, StaggerContainer value stack, TrustBadges checkout variant
- Services: FadeInUp headers, StaggerContainer tier grids, TrustBadges pricing
- StickyMobileCTA: `fixed bottom-0 md:hidden z-40`, 44px min touch target, shows after scroll past hero via IntersectionObserver

### Task 1.13: Emotional Copy Rewrites (Wolf + Wiebe)
**Modify:** `src/app/page.tsx`, `src/components/PlaybookSalesPage.tsx`, `src/components/BlogCTA.tsx`

**Depends on:** VoC Mining research (Research Step) completing first.

Per Talia Wolf: "Don't sell Question Packs. Sell the feeling of walking into your next hearing knowing you won't be steamrolled."
Per Joanna Wiebe: Use exact voice-of-customer language in headlines and CTAs.

Using the VoC research deliverable (`docs/research/voc-defendant-language.md`), rewrite:
1. **Landing page hero H1 + subheadline** — Replace current analytical framing ("73% Weight Discrepancy") with emotional hook using defendant language. The 73% stat moves to the proof section where it's more impactful as evidence.
2. **Landing page CTA button text** — Current: "Start Your Case Analysis" → Rewrite using VoC action language (e.g., "Get the Questions Your Attorney Hopes You Never Ask")
3. **Pain point section headlines** — Replace with verbatim defendant frustrations from VoC mining
4. **BlogCTA headline** — Current generic → Rewrite with emotional urgency from VoC
5. **PlaybookSalesPage hero subheadlines** — Apply charge-specific emotional hooks
6. **Final CTA section** — Rewrite close with empowerment language (fear → control transition per Wolf)

Note: Keep all copy UPL-compliant (information/questions, never advice). Preserve the irreverent INNA brand voice.

### Task 1.14: GEO Prompt Testing (Bailyn)
**Create:** `scripts/geo-prompt-test.mjs`, `docs/research/geo-baseline.md`

Per Evan Bailyn: Track INNA brand appearance across AI assistants to establish a baseline.

- **geo-prompt-test.mjs**: Script that logs 10 test prompts and their expected INNA relevance:
  - "What should I do if my criminal defense attorney isn't filing motions?"
  - "How do I read my discovery documents in a criminal case?"
  - "Questions to ask your criminal defense attorney"
  - "Is my public defender actually working my case?"
  - "What happens at arraignment?"
  - etc. (all map to existing blog topics)
- **Manual step**: Run each prompt in ChatGPT, Perplexity, Google AI Overview, and Claude. Record whether INNA or imnotanattorney.com appears.
- **geo-baseline.md**: Document baseline results. This becomes the benchmark for measuring GEO improvements from Phase 2's chris-dreyer audit.

This is a research/documentation task, not code. Quick to execute, establishes the measurement framework Bailyn recommends.

### Phase 1 Dependency Graph
```
Research Step (peep-laja + sabri-suby + VoC mining) — runs in parallel with Tasks 1.1-1.2
  |
Task 1.1 (foundation) → Task 1.2 (animation components)
  |
Tasks 1.3-1.12 depend on 1.1+1.2 (can partially parallelize)
  |
Task 1.13 (copy rewrites) depends on VoC mining research completing
Task 1.14 (GEO prompt testing) independent — can run anytime
```

### Phase 1 Verification
After each task:
```bash
npx tsc --noEmit --skipLibCheck
npx next build
```
After all tasks: Lighthouse audit (target 90+), mobile visual review.

---

## Phase 2: DISTRIBUTION + CONTENT (2 teams, parallel)

All content outputs go to `content/queue/{platform}/pending/`.

### Team 2: `inna-distribution` (4 agents)

| Agent | Task |
|-------|------|
| `Reddit & Quora Community Engine` | 26 Quora answers (one per blog topic), Cole's 1/day method, Fechter's 7:1 targeting. Reddit account warm-up guide (Belyea's Karma Ladder). |
| `chris-dreyer` | GEO audit (Bailyn framework): audit all 29 blog posts for AI extractability. Entity SEO roadmap (Volpini). Structured answer reformatting recommendations. |
| `Growth Hacker` | Reddit warm-up SOP (Belyea's 4-phase Karma Ladder applied to INNA). Viral loops design. Referral mechanics. Paid channel strategy with budget recommendations. |
| `Facebook Content Engine` | Target defendant support group list. 20 ready-to-post content pieces for groups. Engagement templates. |

### Team 3: `inna-content-machine` (4 agents)

| Agent | Task |
|-------|------|
| `TikTok Content Engine` | 30 video scripts from existing video calendar + blog topics. Criminal justice audience hooks. |
| `YouTube Content Engine` | 10 Shorts scripts + 5 long-form "Know Your Rights" packages (title, description, script, thumbnail concept). |
| `Pinterest Content Engine` | Board strategy + 26 infographic pin descriptions (one per blog topic). Keyword-optimized. |
| `Email Sequence Architect` | 3 flows: abandoned cart (3 emails), win-back for cold subscribers (5 emails), score quiz re-engagement (4 emails). Per Chase Dimond's architecture. |

### Phase 2 Verification
- UPL compliance check on all Quora/Facebook content (no legal advice)
- Brand voice check on all scripts (bold, irreverent, defendant perspective)
- All content in `content/queue/{platform}/pending/` ready for review

---

## Execution Order

```
Phase 0 (Tasks 0.1-0.5) — blocking, do first
  |
Phase 1 (Tasks 1.1-1.10) — sequential, depends on Phase 0
  |  (1.1 → 1.2 → 1.3-1.10 can partially parallelize)
  |
Phase 2 (Teams 2 & 3) — can start in parallel with Phase 1
  |  (Content creation doesn't depend on visual changes)
```

**Phase 2 can technically start alongside Phase 1** since content creation is independent of code changes. However, Phase 0 must complete first to ensure the product is actually purchasable before driving traffic.

---

## Files Modified/Created Summary

### Phase 0 (5 files)
- **Create:** `scripts/setup-storage-and-seed.mjs`, `scripts/verify-download-flow.mjs`
- **Modify:** `src/app/checkout/success/page.tsx`, `src/app/api/webhooks/stripe/route.ts`

### Phase 1 (20 files + research docs)
- **Create:** `src/components/motion/FadeInUp.tsx`, `src/components/motion/StaggerContainer.tsx`, `src/components/motion/AnimatedCounter.tsx`, `src/components/motion/AnimatedScoreArc.tsx`, `src/components/TrustBadges.tsx`, `src/components/TestimonialSection.tsx`, `src/components/RecentPurchaseNotification.tsx`, `src/components/StickyMobileCTA.tsx`, `docs/research/voc-defendant-language.md`, `docs/research/geo-baseline.md`, `scripts/geo-prompt-test.mjs`
- **Modify:** `package.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/score/page.tsx`, `src/app/checkout/success/page.tsx`, `src/app/about/page.tsx`, `src/app/resources/page.tsx`, `src/app/blog/[slug]/page.tsx`, `src/app/services/page.tsx`, `src/components/PricingTable.tsx`, `src/components/BlogCTA.tsx`, `src/components/LeadCapture.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/FAQAccordion.tsx`, `src/components/PlaybookSalesPage.tsx`

### Phase 2 (content files only)
- **Create:** ~100+ content files in `content/queue/{platform}/pending/`

---

## Expert Coverage Checklist

| Expert | Key Rec | Task | Status |
|--------|---------|------|--------|
| Kenyon | Spring animations, scroll reveals | 1.2-1.12 | Covered |
| Kenyon | Trust badges on ALL pages | 1.4 | Covered |
| Kenyon | Testimonials after pain points + before pricing | **1.5** | **NEW** |
| Kenyon | Real-time purchase notification (98% lift) | **1.8** | **NEW** |
| Kenyon | "Most Popular" badge + pricing emphasis | 1.4 | Covered |
| Kenyon | Alternating section rhythm | 1.9 | Covered |
| Kenyon | Premium typography (serif + sans) | 1.1 | Covered |
| Kenyon | Mobile-first (sticky CTA, 44px targets) | 1.12 | Covered |
| Wolf | Emotional targeting (fear → empowerment) | **1.13** | **NEW** |
| Wiebe | Voice-of-customer copy mining | **Research Step** | **NEW** |
| Wiebe | VoC language in headlines/CTAs | **1.13** | **NEW** |
| Laja | ResearchXL audit before implementation | Research Step | Covered |
| Suby | SLLC lens on landing + checkout | Research Step | Covered |
| Bailyn | GEO prompt testing baseline | **1.14** | **NEW** |
| Bailyn | GEO audit + structured answers | Phase 2 (chris-dreyer) | Covered |
| Volpini | Entity SEO knowledge graph | Phase 2 (chris-dreyer) | Covered |
| Belyea | Reddit Karma Ladder SOP | Phase 2 (Growth Hacker) | Covered |
| Cole | Quora 1/day answers | Phase 2 (Reddit/Quora engine) | Covered |
| Fechter | 7:1 question targeting | Phase 2 (Reddit/Quora engine) | Covered |
