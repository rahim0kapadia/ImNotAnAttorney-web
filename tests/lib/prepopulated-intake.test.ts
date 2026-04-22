import { describe, it, expect } from "vitest";
import { buildPrePopulatedIntake } from "@/lib/tier9-reports/prepopulated-intake";

describe("buildPrePopulatedIntake", () => {
  describe("name-based slugs", () => {
    it("judge-report-card returns intake when judge_name + state present", () => {
      expect(
        buildPrePopulatedIntake("judge-report-card", {
          judge_name: "Sarah Johnson",
          state: "FL",
          charge_type: "dui",
        }),
      ).toEqual({ judgeName: "Sarah Johnson", state: "FL", chargeType: "dui" });
    });

    it("judge-report-card defaults chargeType to 'other' when missing", () => {
      expect(
        buildPrePopulatedIntake("judge-report-card", {
          judge_name: "Sarah Johnson",
          state: "FL",
        }),
      ).toEqual({ judgeName: "Sarah Johnson", state: "FL", chargeType: "other" });
    });

    it("judge-report-card returns null when judge_name missing", () => {
      expect(
        buildPrePopulatedIntake("judge-report-card", { state: "FL" }),
      ).toBeNull();
    });

    it("officer-background-check returns intake when officer_name + state present", () => {
      expect(
        buildPrePopulatedIntake("officer-background-check", {
          officer_name: "Michael Rivera",
          state: "AZ",
        }),
      ).toEqual({ officerName: "Michael Rivera", state: "AZ" });
    });

    it("officer-background-check returns null when state missing", () => {
      expect(
        buildPrePopulatedIntake("officer-background-check", {
          officer_name: "Michael Rivera",
        }),
      ).toBeNull();
    });

    it("similar-cases-analyzer returns intake when charge_type + state present", () => {
      expect(
        buildPrePopulatedIntake("similar-cases-analyzer", {
          charge_type: "drug-trafficking",
          state: "TX",
        }),
      ).toEqual({ chargeType: "drug-trafficking", state: "TX" });
    });

    it("similar-cases-analyzer returns null when charge_type missing", () => {
      expect(
        buildPrePopulatedIntake("similar-cases-analyzer", { state: "TX" }),
      ).toBeNull();
    });
  });

  describe("state-only slugs (the fix)", () => {
    it("district-court-intelligence returns intake when state present", () => {
      expect(
        buildPrePopulatedIntake("district-court-intelligence", { state: "CA" }),
      ).toEqual({ state: "CA" });
    });

    it("district-court-intelligence returns null when state missing", () => {
      expect(
        buildPrePopulatedIntake("district-court-intelligence", {}),
      ).toBeNull();
    });

    it("arrest-survival-kit returns intake when state present", () => {
      expect(
        buildPrePopulatedIntake("arrest-survival-kit", { state: "AZ" }),
      ).toEqual({ state: "AZ" });
    });

    it("arrest-survival-kit returns null when state missing", () => {
      expect(buildPrePopulatedIntake("arrest-survival-kit", {})).toBeNull();
    });

    it("arrest-survival-kit ignores extraneous metadata", () => {
      expect(
        buildPrePopulatedIntake("arrest-survival-kit", {
          state: "NY",
          judge_name: "Irrelevant",
          charge_type: "irrelevant",
        }),
      ).toEqual({ state: "NY" });
    });
  });

  describe("safety", () => {
    it("returns null for unknown slug", () => {
      expect(
        buildPrePopulatedIntake("unknown-product", { state: "FL" }),
      ).toBeNull();
    });

    it("returns null when metadata is null", () => {
      expect(buildPrePopulatedIntake("arrest-survival-kit", null)).toBeNull();
    });

    it("returns null when metadata is undefined", () => {
      expect(buildPrePopulatedIntake("arrest-survival-kit", undefined)).toBeNull();
    });

    it("treats empty-string state as missing", () => {
      expect(
        buildPrePopulatedIntake("arrest-survival-kit", { state: "" }),
      ).toBeNull();
    });
  });
});
