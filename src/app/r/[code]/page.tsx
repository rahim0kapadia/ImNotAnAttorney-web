/**
 * /r/[code] -- Referral URL -> bridge page.
 *
 * Server component: looks up partner by promo code, sets ref cookie,
 * renders bridge page with partner context. If partner not found or
 * not approved, shows a generic fallback.
 */

import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { BridgePage } from "@/components/BridgePage";
import { getPartnerByCode } from "@/lib/partner-by-code";
import { truncateName } from "@/lib/truncate-name";
import { isCheckInMode } from "@/lib/partner-mode";
import { PartnerBrandedShell } from "@/components/shells/PartnerBrandedShell";
import { InaaBrandedShell } from "@/components/shells/InaaBrandedShell";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  if (partner) {
    const referrer = truncateName(partner.company || partner.name);
    // Dunford (2026-04-20): single category frame — pre-court research briefing.
    // Collapsed from 3 toggle-dependent titles to one so the category is
    // unambiguous at the door. (UPL scan 2026-04-20: avoid "case-prep" framing
    // which could be read as attorney work product.)
    const title = `What happens next in your case — from ${referrer}`;
    const description = `Pre-court research briefing from ${referrer}. The 15 questions to hand your attorney before your first hearing.`;
    // OG image URL + alt are auto-injected by opengraph-image.tsx via
    // generateImageMetadata. Do NOT set openGraph.images here — overriding
    // with a partial entry (alt-only) strips the auto-injected URL.
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" as const },
      twitter: { card: "summary_large_image" as const, title, description },
    };
  }

  const defaultTitle = "What happens next in your case";
  const defaultDescription = "Pre-court research briefing for defendants. The 15 questions to hand your attorney before your first hearing.";
  return {
    title: `${defaultTitle} | ImNotAnAttorney`,
    description: `${defaultDescription} Legal information -- not legal advice.`,
    openGraph: { title: defaultTitle, description: defaultDescription, type: "website" as const },
    twitter: { card: "summary_large_image" as const, title: defaultTitle, description: defaultDescription },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params;

  const partner = await getPartnerByCode(code);

  if (!partner) {
    const fallback = (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">
            This link expired. Your case didn&apos;t.
          </h1>
          <p className="text-zinc-400 mb-8">
            Links get truncated in texts, or the code at the end times out.
            Ask your bondsman to resend, or start here to decode your case now.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[44px] px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors"
          >
            Start the decoder
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </div>
      </div>
    );
    return partnerBrandingEnabled() ? <InaaBrandedShell>{fallback}</InaaBrandedShell> : fallback;
  }

  // NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true" ternary is the toggle gate;
  // computePartnerUrl itself is env-free. Do NOT remove this guard without
  // updating the corresponding callers simultaneously.
  if (
    process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true" &&
    isCheckInMode(partner)
  ) {
    redirect(`/checkin/${code}`);
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

  const bridge = (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      city={partner.city}
      promoCode={partner.promo_code!}
      checkInEnabled={partner.check_in_enabled}
    />
  );
  return partnerBrandingEnabled()
    ? <PartnerBrandedShell partner={partner}>{bridge}</PartnerBrandedShell>
    : bridge;
}
