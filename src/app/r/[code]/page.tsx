/**
 * /r/[code] -- Referral URL -> bridge page.
 *
 * Server component: looks up partner by promo code, sets ref cookie,
 * renders bridge page with partner context. If partner not found or
 * not approved, shows a generic fallback.
 */

import { cache } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { BridgePage } from "@/components/BridgePage";

/** Shared partner query -- React.cache() deduplicates within a single request. */
const getPartnerByCode = cache(async (code: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company, city, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  if (partner) {
    const referrer = partner.company || partner.name;
    const title = `Court Prep for Your Case -- Referred by ${referrer}`;
    const description = `${partner.name} from ${partner.company || "a trusted referral partner"} trusts this service. Understand your charges and get the right questions for your attorney.`;
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }

  const defaultTitle = "Court Prep for Your Case";
  const defaultDescription = "Understand your charges. Get the right questions for your attorney.";
  return {
    title: `${defaultTitle} | ImNotAnAttorney`,
    description: `${defaultDescription} Legal information -- not legal advice.`,
    openGraph: { title: defaultTitle, description: defaultDescription, type: "website" },
    twitter: { card: "summary" as const, title: defaultTitle, description: defaultDescription },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params;

  const partner = await getPartnerByCode(code);

  if (!partner) {
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

  // Capture Referer header before after() (headers() must be called in request scope)
  const headersList = await headers();
  const rawReferer = headersList.get("referer");
  const referrerUrl = rawReferer ? rawReferer.slice(0, 500) : null;

  // Fire-and-forget link_click event -- runs after response is sent
  after(async () => {
    try {
      const supabase = createAdminClient();
      await supabase.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "link_click",
        metadata: { referrer_url: referrerUrl },
      });
    } catch (e) {
      console.warn("[PartnerEvents] link_click insert failed:", e);
    }
  });

  // Referral cookie is set by middleware (Next.js 16 -- cookies().set() not allowed in Server Components)

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      city={partner.city}
      promoCode={partner.promo_code!}
    />
  );
}
