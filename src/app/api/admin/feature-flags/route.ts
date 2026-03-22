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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { flagKey, isEnabled } = await req.json();
  if (!flagKey || typeof isEnabled !== "boolean") {
    return NextResponse.json({ error: "flagKey and isEnabled required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("feature_flags")
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq("flag_key", flagKey);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  clearFeatureFlagCache();
  return NextResponse.json({ success: true });
}
