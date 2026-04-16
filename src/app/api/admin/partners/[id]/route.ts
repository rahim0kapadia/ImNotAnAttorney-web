/**
 * @file /api/admin/partners/[id], Partner detail, update, and payout.
 *
 * Auth: X-Admin-Password header (middleware + defense-in-depth guard).
 *
 * GET  , Partner detail + referral history
 * PATCH, Update status, notes, commission rate
 * POST , Mark unpaid commissions as paid (payout action)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VALID_PAYMENT_METHODS, computeUnpaidCommission } from "@/lib/partner-data";
import { requireAdmin } from "@/lib/auth/guards";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid partner ID" }, { status: 400 });
  }
  const supabase = createAdminClient();

  // Fetch partner
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, name, company, email, phone, region, status, commission_rate, promo_code, stripe_promo_code_id, notes, total_referrals, total_commission, total_paid_out, preferred_payment_method, created_at")
    .eq("id", id)
    .single();

  if (partnerError || !partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  // Fetch referral history
  const { data: referrals, error: refError } = await supabase
    .from("referrals")
    .select("id, tier, sale_amount, discount_amount, commission_amount, commission_paid, paid_at, created_at")
    .eq("partner_id", id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (refError) {
    console.error("[Admin Partners] Referrals fetch error:", refError);
  }

  return NextResponse.json({
    partner: {
      ...partner,
      unpaid_commission: computeUnpaidCommission(partner),
    },
    referrals: referrals || [],
  });
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid partner ID" }, { status: 400 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { status, notes, commission_rate } = body;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const VALID_STATUSES = ["pending", "approved", "suspended"];
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    updates.status = status;
  }
  if (notes !== undefined) {
    if (typeof notes !== "string" || notes.length > 5000) {
      return NextResponse.json({ error: "Notes must be a string under 5000 characters" }, { status: 400 });
    }
    updates.notes = notes;
  }
  if (commission_rate !== undefined) {
    if (typeof commission_rate !== "number" || commission_rate < 0 || commission_rate > 100) {
      return NextResponse.json({ error: "Commission rate must be a number between 0 and 100" }, { status: 400 });
    }
    updates.commission_rate = commission_rate;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .update(updates)
    .eq("id", id)
    .select("id, name, status, commission_rate, notes")
    .single();

  if (error) {
    console.error("[Admin Partners] Update error:", error);
    return NextResponse.json({ error: "Failed to update partner" }, { status: 500 });
  }

  return NextResponse.json({ partner: data });
}

/**
 * POST /api/admin/partners/[id], Mark unpaid commissions as paid.
 * Uses an atomic RPC to prevent race conditions (double-pay).
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid partner ID" }, { status: 400 });
  }
  const supabase = createAdminClient();

  // Get partner's payment method info
  const { data: partnerInfo } = await supabase
    .from("partners")
    .select("preferred_payment_method")
    .eq("id", id)
    .single();

  // Allow admin to override payment method in request body
  let paymentMethod = partnerInfo?.preferred_payment_method || "zelle";
  try {
    const body = await req.json();
    if (body.payment_method) paymentMethod = body.payment_method;
  } catch {
    // No body, use partner's preferred method
  }

  // Validate payment method
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  // Atomic payout: lock referrals, create payout record, mark paid, increment total, all in one transaction
  const { data, error } = await supabase.rpc("process_partner_payout", {
    p_partner_id: id,
    p_payment_method: paymentMethod,
  });

  if (error) {
    console.error("[Admin Partners] Payout RPC error:", error);
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }

  // Payout notification email to partner (non-fatal)
  try {
    const { partnerPayoutNotificationEmail } = await import("@/lib/partner-emails");
    const { sendEmail } = await import("@/lib/email");
    const { data: partnerForNotif } = await supabase
      .from("partners")
      .select("name, email, preferred_payment_method")
      .eq("id", id)
      .single();
    if (partnerForNotif?.email && data?.payout_amount) {
      const { subject, html } = partnerPayoutNotificationEmail(
        partnerForNotif.name,
        data.payout_amount,
        paymentMethod || partnerForNotif.preferred_payment_method || "zelle"
      );
      await sendEmail(
        { to: partnerForNotif.email, subject, html, unsubscribeEmail: partnerForNotif.email },
        { category: "partner-payout-notification", metadata: { partner_id: id, amount: data.payout_amount, method: paymentMethod } }
      );
    }
  } catch (notifErr) {
    console.error("[Admin Partners] Payout notification email failed:", notifErr);
  }

  return NextResponse.json(data);
}
