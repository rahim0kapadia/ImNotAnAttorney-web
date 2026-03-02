/**
 * @fileoverview Discovery Document Upload Endpoint
 *
 * Handles individual file uploads for discovery document analysis. This is the
 * first half of the two-part upload flow (upload + finalize):
 *
 *   Upload Page --> POST /api/upload (per file) --> Supabase Storage
 *     --> POST /api/upload/finalize (once, after all files) --> Operator notification
 *
 * This endpoint is used by customers on the $1,497+ tiers (X-Ray, War Room,
 * Situation Room) who need to submit discovery packets (police reports, lab
 * results, witness statements, etc.) for analysis.
 *
 * Security model:
 * - Ownership check: the email in the request MUST match the email on the case
 *   record. This prevents unauthorized uploads to someone else's case.
 * - Server-side MIME type validation: the allowlist is enforced here because
 *   client-side validation can be bypassed via curl/Postman.
 * - File size limit: 50MB per file, enforced server-side.
 * - Storage paths use caseId/timestamp-filename pattern for uniqueness and
 *   easy operator access via Supabase dashboard.
 * - The storage bucket (discovery-files) is PRIVATE -- file_urls stored in the
 *   cases table are internal storage paths, not public URLs.
 * - File names are sanitized (non-alphanumeric chars replaced with underscores)
 *   to prevent path traversal and storage issues.
 *
 * After each successful upload, a receipt email is sent to the customer with
 * the file name, size, and running total of uploaded files.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

/** Maximum allowed file size: 50MB in bytes */
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Server-side MIME type allowlist.
 * This MUST stay in sync with the client-side ACCEPTED_TYPES constant on the
 * upload page. Server-side enforcement is necessary because client-side
 * validation can be trivially bypassed (curl, Postman, browser devtools).
 *
 * Accepted formats: PDF, common image types (JPEG, PNG, GIF, WebP),
 * plain text, and Word documents (legacy .doc and modern .docx).
 */
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Uploads a single discovery document to Supabase Storage and appends its
 * path to the case record's file_urls array.
 *
 * @param req - FormData with: file (required), caseId (required), email (required)
 * @returns JSON with { path } -- the storage path of the uploaded file
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const caseId = formData.get("caseId") as string | null;
    const email = formData.get("email") as string | null;

    // =========================================================================
    // 1. INPUT VALIDATION
    // All three fields are required: file (the document), caseId (which case to
    // attach it to), and email (for ownership verification).
    // =========================================================================
    if (!file || !caseId) {
      return NextResponse.json(
        { error: "File and caseId required" },
        { status: 400 }
      );
    }

    // Email is mandatory for the ownership check below -- without it, we cannot
    // verify the uploader actually owns the case.
    if (!email) {
      return NextResponse.json(
        { error: "Email required for verification" },
        { status: 400 }
      );
    }

    // =========================================================================
    // 2. SERVER-SIDE MIME TYPE VALIDATION
    // Client-side checks (the file input's accept attribute) can be bypassed
    // with curl, Postman, or browser devtools. This server-side check is the
    // real enforcement point. We reject anything not in the allowlist.
    // =========================================================================
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `File type not accepted: ${file.type}. Accepted: PDF, images, text, Word documents.` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // =========================================================================
    // 3. CASE EXISTENCE AND OWNERSHIP VERIFICATION
    // Two-step auth check:
    //   a) Verify the caseId exists in the cases table
    //   b) Verify the provided email matches the email on the case record
    //
    // This prevents: uploading to a non-existent case, uploading to someone
    // else's case, and uploading without providing an email at all.
    // We return 403 (not 404) to avoid leaking whether a case ID exists.
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

    // Case-insensitive email comparison for ownership verification
    if (caseRecord.email.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "Email does not match this case" },
        { status: 403 }
      );
    }

    // =========================================================================
    // 4. FILE SIZE VALIDATION
    // Enforced after ownership check so we don't waste time validating files
    // for unauthorized requests. The 50MB limit is generous enough for scanned
    // discovery documents while preventing abuse.
    // =========================================================================
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 50MB limit" },
        { status: 400 }
      );
    }

    // =========================================================================
    // 5. FILE UPLOAD TO SUPABASE STORAGE
    // Storage path pattern: {caseId}/{timestamp}-{sanitized-filename}
    //
    // - caseId prefix groups all files for a case in one "folder"
    // - Timestamp prefix ensures uniqueness if the same file is uploaded twice
    // - Filename sanitization replaces non-alphanumeric chars (except dots and
    //   hyphens) with underscores to prevent path traversal and storage issues
    // - upsert: false prevents overwriting existing files (timestamp makes
    //   collisions near-impossible anyway)
    // =========================================================================
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `${caseId}/${Date.now()}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("discovery-files")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Upload] Storage error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // =========================================================================
    // 6. UPDATE CASE RECORD WITH FILE PATH (atomic array append)
    // Uses raw SQL array_append() via Supabase RPC to atomically add the new
    // path to file_urls. The previous read-modify-write pattern had a race
    // condition: two concurrent uploads could both read the same array, each
    // append their file, and the second write would overwrite the first --
    // silently losing a file path. array_append is atomic at the database
    // level, so concurrent uploads are safe.
    //
    // The bucket is private, so these paths require authenticated access via
    // the Supabase admin client or dashboard. This is intentional -- discovery
    // documents are sensitive legal materials.
    // =========================================================================
    const existingUrls = caseRecord.file_urls || [];
    const { error: appendError } = await supabase.rpc("append_file_url", {
      case_id: caseId,
      new_url: path,
    });

    // Hard error if RPC fails — the race-prone read-modify-write fallback was removed.
    // Migration 003 must be applied for append_file_url RPC to exist.
    if (appendError) {
      console.error("[Upload] RPC append_file_url failed:", appendError.message);
      return NextResponse.json(
        { error: "Failed to record file. Please try again." },
        { status: 500 }
      );
    }

    // =========================================================================
    // 7. SEND UPLOAD RECEIPT EMAIL
    // Confirms receipt to the customer for each file. Includes file name, size,
    // and running count of total files uploaded. File name is HTML-escaped via
    // escapeHtml() to prevent XSS in the email body.
    // =========================================================================
    await sendEmail({
      to: caseRecord.email,
      subject: "Document Received — Your File Has Been Uploaded",
      unsubscribeEmail: caseRecord.email,
      html: `
        <h1 style="color: #F59E0B;">Document Received</h1>
        <p>We've received your uploaded file: <strong>${escapeHtml(file.name)}</strong></p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">File:</strong> ${escapeHtml(file.name)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Size:</strong> ${(file.size / 1024 / 1024).toFixed(1)} MB</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Total files uploaded:</strong> ${existingUrls.length + 1}</p>
        </div>
        <p style="color: #A1A1AA;">You can upload additional files using the same link. When you've uploaded everything, your analysis begins.</p>
      `,
    }, { category: "upload-receipt", case_id: caseId, metadata: { fileName: file.name } });

    return NextResponse.json({ path });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
