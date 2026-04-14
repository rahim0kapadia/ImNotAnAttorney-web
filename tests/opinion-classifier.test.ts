import { describe, it, expect } from "vitest";

// Dynamic import for .mjs in vitest
const { classifyOpinionType, getExtractionSteps, OPINION_TYPE_WEIGHTS } =
  await import("../scripts/lib/opinion-classifier.mjs");

describe("classifyOpinionType", () => {
  it("classifies empty text as order", () => {
    const result = classifyOpinionType("");
    expect(result.type).toBe("order");
    expect(result.wordCount).toBe(0);
  });

  it("classifies <200 word text as order", () => {
    const text = Array(150).fill("word").join(" ");
    const result = classifyOpinionType(text);
    expect(result.type).toBe("order");
    expect(result.wordCount).toBe(150);
  });

  it("classifies per curiam + affirmed <500 words as pca", () => {
    const words = Array(400).fill("word").join(" ");
    const text = "PER CURIAM. " + words + " Affirmed.";
    const result = classifyOpinionType(text);
    expect(result.type).toBe("pca");
  });

  it("classifies 500-1000 word text as memorandum", () => {
    const text = Array(700).fill("word").join(" ");
    const result = classifyOpinionType(text);
    expect(result.type).toBe("memorandum");
    expect(result.wordCount).toBe(700);
  });

  it("classifies >1000 word text with analysis as full", () => {
    const words = Array(1500).fill("word").join(" ");
    const text = words + " We hold that the defendant's rights were violated. Analysis of the evidence shows...";
    const result = classifyOpinionType(text);
    expect(result.type).toBe("full");
    expect(result.confidence).toBe("high");
  });

  it("classifies >1000 word text without analysis markers as full with medium confidence", () => {
    const text = Array(1500).fill("word").join(" ");
    const result = classifyOpinionType(text);
    expect(result.type).toBe("full");
    expect(result.confidence).toBe("medium");
  });
});

describe("getExtractionSteps", () => {
  it("full opinions run all extraction", () => {
    const steps = getExtractionSteps("full");
    expect(steps.extractCharges).toBe(true);
    expect(steps.extractMotions).toBe(true);
    expect(steps.extractTheories).toBe(true);
    expect(steps.extractOutcomes).toBe(true);
    expect(steps.extractHolding).toBe(true);
  });

  it("pca skips motions, theories, holding", () => {
    const steps = getExtractionSteps("pca");
    expect(steps.extractCharges).toBe(true);
    expect(steps.extractMotions).toBe(false);
    expect(steps.extractTheories).toBe(false);
    expect(steps.extractOutcomes).toBe(true);
    expect(steps.extractHolding).toBe(false);
  });

  it("order skips theories and holding", () => {
    const steps = getExtractionSteps("order");
    expect(steps.extractMotions).toBe(true);
    expect(steps.extractTheories).toBe(false);
    expect(steps.extractHolding).toBe(false);
  });
});

describe("OPINION_TYPE_WEIGHTS", () => {
  it("has correct weights", () => {
    expect(OPINION_TYPE_WEIGHTS.full).toBe(1.0);
    expect(OPINION_TYPE_WEIGHTS.memorandum).toBe(0.8);
    expect(OPINION_TYPE_WEIGHTS.order).toBe(0.5);
    expect(OPINION_TYPE_WEIGHTS.pca).toBe(0.3);
  });
});
