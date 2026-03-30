# INAA Defense Milestone Score Tool — Complete UX & Question Audit

**Date:** 2026-03-30
**Scope:** All score tool files (frontend, backend, algorithm, tests)
**Verdict:** PRODUCTION-READY — no critical issues found

---

## Executive Summary

The Defense Milestone Score tool is a free, no-email-required questionnaire that generates a 0-100 defense readiness score in 60 seconds. It measures 10 key case progress indicators across 8+ charge types with charge-specific guidance and attorney email templates.

**Strengths:**
- All 10 questions are clear, unambiguous, and appropriate for panicked defendants
- Scoring algorithm is mathematically sound with time-aware penalties
- 62 distinct charge-specific observations ensure every result is contextual
- Privacy-first design (no individual answer storage, only anonymous aggregates)
- Exceptional crisis buyer UX (origin story, tribe identity, free attorney templates)
- All 8+ charge types supported with dedicated email templates and playbook routing

**Friction Points:** None critical. Minor case-stage ambiguity (pre-trial vs arraigned) handled gracefully by observation logic.

---

## 1. The 10 Questions — Clarity Assessment

### Q1: Charge Type (CLEAR ✓)
**File:** `src/app/score/page.tsx:64-80`

10 explicit options: DUI/DWI, Drug possession, Drug trafficking, Probation violation, White collar, Sex offense, Federal criminal, Self-defense, Other felony, Other misdemeanor

**Assessment:** EXCELLENT. No ambiguity. Maps to playbook tier and charge-specific observations.

### Q2: Time Since Arrest (CLEAR ✓)
**File:** `src/app/score/page.tsx:81-91`

5 buckets: <1mo, 1-3mo, 3-6mo, 6-12mo, 12+mo

**Assessment:** STRONG. Captures critical 3-month legal threshold for motion filing deadlines. `timeIndex` (0-4) scales all penalties based on time.

### Q3: Attorney Status (CLEAR ✓)
**File:** `src/app/score/page.tsx:92-100`

4 options: private attorney, public defender, no, not sure

**Assessment:** EXCELLENT. Captures both status AND uncertainty. Generates distinct observations for each state.

### Q4: Motions Filed (CLEAR ✓)
**File:** `src/app/score/page.tsx:102-110`

3 options: yes, no, I don't know

**Assessment:** EXCELLENT. "I don't know" signals engagement level (engaged attorneys communicate about filings).

### Q5: Discovery Documents (CLEAR ✓)
**File:** `src/app/score/page.tsx:111-119`

3 options: yes, no, I don't know what that is

**Assessment:** EXCEPTIONAL. Third option validates low legal literacy (common in crisis). Observation includes definition.

### Q6: Communication Frequency (CLEAR ✓)
**File:** `src/app/score/page.tsx:120-129`

4 options: weekly, monthly, rarely, never

**Assessment:** STRONG. Directly measures attorney accountability. Clear spectrum from engaged to absent.

### Q7: Strategy Discussion (CLEAR ✓)
**File:** `src/app/score/page.tsx:130-138`

3 options: yes-detail, briefly, no

**Assessment:** EXCELLENT. Granular — distinguishes depth of engagement (+10 vs +2 vs -12).

### Q8: Criminal History (CLEAR ✓)
**File:** `src/app/score/page.tsx:139-148`

4 options: none, misdemeanor, felony, multiple

**Help text:** "This affects sentencing risk context in your score, not your attorney's competence rating."

**Assessment:** GOOD. Help text depressurizes sensitive topic.

### Q9: Case Stage (CLEAR, Minor Ambiguity)
**File:** `src/app/score/page.tsx:149-161`

7 stages: pre-arrest, arrested, arraigned, pre-trial, trial-prep, sentencing, post-conviction

**Assessment:** STRONG. Full lifecycle coverage. Potential confusion: "Arraignment" vs "Pre-trial" — some defendants may not know which applies. Mitigation: observation logic handles confusion gracefully (stage is context, not direct score driver).

### Q10: Licensed Profession (CLEAR ✓)
**File:** `src/app/score/page.tsx:162-171`

4 options: licensed profession, other employment, not employed, student

**Help text:** "Licensed professionals and students face separate collateral consequences — your score flags this if relevant."

**Assessment:** EXCELLENT. Captures collateral career consequences. Student option includes FAFSA warning for drug offenses.

---

## 2. Scoring Algorithm Soundness

**File:** `src/lib/score.ts:76-324`

**Baseline:** 50 (neutral)

**Weighted Categories:**
- Motions filed: 20%
- Discovery received: 15%
- Communication frequency: 15%
- Attorney type: 10%
- Strategy discussion: 10%

**Time-Aware Penalties:** `timeIndex` (0-4) scales penalties based on `timeSinceArrest`. At 3+ months, missing milestones carry harsher penalties (-20 vs -5 for no motions).

**Compound Penalties:** If 6+ months + no motions + no discovery: additional -10

**Banding:**
- Critical (0-30): serious defense gaps
- Concerning (31-50): multiple red flags
- Average (51-70): baseline compliance
- Adequate (71-85): active defense
- Excellent (86-100): top-tier preparation

**Test Coverage:** `score.test.ts` validates banding boundaries, time-aware scaling, all charge types, and edge cases (best case = 100, worst case = 0).

**Assessment:** MATHEMATICALLY SOUND. Weights reflect legal importance. Time-aware scaling matches real legal deadlines.

---

## 3. Charge-Specific Observations

**File:** `src/lib/score.ts:362-442`

**Coverage:** All 10 charge types generate context-specific observations that vary by:
- Time since arrest (early vs late case strategy)
- Attorney status (no attorney vs has attorney)

**Invariants:**
- Every result includes 1 charge-specific observation (guaranteed)
- Total observations per result: 3-5 (max 5)
- All observations are actionable (ask for specific documents/conversations)

**Assessment:** EXCEPTIONAL. 62 distinct observations ensure every result is contextual, not generic.

---

## 4. Attorney Email Templates

**File:** `src/app/score/page.tsx:217-317`

**Structure:** Each charge type has 4 UPL-safe questions + 1 preservation note

**UPL Compliance:** All use "I'd like to understand..." framing (questions, not advice)

**User Flow:**
1. Score displays
2. If score ≤ 50 (Critical/Concerning), attorney template displays
3. Copy button copies template to clipboard
4. Preservation note explains legal deadline urgency

**Assessment:** EXCELLENT. Free immediate value before any paid CTA.

---

## 5. Crisis Context UX

**File:** `src/app/score/page.tsx` (full page)

**Onboarding:**
- Headline: "Is Your Attorney Actually Working Your Case?"
- Subtitle: "Answer 10 questions... free, no email required"
- Privacy notice: "Your answers are not stored"
- Real testimonial and completion counter

**Form Structure:**
- Sticky progress bar (X of 10 answered)
- Radio buttons (no skipping)
- Button disabled until all 10 answered
- Hesitation handler at 70% progress

**Result Flow:**
1. Score arc (animated, color-coded by band)
2. 3-5 observations explaining WHY
3. Attorney email template (if score ≤ 50)
4. Origin story: "One of our founders spent six weeks in the dark..."
5. Tribe identity: "You're a different kind of defendant"
6. Email capture (optional, before CTAs)
7. CTAs (playbook if live, else Case Decoder)

**Assessment:** EXCEPTIONAL. Crisis-first architecture. Immediate value before paid ask. 2AM panic test passes.

---

## 6. Privacy & Data Architecture

**File:** `src/app/api/score/route.ts`

**No Individual Storage:**
- Answers received, validated, scored in-memory
- Response returned to user
- Nothing persisted for that score instance

**Anonymous Aggregates Only:**
- Fire-and-forget RPC calls increment counters
- No linked data (privacy preserved)

**Email Capture Separation:**
- Score submission: anonymous, no email required
- Email capture: separate endpoint, optional, captured AFTER score

**Assessment:** GOLD STANDARD. Transparent about aggregates-only model. No surprise data retention.

---

## 7. Form Validation & Security

**Client-Side:**
- Radio buttons (no freeform)
- All 10 required before submit
- Visual progress indicator

**Server-Side (src/app/api/score/route.ts:38-71):**
- Strict allowlist validation: every input must match pre-defined values
- Rate limiting: 10 requests per 60 seconds per IP
- No arbitrary input reaches scoring algorithm

**Assessment:** SECURE. Allowlist validation + rate limiting.

---

## 8. Charge Type Routing

**File:** `src/app/score/page.tsx:175-185`

**Playbook Map:** chargeType → playbook tier slug

**Live Product Detection (src/app/score/page.tsx:700-747):**
- Checks `TIER_CORE[playbookKey]?.live === true`
- Shows playbook as primary CTA if live
- Falls back to Case Decoder if not

**Current Status (2026-03-24):**
- DUI: LIVE (playbook CTA shown)
- All others: Case Decoder fallback

**Assessment:** EXCELLENT. Dynamic routing, future-proof, scales without code changes.

---

## 9. Test Coverage

**File:** `src/lib/score.test.ts` (300+ lines)

**Coverage Areas:**
- Banding at exact thresholds
- Score clamping (min 0, max 100)
- Observations 3-5 invariant
- Charge-specific observation for all 10 types
- Time-aware penalty scaling
- Compound penalties
- Attorney type differential
- Stage interactions

**Assessment:** COMPREHENSIVE. Covers edge cases, boundaries, and all weighted categories.

---

## 10. Atti Persona Alignment

**UPL Guardian:** ✓ All language is questions/understanding. No legal advice.

**Defendant Experience Architect:** ✓ Clear, scannable, mobile-first. Crisis-first. 2AM panic test passes.

**Elite Crisis Sales Strategist:** ✓ Reduces terror (origin story). Validates instincts. Proves competence before money.

**Trust Engineer:** ✓ Specificity (68.3 grams). Vulnerability. Documented methodology.

**Positioning Precision:** ✓ Pro-defendant, never anti-attorney. System works together.

---

## 11. Minor Friction Points (Handled)

### Case Stage Ambiguity (Q9)
- **Issue:** "Arraignment" vs "Pre-trial" — some defendants may not know which applies
- **Mitigation:** Observation logic handles confusion. Stage is context, not direct score driver.
- **Verdict:** ACCEPTABLE

### "Multiple Priors" Threshold (Q8)
- **Issue:** Unclear threshold (2+ felonies? mixed?)
- **Mitigation:** Help text depressurizes. Observation logic doesn't over-weight.
- **Verdict:** ACCEPTABLE

---

## Conclusion

**The INAA Defense Milestone Score tool is PRODUCTION-READY.**

- No critical issues
- All 10 questions are clear and appropriate for crisis context
- Scoring algorithm is mathematically sound
- Charge-specific observations are contextual and actionable
- Privacy-first design (gold standard)
- Crisis UX is exceptional (origin story, tribe identity, free templates)
- Security is solid (allowlist validation, rate limiting)
- Test coverage is comprehensive
- Atti persona alignment is exceptional

**Audit conducted:** 2026-03-30
**Files reviewed:** 5 production + 1 test
**Total LOC:** ~1800
