/**
 * GET /api/partner/compliance-report, Compliance report data.
 *
 * Returns partner profile, all court_reminders for the partner's promo code,
 * and client_check_ins for those reminders.
 *
 * Uses paginatedQuery (PostgREST 1000-row cap) and batchedInQuery
 * (URL length limit on .in() with large ID arrays).
 *
 * No last_name in select, bondsmen should not see client PII beyond first name.
 *
 * Auth: session cookie validated via requirePartnerAuth().
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requirePartnerAuth,
  paginatedQuery,
  batchedInQuery,
} from "@/lib/partner-helpers";

interface ComplianceClient {
  id: string;
  first_name: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  status: string;
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  check_in_days: string[] | null;
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
    const { data: clients, errors: clientErrors } =
      await paginatedQuery<ComplianceClient>(supabase, {
        table: "court_reminders",
        select:
          "id, first_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at, check_in_days, check_in_source",
        filters: [
          { column: "partner_promo_code", op: "eq", value: partner.promo_code },
        ],
        order: { column: "court_date", ascending: true },
      });

    if (clientErrors.length > 0) {
      console.error("[partner/compliance-report] Client query errors:", clientErrors);
    }

    // Batched .in(), chunks of 200 IDs to stay within URL length limits
    const clientIds = clients.map((c) => c.id).filter(Boolean);
    let checkIns: CheckIn[] = [];
    if (clientIds.length > 0) {
      const { data, errors: checkInErrors } =
        await batchedInQuery<CheckIn>(supabase, {
          table: "client_check_ins",
          select: "court_reminder_id, checked_in_at",
          inColumn: "court_reminder_id",
          ids: clientIds,
        });
      checkIns = data;
      if (checkInErrors.length > 0) {
        console.error("[partner/compliance-report] Check-in query errors:", checkInErrors);
      }
    }

    // Task 27 (bondsman modes v2): surface mode so the client can gate every
    // check-in-specific UI element. Boolean() guards against SELECT drift that
    // leaves `check_in_enabled` undefined (same guard pattern as /api/partner/dashboard).
    const checkInMode: "enabled" | "disabled" = Boolean(partner.check_in_enabled)
      ? "enabled"
      : "disabled";

    return NextResponse.json({
      partner: {
        name: partner.name,
        company: partner.company,
        promo_code: partner.promo_code,
      },
      checkInMode,
      clients,
      checkIns,
    });
  } catch (err) {
    console.error("[partner/compliance-report] Failed to fetch data:", err);
    return NextResponse.json(
      { error: "Failed to fetch compliance data" },
      { status: 500 }
    );
  }
}
