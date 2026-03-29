# Copy Review Findings — Exact Line References

## 1. Sample Page (/sample/page.tsx) — "Your Next 7 Days" Table

**Status:** CLEAN — No burden language detected.

The table uses empowering framing:
- Day 1: "Send the email" (agency — they do it)
- Day 2: "Your 5 priority questions are already marked" (prep done for them)
- Day 3: "The follow-up template is ready" (resource provided)
- Day 4: "Your What to Bring checklist is already in the report" (no homework)
- Day 5: "Read the questions once" (single action, not obligation)
- Day 6-7: "Attend your meeting" (their participation, not burden)

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample\page.tsx`
**Lines:** 606-672 (table section)
**Key phrase:** All action items are resourced or minimal — no "you must," "make sure you," or "don't forget" language.

---

## 2. Sample X-Ray Page (/sample-xray/page.tsx) — Defense Frameworks

**Status:** FOUND — All three frameworks are explicitly named.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample-xray\page.tsx`

**Framework 1 — Chapman II (Line 221):**
```
<span className="font-semibold text-zinc-300">Framework:</span> Chapman II Drug Forensic Analysis
```

**Framework 2 — Scheck (Line 503):**
```
<span className="font-semibold text-zinc-300">Framework:</span> Scheck Evidence Integrity Protocol
```

**Framework 3 — MacCarthy (Line 539):**
```
<span className="font-semibold text-zinc-300">Framework:</span> MacCarthy Suppression Methodology
```

**Block 9 Summary (Lines 662-669) — Methodology Overview:**
All three frameworks are referenced together in the "How Every X-Ray Is Built" section. This is the process transparency section that explains the systematic approach.

**Note:** There is NO heading called "The 10-Day Hard Deadline" in the file. This may reference a planned change from the handoff notes.

---

## 3. Checkout Page (/checkout/page.tsx) — Guarantee Section

**Status:** MIXED — Crisis tier guarantee is robust; non-crisis tiers show only delivery timing, not relevance.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\page.tsx`
**Lines 790-810:**

### For Crisis Buyers (Band = Critical/Concerning):
```javascript
"If the analysis and questions we deliver aren't specific to your charges, your case stage, and the gaps your attorney hasn't addressed — we'll rebuild it from scratch at no charge. If the rebuild still doesn't fit your situation, you get a full refund. No questions. No forms. One email."
```
**This is strong** — addresses relevance, not just delivery.

### For Non-Crisis Buyers:
```javascript
`Delivery Guarantee: ${info.guarantee}`
```
Then pulls from TIER_INFO, which shows (from earlier read):
```javascript
guarantee: "5 questions you never thought to ask, or full refund. No explanation required."
```
**This is WEAK** — focuses only on delivery ("questions delivered"), not relevance ("are these the right questions for YOUR case").

---

## 4. Score Page (/score/page.tsx) — Tribe Identity Block

**Status:** NOT IN SCORE PAGE — Moved to checkout/success page.

The "defendants who prepare" language exists in:

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\success\page.tsx`
**Line 325:**
```
You're one of the defendants who prepares instead of waits. That changes how your next attorney meeting goes.
```

**Context:** This is on the SUCCESS page after payment, not on the score page. It connects payment → tribe identity → CTA (your analysis is being built). **This connection is solid.**

---

## 5. LeadCapture.tsx — "Too Busy Researching" Joke

**Status:** NOT FOUND — No humorous copy about being "too busy researching."

**What exists instead (Lines 55-56):**
```javascript
title = "What's Actually in Your Discovery?",
description = "7 evidence problems real cases hide — and the questions that expose them. Based on a real case we reviewed. Used by defendants who refuse to go into court blind.",
```

**Note:** The "Used by defendants who refuse to go into court blind" is a tribe identity phrase, but not the joke mentioned. Need to search for where the "too busy researching" text appears (if it exists).

---

## 6. TrustBadges.tsx — "Content Quality Guarantee" or Similar

**Status:** FOUND — Multiple guarantee-style badges exist.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\TrustBadges.tsx`
**Lines 9-52:**

All badges in the array:
1. **Line 16:** `"Your case is confidential — never shared with your attorney"`
2. **Line 24:** `"Delivery Guarantee"`
3. **Line 32:** `"Stripe Secure Checkout"`
4. **Line 40:** `"Documented Methodology Guarantee"`
5. **Line 48:** `"Questions? help@imnotanattorney.com"`

**The closest to "Content Quality Guarantee":**
**Line 40:**
```
label: "Documented Methodology Guarantee",
```

---

## 7. Blog.ts — Byline "Research Team"

**Status:** FOUND

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\blog.ts`
**Line 122:**
```typescript
author: data.author || "ImNotAnAttorney Team",
```

This is the DEFAULT byline if no author is specified in the frontmatter. The phrase is `"ImNotAnAttorney Team"` not `"Research Team"`.

---

## Summary Table

| Item | Location | Status | Key Finding |
|------|----------|--------|-------------|
| 1. Sample 7-day table | sample/page.tsx:606-672 | CLEAN | No burden language; agency-focused |
| 2. Frameworks (Scheck, Chapman II, MacCarthy) | sample-xray/page.tsx:221,503,539,662-669 | FOUND | All three named explicitly in red flags + methodology block |
| 3. Guarantee (crisis) | checkout/page.tsx:796 | STRONG | Addresses relevance + delivery |
| 4. Guarantee (non-crisis) | checkout/page.tsx:797 | WEAK | Delivery timing only, not relevance |
| 5. Tribe identity | checkout/success/page.tsx:325 | FOUND | "defendants who prepares" → connects to post-payment CTA |
| 6. "Too busy researching" joke | Unknown location | NOT FOUND | Search needed |
| 7. Quality/Methodology guarantee badge | TrustBadges.tsx:40 | FOUND | "Documented Methodology Guarantee" |
| 8. Blog byline default | blog.ts:122 | FOUND | "ImNotAnAttorney Team" (not "Research Team") |

---

## Next Actions Needed

1. **"10-Day Hard Deadline" heading** — NOT IN CURRENT FILE. This may be a planned rename from the handoff notes. Check handoff docs for context.
2. **"Too busy researching" joke** — NOT FOUND in any file scanned. May not exist yet or may be in a different location (email templates, prompts, etc.).
3. **Audit non-crisis guarantee copy** — CONFIRMED: Lines 797 in checkout/page.tsx show only delivery timing, not relevance for Adequate/Excellent band tiers. All tiers use `${info.guarantee}` which references TIER_INFO objects that show "X questions you never thought to ask" (delivery-focused).

---

## Files Read This Session

- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample\page.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample-xray\page.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\page.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\success\page.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\score\page.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\LeadCapture.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\TrustBadges.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\blog.ts`
