/**
 * @file POST /api/generate/tier9 — Operator trigger for Tier 9 report generation.
 *
 * Same pattern as /api/generate/standalone: validates auth, checks idempotency,
 * then calls generateTier9Report() synchronously (DB queries only, <5s).
 *
 * Used for:
 *   - Manual operator retries on failed generations
 *   - Re-generation after customer provides corrected intake data
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";
import { getProduct } from "@/lib/products";
import { isTier9Slug } from "@/lib/tier9-reports/constants";
import { generateTier9Report } from "@/lib/tier9-reports/generate";

export async function POST(req: NextRequest) {
  // Auth: operator secret (timing-safe)
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orderId, force } = body;
  if (
    !orderId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId
    )
  ) {
    return NextResponse.json(
      { error: "Valid orderId (UUID) required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Load order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, standalone_product_slug, standalone_intake, standalone_report_token_hash, status"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Validate it's a Tier 9 product
  if (!order.standalone_product_slug || !isTier9Slug(order.standalone_product_slug)) {
    return NextResponse.json(
      { error: "Not a Tier 9 product order. Use /api/generate/standalone for other products." },
      { status: 400 }
    );
  }

  const product = getProduct(order.standalone_product_slug);
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }

  // Idempotency: skip if report already exists (unless force=true)
  if (order.standalone_report_token_hash && !force) {
    return NextResponse.json({
      skipped: true,
      message: "Report already generated",
    });
  }

  // Require intake data
  if (!order.standalone_intake) {
    return NextResponse.json(
      { error: "No intake data — customer has not completed the form yet" },
      { status: 400 }
    );
  }

  // Clear existing report token if force regenerating
  if (force && order.standalone_report_token_hash) {
    await supabase
      .from("orders")
      .update({
        standalone_report_token_hash: null,
        standalone_report_storage_path: null,
        standalone_report_token_expires_at: null,
      })
      .eq("id", orderId);
  }

  // Generate synchronously (DB queries only, <5s)
  try {
    await generateTier9Report(orderId);
    return NextResponse.json({
      status: "completed",
      orderId,
      message: "Tier 9 report generated and delivered",
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Generate Tier9] Failed:", errorMsg);
    return NextResponse.json(
      { error: `Generation failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}
