import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPromoCode } from "@/lib/promo-code";
import { truncateName } from "@/lib/truncate-name";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";

export const alt = "Referred by a Partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  if (!isValidPromoCode(code)) {
    return renderOgImage({
      title: toggleOn ? "Set up your court check-in." : "Referred by a partner.",
      subtitle: toggleOn
        ? "Court check-in prompts, court date reminders,\nand what to expect at your hearing."
        : "Court date reminders and what to expect\nat your hearing.",
      category: toggleOn ? "Court Check-In" : "Court Prep",
    });
  }
  let partnerName = "a trusted partner";
  let checkInEnabled = false;
  let partnerLogoUrl: string | null = null;
  let partnerAccent: string | null = null;
  let partnerContrastPassed = false;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name, check_in_enabled, logo_url, brand_color_primary, brand_contrast_passed")
      .eq("promo_code", code.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();
    if (data) {
      partnerName = truncateName(data.company || data.name);
      checkInEnabled = data.check_in_enabled === true;
      partnerLogoUrl = data.logo_url ?? null;
      partnerAccent = data.brand_color_primary ?? null;
      partnerContrastPassed = data.brand_contrast_passed === true;
    }
  } catch (e) {
    console.warn("[OG:/r] partner lookup failed:", e);
  }
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
