/**
 * /partner/compliance-report — Server-rendered, print-optimized compliance
 * report for surety audits.
 *
 * Auth: validates partner session cookie server-side, redirects to login if
 * invalid. Fetches all court_reminders + client_check_ins for the partner,
 * then hands data to the client component for date filtering + print.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validatePartnerSession,
  PARTNER_SESSION_COOKIE,
} from "@/lib/partner-auth";
import { ComplianceReportClient } from "./ComplianceReportClient";

export const metadata = {
  title: "Compliance Report — ImNotAnAttorney Partner",
};

export default async function ComplianceReportPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    redirect("/partner/login");
  }

  const partner = await validatePartnerSession(sessionToken);
  if (!partner) {
    redirect("/partner/login");
  }

  const supabase = createAdminClient();

  // Fetch all clients linked to this partner's promo code
  const { data: clients } = await supabase
    .from("court_reminders")
    .select(
      "id, first_name, last_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at, check_in_days, check_in_source"
    )
    .eq("partner_promo_code", partner.promo_code)
    .order("court_date", { ascending: true });

  // Fetch check-ins for those clients — paginated to avoid PostgREST 1000-row cap
  const clientIds = (clients || []).map((c) => c.id);
  const allCheckIns: Array<{ court_reminder_id: string; checked_in_at: string }> = [];
  if (clientIds.length > 0) {
    let checkInOffset = 0;
    let checkInHasMore = true;
    while (checkInHasMore) {
      const { data: page } = await supabase
        .from("client_check_ins")
        .select("court_reminder_id, checked_in_at")
        .in("court_reminder_id", clientIds)
        .range(checkInOffset, checkInOffset + 999);

      if (!page || page.length === 0) { checkInHasMore = false; break; }
      allCheckIns.push(...page);
      checkInOffset += 1000;
      if (page.length < 1000) checkInHasMore = false;
    }
  }

  return (
    <ComplianceReportClient
      partner={{
        name: partner.name,
        email: partner.email,
        company: partner.company,
        promo_code: partner.promo_code,
      }}
      clients={clients || []}
      checkIns={allCheckIns}
    />
  );
}
