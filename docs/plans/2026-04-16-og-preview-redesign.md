# OG Preview Redesign — Premium, Brand-Anchored, Page-Specific

**Goal:** Every link preview on imnotanattorney.com looks premium, relates to its page content, and represents the INAA brand. Current previews too sparse, low-contrast, no category framing. Root OG returns 500 (satori flex bug).

**Architecture decision:** Fix the engine — `src/lib/og-template.tsx` — so all 32 previews upgrade simultaneously (fix-engine rule). Migrate 3 inline OG files (root, blog/[slug], playbook/[slug]) onto the shared template so every preview inherits the new design.

**Design spec (already implemented in this session):**
1. Split layout: content left 60%, decorative concentric-arc brand motif right 40% (amber, low-opacity, filled focal dot).
2. Top row: logo + wordmark + sub-tagline LEFT, category pill RIGHT (always-on page-type label).
3. Content block: Playfair title (56–76px adaptive), subtitle #a1a1aa (brand Text Muted, readable), optional amber stat line (specificity anchor — e.g., "$197 · Federal districts", "50-state coverage").
4. Footer rule + amber dot + URL LEFT, all-caps tagline "Legal Intelligence for Defendants" RIGHT.
5. Navy radial glow top-left for depth. Amber vertical accent bar far-left edge.

## Files to modify (15 callers currently pass `eyebrow`)
- src/app/playbooks/opengraph-image.tsx
- src/app/sample/opengraph-image.tsx
- src/app/sample-xray/opengraph-image.tsx
- src/app/score/opengraph-image.tsx
- src/app/plea-analyzer/opengraph-image.tsx
- src/app/dui-checklist/opengraph-image.tsx
- src/app/judge-report-card/opengraph-image.tsx
- src/app/similar-cases-analyzer/opengraph-image.tsx
- src/app/officer-background-check/opengraph-image.tsx
- src/app/district-court-intelligence/opengraph-image.tsx
- src/app/arrest-survival-kit/opengraph-image.tsx
- src/app/r/[code]/opengraph-image.tsx
- src/app/services/[slug]/opengraph-image.tsx
- src/app/tools/[slug]/opengraph-image.tsx
- src/app/guides/[slug]/opengraph-image.tsx

## Files to modify (13 simple callers, add category + optional stat)
- src/app/partners/opengraph-image.tsx
- src/app/partners/bondsman/opengraph-image.tsx
- src/app/about/opengraph-image.tsx
- src/app/contact/opengraph-image.tsx
- src/app/resources/opengraph-image.tsx
- src/app/family/opengraph-image.tsx
- src/app/idd/opengraph-image.tsx
- src/app/services/opengraph-image.tsx
- src/app/start/opengraph-image.tsx
- src/app/dui-defense/opengraph-image.tsx
- src/app/dui-defense/[state]/opengraph-image.tsx
- src/app/blog/opengraph-image.tsx
- src/app/partner/login/opengraph-image.tsx

## Files to rewrite (3 inline OG renderers → migrate to shared template)
- src/app/opengraph-image.tsx (root, fixes satori flex-children 500 bug)
- src/app/blog/[slug]/opengraph-image.tsx (per-post, build-time static)
- src/app/playbook/[slug]/opengraph-image.tsx (edge runtime, uses TIER_CORE)

## Files to modify (template itself, already done this session)
- src/lib/og-template.tsx (split layout + category + stat + concentric-arc motif)

## Tasks
1. Migrate 15 eyebrow callers to { category, stat }
2. Add category (and stat where specific) to 13 simple callers
3. Migrate 3 inline OG files to renderOgImage()
4. `npx tsc --noEmit --skipLibCheck` clean
5. Dev-render sample previews, visual check
6. Commit
