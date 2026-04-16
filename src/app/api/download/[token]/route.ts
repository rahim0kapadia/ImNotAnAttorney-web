/**
 * @file /api/download/[token], Digital product download endpoint
 *
 * Serves signed download URLs for digital products (Defense Playbooks).
 * The token is a UUID stored on the order record at purchase time.
 *
 * Flow:
 *   1. Customer receives email with download link after purchase
 *   2. GET /api/download/{token} validates the token
 *   3. If valid: generates a 1-hour signed Supabase Storage URL
 *   4. Redirects customer to the signed URL (browser downloads PDF)
 *
 * Two-document support (Emergency Playbook split):
 *   - Default (no query param): serves the full defense playbook PDF
 *   - ?doc=emergency: serves the emergency playbook PDF (if available)
 *   - Both documents use the same download token (one purchase = both books)
 *
 * Security:
 *   - Token is a random UUID (not guessable)
 *   - Token expires after 72 hours (download_token_expires_at)
 *   - Refunded orders return 403 (access revoked)
 *   - Download count is incremented (audit trail, fire-and-forget)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTACT_EMAIL } from "@/lib/site";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Rate limit by IP to prevent token enumeration
  const ip = getClientIp(_req);
  const { limited } = await checkRateLimit(supabase, `download:${ip}`, 20, 60);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Look up order by download token
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, tier, status, product_type, download_token_expires_at")
    .eq("download_token", token)
    .eq("product_type", "digital-product")
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Download link not found" },
      { status: 404 }
    );
  }

  // Check if order was refunded, revoke access
  if (order.status === "refunded") {
    return NextResponse.json(
      { error: "This order has been refunded. Download access has been revoked." },
      { status: 403 }
    );
  }

  // Check token expiry
  if (order.download_token_expires_at) {
    const expiresAt = new Date(order.download_token_expires_at);
    if (Date.now() > expiresAt.getTime()) {
      return NextResponse.json(
        { error: `This download link has expired. Check your email for a fresh link, or contact ${CONTACT_EMAIL}.` },
        { status: 410 }
      );
    }
  }

  // Determine which document to serve (full playbook or emergency)
  const docType = _req.nextUrl.searchParams.get("doc");
  const isEmergency = docType === "emergency";

  // Look up the charge pack to get the PDF path
  const { data: pack, error: packError } = await supabase
    .from("charge_packs")
    .select("pdf_storage_path, emergency_pdf_path")
    .eq("slug", order.tier)
    .single();

  if (packError || !pack?.pdf_storage_path) {
    console.error("[Download] Charge pack lookup failed:", packError);
    return NextResponse.json(
      { error: `Product configuration error. Contact ${CONTACT_EMAIL}.` },
      { status: 500 }
    );
  }

  // Select the right PDF path based on doc type
  const pdfPath = isEmergency ? pack.emergency_pdf_path : pack.pdf_storage_path;

  if (!pdfPath) {
    // Emergency PDF requested but not available for this charge type
    return NextResponse.json(
      { error: `Emergency playbook not available for this product. Contact ${CONTACT_EMAIL}.` },
      { status: 404 }
    );
  }

  // Generate signed URL (1-hour expiry)
  const { data: signedUrlData, error: signedUrlError } = await supabase
    .storage
    .from("charge-packs")
    .createSignedUrl(pdfPath.replace("charge-packs/", ""), 3600);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error("[Download] Signed URL generation failed:", signedUrlError);
    return NextResponse.json(
      { error: `Could not generate download link. Contact ${CONTACT_EMAIL}.` },
      { status: 500 }
    );
  }

  // Increment download count atomically (fire-and-forget, don't block the redirect).
  // Uses an RPC that does `download_count + 1` in a single UPDATE statement,
  // eliminating the TOCTOU race of the previous SELECT-then-UPDATE approach.
  void supabase
    .rpc("increment_order_download_count", { p_order_id: order.id })
    .then(() => {}, (err: unknown) => console.error("[Download] Count increment failed:", err));

  // Redirect to the signed URL
  return NextResponse.redirect(signedUrlData.signedUrl);
}
