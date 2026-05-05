/**
 * Witness Pack Section Assembly Endpoint.
 *
 * POST /api/generate/witness-pack-section
 *
 * Called by the engine when assembling a Witness Pack add-on report.
 * Returns pre-rendered markdown for the Witness Pack section drawn from
 * classified_opinions.witness_names + expert_witness_names.
 *
 * Template: src/app/api/generate/xray-sections/route.ts
 * Expert: lukas-fittl (matview pattern, pre-aggregated over indexed matviews)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOperatorSecret } from "@/lib/auth/guards";
import { queryWitnessProfile } from "@/lib/cross-corpus/witness-profile";
import { renderWitnessPackSection } from "@/lib/witness-pack/witness-pack-section";

export const runtime = "nodejs";
export const maxDuration = 60;

interface WitnessPackSectionBody {
  state: string;
  chargeType?: string | null;
}

export async function POST(req: NextRequest) {
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

  let body: WitnessPackSectionBody;
  try {
    body = (await req.json()) as WitnessPackSectionBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const { state, chargeType = null } = body ?? {};
  if (!state || typeof state !== "string" || state.trim().length === 0) {
    return NextResponse.json({ error: "state-required" }, { status: 400 });
  }

  const data = await queryWitnessProfile({ state: state.trim(), chargeType });

  let markdown = "";
  try {
    markdown = renderWitnessPackSection(data);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.message?.includes("UPL violation")) {
      return NextResponse.json(
        { code: "UPL_VIOLATION", message: "Content failed UPL guard" },
        { status: 422 },
      );
    }
    throw err;
  }

  return NextResponse.json(
    {
      state,
      chargeType: chargeType ?? null,
      sample_size: data.sample_size,
      witness_count: data.witnesses.length,
      expert_count: data.experts.length,
      markdown,
    },
    { status: 200 },
  );
}
