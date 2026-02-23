import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const caseId = searchParams.get("case");

  if (!token || token !== process.env.OPERATOR_SECRET) {
    return new NextResponse(
      "<h1>Unauthorized</h1><p>Invalid operator token.</p>",
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!caseId) {
    return new NextResponse(
      "<h1>Missing case ID</h1>",
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const supabase = createAdminClient();

  // Fetch case
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return new NextResponse(
      "<h1>Case not found</h1>",
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  if (caseData.status !== "review") {
    return new NextResponse(
      `<h1>Case not in review status</h1><p>Current status: ${caseData.status}</p>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const now = new Date().toISOString();
  const reportUrl = `https://imnotanattorney.com/report/${caseData.report_token}`;

  // Update case to delivered
  await supabase
    .from("cases")
    .update({
      status: "delivered",
      delivered_at: now,
      reviewed_by: "operator",
      reviewed_at: now,
      deliverable_url: reportUrl,
      updated_at: now,
    })
    .eq("id", caseId);

  // Get customer name from intake
  let firstName = "there";
  if (caseData.intake_id) {
    const { data: intake } = await supabase
      .from("intakes")
      .select("first_name")
      .eq("id", caseData.intake_id)
      .single();
    if (intake) firstName = intake.first_name;
  }

  // Send delivery email to customer
  const emailResult = await sendEmail({
    to: caseData.email,
    subject: "Your Case Decoder Report is Ready",
    unsubscribeEmail: caseData.email,
    html: `
      <h1 style="color: #F59E0B;">Your Case Decoder Report is Ready</h1>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your personalized Case Decoder report is ready to view. It contains targeted questions, evidence patterns, and accountability benchmarks built specifically from your case details.</p>
      <a href="${reportUrl}" style="display: inline-block; margin: 24px 0; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: white; font-weight: bold;">How to use your report:</p>
        <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
          <li style="margin-bottom: 8px;"><strong style="color: white;">Print it</strong> and bring it to your next attorney meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Start with the Priority Questions</strong> (Section 5, Q1-Q5)</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Document every answer</strong> — email your attorney a summary after the meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Use the Evidence Checklist</strong> (Section 6) when you receive discovery</li>
        </ol>
      </div>
      <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: #F59E0B; font-weight: bold;">Ready to go deeper?</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">Your $197 is credited toward any higher tier within 12 months. <a href="https://imnotanattorney.com/services" style="color: #F59E0B;">View upgrade options</a></p>
      </div>
    `,
  });

  // Retry email if first attempt failed
  if (!emailResult.success) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const retryResult = await sendEmail({
      to: caseData.email,
      subject: "Your Case Decoder Report is Ready",
      unsubscribeEmail: caseData.email,
      html: `<h1 style="color: #F59E0B;">Your Report is Ready</h1>
        <p>View your Case Decoder report: <a href="${reportUrl}" style="color: #F59E0B;">${reportUrl}</a></p>`,
    });
    if (!retryResult.success) {
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `ALERT: Delivery email failed for ${caseData.email}`,
        html: `<p>Delivery email failed after 2 attempts.</p>
          <p><strong>Customer:</strong> ${caseData.email}</p>
          <p><strong>Report URL:</strong> ${reportUrl}</p>
          <p>Case status is updated to 'delivered' but customer has NOT been notified.</p>`,
      });
    }
  }

  // Record post_case_decoder_delivery drip to prevent cron from re-sending
  const { data: subData } = await supabase
    .from("subscribers")
    .select("id")
    .eq("email", caseData.email.toLowerCase())
    .maybeSingle();

  if (subData?.id) {
    await supabase.from("drip_emails").upsert(
      { subscriber_id: subData.id, email_key: "post_case_decoder_delivery" },
      { onConflict: "subscriber_id,email_key" }
    );
  }

  // Return confirmation HTML page
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Report Delivered</title></head>
<body style="font-family: Arial, sans-serif; background: #0C0A09; color: #D4D4D8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 500px; padding: 32px;">
    <div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
    <h1 style="color: #22C55E;">Report Delivered</h1>
    <p>Delivery email sent to <strong style="color: white;">${escapeHtml(caseData.email)}</strong></p>
    <p>Report URL: <a href="${reportUrl}" style="color: #F59E0B;">${reportUrl}</a></p>
    <p style="margin-top: 24px; color: #71717A;">Case ID: ${caseId}</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
