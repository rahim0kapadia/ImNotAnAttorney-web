/**
 * ServicesFilteredContent — Client wrapper that reads DiscoveryGate filter via context.
 *
 * Replaces the render-prop pattern that caused a RSC violation (functions cannot
 * be passed to client components). The filter state lives in DiscoveryGate's context;
 * this component reads it and conditionally renders Track A / Track B content.
 */
"use client";

import { useDiscoveryFilter } from "@/components/DiscoveryGate";

/** Wraps content that should only show for pre-discovery (Track A). */
export function TrackA({ children }: { children: React.ReactNode }) {
  const filter = useDiscoveryFilter();
  if (filter === "post-discovery") return null;
  return <>{children}</>;
}

/** Wraps content that should only show for post-discovery (Track B). */
export function TrackB({ children }: { children: React.ReactNode }) {
  const filter = useDiscoveryFilter();
  if (filter === "pre-discovery") return null;
  return <>{children}</>;
}

/** TrackDivider that reads filter from context (no prop needed). */
export function FilteredTrackDivider() {
  const filter = useDiscoveryFilter();
  if (filter !== "all") return null;

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
