/**
 * @file /api/admin/partners/[id] — Partner detail, update, and payout.
 *
 * Auth: X-Admin-Password header (enforced by middleware).
 *
 * GET   — Partner detail + referral history
 * PATCH — Update status, notes, commission rate
 * POST  — Mark unpaid commissions as paid (payout action)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const supabase = createAdminClient();

  // Fetch partner
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("*")
    .eq("id", id)
    .single();

  if (partnerError || !partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  // Fetch referral history
  const { data: referrals, error: refError } = await supabase
    .from("referrals")
    .select("*")
    .eq("partner_id", id)
    .order("created_at", { ascending: false });

  if (refError) {
    console.error("[Admin Partners] Referrals fetch error:", refError);
  }

  return NextResponse.json({
    partner: {
      ...partner,
      unpaid_commission: (partner.total_commission || 0) - (partner.total_paid_out || 0),
    },
    referrals: referrals || [],
  });
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const body = await req.json();
  const { status, notes, commission_rate } = body;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status && ["pending", "approved", "suspended"].includes(status)) {
    updates.status = status;
  }
  if (notes !== undefined) {
    updates.notes = notes;
  }
  if (commission_rate !== undefined && typeof commission_rate === "number" && commission_rate >= 0 && commission_rate <= 100) {
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
 * POST /api/admin/partners/[id] — Mark unpaid commissions as paid.
 * Sets commission_paid=true on all unpaid referrals for this partner,
 * updates total_paid_out on the partner record.
 */
export async function POST(
  _req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const supabase = createAdminClient();

  // Get all unpaid referrals for this partner
  const { data: unpaidReferrals, error: fetchError } = await supabase
    .from("referrals")
    .select("id, commission_amount")
    .eq("partner_id", id)
    .eq("commission_paid", false);

  if (fetchError) {
    console.error("[Admin Partners] Payout fetch error:", fetchError);
    return NextResponse.json({ error: "Failed to fetch unpaid referrals" }, { status: 500 });
  }

  if (!unpaidReferrals || unpaidReferrals.length === 0) {
    return NextResponse.json({ message: "No unpaid commissions", paid: 0 });
  }

  const totalPayout = unpaidReferrals.reduce(
    (sum, r) => sum + (r.commission_amount || 0),
    0
  );

  // Mark all as paid
  const referralIds = unpaidReferrals.map((r) => r.id);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("referrals")
    .update({ commission_paid: true, paid_at: now })
    .in("id", referralIds);

  if (updateError) {
    console.error("[Admin Partners] Payout update error:", updateError);
    return NextResponse.json({ error: "Failed to mark as paid" }, { status: 500 });
  }

  // Update partner's total_paid_out
  const { data: partner } = await supabase
    .from("partners")
    .select("total_paid_out")
    .eq("id", id)
    .single();

  await supabase
    .from("partners")
    .update({
      total_paid_out: (partner?.total_paid_out || 0) + totalPayout,
      updated_at: now,
    })
    .eq("id", id);

  return NextResponse.json({
    message: "Payout recorded",
    paid: totalPayout,
    referrals_marked: referralIds.length,
  });
}
