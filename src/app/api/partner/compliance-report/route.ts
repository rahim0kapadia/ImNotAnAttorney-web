/**
 * GET /api/partner/compliance-report — Compliance report data.
 *
 * Returns partner profile, all court_reminders for the partner's promo code,
 * and client_check_ins for those reminders. Paginated check-ins to avoid
 * PostgREST 1000-row cap.
 *
 * Auth: session cookie validated via requirePartnerAuth().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";

export async function GET(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Fetch all clients — paginated to avoid PostgREST 1000-row cap.
    // No last_name: bondsmen should not see client PII beyond first name.
    const allClients: Array<Record<string, unknown>> = [];
    let clientOffset = 0;
    let clientHasMore = true;
    while (clientHasMore) {
      const { data: page } = await supabase
        .from("court_reminders")
        .select(
          "id, first_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at, check_in_days, check_in_source"
        )
        .eq("partner_promo_code", partner.promo_code)
        .order("court_date", { ascending: true })
        .range(clientOffset, clientOffset + 999);

      if (!page || page.length === 0) { clientHasMore = false; break; }
      allClients.push(...page);
      clientOffset += 1000;
      if (page.length < 1000) clientHasMore = false;
    }

    // Fetch check-ins — paginated to avoid PostgREST 1000-row cap
    const clientIds = allClients.map((c) => c.id as string);
    const allCheckIns: Array<{ court_reminder_id: string; checked_in_at: string }> = [];
    if (clientIds.length > 0) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: page } = await supabase
          .from("client_check_ins")
          .select("court_reminder_id, checked_in_at")
          .in("court_reminder_id", clientIds)
          .range(offset, offset + 999);

        if (!page || page.length === 0) { hasMore = false; break; }
        allCheckIns.push(...page);
        offset += 1000;
        if (page.length < 1000) hasMore = false;
      }
    }

    return NextResponse.json({
      partner: {
        name: partner.name,
        email: partner.email,
        company: partner.company,
        promo_code: partner.promo_code,
      },
      clients: allClients,
      checkIns: allCheckIns,
    });
  } catch (err) {
    console.error("[partner/compliance-report] Failed to fetch data:", err);
    return NextResponse.json({ error: "Failed to fetch compliance data" }, { status: 500 });
  }
}
