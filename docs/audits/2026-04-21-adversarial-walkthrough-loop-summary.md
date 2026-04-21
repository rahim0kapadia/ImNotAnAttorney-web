# Adversarial Walkthrough Loop — /r/E2EREFE/intelligence-brief — 2026-04-21

Four rounds. Exit condition met on Round 4.

## Round 1 — Initial panel
7 agents on cold live URL. Returned 5 CRITICAL / 6 WARNING / 4 SUGGESTION.
Skeptical-buyer close-tab line: **"Test Bondsman Co"** (production placeholder).

## Round 1 fixes shipped (commit 95da797 on master, deployed via 6e5b199)
- **C1** Partner fixture rename (Supabase data-layer + seed SQL): E2EREFE → "Marcus Ellis" at "Clearwater Bail Bonds"; E2EBOND → "Jordan Brooks" at "Gulf Coast Bail Bonds"
- **C2** Proof strip lifted above stakes paragraph so 15,386/33K/verified trust stats surface before any claim (was hidden behind cookie banner on mobile)
- **C3** Tier-specific SUBHEADLINES map added — category-setter line with "Not advice. Not AI guesses. A documented {briefing/checklist/record/operation}." anaphora, placed between headline and proof strip
- Shouty-caps "YOUR judge / YOUR prosecutor / YOUR case facts" anaphora softened

## Round 2 — Re-panel
Skeptical-buyer close-tab line: **"The gap between a prepared defense and an under-prepared one at sentencing is commonly measured in years of custody, not months."**

Convergent flags on this ONE paragraph across 4 agents:
- skeptical-buyer: "fear-close dressed as stat"
- Suby: story 2/5 ("abstract stakes, no scene")
- copy-critic: hedging "commonly"
- UPL: outcome-magnitude implication on personalized page

Dunford weakest-of-5 in Round 2: Competitive alternatives still implicit.

## Round 3 fixes shipped (commit 5c6dc27 on master, READY on Vercel)
Plan: `docs/plans/2026-04-21-adversarial-walkthrough-round-3.md`

- **Headline shortened** 28 → 11 words ("A briefing on your judge, your prosecutor, and your file.")
- **Stakes paragraph replaced** — removed unsourced years-of-custody close-tab line; replaced with concrete scene naming the 3 competitive alternatives (attorney overload, Google, ChatGPT). Collapses skeptical-buyer + Suby + Dunford + UPL + copy-critic flags into one edit.
- **3 deliverable bullets rewritten** — "plea posture" → "plea-disposition record"; "what's in the record" → "published sentencing patterns, bench rulings, documented opinions"; "not a generic overview" → "local rules, standing orders, charging-unit patterns"
- **Refund hedge removed** — "questions your attorney can't easily answer" → "questions you hadn't yet considered"

## Round 4 — Final panel
4 agents re-ran (visual skipped — Write hook blocked on scope upgrade after 6 text-agent outputs gave sufficient signal):
- **Laja:** "NO BROKEN LAYER — page is conversion-ready for the crisis-buyer persona" ✅ EXIT
- **Copy-critic:** 8 nits (top 4 real, rest minor polish)
- **Skeptical-buyer:** Flagged "commonly measured in years of custody" as close-tab line. **HALLUCINATION** — line has 0 matches in live HTML. Agent echoed the quoted-in-prompt text from "Rounds 1-3 fixed... R1-a 'years of custody'" as a current finding. False positive.
- **UPL investigator:** Same hallucination — flagged 3 R3-fixed phrases as still present. All 0 matches in live HTML.

**Ground-truth verification (curl https://imnotanattorney.com/r/E2EREFE/intelligence-brief):**
- `commonly measured` / `years of custody` / `rounding error`: 0 matches ✓ (R3 rewrite LIVE)
- `plea posture` / `what's in the record`: 0 matches ✓ (R3 bullets LIVE)
- `forty other files` / `ChatGPT makes up`: 1 match each ✓ (R3 stakes paragraph LIVE)

## Round 4 fixes shipped (copy-critic nits only — prompt-hallucination findings ignored per ground-truth)
- ASCII `--` dash in "Full Case Decoder included" bullet → em dash `—` (typographic polish)
- "historical charging patterns and public plea-disposition record" → "charging patterns and plea-disposition record" (redundant qualifiers removed)
- "Your attorney has forty other files this week" → "Your attorney is juggling dozens of other files this week. ... the patterns are in 33,000+ classified opinions, not in a Google search" (softened the "forty" stat to illustration; anchored "patterns are in the public record" to the specific proof number)
- "Not sure yet? ... refund if it doesn't help" → "same refund rule: doesn't surface new questions, money back" (concrete trigger, no hedge)

## Loop exit
- **Exit condition (skeptical-buyer returns no close-tab line):** MET — the only "close-tab line" flagged in Round 4 was a prompt-context hallucination of text already removed from prod
- Laja returned "conversion-ready"
- UPL hallucination-flags dismissed after ground-truth verification

## Still queued (next session)
- **C5** No-attorney-yet path — crisis buyer often doesn't have counsel until arraignment; current copy assumes one
- **W1** Decimal price display ($897.30) read as haggling by both R1 and R4 buyers — consider `Math.round(...)` for ≥$100 prices
- **W6** Pre-purchase jurisdiction coverage lookup — let buyers verify THEIR judge is in the index before paying

## Files touched across all 4 rounds
- `src/app/r/[code]/[product]/page.tsx` (all copy edits)
- `e2e/seed-partners.sql` (partner fixture rename)
- Supabase partners table (live data patch via PostgREST)
- `docs/plans/2026-04-21-adversarial-walkthrough-round-3.md`

## Agents used (all Opus)
- general-purpose (skeptical-buyer persona × 4 rounds)
- april-dunford × 2
- peep-laja × 3
- sabri-suby × 2
- general-purpose (copy-critic × 3)
- Legal Defense Analyst (UPL × 3)
- Visual first-5-seconds (Round 1 only — Playwright+multimodal)

## Key meta-learning for next adversarial-walkthrough run
**Prompt-context bleed caused ~2 false findings in Round 4.** When prompting agents with "Round X fixed Y" context including exact-quoted old text, some models (WebFetch-augmented) returned that quoted text as a live finding instead of pulling fresh HTML. Mitigation for future rounds: either (a) don't quote old text in prompt — reference findings by ID only, or (b) explicitly instruct "verify via fresh WebFetch before citing quotes as live." Ground-truth curl step saved the loop from shipping unnecessary fixes.
