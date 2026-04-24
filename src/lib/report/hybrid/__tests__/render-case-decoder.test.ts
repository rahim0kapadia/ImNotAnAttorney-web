/**
 * Unit tests for the hybrid CD orchestrator.
 *
 * vi.mock stubs callHaiku so the orchestrator spins without hitting
 * the Anthropic API. Tests cover: fulfilled path (all slots filled +
 * non-zero cost), rejected path (all slots fall back + cost zero),
 * mixed path (partial fulfillment), invariant check (no leftover
 * slot markers in final HTML).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type HaikuBehavior =
  | { kind: "ok"; text: string; costUsd: number }
  | { kind: "empty" }
  | { kind: "error"; message: string };

let nextBehaviors: HaikuBehavior[] = [];

vi.mock("../haiku-client", () => ({
  callHaiku: vi.fn(async () => {
    const b = nextBehaviors.shift() ?? { kind: "ok", text: "default", costUsd: 0.001 };
    if (b.kind === "ok") return { text: b.text, inputTokens: 100, outputTokens: 50, costUsd: b.costUsd };
    if (b.kind === "empty") return { text: "", inputTokens: 0, outputTokens: 0, costUsd: 0 };
    throw new Error(b.message);
  }),
}));

import { renderCaseDecoderHybrid } from "../render-case-decoder";
import { listSlotMarkers } from "../../mechanical/common";
import { CASE_DECODER_SLOTS } from "../case-decoder-sections";

const baseIntake = {
  first_name: "Alex",
  charge_type: "DUI",
  state: "FL",
  jurisdiction_level: "County",
  arrest_date: "2026-03-01",
  court_date: "2026-05-15",
  plea_offered: null,
  co_defendants: null,
  filled_out_by: null,
  situation: null,
  specific_question: null,
};

describe("renderCaseDecoderHybrid", () => {
  beforeEach(() => {
    nextBehaviors = [];
  });

  it("fills every slot when all Haiku calls succeed", async () => {
    for (let i = 0; i < CASE_DECODER_SLOTS.length; i++) {
      nextBehaviors.push({ kind: "ok", text: `<p>slot ${i} ok</p>`, costUsd: 0.002 });
    }
    const r = await renderCaseDecoderHybrid(baseIntake, "fake-key");
    expect(listSlotMarkers(r.html)).toEqual([]);
    expect(r.slotsFulfilled).toHaveLength(CASE_DECODER_SLOTS.length);
    expect(r.slotsFallback).toHaveLength(0);
    expect(r.costUsd).toBeCloseTo(0.002 * CASE_DECODER_SLOTS.length, 5);
  });

  it("falls back when all Haiku calls fail", async () => {
    for (let i = 0; i < CASE_DECODER_SLOTS.length; i++) {
      nextBehaviors.push({ kind: "error", message: "boom" });
    }
    const r = await renderCaseDecoderHybrid(baseIntake, "fake-key");
    expect(listSlotMarkers(r.html)).toEqual([]);
    expect(r.slotsFulfilled).toHaveLength(0);
    expect(r.slotsFallback).toHaveLength(CASE_DECODER_SLOTS.length);
    expect(r.costUsd).toBe(0);
  });

  it("falls back when Haiku returns empty text", async () => {
    for (let i = 0; i < CASE_DECODER_SLOTS.length; i++) {
      nextBehaviors.push({ kind: "empty" });
    }
    const r = await renderCaseDecoderHybrid(baseIntake, "fake-key");
    expect(listSlotMarkers(r.html)).toEqual([]);
    expect(r.slotsFallback).toHaveLength(CASE_DECODER_SLOTS.length);
  });

  it("partial fulfillment: invariant still holds", async () => {
    for (let i = 0; i < CASE_DECODER_SLOTS.length; i++) {
      nextBehaviors.push(
        i % 2 === 0
          ? { kind: "ok", text: `<p>ok ${i}</p>`, costUsd: 0.001 }
          : { kind: "error", message: "boom" },
      );
    }
    const r = await renderCaseDecoderHybrid(baseIntake, "fake-key");
    expect(listSlotMarkers(r.html)).toEqual([]);
    expect(r.slotsFulfilled.length + r.slotsFallback.length).toBe(
      CASE_DECODER_SLOTS.length,
    );
  });
});
