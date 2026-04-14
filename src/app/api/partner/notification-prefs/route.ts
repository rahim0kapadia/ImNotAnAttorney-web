// src/app/api/partner/notification-prefs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import type { PartnerNotificationPrefs } from "@/lib/notification-prefs";
import { PARTNER_DEFAULTS, getPartnerPrefs } from "@/lib/notification-prefs";

const VALID_CHANNELS = new Set(["email", "sms", "both"]);
const VALID_KEYS = new Set(Object.keys(PARTNER_DEFAULTS));

export async function GET(req: NextRequest) {
  const { partner, error } = await requirePartnerAuth(req);
  if (error) return error;

  const prefs = getPartnerPrefs(partner.notification_prefs || null);
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  let body: Partial<PartnerNotificationPrefs>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const [key, val] of Object.entries(body)) {
    if (!VALID_KEYS.has(key)) return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
    if (!VALID_CHANNELS.has(val as string)) return NextResponse.json({ error: `Invalid channel for ${key}: ${val}` }, { status: 400 });
  }

  const needsSMS = Object.values(body).some((v) => v === "sms" || v === "both");
  if (needsSMS && !partner.phone) {
    return NextResponse.json({ error: "Add your phone number before enabling SMS notifications." }, { status: 400 });
  }

  const existing = partner.notification_prefs || {};
  const updated = { ...existing, ...body };

  const supabase = createAdminClient();
  const { error: updateErr } = await supabase
    .from("partners")
    .update({ notification_prefs: updated })
    .eq("id", partner.id);

  if (updateErr) {
    console.error("[Partner Notification Prefs] Update error:", updateErr);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json(getPartnerPrefs(updated));
}
