# Plan: Guarantee Truth Audit — Separate "Questions Guarantee" (CD/IB) from "Discovery Guarantee" (X-Ray+)

**Date:** 2026-04-17
**Scope:** FEATURE (multiple files, truth/UPL-critical)
**Trigger:** User flagged: homepage promises "Find a gap or it's free" but Case Decoder ($197) and Intelligence Brief ($997) don't look at discovery. Only X-Ray ($2,497+) and above actually read discovery documents.

## The Truth Problem

Per `src/lib/tiers.ts`:
- `case-decoder`: `requiresDiscovery: false` — we never see their file
- `intelligence-brief`: `requiresDiscovery: false` — we never see their file
- `x-ray`: `requiresDiscovery: true` — we read discovery
- `war-room`: `requiresDiscovery: true`
- `situation-room`: `requiresDiscovery: true`

CD/IB deliver: 15 case-specific questions based on charges + jurisdiction + case stage. They can't "find a gap" in a file we don't have. Current guarantee overclaims.

## Approved Framing

Keep "Find It or It's Free" as guarantee BRAND. Make its SUBSTANCE tier-appropriate:

- **CD/IB guarantee:** "At least 15 case-specific questions your attorney hasn't raised, or full refund."
- **X-Ray+ guarantee:** "We read your discovery and find at least one gap, missed motion, or unexamined area your attorney hasn't raised, or full refund."

## Files to Modify

### Homepage (primary sells CD)
1. `src/components/HomepageHero.tsx` — 3-col $0 cell + hero guarantee line (both done this session).
2. `src/app/page.tsx`:
   - Metadata description (L53) — strip overclaim.
   - FAQ "Can I get a refund?" (L73) — tier-split guarantee language.
   - FAQ "Is $197 worth it?" (L98) — reframe to questions, not gaps.
   - Guarantee section H2 + body (L508-514) — rename Layer 1 "The Questions Guarantee" + keep "Discovery Guarantee" as X-Ray+ escalation.
   - Bonus stack "The Discovery Guarantee" item (L573-574) — rename to "The Questions Guarantee".
   - Bonus stack CTA sub (L618) — reframe.
   - Final CTA (L698) — reframe.

### Other conversion pages
3. `src/app/start/page.tsx:204` — "if we don't find a gap" → questions-guarantee wording.
4. `src/app/checkout/page.tsx:170` — tier-appropriate wording in checkout gate.

## Files NOT in Scope

- `src/app/sample-xray/page.tsx` — X-Ray sample page. "Discovery Guarantee" TRUE here. Keep.
- `src/app/services/page.tsx:895` — tier comparison page, guarantees are tier-specific on this page. Verify if needed.
- `src/app/checkout/page.tsx:616` — this is X-Ray-specific guarantee list. Keep.
- Blog posts, audit docs, historical plans.

## Tasks
1. page.tsx metadata (L53) — remove gap-finding overclaim.
2. page.tsx FAQ refund + $197 worth it.
3. page.tsx guarantee section body — layer both.
4. page.tsx bonus stack Discovery → Questions guarantee.
5. page.tsx CTAs — reframe to questions.
6. start/page.tsx — reframe.
7. checkout/page.tsx L170 — reframe.
8. tsc + commit.

## Rollback
Git revert if needed. All edits are isolated string replacements.
