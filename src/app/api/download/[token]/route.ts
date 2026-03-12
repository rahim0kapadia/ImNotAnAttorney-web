/**
 * @file /api/download/[token] — Digital product download endpoint
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
  const ip = _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { limited } = await checkRateLimit(supabase, `download:${ip}`, 20, 60);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Look up order by download token
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, tier, status, product_type, download_token_expires_at, download_count")
    .eq("download_token", token)
    .eq("product_type", "digital-product")
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Download link not found" },
      { status: 404 }
    );
  }

  // Check if order was refunded — revoke access
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

  // Look up the charge pack to get the PDF path
  const { data: pack, error: packError } = await supabase
    .from("charge_packs")
    .select("pdf_storage_path")
    .eq("slug", order.tier)
    .single();

  if (packError || !pack?.pdf_storage_path) {
    console.error("[Download] Charge pack lookup failed:", packError);
    return NextResponse.json(
      { error: `Product configuration error. Contact ${CONTACT_EMAIL}.` },
      { status: 500 }
    );
  }

  // Generate signed URL (1-hour expiry)
  const { data: signedUrlData, error: signedUrlError } = await supabase
    .storage
    .from("charge-packs")
    .createSignedUrl(pack.pdf_storage_path.replace("charge-packs/", ""), 3600);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error("[Download] Signed URL generation failed:", signedUrlError);
    return NextResponse.json(
      { error: `Could not generate download link. Contact ${CONTACT_EMAIL}.` },
      { status: 500 }
    );
  }

  // Increment download count atomically (fire-and-forget — don't block the redirect).
  // Uses optimistic locking: the WHERE clause includes the current download_count,
  // so concurrent requests won't silently overwrite each other. If another request
  // incremented between our SELECT and this UPDATE, the WHERE won't match (0 rows
  // updated) — acceptable for an audit counter where occasional misses are fine.
  void supabase
    .from("orders")
    .update({ download_count: (order.download_count || 0) + 1 })
    .eq("id", order.id)
    .eq("download_count", order.download_count || 0)
    .then(() => {}, (err: unknown) => console.error("[Download] Count increment failed:", err));

  // Redirect to the signed URL
  return NextResponse.redirect(signedUrlData.signedUrl);
}
