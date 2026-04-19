"use client";

import { useState } from "react";

export interface FunnelData {
  link_clicks: number;
  quiz_starts: number;
  quiz_completions: number;
  purchases: number;
}

export interface FunnelState {
  last_30_days: FunnelData;
  all_time: FunnelData;
}

export const EMPTY_FUNNEL: FunnelState = {
  last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
  all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
};

type TimeWindow = "last_30_days" | "all_time";

const STEPS: { key: keyof FunnelData; label: string }[] = [
  { key: "link_clicks", label: "Link Clicks" },
  { key: "quiz_starts", label: "Quiz Starts" },
  { key: "quiz_completions", label: "Quiz Completed" },
  { key: "purchases", label: "Purchases" },
];

export function ConversionFunnel({ funnel }: { funnel: FunnelState }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("last_30_days");
  const data = funnel[timeWindow];

  const isEmpty = (d: FunnelData): boolean =>
    d.link_clicks === 0 && d.quiz_starts === 0 && d.quiz_completions === 0 && d.purchases === 0;

  if (isEmpty(data) && isEmpty(funnel.all_time)) {
    return (
      <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        <h2 className="text-lg font-bold mb-4">Conversion Funnel</h2>
        <p className="text-zinc-400 text-sm">
          Conversion data will appear here as defendants use your referral link.
        </p>
      </section>
    );
  }

  // Use max of link_clicks or 1 to prevent division by zero (errata I3)
  const maxCount = Math.max(data.link_clicks, 1);

  const conversionRate = data.link_clicks > 0
    ? (data.purchases / data.link_clicks * 100).toFixed(1)
    : null;

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Conversion Funnel</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setTimeWindow("last_30_days")}
            aria-pressed={timeWindow === "last_30_days"}
            className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
              timeWindow === "last_30_days"
                ? "bg-amber-500 text-black font-bold"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setTimeWindow("all_time")}
            aria-pressed={timeWindow === "all_time"}
            className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
              timeWindow === "all_time"
                ? "bg-amber-500 text-black font-bold"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const count = data[step.key];
          const widthPct = Math.min((count / maxCount) * 100, 100);
          const prevCount = i > 0 ? data[STEPS[i - 1].key] : null;
          const dropOff = prevCount != null && prevCount > 0 && count <= prevCount
            ? `${((prevCount - count) / prevCount * 100).toFixed(0)}% drop`
            : null;

          return (
            <div key={step.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-zinc-300">{step.label}</span>
                <div className="text-right">
                  <span className="text-white font-medium">{count}</span>
                  {dropOff && (
                    <span className="text-zinc-400 text-xs ml-2">{dropOff}</span>
                  )}
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3">
                <div
                  role="meter"
                  aria-valuenow={count}
                  aria-valuemin={0}
                  aria-valuemax={data.link_clicks || count}
                  aria-label={`${step.label}: ${count}${data.link_clicks > 0 ? ` (${((count / data.link_clicks) * 100).toFixed(0)}% of link clicks)` : ""}`}
                  className="bg-amber-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(widthPct, count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm mt-4">
        <span className="text-zinc-400">Conversion rate: </span>
        <span className="text-amber-400 font-medium">
          {conversionRate ? `${conversionRate}%` : "\u2014"}
        </span>
      </p>
    </section>
  );
}
