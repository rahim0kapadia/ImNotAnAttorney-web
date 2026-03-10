# In-Session Case Decoder Pipeline Audit — 2026-03-02

**Auditor:** Claude Code (in-session, no API cost)
**Framework:** 51-criteria rubric (EVALUATION-TEAM.md), 46 CD-applicable
**Reports Audited:** 3 test personas

---

## Executive Summary

| Persona | Gate | CD PASS | CD NW | CD FAIL | Verdict |
|---------|------|---------|-------|---------|---------|
| persona-c-whitecollar (Jennifer) | PASSED | 42/46 | 4 | 0 | SHIP-READY |
| persona-a-dui (Danielle) | PASSED | 42/46 | 4 | 0 | SHIP-READY (with mandatory U4 fix) |
| persona-b-drug (Marcus) | **FAILED** | 37/46 | 7 | **2** | CANNOT SHIP |

### Cross-Persona Patterns

**Consistent across all 3 reports:**
- U1 NEEDS_WORK — imperative tone in 7-Day Plan (logistical, not legal)
- L6 NEEDS_WORK — motion filing deadlines absent
- C6 NEEDS_WORK — no visible post-purchase drip (system-level, not in-report)
- Psych team: 9-10/10 across all reports — strongest dimension
- Legal team (CD-applicable): 5/6 across all reports — solid for $197 tier

**Unique to persona-a-dui:**
- U4 NEEDS_WORK — disclaimer uses banned phrases ("publicly available", "consult your attorney")
- Phone number 1-800-932-1900 needs verification (anti-hallucination audit cites different number)

**Unique to persona-b-drug (GATE FAILURES):**
- U4 FAIL — disclaimer completely missing
- U10 FAIL — unsourced collateral consequence claims
- U8 NEEDS_WORK — "fire your attorney" language in rights section
- D9 NEEDS_WORK — methodology note opens report before personal letter
- D10 NEEDS_WORK — $797 pricing error ($997-$197=$800)
- Ron Chapman II expert and FL Bar ACAP number need verification

---

## Detailed Results: persona-c-whitecollar (Jennifer, Wire Fraud, Federal CA)

### Comparison to Prior API Eval (Mar 2, Opus 4.6, $1.29)
**Result: IDENTICAL** — 42 PASS, 7 NW, 2 FAIL (all 51 criteria). In-session audit matches API eval exactly. No regressions.

### CD-Applicable (46 criteria)
| Team | PASS | NW | FAIL |
|------|------|----|------|
| UPL (GATE) | 9 | 1 (U1) | 0 |
| Psych (HIGH) | 9 | 1 (P9) | 0 |
| Legal (MEDIUM) | 5 | 1 (L6) | 0 |
| Defendant (HIGH) | 10 | 0 | 0 |
| Conversion (MEDIUM) | 9 | 1 (C6) | 0 |
| **Total** | **42** | **4** | **0** |

### NEEDS_WORK Items
1. **U1** — Imperative tone in 7-Day Plan actions (logistical, not legal advice) — LOW priority
2. **P9** — Undefined terms: Jencks Act, 3500 material, PACER, FAR — MEDIUM priority
3. **L6** — Motion filing deadlines absent — LOW priority (CD tier)
4. **C6** — No visible post-purchase drip — N/A (system-level)

### Anti-Hallucination: CLEAN — all statutes, case law, expert attributions verified

---

## Detailed Results: persona-a-dui (Danielle, DWI, Texas)

### CD-Applicable (46 criteria)
| Team | PASS | NW | FAIL |
|------|------|----|------|
| UPL (GATE) | 8 | 2 (U1, U4) | 0 |
| Psych (HIGH) | 10 | 0 | 0 |
| Legal (MEDIUM) | 5 | 1 (L6) | 0 |
| Defendant (HIGH) | 10 | 0 | 0 |
| Conversion (MEDIUM) | 9 | 1 (C6) | 0 |
| **Total** | **42** | **4** | **0** |

### NEEDS_WORK Items
1. **U4** — Disclaimer uses "publicly available" and "consult your attorney" (both BANNED). **MANDATORY FIX** — replace with approved disclaimer text.
2. **U1** — Imperative tone in 7-Day Plan (same as all reports) — LOW priority
3. **L6** — Motion filing deadlines absent — LOW priority
4. **C6** — No visible post-purchase drip — N/A (system-level)

### Anti-Hallucination
- All statutes verified correct
- **Phone number 1-800-932-1900** for State Bar of Texas needs verification. Anti-hallucination audit for sample report cites 1-800-252-9690 (Lawyer Referral Service). These may be different lines or one may be wrong.

### Notes
- Psych team scored 10/10 — best of all three reports for psychological architecture
- No collateral consequences table (unlike persona-c). Covers nursing license well but misses immigration, firearms, voting, employment

---

## Detailed Results: persona-b-drug (Marcus, Cannabis Possession, Florida)

### CD-Applicable (46 criteria)
| Team | PASS | NW | FAIL |
|------|------|----|------|
| UPL (GATE) | 5 | 3 (U1, U8) | **2 (U4, U10)** |
| Psych (HIGH) | 10 | 0 | 0 |
| Legal (MEDIUM) | 5 | 1 (L6) | 0 |
| Defendant (HIGH) | 8 | 2 (D9, D10) | 0 |
| Conversion (MEDIUM) | 9 | 1 (C6) | 0 |
| **Total** | **37** | **7** | **2** |

### GATE FAILURES (blocking)

**U4 — Missing Disclaimer:**
The report has NO "legal INFORMATION — not legal ADVICE" framing anywhere. The methodology note (lines 1-3) names expert attorneys but contains no disclaimer. This is the only report of three that completely lacks the required disclaimer.

**Fix:** Add after methodology note:
> **Important:** This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.

**U10 — Unsourced Collateral Claims:**
Line 356: "a cannabis conviction can trigger a driver's license suspension (up to 2 years), affect student financial aid eligibility, appear on background checks, and impact future employment and housing."
- License suspension: sourced (F.S. § 322.055) — OK
- Student financial aid: UNSOURCED
- Background checks: UNSOURCED
- Employment: UNSOURCED
- Housing: UNSOURCED

**Fix:** Either add statute citations (21 U.S.C. § 862 for financial aid, FCRA/FL statutes for background checks) OR restructure as attorney questions rather than factual claims.

### Other NEEDS_WORK Items
3. **U1** — Imperative tone in 7-Day Plan — LOW
4. **U8** — Line 73: "Right to fire your attorney" (FAIL trigger language); Step 7: "File a concern with The Florida Bar" (close to "file a complaint"). Compare persona-c which uses softer "Right to a second legal opinion" and "Contact the California State Bar... to inquire about your right to communication. This is informational, not adversarial." — HIGH priority fix
5. **D9** — Methodology note (lines 1-3) opens report BEFORE personal letter (line 6). Persona-a and persona-c put the personal letter first. This triggers D9 FAIL trigger: "Opening with disclaimers, methodology, or report structure before delivering any value." — HIGH priority fix
6. **D10** — "$797, with your $197 credited" — Intelligence Brief is $997. $997 - $197 = $800, not $797. Factual pricing error. — HIGH priority fix
7. **L6** — Motion deadlines absent — LOW
8. **C6** — No visible post-purchase drip — N/A

### Anti-Hallucination
- All statutes verified correct
- **Florida Bar ACAP 1-866-352-0707** needs verification
- **Ron Chapman II** expert attribution needs verification ("forensic substance analysis challenges", "Rule 29 wins")
- **$797 pricing** is a factual error
- Brown v. State, Martinetz v. State — verified real FL constructive possession case law

---

## Priority Fix List (All Personas)

### BLOCKING (must fix before any production use)
1. **persona-b U4** — Add missing disclaimer
2. **persona-b U10** — Source collateral consequence claims or restructure as questions

### MANDATORY (must fix before production)
3. **persona-a U4** — Replace banned disclaimer phrases with approved wording
4. **persona-b U8** — Soften "fire your attorney" and "File a concern" language
5. **persona-b D9** — Move methodology note after personal letter
6. **persona-b D10** — Fix $797 to $800 (or "$997 with your $197 credited")

### HIGH (should fix)
7. **persona-c P9** — Define Jencks Act, 3500 material, PACER, FAR on first use
8. **persona-a phone number** — Verify 1-800-932-1900 vs 1-800-252-9690
9. **persona-b phone/expert** — Verify ACAP number and Ron Chapman II attribution

### MEDIUM (improve when possible)
10. **All reports L6** — Add motion deadline awareness language
11. **persona-a** — Add collateral consequences table (immigration, firearms, voting, employment)

### LOW / SYSTEM-LEVEL
12. **All reports U1** — Imperative tone in 7-Day Plan (logistical, arguably intentional)
13. **All reports C6** — Post-purchase drip visibility (system-level, not in-report)

---

## Methodology Validation

In-session audit of persona-c matched the prior API-based eval (Opus 4.6, $1.29) **exactly** — same scores on all 51 criteria with equivalent justifications. This confirms that in-session evaluation produces reliable results at zero marginal cost, making it suitable for the current pre-go-live audit mode.

---

*Audit completed: 2026-03-02*
*Evaluator: Claude Code (in-session)*
*Cost: $0.00 (no API calls)*
*Time: ~30 minutes*
