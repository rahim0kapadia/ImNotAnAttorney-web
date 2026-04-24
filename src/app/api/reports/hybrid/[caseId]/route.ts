/**
 * Hybrid report generation route.
 *
 * Called by the Vercel CD dispatcher (src/app/api/generate/case-decoder/route.ts)
 * when tier_generation_config.case-decoder.mode = 'hybrid'. Runs the mechanical
 * skeleton + parallel Haiku calls, writes report_html + generator_mode + cost +
 * status=review via after(). Alerts Telegram on hard failure.
 *
 * Plan: docs/plans/2026-04-24-per-tier-generation-mode-rebuild.md
 */
import { NextResponse, NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";
import { renderCaseDecoderHybrid } from "@/lib/report/hybrid/render-case-decoder";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "missing-anthropic-key" },
      { status: 500 },
    );

  after(async () => {
    try {
      const r = await renderCaseDecoderHybrid(
        {
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
        },
        apiKey,
      );
      const { error: writeError } = await sb
        .from("cases")
        .update({
          report_html: r.html,
          report_format_version: 2,
          generator_prompt_version: "2.1.0-hybrid",
          generator_mode: "hybrid",
          generator_cost_usd: r.costUsd,
          generator_deployed_at: new Date().toISOString(),
          status: "review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
      if (writeError) throw writeError;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[hybrid] failed", err);
      await sb
        .from("cases")
        .update({
          status: "generation-failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
      try {
        const token = process.env.TELEGRAM_ATLAS_BOT_TOKEN;
        const chat = process.env.TELEGRAM_CHAT_ID;
        if (token && chat) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chat,
              text: `Hybrid CD generation FAILED: case=${caseId}. Flip admin UI back to api if this recurs.`,
            }),
          });
        }
      } catch {
        /* fire-and-forget */
      }
    }
  });

  return NextResponse.json(
    { accepted: true, caseId, mode: "hybrid" },
    { status: 202 },
  );
}
