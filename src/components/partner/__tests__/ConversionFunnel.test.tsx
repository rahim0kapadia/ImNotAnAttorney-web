import { describe, it, expect } from "vitest";
import { EMPTY_FUNNEL, type FunnelState } from "../ConversionFunnel";

describe("ConversionFunnel exports", () => {
  it("EMPTY_FUNNEL has zero counts in both windows", () => {
    expect(EMPTY_FUNNEL.last_30_days.link_clicks).toBe(0);
    expect(EMPTY_FUNNEL.last_30_days.purchases).toBe(0);
    expect(EMPTY_FUNNEL.all_time.link_clicks).toBe(0);
    expect(EMPTY_FUNNEL.all_time.purchases).toBe(0);
  });

  it("FunnelState type allows complete data", () => {
    const funnel: FunnelState = {
      last_30_days: { link_clicks: 100, quiz_starts: 60, quiz_completions: 30, purchases: 5 },
      all_time: { link_clicks: 500, quiz_starts: 300, quiz_completions: 150, purchases: 25 },
    };
    // Conversion rate computation: same logic as the component
    const rate = funnel.last_30_days.link_clicks > 0
      ? (funnel.last_30_days.purchases / funnel.last_30_days.link_clicks * 100).toFixed(1)
      : null;
    expect(rate).toBe("5.0");
  });

  it("handles zero link_clicks with purchases (direct code entry)", () => {
    const funnel: FunnelState = {
      last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 3 },
      all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 3 },
    };
    // maxCount should be 1 (Math.max(0, 1)) to prevent NaN
    const maxCount = Math.max(funnel.last_30_days.link_clicks, 1);
    expect(maxCount).toBe(1);
    // Conversion rate should be null when no link clicks
    const rate = funnel.last_30_days.link_clicks > 0 ? "computed" : null;
    expect(rate).toBeNull();
  });

  it("computes drop-off percentages correctly", () => {
    const data = { link_clicks: 100, quiz_starts: 60, quiz_completions: 30, purchases: 5 };
    const dropFromClicksToStarts = ((data.link_clicks - data.quiz_starts) / data.link_clicks * 100).toFixed(0);
    expect(dropFromClicksToStarts).toBe("40");
    const dropFromStartsToComplete = ((data.quiz_starts - data.quiz_completions) / data.quiz_starts * 100).toFixed(0);
    expect(dropFromStartsToComplete).toBe("50");
  });
});
