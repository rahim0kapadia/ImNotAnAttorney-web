/**
 * Shared status badge component used across operator and customer-facing pages.
 * Unified from 5 context-specific definitions to handle all status values.
 */

const STATUS_STYLES: Record<string, string> = {
  // Green — success / complete states
  delivered: "bg-green-500/10 text-green-400 border border-green-500/20",
  completed: "bg-green-500/10 text-green-400 border border-green-500/20",
  verified: "bg-green-500/10 text-green-400 border border-green-500/20",
  paid: "bg-green-500/10 text-green-400 border border-green-500/20",
  // Teal — ongoing monitoring (War Room weekly updates)
  monitoring: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  // Amber — in-progress / pipeline phases
  review: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  processing: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  generating: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  "auto-generating": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  compiling: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  in_progress: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  running: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  queued: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  // Purple — deep engine pipeline phases (X-Ray+)
  intelligence: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  strategy: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  packaging: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  // Blue — intake / pending states
  intake: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "awaiting-intake": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  pending: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  uploaded: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  submitted: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  // Red — error / terminal states
  failed: "bg-red-500/10 text-red-400 border border-red-500/20",
  "generation-failed": "bg-red-500/10 text-red-400 border border-red-500/20",
  refunded: "bg-red-500/10 text-red-400 border border-red-500/20",
  cancelled: "bg-red-500/10 text-red-400 border border-red-500/20",
};

const DEFAULT_STYLE = "bg-zinc-800 text-zinc-400 border border-zinc-700";

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
