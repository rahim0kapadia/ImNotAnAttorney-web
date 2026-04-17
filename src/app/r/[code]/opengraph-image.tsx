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
    title: `Referred by\n${partnerName}.`,
    subtitle: "Court prep for your case. Know your charges, know your rights.",
    category: "Partner Network",
  });
}
