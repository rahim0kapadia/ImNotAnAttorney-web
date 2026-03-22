/**
 * @file /api/admin/partners — List and create bondsman partners.
 *
 * Auth: X-Admin-Password header (middleware + defense-in-depth guard).
 *
 * GET  — Returns all partners with stats, ordered by most recent.
 * POST — Creates a new partner, generates a Stripe promotion code,
 *        and stores everything in Supabase.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPartnerPromoCode } from "@/lib/referral";
import { normalizeEmail, isValidEmail } from "@/lib/site";
import { computeUnpaidCommission } from "@/lib/partner-data";
import { requireAdmin } from "@/lib/auth/guards";

/** Strip non-alphanumeric chars and uppercase. */
function sanitizePromoCode(s: string): string {
  return s.toUpperCase().split("").filter(c => (c >= "A" && c <= "Z") || (c >= "0" && c <= "9")).join("");
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("partners")
    .select("id, name, company, email, phone, region, status, commission_rate, promo_code, stripe_promo_code_id, notes, total_referrals, total_commission, total_paid_out, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Admin Partners] List error:", error);
    return NextResponse.json({ error: "Failed to load partners" }, { status: 500 });
  }

  // Calculate unpaid commission for each partner
  const partners = (data || []).map((p) => ({
    ...p,
    unpaid_commission: computeUnpaidCommission(p),
  }));

  return NextResponse.json({ partners });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { name, company, email, phone, region, promoCode, notes } = body;

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Validate field types and lengths
  const stringFields: Record<string, unknown> = { name, company, phone, region, promoCode, notes };
  const maxLengths: Record<string, number> = { name: 200, company: 200, phone: 50, region: 200, promoCode: 50, notes: 5000 };
  for (const [key, val] of Object.entries(stringFields)) {
    if (val !== undefined && val !== null) {
      if (typeof val !== "string") {
        return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
      }
      if (val.length > (maxLengths[key] || 500)) {
        return NextResponse.json({ error: `${key} exceeds maximum length` }, { status: 400 });
      }
    }
  }

  // Generate promo code: use provided or derive from name + randomized suffix
  let code: string;
  if (promoCode) {
    code = sanitizePromoCode(promoCode);
  } else {
    const base = sanitizePromoCode(name.split(" ").join("").slice(0, 8));
    const suffix = Math.floor(Math.random() * 900 + 100); // 3-digit random
    code = `${base}${suffix}`;
  }

  const supabase = createAdminClient();

  // Check for duplicate promo code and retry with new suffix if collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existingCode } = await supabase
      .from("partners")
      .select("id")
      .eq("promo_code", code)
      .limit(1)
      .maybeSingle();
    if (!existingCode) break;
    if (promoCode) {
      // User-specified code collides — fail with clear error
      return NextResponse.json(
        { error: `Promo code "${code}" is already in use` },
        { status: 409 }
      );
    }
    // Auto-generated collision — retry with new random suffix
    const base = sanitizePromoCode(name.split(" ").join("").slice(0, 8));
    code = `${base}${Math.floor(Math.random() * 900 + 100)}`;
  }

  // Final uniqueness check — if still colliding after 5 retries, fail
  {
    const { data: stillExists } = await supabase
      .from("partners")
      .select("id")
      .eq("promo_code", code)
      .limit(1)
      .maybeSingle();
    if (stillExists) {
      return NextResponse.json(
        { error: "Could not generate a unique promo code. Please try again or specify one manually." },
        { status: 409 }
      );
    }
  }

  // Check for duplicate email
  const { data: existing } = await supabase
    .from("partners")
    .select("id")
    .eq("email", normalizeEmail(email))
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
      email: normalizeEmail(email),
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
