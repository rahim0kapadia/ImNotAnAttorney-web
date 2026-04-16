/**
 * Shared helpers for scheduled check-in system.
 * Validation, ET timezone utilities, display formatting, compliance math.
 */

export const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof VALID_DAYS)[number];

const VALID_SET = new Set<string>(VALID_DAYS);

/** Validate check_in_days array: non-empty, all valid, no duplicates. */
export function validateCheckInDays(days: string[]): boolean {
  if (!days || days.length === 0) return false;
  const seen = new Set<string>();
  for (const d of days) {
    if (!VALID_SET.has(d) || seen.has(d)) return false;
    seen.add(d);
  }
  return true;
}

/** Get 3-letter lowercase day-of-week in America/New_York timezone. */
export function getETDow(now?: Date): string {
  return (now ?? new Date())
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })
    .toLowerCase()
    .slice(0, 3);
}

/** Get ISO date string (YYYY-MM-DD) in America/New_York timezone. */
export function getETDate(now?: Date): string {
  return (now ?? new Date()).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Convert an ET date string to midnight ET expressed as a UTC Date.
 *
 * Probes at 05:00 UTC, which is always midnight-1am ET, before the 2am DST
 * transition point. This ensures the offset reflects midnight's timezone, not a
 * post-transition timezone. Works correctly on spring-forward and fall-back dates.
 */
export function getETMidnightUTC(etDateStr: string): Date {
  const probeUTC = new Date(etDateStr + "T05:00:00Z");
  const etHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(probeUTC),
    10
  );
  // 05:00 UTC in EST → 00:00 ET (hour=0) → offset=5
  // 05:00 UTC in EDT → 01:00 ET (hour=1) → offset=4
  const offsetHours = 5 - etHour;
  const pad = String(offsetHours).padStart(2, "0");
  return new Date(`${etDateStr}T${pad}:00:00.000Z`);
}

/** Format check_in_days for display: ["mon","fri"] -> "Mon, Fri" */
export function formatDaysDisplay(days: string[] | null): string {
  if (!days || days.length === 0) return "";
  return days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
}

/**
 * Count scheduled check-in days between two dates (inclusive).
 * O(1) arithmetic, full weeks × days/week + remainder scan (max 6 iterations).
 */
export function countScheduledDays(
  checkInDays: string[] | null,
  startDate: string,
  endDate: string
): number {
  if (!checkInDays || checkInDays.length === 0) return 0;
  const daysSet = new Set(checkInDays);
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (totalDays <= 0) return 0;

  const fullWeeks = Math.floor(totalDays / 7);
  const remainder = totalDays % 7;
  let count = fullWeeks * checkInDays.length;

  // getUTCDay() is equivalent here, T12:00:00Z anchor means
  // UTC day always matches ET calendar day (noon UTC = 7-8am ET).
  const DOW_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const startIdx = start.getUTCDay();

  for (let i = 0; i < remainder; i++) {
    if (daysSet.has(DOW_MAP[(startIdx + i) % 7])) count++;
  }

  return count;
}

/** Sort check_in_days to canonical order (mon-sun) for consistent display. */
export function sortCheckInDays(days: string[]): string[] {
  return [...days].sort((a, b) =>
    VALID_DAYS.indexOf(a as DayOfWeek) - VALID_DAYS.indexOf(b as DayOfWeek)
  );
}
