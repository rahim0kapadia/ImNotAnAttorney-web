/**
 * PATCH /api/partner/settings, Update partner payment settings.
 *
 * Auth: session cookie validated via validatePartnerSession().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { VALID_PAYMENT_METHODS } from "@/lib/partner-data";
import { validateCheckInDays } from "@/lib/check-in-schedule";

export async function PATCH(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Explicit field allowlist — any unknown keys reject with 400. Task 6 (spec).
  const ALLOWED = new Set([
    "preferred_payment_method", "payment_zelle", "payment_venmo",
    "payment_check_address", "payment_paypal", "default_check_in_days",
    "check_in_enabled",
  ]);
  const unknown = Object.keys(body).filter((k) => !ALLOWED.has(k));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown field(s): ${unknown.join(", ")}` }, { status: 400 });
  }

  const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, default_check_in_days, check_in_enabled } = body;

  // Validate input types and lengths
  const stringFields = { payment_zelle, payment_venmo, payment_check_address, payment_paypal };
  for (const [key, val] of Object.entries(stringFields)) {
    if (val !== undefined && val !== null) {
      if (typeof val !== "string") {
        return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
      }
      const maxLen = key === "payment_check_address" ? 500 : 100;
      if (val.length > maxLen) {
        return NextResponse.json({ error: `${key} exceeds maximum length of ${maxLen}` }, { status: 400 });
      }
    }
  }

  // Validate payment method
  if (preferred_payment_method !== undefined && preferred_payment_method !== null && !VALID_PAYMENT_METHODS.includes(preferred_payment_method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  // Validate check-in days
  if (default_check_in_days !== undefined) {
    if (default_check_in_days !== null) {
      if (!Array.isArray(default_check_in_days)) {
        return NextResponse.json({ error: "default_check_in_days must be an array or null" }, { status: 400 });
      }
      if (default_check_in_days.length > 0 && !validateCheckInDays(default_check_in_days)) {
        return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
      }
    }
  }

  // Validate mode toggle (bondsman-modes v2); flip_at is stamped only on real change
  if (check_in_enabled !== undefined && typeof check_in_enabled !== "boolean") {
    return NextResponse.json({ error: "check_in_enabled must be a boolean" }, { status: 400 });
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
  if (payment_paypal !== undefined) {
    updates.payment_paypal = payment_paypal || null;
  }
  if (default_check_in_days !== undefined) {
    updates.default_check_in_days = default_check_in_days;
  }

  const supabase = createAdminClient();

  // Mode flip: atomic stamp. Scope the flip UPDATE to the OPPOSITE current
  // value so flip_at is only bumped when the row actually transitions. If
  // zero rows match, the partner was already at the requested value — fall
  // through to a regular update without stamping flip_at. This closes the
  // read-then-write race window a prior revision had.
  if (check_in_enabled !== undefined) {
    updates.check_in_enabled = check_in_enabled;
    const flipUpdates = { ...updates, flip_at: new Date().toISOString() };
    const { data: flipped, error: flipError } = await supabase
      .from("partners")
      .update(flipUpdates)
      .eq("id", partner.id)
      .eq("check_in_enabled", !check_in_enabled)
      .select("id");
    if (flipError) {
      console.error("[Partner Settings] Flip update error:", flipError);
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
    if (flipped && flipped.length > 0) {
      // Real flip happened; flip_at stamped atomically.
      return NextResponse.json({ saved: true });
    }
    // Already at requested value: fall through to regular update (no flip_at bump).
  }

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
