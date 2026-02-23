import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, source = "lead-capture" } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const normalizedEmail = email.toLowerCase().trim();

    // Upsert — if already subscribed, just return success
    // Also clear unsubscribed_at on re-subscribe
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

    // Get subscriber ID for drip tracking
    const { data: subData } = await supabase
      .from("subscribers")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    // Record nurture_day0 as sent to prevent cron from duplicating welcome email
    if (subData?.id) {
      await supabase.from("drip_emails").upsert(
        {
          subscriber_id: subData.id,
          email_key: "nurture_day0",
        },
        { onConflict: "subscriber_id,email_key" }
      );
    }

    // Send welcome email with guide link
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Discovery Checklist (Real Case Findings Inside)",
      unsubscribeEmail: normalizedEmail,
      html: `
        <h1 style="color: #F59E0B;">Welcome to ImNotAnAttorney</h1>
        <p>There are defendants who get steamrolled. And there are defendants who walk in with the questions that make attorneys actually work. You just chose which kind you are.</p>
        <p>Here's your free guide:</p>
        <a href="https://imnotanattorney.com/guides/discovery-checklist-7-evidence-problems.md" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Download Your Discovery Checklist</a>
        <p style="color: #A1A1AA;">Inside: 7 evidence problems from a real trafficking case — the weight that disappeared, the substance that changed, the fingerprints nobody mentioned, and 4 more. Plus the exact questions that expose each one.</p>
        <p style="color: #A1A1AA;">When you're ready to go deeper, our <a href="https://imnotanattorney.com/services" style="color: #F59E0B;">case analysis services</a> start at $197.</p>
      `,
    });

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
