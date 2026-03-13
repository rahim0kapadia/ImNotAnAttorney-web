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

/**
 * Subscribes an email address and sends the welcome email with lead magnet.
 *
 * @param req - JSON body with: email (required), source (optional, defaults to "lead-capture")
 * @returns JSON with { message: "Subscribed successfully" } on success
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { limited } = await checkRateLimit(supabase, `subscribe:${ip}`, 5, 60);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { email } = body;
    const ALLOWED_SOURCES = ["lead-capture", "checkout", "blog", "score", "score-page", "resources"];
    const source = ALLOWED_SOURCES.includes(body.source) ? body.source : "lead-capture";

    // =========================================================================
    // 1. EMAIL VALIDATION
    // Simple regex: at least one non-space char, @, non-space char, dot, non-space char.
    // This intentionally avoids strict RFC 5322 validation which would reject
    // edge-case-valid addresses. The real validation happens when we try to send.
    // =========================================================================
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

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
    const { error } = await supabase
      .from("subscribers")
      .upsert(
        { email: normalizedEmail, source, unsubscribed_at: null },
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
      await supabase.from("drip_emails").upsert(
        {
          subscriber_id: subData.id,
          email_key: "nurture_day0",
        },
        { onConflict: "subscriber_id,email_key" }
      );
    }

    // =========================================================================
    // 4. WELCOME EMAIL WITH LEAD MAGNET
    // Sends the Discovery Checklist -- our primary lead magnet. The email:
    // - Links to /resources where the free guide is hosted
    // - Teases the content (7 real evidence problems from an actual case)
    // - Soft-sells the $197 Case Decoder as the natural next step
    // - Includes CAN-SPAM compliant unsubscribe link via unsubscribeEmail param
    // =========================================================================
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
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

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
