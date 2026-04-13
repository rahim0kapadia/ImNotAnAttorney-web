/**
 * POST /api/court-reminders — Creates a court reminder sign-up.
 *
 * Validates input, generates a unique token, stores in Supabase,
 * sends confirmation email, returns the prep page token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/email";
import { randomUUID } from "crypto";
import type { CourtReminder } from "@/lib/court-reminders";

interface CreateBody {
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  recommended_tier?: string;
  partner_promo_code?: string;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Validate required fields ──
  const { first_name, email, charge_type, county_state, court_date } = body;
  if (!first_name?.trim() || !email?.trim() || !charge_type?.trim() || !county_state?.trim() || !court_date?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Court date must be in the future
  const courtDateObj = new Date(court_date + "T00:00:00");
  if (isNaN(courtDateObj.getTime()) || courtDateObj < new Date()) {
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
    recommended_tier: body.recommended_tier || null,
    partner_promo_code: body.partner_promo_code || null,
  });

  if (insertErr) {
    console.error("[Court Reminders] Insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }

  // ── Send confirmation email ──
  const prepUrl = `${SITE_URL}/prep/${token}`;
  const safeName = escapeHtml(first_name.trim());
  try {
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: "Your court prep page is ready",
      html: `
        <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Your court prep is set up, ${safeName}.</h1>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">We'll send you reminders before your court date so you don't miss anything.</p>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">Your personalized prep page — what to expect, what to bring, and how to prepare:</p>
        <p style="margin: 24px 0;"><a href="${prepUrl}" style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Court Prep</a></p>
        <p style="color: #71717A; font-size: 13px;">Bookmark this link — it's yours. We'll also include it in every reminder email.</p>
      `,
    });
  } catch (e) {
    console.warn("[Court Reminders] Confirmation email failed:", e);
    // Non-fatal — reminder was still created
  }

  return NextResponse.json({ token, prepUrl });
}
