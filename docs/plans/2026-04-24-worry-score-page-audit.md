# Worry-to-Pristine: /score Page Audit

**Date:** 2026-04-24
**Slug:** score-page-audit
**Orchestrator:** Session C (Atlas), auto-mode
**Subsystem boundary:** `/score` page + server-side computation + rendered memo output. Do NOT touch Case Decoder paid flow beyond the CTA transition.

## Worry

Four concerns surfaced during Atti-lens walkthrough 2026-04-24:

**(C1) "Critical" score-band retraumatization risk.** The 5-band scale (Critical / Concerning / Average / Adequate / Excellent) could leave a crisis-buyer in a darker place than they started if the Critical band's body copy lacks reassurance + specific next-action. A defendant who Googles at 2AM, answers 10 questions, and sees "Critical" with no onramp might close the tab feeling worse. That's extraction-mode UX, not cascade-native.

**(C2) 3AM panic test on 10 questions.** Questions must be answerable by a defendant in crisis who may not know what a "motion to suppress" is (Fogg BJ model: motivation × ability × trigger). Any question that requires attorney-vocabulary knowledge from the defendant blows up the funnel.

**(C3) UPL-scan observations dataset.** Every rendered observation string classified as information vs advice; any slippage into "you should X" legal-advice territory is UPL exposure. The `evaluate-report` Edge Function gates report generation, but the /score observations run client-facing with no UPL evaluator between `lib/score.ts` output and customer view. Observations across ALL 10 charge types need audit, not just DUI happy-path.

**(C4) Conversion-handoff tone.** Post-memo Case Decoder CTA: extraction mode ("upgrade or lose") or information-continuity mode ("you have the first read; here's the deeper cut")? The right tone preserves the "Give first, capture after" invariant (#9) + matches Atti's trust engineering.

## Additional probes

- Mobile first-5-seconds on 375px viewport (time-to-"I feel in control")
- Score observations UPL-safe across ALL 10 charge types, not just DUI
- Anonymous-brand voice integrity at every touchpoint (no law-firm-voice drift)

## Source Files In Scope

- `src/app/score/page.tsx` (shell)
- `src/app/score/ScoreClient.tsx` (main UI component)
- `src/app/api/score/route.ts` (server computation)
- `src/lib/score.ts` (scoring logic + observations)
- `src/components/InternalMemo.tsx` (render surface)
- `src/components/motion/AnimatedScoreArc.tsx` (visual UX)

## Expert Lens

**Primary lens — Margaret Hagan (Stanford Legal Design Lab)**, cached at `~/.claude/experts/margaret-hagan.md`. Her published work is civil-law (eviction, debt, family), but the underlying A2J problem — a stressed non-lawyer trying to decode procedure under time pressure — is the same problem a 2AM DUI defendant has on `/score`. Methodology transfers; vocabulary does not.

- **C1 (Critical-band retraumatization) maps to Hagan Layer 2 — Process Design.** Hagan's A2J research (Legal Design Lab, 2015–present) found that self-represented users who hit a "your situation is bad" signpost without an adjacent, concrete next-step routinely abandon — the visual + narrative arc matters more than the factual content. The current `ScoreDisplay` section order (arc → band → identity line → context line → memo → compact email → stats → urgency block → attorney template) does land on a template, but the band context line for Critical ("your defense is behind in ways that create permanent consequences", `ScoreClient.tsx:502`) plus `bandIdentity.Critical` ("Your gut was right. Something is wrong.", `ScoreClient.tsx:493`) front-load loss framing without a matching reassurance beat before the InternalMemo findings hit. Hagan Plain-Language Principle (a) "lead with what the reader must DO" is not satisfied for Critical at the point of maximum stress. Covello reinforces — at 80% processing loss, the 27-word line that matters is "here is the first thing to do," not "your gut was right." Laja adds anxiety-as-conversion-killer: a Critical-band user who sees loss framing without an immediate next-action is the archetype who closes the tab. **Round-0 finding CRIT-3 re-scopes C1 from copy insertion to procedural-flow redesign**: Critical-band is a branch point in the reader's journey, not a paragraph reword. Two-frame redesign (action frame → context frame) per Hagan Layer 2.

- **C2 (3AM panic test on questions) maps to Hagan Layer 1 — Visual/Content Design + Principle (d) — eliminate or inline-translate legalese.** Of the 10 questions (`ScoreClient.tsx:147-254`), Q7 ("Has your attorney filed any motions?") and Q8 ("Have you received discovery documents?") assume the defendant knows what "motions" and "discovery" are — Fogg's BJ-Fogg model blows up when ability is below the action line. Q8's "I don't know what that is" option translates discovery inline (via the `hasDiscovery === "dont-know"` branch observation on `lib/score.ts:177`) but Q7 has no equivalent inline translation — the "I don't know" branch reveals on the results page, not at question time. Per Hagan + Fogg, the translation must happen at the moment of ability drop, not after submission. **Round-0 finding WARN-7 further refines** — helpers must be action-first ("Pick 'I don't know' if...") per Hagan Principle (a), not definition-first.

- **C3 (UPL slippage in observations dataset) maps to Hagan Plain-Language Principle (e) — test under stress + Atti's UPL guardrail.** `lib/score.ts` contains ~45 distinct observation strings spanning 10 charge types × 2 attorney states × 2 time windows, plus ~15 cross-cutting (motions, discovery, communication, strategy, criminal-history, case-stage, license-profession) observations. Voice is explicitly third-person dossier ("Subject reports...", "File state at..."), which is the safer frame. However several observations drift into ADVICE territory rather than INFORMATION. Hagan's rule: plain-language can tell the reader what to do — but Atti's UPL rule (`rules/no-hallucinated-legal-data.md`, `rules/brand-voice.md`) is stricter: we provide legal INFORMATION and generate QUESTIONS, not legal ADVICE. Every one of the ~45 strings must be classified, with line anchors sourced from the C0 authoritative index (not hardcoded — finding CRIT-1).

- **C4 (Conversion-handoff tone) maps to Hagan Layer 3 — System Design + Godin permission-asset framing.** The memo-to-Case-Decoder transition at `ScoreClient.tsx:844-870` uses "The score measured 10 surface indicators. The ${playbookTier.name} goes deeper" which is information-continuity language — good. But the crisis-band H2s "Your score says your defense has gaps. The ${playbookTier.name} shows you exactly where" (`ScoreClient.tsx:846`) and the band CTA button "Find the Gaps in My Defense" (`ScoreClient.tsx:512`) lean problem-amplification rather than information-continuity. Hagan's System Design principle says the hand-off must mirror the reader's agency arc: they came seeking understanding; the CTA should read as deeper understanding, not deeper exposure.

- **Additional probes mapping.** Mobile first-5-seconds on 375px (probe #1) maps to Hagan Visual Legal Help — the pre-quiz hero (`ScoreClient.tsx:1280-1293`) and the SCORE ARC top-of-memo are the visual fixation points; Covello's 27-word rule applies to the band context line. Anonymous-brand voice integrity (probe #3) maps to Atti's brand-voice rule — "Researchers. Defendants, still fighting." (`InternalMemo.tsx:159`) is on-brand; we need to confirm no law-firm drift in the ~45 observation strings or in bandIdentity/bandContext/bandEmailHeadlines maps.

## Cascade

- **Us (INAA):** stronger Critical-band retention reduces the single highest abandonment risk on the free-tier funnel; a validated observation dataset lets us scale to 10 more charge types without re-auditing the Q-to-observation chain every time; a UPL-clean /score reduces legal exposure across a surface that currently runs customer-facing with no UPL evaluator between `lib/score.ts` output and render.
- **Defendant (direct counterparty):** the crisis-buyer leaves the page knowing (a) what the first action is, (b) that the finding is specific not generic, (c) that the page didn't manipulate them with loss framing before offering reassurance. Information continuity instead of emotional whiplash.
- **Downstream (attorney receiving the email template):** defendant arrives with information-anchored questions instead of advice-shaped demands; attorney sees an informed client, not a client who read "you should X" on a website. Reduces attorney friction with the tool.
- **Ecosystem (legal-tech category):** raises the floor for free A2J tools — every competitor who ships a "free defense score" quiz now has a reference implementation for UPL-clean, Hagan-Plain-Language, crisis-calibrated output. Publishable as a pattern.
- **Future-us:** the observation-dataset audit produces a classifier we can reuse on Case Decoder reports, playbook outputs, and the Intelligence Brief generator. One audit → four downstream surfaces improved.
- **Adjacent (defense attorneys working with INAA customers):** the "Question to surface" framing + email templates make attorneys' jobs easier; a well-briefed client shortens intake meetings.

No node loses. No escape clause needed.

## Numbered Tasks

Grouped by pre-execution prereq, worry letter, and probes. Every task names file:line, specific change, verification, rollback, and `depends_on:` dependency field. Task order (linear): C0 → C1.1 → C1.2 → C1.3 → C1.4 → C2.1 → C2.2 → C2.3 → C3.1 → C3.2 → C3.3 → C4.1 → C4.2 → C4.3 → P1 → P2 → P3.

### C0 — Pre-execution: Regenerate authoritative observation line index

**Task C0 — Regenerate authoritative observation line index.** (Resolves CRIT-1; prereq for C3.1, C3.2, SC-C3.1, SC-C3.2, SC-P2.)
- File: `src/lib/score.ts` (scan source) → `docs/audits/2026-04-24-score-observations-line-index.json` (output).
- Specific change: write a one-shot discovery script (`scripts/score-observations-index.mjs`) that regex-scans `src/lib/score.ts` for every observation-string return site. Detection regex must match: (a) `return "..."` + `return '...'` + backtick returns from the getChargeSpecificObservation branches and all band/window observation branches, (b) explicit `.push("...")` observation additions to the observations array, (c) ternary expressions returning observation strings. For each match, emit a row in the JSON index: `{line: <integer>, text_hash: <sha256 of trimmed string>, charge_branch: <dui|drug-possession|...|cross-cutting>, attorney_state: <has-attorney|no-attorney|null>, time_window: <early|mid|late|null>, source_snippet: <first 80 chars for sanity>}`. Script is idempotent — re-running after C3.2 edits regenerates the index; the JSON is the authoritative source of truth, never the plan file.
- Verification: run `node scripts/score-observations-index.mjs` → assert row count >= 55 (40 charge-specific tuples + 15 cross-cutting floor per SC-P2); assert every row has non-null `line` + non-empty `text_hash`; assert JSON parses clean. Cross-check by opening 5 random line entries in `src/lib/score.ts` — each should point at an actual observation string.
- Rollback: delete `scripts/score-observations-index.mjs` and `docs/audits/2026-04-24-score-observations-line-index.json`. No code change in `lib/score.ts`.
- `depends_on:` (none — first task in execution order).

### C1 — Critical-band retraumatization

**Task C1.1 — Critical-band procedural flow redesign (Layer 2 Process Design, two frames).** (Resolves CRIT-3; rescopes original copy-insertion task into procedural flow.)
- File: `src/app/score/ScoreClient.tsx` — new Critical-only conditional block rendered between the score-arc closing `</div>` and the first `<h2>` of `ScoreDisplay`. Replaces what would have been single-paragraph insertion with two visible frames.
- Specific change: add a conditional block rendered only when `result.band === "Critical"` containing **two distinct frames**:
  - **Frame 1 — action frame (above fold on 375x667):** `<section data-testid="critical-frame-1">` containing: (a) one 27-word-max validating sentence per Covello crisis communication (no catastrophizing, no loss framing, no "your gut was right" reassurance pat — specific to the check behavior, e.g. "You ran the check before the next court date. That is the one move most defendants miss."); (b) a "First action today: [concrete step]" block naming exactly ONE paid-tier-free next-step anchored to the attorney-email template already present in ScoreDisplay section 4. Step is specific and actionable (not "call your attorney" — e.g. "Copy the attorney-email template below. Send it today, not tomorrow."). Helper text renders as JSX text node `<p>{action}</p>` — NEVER `dangerouslySetInnerHTML` (WARN-14).
  - **Frame 2 — context frame (below fold, expand-on-scroll):** `<section data-testid="critical-frame-2">` containing existing `bandIdentity.Critical` + `bandContextLines.Critical` + lead-in to the InternalMemo. Frame 2 is static content, no interactive disclosure (always visible on scroll); the "below fold" positioning comes from natural flow after Frame 1 + score arc, not from display:none.
  - Frame 1 and Frame 2 both render as semantic `<section>` elements with `data-testid` hooks per SUGG-6 (assertion stability); urgency block at `ScoreClient.tsx:716-737` remains reachable without JS (no display:none on urgency block; tab order preserved per SUGG-7). Verify urgency block IS free-tier-independent before treating it as a stable referent (SUGG-2).
- Verification: render with Critical-forced input tuple → assert (a) `[data-testid="critical-frame-1"]` element exists above `[data-testid="critical-frame-2"]` in DOM order; (b) Frame 1 contains exactly two paragraphs: the validating line (word count ≤27, no forbidden substrings) AND the "First action today:" block (contains substring matching `/attorney template|preservation/i`); (c) Frame 2 contains `bandIdentity.Critical` + `bandContextLines.Critical` strings; (d) urgency block still reachable via keyboard tab order with no display:none.
- Rollback: remove the conditional block and `data-testid` attributes. No schema or API change.
- `depends_on:` C0.

**Task C1.2 — Rewrite `bandIdentity.Critical` and `bandContextLines.Critical` with file-state specificity, not pat reassurance.** (Addresses SUGG-3 — Bloomstein specificity, not warmth.)
- File: `src/app/score/ScoreClient.tsx:493` (`bandIdentity.Critical`) and `:502` (`bandContextLines.Critical`).
- Specific change: replace `bandIdentity.Critical` "Your gut was right. Something is wrong." with a file-state-specific line anchored to measurable observations (e.g. "The check flagged [N] milestones behind pace."). The `[N]` is a runtime interpolation from `result.observations.filter(o => o.severity === 'high').length` or equivalent count — not a static string. Replace `bandContextLines.Critical` "This score means what you suspected: your defense is behind in ways that create permanent consequences." with a neutral continuity line ("Each flagged milestone has a specific first-move we walk through below."). Both strings must pass: (a) word count ≤27, (b) no substrings from {"wrong", "permanent consequences", "darker", "worse", "bad news", "gut was right"}.
- Verification: unit-snapshot of `<ScoreDisplay>` for Critical band; assert both replacement strings satisfy substring exclusion AND word-count ≤27; assert interpolated `[N]` in `bandIdentity.Critical` resolves to an integer at render time.
- Rollback: revert the two map entries.
- `depends_on:` C0.

**Task C1.3 — Memo `teaser` reads as information-continuity for Critical band.** (Collapsed to single path per WARN-1.)
- File: `src/app/score/ScoreClient.tsx:641` (the `teaser` prop passed into `<InternalMemo>`).
- Specific change: swap teaser value to information-continuity phrasing for Critical band only. Single prescribed change — no "OR"/alternatives. For `result.band === "Critical"`: teaser is `"More file notes are ready for you — where should we send them?"`. For all other bands (Concerning/Average/Adequate/Excellent): teaser remains unchanged at `"Additional findings pending — delivered by secure channel."`.
- Verification: render Critical band → assert teaser substring contains `"More file notes are ready"` AND does NOT contain any of: {"pending", "paywall", "locked", "secure channel"}. Render Concerning/Average/Adequate/Excellent → assert teaser equals original string.
- Rollback: restore single-value teaser prop.
- `depends_on:` C1.2.

**Task C1.4 — Critical-band procedural diagram (Hagan Visual Legal Help + Principle c).** (Resolves CRIT-4; also addresses SUGG-5 memo-rendering principle.)
- File: `src/app/score/ScoreClient.tsx` — new inline SVG component rendered inside Frame 1 (from C1.1) OR as the handoff block between Frame 1 and Frame 2. Diagram renders only when `result.band === "Critical"`.
- Specific change: implement an inline SVG procedural-sequence diagram showing minimum 3 procedural nodes — "You are HERE" → "Next 72 hours" → "Next court date" → (optional 4th) "What a motion is." Each node:
  - Has a plain-language label (NO bare "motion", "discovery", "brief", "subpoena", "suppress", "arraignment" without an inline parenthetical translation — e.g. "File a motion (your attorney's formal written request to the court)").
  - Has a visual icon or glyph per Hagan Visual Legal Help (no text-only nodes; icons can be minimal Lucide-style line art — no custom illustrations needed, Bootstrap Mode).
  - Renders inside `<figure data-testid="critical-procedural-diagram">` with `<figcaption>` describing the sequence for a11y (screen-reader path).
  - SVG is inline (no external asset) per $0 infra rule.
  - Citation in PR description: "Hagan Visual Legal Help + Plain-Language Principle (c) — diagrams for procedural sequences."
- Verification: render Critical band → query `[data-testid="critical-procedural-diagram"]` → assert element exists; assert descendant node count (nodes = `<g>` or `<rect>` + label pairs) ≥ 3; for each node, extract `textContent` and assert none contain the bare terms `motion`, `discovery`, `brief`, `subpoena`, `suppress`, `arraignment` without a parenthetical plain-language translation adjacent; assert `<figcaption>` present and non-empty. For non-Critical bands → assert diagram NOT rendered.
- Rollback: remove the SVG component + its import. No schema or API change.
- `depends_on:` C1.1.

### C2 — 3AM panic test on questions

**Task C2.1 — Action-first helper on Q7 motions (Hagan Principle a, not Principle d).** (Resolves WARN-7 — action-first, not definition-first.)
- File: `src/app/score/ScoreClient.tsx:218` (Q7 `motionsFiled` question object) — helper renders under `<legend>` in the question fieldset using the same pattern as `criminalHistory` / `licensedProfession` helpers already present.
- Specific change: add `helper` field to Q7 with action-first framing: `"Pick \"I don't know\" if your attorney hasn't told you about any court filings. That answer is normal — most defendants don't know what's been filed."`. Helper renders as JSX text node inside the fieldset legend block, `<p>{helper}</p>` — NEVER `dangerouslySetInnerHTML` (WARN-14). Helper is associated via `aria-describedby` on the fieldset or wrapped inside `<legend>` so screen readers announce it as part of the question.
- Verification: render Q7 → query the helper element → assert `textContent` contains substring `"Pick \"I don't know\" if"`; assert helper is associated with fieldset (either inside `<legend>` or via `aria-describedby`); assert NO `dangerouslySetInnerHTML` attribute anywhere in helper render path.
- Rollback: remove `helper` field from Q7 and its render in the fieldset.
- `depends_on:` C0.

**Task C2.2 — Action-first helper on Q8 discovery (pre-answer, not post-submit).** (Resolves WARN-7; moves inline translation from post-submit observation to question-time.)
- File: `src/app/score/ScoreClient.tsx:227-234` (Q8 `hasDiscovery`).
- Specific change: add `helper` to Q8 with action-first framing: `"Pick \"I don't know what that is\" if your attorney hasn't shared police reports, lab results, or witness statements with you. Many defendants never see these, even when they've been handed over."`. Renders as JSX text node under `<legend>`, NEVER `dangerouslySetInnerHTML`. The existing `"I don't know what that is"` option remains (scoring model unchanged).
- Verification: render Q8 → query helper element → assert `textContent` contains substring `"Pick \"I don't know what that is\""` AND the phrase `"police reports"` (at least one concrete example); assert accessible association (legend or aria-describedby); assert no `dangerouslySetInnerHTML`.
- Rollback: remove `helper` field.
- `depends_on:` C2.1.

**Task C2.3 — Action-first helper on Q4 strategy (not locked to 3 substrings).** (Addresses WARN-3 — loosen SC to 2-of-3 check.)
- File: `src/app/score/ScoreClient.tsx:184-192` (Q4 `strategyDiscussed`).
- Specific change: add `helper` to Q4 with action-first framing: `"Pick \"No\" if your attorney hasn't told you what their plan is — which defense they're using, which motions they'll file, or what the end game looks like. Silence on strategy is not normal — it's a file-state observation."`. Options remain `Yes, in detail / Briefly / No` — scoring model unchanged. Helper renders as JSX text node, never `dangerouslySetInnerHTML`.
- Verification: render Q4 → assert helper present + associated with fieldset; assert `textContent` contains substring `"Pick \"No\""` AND at least 2 of the 3 substrings from {`"what defense"`, `"end game"`, `"motions"`} (loosened per WARN-3 — future copy edits preserving the intent do not break the SC); assert existing unit tests for `strategyDiscussed=yes-detail` scoring remain green (byte-identical score).
- Rollback: remove helper.
- `depends_on:` C2.2.

### C3 — UPL-scan observations dataset

**Task C3.1 — Classify every observation string, sourced from C0 line index, with machine-verifiable JSON artifact.** (Resolves WARN-12 — machine-verifiable JSON companion to the markdown doc; uses C0 index as line source per CRIT-1.)
- File: reads `docs/audits/2026-04-24-score-observations-line-index.json` (output of C0). Writes `docs/audits/2026-04-24-score-observations-upl.md` (human-readable audit) AND `docs/audits/2026-04-24-score-observations-upl.json` (machine-verifiable artifact).
- Specific change: for every row in the C0 index, produce a classification entry. The markdown audit table has columns: line, charge_branch, attorney_state, time_window, current text, classification (INFORMATION / QUESTION-HOOK / ADVICE), verdict (KEEP / REPHRASE / DELETE), proposed replacement, stress-state trigger (which bands × crisis-tuples activate the string — resolves WARN-10). The JSON companion has rows of shape `{line, text_hash, classification: "INFORMATION"|"QUESTION-HOOK"|"ADVICE", verdict: "KEEP"|"REPHRASE"|"DELETE", stress_bands: ["Critical", ...]}`. The `text_hash` field matches C0's hash so drift between index and audit is detectable. Classifier definitions: ADVICE = imperative to the reader ("do X", "send X", "confirm X", "recommended action: Y", "don't", "never", "always", "make sure", "file a", "request a", "demand", sentence-initial verbs `Submit`/`Contact`/`Serve`/`Preserve`/`Object`); QUESTION-HOOK = phrased as `"Question to surface with counsel:"` followed by a `?`-terminated question; INFORMATION = neutral statement of fact, pattern, or file state with no imperative.
- Verification: every row has non-empty classification ∈ 3 allowed values AND non-empty verdict ∈ 3 allowed values; JSON parses clean; row count in JSON matches row count in C0 line index; spot-check 5 rows against Atti brand-voice rule + UPL rule. Confirm classifier catches the three examples flagged in Expert Lens: representation-status line at `lib/score.ts:125`, communication-status line at `lib/score.ts:201`, motions question-hook at `lib/score.ts:155`. `/score` UPL gate is local-regex-only vs `evaluate-report` LLM classifier — note asymmetry explicitly + add post-audit escalation trigger per WARN-13 (escalate to shared LLM gate if `/score` volume crosses 500/day).
- Rollback: delete both audit files. No code change.
- `depends_on:` C0.

**Task C3.2 — Rewrite every ADVICE observation into INFORMATION or QUESTION-HOOK (no REPHRASE of unsourced stats — DELETE only).** (Addresses WARN-8 — no soft-stat swap; addresses WARN-5 — split stat verification into sub-task; addresses CRIT-2 + WARN-11 — broader imperative regex.)
- File: `src/lib/score.ts` — specifically the lines flagged `verdict: REPHRASE` or `DELETE` in the C3.1 JSON artifact. Line numbers sourced from the C3.1 JSON (which sources from C0 JSON), NOT from any hardcoded list in this plan.
- Specific change — two sub-tasks:
  - **C3.2a — Verify statistical claims against internal source:** for any observation containing a statistic (e.g. "~70%", "most cases", "in files we track"), grep for source evidence in `src/lib/` + `supabase/functions/` — is there an RPC or data pipeline emitting this number? If yes, cite the RPC + populate `source_urls` per `rules/no-hallucinated-legal-data.md`. If no, mark for DELETE.
  - **C3.2b — Rewrite or DELETE:** for each REPHRASE row, produce the replacement text. For each DELETE row, remove the observation string + its branch. The rewrite rule: replace any reader-subject imperative with either (a) a neutral INFORMATION statement of file-state, or (b) a `"Question to surface with counsel: ..."` form ending with `?`. Do NOT replace unsourced statistics with softer unsourced statistics (WARN-8) — DELETE instead. Example patterns from the audit:
    - Representation-status observation: replace "First-pass action for subject: Confirm whether you have active counsel..." with "Representation status unclear on file. Question to surface: 'Who is my attorney of record, and when is the next court date?'"
    - Communication-status observation: replace "Recommended subject action: send a written status request, on the record." with "Zero-communication pattern on file. Question to surface: 'Can we schedule our next meeting in writing, with an agenda?'"
    - Motions observation: keep the `"Question to surface"` clause; remove any unsourced statistic (e.g. "~70% of cases"); verify against internal RPC or DELETE.
  - All replacements must pass their own regex (verify against the broader imperative regex from C3.3 before committing).
- Verification: after rewrites, run the C3.3 test file → zero ADVICE rows; re-run C0 script → updated index; re-run C3.1 classifier → every row has classification ∈ {INFORMATION, QUESTION-HOOK}, zero ADVICE; snapshot `calculateScore` output for 10 representative input combinations → assert no rendered observation matches the broader imperative regex (defined in C3.3).
- Rollback: revert `lib/score.ts` edits; keep audit artifacts.
- `depends_on:` C3.1.

**Task C3.3 — UPL regression tests that import C0 JSON index + classification artifact (machine-verifiable gate).** (Resolves CRIT-2 + WARN-11 + WARN-12.)
- File: new `src/lib/__tests__/score-upl.test.ts`.
- Specific change: test file imports both `docs/audits/2026-04-24-score-observations-line-index.json` (C0) and `docs/audits/2026-04-24-score-observations-upl.json` (C3.1). Assertions:
  - **Parity:** every `text_hash` in C0 index has a matching `text_hash` entry in C3.1 JSON. Count parity: `lineIndex.length === uplAudit.length`.
  - **Zero ADVICE:** for every C3.1 row, `classification !== "ADVICE"`.
  - **Imperative regex (sentence-initial + allow-list for QUESTION-HOOK):** for each of 10 charge types × 5 bands × 4 representative answer tuples, compute score and iterate `observations`. For each observation string, apply the regex `/^(Do not|Don't|Never|Always|Make sure|Be sure to|File a|Request a|Demand|Tell your attorney|Ask the court|Submit|Contact|Serve|Preserve|Object|Confirm|Send|Write|Recommended [^.]* action|First-pass action|you should|you must|we recommend|your attorney should)/im`. Anchors are sentence-initial (`^` + multiline flag) — not mid-sentence matches of the same verbs (CRIT-2 fix). EXCEPT: if the line begins with the literal substring `"Question to surface:"` the imperative match is allowed (allow-list lookahead — this preserves our internal questions-form and satisfies WARN-11 broader coverage). Assert zero matches under these rules.
  - **Question form:** every observation starting with `"Question to surface"` ends with `?`.
  - **Banned phrases:** no observation contains any of: `"your attorney should"`, `"you should"`, `"we recommend"`, `"you must"`.
- Verification: test runs green on clean state (post-C3.2); test runs RED on a deliberately-re-broken string; test is wired into `npm test` so CI catches drift.
- Rollback: delete the test file.
- `depends_on:` C3.2.

### C4 — Conversion-handoff tone

**Task C4.1 — Rephrase crisis-band primary-CTA H2 to information-continuity framing.**
- File: `src/app/score/ScoreClient.tsx:844-847` (H2 when live playbook branch) and `:897` (H2 when no live playbook, crisis branch).
- Specific change: replace "Your score says your defense has gaps. The ${playbookTier.name} shows you exactly where." with "The memo above flagged where your defense is behind. The ${playbookTier.name} is the charge-specific next read — the same milestones, deeper." Same treatment for `:897` H2.
- Verification: render crisis-band DUI with live playbook → assert H2 contains phrase `"next read"` OR `"deeper"` OR `"charge-specific read"`; assert H2 does NOT contain `"gaps"` OR `"exactly where"`; render crisis-band without live playbook → same assertions.
- Rollback: revert H2 strings.
- `depends_on:` C3.3.

**Task C4.2 — Adjust `bandCTAButton.Concerning` from "Find the Gaps in My Defense" to information-continuity label; evaluate Critical-band CTA deferral.** (Addresses WARN-9 — Critical-band CTA deferral consideration.)
- File: `src/app/score/ScoreClient.tsx:510-516` (`bandCTAButton` map) + `:512` Concerning entry + `:511` Critical entry.
- Specific change: replace `bandCTAButton.Concerning` "Find the Gaps in My Defense" with "Read the Deeper Version" or "Get the Charge-Specific Read". Apply the same lens to `bandCTAButton.Critical` — replace with "Read the Full File on My Case" for stronger memo-metaphor continuity. ALSO per WARN-9: for the Critical band ONLY, gate CTA rendering behind a user scroll past Frame 1 + Frame 2 (from C1.1) — implementation: CTA hidden (via `hidden` attribute or `aria-hidden=true` + `display:none`) until `result.band !== "Critical"` OR the user has scrolled past `[data-testid="critical-frame-2"]` (IntersectionObserver tracking the frame boundary). This ensures a Critical-band defendant sees the action frame + context frame BEFORE any CTA appears — no "worst news + upsell on the same screen" per Hagan Layer 3.
- Verification: snapshot `bandCTAButton` map → assert NO value matches `/gap|exposure|weakness|mistake/i` (WARN-11-extended imperative regex applied to button labels). Render Critical band at initial viewport → assert CTA not yet visible (intersection-observer state). Simulate scroll past `[data-testid="critical-frame-2"]` → assert CTA becomes visible. Render Concerning/Average/Adequate/Excellent → assert CTA visible immediately (no deferral on non-Critical bands).
- Rollback: revert map entries + remove intersection-observer gating.
- `depends_on:` C4.1.

**Task C4.3 — Secondary-CTA framing for Case Decoder upsell is "continuity" not "upsell".**
- File: `src/app/score/ScoreClient.tsx:876-887` (Case Decoder secondary block after live playbook).
- Specific change: rename link label "Learn about the Case Decoder →" to "See the deeper file read →" for continuity with the memo metaphor. Confirm no word `"upgrade"` appears anywhere in the block (case-insensitive grep).
- Verification: render → assert link element `textContent` equals literal `"See the deeper file read →"`; grep block innerHTML for `/upgrade/i` → assert zero matches.
- Rollback: revert label.
- `depends_on:` C4.2.

### Additional probes

**Task P1 — Mobile first-5-seconds audit on 375px viewport + first-fixation trace.** (Addresses SUGG-4 — add first-fixation trace, not just layout measure; addresses INFO-1 — synthetic test input.)
- File: render surface = `src/app/score/ScoreClient.tsx` pre-quiz hero + post-quiz Critical result after C1.1 + C1.4 land.
- Specific change: take two screenshots at 375×667 viewport (empty state + Critical-band populated state). **Test input tuple is synthetic — `fileRef` hardcoded `"ABN-TEST00"`, NOT pulled from production DB (INFO-1).** Measure:
  - (a) time-to-band-visible (must be within first viewport on populated state — SCORE ARC + Frame 1 fit above fold on 667px mobile tall);
  - (b) first-5-seconds scan-ability — is the Frame 1 reassurance line from C1.1 in the first viewport?
  - (c) first-fixation eye-path trace — narrate think-aloud script for what a stressed reader's eye lands on first, second, third. Document in `docs/audits/2026-04-24-score-mobile.md` (publicly committed — screenshot + narrative). Not a Hotjar integration (Bootstrap Mode $0); manual think-aloud walkthrough is sufficient for Round 0.
  Annotate screenshot.
- Verification: Playwright MCP or Claude-in-Chrome screenshot at 375×667 → DOM query of the same rendered state confirms: (a) SCORE ARC element's `getBoundingClientRect().top < 667`, (b) `[data-testid="critical-frame-1"]` element's `top < 667`, (c) urgency block still reachable without JS (tab-order test — SUGG-7). Synthetic `fileRef` present; no prod PII.
- Rollback: none (documentation task).
- `depends_on:` C1.4.

**Task P2 — Observation coverage matrix across all 10 charge types + stress-state segmentation.** (Addresses WARN-10 — stress-state column added in C3.1; P2 verifies row-count floors.)
- File: same audit file as C3.1 (`docs/audits/2026-04-24-score-observations-upl.md` + `.json`).
- Specific change: verify the audit covers every tuple. Row-count floors:
  - ≥40 charge-specific rows covering {10 charge types} × {no-attorney, has-attorney} × {early-window, mid-window}.
  - ≥15 cross-cutting rows (motions, discovery, communication, strategy, criminal-history, case-stage, license-profession).
  - Per-charge-type row count ≥ `max_per_charge - 1` (no charge significantly under-audited).
  - Every row's `stress_bands` column populated — observations active in Critical band flagged for Covello 27-word compliance on top of UPL classification.
- Verification: row-count floor met; per-charge balance met; tuple-presence confirmed (query JSON for each of 40 tuples → each present at least once); stress_bands column non-empty for every row.
- Rollback: none (documentation task).
- `depends_on:` C3.2.

**Task P3 — Anonymous-brand voice integrity scan (final gate, after C1.1-C4.3).** (Addresses SUGG-1 — P3 as final gate; addresses WARN-4 — spell out 5 columns + scope attorney regex to NEWLY TOUCHED strings; addresses WARN-6 — confirm `/score/results/[token]` isolation.)
- File: every string touched by C1.1, C1.2, C1.3, C1.4, C2.1, C2.2, C2.3, C3.2, C4.1, C4.2, C4.3.
- Specific change: P3 runs as the FINAL gate after all other tasks are complete. Run each NEWLY TOUCHED string through a markdown table in the PR description with these 5 named columns (WARN-4 — no more "(a)-(e)"):
  - **Column 1: no-service-attorney** — the word `"attorney"` NOT used to describe INAA's service. `/\battorney\b/i` match is allowed inside quoted defendant-facing copy referring to the defendant's lawyer; match is forbidden when describing INAA. Scope: regex applied ONLY to NEWLY TOUCHED strings from this audit, not the entire repo (WARN-4 narrow scope).
  - **Column 2: no-guarantees** — no outcome guarantees, no "we will win", no "you will be acquitted".
  - **Column 3: no-law-firm-tone** — voice remains defendant-to-defendant insider, not corporate lawyer voice.
  - **Column 4: information-not-advice** — observation strings never issue imperatives to the reader (cross-check with C3.3 regex).
  - **Column 5: anonymous-ownership** — "Researchers. Defendants, still fighting." brand DNA preserved; no apology for anonymity; no "our attorneys" voice.
  Each row has 5 cell values of exactly `"pass"` or `"fail"`. Also confirm `/score/results/[token]` shareable variant (WARN-6): C1.1/C1.2/C4.1/C4.2 edit shared `ScoreClient.tsx` + `bandIdentity`/`bandContextLines` maps. Declare `/score/results/[token]` IN-scope for these edits (same component rendered in both contexts) — verify rendering parity by opening the shareable variant in dev and confirming Critical-band frames + CTA deferral + diagram render identically.
- Verification: PR body contains the table with 5 named columns + named per-string rows; zero rows contain the literal `"fail"`; `/\battorney\b/i` regex scoped to NEWLY TOUCHED strings returns only legitimate defendant-referring matches; `/score/results/[token]` renders identically to `/score` post-submit for Critical band.
- Rollback: per-string rollback as listed in individual tasks.
- `depends_on:` C4.3.

### User-testing gate

**Task USER-TEST — ≥3 unmoderated defendant-proxy user-test sessions on Critical-band flow.** (Resolves CRIT-5.)
- File: `docs/audits/2026-04-24-score-user-test.md` (log output).
- Specific change: recruit ≥3 defendant-proxy testers via Prolific ($8/session under Bootstrap Mode budget = $24 total) OR legal-aid volunteer (free — preferred, confirm availability before Prolific spend). Protocol: (a) tester loads `/score` on a 375×667 mobile viewport simulator; (b) answers 10 questions using a scenario scripted to force Critical-band (DUI + no attorney + 12+ months + no discovery + no strategy + felony history + pre-trial + licensed profession); (c) lands on Critical-band result with Frame 1 + diagram + Frame 2 rendered; (d) think-aloud protocol — narrates out loud "what I'm seeing / what I think I should do / what's confusing." Pass metric: ≥2 of 3 sessions complete the "first action today" step (open or copy the attorney email template from the urgency block, as specified in Frame 1) WITHOUT asking aloud "what do I do now?" or equivalent. Each session logged as a row in `docs/audits/2026-04-24-score-user-test.md` with columns: session_id, tester_source (Prolific|legal-aid), completed_first_action (Y/N), asked_what_to_do (Y/N), notable_quotes. Synthetic-input rule: the tester uses hardcoded `fileRef="ABN-TEST00"` — never real defendant data (INFO-1).
- Verification: log file exists with ≥3 rows; `completed_first_action="Y"` count ≥ 2; `asked_what_to_do="N"` count ≥ 2 among the passing sessions; a 3rd session can fail without blocking (metric is 2-of-3).
- Rollback: none (documentation task). If the gate fails (<2/3 pass), Round 0 blocks and re-triggers plan revision on C1.1/C1.4 before Phase 5 resumes.
- `depends_on:` C1.4 + P1 (Critical-band flow must be rendered + mobile-verified before user testing).

## Out of Scope

- Case Decoder paid flow beyond the post-memo CTA handoff.
- API rate-limiting / auth — explicitly deferred (INFO-2). `/api/score` route has no rate limit and is abusable for Claude/DB cost inflation. **Tracked as post-audit task — open a Round-1 follow-on after this worry closes** to add rate limiting (sliding-window by IP, 10 req/min floor) before any public promotion of `/score`.
- Blog pipeline (off-limits per session rule).
- `/score/results/[token]` shareable variant — **in-scope only for the shared `ScoreClient.tsx` edits verified in P3** (C1.1/C1.2/C4.1/C4.2 changes propagate; rendering parity confirmed). Other `/score/results/[token]`-specific features (share metadata, token-scoped auth) remain out of scope.
- **Observation coverage expansion (Phase 2 follow-on).** P2 audit 2026-04-24 surfaced that the source emits only ~3 charge-specific observations per charge (not the aspirational 10 × 2 × 2 = 40 factorial). Authoring ~11 additional UPL-compliant observations to fill the tuple matrix is deferred to a follow-on worry. Rationale: adding observations is content-design work (Hagan + Atti lens per new tuple), distinct from the copy-calibration + UPL-safety scope of this audit. Tracker: open new worry `docs/plans/<date>-worry-score-observation-coverage.md` after this ships. Current 55-row floor satisfies SC-P2 as adjusted.

## Success Criteria

Each criterion is binary, gradeable, and independent-reader-verifiable. Spec-critic zero-tolerance applied — every criterion is machine-verifiable or explicitly gated on an artifact file that is itself machine-verifiable.

**SC-C0 (observation line index exists):** `docs/audits/2026-04-24-score-observations-line-index.json` exists + parses clean + has ≥55 rows + every row has non-null `line` + non-empty `text_hash`. Script `scripts/score-observations-index.mjs` exists and is idempotent (re-running regenerates identical output when `lib/score.ts` is unchanged). PASS = file + row count + hash population all verified.

**SC-C1.1 (Critical-band two-frame procedural flow):** Rendering `ScoreDisplay` with Critical-forced input produces two DOM elements: `[data-testid="critical-frame-1"]` and `[data-testid="critical-frame-2"]`, in that DOM order, both between the score-arc closing `</div>` and the first `<h2>` of ScoreDisplay. Frame 1 contains exactly two `<p>` elements: the first `<p>` has word count ≤ 27 AND contains NONE of the substrings {"wrong", "worse", "darker", "bad news", "gut was right"}; the second `<p>` begins with the literal string `"First action today"` AND contains a substring matching `/attorney template|preservation/i`. Frame 2 contains the `bandIdentity.Critical` + `bandContextLines.Critical` strings. Urgency block at `ScoreClient.tsx:716-737` remains reachable without JS (no `display:none`, tab order preserved). No `dangerouslySetInnerHTML` in any new render path. PASS = all element-and-substring assertions true.

**SC-C1.2 (band identity + context rewrites with file-state specificity):** `bandIdentity.Critical` and `bandContextLines.Critical` strings at `ScoreClient.tsx:493` and `:502` do NOT contain substrings: {"wrong", "permanent consequences", "darker", "worse", "bad news", "gut was right"}. Each string has word count ≤ 27 (Covello rule). `bandIdentity.Critical` contains a runtime-interpolated `[N]` or `${observations.filter(...).length}` — integer at render. PASS = both strings pass substring exclusion + word-count + interpolation test.

**SC-C1.3 (teaser information-continuity, single path):** With `result.band === "Critical"`, teaser prop passed into `<InternalMemo>` equals the literal string `"More file notes are ready for you — where should we send them?"` (no OR alternatives). With other bands, original teaser `"Additional findings pending — delivered by secure channel."` renders unchanged. PASS = both conditional cases verified via render test.

**SC-C1.4 (Critical-band procedural diagram):** `[data-testid="critical-procedural-diagram"]` element exists when `result.band === "Critical"` and is absent when band is Concerning/Average/Adequate/Excellent. Descendant procedural-node count ≥ 3. Each node has a plain-language `textContent` label — if any node text contains the bare terms `motion`, `discovery`, `brief`, `subpoena`, `suppress`, `arraignment` without a parenthetical plain-language translation adjacent, SC fails. `<figcaption>` present and non-empty for screen-reader path. Cited: Hagan Visual Legal Help + Plain-Language Principle (c). PASS = all element + label + a11y assertions.

**SC-C2.1 (Q7 action-first helper):** Rendering Q7 produces a helper element associated with the fieldset (inside `<legend>` or via `aria-describedby`). Helper `textContent` contains substring `"Pick \"I don't know\" if"`. Helper renders as JSX text node (not `dangerouslySetInnerHTML`). PASS = DOM query + substring + render-path checks all true.

**SC-C2.2 (Q8 action-first helper, pre-answer):** Rendering Q8 produces a helper under `<legend>` or via `aria-describedby`. Helper `textContent` contains substring `"Pick \"I don't know what that is\""` AND the phrase `"police reports"`. Renders as JSX text node. PASS = all substring + association + render-path checks.

**SC-C2.3 (Q4 action-first helper, loosened substring check):** Q4 `<fieldset>` renders a helper whose `textContent` contains substring `"Pick \"No\""` AND at least 2 of the 3 substrings from {`"what defense"`, `"end game"`, `"motions"`} (WARN-3 loosen — 2-of-3 passes, not 3-of-3). Existing unit tests asserting scoring output for `strategyDiscussed=yes-detail` remain green (byte-identical score). PASS = substring-pair match + association + regression tests green.

**SC-C3.1 (classification audit artifacts exist, machine-verifiable):** `docs/audits/2026-04-24-score-observations-upl.md` (markdown) AND `docs/audits/2026-04-24-score-observations-upl.json` (machine-verifiable companion) both exist. Row count matches C0 line index row count (parity via text_hash). Every row has non-empty `classification ∈ {INFORMATION, QUESTION-HOOK, ADVICE}` + non-empty `verdict ∈ {KEEP, REPHRASE, DELETE}` + non-empty `stress_bands` array. Markdown doc references `/score` local-regex UPL gate vs `evaluate-report` LLM classifier asymmetry + post-audit escalation trigger (WARN-13). PASS = files + row parity + column completeness + asymmetry note all verified.

**SC-C3.2 (zero ADVICE remaining, imperative-regex machine-verifiable gate):** After C3.2 edits, re-running C0 index + C3.1 classifier produces a JSON where zero rows have `classification === "ADVICE"`. Running the broader sentence-initial imperative regex (defined in C3.3) against `src/lib/score.ts` returns zero matches on any line whose trimmed content does NOT begin with `"Question to surface:"`. Unsourced statistical claims (e.g. "~70%") are DELETED, not REPHRASED to softer stats (WARN-8). PASS = JSON-zero-ADVICE + regex-zero-on-non-question-lines + no-soft-stat-swap all true.

**SC-C3.3 (UPL regression test green, imports C0 + C3.1 JSON artifacts):** `src/lib/__tests__/score-upl.test.ts` exists + wired into `npm test`. Imports `docs/audits/2026-04-24-score-observations-line-index.json` + `docs/audits/2026-04-24-score-observations-upl.json`. Asserts: (a) text_hash parity between the two JSONs; (b) zero ADVICE rows in C3.1 JSON; (c) for each of 10 charge types × 5 bands × 4 representative answer tuples, no observation matches the sentence-initial imperative regex (with QUESTION-HOOK allow-list); (d) every `"Question to surface"` observation ends with `?`; (e) banned-phrase scan (`"your attorney should"`, `"you should"`, `"we recommend"`, `"you must"`) returns zero matches. Test runs green post-C3.2; runs RED on deliberately-broken string. PASS = test file exists + CI-wired + all 5 assertion classes green.

**SC-C4.1 (crisis-band H2 rephrased):** H2 strings at `ScoreClient.tsx:846` and `:897` do NOT contain substrings `"gaps"` OR `"exactly where"`; DO contain one of `"next read"` / `"deeper"` / `"charge-specific read"`. Applies to both live-playbook and no-live-playbook crisis branches. PASS = both H2s pass both substring checks.

**SC-C4.2 (CTA button labels + Critical-band deferral):** `bandCTAButton` map contains zero values matching `/gap|exposure|weakness|mistake/i`. Critical-band CTA is NOT rendered at initial viewport when `result.band === "Critical"`; becomes visible only after user scrolls past `[data-testid="critical-frame-2"]` (IntersectionObserver-gated). Non-Critical bands: CTA visible immediately. PASS = regex scan + Critical-deferral + non-Critical-immediate all verified.

**SC-C4.3 (upsell → continuity):** Case Decoder secondary block at `ScoreClient.tsx:876-887` does NOT contain word `"upgrade"` (case-insensitive). Link element `textContent` equals the literal string `"See the deeper file read →"`. PASS = both checks.

**SC-P1 (mobile first-5-seconds + first-fixation trace):** Playwright screenshot at 375×667 viewport of Critical-forced state saved to `docs/audits/2026-04-24-score-mobile.md`. DOM query of the same rendered state confirms: (a) SCORE ARC element's `getBoundingClientRect().top < 667`, (b) `[data-testid="critical-frame-1"]` element's `getBoundingClientRect().top < 667`, (c) urgency block reachable via keyboard tab order without `display:none` (SUGG-7). Mobile audit doc also includes first-fixation think-aloud narrative (SUGG-4). Screenshots use synthetic `fileRef="ABN-TEST00"` (INFO-1). PASS = screenshot file + bounding-box + a11y-tab-order + narrative all verified.

**SC-P2 (observation coverage + stress-state segmentation — adjusted to source truth 2026-04-24):** Audit JSON from SC-C3.1 has `stress_bands` column non-empty for every row (WARN-10). Per-charge-type row count ≥ `max_per_charge - 1`. Total post-C3 row count ≥ 55 (source truth floor: 29 charge-specific + 26 cross-cutting = 55). **Aspirational 40-tuple factorial floor (10 charges × 2 attorney_state × 2 time_window) was infeasible against current `src/lib/score.ts` source — the source emits ~3 observations per charge, not 4. Expanding coverage to the full 40-tuple factorial requires authoring ~11 new UPL-compliant observations, deferred to a tracked follow-up task (see Out of Scope).** PASS = row-count ≥ 55 + per-charge-balance + stress-column-populated all true.

**SC-P3 (brand-voice integrity, 5 named columns, NEWLY TOUCHED scoping):** PR description contains markdown table with one row per string touched by C1.1/C1.2/C1.3/C1.4/C2.1/C2.2/C2.3/C3.2/C4.1/C4.2/C4.3. Each row has 5 named columns: `no-service-attorney`, `no-guarantees`, `no-law-firm-tone`, `information-not-advice`, `anonymous-ownership`. Cell values exactly `"pass"` or `"fail"`. Zero rows contain literal `"fail"`. `/\battorney\b/i` regex scoped to NEWLY TOUCHED strings (not entire repo — WARN-4) returns only legitimate defendant-referring matches. `/score/results/[token]` renders identically to `/score` post-submit for Critical band (WARN-6). PASS = table + pass-count + scoped-regex + shareable-variant-parity all verified.

**SC-USER-TEST (defendant-proxy testing, ≥2-of-3 pass):** `docs/audits/2026-04-24-score-user-test.md` exists with ≥3 session rows. `completed_first_action="Y"` count ≥ 2. `asked_what_to_do="N"` count ≥ 2 among passing sessions. Testers recruited via Prolific (≤$24 total under Bootstrap Mode) OR legal-aid volunteer (preferred, free). Synthetic `fileRef="ABN-TEST00"` used throughout. Think-aloud protocol documented. PASS = file + row count + 2-of-3 completion + synthetic-input all verified. FAIL = <2-of-3 pass → Round 0 re-opens C1.1/C1.4 revision.

**SC-Aggregate (Pristine-Or-Nothing):** All 17 success criteria above PASS (SC-C0, SC-C1.1, SC-C1.2, SC-C1.3, SC-C1.4, SC-C2.1, SC-C2.2, SC-C2.3, SC-C3.1, SC-C3.2, SC-C3.3, SC-C4.1, SC-C4.2, SC-C4.3, SC-P1, SC-P2, SC-P3, SC-USER-TEST). Any failing criterion blocks the worry from closing. Per `rules/atlas-identity.md` Pristine-Or-Nothing: severity informs order, not scope.

## Rounds Log

_Populated per-round by Phase 6._
