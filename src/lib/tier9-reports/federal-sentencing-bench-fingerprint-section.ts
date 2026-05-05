// src/lib/tier9-reports/federal-sentencing-bench-fingerprint-section.ts
import type { BenchFingerprintResult } from "@/lib/cross-corpus/bench-fingerprint";

const DIRECTION_LABEL: Record<string, string> = {
  "0": "Within guidelines",
  "1": "Downward departure",
  "2": "Upward departure",
  "3": "Other",
};

export function renderFederalSentencingBenchFingerprint(data: BenchFingerprintResult): string {
  const lines: string[] = [];

  lines.push("## Bench Fingerprint by Departure Reason");
  lines.push("");
  lines.push(
    `For district ${data.district_code} × offense type ${data.offense_type} ` +
      `(USSC FY02-FY24, n=${data.totalCases.toLocaleString()} sentences):`
  );
  lines.push("");

  // Departure reason histogram
  lines.push("### Departure-reason histogram");
  lines.push("");
  if (data.departureReasons.length === 0) {
    lines.push("*Sample size below threshold for this district × offense pair.*");
  } else {
    lines.push("| Direction | Reason | Cases | Median | P25 | P75 |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of data.departureReasons.slice(0, 10)) {
      lines.push(
        `| ${DIRECTION_LABEL[r.departure_direction] ?? r.departure_direction} | ${r.departure_reason} | ${r.sample_size.toLocaleString()} | ${r.median_sentence_months} mo | ${r.p25_sentence_months} mo | ${r.p75_sentence_months} mo |`
      );
    }
  }
  lines.push("");

  // Booker inflection
  lines.push("### Booker Inflection (FY pre-2005 vs post-2005)");
  lines.push("");
  const bi = data.bookerInflection;
  if (bi.pre_booker_count === 0 || bi.post_booker_count === 0) {
    lines.push(
      `*Insufficient data on one side of inflection (pre=${bi.pre_booker_count}, post=${bi.post_booker_count}).*`
    );
  } else {
    lines.push(
      `- Pre-Booker (FY02-FY04): ${bi.pre_booker_count.toLocaleString()} cases, avg ${bi.pre_booker_avg_sentence} mo`
    );
    lines.push(
      `- Post-Booker (FY05-FY24): ${bi.post_booker_count.toLocaleString()} cases, avg ${bi.post_booker_avg_sentence} mo`
    );
    lines.push(
      `- Inflection delta: **${bi.inflection_delta_months} months** (${
        bi.inflection_delta_months !== null && bi.inflection_delta_months < 0
          ? "shorter sentences after Booker"
          : "longer sentences after Booker"
      })`
    );
  }
  lines.push("");

  // Mandatory minimum
  lines.push(`Mandatory-minimum applied in **${data.mandatoryMinPercentage}%** of cases.`);
  lines.push("");
  lines.push(`---`);
  lines.push(`Source: U.S. Sentencing Commission Individual Datafiles via mv_judge_bench_fingerprint.`);
  lines.push(`Data as of: ${data.meta.generatedAt}`);
  return lines.join("\n");
}
