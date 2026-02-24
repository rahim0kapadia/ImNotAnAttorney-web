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
      time_since_arrest: body.timeSinceArrest || null,
      arrest_circumstances: body.arrestCircumstances || [],
      incident_location: body.incidentLocation || null,
      co_defendants: body.coDefendants || null,
      attorney_strategy: body.attorneyStrategy || null,
      specific_question: body.specificQuestion || null,
      case_number: body.caseNumber || null,
      court_date: body.courtDate || null,
      plea_offered: body.pleaOffered || null,
      plea_terms: body.pleaTerms || null,
      communication_frequency: body.communicationFrequency || null,
      last_attorney_contact: body.lastAttorneyContact || null,
      arrest_date: body.arrestDate || null,
      evidence_type: body.evidenceType || [],
    });

    if (error) {
      console.error("[Intake] Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    // Check if a case exists for this email with status 'awaiting-intake'
    // This handles the flow: customer pays → no intake found → emails customer → customer fills intake
    const normalizedEmail = email.toLowerCase().trim();
    const { data: pendingCase } = await supabase
      .from("cases")
      .select("id, tier")
      .eq("email", normalizedEmail)
      .eq("status", "awaiting-intake")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingCase) {
      // Get the intake we just created
      const { data: latestIntake } = await supabase
        .from("intakes")
        .select("id")
        .eq("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestIntake) {
        // Link intake to case and update status
        await supabase
          .from("cases")
          .update({
            intake_id: latestIntake.id,
            status: "intake",
            charge_type: chargeType,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingCase.id);

        // Trigger report generation for case-decoder tier
        if (pendingCase.tier === "case-decoder") {
          const origin = req.headers.get("origin") || req.headers.get("x-forwarded-host")
            ? `https://${req.headers.get("x-forwarded-host")}` : "https://imnotanattorney.com";
          fetch(`${origin}/api/generate/case-decoder`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
            },
            body: JSON.stringify({ caseId: pendingCase.id }),
          }).catch((err) => console.error("[Intake] Auto-trigger report generation failed:", err));
        }
      }
    }

    // Send intake confirmation email — context-aware based on whether they already paid
    const confirmationHtml = pendingCase
      ? `
        <h1 style="color: #F59E0B;">Case Details Received</h1>
        <p>Thank you, ${escapeHtml(firstName)}. We've received your intake form and your report is being generated.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(chargeType)}</p>
        </div>
        <p style="color: #D4D4D8;">You'll receive an email when your report is ready to view. Keep an eye on your inbox.</p>
      `
      : `
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
        <p style="color: #A1A1AA;">Not sure which tier? Start with the <a href="https://imnotanattorney.com/checkout?tier=case-decoder" style="color: #F59E0B;">Case Decoder ($197)</a> — it covers the essentials and every dollar counts toward an upgrade.</p>
      `;

    await sendEmail({
      to: email.toLowerCase().trim(),
      subject: `We Received Your Case Details, ${escapeHtml(firstName)}`,
      unsubscribeEmail: email.toLowerCase().trim(),
      html: confirmationHtml,
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
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Arrested/Charged:</strong> ${escapeHtml(body.timeSinceArrest || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Location:</strong> ${escapeHtml(body.incidentLocation || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">How LE Involved:</strong> ${(body.arrestCircumstances || []).map((s: string) => escapeHtml(s)).join(", ") || "Not provided"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Co-Defendants:</strong> ${escapeHtml(body.coDefendants || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Attorney Strategy:</strong> ${escapeHtml(body.attorneyStrategy || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case Number:</strong> ${escapeHtml(body.caseNumber || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Court Date:</strong> ${escapeHtml(body.courtDate || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Plea Offered:</strong> ${escapeHtml(body.pleaOffered || "Not specified")}</p>
          ${body.pleaTerms ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Plea Terms:</strong> ${escapeHtml(body.pleaTerms)}</p>` : ""}
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Communication:</strong> ${escapeHtml(body.communicationFrequency || "Not specified")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Last Attorney Contact:</strong> ${escapeHtml(body.lastAttorneyContact || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Arrest Date:</strong> ${escapeHtml(body.arrestDate || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Evidence Types:</strong> ${(body.evidenceType || []).map((s: string) => escapeHtml(s)).join(", ") || "Not specified"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Services:</strong> ${(body.services || []).join(", ") || "None selected"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
        ${body.specificQuestion ? `<div style="margin-top: 16px;"><p style="color: #F59E0B; font-weight: bold;">Their #1 Question:</p><p style="color: #D4D4D8;">${escapeHtml(body.specificQuestion)}</p></div>` : ""}
        ${body.situation ? `<div style="margin-top: 16px;"><p style="color: white; font-weight: bold;">Situation:</p><p style="color: #D4D4D8;">${escapeHtml(body.situation)}</p></div>` : ""}
      `,
    });

    return NextResponse.json({ message: "Intake received" });
  } catch (error) {
    console.error("[Intake] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
