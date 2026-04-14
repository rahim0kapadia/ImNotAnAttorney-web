/**
 * @file Part 2 — Post-purchase emails (customers who bought)
 *
 * Sends tier-specific follow-up emails after purchase/delivery.
 * Skips refunded orders (status != "paid") and unsubscribed customers.
 * Supports three timing modes:
 *   - Relative to purchase (delayDays from paid_at)
 *   - Relative to delivery (delayDays from delivered_at)
 *   - Relative to submission (delayDays from case submission)
 *
 * N+1 FIX: Batch-fetches subscribers, drip_emails, and cases upfront
 * instead of per-order queries.
 */

import { sendEmailWithRetry } from "@/lib/email";
import { getPostPurchaseEmails, personalizeEmailHtml, isUpsellEmail } from "@/lib/drip-emails";
import type { DripEmail, DripPersonalizationData } from "@/lib/drip-emails";
import { PLAYBOOK_SLUGS, type TierSlug } from "@/lib/tiers";
import { caseThreadId } from "@/lib/site";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

export async function sendPostPurchaseEmails(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const ninetyDaysAgo = new Date(ctx.now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Only fetch orders with status "paid" — refunded orders are excluded.
  const { data: orders, error: orderError } = await ctx.supabase
    .from("orders")
    .select("id, email, tier, paid_at")
    .eq("status", "paid")
    .gte("paid_at", ninetyDaysAgo.toISOString())
    .order("paid_at", { ascending: true })
    .limit(200);

  if (orderError) {
    console.error("[Drip Cron] Orders query error:", orderError);
    result.errors++;
  }

  if (!orders || orders.length === 0) return result;

  // ── N+1 FIX: Batch-fetch all subscribers for order emails ──
  const orderEmails = [...new Set(orders.map((o) => o.email.toLowerCase()))];
  const { data: allSubscribers, error: subError } = await ctx.supabase
    .from("subscribers")
    .select("id, email, unsubscribed_at")
    .in("email", orderEmails);
  if (subError) {
    console.error("[Drip Cron] Subscribers query error:", subError);
    result.errors++;
    return result; // CAN-SPAM: cannot send without unsubscribe check
  }

  const subscriberByEmail = new Map<string, { id: string; unsubscribed_at: string | null }>();
  for (const sub of allSubscribers ?? []) {
    subscriberByEmail.set(sub.email.toLowerCase(), sub);
  }

  // ── N+1 FIX: Batch-fetch all drip_emails for those subscriber IDs ──
  const subscriberIds = (allSubscribers ?? []).map((s) => s.id);
  const { data: allDripEmails, error: dripError } = subscriberIds.length > 0
    ? await ctx.supabase
        .from("drip_emails")
        .select("subscriber_id, email_key")
        .in("subscriber_id", subscriberIds)
        .limit(10000)
    : { data: [] as { subscriber_id: string; email_key: string }[] };
  if (dripError) {
    console.error("[Drip Cron] Drip emails query error:", dripError);
    result.errors++;
    return result; // Cannot send without dedup check — risk of duplicate emails
  }

  const sentBySubscriber = new Map<string, Set<string>>();
  for (const row of allDripEmails ?? []) {
    if (!sentBySubscriber.has(row.subscriber_id)) {
      sentBySubscriber.set(row.subscriber_id, new Set());
    }
    sentBySubscriber.get(row.subscriber_id)!.add(row.email_key);
  }

  // ── N+1 FIX: Batch-fetch all cases for those emails ──
  const { data: allCases, error: casesError } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, intake_id, report_token, status, delivered_at, updated_at, file_urls, created_at")
    .in("email", orderEmails);

  // Group cases by email+tier for lookup (most recent first)
  const casesByEmailTier = new Map<string, NonNullable<typeof allCases>>();
  for (const c of allCases ?? []) {
    const key = `${c.email.toLowerCase()}:${c.tier}`;
    if (!casesByEmailTier.has(key)) {
      casesByEmailTier.set(key, []);
    }
    casesByEmailTier.get(key)!.push(c);
  }
  // Sort each group by created_at descending (most recent first)
  for (const [, cases] of casesByEmailTier) {
    cases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  if (casesError) console.error("[Drip Cron] Cases query error:", casesError);

  // ── N+1 FIX: Batch-fetch higher-tier orders for upsell skip ──
  const caseDecoderEmails = [...new Set(
    orders.filter((o) => o.tier === "case-decoder").map((o) => o.email.toLowerCase())
  )];
  const { data: higherTierOrders, error: htError } = caseDecoderEmails.length > 0
    ? await ctx.supabase
        .from("orders")
        .select("email")
        .in("email", caseDecoderEmails)
        .eq("status", "paid")
        .not("tier", "in", '("case-decoder","extra-witness","witness-pack")')
    : { data: [] as { email: string }[] };
  if (htError) console.error("[Drip Cron] Higher-tier orders query error:", htError);
  const emailsWithHigherTier = new Set(
    (higherTierOrders ?? []).map((o) => o.email.toLowerCase())
  );

  // ── N+1 FIX: Batch-fetch CD orders for playbook upsell suppression ──
  const playbookOrderEmails = [...new Set(
    orders.filter((o) => PLAYBOOK_SLUGS.has(o.tier as TierSlug)).map((o) => o.email.toLowerCase())
  )];
  const { data: cdOrdersForPlaybooks, error: cdError } = playbookOrderEmails.length > 0
    ? await ctx.supabase
        .from("orders")
        .select("email")
        .in("email", playbookOrderEmails)
        .eq("status", "paid")
        .eq("tier", "case-decoder")
    : { data: [] as { email: string }[] };
  if (cdError) console.error("[Drip Cron] CD orders query error:", cdError);
  const emailsWithCd = new Set(
    (cdOrdersForPlaybooks ?? []).map((o: { email: string }) => o.email.toLowerCase())
  );

  // ── N+1 FIX: Batch-fetch intakes for personalization ──
  const intakeIds = [...new Set(
    (allCases ?? []).filter((c) => c.intake_id).map((c) => c.intake_id!)
  )];
  const { data: allIntakes } = intakeIds.length > 0
    ? await ctx.supabase
        .from("intakes")
        .select("id, filled_out_by, case_stage, employment_industry, first_name")
        .in("id", intakeIds)
    : { data: [] as { id: string; filled_out_by: string | null; case_stage: string | null; employment_industry: string | null; first_name: string | null }[] };
  const intakeById = new Map(
    (allIntakes ?? []).map((i) => [i.id, i])
  );

  for (const order of orders) {
    try {
      const paidAt = new Date(order.paid_at);

      // ── SKIP SUPERSEDED PLAYBOOK ORDERS ──
      // If customer bought multiple playbooks, only send sequence for the most recent.
      if (PLAYBOOK_SLUGS.has(order.tier as TierSlug)) {
        const hasNewerPlaybook = orders.some((o) =>
          o.email.toLowerCase() === order.email.toLowerCase() &&
          PLAYBOOK_SLUGS.has(o.tier as TierSlug) &&
          new Date(o.paid_at).getTime() > paidAt.getTime()
        );
        if (hasNewerPlaybook) {
          result.skipped++;
          continue;
        }
      }
      const daysSincePurchase = Math.floor(
        (ctx.now.getTime() - paidAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const tierEmails = getPostPurchaseEmails(order.tier);
      if (tierEmails.length === 0) {
        result.skipped++;
        continue;
      }

      // ── SUBSCRIBER LOOKUP + CAN-SPAM CHECK (from batch) ──
      const subMatch = subscriberByEmail.get(order.email.toLowerCase()) ?? null;
      const subscriberId = subMatch?.id;

      if (subMatch?.unsubscribed_at) {
        result.skipped++;
        continue;
      }

      // ── DEDUP CHECK (from batch) ──
      const sentKeys = subscriberId
        ? sentBySubscriber.get(subscriberId) ?? new Set<string>()
        : new Set<string>();

      // ── SKIP UPSELL FOR INCLUDED DELIVERABLES (from batch) ──
      let skipUpsell = false;
      if (order.tier === "case-decoder") {
        if (emailsWithHigherTier.has(order.email.toLowerCase())) skipUpsell = true;
      }

      // ── FIND NEXT UNSENT POST-PURCHASE EMAIL ──
      let nextEmail: DripEmail | null = null;
      for (const email of tierEmails) {
        if (email.delayDays === 0) continue;
        if (email.relativeToMeeting) continue;
        if (skipUpsell && isUpsellEmail(email)) continue;
        // Skip ALL playbook drip emails if customer already has a Case Decoder —
        // activation pitches CD, check-in references questions CD supersedes, upsell is redundant.
        if (PLAYBOOK_SLUGS.has(order.tier as TierSlug) && emailsWithCd.has(order.email.toLowerCase())) continue;

        // ── RELATIVE-TO-SUBMISSION TIMING ──
        if (email.relativeToSubmission) {
          const caseKey = `${order.email.toLowerCase()}:${order.tier}`;
          const cases = casesByEmailTier.get(caseKey) ?? [];
          const submittedCase = cases.find((c) =>
            ["submitted", "processing", "review"].includes(c.status)
          );

          if (!submittedCase?.updated_at) continue;

          const submittedAt = new Date(submittedCase.updated_at);
          const daysSinceSubmission = Math.floor(
            (ctx.now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceSubmission >= email.delayDays && !sentKeys.has(email.key)) {
            if (daysSinceSubmission > email.delayDays + 7) continue;
            nextEmail = email;
            break;
          }
          continue;
        }

        // ── RELATIVE-TO-DELIVERY TIMING ──
        if (email.relativeToDelivery) {
          const caseKey = `${order.email.toLowerCase()}:${order.tier}`;
          const cases = casesByEmailTier.get(caseKey) ?? [];
          const deliveredCase = cases.find(
            (c) => c.status === "delivered" && c.delivered_at
          );

          if (!deliveredCase?.delivered_at) continue;

          const deliveredAt = new Date(deliveredCase.delivered_at);
          const daysSinceDelivery = Math.floor(
            (ctx.now.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceDelivery >= email.delayDays && !sentKeys.has(email.key)) {
            if (daysSinceDelivery > email.delayDays + 7) continue;
            nextEmail = email;
            break;
          }
          continue;
        }

        // ── RELATIVE-TO-PURCHASE TIMING (default) ──
        if (daysSincePurchase >= email.delayDays && !sentKeys.has(email.key)) {
          // Skip emails whose send window has passed — prevents stale activation
          // emails for existing customers when new email entries are added.
          if (daysSincePurchase > email.delayDays + 7) continue;
          nextEmail = email;
          break;
        }
      }

      if (!nextEmail) {
        result.skipped++;
        continue;
      }

      // ── LINKED CASE (for threading + placeholder resolution) ──
      const caseKey = `${order.email.toLowerCase()}:${order.tier}`;
      const linkedCases = casesByEmailTier.get(caseKey) ?? [];
      const linkedCase = linkedCases[0] ?? null;

      // ── INTAKE DATA (for email personalization, from batch) ──
      let intakeData: DripPersonalizationData | null = null;
      if (linkedCase?.intake_id) {
        intakeData = intakeById.get(linkedCase.intake_id) ?? null;
      }

      // ── GUARD: Intake reminders only send if intake hasn't been submitted ──
      if (nextEmail.key.endsWith("_intake_reminder") && linkedCase) {
        if (linkedCase.status !== "awaiting-intake") {
          result.skipped++;
          continue;
        }
      }

      // ── GUARD: Upload reminder only sends if customer hasn't uploaded yet ──
      if (nextEmail.key.endsWith("_upload_reminder") && linkedCase) {
        const uploadedStatuses = ["submitted", "processing", "review", "delivered", "refunded"];
        const hasUploads = (linkedCase.file_urls?.length || 0) > 0;
        const pastUpload = uploadedStatuses.includes(linkedCase.status);
        if (hasUploads || pastUpload) {
          result.skipped++;
          continue;
        }
      }

      // ── GUARD: IB Phase 2 reminder only sends if Phase 2 intake hasn't been submitted ──
      // Applies to standalone IB orders AND the bundled IB deliverable inside
      // X-Ray / War Room / Situation Room. All four share the same IB case
      // lookup — the bundled tiers create a sibling IB case with the same
      // customer email when the webhook fans out the included deliverables.
      const phase2ReminderKeys = new Set([
        "post_intelligence_brief_phase2_reminder",
        "post_xray_ib_phase2_reminder",
        "post_war_room_ib_phase2_reminder",
        "post_situation_room_ib_phase2_reminder",
      ]);
      if (phase2ReminderKeys.has(nextEmail.key)) {
        const ibCases = casesByEmailTier.get(
          `${order.email.toLowerCase()}:intelligence-brief`
        ) ?? [];
        const ibCase = ibCases[0] ?? null;

        // Skip if no IB case exists, or if Phase 2 intake already submitted.
        // "intake" = Phase 2 form pending submission
        // "awaiting-intake" = CD not delivered yet, Phase 2 form not surfaced
        // Any other status = customer has moved past Phase 2 (submitted, generating, review, delivered)
        if (!ibCase || (ibCase.status !== "intake" && ibCase.status !== "awaiting-intake")) {
          result.skipped++;
          continue;
        }
      }

      // ── GUARD: Status update emails only send after upload submission ──
      if (nextEmail.key.includes("status_update") && linkedCase) {
        const submittedStatuses = ["submitted", "generating", "review", "delivered"];
        if (!submittedStatuses.includes(linkedCase.status)) {
          result.skipped++;
          continue;
        }
      }

      // ── RESOLVE PLACEHOLDERS ──
      let emailHtml = nextEmail.html;
      if (
        emailHtml.includes("{{CASE_ID}}") ||
        emailHtml.includes("{{EMAIL}}") ||
        emailHtml.includes("{{REPORT_URL}}")
      ) {
        const reportOrigin = ctx.siteUrl;
        const reportUrl = linkedCase?.report_token
          ? `${reportOrigin}/report/${linkedCase.report_token}`
          : `${reportOrigin}/services`;
        emailHtml = emailHtml
          .split("{{CASE_ID}}").join(linkedCase?.id || "")
          .split("{{EMAIL}}").join(encodeURIComponent(order.email))
          .split("{{REPORT_URL}}").join(reportUrl);
      }

      // ── RESOLVE DOCUMENT COUNT (for active-wait emails) ──
      if (emailHtml.includes("{{DOCUMENT_COUNT}}") && linkedCase) {
        const docCount = linkedCase.file_urls?.length || 0;
        emailHtml = emailHtml.split("{{DOCUMENT_COUNT}}").join(String(docCount));
      }

      // ── PERSONALIZE ──
      if (intakeData) {
        emailHtml = personalizeEmailHtml(emailHtml, nextEmail.key, intakeData);
      }

      // ── SEND + RECORD ──
      const sendResult = await sendEmailWithRetry(
        {
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
        },
        {
          category: "drip-post-purchase",
          email_key: nextEmail.key,
          case_id: linkedCase?.id,
          metadata: { tier: order.tier },
        }
      );

      if (sendResult.success) {
        if (subscriberId) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: subscriberId,
            email_key: nextEmail.key,
          });
        } else {
          const { data: newSub } = await ctx.supabase
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
            await ctx.supabase.from("drip_emails").insert({
              subscriber_id: newSub.id,
              email_key: nextEmail.key,
            });
          }
        }
        result.sent++;
      } else {
        console.error(
          `[Drip Cron] Failed to send ${nextEmail.key} to ${order.email}:`,
          sendResult.error
        );
        result.errors++;
      }
    } catch (err) {
      console.error(
        `[Drip Cron] Error processing order ${order.id}:`,
        err
      );
      result.errors++;
    }
  }

  return result;
}
