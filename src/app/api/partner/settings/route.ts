/**
 * PATCH /api/partner/settings — Update partner payment settings.
 *
 * Auth: session cookie validated via validatePartnerSession().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePartnerSession, PARTNER_SESSION_COOKIE } from "@/lib/partner-auth";

const VALID_METHODS = ["zelle", "venmo", "check"];

export async function PATCH(req: NextRequest) {
  const sessionToken = req.cookies.get(PARTNER_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partner = await validatePartnerSession(sessionToken);
  if (!partner) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const body = await req.json();
  const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address } = body;

  // Validate payment method
  if (preferred_payment_method && !VALID_METHODS.includes(preferred_payment_method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (preferred_payment_method !== undefined) {
    updates.preferred_payment_method = preferred_payment_method;
  }
  if (payment_zelle !== undefined) {
    updates.payment_zelle = payment_zelle || null;
  }
  if (payment_venmo !== undefined) {
    updates.payment_venmo = payment_venmo || null;
  }
  if (payment_check_address !== undefined) {
    updates.payment_check_address = payment_check_address || null;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("partners")
    .update(updates)
    .eq("id", partner.id);

  if (error) {
    console.error("[Partner Settings] Update error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
