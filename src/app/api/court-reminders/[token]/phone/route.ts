// src/app/api/court-reminders/[token]/phone/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoUpgradeOnPhone } from "@/lib/notification-prefs";
import { normalizePhone, isValidPhone } from "@/lib/site";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let body: { phone: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone || "");
  if (!isValidPhone(phone)) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit US phone number" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: reminder, error: fetchErr } = await supabase
    .from("court_reminders")
    .select("id, notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (fetchErr || !reminder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({
      phone,
      sms_consent_at: new Date().toISOString(),
      notification_prefs: autoUpgradeOnPhone(reminder.notification_prefs),
    })
    .eq("id", reminder.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
