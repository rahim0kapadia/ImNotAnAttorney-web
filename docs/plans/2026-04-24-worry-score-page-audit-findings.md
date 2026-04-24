# /score Page Audit — Round 0 Findings (Phase 4 Plan Review)

**Date:** 2026-04-24
**Round:** 0 (plan review, pre-execution)
**Reviewers:** code-reviewer + security-auditor + Hagan-lens (general-purpose + margaret-hagan.md profile)
**Plan under review:** `docs/plans/2026-04-24-worry-score-page-audit.md`

## Severity tally

- CRITICAL: 5
- WARNING: 14
- SUGGESTION: 7
- INFO: 2
- **Total:** 28

Per Pristine-Or-Nothing, every finding must be fixed in the PLAN before Phase 5 execution.

## Critical findings (5) — plan methodology / structural

### CRIT-1 — Stale line references in C3.1 (code-reviewer)
`src/lib/score.ts` line numbers hard-coded (115, 119, 124, 130...303). Any file change invalidates the audit scope. **Fix:** add Phase 5 prereq "regrep observation returns + regenerate authoritative line index" before C3.1. Replace hardcoded list with regex-based discovery.

### CRIT-2 — SC-C3.2 imperative regex self-contradicts (code-reviewer)
Regex `/send a|write a/i` matches innocuous prose ("send a written status request" in proposed QUESTION-HOOK; "write a date down"). Self-contradicting criterion. **Fix:** narrow to sentence-initial anchors on reader-subject imperatives OR use QUESTION-HOOK allow-list lookahead. Verify proposed replacements pass their own regex.

### CRIT-3 — C1.1 is copy-insertion, not process redesign (Hagan-lens)
Plan adds "one reassurance sentence + first-action line" as DOM between arc and h2. Hagan Layer 2 (Process Design) says Critical-band is a branch point in the procedural journey, not a paragraph reword. Existing render order interleaves loss framing and reassurance instead of sequencing them. **Fix:** redesign as visible procedural flow (Visual Legal Help flowchart pattern). First screen = action; second screen = context; urgency block as optional expansion. Covello's 27-word rule applies to the FIRST thing at stress peak, not a patch between frames.

### CRIT-4 — Missing Critical-band procedural diagram (Hagan-lens)
Hagan's signature A2J pattern is the procedural-sequence diagram (eviction-summons precedent). Critical defendants need to see: "you are HERE → next 72 hours → next court date → what a motion is." Plan has zero visual-procedure tasks. **Fix:** add task "Critical-band procedural diagram showing next 3 milestones." Cites Hagan Visual Legal Help + Principle (c) — diagrams for procedural sequences.

### CRIT-5 — SCs lack "test under stress with actual users" (Hagan-lens)
Every SC is colleague-verifiable (regex, word count, DOM). Hagan Principle (e) explicitly rejects colleague validation; requires stressed non-lawyer user testing. **Fix:** add SC requiring ≥3 unmoderated defendant-proxy sessions (legal-aid volunteer or Prolific $8/session under Bootstrap Mode) with think-aloud on Critical-band flow. Metric: completion of "first action" without asking "what do I do now?" aloud.

## Warning findings (14)

### From code-reviewer:

**WARN-1 — Task C1.3 offers multiple outcomes (line 80).** Task says "gate teaser OR swap phrasing" with a third "Preferred" option, but SC-C1.3 only accepts the swap/absent path. **Fix:** collapse to single prescribed change matching SC-C1.3 exactly.

**WARN-2 — C3.2 ordering dependency on C3.1 undeclared.** C3.2 needs C3.1's audit doc as input; no explicit `depends_on` marker. **Fix:** mark `depends_on: C3.1` + gate C3.2 blocked until C3.1 doc complete.

**WARN-3 — SC-C2.3 locks copy to 3 exact substrings.** "what defense" AND "end game" AND "motions" required — any edit fails the gate. **Fix:** loosen to 2-of-3 OR note SC verifies the literal draft copy and future edits require SC update.

**WARN-4 — SC-P3 columns ambiguous.** "(a)-(e)" labels without names. Also `/\battorney\b/i` overscopes (Q7/Q8 helpers legitimately reference "attorney"). **Fix:** spell out the 5 columns explicitly; scope attorney regex to NEWLY TOUCHED strings only.

**WARN-5 — Task C3.2 implicit sub-task ("verify 70% stat or delete").** No task scoped to verify RPC. **Fix:** split into C3.2a (grep for source) + C3.2b (delete if unsourced).

**WARN-6 — Out-of-Scope ambiguity on `/score/results/[token]`.** Shareable variant "out of scope unless directly affected" but C1.1/C1.2/C4.1/C4.2 change shared `ScoreClient.tsx` + `bandIdentity`/`bandContextLines` maps. **Fix:** pre-declare IN-scope OR add verification task confirming isolation.

### From Hagan-lens:

**WARN-7 — C2.1/C2.2/C2.3 helpers answer wrong question.** Helpers translate "what IS a motion" — Hagan Principle (a) says lead with what reader must DO. **Fix:** rewrite as action-first ("Pick 'I don't know' if your attorney hasn't told you about any filings. This is normal.") instead of definition-first. Lowers ability-gate (Fogg).

**WARN-8 — C3.2 statistic deletion swaps one risk for another.** Replacing potentially-hallucinated "~70%" with "charge-neutral soft stat" creates a second UPL risk (implied statistical authority without verifiable source). **Fix:** either cite internal RPC with source_urls populated per `no-hallucinated-legal-data.md`, or DELETE — do not REPHRASE.

**WARN-9 — C4 tasks assume CTA placement is fixed.** Hagan Layer 3 (System Design) asks: should a Critical-band defendant see ANY CTA on the same screen as their worst news? **Fix:** add task evaluating Critical-band CTA deferral (show CTA only after reassurance + first-action acknowledgment).

**WARN-10 — SC-C3.1 row count floor (55) lacks stress-state segmentation.** Coverage counted; stress-coverage missing. **Fix:** add column "stress-state trigger" (which bands × crisis-tuples activate the string). Rows activating in Critical require Covello 27-word compliance on top of UPL classification.

### From security-auditor:

**WARN-11 — C3.2 regex misses imperative variants (A04 Insecure Design).** Doesn't catch "don't", "do not", "always", "never", "make sure", "file a", "request a", "demand", "tell your attorney", "ask the court", sentence-initial verbs. "Don't speak to police" passes through. **Fix:** extend regex.

**WARN-12 — C3.1 classifier is prose-only, no machine-verifiable gate (A04).** Audit artifact drifts from runtime over time. **Fix:** emit `docs/audits/2026-04-24-score-observations-upl.json` with `{line, text_hash, classification, verdict}`. C3.3 test imports it + asserts every string in `lib/score.ts` has matching `text_hash` with classification ≠ "ADVICE".

**WARN-13 — SC-C3.3 UPL gate weaker than `evaluate-report` Edge Function (A04).** `/score` ships observations with local regex gate; `evaluate-report` uses LLM classifier. **Fix:** note asymmetry explicitly + add escalation trigger ("if `/score` volume crosses X/day, escalate to shared gate").

**WARN-14 — Helper strings must render as JSX text nodes, not dangerouslySetInnerHTML (A03 Injection).** Existing `dangerouslySetInnerHTML` at `layout.tsx:32` + `ScoreClient.tsx:1268` are JSON.stringify'd schema — safe. New copy must NOT copy the pattern. **Fix:** explicit note in C1.1 / C2.1 / C2.2 / C2.3: "Helper renders as JSX text node (`<p>{helper}</p>`) — NEVER `dangerouslySetInnerHTML`."

## Suggestion findings (7)

### From code-reviewer:

**SUGG-1 — Task P3 runs after C1-C4; declare as final gate.**
**SUGG-2 — Task C1.1 references urgency block at `ScoreClient.tsx:716-737`; verify that block is free-tier-independent before using as referent.**

### From Hagan-lens:

**SUGG-3 — C1.2 "you caught something worth catching" pat reassurance.** Bloomstein: trust with trust-broken people comes from specificity, not warmth. **Fix:** replace with file-state specificity ("The check flagged [N] milestones behind pace.").

**SUGG-4 — P1 mobile audit treats visual fixation as layout problem.** Bounding-box < 667 measures visibility, not comprehension. **Fix:** add first-fixation eye-path trace (thinking-aloud or Hotjar).

**SUGG-5 — Missing Hagan Principle (c) application to memo rendering.** Memo is dense prose; A2J pattern says procedural flowcharts beat prose. **Fix:** evaluate memo's 3-5 top findings as icon-diagram or flow format.

### From security-auditor:

**SUGG-6 — SC-C1.1 assertion brittle to i18n/rewrites (A05 Misconfig).** DOM-position substring match. **Fix:** add `data-testid="critical-reassurance"` to the new block; target via test-id.

**SUGG-7 — C1.1 reassurance must not DOM-hide urgency preservation notice (A04).** SC-P1 checks bounding-box top but not reachability of urgency block. **Fix:** assert urgency block (`ScoreClient.tsx:716-737`) still reachable without JS (no display:none/hidden), tab order still lands there.

## Info findings (2)

### From security-auditor:

**INFO-1 — P1 screenshot PII risk (A09).** Screenshots could include real defendant identifiers if test input is from prod DB. **Fix:** explicit language — "Test input tuple is synthetic; `fileRef` hardcoded `ABN-TEST00`, not prod-pulled. Screenshots committed to public repo."

**INFO-2 — `/api/score` has no rate limit; Out-of-Scope deferral acknowledged but not tracked.** **Fix:** add to Out-of-Scope block: "API rate-limiting explicitly deferred; `/api/score` route has no rate limit, abusable for Claude/DB cost inflation. Track separately as post-audit task."

## No-finding areas (verified safe by security-auditor)

- InternalMemo XSS — all fields render as JSX text nodes (auto-escaped). C1.3 teaser rewrite is safe.
- Input validation — `/api/score/route.ts` uses strict enum allowlists.
- PII in logs — `/api/score` does not log request bodies.
- a11y security — no redaction of critical notices.

## Next step

All 28 findings require plan revision before Phase 5 execute (Pristine-Or-Nothing applies). 3 critical findings (CRIT-3, CRIT-4, CRIT-5) are STRUCTURAL — they challenge the plan's methodology, not just copy polish. They re-scope C1.1 from a 3-line DOM insertion into a proper Hagan-style procedural redesign with user testing.

Checkpoint: user reviews findings. Decide whether to (a) integrate + continue skill through Phase 5-7 in same session, or (b) pause here with plan + findings documented for a separate execution session.
