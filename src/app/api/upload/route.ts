import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const caseId = formData.get("caseId") as string | null;
    const email = formData.get("email") as string | null;

    if (!file || !caseId) {
      return NextResponse.json(
        { error: "File and caseId required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Auth: verify caseId exists in cases table
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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 50MB limit" },
        { status: 400 }
      );
    }

    // Use file.name directly — no extra extension appended
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

    // Store the storage path (not a public URL — bucket is private)
    const existingUrls = caseRecord.file_urls || [];
    await supabase
      .from("cases")
      .update({ file_urls: [...existingUrls, path] })
      .eq("id", caseId);

    // Send upload receipt email
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
    });

    return NextResponse.json({ path });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
