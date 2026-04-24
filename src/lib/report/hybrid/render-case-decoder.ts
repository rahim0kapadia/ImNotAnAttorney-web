/**
 * Hybrid Case Decoder renderer — mechanical skeleton + parallel Haiku.
 *
 * Orchestration:
 *   1. Render the mechanical skeleton (emits {{SLOT:...}} tokens)
 *   2. Fire all slot Haiku calls in parallel via Promise.allSettled
 *   3. Replace each slot in the skeleton with either the Haiku text
 *      (on fulfilled) or the slot's fallback string (on rejected)
 *   4. Assert zero unreplaced markers remain (invariant)
 *   5. Return { html, costUsd } (sum of all fulfilled call costs)
 *
 * Callers: /api/reports/hybrid/[caseId]/route.ts (operator/dispatcher
 * POST), and indirectly the CD dispatcher when mode='hybrid'.
 */
import {
  CaseDecoderIntake,
  assertNoSlotsRemain,
  replaceSlot,
} from "../mechanical/common";
import { renderCaseDecoderMechanical } from "../mechanical/render-case-decoder";
import { callHaiku } from "./haiku-client";
import { CASE_DECODER_SLOTS } from "./case-decoder-sections";

export type HybridResult = {
  html: string;
  costUsd: number;
  slotsFulfilled: string[];
  slotsFallback: string[];
};

export async function renderCaseDecoderHybrid(
  intake: CaseDecoderIntake,
  apiKey: string,
): Promise<HybridResult> {
  const mech = renderCaseDecoderMechanical(intake);
  let html = mech.html;

  const results = await Promise.allSettled(
    CASE_DECODER_SLOTS.map((def) =>
      callHaiku(apiKey, def.system, def.userPrompt(intake), {
        maxTokens: def.maxTokens,
      }).then((r) => ({ def, r })),
    ),
  );

  let costUsd = 0;
  const fulfilled: string[] = [];
  const fallback: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const def = CASE_DECODER_SLOTS[i];
    const res = results[i];
    if (res.status === "fulfilled") {
      const text = res.value.r.text.trim();
      if (text.length > 0) {
        html = replaceSlot(html, def.slot, text);
        costUsd += res.value.r.costUsd;
        fulfilled.push(def.slot);
        continue;
      }
    }
    // rejected OR empty text → fall back
    html = replaceSlot(html, def.slot, def.fallback);
    fallback.push(def.slot);
    if (res.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error(
        `[hybrid-cd] slot=${def.slot} failed: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`,
      );
    }
  }

  assertNoSlotsRemain(html);

  return { html, costUsd, slotsFulfilled: fulfilled, slotsFallback: fallback };
}
