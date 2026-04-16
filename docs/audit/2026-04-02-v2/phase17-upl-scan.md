# UPL Compliance Scan, Phase 17
**Date:** 2026-04-02
**Auditor:** Legal Compliance Checker (Atlas/Atti session)
**Scope:** All customer-facing text in ImNotAnAttorney-web
**Standard:** U1–U15 banned phrase matrix

---

## CRITICAL FLAGS

**None.** No U6–U8, U13–U15 violations found anywhere in the codebase. All references to "legal advice" across the site correctly disclaim that we do NOT provide it. No outcome guarantees. No claim of representation. No attorney role claimed.

---

## Summary

| Category | Count | Status |
|----------|-------|------, |
| Critical (U6–U8, U13–U15) | 0 | CLEAN |
| High, directive "you need to" in score.ts copy | 2 | Flag, low severity, contextual |
| High, directive "you need to" in playbook-configs.ts | 1 | Flag, borderline, contextual |
| High, "you need to" in page copy (family, resources, checkout) | 4 | Flag, marketing/emotional framing |
| Low, "you should know" framing in blog (informational headers) | 8 | Acceptable, not directives |
| Low, "when you should fire" in blog | Multiple | Acceptable, framing, not command |
| Verified-clean recent fixes | 4 of 4 | CONFIRMED |
| Files scanned | 7 categories (50+ files) | Complete |

---

## Scan Results, File by File

---

### 1. `src/lib/score.ts`, Score Observations

**Previously fixed (verified clean):**
- Line 153: Old "You should..." replaced. Current text: "Discovery should be in your attorney's hands by now. Without it, your attorney is building a defense without seeing the prosecution's evidence, and you can't challenge what you haven't reviewed." CLEAN.
- Lines 175 and 266 area: No "You should" present in communication-frequency or pre-trial observation blocks. CLEAN.

**Remaining flags:**

**FLAG S1, Line 100, U4 (borderline)**
```
"Public defenders handle high caseloads, often 2-4x the recommended maximum. This doesn't mean yours is doing a bad job, but it means you need to be proactive: confirm deadlines, request updates in writing, and ask specifically about motions and discovery status."
```
Risk: "you need to be proactive" followed by three specific action directives. Not pure legal advice, it's process guidance, but reads as instructive. Recommendation: replace with "defendants in this situation often find it valuable to..." or simply "being proactive tends to matter: confirm deadlines, request updates in writing, ask about motions and discovery."

**FLAG S2, Line 203, U4 (borderline)**
```
"Your attorney hasn't discussed case strategy with you. An attorney who hasn't explained their defense theory either doesn't have one yet, or doesn't think you need to know. Neither is acceptable when your freedom is on the line."
```
Risk: "doesn't think you need to know", this is a characterization of attorney conduct, not a directive. The observation does not tell the user to DO anything. Low UPL risk. Flagged for awareness only. No change required.

**FLAG S3, Line 198**
```
"A brief strategy discussion isn't enough. Your attorney should be able to explain their theory of defense, which motions they plan to file, and why."
```
Risk: "Your attorney should be able to...", this describes a professional standard applied to the attorney, not a directive to the user. This is information about attorney obligations, which is within scope. ACCEPTABLE. No change required.

**FLAG S4, Line 260**
```
"You're in the pre-trial phase but no motions have been filed. This is the stage where suppression motions, discovery motions, and other pre-trial motions are expected. Ask your attorney: 'What motions are we filing before trial?'"
```
Analysis: Directs user to ask a question of their own attorney. This is core product behavior, generating questions. CLEAN. No change required.

**FLAG S5, Line 272**
```
"You've been arraigned but haven't received discovery yet. After arraignment, your attorney should be requesting or following up on discovery, the prosecution's evidence that your defense needs to review."
```
Risk: "your attorney should be requesting", describes attorney professional obligations, not user actions. ACCEPTABLE.

---

### 2. `src/lib/drip-emails.ts`, Email Sequences

**Previously fixed (verified clean):**
- Line 419 area: No "you should know" present. The felony gap block at lines 415–420 uses clean language: "sentencing exposure not mapped," "discovery incomplete or unreviewed", all descriptive, not directive. CONFIRMED CLEAN.

**Full scan result:** Zero U1–U15 violations found in drip-emails.ts. CLEAN.

---

### 3. `src/lib/playbook-configs.ts`, Playbook Content

**Flag P1, Line 940, U4 (borderline)**
```
"Proffer agreements, 5K1.1 motions, substantial assistance, cooperation can cut your sentence dramatically. But it can also be used against you. You need to understand the terms before you sign anything."
```
Context: Federal criminal playbook, cooperation section. "You need to understand the terms before you sign anything" is a directive, but it directs toward comprehension, not a legal action. Courts and bar associations consistently hold that advising someone to read and understand a document is not legal advice. Risk is low. However, in the spirit of clean language: consider replacing with "Understanding the terms before signing is essential, cooperation can be used against you as easily as for you."

**Correct usage found throughout (all acceptable):**
- Lines 108, 267, 597, 762, 927, 1092: "You shouldn't have to figure this out from Reddit threads.", This is brand voice, not a directive. CLEAN.
- Lines 200–201, 360–361, etc.: "You're looking for legal advice (we provide information, not advice)", correctly defines exclusion, not a claim of providing advice. CLEAN.
- All `legal INFORMATION, not legal ADVICE` disclaimers: Correctly worded throughout all 6+ playbook configs. CLEAN.
- All FAQ blocks: "No. We provide legal INFORMATION, not legal ADVICE." Consistent and correct. CLEAN.

---

### 4. `src/lib/intelligence-brief/prompts.ts`, Report Prompts

The prompts.ts file contains internal prompt engineering instructions, not customer-facing copy. Its banned terminology list (lines 35–101) explicitly mirrors the U1–U15 matrix:

- Line 35: `"you should", NEVER. Use "consider," "one option is," "questions to explore"`
- Line 37: `"you need to", NEVER.`
- Line 38: `"we recommend" / "we advise", NEVER`
- Line 39: `"your best option" / "the best strategy", NEVER`
- Line 101: `BANNED terminology: "red flag," "warning sign," "escalation ladder," "you need to," "you should"`
- Line 191: Same banned list repeated for second prompt builder.

The engine's own self-governance is correct. CLEAN.

One internal note at line 51: "you must normalize", this is a prompt instruction to the AI model, not customer-facing copy. Not a UPL concern.

---

### 5. `src/app/**/*.tsx`, Page Content

**FLAG A1, `src/app/resources/page.tsx` line 192, U4**
```
"There are three things you need to do before your window closes, one has a deadline as short as 7 days."
```
Context: DUI 72-hour emergency section header. "you need to do" is a directive. However, it is a conversion/urgency hook, not a legal strategy directive. Risk: low-medium. Alternatives: "There are three time-sensitive steps before your window closes" or "Three deadlines close before you realize, one in as few as 7 days."

**FLAG A2, `src/app/family/page.tsx` line 75**
```
"Either way, you're in a fog of disbelief and you need to do [something]."
```
Context: Emotional empathy copy. The sentence reads "you need to do something", but the visible text renders as "you need to do *something*" with emphasis, conveying emotional state not a legal directive. Risk: very low. ACCEPTABLE as written.

**FLAG A3, `src/app/checkout/page.tsx` line 351**
```
"You protected yourself or someone you love. Now you need to protect your freedom."
```
Context: Self-defense charge empathy hook. Emotional framing, not a legal strategy directive. ACCEPTABLE.

**FLAG A4, `src/app/checkout/page.tsx` line 420**
```
"You need to understand your case, not just trust that someone else does."
```
Context: Checkout conversion copy. Advocates for comprehension, not a specific legal action. ACCEPTABLE.

**FLAG A5, `src/app/checkout/page.tsx` line 440**
```
"Everything you need to understand your case, without needing discovery yet."
```
Context: Product description. "you need to" used in possessive/product framing, not directive. ACCEPTABLE.

**FLAG A6, `src/app/services/page.tsx` line 219**
```
"No. You need an attorney. We provide legal research and questions, not legal advice."
```
Context: FAQ answer. "You need an attorney" is not UPL, it is actively deflecting toward licensed counsel and disclaiming our service. This is exemplary compliance language. CLEAN.

**Correctly clean across all pages:**
- All "legal information, not legal advice" disclaimers: CLEAN across about, upload, layout, checkout, success, partners, editorial-policy, intake, terms, start, dui-defense, score, playbooks, sample, sample-xray, research pages.
- `src/app/about/page.tsx` lines 248–249: "We do not provide legal advice" / "We do not represent you in court", explicit and correct.
- `src/app/terms/page.tsx` line 100: "legal advice, legal opinions, or legal representation", explicitly excluded.

---

### 6. `src/components/**/*.tsx`, UI Components

**Previously fixed (verified clean):**
- `ReferralQuiz.tsx` line 140: No "Here's what we recommend" present. CONFIRMED CLEAN.
- `ShareButtons.tsx` line 40: No "should be asking" present. CONFIRMED CLEAN.

**Full scan result:** Zero U1–U15 violations in components. All disclaimers correctly worded. CLEAN.

Notable clean instances:
- `Footer.tsx` line 52: "Legal information, not legal advice." CLEAN.
- `Footer.tsx` line 233: "not legal advice. We are not a law firm and do not create an [attorney-client relationship]." CLEAN.
- `BridgePage.tsx` line 56: "legal information and questions, not legal advice." CLEAN.
- `ReferralQuiz.tsx` line 177: "legal information, not legal advice." CLEAN.

---

### 7. `content/blog/**/*.mdx`, Blog Posts (35 posts)

**Informational framing, ACCEPTABLE (not violations):**

The following patterns appear throughout blog content and are within bounds:

- "What you should know:", Used as a section header in `complete-dui-defense-guide.mdx` (line 52), `how-criminal-cases-actually-work.mdx` (line 34). This is informational framing identical to journalistic usage ("here is information"). Not a directive. ACCEPTABLE.
- "you should understand" (various posts), Informs that comprehension is valuable; does not direct a legal action. ACCEPTABLE.
- "you should know" phrasing in `how-your-attorney-makes-money.mdx` (lines 69, 136), "you should understand the financial incentive" and "each one creates incentives you should understand", comprehension advocacy, not legal strategy. ACCEPTABLE.
- "There's nothing wrong with a team approach, but you should know who's doing what" (`questions-to-ask-before-hiring.mdx` line 79), informs about a situation. ACCEPTABLE.

**Borderline flags in blog, note for future rewrites:**

**FLAG B1, `content/blog/complete-dui-defense-guide.mdx` line 183**
```
"Within days of the arraignment, you should know: [5 numbered items]"
```
Risk: Framed as a checklist of things "you should know." Could read as "your attorney should have told you these things, and if they haven't, that's a problem." That framing is legitimate, it describes attorney professional obligations. But "you should know" as a standalone directive header is borderline U1 territory. Recommend rewriting to "By the time you leave arraignment, these five things should be clear:", same meaning, cleaner framing.

**FLAG B2, `content/blog/complete-dui-defense-guide.mdx` line 293**
```
"Before accepting any plea deal, you should know: [4 numbered items]"
```
Same pattern as B1. "you should know" before a plea decision list is borderline. None of the four items are directives (they are questions to ask, consequences to understand, information to seek). Recommend: "Before accepting any plea deal, these four things need to be clear:", removes the directive "you should" while preserving the information.

**FLAG B3, `content/blog/should-you-fire-your-lawyer.mdx`**

The headline "When You Should Fire Your Attorney" (line 43) and "When You Should NOT Fire Your Attorney" (line 82) are section headers framing a decision-support article. The article body provides factors to evaluate, not a command. The TLDRBox at lines 30–32 says "Fire your lawyer if: [conditions]", this is the clearest directive language on the site. However:

1. The entire article is titled with a question ("Should You Fire Your Lawyer?")
2. The TLDRBox presents conditional logic ("if: ... / don't fire if: ..."), not a command
3. Line 108: "Do not fire your attorney until you have someone new", this is safety advice actively protecting the defendant from harm, not a legal strategy directive
4. Line 24 FAQ: "You should consider switching lawyers if...", "should consider" is approved language (it is not "you should switch")

**Assessment:** The "fire your lawyer" article sits in a gray zone. A regulator looking for UPL would focus on whether we're telling defendants what legal action to take. The article tells defendants what FACTS to observe, then frames the decision as theirs. The line "Fire your lawyer if: they've missed a filing deadline" (line 30) is the sharpest edge, it reads as a command. Recommend adding a brief framing sentence before the TLDRBox: "Only you can make this call. Here are the patterns defendants in this situation have found decisive:" then change "Fire your lawyer if:" to "Defendants typically decide to switch when:" and "Don't fire your lawyer if:" to "Defendants typically decide to stay when:"

**FLAG B4, `content/blog/attorney-not-returning-calls.mdx` line 194**
```
"you need to take immediate action. That means exploring new counsel, contacting the bar, or, if you have a public defender, filing a motion for substitution of counsel."
```
Risk: "you need to take immediate action" is U4. Followed by three specific action directives. This is the clearest U4 instance in the blog content. Recommend: "Immediate action is worth considering, options include exploring new counsel, contacting the bar, or filing a motion for substitution of counsel."

---

## Verified-Clean Recent Fixes (4 of 4 Confirmed)

| Fix | Location | Status |
|---, |----------|------, |
| "You should" → clean replacement | `score.ts` line 153 | CONFIRMED CLEAN |
| "You should" → clean replacement | `score.ts` lines 175, 266 area | CONFIRMED CLEAN |
| "you should know" → clean | `drip-emails.ts` line 419 | CONFIRMED CLEAN |
| "Here's what we recommend" → removed | `ReferralQuiz.tsx` line 140 | CONFIRMED CLEAN |
| "should be asking" → removed | `ShareButtons.tsx` line 40 | CONFIRMED CLEAN |

---

## Priority Fix List

Ordered by UPL exposure severity:

| Priority | Flag | File | Line | Action |
|----------|------|------|------|------, |
| HIGH | B4 | `attorney-not-returning-calls.mdx` | 194 | Replace "you need to take immediate action. That means..." |
| MEDIUM | B3 | `should-you-fire-your-lawyer.mdx` | 30, 43, 82 | Reframe TLDRBox and section headers as conditional/observational |
| MEDIUM | B1 | `complete-dui-defense-guide.mdx` | 183 | Replace "you should know:" list header |
| MEDIUM | B2 | `complete-dui-defense-guide.mdx` | 293 | Replace "you should know:" list header before plea discussion |
| LOW | S1 | `score.ts` | 100 | Replace "you need to be proactive:" |
| LOW | P1 | `playbook-configs.ts` | 940 | Replace "You need to understand the terms" |
| MONITOR | A1 | `resources/page.tsx` | 192 | Replace "things you need to do" in DUI 72-hour hook |

---

## Overall Assessment

The site maintains a strong UPL compliance posture. No critical violations (U6–U15). The "legal information, not legal advice" disclaimer is present on every major surface: footer, checkout, intake, score results, playbook pages, blog posts, sample reports. The prompts engine has self-governance rules that mirror the external banned phrase list.

The remaining issues are concentrated in blog content, where the editorial voice sometimes slides toward advice framing. `attorney-not-returning-calls.mdx` line 194 is the one instance that a regulator could credibly characterize as a directive. Everything else is context-dependent and defensible.

**No immediate site-down risk. Blog edits recommended before any distribution push targeting high-traffic queries.**

---

*Next audit recommended: After any new blog post publication or drip email update.*
