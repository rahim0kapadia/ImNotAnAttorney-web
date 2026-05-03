/**
 * Unit tests for substance taxonomy (TICKET-16).
 *
 * Focus:
 *   - Taxonomy size is non-trivial (>= 30)
 *   - Every entry has a verification URL on regulationUrl
 *   - Every entry's regulationUrl uses HTTPS
 *   - searchAliases never empty + never contain commas (Supabase .or() safe)
 *   - currentScheduleAsOf is ISO YYYY-MM-DD
 *   - Slug consistency: SUBSTANCE_TAXONOMY[k].slug === k
 *   - Lookup helpers behave as advertised
 */

import { describe, it, expect } from "vitest";
import {
  SUBSTANCE_TAXONOMY,
  getSubstanceBySlug,
  listSubstanceSlugs,
  substanceTaxonomySize,
} from "../substances";

describe("Substance taxonomy", () => {
  it("has at least 30 entries", () => {
    expect(substanceTaxonomySize()).toBeGreaterThanOrEqual(30);
  });

  it("every entry has a verification URL using HTTPS", () => {
    for (const [slug, entry] of Object.entries(SUBSTANCE_TAXONOMY)) {
      expect(entry.regulationUrl, `${slug} regulationUrl`).toMatch(/^https:\/\//);
    }
  });

  it("every entry has a regulation citation", () => {
    for (const [slug, entry] of Object.entries(SUBSTANCE_TAXONOMY)) {
      expect(entry.regulationCitation, `${slug} regulationCitation`).toBeTruthy();
      expect(entry.regulationCitation.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("every entry has at least one searchAlias and none contain commas", () => {
    for (const [slug, entry] of Object.entries(SUBSTANCE_TAXONOMY)) {
      expect(entry.searchAliases.length, `${slug} aliases`).toBeGreaterThanOrEqual(1);
      for (const a of entry.searchAliases) {
        expect(a, `${slug} alias "${a}"`).not.toContain(",");
        expect(a.trim().length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("currentScheduleAsOf is ISO YYYY-MM-DD", () => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    for (const [slug, entry] of Object.entries(SUBSTANCE_TAXONOMY)) {
      expect(entry.currentScheduleAsOf, `${slug}`).toMatch(iso);
    }
  });

  it("entry.slug matches its key in the map", () => {
    for (const [k, entry] of Object.entries(SUBSTANCE_TAXONOMY)) {
      expect(entry.slug, `slug mismatch for ${k}`).toBe(k);
    }
  });

  it("currentSchedule uses the canonical schedule status set", () => {
    const allowed = new Set(["I", "II", "III", "IV", "V", "uncontrolled", "state-only"]);
    for (const [slug, entry] of Object.entries(SUBSTANCE_TAXONOMY)) {
      expect(allowed.has(entry.currentSchedule), `${slug} schedule`).toBe(true);
    }
  });

  it("includes coverage for ticket-cited substances (kratom + delta-8 + fentanyl)", () => {
    expect(getSubstanceBySlug("kratom")).not.toBeNull();
    expect(getSubstanceBySlug("delta-8-thc")).not.toBeNull();
    expect(getSubstanceBySlug("fentanyl")).not.toBeNull();
    expect(getSubstanceBySlug("hexahydrocannabinol")).not.toBeNull();
  });

  it("listSubstanceSlugs returns sorted slugs matching the map", () => {
    const slugs = listSubstanceSlugs();
    const expected = Object.keys(SUBSTANCE_TAXONOMY).sort();
    expect(slugs).toEqual(expected);
  });

  it("getSubstanceBySlug returns null on unknown slugs (no fabrication)", () => {
    expect(getSubstanceBySlug("table-salt")).toBeNull();
    expect(getSubstanceBySlug("")).toBeNull();
    expect(getSubstanceBySlug("javascript-injection-<script>")).toBeNull();
  });
});
