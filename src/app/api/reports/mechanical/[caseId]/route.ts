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
import {
  getCountyDuiContextByName,
  renderCdCountyAsideHtml,
} from "@/lib/fars/county-dui";

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
    .select("id, tier, intake_id, status, court_county, court_state")
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
      let filledHtml = r.slotsEmitted.reduce(
        (h, slot) => h.split(`{{SLOT:${slot}}}`).join("<!-- mechanical: slot omitted -->"),
        r.html,
      );

      // TICKET-11: append FARS county DUI context for DUI cases.
      // Skips silently when:
      //   - charge isn't DUI-shaped
      //   - county/state aren't on the case row
      //   - county doesn't resolve to a known FIPS pair
      //   - matview has no rows for this (state, county)
      // Failure here MUST NOT block the report write.
      try {
        const chargeText = String(intake.charge_type ?? "").toLowerCase();
        const isDui = /\b(dui|dwi|owi|oui)\b/.test(chargeText);
        const stateText = caseRow.court_state ?? intake.state ?? null;
        const countyText = caseRow.court_county ?? null;
        if (isDui && stateText && countyText) {
          const ctx = await getCountyDuiContextByName(stateText, countyText);
          const aside = renderCdCountyAsideHtml(ctx);
          if (aside) {
            // Insert aside immediately before </article> to keep it
            // visible inside the report container.
            const closeTag = "</article>";
            const idx = filledHtml.lastIndexOf(closeTag);
            if (idx >= 0) {
              filledHtml = filledHtml.slice(0, idx) + "\n  " + aside + "\n" + filledHtml.slice(idx);
            } else {
              filledHtml = filledHtml + "\n" + aside;
            }
          }
        }
      } catch (farsErr) {
        // eslint-disable-next-line no-console
        console.warn("[mechanical] FARS county aside skipped", farsErr);
      }
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
