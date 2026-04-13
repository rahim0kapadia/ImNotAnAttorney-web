/**
 * /r/[code] — Referral URL → bridge page.
 *
 * Server component: looks up partner by promo code, sets ref cookie,
 * renders bridge page with partner context. If partner not found or
 * not approved, shows a generic fallback.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import Link from "next/link";
import { BridgePage } from "@/components/BridgePage";
import { REFERRAL_COOKIE_MAX_AGE, sanitizeSubId } from "@/lib/referral";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Court Prep for Your Case | ImNotAnAttorney",
    description:
      "Understand your charges and get the right questions for your attorney. Legal information — not legal advice.",
    openGraph: {
      title: "Court Prep for Your Case",
      description:
        "Understand your charges. Get the right questions for your attorney.",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: "Court Prep for Your Case",
      description:
        "Understand your charges. Get the right questions for your attorney.",
    },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function ReferralPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { sub } = await searchParams;

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

  // Set referral cookie (90-day, NOT httpOnly — checkout page reads via JS)
  const cookieStore = await cookies();
  cookieStore.set("ref", partner.promo_code!, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
  });

  if (sub) {
    const cleanSub = sanitizeSubId(sub);
    if (cleanSub) {
      cookieStore.set("ref_sub", cleanSub, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE,
        path: "/",
      });
    }
  }

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      promoCode={partner.promo_code!}
    />
  );
}
