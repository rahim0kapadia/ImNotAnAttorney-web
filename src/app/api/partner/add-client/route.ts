/**
 * POST /api/partner/add-client, Partner adds a client manually.
 *
 * Creates a court_reminders row attributed to the partner.
 * Sends the client a sign-up confirmation email with their prep page link.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { AddClientSchema } from "@/lib/partner-schemas";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  const parsed = AddClientSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const {
    first_name,
    last_name,
    email,
    charge_type,
    county_state,
    court_date,
    indemnitor_name,
    indemnitor_email,
  } = parsed.data;

  // future-date check (needs runtime today, kept in route)
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
    ...(last_name?.trim() && { last_name: last_name.trim() }),
    ...(indemnitor_name?.trim() && { indemnitor_name: indemnitor_name.trim() }),
    ...(indemnitor_email?.trim() && { indemnitor_email: indemnitor_email.trim().toLowerCase() }),
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
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">Your personalized prep page, what to expect, what to bring, and how to prepare:</p>
        <p style="margin: 24px 0;"><a href="${prepUrl}" style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Court Prep</a></p>
        <p style="color: #71717A; font-size: 13px;">Bookmark this link, it's yours. We'll also include it in every reminder email.</p>
      `,
    });
  } catch (e) {
    console.warn("[Partner Add Client] Email failed:", e);
  }

  // Send indemnitor (co-signer) a welcome email if provided
  if (indemnitor_email?.trim()) {
    const safeIndemnitorName = escapeHtml(indemnitor_name?.trim() || "");
    try {
      await sendEmail({
        to: indemnitor_email.trim().toLowerCase(),
        subject: `Court date reminder set up for ${safeName}`,
        html: `
          <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Court date reminders are set up.</h1>
          <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">${safeCompany} set up court date reminders for ${safeName}.${safeIndemnitorName ? ` ${safeIndemnitorName}, you` : " You"}'ll receive reminder emails before their court date on ${escapeHtml(court_date)}.</p>
          <p style="color: #71717A; font-size: 13px;">ImNotAnAttorney provides legal information, not legal advice.</p>
        `,
      });
    } catch (e) {
      console.warn("[Partner Add Client] Indemnitor email failed:", e);
    }
  }

  return NextResponse.json({ success: true });
}
