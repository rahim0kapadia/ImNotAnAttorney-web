// src/app/api/court-reminders/[token]/prefs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientPrefs, validateClientPrefs, CLIENT_DEFAULTS } from "@/lib/notification-prefs";
import type { ClientNotificationPrefs } from "@/lib/notification-prefs";

const VALID_CHANNELS = new Set(["email", "sms", "both"]);
const VALID_KEYS = new Set(Object.keys(CLIENT_DEFAULTS));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(getClientPrefs(reminder.notification_prefs));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let body: Partial<ClientNotificationPrefs>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const [key, val] of Object.entries(body)) {
    if (!VALID_KEYS.has(key)) return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
    if (!VALID_CHANNELS.has(val as string)) return NextResponse.json({ error: `Invalid channel: ${val}` }, { status: 400 });
  }

  // SAFETY: court_reminders must never be "sms" alone
  if (!validateClientPrefs(body)) {
    return NextResponse.json(
      { error: "Court reminders require email, choose Email or Both." },
      { status: 400 }
    );
  }

  // SMS prefs require phone + consent on file
  const supabase = createAdminClient();
  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("id, phone, sms_consent_at, notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const needsSMS = Object.values(body).some(v => v === "sms" || v === "both");
  if (needsSMS && (!reminder.phone || !reminder.sms_consent_at)) {
    return NextResponse.json({ error: "Add your phone number first." }, { status: 400 });
  }

  const updated = { ...(reminder.notification_prefs || {}), ...body };
  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({ notification_prefs: updated })
    .eq("id", reminder.id);

  if (updateErr) return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  return NextResponse.json(getClientPrefs(updated));
}
