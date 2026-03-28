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
    subject: "Your case scored {{SCORE}}/100 — {{CHARGE_LABEL}} defense",
    html: "<p>Score: {{SCORE}}. Charge: {{CHARGE_LABEL}}.</p>",
  };

  it("replaces {{SCORE}} and {{CHARGE_LABEL}} with provided values", () => {
    const result = interpolateScoreVars(baseEmail, 42, "dui");
    expect(result.subject).toBe("Your case scored 42/100 — DUI/DWI defense");
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
      "Your case scored your score/100 — criminal defense"
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

  it("Day 21 subject includes {{SCORE}} for interpolation", () => {
    const day21 = SCORE_REENGAGE_EMAILS.find(
      (e) => e.key === "score_reengage_day21"
    );
    expect(day21).toBeDefined();
    expect(day21!.subject).toContain("{{SCORE}}");
  });

  it("Day 30 subject includes {{CHARGE_LABEL}} for interpolation", () => {
    const day30 = SCORE_REENGAGE_EMAILS.find(
      (e) => e.key === "score_reengage_day30"
    );
    expect(day30).toBeDefined();
    expect(day30!.subject).toContain("{{CHARGE_LABEL}}");
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
