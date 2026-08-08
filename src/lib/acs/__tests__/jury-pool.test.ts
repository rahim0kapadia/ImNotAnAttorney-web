/**
 * Unit tests for ACS Jury-Pool Snapshot helper (TICKET-18, IB $997).
 *
 * Test surfaces (per ticket acceptance):
 *   1. Helper test — getJuryPoolSnapshot returns composition + 5 questions
 *      against an injected mock client.
 *   2. UPL parity — the frozen voir-dire-question catalog and fallback
 *      catalog never contain CANONICAL_BANNED_PHRASES (case-insensitive).
 *   3. Coverage gate — when ACS coverage < COVERAGE_FLOOR (0.7), the
 *      helper returns null with reason 'low-coverage'.
 *   4. Voir-dire-question shape — every selected question ends with "?".
 *
 * Pattern mirrors src/lib/ib-appendices/__tests__/live-authority-map.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  getJuryPoolSnapshot,
  queryJuryPoolSnapshot,
  computeCoverage,
  pickVoirDireQuestions,
  buildDeltaSet,
  weightedAverage,
  isValidFips,
  renderVoirDireFramework,
  CANONICAL_BANNED_PHRASES,
  COVERAGE_FLOOR,
  ACS_SOURCE_URL,
  type CountyComposition,
  type ReferenceMedians,
  type SupabaseLike,
} from "../jury-pool";

// ============================================================
// Fixtures
// ============================================================

function pinellasComposition(over: Partial<CountyComposition> = {}): CountyComposition {
  return {
    geoid: "12103",
    state_fips: "12",
    county_fips: "103",
    county_name: "Pinellas County",
    state_name: "Florida",
    total_pop: 959107,
    pop_18_plus: 800000,
    median_age: 47.2,
    pct_white_nh: 73.5,
    pct_black_nh: 10.4,
    pct_native_nh: 0.3,
    pct_asian_nh: 3.5,
    pct_pacific_nh: 0.1,
    pct_other_nh: 0.4,
    pct_two_plus_nh: 3.2,
    pct_hispanic: 8.6,
    pct_hs_plus: 91.2,
    pct_bachelors_plus: 33.0,
    median_hh_income: 64431,
    pct_poverty: 11.8,
    pct_unemployed: 4.2,
    pct_english_only: 84.0,
    pct_spanish_home: 9.4,
    ...over,
  };
}

function floridaStateMedians(): ReferenceMedians {
  return {
    pct_white_nh: 51.4,
    pct_black_nh: 14.5,
    pct_hispanic: 26.5,
    pct_asian_nh: 3.0,
    pct_bachelors_plus: 31.5,
    median_hh_income: 67917,
    pct_poverty: 12.7,
    pct_spanish_home: 22.5,
  };
}

function nationalMedians(): ReferenceMedians {
  return {
    pct_white_nh: 58.9,
    pct_black_nh: 12.6,
    pct_hispanic: 19.1,
    pct_asian_nh: 6.1,
    pct_bachelors_plus: 35.7,
    median_hh_income: 75149,
    pct_poverty: 12.5,
    pct_spanish_home: 13.4,
  };
}

/**
 * Build a minimal mock client whose three .from().select().eq() calls
 * return the configured row sets in order: county-row → state-rows →
 * national-rows. The query function calls these in that exact order.
 */
function mockClient(
  countyRows: CountyComposition[],
  stateRows: Array<Partial<CountyComposition>>,
  nationalRows: Array<Partial<CountyComposition>>,
): SupabaseLike {
  const queue: Array<{ data: unknown; error: unknown }> = [
    { data: countyRows, error: null },
    { data: stateRows, error: null },
    { data: nationalRows, error: null },
  ];
  return {
    from: () => ({
      select: () => ({
        eq: async () => queue.shift() ?? { data: [], error: null },
      }),
    }),
  };
}

// ============================================================
// 1. Helper test — getJuryPoolSnapshot end-to-end against mock
// ============================================================

describe("getJuryPoolSnapshot — composition + 5 questions", () => {
  it("returns composition, deltas vs state + national, 5 questions, source_url", async () => {
    const client = mockClient(
      [pinellasComposition()],
      // State-row set: Pinellas + a synthetic Miami-Dade-shaped row to
      // generate weighted averages distinct from the county itself.
      [
        pinellasComposition(),
        pinellasComposition({
          geoid: "12086",
          county_name: "Miami-Dade",
          total_pop: 2700000,
          pct_white_nh: 13.0,
          pct_black_nh: 16.0,
          pct_hispanic: 68.0,
          pct_asian_nh: 1.5,
          pct_bachelors_plus: 30.0,
          median_hh_income: 58000,
          pct_poverty: 15.0,
          pct_spanish_home: 65.0,
        }),
      ],
      // National row set: same two rows for simplicity.
      [
        pinellasComposition(),
        pinellasComposition({
          geoid: "06037",
          state_fips: "06",
          county_name: "Los Angeles",
          total_pop: 10000000,
          pct_white_nh: 26.0,
          pct_black_nh: 8.0,
          pct_hispanic: 49.0,
          pct_asian_nh: 15.5,
          pct_bachelors_plus: 33.0,
          median_hh_income: 76000,
          pct_poverty: 13.5,
          pct_spanish_home: 38.0,
        }),
      ],
    );

    const snapshot = await getJuryPoolSnapshot("12103", client);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.composition.county_name).toBe("Pinellas County");
    expect(snapshot!.composition.state_name).toBe("Florida");
    expect(snapshot!.voir_dire_questions).toHaveLength(5);
    expect(snapshot!.source_url).toBe(ACS_SOURCE_URL);
    expect(snapshot!.coverage).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    // Deltas should be populated (county vs weighted-state + national).
    expect(snapshot!.deltas_vs_state.pct_white_nh.delta_pp).not.toBeNull();
    expect(snapshot!.deltas_vs_national.pct_hispanic.delta_pp).not.toBeNull();
  });

  it("returns null + 'county-not-found' when county row is missing", async () => {
    const client = mockClient([], [], []);
    const result = await queryJuryPoolSnapshot(
      { county_fips: "99999" },
      client,
    );
    expect(result.snapshot).toBeNull();
    expect(result.suppressed_reason).toBe("county-not-found");
  });

  it("returns null + 'invalid-fips' on malformed FIPS", async () => {
    const result = await queryJuryPoolSnapshot(
      { county_fips: "abc" },
      // Mock client unused on this branch.
      mockClient([], [], []),
    );
    expect(result.snapshot).toBeNull();
    expect(result.suppressed_reason).toBe("invalid-fips");
  });
});

// ============================================================
// 2. UPL parity — voir-dire question catalog never carries banned phrases
// ============================================================

describe("Voir-Dire Framework · UPL banned-phrase parity", () => {
  it("none of the picked voir-dire questions contain any CANONICAL banned phrase", () => {
    // Force every demographic dimension to trigger by inflating deltas.
    const inflated = buildDeltaSet(
      pinellasComposition({
        pct_white_nh: 90,
        pct_black_nh: 30,
        pct_hispanic: 40,
        pct_asian_nh: 15,
        pct_bachelors_plus: 50,
        median_hh_income: 100000,
        pct_poverty: 25,
        pct_spanish_home: 35,
      }),
      {
        pct_white_nh: 50,
        pct_black_nh: 12,
        pct_hispanic: 15,
        pct_asian_nh: 5,
        pct_bachelors_plus: 30,
        median_hh_income: 60000,
        pct_poverty: 12,
        pct_spanish_home: 13,
      },
    );
    const questions = pickVoirDireQuestions(inflated, inflated);
    expect(questions).toHaveLength(5);
    for (const q of questions) {
      const lower = q.toLowerCase();
      for (const banned of CANONICAL_BANNED_PHRASES) {
        expect(
          lower.includes(banned),
          `voir-dire question must not contain banned phrase "${banned}": ${q}`,
        ).toBe(false);
      }
    }
  });

  it("rendered markdown never contains banned phrases", async () => {
    const client = mockClient(
      [pinellasComposition()],
      [pinellasComposition()],
      [pinellasComposition()],
    );
    const result = await queryJuryPoolSnapshot(
      { county_fips: "12103" },
      client,
    );
    const md = renderVoirDireFramework({
      county_label: "Pinellas County",
      state_label: "Florida",
      result,
    });
    const lower = md.toLowerCase();
    for (const banned of CANONICAL_BANNED_PHRASES) {
      expect(
        lower.includes(banned),
        `rendered markdown must not contain banned phrase "${banned}"`,
      ).toBe(false);
    }
  });
});

// ============================================================
// 3. Coverage gate — null below floor
// ============================================================

describe("Coverage gate", () => {
  it("computeCoverage returns 1.0 for a fully populated composition", () => {
    expect(computeCoverage(pinellasComposition())).toBe(1.0);
  });

  it("computeCoverage drops below floor when most metrics are null", () => {
    // Populate only median_age + median_hh_income (2/14 ≈ 0.14).
    const sparse = pinellasComposition({
      pct_white_nh: null,
      pct_black_nh: null,
      pct_native_nh: null,
      pct_asian_nh: null,
      pct_pacific_nh: null,
      pct_hispanic: null,
      pct_hs_plus: null,
      pct_bachelors_plus: null,
      pct_poverty: null,
      pct_unemployed: null,
      pct_english_only: null,
      pct_spanish_home: null,
    });
    const coverage = computeCoverage(sparse);
    expect(coverage).toBeLessThan(COVERAGE_FLOOR);
  });

  it("query returns null + 'low-coverage' when ACS row is sparse", async () => {
    const sparseRow = pinellasComposition({
      pct_white_nh: null,
      pct_black_nh: null,
      pct_native_nh: null,
      pct_asian_nh: null,
      pct_pacific_nh: null,
      pct_hispanic: null,
      pct_hs_plus: null,
      pct_bachelors_plus: null,
      pct_poverty: null,
      pct_unemployed: null,
      pct_english_only: null,
      pct_spanish_home: null,
      median_age: null,
      median_hh_income: null,
    });
    const client = mockClient([sparseRow], [], []);
    const result = await queryJuryPoolSnapshot(
      { county_fips: "12103" },
      client,
    );
    expect(result.snapshot).toBeNull();
    expect(result.suppressed_reason).toBe("low-coverage");
  });

  it("renderVoirDireFramework emits empty string when snapshot is null", () => {
    const md = renderVoirDireFramework({
      county_label: "Anywhere",
      state_label: "Anystate",
      result: { snapshot: null, suppressed_reason: "low-coverage" },
    });
    expect(md).toBe("");
  });
});

// ============================================================
// 4. Voir-dire-question shape — every question ends with "?"
// ============================================================

describe("Voir-dire-question shape", () => {
  it("every picked question ends with '?'", () => {
    const inflatedDeltas = buildDeltaSet(
      pinellasComposition({
        pct_white_nh: 95,
        pct_black_nh: 35,
        pct_hispanic: 45,
        pct_asian_nh: 20,
        pct_bachelors_plus: 55,
        median_hh_income: 110000,
        pct_poverty: 30,
        pct_spanish_home: 40,
      }),
      floridaStateMedians(),
    );
    const questions = pickVoirDireQuestions(inflatedDeltas, nationalMedians() as never);
    expect(questions).toHaveLength(5);
    for (const q of questions) {
      expect(q.trim().endsWith("?"), `question must end with "?": ${q}`).toBe(true);
    }
  });

  it("returns exactly 5 even when no demographic deltas trigger", () => {
    // Zero deltas → every dimension below trigger threshold; fallbacks fill.
    const flatComposition = pinellasComposition();
    const flatMedians: ReferenceMedians = {
      pct_white_nh: flatComposition.pct_white_nh,
      pct_black_nh: flatComposition.pct_black_nh,
      pct_hispanic: flatComposition.pct_hispanic,
      pct_asian_nh: flatComposition.pct_asian_nh,
      pct_bachelors_plus: flatComposition.pct_bachelors_plus,
      median_hh_income: flatComposition.median_hh_income,
      pct_poverty: flatComposition.pct_poverty,
      pct_spanish_home: flatComposition.pct_spanish_home,
    };
    const flatDeltas = buildDeltaSet(flatComposition, flatMedians);
    const questions = pickVoirDireQuestions(flatDeltas, flatDeltas);
    expect(questions).toHaveLength(5);
    for (const q of questions) {
      expect(q.trim().endsWith("?")).toBe(true);
    }
  });
});

// ============================================================
// 5. Percentage arithmetic — Hispanic ethnicity deduplication
// ============================================================

describe("Percentage arithmetic — race/ethnicity overlap", () => {
  it("pct_hispanic and racial pcts are stored as independent series (no forced sum-to-100 dedup)", () => {
    // ACS publishes race (non-Hispanic alone) + Hispanic ethnicity as separate
    // series. The correct behaviour is NOT to normalize them into a single
    // distribution — they are designed to overlap. We verify that
    // computeCoverage counts both pct_hispanic AND racial columns separately,
    // and that deltaPair arithmetic is applied independently to each.
    const comp = pinellasComposition();
    // pct_white_nh (73.5) + pct_hispanic (8.6) in a real dataset; both are
    // populated so coverage should count each as a distinct metric.
    const coverage = computeCoverage(comp);
    // Full fixture: all 14 coverage columns populated → 1.0.
    expect(coverage).toBe(1.0);

    // Build deltas where Hispanic delta is large and white delta is small.
    // Both should produce independent delta_pp values.
    const ref: ReferenceMedians = {
      pct_white_nh: 72.0,   // delta: +1.5pp (below DELTA_PP_TRIGGER)
      pct_black_nh: 10.0,
      pct_hispanic: 1.5,    // delta: +7.1pp (above DELTA_PP_TRIGGER=5)
      pct_asian_nh: 3.0,
      pct_bachelors_plus: 33.0,
      median_hh_income: 64000,
      pct_poverty: 12.0,
      pct_spanish_home: 9.0,
    };
    const ds = buildDeltaSet(comp, ref);
    // White delta is small — independent of Hispanic delta.
    expect(ds.pct_white_nh.delta_pp).toBeCloseTo(1.5, 1);
    // Hispanic delta is large — ethnic series computed independently.
    expect(ds.pct_hispanic.delta_pp).toBeCloseTo(7.1, 1);
    // They are not forced to offset each other (no dedup normalization).
    expect(ds.pct_white_nh.delta_pp! + ds.pct_hispanic.delta_pp!).toBeGreaterThan(0);
  });
});

// ============================================================
// 6. Render snapshot — county-not-found fallback text
// ============================================================

describe("renderVoirDireFramework — county-not-found fallback", () => {
  it("emits a visible section (not empty string) with fallback prose when county-not-found", () => {
    const md = renderVoirDireFramework({
      county_label: "Unknown County",
      state_label: "Florida",
      result: { snapshot: null, suppressed_reason: "county-not-found" },
    });
    expect(md).not.toBe("");
    expect(md).toContain("## Voir-Dire Framework: Your Jury Pool");
    expect(md).toContain("County demographic data is not available");
    expect(md).toContain("Unknown County");
    expect(md).toContain("ACS 5-year estimates (2018–2022)");
  });

  it("emits empty string for low-coverage (suppressed silently, not county-not-found)", () => {
    const md = renderVoirDireFramework({
      county_label: "Sparse County",
      state_label: "Montana",
      result: { snapshot: null, suppressed_reason: "low-coverage" },
    });
    expect(md).toBe("");
  });

  it("populated snapshot render contains ACS vintage disclosure in header prose", async () => {
    const client = mockClient(
      [pinellasComposition()],
      [pinellasComposition()],
      [pinellasComposition()],
    );
    const result = await queryJuryPoolSnapshot({ county_fips: "12103" }, client);
    const md = renderVoirDireFramework({
      county_label: "Pinellas County",
      state_label: "Florida",
      result,
    });
    // MAJOR fix: ACS vintage year must appear inline in the section.
    expect(md).toContain("2018–2022");
    // Hispanic ethnicity overlap disclosure must appear.
    expect(md).toContain("Hispanic");
    expect(md).toContain("ethnicity");
    // Source footnote must be present.
    expect(md).toContain(ACS_SOURCE_URL);
  });
});

// ============================================================
// Auxiliary pure-helper tests
// ============================================================

describe("Auxiliary pure helpers", () => {
  it("isValidFips accepts 5-digit strings, rejects everything else", () => {
    expect(isValidFips("12103")).toBe(true);
    expect(isValidFips("00001")).toBe(true);
    expect(isValidFips("1210")).toBe(false);
    expect(isValidFips("121034")).toBe(false);
    expect(isValidFips("abcde")).toBe(false);
    expect(isValidFips(null)).toBe(false);
    expect(isValidFips(undefined)).toBe(false);
  });

  it("weightedAverage skips null values + zero weights", () => {
    expect(
      weightedAverage([
        { value: 10, weight: 1 },
        { value: null, weight: 5 },
        { value: 20, weight: 0 },
        { value: 30, weight: 1 },
      ]),
    ).toBe(20);
  });

  it("weightedAverage returns null when nothing contributes", () => {
    expect(
      weightedAverage([
        { value: null, weight: null },
        { value: 5, weight: 0 },
      ]),
    ).toBeNull();
  });
});
