import { describe, it, expect } from "vitest";

const {
  hasNegation,
  extractMotionTypes,
  extractStatuteCitations,
  matchStatutesToCharges,
  deriveDefenseTheories,
  extractMotionOutcomes,
  extractHoldingText,
  computeMotionFavorability,
  computeCaseFavorability,
  extractAll,
} = await import("../scripts/lib/mechanical-extractor.mjs");

describe("hasNegation", () => {
  it("detects 'not' before keyword", () => {
    const text = "the court did not grant the motion to suppress";
    expect(hasNegation(text, text.indexOf("motion to suppress"))).toBe(true);
  });

  it("returns false when no negation present", () => {
    const text = "the court granted the motion to suppress";
    expect(hasNegation(text, text.indexOf("motion to suppress"))).toBe(false);
  });

  it("detects 'without' before keyword", () => {
    const text = "proceeded without the motion to suppress being filed";
    expect(hasNegation(text, text.indexOf("motion to suppress"))).toBe(true);
  });
});

describe("extractMotionTypes", () => {
  it("finds suppress_motion", () => {
    const text = "Defendant filed a motion to suppress evidence obtained during the search.";
    const result = extractMotionTypes(text);
    expect(result).toContain("suppress_motion");
  });

  it("finds multiple motion types", () => {
    const text = "Filed motion to suppress and motion to dismiss the indictment.";
    const result = extractMotionTypes(text);
    expect(result).toContain("suppress_motion");
    expect(result).toContain("dismiss_motion");
  });

  it("excludes negated motions", () => {
    const text = "The defendant did not file a motion to suppress.";
    const result = extractMotionTypes(text);
    expect(result).not.toContain("suppress_motion");
  });

  it("returns empty for text without motion keywords", () => {
    const result = extractMotionTypes("The sky is blue and the grass is green.");
    expect(result).toEqual([]);
  });
});

describe("extractStatuteCitations", () => {
  it("finds § citations", () => {
    const text = "Charged under \u00A7 316.193 of the Florida Statutes.";
    const result = extractStatuteCitations(text);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].citation).toBe("316.193");
  });

  it("marks first-15% citations as primary", () => {
    // Create text where the citation is in the first 15%
    const text = "\u00A7 316.193 charge. " + "x ".repeat(500);
    const result = extractStatuteCitations(text);
    expect(result[0].isPrimary).toBe(true);
  });

  it("finds section keyword citations", () => {
    const text = "Under section 893.13 of the Florida Statutes.";
    const result = extractStatuteCitations(text);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].citation).toBe("893.13");
  });
});

describe("matchStatutesToCharges", () => {
  it("matches citation to charge_slug via statute map", () => {
    const statuteMap = new Map([
      ["fl:316.193", { charge_slug: "dui", statute_number: "316.193" }],
    ]);
    const citations = [{ citation: "316.193", position: 0, isPrimary: true }];
    const result = matchStatutesToCharges(citations, "FL", statuteMap);
    expect(result).toEqual([{ charge_slug: "dui", isPrimary: true }]);
  });

  it("ignores cross-jurisdiction matches", () => {
    const statuteMap = new Map([
      ["tx:49.04", { charge_slug: "dui", statute_number: "49.04" }],
    ]);
    const citations = [{ citation: "49.04", position: 0, isPrimary: true }];
    const result = matchStatutesToCharges(citations, "FL", statuteMap);
    expect(result).toEqual([]);
  });
});

describe("deriveDefenseTheories", () => {
  it("derives theory from motion + keyword match", () => {
    const theoryMap = new Map([
      ["dui", [
        {
          theory_name: "improper_stop",
          theory_keywords: ["probable cause for stop", "traffic stop"],
          motion_types: ["suppress_motion"],
        },
      ]],
    ]);
    const text = "The traffic stop lacked probable cause.";
    const result = deriveDefenseTheories(["dui"], ["suppress_motion"], text, theoryMap);
    expect(result).toContain("improper_stop");
  });

  it("requires BOTH motion match AND keyword match", () => {
    const theoryMap = new Map([
      ["dui", [
        {
          theory_name: "improper_stop",
          theory_keywords: ["traffic stop"],
          motion_types: ["suppress_motion"],
        },
      ]],
    ]);
    // Has keyword but wrong motion type
    const result = deriveDefenseTheories(["dui"], ["dismiss_motion"], "The traffic stop was invalid.", theoryMap);
    expect(result).toEqual([]);
  });
});

describe("extractMotionOutcomes", () => {
  it("finds granted outcome in last 20%", () => {
    const padding = "Lorem ipsum dolor sit amet. ".repeat(50);
    const text = padding + "The motion to suppress is hereby granted.";
    const result = extractMotionOutcomes(["suppress_motion"], text);
    expect(result[0].outcome).toBe("granted");
  });

  it("returns null when no outcome found", () => {
    const text = "This is a long opinion with no clear outcome. ".repeat(30);
    const result = extractMotionOutcomes(["suppress_motion"], text);
    expect(result[0].outcome).toBeNull();
  });
});

describe("extractHoldingText", () => {
  it("extracts sentences with ruling keywords from last 20%", () => {
    const padding = "Some legal discussion. ".repeat(50);
    const text = padding + "We hold that the evidence must be suppressed. The conviction is reversed.";
    const result = extractHoldingText(text);
    expect(result).toContain("We hold that");
  });

  it("returns null when no holding keywords found", () => {
    const text = "Just some text without any ruling language. ".repeat(20);
    const result = extractHoldingText(text);
    expect(result).toBeNull();
  });
});

describe("computeMotionFavorability", () => {
  it("scores granted motions at 85", () => {
    const result = computeMotionFavorability([
      { motion_type: "suppress_motion", outcome: "granted" },
    ]);
    expect(result[0].favorability).toBe(85);
  });

  it("scores denied motions at 20", () => {
    const result = computeMotionFavorability([
      { motion_type: "dismiss_motion", outcome: "denied" },
    ]);
    expect(result[0].favorability).toBe(20);
  });

  it("skips null outcomes", () => {
    const result = computeMotionFavorability([
      { motion_type: "suppress_motion", outcome: null },
    ]);
    expect(result).toEqual([]);
  });
});

describe("computeCaseFavorability", () => {
  it("computes favorable score for granted motions", () => {
    const result = computeCaseFavorability(
      [{ motion_type: "suppress_motion", outcome: "granted" }],
      true
    );
    expect(result).toBeGreaterThanOrEqual(80);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("reduces score for bad law", () => {
    const good = computeCaseFavorability(
      [{ motion_type: "suppress_motion", outcome: "granted" }],
      true
    );
    const bad = computeCaseFavorability(
      [{ motion_type: "suppress_motion", outcome: "granted" }],
      false
    );
    expect(bad).toBeLessThan(good);
  });

  it("returns null with no outcomes", () => {
    expect(computeCaseFavorability([], null)).toBeNull();
  });
});
