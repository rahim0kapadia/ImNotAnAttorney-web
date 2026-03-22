/**
 * @file /api/cron/drip — Daily cron job for drip emails + system health monitoring
 *
 * Schedule: Runs daily at 9 AM EST (14:00 UTC) via Vercel Cron.
 * Protected by CRON_SECRET bearer token (Vercel sets this automatically).
 *
 * This cron does 21 things, in order:
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
 * PART 3 — Operator review reminders (48-hour guarantee protection)
 *   Detects cases in "review" status for 12+ hours and alerts the operator.
 *   The 12-hour threshold gives 36 hours of buffer before the 48-hour delivery
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
 *   PART 5b — IB multi-phase stuck detection (auto-generating, compiling, researching).
 *   Includes 24h operator nudge + 72h escalation for stuck "researching" status.
 *   PART 5c — IB Phase 2 intake reminder. Customer reminder at 48h, operator
 *   escalation at 7d when customer hasn't submitted Phase 2 form.
 *
 * PART 12 — Missed evaluation safety net
 *   Detects cases in "review" status with NULL eval_results and generated_at > 15 min ago.
 *   Re-triggers the evaluate-report Edge Function for up to 5 cases per cron run.
 *   The eval trigger is fire-and-forget from generate-report — this catches cases
 *   where that trigger was silently dropped.
 *
 * PART 13 — Drip email send log cleanup (Privacy Policy §6)
 *   Purges drip_emails dedup records older than 90 days.
 *
 * PART 14 — Discovery document auto-deletion (Privacy Policy §4)
 *   Deletes discovery files from Supabase Storage 90 days after report delivery.
 *   Clears file_urls on the case record after successful deletion.
 *
 * PART 15 — Stuck job detection (processing_jobs > 30 min)
 *   Marks stuck processing jobs as 'failed' and creates operator tasks.
 *
 * PART 16 — Pipeline completion check (all jobs done -> review)
 *   Transitions discovery cases to 'review' when all processing jobs finish.
 *   Emails operator with job completion summary.
 *
 * PART 17 — SLA breach detection (delivery_due_at passed)
 *   Creates operator tasks for cases that have exceeded their delivery deadline.
 *   Deduplicates: skips if an open sla_breach task already exists for the case.
 *
 * PART 18 — Weekly progress email (War Room + Situation Room)
 *   Sends weekly case stats + portal link to active discovery-tier customers.
 *   CAN-SPAM compliant with unsubscribe. Dedup via drip_emails week number.
 *
 * PART 19 — Engine heartbeat (stale queued jobs -> operator alert)
 *   If queued jobs are older than 1 hour, the engine worker may be down.
 *   Creates one operator task per day and emails the operator.
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
import { getNextNurtureEmail, getNextScoreEmail, getScoreNurtureOffset, getNextDui72hEmail, getDui72hNurtureOffset, getPostPurchaseEmails, personalizeEmailHtml, getNextAbandonedScoreEmail, getNextWinbackEmail } from "@/lib/drip-emails";
import type { DripEmail, DripPersonalizationData } from "@/lib/drip-emails";
import { timingSafeEqual } from "crypto";
import { signOperatorToken, signPhase2Token, SITE_URL, caseThreadId } from "@/lib/site";
import { stripe } from "@/lib/stripe";
import { TIER_CORE, tierDisplayName } from "@/lib/tiers";
import { requireCron } from "@/lib/auth/guards";

/**
 * Vercel Cron handler — runs daily at 9AM EST (14:00 UTC).
 * Sends drip emails to active subscribers (nurture) AND customers (post-purchase).
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  // Defense-in-depth: requireCron guard (timing-safe HMAC comparison)
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ──────────────────────────────────────────────────────────────
  // AUTH: Verify Vercel cron secret (legacy inline check — kept for belt-and-suspenders)
  // ──────────────────────────────────────────────────────────────
  // Vercel automatically sends this header for cron jobs.
  // Without this check, anyone could trigger the cron by hitting the URL.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const expected = `Bearer ${cronSecret}`;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
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
        }, { category: "operator-alert", metadata: { reason: "cron-gap", hours_since_last: Math.round(hoursSinceLastRun) } });
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
      .select("id, email, created_at, score_band, source")
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

      // ── Batch-fetch emails that have orders (for win-back suppression) ──
      // Win-back emails should NOT be sent to subscribers who have purchased,
      // since they receive their own post-purchase drip sequence instead.
      const { data: orderEmails } = await supabase
        .from("orders")
        .select("email")
        .in("status", ["paid", "delivered"]);
      const purchasedEmails = new Set((orderEmails ?? []).map((o: { email: string }) => o.email.toLowerCase().trim()));

      for (const sub of subscribers) {
        try {
          const subscribedAt = new Date(sub.created_at);
          const now = new Date();
          const daysSinceSubscribe = Math.floor(
            (now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          const sentKeys = sentBySubscriber.get(sub.id) ?? new Set<string>();

          // ── SOURCE-BASED & BAND-BASED ROUTING ──
          // Routing priority:
          //   1. DUI 72-hour subscribers (source: "dui-72-hours") get crisis-cadence
          //      emails (Day 1, 3, 5, 7), then STOP. No standard nurture fallthrough —
          //      crisis buyers have bought or moved on by Day 7.
          //   2. Score-page subscribers with a band get band-specific emails first.
          //      Once all band-specific emails are sent, they fall through to
          //      standard nurture with an offset (skipping early generic emails).
          //   3. All other subscribers get standard nurture as-is.
          let nextEmail: DripEmail | null = null;

          if (sub.source === "dui-72-hours") {
            // Try DUI 72-hour crisis sequence — no fallthrough after completion
            nextEmail = getNextDui72hEmail(daysSinceSubscribe, sentKeys);
            // When nextEmail is null, all 4 crisis emails sent — STOP. Do not
            // fall through to standard nurture. Crisis buyers who haven't
            // converted by Day 7 are gone. Sending Day 10/14 generic nurture
            // burns sender reputation for near-zero conversion.
          } else if (sub.source === "score-abandoned") {
            // Score quiz abandonment sequence (3 emails, Day 1/2/5)
            nextEmail = getNextAbandonedScoreEmail(daysSinceSubscribe, sentKeys);
            if (!nextEmail) {
              // After abandoned score sequence, fall through to standard nurture at Day 7
              const adjustedDays = daysSinceSubscribe - 7;
              if (adjustedDays >= 0) {
                nextEmail = getNextNurtureEmail(adjustedDays, sentKeys);
              }
            }
          } else if (sub.score_band) {
            // Try score-specific emails first
            nextEmail = getNextScoreEmail(daysSinceSubscribe, sentKeys, sub.score_band);

            if (!nextEmail) {
              // All score emails sent — fall through to standard nurture with offset
              const offset = getScoreNurtureOffset(sub.score_band);
              const adjustedDays = daysSinceSubscribe - offset;
              if (adjustedDays >= 0) {
                nextEmail = getNextNurtureEmail(adjustedDays, sentKeys);
              }
            }
          } else {
            // Non-score, non-DUI subscriber: standard nurture as-is
            nextEmail = getNextNurtureEmail(daysSinceSubscribe, sentKeys);
          }

          // ── WIN-BACK FALLTHROUGH ──
          // If all standard sequences are exhausted (nextEmail is null) and
          // enough time has passed (75+ days), try the win-back sequence.
          // Suppressed for: DUI-72h subscribers (dead after Day 7), purchasers
          // (they get post-purchase drips instead).
          if (!nextEmail && sub.source !== "dui-72-hours" && daysSinceSubscribe >= 75) {
            const hasPurchase = purchasedEmails.has(sub.email.toLowerCase().trim());
            if (!hasPurchase) {
              nextEmail = getNextWinbackEmail(daysSinceSubscribe, sentKeys);
              // Resolve resubscribe URL placeholder for sunset emails (winback_4, winback_5)
              if (nextEmail && nextEmail.html.includes("%%RESUBSCRIBE_URL%%")) {
                const resubUrl = `${SITE_URL}/api/resubscribe?email=${Buffer.from(sub.email).toString("base64")}`;
                nextEmail = { ...nextEmail, html: nextEmail.html.replace(/%%RESUBSCRIBE_URL%%/g, resubUrl) };
              }
            }
          }

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
          }, { category: "drip-nurture", email_key: nextEmail.key });

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

          // ── SKIP UPSELL FOR INCLUDED DELIVERABLES ──
          // If the customer bought IB+, the included CD case shouldn't get
          // upsell emails nudging them to buy IB — they already have it.
          // Check if any case for this order is an included deliverable.
          let skipUpsell = false;
          if (order.tier === "case-decoder") {
            const { data: higherOrder } = await supabase
              .from("orders")
              .select("id")
              .eq("email", order.email.toLowerCase())
              .eq("status", "paid")
              .neq("tier", "case-decoder")
              .neq("tier", "extra-witness")
              .neq("tier", "witness-pack")
              .limit(1)
              .maybeSingle();
            if (higherOrder) skipUpsell = true;
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

            // Skip upsell emails if customer already has a higher-tier purchase
            if (skipUpsell && email.key.includes("upsell")) continue;

            // ── RELATIVE-TO-SUBMISSION TIMING ──
            // Active-wait emails are timed relative to when discovery docs were
            // submitted (case status became 'submitted'), not purchase date.
            // Skip if case isn't submitted yet or is already delivered.
            if (email.relativeToSubmission) {
              const { data: submittedCase } = await supabase
                .from("cases")
                .select("status, updated_at")
                .eq("email", order.email.toLowerCase())
                .eq("tier", order.tier)
                .in("status", ["submitted", "processing", "review"])
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!submittedCase?.updated_at) continue; // Not submitted yet

              // Skip if already delivered or refunded
              if (["delivered", "refunded"].includes(submittedCase.status)) continue;

              const submittedAt = new Date(submittedCase.updated_at);
              const daysSinceSubmission = Math.floor(
                (new Date().getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysSinceSubmission >= email.delayDays && !sentKeys.has(email.key)) {
                nextEmail = email;
                break;
              }
              continue;
            }

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

          // ── LINKED CASE (for threading + placeholder resolution) ──
          const { data: linkedCase } = await supabase
            .from("cases")
            .select("id, intake_id, report_token, status")
            .eq("email", order.email.toLowerCase())
            .eq("tier", order.tier)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // ── INTAKE DATA (for email personalization) ──
          let intakeData: DripPersonalizationData | null = null;
          if (linkedCase?.intake_id) {
            const { data } = await supabase
              .from("intakes")
              .select("filled_out_by, case_stage, employment_industry, first_name")
              .eq("id", linkedCase.intake_id)
              .single();
            intakeData = data;
          }

          // ── GUARD: Intake reminders only send if intake hasn't been submitted ──
          // Applies to all tier intake reminders (CD, X-Ray, War Room, Situation Room).
          // Skip if the customer has already submitted intake (case is no longer
          // in awaiting-intake status).
          if (nextEmail.key.endsWith("_intake_reminder") && linkedCase) {
            if (linkedCase.status !== "awaiting-intake") {
              skipped++;
              continue;
            }
          }

          // ── GUARD: Upload reminder only sends if customer hasn't uploaded yet ──
          // Discovery tiers (X-Ray, War Room, Situation Room) send upload reminders
          // 2 days after purchase. Skip if files are already uploaded or case has
          // progressed past the upload stage.
          if (nextEmail.key.endsWith("_upload_reminder") && linkedCase) {
            const uploadedStatuses = ["submitted", "processing", "review", "delivered", "refunded"];
            const { data: caseForUpload } = await supabase
              .from("cases")
              .select("status, file_urls")
              .eq("id", linkedCase.id)
              .single();
            if (caseForUpload) {
              const hasUploads = (caseForUpload.file_urls?.length || 0) > 0;
              const pastUpload = uploadedStatuses.includes(caseForUpload.status);
              if (hasUploads || pastUpload) {
                skipped++;
                continue;
              }
            }
          }

          // ── GUARD: IB Phase 2 reminder only sends if Phase 2 intake hasn't been submitted ──
          // The IB case sits in "intake" status until Phase 2 is submitted. Once
          // Phase 2 triggers generation, status moves to "auto-generating" or later.
          if (nextEmail.key === "post_intelligence_brief_phase2_reminder") {
            const { data: ibCase } = await supabase
              .from("cases")
              .select("status")
              .eq("email", order.email.toLowerCase())
              .eq("tier", "intelligence-brief")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            // Skip if IB case doesn't exist or has progressed past intake
            if (!ibCase || ibCase.status !== "intake") {
              skipped++;
              continue;
            }
          }

          // ── GUARD: Status update emails only send after upload submission ──
          // Discovery tier status updates should only fire once the customer
          // has actually submitted documents (case status = "submitted" or later).
          if (nextEmail.key.includes("status_update") && linkedCase) {
            const submittedStatuses = ["submitted", "generating", "review", "delivered"];
            if (!submittedStatuses.includes(linkedCase.status)) {
              skipped++;
              continue;
            }
          }

          // ── RESOLVE PLACEHOLDERS (e.g., upload reminder needs case ID) ──
          let emailHtml = nextEmail.html;
          if (emailHtml.includes("{{CASE_ID}}") || emailHtml.includes("{{EMAIL}}") || emailHtml.includes("{{REPORT_URL}}")) {
            const reportOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
            const reportUrl = linkedCase?.report_token
              ? `${reportOrigin}/report/${linkedCase.report_token}`
              : `${reportOrigin}/services`;
            emailHtml = emailHtml
              .replace(/\{\{CASE_ID\}\}/g, linkedCase?.id || "")
              .replace(/\{\{EMAIL\}\}/g, encodeURIComponent(order.email))
              .replace(/\{\{REPORT_URL\}\}/g, reportUrl);
          }

          // ── RESOLVE DOCUMENT COUNT (for active-wait emails) ──
          if (emailHtml.includes("{{DOCUMENT_COUNT}}") && linkedCase) {
            const { data: caseForCount } = await supabase
              .from("cases")
              .select("file_urls")
              .eq("id", linkedCase.id)
              .single();
            const docCount = caseForCount?.file_urls?.length || 0;
            emailHtml = emailHtml.replace(/\{\{DOCUMENT_COUNT\}\}/g, String(docCount));
          }

          // ── PERSONALIZE (family buyer, stage-aware, career-aware blocks) ──
          if (intakeData) {
            emailHtml = personalizeEmailHtml(emailHtml, nextEmail.key, intakeData);
          }

          // ── SEND + RECORD (with retry for transient failures) ──
          const result = await sendEmailWithRetry({
            to: order.email,
            subject: nextEmail.subject,
            html: emailHtml,
            unsubscribeEmail: order.email,
            ...(linkedCase?.id && {
              threadingHeaders: {
                inReplyTo: caseThreadId(linkedCase.id),
                references: caseThreadId(linkedCase.id),
              },
            }),
          }, { category: "drip-post-purchase", email_key: nextEmail.key, case_id: linkedCase?.id, metadata: { tier: order.tier } });

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
    // PART 3: OPERATOR REVIEW REMINDERS (48-hour guarantee protection)
    // ============================================================
    // The Case Decoder has a 48-hour delivery guarantee. Reports land in
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
          subject: `REMINDER: ${tierDisplayName(staleCase.tier)} awaiting review (${hoursAgo}+ hours)`,
          html: `<h1 style="color: #F59E0B;">Report Awaiting Review</h1>
            <p>A ${escapeHtml(tierDisplayName(staleCase.tier))} has been in review for <strong style="color: #EF4444;">${hoursAgo} hours</strong>. The delivery guarantee is at risk.</p>
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
        }, { category: "operator-review-reminder", case_id: staleCase.id });

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

    // Only flag case-decoder tier. Higher tiers (IB+) legitimately sit in
    // "intake" status while waiting for operator processing or Phase 2 intake.
    // Also skip is_included_deliverable cases — they have longer processing times.
    const { data: stuckIntakes } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "intake")
      .eq("tier", "case-decoder")
      .eq("is_included_deliverable", false)
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
        }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-intake", hours: hoursStuck } });

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
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${genOrigin}/api/generate/${stuck.tier === 'intelligence-brief' ? 'intelligence-brief' : 'case-decoder'} -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","force":true}'</code>`,
        }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-generation", minutes: minutesStuck } });

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
    // PART 5b: STUCK IB GENERATION DETECTION
    // ============================================================
    // Intelligence Brief uses multi-phase generation with statuses:
    //   auto-generating → researching → compiling → review
    // Detect stuck cases at each phase and alert the operator.

    // Stuck auto-generating (Phase A timeout — >30 min)
    const { data: stuckAutoGen } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "auto-generating")
      .lt("updated_at", thirtyMinAgo.toISOString());

    if (stuckAutoGen && stuckAutoGen.length > 0) {
      const ibOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const stuck of stuckAutoGen) {
        const minutesStuck = Math.round(
          (Date.now() - new Date(stuck.updated_at).getTime()) / (1000 * 60)
        );
        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `ALERT: IB Phase A stuck for ${minutesStuck}+ min — ${escapeHtml(stuck.email)}`,
          html: `<h1 style="color: #EF4444;">Intelligence Brief Phase A Stuck</h1>
            <p>Case has been in "auto-generating" status for <strong>${minutesStuck} minutes</strong>. Phase A likely crashed or timed out.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(stuck.tier)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
            </div>
            <p><strong>Retry command:</strong></p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${ibOrigin}/api/generate/intelligence-brief -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","force":true}'</code>`,
        }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-auto-generating", minutes: minutesStuck } });

        await supabase
          .from("cases")
          .update({ status: "generation-failed", updated_at: new Date().toISOString() })
          .eq("id", stuck.id);
      }
    }

    // Stuck compiling (Phase B timeout — >30 min)
    const { data: stuckCompiling } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "compiling")
      .lt("updated_at", thirtyMinAgo.toISOString());

    if (stuckCompiling && stuckCompiling.length > 0) {
      const ibOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const stuck of stuckCompiling) {
        const minutesStuck = Math.round(
          (Date.now() - new Date(stuck.updated_at).getTime()) / (1000 * 60)
        );
        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `ALERT: IB Phase B stuck for ${minutesStuck}+ min — ${escapeHtml(stuck.email)}`,
          html: `<h1 style="color: #EF4444;">Intelligence Brief Phase B Stuck</h1>
            <p>Case has been in "compiling" status for <strong>${minutesStuck} minutes</strong>. Phase B likely crashed or timed out.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
            </div>
            <p><strong>Action:</strong> Check Edge Function logs. Re-trigger Phase B (judge research data is preserved):</p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${ibOrigin}/api/generate/intelligence-brief/judge-research -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","judgeResearch":{},"force":true}'</code>`,
        }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-compiling", minutes: minutesStuck } });

        await supabase
          .from("cases")
          .update({ status: "generation-failed", updated_at: new Date().toISOString() })
          .eq("id", stuck.id);
      }
    }

    // Stuck researching (waiting for judge research — >24h operator nudge)
    const researchThreshold = new Date();
    researchThreshold.setHours(researchThreshold.getHours() - 24);
    const { data: stuckResearching } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "researching")
      .lt("updated_at", researchThreshold.toISOString());

    if (stuckResearching && stuckResearching.length > 0) {
      for (const stuck of stuckResearching) {
        const hoursStuck = Math.round(
          (Date.now() - new Date(stuck.updated_at).getTime()) / (1000 * 60 * 60)
        );
        // Check if we already sent a nudge for this case
        const { data: existingSub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", stuck.email.toLowerCase())
          .maybeSingle();

        if (existingSub?.id) {
          const { data: alreadySent } = await supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", existingSub.id)
            .eq("email_key", `researching_nudge_${stuck.id}`)
            .maybeSingle();
          if (alreadySent) continue;
        }

        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `REMINDER: IB judge research pending for ${hoursStuck}+ hours — ${escapeHtml(stuck.email)}`,
          html: `<h1 style="color: #F59E0B;">Intelligence Brief Awaiting Judge Research</h1>
            <p>Phase A completed ${hoursStuck} hours ago. Judge research data is needed to proceed with Phase B.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
            </div>
            <p><strong>Action:</strong> Enter judge research data via the judge-research endpoint to trigger Phase B.</p>`,
        }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-researching", hours: hoursStuck } });

        // Record nudge to prevent re-alerting
        if (existingSub?.id) {
          await supabase.from("drip_emails").upsert(
            { subscriber_id: existingSub.id, email_key: `researching_nudge_${stuck.id}` },
            { onConflict: "subscriber_id,email_key" }
          );
        }
      }
    }

    // Researching escalation (72h — judge research still not submitted)
    // The 24h nudge above is a gentle reminder. This escalation fires at 72h
    // with stronger language — the customer has been waiting 3+ days.
    const researchEscThreshold = new Date();
    researchEscThreshold.setHours(researchEscThreshold.getHours() - 72);
    const { data: stuckResearching72h } = await supabase
      .from("cases")
      .select("id, email, charge_type, tier, updated_at")
      .eq("status", "researching")
      .lt("updated_at", researchEscThreshold.toISOString());

    if (stuckResearching72h && stuckResearching72h.length > 0) {
      for (const stuck of stuckResearching72h) {
        const hoursStuck = Math.round(
          (Date.now() - new Date(stuck.updated_at).getTime()) / (1000 * 60 * 60)
        );

        const { data: escSub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", stuck.email.toLowerCase())
          .maybeSingle();

        if (escSub?.id) {
          const { data: alreadyEscalated } = await supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", escSub.id)
            .eq("email_key", `researching_escalation_${stuck.id}`)
            .maybeSingle();
          if (alreadyEscalated) continue;
        }

        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `URGENT: Judge research pending ${hoursStuck}+ hours — customer waiting — ${escapeHtml(stuck.email)}`,
          html: `<h1 style="color: #EF4444;">Intelligence Brief Blocked — Judge Research Overdue</h1>
            <p>Phase A completed <strong>${hoursStuck} hours ago</strong> (${Math.round(hoursStuck / 24)} days). The customer is waiting for their Intelligence Brief but judge research hasn't been submitted.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge:</strong> ${escapeHtml(stuck.charge_type || "unknown")}</p>
            </div>
            <p><strong>Action:</strong> Submit judge research immediately or contact the customer about the delay.</p>`,
        }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "researching-escalation", hours: hoursStuck } });

        if (escSub?.id) {
          await supabase.from("drip_emails").insert({
            subscriber_id: escSub.id,
            email_key: `researching_escalation_${stuck.id}`,
          });
        }
      }
    }

    // ============================================================
    // PART 5c: IB PHASE 2 INTAKE REMINDER (customer hasn't filled Phase 2)
    // ============================================================
    // After CD delivery, the customer gets ONE email with the Phase 2
    // intake link. If they ignore it, the IB case sits in "intake" forever
    // with no follow-up. This sends a reminder at 48h and escalates to
    // the operator at 7 days.
    //
    // Identifies IB cases by checking:
    //   - status = "intake" + tier = "intelligence-brief"
    //   - updated_at > 48 hours ago (gives 2 days after CD delivery)
    //   - linked intake has phase2_data IS NULL (hasn't submitted Phase 2)
    //
    // Dedup: drip_emails with key "phase2_reminder_{caseId}"
    // Escalation: drip_emails with key "phase2_escalation_7d_{caseId}"
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
    const sevenDaysAgoP2 = new Date();
    sevenDaysAgoP2.setDate(sevenDaysAgoP2.getDate() - 7);

    const { data: ibWaitingPhase2 } = await supabase
      .from("cases")
      .select("id, email, intake_id, updated_at")
      .eq("status", "intake")
      .eq("tier", "intelligence-brief")
      .lt("updated_at", fortyEightHoursAgo.toISOString());

    if (ibWaitingPhase2 && ibWaitingPhase2.length > 0) {
      const p2Origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const ibCase of ibWaitingPhase2) {
        // Verify Phase 2 hasn't been submitted yet
        if (ibCase.intake_id) {
          const { data: intake } = await supabase
            .from("intakes")
            .select("phase2_data")
            .eq("id", ibCase.intake_id)
            .maybeSingle();

          if (intake?.phase2_data) continue; // Already submitted — skip
        }

        // Determine if this is a 7-day escalation or 48h reminder
        const caseAge = Date.now() - new Date(ibCase.updated_at).getTime();
        const isSevenDayEscalation = caseAge > 7 * 24 * 60 * 60 * 1000;

        // Get subscriber for dedup
        const { data: p2Sub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", ibCase.email.toLowerCase())
          .maybeSingle();

        if (isSevenDayEscalation) {
          // 7-day operator escalation
          const escalationKey = `phase2_escalation_7d_${ibCase.id}`;
          if (p2Sub?.id) {
            const { data: alreadyEscalated } = await supabase
              .from("drip_emails")
              .select("id")
              .eq("subscriber_id", p2Sub.id)
              .eq("email_key", escalationKey)
              .maybeSingle();
            if (alreadyEscalated) continue;
          }

          const daysSinceUpdate = Math.round(caseAge / (1000 * 60 * 60 * 24));
          await sendEmail({
            to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
            subject: `URGENT: IB Phase 2 pending ${daysSinceUpdate}+ days — ${escapeHtml(ibCase.email)}`,
            html: `<h1 style="color: #EF4444;">Intelligence Brief Waiting for Phase 2</h1>
              <p>Customer received their Case Decoder <strong>${daysSinceUpdate} days ago</strong> but has not submitted their Intelligence Brief details.</p>
              <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
                <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(ibCase.email)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${ibCase.id}</p>
              </div>
              <p><strong>Action:</strong> Reach out directly or consider whether to initiate a partial refund for the IB portion.</p>`,
          }, { category: "operator-alert", case_id: ibCase.id, metadata: { reason: "phase2-escalation", days: daysSinceUpdate } });

          if (p2Sub?.id) {
            await supabase.from("drip_emails").insert({
              subscriber_id: p2Sub.id,
              email_key: escalationKey,
            });
          }
        } else {
          // 48-hour customer reminder
          const reminderKey = `phase2_reminder_${ibCase.id}`;
          if (p2Sub?.id) {
            const { data: alreadySent } = await supabase
              .from("drip_emails")
              .select("id")
              .eq("subscriber_id", p2Sub.id)
              .eq("email_key", reminderKey)
              .maybeSingle();
            if (alreadySent) continue;
          }

          const phase2Token = signPhase2Token(ibCase.id);
          const result = await sendEmailWithRetry({
            to: ibCase.email,
            subject: "Reminder: Complete your Intelligence Brief details",
            unsubscribeEmail: ibCase.email,
            threadingHeaders: {
              inReplyTo: caseThreadId(ibCase.id),
              references: caseThreadId(ibCase.id),
            },
            html: `
              <h1 style="color: #F59E0B;">Your Intelligence Brief is Waiting on You</h1>
              <p>Your Case Decoder report was delivered — now we need a few more details to build your full Intelligence Brief.</p>
              <p>This short form takes about 5 minutes and helps us tailor the analysis to your specific situation:</p>
              <a href="${p2Origin}/intake/intelligence-brief?case=${ibCase.id}&token=${phase2Token}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Intelligence Brief Details</a>
              <p style="color: #A1A1AA;">Once you submit, your Intelligence Brief will be generated within 72 hours.</p>
            `,
          }, { category: "phase2-reminder", case_id: ibCase.id, metadata: { tier: "intelligence-brief" } });

          if (result.success && p2Sub?.id) {
            await supabase.from("drip_emails").insert({
              subscriber_id: p2Sub.id,
              email_key: reminderKey,
            });
            sent++;
          }
        }
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
            <p style="color: #A1A1AA;">${awCase.tier === "intelligence-brief" ? "Your Case Decoder will be delivered within 48 hours. After that, we&#39;ll send a short follow-up form for your full Intelligence Brief." : "Once you submit, your report will be generated within 48 hours."}</p>
          `,
        }, { category: "intake-reminder", case_id: awCase.id, metadata: { tier: awCase.tier } });

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
        }, { category: "operator-alert", case_id: escCase.id, metadata: { reason: "intake-escalation", days: daysSincePaid } });

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
          }, { category: "operator-alert", metadata: { reason: "webhook-recovery", stripe_session: session.id } });
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
          // Use .limit(1) instead of .maybeSingle() — multi-case orders
          // (IB+) create multiple cases per order, and .maybeSingle()
          // throws when more than one row matches.
          const { data: linkedCases } = await supabase
            .from("cases")
            .select("id")
            .eq("order_id", order.id)
            .limit(1);

          if (!linkedCases || linkedCases.length === 0) {
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
            }, { category: "operator-alert", case_id: caseId, order_id: order.id, metadata: { reason: "orphan-order" } });
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
        }, { category: "report-expiry-warning", case_id: expCase.id, metadata: { tier: expCase.tier } });

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
            <p>For ${TIER_CORE["case-decoder"].priceDisplay}, you get a plain-English charge breakdown, 15 calibrated questions for your attorney, ready-to-send email templates, and a 7-day action plan.</p>
            <a href="${checkoutOrigin}/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Continue to Checkout</a>
            <p style="color: #A1A1AA;">Questions? Reply to this email — a real person reads every message.</p>
          `,
        }, { category: "abandoned-checkout", metadata: { subscriber_id: abSub.id } });

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

    // PART 12: MISSED EVALUATION SAFETY NET
    // ============================================================
    // The evaluate-report Edge Function is triggered fire-and-forget
    // after report generation. If that trigger was dropped (network
    // error, edge function crash), the case will have status="review"
    // but eval_results=NULL. Re-trigger evaluation for these cases.
    // Limit: 5 per cron run to avoid overwhelming the eval function.
    // ============================================================
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: missingEvals } = await supabase
      .from("cases")
      .select("id")
      .eq("status", "review")
      .is("eval_results", null)
      .lt("generated_at", fifteenMinAgo)
      .limit(5);

    if (missingEvals && missingEvals.length > 0) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      for (const c of missingEvals) {
        try {
          fetch(`${siteUrl}/api/evaluate/case-decoder`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ caseId: c.id }),
          }).catch((err) =>
            console.error(`[Drip Cron] Eval re-trigger failed for ${c.id}:`, err)
          );
        } catch {
          // Silently continue — next cron run will retry
        }
      }
      console.log(`[Drip Cron] Part 12: Re-triggered evaluation for ${missingEvals.length} cases`);
    }

    // ============================================================
    // PART 13: DRIP EMAIL SEND LOG CLEANUP (Privacy Policy §6)
    // ============================================================
    // Purge drip_emails entries older than 90 days. These are dedup records
    // (subscriber_id, email_key) with no sensitive content. Privacy Policy
    // promises 90-day purge; this implements it.
    const dripCutoff = new Date();
    dripCutoff.setDate(dripCutoff.getDate() - 90);

    const { count: dripPurged } = await supabase
      .from("drip_emails")
      .delete({ count: "exact" })
      .lt("created_at", dripCutoff.toISOString());

    if (dripPurged && dripPurged > 0) {
      console.log(`[Drip Cron] Part 13: Purged ${dripPurged} old drip_emails records`);
      cleaned += dripPurged;
    }

    // ============================================================
    // PART 14: DISCOVERY DOCUMENT AUTO-DELETION (Privacy Policy §4)
    // ============================================================
    // Privacy Policy promises discovery documents are deleted within 90 days
    // after report delivery. Query delivered cases with file_urls that are
    // older than 90 days, delete from Supabase Storage, then clear file_urls.
    const { data: expiredDiscovery } = await supabase
      .from("cases")
      .select("id, file_urls")
      .eq("status", "delivered")
      .lt("delivered_at", ninetyDaysAgo.toISOString())
      .not("file_urls", "eq", "{}");

    if (expiredDiscovery && expiredDiscovery.length > 0) {
      for (const c of expiredDiscovery) {
        if (!c.file_urls || c.file_urls.length === 0) continue;

        // Delete files from storage bucket
        const { error: removeError } = await supabase.storage
          .from("discovery-files")
          .remove(c.file_urls);

        if (removeError) {
          console.error(`[Drip Cron] Part 14: Failed to delete files for case ${c.id}:`, removeError);
          errors++;
          continue;
        }

        // Clear file_urls on the case record
        await supabase
          .from("cases")
          .update({ file_urls: [] })
          .eq("id", c.id);

        cleaned += c.file_urls.length;
        console.log(`[Drip Cron] Part 14: Deleted ${c.file_urls.length} discovery files for case ${c.id}`);
      }
    }

    // ============================================================
    // PART 15: STUCK JOB DETECTION (processing_jobs > 30 min)
    // ============================================================
    // Processing jobs should complete within their timeout window.
    // If a job has been in 'processing' status for >30 minutes, it
    // likely crashed or the worker died. Mark as 'failed' and create
    // an operator task so it can be manually retried or investigated.
    const thirtyMinutesAgo = new Date();
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

    const { data: stuckJobs } = await supabase
      .from("processing_jobs")
      .select("id, case_id, job_type, job_subtype, started_at, worker_id")
      .eq("status", "processing")
      .lt("started_at", thirtyMinutesAgo.toISOString());

    if (stuckJobs && stuckJobs.length > 0) {
      for (const job of stuckJobs) {
        const minutesStuck = Math.round(
          (Date.now() - new Date(job.started_at!).getTime()) / (1000 * 60)
        );

        // Mark job as failed
        await supabase
          .from("processing_jobs")
          .update({
            status: "failed",
            error_message: `Auto-detected: stuck in processing for ${minutesStuck} minutes`,
          })
          .eq("id", job.id);

        // Create operator task
        await supabase.from("operator_tasks").insert({
          case_id: job.case_id,
          task_type: "stuck_job",
          title: `Stuck job: ${job.job_type}${job.job_subtype ? ` (${job.job_subtype})` : ""} — ${minutesStuck}min`,
          description: `Processing job ${job.id} has been stuck for ${minutesStuck} minutes. Worker: ${job.worker_id || "unknown"}. Automatically marked as failed.`,
          priority: "HIGH",
          priority_rank: 2,
        });

        errors++;
      }
      console.log(`[Drip Cron] Part 15: Marked ${stuckJobs.length} stuck jobs as failed`);
    }

    // ============================================================
    // PART 16: PIPELINE COMPLETION CHECK (all jobs done -> review)
    // ============================================================
    // For discovery tier cases in 'processing' status, check if all
    // processing jobs have completed (or failed). If so, transition
    // the case to 'review' status and notify the operator.
    // This catches cases where the final job completed but the
    // status transition callback was silently dropped.
    const discoveryTiers = ["x-ray", "war-room", "situation-room"];
    const { data: processingCases } = await supabase
      .from("cases")
      .select("id, email, tier, charge_type, document_count, finding_count, witness_count, discovery_health_score, defense_opportunity_index")
      .eq("status", "processing")
      .in("tier", discoveryTiers);

    if (processingCases && processingCases.length > 0) {
      for (const pc of processingCases) {
        const { data: allJobs } = await supabase
          .from("processing_jobs")
          .select("id, status")
          .eq("case_id", pc.id);

        if (!allJobs || allJobs.length === 0) continue;

        const totalJobs = allJobs.length;
        const completedJobs = allJobs.filter((j) => j.status === "completed").length;
        const failedJobs = allJobs.filter((j) => j.status === "failed").length;
        const doneJobs = completedJobs + failedJobs;

        if (doneJobs >= totalJobs) {
          // All jobs are done — transition to review
          await supabase
            .from("cases")
            .update({ status: "review", updated_at: new Date().toISOString() })
            .eq("id", pc.id)
            .eq("status", "processing"); // Atomic guard

          const tierLabel = tierDisplayName(pc.tier);
          const doiScore = pc.defense_opportunity_index &&
            typeof pc.defense_opportunity_index === "object" &&
            "overall" in pc.defense_opportunity_index
              ? (pc.defense_opportunity_index as Record<string, number>).overall
              : null;
          const healthScore = typeof pc.discovery_health_score === "number" ? pc.discovery_health_score : null;

          // Priority assessment
          let priorityLine = "";
          if (healthScore !== null && healthScore < 40) {
            priorityLine = `<p style="color: #EF4444; margin: 16px 0 0;"><strong>Low discovery health — potential gaps. Prioritize review.</strong></p>`;
          } else if (doiScore !== null && doiScore > 70) {
            priorityLine = `<p style="color: #F59E0B; margin: 16px 0 0;"><strong>High defense opportunity — strong defense angles identified.</strong></p>`;
          } else if (healthScore === null && doiScore === null) {
            priorityLine = `<p style="color: #A1A1AA; margin: 16px 0 0;">Scores not yet calculated.</p>`;
          }

          await sendEmail({
            to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
            subject: `${tierLabel} ready for review — ${pc.finding_count || 0} findings, ${completedJobs}/${totalJobs} jobs${failedJobs > 0 ? ` (${failedJobs} failed)` : ""}`,
            html: `<h1 style="color: #22C55E;">Pipeline Complete — Ready for Review</h1>
              <p>All processing jobs for this ${escapeHtml(tierLabel)} case have finished.</p>
              <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #22C55E;">
                <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(pc.email)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tierLabel)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(pc.charge_type || "Unknown")}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Jobs:</strong> ${completedJobs} completed, ${failedJobs} failed, ${totalJobs} total</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${pc.id}</p>
              </div>
              <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
                <p style="margin: 0; color: #D4D4D8; font-weight: bold; color: white;">Pipeline Results</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Documents Analyzed:</strong> ${pc.document_count || 0}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Findings Identified:</strong> ${pc.finding_count || 0}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Witnesses Identified:</strong> ${pc.witness_count || 0}</p>
                ${healthScore !== null ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Discovery Strength Rating:</strong> ${healthScore}/100</p>` : ""}
                ${doiScore !== null ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Prosecution Case Weakness Analysis:</strong> ${doiScore}</p>` : ""}
              </div>
              ${priorityLine}
              ${failedJobs > 0 ? `<p style="color: #F59E0B;"><strong>Warning:</strong> ${failedJobs} job(s) failed. Review failed jobs before delivering the report.</p>` : ""}
              <p><strong>Action:</strong> Review the case and approve delivery when ready.</p>`,
          }, { category: "operator-alert", case_id: pc.id, metadata: { reason: "pipeline-complete", completed: completedJobs, failed: failedJobs, total: totalJobs } });

          console.log(`[Drip Cron] Part 16: Case ${pc.id} transitioned to review (${completedJobs}/${totalJobs} jobs, ${failedJobs} failed)`);
        }
      }
    }

    // ============================================================
    // PART 17: SLA BREACH DETECTION (delivery_due_at passed)
    // ============================================================
    // Discovery tier cases have a delivery_due_at deadline. If that
    // deadline has passed and the case isn't delivered or refunded,
    // create an operator task (with dedup) and email the operator.
    const { data: slaCases } = await supabase
      .from("cases")
      .select("id, email, tier, delivery_due_at")
      .lt("delivery_due_at", new Date().toISOString())
      .not("status", "in", '("delivered","refunded")');

    if (slaCases && slaCases.length > 0) {
      for (const slaCase of slaCases) {
        // Dedup: check if an open sla_breach task already exists for this case
        const { data: existingTask } = await supabase
          .from("operator_tasks")
          .select("id")
          .eq("case_id", slaCase.id)
          .eq("task_type", "sla_breach")
          .in("status", ["open", "in_progress"])
          .maybeSingle();

        if (existingTask) continue;

        const hoursOverdue = Math.round(
          (Date.now() - new Date(slaCase.delivery_due_at!).getTime()) / (1000 * 60 * 60)
        );
        const tierLabel = tierDisplayName(slaCase.tier);

        await supabase.from("operator_tasks").insert({
          case_id: slaCase.id,
          task_type: "sla_breach",
          title: `SLA BREACH: ${tierLabel} overdue by ${hoursOverdue}h — ${slaCase.email}`,
          description: `Delivery was due ${new Date(slaCase.delivery_due_at!).toISOString()} (${hoursOverdue} hours ago). Customer: ${slaCase.email}`,
          priority: "URGENT",
          priority_rank: 1,
          sla_breach: true,
          due_at: new Date().toISOString(),
        });

        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `SLA BREACH: ${tierLabel} overdue by ${hoursOverdue} hours — ${escapeHtml(slaCase.email)}`,
          html: `<h1 style="color: #EF4444;">SLA Breach — Delivery Overdue</h1>
            <p>This case has exceeded its delivery deadline by <strong style="color: #EF4444;">${hoursOverdue} hours</strong>.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(slaCase.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tierLabel)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Due:</strong> ${new Date(slaCase.delivery_due_at!).toISOString()}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Overdue:</strong> ${hoursOverdue} hours</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${slaCase.id}</p>
            </div>
            <p><strong>Action:</strong> Prioritize this case immediately. Contact the customer if delivery will be further delayed.</p>`,
        }, { category: "operator-alert", case_id: slaCase.id, metadata: { reason: "sla-breach", hours_overdue: hoursOverdue } });

        errors++;
      }
      console.log(`[Drip Cron] Part 17: Detected ${slaCases.length} SLA breach(es)`);
    }

    // ============================================================
    // PART 18: WEEKLY PROGRESS EMAIL (War Room + Situation Room)
    // ============================================================
    // War Room ($4,997) and Situation Room ($9,997) customers get
    // weekly progress emails while their case is being processed.
    // Includes aggregate stats and a link to the portal.
    // Dedup: drip_emails with key "weekly-progress-{caseId}-{weekNumber}"
    // CAN-SPAM: includes unsubscribeEmail for one-click unsubscribe.
    const weeklyTiers = ["war-room", "situation-room"];
    const weeklyStatuses = ["submitted", "processing", "review"];
    const { data: weeklyCases } = await supabase
      .from("cases")
      .select("id, email, tier, report_token, document_count, finding_count, witness_count, discovery_health_score")
      .in("tier", weeklyTiers)
      .in("status", weeklyStatuses);

    if (weeklyCases && weeklyCases.length > 0) {
      // Compute week number (ISO 8601) for dedup key
      function getISOWeek(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      }
      const now = new Date();
      const weekNumber = getISOWeek(now);

      for (const wCase of weeklyCases) {
        const emailKey = `weekly-progress-${wCase.id}-w${weekNumber}`;

        // Need subscriber for dedup
        const { data: wSub } = await supabase
          .from("subscribers")
          .select("id")
          .eq("email", wCase.email.toLowerCase())
          .maybeSingle();

        if (wSub?.id) {
          const { data: alreadySent } = await supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", wSub.id)
            .eq("email_key", emailKey)
            .maybeSingle();

          if (alreadySent) continue;
        }

        // Check unsubscribe status
        const { data: unsubCheck } = await supabase
          .from("subscribers")
          .select("unsubscribed_at")
          .eq("email", wCase.email.toLowerCase())
          .maybeSingle();

        if (unsubCheck?.unsubscribed_at) {
          skipped++;
          continue;
        }

        const tierLabel = tierDisplayName(wCase.tier);
        const portalUrl = wCase.report_token
          ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com"}/my-case/${wCase.report_token}`
          : null;

        const result = await sendEmailWithRetry({
          to: wCase.email,
          subject: `Weekly Update: Your ${tierLabel} Analysis`,
          unsubscribeEmail: wCase.email,
          html: `
            <h1 style="color: #F59E0B;">Your Weekly Case Update</h1>
            <p>Here's a summary of progress on your ${escapeHtml(tierLabel)} analysis this week:</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Documents Analyzed:</strong> ${wCase.document_count}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Findings Identified:</strong> ${wCase.finding_count}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Witnesses Identified:</strong> ${wCase.witness_count}</p>
              ${wCase.discovery_health_score !== null ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Discovery Strength Rating:</strong> ${wCase.discovery_health_score}/100</p>` : ""}
            </div>
            ${portalUrl ? `<a href="${portalUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Full Progress</a>` : ""}
            <p style="color: #A1A1AA; font-size: 13px;">Our team is actively working on your case. You'll receive another update next week.</p>
          `,
          threadingHeaders: {
            references: caseThreadId(wCase.id),
          },
        }, { category: "weekly-progress", case_id: wCase.id, metadata: { tier: wCase.tier, week: weekNumber } });

        if (result.success) {
          if (wSub?.id) {
            await supabase.from("drip_emails").insert({
              subscriber_id: wSub.id,
              email_key: emailKey,
            });
          } else {
            // Create subscriber for tracking
            const { data: newSub } = await supabase
              .from("subscribers")
              .upsert(
                { email: wCase.email.toLowerCase(), source: `purchase-${wCase.tier}` },
                { onConflict: "email" }
              )
              .select("id")
              .single();

            if (newSub?.id) {
              await supabase.from("drip_emails").insert({
                subscriber_id: newSub.id,
                email_key: emailKey,
              });
            }
          }
          sent++;
        } else {
          errors++;
        }
      }
      console.log(`[Drip Cron] Part 18: Processed ${weeklyCases.length} weekly progress emails`);
    }

    // ============================================================
    // PART 19: ENGINE HEARTBEAT (stale queued jobs -> operator alert)
    // ============================================================
    // If jobs have been sitting in 'queued' status for >1 hour,
    // the engine may be down. Create an operator task (dedup: one
    // per day) and email the operator.
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data: staleQueued } = await supabase
      .from("processing_jobs")
      .select("id, case_id, job_type, created_at")
      .eq("status", "queued")
      .lt("created_at", oneHourAgo.toISOString())
      .order("created_at", { ascending: true })
      .limit(50);

    if (staleQueued && staleQueued.length > 0) {
      // Dedup: check if we already created an engine_down task today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: existingEngineTask } = await supabase
        .from("operator_tasks")
        .select("id")
        .eq("task_type", "engine_down")
        .gte("created_at", todayStart.toISOString())
        .maybeSingle();

      if (!existingEngineTask) {
        // Use case_id from the first stale job (FK is NOT NULL)
        const firstJob = staleQueued[0];
        const oldestMinutes = Math.round(
          (Date.now() - new Date(firstJob.created_at).getTime()) / (1000 * 60)
        );

        await supabase.from("operator_tasks").insert({
          case_id: firstJob.case_id,
          task_type: "engine_down",
          title: `ENGINE DOWN: ${staleQueued.length} jobs queued for ${oldestMinutes}+ minutes`,
          description: `${staleQueued.length} processing jobs have been queued for over an hour. Oldest: ${firstJob.job_type} (${firstJob.id}). The engine worker may be stopped or crashed.`,
          priority: "URGENT",
          priority_rank: 1,
        });

        await sendEmail({
          to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
          subject: `ENGINE DOWN: ${staleQueued.length} queued jobs waiting ${oldestMinutes}+ minutes`,
          html: `<h1 style="color: #EF4444;">Engine May Be Down</h1>
            <p><strong style="color: #EF4444;">${staleQueued.length} processing jobs</strong> have been queued for over an hour without being picked up.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Stale Jobs:</strong> ${staleQueued.length}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Oldest Job:</strong> ${firstJob.job_type} — queued ${oldestMinutes} minutes ago</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Job ID:</strong> ${firstJob.id}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${firstJob.case_id}</p>
            </div>
            <p><strong>Action:</strong> Check the engine worker process. If it crashed, restart it.</p>`,
        }, { category: "operator-alert", case_id: firstJob.case_id, metadata: { reason: "engine-down", stale_count: staleQueued.length, oldest_minutes: oldestMinutes } });

        errors++;
      }
      console.log(`[Drip Cron] Part 19: ${staleQueued.length} stale queued jobs detected`);
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
