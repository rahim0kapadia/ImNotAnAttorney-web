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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";

  if (partner) {
    const referrer = truncateName(partner.company || partner.name);
    const title = toggleOn
      ? (partner.check_in_enabled
          ? `Set up your court check-in — ${referrer}`
          : `Court date reminders + hearing prep — ${referrer}`)
      : `Know what they know — ${referrer} sent you`;
    const description = toggleOn
      ? (partner.check_in_enabled
          ? "Court check-in prompts, court date reminders, and what to expect at your hearing."
          : "Court date reminders and what to expect at your hearing.")
      : `${partner.name} at ${partner.company || "your bondsman"} sends clients here before every court date.`;
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }

  const defaultTitle = "Know what they know";
  const defaultDescription = "The legal system has a file on you. We help you build one on them.";
  return {
    title: `${defaultTitle} | ImNotAnAttorney`,
    description: `${defaultDescription} Legal information -- not legal advice.`,
    openGraph: { title: defaultTitle, description: defaultDescription, type: "website" },
    twitter: { card: "summary" as const, title: defaultTitle, description: defaultDescription },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params;

  const partner = await getPartnerByCode(code);

  if (!partner) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
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
            Decode my case
          </Link>
        </div>
      </main>
    );
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

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      city={partner.city}
      promoCode={partner.promo_code!}
      checkInEnabled={partner.check_in_enabled}
    />
  );
}
