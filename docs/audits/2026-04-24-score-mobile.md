# P1 — Mobile 375×667 Audit — /score Critical-band Results

**Date:** 2026-04-24
**Worktree:** `C:\Users\email\projects\score-exec` (feat/score-page-worry-pristine)
**Component under audit:** `src/app/score/ScoreClient.tsx` (post C1.1–C4.3)
**Viewport target:** 375×667 (iPhone SE portrait — tightest mobile baseline we support)
**SC addressed:** SC-P1

## Synthetic test-input tuple (INFO-1 compliance)

No real defendant identifiers used. `fileRef` is hardcoded via `ABN-TEST00`. `/api/score` is session-only and does not persist to DB per code review of `src/app/api/score/route.ts` (no Supabase insert path touches this endpoint).

Forced-Critical answer tuple (reliably scores ≤50):

```json
{
  "chargeType": "dui",
  "hasAttorney": "no",
  "timeSinceArrest": "12-plus-months",
  "motionsFiled": "no",
  "hasDiscovery": "no",
  "communicationFrequency": "never",
  "strategyDiscussed": "no",
  "criminalHistory": "felony",
  "caseStage": "pre-trial",
  "licensedProfession": "yes-licensed"
}
```

Empty-state tuple (score ≥ 80, Excellent band, used to confirm non-Critical layout still renders action-free):

```json
{
  "chargeType": "other-misdemeanor",
  "hasAttorney": "private",
  "timeSinceArrest": "less-than-1-month",
  "motionsFiled": "yes",
  "hasDiscovery": "yes",
  "communicationFrequency": "weekly",
  "strategyDiscussed": "yes-detail",
  "criminalHistory": "none",
  "caseStage": "pre-trial",
  "licensedProfession": "no"
}
```

## Verification path (Playwright MCP commands — to run during live `npm run dev` session)

Playwright MCP requires a running dev server to attach to. Static audit documents the commands + DOM queries; live capture deferred. Steps:

1. **Start dev server in worktree:** `cd C:\Users\email\projects\score-exec && npm run dev` (port 3000).
2. **Open target URL at 375×667:** `mcp__Claude_in_Chrome__navigate` to `http://localhost:3000/score` with `viewport: {width: 375, height: 667}`.
3. **Fill + submit the Critical tuple:** use `mcp__Claude_in_Chrome__form_input` on each of the 10 radio groups (order per `questions[]` in `ScoreClient.tsx:147-260`), then click "Score My Defense".
4. **Land on results; wait for ARC animation to settle (~1.5s):** `mcp__Claude_in_Chrome__javascript_tool` — await `document.querySelector('[aria-label*="Masked Researcher"]')`.
5. **Query first-fold element positions** (each must have `rect.top < 667`):
   ```js
   document.querySelector('[aria-label*="Masked Researcher"]').getBoundingClientRect().top  // ARC container
   document.querySelector('[data-testid="critical-frame-1"]').getBoundingClientRect().top   // action frame
   document.querySelector('[data-testid="critical-frame-1"] p').getBoundingClientRect().top // validating line
   document.querySelectorAll('[data-testid="critical-frame-1"] p')[1].getBoundingClientRect().top // "First action today"
   document.querySelector('[data-testid="critical-procedural-diagram"]').getBoundingClientRect().top // SVG diagram
   ```
6. **Verify urgency block is reachable (not display:none, not hidden):**
   ```js
   const u = document.querySelector('.border-rose-500\\/30');
   window.getComputedStyle(u).display !== 'none' && !u.hasAttribute('hidden')
   ```
7. **Verify CTA is NOT visible at initial viewport** (IntersectionObserver-gated per C4.2):
   ```js
   // The CTA section renders as the next `.rounded-xl.border-amber-500\\/30` after urgency.
   // On Critical band, until user scrolls past `[data-testid="critical-frame-2"]`,
   // the CTA block should not be present in the DOM (conditional render, not hidden).
   document.querySelectorAll('a[href*="/checkout"]').length === 0
   ```
8. **Capture screenshots:** `mcp__Claude_in_Chrome__computer` action `screenshot` → save to `./screenshots/critical-375x667.png` and `./screenshots/empty-375x667.png` after re-run with the empty-state tuple.

## First-fixation narrative (Bootstrap Mode: manual walkthrough, no Hotjar)

**Stress-peak reader model:** 2 AM, post-arrest, tunnel-vision-narrow attention, heart rate elevated, processing reduced ~80% (Covello). Not a calm reader.

**Ideal mobile first-fixation path on a Critical result (top-down, 375×667 viewport):**

1. **Frame 0, t≈0ms — SCORE ARC.** Numeric anchor enters viewport first. Large type. Color-band (red for Critical) carries pre-cognitive meaning before the reader even parses digits. Covello PAIN: acknowledges-without-explaining what the reader already feels.
2. **t≈200ms — Band label + validating subtitle.** "Critical" in red, then `bandIdentity.Critical`: "The check flagged N milestone(s) behind pace." Interpolated file-state count — specificity over reassurance (Bloomstein).
3. **t≈500ms — Frame 1 action frame.** Amber-bordered card. First paragraph: "You ran the check before your next court date. That is the one move most defendants miss." Validates agency. Second paragraph: "First action today: Copy the attorney template below and send it before your next court date, not after." Single imperative → single artifact reference (the template lower down).
4. **t≈800ms — Procedural diagram SVG.** Three-node path: `1 You are HERE → 2 Next 72 hours → 3 Next court date`. Visual chronology collapses a written paragraph into 5 tokens (Hagan Layer 2). Caption under SVG restates the path in text for screen readers + non-decoders.
5. **Scroll t≈2s — Frame 2 context frame.** Zinc-bordered. `bandContextLines.Critical`: "Each flagged milestone has a specific first-move we walk through below." Hands off to InternalMemo + attorney template.
6. **Scroll t≈4s — Urgency block.** Rose-bordered. Charge-specific time-sensitive info (DUI breathalyzer retention, drug-possession suppression windows, etc.). No CTA yet.
7. **Scroll t≈6s+ — Attorney email template + memo.** Free value before any paid ask (Task 1.1).
8. **Scroll t≈10s+ — IntersectionObserver fires on Frame 2.** Only then does the CTA mount (C4.2). Reader has consumed validation + action + urgency before seeing any upsell.

**Primary risk to verify on live capture:** on a 375×667 viewport, the ARC is roughly 200px tall; Frame 1 starts ~220px below. Both ARC + the first paragraph of Frame 1 should land above the 667px fold. The "First action today" line may land at ~400–500px depending on padding — still above the fold. The SVG diagram sits at ~480–580px; its top should be above the fold but the full diagram + caption may extend slightly past it (acceptable — diagram is a pull-down artifact, not first-glance).

**Secondary risk:** the ARC animation (`AnimatedScoreArc`) is motion-sensitive. Users with `prefers-reduced-motion` get the static value immediately per `useReducedMotion` elsewhere in the component. Verify during capture that reduced-motion does not push the numeric below the fold.

## Screenshot placeholders

To be captured during a live dev-server session:

- `./screenshots/critical-375x667.png` — Critical-tuple result page, viewport 375×667, initial render (no scroll). Should show: ARC + band label + Frame 1 validating line + "First action today" + part of SVG diagram.
- `./screenshots/empty-375x667.png` — Excellent-tuple (empty-state) result page, viewport 375×667, initial render. Should show: ARC + band label + non-Critical layout (no Frame 1 / Frame 2, standard memo-first layout).

Commit images after capture. Reference them inline via relative markdown image paths once saved.

## Verdict

**Static audit:** structural criteria satisfied by code inspection. ARC is first child of `.mt-8.space-y-6` container; Frame 1 + procedural diagram render before Frame 2 (C1.1 ordering); urgency block is conditional on `result.score <= 55` with no `hidden` or `display:none` path; CTA is gated by `criticalFrameTwoVisible` state that only flips when Frame 2 enters viewport (C4.2).

**Pending live-render verification:** DOM `getBoundingClientRect()` assertions + screenshot capture must happen during a real dev-server session. Commands + queries documented above are copy-paste-ready.

**SC-P1 status:** static structural PASS, pending live-render confirmation.
