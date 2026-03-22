/**
 * @file Part 1 — Nurture emails (subscribers who haven't bought yet)
 *
 * Sends the next unsent email in the nurture sequence based on days since signup.
 * Only processes subscribers who haven't unsubscribed (CAN-SPAM).
 * Deduplication: checks drip_emails table to see what's already been sent.
 */

import { sendEmailWithRetry } from "@/lib/email";
import {
  getNextNurtureEmail,
  getNextScoreEmail,
  getScoreNurtureOffset,
  getNextDui72hEmail,
  getNextAbandonedScoreEmail,
  getNextWinbackEmail,
} from "@/lib/drip-emails";
import type { DripEmail } from "@/lib/drip-emails";
import { SITE_URL } from "@/lib/site";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

/**
 * Sends nurture drip emails to active subscribers who haven't purchased.
 *
 * Routing priority:
 *   1. DUI 72-hour subscribers get crisis-cadence emails (Day 1, 3, 5, 7), then STOP.
 *   2. Score-abandoned subscribers get 3-email sequence, then fall through to standard nurture.
 *   3. Score-page subscribers with a band get band-specific emails first, then standard nurture.
 *   4. All other subscribers get standard nurture as-is.
 *   5. After all sequences exhaust, win-back emails start at Day 75+ (suppressed for DUI/purchasers).
 */
export async function sendNurtureEmails(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  // Fetch all active (non-unsubscribed) subscribers, ordered by signup date.
  const { data: subscribers, error: subError } = await ctx.supabase
    .from("subscribers")
    .select("id, email, created_at, score_band, source")
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (subError) {
    console.error("[Drip Cron] Subscriber query error:", subError);
    result.errors++;
  }

  if (!subscribers || subscribers.length === 0) return result;

  // ── E12: BATCH FETCH all drip_emails for these subscribers (avoids N+1) ──
  const subIds = subscribers.map((s) => s.id);
  const { data: allSentEmails } = await ctx.supabase
    .from("drip_emails")
    .select("subscriber_id, email_key")
    .in("subscriber_id", subIds);

  // Build a map of subscriber_id -> Set of sent email keys
  const sentBySubscriber = new Map<string, Set<string>>();
  for (const row of allSentEmails ?? []) {
    if (!sentBySubscriber.has(row.subscriber_id)) {
      sentBySubscriber.set(row.subscriber_id, new Set());
    }
    sentBySubscriber.get(row.subscriber_id)!.add(row.email_key);
  }

  // ── Batch-fetch emails that have orders (for win-back suppression) ──
  // Scoped to subscriber emails to avoid fetching entire orders table
  const subscriberEmails = subscribers.map((s: { email: string }) => s.email.toLowerCase().trim());
  const { data: orderEmails } = await ctx.supabase
    .from("orders")
    .select("email")
    .in("status", ["paid", "delivered"])
    .in("email", subscriberEmails);
  const purchasedEmails = new Set(
    (orderEmails ?? []).map((o: { email: string }) => o.email.toLowerCase().trim())
  );

  for (const sub of subscribers) {
    try {
      const subscribedAt = new Date(sub.created_at);
      const daysSinceSubscribe = Math.floor(
        (ctx.now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const sentKeys = sentBySubscriber.get(sub.id) ?? new Set<string>();

      // ── SOURCE-BASED & BAND-BASED ROUTING ──
      let nextEmail: DripEmail | null = null;

      if (sub.source === "dui-72-hours") {
        nextEmail = getNextDui72hEmail(daysSinceSubscribe, sentKeys);
        // No fallthrough — crisis buyers who haven't converted by Day 7 are gone.
      } else if (sub.source === "score-abandoned") {
        nextEmail = getNextAbandonedScoreEmail(daysSinceSubscribe, sentKeys);
        if (!nextEmail) {
          const adjustedDays = daysSinceSubscribe - 7;
          if (adjustedDays >= 0) {
            nextEmail = getNextNurtureEmail(adjustedDays, sentKeys);
          }
        }
      } else if (sub.score_band) {
        nextEmail = getNextScoreEmail(daysSinceSubscribe, sentKeys, sub.score_band);
        if (!nextEmail) {
          const offset = getScoreNurtureOffset(sub.score_band);
          const adjustedDays = daysSinceSubscribe - offset;
          if (adjustedDays >= 0) {
            nextEmail = getNextNurtureEmail(adjustedDays, sentKeys);
          }
        }
      } else {
        nextEmail = getNextNurtureEmail(daysSinceSubscribe, sentKeys);
      }

      // ── WIN-BACK FALLTHROUGH ──
      if (!nextEmail && sub.source !== "dui-72-hours" && daysSinceSubscribe >= 75) {
        const hasPurchase = purchasedEmails.has(sub.email.toLowerCase().trim());
        if (!hasPurchase) {
          nextEmail = getNextWinbackEmail(daysSinceSubscribe, sentKeys);
          if (nextEmail && nextEmail.html.includes("%%RESUBSCRIBE_URL%%")) {
            const resubUrl = `${SITE_URL}/api/resubscribe?email=${Buffer.from(sub.email).toString("base64")}`;
            nextEmail = {
              ...nextEmail,
              html: nextEmail.html.split("%%RESUBSCRIBE_URL%%").join(resubUrl),
            };
          }
        }
      }

      if (!nextEmail) {
        result.skipped++;
        continue;
      }

      // ── SEND + RECORD (with retry for transient failures) ──
      const sendResult = await sendEmailWithRetry(
        {
          to: sub.email,
          subject: nextEmail.subject,
          html: nextEmail.html,
          unsubscribeEmail: sub.email,
        },
        { category: "drip-nurture", email_key: nextEmail.key }
      );

      if (sendResult.success) {
        await ctx.supabase.from("drip_emails").insert({
          subscriber_id: sub.id,
          email_key: nextEmail.key,
        });
        result.sent++;
      } else {
        console.error(
          `[Drip Cron] Failed to send ${nextEmail.key} to ${sub.email}:`,
          sendResult.error
        );
        result.errors++;
      }
    } catch (err) {
      console.error(
        `[Drip Cron] Error processing subscriber ${sub.id}:`,
        err
      );
      result.errors++;
    }
  }

  return result;
}
