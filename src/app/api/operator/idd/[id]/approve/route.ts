/**
 * @file /api/operator/idd/[id]/approve — Approve an IDD scholarship application
 *
 * POST: Creates a $0 order with the granted product slug, links it to the
 *       application, and sends an intake-link email to the applicant.
 *       Uses the same standalone intake pipeline as paid customers.
 *
 * Body: { productSlug: string }
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { getProduct } from "@/lib/products";
import { sendEmailWithOperatorAlert, escapeHtml } from "@/lib/email";
import { randomUUID } from "crypto";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await params;

  let body: { productSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { productSlug } = body;
  if (!productSlug) {
    return NextResponse.json({ error: "productSlug is required" }, { status: 400 });
  }

  const product = getProduct(productSlug);
  if (!product) {
    return NextResponse.json({ error: `Unknown product: ${productSlug}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: app, error: fetchErr } = await supabase
    .from("idd_applications")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (app.status !== "pending" && app.status !== "waitlisted") {
    return NextResponse.json(
      { error: `Cannot approve: status is ${app.status}` },
      { status: 409 }
    );
  }

  // Create $0 order — uses the same standalone intake pipeline as paid orders
  const intakeToken = randomUUID();
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      email: app.email,
      tier: "standalone",
      amount: 0,
      status: "paid",
      product_type: "scholarship",
      standalone_product_slug: productSlug,
      standalone_intake_token: intakeToken,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr) {
    console.error("[Operator/IDD/Approve] Order insert failed:", orderErr);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  // Link order to application + mark approved
  const { error: updateErr } = await supabase
    .from("idd_applications")
    .update({
      status: "approved",
      approved_product_slug: productSlug,
      order_id: order.id,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "operator",
    })
    .eq("id", id);

  if (updateErr) {
    // Order was created — log but don't fail. Operator can manually link.
    console.error(
      "[Operator/IDD/Approve] Application update failed — order created:",
      order.id,
      "app:",
      id,
      updateErr
    );
  }

  // Increment fulfilled counter (fire-and-forget — non-critical)
  supabase
    .rpc("increment_counter", { counter_key: "scholarships_fulfilled", amount: 1 })
    .then(({ error: rpcErr }) => {
      if (rpcErr) console.error("[Operator/IDD/Approve] Counter increment failed:", rpcErr.message);
    });

  // Send intake link email via project email wrapper (handles CAN-SPAM + retry + audit log)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
  const intakeUrl = `${siteUrl}/intake/standalone/${productSlug}?token=${intakeToken}`;

  await sendEmailWithOperatorAlert(
    {
      to: app.email,
      subject: `Your IDD Scholarship Has Been Approved — ${product.name}`,
      html: `
        <h1 style="font-size: 22px; color: #FAFAF9; margin-bottom: 16px;">Your Scholarship Has Been Approved</h1>
        <p>Hi ${escapeHtml(app.first_name)},</p>
        <p>Your IDD scholarship application has been approved. You have been granted free access to <strong>${escapeHtml(product.name)}</strong>.</p>
        <p>To get started, please complete your intake form:</p>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(intakeUrl)}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#000;text-decoration:none;border-radius:8px;font-weight:600;">
            Complete Intake Form
          </a>
        </p>
        <p style="color: #A8A29E; font-size: 14px;">This link is unique to you. Once you submit your information, our research team will begin your analysis.</p>
        <p>— The ImNotAnAttorney Research Team</p>
      `,
    },
    `IDD scholarship approval email for ${app.email} (app ${id})`,
    { category: "idd-scholarship-approval", order_id: order.id }
  );

  return NextResponse.json({
    status: "approved",
    orderId: order.id,
    intakeUrl,
  });
}
