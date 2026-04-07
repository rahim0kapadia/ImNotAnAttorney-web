/**
 * @file POST /api/generate/standalone — Operator trigger for standalone report generation.
 *
 * Same pattern as /api/generate/case-decoder: validates auth, checks idempotency,
 * then fire-and-forget delegates to the Supabase Edge Function (150s timeout).
 *
 * Used for:
 *   - Manual operator retries on stuck/failed generations
 *   - Automated retry from the stuck-order detector cron
 *
 * The intake route (/api/intake/standalone/[slug]) also fires the Edge Function
 * directly — this route is the OPERATOR retry path.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";
import { getProduct } from "@/lib/products";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      "id, standalone_product_slug, standalone_intake, standalone_report_storage_path, status"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Validate it's a standalone product
  if (!order.standalone_product_slug) {
    return NextResponse.json(
      { error: "Not a standalone product order" },
      { status: 400 }
    );
  }

  const product = getProduct(order.standalone_product_slug);
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }

  // Idempotency: skip if report already exists (unless force=true)
  if (order.standalone_report_storage_path && !force) {
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

  // Fire-and-forget to Supabase Edge Function (150s timeout)
  const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-standalone`;

  fetch(edgeFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId, force }),
  }).catch((err) =>
    console.error("[Generate Standalone] Edge function invocation failed:", err)
  );

  return NextResponse.json({
    status: "generating",
    orderId,
    message: "Edge Function invoked — report generation started",
  });
}
