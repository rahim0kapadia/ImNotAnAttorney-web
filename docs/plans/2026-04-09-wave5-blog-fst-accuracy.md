# Wave 5 Blog Post: Field Sobriety Test Accuracy Review

**Date:** 2026-04-09
**Tier:** FEATURE (single content file)
**Owner:** Atti

## Goal

Ship a single MDX blog post that drives traffic to the `/services/fst-review` product ($97 Field Sobriety Test Accuracy Review) by ranking for "field sobriety tests accuracy" / "were your field sobriety tests correct" and converting 2 AM DUI-defendant readers.

## Scope

ONE file:

- `content/blog/were-your-field-sobriety-tests-correct.mdx`

No code changes. No component changes. No schema changes.

## Content Requirements

- 1,500-1,800 words
- Frontmatter: title (INAA voice, no "[2026]"), date 2026-04-09, tags, category: "dui-defense", excerpt, author, 3-4 FAQs
- TLDRBox component at top (structure matches `content/blog/am-i-eligible-for-expungement.mdx`)
- Inline CTA to `/services/fst-review`
- Free `/score` CTA at bottom
- UPL-safe: "may be challenged", "questions to ask" — no legal advice
- NHTSA-accurate numbers: HGN ~77%, Walk-and-Turn ~68%, One-Leg Stand ~65%, combined ~91% under ideal conditions only
- Voice: scene-hook open (2 AM gravel shoulder), short-long-short sentences, single-sentence paragraphs for emphasis, "Here's what nobody tells you:" / "Here's the dirty truth about..."
- No emojis, no corporate filler, no speed selling, no third-person

## Acceptance

- File written to `content/blog/were-your-field-sobriety-tests-correct.mdx`
- Frontmatter parseable by `src/lib/blog.ts`
- TLDRBox component correctly referenced
- Word count within 1,500-1,800
- All NHTSA claims sourced to NHTSA validation studies / training manual framing
- Inline link to `/services/fst-review` present
- `/score` CTA present at bottom

## Out of Scope

- Other Wave 5 posts (separate files, separate triage if needed)
- Product page edits
- Schema/SEO generator changes
- Any code outside `content/blog/`
