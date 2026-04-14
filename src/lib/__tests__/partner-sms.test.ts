import { describe, it, expect } from "vitest";
import {
  buildCommissionSMS,
  buildMonthlySummarySMS,
  getMilestoneMessage,
  buildTierProgress,
} from "../partner-sms";

describe("getMilestoneMessage", () => {
  it("returns message for milestone count", () => {
    expect(getMilestoneMessage(3)).toBe("3 referrals! Momentum building.");
    expect(getMilestoneMessage(10)).toBe("10 referrals! Top-tier INAA partner.");
    expect(getMilestoneMessage(25)).toBe("25 referrals! Helping more defendants than most attorneys.");
    expect(getMilestoneMessage(50)).toBe("50 referrals. Legend status.");
  });

  it("returns null for non-milestone counts", () => {
    expect(getMilestoneMessage(1)).toBeNull();
    expect(getMilestoneMessage(4)).toBeNull();
    expect(getMilestoneMessage(11)).toBeNull();
    expect(getMilestoneMessage(100)).toBeNull();
  });
});

describe("buildTierProgress", () => {
  it("shows progress to next tier for partner tier", () => {
    expect(buildTierProgress(2, "partner")).toBe("[2/5 to Silver Partner - 15%]");
  });

  it("shows progress to next tier for silver tier", () => {
    expect(buildTierProgress(8, "silver")).toBe("[8/15 to Gold Partner - 20%]");
  });

  it("shows max tier message for gold", () => {
    expect(buildTierProgress(20, "gold")).toBe("[Gold Partner - 20%]");
  });
});

describe("buildCommissionSMS", () => {
  const baseOpts = {
    amountCents: 22473,
    tierName: "The X-Ray",
    totalReferrals: 5,
    commissionTier: "partner",
    promoCode: "SMITH10",
    holdbackDate: "Jun 29",
  };

  it("builds first-sale SMS when totalReferrals === 1", () => {
    const msg = buildCommissionSMS({ ...baseOpts, totalReferrals: 1 });
    expect(msg).toContain("FIRST referral");
    expect(msg).toContain("The X-Ray");
    expect(msg).toContain("$224.73");
    expect(msg).toContain("SMITH10");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("builds milestone SMS at milestone count", () => {
    const msg = buildCommissionSMS({ ...baseOpts, totalReferrals: 10 });
    expect(msg).toContain("10 referrals!");
    expect(msg).not.toContain("FIRST");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("builds progress SMS for regular referrals", () => {
    const msg = buildCommissionSMS(baseOpts);
    expect(msg).toContain("$224.73");
    expect(msg).toContain("Jun 29");
    expect(msg).toContain("[5/5 to Silver Partner");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("stays within 160 chars for worst-case inputs", () => {
    const msg = buildCommissionSMS({
      amountCents: 99973,
      tierName: "Intelligence Brief",
      totalReferrals: 14,
      commissionTier: "silver",
      promoCode: "LONGCODENAME10",
      holdbackDate: "Jun 29",
    });
    expect(msg.length).toBeLessThanOrEqual(160);
  });
});

describe("buildMonthlySummarySMS", () => {
  it("builds summary with earnings and balance", () => {
    const msg = buildMonthlySummarySMS({
      monthName: "March",
      monthEarningsCents: 44946,
      totalBalanceCents: 67419,
    });
    expect(msg).toContain("March");
    expect(msg).toContain("$449.46");
    expect(msg).toContain("$674.19");
    expect(msg.length).toBeLessThanOrEqual(160);
  });
});
