/**
 * /r/[code]/quiz — Referral quiz (SMIQ → micro-commitments → recommendation).
 *
 * Server component wrapping the client-side quiz. Looks up partner for context.
 */

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
    .select("name, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    redirect("/");
  }

  return (
    <ReferralQuiz
      promoCode={partner.promo_code!}
      partnerName={partner.name}
    />
  );
}
