/**
 * /r/[code] — Referral URL → bridge page.
 *
 * Server component: looks up partner by promo code, sets ref cookie,
 * renders bridge page with partner context. If partner not found or
 * not approved, shows a generic fallback.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import Link from "next/link";
import { BridgePage } from "@/components/BridgePage";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params;

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("name, company, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    // Generic fallback — partner not found, suspended, pending, or deleted
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">
            This referral link isn&apos;t active
          </h1>
          <p className="text-zinc-400 mb-8">
            The link you followed may have expired or is no longer available.
            You can still check out our services directly.
          </p>
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors"
          >
            Visit ImNotAnAttorney
          </Link>
        </div>
      </div>
    );
  }

  // Set referral cookie (30-day, NOT httpOnly — checkout page reads via JS)
  const cookieStore = await cookies();
  cookieStore.set("ref", partner.promo_code!, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      promoCode={partner.promo_code!}
    />
  );
}
