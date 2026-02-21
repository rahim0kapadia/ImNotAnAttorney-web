import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, email, chargeType } = body;

    if (!firstName || !email || !chargeType) {
      return NextResponse.json(
        { error: "Required fields missing" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from("intakes").insert({
      first_name: firstName,
      last_name: body.lastName || null,
      email: email.toLowerCase().trim(),
      phone: body.phone || null,
      charge_type: chargeType,
      state: body.state || null,
      has_attorney: body.hasAttorney || null,
      has_discovery: body.hasDiscovery || null,
      services: body.services || [],
      situation: body.situation || null,
    });

    if (error) {
      console.error("[Intake] Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    // Send intake confirmation email
    await sendEmail({
      to: email.toLowerCase().trim(),
      subject: `We Received Your Case Details, ${escapeHtml(firstName)}`,
      unsubscribeEmail: email.toLowerCase().trim(),
      html: `
        <h1 style="color: #F59E0B;">Case Details Received</h1>
        <p>Thank you, ${escapeHtml(firstName)}. We've received your intake form.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(chargeType)}</p>
        </div>
        <h2 style="color: white; font-size: 18px;">What Happens Next</h2>
        <ol style="color: #D4D4D8; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Browse our <a href="https://imnotanattorney.com/services" style="color: #F59E0B;">services page</a> to find the right tier for your case</li>
          <li style="margin-bottom: 8px;">Purchase your chosen service — 100% of what you pay is credited if you upgrade later</li>
          <li style="margin-bottom: 8px;">We'll analyze your case and deliver your report within the guaranteed timeframe</li>
        </ol>
        <p style="color: #A1A1AA;">Not sure which tier? Start with the <a href="https://imnotanattorney.com/checkout?tier=case-decoder" style="color: #F59E0B;">Case Decoder ($97)</a> — it covers the essentials and every dollar counts toward an upgrade.</p>
      `,
    });

    // Send operator notification
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `New Intake: ${escapeHtml(chargeType)} — ${escapeHtml(firstName)}`,
      html: `
        <h1 style="color: #F59E0B;">New Intake Submission</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(body.lastName || "")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> ${email}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(chargeType)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> ${escapeHtml(body.state || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Has Attorney:</strong> ${body.hasAttorney || "Not specified"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Has Discovery:</strong> ${body.hasDiscovery || "Not specified"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Services:</strong> ${(body.services || []).join(", ") || "None selected"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
        ${body.situation ? `<div style="margin-top: 16px;"><p style="color: white; font-weight: bold;">Situation:</p><p style="color: #D4D4D8;">${escapeHtml(body.situation)}</p></div>` : ""}
      `,
    });

    return NextResponse.json({ message: "Intake received" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
