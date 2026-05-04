/**
 * X-Ray Section — "What the Jury Will Hear" (TICKET-8).
 *
 * Per-charge verbatim pattern jury instruction lookup wired into the X-Ray
 * ($2,497). For a defendant with one OR MORE federal charges, this section
 * renders — for each charge — the verbatim circuit-pattern instruction the
 * jury will receive, with per-element burden-of-proof bullets the
 * prosecution must hit.
 *
 * Mercer voice (CHARM mode, addressing the defendant):
 *   "These are the exact words a jury will hear from the bench. Each bullet
 *    is a thing they have to prove. Treat each one as a separate fight."
 *
 * Reuses the FJIB resolver (`queryFederalJuryBrief` from
 * `@/lib/tier9-reports/federal-jury-instruction-brief`) verbatim. This module
 * only LOOPS over charges and re-frames the existing data with a per-charge
 * "What the Jury Will Hear" render. No new SQL, no re-implementation of the
 * circuit fallback or matching logic.
 *
 * Coverage gate: same as FJIB — pattern instructions exist in our corpus
 * for circuits {1, 3, 4, 5, 6, 7, 8, 9, 13}. When the defendant's circuit
 * is OUT of scope, FJIB's resolver returns the closest-sibling circuit's
 * instruction with a `limitations[]` note; this section preserves that
 * transparent-fallback note in the per-charge render so the defendant sees
 * EXACTLY which circuit's instruction they're reading.
 *
 * Tier monotonicity (HARD):
 *   - This is X-Ray ONLY. M4 ($97 FJIB) is single-charge; this section is
 *     multi-charge. The single-charge path remains M4's territory.
 *   - Element bullets are extracted from the same PJI body the jury hears,
 *     verbatim — no LLM paraphrasing.
 *
 * UPL (HARD):
 *   - PJI text is verbatim public federal court material — carved out of
 *     UPL scanning via the standard `<div class="pji-framing">` /
 *     `<div class="pji-body">` wrappers (same pattern as M4 + X1).
 *   - Mercer-voice intro is question/contextual framing, not directive.
 *     "These are the exact words..." is information; "Each bullet is a
 *     thing they have to prove" is information; "Treat each one as a
 *     separate fight" is the closest the section comes to a directive,
 *     and it is framed as the defendant's own approach to the data, NOT
 *     advice from us about strategy. (UPL banned-phrase list does not
 *     prohibit the literal phrase; the test asserts the full
 *     UPL_BANNED_PHRASES list is absent outside PJI carve-outs.)
 *   - Federal-only gate inherited from FJIB; non-federal charges return
 *     `isEmpty: true` and the X-Ray assembler skips the section cleanly.
 *
 * Cited experts:
 *   - Hormozi Grand Slam — adds depth to existing $2,497 tier without
 *     price change. Per-charge coverage compounds value when the case has
 *     multiple federal counts.
 *
 * Sources:
 *   docs/handoffs/2026-05-03-ticket-8-pji-xray-handoff.md
 *
 * Consumed by:
 *   - X-Ray assembly via `/api/generate/xray-sections` (chargeSlugs[] field
 *     added to route).
 *   - Unit tests in ./__tests__/jury-instruction-section.test.ts
 */

import {
  queryFederalJuryBrief,
  isFederalCharge,
  CIRCUIT_NAMES,
  PJI_COVERED_CIRCUITS,
  type FederalJuryBriefData,
  type FederalJuryBriefInput,
} from "@/lib/tier9-reports/federal-jury-instruction-brief";

// ============================================================
// Types
// ============================================================

export interface JuryInstructionSectionInput {
  chargeSlugs: string[]; // one or more federal charge slugs (FEDERAL_CHARGES keys)
  circuit?: string | null; // "1".."11", "13", "DC"
  state?: string | null; // 2-letter postal; used by FJIB to derive circuit
}

/**
 * Per-charge resolved data. Wraps a FederalJuryBriefData with the
 * additional per-charge metadata the section render needs (e.g., the
 * specific element bullets we extracted, the resolved circuit, and the
 * fallback flag).
 */
export interface PerChargeJuryInstruction {
  chargeSlug: string;
  chargeLabel: string;
  /** True when the charge slug is not federal (FJIB rejects). */
  federalOnly: boolean;
  /** True when no PJI in our corpus matched the charge. */
  isEmpty: boolean;
  /** The defendant's resolved circuit, or null when un-resolvable. */
  requestedCircuit: string | null;
  requestedCircuitName: string | null;
  /**
   * The circuit whose pattern instruction we actually rendered. May
   * differ from `requestedCircuit` when the defendant's circuit is out of
   * scope and FJIB substituted the closest-sibling circuit.
   */
  renderedCircuit: number | null;
  renderedCircuitName: string | null;
  /** True when `renderedCircuit !== requestedCircuit`. */
  usedSiblingFallback: boolean;
  /**
   * True when the defendant's resolved circuit is in
   * PJI_COVERED_CIRCUITS — i.e., we have a primary instruction for that
   * circuit and did NOT need the sibling fallback.
   */
  inCoverageScope: boolean;
  /** Verbatim PJI body (when `isEmpty === false`). */
  pjiBody: string | null;
  pjiInstructionNumber: string | null;
  pjiTitle: string | null;
  pjiSourceUrl: string | null;
  /**
   * Element-level burden-of-proof bullets extracted verbatim from the PJI
   * body. Reuses FJIB's `extractBurdenSentences` via the resolver.
   */
  elementBullets: string[];
  /** Per-charge limitations (e.g., sibling-fallback note). */
  limitations: string[];
}

export interface JuryInstructionSectionData {
  perCharge: PerChargeJuryInstruction[];
  /** True when no charge in `chargeSlugs` produced any PJI content. */
  isEmpty: boolean;
}

// ============================================================
// Query — per-charge loop over FJIB resolver
// ============================================================

/**
 * Resolve one PJI per charge by calling the existing FJIB resolver.
 * Reuses circuit fallback, federal-only gate, statute-pattern matching,
 * and limitations[] from FJIB. This module does no SQL of its own.
 */
export async function queryJuryInstructionSection(
  input: JuryInstructionSectionInput,
): Promise<JuryInstructionSectionData> {
  const slugs = Array.isArray(input.chargeSlugs)
    ? input.chargeSlugs.filter((s) => typeof s === "string" && s.length > 0)
    : [];

  if (slugs.length === 0) {
    return { perCharge: [], isEmpty: true };
  }

  // De-dupe while preserving order.
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const s of slugs) {
    if (seen.has(s)) continue;
    seen.add(s);
    dedup.push(s);
  }

  const perCharge: PerChargeJuryInstruction[] = [];
  for (const slug of dedup) {
    const fjibInput: FederalJuryBriefInput = {
      federalCharge: slug,
      circuit: input.circuit ?? "",
      state: input.state ?? null,
    };
    const data = await queryFederalJuryBrief(fjibInput);
    perCharge.push(toPerCharge(slug, data));
  }

  const isEmpty = perCharge.every((p) => p.isEmpty);
  return { perCharge, isEmpty };
}

function toPerCharge(
  slug: string,
  data: FederalJuryBriefData,
): PerChargeJuryInstruction {
  const requestedCircuit = data.circuit;
  const requestedCircuitName = data.circuitName;
  const renderedCircuit = data.pji ? data.pji.circuit : null;
  const renderedCircuitName =
    renderedCircuit !== null
      ? CIRCUIT_NAMES[String(renderedCircuit)] ?? `${renderedCircuit} Circuit`
      : null;

  // Sibling-fallback when the rendered circuit's number doesn't match the
  // requested circuit number. "DC" is non-numeric — when the user is in DC
  // and FJIB returns a numeric circuit, that's a sibling-fallback by
  // definition.
  let usedSiblingFallback = false;
  if (requestedCircuit && renderedCircuit !== null) {
    const reqNum = Number(requestedCircuit);
    if (Number.isNaN(reqNum) || reqNum !== renderedCircuit) {
      usedSiblingFallback = true;
    }
  }

  // In coverage scope iff the defendant's requested circuit is in
  // PJI_COVERED_CIRCUITS AND we didn't need to fall back.
  let inCoverageScope = false;
  if (requestedCircuit && !usedSiblingFallback) {
    const reqNum = Number(requestedCircuit);
    if (!Number.isNaN(reqNum) && PJI_COVERED_CIRCUITS.has(reqNum)) {
      inCoverageScope = true;
    }
  }

  // Element bullets come from FJIB's verbatim burden-of-proof extraction —
  // no LLM paraphrasing, no re-write. Same data the M4 product surfaces,
  // re-framed here as element-level "things the prosecution must prove".
  const elementBullets = data.burdenSentences.map((b) => b.sentence);

  return {
    chargeSlug: slug,
    chargeLabel: data.federalChargeLabel,
    federalOnly: data.federalOnly,
    isEmpty: data.isEmpty,
    requestedCircuit,
    requestedCircuitName,
    renderedCircuit,
    renderedCircuitName,
    usedSiblingFallback,
    inCoverageScope,
    pjiBody: data.pji?.body ?? null,
    pjiInstructionNumber: data.pji?.instruction_number ?? null,
    pjiTitle: data.pji?.title ?? null,
    pjiSourceUrl: data.pji?.source_url ?? null,
    elementBullets,
    limitations: data.limitations,
  };
}

// ============================================================
// Helpers shared with the resolver (re-export thin surface)
// ============================================================

export { isFederalCharge, PJI_COVERED_CIRCUITS };

// ============================================================
// Render — markdown matching X-Ray section conventions
// ============================================================

function mdEscape(s: string): string {
  return (s ?? "").split("|").join("\\|");
}

/**
 * Render the "What the Jury Will Hear" section as markdown. The X-Ray
 * assembler post-processes this with the same md2html pipeline used for
 * IB Appendix G / F and the existing X1 / X2 sections.
 *
 * Returns "" when the section has no content (X-Ray assembler skips the
 * section cleanly when empty — same convention as X1).
 */
export function renderJuryInstructionSection(
  data: JuryInstructionSectionData,
): string {
  if (data.isEmpty) return "";

  // Drop empty per-charge entries from the render (charge had no match
  // OR was non-federal). The render only shows charges with content.
  const renderable = data.perCharge.filter((p) => !p.isEmpty);
  if (renderable.length === 0) return "";

  const lines: string[] = [];
  lines.push(`## Section X3: What the Jury Will Hear`);
  lines.push(``);
  // Mercer voice — CHARM mode. Information framing, not directive.
  // The "Treat each one as a separate fight" framing is the defendant's
  // own approach to the data, not advice from us about strategy.
  lines.push(
    `These are the exact words a jury will hear from the bench for each charge on file. Each bullet under an instruction is one element the prosecution has to prove — and each one is a separate fight. Pattern jury instructions are not themselves binding law (the trial judge can modify them), but the language below is the public text federal trial courts in the named circuit start from.`,
  );
  lines.push(``);

  for (const p of renderable) {
    lines.push(`### ${mdEscape(p.chargeLabel)}`);
    lines.push(``);

    if (p.pjiInstructionNumber || p.renderedCircuitName) {
      const instLabel = p.pjiInstructionNumber
        ? `Instruction ${mdEscape(p.pjiInstructionNumber)}`
        : "Pattern instruction";
      const titleSuffix = p.pjiTitle ? ` — ${mdEscape(p.pjiTitle)}` : "";
      const circLine = p.renderedCircuitName
        ? `${mdEscape(p.renderedCircuitName)}`
        : "";
      lines.push(`**${instLabel}${titleSuffix}**`);
      if (circLine) {
        lines.push(`${circLine}`);
      }
      lines.push(``);
    }

    // Transparent fallback disclosure — REQUIRED by acceptance criteria.
    // When the defendant's circuit is out of scope, name BOTH circuits
    // explicitly so the defendant knows exactly which circuit's
    // instruction they're reading and which one their case is in.
    if (p.usedSiblingFallback && p.requestedCircuitName && p.renderedCircuitName) {
      lines.push(
        `> **Note on circuit coverage.** Our corpus does not include a pattern instruction for the ${mdEscape(
          p.requestedCircuitName,
        )} for this charge. The instruction below is from the ${mdEscape(
          p.renderedCircuitName,
        )} — the closest available reference. Element phrasing is similar across circuits but is not identical; the trial judge may use a different version.`,
      );
      lines.push(``);
    } else if (p.usedSiblingFallback && p.renderedCircuitName) {
      // Requested circuit unknown but a fallback was used — disclose still.
      lines.push(
        `> **Note on circuit coverage.** Showing the ${mdEscape(
          p.renderedCircuitName,
        )} instruction as the closest available reference. The trial judge may use a different version.`,
      );
      lines.push(``);
    }

    // Verbatim PJI body — wrapped in the standard pji-framing + pji-body
    // div pair so UPL scanners carve it out (same pattern as M4 + X1).
    if (p.pjiBody) {
      lines.push(`<div class="pji-framing">`);
      lines.push(``);
      lines.push(`**Pattern Jury Instruction — Verbatim**`);
      lines.push(``);
      lines.push(
        `The text below is the pattern instruction as issued by the Circuit Court, read verbatim to the jury for this charge. Phrases like "you should" or "the jury should" refer to the jury's deliberation duty — they are NOT legal advice from us to you.`,
      );
      lines.push(``);
      lines.push(`</div>`);
      lines.push(``);
      lines.push(`<div class="pji-body">`);
      lines.push(``);
      lines.push(`> ${p.pjiBody.split("\n").join("\n> ")}`);
      lines.push(``);
      lines.push(`</div>`);
      lines.push(``);
    }

    // Element-level burden bullets — verbatim sentences extracted from the
    // PJI body that mention burden-of-proof phrases. These ARE the
    // element-by-element bullets the prosecution must hit.
    if (p.elementBullets.length > 0) {
      lines.push(`**What the prosecution has to prove:**`);
      for (const sentence of p.elementBullets) {
        lines.push(`- "${mdEscape(sentence)}"`);
      }
      lines.push(``);
    } else {
      // Graceful fallback when no burden-keyed sentence was extracted.
      // The PJI body itself is still rendered above; the missing bullet
      // list is information, not a defect.
      lines.push(
        `*No standalone burden-of-proof sentences were extracted from this instruction; the elements appear inside the verbatim text above.*`,
      );
      lines.push(``);
    }

    if (p.pjiSourceUrl) {
      lines.push(`[Primary source](${p.pjiSourceUrl})`);
      lines.push(``);
    }

    if (p.limitations.length > 0) {
      lines.push(`*Known limitations for this charge:*`);
      for (const l of p.limitations) {
        lines.push(`- ${mdEscape(l)}`);
      }
      lines.push(``);
    }
  }

  // Methodology gate — same legal-INFORMATION framing as M4 / X1.
  lines.push(
    `**Methodology.** This section provides legal INFORMATION, not legal ADVICE. Pattern jury instructions are public federal court material; the verbatim text above is what the trial judge starts from when instructing the jury for each charge. The judge may modify the instruction. Element bullets are extracted verbatim from the same instruction text — no paraphrasing. When our corpus does not include the defendant's exact circuit, the closest sibling circuit is shown and the substitution is disclosed in line. No part of this section is a prediction — it is a map of what is already in the record.`,
  );

  return "\n" + lines.join("\n") + "\n";
}
