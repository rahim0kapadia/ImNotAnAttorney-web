/**
 * X-Ray Section Assembly Endpoint — E2.
 *
 * POST /api/generate/xray-sections
 *
 * Called by the engine's report.mjs (ImNotAnAttorney-engine/src/workers/report.mjs)
 * as the X-Ray is assembled. The engine posts the case's intake context and
 * this route returns pre-rendered markdown for the X-Ray sections:
 *
 *   - X1: Federal PJI Cross-Reference (federal charges only — single charge)
 *   - X2: Full Judge Motion Histogram (when a judge is assigned)
 *   - X3: What the Jury Will Hear — per-charge verbatim PJI for ALL federal
 *         charges on file (TICKET-8). Reuses the FJIB resolver in a
 *         per-charge loop; renders each charge's instruction with element-
 *         level burden bullets and Mercer-voice framing.
 *
 * The engine appends the returned markdown to its Claude prompt as
 * additional "== SECTION X1 ==" / "== SECTION X2 ==" / "== SECTION X3 =="
 * stanzas, the same pattern used for phase-4 intelligence and phase-5
 * case law.
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
import {
  queryJuryInstructionSection,
  renderJuryInstructionSection,
} from "@/lib/xray-sections/jury-instruction-section";

export const runtime = "nodejs";
export const maxDuration = 60;

interface XraySectionsBody {
  federalCharge?: string | null;
  /**
   * TICKET-8 — list of federal charge slugs for the per-charge "What the
   * Jury Will Hear" section (X3). When present, X3 renders one verbatim
   * pattern instruction per charge. When absent, X3 is omitted from the
   * response. `federalCharge` (singular) still drives X1 independently.
   */
  chargeSlugs?: string[] | null;
  circuit?: string | null;
  state?: string | null;
  judgeName?: string | null;
  judgeAuthorId?: number | null;
  caseId?: string | null;
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
    chargeSlugs = null,
    circuit = null,
    state = null,
    judgeName = null,
    judgeAuthorId = null,
    caseId = null,
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

  // X3 — TICKET-8 — per-charge "What the Jury Will Hear". Reuses the FJIB
  // resolver per charge in `chargeSlugs[]`. When `chargeSlugs` is absent
  // OR empty, X3 is omitted (engine assembler skips the section cleanly).
  // We accept `chargeSlugs` separately from the X1 single-charge field so
  // engines can still call X1 and X3 independently during the rollout.
  let x3Data = null;
  let x3Markdown = "";
  const x3Slugs = Array.isArray(chargeSlugs)
    ? chargeSlugs.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      )
    : [];
  if (x3Slugs.length > 0) {
    x3Data = await queryJuryInstructionSection({
      chargeSlugs: x3Slugs,
      circuit,
      state,
    });
    x3Markdown = renderJuryInstructionSection(x3Data);
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
        enabled: x3Slugs.length > 0,
        isEmpty: x3Data?.isEmpty ?? true,
        markdown: x3Markdown,
        data: x3Data,
      },
    },
    { status: 200 },
  );
}
