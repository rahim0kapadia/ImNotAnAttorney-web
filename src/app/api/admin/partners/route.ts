/**
 * @file /api/admin/partners — List and create bondsman partners.
 *
 * Auth: X-Admin-Password header (enforced by middleware).
 *
 * GET  — Returns all partners with stats, ordered by most recent.
 * POST — Creates a new partner, generates a Stripe promotion code,
 *        and stores everything in Supabase.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPartnerPromoCode } from "@/lib/referral";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("partners")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Admin Partners] List error:", error);
    return NextResponse.json({ error: "Failed to load partners" }, { status: 500 });
  }

  // Calculate unpaid commission for each partner
  const partners = (data || []).map((p) => ({
    ...p,
    unpaid_commission: (p.total_commission || 0) - (p.total_paid_out || 0),
  }));

  return NextResponse.json({ partners });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, company, email, phone, region, promoCode, notes } = body;

  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  // Generate promo code: use provided or derive from name (short string, regex safe)
  const rawCode = promoCode || name.split(" ").join("").slice(0, 12) + "10";
  const code = rawCode.toUpperCase().split("").filter((c: string) =>
    (c >= "A" && c <= "Z") || (c >= "0" && c <= "9")
  ).join("");

  const supabase = createAdminClient();

  // Check for duplicate email
  const { data: existing } = await supabase
    .from("partners")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A partner with this email already exists" },
      { status: 409 }
    );
  }

  // Insert partner first to get the ID
  const { data: partner, error: insertError } = await supabase
    .from("partners")
    .insert({
      name,
      company: company || null,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      region: region || null,
      promo_code: code,
      notes: notes || null,
      status: "approved", // Admin-created partners are auto-approved
    })
    .select("id, name")
    .single();

  if (insertError) {
    console.error("[Admin Partners] Insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to create partner" },
      { status: 500 }
    );
  }

  // Create Stripe promotion code
  try {
    const stripePromo = await createPartnerPromoCode(partner.id, code, partner.name);

    // Update partner with Stripe promo code references
    await supabase
      .from("partners")
      .update({
        stripe_coupon_id: "bondsman-referral-10pct",
        stripe_promo_code_id: stripePromo.id,
      })
      .eq("id", partner.id);
  } catch (stripeErr) {
    console.error("[Admin Partners] Stripe promo code error:", stripeErr);
    // Partner created but promo code failed — don't roll back, operator can retry
    return NextResponse.json({
      partner: { ...partner, promo_code: code },
      warning: "Partner created but Stripe promo code failed. Check logs.",
    }, { status: 201 });
  }

  return NextResponse.json({
    partner: { id: partner.id, name: partner.name, promo_code: code },
  }, { status: 201 });
}
