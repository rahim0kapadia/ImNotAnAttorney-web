/**
 * Unit tests for TICKET-19 — capital-adjacency context helper.
 *
 * Coverage gates:
 *   1. Helper logic — federal-eligible vs state-eligible vs neither
 *   2. Render gate — output empty when eligibility=false (HARD)
 *   3. UPL parity — rendered HTML never contains banned phrases
 *   4. UPL parity — rendered HTML never contains predictive language
 *   5. Charge-class extraction — strict mapping, returns null for unknown
 *   6. Mercer voice parity — required theoretical/contextual phrases present
 *   7. Source-URL chain — DPIC URL stored on every eligible context
 *   8. State-by-state map — every entry has valid status
 *   9. Tier surface predicate — only sex-offense + federal-criminal slugs
 */
import { describe, it, expect } from "vitest";
import {
  CAPITAL_SIDEBAR_PLAYBOOK_SLUGS,
  DPIC_EXECUTIONS_SOURCE_URL,
  DPIC_POLICY_SOURCE_URL,
  FEDERAL_CAPITAL_ELIGIBLE_CLASSES,
  STATE_CAPITAL_STATUS,
  chargeClassForSlug,
  getCapitalContext,
  playbookSlugSupportsCapitalSidebar,
  renderCapitalContextHtml,
} from "../capital-context";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";

// ------------------------------------------------------------------
// 1. Helper logic — eligibility paths
// ------------------------------------------------------------------

describe("getCapitalContext — eligibility logic", () => {
  it("eligible=true when state retains active statute (TX + capital murder)", () => {
    const ctx = getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "playbook",
    });
    expect(ctx.eligible).toBe(true);
    expect(ctx.stateCapitalEligibility).toBe("active");
    expect(ctx.federalCapitalEligible).toBe(true);
  });

  it("eligible=true when state has moratorium (CA + capital murder)", () => {
    const ctx = getCapitalContext({
      state: "CA",
      chargeClass: "murder-capital",
      surface: "playbook",
    });
    expect(ctx.eligible).toBe(true);
    expect(ctx.stateCapitalEligibility).toBe("moratorium");
  });

  it("eligible=true when state abolished BUT charge is federally eligible (MA + treason)", () => {
    const ctx = getCapitalContext({
      state: "MA",
      chargeClass: "treason",
      surface: "xray",
    });
    expect(ctx.eligible).toBe(true);
    expect(ctx.stateCapitalEligibility).toBe("never");
    expect(ctx.federalCapitalEligible).toBe(true);
  });

  it("eligible=true when state never had statute BUT charge is federally eligible (HI + terrorism-with-death)", () => {
    const ctx = getCapitalContext({
      state: "HI",
      chargeClass: "terrorism-with-death",
      surface: "xray",
    });
    expect(ctx.eligible).toBe(true);
  });

  it("eligible=false when state abolished AND charge class is felony-murder only", () => {
    // felony-murder is a state-level class — not in FEDERAL_CAPITAL_ELIGIBLE_CLASSES.
    const ctx = getCapitalContext({
      state: "IL",
      chargeClass: "felony-murder",
      surface: "playbook",
    });
    expect(ctx.eligible).toBe(false);
  });

  it("eligible=false when state never had statute AND charge class is non-federal", () => {
    const ctx = getCapitalContext({
      state: "MN",
      chargeClass: "felony-murder",
      surface: "playbook",
    });
    expect(ctx.eligible).toBe(false);
  });

  it("captures lastDecadeExecutions + lastExecutionYear when supplied", () => {
    const ctx = getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "playbook",
      lastDecadeExecutions: 73,
      lastExecutionYear: 2025,
    });
    expect(ctx.lastDecadeExecutions).toBe(73);
    expect(ctx.lastExecutionYear).toBe(2025);
  });

  it("defaults stats to 0 / null when not supplied", () => {
    const ctx = getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "playbook",
    });
    expect(ctx.lastDecadeExecutions).toBe(0);
    expect(ctx.lastExecutionYear).toBeNull();
  });

  it("normalizes state input (lowercase, trimmed)", () => {
    const ctx = getCapitalContext({
      state: "  tx ",
      chargeClass: "murder-capital",
      surface: "playbook",
    });
    expect(ctx.state).toBe("TX");
    expect(ctx.stateCapitalEligibility).toBe("active");
  });

  it("returns state=null when input is junk or wrong length", () => {
    const ctx = getCapitalContext({
      state: "California",
      chargeClass: "murder-capital",
      surface: "playbook",
    });
    expect(ctx.state).toBeNull();
    expect(ctx.stateCapitalEligibility).toBeNull();
  });
});

// ------------------------------------------------------------------
// 2. Render gate — output empty when ineligible
// ------------------------------------------------------------------

describe("renderCapitalContextHtml — render gate", () => {
  it("returns empty string when eligible=false (HARD)", () => {
    const ctx = getCapitalContext({
      state: "MN",
      chargeClass: "felony-murder",
      surface: "playbook",
    });
    expect(ctx.eligible).toBe(false);
    const html = renderCapitalContextHtml(ctx);
    expect(html).toBe("");
  });

  it("returns non-empty HTML when eligible=true (TX + murder-capital)", () => {
    const ctx = getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "playbook",
      lastDecadeExecutions: 73,
      lastExecutionYear: 2025,
    });
    const html = renderCapitalContextHtml(ctx);
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain("Capital-Eligibility Check");
    expect(html).toContain("TX");
    expect(html).toContain("73");
  });

  it("renders federal carve-out when state abolished but federal-eligible", () => {
    const ctx = getCapitalContext({
      state: "MA",
      chargeClass: "treason",
      surface: "xray",
      lastDecadeExecutions: 0,
      lastExecutionYear: null,
    });
    const html = renderCapitalContextHtml(ctx);
    expect(html).toContain("Federal jurisdiction");
    expect(html).toContain("Boston Marathon");
  });
});

// ------------------------------------------------------------------
// 3 + 4. UPL parity — banned + predictive phrases
// ------------------------------------------------------------------

describe("renderCapitalContextHtml — UPL parity", () => {
  // Render every (state status x federal-eligible status) combo and confirm
  // none of them ever produces banned-phrase output. This is the matrix
  // gate: shape of the output text must stay UPL-clean across the table.
  const eligibleSamples: Array<{
    state: string;
    chargeClass:
      | "murder-capital"
      | "treason"
      | "terrorism-with-death"
      | "sex-offense-resulting-in-death";
    last: number;
    yr: number | null;
  }> = [
    { state: "TX", chargeClass: "murder-capital", last: 73, yr: 2025 },
    { state: "CA", chargeClass: "murder-capital", last: 0, yr: null },
    { state: "MA", chargeClass: "treason", last: 0, yr: null },
    { state: "HI", chargeClass: "terrorism-with-death", last: 0, yr: null },
    { state: "FL", chargeClass: "sex-offense-resulting-in-death", last: 7, yr: 2023 },
  ];

  it.each(eligibleSamples)(
    "never emits banned UPL phrases for $state / $chargeClass",
    ({ state, chargeClass, last, yr }) => {
      const ctx = getCapitalContext({
        state,
        chargeClass,
        surface: "playbook",
        lastDecadeExecutions: last,
        lastExecutionYear: yr,
      });
      const html = renderCapitalContextHtml(ctx);
      const lower = html.toLowerCase();
      const hits = UPL_BANNED_PHRASES.filter((p) => lower.includes(p));
      expect(hits, `Banned UPL phrases found: ${hits.join(", ")}`).toEqual([]);
    },
  );

  it.each(eligibleSamples)(
    "never emits predictive language for $state / $chargeClass",
    ({ state, chargeClass, last, yr }) => {
      const ctx = getCapitalContext({
        state,
        chargeClass,
        surface: "playbook",
        lastDecadeExecutions: last,
        lastExecutionYear: yr,
      });
      const html = renderCapitalContextHtml(ctx);
      const lower = html.toLowerCase();
      // Predictive / outcome-promising phrases that, on a capital sidebar,
      // would cross from information into advice. Bounded list.
      const PREDICTIVE_BANNED = [
        "you will be charged",
        "you will face",
        "death is likely",
        "execution is likely",
        "expect to be sentenced",
        "you face execution",
        "guaranteed outcome",
        "prosecutors will pursue",
        "the prosecution will seek",
      ];
      const hits = PREDICTIVE_BANNED.filter((p) => lower.includes(p));
      expect(hits, `Predictive phrases found: ${hits.join(", ")}`).toEqual([]);
    },
  );

  it("never emits predictive language even with junk state", () => {
    const ctx = getCapitalContext({
      state: null,
      chargeClass: "treason",
      surface: "xray",
      lastDecadeExecutions: 0,
      lastExecutionYear: null,
    });
    const html = renderCapitalContextHtml(ctx);
    expect(html.toLowerCase()).not.toMatch(/will be charged|will face|likely (?:to be )?sentenced/);
  });
});

// ------------------------------------------------------------------
// 5. Charge-class extraction — strict mapping
// ------------------------------------------------------------------

describe("chargeClassForSlug", () => {
  it("maps known capital-adjacent slugs", () => {
    expect(chargeClassForSlug("first-degree-murder")).toBe("murder-capital");
    expect(chargeClassForSlug("capital-murder")).toBe("murder-capital");
    expect(chargeClassForSlug("murder")).toBe("murder-first-degree");
    expect(chargeClassForSlug("felony-murder")).toBe("felony-murder");
    expect(chargeClassForSlug("treason")).toBe("treason");
    expect(chargeClassForSlug("espionage")).toBe("espionage");
    expect(chargeClassForSlug("drug-trafficking-with-death")).toBe(
      "drug-trafficking-with-death",
    );
    expect(chargeClassForSlug("terrorism-with-death")).toBe("terrorism-with-death");
    expect(chargeClassForSlug("sex-offense-resulting-in-death")).toBe(
      "sex-offense-resulting-in-death",
    );
  });

  it("normalizes case + whitespace", () => {
    expect(chargeClassForSlug("  Treason ")).toBe("treason");
    expect(chargeClassForSlug("CAPITAL-MURDER")).toBe("murder-capital");
  });

  it("returns null for unrelated charges (under-render is safer than over-render)", () => {
    expect(chargeClassForSlug("dui")).toBeNull();
    expect(chargeClassForSlug("drug-possession-marijuana")).toBeNull();
    expect(chargeClassForSlug("sex-offense")).toBeNull(); // Generic sex-offense NOT auto-eligible
    expect(chargeClassForSlug("sexual-assault")).toBeNull();
    expect(chargeClassForSlug("rape")).toBeNull(); // Per Kennedy v. Louisiana
    expect(chargeClassForSlug("white-collar")).toBeNull();
    expect(chargeClassForSlug("")).toBeNull();
    expect(chargeClassForSlug(null)).toBeNull();
    expect(chargeClassForSlug(undefined)).toBeNull();
  });
});

// ------------------------------------------------------------------
// 6. Mercer voice parity
// ------------------------------------------------------------------

describe("renderCapitalContextHtml — Mercer voice parity", () => {
  const ctx = getCapitalContext({
    state: "TX",
    chargeClass: "murder-capital",
    surface: "playbook",
    lastDecadeExecutions: 73,
    lastExecutionYear: 2025,
  });
  const html = renderCapitalContextHtml(ctx);

  it("contains theoretical/contextual phrasing (HARD per ticket)", () => {
    expect(html).toContain("can theoretically reach");
  });

  it("hands attorney decision back to attorney (CHARM mode)", () => {
    expect(html).toMatch(/your attorney will run/i);
  });

  it("never claims to substitute for attorney judgment", () => {
    expect(html).toMatch(/not to substitute for it/i);
  });

  it("never uses urgency/speed framing (anti-pattern per brand-voice.md)", () => {
    const lower = html.toLowerCase();
    expect(lower).not.toContain("act now");
    expect(lower).not.toContain("don't wait");
    expect(lower).not.toContain("time is running out");
  });
});

// ------------------------------------------------------------------
// 7. Source-URL chain
// ------------------------------------------------------------------

describe("source URLs", () => {
  it("DPIC executions URL constant matches migration source_url", () => {
    expect(DPIC_EXECUTIONS_SOURCE_URL).toBe(
      "http://deathpenaltyinfo.org/query/executions.csv",
    );
  });

  it("DPIC policy URL is HTTPS", () => {
    expect(DPIC_POLICY_SOURCE_URL.startsWith("https://")).toBe(true);
  });

  it("eligible context always carries both source URLs", () => {
    const ctx = getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "playbook",
    });
    expect(ctx.sourceUrl).toBe(DPIC_EXECUTIONS_SOURCE_URL);
    expect(ctx.policySourceUrl).toBe(DPIC_POLICY_SOURCE_URL);
  });

  it("rendered HTML cites both DPIC URLs", () => {
    const ctx = getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "playbook",
      lastDecadeExecutions: 73,
      lastExecutionYear: 2025,
    });
    const html = renderCapitalContextHtml(ctx);
    expect(html).toContain(DPIC_EXECUTIONS_SOURCE_URL);
    expect(html).toContain(DPIC_POLICY_SOURCE_URL);
  });
});

// ------------------------------------------------------------------
// 8. State-by-state map integrity
// ------------------------------------------------------------------

describe("STATE_CAPITAL_STATUS map", () => {
  it("covers all 50 states + DC (51 entries)", () => {
    expect(Object.keys(STATE_CAPITAL_STATUS).length).toBe(51);
  });

  it("every entry has a valid status", () => {
    const validStatuses = new Set(["active", "moratorium", "abolished", "never"]);
    for (const [code, row] of Object.entries(STATE_CAPITAL_STATUS)) {
      expect(code, `state code ${code}`).toMatch(/^[A-Z]{2}$/);
      expect(validStatuses.has(row.status), `status for ${code}`).toBe(true);
      if (row.status === "abolished") {
        expect(row.abolishedYear, `abolishedYear for ${code}`).toBeGreaterThan(1976);
      } else {
        expect(row.abolishedYear, `abolishedYear for ${code}`).toBeNull();
      }
    }
  });

  it("federal-eligible class set contains expected categories", () => {
    expect(FEDERAL_CAPITAL_ELIGIBLE_CLASSES.has("treason")).toBe(true);
    expect(FEDERAL_CAPITAL_ELIGIBLE_CLASSES.has("espionage")).toBe(true);
    expect(FEDERAL_CAPITAL_ELIGIBLE_CLASSES.has("murder-capital")).toBe(true);
    expect(FEDERAL_CAPITAL_ELIGIBLE_CLASSES.has("terrorism-with-death")).toBe(true);
    // felony-murder is a STATE-LEVEL class only (no federal felony-murder
    // statute outside specific carve-outs); should NOT be federal-eligible
    // in this map.
    expect(FEDERAL_CAPITAL_ELIGIBLE_CLASSES.has("felony-murder")).toBe(false);
  });
});

// ------------------------------------------------------------------
// 9. Tier surface predicate — gate on which playbooks
// ------------------------------------------------------------------

describe("playbookSlugSupportsCapitalSidebar", () => {
  it("returns true for sex-offense + federal-criminal only", () => {
    expect(playbookSlugSupportsCapitalSidebar("sex-offense")).toBe(true);
    expect(playbookSlugSupportsCapitalSidebar("federal-criminal")).toBe(true);
  });

  it("returns false for all other playbook slugs (HARD scope gate)", () => {
    const otherPlaybooks = [
      "dui-first-offense",
      "drug-possession",
      "drug-trafficking",
      "white-collar",
      "probation-violation",
      "self-defense",
    ];
    for (const slug of otherPlaybooks) {
      expect(playbookSlugSupportsCapitalSidebar(slug), slug).toBe(false);
    }
  });

  it("set has exactly 2 entries (no scope creep)", () => {
    expect(CAPITAL_SIDEBAR_PLAYBOOK_SLUGS.size).toBe(2);
  });
});
