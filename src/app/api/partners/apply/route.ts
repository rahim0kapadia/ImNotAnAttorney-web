/**
 * @file /api/partners/apply — Public partner application endpoint.
 *
 * PUBLIC (no auth required). Rate-limited to prevent spam.
 * Auto-approves partners on application:
 *   1. Validate inputs + compliance checkbox
 *   2. Handle existing partner emails (re-send magic link, upgrade pending, block suspended)
 *   3. Create partner + Stripe promo codes (inactive until email verified)
 *   4. Insert audit trail in partner_applications
 *   5. Send welcome email with magic link
 *   6. Notify operator
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail, escapeHtml } from "@/lib/email";
import { getClientIp } from "@/lib/request";
import { normalizeEmail, isValidEmail, OPERATOR_EMAIL_FALLBACK, SITE_URL } from "@/lib/site";
import { createPartnerPromoCode, sanitizePromoCode } from "@/lib/referral";
import { generateMagicLink } from "@/lib/partner-auth";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || OPERATOR_EMAIL_FALLBACK;

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  // Rate limit: 3 applications per IP per hour
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(
    supabase,
    `partner-apply:${ip}`,
    3,
    3600
  );
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { name, company, email, phone, region, message, source, heardAboutUs, compliance } = body;

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  if (compliance !== true) {
    return NextResponse.json(
      { error: "You must agree to the Partner Terms of Service" },
      { status: 400 }
    );
  }

  // Type and length validation
  const MAX_LENGTHS: Record<string, number> = {
    name: 200, company: 200, email: 254, phone: 50,
    region: 200, message: 2000, source: 100, heardAboutUs: 500,
  };
  for (const [key, val] of Object.entries({ name, company, email, phone, region, message, source, heardAboutUs })) {
    if (val !== undefined && val !== null) {
      if (typeof val !== "string") {
        return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
      }
      if (val.length > (MAX_LENGTHS[key] || 500)) {
        return NextResponse.json({ error: `${key} exceeds maximum length` }, { status: 400 });
      }
    }
  }

  const normalizedEmail = normalizeEmail(email);

  // ── Check for existing partner ────────────────────────────────────────
  const { data: existingPartner } = await supabase
    .from("partners")
    .select("id, status, name, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingPartner) {
    // Always insert audit trail regardless of outcome
    await supabase.from("partner_applications").insert({
      name,
      company: company || null,
      email: normalizedEmail,
      phone: phone || null,
      region: region || null,
      message: message || null,
      source: source || null,
      heard_about_us: heardAboutUs || null,
      status: "converted",
    });

    if (existingPartner.status === "suspended") {
      // Don't leak suspension status — generic response
      return NextResponse.json({
        success: true,
        message: "Application received. We'll be in touch.",
      });
    }

    if (existingPartner.status === "approved") {
      // Already approved — send fresh magic link
      try {
        const mlResult = await generateMagicLink(normalizedEmail);
        if (mlResult) {
          const magicUrl = `${SITE_URL}/partner/login/verify#token=${mlResult.token}`;
          await sendEmail({
            to: normalizedEmail,
            subject: "Your ImNotAnAttorney Partner Dashboard Link",
            html: `
              <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #F59E0B;">Welcome Back, Partner</h2>
                <p style="color: #D4D4D8;">You're already an approved partner. Here's your dashboard link:</p>
                <a href="${magicUrl}" style="display: inline-block; padding: 12px 24px; background: #F59E0B; color: #000; font-weight: bold; text-decoration: none; border-radius: 8px; margin: 16px 0;">
                  Open Dashboard
                </a>
                <p style="color: #888; font-size: 14px;">This link expires in 15 minutes and can only be used once.</p>
              </div>
            `,
          });
        }
      } catch (emailErr) {
        console.error("[Partner Apply] Magic link email failed for existing partner:", emailErr);
      }
      return NextResponse.json({
        success: true,
        message: "You're already a partner! Check your email for your dashboard link.",
      });
    }

    if (existingPartner.status === "pending") {
      // Upgrade pending partner to approved — continue to promo code generation below
      // We'll use the existing partner record
    }
  }

  // ── Create or upgrade partner ─────────────────────────────────────────

  let partnerId: string;
  const partnerName: string = name.trim();

  if (existingPartner?.status === "pending") {
    // Upgrade existing pending partner
    const { error: updateError } = await supabase
      .from("partners")
      .update({
        status: "approved",
        name: partnerName,
        company: company || null,
        phone: phone || null,
      })
      .eq("id", existingPartner.id);

    if (updateError) {
      console.error("[Partner Apply] Upgrade pending partner error:", updateError);
      return NextResponse.json(
        { error: "Failed to process application" },
        { status: 500 }
      );
    }
    partnerId = existingPartner.id;
  } else {
    // Generate unique promo code from first name
    const firstName = partnerName.split(/\s+/)[0] || "PARTNER";
    let baseCode = sanitizePromoCode(firstName);
    if (baseCode.length < 2) baseCode = "PARTNER";

    let promoCode = baseCode;
    let suffix = 1;
     
    while (true) {
      const { data: existing } = await supabase
        .from("partners")
        .select("id")
        .eq("promo_code", promoCode)
        .maybeSingle();
      if (!existing) break;
      promoCode = `${baseCode}${suffix}`;
      suffix++;
      if (suffix > 100) {
        // Safety valve
        promoCode = `${baseCode}${Date.now().toString(36).toUpperCase()}`;
        break;
      }
    }

    // Create new partner (approved immediately)
    const { data: newPartner, error: insertError } = await supabase
      .from("partners")
      .insert({
        name: partnerName,
        company: company || null,
        email: normalizedEmail,
        phone: phone || null,
        status: "approved",
        promo_code: promoCode,
        commission_rate: 10,
      })
      .select("id, promo_code")
      .single();

    if (insertError) {
      console.error("[Partner Apply] Partner insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create partner account" },
        { status: 500 }
      );
    }

    partnerId = newPartner.id;

    // Create Stripe promo codes (inactive — activated on email verification)
    try {
      const stripePromo = await createPartnerPromoCode(partnerId, promoCode, partnerName);
      await supabase
        .from("partners")
        .update({ stripe_promo_code_id: stripePromo.id })
        .eq("id", partnerId);
    } catch (stripeErr) {
      console.error("[Partner Apply] Stripe promo code creation failed:", stripeErr);
      // Non-fatal — partner still gets approved, promo code can be created manually
    }

    // Insert audit trail
    await supabase.from("partner_applications").insert({
      name,
      company: company || null,
      email: normalizedEmail,
      phone: phone || null,
      region: region || null,
      message: message || null,
      source: source || null,
      heard_about_us: heardAboutUs || null,
      status: "converted",
    });
  }

  // ── Generate magic link and send welcome email ────────────────────────

  let magicUrl: string | null = null;
  try {
    const mlResult = await generateMagicLink(normalizedEmail);
    if (mlResult) {
      magicUrl = `${SITE_URL}/partner/login/verify#token=${mlResult.token}`;
    }
  } catch (mlErr) {
    console.error("[Partner Apply] Magic link generation failed:", mlErr);
  }

  // Fetch the partner's promo code for the welcome email
  const { data: partnerRecord } = await supabase
    .from("partners")
    .select("promo_code")
    .eq("id", partnerId)
    .single();

  const displayCode = partnerRecord?.promo_code || "(check your dashboard)";

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "You're In — Your ImNotAnAttorney Partner Code",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #0A0A0A; padding: 32px; border-radius: 12px;">
          <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Welcome to the Partner Program</h1>
          <p style="color: #D4D4D8; line-height: 1.6;">Hey ${escapeHtml(partnerName)},</p>
          <p style="color: #D4D4D8; line-height: 1.6;">You're approved. Here's your promo code:</p>
          <div style="background: #1C1917; border: 2px solid #F59E0B; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="color: #F59E0B; font-size: 28px; font-weight: bold; letter-spacing: 2px;">${escapeHtml(displayCode)}</span>
          </div>
          <p style="color: #D4D4D8; line-height: 1.6;">
            Your code activates when you click the button below to verify your email.
            Share it with clients for 10% off any product — you earn 10% commission on every sale.
          </p>
          ${magicUrl ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${magicUrl}" style="display: inline-block; padding: 14px 32px; background: #F59E0B; color: #000; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">
              Verify Email &amp; Open Dashboard
            </a>
          </div>
          <p style="color: #71717A; font-size: 13px;">This link expires in 15 minutes. You can request a new one from the login page anytime.</p>
          ` : `
          <p style="color: #D4D4D8; line-height: 1.6;">
            <a href="${SITE_URL}/partner/login" style="color: #F59E0B;">Log in to your dashboard</a> to verify your email and activate your code.
          </p>
          `}
          <hr style="border: none; border-top: 1px solid #27272A; margin: 24px 0;" />
          <p style="color: #71717A; font-size: 13px;">
            Questions? Reply to this email or reach out anytime.<br />
            — The ImNotAnAttorney Team
          </p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("[Partner Apply] Welcome email failed:", emailErr);
  }

  // ── Notify operator ───────────────────────────────────────────────────

  try {
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `New Partner Auto-Approved (${source || "direct"}): ${name}`,
      html: `
        <h1 style="color: #F59E0B;">New Partner — Auto-Approved</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; border-left: 4px solid #F59E0B;">
          <p style="color: #D4D4D8; margin: 0;"><strong style="color: white;">Name:</strong> ${escapeHtml(name)}</p>
          ${company ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Company:</strong> ${escapeHtml(company)}</p>` : ""}
          <p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Email:</strong> ${escapeHtml(email)}</p>
          <p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Promo Code:</strong> ${escapeHtml(displayCode)}</p>
          ${phone ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
          ${region ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Region:</strong> ${escapeHtml(region)}</p>` : ""}
          ${message ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Message:</strong> ${escapeHtml(message)}</p>` : ""}
          ${heardAboutUs ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Heard About Us:</strong> ${escapeHtml(heardAboutUs)}</p>` : ""}
        </div>
        <p style="color: #71717A; margin-top: 16px;">Partner promo code is inactive until email verified. Dashboard at /admin/partners</p>
      `,
    });
  } catch (emailErr) {
    console.error("[Partner Apply] Operator notification email failed:", emailErr);
  }

  return NextResponse.json({
    success: true,
    message: "You're in! Check your email for your partner code and dashboard link.",
  });
}
