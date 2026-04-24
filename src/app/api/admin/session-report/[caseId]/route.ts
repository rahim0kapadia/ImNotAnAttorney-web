/**
 * Session-mode report paste endpoint.
 *
 * Rahim runs generate-session-handoff.mjs to get the Claude Code session
 * prompt, runs it, POSTs the final HTML here. Flips status to delivered,
 * sends delivery email.
 *
 * Plan: docs/plans/2026-04-24-per-tier-generation-mode-rebuild.md
 */
import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { sendEmail } from "@/lib/email";
import { caseThreadId } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;
  const { caseId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.report_html || typeof body.report_html !== "string") {
    return NextResponse.json(
      { error: "missing-report-html" },
      { status: 400 },
    );
  }
  const sb = createAdminClient();
  const { data: caseRow } = await sb
    .from("cases")
    .select("id, tier, status, email")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow)
    return NextResponse.json({ error: "case-not-found" }, { status: 404 });
  if (caseRow.status !== "awaiting-session-generation") {
    return NextResponse.json(
      { error: "wrong-status", actual: caseRow.status },
      { status: 409 },
    );
  }
  const { error: updateError } = await sb
    .from("cases")
    .update({
      report_html: body.report_html,
      report_format_version: 2,
      generator_prompt_version: "2.1.0-session",
      generator_mode: "session",
      generator_cost_usd: 0,
      generator_deployed_at: new Date().toISOString(),
      status: "delivered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);
  if (updateError)
    return NextResponse.json({ error: "db-update-failed" }, { status: 500 });
  if (caseRow.email) {
    await sendEmail(
      {
        to: caseRow.email,
        subject: "Your report is ready",
        unsubscribeEmail: caseRow.email,
        threadingHeaders: {
          inReplyTo: caseThreadId(caseId),
          references: caseThreadId(caseId),
        },
        html: `<p>Your ${caseRow.tier} report has been completed by a researcher and is ready to view.</p>`,
      },
      {
        category: "transactional",
        case_id: caseId,
        metadata: { tier: caseRow.tier, event: "session-delivered" },
      },
    );
  }
  return NextResponse.json(
    { delivered: true, caseId, mode: "session" },
    { status: 200 },
  );
}
