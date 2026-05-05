// src/lib/war-room/cross-corpus-sections.ts
// Template: src/app/api/generate/xray-sections/route.ts (pattern for composing query + render)
// Expert: lukas-fittl (matview pattern, pre-aggregated over indexed matviews)
import { queryClosedEcosystem } from "@/lib/cross-corpus/closed-ecosystem";
import { queryOfficerJudgeRates } from "@/lib/cross-corpus/officer-judge-rates";
import { queryBenchFingerprint } from "@/lib/cross-corpus/bench-fingerprint";
import { renderClosedEcosystemSection } from "@/lib/xray-sections/closed-ecosystem-section";
import { renderOfficerJudgeRatesSection } from "@/lib/officer-bg/officer-judge-rates-section";
import { renderFederalSentencingBenchFingerprint } from "@/lib/tier9-reports/federal-sentencing-bench-fingerprint-section";

export interface WarRoomCrossCorpusInput {
  caseId: string;
  judgeName: string;
  state: string;
  chargeType?: string | null;
  officerName?: string | null;
}

export interface WarRoomCrossCorpusSections {
  closedEcosystem: string;
  officerJudgeRates: string | null;
  benchFingerprint: string;
  /** Combined markdown for all three sections */
  combined: string;
}

/**
 * Compose all 3 cross-corpus intelligence sections for the War Room SKU.
 *
 * Calls:
 *   1. queryClosedEcosystem → renderClosedEcosystemSection
 *   2. queryOfficerJudgeRates → renderOfficerJudgeRatesSection (if officer provided)
 *   3. queryBenchFingerprint → renderFederalSentencingBenchFingerprint
 *
 * Results are run in parallel where possible. Officer section is conditionally
 * skipped if no officerName is provided (War Room cases may not have an
 * arresting officer identified yet).
 *
 * Sample size floor n>=2 (Lissner/Free Law Project) is applied inside each
 * query module.
 */
export async function renderWarRoomCrossCorpusSections(
  input: WarRoomCrossCorpusInput
): Promise<WarRoomCrossCorpusSections> {
  const { caseId, judgeName, state, chargeType, officerName } = input;

  // Build parallel promises. Officer is conditional.
  const ecosystemPromise = queryClosedEcosystem({
    caseId,
    judgeFullName: judgeName,
    state,
    chargeType: chargeType ?? undefined,
    arrestingOfficerName: officerName ?? undefined,
  });

  const fingerprintPromise = queryBenchFingerprint({
    judgeFullName: judgeName,
  });

  const officerPromise = officerName
    ? queryOfficerJudgeRates({
        officerNameNormalized: officerName.toLowerCase().trim(),
        state,
      })
    : Promise.resolve(null);

  const [ecosystemResult, fingerprintResult, officerResult] = await Promise.all([
    ecosystemPromise,
    fingerprintPromise,
    officerPromise,
  ]);

  const closedEcosystem = renderClosedEcosystemSection(ecosystemResult);
  const benchFingerprint = renderFederalSentencingBenchFingerprint(fingerprintResult);
  const officerJudgeRates = officerResult
    ? renderOfficerJudgeRatesSection(officerResult)
    : null;

  const sections = [closedEcosystem, officerJudgeRates, benchFingerprint].filter(
    (s): s is string => s !== null
  );

  const combined = sections.join("\n\n---\n\n");

  return {
    closedEcosystem,
    officerJudgeRates,
    benchFingerprint,
    combined,
  };
}
