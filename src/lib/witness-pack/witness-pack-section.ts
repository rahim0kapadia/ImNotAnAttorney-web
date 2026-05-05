// src/lib/witness-pack/witness-pack-section.ts
// Template: src/lib/xray-sections/closed-ecosystem-section.ts
import type { WitnessProfileResult } from "@/lib/cross-corpus/witness-profile";

const UPL_BANNED = ["you should", "we recommend", "ask your attorney to"];

function fmt(n: number): string {
  return n.toLocaleString();
}

/**
 * Render a Witnesses section for the Witness Pack add-on.
 * Returns markdown string with UPL guard.
 */
export function renderWitnessPackSection(data: WitnessProfileResult): string {
  const lines: string[] = [];

  lines.push("## Witnesses");
  lines.push("");
  lines.push(
    "Public-record witness and expert-witness appearances in similar cases in your state. " +
      "All data sourced from court opinion text — no opinions, only patterns."
  );
  lines.push("");

  if (data.sample_size < 2) {
    lines.push(
      "*Insufficient case sample for witness pattern analysis in this state/charge combination.*"
    );
    lines.push("");
  } else {
    lines.push(`**Cases analyzed:** ${fmt(data.sample_size)}`);
    if (data.chargeType) lines.push(`**Charge type:** ${data.chargeType}`);
    lines.push(`**State:** ${data.state}`);
    lines.push("");

    if (data.witnesses.length > 0) {
      lines.push("### Common Witnesses");
      lines.push("");
      lines.push("| Witness Name | Appearances |");
      lines.push("|---|---|");
      for (const w of data.witnesses) {
        lines.push(`| ${w.name} | ${fmt(w.case_count)} |`);
      }
      lines.push("");
      lines.push(
        "*Witness names appearing in 2+ similar cases. Cross-reference against your case documents.*"
      );
      lines.push("");
    } else {
      lines.push("*No recurring witness names identified for this case profile.*");
      lines.push("");
    }

    if (data.experts.length > 0) {
      lines.push("### Expert Witnesses");
      lines.push("");
      lines.push("| Expert Name | Appearances |");
      lines.push("|---|---|");
      for (const e of data.experts) {
        lines.push(`| ${e.name} | ${fmt(e.case_count)} |`);
      }
      lines.push("");
      lines.push(
        "*Expert witnesses appearing in 2+ similar cases. Your attorney can research their prior testimony.*"
      );
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`Source: classified_opinions (public court records) via ImNotAnAttorney.`);
  lines.push(`Data as of: ${data.meta.generatedAt}`);
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
