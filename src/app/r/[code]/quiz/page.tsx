/**
 * /r/[code]/quiz -- Referral quiz (SMIQ -> micro-commitments -> recommendation).
 *
 * Server component wrapping the client-side quiz. Looks up partner for context.
 */

import type { Metadata } from "next";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ReferralQuiz } from "@/components/ReferralQuiz";
import { getPartnerByCode } from "@/lib/partner-by-code";
import { truncateName } from "@/lib/truncate-name";
import { BRAND_UPL_DISCLAIMER } from "@/lib/copy/disclaimers";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  const referrer = partner ? truncateName(partner.company || partner.name) : null;
  const title = referrer
    ? `Find the right prep for your case — from ${referrer}`
    : "Find the right prep for your case";
  const description = referrer
    ? `A short questionnaire from ${referrer}. We match you to the briefing that fits your charges and your next hearing. ${BRAND_UPL_DISCLAIMER}`
    : `A short questionnaire. We match you to the briefing that fits your charges and your next hearing. ${BRAND_UPL_DISCLAIMER}`;
  // Quiz route has no opengraph-image.tsx of its own; it inherits the parent
  // /r/[code]/opengraph-image.tsx (partner-branded). Alt is set there via
  // generateImageMetadata. Do NOT override openGraph.images here.

  return {
    title: `${title} | ImNotAnAttorney`,
    description,
    openGraph: { title, description, type: "website" as const },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function ReferralQuizPage({ params }: PageProps) {
  const { code } = await params;

  // Use the cached helper so generateMetadata + the page render share one
  // Supabase query per request (React.cache dedupe).
  const partner = await getPartnerByCode(code);

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
