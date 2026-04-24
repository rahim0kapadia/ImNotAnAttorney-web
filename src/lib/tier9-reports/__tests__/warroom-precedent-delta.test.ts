/**
 * Unit tests for War Room $4,997 per-case monthly precedent-delta module (E3).
 *
 * Coverage targets:
 *   - detectSignificantShift: baseline, no-change, new-entry, rank-shift, exits
 *   - cadenceAllowsSend: fresh, stale, boundary
 *   - buildSnapshot: deterministic, rank-stable
 *   - UPL_BANNED_PHRASES: canonical blocklist present
 *   - isSafeHttpsUrl: https only, no javascript:/data:
 */
import { describe, it, expect } from "vitest";
import {
  detectSignificantShift,
  cadenceAllowsSend,
  buildSnapshot,
  isSafeHttpsUrl,
  UPL_BANNED_PHRASES,
  RANK_DELTA_THRESHOLD,
  MIN_CADENCE_DAYS,
  RISING_TOP_N,
  FALLING_TOP_N,
  type SnapshotEntry,
  type DeltaRow,
} from "../warroom-precedent-delta";

function mkSnap(entries: Array<[number, number, number]>): SnapshotEntry[] {
  // [cited_opinion_id, velocity, rank]
  return entries.map(([id, vel, rank]) => ({ cited_opinion_id: id, velocity: vel, rank }));
}

function mkDeltaRow(over: Partial<DeltaRow> = {}): DeltaRow {
  return {
    cited_opinion_id: 3185469,
    cluster_id: 3185469,
    case_name: "State v. Marcum",
    jurisdiction: "F",
    date_filed: "2015-03-14",
    citation_count: 552,
    velocity: 55.2,
    velocity_tier: "rising",
    source_url: "https://www.courtlistener.com/opinion/3185469/state-v-marcum",
    direction: "up",
    rank: 1,
    ...over,
  };
}

describe("detectSignificantShift", () => {
  it("returns baseline when prior snapshot is null", () => {
    const newSnap = mkSnap([[1, 10, 1], [2, 8, 2]]);
    const r = detectSignificantShift(null, newSnap);
    expect(r.isBaseline).toBe(true);
    expect(r.shouldSend).toBe(true);
    expect(r.newEntries).toHaveLength(2);
    expect(r.shifts).toHaveLength(0);
    expect(r.exits).toHaveLength(0);
  });

  it("returns baseline when prior snapshot is empty array", () => {
    const r = detectSignificantShift([], mkSnap([[1, 10, 1]]));
    expect(r.isBaseline).toBe(true);
    expect(r.shouldSend).toBe(true);
  });

  it("shouldSend=false when nothing changed", () => {
    const snap = mkSnap([[1, 10, 1], [2, 8, 2], [3, 6, 3]]);
    const r = detectSignificantShift(snap, snap);
    expect(r.isBaseline).toBe(false);
    expect(r.shouldSend).toBe(false);
    expect(r.newEntries).toHaveLength(0);
    expect(r.shifts).toHaveLength(0);
  });

  it("shouldSend=true when a new entry enters top-N", () => {
    const old = mkSnap([[1, 10, 1], [2, 8, 2]]);
    const neu = mkSnap([[1, 10, 1], [99, 9, 2], [2, 8, 3]]);
    const r = detectSignificantShift(old, neu);
    expect(r.shouldSend).toBe(true);
    expect(r.newEntries.map((e) => e.cited_opinion_id)).toContain(99);
  });

  it("shouldSend=true when rank shifts >= threshold", () => {
    const old = mkSnap([[1, 10, 1], [2, 8, 5]]);
    const neu = mkSnap([[1, 10, 1], [2, 12, 2]]);
    const r = detectSignificantShift(old, neu);
    expect(r.shouldSend).toBe(true);
    expect(r.shifts.map((s) => s.cited_opinion_id)).toContain(2);
    const shift = r.shifts.find((s) => s.cited_opinion_id === 2)!;
    expect(shift.oldRank).toBe(5);
    expect(shift.newRank).toBe(2);
  });

  it("shouldSend=false when rank shifts below threshold", () => {
    // RANK_DELTA_THRESHOLD is 3, so a 2-position shift should NOT trigger.
    expect(RANK_DELTA_THRESHOLD).toBeGreaterThanOrEqual(3);
    const old = mkSnap([[1, 10, 1], [2, 8, 3]]);
    const neu = mkSnap([[1, 10, 1], [2, 9, 2]]);
    const r = detectSignificantShift(old, neu);
    expect(r.shouldSend).toBe(false);
  });

  it("lists exits when old entries dropped out of new snapshot", () => {
    const old = mkSnap([[1, 10, 1], [2, 8, 2], [3, 6, 3]]);
    const neu = mkSnap([[1, 10, 1], [2, 8, 2]]);
    const r = detectSignificantShift(old, neu);
    expect(r.exits.map((e) => e.cited_opinion_id)).toEqual([3]);
  });

  it("baseline flag does NOT fire when prior snapshot has entries", () => {
    const r = detectSignificantShift(mkSnap([[1, 10, 1]]), mkSnap([[1, 10, 1]]));
    expect(r.isBaseline).toBe(false);
  });
});

describe("cadenceAllowsSend", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");

  it("allows when last_sent_at is null", () => {
    expect(cadenceAllowsSend(null, now)).toBe(true);
  });

  it("allows when last_sent_at is undefined", () => {
    expect(cadenceAllowsSend(undefined, now)).toBe(true);
  });

  it("denies when last send was 1 day ago", () => {
    const oneDayAgo = new Date(now - 86_400_000).toISOString();
    expect(cadenceAllowsSend(oneDayAgo, now)).toBe(false);
  });

  it("denies exactly at boundary (MIN_CADENCE_DAYS - 1 hour)", () => {
    const justUnder = new Date(now - (MIN_CADENCE_DAYS * 86_400_000) + 3_600_000).toISOString();
    expect(cadenceAllowsSend(justUnder, now)).toBe(false);
  });

  it("allows when last send was MIN_CADENCE_DAYS ago", () => {
    const atBoundary = new Date(now - MIN_CADENCE_DAYS * 86_400_000).toISOString();
    expect(cadenceAllowsSend(atBoundary, now)).toBe(true);
  });

  it("allows when last send was 60 days ago", () => {
    const longAgo = new Date(now - 60 * 86_400_000).toISOString();
    expect(cadenceAllowsSend(longAgo, now)).toBe(true);
  });

  it("allows when last_sent_at is unparseable (fail-open to send)", () => {
    expect(cadenceAllowsSend("garbage", now)).toBe(true);
  });
});

describe("buildSnapshot", () => {
  it("reduces rising rows to (id, velocity, rank) triples", () => {
    const rising: DeltaRow[] = [
      mkDeltaRow({ cited_opinion_id: 100, velocity: 40, rank: 1 }),
      mkDeltaRow({ cited_opinion_id: 200, velocity: 30, rank: 2 }),
      mkDeltaRow({ cited_opinion_id: 300, velocity: 20, rank: 3 }),
    ];
    const snap = buildSnapshot(rising);
    expect(snap).toHaveLength(3);
    expect(snap[0]).toEqual({ cited_opinion_id: 100, velocity: 40, rank: 1 });
    expect(snap[2]).toEqual({ cited_opinion_id: 300, velocity: 20, rank: 3 });
  });

  it("returns empty array on empty input", () => {
    expect(buildSnapshot([])).toEqual([]);
  });

  it("is deterministic across calls", () => {
    const rising = [mkDeltaRow({ cited_opinion_id: 42, velocity: 12.5, rank: 1 })];
    const a = JSON.stringify(buildSnapshot(rising));
    const b = JSON.stringify(buildSnapshot(rising));
    expect(a).toBe(b);
  });
});

describe("UPL_BANNED_PHRASES", () => {
  it("contains the canonical crisis-buyer UPL triggers", () => {
    expect(UPL_BANNED_PHRASES).toContain("you should");
    expect(UPL_BANNED_PHRASES).toContain("we recommend");
    expect(UPL_BANNED_PHRASES).toContain("we advise");
    expect(UPL_BANNED_PHRASES).toContain("ask your attorney");
    expect(UPL_BANNED_PHRASES).toContain("consult your attorney");
    expect(UPL_BANNED_PHRASES).toContain("publicly available");
    expect(UPL_BANNED_PHRASES).toContain("your best option");
  });
});

describe("isSafeHttpsUrl", () => {
  it("accepts https URLs", () => {
    expect(isSafeHttpsUrl("https://www.courtlistener.com/opinion/1")).toBe(true);
    expect(isSafeHttpsUrl("HTTPS://example.com")).toBe(true);
  });

  it("rejects http (plain) URLs", () => {
    expect(isSafeHttpsUrl("http://example.com")).toBe(false);
  });

  it("rejects javascript:/data:/file: schemes", () => {
    expect(isSafeHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpsUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpsUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects null / undefined / empty", () => {
    expect(isSafeHttpsUrl(null)).toBe(false);
    expect(isSafeHttpsUrl(undefined)).toBe(false);
    expect(isSafeHttpsUrl("")).toBe(false);
  });

  it("trims whitespace before checking", () => {
    expect(isSafeHttpsUrl("   https://example.com   ")).toBe(true);
  });
});

describe("Tier constants sanity", () => {
  it("RISING_TOP_N exceeds FALLING_TOP_N (rising is the primary delta surface)", () => {
    expect(RISING_TOP_N).toBeGreaterThan(FALLING_TOP_N);
  });

  it("MIN_CADENCE_DAYS sits in the 27-31 day monthly window", () => {
    expect(MIN_CADENCE_DAYS).toBeGreaterThanOrEqual(27);
    expect(MIN_CADENCE_DAYS).toBeLessThanOrEqual(31);
  });

  it("RANK_DELTA_THRESHOLD is at least 3 (Chaperon trust-engine: only-when-changed)", () => {
    expect(RANK_DELTA_THRESHOLD).toBeGreaterThanOrEqual(3);
  });
});
