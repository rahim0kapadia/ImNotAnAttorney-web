// src/lib/officer-bg/officer-judge-rates-section.ts
import type { OfficerJudgeRatesResult } from "@/lib/cross-corpus/officer-judge-rates";

export function renderOfficerJudgeRatesSection(data: OfficerJudgeRatesResult): string {
  const lines: string[] = [];

  lines.push("## Judge-Conditioned Motion Outcomes");
  lines.push("");
  lines.push(
    `For motions where Officer ${data.officer_name_normalized} (${data.state}) appeared as a witness, ` +
      `here is the per-judge motion-grant rate breakdown:`
  );
  lines.push("");

  // v1 substrate note — render as italic disclosure when present
  if (data.meta.note) {
    lines.push(`*${data.meta.note}*`);
    lines.push("");
  }

  if (data.rows.length === 0) {
    lines.push(
      "*No judge-conditioned signal — sample sizes below threshold (n>=3 per judge × motion-type pair).*"
    );
    lines.push("");
    return lines.join("\n");
  }

  lines.push("| Judge | Motion Type | Filed | Granted | Denied | Grant Rate |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of data.rows.slice(0, 20)) {
    lines.push(
      `| ${r.judge_full_name ?? "(unknown judge)"} | ${r.motion_type} | ${r.sample_size} motions filed | ${r.granted_count} | ${r.denied_count} | ${Math.round(r.grant_rate * 100)}% |`
    );
  }
  lines.push("");
  lines.push(`---`);
  lines.push("");
  lines.push(
    `Sources: classified_opinions × cl_opinions_meta × officer_external_intel (matview ${data.meta.matview})`
  );
  lines.push(`Data as of: ${data.meta.generatedAt}`);
  return lines.join("\n");
}
