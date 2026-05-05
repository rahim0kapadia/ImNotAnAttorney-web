// src/lib/tier9-reports/federal-sentencing-bench-fingerprint-section.ts
import type { BenchFingerprintResult } from "@/lib/cross-corpus/bench-fingerprint";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100)}%`;
}

function fmtMo(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(1)} mo`;
}

export function renderFederalSentencingBenchFingerprint(data: BenchFingerprintResult): string {
  const lines: string[] = [];

  lines.push("## Federal Sentencing Bench Fingerprint");
  lines.push("");
  lines.push(`**Judge:** ${data.judge.profile_name}`);
  if (data.judge.district) lines.push(`**District:** ${data.judge.district}`);
  lines.push(`**USSC cases:** ${fmt(data.ussc.total_cases)}`);
  lines.push("");

  if (data.ussc.total_cases === 0) {
    lines.push("*No USSC sentencing data found for this judge.*");
    lines.push("");
    lines.push("---");
    lines.push(`Source: U.S. Sentencing Commission Individual Datafiles via mv_judge_bench_fingerprint.`);
    lines.push(`Data as of: ${data.meta.generatedAt}`);
    return lines.join("\n");
  }

  // Sentence distribution
  lines.push("### Sentence distribution");
  lines.push("");
  lines.push(`| Metric | Months |`);
  lines.push(`|---|---|`);
  lines.push(`| Median | ${fmtMo(data.ussc.median_sentence_months)} |`);
  lines.push(`| Mean | ${fmtMo(data.ussc.mean_sentence_months)} |`);
  lines.push(`| P25 | ${fmtMo(data.ussc.p25_sentence_months)} |`);
  lines.push(`| P75 | ${fmtMo(data.ussc.p75_sentence_months)} |`);
  lines.push("");

  // Departure rates
  lines.push("### Departure rates");
  lines.push("");
  lines.push(`- **Downward departure:** ${fmtPct(data.ussc.downward_departure_rate)}`);
  lines.push(`- **Upward departure:** ${fmtPct(data.ussc.upward_departure_rate)}`);
  lines.push(`- **Substantial assistance (5K1.1):** ${fmtPct(data.ussc.substantial_assistance_rate)}`);
  lines.push(`- **Gov't-sponsored below range:** ${fmtPct(data.ussc.government_sponsored_below_range_rate)}`);
  lines.push("");

  // Caseload from CL dockets
  if (data.caseload.federal_docket_count !== null) {
    lines.push("### Federal docket caseload");
    lines.push("");
    lines.push(`- **Federal dockets (CourtListener):** ${fmt(data.caseload.federal_docket_count)}`);
    if (data.caseload.earliest_docket) lines.push(`- **Earliest docket:** ${data.caseload.earliest_docket}`);
    if (data.caseload.latest_docket) lines.push(`- **Latest docket:** ${data.caseload.latest_docket}`);
    lines.push("");
  }

  // Top-5 offense breakdown
  if (data.breakdowns.offense && Object.keys(data.breakdowns.offense).length > 0) {
    lines.push("### Top offense types sentenced");
    lines.push("");
    const entries = Object.entries(data.breakdowns.offense)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    for (const [offense, count] of entries) {
      lines.push(`- ${offense}: ${count.toLocaleString()} cases`);
    }
    lines.push("");
  }

  // Top-5 criminal history breakdown
  if (data.breakdowns.criminal_history && Object.keys(data.breakdowns.criminal_history).length > 0) {
    lines.push("### Criminal history categories");
    lines.push("");
    const entries = Object.entries(data.breakdowns.criminal_history)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    for (const [cat, count] of entries) {
      lines.push(`- Category ${cat}: ${count.toLocaleString()} cases`);
    }
    lines.push("");
  }

  // Name-similarity disclosure when fuzzy match used
  if (data.name_similarity !== null && data.name_similarity < 0.8) {
    lines.push(
      `> *Note: Judge name matched with similarity score ${data.name_similarity.toFixed(2)} — ` +
      `data may reflect a different judge. Verify cl_person_id before acting on this profile.*`
    );
    lines.push("");
  }

  lines.push("---");
  lines.push(`Source: U.S. Sentencing Commission Individual Datafiles via mv_judge_bench_fingerprint.`);
  lines.push(`Data as of: ${data.meta.generatedAt}`);
  return lines.join("\n");
}
