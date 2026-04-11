# Plan: Blog Pipeline V2 — Short-Form Crisis Content

**Status:** EXECUTED 2026-04-10 — Phases 1-4 complete, all modules verified
**Expert basis:** Sabri Suby (crisis buyer psychology, cascade: native), Andy Crestodina (blog data — 75% of readers prefer <1,000 words, Orbit Media 2025 Survey), Chris Dreyer (legal niche content strategy), Alex Hormozi (value equation — minimize effort/time delay denominator)
**Prototype:** `C:\Users\email\projects\ImNotAnAttorney-web\content\blog\_prototypes\what-happens-at-arraignment-v2.mdx` (1,134 words vs 2,357 original)

## Problem

Blog posts average 3,300 words. Readers are criminal defendants in crisis at 3AM on their phones, processing capacity reduced 80% by stress (Covello). Posts try to be comprehensive guides AND sales funnels AND SEO plays simultaneously. The length fights the reader's state.

## Solution

Rewrite the generation pipeline to produce 1,000-1,500 word posts that follow the Hormozi/For Dummies formula: validate → answer ONE question → arm with 2-3 actions → bridge to product. Every sentence carries weight. No filler, no scene-setting, no repeated structural patterns.

## The New Blog Template

```
FRONTMATTER (faqs: 3 questions, howToSteps: 3-4 steps)

TLDRBox:
  - One-sentence answer to the title question
  - Your Next Step: one 5-minute action

HOOK (2-3 sentences): Name the fear. Validate. Promise the answer.

## H2: What You Need to Know (300-400 words)
  The core answer. Insider detail. One bold screenshot sentence.

## H2: What to Do About It (200-300 words)
  2-3 concrete actions. Copy-paste questions for attorney. Checklist.
  One bold screenshot sentence.

## H2: The Mistake Most Defendants Make (150-200 words)
  One common error + how to avoid it. Builds trust through specificity.
  One bold screenshot sentence.

AGENCY CLOSE (2 sentences): You're not stuck. Here's the next move.

PRODUCT BRIDGE (3-4 sentences):
  "You got X for free. The [Product] gives you Y tailored to YOUR case."
  Link to checkout.

DISCLAIMER (1 sentence)

SOCIAL_SPINE (unchanged — metadata for social distribution)
```

**Target word count:** 1,000-1,500 words (body content, excluding frontmatter/SOCIAL_SPINE)
**Maximum:** 1,800 words (hard fail in QA gate)
**H2 sections:** 3-4 maximum
**H2 section length:** 200-400 words each (hard fail at 500+)

## Files to Change

### Phase 1: Voice Profiles (4 files)

**Files:**
- `content/voice-profiles/dui.md`
- `content/voice-profiles/drug.md`
- `content/voice-profiles/white-collar.md`
- `content/voice-profiles/general-defense.md`

**Changes to ALL four:**

1. Add to Section 1 (Voice Summary), first paragraph:
   ```
   **Word budget: 1,000-1,500 words body content. Maximum 1,800. Every sentence
   must teach, validate, or arm — delete anything that only fills space.**
   ```

2. Replace the anti-slop checklist line:
   ```
   REMOVE: - [ ] No "comprehensive" or "complete" in title unless 2,500+ words
   ADD:    - [ ] Total body content under 1,800 words
           - [ ] No more than 4 H2 sections
           - [ ] Each H2 section under 400 words
           - [ ] No scene-setting paragraphs (fluorescent lights, sweaty palms)
           - [ ] No repeated structural transitions ("So the real question becomes", "But here's what nobody mentions")
           - [ ] Product bridge connects free value → paid depth (not a bolted-on CTA)
   ```

3. Add new section after DO/DON'T examples:
   ```
   ## Structure Template

   Every post follows this skeleton:
   1. Hook (2-3 sentences) — name the fear, validate, promise the answer
   2. TLDRBox — one-sentence answer + one 5-minute action
   3. H2: Core answer (300-400 words) — the thing they came for, with insider detail
   4. H2: Actions (200-300 words) — 2-3 things to do RIGHT NOW
   5. H2: Common mistake (150-200 words) — one error + how to avoid it
   6. Agency close (2 sentences) — competence, not fear
   7. Product bridge (3-4 sentences) — free value → paid depth for YOUR case

   Total: 1,000-1,500 words. The reader finishes in 3-4 minutes on their phone.
   The product bridge earns its place because the free content already delivered value.
   ```

### Phase 2: DNA Gate Rules (1 file)

**File:** `scripts/lib/blog-gen/qa-dna.mjs`

**Changes to D10_PHONE_FIRST:**
```
CURRENT: "every H2 section fits in roughly 300-500 words.
          FAIL if any single section exceeds 600 words before the next H2"

NEW:     "every H2 section fits in roughly 200-400 words.
          FAIL if any single section exceeds 500 words before the next H2,
          OR if total body content (excluding frontmatter, TLDRBox, SOCIAL_SPINE,
          and disclaimer) exceeds 1,800 words,
          OR if there are more than 4 H2 sections."
```

**Add D13_PRODUCT_BRIDGE (new check):**
```
D13_PRODUCT_BRIDGE: PASS if the post ends with a product bridge that
(a) names a specific INAA product by name (Case Decoder, Intelligence Brief,
    X-Ray, War Room, DUI Defense Playbook),
(b) connects the free content value to the paid product value
    ("you got X free, the product gives you Y for YOUR case"),
(c) does NOT use generic CTA language ("get started", "learn more",
    "check it out"). FAIL if the post ends with no product mention,
OR if the product is introduced without connecting it to the post's value.
NEEDS_WORK if the bridge exists but uses generic language.
```

Update `DNA_CHECKS_TOTAL` from 12 to 13.
Add "D13_PRODUCT_BRIDGE" to CHECK_IDS array.

### Phase 3: Humanizer Gate (1 file)

**File:** `scripts/lib/blog-gen/humanizer.mjs`

**Add new detector:** `repeated_structural_transition`
- Flag: posts that use the same transition phrase 3+ times
- Patterns: "But here's what nobody mentions", "So the real question becomes",
  "Here's the reality", "Here's the thing"
- Points: 15 per repeated pattern (hard fail at 3+)

### Phase 4: Generation Prompt (engine repo)

**File:** `C:\Users\email\projects\ImNotAnAttorney-engine\` — find the blog generation prompt template

**Key instruction to add:**
```
WORD BUDGET: 1,000-1,500 words of body content. Maximum 1,800.
Do NOT write a comprehensive guide. Write a crisis-response post.
The reader is on their phone at 3AM. They will spend 3-4 minutes reading.
Every sentence must validate, teach, or arm them with an action.
Delete anything that only fills space — scene-setting, redundant
transitions, repeated structural patterns, step-by-step procedures
that any attorney's website already covers.

The product bridge is NOT a CTA bolted to the end. It's the answer
to the question "what comes next?" The free content answered ONE
question well. The product handles the rest — tailored to THEIR case.
```

## What This Does NOT Change

- **FAQs** — keep all 3-5 FAQ entries. These are metadata for GEO/featured snippets, not body content.
- **SOCIAL_SPINE** — keep all social distribution metadata. Unchanged.
- **howToSteps** — keep for HowTo schema. Can be shortened to 3-4 steps.
- **Voice tone** — same warm, insider, peer voice. Just less of it.
- **Existing posts** — do NOT rewrite the 59 existing posts in this phase. Pipeline changes affect new posts only. Existing posts can be trimmed in a future sprint.

## Execution Order

1. Phase 1: Update 4 voice profiles (parallel — no dependencies)
2. Phase 2: Update DNA gate (depends on Phase 1 for alignment)
3. Phase 3: Update humanizer gate (independent)
4. Phase 4: Update engine generation prompt (depends on Phase 1)
5. Generate 1 test post through the pipeline to validate
6. Compare test post against prototype for quality

## Cascade Check

```
WHO:     Suby + Crestodina + Dreyer + Hormozi (synthesis)
SOURCE:  Sell Like Crazy ch.7, Orbit Media 2025 Survey, Rankings.io, $100M Offers
WHY:     Crisis readers need 3-minute answers, not 12-minute guides. Current
         pipeline produces content for the wrong reader state.
CASCADE:
  Us:          3x faster generation, 3x faster QA, lower LLM costs
  Reader:      Gets answer in 3 min instead of 12. Phone-scannable. Feels smart.
  Downstream:  Reader shares screenshot sentence to family → organic reach
  Ecosystem:   Sets standard for crisis content. Better intent match → Google rewards.
  Future-us:   59 posts to optionally trim later. New posts ship correctly from day 1.
  Adjacent:    Blog pipeline reusable for KDP/TasteDrop content engines.
```
