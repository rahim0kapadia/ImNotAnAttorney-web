/**
 * Shared formatting utilities used across partner dashboard and admin pages.
 */

/** Formats cents as a dollar string (e.g., 22473 → "$224.73"). */
export function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

/** Formats an ISO date string as "Mar 20, 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
