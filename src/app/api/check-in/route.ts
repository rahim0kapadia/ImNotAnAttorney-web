/**
 * POST /api/check-in — Defendant check-in endpoint.
 *
 * Accepts a prep page token + optional geolocation. Inserts into
 * client_check_ins. Rate-limited to one check-in per 12 hours.
 * No auth beyond the token (same model as prep page access).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendSMS, canSendClientSMS } from "@/lib/notification-prefs";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: { token?: string; latitude?: number; longitude?: number; accuracy_meters?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, latitude, longitude, accuracy_meters } = body;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Validate token matches an active court_reminders row
  const { data: reminder, error: reminderErr } = await supabase
    .from("court_reminders")
    .select("id, phone, notification_prefs, sms_consent_at")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (reminderErr || !reminder) {
    return NextResponse.json({ error: "Invalid or inactive token" }, { status: 404 });
  }

  // Check last check-in — enforce 12-hour cooldown
  const { data: lastCheckInRow } = await supabase
    .from("client_check_ins")
    .select("checked_in_at")
    .eq("court_reminder_id", reminder.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCheckInRow) {
    const lastTime = new Date(lastCheckInRow.checked_in_at).getTime();
    if (Date.now() - lastTime < TWELVE_HOURS_MS) {
      return NextResponse.json(
        { error: "Already checked in", lastCheckIn: lastCheckInRow.checked_in_at },
        { status: 429 },
      );
    }
  }

  // Insert check-in
  const { data: inserted, error: insertErr } = await supabase
    .from("client_check_ins")
    .insert({
      court_reminder_id: reminder.id,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      accuracy_meters: accuracy_meters ?? null,
      method: "web",
    })
    .select("checked_in_at")
    .single();

  if (insertErr) {
    console.error("[check-in] Insert failed:", insertErr);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }

  // SMS confirmation (fire-and-forget — don't delay the response)
  if (canSendClientSMS(reminder.phone, reminder.sms_consent_at)) {
    const prefs = getClientPrefs(reminder.notification_prefs);
    if (shouldSendSMS(prefs.check_in)) {
      sendSMS(reminder.phone!, `Check-in confirmed for ${new Date().toLocaleDateString("en-US")}.`)
        .catch(e => console.warn("[Check-In] SMS failed:", e));
    }
  }

  return NextResponse.json({ success: true, checkedInAt: inserted.checked_in_at });
}
