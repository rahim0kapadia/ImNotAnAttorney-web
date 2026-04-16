# Case Decoder Product QA, Findings

Date: 2026-03-27
Spec: `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-27-case-decoder-product-qa-design.md`
Plan: `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-03-27-case-decoder-product-qa.md`

## Executive Summary

| Phase | Status | Key Finding |
|-------|------, |-------------|
| 1. Structural Promise Audit | **PARTIAL FAIL** | "8-step" on checkout, report delivers 5 (HARD STOP) |
| 2. Fresh Report Generation | FALLBACK | Anthropic API credits depleted; used pre-built DUI report (58.9KB) |
| 3. Desktop UX Walkthrough | PASS | All pages render, content complete, charge selector works |
| 4. Mobile Crisis UX | PASS with 1 HIGH | Intake Step 1 shows ~12 fields + 7 checkboxes, too many for 2AM crisis buyer |
| 5. Quality Framework Review | PASS | Zero GATE failures. 3 UPL warnings, 1 D25 fail (family buyer). Shippable. |
| 6. Expert Persona Assessment | SHIP WITH FIXES | 3 PASS, 3 WARN. Consensus: drip sequence is the #1 fix priority |
| 7. Edge Cases | SKIPPED | No trigger conditions met |
| 8. Competitive Benchmark | PASS | $197 is UNDERPRICED. Nearest comparable: attorney second opinion at $150-$1,500 |

**Overall verdict: SHIP WITH FIXES**

The Case Decoder report itself is genuinely excellent, personalization depth, UPL compliance, legal citation density, psychological architecture, and positioning are all at a high level. The product justifies $197 and is arguably underpriced.

The fixes are concentrated in 3 areas:
1. **Checkout copy** (1 CRITICAL mismatch)
2. **Drip email sequence** (2 HIGH inconsistencies)
3. **Report engine** (5 MEDIUM improvements)

---

## CRITICAL Findings (must fix before significant volume)

### C1. "8-step communication playbook", checkout promises 8, report delivers 5

**Severity:** CRITICAL, refund trigger, trust destroyer
**Where it appears:**
- `src/app/checkout/page.tsx` line 390: "Your Advocacy Steps, 8-step communication playbook"
- `src/app/page.tsx` (homepage pricing section, ref=e338): same text
- `src/app/sample/page.tsx` line 122: "Your full report includes a phone script, follow-up template, and 8-step communication playbook"

**What the report delivers:** Exactly 5 advocacy steps. The system prompt in `supabase/functions/generate-report/index.ts` line 943 says: "EXACTLY 5 steps, NO MORE" with "HARD STOP, Steps 6, 7, 8 DO NOT EXIST."

**Fix:** Change "8-step" to "5-step" in all 3 files. The prompt HARD STOP is deliberate, the product decision was to simplify from 8 to 5. The copy was never updated.

**Files to edit:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\page.tsx`, line 390
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\page.tsx`, homepage pricing section
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample\page.tsx`, line 122

---

## HIGH Findings

### H1. Drip sequence Days 4-7 push X-Ray ($2,497) instead of Intelligence Brief ($997)

**Severity:** HIGH, funnel incoherence, skips value ladder rung
**Flagged by:** Laja, Brunson, Suby (3/6 experts)
**Evidence:** The report's "What Comes Next" section and the checkout `nudge` field both point to Intelligence Brief ($997). But `post_case_decoder_discovery_question` (Day 4) and `post_case_decoder_upsell` (Day 7) in `src/lib/drip-emails.ts` both push X-Ray ($2,497).
**Impact:** A $197 buyer is not psychologically ready for a $2,300 jump. The IB at $800 after credit is the natural next rung.
**Fix:** Align Day 4-7 emails to pitch Intelligence Brief. Reserve X-Ray for Day 30+ (when discovery has arrived) or for IB buyers.
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts`, keys `post_case_decoder_discovery_question`, `post_case_decoder_upsell`

### H2. "Section 10" reference in Day 3 email, report has no numbered sections

**Severity:** HIGH, immediate user confusion
**Flagged by:** Laja (unique insight)
**Evidence:** `post_case_decoder_meeting_prep` (Day 3) says "Print the Meeting Ready Sheet, it's in Section 10 of your report." Report uses heading titles, not numbered sections. Meeting Ready Sheet is in "Your Next 7 Days."
**Fix:** Change "Section 10 of your report" to "the 'Your Next 7 Days' section of your report."
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts`, key `post_case_decoder_meeting_prep`

### H3. Intake Step 1: ~12 fields + 7 checkboxes visible at once on mobile

**Severity:** HIGH, 2AM crisis friction
**Evidence:** Playwright mobile snapshot (375px) shows Step 1 of 3 with all fields visible simultaneously. Only 6 are required (firstName, email, jurisdiction, state, caseNumber, arrestDate). The other 6+ fields and 7 checkboxes are optional but create a wall of fields.
**Impact:** Covello's stress rule: 80% reduced processing under crisis. A panicked defendant at 2AM sees a wall of form fields and may bounce.
**Fix:** Consider progressive disclosure, show required fields first, reveal optional fields after required are filled. Or split Step 1 into two sub-steps. Note: this is a UX change that should be brainstormed separately.
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\page.tsx`

### H4. "do not show this report to your attorney", directive language

**Severity:** HIGH (UPL warning)
**Evidence:** Report lines 52 and 113 use imperative "do not" directed at the defendant. While justified (prevent anchoring), the instruction format edges toward U1 territory.
**Fix:** Reframe as informational: "Defendants who review the analysis privately first typically get more candid attorney responses, because..."
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\supabase\functions\generate-report\index.ts`, system prompt

### H5. Anthropic API credits depleted

**Severity:** HIGH (operational)
**Evidence:** `ANTHROPIC_API_KEY` in `.env.local` (`sk-ant-api03-CvMg...`) returned HTTP 400 "credit balance too low" during fresh report generation attempt.
**Impact:** No new Case Decoder reports can be generated until credits are added.
**Fix:** Top up at console.anthropic.com > Billing. This is the production report generation key.

---

## MEDIUM Findings

### M1. "Exactly What to Say" on sample page vs "Your Attorney Meeting Toolkit" in report

**Evidence:** `/sample` page heading (ref=e106): "Exactly What to Say". Report heading: "Your Attorney Meeting Toolkit". System prompt line 466-467 explicitly says the heading is NOT "Exactly What to Say."
**Fix:** Update sample page heading to match report.
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample\page.tsx`

### M2. Product naming: "Case Intelligence Brief" vs "Intelligence Brief"

**Flagged by:** Dunford, Laja
**Evidence:** Report "What Comes Next" uses "Case Intelligence Brief." Checkout and other pages use "Intelligence Brief."
**Fix:** Standardize on "Intelligence Brief" everywhere.
**File:** System prompt in `supabase/functions/generate-report/index.ts`

### M3. Credit anchor buried in narrative paragraph

**Flagged by:** Hormozi, Laja
**Evidence:** "$197 already credited, Intelligence Brief is $800, not $997" appears as inline text in "What Comes Next." Should be a visual callout block.
**Fix:** Wrap credit mention in a styled callout in the system prompt or render template.
**File:** System prompt in `supabase/functions/generate-report/index.ts`

### M4. No family buyer acknowledgment (D25)

**Flagged by:** Quality Framework (Team 4 FAIL on D25)
**Evidence:** Entire report addresses "Danielle" directly. No sentence for the spouse/parent who may be reading on behalf of the defendant.
**Fix:** Add one sentence in the opening letter: "If you're reading this for someone you love rather than yourself, everything here works the same way."
**File:** System prompt in `supabase/functions/generate-report/index.ts`

### M5. No state-data WARNING box before penalty tables (U15)

**Evidence:** Texas penalty range table and ALR deadline info presented without verification warning.
**Fix:** Add brief WARNING callout: "State-specific penalties and deadlines change. Verify current figures with your attorney."
**File:** System prompt in `supabase/functions/generate-report/index.ts`

### M6. "Scripts for 4 scenarios" not hard-enforced

**Evidence:** Checkout says "4 common scenarios." Prompt says "3-4 scenarios." May deliver 3.
**Fix:** Either change checkout to "3-4" or change prompt to "exactly 4."
**Files:** `src/app/checkout/page.tsx` or `supabase/functions/generate-report/index.ts`

### M7. Email template missing Q6 (defendant's #1 concern)

**Flagged by:** Quality Framework (D3 warning)
**Evidence:** Danielle's nurse license is her stated #1 concern. Q6 addresses it. But the pre-written email template only includes Q1-Q5.
**Fix:** Add Q6 to email template or add note after template: "Q6 (nursing license) is your highest-stakes question, consider adding it."
**File:** System prompt in `supabase/functions/generate-report/index.ts`

### M8. Charge selector CTA doesn't update dynamically

**Evidence:** Playwright desktop test: clicking DUI in charge selector doesn't change CTA text or href. CTA stays "Start Your Case Research, $197 →" → /start. Previous QA (2026-03-27-homepage-redesign-qa.md) reported dynamic CTA as passing.
**Possible cause:** HomepageHero component was replaced or the onSelect callback is no longer wired.
**Fix:** Investigate whether this is a regression or deliberate simplification.
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\HomepageHero.tsx`

---

## LOW Findings

### L1. Tribal identity line in conclusion instead of intro
Flagged by: Godin. "Most prepared defendant" should appear in opening letter, not closing.

### L2. No in-report referral/sharing mechanism
Flagged by: Brunson, Godin. Referral email at Day 14 is too late. Sharing impulse peaks at first read.

### L3. $197 value justification implicit in report
Flagged by: Suby. Checkout does this well, but report itself never anchors $197 against $500/hr attorney consultation.

### L4. Question block format fatigue (D12/D13)
15 questions with identical 4-block structure. Vary depth for mid-tier questions.

### L5. No triage marker at top of 15-question section
Add: "If short on time, start with Q1, Q2, and Q6."

### L6. Report has 20 sections but checkout lists 8
Massive underpromise/overdeliver. Consider marketing the additional sections.

---

## Expert Persona Verdicts

| Persona | Verdict | Top Finding |
|---------|---------|-------------|
| **Sabri Suby** | PASS | Intake mirroring is Suby-caliber. $197 value justification implicit, not stated. |
| **Alex Hormozi** | PASS | Value equation nearly maxed. Credit anchor needs visual upgrade. |
| **Peep Laja** | WARN | "Section 10" navigation error. X-Ray vs IB drip split-brain. |
| **Russell Brunson** | WARN | Drip skips IB, pushes X-Ray. Value ladder sequencing broken. |
| **April Dunford** | PASS | Positioning clean. "Not a grade on your attorney" is the money line. |
| **Seth Godin** | WARN | Purple Cow material exists but unsurfaced. No sharing mechanism at peak moment. |

**Consensus (3+ experts):**
1. Fix drip sequence X-Ray → IB (Laja, Brunson, Suby)
2. Product naming inconsistency (Dunford, Laja)
3. Credit anchor needs visual upgrade (Hormozi, Laja)
4. Referral mechanism too late (Brunson, Godin, Suby)

---

## Competitive Position

| Alternative | Price | Delivery | Personalization |
|-------------|-------|----------|---------------, |
| Attorney initial consult | Free-$150 | Immediate | Very high |
| Attorney hourly | $150-500/hr | Ongoing | Very high |
| Attorney second opinion | $150-1,500 | Days-weeks | High |
| JustAnswer | $45/mo | Immediate | Low |
| Avvo | $39.95/call | Immediate | Low-Medium |
| LegalShield | $30-60/mo | Ongoing | Medium |
| **Case Decoder** | **$197** | **48 hours** | **Very high** |

**Verdict: UNDERPRICED.** No direct competitor at this price point with comparable speed + personalization + operational format. Recommended range: $297-$397.

---

## Quality Framework Scores

| Team | Weight | Verdict | Notes |
|------|------, |---------|-------|
| 1 UPL | GATE | **PASS** | 3 warnings (directive tone, state-data boxes). Zero FAIL. |
| 2 Psych | HIGH | **PASS** | Safety-first sequencing correct. Minor density warning. |
| 4 Defendant XP | HIGH | **PASS** | 1 FAIL (D25 family buyer). 2 warnings. Above threshold. |
| 7 System Truth | HIGH | **PASS** | System-attributing attorney framing. Correct execution. |
| 9 Positioning | MEDIUM | **PASS** | Pro-defendant, never anti-attorney. Clean throughout. |
| 10 CRO | MEDIUM | **PASS** | 1 warning (CTA button framing). |
| 11 Trust | MEDIUM | **PASS** | Vulnerability coherence + personalization = strongest area. |

---

## Recommended Fix Priority

| # | Fix | Severity | Effort | Files |
|---|---, |----------|------, |-------|
| 1 | "8-step" → "5-step" on checkout, homepage, sample | CRITICAL | 5 min | 3 files |
| 2 | Day 3 email "Section 10" → "Your Next 7 Days" | HIGH | 2 min | drip-emails.ts |
| 3 | Days 4-7 emails: X-Ray → Intelligence Brief | HIGH | 15 min | drip-emails.ts |
| 4 | Top up Anthropic API credits | HIGH | 5 min | console.anthropic.com |
| 5 | "do not show" → informational framing | HIGH | 10 min | generate-report system prompt |
| 6 | Sample page "Exactly What to Say" → match report | MEDIUM | 2 min | sample/page.tsx |
| 7 | Standardize "Intelligence Brief" naming | MEDIUM | 5 min | generate-report system prompt |
| 8 | Credit anchor → visual callout block | MEDIUM | 10 min | generate-report system prompt |
| 9 | Family buyer sentence in opening letter | MEDIUM | 5 min | generate-report system prompt |
| 10 | State-data WARNING box | MEDIUM | 5 min | generate-report system prompt |

Fixes 1-3 are the highest priority, they affect what buyers see RIGHT NOW on the live site and in post-purchase emails.

---

## What Was NOT Tested

- Fresh report generation (API credits depleted, used pre-built fallback)
- Edge case charge types (no trigger conditions met)
- Intelligence Brief / X-Ray / War Room reports (test mode tiers)
- KDP book alignment (cross-project boundary)
- Load testing (premature)
- Full 11-team automated eval (dev tool availability unclear)

---

## Copy-Paste Prompt for Fix Session

```
Execute CRITICAL + HIGH fixes from the Case Decoder Product QA findings at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-27-case-decoder-product-qa-findings.md

Priority order:
1. Change "8-step" to "5-step" in checkout/page.tsx, page.tsx (homepage), and sample/page.tsx
2. Fix "Section 10" → "Your Next 7 Days" in drip-emails.ts key post_case_decoder_meeting_prep
3. Align Days 4-7 drip emails to pitch Intelligence Brief ($997) not X-Ray ($2,497) in drip-emails.ts
4. Reframe "do not show this report" as informational in generate-report/index.ts system prompt
5. Fix sample page "Exactly What to Say" heading to "Your Attorney Meeting Toolkit"
6. Standardize "Intelligence Brief" naming (not "Case Intelligence Brief") in system prompt

Also: Anthropic API credits are depleted. Key sk-ant-api03-CvMg... needs top-up at console.anthropic.com.
```
