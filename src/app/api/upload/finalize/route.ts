/**
 * @fileoverview Discovery Document Upload Finalization Endpoint
 *
 * This is the second half of the two-part upload flow. After the customer has
 * uploaded all their discovery documents via POST /api/upload (one file at a
 * time), they click "Submit for Analysis" which calls this endpoint:
 *
 *   Upload Page (per-file uploads) --> POST /api/upload/finalize
 *     --> Case status: "uploaded" --> "submitted"
 *     --> Creates discovery_documents rows from file_urls
 *     --> Queues processing_jobs (one OCR job per document)
 *     --> Sets delivery_due_at based on tier
 *     --> Creates operator_tasks row
 *     --> Operator notification email
 *     --> Customer confirmation email
 *
 * This separation exists because:
 * 1. Customers may upload multiple files over multiple sessions
 * 2. We only want to notify the operator ONCE when all files are ready
 * 3. The customer explicitly signals "I'm done uploading" by clicking submit
 *
 * Status flow for a case: created --> uploaded (files arriving) --> submitted
 * (finalize called) --> processing (engine picks up jobs) --> review --> delivered
 *
 * The finalize endpoint is idempotent: calling it on an already-submitted case
 * returns success without re-sending emails or re-updating the status.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
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
    const supabaseRL = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabaseRL, `finalize:${ip}`, 10, 300);
    if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { caseId, email } = body;

    if (!caseId) {
      return NextResponse.json(
        { error: "caseId required" },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "email required" },
        { status: 400 }
      );
    }

    // Validate caseId as UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId)) {
      return NextResponse.json(
        { error: "Invalid case ID format" },
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
        { error: "Invalid case ID or email" },
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
    if (caseRecord.email.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "Invalid case ID or email" },
        { status: 403 }
      );
    }

    // =========================================================================
    // 3. STATUS GUARD
    // Only allow finalization from early-stage statuses. Once a case moves
    // beyond "submitted" (e.g., into processing, review, delivered), re-finalization
    // would regress the status and break the pipeline.
    // =========================================================================
    const FINALIZABLE_STATUSES = ["uploaded", "pending"];
    if (caseRecord.status === "submitted") {
      // Idempotent: already submitted, return success without re-processing.
      // Handles double-clicks, page refreshes, retry logic, and network retries.
      return NextResponse.json({ success: true, message: "Already submitted" });
    }
    if (!FINALIZABLE_STATUSES.includes(caseRecord.status)) {
      return NextResponse.json(
        { success: true, message: "Case is already being processed" },
      );
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
    //
    // Also sets delivery_due_at based on tier:
    //   x-ray: 10 business days, war-room: 28 days, situation-room: 2 days
    // =========================================================================
    const deliveryDays: Record<string, number> = {
      "x-ray": 14,         // 10 business days ≈ 14 calendar days
      "war-room": 40,      // 28 business days ≈ 40 calendar days (conservative)
      "situation-room": 2,  // 24-48 hour priority (per-stage, not overall)
    };
    const daysToAdd = deliveryDays[caseRecord.tier] || 14;
    const deliveryDue = new Date();
    deliveryDue.setDate(deliveryDue.getDate() + daysToAdd);

    const { error: updateError } = await supabase
      .from("cases")
      .update({
        status: "submitted",
        delivery_due_at: deliveryDue.toISOString(),
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
    // 5a. CREATE DISCOVERY_DOCUMENTS ROWS
    // One row per file in file_urls. We extract the original filename from the
    // storage path (format: {caseId}/{timestamp}-{filename}). File metadata
    // (size, type) is fetched from Supabase Storage.
    // =========================================================================
    const fileUrls: string[] = caseRecord.file_urls || [];
    const docRows = [];

    for (const storagePath of fileUrls) {
      // Extract original name: path format is "{caseId}/{timestamp}-{safeName}"
      const pathParts = storagePath.split("/");
      const fileName = pathParts.length > 1
        ? pathParts.slice(1).join("/").replace(/^\d+-/, "") // strip timestamp prefix
        : storagePath;

      // Infer file type from extension
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        tiff: "image/tiff",
        tif: "image/tiff",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xls: "application/vnd.ms-excel",
        txt: "text/plain",
        csv: "text/csv",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        mp4: "video/mp4",
        mov: "video/quicktime",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";
      const fileType = ext === "pdf" ? "pdf" : ["jpg", "jpeg", "png", "gif", "webp", "tiff", "tif"].includes(ext) ? "image" : ["mp3", "wav"].includes(ext) ? "audio" : ["mp4", "mov"].includes(ext) ? "video" : "document";

      docRows.push({
        case_id: caseId,
        storage_path: storagePath,
        original_name: fileName,
        file_type: fileType,
        mime_type: mimeType,
        file_size_bytes: 0, // Updated by OCR worker when it downloads the file
        status: "uploaded",
      });
    }

    let docIds: string[] = [];
    if (docRows.length > 0) {
      const { data: insertedDocs, error: docError } = await supabase
        .from("discovery_documents")
        .insert(docRows)
        .select("id");

      if (docError) {
        console.error("[Upload Finalize] discovery_documents insert error:", docError);
        // Non-fatal: status already updated, operator can still process manually
      } else {
        docIds = (insertedDocs || []).map((d: { id: string }) => d.id);
      }
    }

    // =========================================================================
    // 5b. QUEUE PROCESSING JOBS (Phase 1: one OCR job per document)
    // Each OCR job targets a specific discovery_document. After OCR completes,
    // the worker creates classification and entity extraction jobs automatically.
    // Priority 1 = highest (process immediately when worker picks up).
    // =========================================================================
    if (docIds.length > 0) {
      const batchId = crypto.randomUUID();
      const ocrJobs = docIds.map((docId) => ({
        case_id: caseId,
        job_type: "ocr",
        target_id: docId,
        target_type: "discovery_document",
        priority: 1,
        batch_id: batchId,
        status: "queued",
      }));

      const { error: jobError } = await supabase
        .from("processing_jobs")
        .insert(ocrJobs);

      if (jobError) {
        console.error("[Upload Finalize] processing_jobs insert error:", jobError);
        // Non-fatal: operator task created below, can manually trigger
      }
    }

    // =========================================================================
    // 5c. CREATE OPERATOR TASK
    // Creates a trackable task for the operator to monitor pipeline progress.
    // The operator can view this in the dashboard and intervene if needed.
    // =========================================================================
    const { error: taskError } = await supabase
      .from("operator_tasks")
      .insert({
        case_id: caseId,
        task_type: "pipeline_monitoring",
        title: `${caseRecord.tier.toUpperCase()} pipeline: ${fileCount} documents submitted`,
        description: `Customer ${caseRecord.email} submitted ${fileCount} discovery documents for ${caseRecord.tier} analysis. ${docIds.length} OCR jobs queued. Monitor pipeline progress and review final report.`,
        priority: caseRecord.tier === "situation-room" ? "URGENT" : "HIGH",
        priority_rank: caseRecord.tier === "situation-room" ? 1 : 2,
        due_at: deliveryDue.toISOString(),
      });

    if (taskError) {
      console.error("[Upload Finalize] operator_tasks insert error:", taskError);
      // Non-fatal: operator email sent below regardless
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
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Pipeline:</strong> ${docIds.length} OCR jobs queued${docIds.length > 0 ? " — processing will begin automatically" : " — manual processing required"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Due:</strong> ${deliveryDue.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <p style="color: #A1A1AA;">${docIds.length > 0 ? "The engine pipeline is processing these documents automatically. You'll receive a review notification when the report is ready." : "Log into Supabase to access the uploaded files and begin analysis."}</p>
      `,
    }, { category: "operator-upload-ready", case_id: caseId, metadata: { tier: caseRecord.tier, fileCount } });

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
    }, { category: "upload-confirmation", case_id: caseId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Upload Finalize] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
