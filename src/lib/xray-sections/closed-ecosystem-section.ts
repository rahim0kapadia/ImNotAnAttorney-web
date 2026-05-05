// src/lib/xray-sections/closed-ecosystem-section.ts
import type { ClosedEcosystemResult } from "@/lib/cross-corpus/types";

const UPL_BANNED = ["you should", "we recommend", "ask your attorney to"];

/**
 * Validate that a DB-sourced URL uses only http or https scheme.
 * Prevents markdown injection via javascript: or data: URLs from malicious DB values.
 */
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString();
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100)}%`;
}

export function renderClosedEcosystemSection(data: ClosedEcosystemResult): string {
  const lines: string[] = [];

  lines.push("## Closed-Ecosystem Map");
  lines.push("");
  lines.push(
    "Every named actor in your case linked to their behavioral history. " +
      "All data sourced from public records — no opinions, only patterns."
  );
  lines.push("");

  // Judge section
  if (data.judge) {
    const j = data.judge;
    lines.push(`### Judge: ${j.full_name}`);
    lines.push("");
    lines.push(`- **Court:** ${j.court ?? "—"}`);
    lines.push(`- **Bench acquittal rate:** ${fmtPct(j.bench_acquittal_rate)}`);
    lines.push(`- **Jury acquittal rate:** ${fmtPct(j.jury_acquittal_rate)}`);
    lines.push(`- **Reversal rate (appellate):** ${fmtPct(j.reversal_rate)}`);
    lines.push(`- **Motion grant rate (overall disposition):** ${fmtPct(j.disposition_grant_rate)}`);
    lines.push("");
    if (data.judgeDocketCaseload) {
      const dc = data.judgeDocketCaseload;
      lines.push("**Federal docket caseload:**");
      lines.push("");
      lines.push(`- **Total dockets:** ${fmt(dc.total_dockets)}`);
      lines.push(`- **Criminal:** ${fmt(dc.criminal_dockets)} (${fmtPct(dc.criminal_fraction)})`);
      lines.push(`- **Civil:** ${fmt(dc.civil_dockets)}`);
      if (dc.primary_court_id) lines.push(`- **Primary court:** ${dc.primary_court_id}`);
      if (dc.years_on_bench !== null) lines.push(`- **Years on bench:** ${dc.years_on_bench}`);
      lines.push("");
    }
    if (data.judgeConflicts.length > 0) {
      lines.push("**Financial / civil-party conflicts:**");
      lines.push("");
      for (const c of data.judgeConflicts.slice(0, 5)) {
        const safeSource = safeUrl(c.source_url);
        const url = safeSource ? ` ([source](${safeSource}))` : "";
        lines.push(`- ${c.match_type}: ${c.company_or_party} (${c.disclosure_year ?? "—"})${url}`);
      }
      lines.push("");
    }
  } else {
    lines.push("### Judge: insufficient data");
    lines.push("");
  }

  // Officer section
  if (data.arrestingOfficer) {
    const o = data.arrestingOfficer;
    lines.push(`### Officer: ${o.full_name}`);
    lines.push("");
    lines.push(`- **Agency:** ${o.agency ?? "—"}`);
    lines.push(`- **Badge:** ${o.badge_number ?? "—"}`);
    lines.push(`- **Complaints (CPD/NYPD-style):** ${o.total_complaints}`);
    lines.push(`- **External-intel records:** ${o.external_intel_count}`);
    if (o.provenance_source) lines.push(`- **Data source:** ${o.provenance_source}`);
    lines.push("");
  }

  // Similar cases
  if (data.similarCases.length > 0) {
    lines.push("### Similar prior cases");
    lines.push("");
    for (const sc of data.similarCases.slice(0, 5)) {
      const cite = sc.citation ? ` *${sc.citation}*` : "";
      lines.push(
        `- ${sc.case_name ?? "—"}${cite} (${sc.year ?? "—"}) — ${sc.outcome ?? "outcome unknown"}`
      );
    }
    lines.push("");
  }

  // UPL footer
  lines.push("---");
  lines.push("");
  lines.push(`Sources: ${data.upl.sourcesCited.join(", ")}`);
  lines.push(`Data as of: ${data.upl.dataAsOf}`);
  lines.push("");
  lines.push(
    "*This is information, not legal advice. Discuss with your attorney before acting on any pattern surfaced here.*"
  );

  const md = lines.join("\n");
  // UPL guard
  for (const phrase of UPL_BANNED) {
    if (md.toLowerCase().includes(phrase)) {
      throw new Error(`UPL violation: rendered output contains banned phrase "${phrase}"`);
    }
  }
  return md;
}
