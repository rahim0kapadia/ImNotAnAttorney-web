# Plan — Adversarial-Walkthrough Round 6 Polish

**Date:** 2026-04-22
**Triage:** FEATURE (auto-upgraded, single branch / 5 small edits to 1 file)
**Branch:** `fix/awt-round6-polish`
**Base:** `origin/master` (post-Phase-4-deploy)

## Source of findings

Round 5 panel (skeptical-buyer + Laja + Dunford + Suby + copy-critic + UPL) on `https://imnotanattorney.com/r/E2EREFE/intelligence-brief`. Skeptical-buyer + Laja passed primary exit. Pristine-Or-Nothing: fix convergent + HARD-rule-regression + low-effort single-agent warnings.

## Files to modify

- `src/app/r/[code]/[product]/page.tsx` (five scoped edits)

No new files. No deletes.

## Numbered tasks

1. **UPL/copy-critic convergent — NO_ATTORNEY_YET intelligence-brief entry**
   Current: `"No attorney yet? The briefing still works — it's the packet your public defender will thank you for at intake, or the file you hand to whoever you hire."`
   New:     `"No attorney yet? The briefing still works — same packet, whether you hand it to a public defender at intake or to whoever you hire."`
   Why: "will thank you for" = social prediction about a licensed professional (UPL AUDIT_RISK) + unfulfilled promise (copy-critic). Replacement preserves dual-path (PD + hired) without predicting anyone's reaction.

2. **HARD-RULE regression — refund wording in price card**
   Current: `"one email and we refund the same day. No argument, no retention call."`
   New:     `"one email and we refund. No argument, no retention call."`
   Why: brand-voice.md bans speed-selling ("quality is the selling point"). "Same day" slipped in during Phase 5; copy-critic caught the regression.

3. **Laja FRICTION — partner benefit block**
   Current: `"clients get: full tier + free court-date reminders through your case."`
   New:     `"clients get: {tier.name} + free court-date reminders through your case."`
   Why: "full tier" is internal product language. Crisis buyer at 2AM doesn't know what "full tier" means.

4. **Suby URGENCY gap — add one line above price card**
   Insert directly above the Price card div:
   `"Your next hearing is on the calendar — the briefing is built to be in your hands before it, not after."`
   Wrapped in a small centered paragraph with muted styling.
   Why: Suby scored Urgency 2.5/5 (below 3.5 exit bar). Names the buyer's real clock (next hearing) without inventing deadlines. UPL-safe: describes what the product IS built to do, not what it promises about outcome.

5. **Copy-critic polish — simplify promo-code line**
   Current: `"Code {promoCode} applied automatically at checkout."`
   New:     `"Code {promoCode} — already applied."`
   Why: "at checkout" is inferred from URL; shorter line, same info.

## Exit bar

- npx tsc --noEmit --skipLibCheck clean
- npm run build clean
- Post-deploy curl: all 5 new strings present on /r/E2EREFE/intelligence-brief, all 5 old strings absent

## Deferred (single-agent, SUGGESTION-tier)

- Copy-critic: "Your X / Your X / Your X" paragraph starters (3x) — stakes paragraph rewrite, bigger edit, not in this round
- Copy-critic: noun-phrase starters across bullets — tier-copy rewrite
- Dunford: append value-tag per deliverable bullet
- Copy-critic: CD bullet + CD downsell = duplication

These are not HARD-RULE violations and not convergent-multi-agent. Defer to next round if conversion data justifies.

## Cascade check

- Buyer wins: less puffery, honest refund framing, clock anchored to real event
- Partner wins: cleaner benefit block
- UPL posture: strengthened (removed AUDIT_RISK line)
- Future-us: Phase 5 speed-selling regression caught + fixed — self-lesson that auto-adversarial panel catches my own drift
- No losing node. Cascade-positive.

## Approval

Rahim already green-lit Round 6 scope in the session ("yes" to the 5-point proposal). Plan saved for durability.
