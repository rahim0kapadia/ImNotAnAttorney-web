/**
 * @file /api/intake — Intake form submission handler
 *
 * Pipeline position: Receives case details from the intake form on the frontend.
 * Can be submitted BEFORE or AFTER payment — the handler adapts to both flows.
 *
 * Two customer flows converge here:
 *
 *   Flow A: Intake BEFORE payment (browsing → fills intake → pays later)
 *     1. Customer fills intake form → this endpoint saves it to `intakes` table
 *     2. No matching case exists → confirmation email says "browse services to purchase"
 *     3. When customer later pays, the Stripe webhook finds this intake by email
 *        and links it to the new case
 *
 *   Flow B: Intake AFTER payment (pays → gets "complete your details" email → fills intake)
 *     1. Stripe webhook created a case with status "awaiting-intake"
 *     2. Customer fills intake form → this endpoint saves it AND finds the waiting case
 *     3. Links intake to case, transitions status: awaiting-intake → intake
 *     4. For case-decoder tier: auto-triggers report generation (fire-and-forget)
 *     5. Confirmation email says "your report is being generated"
 *
 * Status transitions handled:
 *   - awaiting-intake → intake (when a paid case is found for this email)
 *   - No status change if customer hasn't paid yet (intake is stored for later linking)
 *
 * Validation:
 *   - Required fields: firstName, email, chargeType
 *   - Email format: basic regex check
 *   - Charge type: validated against ALLOWED_CHARGE_TYPES allowlist
 *     The allowlist includes both the current multi-step intake form values
 *     (drug-possession, dui-first, etc.) and legacy free-form values from
 *     older intake forms (drug, dui, etc.) for backward compatibility.
 *
 * Security: No auth required — this is a public form endpoint.
 * All user input is escaped via escapeHtml before inclusion in emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";
import { checkRateLimit } from "@/lib/rate-limit";

/** Fallback operator email if OPERATOR_EMAIL env var is not set. */
const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

/**
 * Allowlist of valid charge types accepted by the intake form.
 *
 * Split into two groups:
 *   1. Current intake form values (multi-step form with specific subcategories)
 *   2. Legacy values from older intake forms (broader categories)
 *
 * This prevents injection of arbitrary strings into the database while
 * maintaining backward compatibility with existing intake records.
 * Any chargeType not in this list is rejected with a 400 error.
 */
const ALLOWED_CHARGE_TYPES = [
  // Current intake form values (hierarchical flow)
  "drug-possession",
  "drug-trafficking",
  "dui",
  "assault",
  "domestic-violence",
  "theft",
  "sex-offense",
  "sex-offense-contact",
  "sex-offense-digital",
  "weapons",
  "white-collar",
  "federal",
  "probation-violation",
  "self-defense",
  "other",
  // Legacy values from older intake forms (backward compatibility)
  "dui-first", "dui-repeat", "other-felony", "other-misdemeanor",
  "drug", "robbery", "burglary", "fraud",
];

/** Valid jurisdiction levels for the intake form. */
const ALLOWED_JURISDICTION_LEVELS = ["federal", "state", "unknown"];

/** Valid case stages for the intake form (Bergman stage-keyed walkthrough). */
const ALLOWED_CASE_STAGES = [
  "pre-arrest", "arrested", "arraigned", "pre-trial",
  "trial-prep", "sentencing", "post-conviction",
];

/** Valid values for who is filling out the form (Jayadev participatory defense). */
const ALLOWED_FILLED_OUT_BY = ["self", "family", "friend", "other"];

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { limited } = await checkRateLimit(createAdminClient(), `intake:${ip}`, 5, 300);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { firstName, email, chargeType } = body;

    // ──────────────────────────────────────────────────────────────
    // INPUT VALIDATION
    // ──────────────────────────────────────────────────────────────
    // Required fields: the minimum information needed to create a
    // useful intake record and send a confirmation email.
    if (!firstName || !email || !chargeType) {
      return NextResponse.json(
        { error: "Required fields missing" },
        { status: 400 }
      );
    }

    // Validate email format (basic regex — not exhaustive, but catches typos)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate charge type against allowlist to prevent arbitrary string injection.
    // The frontend dropdown should only send values from this list, but we validate
    // server-side because the frontend can be bypassed.
    if (!ALLOWED_CHARGE_TYPES.includes(chargeType)) {
      return NextResponse.json(
        { error: "Invalid charge type" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ──────────────────────────────────────────────────────────────
    // DUPLICATE INTAKE PREVENTION (60-second dedup)
    // ──────────────────────────────────────────────────────────────
    // Prevents accidental double-submissions from double-clicks or
    // network retries. If an intake from the same email exists within
    // the last 60 seconds, return 409 Conflict instead of creating a duplicate.
    const normalizedEmailDedup = email.toLowerCase().trim();
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentIntake } = await supabase
      .from("intakes")
      .select("id")
      .eq("email", normalizedEmailDedup)
      .gte("created_at", sixtySecondsAgo)
      .limit(1)
      .maybeSingle();

    if (recentIntake) {
      return NextResponse.json(
        { error: "Intake already submitted. Please wait before resubmitting." },
        { status: 409 }
      );
    }

    // ──────────────────────────────────────────────────────────────
    // INPUT LENGTH LIMITS (prevent megabyte payloads)
    // ──────────────────────────────────────────────────────────────
    const cap = (val: string | undefined | null, max: number) =>
      val ? val.slice(0, max) : null;

    // ──────────────────────────────────────────────────────────────
    // SAVE INTAKE RECORD
    // ──────────────────────────────────────────────────────────────
    // Stores all case details from the multi-step intake form.
    // Email is normalized (lowercase + trim) to ensure consistent
    // matching when the Stripe webhook or this endpoint links intakes
    // to cases. All optional fields default to null/empty arrays.
    // Validate and sanitize charge-specific data (JSONB, capped at 2KB serialized)
    let chargeSpecificData = {};
    if (body.chargeSpecificData && typeof body.chargeSpecificData === "object" && !Array.isArray(body.chargeSpecificData)) {
      const serialized = JSON.stringify(body.chargeSpecificData);
      if (serialized.length <= 2048) {
        // Only allow string values to prevent injection
        const sanitized: Record<string, string> = {};
        for (const [k, v] of Object.entries(body.chargeSpecificData)) {
          if (typeof v === "string") {
            sanitized[k.slice(0, 50)] = (v as string).slice(0, 200);
          }
        }
        chargeSpecificData = sanitized;
      }
    }

    // Validate jurisdiction level
    const jurisdictionLevel = ALLOWED_JURISDICTION_LEVELS.includes(body.jurisdictionLevel)
      ? body.jurisdictionLevel
      : "unknown";

    const { data: insertedIntake, error } = await supabase.from("intakes").insert({
      first_name: firstName.slice(0, 100),
      last_name: cap(body.lastName, 100),
      email: email.toLowerCase().trim(),
      phone: cap(body.phone, 30),
      charge_type: chargeType,
      state: cap(body.state, 50),
      has_attorney: cap(body.hasAttorney, 50),
      has_discovery: cap(body.hasDiscovery, 50),
      services: Array.isArray(body.services) ? body.services.slice(0, 10) : [],
      situation: cap(body.situation, 5000),
      // Extended intake fields (added in conversion optimization round)
      time_since_arrest: cap(body.timeSinceArrest, 50),
      arrest_circumstances: Array.isArray(body.arrestCircumstances) ? body.arrestCircumstances.slice(0, 10) : [],
      incident_location: cap(body.incidentLocation, 100),
      co_defendants: cap(body.coDefendants, 200),
      attorney_strategy: cap(body.attorneyStrategy, 200),
      specific_question: cap(body.specificQuestion, 500),
      case_number: cap(body.caseNumber, 50),
      court_date: cap(body.courtDate, 20),
      plea_offered: cap(body.pleaOffered, 20),
      plea_terms: cap(body.pleaTerms, 2000),
      communication_frequency: cap(body.communicationFrequency, 50),
      last_attorney_contact: cap(body.lastAttorneyContact, 100),
      arrest_date: cap(body.arrestDate, 20),
      evidence_type: Array.isArray(body.evidenceType) ? body.evidenceType.slice(0, 15) : [],
      // New fields: charge-specific intake data + jurisdiction level
      charge_specific_data: chargeSpecificData,
      jurisdiction_level: jurisdictionLevel,
      // Expansion fields (Mar 2026): powers personalized cost, court walkthrough,
      // collateral consequences, and family-aware framing across all tiers
      criminal_history: cap(body.criminalHistory, 50),
      employment_status: cap(body.employmentStatus, 50),
      employment_industry: cap(body.employmentIndustry, 100),
      case_stage: ALLOWED_CASE_STAGES.includes(body.caseStage) ? body.caseStage : null,
      filled_out_by: ALLOWED_FILLED_OUT_BY.includes(body.filledOutBy) ? body.filledOutBy : null,
      mental_health_relevant: cap(body.mentalHealthRelevant, 30),
    }).select("id").single();

    if (error) {
      console.error("[Intake] Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    // ──────────────────────────────────────────────────────────────
    // LINK TO EXISTING CASES (Flow B: customer already paid)
    // ──────────────────────────────────────────────────────────────
    // Check if cases exist for this email with status "awaiting-intake".
    // With tier inclusion, a single order can create multiple cases
    // (e.g., IB purchase creates CD case + IB case). This code links
    // the intake to ALL waiting cases, not just one.
    //
    // Also copies court case identifiers to cases table for customer
    // identity matching on future purchases.
    const normalizedEmail = email.toLowerCase().trim();
    const { data: pendingCases } = await supabase
      .from("cases")
      .select("id, tier")
      .eq("email", normalizedEmail)
      .eq("status", "awaiting-intake")
      .order("created_at", { ascending: false });

    if (pendingCases && pendingCases.length > 0 && insertedIntake) {
      const latestIntake = insertedIntake;
      const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

      for (const pendingCase of pendingCases) {
        // ── STATUS TRANSITION: awaiting-intake → intake ──
        // Links the intake record to the case and copies the charge_type
        // and court identifiers to the case for operator dashboard visibility.
        await supabase
          .from("cases")
          .update({
            intake_id: latestIntake.id,
            status: "intake",
            charge_type: chargeType,
            court_case_number: body.caseNumber ? body.caseNumber.slice(0, 50) : null,
            court_state: body.state ? body.state.slice(0, 50) : null,
            court_county: body.county ? body.county.slice(0, 100) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingCase.id);

        // ── AUTO-TRIGGER: Case Decoder report generation ──
        // case-decoder tier gets auto-triggered (both standalone and included).
        // Higher tiers require discovery documents or manual operator action.
        if (pendingCase.tier === "case-decoder") {
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

    // ──────────────────────────────────────────────────────────────
    // CONTEXT-AWARE CONFIRMATION EMAIL (to customer)
    // ──────────────────────────────────────────────────────────────
    // The confirmation email adapts based on whether the customer has
    // already paid (pendingCase exists) or is still browsing:
    //
    //   Already paid (Flow B): "Your report is being generated. Watch your inbox."
    //     - Sets expectation that something is actively happening
    //
    //   Not yet paid (Flow A): "Here's what happens next: browse services, purchase..."
    //     - Guides them toward the purchase funnel with upgrade incentive
    //     - Links to services page and Case Decoder checkout directly
    const hasPendingCase = pendingCases && pendingCases.length > 0;
    const hasIBCase = pendingCases?.some((c) => c.tier === "intelligence-brief");

    // Build case-specific detail block for "we're analyzing your case" email
    const caseDetailBlock = `
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(chargeType.replace(/-/g, " "))}</p>
        ${body.state ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> ${escapeHtml(body.state)}</p>` : ""}
        ${body.hasAttorney ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Attorney:</strong> ${escapeHtml(body.hasAttorney)}</p>` : ""}
        ${body.courtDate ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Next Court Date:</strong> ${escapeHtml(body.courtDate)}</p>` : ""}
      </div>`;

    const confirmationHtml = hasPendingCase
      ? hasIBCase
        ? `
        <h1 style="color: #F59E0B;">We're Analyzing Your Case Now</h1>
        <p>Thank you, ${escapeHtml(firstName)}. We've received your case details and your Case Decoder report is being generated. Here's what we're looking at:</p>
        ${caseDetailBlock}
        <p style="color: #D4D4D8;">You'll receive your Case Decoder report within 48 hours. After that, we'll send you a short follow-up form to complete your Intelligence Brief.</p>
      `
        : `
        <h1 style="color: #F59E0B;">We're Analyzing Your Case Now</h1>
        <p>Thank you, ${escapeHtml(firstName)}. We've received your case details and your report is being generated. Here's what we're looking at:</p>
        ${caseDetailBlock}
        <p style="color: #D4D4D8;">You'll receive your report within 48 hours. We'll email you as soon as it's ready.</p>
      `
      : `
        <h1 style="color: #F59E0B;">Case Details Received</h1>
        <p>Thank you, ${escapeHtml(firstName)}. We've received your intake form.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(chargeType)}</p>
        </div>
        <h2 style="color: white; font-size: 18px;">What Happens Next</h2>
        <ol style="color: #D4D4D8; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Browse our <a href="${SITE_URL}/services" style="color: #F59E0B;">services page</a> to find the right tier for your case</li>
          <li style="margin-bottom: 8px;">Purchase your chosen service — 100% of what you pay is credited if you upgrade later</li>
          <li style="margin-bottom: 8px;">We'll analyze your case and deliver your report within the guaranteed timeframe</li>
        </ol>
        <p style="color: #A1A1AA;">Not sure where to start? For <strong style="color: white;">${escapeHtml(chargeType.replace(/-/g, " "))}</strong> cases, the <a href="${SITE_URL}/checkout?tier=case-decoder" style="color: #F59E0B;">${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay})</a> covers the essentials — and every dollar counts toward an upgrade.</p>
      `;

    await sendEmail({
      to: email.toLowerCase().trim(),
      subject: hasPendingCase
        ? `We're analyzing your case now, ${firstName}`
        : `We Received Your Case Details, ${firstName}`,
      unsubscribeEmail: email.toLowerCase().trim(),
      html: confirmationHtml,
    }, { category: "intake-confirmation", metadata: { charge_type: chargeType } });

    // ──────────────────────────────────────────────────────────────
    // OPERATOR NOTIFICATION EMAIL
    // ──────────────────────────────────────────────────────────────
    // Sends a comprehensive summary of every intake field to the operator.
    // This serves as both an alert (new lead) and a reference (all details
    // in one email without needing to check Supabase). Includes the
    // customer's #1 specific question and situation narrative if provided.
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `New Intake: ${chargeType} — ${firstName}`,
      html: `
        <h1 style="color: #F59E0B;">New Intake Submission</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(body.lastName || "")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> ${escapeHtml(email)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(chargeType)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(jurisdictionLevel)}</p>
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
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Criminal History:</strong> ${escapeHtml(body.criminalHistory || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Employment:</strong> ${escapeHtml(body.employmentStatus || "Not provided")}${body.employmentIndustry ? ` — ${escapeHtml(body.employmentIndustry)}` : ""}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case Stage:</strong> ${escapeHtml(body.caseStage || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Filled Out By:</strong> ${escapeHtml(body.filledOutBy || "Self")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Mental Health Relevant:</strong> ${escapeHtml(body.mentalHealthRelevant || "Not provided")}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
        ${body.specificQuestion ? `<div style="margin-top: 16px;"><p style="color: #F59E0B; font-weight: bold;">Their #1 Question:</p><p style="color: #D4D4D8;">${escapeHtml(body.specificQuestion)}</p></div>` : ""}
        ${body.situation ? `<div style="margin-top: 16px;"><p style="color: white; font-weight: bold;">Situation:</p><p style="color: #D4D4D8;">${escapeHtml(body.situation)}</p></div>` : ""}
      `,
    }, { category: "intake-confirmation", metadata: { charge_type: chargeType, flow: "paid" } });

    return NextResponse.json({ message: "Intake received" });
  } catch (error) {
    console.error("[Intake] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
