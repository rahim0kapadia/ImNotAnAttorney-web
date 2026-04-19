import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Court check-in referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z0-9]{2,20}$/i.test(code)) {
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
      .maybeSingle();
    if (data) partnerName = truncate(data.company || data.name);
  } catch {}
  return renderOgImage({
    title: `Set up your court check-in.\n— ${partnerName}`,
    subtitle: "Court check-in prompts, court date reminders,\nand what to expect at your hearing.",
    category: "Court Check-In",
  });
}
