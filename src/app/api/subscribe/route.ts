/**
 * @fileoverview Email Subscription Endpoint
 *
 * Handles new email subscriptions from lead-capture forms (blog CTAs, resource
 * downloads, score page, etc.). This is the top-of-funnel entry point:
 *
 *   Lead Capture Form --> POST /api/subscribe --> Supabase subscribers table
 *     --> Welcome email with Discovery Checklist --> Drip nurture sequence
 *
 * Key behaviors:
 * - Upsert pattern: if the email already exists, the row is updated (not
 *   duplicated). Crucially, re-subscribing clears `unsubscribed_at` so
 *   previously unsubscribed users can opt back in.
 * - Drip deduplication: records "nurture_day0" in the drip_emails table
 *   immediately, so the cron-based nurture sequence doesn't send a duplicate
 *   welcome email on its next run.
 * - Email validation uses a simple regex that catches the most common format
 *   errors without being overly strict (no RFC 5322 full compliance -- that
 *   would reject valid addresses like tagged emails).
 * - The `source` field tracks where the subscriber came from (defaults to
 *   "lead-capture"; checkout flow passes "checkout").
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { TIER_CORE } from "@/lib/tiers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

/**
 * Subscribes an email address and sends the welcome email with lead magnet.
 *
 * @param req - JSON body with: email (required), source (optional, defaults to "lead-capture")
 * @returns JSON with { message: "Subscribed successfully" } on success
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, `subscribe:${ip}`, 5, 60);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { email } = body;
    const ALLOWED_SOURCES = ["lead-capture", "checkout", "blog", "score", "score-page", "resources", "dui-72-hours", "blog-inline-drug-cases", "blog-inline-white-collar", "blog-inline-general-defense"];
    const source = ALLOWED_SOURCES.includes(body.source) ? body.source : "lead-capture";

    // Score page passes additional context for segmented nurture sequences
    const VALID_BANDS = ["Critical", "Concerning", "Average", "Adequate", "Excellent"];
    const VALID_CHARGES = ["drug", "dui", "white-collar", "other-felony", "other-misdemeanor"];
    const scoreBand = typeof body.scoreBand === "string" && VALID_BANDS.includes(body.scoreBand) ? body.scoreBand : null;
    const scoreValue = typeof body.scoreValue === "number" && body.scoreValue >= 0 && body.scoreValue <= 100 ? body.scoreValue : null;
    const chargeType = typeof body.chargeType === "string" && VALID_CHARGES.includes(body.chargeType) ? body.chargeType : null;

    // =========================================================================
    // 1. EMAIL VALIDATION
    // Simple regex: at least one non-space char, @, non-space char, dot, non-space char.
    // This intentionally avoids strict RFC 5322 validation which would reject
    // edge-case-valid addresses. The real validation happens when we try to send.
    // =========================================================================
    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    // =========================================================================
    // 2. SUBSCRIBER UPSERT
    // Uses Supabase upsert with onConflict:"email" for idempotency:
    // - New email: creates a new subscriber row
    // - Existing active subscriber: no-op (returns success, source unchanged)
    // - Previously unsubscribed: clears unsubscribed_at to re-activate them
    //
    // The `source` field is overwritten on upsert, which means the most recent
    // subscription source wins. This is intentional -- it tracks the latest
    // touchpoint that re-engaged the subscriber.
    // =========================================================================
    const upsertData: Record<string, unknown> = { email: normalizedEmail, source, unsubscribed_at: null };
    if (scoreBand) upsertData.score_band = scoreBand;
    if (scoreValue !== null) upsertData.score_value = scoreValue;
    if (chargeType) upsertData.charge_type = chargeType;

    const { error } = await supabase
      .from("subscribers")
      .upsert(
        upsertData,
        { onConflict: "email" }
      );

    if (error) {
      console.error("[Subscribe] Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    // =========================================================================
    // 3. DRIP DEDUPLICATION
    // The nurture email sequence is driven by a cron job that checks which
    // emails each subscriber has received. By recording "nurture_day0" here
    // immediately after subscribing, we prevent the cron from sending a
    // duplicate welcome email on its next run.
    //
    // The upsert on (subscriber_id, email_key) ensures this is safe to call
    // multiple times (e.g., if someone re-subscribes).
    // =========================================================================
    const { data: subData } = await supabase
      .from("subscribers")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (subData?.id) {
      // Record both nurture_day0 AND score_artifact for score-page subscribers
      // to prevent the cron from sending duplicate welcome/artifact emails.
      const dedupKeys = ["nurture_day0"];
      if (source === "score-page" && scoreBand) {
        dedupKeys.push("score_artifact");
      }
      for (const key of dedupKeys) {
        await supabase.from("drip_emails").upsert(
          {
            subscriber_id: subData.id,
            email_key: key,
          },
          { onConflict: "subscriber_id,email_key" }
        );
      }
    }

    // =========================================================================
    // 4. WELCOME EMAIL — BAND-AWARE
    // Score-page subscribers with a band get a Score Artifact email (their full
    // score results, designed to be saved/forwarded to family). This replaces
    // the generic welcome for these subscribers.
    // Non-score subscribers get the original Discovery Checklist welcome.
    // =========================================================================
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

    if (source === "score-page" && scoreBand && scoreValue !== null) {
      // ── SCORE ARTIFACT EMAIL — immediate, trust-building, no CTA ──
      const bandLabel = scoreBand;
      const bandColors: Record<string, string> = {
        Critical: "#EF4444",
        Concerning: "#F97316",
        Average: "#EAB308",
        Adequate: "#22C55E",
        Excellent: "#10B981",
      };
      const bandColor = bandColors[bandLabel] || "#F59E0B";
      const chargeLabel = chargeType === "dui" ? "DUI/DWI"
        : chargeType === "drug" ? "drug offense"
        : chargeType === "white-collar" ? "white collar"
        : chargeType === "other-felony" ? "felony"
        : chargeType === "other-misdemeanor" ? "misdemeanor"
        : "criminal";

      await sendEmail({
        to: normalizedEmail,
        subject: `Your Defense Milestone Score: ${scoreValue}/100 — what this means for your ${chargeLabel} case`,
        unsubscribeEmail: normalizedEmail,
        html: `
          <h1 style="color: ${bandColor};">Your Defense Milestone Score: ${scoreValue}/100</h1>
          <p style="font-size: 18px;"><strong style="color: ${bandColor};">Band: ${bandLabel}</strong></p>
          <p>You scored your defense against pre-trial preparation standards used by elite criminal defense attorneys. Here's what your score means.</p>

          <div style="margin: 20px 0; padding: 16px; border-left: 3px solid ${bandColor}; background: #1C1917; border-radius: 4px;">
            <p style="color: ${bandColor}; font-weight: bold; margin: 0 0 8px;">What your score does NOT mean</p>
            <p style="color: #D4D4D8; margin: 0;">This score measures defense milestones visible from 10 questions. It does not measure your attorney's competence, your case outcome, or the strength of the prosecution's evidence. It measures whether certain preparation benchmarks have been met at your current case stage.</p>
          </div>

          <div style="margin: 20px 0; padding: 16px; border: 1px solid #3F3F46; background: #18181B; border-radius: 8px;">
            <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Save this email</p>
            <p style="color: #D4D4D8; margin: 0;">Your answers are not stored on our servers. This email is your only record of this score. Save it or forward it to someone you trust.</p>
          </div>

          <div style="margin: 20px 0; padding: 16px; border: 1px solid #3F3F46; background: #18181B; border-radius: 8px;">
            <p style="color: #A1A1AA; font-style: italic; margin: 0;">If you're reading this for a spouse, parent, or child — the score page at <a href="${siteUrl}/score" style="color: #F59E0B;">${siteUrl}/score</a> is free, takes 60 seconds, and doesn't require an account. You can score their defense yourself if you know the case details.</p>
          </div>

          <p style="margin-top: 24px; color: #A1A1AA;">From here: we'll send you practical information about your case stage, never more than once a week. Unsubscribe any time — one click, no questions.</p>
        `,
      }, { category: "score-artifact" });
    } else {
      // ── GENERIC WELCOME — Discovery Checklist lead magnet ──
      await sendEmail({
        to: normalizedEmail,
        subject: "Your Discovery Checklist (Real Case Findings Inside)",
        unsubscribeEmail: normalizedEmail,
        html: `
          <h1 style="color: #F59E0B;">We were in your seat.</h1>
          <p>One of us was facing trafficking charges in Florida. Paid thousands for an attorney who wouldn't return calls. Opened the discovery one night — found four issues the attorney never mentioned. That's why we built this.</p>
          <p>Here's your free guide — the same evidence problems I found, turned into a checklist you can use on your case:</p>
          <a href="${siteUrl}/guides/discovery-checklist-7-evidence-problems.md" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Download Your Discovery Checklist</a>
          <p style="color: #A1A1AA;">Inside: 7 evidence problems from a real trafficking case — the weight that disappeared, the substance that changed, the fingerprints nobody mentioned, and 4 more. Plus the exact questions that expose each one.</p>
          <p style="color: #A1A1AA;">Does any of this sound like your situation? If your attorney isn't answering your questions, our <a href="${siteUrl}/checkout?tier=case-decoder" style="color: #F59E0B;">Case Decoder</a> gives you 15 targeted questions built from YOUR case — starting at ${TIER_CORE["case-decoder"].priceDisplay}.</p>
        `,
      }, { category: "welcome" });
    }

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
