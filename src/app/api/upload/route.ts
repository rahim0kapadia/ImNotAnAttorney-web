import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const caseId = formData.get("caseId") as string | null;

    if (!file || !caseId) {
      return NextResponse.json(
        { error: "File and caseId required" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 50MB limit" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const ext = file.name.split(".").pop() || "bin";
    const path = `${caseId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}.${ext}`;

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

    // Get the file URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("discovery-files").getPublicUrl(path);

    // Update the case record with the new file URL
    const { data: caseRecord } = await supabase
      .from("cases")
      .select("file_urls")
      .eq("id", caseId)
      .single();

    if (caseRecord) {
      const existingUrls = caseRecord.file_urls || [];
      await supabase
        .from("cases")
        .update({ file_urls: [...existingUrls, publicUrl] })
        .eq("id", caseId);
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
