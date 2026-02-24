import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCaseDecoderReport, renderReportHtml } from "@/lib/claude";
import { sendEmail, escapeHtml } from "@/lib/email";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.OPERATOR_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { caseId, force } = body;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

  // Fetch case
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  // Idempotency: skip if already generated/delivered (unless force=true)
  if (!force && (caseData.status === "review" || caseData.status === "delivered")) {
    return NextResponse.json({
      success: true,
      caseId,
      reportToken: caseData.report_token,
      status: caseData.status,
      skipped: true,
      message: `Report already ${caseData.status}. Pass force:true to regenerate.`,
    });
  }

  // Find linked intake
  let intake = null;
  if (caseData.intake_id) {
    const { data } = await supabase
      .from("intakes")
      .select("*")
      .eq("id", caseData.intake_id)
      .single();
    intake = data;
  }

  // Fallback: find most recent intake by email
  if (!intake) {
    const { data } = await supabase
      .from("intakes")
      .select("*")
      .eq("email", caseData.email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    intake = data;

    // Link the intake to the case
    if (intake) {
      await supabase
        .from("cases")
        .update({ intake_id: intake.id, updated_at: new Date().toISOString() })
        .eq("id", caseId);
    }
  }

  if (!intake) {
    // No intake found — notify operator
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `Report generation failed: No intake for ${caseData.email}`,
      html: `<h1 style="color: #EF4444;">No Intake Found</h1>
        <p>Attempted to generate Case Decoder report but no intake form was found.</p>
        <p><strong>Case ID:</strong> ${caseId}</p>
        <p><strong>Customer:</strong> ${caseData.email}</p>
        <p><strong>Action:</strong> Send intake form link to customer or create intake manually.</p>`,
    });
    return NextResponse.json({ error: "No intake found for this case" }, { status: 404 });
  }

  // Generate report with retry
  let markdown: string;
  try {
    markdown = await generateCaseDecoderReport(intake);
  } catch (firstError) {
    console.error("[Generate] First attempt failed:", firstError);
    // Wait 5 seconds and retry
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      markdown = await generateCaseDecoderReport(intake);
    } catch (secondError) {
      console.error("[Generate] Second attempt failed:", secondError);
      // Update case status and notify operator
      await supabase
        .from("cases")
        .update({ status: "generation-failed", updated_at: new Date().toISOString() })
        .eq("id", caseId);

      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `URGENT: Report generation failed for ${escapeHtml(intake.first_name)}`,
        html: `<h1 style="color: #EF4444;">Report Generation Failed</h1>
          <p>Claude API failed after 2 attempts.</p>
          <p><strong>Case ID:</strong> ${caseId}</p>
          <p><strong>Customer:</strong> ${caseData.email}</p>
          <p><strong>Charge Type:</strong> ${escapeHtml(intake.charge_type)}</p>
          <p><strong>Error:</strong> ${escapeHtml(secondError instanceof Error ? secondError.message : String(secondError))}</p>
          <div style="margin-top: 16px;">
            <a href="${origin}/api/generate/case-decoder" style="display: inline-block; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Retry Generation</a>
            <p style="margin-top: 8px; font-size: 12px; color: #71717A;">POST with {"caseId": "${caseId}"} and Authorization header</p>
          </div>`,
      });

      return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
    }
  }

  // Render HTML
  const reportToken = crypto.randomUUID();
  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Calculate days since arrest
  let daysSinceArrest: number | null = null;
  if (intake.arrest_date) {
    const arrestDate = new Date(intake.arrest_date);
    if (!isNaN(arrestDate.getTime())) {
      daysSinceArrest = Math.floor(
        (Date.now() - arrestDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }

  const reportHtml = renderReportHtml(markdown, {
    firstName: intake.first_name,
    charges: intake.charge_type,
    jurisdiction: `${intake.state || ""}${intake.incident_location ? ` / ${intake.incident_location}` : ""}`.trim() || "Not specified",
    reportDate,
    reportId: reportToken.slice(0, 8).toUpperCase(),
    caseNumber: intake.case_number || undefined,
    courtDate: intake.court_date || undefined,
    daysSinceArrest,
  });

  // Update case with report
  await supabase
    .from("cases")
    .update({
      report_html: reportHtml,
      report_token: reportToken,
      generated_at: new Date().toISOString(),
      status: "review",
      charge_type: intake.charge_type,
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);

  // Send operator review email
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `Review Report: ${escapeHtml(intake.charge_type)} — ${escapeHtml(intake.first_name)}`,
    html: `
      <h1 style="color: #F59E0B;">Case Decoder Report Ready for Review</h1>
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(intake.first_name)} ${escapeHtml(intake.last_name || "")}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> ${caseData.email}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(intake.charge_type)}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> ${escapeHtml(intake.state || "Not provided")}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseId}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> ${reportDate}</p>
      </div>

      <div style="margin: 24px 0; display: flex; gap: 12px;">
        <a href="${origin}/api/deliver?token=${process.env.OPERATOR_SECRET}&case=${caseId}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Approve &amp; Deliver</a>
        <a href="${origin}/report/${reportToken}" style="display: inline-block; padding: 14px 28px; background: #3B82F6; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Preview Report</a>
      </div>

      <details style="margin-top: 24px;">
        <summary style="color: #F59E0B; cursor: pointer; font-weight: bold;">Full Report Preview</summary>
        <div style="margin-top: 16px; max-height: 600px; overflow-y: auto; border: 1px solid #27272A; border-radius: 8px; padding: 16px;">
          ${reportHtml}
        </div>
      </details>

      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #27272A;">
        <p style="color: #71717A; font-size: 12px;">
          To regenerate: POST to ${origin}/api/generate/case-decoder with {"caseId": "${caseId}"}
        </p>
      </div>
    `,
  });

  return NextResponse.json({
    success: true,
    caseId,
    reportToken,
    status: "review",
  });
}
