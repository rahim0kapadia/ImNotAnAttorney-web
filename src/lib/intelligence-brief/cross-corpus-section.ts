// src/lib/intelligence-brief/cross-corpus-section.ts
//
// Intelligence Brief ($997) cross-corpus section renderer.
//
// Renders: Judge Bench Fingerprint + Federal Docket Caseload + Disclosed Conflicts.
//
// Deliberately EXCLUDES:
//   - Officer-judge motion rates (X-Ray differentiator)
//   - Similar-cases full map (X-Ray differentiator)
//   - Arresting officer profile (X-Ray differentiator)
//
// UPL constraint: information only — no directives, no recommendations.

import type { IBJudgeIntelligenceResult } from "../cross-corpus/intelligence-brief-subset";

// ────────────────────────────────────────────────────────────────
// UPL guard — banned directive phrases
// ────────────────────────────────────────────────────────────────

const UPL_BANNED = ["you should", "we recommend", "ask your attorney to"];

// ────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100)}%`;
}

function fmtMo(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(1)} mo`;
}

/**
 * Validate that a DB-sourced URL uses only http or https scheme.
 * Prevents markdown injection via javascript: or data: URLs from malicious DB values.
 */
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

// ────────────────────────────────────────────────────────────────
// Renderer
// ────────────────────────────────────────────────────────────────

/**
 * IB-CC — Intelligence Brief cross-corpus section renderer.
 *
 * Returns a markdown string for insertion into the Intelligence Brief.
 * Throws if output contains any UPL-banned directive phrase.
 */
export function renderIBCrossCorpusSection(data: IBJudgeIntelligenceResult): string {
  const lines: string[] = [];

  lines.push("## Judge Intelligence");
  lines.push("");
  lines.push(
    "Public-record data on the judge assigned to your case. " +
      "All figures sourced from federal sentencing records and CourtListener dockets — no opinions, only patterns."
  );
  lines.push("");

  if (!data.meta.judgeResolved || !data.judge) {
    lines.push("*Judge name could not be matched to a verified profile. " +
      "Provide the judge's full name as it appears on case documents for a complete analysis.*");
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      "*This is public-record information, not legal advice. Discuss any patterns with your attorney before drawing conclusions.*"
    );
    const md = lines.join("\n");
    assertNoUPL(md);
    return md;
  }

  const { judge, bench, caseload, conflicts } = data;

  // ── Judge identification ──────────────────────────────────────
  lines.push(`### ${judge.full_name}`);
  lines.push("");
  if (judge.court) lines.push(`- **Court:** ${judge.court}`);
  lines.push("");

  // ── Bench fingerprint (USSC sentencing data) ─────────────────
  if (bench && bench.total_cases > 0) {
    lines.push("#### Federal Sentencing Profile");
    lines.push("");
    lines.push(`**Cases in USSC dataset:** ${fmt(bench.total_cases)}`);
    if (bench.district) lines.push(`**District:** ${bench.district}`);
    lines.push("");

    lines.push("**Sentence distribution:**");
    lines.push("");
    lines.push(`| Metric | Months |`);
    lines.push(`|---|---|`);
    lines.push(`| Median | ${fmtMo(bench.median_sentence_months)} |`);
    lines.push(`| Mean | ${fmtMo(bench.mean_sentence_months)} |`);
    lines.push(`| P25 | ${fmtMo(bench.p25_sentence_months)} |`);
    lines.push(`| P75 | ${fmtMo(bench.p75_sentence_months)} |`);
    lines.push("");

    lines.push("**Departure rates:**");
    lines.push("");
    lines.push(`- **Downward departure:** ${fmtPct(bench.downward_departure_rate)}`);
    lines.push(`- **Upward departure:** ${fmtPct(bench.upward_departure_rate)}`);
    lines.push(`- **Substantial assistance (5K1.1):** ${fmtPct(bench.substantial_assistance_rate)}`);
    lines.push("");
  } else if (bench) {
    lines.push("#### Federal Sentencing Profile");
    lines.push("");
    lines.push("*No USSC sentencing records found for this judge in the federal dataset.*");
    lines.push("");
  }

  // ── Docket caseload ─────────────────────────────────────────
  if (caseload) {
    lines.push("#### Federal Docket Caseload");
    lines.push("");
    lines.push(`- **Total federal dockets:** ${fmt(caseload.total_dockets)}`);
    lines.push(`- **Criminal dockets:** ${fmt(caseload.criminal_dockets)} (${fmtPct(caseload.criminal_fraction)} of total)`);
    lines.push(`- **Civil dockets:** ${fmt(caseload.civil_dockets)}`);
    if (caseload.primary_court_id) lines.push(`- **Primary court:** ${caseload.primary_court_id}`);
    if (caseload.years_on_bench !== null && caseload.years_on_bench !== undefined) {
      lines.push(`- **Years on bench:** ${caseload.years_on_bench}`);
    }
    lines.push("");
  }

  // ── Financial / civil-party conflicts (cap 5 for IB tier) ────
  if (conflicts.length > 0) {
    lines.push("#### Disclosed Conflicts");
    lines.push("");
    lines.push(
      "Financial disclosure records flagged civil-party overlaps with this judge " +
        "(up to 5 shown at this tier):"
    );
    lines.push("");
    for (const c of conflicts.slice(0, 5)) {
      const safeSource = safeUrl(c.source_url);
      const urlPart = safeSource ? ` ([disclosure](${safeSource}))` : "";
      lines.push(
        `- **${c.match_type ?? "civil_party"}:** ${c.company_or_party} (${c.disclosure_year ?? "year unknown"})${urlPart}`
      );
    }
    lines.push("");
  }

  // ── Footer ───────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push(
    "Sources: U.S. Sentencing Commission Individual Datafiles, CourtListener federal dockets, " +
      "federal judicial financial disclosures."
  );
  lines.push(`Data compiled: ${data.meta.generatedAt}`);
  lines.push("");
  lines.push(
    "*This is public-record information, not legal advice. " +
      "Discuss any patterns with your attorney before drawing conclusions about your case.*"
  );

  const md = lines.join("\n");
  assertNoUPL(md);
  return md;
}

function assertNoUPL(md: string): void {
  for (const phrase of UPL_BANNED) {
    if (md.toLowerCase().includes(phrase)) {
      throw new Error(`UPL violation: rendered output contains banned phrase "${phrase}"`);
    }
  }
}
