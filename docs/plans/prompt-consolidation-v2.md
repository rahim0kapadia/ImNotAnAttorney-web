# Plan: Blog Generation Prompt Consolidation

**Status:** READY TO EXECUTE
**Depends on:** Blog Pipeline V2 (executed 2026-04-10)
**Expert basis:** The /simplify review agents identified 3 critical contradictions, 6x duplicated word budget, and ~30% token bloat in the assembled generation prompt. No new expert triangulation needed, this is mechanical deduplication guided by the review findings.

## Problem

The blog generation prompt (`ImNotAnAttorney-engine/src/lib/blog-gen/prompts.mjs`) assembles ~10,900 tokens of instructions to produce a 1,300-2,000 token output (5.5-8.4:1 ratio). The prompt was designed for 1,500-3,000 word posts and now targets 1,000-1,500 words, but the instruction volume was never reduced. Three separate sections define post structure with conflicting requirements, the word budget is stated 6 times, and the LLM receives contradictory constraints it cannot satisfy simultaneously.

## What This Fixes

| Issue | Current | After |
|-------|---------|-------|
| Structure authorities | 3 competing (STRUCTURE REQUIREMENTS, voice profile template, DNA block) | 1 authoritative (voice profile template, others reference it) |
| Word budget statements | 6 redundant | 1 authoritative + 1 enforcement (D10) |
| Banned phrase lists | 4 duplicated | 1 authoritative |
| PSYCHOLOGICAL ARCHITECTURE | Duplicates D9 + conflicts with banned phrases | Deleted |
| Hormozi patterns | "Mix all 5" in 3-4 sections (impossible) | "Pick 1-2 per post from 5" |
| V1 + V6 | Duplicate voice profile / conflict with D9 | Removed (covered elsewhere) |
| Voice profile DO/DON'T in prompt | 8 examples (~1,800 tokens) | 3 examples (~675 tokens) |
| Prompt-to-output ratio | 5.5-8.4:1 | ~3-4:1 |

## What This Does NOT Change

- **All 5 Hormozi patterns** remain available, instruction changes from "use all" to "pick 1-2"
- **All 9 content topics** from STRUCTURE REQUIREMENTS remain, they become suggested coverage for the 3 H2 sections, not separate mandatory sections
- **All virality principles V2-V5, V7** remain unchanged
- **All voice profile content** stays in the .md files, only the prompt injection is trimmed
- **All QA gates** unchanged (humanizer, DNA, anti-hallucination, slop, UPL)
- **Voice profile tone, vocabulary, emotional calibration** unchanged

## Files to Change

### Phase 1: Engine Prompt Consolidation (1 file)

**File:** `C:\Users\email\projects\ImNotAnAttorney-engine\src\lib\blog-gen\prompts.mjs`

**Change 1, Delete PSYCHOLOGICAL ARCHITECTURE section (lines ~289-296)**
Delete entirely. D9 in DNA_STRUCTURAL_REQUIREMENTS_BLOCK already covers Fear→Clarity→Agency with more precision and without the "professional help" conflict.

**Change 2, Replace STRUCTURE REQUIREMENTS (lines ~298-311)**
Replace 9-item mandatory list with:
```
## STRUCTURE REQUIREMENTS

Follow the Structure Template in the voice profile. The post has 3 H2 sections
(Core Answer, Actions, Common Mistake) plus hook, TLDRBox, agency close, and
product bridge. Total: 1,000-1,500 words. Maximum 1,800.

Fold these topics into the H2 sections where relevant (not as separate sections):
- What this charge actually means
- How the legal process works
- What factors affect outcomes
- What a defense attorney does in these cases
- 2-3 Reddit questions answered inline

FAQ section: minimum 3 Q&A pairs in frontmatter.

Product bridge: name a specific INAA product (Case Decoder, Intelligence Brief,
X-Ray, War Room), connect the free content value to the paid product value.
NEVER use "consult a licensed criminal defense attorney" or any variation,
see BANNED PHRASES above.
```

**Change 3, Update Hormozi block instruction (line ~82)**
Replace: `"Mix patterns across the post; do not reuse the same pattern for every section."`
With: `"Pick 1-2 of these patterns for the post. With 3 H2 sections, depth beats variety."`

**Change 4, Remove V1 and V6 from VIRALITY_CONVERGENCE_BLOCK**
- Delete V1 (scenario-first), already in every voice profile Opening Pattern + anti-slop checklist
- Delete V6 (modular sections), conflicts with D9 arc, implicit in 3-section structure
- Renumber remaining principles V1-V5

**Change 5, Delete VOICE AND STYLE "5-item list" rule (line ~217)**
Replace: `"- No bullet lists longer than 5 items, break into sub-sections instead"`
With: nothing. D5 (3-item rule) is stricter and sufficient.

**Change 6, Deduplicate word budget**
Keep the WORD BUDGET section (lines ~222-234) as the single authoritative statement.
Remove word count line from STRUCTURE REQUIREMENTS (handled by Change 2).
D10's "under 1,800 words" stays as enforcement context within the DNA block.

**Change 7, Remove "Active voice throughout" + "reading level" from VOICE AND STYLE**
These are already specified with more precision in every voice profile (Tone Spectrum section). Keep only rules NOT covered by voice profiles:
- Short paragraphs (2-4 sentences max)
- Use subheadings every 2-4 paragraphs
- Favor plain verbs
- Contractions preferred

### Phase 2: Voice Profile Prompt Trimming (4 files)

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-engine\content\voice-profiles\dui.md`
- `C:\Users\email\projects\ImNotAnAttorney-engine\content\voice-profiles\drug.md`
- `C:\Users\email\projects\ImNotAnAttorney-engine\content\voice-profiles\white-collar.md`
- `C:\Users\email\projects\ImNotAnAttorney-engine\content\voice-profiles\general-defense.md`

**Change 8, Trim DO/DON'T examples from 8 to 3 per profile**
Keep examples 1, 2, 3 (they establish the register). Remove examples 4-8.
The removed examples stay in the web repo copies for human reference, only the engine prompt injection copies are trimmed.

**Change 9, Trim Anti-Slop Checklist to category-specific items only**
Remove the ~14 shared items that duplicate the main prompt (word budget, H2 caps, scenario-first, agency close, banned phrases, stat sources, legal terms, "do this now", hedging stacks, sycophancy, orphan threats, identical-length lists, same-word sequences, conclusion mirroring).
Keep only category-specific items:
- DUI: 12 items (drunk driving, failed the test, shame minimizing, DMV qualifiers, etc.)
- Drug: 10 items (standalone "drugs", "caught with", "dealer", weight references, etc.)
- White-collar: 7 items (casual category label, "criminal" as noun, cooperation framing, etc.)
- General-defense: 0 items (all inherited items were shared)

For general-defense: add a one-line note: "Category-specific anti-slop: none beyond the shared checklist in the main prompt."

**Change 10, Remove duplicate word budget from voice profile header**
Delete the `**Word budget: 1,000-1,500...**` line from Section 1 of each profile. The word budget is stated in the main prompt's WORD BUDGET section and in the Structure Template. Three is redundant.

### Phase 3: Sync + Config (2 files)

**Change 11, Sync engine voice profiles to web repo**
After Phase 2 edits, copy engine voice profiles back to web repo:
```
cp engine/content/voice-profiles/*.md web/content/voice-profiles/
```
Note: web repo keeps the full 8-example versions for human reference. Engine copies are the trimmed prompt injection versions. This means they intentionally diverge, document this in both repos.

Actually, REVISED approach: keep web repo as the full reference copies (8 examples, full checklist). Engine copies are trimmed for prompt injection. Add a comment at the top of each engine voice profile:
```
<!, PROMPT-INJECTION COPY: Trimmed for token efficiency. Full reference version
     at ImNotAnAttorney-web/content/voice-profiles/. Do not edit here, edit the
     web repo version and re-trim.,>
```

**Change 12, Update engine config.mjs**
- `blog_generate: 8192` → `blog_generate: 4096`
- Update comment: `// MDX blog post (1,000-1,500 words + frontmatter + SOCIAL_SPINE)`
- `blog_qa_dna` comment: `// JSON array of 10 check results` → `// JSON array of 13 check results`

### Phase 4: Verify (no file changes)

**Step 13, Build and test the assembled prompt**
```javascript
const prompt = buildGenerationPrompt(testGap, testEnrichment);
console.log('Prompt length:', prompt.length, 'chars');
// Target: <30,000 chars (was ~42,000)
```

**Step 14, Verify no functionality lost**
Grep the assembled prompt for each required element:
- Word budget present (1x)
- Banned phrases present (1x)
- TLDRBox requirement present
- D3, D5, D9, D10, D11, D12, D13 all present
- Hormozi patterns all listed
- V2, V3, V4, V5, V7 all present
- Structure Template referenced
- Anti-hallucination contract present
- SOCIAL_SPINE template present
- FAQ frontmatter template present

**Step 15, Run prototype through humanizer to confirm no regression**
```
node -e "import('./scripts/lib/blog-gen/humanizer.mjs').then(m => { ... })"
```

## Execution Order

1. Phase 1: Engine prompt consolidation (Changes 1-7, sequential, same file)
2. Phase 2: Voice profile trimming (Changes 8-10, parallel across 4 files)
3. Phase 3: Sync + config (Changes 11-12)
4. Phase 4: Verify (Steps 13-15)

## What This Does NOT Touch

- Web repo voice profiles (remain full reference copies)
- QA gate files (qa-dna.mjs, humanizer.mjs, qa-slop.mjs, qa-upl.mjs, qa-anti-hallucination.mjs)
- Blog rendering (blog.ts)
- Any existing blog posts
- Supabase schema
- Any UI components

## Cascade Check

```
WHO:     Review agents (code reuse, quality, efficiency)
SOURCE:  /simplify analysis of assembled prompt
WHY:     Contradictions cause unpredictable output; duplicates waste tokens and
         generation time; 5.5-8.4:1 prompt ratio is excessive.
CASCADE:
  Us:          ~40% fewer input tokens per generation = lower cost, faster generation
  Reader:      More consistent post structure (one authority, not three)
  Downstream:  Fewer QA failures from contradictory instructions = fewer regeneration cycles
  Ecosystem:   Cleaner prompt pattern reusable for KDP/TasteDrop content engines
  Future-us:   One place to edit structure, word budget, banned phrases, not 6
  Adjacent:    Engine prompt becomes a reference for prompt consolidation methodology
```
