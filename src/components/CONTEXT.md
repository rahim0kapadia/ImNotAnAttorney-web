# UI Components — src/components/

> 45 React components. Server Components by default; client components marked `"use client"` for interactivity.

## Component Groups

### Layout & Navigation
| File | Purpose | Client |
|------|---------|--------|
| `Header.tsx` | Sticky nav bar, responsive mobile menu (hamburger + Escape close) | Yes |
| `Footer.tsx` | 5-column grid footer: brand, nav, blog topics, services, legal + CAN-SPAM | No |
| `StickyMobileCTA.tsx` | Fixed bottom CTA bar, IntersectionObserver on hero `<section>` | Yes |
| `AdminNav.tsx` | Admin sidebar: Inbox, Demand Intel, Partners. Highlights via usePathname | Yes |
| `OperatorShell.tsx` | Operator dashboard layout wrapper | No |

### Homepage & Landing
| File | Purpose | Client |
|------|---------|--------|
| `HomepageHero.tsx` | Dynamic hero with charge selector + smart CTA routing | Yes |
| `ChargeTypeSelector.tsx` | 12-category picker with urgency one-liners, fires onSelect | Yes |
| `TestimonialSection.tsx` | Testimonial cards with inline/grid variants + FadeInUp | Yes |
| `TrustBadges.tsx` | Security, guarantee, Stripe, methodology badges (3 variants) | Yes |
| `RecentPurchaseNotification.tsx` | Social proof notifications | Yes |

### Pricing & Sales
| File | Purpose | Client |
|------|---------|--------|
| `PricingTable.tsx` | Tiered pricing grid (3-col base, 2-col premium, add-ons). maxTiers prop | No |
| `PlaybookSalesPage.tsx` | Shared long-form sales layout: Hero→Agitate→Proof→Value Stack→FAQ→CTA | No |
| `PlaybookCTA.tsx` | In-playbook CTA. Routes to live playbook or free Score Quiz | No |
| `BlogCTA.tsx` | Post-article CTA. CATEGORY_PLAYBOOK map routes to matching playbook | No |
| `LeadCapture.tsx` | Email form with multi-state UX. POSTs to `/api/subscribe`. Only used in /score post-quiz flow | Yes |
| `BlogInlineCapture.tsx` | Inline content card with category-specific checklist info + /score CTA (ungated, no email) | No |

### Blog & Content
| File | Purpose | Client |
|------|---------|--------|
| `BlogCard.tsx` | Post preview: date, reading time, title, excerpt (2-line clamp), tags | No |
| `BlogCategoryFilter.tsx` | Category filter pills, useRouter for instant navigation | Yes |
| `TLDRBox.tsx` | Key takeaway summary box | No |
| `MDXErrorBoundary.tsx` | Error boundary for MDX render failures | Yes |
| `SourceIntelligence.tsx` | Attorney methodology citations by post category | No |

### Case & Intake
| File | Purpose | Client |
|------|---------|--------|
| `IntakeChargeCategories.tsx` | Step 1: category picker for intake form | Yes |
| `IntakeChargeSelector.tsx` | Step 2: charge picker within category. Arrow-key nav, free-text option | Yes |
| `IntakeChargeQuestions.tsx` | Step 3: dynamic questions per charge type | Yes |
| `FileUpload.tsx` | Drag-and-drop uploader. 50MB max, sequential upload to `/api/upload` | Yes |
| `StatusBadge.tsx` | Unified status badge. Maps 20+ status values to color-coded styles | No |
| `DiscoveryGate.tsx` | Discovery tier verification gate | Yes |
| `ServicesFilteredContent.tsx` | Filtered services display | Yes |

### Sharing & Social Proof
| File | Purpose | Client |
|------|---------|--------|
| `ShareButtons.tsx` | SMS, WhatsApp, Email, Twitter, Facebook, Copy Link + UTM params | Yes |
| `QRCode.tsx` | QR code generation and display | Yes |
| `ReferralQuiz.tsx` | Referral engagement quiz | Yes |

### Motion/Animation (all Client Components)
| File | Purpose |
|------|---------|
| `motion/FadeInUp.tsx` | Fade-in from below (y: 24px, 0.5s, spring). Respects prefers-reduced-motion |
| `motion/StaggerContainer.tsx` | Stagger container + StaggerItem (0.1s delay). Respects prefers-reduced-motion |
| `motion/AnimatedCounter.tsx` | Animated number counter |
| `motion/AnimatedScoreArc.tsx` | Animated arc/gauge for score display |
| `motion/DiscoveryReveal.tsx` | Discovery-related reveal animation |

### Partner Portal
| File | Purpose | Client |
|------|---------|--------|
| `partner/PartnerApplicationForm.tsx` | Application form, POSTs to `/api/partners/apply` | Yes |
| `partner/PartnerCommissionTable.tsx` | Commission table display | No |
| `partner/PartnerHowItWorks.tsx` | Program mechanics explanation | No |
| `partner/PartnerWhyItWorks.tsx` | Value proposition display | No |
| `partner/index.ts` | Barrel export | N/A |

### Tier 9
| File | Purpose | Client |
|------|---------|--------|
| `tier9/AvailabilityChecker.tsx` | Pre-purchase data availability gate. 6 states (idle, checking, available, unavailable, waitlisted, error). POSTs to `/api/check-availability/[slug]`, renders coverage stats as `dl/dt/dd`, waitlist email capture on unavailable. WCAG AA: labeled inputs, aria-required, role="alert"/"status", aria-busy, focus management via refs. | Yes |

### Other
| File | Purpose | Client |
|------|---------|--------|
| `FAQAccordion.tsx` | Accessible accordion (aria-expanded, single-expand) | Yes |
| `MessageTemplates.tsx` | Message template display | No |
| `BridgePage.tsx` | Bridge/transition page | No |
| `CookieConsent.tsx` | GDPR/CCPA consent banner. Loads GA4, Meta Pixel, Google Ads only after accept. localStorage-backed decision (`cookie-consent` key) | Yes |

## Key Constants

| Constant | Value | File:Line |
|----------|-------|-----------|
| CATEGORY_TO_PLAYBOOK | 6 category→tier slug mappings | `HomepageHero.tsx:18-25` |
| CATEGORY_PLAYBOOK | 10 blog category→playbook mappings | `BlogCTA.tsx:15-26` |
| ADMIN_LINKS | Inbox, Demand Intel, Partners | `AdminNav.tsx:10-14` |
| FREE_TEXT_SLUG | `"__free_text__"` (other charge option) | `IntakeChargeSelector.tsx:32` |
| MAX_FILE_SIZE | 50MB | `FileUpload.tsx:40` |
| STATUS_STYLES | 20+ status→Tailwind class mappings | `StatusBadge.tsx:6-37` |
| TRUST_BADGES | 4 badges (confidentiality, guarantee, Stripe, methodology) | `TrustBadges.tsx:9-40` |
| FadeInUp defaults | y: 24px, duration: 0.5s, spring stiffness: 100 | `FadeInUp.tsx:19-40` |
| StaggerContainer delay | 0.1s between items | `globals.css:77` |

## Integration Points

**Imports from lib:**
- `TIER_CORE` from `tiers` (PricingTable, PlaybookSalesPage, BlogCTA, HomepageHero, StickyMobileCTA)
- `SITE_URL` from `site` (ShareButtons)
- `copyToClipboard` from `clipboard` (ShareButtons)

**Imports external:**
- `framer-motion` — all motion/* components + AnimatePresence
- `next/link`, `next/image`, `next/navigation` — Next.js primitives
- `lucide-react` — icons

**Consumed by pages:**
- Homepage → HomepageHero, ChargeTypeSelector, PricingTable, TrustBadges, TestimonialSection, StickyMobileCTA
- Blog → BlogCard, BlogCategoryFilter, BlogInlineCapture, BlogCTA, SourceIntelligence, ShareButtons
- Playbooks → PlaybookSalesPage
- Admin/Operator → AdminNav, StatusBadge, OperatorShell
- Partner → partner/* components
- Score → ShareButtons, QRCode, AnimatedScoreArc

## Gotchas

1. **THREE separate category routing maps exist.** `CATEGORY_TO_PLAYBOOK` (HomepageHero), `CATEGORY_PLAYBOOK` (BlogCTA), and charge-taxonomy. When adding a category, update ALL maps.

2. **StickyMobileCTA needs a `<section>` in the hero.** IntersectionObserver watches the first `<section>`. If no section exists, the CTA never appears.

3. **StatusBadge falls back to gray.** If a new DB status is introduced without adding it to `STATUS_STYLES`, it silently renders as zinc/gray. Add new statuses to the map.

4. **FileUpload is sequential, not parallel.** Large batches upload one-at-a-time. No per-file progress bars.

5. **LeadCapture only used in /score flow.** All other pages use ungated content + /score CTA links. Never add LeadCapture to blog, resources, or landing pages (Invariant #9: No Email Gatekeeping).

6. **Motion components respect `prefers-reduced-motion`.** They return plain divs when reduced motion is on. This is correct behavior, not a bug.

## How To

- **Add a component:** Create in `src/components/` (or subdirectory for groups). Add `"use client"` if it uses hooks/state. Export as named export.
- **Debug a component:** Check client vs server boundary first. Verify props from parent page. Use React DevTools for state. For animations, check `prefers-reduced-motion`.
- **Add component to a page:** Import it, pass required props. Wrap in FadeInUp/StaggerContainer for animation consistency. Test at 375px, 768px, 1024px.

## Maintenance Triggers

- **New charge category** → Update CATEGORY_TO_PLAYBOOK (HomepageHero) + CATEGORY_PLAYBOOK (BlogCTA)
- **New DB status value** → Add to STATUS_STYLES in StatusBadge.tsx
- **Pricing change** → Verify components read from TIER_CORE (not hardcoded)
- **New admin page** → Add link to ADMIN_LINKS in AdminNav.tsx
- **Animation timing change** → Check brand.md constraints
