/**
 * @file /api/intake/intelligence-brief — Phase 2 intake for Intelligence Brief
 *
 * Receives additional case details from the Phase 2 form after the included
 * Case Decoder has been delivered. This data feeds into the full Intelligence
 * Brief generation.
 *
 * Security: HMAC token verification — the token is sent in the delivery email
 * link and ties to a specific case ID. This prevents unauthorized submissions.
 *
 * Flow:
 *   1. Verify HMAC token matches case ID
 *   2. Validate required fields (judge name, attorney name)
 *   3. Store Phase 2 data in the intakes table as `phase2_data` JSONB
 *   4. Update case status from awaiting-intake → intake
 *   5. Notify operator
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL, CONTACT_EMAIL, verifyPhase2Token } from "@/lib/site";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip =
      getClientIp(req);
    const { limited } = await checkRateLimit(
      supabase,
      `phase2-intake:${ip}`,
      10,
      300
    );
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { caseId, token, ...formData } = body;

    // Verify HMAC token
    if (!caseId || !token || !verifyPhase2Token(token, caseId)) {
      return NextResponse.json(
        { error: "Invalid or expired link. Please use the link from your email." },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!formData.judgeName || !formData.county || !formData.attorneyName) {
      return NextResponse.json(
        { error: "Judge name, county, and attorney name are required." },
        { status: 400 }
      );
    }

    // Look up the case
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("id, email, tier, status, order_id, intake_id")
      .eq("id", caseId)
      .maybeSingle();

    if (caseError || !caseData) {
      console.error("[Phase2 Intake] Case lookup error:", caseError);
      return NextResponse.json(
        { error: "Case not found." },
        { status: 404 }
      );
    }

    // Explicit refund check — customer sees a clear message instead of generic 409
    if (caseData.status === "refunded") {
      return NextResponse.json(
        { error: `This case has been refunded and is no longer active. Contact ${CONTACT_EMAIL} if you have questions.` },
        { status: 410 }
      );
    }

    // Prevent duplicate submissions
    if (caseData.status !== "awaiting-intake" && caseData.status !== "intake") {
      return NextResponse.json(
        { error: "This form has already been submitted for this case." },
        { status: 409 }
      );
    }

    // Store Phase 2 data — either update existing intake or create new one
    // Cap all fields to prevent oversized payloads (matches main intake pattern)
    const cap = (v: unknown, max: number) =>
      typeof v === "string" ? v.slice(0, max) : null;

    const phase2Data = {
      judge_name: cap(formData.judgeName, 200),
      county: cap(formData.county, 100),
      case_number: cap(formData.caseNumber, 50),
      attorney_name: cap(formData.attorneyName, 200),
      attorney_firm: cap(formData.attorneyFirm, 200),
      next_court_date: cap(formData.nextCourtDate, 20),
      hearing_type: cap(formData.hearingType, 100),
      attorney_communication: cap(formData.attorneyCommunication, 500),
      what_attorney_told: cap(formData.whatAttorneyTold, 2000),
      biggest_concern: cap(formData.biggestConcern, 2000),
      employment: cap(formData.employment, 200),
      dependents: cap(formData.dependents, 200),
      immigration_status: cap(formData.immigrationStatus, 100),
      prior_convictions: cap(formData.priorConvictions, 500),
      on_probation_parole: cap(formData.onProbationParole, 100),
      co_defendant_details: cap(formData.coDefendantDetails, 500),
    };

    if (caseData.intake_id) {
      // Update existing intake with Phase 2 data
      const { error: updateError } = await supabase
        .from("intakes")
        .update({ phase2_data: phase2Data })
        .eq("id", caseData.intake_id);

      if (updateError) {
        console.error("[Phase2 Intake] Intake update error:", updateError);
      }
    } else {
      // Create a new intake record with Phase 2 data
      const { data: newIntake, error: insertError } = await supabase
        .from("intakes")
        .insert({
          email: caseData.email,
          first_name: "",
          charge_type: "unknown",
          phase2_data: phase2Data,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[Phase2 Intake] Intake insert error:", insertError);
      } else if (newIntake?.id) {
        // Link the new intake to the case
        await supabase
          .from("cases")
          .update({ intake_id: newIntake.id })
          .eq("id", caseId);
      }
    }

    // Transition case status: awaiting-intake → intake
    if (caseData.status === "awaiting-intake") {
      await supabase
        .from("cases")
        .update({
          status: "intake",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
    }

    // Notify operator
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `Phase 2 intake received — ${escapeHtml(caseData.email)} (Intelligence Brief)`,
      html: `<h1 style="color: #F59E0B;">Phase 2 Intake Submitted</h1>
        <p>Customer completed the Intelligence Brief intake form.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(caseData.email)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseId}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Judge:</strong> ${escapeHtml(formData.judgeName)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Attorney:</strong> ${escapeHtml(formData.attorneyName)}</p>
          ${formData.hearingType ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Hearing:</strong> ${escapeHtml(formData.hearingType)}</p>` : ""}
          ${formData.nextCourtDate ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Court date:</strong> ${escapeHtml(formData.nextCourtDate)}</p>` : ""}
        </div>
        <p><strong>Action:</strong> Begin Intelligence Brief preparation. Case has all required inputs.</p>`,
    }, { category: "operator-phase2-intake", case_id: caseId });

    // Send confirmation email to customer
    await sendEmail({
      to: caseData.email,
      subject: "Intelligence Brief Details Received",
      html: `<h1 style="color: #F59E0B;">We Got Your Details</h1>
        <p>Your Intelligence Brief is now being prepared with the additional information you provided.</p>
        <p>Here's what happens next:</p>
        <ul style="color: #D4D4D8; padding-left: 20px;">
          <li>We research Judge ${escapeHtml(formData.judgeName)}'s sentencing patterns and rulings</li>
          <li>We analyze your legal options based on your specific situation</li>
          <li>We build your personalized 48-Hour Priority Action Plan</li>
        </ul>
        <p><strong>Delivery:</strong> Your complete Intelligence Brief will arrive within 72 hours.</p>
        <p style="color: #A1A1AA; margin-top: 24px;">
          In the meantime, review your Case Decoder report and start preparing the questions it identified.
        </p>`,
      unsubscribeEmail: caseData.email,
    }, { category: "phase2-intake-confirmation", case_id: caseId });

    // Fire-and-forget: trigger Phase A generation
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
    fetch(`${origin}/api/generate/intelligence-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
      },
      body: JSON.stringify({ caseId }),
    }).catch((err) => console.error("[Phase2] Phase A trigger error:", err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Phase2 Intake] Error:", error);
    return NextResponse.json(
      { error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
