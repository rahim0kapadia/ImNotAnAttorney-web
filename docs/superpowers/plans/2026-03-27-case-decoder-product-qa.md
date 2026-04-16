# Case Decoder Product QA, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the Case Decoder ($197) delivers a report worth its price, every checkout promise fulfilled, UPL-clean, mobile-ready, and positioned correctly against competitors.

**Architecture:** 7-phase QA: structural promise audit (code-level) → fresh report generation (Opus via worker) → Playwright UX walkthrough (desktop + mobile) → full quality framework review (dev tool) → expert persona assessment (6 parallel agents) → edge cases (conditional) → competitive benchmark (web research). Findings written to a single handoff doc.

**Tech Stack:** Next.js 15, Supabase, Claude API (Opus 4.6), Playwright MCP, generate-worker.mjs, evaluate-report.mjs

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-27-case-decoder-product-qa-design.md`

---

### Task 1: Structural Promise Audit

**Goal:** Map every checkout page promise to a report section. Any missing section = CRITICAL.

**Files:**
- Read: `src/app/checkout/page.tsx`, checkout promises (look for Case Decoder feature bullets)
- Read: `src/lib/intelligence-brief/render.ts`, HTML renderer (section assembly order)
- Read: `src/lib/intelligence-brief/prompts.ts`, prompt builders (what sections are generated)
- Read: `test-reports/persona-a-dui.html`, pre-built test report (verify sections exist in output)
- Read: `src/app/sample/page.tsx`, sample page (verify alignment with real report)

- [ ] **Step 1: Extract checkout promises**

Read `src/app/checkout/page.tsx`. Find the Case Decoder feature list. Copy every bullet/promise verbatim. Record the line numbers.

- [ ] **Step 2: Map promises to renderer sections**

Read `src/lib/intelligence-brief/render.ts`. Find the `renderIntelligenceBriefHtml` function (or equivalent for Case Decoder). List every section it assembles, in order. Map each checkout promise to a section:

| # | Checkout Promise (verbatim + line#) | Renderer Section | Present in renderer? |
|---|-------------------------------------|---------------, |---------------------|
| 1 | ... | ... | YES/NO |

- [ ] **Step 3: Verify sections in pre-built report**

Read `test-reports/persona-a-dui.html`. For each promise, search for the corresponding section heading or content. Record findings.

- [ ] **Step 4: Cross-check sample page**

Read `src/app/sample/page.tsx`. Verify the sample shows representative content for each promised section. Flag any mismatches between sample and real report structure.

- [ ] **Step 5: Check prompt builders for section coverage**

Read `src/lib/intelligence-brief/prompts.ts`. Verify each report section has a corresponding prompt builder. Note which prompts generate which sections. Special attention to:
- "15 calibrated questions", is the count enforced in the prompt?
- "Email template + phone script", are these separate prompts or part of "your-plan"?
- "Meeting Ready Sheet", is this a rendered section or embedded in the 7-day plan?
- "Scripts for difficult conversations (4 scenarios)", does the prompt specify 4?

- [ ] **Step 6: Record findings**

Write findings to a scratch file. Format:
```
PHASE 1: Structural Promise Audit
Status: PASS / FAIL
Promises checked: 13
Fulfilled: X/11 (2 operational, not in report)
CRITICAL gaps: [list any missing sections]
WARN: [list any partial/ambiguous matches]
```

---

### Task 2: Fresh Report Generation

**Goal:** Generate a real Case Decoder report via the backup worker for quality assessment.

**Files:**
- Read: `scripts/generate-worker.mjs`, understand invocation
- Read: `scripts/test-ib-pipeline.ts`, test fixtures (persona data)
- Read: `.env.local`, verify ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY exist

- [ ] **Step 1: Verify prerequisites**

Check `.env.local` has the required keys (don't log values):
```bash
node -e "const fs=require('fs');const env=fs.readFileSync('.env.local','utf8');const keys=['ANTHROPIC_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPERATOR_SECRET'];keys.forEach(k=>console.log(k+':'+(env.includes(k)?'SET':'MISSING')))"
```

- [ ] **Step 2: Check for existing test cases in Supabase**

Query Supabase for any cases with status `intake` or `generating` that could be picked up by the worker:
```bash
node -e "
const{createClient}=require('@supabase/supabase-js');
require('dotenv').config({path:'.env.local'});
const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('cases').select('id,status,tier,charge_type,created_at').in('status',['intake','generating']).then(({data,error})=>{
  if(error)console.error(error);
  else console.log(JSON.stringify(data,null,2));
});
"
```

If no test cases exist, create one using the test fixture data from `scripts/test-ib-pipeline.ts` (Danielle persona, DUI, Harris County TX). Create both an intake record and a linked case record with `status='intake'`, `tier='case-decoder'`.

- [ ] **Step 3: Run the worker**

```bash
node scripts/generate-worker.mjs
```

Watch for:
- "Found N cases to process"
- Claude API call starting
- Generation time (60-294s expected)
- Status transition to `review`
- Report HTML saved

If worker finds no cases: the test case wasn't created correctly. Check Step 2.
If worker times out or errors: record the error. Fall back to `test-reports/persona-a-dui.html`.

- [ ] **Step 4: Extract the generated report**

Query Supabase for the freshly generated report HTML:
```bash
node -e "
const{createClient}=require('@supabase/supabase-js');
require('dotenv').config({path:'.env.local'});
const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('cases').select('id,report_html,report_token,status').eq('status','review').order('updated_at',{ascending:false}).limit(1).then(({data,error})=>{
  if(error)console.error(error);
  else{
    const c=data[0];
    console.log('Case:',c.id,'Status:',c.status,'Token:',c.report_token);
    console.log('HTML length:',c.report_html?.length||0,'bytes');
    require('fs').writeFileSync('test-reports/fresh-qa-report.html',c.report_html||'');
    console.log('Saved to test-reports/fresh-qa-report.html');
  }
});
"
```

- [ ] **Step 5: Quick sanity check**

Read the first 200 lines of `test-reports/fresh-qa-report.html`. Verify:
- Contains personalized name (Danielle or test persona)
- Contains DUI/DWI-specific content (Texas Penal Code references)
- Contains section headings matching Phase 1 mapping
- HTML is >5KB (not a stub)

- [ ] **Step 6: Record findings**

```
PHASE 2: Fresh Report Generation
Status: PASS / FAIL / FALLBACK
Generation time: Xs
Report size: X bytes
Model used: claude-opus-4-6
Personalization verified: YES/NO
Charge-specific content: YES/NO
Fallback used: YES/NO (reason)
```

---

### Task 3: Playwright UX Walkthrough (Desktop)

**Goal:** Walk the full customer journey on the live site at desktop viewport.

**Files:**
- Live site: `https://imnotanattorney.com`
- Read: `src/app/page.tsx`, homepage structure (for expected elements)

**Playwright MCP tools used:** `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_take_screenshot`, `browser_resize`

- [ ] **Step 1: Set viewport to desktop**

```
browser_resize: width=1440, height=900
browser_navigate: url="https://imnotanattorney.com"
browser_snapshot (verify page loads)
```

- [ ] **Step 2: Homepage, charge type selector**

From the snapshot:
- Verify 8 charge type buttons are visible
- Click one charge type (e.g., "DUI")
- `browser_snapshot`, verify CTA text updates dynamically
- Click a different charge type, verify CTA changes again
- Deselect, verify CTA returns to Case Decoder default

- [ ] **Step 3: Homepage, Playbook Catalog grid**

Scroll down or snapshot full page:
- Verify 8 playbook cards visible
- Each card has charge name + checkout link
- Links point to `/checkout?tier=<slug>`

- [ ] **Step 4: Homepage, testimonials**

Verify presence of:
- Linda M. (probation violation)
- Maria G. (family buyer)
- No "DUI Defense Playbook" text in hero, final CTA, value anchor, or lead capture

- [ ] **Step 5: Navigate to checkout page**

```
browser_navigate: url="https://imnotanattorney.com/checkout?tier=case-decoder"
browser_snapshot
```

Verify:
- Case Decoder card visible with $197 price
- Feature bullet list matches promises from Phase 1
- "Delivered in 48 hours" visible
- Refund guarantee visible
- CTA button ("Start for $197" or similar)

- [ ] **Step 6: Navigate to /start**

```
browser_navigate: url="https://imnotanattorney.com/start"
browser_snapshot
```

Verify the page loads and provides entry to the intake flow.

- [ ] **Step 7: Navigate to /sample**

```
browser_navigate: url="https://imnotanattorney.com/sample"
browser_snapshot
```

Verify:
- Sample report renders (redacted DWI case)
- "Where Things Stand" table visible
- At least 3 sample questions shown
- Email template preview visible
- CTA to purchase at $197

- [ ] **Step 8: Navigate to /intake**

```
browser_navigate: url="https://imnotanattorney.com/intake?tier=case-decoder"
browser_snapshot
```

Verify:
- 3-step wizard with progress bar
- Step 1 fields render (name, email, charge type, state, county, etc.)
- Charge-specific sub-questions appear when a charge type is selected
- Required fields marked with asterisk

- [ ] **Step 9: Record findings**

```
PHASE 3a: Desktop UX Walkthrough
Status: PASS / FAIL
Pages checked: 5 (homepage, checkout, /start, /sample, /intake)
Issues found: [list]
Screenshots taken: [list filenames]
```

---

### Task 4: Playwright UX Walkthrough (Mobile, 2AM Crisis Test)

**Goal:** Same flow at 375px. A panicked person on their phone at 2AM must be able to complete this.

- [ ] **Step 1: Set mobile viewport**

```
browser_resize: width=375, height=812
browser_navigate: url="https://imnotanattorney.com"
browser_take_screenshot
browser_snapshot
```

- [ ] **Step 2: Homepage mobile check**

From snapshot:
- No horizontal scroll
- Charge type selector visible (may be scrollable row)
- CTA button visible without excessive scrolling
- Touch targets appear 44px+ (check button dimensions in snapshot)
- Key hero message under 27 words

- [ ] **Step 3: Checkout page mobile**

```
browser_navigate: url="https://imnotanattorney.com/checkout?tier=case-decoder"
browser_take_screenshot
browser_snapshot
```

- Price clearly visible
- Feature list readable
- Guarantee text visible
- CTA button full-width and tappable

- [ ] **Step 4: Intake form mobile**

```
browser_navigate: url="https://imnotanattorney.com/intake?tier=case-decoder"
browser_take_screenshot
browser_snapshot
```

Critical checks:
- Form fields don't overlap or extend past viewport
- Input fields are tall enough for thumb tap
- Step progress indicator visible
- "Continue" button reachable without scrolling past last field
- Count fields per step, if Step 1 has >8 visible fields, that's a HIGH friction finding

- [ ] **Step 5: Measure key message lengths**

From homepage and checkout snapshots, extract the primary heading text and CTA text. Count words. Covello's rule: key messages under 27 words for crisis buyers.

| Element | Text | Word Count | Pass (<27)? |
|---------|------|------------|-------------|
| Hero heading | ... | ... | ... |
| Hero subheading | ... | ... | ... |
| Checkout CTA | ... | ... | ... |
| Guarantee text | ... | ... | ... |

- [ ] **Step 6: Record findings**

```
PHASE 3b: Mobile Crisis UX
Status: PASS / FAIL
Critical friction points: [list]
Word count violations: [list]
Touch target issues: [list]
Horizontal scroll: YES/NO
```

---

### Task 5: Full Quality Framework Review

**Goal:** Run the 11-team quality framework against the fresh report.

**Files:**
- Read: `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md`, full framework (660 lines)
- Read: `supabase/functions/evaluate-report/index.ts`, production eval (2 teams only)
- Read: `test-reports/fresh-qa-report.html` (or `test-reports/persona-a-dui.html` if Phase 2 fell back)

- [ ] **Step 1: Check if evaluate-report.mjs exists**

```bash
ls -la scripts/evaluate-report.mjs 2>/dev/null || echo "NOT FOUND"
```

If NOT FOUND: the dev tool doesn't exist as a standalone script. Alternative approach: read the EVALUATION-TEAM.md criteria and manually audit the report against GATE teams (1, 9, 10, 11).

- [ ] **Step 2: Run the dev tool (if it exists)**

```bash
node scripts/evaluate-report.mjs,case-id <CASE_ID_FROM_PHASE_2>
```

Or if the tool takes a file path:
```bash
node scripts/evaluate-report.mjs,file test-reports/fresh-qa-report.html
```

Record: which teams ran, pass/fail per team, total score.

- [ ] **Step 3: Manual GATE team audit (if dev tool unavailable)**

Read `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md`. For each GATE team criterion, manually check the fresh report:

**Team 1 (UPL), spot-check these criteria against the report:**
- U1: No "you should", "we recommend", "we advise" language
- U2: Attorney redirection present ("discuss with your attorney")
- U3: No attorney performance scoring
- U4: Disclaimer present in footer
- U6: Immigration consequences cite Padilla v. Kentucky (if applicable)

**Team 9 (Positioning), spot-check:**
- POS1: Pro-defendant tone throughout
- POS2: Never anti-attorney
- POS5: Information framing, not advice framing

**Team 10 (CRO), spot-check:**
- CRO1: Urgency without manipulation
- CRO4: Clear next steps
- CRO8: Upgrade path mentioned naturally

**Team 11 (Trust), spot-check:**
- T1: Insider knowledge demonstrated
- T3: Vulnerability coherence
- ANON1: Anonymous brand trust maintained

- [ ] **Step 4: Record findings**

```
PHASE 4: Quality Framework Review
Method: dev tool / manual audit
Teams checked: X of 11
GATE results:
  Team 1 (UPL): PASS/FAIL, [details]
  Team 9 (Positioning): PASS/FAIL, [details]
  Team 10 (CRO): PASS/FAIL, [details]
  Team 11 (Trust): PASS/FAIL, [details]
HIGH results:
  Team 2 (Psych): [result]
  Team 3 (Legal): [result]
  Team 4 (Defendant XP): [result]
  Team 7 (System Truth): [result]
Issues: [list with severity]
```

---

### Task 6: Expert Persona Assessment

**Goal:** 6 expert frameworks evaluate the product. Dispatch as parallel agents.

**Files each agent must read:**
- `test-reports/fresh-qa-report.html` (or `test-reports/persona-a-dui.html`)
- `src/app/checkout/page.tsx` (checkout promises, lines containing Case Decoder features)
- `src/app/intake/page.tsx` (intake form, first 200 lines for structure)
- `src/lib/drip-emails.ts` (post-purchase email sequence)

- [ ] **Step 1: Prepare the agent prompt template**

Each agent gets this context block + their persona-specific question:

```
You are reviewing the Case Decoder product ($197) from ImNotAnAttorney.com, a legal empowerment brand for criminal defendants. "We Research. You Ask."

Product: AI-generated case analysis report delivered in 48 hours. Uses Claude Opus with extended thinking to analyze defendant's charges, jurisdiction, attorney situation, and generate:
- 15 calibrated questions for attorney meetings
- Email templates and phone scripts
- 7-day action plan with Meeting Ready Sheet
- Where Things Stand diagnostic

Target buyer: Someone just arrested, Googling at 2AM, highest-intent crisis buyer.
Price: $197 (100% upgrade credit toward higher tiers)
Guarantee: Full refund if report doesn't find a gap attorney hasn't raised

Read these files, then provide your structured assessment:
1. [fresh report HTML path]
2. [checkout page path, focus on Case Decoder feature list]
3. [intake form path, first 200 lines]
4. [drip emails path, post_case_decoder_* sequences]

Return your assessment as:
- VERDICT: PASS / WARN / FAIL
- TOP 3 FINDINGS (specific, with file:line references where applicable)
- ACTIONABLE FIXES (what exactly to change)
- ONE-SENTENCE SUMMARY
```

- [ ] **Step 2: Dispatch 6 agents in parallel**

Launch all 6 as background agents with `run_in_background: true`:

| Agent | Type | Persona Question |
|-------|------|---------------, |
| 1 | sabri-suby | "Does the deliverable match every sales promise on the checkout page? Would this convert cold traffic at $197? Where is the offer weakest?" |
| 2 | alex-hormozi | "Apply the value equation: Dream Outcome x Perceived Likelihood / (Time Delay x Effort). Is $197 a no-brainer against a $500/hr attorney consultation? What increases perceived likelihood?" |
| 3 | peep-laja | "Map the funnel: homepage → checkout → intake → report → upgrade. Where does it leak? What's the highest-friction point? Use ResearchXL framework." |
| 4 | russell-brunson | "Is Case Decoder the right entry point for the value ladder? Does the report naturally create desire for the Intelligence Brief ($997)? Where should the bridge be stronger?" |
| 5 | april-dunford | "Apply the 5-Component Positioning Canvas. Is 'legal research for defendants' clearly differentiated from attorney services? Would a buyer confuse this with hiring a lawyer?" |
| 6 | seth-godin | "Would a defendant tell another defendant about this? What's the purple cow, the one remarkable thing? Or is this forgettable?" |

- [ ] **Step 3: Collect and synthesize verdicts**

When all 6 return, compile:

| Persona | Verdict | Top Finding | Key Fix |
|---------|---------|-------------|---------|
| Suby | ... | ... | ... |
| Hormozi | ... | ... | ... |
| Laja | ... | ... | ... |
| Brunson | ... | ... | ... |
| Dunford | ... | ... | ... |
| Godin | ... | ... | ... |

Count: X PASS, Y WARN, Z FAIL

- [ ] **Step 4: Record findings**

```
PHASE 5: Expert Persona Assessment
Agents dispatched: 6
Verdicts: X PASS, Y WARN, Z FAIL
Consensus findings: [themes that 3+ experts flagged]
Unique insights: [findings only 1 expert caught]
Priority fixes: [ranked by how many experts flagged + severity]
```

---

### Task 7: Edge Case Reports (Conditional)

**Trigger:** Only run if Tasks 1-5 reveal charge-type handling issues. If all clear, skip to Task 8.

**Goal:** Verify reports adapt correctly for sensitive/unusual charge types.

- [ ] **Step 1: Evaluate trigger condition**

Review findings from Tasks 1-5. Run this task if ANY of:
- Phase 1 found sections that are DUI-specific in the renderer (not charge-agnostic)
- Phase 2 report contains hardcoded DUI references that shouldn't apply to other charges
- Phase 4 flagged charge-specificity issues
- Expert personas flagged concerns about non-DUI charge types

If none of the above: skip to Task 8. Record "Phase 6: SKIPPED, no trigger conditions met."

- [ ] **Step 2: Minimal intake test (worst-case report)**

Create a case with ONLY required fields:
- firstName: "Test"
- email: "test-minimal@example.com"
- chargeType: "dui-first-offense"
- jurisdictionLevel: "state"
- state: "Texas"
- county: "Harris"
- caseNumber: "2026-CR-00001"
- timeSinceArrest: "2026-03"
- hasAttorney: "yes"

No situation narrative, no optional fields. Run `node scripts/generate-worker.mjs`. Read the output.

Key question: Does a minimal-intake report still contain 15 questions, email templates, and a 7-day plan? Does it still justify $197?

- [ ] **Step 3: Sex offense charge (if time permits)**

Create case with chargeType "sex-offense-contact". Verify:
- No victim-blaming language
- SANE kit handling appropriate
- Registry implications mentioned (information, not advice)
- Tone is sensitive, not clinical

- [ ] **Step 4: Federal criminal charge (if time permits)**

Create case with jurisdictionLevel "federal", chargeType "federal-criminal". Verify:
- No state court references
- Federal sentencing guidelines referenced (not state)
- No county-specific content (federal is district-based)

- [ ] **Step 5: Record findings**

```
PHASE 6: Edge Cases
Status: PASS / FAIL / SKIPPED
Minimal intake: [result, does it still justify $197?]
Sex offense: [result]
Federal: [result]
Charge-specific adaptation: YES/NO
```

---

### Task 8: Competitive Benchmark

**Goal:** Validate $197 pricing against the market.

- [ ] **Step 1: Research attorney consultation rates**

WebSearch for: "average criminal defense attorney consultation fee 2025 2026"
Record: initial consultation range, hourly rate range, retainer range.

- [ ] **Step 2: Research legal second-opinion services**

WebSearch for: "legal second opinion service criminal defense online"
Check: Avvo, JustAnswer, LegalShield, RocketLawyer, similar services.
Record: what they offer, what they charge, how they deliver.

- [ ] **Step 3: Research AI legal research tools**

WebSearch for: "AI legal research tool defendant criminal defense 2025 2026"
Record: any comparable products, their pricing, their scope.

- [ ] **Step 4: Build comparison table**

| Alternative | Price | What You Get | Delivery Time | Personalization |
|-------------|-------|-------------|---------------|---------------, |
| Attorney consult | $X/hr | ... | Immediate | High |
| JustAnswer | $X | ... | ... | ... |
| Case Decoder | $197 | 15 questions + templates + 7-day plan | 48h | High (Opus) |
| ... | ... | ... | ... | ... |

- [ ] **Step 5: Record findings**

```
PHASE 7: Competitive Benchmark
Nearest competitor: [name, price, offering]
Value gap: Xx (Case Decoder delivers X for $197 vs competitor at $Y)
Pricing verdict: UNDERPRICED / CORRECTLY PRICED / OVERPRICED
Recommendation: [any pricing adjustment or positioning change]
```

---

### Task 9: Compile Findings & Write Handoff

**Goal:** Single findings document with executive summary.

**Files:**
- Create: `docs/handoff/2026-03-27-case-decoder-product-qa-findings.md`

- [ ] **Step 1: Compile all phase results**

Gather findings from Tasks 1-8 scratch notes. Organize by severity.

- [ ] **Step 2: Write the findings doc**

Structure:
```markdown
# Case Decoder Product QA, Findings
Date: 2026-03-27

## Executive Summary
- Phases completed: X/7
- Overall verdict: SHIP / SHIP WITH FIXES / HOLD
- Critical issues: X
- High issues: X
- Medium issues: X

## Phase Results
[PASS/FAIL per phase with 1-line summary]

## Critical Findings
[Any CRITICAL issues with file:line references and fix recommendations]

## High Findings
[HIGH issues]

## Medium/Low Findings
[Grouped]

## Expert Persona Verdicts
[Summary table from Task 6]

## Competitive Position
[Summary from Task 8]

## Recommended Next Steps
[Prioritized action items]
```

- [ ] **Step 3: Apply any CRITICAL fixes inline**

If CRITICAL findings are QUICK_FIX scope (1-2 files), fix them directly and commit. Otherwise, note them for a follow-up session.

- [ ] **Step 4: Commit findings doc**

```bash
git add docs/handoff/2026-03-27-case-decoder-product-qa-findings.md
git commit -m "docs: Case Decoder product QA findings, 7-phase deep assessment"
```

---

## Dependency Graph

```
Task 1 (Promise Audit) ─────────────────────────────────┐
Task 2 (Report Gen) ──┬── Task 5 (Quality Review) ──────┤
                       ├── Task 6 (Expert Personas) ─────┤
                       └── Task 7 (Edge Cases, conditional)─┤
Task 3 (Desktop UX) ────────────────────────────────────┤
Task 4 (Mobile UX) ─────────────────────────────────────┤
Task 8 (Competitive Benchmark) ─────────────────────────┤
                                                         └── Task 9 (Compile Findings)
```

**Parallelizable:** Tasks 1, 2, 3, 4, 8 can all run in parallel (no dependencies).
**Sequential:** Task 5 needs Task 2 output. Task 6 needs Task 2 output. Task 7 needs Tasks 1-5 findings.
**Final:** Task 9 needs all others complete.

## Estimated Cost

- Task 2 (report generation): ~$0.50 (1 Opus call)
- Task 5 (quality review): ~$5-8 if dev tool exists, $0 if manual
- Task 6 (expert personas): ~$0.50 (6 Sonnet agent calls)
- Task 7 (edge cases): ~$1.50 if triggered (3 Opus calls)
- Task 8 (web search): $0
- **Total: ~$7-11**
