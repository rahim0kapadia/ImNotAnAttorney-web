# Plan — Adversarial Walkthrough Round 3 fixes (2026-04-21)

Loop continuation of the adversarial-walkthrough fix cycle on
`/r/E2EREFE/intelligence-brief`. Round 1 shipped C1–C3 (partner rename,
proof above fold, category-setter). Round 2 panel returned with one
confirmed close-the-tab line from the skeptical-buyer persona + four
convergent findings across Laja, Suby, copy-critic, and UPL investigator.

Audit source: `docs/audits/2026-04-21-adversarial-walkthrough-r-intelligence-brief.md` and the round-2 agent outputs (not yet written to disk but converged on 6 line-level flags below).

## Files to modify

1. `src/app/r/[code]/[product]/page.tsx` — all round-3 copy edits land here. Single file, single tier (`intelligence-brief`) keys in the const maps + one paragraph in the hero.

No new files.

## Numbered tasks

1. **HEADLINES["intelligence-brief"]** (line 33-34): shorten from 28-word nested-clause sentence to 11-word scannable form. Flagged by Laja (most-broken layer: Clarity) and skeptical-buyer (parse difficulty at 2AM).
   - From: `"A briefing on the judge sitting on your case, the prosecutor charging it, and the facts in your file."`
   - To: `"A briefing on your judge, your prosecutor, and your file."`

2. **DELIVERABLES["intelligence-brief"]** (line 86-92): rewrite 3 bullets flagged by UPL investigator (specific-case prediction + plea-advice adjacency + defined-by-negation) and copy-critic (vague terms).
   - Judge bullet: `"A briefing on your specific judge: sentencing patterns, bench tendencies, what's in the record"` → `"A briefing on the judge assigned to your case: published sentencing patterns, bench rulings, documented opinions"`
   - Prosecutor bullet: `"A briefing on your prosecutor: charging patterns, plea posture, who they are"` → `"A briefing on the prosecutor's office: historical charging patterns and public plea-disposition record"`
   - Jurisdiction bullet: `"Jurisdiction-level intelligence for your venue -- not a generic overview"` → `"Your venue, not the state: local rules, standing orders, and charging-unit patterns"`

3. **Stakes paragraph** (hero body): replace unsourced "commonly measured in years of custody" close-tab line with a concrete scene that names the three competitive alternatives (attorney / Google / ChatGPT). Convergent fix across skeptical-buyer (close-tab), Suby (story 2/5), Dunford (competitive alternatives weakest of 5 in round 2), UPL (outcome implication), copy-critic (hedging "commonly").
   - From: `"The gap between a prepared defense and an under-prepared one at sentencing is commonly measured in years of custody, not months. Against that, this is rounding error."`
   - To: `"Your attorney has forty other files this week. Your prosecutor has already read yours. Your judge has ruled on cases like yours — the patterns are in the public record. Google doesn't pull them. ChatGPT makes up the citations. This does."`

4. **Refund bullet** (price card): fix "easily" hedge flagged by UPL (attorney-quality comparison borderline) and copy-critic.
   - From: `"If the first deliverable doesn't give you questions your attorney can't easily answer, refund — no argument."`
   - To: `"If the first deliverable doesn't surface questions you hadn't yet considered, refund — no argument."`

## Verification

- `npx tsc --noEmit --skipLibCheck` → must be clean
- `npm run build` → must exit 0
- curl https://imnotanattorney.com/r/E2EREFE/intelligence-brief after Vercel deploy → HTML must contain "Your attorney has forty other files" and NOT contain "commonly measured in years of custody"
- Re-run the 7-agent walkthrough panel. Exit condition: skeptical-buyer returns NO close-tab line.

## Out of scope for this round

- C5 (no-attorney-yet path) — separate hero insertion, bigger copy decision
- W1 (decimal price display) — mechanical change, separate commit
- W2 (downsell placement) — CTA architecture change
- W6 (jurisdiction coverage lookup) — new route + API, separate feature
- S3 (payment plan) — Stripe integration, out of scope
