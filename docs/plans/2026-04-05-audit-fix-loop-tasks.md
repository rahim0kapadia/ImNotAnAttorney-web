# Audit Fix Loop, Task 1 + Task 2

**Spec:** `C:\Users\email\projects\ImNotAnAttorney\docs\handoff\2026-04-05-audit-fix-loop-r1-r3.md`

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Services page lacks decision architecture (Hormozi/Laja); framer-motion 88KB on critical path (Russell/Perry/Roberts)
- **Key files:** DiscoveryGate.tsx, ServicesFilteredContent.tsx, services/page.tsx, FadeInUp.tsx, StaggerContainer.tsx, DiscoveryReveal.tsx, FAQAccordion.tsx, Header.tsx, ScoreClient.tsx, AnimatedCounter.tsx, AnimatedScoreArc.tsx
- **Tech stack:** Next.js 15, Tailwind CSS, framer-motion
- **Key decisions:** Keep framer-motion ONLY for ScoreClient + AnimatedScoreArc + AnimatedCounter; wrap in LazyMotion. All other animations to CSS + IntersectionObserver.
- **Setup:** `npm run build` to verify. TypeScript strict.

---

## Task 1: Services Page Decision Architecture (worktree agent)

**Expert source:** Hormozi (value equation, decision fatigue) + Laja (CRO, recommended badges)

### 1.1 Default DiscoveryGate to pre-discovery
**File:** `src/components/DiscoveryGate.tsx`
- Change `useState<TrackFilter>("all")` to `useState<TrackFilter>("pre-discovery")`

### 1.2 Add contextual copy after gate selection
**File:** `src/components/DiscoveryGate.tsx`
- Below buttons, contextual paragraph:
  - `pre-discovery`: "Most defendants start here, before receiving case documents. These services work from what you tell us about your charges."
  - `post-discovery`: "You have your case documents, these services analyze every page and find what doesn't add up."
  - `all`: no copy

### 1.3 Create RecommendedTier client component
**File:** `src/components/ServicesFilteredContent.tsx` (add export)
- Takes `slug: string`, `children: ReactNode`
- Reads `useDiscoveryFilter()` from context
- slug=case-decoder + filter pre-discovery or all: border-2 border-amber-500, amber pill "Recommended First Step"
- slug=x-ray + filter post-discovery or all: same treatment
- Otherwise: default styling

### 1.4 Wire up in services page
**File:** `src/app/services/page.tsx`
- Import RecommendedTier, wrap Case Decoder and X-Ray card divs

---

## Task 2: Replace framer-motion with CSS (worktree agent)

**Expert source:** Alex Russell, Matt Perry, Harry Roberts

### 2.1 FadeInUp.tsx, IntersectionObserver + CSS transition
### 2.2 StaggerContainer.tsx, CSS animation-delay + IntersectionObserver
### 2.3 DiscoveryReveal.tsx, IntersectionObserver per card
### 2.4 FAQAccordion.tsx, CSS grid-template-rows transition
### 2.5 Header.tsx, CSS transition for mobile menu
### 2.6 LazyMotion wrapper for ScoreClient remaining usage
