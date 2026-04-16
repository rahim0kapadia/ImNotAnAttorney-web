# Blog Virality Retrofit, Batch V1-V7 Upgrade

**Date:** 2026-04-09
**Tier:** FEATURE (batch content upgrade)
**Owner:** Atti
**Repo:** ImNotAnAttorney-web (content files) + ImNotAnAttorney-engine (Claude gateway)

## Context

| Field | Value |
|-------|-------|
| **Repo** | ImNotAnAttorney-web + ImNotAnAttorney-engine |
| **Problem** | 59 existing blog posts lack V1-V7 virality principles, D11 screenshot sentences, D12 shareable FAQs, and SOCIAL_SPINE metadata. Audit shows D11 is universal FAIL, V1 mostly FAIL, SOCIAL_SPINE universal FAIL. |
| **Key files** | `C:\Users\email\projects\ImNotAnAttorney-web\content\blog\*.mdx` (59 files), `C:\Users\email\projects\ImNotAnAttorney-engine\src\lib\blog-gen\prompts.mjs` (upgrade prompt source) |
| **Tech stack** | Node.js script, Claude Opus via engine headless gateway, MDX files |
| **Key decisions** | Standalone batch script (not engine worker), one-time operation, reads/writes filesystem. Preserve existing content quality, upgrade structure, don't rewrite substance. Process in batches of 5 to avoid rate limits. |
| **Setup** | Engine headless gateway must be running. Script reads from web repo, writes back to web repo. |

**Spec:** No formal spec, requirements derived from virality convergence research (Berger/Simmonds/Hoyos/Bush/Cole/Do/Forman/Tadros/Covello). Principles encoded in `C:\Users\email\projects\ImNotAnAttorney-engine\src\lib\blog-gen\prompts.mjs` (V1-V7 block, D11-D12 in DNA block, SOCIAL_SPINE in output format).

## Approach Decision

**Chosen:** In-session batch processing using parallel agents. Each agent takes 5-6 posts, reads them, applies V1-V7 upgrades directly. No external API calls needed, Claude Code IS the LLM.

**Why:** Anthropic credits are depleted (can't call API). Engine headless gateway requires the engine to be running locally. But Claude Code itself can read each post, understand V1-V7 principles, and rewrite. Parallel agents = 10 posts at a time.

**Rejected:**
- Engine worker approach: requires running engine locally + new job type + migration for tracking. Overkill for one-time operation.
- Sequential in-session: 59 posts × ~2 min each = 2+ hours sequential. Parallel agents cut this to ~30 min.

## Upgrade Spec Per Post

Each post gets these changes (preserve all existing content that already passes):

1. **V1, Scenario-first H2 openers:** Rewrite each H2 section opener to start with a 1-2 sentence scene in present tense. Keep the existing content after the scene.
2. **V5, But/Therefore pivot:** Add one "But here's what nobody tells you:" or equivalent pivot per H2 section if missing.
3. **D11, Screenshot sentence:** Bold exactly one sentence per H2 section (<27 words, standalone, shareable). If existing bold serves this purpose, keep it.
4. **V4, 5-minute action:** Ensure each H2 has or implies one thing the reader can do in 5 minutes. Add if missing.
5. **D12, FAQ upgrade:** Rewrite FAQ answers as standalone peer-voice blocks (2-4 sentences, no preamble, direct answer first).
6. **SOCIAL_SPINE:** Append metadata comment block at end of file.

**Do NOT change:** Title, frontmatter, TLDRBox, existing factual content, UPL compliance, links, product CTAs, statistics/sources. Only upgrade structure and formatting.

## Tasks

### Task 1: Build the upgrade prompt template
Create a reusable upgrade prompt that agents will use. Must encode V1-V7 rules with clear preserve/change boundaries.

### Task 2: Process batch 1 (posts 1-10)
Dispatch 2 parallel agents, 5 posts each. Each agent reads, upgrades, writes.

### Task 3: Process batch 2 (posts 11-20)

### Task 4: Process batch 3 (posts 21-30)

### Task 5: Process batch 4 (posts 31-40)

### Task 6: Process batch 5 (posts 41-50)

### Task 7: Process batch 6 (posts 51-59)

### Task 8: Verification
- TypeScript check (frontmatter still parseable)
- Spot-check 5 posts for V1-V7 compliance
- Grep for UPL violations (banned phrases)
- Word count check (no post shrank below 1500 words)

### Task 9: Commit
Single commit with all 59 upgraded posts.

## Acceptance

- All 59 posts have D11 screenshot sentences (bolded, <27 words, per section)
- All 59 posts have SOCIAL_SPINE metadata comment
- All 59 posts have V1 scenario-first H2 openers
- All 59 posts have V5 but/therefore pivots
- Zero UPL violations introduced
- All frontmatter still parseable by src/lib/blog.ts
- No post under 1500 words
