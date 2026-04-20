/**
 * POST /api/partner/branding/upload — upload partner logo to Supabase Storage.
 *
 * Auth: partner session cookie.
 * Accepts: multipart/form-data with `file` field (png/jpeg/webp, <= 2MB).
 * SVG is intentionally rejected — SVG can carry <script> and the bucket
 * is public-read, so an accepted SVG would persist XSS.
 * Returns: { publicUrl, storagePath }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { sniffImageType, mimeForSniffed, extForSniffed } from "@/lib/partner-branding/file-sniff";
import { checkRateLimit } from "@/lib/rate-limit";

const BUCKET = "partner-logos";
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  if (!partner.promo_code) {
    return NextResponse.json({ error: "Partner missing promo code" }, { status: 400 });
  }

  const rlSupabase = createAdminClient();
  const { limited } = await checkRateLimit(rlSupabase, `partner-branding-upload:${partner.id}`, 10, 60 * 60);
  if (limited) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field missing" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return NextResponse.json(
      { error: "File content is not a supported image (png / jpg / webp). SVG is not accepted." },
      { status: 415 },
    );
  }
  const contentType = mimeForSniffed(sniffed);
  const ext = extForSniffed(sniffed);
  if (!contentType || !ext) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  }

  const path = `${partner.promo_code}/logo.${ext}`;

  const supabase = rlSupabase;

  // Clean up any other extension variants for this partner so switching
  // png -> webp (etc.) doesn't leave orphans.
  const oldStoragePath = partner.logo_storage_path ?? null;
  if (oldStoragePath && oldStoragePath !== path) {
    await supabase.storage.from(BUCKET).remove([oldStoragePath]).catch((e) => {
      console.warn("[PartnerBranding] prior-logo cleanup failed:", e);
    });
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: "300",
  });
  if (upErr) {
    console.error("[PartnerBranding] upload error:", upErr);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  return NextResponse.json({ publicUrl, storagePath: path });
}
