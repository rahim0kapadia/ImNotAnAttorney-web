# Case Decoder Product QA, Design Spec

Date: 2026-03-27

## Context

- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Case Decoder ($197) is LIVE accepting real payments. The technical pipeline passed E2E (117/117) and received 16 audit fixes. But no one has evaluated the ACTUAL PRODUCT, does the report justify $197? Does it deliver on every checkout promise? Can someone at 2AM on their phone complete the flow?
- **Tech stack:** Next.js 15, Supabase, Stripe, Resend, Claude API (Opus 4.6 + Sonnet 4.6)
- **Key files to read first:**
  - `src/app/api/intake/route.ts`, intake API (400 lines)
  - `supabase/functions/generate-report/index.ts`, report generation (~5,000 lines)
  - `src/lib/intelligence-brief/prompts.ts`, 9 prompt builders (4,500+ lines)
  - `src/app/checkout/page.tsx`, checkout promises
  - `test-reports/persona-a-dui.html`, pre-built test report
- **Key decisions:**
  - Use `generate-worker.mjs` (not Edge Function) for local report generation, avoids 150s timeout
  - Run `evaluate-report.mjs` dev tool for full quality review (production only runs 2 of 11 teams)
  - Use pre-built test reports for structural audit, fresh report for quality review
  - KDP cross-sell is OUT OF SCOPE (cross-project boundary)
- **Setup/prerequisites:** `.env.local` with ANTHROPIC_API_KEY, SUPABASE_URL/KEY, OPERATOR_SECRET

## What Was Already Verified (Prior Sessions)

- E2E pipeline: 117/117 across all 6 pipelines
- Code review: 2 passes, 16 fixes deployed
- Security audit: 5 issues found and fixed
- Stripe live mode: Case Decoder flipped to `live: true`
- Homepage: Multi-charge redesign QA passed (8 charge types, dynamic CTAs, playbook catalog)

## What This QA Covers

Product quality, not pipeline plumbing. Seven phases:

---

### Phase 1: Structural Promise Audit

**Goal:** Every bullet on the checkout page must exist in the generated report.

**Method:** Code-level comparison. Read checkout page promises, map each to a report section in the renderer/prompts.

**Checkout promises to verify (from `src/app/checkout/page.tsx`):**

| # | Promise | Expected Report Section |
|---|---------|------------------------|
| 1 | Plain-English charge breakdown | Section: "Understanding Your Charges" |
| 2 | 15 calibrated questions (6-part format) | Section: "Questions for Your Attorney" |
| 3 | Ready-to-send email template | Section: "Exactly What to Say" |
| 4 | Phone script | Section: within "Your Plan" |
| 5 | Follow-up email template | Section: within "Your Plan" |
| 6 | Your Advocacy Steps (8-step playbook) | Section: "Your Advocacy Steps" |
| 7 | Where Things Stand (4-area diagnostic) | Section: "Where Things Stand" |
| 8 | Your Next 7 Days (daily action plan) | Section: "Your Next 7 Days" |
| 9 | Meeting Ready Sheet (printable) | Section: within "Your Plan" or appendix |
| 10 | Expert methodology from 3 elite attorneys | Methodology note in header |
| 11 | Scripts for difficult conversations (4 scenarios) | Section: "When the Conversation Gets Difficult" |
| 12 | 48-hour delivery guarantee | Operational (not in report) |
| 13 | Full refund guarantee | Operational (not in report) |

**Pass criteria:** Every promise (1-11) maps to a real section in the renderer. Missing = CRITICAL finding.

**Files to read:**
- `src/app/checkout/page.tsx`, the promises
- `src/lib/intelligence-brief/render.ts`, the renderer (what sections get built)
- `test-reports/persona-a-dui.html`, verify sections exist in actual output

---

### Phase 2: Fresh Report Generation

**Goal:** Generate a real Case Decoder report to assess output quality.

**Method:**
1. Create test intake in Supabase (DUI, Harris County TX)
2. Create linked case with `status='intake'`
3. Run `node scripts/generate-worker.mjs` to trigger real Opus generation
4. Save output HTML for all subsequent phases

**Test persona:** Danielle (from existing test fixtures)
- Charge: DUI first offense, State: Texas (Harris County)
- BAC: 0.09, Has attorney (public defender), Communication: poor
- Rich situation narrative

**Fallback:** If generation fails, use `test-reports/persona-a-dui.html` and note failure as finding.

**Pass criteria:** Report generates within 5 minutes. Output HTML >5KB.

---

### Phase 3: Playwright UX Walkthrough

**Goal:** Verify the full customer journey on the live site. Focus on mobile crisis UX.

**Desktop walkthrough (1440px):**
1. Homepage -> charge select -> CTA -> checkout page -> verify promises
2. /sample page -> verify sample report renders
3. /start page -> intake flow accessible
4. /intake page -> form renders, all fields present

**Mobile walkthrough (375px), the 2AM crisis test:**
1. Same flow as desktop
2. Intake form completable on phone screen
3. Key messages under 27 words (Covello stress rule)
4. No horizontal scroll, 44px+ touch targets
5. CTA buttons visible above fold

**Specific checks:**
- Intake form step count and field count per step
- Error states (submit with missing required fields)
- Guarantee/refund language visible before payment

**Pass criteria:** Full flow completable on both viewports. No broken layouts or inaccessible elements.

---

### Phase 4: Full Quality Review

**Goal:** Run the full 11-team framework against the fresh report.

**Method:** Use `evaluate-report.mjs` dev tool (runs all available teams locally, not just the 2 in production).

**GATE teams for Case Decoder:**
- Team 1 (UPL Compliance): 15 criteria, MUST PASS ALL
- Team 9 (Positioning): 13 criteria, pro-defendant, never anti-attorney
- Team 10 (CRO): 17 criteria, crisis-buyer psychology
- Team 11 (Trust): 10 criteria, anonymous brand trust

**HIGH teams:**
- Team 2 (Psychological Architecture): 14 criteria
- Team 3 (Legal Substance): 10 criteria
- Team 4 (Defendant Experience): 27 criteria
- Team 7 (System Truth): 16 criteria

**Critical finding from exploration:** Production eval Edge Function only runs Team 1 + Team 2. Full dev tool runs 7 teams at ~$5-8/run.

**Pass criteria:** Zero FAIL on Team 1. No more than 2 WARN on Teams 9-11.

---

### Phase 5: Expert Persona Review

**Goal:** Assess the product through 6 expert frameworks for blind spots.

**Method:** 6 parallel Agent subagents. Each reads: fresh report HTML, checkout page code, intake form code, drip email definitions.

| Persona | Agent Type | Key Question |
|---------|---------, |------------, |
| Sabri Suby | sabri-suby | Does deliverable match every sales promise? Would this convert cold traffic? |
| Alex Hormozi | alex-hormozi | Value equation: Dream Outcome x Likelihood / (Time x Effort). Is $197 a no-brainer? |
| Peep Laja | peep-laja | Where does the funnel leak? Friction in intake -> report -> upgrade? |
| Russell Brunson | russell-brunson | Is Case Decoder the right entry point? Does it lead to IB ($997) upgrade? |
| April Dunford | april-dunford | Is "legal research for defendants" differentiated from attorney services? |
| Seth Godin | seth-godin | Would a defendant tell another defendant about this? Is it remarkable? |

**Each agent returns:** Structured verdict (PASS/WARN/FAIL), 3-5 specific findings, actionable fixes.

---

### Phase 6: Edge Cases (Conditional)

**Trigger:** Only if Phases 1-4 reveal structural issues with charge-type handling.

**Cases:**
1. **Minimal intake**, only required fields, no situation narrative. Does report still justify $197?
2. **Sex offense**, highest sensitivity. SANE kit, registry, victim terminology handled?
3. **Federal criminal**, different court system. Jurisdiction sections adapt?
4. **Self-defense**, justification defense. Outcome map makes sense?

**Method:** Generate via worker, quick-scan for obvious issues.

**Pass criteria:** Reports are charge-specific. No DUI language in non-DUI reports.

---

### Phase 7: Competitive Benchmark (Web Research)

**Goal:** Validate $197 pricing against the market.

**Research targets:**
- Attorney consultation rates (initial, hourly)
- Legal second-opinion services (Avvo, JustAnswer, etc.)
- Defendant advocacy/preparation services
- AI-powered legal research tools

**Pass criteria:** $197 positioned correctly. At least 3x value gap vs nearest alternative.

---

## Out of Scope

- KDP book alignment (cross-project boundary)
- Drip email content QA (mechanically verified, content covered by Phase 5)
- Load testing (premature)
- Intelligence Brief / X-Ray QA (test mode tiers)
- Stripe webhook testing (117/117 E2E)

## Output

Findings doc: `docs/handoff/2026-03-27-case-decoder-product-qa-findings.md`

Structure:
- Executive summary (PASS/FAIL per phase)
- Detailed findings per phase with file:line references
- Issues ranked: CRITICAL / HIGH / MEDIUM / LOW
- Fix recommendations (or fixes applied)
- Expert persona verdicts
- Competitive positioning data
