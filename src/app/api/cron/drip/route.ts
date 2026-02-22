import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getNextNurtureEmail } from "@/lib/drip-emails";

/**
 * Vercel Cron handler — runs daily at 9AM EST (14:00 UTC).
 * Sends drip emails to active subscribers based on their subscribe date.
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Get active subscribers (not unsubscribed), limit 50 per run
    const { data: subscribers, error: subError } = await supabase
      .from("subscribers")
      .select("id, email, created_at")
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (subError) {
      console.error("[Drip Cron] Subscriber query error:", subError);
      return NextResponse.json(
        { error: "Failed to query subscribers" },
        { status: 500 }
      );
    }

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, errors: 0 });
    }

    for (const sub of subscribers) {
      try {
        // Calculate days since subscribe
        const subscribedAt = new Date(sub.created_at);
        const now = new Date();
        const daysSinceSubscribe = Math.floor(
          (now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Get already-sent email keys for this subscriber
        const { data: sentEmails } = await supabase
          .from("drip_emails")
          .select("email_key")
          .eq("subscriber_id", sub.id);

        const sentKeys = new Set(
          (sentEmails ?? []).map((e: { email_key: string }) => e.email_key)
        );

        // Get next email to send
        const nextEmail = getNextNurtureEmail(daysSinceSubscribe, sentKeys);

        if (!nextEmail) {
          skipped++;
          continue;
        }

        // Send the email
        const result = await sendEmail({
          to: sub.email,
          subject: nextEmail.subject,
          html: nextEmail.html,
          unsubscribeEmail: sub.email,
        });

        if (result.success) {
          // Record send
          await supabase.from("drip_emails").insert({
            subscriber_id: sub.id,
            email_key: nextEmail.key,
          });
          sent++;
        } else {
          console.error(
            `[Drip Cron] Failed to send ${nextEmail.key} to ${sub.email}:`,
            result.error
          );
          errors++;
        }
      } catch (err) {
        console.error(
          `[Drip Cron] Error processing subscriber ${sub.id}:`,
          err
        );
        errors++;
      }
    }

    return NextResponse.json({ sent, skipped, errors });
  } catch (err) {
    console.error("[Drip Cron] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
