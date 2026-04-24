import { describe, it, expect } from "vitest";
import {
  getMotionChargesForOffguide,
  USSC_OFFGUIDE_TO_CHARGE_MAP,
  MOR_CHARGE_EXPANSION,
} from "../ussc-offguide-charge-map";
import {
  aggregateTopMotions,
  buildUnmappedContext,
  queryMotionContext,
  MOTION_CONTEXT_UPL_BANNED,
  type MotionContext,
} from "../ussc-similar-cases-motion-context";

describe("USSC offguide -> MOR charge bridge", () => {
  describe("USSC_OFFGUIDE_TO_CHARGE_MAP", () => {
    it("covers all 29 distinct offguide values observed in matview", () => {
      const observed = [
        "1", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19",
        "2", "21", "22", "23", "24", "25", "26", "27", "28", "29",
        "3", "30", "4", "5", "6", "7", "9", "UNK",
      ];
      for (const code of observed) {
        expect(code in USSC_OFFGUIDE_TO_CHARGE_MAP).toBe(true);
      }
    });

    it("maps exactly 14 of 29 observed codes to MOR slugs (best-effort coverage)", () => {
      // 29 distinct offguide values observed in ussc_similar_cases_summary
      // (note: 20=Manslaughter is NOT in the observed set, so canonical "20"
      // mapping exists in USSC_OFFGUIDE_TO_CHARGE_MAP but doesn't count here).
      const observed = [
        "1", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19",
        "2", "21", "22", "23", "24", "25", "26", "27", "28", "29",
        "3", "30", "4", "5", "6", "7", "9", "UNK",
      ];
      const mapped = observed.filter((c) => USSC_OFFGUIDE_TO_CHARGE_MAP[c] !== null);
      // Mapped: 1, 4, 7, 9, 10, 13, 15, 16, 21, 25, 26, 27, 29, 30 = 14
      expect(mapped.length).toBe(14);
    });

    it("every non-null canonical slug has an MOR_CHARGE_EXPANSION entry", () => {
      for (const [code, canonical] of Object.entries(USSC_OFFGUIDE_TO_CHARGE_MAP)) {
        if (canonical === null) continue;
        expect(MOR_CHARGE_EXPANSION[canonical]).toBeDefined();
        expect(MOR_CHARGE_EXPANSION[canonical].length).toBeGreaterThan(0);
      }
    });

    it("maps drug-trafficking offguide 10 to drug-trafficking cluster", () => {
      const result = getMotionChargesForOffguide("10");
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe("drug-trafficking");
      expect(result!.charges).toContain("drug-trafficking");
      expect(result!.charges).toContain("drug-distribution");
    });

    it("maps fraud offguide 16 to fraud-general cluster (includes embezzlement)", () => {
      const result = getMotionChargesForOffguide("16");
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe("fraud-general");
      expect(result!.charges).toContain("fraud-general");
      expect(result!.charges).toContain("embezzlement");
    });

    it("maps firearms offguide 13 to weapons-possession cluster", () => {
      const result = getMotionChargesForOffguide("13");
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe("weapons-possession");
      expect(result!.charges).toContain("felon-in-possession");
    });
  });

  describe("null / unmapped handling", () => {
    it("returns null for unmapped immigration (17)", () => {
      expect(getMotionChargesForOffguide("17")).toBeNull();
    });

    it("returns null for UNK", () => {
      expect(getMotionChargesForOffguide("UNK")).toBeNull();
    });

    it("returns null for null / undefined / empty", () => {
      expect(getMotionChargesForOffguide(null)).toBeNull();
      expect(getMotionChargesForOffguide(undefined)).toBeNull();
      expect(getMotionChargesForOffguide("")).toBeNull();
    });

    it("returns null for non-numeric garbage", () => {
      expect(getMotionChargesForOffguide("not-a-code")).toBeNull();
    });
  });
});

describe("aggregateTopMotions", () => {
  it("aggregates filed/granted across cluster members, caps at top 3", () => {
    const rows = [
      { motion_type: "suppress", charge_type: "drug-trafficking", filed_count: 100, granted_count: 20, denied_count: 80, grant_rate: 0.2 },
      { motion_type: "suppress", charge_type: "drug-distribution", filed_count: 50, granted_count: 15, denied_count: 35, grant_rate: 0.3 },
      { motion_type: "dismiss", charge_type: "drug-trafficking", filed_count: 80, granted_count: 10, denied_count: 70, grant_rate: 0.125 },
      { motion_type: "sever", charge_type: "drug-trafficking", filed_count: 40, granted_count: 5, denied_count: 35, grant_rate: 0.125 },
      { motion_type: "franks", charge_type: "drug-trafficking", filed_count: 10, granted_count: 1, denied_count: 9, grant_rate: 0.1 },
    ];
    const top = aggregateTopMotions(rows);
    expect(top.length).toBe(3);
    expect(top[0].motion_type).toBe("suppress");
    expect(top[0].n_filed).toBe(150);
    expect(top[0].n_granted).toBe(35);
    expect(top[0].grant_rate).toBe(Number((35 / 150).toFixed(4)));
    expect(top[1].motion_type).toBe("dismiss");
    expect(top[2].motion_type).toBe("sever");
  });

  it("breaks n_filed ties alphabetically on motion_type", () => {
    const rows = [
      { motion_type: "zebra", charge_type: "x", filed_count: 100, granted_count: 10, denied_count: 90, grant_rate: 0.1 },
      { motion_type: "alpha", charge_type: "x", filed_count: 100, granted_count: 10, denied_count: 90, grant_rate: 0.1 },
      { motion_type: "mango", charge_type: "x", filed_count: 100, granted_count: 10, denied_count: 90, grant_rate: 0.1 },
    ];
    const top = aggregateTopMotions(rows);
    expect(top.map((m) => m.motion_type)).toEqual(["alpha", "mango", "zebra"]);
  });

  it("returns empty array when rows empty", () => {
    expect(aggregateTopMotions([])).toEqual([]);
  });

  it("filters rows with filed_count=0 out of results", () => {
    const rows = [
      { motion_type: "zero", charge_type: "x", filed_count: 0, granted_count: 0, denied_count: 0, grant_rate: null },
      { motion_type: "real", charge_type: "x", filed_count: 5, granted_count: 1, denied_count: 4, grant_rate: 0.2 },
    ];
    const top = aggregateTopMotions(rows);
    expect(top.length).toBe(1);
    expect(top[0].motion_type).toBe("real");
  });

  it("handles missing/NaN filed/granted counts safely", () => {
    const rows = [
      { motion_type: "ok", charge_type: "x", filed_count: 10, granted_count: 2, denied_count: 8, grant_rate: 0.2 },
      // deliberately malformed - simulate DB returning null
      { motion_type: "bad", charge_type: "x", filed_count: NaN, granted_count: NaN, denied_count: 0, grant_rate: null } as any,
    ];
    const top = aggregateTopMotions(rows as any);
    expect(top.length).toBe(1);
    expect(top[0].motion_type).toBe("ok");
  });

  it("grant_rate rounds to 4 decimal places", () => {
    const rows = [
      { motion_type: "m", charge_type: "x", filed_count: 3, granted_count: 1, denied_count: 2, grant_rate: 0.3333 },
    ];
    const top = aggregateTopMotions(rows);
    expect(top[0].grant_rate).toBe(0.3333);
  });
});

describe("buildUnmappedContext", () => {
  it("has the required MotionContext shape with null mapping", () => {
    const ctx: MotionContext = buildUnmappedContext();
    expect(ctx.offguide_mapped_charge).toBeNull();
    expect(ctx.top_motions).toEqual([]);
    expect(typeof ctx.data_caveat).toBe("string");
    expect(ctx.data_caveat.length).toBeGreaterThan(0);
    expect(ctx.upgrade_cta_slug).toBe("motion-success-report");
  });

  it("caveat is UPL-clean", () => {
    const ctx = buildUnmappedContext();
    for (const banned of MOTION_CONTEXT_UPL_BANNED) {
      expect(ctx.data_caveat.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("queryMotionContext (mocked SupabaseClient)", () => {
  function makeMockSb(rows: unknown[], error: Error | null = null) {
    return {
      from() {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: rows, error });
              },
            };
          },
        };
      },
    } as any;
  }

  it("returns unmapped-shape for null offguide without hitting DB", async () => {
    let called = false;
    const sb = {
      from() {
        called = true;
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      },
    } as any;
    const ctx = await queryMotionContext(sb, null);
    expect(ctx.offguide_mapped_charge).toBeNull();
    expect(ctx.top_motions).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns unmapped-shape for unmapped code 17 (immigration)", async () => {
    const sb = makeMockSb([]);
    const ctx = await queryMotionContext(sb, "17");
    expect(ctx.offguide_mapped_charge).toBeNull();
    expect(ctx.top_motions).toEqual([]);
  });

  it("returns top 3 sorted by filed desc for mapped offguide 10 (drug-trafficking)", async () => {
    const sb = makeMockSb([
      { motion_type: "suppress", charge_type: "drug-trafficking", filed_count: 500, granted_count: 100, denied_count: 400, grant_rate: 0.2 },
      { motion_type: "dismiss", charge_type: "drug-trafficking", filed_count: 300, granted_count: 30, denied_count: 270, grant_rate: 0.1 },
      { motion_type: "sever", charge_type: "drug-trafficking", filed_count: 100, granted_count: 10, denied_count: 90, grant_rate: 0.1 },
      { motion_type: "franks", charge_type: "drug-trafficking", filed_count: 50, granted_count: 5, denied_count: 45, grant_rate: 0.1 },
    ]);
    const ctx = await queryMotionContext(sb, "10");
    expect(ctx.offguide_mapped_charge).toBe("drug-trafficking");
    expect(ctx.top_motions.length).toBe(3);
    expect(ctx.top_motions[0].motion_type).toBe("suppress");
    expect(ctx.top_motions[0].n_filed).toBe(500);
    expect(ctx.upgrade_cta_slug).toBe("motion-success-report");
  });

  it("enforces top-3 cap even when DB returns 10 rows", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      motion_type: `motion-${i}`,
      charge_type: "drug-trafficking",
      filed_count: 100 - i,
      granted_count: 10,
      denied_count: 90 - i,
      grant_rate: 0.1,
    }));
    const sb = makeMockSb(rows);
    const ctx = await queryMotionContext(sb, "10");
    expect(ctx.top_motions.length).toBe(3);
  });

  it("returns unmapped-shape with canonical set when mapping OK but no rows", async () => {
    const sb = makeMockSb([]);
    const ctx = await queryMotionContext(sb, "10");
    expect(ctx.offguide_mapped_charge).toBe("drug-trafficking");
    expect(ctx.top_motions).toEqual([]);
  });

  it("degrades gracefully on DB error (no throw)", async () => {
    const sb = makeMockSb([], new Error("connection reset"));
    const ctx = await queryMotionContext(sb, "10");
    expect(ctx.offguide_mapped_charge).toBeNull();
    expect(ctx.top_motions).toEqual([]);
  });

  it("data_caveat for mapped responses is UPL-clean", async () => {
    const sb = makeMockSb([
      { motion_type: "suppress", charge_type: "drug-trafficking", filed_count: 5, granted_count: 1, denied_count: 4, grant_rate: 0.2 },
    ]);
    const ctx = await queryMotionContext(sb, "10");
    for (const banned of MOTION_CONTEXT_UPL_BANNED) {
      expect(ctx.data_caveat.toLowerCase()).not.toContain(banned);
    }
  });

  it("data_caveat for unmapped responses is UPL-clean", async () => {
    const sb = makeMockSb([]);
    const ctx = await queryMotionContext(sb, "17");
    for (const banned of MOTION_CONTEXT_UPL_BANNED) {
      expect(ctx.data_caveat.toLowerCase()).not.toContain(banned);
    }
  });
});
