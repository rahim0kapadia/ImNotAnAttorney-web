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
    const { error } = await supabase
      .from("subscribers")
      .upsert({ email: normalizedEmail, source }, { onConflict: "email" });

    if (error) {
      console.error("[Subscribe] Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    // Send welcome email with PDF guide link
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Free Guide: 10 Questions Your Attorney Hopes You Never Ask",
      html: `
        <h1 style="color: #F59E0B;">Welcome to ImNotAnAttorney</h1>
        <p>You just took the first step toward holding your attorney accountable. Here's your free guide:</p>
        <a href="https://imnotanattorney.com/guides/10-questions-your-attorney-hopes-you-never-ask.pdf" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Download Your Free Guide (PDF)</a>
        <p style="color: #A1A1AA;">Inside, you'll find the 10 questions that separate informed defendants from those who get steamrolled by the system.</p>
        <p style="color: #A1A1AA;">When you're ready to go deeper, our <a href="https://imnotanattorney.com/services" style="color: #F59E0B;">case analysis services</a> start at $97.</p>
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
