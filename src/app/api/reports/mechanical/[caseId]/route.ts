/**
 * Mechanical report generation route.
 *
 * Called by the Vercel CD dispatcher when tier_generation_config.<tier>.mode
 * = 'mechanical'. Runs the mechanical skeleton ONLY (no LLM calls) and
 * writes report_html + generator_mode + status=review via after().
 *
 * Note: for case-decoder specifically, mechanical mode is rarely the right
 * choice (~60-65% of CD content is generative, above the 15% pure-mechanical
 * cap). This route exists so smaller tiers (playbook add-ons, Tier 9 instant
 * SKUs) can opt in without the dispatcher forking further.
 */
import { NextResponse, NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";
import { renderCaseDecoderMechanical } from "@/lib/report/mechanical/render-case-decoder";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
) {
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;
  const { caseId } = await ctx.params;

  const sb = createAdminClient();
  const { data: caseRow } = await sb
    .from("cases")
    .select("id, tier, intake_id, status")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow)
    return NextResponse.json({ error: "case-not-found" }, { status: 404 });
  const { data: intake } = await sb
    .from("intakes")
    .select("*")
    .eq("id", caseRow.intake_id)
    .maybeSingle();
  if (!intake)
    return NextResponse.json({ error: "intake-not-found" }, { status: 404 });
  if (caseRow.tier !== "case-decoder")
    return NextResponse.json(
      { error: "unsupported-tier", tier: caseRow.tier },
      { status: 400 },
    );

  after(async () => {
    try {
      const r = renderCaseDecoderMechanical({
        first_name: intake.first_name,
        charge_type: intake.charge_type,
        state: intake.state,
        jurisdiction_level: intake.jurisdiction_level,
        arrest_date: intake.arrest_date,
        court_date: intake.court_date,
        plea_offered: intake.plea_offered,
        co_defendants: intake.co_defendants,
        filled_out_by: intake.filled_out_by,
        situation: intake.situation,
        specific_question: intake.specific_question,
      });
      // The renderer emits {{SLOT:...}} markers as its contract with the
      // future verified-opus path (Haiku hybrid was removed 2026-04-24).
      // For pure-mechanical delivery, replace each marker with a neutral
      // placeholder comment so the HTML ships self-contained.
      const filledHtml = r.slotsEmitted.reduce(
        (h, slot) => h.split(`{{SLOT:${slot}}}`).join("<!-- mechanical: slot omitted -->"),
        r.html,
      );
      const { error: writeError } = await sb
        .from("cases")
        .update({
          report_html: filledHtml,
          report_format_version: 2,
          generator_prompt_version: "2.1.0-mechanical",
          generator_mode: "mechanical",
          generator_cost_usd: 0,
          generator_deployed_at: new Date().toISOString(),
          status: "review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
      if (writeError) throw writeError;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mechanical] failed", err);
      await sb
        .from("cases")
        .update({
          status: "generation-failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
    }
  });

  return NextResponse.json(
    { accepted: true, caseId, mode: "mechanical" },
    { status: 202 },
  );
}
