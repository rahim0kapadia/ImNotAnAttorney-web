import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BridgePage } from "@/components/BridgePage";
import { getPartnerByCode } from "@/lib/partner-by-code";

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);
  if (partner) {
    const referrer = truncate(partner.company || partner.name);
    const title = `Court date reminders + hearing prep — ${referrer}`;
    const description = "Court date reminders and what to expect at your hearing.";
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }
  return {
    title: "Court Prep | ImNotAnAttorney",
    description: "Court date reminders and hearing prep.",
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function CourtDatePage({ params }: PageProps) {
  if (process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true") {
    notFound();
  }
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  if (!partner) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">This referral link isn&apos;t active</h1>
          <p className="text-zinc-400 mb-8">
            The link you followed may have expired or is no longer available.
          </p>
          <Link
            href="/"
            className="inline-block px-8 min-h-[44px] py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors inline-flex items-center justify-center"
          >
            Visit ImNotAnAttorney
          </Link>
        </div>
      </div>
    );
  }
  if (partner.check_in_enabled) {
    redirect(`/checkin/${code}`);
  }

  const headersList = await headers();
  const rawReferer = headersList.get("referer");
  const referrerUrl = rawReferer ? rawReferer.slice(0, 500) : null;

  after(async () => {
    try {
      const supabase = createAdminClient();
      await supabase.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "link_click",
        metadata: { referrer_url: referrerUrl, entry_path: "court-date" },
      });
    } catch (e) {
      console.warn("[PartnerEvents] court-date link_click insert failed:", e);
    }
  });

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      city={partner.city}
      promoCode={partner.promo_code!}
      checkInEnabled={false}
    />
  );
}
