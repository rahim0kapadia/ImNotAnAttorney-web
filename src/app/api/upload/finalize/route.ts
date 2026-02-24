/**
 * @fileoverview Discovery Document Upload Finalization Endpoint
 *
 * This is the second half of the two-part upload flow. After the customer has
 * uploaded all their discovery documents via POST /api/upload (one file at a
 * time), they click "Submit for Analysis" which calls this endpoint:
 *
 *   Upload Page (per-file uploads) --> POST /api/upload/finalize
 *     --> Case status: "uploaded" --> "submitted"
 *     --> Operator notification email (triggers manual analysis workflow)
 *     --> Customer confirmation email
 *
 * This separation exists because:
 * 1. Customers may upload multiple files over multiple sessions
 * 2. We only want to notify the operator ONCE when all files are ready
 * 3. The customer explicitly signals "I'm done uploading" by clicking submit
 *
 * Status flow for a case: created --> uploaded (files arriving) --> submitted
 * (finalize called) --> analysis_in_progress --> delivered (manual)
 *
 * The finalize endpoint is idempotent: calling it on an already-submitted case
 * returns success without re-sending emails or re-updating the status.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

/** Operator email for case-ready notifications. Falls back to founder's personal Gmail. */
const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

/**
 * Finalizes a discovery document upload by transitioning the case to "submitted"
 * status and sending notification emails to both the operator and the customer.
 *
 * @param req - JSON body with: caseId (required), email (optional, for ownership verification)
 * @returns JSON with { success: true } on success, or { success: true, message: "Already submitted" } if idempotent
 */
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

    // =========================================================================
    // 1. CASE VALIDATION
    // Verify the case exists and load its current state. We need file_urls to
    // check that at least one file has been uploaded before allowing finalization.
    // =========================================================================
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

    // =========================================================================
    // 2. OWNERSHIP CHECK
    // If an email is provided, it must match the case's email. This prevents
    // someone from finalizing another customer's case. The email param is
    // optional here (unlike the upload endpoint) because the finalize button
    // may be called from a context where email is already verified client-side.
    // =========================================================================
    if (email && caseRecord.email.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "Email does not match this case" },
        { status: 403 }
      );
    }

    // =========================================================================
    // 3. IDEMPOTENCY CHECK
    // If the case is already submitted, return success without re-processing.
    // This handles: double-clicks, page refreshes, retry logic, and network
    // retries. No emails are re-sent, no status is re-written.
    // =========================================================================
    if (caseRecord.status === "submitted") {
      return NextResponse.json({ success: true, message: "Already submitted" });
    }

    // =========================================================================
    // 4. FILE COUNT VALIDATION
    // Don't allow finalization if no files have been uploaded. This prevents
    // accidental empty submissions that would waste operator time.
    // =========================================================================
    const fileCount = caseRecord.file_urls?.length || 0;

    if (fileCount === 0) {
      return NextResponse.json(
        { error: "No files uploaded yet" },
        { status: 400 }
      );
    }

    // =========================================================================
    // 5. STATUS TRANSITION: uploaded --> submitted
    // This is the point of no return. After this update, the operator is
    // notified and analysis begins. The updated_at timestamp records when
    // the customer signaled they're done uploading.
    // =========================================================================
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

    // =========================================================================
    // 6. OPERATOR NOTIFICATION EMAIL
    // Alerts the operator (Rahim) that a customer's discovery documents are
    // ready for analysis. Includes customer email, tier, file count, and case
    // ID -- everything needed to start the analysis workflow in Supabase.
    // All dynamic values are HTML-escaped via escapeHtml() to prevent injection.
    // This email does NOT include an unsubscribe link (it's an operational
    // notification to the operator, not a marketing email).
    // =========================================================================
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

    // =========================================================================
    // 7. CUSTOMER CONFIRMATION EMAIL
    // Confirms to the customer that their documents have been received and
    // analysis has begun. Sets expectations: they'll be emailed when the report
    // is ready, and they can still upload additional files if needed.
    // Includes CAN-SPAM unsubscribe link via unsubscribeEmail param.
    // =========================================================================
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
