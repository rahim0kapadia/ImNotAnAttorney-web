/**
 * POST /api/partner/add-client — Partner adds a client manually.
 *
 * Creates a court_reminders row attributed to the partner.
 * Sends the client a sign-up confirmation email with their prep page link.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";
import { randomUUID } from "crypto";

interface AddClientBody {
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  last_name?: string;
  indemnitor_name?: string;
  indemnitor_email?: string;
}

export async function POST(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  let body: AddClientBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { first_name, email, charge_type, county_state, court_date } = body;
  if (!first_name?.trim() || !email?.trim() || !charge_type?.trim() || !county_state?.trim() || !court_date?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (!CHARGE_DISPLAY_NAMES[charge_type]) {
    return NextResponse.json({ error: "Invalid charge type" }, { status: 400 });
  }

  const courtDateObj = new Date(court_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(courtDateObj.getTime()) || courtDateObj < today) {
    return NextResponse.json({ error: "Court date must be in the future" }, { status: 400 });
  }

  const token = randomUUID();
  const supabase = createAdminClient();

  const { error: insertErr } = await supabase.from("court_reminders").insert({
    token,
    first_name: first_name.trim(),
    email: email.trim().toLowerCase(),
    charge_type,
    county_state: county_state.trim(),
    court_date,
    partner_promo_code: partner.promo_code,
  });

  if (insertErr) {
    console.error("[Partner Add Client] Insert error:", insertErr);
    return NextResponse.json({ error: "Failed to add client" }, { status: 500 });
  }

  // Send client their prep page link
  const prepUrl = `${SITE_URL}/prep/${token}`;
  const safeName = escapeHtml(first_name.trim());
  const safeCompany = escapeHtml(partner.company || partner.name);
  try {
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: "Your court prep page is ready",
      html: `
        <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Your court prep is set up, ${safeName}.</h1>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">${safeCompany} set this up for you. We'll send you reminders before your court date so you don't miss anything.</p>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">Your personalized prep page — what to expect, what to bring, and how to prepare:</p>
        <p style="margin: 24px 0;"><a href="${prepUrl}" style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Court Prep</a></p>
        <p style="color: #71717A; font-size: 13px;">Bookmark this link — it's yours. We'll also include it in every reminder email.</p>
      `,
    });
  } catch (e) {
    console.warn("[Partner Add Client] Email failed:", e);
  }

  return NextResponse.json({ success: true });
}
