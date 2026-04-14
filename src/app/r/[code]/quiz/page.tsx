/**
 * /r/[code]/quiz -- Referral quiz (SMIQ -> micro-commitments -> recommendation).
 *
 * Server component wrapping the client-side quiz. Looks up partner for context.
 */

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ReferralQuiz } from "@/components/ReferralQuiz";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralQuizPage({ params }: PageProps) {
  const { code } = await params;

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    redirect("/");
  }

  // Fire-and-forget quiz_start event -- deduplicated within 60s window per partner
  after(async () => {
    try {
      const sb = createAdminClient();
      // Skip if a quiz_start already fired for this partner in the last 60s (back button, refresh)
      const { count } = await sb
        .from("partner_events")
        .select("*", { count: "exact", head: true })
        .eq("partner_id", partner.id)
        .eq("event_type", "quiz_start")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if ((count ?? 0) > 0) return;
      await sb.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "quiz_start",
        metadata: {},
      });
    } catch (e) {
      console.warn("[PartnerEvents] quiz_start insert failed:", e);
    }
  });

  return (
    <ReferralQuiz
      promoCode={partner.promo_code!}
      partnerName={partner.name}
    />
  );
}
