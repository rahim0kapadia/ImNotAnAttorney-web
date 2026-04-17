import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Referred by a Partner, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .single();
    if (data) partnerName = data.company || data.name;
  } catch {
    // fallback to generic
  }
  return renderOgImage({
    title: `Check-In Tool\nfrom ${partnerName}.`,
    subtitle: "Court reminders, case prep, and daily check-ins.\nAll in one place.",
    category: "Partner Network",
  });
}
