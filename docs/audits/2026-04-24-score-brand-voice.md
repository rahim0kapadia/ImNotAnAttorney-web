# P3 — Anonymous-brand Voice Integrity Gate — /score NEWLY TOUCHED strings

**Date:** 2026-04-24
**Worktree:** `C:\Users\email\projects\score-exec`
**Scope:** strings introduced/modified in tasks C1.1, C1.2, C1.3, C1.4, C2.1, C2.2, C2.3, C3.2, C4.1, C4.2, C4.3
**SC addressed:** SC-P3

## Voice columns (5)

| Column | Definition |
|---|---|
| **no-service-attorney** | Word `attorney` NOT used to describe INAA's service. OK if used to describe defendant's lawyer. Fails when phrasing reads "our attorneys" or casts INAA as providing attorneys/legal representation. |
| **no-guarantees** | No "we will win", "you will be acquitted", etc. No outcome promises. |
| **no-law-firm-tone** | Voice stays defendant-to-defendant insider. Fails on corporate/legal-services register ("we can help you with your case"). |
| **information-not-advice** | No second-person imperatives delivering legal direction. OK for procedural UX directives ("Copy the template"). Fails for "File this motion" / "Argue X" / "Demand Y". |
| **anonymous-ownership** | "Researchers. Defendants, still fighting." preserved or compatible; no apology for anonymity; no "our attorneys". |

Each cell = `pass` or `fail`. Zero `fail` cells = PASS gate.

## Rows audited (post-edit text from `ScoreClient.tsx`)

| # | Source | String (verbatim from ScoreClient.tsx) | no-service-attorney | no-guarantees | no-law-firm-tone | information-not-advice | anonymous-ownership |
|---|---|---|---|---|---|---|---|
| 1 | C1.1 Frame 1 p1 (L677) | "You ran the check before your next court date. That is the one move most defendants miss." | pass | pass | pass | pass | pass |
| 2 | C1.1 Frame 1 p2 (L680) | "First action today: Copy the attorney template below and send it before your next court date, not after." | pass | pass | pass | pass | pass |
| 3 | C1.2 `bandIdentity.Critical` (L529) | "The check flagged ${flaggedCount} milestone${flaggedCount === 1 ? \"\" : \"s\"} behind pace." | pass | pass | pass | pass | pass |
| 4 | C1.2 `bandContextLines.Critical` (L539) | "Each flagged milestone has a specific first-move we walk through below." | pass | pass | pass | pass | pass |
| 5 | C1.3 teaser Critical branch (L820) | "More file notes are ready for you — where should we send them?" | pass | pass | pass | pass | pass |
| 6 | C1.4 SVG node labels (L728, L751, L774) | "You are HERE" / "Next 72 hours" / "Next court date" | pass | pass | pass | pass | pass |
| 7 | C1.4 SVG ul items (L779-L781) | "1. You are HERE — first-pass score run" / "2. Next 72 hours — prepare questions for your attorney" / "3. Next court date — bring the memo" | pass | pass | pass | pass | pass |
| 8 | C1.4 figcaption (L784) | "Procedural path: you ran the first-pass check; within 72 hours prepare your questions; at your next court date bring the memo." | pass | pass | pass | pass | pass |
| 9 | C2.1 Q7 helper `motionsFiled` (L221) | "Pick \"I don't know\" if your attorney hasn't told you about any court filings. That answer is normal — most defendants don't know what's been filed." | pass | pass | pass | pass | pass |
| 10 | C2.2 Q8 helper `hasDiscovery` (L231) | "Pick \"I don't know what that is\" if your attorney hasn't shared police reports, lab results, or witness statements with you. Many defendants never see these, even when they've been handed over." | pass | pass | pass | pass | pass |
| 11 | C2.3 Q4 helper `strategyDiscussed` (L187) | "Pick \"No\" if your attorney hasn't told you what their plan is — which defense they're using, which motions they'll file, or what the end game looks like. Silence on strategy is not normal — it's a file-state observation." | pass | pass | pass | pass | pass |
| 12 | C3.2 line 122 REPHRASE (UPL JSON) | "Representation status unclear on file. Court dates are often already on the docket regardless of retention status. Question to surface: \"Do I have active counsel on record for this case, and who are they?\"" | pass | pass | pass | pass | pass |
| 13 | C3.2 line 192 REPHRASE (UPL JSON) | "Zero-communication state on file — a serious red flag pattern. Deadlines, hearings, and plea offers continue to move regardless of subject awareness. Question to surface with counsel: \"Can we schedule our next status check in writing, with an agenda?\"" | pass | pass | pass | pass | pass |
| 14 | C3.2 line 295 REPHRASE (UPL JSON) | "Subject is a student. Conviction can affect financial aid, campus housing, and academic standing. For drug offenses, federal law ties FAFSA eligibility to conviction status — collateral education exposure on file." | pass | pass | pass | pass | pass |
| 15 | C4.1 H2 live-playbook crisis (L1027-L1029) | "The memo above flagged where your defense is behind. The ${playbookTier.name} is the charge-specific next read — the same milestones, deeper." | pass | pass | pass | pass | pass |
| 16 | C4.1 H2 no-live-playbook (L1116-L1120) | "Your defense looks active on the surface. The Case Decoder checks what surface indicators miss, prosecutor patterns, jurisdiction-specific filing windows, and the questions elite attorneys ask that most defendants never think to raise." / Excellent variant / Average variant | pass | pass | pass | pass | pass |
| 17 | C4.2 `bandCTAButton.Critical` (L549) | "Read the Full File on My Case" | pass | pass | pass | pass | pass |
| 18 | C4.2 `bandCTAButton.Concerning` (L550) | "Read the Deeper Version" | pass | pass | pass | pass | pass |
| 19 | C4.3 secondary-CTA link label (L1067) | "See the deeper file read →" | pass | pass | pass | pass | pass |

**Zero `fail` cells. PASS gate.**

## Column-by-column reasoning

**no-service-attorney:** Every occurrence of "attorney" in the audited strings describes the defendant's lawyer ("your attorney hasn't told you", "prepare questions for your attorney"), NEVER INAA's service. Row 16's "elite attorneys ask" refers to external elite defense attorneys whose methodology we cite as a benchmark — our service is positioned as the tool that surfaces those questions, not as the attorney itself. No "our attorneys" phrasing anywhere.

**no-guarantees:** Zero instances of "will win", "will be acquitted", "guaranteed outcome". Row 15-16 uses "checks", "surface indicators miss", "flags" — diagnostic verbs, not outcome claims. Row 13's "Deadlines, hearings, and plea offers continue to move regardless of subject awareness" is a procedural fact, not a promise.

**no-law-firm-tone:** Register stays defendant-to-defendant. Row 1 ("one move most defendants miss") and row 11 ("Silence on strategy is not normal") are insider observations, not corporate we-can-help copy. Row 16 brushes the edge with "prosecutor patterns, jurisdiction-specific filing windows" but contextualizes them as things the Case Decoder checks — still a diagnostic tool, not a practice advertisement.

**information-not-advice:** Directives are UX-procedural ("Copy the template", "Pick 'No' if...", "bring the memo"), not legal imperatives ("file a motion", "argue self-defense"). Row 12-14 ends each item with a question the reader surfaces with counsel — the hardest UPL case and still safe because the question is framed as something to ASK, not something to DO. Row 11's "Silence on strategy is not normal" is an observation pattern statement; does not instruct the reader to take legal action.

**anonymous-ownership:** None of the audited strings apologize for anonymity, none claim "our attorneys", none break the masked-researcher frame. Row 5 ("More file notes are ready for you — where should we send them?") keeps the file-investigation voice. The SVG caption in row 8 ("Procedural path: you ran the first-pass check") casts the reader as the agent — compatible with "Researchers. Defendants, still fighting." because both parties are researchers at this step.

## Shareable-variant parity (WARN-6)

`/score/results/[token]` renders the identical `ScoreClient.tsx` component — confirmed via `src/app/score/results/[token]/page.tsx` which imports from `@/app/score/ScoreClient`. All Critical-band frames (C1.1), SVG procedural diagram (C1.4), IntersectionObserver-gated CTA (C4.2), and brand-voice strings audited above apply identically on the shareable result URL. No component-level divergence; parity holds by shared-component construction. No code change required.

## Verdict

**SC-P3 PASS.** 19 rows × 5 columns = 95 cells, zero `fail`. Anonymous-brand voice integrity intact across every C1.1–C4.3 touched string. Shareable-variant parity holds.
