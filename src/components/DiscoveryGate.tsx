/**
 * DiscoveryGate — Interactive two-button filter for services page.
 *
 * Asks: "Have you received police reports or case documents?"
 * - YES: shows Track B tiers (X-Ray, War Room, Situation Room)
 * - NOT YET: shows Track A tiers (Playbook, Case Decoder, Intelligence Brief)
 * - Default (no selection): shows all tiers with Track A/B divider
 *
 * Per Covello Mental Noise Model: uses "police reports / case documents"
 * instead of "discovery" — crisis buyers may not know legal terminology.
 *
 * Per Dunford two-track model: Track A = pre-discovery (intake data only),
 * Track B = post-discovery (case documents required).
 */
"use client";

import { useState } from "react";

export type TrackFilter = "all" | "pre-discovery" | "post-discovery";

interface DiscoveryGateProps {
  children: (filter: TrackFilter) => React.ReactNode;
}

export function DiscoveryGate({ children }: DiscoveryGateProps) {
  const [filter, setFilter] = useState<TrackFilter>("all");

  return (
    <div>
      {/* Interactive discovery gate */}
      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm font-bold text-white">
          Have you received police reports or case documents?
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => setFilter(filter === "post-discovery" ? "all" : "post-discovery")}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              filter === "post-discovery"
                ? "bg-amber-500 text-black"
                : "border border-zinc-700 text-white hover:border-amber-500/50"
            }`}
          >
            Yes — I have documents
          </button>
          <button
            onClick={() => setFilter(filter === "pre-discovery" ? "all" : "pre-discovery")}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              filter === "pre-discovery"
                ? "bg-amber-500 text-black"
                : "border border-zinc-700 text-white hover:border-amber-500/50"
            }`}
          >
            Not yet
          </button>
        </div>
        {filter !== "all" && (
          <button
            onClick={() => setFilter("all")}
            className="mt-3 text-xs text-zinc-400 underline decoration-zinc-600 hover:text-zinc-300"
          >
            Show all services
          </button>
        )}
      </div>

      {/* Render children with current filter */}
      {children(filter)}
    </div>
  );
}

/**
 * TrackDivider — Visual separator between Track A and Track B tiers.
 * Only shown when filter is "all" (no selection made).
 */
export function TrackDivider({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="my-8 flex items-center gap-4">
      <div className="h-px flex-1 bg-amber-500/30" />
      <p className="shrink-0 text-center text-sm text-amber-400">
        Everything above works from what you tell us.
        <br />
        Everything below reads your actual case documents.
      </p>
      <div className="h-px flex-1 bg-amber-500/30" />
    </div>
  );
}
