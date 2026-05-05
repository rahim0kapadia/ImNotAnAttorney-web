/**
 * X-Ray Section Assembly Endpoint — E2.
 *
 * POST /api/generate/xray-sections
 *
 * Called by the engine's report.mjs (ImNotAnAttorney-engine/src/workers/report.mjs)
 * as the X-Ray is assembled. The engine posts the case's intake context and
 * this route returns pre-rendered markdown for the E2 sections:
 *
 *   - X1: Federal PJI Cross-Reference (federal charges only)
 *   - X2: Full Judge Motion Histogram (when a judge is assigned)
 *   - X3: Closed-Ecosystem Map — J1 cross-corpus JOIN (judge + officer + similar cases)
 *
 * The engine appends the returned markdown to its Claude prompt as
 * additional "== SECTION X1 ==" / "== SECTION X2 ==" / "== SECTION X3 ==" stanzas,
 * the same pattern used for phase-4 intelligence and phase-5 case law.
 *
 * Keeping this logic in the web repo (TypeScript, typechecked) ensures:
 *   - Single source of truth for X-Ray section queries
 *   - Monotonicity tests run against the same code the engine calls
 *   - No duplication / drift between a TS implementation and an MJS port
 *
 * Auth: operator secret header. Engine runs server-side with the secret;
 * no end-user traffic hits this route.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOperatorSecret } from "@/lib/auth/guards";
import {
  queryXrayFederalPjiCrossRef,
  renderXrayFederalPjiCrossRef,
} from "@/lib/xray-sections/federal-pji-cross-ref";
import {
  queryXrayJudgeHistogram,
  renderXrayJudgeHistogram,
} from "@/lib/xray-sections/judge-motion-histogram";
import { queryClosedEcosystem } from "@/lib/cross-corpus/closed-ecosystem";
import { renderClosedEcosystemSection } from "@/lib/xray-sections/closed-ecosystem-section";

export const runtime = "nodejs";
export const maxDuration = 60;

interface XraySectionsBody {
  federalCharge?: string | null;
  circuit?: string | null;
  state?: string | null;
  judgeName?: string | null;
  judgeAuthorId?: number | null;
  caseId?: string | null;
  // X3 / J1 closed-ecosystem inputs
  arrestingOfficerName?: string | null;
  chargeType?: string | null;
}

export async function POST(req: NextRequest) {
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

  let body: XraySectionsBody;
  try {
    body = (await req.json()) as XraySectionsBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const {
    federalCharge = null,
    circuit = null,
    state = null,
    judgeName = null,
    judgeAuthorId = null,
    caseId = null,
    arrestingOfficerName = null,
    chargeType = null,
  } = body ?? {};

  // X1 — federal PJI cross-reference (federal charges only; query returns
  // isEmpty=true when the charge is not federal or the corpus is thin).
  let x1Data = null;
  let x1Markdown = "";
  if (federalCharge && federalCharge.length > 0) {
    x1Data = await queryXrayFederalPjiCrossRef({
      federalCharge,
      circuit,
      state,
      judgeName,
      caseId,
    });
    x1Markdown = renderXrayFederalPjiCrossRef(x1Data);
  }

  // X2 — full judge motion histogram (requires judge). Query returns
  // isEmpty=true when the judge has no cached rulings.
  let x2Data = null;
  let x2Markdown = "";
  if ((judgeName && judgeName.length > 0) || (judgeAuthorId ?? 0) > 0) {
    x2Data = await queryXrayJudgeHistogram({
      judgeName,
      judgeAuthorId,
    });
    x2Markdown = renderXrayJudgeHistogram(x2Data);
  }

  // X3 — J1 closed-ecosystem map (requires caseId + state). Surfaces every
  // named actor in the case linked to their behavioral history across the
  // cross-corpus substrate (judge_profiles, entities_officers, case_feature_vectors).
  // Gated on caseId + state because the matview substrate is keyed per-case.
  let x3Data = null;
  let x3Markdown = "";
  if (caseId && caseId.length > 0 && state && state.length > 0) {
    x3Data = await queryClosedEcosystem({
      caseId,
      state,
      judgeFullName: judgeName,
      arrestingOfficerName,
      chargeType,
    });
    x3Markdown = renderClosedEcosystemSection(x3Data);
  }

  return NextResponse.json(
    {
      x1: {
        enabled: Boolean(federalCharge),
        isEmpty: x1Data?.isEmpty ?? true,
        federalOnly: x1Data?.federalOnly ?? false,
        markdown: x1Markdown,
        data: x1Data,
      },
      x2: {
        enabled: Boolean(judgeName || judgeAuthorId),
        isEmpty: x2Data?.isEmpty ?? true,
        markdown: x2Markdown,
        data: x2Data,
      },
      x3: {
        enabled: Boolean(caseId && state),
        isEmpty: x3Data === null,
        markdown: x3Markdown,
        data: x3Data,
      },
    },
    { status: 200 },
  );
}
