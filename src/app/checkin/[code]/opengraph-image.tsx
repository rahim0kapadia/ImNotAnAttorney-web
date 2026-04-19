import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPromoCode } from "@/lib/promo-code";
import { truncateName } from "@/lib/truncate-name";

export const alt = "Court check-in referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  // When the check-in toggle is off, the /checkin route itself 404s — render the
  // same generic fallback as the malformed-code branch so partner branding doesn't
  // leak onto a page that doesn't exist.
  if (!toggleOn || !isValidPromoCode(code)) {
    return renderOgImage({
      title: "Set up your court check-in.",
      subtitle: "Court check-in prompts, court date reminders,\nand what to expect at your hearing.",
      category: "Court Check-In",
    });
  }
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();
    if (data) partnerName = truncateName(data.company || data.name);
  } catch (e) {
    console.warn("[OG:/checkin] partner lookup failed:", e);
  }
  return renderOgImage({
    title: `Set up your court check-in.\n— ${partnerName}`,
    subtitle: "Court check-in prompts, court date reminders,\nand what to expect at your hearing.",
    category: "Court Check-In",
  });
}
