/**
 * GET /api/partner/dashboard — Partner dashboard data.
 *
 * Returns partner profile, recent referrals, and payout history.
 * Auth: session cookie validated via validatePartnerSession().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePartnerSession, PARTNER_SESSION_COOKIE } from "@/lib/partner-auth";

export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get(PARTNER_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partner = await validatePartnerSession(sessionToken);
  if (!partner) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch recent referrals (no PII — just tier, date, commission)
  const { data: referrals } = await supabase
    .from("referrals")
    .select("id, tier, sale_amount, commission_amount, commission_paid, created_at")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch payout history
  const { data: payouts } = await supabase
    .from("partner_payouts")
    .select("id, amount, payment_method, created_at")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Calculate earnings summary
  const totalEarned = (referrals || []).reduce(
    (sum, r) => sum + (r.commission_amount || 0),
    0
  );
  const totalPaid = (payouts || []).reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      email: partner.email,
      phone: partner.phone,
      company: partner.company,
      promo_code: partner.promo_code,
      commission_rate: partner.commission_rate,
      preferred_payment_method: partner.preferred_payment_method,
      payment_zelle: partner.payment_zelle,
      payment_venmo: partner.payment_venmo,
      payment_check_address: partner.payment_check_address,
    },
    earnings: {
      total_earned: totalEarned,
      total_paid: totalPaid,
      pending_payout: totalEarned - totalPaid,
      total_referrals: (referrals || []).length,
    },
    referrals: referrals || [],
    payouts: payouts || [],
  });
}
