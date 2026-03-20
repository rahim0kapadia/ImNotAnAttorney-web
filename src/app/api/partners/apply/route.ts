/**
 * @file /api/partners/apply — Public partner application endpoint.
 *
 * PUBLIC (no auth required). Rate-limited to prevent spam.
 * Inserts an application into partner_applications and notifies the operator.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail, escapeHtml } from "@/lib/email";
import { normalizeEmail, isValidEmail, OPERATOR_EMAIL_FALLBACK } from "@/lib/site";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || OPERATOR_EMAIL_FALLBACK;

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  // Rate limit: 3 applications per IP per hour
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
  const { name, company, email, phone, region, message, source, heardAboutUs } = body;

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

  const { error } = await supabase.from("partner_applications").insert({
    name,
    company: company || null,
    email: normalizeEmail(email),
    phone: phone || null,
    region: region || null,
    message: message || null,
    source: source || null,
    heard_about_us: heardAboutUs || null,
  });

  if (error) {
    console.error("[Partner Apply] Insert error:", error);
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }

  // Notify operator (fire-and-forget — don't fail the application if email fails)
  try {
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `New Partner Application (${source || "direct"}): ${name}`,
      html: `
        <h1 style="color: #F59E0B;">New Partner Application</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; border-left: 4px solid #F59E0B;">
          <p style="color: #D4D4D8; margin: 0;"><strong style="color: white;">Name:</strong> ${escapeHtml(name)}</p>
          ${company ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Company:</strong> ${escapeHtml(company)}</p>` : ""}
          <p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Email:</strong> ${escapeHtml(email)}</p>
          ${phone ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
          ${region ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Region:</strong> ${escapeHtml(region)}</p>` : ""}
          ${message ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Message:</strong> ${escapeHtml(message)}</p>` : ""}
          ${heardAboutUs ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Heard About Us:</strong> ${escapeHtml(heardAboutUs)}</p>` : ""}
        </div>
        <p style="color: #71717A; margin-top: 16px;">Review and approve at /admin/partners</p>
      `,
    });
  } catch (emailErr) {
    console.error("[Partner Apply] Operator notification email failed:", emailErr);
  }

  return NextResponse.json({ success: true });
}
