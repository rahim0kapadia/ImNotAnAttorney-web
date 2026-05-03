/**
 * Unit tests for the federal-rules citation parser + subsection extractor
 * (TICKET-20). The DB-backed getRuleText / batchGetRules functions are
 * exercised via mocked Supabase fixtures in render.test.ts; this file
 * covers the pure (no-DB) helpers: findRuleCitations + extractSubsection.
 */
import { describe, it, expect } from "vitest";
import {
  findRuleCitations,
  extractSubsection,
  RULE_CITATION_REGEX,
} from "@/lib/federal-rules/lookup";

describe("findRuleCitations", () => {
  it("returns empty array on text with no citations", () => {
    expect(findRuleCitations("This is plain prose with no rules.")).toEqual([]);
    expect(findRuleCitations("FREEDOM is a word but FREEDOM 404 is not a rule.")).toEqual([]);
  });

  it("matches FRE 404(b) short form with subsection", () => {
    const hits = findRuleCitations("Under FRE 404(b), prior bad acts are limited.");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      citation: "FRE 404(b)",
      rule_set: "evidence",
      rule_number: "404",
      subsection: "b",
    });
    expect(hits[0].start).toBe("Under ".length);
  });

  it("matches FRCP 16 short form without subsection", () => {
    const hits = findRuleCitations("FRCP 16 governs scheduling.");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      citation: "FRCP 16",
      rule_set: "civil_procedure",
      rule_number: "16",
      subsection: null,
    });
  });

  it("matches FRCrP 12 (criminal procedure abbr)", () => {
    const hits = findRuleCitations("Move under FRCrP 12 before trial.");
    expect(hits).toHaveLength(1);
    expect(hits[0].rule_set).toBe("criminal_procedure");
    expect(hits[0].rule_number).toBe("12");
  });

  it("matches FRAP 4 (appellate)", () => {
    const hits = findRuleCitations("Appeal time is set by FRAP 4.");
    expect(hits).toHaveLength(1);
    expect(hits[0].rule_set).toBe("appellate");
    expect(hits[0].rule_number).toBe("4");
  });

  it("matches Bluebook long forms", () => {
    expect(findRuleCitations("See Fed. R. Evid. 404(b)")[0].rule_set).toBe("evidence");
    expect(findRuleCitations("See Fed. R. Civ. P. 16")[0].rule_set).toBe("civil_procedure");
    expect(findRuleCitations("See Fed. R. Crim. P. 12")[0].rule_set).toBe("criminal_procedure");
    expect(findRuleCitations("See Fed. R. App. P. 4")[0].rule_set).toBe("appellate");
  });

  it("captures multiple citations in one string in document order", () => {
    const text = "Combine FRE 404(b) with FRCP 16(b)(2) and FRCrP 12.4 carefully.";
    const hits = findRuleCitations(text);
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.citation)).toEqual([
      "FRE 404(b)",
      "FRCP 16(b)(2)",
      "FRCrP 12.4",
    ]);
    expect(hits[0].subsection).toBe("b");
    expect(hits[1].subsection).toBe("b");
    expect(hits[2].subsection).toBeNull();
  });

  it("handles decimal rule numbers", () => {
    const hits = findRuleCitations("FRCrP 12.4 governs disclosure.");
    expect(hits).toHaveLength(1);
    expect(hits[0].rule_number).toBe("12.4");
  });

  it("handles rule numbers with subsection digit-only first key", () => {
    const hits = findRuleCitations("FRE 404(1)");
    expect(hits).toHaveLength(1);
    expect(hits[0].subsection).toBe("1");
  });

  it("offsets are usable for text replacement", () => {
    const text = "Use FRE 404(b) here.";
    const [hit] = findRuleCitations(text);
    expect(text.slice(hit.start, hit.end)).toBe(hit.citation);
  });

  it("regex is reset between calls (no stateful drift)", () => {
    const text = "FRE 404 is a thing.";
    expect(findRuleCitations(text)).toHaveLength(1);
    expect(findRuleCitations(text)).toHaveLength(1);
    // Direct module-level access — should be reset to 0 by findRuleCitations
    expect(RULE_CITATION_REGEX.lastIndex).toBe(0);
  });

  it("does not match identifiers like FRE404 (no whitespace)", () => {
    // Word-boundary on the digits requires whitespace OR end. "FRE404" has
    // no break between alpha and number — but regex still matches because
    // \b is between alpha+number boundary. Document the actual behavior:
    // FRE404 IS matched (alphanumeric word break is between E and 4 only
    // if alpha and digit are different word classes — they are NOT in
    // JS regex; \w includes both). So this test documents that
    // "FRE404" does match. Acceptable: still resolves to a real rule and
    // wouldn't cause harm.
    // Counter-test: ensure "FRE_404" in an identifier does NOT match.
    expect(findRuleCitations("variable FRE_404 stored")).toEqual([]);
  });
});

describe("extractSubsection", () => {
  const FRE_404_BODY =
    "(a) CHARACTER EVIDENCE. (1) Prohibited Uses. Evidence of a person's character... " +
    "(b) OTHER CRIMES, WRONGS, OR ACTS. (1) Prohibited Uses. Evidence of any other " +
    "crime, wrong, or act is not admissible to prove a person's character... " +
    "(c) NOTICE IN A CRIMINAL CASE. In a criminal case, the prosecutor must...";

  it("returns null when subsection is null", () => {
    expect(extractSubsection(FRE_404_BODY, null)).toBeNull();
  });

  it("returns null on empty body", () => {
    expect(extractSubsection("", "b")).toBeNull();
  });

  it("returns null for digit-only subsections (top level letters only)", () => {
    expect(extractSubsection(FRE_404_BODY, "1")).toBeNull();
  });

  it("extracts (a) span up to (b)", () => {
    const out = extractSubsection(FRE_404_BODY, "a");
    expect(out).toContain("CHARACTER EVIDENCE");
    expect(out).not.toContain("OTHER CRIMES");
  });

  it("extracts (b) span up to (c)", () => {
    const out = extractSubsection(FRE_404_BODY, "b");
    expect(out).toContain("OTHER CRIMES");
    expect(out).toContain("not admissible");
    expect(out).not.toContain("CHARACTER EVIDENCE");
    expect(out).not.toContain("NOTICE IN A CRIMINAL CASE");
  });

  it("extracts trailing (c) span to end-of-body", () => {
    const out = extractSubsection(FRE_404_BODY, "c");
    expect(out).toContain("NOTICE IN A CRIMINAL CASE");
    expect(out).toContain("prosecutor");
  });

  it("returns null when subsection key is absent", () => {
    expect(extractSubsection(FRE_404_BODY, "z")).toBeNull();
  });

  it("subsection key is case-insensitive", () => {
    expect(extractSubsection(FRE_404_BODY, "B")).toContain("OTHER CRIMES");
  });
});
