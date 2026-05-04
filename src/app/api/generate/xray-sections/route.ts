/**
 * X-Ray Section Assembly Endpoint — E2.
 *
 * POST /api/generate/xray-sections
 *
 * Called by the engine's report.mjs (ImNotAnAttorney-engine/src/workers/report.mjs)
 * as the X-Ray is assembled. The engine posts the case's intake context and
 * this route returns pre-rendered markdown for the two E2 sections:
 *
 *   - X1: Federal PJI Cross-Reference (federal charges only)
 *   - X2: Full Judge Motion Histogram (when a judge is assigned)
 *
 * The engine appends the returned markdown to its Claude prompt as
 * additional "== SECTION X1 ==" / "== SECTION X2 ==" stanzas, the same
 * pattern used for phase-4 intelligence and phase-5 case law.
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
import { createAdminClient } from "@/lib/supabase/admin";
import {
  queryXrayFederalPjiCrossRef,
  renderXrayFederalPjiCrossRef,
} from "@/lib/xray-sections/federal-pji-cross-ref";
import {
  queryXrayJudgeHistogram,
  renderXrayJudgeHistogram,
} from "@/lib/xray-sections/judge-motion-histogram";
import {
  getSentencingDistribution,
  renderSentencingDistribution,
} from "@/lib/ussc/distribution";

export const runtime = "nodejs";
export const maxDuration = 60;

interface XraySectionsBody {
  federalCharge?: string | null;
  circuit?: string | null;
  state?: string | null;
  judgeName?: string | null;
  judgeAuthorId?: number | null;
  caseId?: string | null;
  /** Optional charge slug used for the X3 sentencing-distribution lookup.
   *  Distinct from `federalCharge` (free-text) — chargeType is the INAA
   *  slug `getSentencingDistribution` understands. */
  chargeType?: string | null;
  /** Optional federal district USSC code for the X3 lookup. */
  district?: string | null;
  /** Optional USSC criminal history category for the X3 lookup. */
  criminalHistoryCategory?: string | null;
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
    chargeType = null,
    district = null,
    criminalHistoryCategory = null,
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

  // sentencingDistribution — TICKET-17 — sentencing-distribution overlay.
  // Federal-only (uses USSC offguide mapping). Sample-size floor of 100 cases
  // enforced by getSentencingDistribution at xray tier; below floor falls back
  // to national without lying about district outliers.
  //
  // Response key is "sentencingDistribution" (not "x3") to avoid collision
  // with the "juryInstructions" key added by TICKET-8 on the same route.
  let sentencingDistributionData = null;
  let sentencingDistributionMarkdown = "";
  if (chargeType && chargeType.length > 0) {
    const sb = createAdminClient();
    sentencingDistributionData = await getSentencingDistribution(sb, {
      charge: chargeType,
      district,
      tier: "xray",
      criminalHistoryCategory,
    });
    sentencingDistributionMarkdown = renderSentencingDistribution(sentencingDistributionData);
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
      sentencingDistribution: {
        enabled: Boolean(chargeType),
        isEmpty: !sentencingDistributionData || sentencingDistributionData.coverage_status === "no-data-anywhere",
        coverage_status: sentencingDistributionData?.coverage_status ?? null,
        markdown: sentencingDistributionMarkdown,
        data: sentencingDistributionData,
      },
    },
    { status: 200 },
  );
}
