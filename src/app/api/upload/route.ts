/**
 * @fileoverview Discovery Document Upload Endpoint
 *
 * Handles individual file uploads for discovery document analysis. This is the
 * first half of the two-part upload flow (upload + finalize):
 *
 *   Upload Page --> POST /api/upload (per file) --> Supabase Storage
 *     --> POST /api/upload/finalize (once, after all files) --> Operator notification
 *
 * This endpoint is used by customers on the $2,497+ tiers (X-Ray, War Room,
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
import { checkRateLimit } from "@/lib/rate-limit";

/** Maximum allowed file size: 50MB in bytes */
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Server-side MIME type allowlist.
 * This MUST stay in sync with the client-side ACCEPTED_TYPES constant on the
 * upload page. Server-side enforcement is necessary because client-side
 * validation can be trivially bypassed (curl, Postman, browser devtools).
 *
 * Accepted formats: PDF, common image types (JPEG, PNG, GIF, WebP, TIFF),
 * plain text, Word documents (legacy .doc and modern .docx), audio (MP3, WAV),
 * and video (MP4) — for dashcam, bodycam, and recorded statement uploads.
 */
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
]);

/**
 * Magic byte signatures for file type validation.
 * Validates actual file content, not just the client-provided MIME type
 * which can be spoofed. text/plain is validated by checking for non-binary content.
 */
const MAGIC_BYTES: { mime: string; bytes: number[] }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },           // %PDF
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },                       // JFIF
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47] },                 // .PNG
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },                 // GIF8
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },                // RIFF (WebP)
  { mime: "image/tiff", bytes: [0x49, 0x49, 0x2A, 0x00] },                // Little-endian TIFF (II)
  { mime: "application/msword", bytes: [0xD0, 0xCF, 0x11, 0xE0] },        // OLE2
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP/OOXML)
  { mime: "audio/mpeg", bytes: [0xFF, 0xFB] },                             // MP3 frame sync
  { mime: "audio/wav", bytes: [0x52, 0x49, 0x46, 0x46] },                 // RIFF (WAV — same header as WebP)
  { mime: "video/mp4", bytes: [0x00, 0x00, 0x00] },                       // ftyp box (variable 4th byte)
];

function validateMagicBytes(buffer: Buffer, claimedMime: string): boolean {
  // text/plain: verify no null bytes in first 8KB (binary indicator)
  if (claimedMime === "text/plain") {
    const check = buffer.subarray(0, Math.min(8192, buffer.length));
    return !check.includes(0x00);
  }

  // audio/mpeg: MP3 files can start with either frame sync (0xFF 0xFB) or ID3 tag (0x49 0x44 0x33)
  if (claimedMime === "audio/mpeg") {
    if (buffer.length < 3) return false;
    const isFrameSync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0; // 0xFF followed by 0xE0+ (any valid MPEG frame)
    const isID3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33; // "ID3"
    return isFrameSync || isID3;
  }

  const sig = MAGIC_BYTES.find((s) => s.mime === claimedMime);
  if (!sig) return false;

  if (buffer.length < sig.bytes.length) return false;
  return sig.bytes.every((byte, i) => buffer[i] === byte);
}

/**
 * Uploads a single discovery document to Supabase Storage and appends its
 * path to the case record's file_urls array.
 *
 * @param req - FormData with: file (required), caseId (required), email (required)
 * @returns JSON with { path } -- the storage path of the uploaded file
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 uploads per 5 minutes per IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { limited } = await checkRateLimit(createAdminClient(), `upload:${ip}`, 10, 300);
    if (limited) {
      return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });
    }

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
        { error: `File type not accepted: ${file.type}. Accepted: PDF, images, text, Word documents, audio (MP3/WAV), and video (MP4).` },
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
        { error: "Invalid case ID or email" },
        { status: 403 }
      );
    }

    // Case-insensitive email comparison for ownership verification.
    // Returns the same generic error as "case not found" to prevent
    // attackers from confirming whether a UUID corresponds to a real case.
    if (caseRecord.email.toLowerCase() !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "Invalid case ID or email" },
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

    // =========================================================================
    // 5a. MAGIC BYTE VALIDATION
    // Validates actual file content matches the claimed MIME type. Client MIME
    // types can be spoofed — this checks the real file signature bytes.
    // =========================================================================
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match its declared type. Please upload an unmodified file." },
        { status: 400 }
      );
    }

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
