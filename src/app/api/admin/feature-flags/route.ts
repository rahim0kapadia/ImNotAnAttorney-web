/**
 * @file /api/admin/feature-flags — Admin API for feature flag management
 *
 * GET: List all feature flags (ordered by key)
 * PATCH: Toggle a feature flag on/off
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 *
 * IMPORTANT: Feature flags are SEPARATE from tier.live (Stripe routing).
 * This controls UI visibility and feature availability only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearFeatureFlagCache } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("*")
    .order("flag_key");

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  return NextResponse.json({ flags: data });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { flagKey, isEnabled } = body;

  if (!flagKey || typeof flagKey !== "string" || flagKey.length > 100) {
    return NextResponse.json({ error: "Invalid flagKey" }, { status: 400 });
  }
  if (typeof isEnabled !== "boolean") {
    return NextResponse.json({ error: "isEnabled must be boolean" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq("flag_key", flagKey)
    .select("id");

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  clearFeatureFlagCache();
  return NextResponse.json({ success: true });
}
