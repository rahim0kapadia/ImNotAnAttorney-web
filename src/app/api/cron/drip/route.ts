import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getNextNurtureEmail, getPostPurchaseEmails } from "@/lib/drip-emails";
import type { DripEmail } from "@/lib/drip-emails";

/**
 * Vercel Cron handler — runs daily at 9AM EST (14:00 UTC).
 * Sends drip emails to active subscribers (nurture) AND customers (post-purchase).
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
    // ============================================================
    // PART 1: NURTURE EMAILS (subscribers)
    // ============================================================
    const { data: subscribers, error: subError } = await supabase
      .from("subscribers")
      .select("id, email, created_at")
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (subError) {
      console.error("[Drip Cron] Subscriber query error:", subError);
    }

    if (subscribers && subscribers.length > 0) {
      for (const sub of subscribers) {
        try {
          const subscribedAt = new Date(sub.created_at);
          const now = new Date();
          const daysSinceSubscribe = Math.floor(
            (now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          const { data: sentEmails } = await supabase
            .from("drip_emails")
            .select("email_key")
            .eq("subscriber_id", sub.id);

          const sentKeys = new Set(
            (sentEmails ?? []).map((e: { email_key: string }) => e.email_key)
          );

          const nextEmail = getNextNurtureEmail(daysSinceSubscribe, sentKeys);

          if (!nextEmail) {
            skipped++;
            continue;
          }

          const result = await sendEmail({
            to: sub.email,
            subject: nextEmail.subject,
            html: nextEmail.html,
            unsubscribeEmail: sub.email,
          });

          if (result.success) {
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
    }

    // ============================================================
    // PART 2: POST-PURCHASE EMAILS (customers)
    // ============================================================
    // Get recent orders (last 30 days) to send post-purchase follow-ups
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id, email, tier, paid_at")
      .eq("status", "paid")
      .gte("paid_at", thirtyDaysAgo.toISOString())
      .order("paid_at", { ascending: true })
      .limit(50);

    if (orderError) {
      console.error("[Drip Cron] Orders query error:", orderError);
    }

    if (orders && orders.length > 0) {
      for (const order of orders) {
        try {
          const paidAt = new Date(order.paid_at);
          const now = new Date();
          const daysSincePurchase = Math.floor(
            (now.getTime() - paidAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Get post-purchase emails for this tier
          const tierEmails = getPostPurchaseEmails(order.tier);
          if (tierEmails.length === 0) {
            skipped++;
            continue;
          }

          // Get already-sent post-purchase keys for this email
          // Key by email + email_key combo (subscriber_id may not exist for direct buyers)
          const { data: subMatch } = await supabase
            .from("subscribers")
            .select("id")
            .eq("email", order.email.toLowerCase())
            .single();

          const subscriberId = subMatch?.id;

          // Get sent keys — check by email_key pattern for this order's tier
          let sentKeys = new Set<string>();
          if (subscriberId) {
            const { data: sentEmails } = await supabase
              .from("drip_emails")
              .select("email_key")
              .eq("subscriber_id", subscriberId);

            sentKeys = new Set(
              (sentEmails ?? []).map(
                (e: { email_key: string }) => e.email_key
              )
            );
          }

          // Find next unsent post-purchase email
          let nextEmail: DripEmail | null = null;
          for (const email of tierEmails) {
            // Skip day-0 emails (handled by webhook)
            if (email.delayDays === 0) continue;

            // Skip relativeToMeeting emails for now (no meeting date tracking yet)
            if (email.relativeToMeeting) continue;

            if (
              daysSincePurchase >= email.delayDays &&
              !sentKeys.has(email.key)
            ) {
              nextEmail = email;
              break;
            }
          }

          if (!nextEmail) {
            skipped++;
            continue;
          }

          const result = await sendEmail({
            to: order.email,
            subject: nextEmail.subject,
            html: nextEmail.html,
            unsubscribeEmail: order.email,
          });

          if (result.success) {
            // Record send — create subscriber if needed for tracking
            if (subscriberId) {
              await supabase.from("drip_emails").insert({
                subscriber_id: subscriberId,
                email_key: nextEmail.key,
              });
            } else {
              // Upsert subscriber for tracking purposes
              const { data: newSub } = await supabase
                .from("subscribers")
                .upsert(
                  {
                    email: order.email.toLowerCase(),
                    source: `purchase-${order.tier}`,
                  },
                  { onConflict: "email" }
                )
                .select("id")
                .single();

              if (newSub?.id) {
                await supabase.from("drip_emails").insert({
                  subscriber_id: newSub.id,
                  email_key: nextEmail.key,
                });
              }
            }
            sent++;
          } else {
            console.error(
              `[Drip Cron] Failed to send ${nextEmail.key} to ${order.email}:`,
              result.error
            );
            errors++;
          }
        } catch (err) {
          console.error(
            `[Drip Cron] Error processing order ${order.id}:`,
            err
          );
          errors++;
        }
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
