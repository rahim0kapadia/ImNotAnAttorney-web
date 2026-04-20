import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { truncateName } from "@/lib/truncate-name";
import { getPartnerByCode } from "@/lib/partner-by-code";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

// Dynamic alt per partner. generateImageMetadata is Next.js 15's way to make
// opengraph-image alt text parameter-aware without replacing the auto-injected
// image URL in page generateMetadata (which breaks og:image entirely).
// getPartnerByCode is React.cache'd — this lookup dedupes with the default
// export's call within the same request.
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const partner = await getPartnerByCode(code);
  const referrer = partner ? truncateName(partner.company || partner.name) : null;
  return [
    {
      id: "main",
      contentType: OG_CONTENT_TYPE,
      size: OG_SIZE,
      alt: referrer
        ? `Pre-court research briefing via ${referrer} — ImNotAnAttorney`
        : "Referred by a Partner — ImNotAnAttorney",
    },
  ];
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";

  // Cached helper — shares one Supabase query with generateImageMetadata above.
  // Helper validates the promo code and the approved-status gate internally.
  const partner = await getPartnerByCode(code);

  if (!partner) {
    return renderOgImage({
      title: toggleOn ? "Set up your court check-in." : "Referred by a partner.",
      subtitle: toggleOn
        ? "Court check-in prompts, court date reminders,\nand what to expect at your hearing."
        : "Court date reminders and what to expect\nat your hearing.",
      category: toggleOn ? "Court Check-In" : "Court Prep",
    });
  }

  const partnerName = truncateName(partner.company || partner.name);
  const checkInEnabled = partner.check_in_enabled === true;
  const partnerLogoUrl = partner.logo_url ?? null;
  const partnerAccent = partner.brand_color_primary ?? null;
  const partnerContrastPassed = partner.brand_contrast_passed === true;
  const useCheckIn = toggleOn && checkInEnabled;
  const brandingOn = partnerBrandingEnabled() && partnerContrastPassed && (!!partnerLogoUrl || !!partnerAccent);

  return renderOgImage({
    title: useCheckIn
      ? `Set up your court check-in.\n— ${partnerName}`
      : `Court date reminders +\nhearing prep — ${partnerName}`,
    subtitle: useCheckIn
      ? "Court check-in prompts, court date reminders,\nand what to expect at your hearing."
      : "Court date reminders and what to expect\nat your hearing.",
    category: useCheckIn ? "Court Check-In" : "Court Prep",
    partnerBranding: brandingOn
      ? {
          logoUrl: partnerLogoUrl,
          accentHex: partnerAccent ?? "#f59e0b",
          partnerName,
        }
      : undefined,
  });
}
