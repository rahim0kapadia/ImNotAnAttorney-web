import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { caseId, email } = body;

    if (!caseId) {
      return NextResponse.json(
        { error: "caseId required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify case exists and has files
    const { data: caseRecord, error: caseError } = await supabase
      .from("cases")
      .select("id, email, tier, status, file_urls")
      .eq("id", caseId)
      .single();

    if (caseError || !caseRecord) {
      return NextResponse.json(
        { error: "Invalid case ID" },
        { status: 403 }
      );
    }

    // Ownership check: verify email matches case
    if (email && caseRecord.email.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "Email does not match this case" },
        { status: 403 }
      );
    }

    if (caseRecord.status === "submitted") {
      return NextResponse.json({ success: true, message: "Already submitted" });
    }

    const fileCount = caseRecord.file_urls?.length || 0;

    if (fileCount === 0) {
      return NextResponse.json(
        { error: "No files uploaded yet" },
        { status: 400 }
      );
    }

    // Update case status to "submitted"
    const { error: updateError } = await supabase
      .from("cases")
      .update({
        status: "submitted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (updateError) {
      console.error("[Upload Finalize] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update case status" },
        { status: 500 }
      );
    }

    // Send operator notification
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `Documents Ready: ${caseRecord.tier} — ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
      html: `
        <h1 style="color: #F59E0B;">Discovery Documents Submitted</h1>
        <p>A customer has finished uploading their discovery documents and is ready for analysis.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(caseRecord.email)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(caseRecord.tier)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Files Uploaded:</strong> ${fileCount}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${escapeHtml(caseId)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
        <p style="color: #A1A1AA;">Log into Supabase to access the uploaded files and begin analysis.</p>
      `,
    });

    // Send customer confirmation
    await sendEmail({
      to: caseRecord.email,
      subject: "Your Documents Are In — Analysis Begins Now",
      unsubscribeEmail: caseRecord.email,
      html: `
        <h1 style="color: #F59E0B;">Analysis Begins</h1>
        <p>We've received all ${fileCount} of your discovery documents and your analysis is now in progress.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Documents received:</strong> ${fileCount}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Status:</strong> Analysis in progress</p>
        </div>
        <p style="color: #A1A1AA;">We'll email you when your report is ready. If you need to upload additional documents, you can still use your original upload link.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Upload Finalize] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
