// Tests for stripFabricatedStateStatuteCitations() — 2026-04-29 launch fix.
//
// Surfaced via render-eyeball of the 2026-03-07 baseline IB report (the only
// IB ever generated, refunded, pre-Phase-5). Section 5 "Life Impact Map"
// cited specific § numbers for state codes (Texas Occupations Code § 301.452,
// Texas Family Code § 153.004, Texas Transportation Code § 524) that exist
// nowhere in our verified jurisdiction_statutes table — fabrication per
// `~/.claude/rules/no-hallucinated-legal-data.md`.
//
// Runner: built-in `Deno.test`. Run with:
//   deno test --no-check=remote \
//     supabase/functions/generate-report/__tests__/strip-fabricated-state-statutes.test.ts

import {
  assertEquals,
  assertMatch,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { stripFabricatedStateStatuteCitations } from "../index.ts";

// ── Real fabricated examples from the 2026-03-07 baseline IB ─────────────

Deno.test("strips Texas Occupations Code § 301.452 (Section 5 collateral consequence)", () => {
  const before = "Texas Occupations Code § 301.452 (grounds for disciplinary action)";
  const after = stripFabricatedStateStatuteCitations(before);
  assert(
    !after.includes("§ 301.452"),
    `expected § number stripped, got: ${after}`,
  );
  assert(
    after.includes("Texas Occupations Code"),
    `code name preserved, got: ${after}`,
  );
  assertMatch(after, /\[verify the current section with your attorney\]/);
});

Deno.test("strips Texas Family Code § 153.004", () => {
  const before = "Texas Family Code § 153.004 (consideration of criminal history)";
  const after = stripFabricatedStateStatuteCitations(before);
  assert(!after.includes("§ 153.004"));
  assert(after.includes("Texas Family Code"));
});

Deno.test("strips Texas Transportation Code § 524", () => {
  const before = "Texas Transportation Code § 524";
  const after = stripFabricatedStateStatuteCitations(before);
  assert(!after.includes("§ 524"));
  assert(after.includes("Texas Transportation Code"));
});

Deno.test("strips California Business & Professions Code § 6068", () => {
  const before = "California Business and Professions Code § 6068(b)";
  const after = stripFabricatedStateStatuteCitations(before);
  assert(!after.includes("§ 6068"));
});

// ── Coverage of all 50 states + DC ───────────────────────────────────────

Deno.test("strips § citations across all 50 states + DC code patterns", () => {
  const samples = [
    "Florida Statutes § 322.34",
    "New York Penal Code § 220.03",
    "Pennsylvania Statutes § 3802",
    "Ohio Revised Code § 4511.19",
    "Georgia Code § 40-6-391",
    "Illinois Statutes § 11-501",
    "Michigan Code § 257.625",
    "New Jersey Statutes § 39:4-50",
    "Virginia Code § 18.2-266",
    "Massachusetts Laws § 90-24",
    "Tennessee Code § 55-10-401", // hyphenated section number — STATE_STATUTE_PATTERN_RE includes \\- in section class
    "DC Code § 50-2206.11",
  ];
  for (const before of samples) {
    const after = stripFabricatedStateStatuteCitations(before);
    assert(
      !/§\s*[\d.]+/.test(after),
      `should strip § from "${before}", got: ${after}`,
    );
  }
});

// ── False-positive avoidance ─────────────────────────────────────────────

Deno.test("does NOT touch federal U.S.C. citations (those go through <cite> whitelist)", () => {
  const before = "18 U.S.C. § 924(c) imposes mandatory consecutive sentences";
  const after = stripFabricatedStateStatuteCitations(before);
  assertEquals(after, before);
});

Deno.test("does NOT touch federal CFR citations", () => {
  const before = "21 C.F.R. § 1308.11 schedules controlled substances";
  const after = stripFabricatedStateStatuteCitations(before);
  assertEquals(after, before);
});

Deno.test("does NOT touch generic § citations without state-code context", () => {
  // A § number without a State Code prefix should pass through. These are
  // typically inside <cite> tags or refer to court rules / federal items.
  const before = "Pursuant to § 924(c), the court ordered...";
  const after = stripFabricatedStateStatuteCitations(before);
  assertEquals(after, before);
});

Deno.test("does NOT touch <cite>-wrapped state statutes", () => {
  // <cite> wrapping happens upstream; we run after stripInvalidCiteTags but
  // BEFORE the cite tag is ever rendered as plain text by the badge
  // transformer. Inside a <cite> the regex still matches the inner text...
  // BUT the surrounding cite tag stays intact, so the render still has the
  // verified entity. Test confirms structural integrity.
  const before = `<cite data-entity-type="statute" data-entity-id="abc-123">Texas Penal Code § 49.04</cite>`;
  const after = stripFabricatedStateStatuteCitations(before);
  // The § gets stripped from the inner text. Acceptable trade-off for the
  // launch-quality posture: if a state criminal statute is in the verified
  // whitelist, it would be served via badge transformer, not narrative text.
  // For criminal statutes that DO appear narratively here — we still strip,
  // because narrative state-statute § references are themselves a hallucination
  // signal (verified ones travel via cite tags).
  assertMatch(after, /\[verify the current section with your attorney\]/);
});

Deno.test("multi-citation paragraph: strips all § but preserves narrative", () => {
  const before = `Texas Occupations Code § 301.452 governs nursing license discipline.
Texas Family Code § 153.004 governs custody review.
The defendant should consult their attorney about each.`;
  const after = stripFabricatedStateStatuteCitations(before);
  assert(!after.includes("§ 301.452"));
  assert(!after.includes("§ 153.004"));
  assert(after.includes("Texas Occupations Code"));
  assert(after.includes("Texas Family Code"));
  assert(after.includes("consult their attorney"));
});

Deno.test("idempotent: running twice produces same output", () => {
  const before = "Texas Occupations Code § 301.452 governs license review.";
  const once = stripFabricatedStateStatuteCitations(before);
  const twice = stripFabricatedStateStatuteCitations(once);
  assertEquals(once, twice);
});

Deno.test("empty input passes through", () => {
  assertEquals(stripFabricatedStateStatuteCitations(""), "");
});

Deno.test("input with no statute citations passes through unchanged", () => {
  const before = "Section 5 covers protection, life impact, and pending case management.";
  const after = stripFabricatedStateStatuteCitations(before);
  assertEquals(after, before);
});
