/**
 * GET /api/partner/dashboard, Partner dashboard data.
 *
 * Returns partner profile, recent referrals, and payout history.
 * Auth: session cookie validated via validatePartnerSession().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth, paginatedQuery, batchedInQuery } from "@/lib/partner-helpers";
import { sumProtectedExposureCents } from "@/lib/bond-exposure";

interface CourtClient {
  id: string;
  first_name: string;
  charge_type: string | null;
  county_state: string | null;
  court_date: string | null;
  status: string;
  reminders_sent: number;
  created_at: string;
  converted_at: string | null;
  check_in_days: number[];
  check_in_source: string | null;
}

interface CheckIn {
  court_reminder_id: string;
  checked_in_at: string;
}

export async function GET(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Fetch recent referrals (no PII, just tier, date, commission)
    const { data: referrals } = await supabase
      .from("referrals")
      .select("id, tier, sale_amount, commission_amount, commission_paid, created_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch payout history
    const { data: payouts } = await supabase
      .from("partner_payouts")
      .select("id, amount, payment_method, created_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch analytics + funnel in parallel (independent queries)
    const [{ data: analytics }, { data: funnel }] = await Promise.all([
      supabase.rpc("partner_analytics", { p_partner_id: partner.id }),
      supabase.rpc("partner_conversion_funnel", { p_partner_id: partner.id }),
    ]);

    // Court prep sign-ups attributed to this partner
    const { count: reminderSignups } = await supabase
      .from("court_reminders")
      .select("*", { count: "exact", head: true })
      .eq("partner_promo_code", partner.promo_code);

    // Court prep clients, full list for client tracker (paginated, no silent cap)
    const { data: courtClients } = await paginatedQuery<CourtClient>(supabase, {
      table: "court_reminders",
      select: "id, first_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at, check_in_days, check_in_source",
      filters: [{ column: "partner_promo_code", op: "eq", value: partner.promo_code }],
      order: { column: "court_date", ascending: true },
    });

    // Check-in summaries per client (batched, URL-length safe)
    const reminderIds = courtClients.map((c) => c.id);
    const checkInSummary: Record<string, { count: number; lastCheckIn: string | null }> = {};
    if (reminderIds.length > 0) {
      const { data: checkIns } = await batchedInQuery<CheckIn>(supabase, {
        table: "client_check_ins",
        select: "court_reminder_id, checked_in_at",
        inColumn: "court_reminder_id",
        ids: reminderIds,
      });
      for (const ci of checkIns) {
        const existing = checkInSummary[ci.court_reminder_id];
        if (!existing) {
          checkInSummary[ci.court_reminder_id] = { count: 1, lastCheckIn: ci.checked_in_at };
        } else {
          existing.count++;
          if (ci.checked_in_at > existing.lastCheckIn!) {
            existing.lastCheckIn = ci.checked_in_at;
          }
        }
      }
    }

    // Use the maintained partner totals (accurate even with >50 referrals)
    const totalEarned = partner.total_commission || 0;
    const totalPaid = partner.total_paid_out || 0;

    // ForfeitureSavedHero data (bondsman-mode surface). Exposure is estimated
    // from charge_type because court_reminders.bond_amount_cents doesn't exist
    // today; the component flags this as `(estimated)` to the user.
    const protectedExposureCents = sumProtectedExposureCents(
      courtClients.map((c) => ({ charge_type: c.charge_type, status: c.status })),
    );
    const clientsActive = courtClients.filter((c) => c.status === "active").length;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short" });

    const { count: remindersSentThisMonth } = await supabase
      .from("sms_log")
      .select("*", { count: "exact", head: true })
      .eq("partner_id", partner.id)
      .eq("category", "court_reminder")
      .eq("success", true)
      .gte("created_at", monthStart.toISOString());

    // RemindersOnYourBehalf feed, last 7 days of sms_log for this partner.
    // Two-step to keep privacy tight: fetch log rows, then batch-fetch only
    // the court_reminders we need for first_name + last initial. Mapping
    // by id from court_reminders because sms_log.court_reminder_id is the
    // canonical join.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSms } = await supabase
      .from("sms_log")
      .select("id, created_at, category, court_reminder_id")
      .eq("partner_id", partner.id)
      .eq("category", "court_reminder")
      .eq("success", true)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    interface ReminderFeedItem {
      sentAt: string;
      clientLabel: string;
      action: string;
    }

    const reminderFeedItems: ReminderFeedItem[] = [];
    const crIds = (recentSms ?? [])
      .map((s) => s.court_reminder_id as string | null)
      .filter((id): id is string => !!id);
    const crNameById = new Map<string, { first: string | null; last: string | null }>();
    if (crIds.length > 0) {
      const { data: crRows } = await batchedInQuery<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>(supabase, {
        table: "court_reminders",
        select: "id, first_name, last_name",
        inColumn: "id",
        ids: crIds,
      });
      for (const row of crRows) {
        crNameById.set(row.id, { first: row.first_name, last: row.last_name });
      }
    }
    for (const s of recentSms ?? []) {
      const names = s.court_reminder_id ? crNameById.get(s.court_reminder_id) : null;
      const first = names?.first?.trim() || "A client";
      const lastInitial = names?.last?.trim()?.[0];
      const clientLabel = lastInitial ? `${first} ${lastInitial}.` : first;
      reminderFeedItems.push({
        sentAt: s.created_at,
        clientLabel,
        action: "Court-date reminder delivered",
      });
    }

    return NextResponse.json({
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        company: partner.company,
        promo_code: partner.promo_code,
        commission_rate: partner.commission_rate,
        commission_tier: partner.commission_tier,
        preferred_payment_method: partner.preferred_payment_method,
        payment_zelle: partner.payment_zelle,
        payment_venmo: partner.payment_venmo,
        payment_check_address: partner.payment_check_address,
        payment_paypal: partner.payment_paypal,
        source: partner.source,
        city: partner.city,
        check_in_enabled: Boolean(partner.check_in_enabled),
        flip_at: partner.flip_at ?? null,
      },
      earnings: {
        total_earned: totalEarned,
        total_paid: totalPaid,
        pending_payout: totalEarned - totalPaid,
        total_referrals: partner.total_referrals || 0,
      },
      reminderSignups: reminderSignups ?? 0,
      protectedExposureCents,
      clientsActive,
      remindersSentThisMonth: remindersSentThisMonth ?? 0,
      monthLabel,
      reminderFeedItems,
      courtClients,
      checkInSummary,
      referrals: referrals || [],
      payouts: payouts || [],
      analytics: analytics || { monthly: [], by_tier: [], total_referrals: 0 },
      funnel: funnel || {
        last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
        all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
      },
    });
  } catch (err) {
    console.error("[partner/dashboard] Failed to fetch partner data:", err);
    return NextResponse.json({ error: "Failed to fetch partner data" }, { status: 500 });
  }
}
