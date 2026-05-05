// scripts/__tests__/bulk-extract-opinion-entities.test.mjs
import { describe, it, expect } from "vitest";
import {
  extractEntities,
  OFFICER_RE,
  WITNESS_TESTIFIED_RE,
  EXPERT_DR_RE,
  PROSECUTOR_ADA_RE,
  DEFENSE_RE,
  SENTENCE_MONTHS_RE,
  SENTENCE_YEARS_RE,
  FINE_RE,
  RESTITUTION_RE,
} from "../bulk-extract-opinion-entities.mjs";

// ── OFFICER_RE ───────────────────────────────────────────────────────────────
describe("OFFICER_RE", () => {
  it("matches Officer + Title Case name", () => {
    const m = [..."Officer John Smith arrested the defendant.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("John Smith");
  });

  it("matches Detective with single last name", () => {
    const m = [..."Detective Brown testified.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("Brown");
  });

  it("matches Trooper", () => {
    const m = [..."Trooper Davis pulled over the vehicle.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("Davis");
  });

  it("matches Sergeant", () => {
    const m = [..."Sergeant Wilson recorded the incident.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("Wilson");
  });

  it("matches Lieutenant", () => {
    const m = [..."Lieutenant Garcia ordered the search.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("Garcia");
  });

  it("matches Lt. abbreviation", () => {
    const m = [..."Lt. Martinez supervised the arrest.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("Martinez");
  });

  it("matches Deputy", () => {
    const m = [..."Deputy Thompson secured the perimeter.".matchAll(OFFICER_RE)];
    expect(m[0][1]).toBe("Thompson");
  });

  it("does not match lowercase officer", () => {
    const m = [..."the officer smith arrived.".matchAll(OFFICER_RE)];
    expect(m.length).toBe(0);
  });
});

// ── WITNESS_TESTIFIED_RE ─────────────────────────────────────────────────────
describe("WITNESS_TESTIFIED_RE", () => {
  it("matches 'Smith testified'", () => {
    const m = [..."Smith testified that the light was red.".matchAll(WITNESS_TESTIFIED_RE)];
    expect(m[0][1]).toBe("Smith");
  });

  it("matches multi-word name + testified", () => {
    const m = [..."John Brown testified before the grand jury.".matchAll(WITNESS_TESTIFIED_RE)];
    expect(m[0][1]).toBe("John Brown");
  });
});

// ── EXPERT_DR_RE ─────────────────────────────────────────────────────────────
describe("EXPERT_DR_RE", () => {
  it("matches Dr. + last name", () => {
    const m = [..."Dr. Roberts examined the evidence.".matchAll(EXPERT_DR_RE)];
    expect(m[0][1]).toBe("Roberts");
  });

  it("matches Doctor + name", () => {
    const m = [..."Doctor Smith testified as an expert.".matchAll(EXPERT_DR_RE)];
    expect(m[0][1]).toBe("Smith");
  });
});

// ── PROSECUTOR_ADA_RE ────────────────────────────────────────────────────────
describe("PROSECUTOR_ADA_RE", () => {
  it("matches ADA title", () => {
    const m = [..."ADA Wilson presented closing arguments.".matchAll(PROSECUTOR_ADA_RE)];
    expect(m[0][1]).toBe("Wilson");
  });

  it("matches AUSA title", () => {
    const m = [..."AUSA Brown represented the United States.".matchAll(PROSECUTOR_ADA_RE)];
    expect(m[0][1]).toBe("Brown");
  });
});

// ── DEFENSE_RE ───────────────────────────────────────────────────────────────
describe("DEFENSE_RE", () => {
  it("matches defense counsel", () => {
    const m = [..."defense counsel Martinez objected.".matchAll(DEFENSE_RE)];
    expect(m[0][1]).toBe("Martinez");
  });

  it("matches Public Defender", () => {
    const m = [..."Public Defender Johnson filed the motion.".matchAll(DEFENSE_RE)];
    expect(m[0][1]).toBe("Johnson");
  });

  it("matches defense attorney", () => {
    const m = [..."defense attorney Rodriguez argued the point.".matchAll(DEFENSE_RE)];
    expect(m[0][1]).toBe("Rodriguez");
  });
});

// ── SENTENCE_MONTHS_RE ───────────────────────────────────────────────────────
describe("SENTENCE_MONTHS_RE", () => {
  it("matches 'sentenced to 60 months'", () => {
    const m = [..."sentenced to 60 months in prison".matchAll(SENTENCE_MONTHS_RE)];
    expect(parseInt(m[0][1], 10)).toBe(60);
  });

  it("matches '24 months imprisonment'", () => {
    const m = [..."24 months imprisonment was imposed.".matchAll(SENTENCE_MONTHS_RE)];
    expect(parseInt(m[0][1], 10)).toBe(24);
  });
});

// ── SENTENCE_YEARS_RE ────────────────────────────────────────────────────────
describe("SENTENCE_YEARS_RE", () => {
  it("matches '5-year sentence'", () => {
    const m = [..."The defendant received a 5-year sentence.".matchAll(SENTENCE_YEARS_RE)];
    expect(parseInt(m[0][1], 10)).toBe(5);
  });

  it("matches '3 years imprisonment'", () => {
    const m = [..."3 years imprisonment was ordered.".matchAll(SENTENCE_YEARS_RE)];
    expect(parseInt(m[0][1], 10)).toBe(3);
  });
});

// ── FINE_RE ──────────────────────────────────────────────────────────────────
describe("FINE_RE", () => {
  it("matches 'fine of $5,000'", () => {
    const m = [..."a fine of $5,000 was assessed.".matchAll(FINE_RE)];
    const val = m[0][1] || m[0][2];
    expect(parseFloat(val.replace(/,/g, ""))).toBe(5000);
  });

  it("matches '$5,000 fine'", () => {
    const m = [..."$5,000 fine was imposed.".matchAll(FINE_RE)];
    const val = m[0][1] || m[0][2];
    expect(parseFloat(val.replace(/,/g, ""))).toBe(5000);
  });

  it("matches dollar amount with cents", () => {
    const m = [..."fine of $50,000.00 was ordered.".matchAll(FINE_RE)];
    const val = m[0][1] || m[0][2];
    expect(parseFloat(val.replace(/,/g, ""))).toBe(50000);
  });
});

// ── RESTITUTION_RE ───────────────────────────────────────────────────────────
describe("RESTITUTION_RE", () => {
  it("matches 'restitution of $12,500'", () => {
    const m = [..."restitution of $12,500 was ordered.".matchAll(RESTITUTION_RE)];
    const val = m[0][1] || m[0][2];
    expect(parseFloat(val.replace(/,/g, ""))).toBe(12500);
  });

  it("matches '$12,345 in restitution'", () => {
    const m = [..."ordered to pay $12,345 in restitution.".matchAll(RESTITUTION_RE)];
    const val = m[0][1] || m[0][2];
    expect(parseFloat(val.replace(/,/g, ""))).toBe(12345);
  });
});

// ── extractEntities (integration) ────────────────────────────────────────────
describe("extractEntities", () => {
  // Realistic prose that exercises all 8 output fields
  const SAMPLE_TEXT = `
    The defendant, John Doe, was arrested by Officer Smith on January 5, 2020.
    Detective Brown testified that the evidence was conclusive.
    Dr. Roberts, an expert witness, opined that the substance was cocaine.
    ADA Wilson presented the case for the State.
    AUSA Brown represented the federal government on the related charge.
    Defense counsel Martinez objected to the introduction of the evidence.
    The court sentenced the defendant to 60 months in prison.
    A fine of $5,000 was imposed, plus restitution of $12,500.
  `.repeat(2); // length well over 100

  it("extracts officer names", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.officer_names).toContain("Smith");
    expect(r.officer_names).toContain("Brown");
  });

  it("excludes officers from witness_names", () => {
    const r = extractEntities(SAMPLE_TEXT);
    // Brown is an officer (Detective Brown) so must not appear in witnesses
    expect(r.witness_names).not.toContain("Brown");
  });

  it("extracts expert witness names", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.expert_witness_names).toContain("Roberts");
  });

  it("extracts prosecutor names (ADA + AUSA)", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.prosecutor_names).toContain("Wilson");
    expect(r.prosecutor_names).toContain("Brown");
  });

  it("extracts defense attorney names", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.defense_attorney_names).toContain("Martinez");
  });

  it("extracts sentence months", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.sentence_months_extracted).toContain(60);
  });

  it("extracts fine dollars", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.fine_dollars_extracted).toContain(5000);
  });

  it("extracts restitution dollars", () => {
    const r = extractEntities(SAMPLE_TEXT);
    expect(r.restitution_dollars_extracted).toContain(12500);
  });

  it("converts year-based sentences to months (5 years → 60 months)", () => {
    const text = "The defendant received a 5-year sentence.".repeat(10);
    const r = extractEntities(text);
    expect(r.sentence_months_extracted).toContain(60);
  });

  it("returns EMPTY for null input", () => {
    const r = extractEntities(null);
    expect(r.officer_names).toEqual([]);
    expect(r.witness_names).toEqual([]);
    expect(r.sentence_months_extracted).toEqual([]);
  });

  it("returns EMPTY for undefined input", () => {
    const r = extractEntities(undefined);
    expect(r.officer_names).toEqual([]);
  });

  it("returns EMPTY for empty string", () => {
    const r = extractEntities("");
    expect(r.officer_names).toEqual([]);
  });

  it("returns EMPTY for short text (below MIN_TEXT_LEN)", () => {
    const r = extractEntities("short text");
    expect(r.officer_names).toEqual([]);
  });

  it("deduplicates repeated officer names", () => {
    const text = (
      "Officer Smith arrested. Officer Smith testified. Officer Smith documented."
    ).repeat(5);
    const r = extractEntities(text);
    const smithCount = r.officer_names.filter((n) => n === "Smith").length;
    expect(smithCount).toBe(1);
  });

  it("deduplicates repeated sentence values", () => {
    const text = "sentenced to 60 months in prison. sentenced to 60 months in prison.".repeat(5);
    const r = extractEntities(text);
    const sixtyCount = r.sentence_months_extracted.filter((n) => n === 60).length;
    expect(sixtyCount).toBe(1);
  });

  it("parses fine with commas and cents ($50,000.00)", () => {
    const text = (
      "The court imposed a fine of $50,000.00 and restitution of $12,345."
    ).repeat(5);
    const r = extractEntities(text);
    expect(r.fine_dollars_extracted).toContain(50000);
    expect(r.restitution_dollars_extracted).toContain(12345);
  });

  it("AUSA + ADA both appear as prosecutors", () => {
    const text = (
      "AUSA Brown represented the United States. ADA Wilson handled the state charges."
    ).repeat(5);
    const r = extractEntities(text);
    expect(r.prosecutor_names).toContain("Brown");
    expect(r.prosecutor_names).toContain("Wilson");
  });

  it("sentence_months_extracted excludes values outside sane bounds", () => {
    // 0 months and 1300 months (> 1200) should be filtered
    const text = (
      "sentenced to 0 months in prison. sentenced to 1300 months imprisonment."
    ).repeat(5);
    const r = extractEntities(text);
    expect(r.sentence_months_extracted).not.toContain(0);
    expect(r.sentence_months_extracted).not.toContain(1300);
  });

  it("returns all 8 array fields even when empty", () => {
    const text = "The court held that the evidence was insufficient.".repeat(5);
    const r = extractEntities(text);
    expect(Array.isArray(r.officer_names)).toBe(true);
    expect(Array.isArray(r.witness_names)).toBe(true);
    expect(Array.isArray(r.expert_witness_names)).toBe(true);
    expect(Array.isArray(r.prosecutor_names)).toBe(true);
    expect(Array.isArray(r.defense_attorney_names)).toBe(true);
    expect(Array.isArray(r.sentence_months_extracted)).toBe(true);
    expect(Array.isArray(r.fine_dollars_extracted)).toBe(true);
    expect(Array.isArray(r.restitution_dollars_extracted)).toBe(true);
  });
});
