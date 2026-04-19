/**
 * Shared name/company truncation used across partner-facing OG images
 * and bridge/checkin/court-date pages. Replaces 6 local duplicates.
 */
export function truncateName(name: string, max = 24): string {
  if (!name) return "";
  return name.length > max ? name.slice(0, max - 1) + "\u2026" : name;
}
