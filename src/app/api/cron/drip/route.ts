/**
 * @file /api/cron/drip — Daily cron job for drip emails + system health monitoring
 *
 * Schedule: Runs daily at 9 AM EST (14:00 UTC) via Vercel Cron.
 * Protected by CRON_SECRET bearer token (Vercel sets this automatically).
 *
 * This cron does 7 things, in order:
 *
 * PART 1 — Nurture emails (subscribers who haven't bought yet)
 *   Sends the next unsent email in the nurture sequence based on days since signup.
 *   Only processes subscribers who haven't unsubscribed (CAN-SPAM).
 *   Deduplication: checks drip_emails table to see what's already been sent.
 *
 * PART 2 — Post-purchase emails (customers who bought)
 *   Sends follow-up emails after purchase/delivery based on tier-specific schedules.
 *   Skips refunded orders (status != "paid") and unsubscribed customers.
 *   Supports three timing modes:
 *     - Relative to purchase (delayDays from paid_at)
 *     - Relative to delivery (delayDays from delivered_at) — for "how was your report" type emails
 *     - Relative to meeting (not yet implemented — needs meeting date tracking)
 *
 * PART 3 — Operator review reminders (24-hour guarantee protection)
 *   Detects cases in "review" status for 12+ hours and alerts the operator.
 *   The 12-hour threshold gives 12 hours of buffer before the 24-hour delivery
 *   guarantee is breached. Fires only once per case (review_reminder_sent flag).
 *
 * PART 4 — Stuck intake detection (generation may have been dropped)
 *   Detects cases in "intake" status for 2+ hours. This means the generation
 *   trigger was either never fired or silently failed. Alerts operator with
 *   manual retry instructions. Transitions status to "intake-stalled" to prevent
 *   re-alerting on the next cron run.
 *
 * PART 5 — Stuck generating detection (edge function crash/timeout)
 *   Detects cases in "generating" status for 30+ minutes. The Supabase Edge
 *   Function has a 150s timeout, so 30 minutes means it crashed or timed out
 *   without updating the status. Alerts operator with a curl retry command.
 *   Transitions status to "generation-failed" to prevent re-alerting.
 *
 * CAN-SPAM compliance:
 *   - All emails include unsubscribe links (via unsubscribeEmail param)
 *   - Unsubscribed subscribers (unsubscribed_at IS NOT NULL) are filtered out in Part 1
 *   - Unsubscribed buyers are filtered out in Part 2 via subscriber record check
 *   - Physical address is included in email templates (handled by sendEmail utility)
 *
 * Drip deduplication:
 *   The drip_emails table stores (subscriber_id, email_key) pairs. Before sending
 *   any email, we check if that key already exists for the subscriber. This prevents
 *   duplicate sends across cron runs (e.g., if the cron runs twice due to Vercel retry).
 *
 * Batch limits: Both Part 1 and Part 2 process up to 200 records per run.
 * At 1 email per subscriber per day, this supports 200 active subscribers/customers.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, sendEmailWithRetry, escapeHtml } from "@/lib/email";
import { getNextNurtureEmail, getPostPurchaseEmails } from "@/lib/drip-emails";
import type { DripEmail } from "@/lib/drip-emails";
import { signOperatorToken, SITE_URL } from "@/lib/site";
import { stripe } from "@/lib/stripe";

/**
 * Vercel Cron handler — runs daily at 9AM EST (14:00 UTC).
 * Sends drip emails to active subscribers (nurture) AND customers (post-purchase).
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  // ──────────────────────────────────────────────────────────────
  // AUTH: Verify Vercel cron secret
  // ──────────────────────────────────────────────────────────────
  // Vercel automatically sends this header for cron jobs.
  // Without this check, anyone could trigger the cron by hitting the URL.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  /** Counter: emails successfully sent this run */
  let sent = 0;
  /** Counter: subscribers/orders skipped (no email due, unsubscribed, etc.) */
  let skipped = 0;
  /** Counter: email send failures */
  let errors = 0;

  // ── E2: ADVISORY LOCK — Prevent concurrent cron executions ──
  const { data: lockAcquired } = await supabase.rpc("acquire_cron_lock", { lock_key: 1 });
  if (!lockAcquired) {
    return NextResponse.json({ message: "Cron already running (lock not acquired)" });
  }

  try {
    // ============================================================
    // HEARTBEAT: Detect if cron missed runs (Gap D)
    // ============================================================
    // If the last cron_runs entry is >48 hours old, alert the operator.
    // This catches scenarios where Vercel cron stops firing silently.
    // Self-healing: if cron stops for 2 days then resumes, the first
    // run detects the gap and alerts.
    const { data: lastRun } = await supabase
      .from("cron_runs")
      .select("ran_at")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun?.ran_at) {
      const hoursSinceLastRun = (Date.now() - new Date(lastRun.ran_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun > 48) {
        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `ALERT: Cron missed runs — last run was ${Math.round(hoursSinceLastRun)} hours ago`,
          html: `<h1 style="color: #EF4444;">Cron Gap Detected</h1>
            <p>The daily cron job hasn't run in <strong>${Math.round(hoursSinceLastRun)} hours</strong>.</p>
            <p>Last successful run: ${new Date(lastRun.ran_at).toISOString()}</p>
            <p><strong>Action:</strong> Check Vercel cron configuration and logs.</p>`,
        });
      }
    }

    // ============================================================
    // PART 1: NURTURE EMAILS (subscribers who haven't bought yet)
    // ============================================================
    // Fetch all active (non-unsubscribed) subscribers, ordered by signup date.
    // The `.is("unsubscribed_at", null)` filter enforces CAN-SPAM compliance —
    // once a subscriber clicks unsubscribe, their unsubscribed_at is set and
    // they're permanently excluded from all nurture emails.
    const { data: subscribers, error: subError } = await supabase
      .from("subscribers")
      .select("id, email, created_at")
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (subError) {
      console.error("[Drip Cron] Subscriber query error:", subError);
      errors++;
    }

    if (subscribers && subscribers.length > 0) {
      // ── E12: BATCH FETCH all drip_emails for these subscribers (avoids N+1) ──
      const subIds = subscribers.map((s) => s.id);
      const { data: allSentEmails } = await supabase
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

      for (const sub of subscribers) {
        try {
          const subscribedAt = new Date(sub.created_at);
          const now = new Date();
          const daysSinceSubscribe = Math.floor(
            (now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          const sentKeys = sentBySubscriber.get(sub.id) ?? new Set<string>();

          // getNextNurtureEmail returns the next email in the sequence that:
          //   1. Is due based on daysSinceSubscribe
          //   2. Hasn't been sent yet (not in sentKeys)
          // Returns null if all emails are sent or none are due yet.
          const nextEmail = getNextNurtureEmail(daysSinceSubscribe, sentKeys);

          if (!nextEmail) {
            skipped++;
            continue;
          }

          // ── SEND + RECORD (with retry for transient failures) ──
          const result = await sendEmailWithRetry({
            to: sub.email,
            subject: nextEmail.subject,
            html: nextEmail.html,
            unsubscribeEmail: sub.email,
          });

          if (result.success) {
            // Record the send to prevent duplicate delivery on next cron run
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
    // PART 2: POST-PURCHASE EMAILS (customers who bought)
    // ============================================================
    // Sends tier-specific follow-up emails after purchase/delivery.
    // Only processes orders from the last 30 days with status "paid" —
    // refunded orders are excluded (their drip sequences stop immediately).
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Only fetch orders with status "paid" — refunded orders are excluded.
    // This means a full refund immediately stops all post-purchase emails.
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id, email, tier, paid_at")
      .eq("status", "paid")
      .gte("paid_at", thirtyDaysAgo.toISOString())
      .order("paid_at", { ascending: true })
      .limit(200);

    if (orderError) {
      console.error("[Drip Cron] Orders query error:", orderError);
      errors++;
    }

    if (orders && orders.length > 0) {
      for (const order of orders) {
        try {
          const paidAt = new Date(order.paid_at);
          const now = new Date();
          const daysSincePurchase = Math.floor(
            (now.getTime() - paidAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Get the full post-purchase email sequence for this tier.
          // Each tier has different follow-up emails (e.g., case-decoder has
          // delivery confirmation, usage tips, upgrade nudge).
          const tierEmails = getPostPurchaseEmails(order.tier);
          if (tierEmails.length === 0) {
            skipped++;
            continue;
          }

          // ── SUBSCRIBER LOOKUP + CAN-SPAM CHECK ──
          // Buyers may or may not be in the subscribers table (they could have
          // purchased directly without subscribing to the newsletter).
          // If they ARE a subscriber and have unsubscribed, skip all emails.
          const { data: subMatch } = await supabase
            .from("subscribers")
            .select("id, unsubscribed_at")
            .eq("email", order.email.toLowerCase())
            .maybeSingle();

          const subscriberId = subMatch?.id;

          // CAN-SPAM: skip if buyer has unsubscribed from all communications
          if (subMatch?.unsubscribed_at) {
            skipped++;
            continue;
          }

          // ── DEDUP CHECK: What post-purchase emails have already been sent? ──
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

          // ── FIND NEXT UNSENT POST-PURCHASE EMAIL ──
          // Iterates through the tier's email sequence in order and finds
          // the first email that is both due (enough days have passed) and
          // hasn't been sent yet.
          let nextEmail: DripEmail | null = null;
          for (const email of tierEmails) {
            // Skip day-0 emails — these are handled synchronously by the
            // webhook (payment confirmation) or delivery endpoint (report ready),
            // not by the cron. Including them here would cause duplicates.
            if (email.delayDays === 0) continue;

            // Skip relativeToMeeting emails — we don't track meeting dates yet.
            // These will be enabled when meeting scheduling is implemented.
            if (email.relativeToMeeting) continue;

            // ── RELATIVE-TO-DELIVERY TIMING ──
            // Some emails are timed relative to when the report was delivered,
            // not when payment was made. Example: "How was your report?" sent
            // 3 days after delivery, not 3 days after purchase.
            // We look up the most recent delivered case for this email + tier combo.
            if (email.relativeToDelivery) {
              const { data: deliveredCase } = await supabase
                .from("cases")
                .select("delivered_at")
                .eq("email", order.email.toLowerCase())
                .eq("tier", order.tier)
                .eq("status", "delivered")
                .order("delivered_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!deliveredCase?.delivered_at) continue; // Not delivered yet — skip

              const deliveredAt = new Date(deliveredCase.delivered_at);
              const daysSinceDelivery = Math.floor(
                (new Date().getTime() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysSinceDelivery >= email.delayDays && !sentKeys.has(email.key)) {
                nextEmail = email;
                break;
              }
              continue;
            }

            // ── RELATIVE-TO-PURCHASE TIMING (default) ──
            // Standard delay from purchase date
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

          // ── RESOLVE PLACEHOLDERS (e.g., upload reminder needs case ID) ──
          let emailHtml = nextEmail.html;
          if (emailHtml.includes("{{CASE_ID}}") || emailHtml.includes("{{EMAIL}}") || emailHtml.includes("{{REPORT_URL}}")) {
            const { data: linkedCase } = await supabase
              .from("cases")
              .select("id, report_token")
              .eq("email", order.email.toLowerCase())
              .eq("tier", order.tier)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const reportOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
            const reportUrl = linkedCase?.report_token
              ? `${reportOrigin}/report/${linkedCase.report_token}`
              : `${reportOrigin}/services`;
            emailHtml = emailHtml
              .replace(/\{\{CASE_ID\}\}/g, linkedCase?.id || "")
              .replace(/\{\{EMAIL\}\}/g, encodeURIComponent(order.email))
              .replace(/\{\{REPORT_URL\}\}/g, reportUrl);
          }

          // ── SEND + RECORD (with retry for transient failures) ──
          const result = await sendEmailWithRetry({
            to: order.email,
            subject: nextEmail.subject,
            html: emailHtml,
            unsubscribeEmail: order.email,
          });

          if (result.success) {
            // Record send — need a subscriber record for the drip_emails FK.
            // If the buyer isn't already a subscriber, create one (upsert)
            // for tracking purposes. Source is tagged as "purchase-{tier}".
            if (subscriberId) {
              await supabase.from("drip_emails").insert({
                subscriber_id: subscriberId,
                email_key: nextEmail.key,
              });
            } else {
              // Upsert subscriber so we can track drip sends via FK
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

    // ============================================================
    // PART 3: OPERATOR REVIEW REMINDERS (24-hour guarantee protection)
    // ============================================================
    // The Case Decoder has a 24-hour delivery guarantee. Reports land in
    // "review" status after the Edge Function generates them. The operator
    // must review and click "Deliver" before the guarantee expires.
    //
    // This check fires at the 12-hour mark — giving the operator 12 hours
    // of buffer to act before the guarantee is breached. The email includes
    // a direct "Approve & Deliver" link (HMAC-signed, 24h expiry) for
    // one-click delivery.
    //
    // The `review_reminder_sent` flag ensures each case only gets one
    // reminder (prevents email spam on subsequent cron runs).
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const { data: staleReviews } = await supabase
      .from("cases")
      .select("id, email, charge_type, generated_at, tier")
      .eq("status", "review")
      .eq("review_reminder_sent", false)
      .lt("generated_at", twelveHoursAgo.toISOString());

    if (staleReviews && staleReviews.length > 0) {
      const reviewOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const staleCase of staleReviews) {
        const hoursAgo = Math.round(
          (Date.now() - new Date(staleCase.generated_at).getTime()) / (1000 * 60 * 60)
        );

        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `REMINDER: Case Decoder report awaiting review (${hoursAgo}+ hours)`,
          html: `<h1 style="color: #F59E0B;">Report Awaiting Review</h1>
            <p>A Case Decoder report has been in review for <strong style="color: #EF4444;">${hoursAgo} hours</strong>. The 24-hour delivery guarantee is at risk.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(staleCase.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(staleCase.charge_type || "Unknown")}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> ${new Date(staleCase.generated_at).toLocaleString()}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${staleCase.id}</p>
            </div>
            <div style="margin: 24px 0;">
              <a href="${reviewOrigin}/api/deliver?token=${signOperatorToken(staleCase.id)}&case=${staleCase.id}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px;">Approve &amp; Deliver</a>
            </div>
            <p style="color: #71717A; font-size: 12px;">This link expires in 24 hours.</p>`,
        });

        // Mark reminder as sent so this case doesn't trigger another alert
        await supabase
          .from("cases")
          .update({ review_reminder_sent: true })
          .eq("id", staleCase.id);
      }
    }

    // ============================================================
    // PART 4: STUCK INTAKE DETECTION (generation trigger was dropped)
    // ============================================================
    // Cases in "intake" status should be picked up by the generation
    // trigger almost immediately (called from webhook or intake endpoint).
    // If a case has been in "intake" for 2+ hours, something went wrong:
    //   - The fire-and-forget fetch to /api/generate may have failed silently
    //   - The OPERATOR_SECRET may have been wrong
    //   - The generate endpoint may have been down
    //
    // Alerts the operator with manual retry instructions (curl command).
    // Transitions the case to "intake-stalled" to prevent duplicate alerts
    // on the next cron run.
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    const { data: stuckIntakes } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "intake")
      .lt("updated_at", twoHoursAgo.toISOString());

    if (stuckIntakes && stuckIntakes.length > 0) {
      const intakeOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const stuck of stuckIntakes) {
        const hoursStuck = Math.round(
          (Date.now() - new Date(stuck.updated_at).getTime()) / (1000 * 60 * 60)
        );
        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `ALERT: Case stuck in intake for ${hoursStuck}+ hours — ${escapeHtml(stuck.email)}`,
          html: `<h1 style="color: #EF4444;">Case Stuck — Generation May Have Failed</h1>
            <p>Case has been in "intake" status for <strong>${hoursStuck} hours</strong>. Report generation may have been silently dropped.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(stuck.tier)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
            </div>
            <p><strong>Action:</strong> Manually trigger generation:</p>
            <code>POST ${intakeOrigin}/api/generate/case-decoder</code><br/>
            <code>Body: {"caseId": "${stuck.id}"}</code><br/>
            <code>Header: Authorization: Bearer [OPERATOR_SECRET]</code>`,
        });

        // Transition to "intake-stalled" to prevent re-alerting every cron run.
        // The operator must either manually trigger generation or investigate.
        await supabase
          .from("cases")
          .update({ status: "intake-stalled", updated_at: new Date().toISOString() })
          .eq("id", stuck.id);
      }
    }

    // ============================================================
    // PART 5: STUCK "GENERATING" DETECTION (edge function crash/timeout)
    // ============================================================
    // The Supabase Edge Function has a 150-second timeout. If a case
    // has been in "generating" status for 30+ minutes, the Edge Function
    // either crashed, timed out, or failed to update the status.
    //
    // 30 minutes is chosen as the threshold because:
    //   - Normal generation takes 60-120 seconds
    //   - Even with retries, 5 minutes would be generous
    //   - 30 minutes gives a clear signal that it's stuck, not just slow
    //
    // Alerts operator with a working curl command that includes force:true
    // to bypass the idempotency guard in /api/generate/case-decoder.
    // Transitions to "generation-failed" to prevent re-alerting.
    const thirtyMinAgo = new Date();
    thirtyMinAgo.setMinutes(thirtyMinAgo.getMinutes() - 30);

    const { data: stuckGenerating } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "generating")
      .lt("updated_at", thirtyMinAgo.toISOString());

    if (stuckGenerating && stuckGenerating.length > 0) {
      const genOrigin =
        process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const stuck of stuckGenerating) {
        const minutesStuck = Math.round(
          (Date.now() - new Date(stuck.updated_at).getTime()) / (1000 * 60)
        );
        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `ALERT: Report generation stuck for ${minutesStuck}+ min — ${escapeHtml(stuck.email)}`,
          html: `<h1 style="color: #EF4444;">Report Generation Stuck</h1>
            <p>Case has been in "generating" status for <strong>${minutesStuck} minutes</strong>. The edge function likely crashed or timed out.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(stuck.tier)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
            </div>
            <p><strong>Retry command:</strong></p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${genOrigin}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","force":true}'</code>`,
        });

        // Mark as failed to prevent re-alerting every cron run.
        // The operator can retry with force:true, which bypasses the
        // idempotency guard and re-enters "generating" status.
        await supabase
          .from("cases")
          .update({
            status: "generation-failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", stuck.id);
      }
    }

    // ============================================================
    // PART 6: AWAITING-INTAKE REMINDER (paid but didn't fill form)
    // ============================================================
    // Customers who paid but haven't submitted intake after 24 hours
    // get a reminder email. Without this, their case sits forever.
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: awaitingIntakes } = await supabase
      .from("cases")
      .select("id, email, tier, created_at")
      .eq("status", "awaiting-intake")
      .lt("created_at", twentyFourHoursAgo.toISOString());

    if (awaitingIntakes && awaitingIntakes.length > 0) {
      const intakeOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const awCase of awaitingIntakes) {
        // Check if we already sent a reminder (use drip_emails dedup)
        const { data: existingSub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", awCase.email.toLowerCase())
          .maybeSingle();

        if (existingSub?.id) {
          const { data: alreadySent } = await supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", existingSub.id)
            .eq("email_key", `intake_reminder_${awCase.id}`)
            .maybeSingle();

          if (alreadySent) continue;
        }

        const result = await sendEmailWithRetry({
          to: awCase.email,
          subject: "Reminder: Complete your case details to start your report",
          unsubscribeEmail: awCase.email,
          html: `
            <h1 style="color: #F59E0B;">We're Waiting on You</h1>
            <p>You purchased your report — but we still need your case details before we can generate it.</p>
            <p>It only takes 3 minutes:</p>
            <a href="${intakeOrigin}/intake?email=${encodeURIComponent(awCase.email)}&tier=${escapeHtml(awCase.tier)}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
            <p style="color: #A1A1AA;">Once you submit, your report will be generated within 24 hours.</p>
          `,
        });

        if (result.success && existingSub?.id) {
          await supabase.from("drip_emails").insert({
            subscriber_id: existingSub.id,
            email_key: `intake_reminder_${awCase.id}`,
          });
          sent++;
        }
      }
    }

    // ============================================================
    // PART 6b: INTAKE ESCALATION — 72h + 7d operator alerts (Gap C)
    // ============================================================
    // After the 24h customer reminder, cases can still sit in
    // "awaiting-intake" forever. This escalates to the operator:
    //   - 72 hours: "Customer paid 3 days ago, still no intake"
    //   - 7 days: "Consider reaching out or initiating refund"
    // Both use drip_emails dedup to avoid re-alerting.
    const seventyTwoHoursAgo = new Date();
    seventyTwoHoursAgo.setHours(seventyTwoHoursAgo.getHours() - 72);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: escalationCases } = await supabase
      .from("cases")
      .select("id, email, tier, created_at")
      .eq("status", "awaiting-intake")
      .lt("created_at", seventyTwoHoursAgo.toISOString());

    if (escalationCases && escalationCases.length > 0) {
      for (const escCase of escalationCases) {
        const caseAge = Date.now() - new Date(escCase.created_at).getTime();
        const daysSincePaid = Math.round(caseAge / (1000 * 60 * 60 * 24));
        const isSevenDay = caseAge > 7 * 24 * 60 * 60 * 1000;
        const escalationKey = isSevenDay
          ? `intake_escalation_7d_${escCase.id}`
          : `intake_escalation_72h_${escCase.id}`;

        // Need subscriber for dedup
        const { data: escSub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", escCase.email.toLowerCase())
          .maybeSingle();

        if (escSub?.id) {
          const { data: alreadyEscalated } = await supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", escSub.id)
            .eq("email_key", escalationKey)
            .maybeSingle();

          if (alreadyEscalated) continue;
        }

        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: isSevenDay
            ? `URGENT: Customer paid ${daysSincePaid} days ago — no intake (consider refund)`
            : `ALERT: Customer paid ${daysSincePaid} days ago — still no intake`,
          html: `<h1 style="color: ${isSevenDay ? "#EF4444" : "#F59E0B"};">${isSevenDay ? "Customer May Need Refund" : "Intake Still Missing"}</h1>
            <p>Customer paid <strong>${daysSincePaid} days ago</strong> and has not submitted their intake form.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid ${isSevenDay ? "#EF4444" : "#F59E0B"};">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(escCase.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(escCase.tier)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${escCase.id}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Paid:</strong> ${new Date(escCase.created_at).toISOString()}</p>
            </div>
            <p><strong>Action:</strong> ${isSevenDay ? "Consider reaching out directly or initiating a refund." : "Send a personal follow-up email."}</p>`,
        });

        if (escSub?.id) {
          await supabase.from("drip_emails").insert({
            subscriber_id: escSub.id,
            email_key: escalationKey,
          });
        }
      }
    }

    // ============================================================
    // PART 7: ABANDONED INTAKE CLEANUP (E5)
    // ============================================================
    // Delete intakes older than 90 days that have no corresponding case.
    // These are browsing-only submissions (never purchased).
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: oldIntakes } = await supabase
      .from("intakes")
      .select("id, email")
      .lt("created_at", ninetyDaysAgo.toISOString());

    let cleaned = 0;
    if (oldIntakes && oldIntakes.length > 0) {
      for (const intake of oldIntakes) {
        // Only delete if no case exists for this email
        const { data: hasCase } = await supabase
          .from("cases")
          .select("id")
          .eq("email", intake.email.toLowerCase())
          .limit(1)
          .maybeSingle();

        if (!hasCase) {
          await supabase.from("intakes").delete().eq("id", intake.id);
          cleaned++;
        }
      }
    }

    // ============================================================
    // PART 8: RATE LIMIT TABLE CLEANUP (E7)
    // ============================================================
    // Remove expired rate limit entries older than 1 hour.
    await supabase.rpc("cleanup_rate_limits", { p_max_age_seconds: 3600 });

    // ============================================================
    // PART 9: STRIPE RECONCILIATION + ORPHAN ORDER DETECTION (Gap A + B)
    // ============================================================
    // 9a — Stripe reconciliation: detect paid sessions with no matching order.
    //   If webhook failed or was never delivered, the customer paid but we
    //   have no record. Check last 2 hours of paid sessions against orders.
    //
    // 9b — Orphan order detection: detect orders with no linked case.
    //   If the case INSERT failed after the order INSERT, the customer has
    //   an order but no case — services can't be delivered.
    try {
      // 9a: List recent paid Stripe sessions, check for missing orders
      const twoHoursAgoEpoch = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
      const sessions = await stripe.checkout.sessions.list({
        limit: 50,
        created: { gte: twoHoursAgoEpoch },
      });

      for (const session of sessions.data) {
        if (session.payment_status !== "paid") continue;
        if (!session.metadata?.tier) continue;

        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (!existingOrder) {
          // Missing order — webhook never fired or failed
          const email = (session.customer_email || session.customer_details?.email || "").toLowerCase().trim();
          const tier = session.metadata.tier;
          const amount = session.amount_total || 0;

          // Auto-create the missing order
          const { data: recoveredOrder } = await supabase
            .from("orders")
            .insert({
              email,
              tier,
              amount,
              status: "paid",
              stripe_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              paid_at: new Date(session.created * 1000).toISOString(),
            })
            .select("id")
            .single();

          if (recoveredOrder) {
            // Auto-create case
            const caseId = crypto.randomUUID();
            await supabase.from("cases").insert({
              id: caseId,
              order_id: recoveredOrder.id,
              email,
              tier,
              status: "awaiting-intake",
              file_urls: [],
            });
          }

          // URGENT operator alert
          await sendEmail({
            to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
            subject: `URGENT: Recovered missed payment — ${escapeHtml(email || "unknown")}`,
            html: `<h1 style="color: #EF4444;">Webhook Failure Recovered</h1>
              <p>A paid Stripe session had no matching order. Auto-recovered.</p>
              <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
                <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(email || "unknown")}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tier)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Stripe Session:</strong> ${escapeHtml(session.id)}</p>
              </div>
              <p><strong>Action:</strong> Verify recovery + send customer their intake/upload email if needed.</p>`,
          });
          errors++; // Count as an anomaly
        }
      }

      // 9b: Orphan order detection — orders with no linked case
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data: recentOrders } = await supabase
        .from("orders")
        .select("id, email, tier, amount")
        .eq("status", "paid")
        .lt("created_at", oneHourAgo.toISOString())
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (recentOrders) {
        for (const order of recentOrders) {
          const { data: linkedCase } = await supabase
            .from("cases")
            .select("id")
            .eq("order_id", order.id)
            .maybeSingle();

          if (!linkedCase) {
            // Orphan order — create case and alert
            const caseId = crypto.randomUUID();
            await supabase.from("cases").insert({
              id: caseId,
              order_id: order.id,
              email: order.email,
              tier: order.tier,
              status: "awaiting-intake",
              file_urls: [],
            });

            await sendEmail({
              to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
              subject: `URGENT: Orphan order recovered — ${escapeHtml(order.email)}`,
              html: `<h1 style="color: #EF4444;">Orphan Order — Case Auto-Created</h1>
                <p>Order existed with no linked case. Auto-created case.</p>
                <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
                  <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(order.email)}</p>
                  <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(order.tier)}</p>
                  <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Order ID:</strong> ${order.id}</p>
                  <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">New Case ID:</strong> ${caseId}</p>
                </div>
                <p><strong>Action:</strong> Verify and send customer their intake email.</p>`,
            });
            errors++;
          }
        }
      }
    } catch (stripeErr) {
      console.error("[Drip Cron] Part 9 Stripe reconciliation error:", stripeErr);
      errors++;
    }

    // ============================================================
    // PART 10: REPORT EXPIRING SOON EMAIL (E9)
    // ============================================================
    // Case Decoder reports expire at 12 months. Send a 30-day warning
    // so customers can access their report before the link dies.
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyOneDaysFromNow = new Date();
    thirtyOneDaysFromNow.setDate(thirtyOneDaysFromNow.getDate() + 31);

    const { data: expiringCases } = await supabase
      .from("cases")
      .select("id, email, tier, report_token, report_token_expires_at")
      .eq("status", "delivered")
      .gte("report_token_expires_at", thirtyDaysFromNow.toISOString())
      .lt("report_token_expires_at", thirtyOneDaysFromNow.toISOString());

    if (expiringCases && expiringCases.length > 0) {
      const reportOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const expCase of expiringCases) {
        if (!expCase.report_token) continue;

        // Dedup via drip_emails
        const { data: expSub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", expCase.email.toLowerCase())
          .maybeSingle();

        if (expSub?.id) {
          const { data: alreadySent } = await supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", expSub.id)
            .eq("email_key", `report_expiry_warning_${expCase.id}`)
            .maybeSingle();

          if (alreadySent) continue;
        }

        const result = await sendEmailWithRetry({
          to: expCase.email,
          subject: "Your report link expires in 30 days",
          unsubscribeEmail: expCase.email,
          html: `
            <h1 style="color: #F59E0B;">Report Link Expiring Soon</h1>
            <p>Your report link will expire in 30 days. Make sure to access it before then:</p>
            <a href="${reportOrigin}/report/${expCase.report_token}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
            <p style="color: #A1A1AA;">After expiration, contact us to request a new link.</p>
          `,
        });

        if (result.success && expSub?.id) {
          await supabase.from("drip_emails").insert({
            subscriber_id: expSub.id,
            email_key: `report_expiry_warning_${expCase.id}`,
          });
          sent++;
        }
      }
    }

    // ============================================================
    // PART 11: ABANDONED CHECKOUT RECOVERY EMAIL (U8)
    // ============================================================
    // Customers who entered checkout (email captured as subscriber with
    // source="checkout") but never completed payment get a follow-up
    // 24-48 hours later.
    const abandonedStart = new Date();
    abandonedStart.setHours(abandonedStart.getHours() - 48);
    const abandonedEnd = new Date();
    abandonedEnd.setHours(abandonedEnd.getHours() - 24);

    const { data: abandonedSubs } = await supabase
      .from("subscribers")
      .select("id, email, created_at")
      .eq("source", "checkout")
      .gte("created_at", abandonedStart.toISOString())
      .lt("created_at", abandonedEnd.toISOString())
      .is("unsubscribed_at", null);

    if (abandonedSubs && abandonedSubs.length > 0) {
      const checkoutOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const abSub of abandonedSubs) {
        // Check if they actually completed a purchase
        const { data: hasPaidOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("email", abSub.email.toLowerCase())
          .eq("status", "paid")
          .limit(1)
          .maybeSingle();

        if (hasPaidOrder) continue; // They bought — skip

        // Dedup
        const { data: alreadySent } = await supabase
          .from("drip_emails")
          .select("id")
          .eq("subscriber_id", abSub.id)
          .eq("email_key", `abandoned_checkout_${abSub.id}`)
          .maybeSingle();

        if (alreadySent) continue;

        const result = await sendEmailWithRetry({
          to: abSub.email,
          subject: "Still thinking about the Case Decoder?",
          unsubscribeEmail: abSub.email,
          html: `
            <h1 style="color: #F59E0B;">You Were Close</h1>
            <p>You started checkout but didn't finish. No pressure — but if you're still thinking about it, the Case Decoder is the right place to start.</p>
            <p>For $197, you get a plain-English charge breakdown, 10-15 targeted questions for your attorney, and red flags specific to your case stage.</p>
            <a href="${checkoutOrigin}/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Continue to Checkout</a>
            <p style="color: #A1A1AA;">Questions? Reply to this email — a real person reads every message.</p>
          `,
        });

        if (result.success) {
          await supabase.from("drip_emails").insert({
            subscriber_id: abSub.id,
            email_key: `abandoned_checkout_${abSub.id}`,
          });
          sent++;
        } else {
          errors++;
        }
      }
    }

    // ============================================================
    // CRON HEARTBEAT: Record this run (Gap D)
    // ============================================================
    await supabase.from("cron_runs").insert({
      result: { sent, skipped, errors, cleaned },
    });

    // ──────────────────────────────────────────────────────────────
    // RETURN SUMMARY
    // ──────────────────────────────────────────────────────────────
    // Vercel Cron logs this response. Useful for debugging drip issues.
    return NextResponse.json({ sent, skipped, errors, cleaned });
  } catch (err) {
    console.error("[Drip Cron] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    // ── E2: Release advisory lock regardless of success/failure ──
    await supabase.rpc("release_cron_lock", { lock_key: 1 });
  }
}
