# Flow 3 Gap Fixes, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 spec gaps in the Score Quiz Re-engagement email flow: add charge-type variant emails (Day 3), wire `{{SCORE}}` interpolation, update cron query to fetch score_value/charge_type, and add charge variants to Flow 6 Day 14.

**Architecture:** DB columns (`score_value`, `score_band`, `charge_type`) and API endpoints already exist and store data correctly. All changes are in the drip layer: `src/lib/drip-emails.ts` (email definitions + interpolation helper) and `src/lib/cron/drip-nurture.ts` (cron fetcher + sender). The `getChargeLabel()` function in `src/lib/score.ts` maps charge slugs to human labels, reuse it.

**Tech Stack:** Next.js 15, TypeScript, Supabase, Resend, vitest

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\content\queue\email\pending\FLOW-INDEX.md` (Flow 3 + Flow 6)

---

## File Map

| File | Action | Responsibility |
|------|------, |----------------|
| `src/lib/drip-emails.ts` | Modify | Add Day 3 charge-variant email to SCORE_CRISIS_EMAILS, update Day 14 reengage with charge variants, update Day 7 reengage subject with `{{SCORE}}`, add `interpolateScoreVars()` helper |
| `src/lib/cron/drip-nurture.ts` | Modify | Add `score_value`, `charge_type` to `.select()` query, call `interpolateScoreVars()` before sending |
| `src/lib/drip-emails.test.ts` | Create | Unit tests for `interpolateScoreVars()` and Day 3 email routing |

---

### Task 1: Add `score_value` and `charge_type` to cron subscriber query

**Files:**
- Modify: `src/lib/cron/drip-nurture.ts:39`

- [ ] **Step 1: Update the `.select()` call to include score_value and charge_type**

In `src/lib/cron/drip-nurture.ts`, line 39, change:

```typescript
// BEFORE:
.select("id, email, created_at, score_band, source")

// AFTER:
.select("id, email, created_at, score_band, score_value, charge_type, source")
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/cron/drip-nurture.ts
git commit -m "feat(drip): fetch score_value + charge_type in cron subscriber query"
```

---

### Task 2: Add `interpolateScoreVars()` helper to drip-emails.ts

**Files:**
- Modify: `src/lib/drip-emails.ts` (add import + helper after template helpers ~line 149)

- [ ] **Step 1: Add import for getChargeLabel at top of file**

Add after existing imports:

```typescript
import { getChargeLabel } from "@/lib/score";
```

- [ ] **Step 2: Add `interpolateScoreVars()` after the `link()` helper (after line 149)**

```typescript
/**
 * Interpolates score-specific template variables in email subject and HTML.
 *
 * Replaces:
 * - {{SCORE}} with numeric score (e.g., "42")
 * - {{CHARGE_LABEL}} with human-readable charge label (e.g., "DUI/DWI")
 * - charge-variant divs: shows matching variant, strips others
 *
 * If scoreValue is null, {{SCORE}} becomes "your score".
 * If chargeType is null, {{CHARGE_LABEL}} becomes "criminal"
 * and all charge-variant divs are stripped.
 */
export function interpolateScoreVars(
  email: DripEmail,
  scoreValue: number | null,
  chargeType: string | null
): DripEmail {
  const scoreStr = scoreValue != null ? String(scoreValue) : "your score";
  const chargeLabel = chargeType ? getChargeLabel(chargeType) : "criminal";

  let subject = email.subject
    .split("{{SCORE}}").join(scoreStr)
    .split("{{CHARGE_LABEL}}").join(chargeLabel);

  let html = email.html
    .split("{{SCORE}}").join(scoreStr)
    .split("{{CHARGE_LABEL}}").join(chargeLabel);

  // Show matching charge-variant div, strip others
  const variants = ["dui", "drug", "white-collar", "felony", "misdemeanor"];
  const matchSlug = chargeType === "other-felony" ? "felony"
    : chargeType === "other-misdemeanor" ? "misdemeanor"
    : chargeType;

  for (const v of variants) {
    if (v === matchSlug) {
      // Show: remove display:none
      html = html.split(`class="charge-variant-${v}" style="display:none;"`).join(`class="charge-variant-${v}"`);
    } else {
      // Strip: remove entire div block
      const openTag = `<div class="charge-variant-${v}" style="display:none;">`;
      const closeTag = `</div>`;
      let idx = html.indexOf(openTag);
      while (idx !== -1) {
        const endIdx = html.indexOf(closeTag, idx);
        if (endIdx === -1) break;
        html = html.slice(0, idx) + html.slice(endIdx + closeTag.length);
        idx = html.indexOf(openTag);
      }
    }
  }

  return { ...email, subject, html };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/drip-emails.ts
git commit -m "feat(drip): add interpolateScoreVars() for score/charge template variables"
```

---

### Task 3: Add Day 3 charge-specific email to SCORE_CRISIS_EMAILS

**Files:**
- Modify: `src/lib/drip-emails.ts:318-320` (insert between Day 2 and Day 5 emails)

- [ ] **Step 1: Insert Day 3 email after the Day 2 email (after line ~318) and before the Day 5 transition (line ~320)**

Insert this new entry into the SCORE_CRISIS_EMAILS array:

```typescript
  // Day 3: Charge-specific, how cases like yours usually play out.
  // {{CHARGE_LABEL}} and {{SCORE}} are interpolated at send time by
  // interpolateScoreVars() in drip-nurture.ts.
  {
    key: "score_crisis_day3",
    delayDays: 3,
    subject: "How {{CHARGE_LABEL}} cases with your score usually play out",
    html: `
      <h1 style="color: #F59E0B;">How {{CHARGE_LABEL}} Cases Like Yours Play Out</h1>
      <p>You scored <strong style="color: white;">{{SCORE}}/100</strong> on your Defense Milestone Score. Here's what that typically means for {{CHARGE_LABEL}} cases:</p>

      <div class="charge-variant-dui" style="display:none;">
        <p><strong style="color: white;">DUI/DWI defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">DMV hearing not requested</strong>, the administrative hearing is separate from the criminal case and has its own deadline (usually 7-10 days from arrest). Miss it and your license gets suspended regardless of the criminal outcome.</li>
          <li><strong style="color: white;">Breathalyzer calibration records not requested</strong>, every breath test machine has calibration logs. If the machine wasn't calibrated within the required window, the BAC number can be challenged. Most attorneys don't request these unless asked.</li>
          <li><strong style="color: white;">Field sobriety test conditions not documented</strong>, lighting, surface, weather, and the officer's training records all affect whether the FST results hold up. If your attorney hasn't documented these, ask why.</li>
        </ul>
      </div>

      <div class="charge-variant-drug" style="display:none;">
        <p><strong style="color: white;">Drug offense defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Lab report not independently reviewed</strong>, the substance and weight in the police report don't always match the lab results. A 68.3g field weight that comes back as 52.1g in the lab can change the charge entirely.</li>
          <li><strong style="color: white;">Search and seizure not challenged</strong>, if the evidence was found during a traffic stop, a consent search, or a warrant execution, each has specific constitutional requirements. An invalid search can suppress all downstream evidence.</li>
          <li><strong style="color: white;">Chain of custody gaps</strong>, evidence that changed hands without proper documentation, or was stored improperly, creates reasonable doubt about what was actually seized.</li>
        </ul>
      </div>

      <div class="charge-variant-white-collar" style="display:none;">
        <p><strong style="color: white;">White collar defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Intent not adequately challenged</strong>, white collar charges almost always require proving intent. Your attorney should be building a narrative around legitimate business purpose, good-faith reliance on advisors, or lack of knowledge.</li>
          <li><strong style="color: white;">Document volume used against you</strong>, prosecutors cherry-pick from thousands of pages. Your attorney should be identifying the documents that show the full context, not just the ones the prosecution highlighted.</li>
          <li><strong style="color: white;">Restitution strategy not started</strong>, voluntary restitution before sentencing dramatically affects outcomes. If your attorney hasn't discussed this, ask about the timeline.</li>
        </ul>
      </div>

      <div class="charge-variant-felony" style="display:none;">
        <p><strong style="color: white;">Felony defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Preliminary hearing strategy unclear</strong>, the preliminary hearing is your first real opportunity to test the prosecution's case. Your attorney should have a specific plan for what to challenge and which witnesses to cross-examine.</li>
          <li><strong style="color: white;">Discovery incomplete or unreviewed</strong>, felony cases generate significant discovery. If your attorney summarized it rather than walking you through it page by page, important details may have been missed.</li>
          <li><strong style="color: white;">Sentencing exposure not mapped</strong>, you should know the minimum, maximum, and guideline range for each charge, including how enhancements or prior record affect the math.</li>
        </ul>
      </div>

      <div class="charge-variant-misdemeanor" style="display:none;">
        <p><strong style="color: white;">Misdemeanor defendants</strong> in your score range often have one or more of these gaps:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Diversion or deferred adjudication not explored</strong>, many misdemeanor charges qualify for programs that can result in dismissal. If your attorney hasn't discussed these options, ask specifically about eligibility.</li>
          <li><strong style="color: white;">Collateral consequences not addressed</strong>, a misdemeanor conviction can affect employment, housing, professional licenses, and immigration status. Your attorney should be considering these beyond just the criminal penalty.</li>
          <li><strong style="color: white;">Witness statements not obtained</strong>, misdemeanor cases often rely heavily on one or two witnesses. Your attorney should be getting statements or depositions before memories fade or witnesses become unavailable.</li>
        </ul>
      </div>

      <p>The Case Decoder maps every vulnerability specific to your charges, jurisdiction, and case stage, then generates the exact questions to close each gap.</p>
      ${cta("Get My Case Decoder \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
    `,
  },
```

- [ ] **Step 2: Verify SCORE_CRISIS_EMAILS now has 4 entries (Day 1, 2, 3, 5)**

Quick sanity: the array should have exactly 4 entries with delayDays [1, 2, 3, 5].

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/drip-emails.ts
git commit -m "feat(drip): add Day 3 charge-specific email to crisis sequence"
```

---

### Task 4: Update SCORE_REENGAGE Day 7 subject + Day 14 with charge variants

**Files:**
- Modify: `src/lib/drip-emails.ts:366-403` (SCORE_REENGAGE_EMAILS entries)

- [ ] **Step 1: Update Day 7 subject to include {{SCORE}}**

Per Flow 6 spec, Day 7 subject should include the score. Change line ~368:

```typescript
// BEFORE:
subject: "7 days since your score. Has anything changed?",

// AFTER:
subject: "Your defense score was {{SCORE}}. Here's what changed since then.",
```

- [ ] **Step 2: Replace Day 14 email with charge-variant version**

Replace the entire `score_reengage_day14` entry (~lines 390-403) with:

```typescript
  {
    key: "score_reengage_day14",
    delayDays: 14,
    subject: "The one thing {{CHARGE_LABEL}} defendants always miss",
    html: `
      <h1 style="color: #F59E0B;">The One Thing {{CHARGE_LABEL}} Defendants Always Miss</h1>
      <p>Motions have deadlines. And once a deadline passes, arguments that could have changed your case are <strong style="color: #EF4444;">gone forever</strong>.</p>

      <div class="charge-variant-dui" style="display:none;">
        <p>For DUI/DWI cases, the motion most often missed is a <strong style="color: white;">motion to suppress the breath or blood test results</strong>. If the breathalyzer wasn't calibrated within the required window, or if the blood draw didn't follow proper chain-of-custody protocol, the BAC number, the prosecution's strongest evidence, can be excluded entirely. But only if the motion is filed before the deadline.</p>
      </div>

      <div class="charge-variant-drug" style="display:none;">
        <p>For drug offense cases, the motion most often missed is a <strong style="color: white;">motion to suppress evidence based on an unlawful search</strong>. Whether it was a traffic stop, a consent search, or a warrant execution, each has specific constitutional requirements. The prosecution needs that evidence, if it was obtained improperly and your attorney files in time, it can be excluded.</p>
      </div>

      <div class="charge-variant-white-collar" style="display:none;">
        <p>For white collar cases, the motion most often missed is a <strong style="color: white;">motion to compel discovery of exculpatory documents</strong>. Prosecutors are required to disclose evidence favorable to the defense (Brady material), but they don't always do it proactively. Your attorney should be filing motions to ensure the full picture, including documents that support your defense, is on the table.</p>
      </div>

      <div class="charge-variant-felony" style="display:none;">
        <p>For felony cases, the motion most often missed is a <strong style="color: white;">motion to reduce charges at the preliminary hearing stage</strong>. If the prosecution's evidence doesn't support the highest charge, a well-timed motion can force a reduction before trial. But it requires preparation, your attorney needs to identify the weakness and file before the window closes.</p>
      </div>

      <div class="charge-variant-misdemeanor" style="display:none;">
        <p>For misdemeanor cases, the opportunity most often missed is a <strong style="color: white;">motion for diversion or deferred adjudication</strong>. Many jurisdictions offer programs that can result in complete dismissal, but they have eligibility windows and filing requirements. If your attorney hasn't explored this, ask specifically about your eligibility before the next court date.</p>
      </div>

      <p>Understanding what motions apply to your case, and when they need to be filed, is one of the most important things you can do right now.</p>
      <p>${link("Read the Full Guide: What Motions Should Your Attorney Be Filing?", "/blog/what-motions-should-your-attorney-be-filing")}</p>
      <p style="margin-top: 24px;">Want the motion analysis specific to <strong style="color: white;">your</strong> charges and jurisdiction? The Case Decoder maps out what applies to your case.</p>
      ${cta("Get My Case Decoder \u2014 " + TIER_CORE["case-decoder"].priceDisplay, "/checkout?tier=case-decoder")}
    `,
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/drip-emails.ts
git commit -m "feat(drip): add charge-variant content to Day 14 reengage + {{SCORE}} to Day 7"
```

---

### Task 5: Wire interpolation into the cron sender

**Files:**
- Modify: `src/lib/cron/drip-nurture.ts`

- [ ] **Step 1: Import `interpolateScoreVars` from drip-emails**

Update the existing import at top of file:

```typescript
// BEFORE:
import {
  getNextNurtureEmail,
  getNextScoreEmail,
  getScoreNurtureOffset,
  getNextDui72hEmail,
  getNextAbandonedScoreEmail,
  getNextWinbackEmail,
} from "@/lib/drip-emails";

// AFTER:
import {
  getNextNurtureEmail,
  getNextScoreEmail,
  getScoreNurtureOffset,
  getNextDui72hEmail,
  getNextAbandonedScoreEmail,
  getNextWinbackEmail,
  interpolateScoreVars,
} from "@/lib/drip-emails";
```

- [ ] **Step 2: Apply interpolation before sending, for score-page subscribers**

Insert between the win-back fallthrough block (~line 128) and the `if (!nextEmail)` check (line 130):

```typescript
      // ── INTERPOLATE SCORE VARIABLES ──
      if (nextEmail && sub.score_band) {
        nextEmail = interpolateScoreVars(
          nextEmail,
          sub.score_value ?? null,
          sub.charge_type ?? null
        );
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/cron/drip-nurture.ts
git commit -m "feat(drip): wire score/charge interpolation into cron email sender"
```

---

### Task 6: Write unit tests

**Files:**
- Create: `src/lib/drip-emails.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from "vitest";
import {
  interpolateScoreVars,
  getNextScoreEmail,
  SCORE_CRISIS_EMAILS,
  SCORE_REENGAGE_EMAILS,
} from "./drip-emails";
import type { DripEmail } from "./drip-emails";

// ── interpolateScoreVars ──────────────────────────────────────

describe("interpolateScoreVars", () => {
  const baseEmail: DripEmail = {
    key: "test",
    delayDays: 1,
    subject: "Your case scored {{SCORE}}/100, {{CHARGE_LABEL}} defense",
    html: "<p>Score: {{SCORE}}. Charge: {{CHARGE_LABEL}}.</p>",
  };

  it("replaces {{SCORE}} and {{CHARGE_LABEL}} with provided values", () => {
    const result = interpolateScoreVars(baseEmail, 42, "dui");
    expect(result.subject).toBe("Your case scored 42/100, DUI/DWI defense");
    expect(result.html).toContain("Score: 42.");
    expect(result.html).toContain("Charge: DUI/DWI.");
  });

  it("uses fallback when scoreValue is null", () => {
    const result = interpolateScoreVars(baseEmail, null, "drug");
    expect(result.subject).toContain("your score");
    expect(result.html).toContain("Score: your score.");
  });

  it("uses 'criminal' when chargeType is null", () => {
    const result = interpolateScoreVars(baseEmail, 55, null);
    expect(result.subject).toContain("criminal defense");
    expect(result.html).toContain("Charge: criminal.");
  });

  it("uses fallbacks for both null values", () => {
    const result = interpolateScoreVars(baseEmail, null, null);
    expect(result.subject).toBe(
      "Your case scored your score/100, criminal defense"
    );
  });

  it("does not mutate the original email", () => {
    const original = { ...baseEmail };
    interpolateScoreVars(baseEmail, 42, "dui");
    expect(baseEmail.subject).toBe(original.subject);
    expect(baseEmail.html).toBe(original.html);
  });

  // ── Charge variant div selection ──

  const variantEmail: DripEmail = {
    key: "test-variant",
    delayDays: 3,
    subject: "{{CHARGE_LABEL}} cases",
    html: [
      '<div class="charge-variant-dui" style="display:none;"><p>DUI content</p></div>',
      '<div class="charge-variant-drug" style="display:none;"><p>Drug content</p></div>',
      '<div class="charge-variant-white-collar" style="display:none;"><p>WC content</p></div>',
      '<div class="charge-variant-felony" style="display:none;"><p>Felony content</p></div>',
      '<div class="charge-variant-misdemeanor" style="display:none;"><p>Misdemeanor content</p></div>',
    ].join("\n"),
  };

  it("shows DUI variant and strips others for chargeType=dui", () => {
    const result = interpolateScoreVars(variantEmail, 42, "dui");
    expect(result.html).toContain("DUI content");
    expect(result.html).not.toContain("Drug content");
    expect(result.html).not.toContain("WC content");
    expect(result.html).not.toContain("Felony content");
    expect(result.html).not.toContain("Misdemeanor content");
    expect(result.html).not.toContain('charge-variant-dui" style="display:none;"');
  });

  it("shows drug variant for chargeType=drug", () => {
    const result = interpolateScoreVars(variantEmail, 42, "drug");
    expect(result.html).toContain("Drug content");
    expect(result.html).not.toContain("DUI content");
  });

  it("maps other-felony to felony variant", () => {
    const result = interpolateScoreVars(variantEmail, 42, "other-felony");
    expect(result.html).toContain("Felony content");
    expect(result.html).not.toContain("DUI content");
  });

  it("maps other-misdemeanor to misdemeanor variant", () => {
    const result = interpolateScoreVars(variantEmail, 42, "other-misdemeanor");
    expect(result.html).toContain("Misdemeanor content");
    expect(result.html).not.toContain("Felony content");
  });

  it("strips all variants when chargeType is null", () => {
    const result = interpolateScoreVars(variantEmail, 42, null);
    expect(result.html).not.toContain("DUI content");
    expect(result.html).not.toContain("Drug content");
    expect(result.html).not.toContain("WC content");
    expect(result.html).not.toContain("Felony content");
    expect(result.html).not.toContain("Misdemeanor content");
  });
});

// ── getNextScoreEmail routing ─────────────────────────────────

describe("getNextScoreEmail", () => {
  it("returns Day 1 crisis email on Day 1 for Critical band", () => {
    const email = getNextScoreEmail(1, new Set(), "Critical");
    expect(email).not.toBeNull();
    expect(email!.key).toBe("score_crisis_day1");
  });

  it("returns Day 2 crisis email on Day 2 when Day 1 already sent", () => {
    const sent = new Set(["score_crisis_day1"]);
    const email = getNextScoreEmail(2, sent, "Critical");
    expect(email).not.toBeNull();
    expect(email!.key).toBe("score_crisis_day2");
  });

  it("returns Day 3 charge-specific email on Day 3", () => {
    const sent = new Set(["score_crisis_day1", "score_crisis_day2"]);
    const email = getNextScoreEmail(3, sent, "Concerning");
    expect(email).not.toBeNull();
    expect(email!.key).toBe("score_crisis_day3");
    expect(email!.delayDays).toBe(3);
  });

  it("returns Day 5 transition after Day 3 is sent", () => {
    const sent = new Set([
      "score_crisis_day1",
      "score_crisis_day2",
      "score_crisis_day3",
    ]);
    const email = getNextScoreEmail(5, sent, "Critical");
    expect(email).not.toBeNull();
    expect(email!.key).toBe("score_crisis_transition");
  });

  it("falls through to reengage Day 7 after all crisis emails sent", () => {
    const sent = new Set([
      "score_crisis_day1",
      "score_crisis_day2",
      "score_crisis_day3",
      "score_crisis_transition",
    ]);
    const email = getNextScoreEmail(7, sent, "Critical");
    expect(email).not.toBeNull();
    expect(email!.key).toBe("score_reengage_day7");
  });

  it("returns adequate Day 1 for Excellent band", () => {
    const email = getNextScoreEmail(1, new Set(), "Excellent");
    expect(email).not.toBeNull();
    expect(email!.key).toBe("score_adequate_day1");
  });

  it("returns null when all emails sent", () => {
    const allKeys = new Set([
      ...SCORE_CRISIS_EMAILS.map((e) => e.key),
      ...SCORE_REENGAGE_EMAILS.map((e) => e.key),
    ]);
    const email = getNextScoreEmail(999, allKeys, "Critical");
    expect(email).toBeNull();
  });

  it("crisis sequence now has 4 emails (Day 1, 2, 3, 5)", () => {
    expect(SCORE_CRISIS_EMAILS).toHaveLength(4);
    expect(SCORE_CRISIS_EMAILS.map((e) => e.delayDays)).toEqual([1, 2, 3, 5]);
  });
});

// ── SCORE_REENGAGE_EMAILS spec compliance ─────────────────────

describe("SCORE_REENGAGE_EMAILS", () => {
  it("Day 7 subject includes {{SCORE}} for interpolation", () => {
    const day7 = SCORE_REENGAGE_EMAILS.find(
      (e) => e.key === "score_reengage_day7"
    );
    expect(day7).toBeDefined();
    expect(day7!.subject).toContain("{{SCORE}}");
  });

  it("Day 14 has charge-variant divs for 5 charge types", () => {
    const day14 = SCORE_REENGAGE_EMAILS.find(
      (e) => e.key === "score_reengage_day14"
    );
    expect(day14).toBeDefined();
    expect(day14!.html).toContain("charge-variant-dui");
    expect(day14!.html).toContain("charge-variant-drug");
    expect(day14!.html).toContain("charge-variant-white-collar");
    expect(day14!.html).toContain("charge-variant-felony");
    expect(day14!.html).toContain("charge-variant-misdemeanor");
    expect(day14!.subject).toContain("{{CHARGE_LABEL}}");
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (both score.test.ts and drip-emails.test.ts).

- [ ] **Step 3: Commit**

```bash
git add src/lib/drip-emails.test.ts
git commit -m "test(drip): add unit tests for interpolateScoreVars + charge routing"
```

---

### Task 7: Final verification and push

- [ ] **Step 1: TypeScript check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Clean

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Push to deploy**

Run: `git push origin master`
Expected: Deploys via Vercel GitHub integration.

---

## Summary of Changes

| Gap | Fix | Task |
|---, |---, |------|
| Missing Day 3 charge-specific email | Added to SCORE_CRISIS_EMAILS with 5 charge-variant divs | Task 3 |
| No `{{SCORE}}` interpolation | Added `interpolateScoreVars()` + wired in cron sender | Tasks 2, 5 |
| Missing charge_type/score_value in cron query | Added to `.select()` | Task 1 |
| Day 14 reengage missing charge variants | Added 5 charge-variant divs (Flow 6 spec) | Task 4 |
| Day 7 reengage subject missing score | Updated subject to include `{{SCORE}}` | Task 4 |
| Day 2 timing discrepancy | **No change needed**, Day 1 + Day 2 cadence matches spec given daily cron | N/A |

## What Was NOT Changed (and why)

- **DB schema**, `score_value`, `score_band`, `charge_type` columns already exist (migration 009)
- **Subscribe API**, already accepts and stores all three fields
- **Score page**, already sends all three fields
- **`getNextScoreEmail()` function signature**, kept pure (routes by band only); interpolation at send time
