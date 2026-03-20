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

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

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

  const body = await req.json();
  const { name, company, email, phone, region, message } = body;

  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  // Basic email validation (short string, regex safe)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("partner_applications").insert({
    name,
    company: company || null,
    email: email.toLowerCase().trim(),
    phone: phone || null,
    region: region || null,
    message: message || null,
  });

  if (error) {
    console.error("[Partner Apply] Insert error:", error);
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }

  // Notify operator
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `New Bondsman Partner Application: ${escapeHtml(name)}`,
    html: `
      <h1 style="color: #F59E0B;">New Partner Application</h1>
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; border-left: 4px solid #F59E0B;">
        <p style="color: #D4D4D8; margin: 0;"><strong style="color: white;">Name:</strong> ${escapeHtml(name)}</p>
        ${company ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Company:</strong> ${escapeHtml(company)}</p>` : ""}
        <p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Email:</strong> ${escapeHtml(email)}</p>
        ${phone ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
        ${region ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Region:</strong> ${escapeHtml(region)}</p>` : ""}
        ${message ? `<p style="color: #D4D4D8; margin: 8px 0 0;"><strong style="color: white;">Message:</strong> ${escapeHtml(message)}</p>` : ""}
      </div>
      <p style="color: #71717A; margin-top: 16px;">Review and approve at /admin/partners</p>
    `,
  });

  return NextResponse.json({ success: true });
}
