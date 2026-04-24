/**
 * @fileoverview UPL regression test for the Defense Milestone Score calculator.
 *
 * Locks in the C3.2 scrub of ADVICE-classified observations:
 *   - Parity: every text_hash in the C0 line index must appear in the C3.1 UPL audit
 *   - Row count: lineIndex.length === uplAudit.length
 *   - Zero ADVICE rows remain (post-DELETE/REPHRASE)
 *   - Every observation produced by calculateScore for representative tuples
 *     passes an imperative-ban regex + banned-phrase list + question-form rule
 *
 * Source docs:
 *   - docs/audits/2026-04-24-score-observations-line-index.json (C0 artifact)
 *   - docs/audits/2026-04-24-score-observations-upl.json (C3.1 audit + C3.2 verdicts)
 *   - docs/plans/2026-04-24-worry-score-page-audit.md (plan: Task C3.3)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calculateScore, type ScoreInput } from "@/lib/score";

// ---------------------------------------------------------------------------
// Load both JSON artifacts
// ---------------------------------------------------------------------------
const lineIndexPath = path.join(
  process.cwd(),
  "docs/audits/2026-04-24-score-observations-line-index.json"
);
const uplAuditPath = path.join(
  process.cwd(),
  "docs/audits/2026-04-24-score-observations-upl.json"
);

interface LineIndexRow {
  line: number;
  text_hash: string;
  charge_branch: string;
  attorney_state: string | null;
  time_window: string | null;
  source_snippet: string;
}

interface UplAuditRow {
  line: number;
  text_hash: string;
  classification: string;
  verdict: string;
  proposed_replacement: string;
  stress_bands: string[];
}

const lineIndex: LineIndexRow[] = JSON.parse(readFileSync(lineIndexPath, "utf-8"));
const uplAudit: UplAuditRow[] = JSON.parse(readFileSync(uplAuditPath, "utf-8"));

// ---------------------------------------------------------------------------
// Imperative & banned-phrase gates
// ---------------------------------------------------------------------------
const IMPERATIVE_REGEX =
  /^(Do not|Don't|Never|Always|Make sure|Be sure to|File a|Request a|Demand|Tell your attorney|Ask the court|Submit|Contact|Serve|Preserve|Object|Confirm|Send|Write|Recommended [^.]* action|First-pass action|you should|you must|we recommend|your attorney should)/im;

const BANNED_PHRASES = [
  "your attorney should",
  "you should",
  "we recommend",
  "you must",
];

// ---------------------------------------------------------------------------
// Representative answer tuples across the five bands
// ---------------------------------------------------------------------------
const CHARGES: ScoreInput["chargeType"][] = [
  "dui",
  "drug-possession",
  "drug-trafficking",
  "probation-violation",
  "white-collar",
  "sex-offense",
  "federal-criminal",
  "self-defense",
  "other-felony",
  "other-misdemeanor",
];

type BaseTuple = Omit<ScoreInput, "chargeType">;

const TUPLES: BaseTuple[] = [
  // Crisis/Concerning: no attorney, no milestones, long time since arrest
  {
    hasAttorney: "no",
    timeSinceArrest: "12-plus-months",
    motionsFiled: "no",
    hasDiscovery: "no",
    communicationFrequency: "never",
    strategyDiscussed: "no",
    criminalHistory: "felony",
    caseStage: "pre-trial",
    licensedProfession: "yes-licensed",
  },
  // Average: public defender, mid action
  {
    hasAttorney: "public-defender",
    timeSinceArrest: "3-6-months",
    motionsFiled: "no",
    hasDiscovery: "yes",
    communicationFrequency: "monthly",
    strategyDiscussed: "briefly",
    criminalHistory: "misdemeanor",
    caseStage: "arraigned",
    licensedProfession: "no",
  },
  // Adequate
  {
    hasAttorney: "private",
    timeSinceArrest: "3-6-months",
    motionsFiled: "yes",
    hasDiscovery: "yes",
    communicationFrequency: "monthly",
    strategyDiscussed: "yes-detail",
    criminalHistory: "none",
    caseStage: "pre-trial",
    licensedProfession: "no",
  },
  // Excellent: early window, strong action
  {
    hasAttorney: "private",
    timeSinceArrest: "less-than-1-month",
    motionsFiled: "yes",
    hasDiscovery: "yes",
    communicationFrequency: "weekly",
    strategyDiscussed: "yes-detail",
    criminalHistory: "none",
    caseStage: "arrested",
    licensedProfession: "no",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("score-upl", () => {
  // -------------------------------------------------------------------------
  // Parity checks between C0 line index and C3.1/C3.2 UPL audit
  // -------------------------------------------------------------------------
  it("every text_hash in C0 line index appears in C3.1 UPL audit", () => {
    const uplHashes = new Set(uplAudit.map((r) => r.text_hash));
    for (const row of lineIndex) {
      expect(uplHashes.has(row.text_hash)).toBe(true);
    }
  });

  it("row count parity: lineIndex.length === uplAudit.length", () => {
    expect(lineIndex.length).toBe(uplAudit.length);
  });

  // -------------------------------------------------------------------------
  // Zero ADVICE remaining after C3.2 (DELETE + REPHRASE)
  // -------------------------------------------------------------------------
  it("zero ADVICE rows remaining after C3.2", () => {
    const adviceRows = uplAudit.filter(
      (r) => r.classification === "ADVICE" && r.verdict !== "DELETE"
    );
    expect(adviceRows).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Live score output: imperative regex + banned phrases + question form
  // -------------------------------------------------------------------------
  for (const charge of CHARGES) {
    for (const baseTuple of TUPLES) {
      it(`charge=${charge} band=${baseTuple.caseStage} observations pass imperative regex + banned phrases + question-form`, () => {
        const input: ScoreInput = { chargeType: charge, ...baseTuple };
        const result = calculateScore(input);
        for (const obs of result.observations) {
          // Imperative regex: allow-list exception for "Question to surface" lines
          if (!obs.startsWith("Question to surface")) {
            expect(obs).not.toMatch(IMPERATIVE_REGEX);
          }
          // Banned phrases (always check)
          for (const banned of BANNED_PHRASES) {
            expect(obs.toLowerCase()).not.toContain(banned.toLowerCase());
          }
          // Question form: if starts with "Question to surface", must end with "?"
          if (obs.startsWith("Question to surface")) {
            expect(obs.trim().endsWith("?")).toBe(true);
          }
        }
      });
    }
  }
});
