# Plan: Brand DNA Tagline Update — "The Legal System Has a File on You"

**Date:** 2026-04-17
**Scope:** FEATURE (multi-file brand DNA update across INAA ecosystem)
**User ask:** "The prosecution has a file on you, we help you build one on them" is too narrow. Upgrade to "The legal system has a file on you, we help you build one on them" for brand DNA across all INAA projects.

## Why Broader Beats Narrower
- "Prosecution" misses: PO violations, civil filings, sentencing prep, appeal contexts, pretrial detention
- "Legal system" is all-encompassing — applies to every tier + every buyer persona
- OG template already ships the new version (`src/app/opengraph-image.tsx:15`)

## Files to Modify

### INAA-web brand canonical
1. `.claude/rules/brand-voice.md` — add long-form tagline under primary tagline, note "legacy copy → update" rule, note scene-specific usages stay.

### Customer-facing copy
2. `content/blog/discovery-rights-drug-cases.mdx` — blog excerpt line 11 uses as tagline.
3. `content/queue/youtube/pending/short-05-discovery-documents-you-should-read.md` — voiceover tagline.
4. `content/queue/youtube/pending/shorts-10.md` — voiceover tagline.

### Parent INAA repo
5. `C:\Users\email\projects\ImNotAnAttorney\content\READY-TO-POST\discovery-rights-drug-cases\twitter-thread.md` — thread opener.
6. `C:\Users\email\projects\ImNotAnAttorney\content\READY-TO-POST\discovery-rights-drug-cases\email-teaser.md` — subject-line option.

## Files NOT in Scope (scene-specific, keep)
- `content/blog/failed-drug-test-on-probation-what-happens.mdx:126` — "The prosecutor has a file" in a specific courtroom scene, accurate.
- `content/blog/probation-violation-defense-guide.mdx:218` — same scene-specific usage.
- `content/queue/twitter/posted/*` — already posted, historical.
- `docs/investigation/*` — historical audit docs.
- INAA-engine — no matches found.

## Tasks
1. Update `brand-voice.md` — canonical source for future sessions.
2. Update 3 web content files (blog + 2 YouTube scripts).
3. Update 2 parent repo files.
4. Verify the in-session homepage changes still work (tsc).
5. Commit + push INAA-web. Commit INAA parent separately.

## Also Folding In (round-3 expert consensus still pending)
- Bonus stack: "Attorney Email Template $100" → "The Callback Script $250" (Brunson specificity)
- Adjust bonus stack math: $500+$300+$300+$250+$197 = $1,547 strikethrough
- Laja guarantee block visual compression (deferred; non-blocking)

Rollback: git revert per repo.
