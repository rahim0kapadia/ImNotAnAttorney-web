import { describe, it, expect } from "vitest";
import {
  VALID_DAYS,
  validateCheckInDays,
  getETDow,
  getETDate,
  getETMidnightUTC,
  formatDaysDisplay,
  countScheduledDays,
  sortCheckInDays,
} from "../check-in-schedule";

describe("validateCheckInDays", () => {
  it("accepts valid days", () => {
    expect(validateCheckInDays(["mon", "fri"])).toBe(true);
    expect(validateCheckInDays(["sun"])).toBe(true);
  });

  it("accepts all 7 days", () => {
    expect(validateCheckInDays(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(validateCheckInDays(["monday"])).toBe(false);
    expect(validateCheckInDays([""])).toBe(false);
    expect(validateCheckInDays(["mon", "invalid"])).toBe(false);
  });

  it("rejects empty array", () => {
    expect(validateCheckInDays([])).toBe(false);
  });

  it("rejects duplicates", () => {
    expect(validateCheckInDays(["mon", "mon"])).toBe(false);
  });
});

describe("getETDow", () => {
  it("returns lowercase 3-letter day", () => {
    const dow = getETDow(new Date("2026-04-14T13:00:00Z"));
    expect(dow).toBe("tue");
    expect(VALID_DAYS).toContain(dow);
  });
});

describe("getETDate", () => {
  it("returns ISO date in ET", () => {
    const date = getETDate(new Date("2026-04-15T03:00:00Z"));
    expect(date).toBe("2026-04-14");
  });
});

describe("getETMidnightUTC", () => {
  it("converts EDT midnight to UTC", () => {
    const utc = getETMidnightUTC("2026-04-14");
    expect(utc.toISOString()).toBe("2026-04-14T04:00:00.000Z");
  });

  it("converts EST midnight to UTC", () => {
    const utc = getETMidnightUTC("2026-01-15");
    expect(utc.toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });

  it("handles spring-forward DST transition", () => {
    const utc = getETMidnightUTC("2026-03-08");
    expect(utc.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("handles fall-back DST transition", () => {
    const utc = getETMidnightUTC("2026-11-01");
    expect(utc.toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });
});

describe("formatDaysDisplay", () => {
  it("formats days for display", () => {
    expect(formatDaysDisplay(["mon", "fri"])).toBe("Mon, Fri");
    expect(formatDaysDisplay(["sun"])).toBe("Sun");
  });

  it("returns empty string for null", () => {
    expect(formatDaysDisplay(null)).toBe("");
  });
});

describe("countScheduledDays", () => {
  it("counts matching weekdays in range", () => {
    const count = countScheduledDays(["mon", "wed", "fri"], "2026-04-13", "2026-04-17");
    expect(count).toBe(3);
  });

  it("handles single-day range", () => {
    expect(countScheduledDays(["tue"], "2026-04-14", "2026-04-14")).toBe(1);
    expect(countScheduledDays(["mon"], "2026-04-14", "2026-04-14")).toBe(0);
  });

  it("handles multi-week range", () => {
    expect(countScheduledDays(["mon", "fri"], "2026-04-13", "2026-04-26")).toBe(4);
  });

  it("returns 0 for null days", () => {
    expect(countScheduledDays(null, "2026-04-13", "2026-04-17")).toBe(0);
  });
});

describe("sortCheckInDays", () => {
  it("sorts to canonical mon-sun order", () => {
    expect(sortCheckInDays(["fri", "mon", "wed"])).toEqual(["mon", "wed", "fri"]);
  });

  it("handles already-sorted input", () => {
    expect(sortCheckInDays(["mon", "fri"])).toEqual(["mon", "fri"]);
  });
});
